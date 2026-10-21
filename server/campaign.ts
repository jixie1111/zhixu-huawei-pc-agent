import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Campaign } from '../shared/campaign';
import type { Brief } from '../shared/types';
import { PLATFORMS } from '../shared/rules';
import { generate, type GenerateDeps } from './agent';
import { planCreative } from './director';
import { AppError } from './errors';
import { safeError } from './config';

const schema = z.object({
  sourceRunId:z.string().uuid(), platforms:z.array(z.enum(['xiaohongshu','wechat','moments','poster'])).min(1).max(4),
  audience:z.string().trim().min(2).max(200).optional(),
  scene:z.enum(['school','office','creator','family','business','store','launch','festival']).optional(),
  instructions:z.string().trim().max(1200).optional(),
}).strict().refine(value=>new Set(value.platforms).size===value.platforms.length,{message:'平台应各选一次'});
type CampaignDeps = GenerateDeps & {
  generateRun?: typeof generate; plan?: typeof planCreative;
  onCampaign?: (campaign:Campaign)=>void;
};

/** A persisted, bounded job; each platform has its own plan, audit and version.
 * Cancelled/failed output never substitutes for a completed platform. */
export async function createCampaign(input:unknown,deps:CampaignDeps):Promise<Campaign> {
  const parsed=schema.safeParse(input);
  if(!parsed.success)throw new AppError('CAMPAIGN_INPUT','请选择原稿和一至四个不同平台，检查受众及补充要求。',422);
  const request=parsed.data,source=deps.store.get(request.sourceRunId);
  if(!source)throw new AppError('RUN_NOT_FOUND','原稿不存在。',404);
  if(source.brief.mode!=='local')throw new AppError('CAMPAIGN_SOURCE','当前内容包使用本地产品资料，请选择本地原稿。',422);
  const requirements=[source.brief.requirements,request.instructions].filter(Boolean).join('\n');
  if(requirements.length>3000)throw new AppError('CAMPAIGN_INPUT','原稿要求与新增要求合计超过3000字，请精简后重试。',422);
  deps.signal?.throwIfAborted();
  const now=new Date().toISOString();
  const campaign:Campaign={id:randomUUID(),sourceRunId:source.id,createdAt:now,updatedAt:now,request,engine:source.engine,status:'running',releaseReady:false,items:request.platforms.map(platform=>({platform,status:'pending'}))};
  const save=()=>{campaign.updatedAt=new Date().toISOString();deps.store.saveCampaign(campaign);deps.onCampaign?.(structuredClone(campaign));};
  save();
  for(const item of campaign.items) {
    if(deps.signal?.aborted)break;
    item.status='running';save();
    const next:Brief={...source.brief,platform:item.platform,audience:request.audience??source.brief.audience,scene:request.scene??source.brief.scene,generation:source.engine==='llm'?'model':'rules',parentId:source.id,directorPlanId:undefined,conceptId:undefined,autoRepair:source.engine==='llm',requirements};
    // The rule path supports explicit structural rearrangement only; it never
    // pretends to implement a free-text revision or silently changes engines.
    next.revision=source.engine==='llm'?`根据当前受众与场景重新策划${PLATFORMS[item.platform].name}内容。${request.instructions??''}`:item.platform===source.brief.platform?undefined:`保持产品与场景，将内容改写为${PLATFORMS[item.platform].name}版本。`;
    try {
      if(source.engine==='local-composer'&&request.instructions?.trim())throw new AppError('RULES_INSTRUCTIONS','自由表达调整需要模型创作；当前规则稿可按受众、场景和平台重新编排。',422);
      if(source.engine==='llm') {
        const plan=await (deps.plan??planCreative)({message:request.instructions||`为${next.audience}生成${PLATFORMS[item.platform].name}内容`,engine:'model',brief:next},deps.knowledge,deps.signal);
        next.directorPlanId=plan.id;next.conceptId=plan.recommendedConceptId;
      }
      const run=await (deps.generateRun??generate)(next,deps);
      item.status='generated';item.runId=run.id;item.auditStatus=run.audit.status;item.releaseReady=run.audit.releaseReady;
    }catch(error) {
      if(deps.signal?.aborted){item.status='cancelled';break;}
      item.status='failed';item.error={code:error instanceof AppError?error.code:'CAMPAIGN_GENERATION',message:safeError(error)};
    }
    save();
  }
  if(deps.signal?.aborted) {
    for(const item of campaign.items)if(item.status==='pending'||item.status==='running')item.status='cancelled';
    campaign.status='cancelled';
  } else {
    const successes=campaign.items.filter(item=>item.status==='generated').length;
    campaign.status=successes===campaign.items.length?'complete':successes?'partial':'failed';
  }
  campaign.releaseReady=campaign.status==='complete'&&campaign.items.every(item=>item.releaseReady===true);
  save();
  return structuredClone(campaign);
}
