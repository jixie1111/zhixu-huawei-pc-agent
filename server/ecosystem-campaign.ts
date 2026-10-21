import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { EcosystemBrief, EcosystemRun } from '../shared/ecosystem';
import type { EcosystemCampaign, EcosystemCampaignRequest } from '../shared/ecosystem-campaign';
import type { Platform } from '../shared/types';
import { assertCurrentEcosystem, generateEcosystem, presentEcosystem, type EcosystemAgentDeps } from './ecosystem-agent';
import { publicDeployment, safeError } from './config';
import { AppError } from './errors';

const platform=z.enum(['xiaohongshu','wechat','moments','poster']);
const audience=z.string().trim().min(2).max(200).optional();
const goal=z.string().trim().min(1).max(160).optional();
const instructions=z.string().trim().max(1200);
const createSchema=z.object({sourceRunId:z.string().uuid(),platforms:z.array(platform).min(1).max(4),audience,goal,instructions:instructions.optional()}).strict().refine(r=>new Set(r.platforms).size===r.platforms.length,{message:'平台不能重复'});
const reviseSchema=z.object({audience,goal,instructions:instructions.min(1),editedRunIds:z.partialRecord(platform,z.string().uuid()).optional()}).strict();
type Deps=EcosystemAgentDeps&{generateRun?:typeof generateEcosystem;onCampaign?:(campaign:EcosystemCampaign)=>void};
function localOnly(){if(publicDeployment)throw new AppError('ECOSYSTEM_LOCAL_ONLY','生态内容包目前仅在本地开放。',403);}
function sourceRun(id:string,deps:Deps){const source=deps.store.getEcosystem(id);if(!source)throw new AppError('ECOSYSTEM_NOT_FOUND','生态原稿不存在。',404);assertCurrentEcosystem(source,deps);return source;}
function combined(source:EcosystemRun,instruction?:string){const value=[source.brief.requirements,instruction].filter(Boolean).join('\n');if(value.length>3000)throw new AppError('CAMPAIGN_INPUT','原稿要求与本次修改合计超过3000字，请精简要求后重试。',422);return value;}
function sameSelection(a:EcosystemRun,b:EcosystemRun){
  const normalize=(r:EcosystemRun)=>JSON.stringify({devices:[...r.brief.selection.devices].sort((x,y)=>x.productId.localeCompare(y.productId)),relationIds:[...r.brief.selection.relationIds].sort(),conditions:Object.entries(r.brief.selection.conditions).sort(([a],[b])=>a.localeCompare(b))});
  return normalize(a)===normalize(b);
}
function descendant(run:EcosystemRun,ancestorId:string,deps:Deps){
  const seen=new Set<string>();let current:EcosystemRun|undefined=run;
  while(current&&!seen.has(current.id)&&seen.size<100){if(current.id===ancestorId)return true;seen.add(current.id);current=current.parentId?deps.store.getEcosystem(current.parentId):undefined;}
  return false;
}
async function execute(request:EcosystemCampaignRequest,sources:Map<Platform,EcosystemRun>,deps:Deps,parentCampaignId?:string){
  deps.signal?.throwIfAborted();
  // Validate all baselines before creating a job or incurring any model call.
  for(const source of sources.values()){assertCurrentEcosystem(source,deps);combined(source,request.instructions);}
  const now=new Date().toISOString();
  const campaign:EcosystemCampaign={id:randomUUID(),sourceRunId:request.sourceRunId,...(parentCampaignId?{parentCampaignId}:{}),createdAt:now,updatedAt:now,request,engine:'llm',status:'running',releaseReady:false,items:request.platforms.map(platform=>({platform,sourceRunId:sources.get(platform)!.id,status:'pending'}))};
  const save=()=>{campaign.updatedAt=new Date().toISOString();deps.store.saveEcosystemCampaign(campaign);deps.onCampaign?.(structuredClone(campaign));};
  save();
  for(const item of campaign.items){
    if(deps.signal?.aborted)break;
    item.status='running';save();
    const source=sources.get(item.platform)!;
    const brief:EcosystemBrief={...structuredClone(source.brief),platform:item.platform,audience:request.audience??source.brief.audience,goal:request.goal??source.brief.goal,requirements:combined(source,request.instructions),generation:'model',autoRepair:true,parentId:source.id};
    try{
      assertCurrentEcosystem(source,deps);
      const run=await (deps.generateRun??generateEcosystem)(brief,deps);
      // Do not trust a transport returning the wrong product/parent/platform.
      if(run.parentId!==source.id||run.brief.platform!==item.platform||!sameSelection(run,source))throw new AppError('CAMPAIGN_LINEAGE','生成结果与本次设备、平台或原稿绑定不一致。',422);
      item.status='generated';item.runId=run.id;
      const presented=presentEcosystem(run,deps);item.auditStatus=presented.audit.status;item.releaseReady=presented.audit.releaseReady;
    }catch(error){
      if(deps.signal?.aborted){item.status='cancelled';break;}
      item.status='failed';item.releaseReady=false;item.error={code:error instanceof AppError?error.code:'ECOSYSTEM_CAMPAIGN_GENERATION',message:safeError(error)};
    }
    save();
  }
  if(deps.signal?.aborted){for(const item of campaign.items)if(item.status==='pending'||item.status==='running')item.status='cancelled';campaign.status='cancelled';}
  else {const generated=campaign.items.filter(i=>i.status==='generated').length;campaign.status=generated===campaign.items.length?'complete':generated?'partial':'failed';}
  // Earlier finished items may have expired while another platform was writing.
  const presented=presentEcosystemCampaign(campaign,deps);campaign.items=presented.items;campaign.releaseReady=presented.releaseReady;save();
  return structuredClone(campaign);
}
export function presentEcosystemCampaign(campaign:EcosystemCampaign,deps:Pick<Deps,'knowledge'|'ecosystem'|'store'>){
  localOnly();const result=structuredClone(campaign);
  for(const item of result.items){
    if(item.status!=='generated')continue;
    const run=item.runId?deps.store.getEcosystem(item.runId):undefined;
    if(!run||run.parentId!==item.sourceRunId||run.brief.platform!==item.platform){item.releaseReady=false;item.auditStatus='blocked';item.error={code:'CAMPAIGN_RESULT_MISSING',message:'对应版本不存在或来源绑定不完整。'};continue;}
    const current=presentEcosystem(run,deps);item.auditStatus=current.audit.status;item.releaseReady=current.audit.releaseReady;
  }
  result.releaseReady=result.status==='complete'&&result.items.every(i=>i.status==='generated'&&i.releaseReady===true);return result;
}
export async function createEcosystemCampaign(input:unknown,deps:Deps){
  localOnly();const parsed=createSchema.safeParse(input);if(!parsed.success)throw new AppError('CAMPAIGN_INPUT','请选择原稿和一至四个不同平台，检查受众与要求。',422);
  const request=parsed.data,source=sourceRun(request.sourceRunId,deps);
  return execute(request,new Map(request.platforms.map(platform=>[platform,source])),deps);
}
export async function reviseEcosystemCampaign(id:string,input:unknown,deps:Deps){
  localOnly();const parsed=reviseSchema.safeParse(input);if(!parsed.success)throw new AppError('CAMPAIGN_INPUT','请填写共同修改要求，并检查平台原稿版本。',422);
  const previous=deps.store.getEcosystemCampaign(id);if(!previous)throw new AppError('CAMPAIGN_NOT_FOUND','生态内容包不存在。',404);
  if(previous.status==='running')throw new AppError('CAMPAIGN_RUNNING','当前内容包仍在生成，请完成或取消后再修改。',409);
  const change=parsed.data;
  if(Object.keys(change.editedRunIds??{}).some(p=>!previous.items.some(i=>i.platform===p)))throw new AppError('CAMPAIGN_INPUT','编辑版本只能属于本内容包已有平台。',422);
  const root=sourceRun(previous.sourceRunId,deps),sources=new Map<Platform,EcosystemRun>();
  for(const item of previous.items){
    const baselineId=item.status==='generated'&&item.runId?item.runId:item.sourceRunId;
    const baseline=sourceRun(baselineId,deps),override=change.editedRunIds?.[item.platform];
    const selected=override?sourceRun(override,deps):baseline;
    if(!sameSelection(selected,root)||override&&(!descendant(selected,baseline.id,deps)||selected.brief.platform!==item.platform))throw new AppError('CAMPAIGN_LINEAGE','编辑版本必须来自对应平台作品，并保持原设备、系统和协同条件。',422);
    sources.set(item.platform,selected);
  }
  return execute({sourceRunId:previous.sourceRunId,platforms:previous.items.map(i=>i.platform),audience:change.audience,goal:change.goal,instructions:change.instructions},sources,deps,previous.id);
}
