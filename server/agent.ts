import { randomUUID } from 'node:crypto';
import { buildStrategy, composeLocal, shortRevision } from '../shared/local-composer';
import { z } from 'zod';
import type { Article, Brief, Evidence, Fact, Run, Strategy } from '../shared/types';
import { PLATFORMS, SCENES } from '../shared/rules';
import { AppError } from './errors';
import { auditArticle, scanCompliance } from './audit';
import { composeModel, repairModel, repairTargets, verifySemantic } from './llm';
import { resolveDirectorPlan, validateDirectorEvidence } from './director';
import { secrets, restrictedPublic, validateLlmUrl } from './config';
import { publicCatalog } from './catalog';
import { hasPublicOnlineLineage } from './public-history';
import type { KnowledgeStore } from './knowledge';
import type { RunStore } from './store';
import { verifyImageAvailability, type ImageReader } from './image-verification';
import { createEvidenceImageReader } from './evidence-images';

const briefSchema=z.object({productId:z.string().trim().min(1),audience:z.string().trim().min(2).max(200),scene:z.enum(['school','office','creator','family','business','store','launch','festival']),platform:z.enum(['xiaohongshu','wechat','moments','poster']),stage:z.string().trim().min(1).max(80).default('比较选型'),goal:z.string().trim().min(1).max(160).default('引导到店体验'),requirements:z.string().max(3000).default(''),mode:z.enum(['local','ima']).default('local'),generation:z.enum(['model','rules']).optional(),parentId:z.string().uuid().optional(),revision:z.string().max(1500).optional(),autoRepair:z.boolean().optional(),directorPlanId:z.string().uuid().optional(),conceptId:z.string().min(1).max(100).optional(),voice:z.object({persona:z.enum(['advisor','friend','editor','story','minimal']),store:z.string().trim().max(40).optional()}).strict().optional()}).strict().refine(data=>!!data.directorPlanId===!!data.conceptId,{message:'创意方案与方向必须同时指定',path:['directorPlanId']});
export function validateBrief(input:unknown):Brief {
  const result=briefSchema.safeParse(input);
  if(!result.success) {
    const names:Record<string,string>={productId:'具体产品型号',audience:'目标人群',scene:'使用场景',platform:'发布平台',stage:'购买阶段',goal:'内容目标'};
    const missing=result.error.issues.map(i=>names[String(i.path[0])]||String(i.path[0]));
    throw new AppError('BRIEF_INCOMPLETE',`请补充或修正：${[...new Set(missing)].join('、')}。例如“想买轻薄本”还需要确认型号、用途、人群和发布平台。`,422,{questions:[...new Set(missing)].map(n=>`请明确${n}。`)});
  }
  return result.data;
}
export { buildStrategy, composeLocal } from '../shared/local-composer';
export interface GenerateDeps { knowledge:KnowledgeStore; store:RunStore; ima:ImageReader&{retrieve(product:Evidence['product'],brief?:Brief,signal?:AbortSignal):Promise<Evidence>}; onStage?:(data:{step:number;name:string;detail:string})=>void; signal?:AbortSignal }
export async function generate(input:unknown,deps:GenerateDeps):Promise<Run> {
  const started=Date.now(),brief=validateBrief(input);
  const engine=brief.mode==='ima'||brief.generation==='model'?'llm':'local-composer';
  if(restrictedPublic&&brief.mode!=='ima')throw new AppError('PRIVATE_SNAPSHOT','公开部署禁止未授权快照生成。',403);
  const stage=(step:number,name:string,detail:string)=>{deps.signal?.throwIfAborted();deps.onStage?.({step,name,detail});};
  stage(0,'理解创作需求',`${SCENES[brief.scene].name} · ${PLATFORMS[brief.platform].name}`);
  const product=(restrictedPublic?publicCatalog:deps.knowledge.products).find(p=>p.id===brief.productId);if(!product)throw new AppError('PRODUCT_UNKNOWN','无法确认具体产品型号，请从产品清单中选择。',422);
  const parent=brief.parentId?deps.store.get(brief.parentId):undefined;
  if(brief.parentId&&!parent)throw new AppError('PARENT_MISSING','原稿不存在，无法建立修改版本。',404);
  if(restrictedPublic&&parent&&!hasPublicOnlineLineage(parent,id=>deps.store.get(id)))throw new AppError('PRIVATE_RUN','公开部署不能读取未授权的历史稿。',403);
  if(parent&&parent.brief.productId!==brief.productId)throw new AppError('REVISION_PRODUCT','修改版本不能更换产品型号。请选择新型号并作为新作品创作。',422);
  if(engine==='local-composer'&&brief.revision?.trim()) {
    const platformConversion=parent&&parent.brief.platform!==brief.platform&&brief.revision.trim()===`保持产品与场景，将内容改写为${PLATFORMS[brief.platform].name}版本。`;
    if(!shortRevision(brief.revision)&&!platformConversion)throw new AppError('LOCAL_REVISION_UNSUPPORTED','规则预览仅支持“精简正文”和平台规则重排。自定义语气、结构及内容改写请配置模型并选择“AI模型创作”，或直接编辑正文。',422);
  }
  if(engine==='llm') {
    const configuration=secrets();
    if(!configuration.llmKey||!configuration.llmModel)throw new AppError('LLM_MISSING','请先配置模型服务、模型名称和 API Key，再开始 AI 模型创作。本地知识库不需要 ima 凭据或读取额度。',422);
    validateLlmUrl(configuration.llmBaseUrl);
  }
  const director=brief.directorPlanId&&brief.conceptId?resolveDirectorPlan(brief.directorPlanId,brief.conceptId,brief):undefined;
  const strategy=director?.strategy??buildStrategy(brief,product.category);stage(1,'制定场景与平台策略',strategy.angle);
  stage(2,brief.mode==='ima'?'检索 ima 资料与图片':'检索本地知识库与原图',`精确型号：${product.name}`);
  const evidence=brief.mode==='ima'?await deps.ima.retrieve(product,brief,deps.signal):deps.knowledge.get(product.id);
  deps.signal?.throwIfAborted();
  if(brief.directorPlanId)validateDirectorEvidence(brief.directorPlanId,evidence);
  if(evidence.product.conflicts.length)throw new AppError('SOURCE_CONFLICT','资料中存在冲突，生成已停止，请人工确认。',422,{conflicts:evidence.product.conflicts});
  if(!evidence.facts.length)throw new AppError('NO_FACTS','没有可验证的产品事实，不能生成营销断言。',422);
  if(evidence.images.length<strategy.imageMin)throw new AppError('INSUFFICIENT_IMAGES',`当前型号只有 ${evidence.images.length} 张来源明确的图片，${PLATFORMS[brief.platform].name}至少需要 ${strategy.imageMin} 张。`,422);
  stage(3,'组织事实与配图方案',`${evidence.facts.length} 个事实维度 · ${evidence.images.length} 张同型号图片`);
  stage(4,engine==='llm'?'生成场景化图文':'本地规则编排（非模型生成）','保留版本条件，绑定段落事实依据');
  let article=engine==='llm'?await composeModel(brief,evidence,strategy,deps.signal,parent):composeLocal(brief,evidence,strategy);
  stage(5,'事实、图片与合规核验','检查引用、数值、型号、平台要求及营销风险');
  const rejected=scanCompliance(brief.requirements+'\n'+(brief.revision||''));
  const check=async(candidate:Article)=>{
    deps.signal?.throwIfAborted();
    let checked=auditArticle(candidate,evidence,brief,engine);
    for(const risk of rejected)checked.findings.push({...risk,id:`input-${risk.id}`,severity:'info',message:`已识别附加要求中的风险：${risk.message}；该要求不构成虚构授权。`,suggestion:'仍以正文逐项核验结果决定是否可发布。'});
    if(engine==='llm') {
      const verified=await verifyImageAvailability(candidate,checked,createEvidenceImageReader(deps.knowledge,deps.ima,brief.mode),deps.signal);
      evidence.trace.push({action:'原始配图可用性',detail:`已验证 ${verified}/${candidate.images.length} 张所选原始图片的读取与位图签名；不将索引描述冒充像素级语义识别。`,at:new Date().toISOString()});
      try{checked=await verifySemantic(candidate,evidence,checked,deps.signal,brief.mode);}catch{deps.signal?.throwIfAborted();checked.findings.push({id:'semantic-failed',category:'fact',severity:'block',message:'独立语义核验未完成，不能发布。',suggestion:'检查模型服务后重新生成或人工核验。'});checked.status='blocked';checked.releaseReady=false;}
    }
    return checked;
  };
  let audit=await check(article);
  const repairHistory:NonNullable<Run['repairHistory']>=[];
  if(engine==='llm'&&brief.autoRepair) {
    for(let attempt=1;attempt<=2;attempt++) {
      if(audit.status==='passed'||audit.findings.some(f=>f.id==='semantic-failed'||(f.severity==='block'&&(f.category==='image'||f.category==='source')))||!repairTargets(article,audit).length)break;
      stage(5,'局部修订与重新核验',`第 ${attempt}/2 次；只修改核验已定位字段，保留事实引用与原图`);
      const before=structuredClone(article);
      try {
        const repaired=await repairModel(article,evidence,audit,deps.signal);
        article=repaired.article;audit=await check(article);
        repairHistory.push({attempt,before,after:structuredClone(article),audit:structuredClone(audit),changedFields:repaired.changedFields,status:'repaired'});
      }catch {
        deps.signal?.throwIfAborted();
        article=before;
        audit.findings.push({id:'repair-failed',category:'fact',severity:'block',message:'局部修订未完成或超出授权范围，已保留原稿。',suggestion:'请人工检查诊断稿；不会通过无限重试将风险洗白。'});
        audit.status='blocked';audit.releaseReady=false;
        repairHistory.push({attempt,before,after:structuredClone(before),audit:structuredClone(audit),changedFields:[],status:'failed',error:'局部修订失败；原稿保留，未继续重试。'});
        break;
      }
    }
  }
  stage(6,'保存版本与证据链',audit.status==='blocked'?'发现待处理风险，已保留诊断稿':'已保存可追溯草稿');
  const now=new Date().toISOString();
  const run:Run={id:randomUUID(),createdAt:now,updatedAt:now,version:parent?parent.version+1:1,parentId:parent?.id,brief,strategy,evidence,article,audit,engine,model:engine==='llm'?secrets().llmModel:undefined,durationMs:Date.now()-started,trace:[...evidence.trace,{action:'生成引擎',detail:engine==='llm'?`模型：${secrets().llmModel}`:'本地确定性编排器；不是在线大模型',at:now},{action:'核验',detail:`${audit.findings.filter(f=>f.severity==='block').length} 项拦截，${audit.findings.filter(f=>f.severity==='warning').length} 项待复核`,at:now}]};
  if(director)run.director=director.decision;
  if(repairHistory.length)run.repairHistory=repairHistory;
  deps.signal?.throwIfAborted();return deps.store.save(run);
}
