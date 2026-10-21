import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { createCampaign } from '../server/campaign';
import { generate } from '../server/agent';
import { KnowledgeStore } from '../server/knowledge';
import { RunStore } from '../server/store';
import { brief, knowledgeFixture } from './fixtures';
import { AppError } from '../server/errors';
import type { Brief } from '../shared/types';

async function fixture(t:import('node:test').TestContext){
  const files=knowledgeFixture();t.after(files.cleanup);const knowledge=new KnowledgeStore(files.root),store=new RunStore(':memory:');t.after(()=>store.close());
  const deps={knowledge,store,ima:{retrieve:async()=>{throw new Error('本地测试禁止ima');}}};
  const source=await generate({...brief,productId:knowledge.products[0].id,generation:'rules'},deps);return {...deps,source};
}
test('内容包分别生成平台子版本，原稿保持不变，生成齐全不等于发布通过',async t=>{
  const deps=await fixture(t),before=deps.store.get(deps.source.id)!;
  const result=await createCampaign({sourceRunId:deps.source.id,platforms:['wechat','moments','poster'],audience:'商务人士',scene:'office'},deps);
  assert.equal(result.status,'complete');assert.equal(result.releaseReady,false);assert.equal(result.items.length,3);
  assert.deepEqual(deps.store.get(before.id),before);
  for(const item of result.items){assert.equal(item.status,'generated');const run=deps.store.get(item.runId!)!;assert.equal(run.parentId,before.id);assert.equal(run.brief.platform,item.platform);assert.equal(run.brief.audience,'商务人士');assert.equal(run.brief.scene,'office');assert.equal(run.engine,'local-composer');}
  assert.equal(deps.store.getCampaign(result.id)?.status,'complete');assert.equal(deps.store.listCampaigns().length,1);
});
test('单平台失败保留其他成品和原稿，失败项不是成功作品',async t=>{
  const deps=await fixture(t);
  const result=await createCampaign({sourceRunId:deps.source.id,platforms:['wechat','poster']},{...deps,generateRun:async(input,options)=>{if((input as Brief).platform==='wechat')throw new AppError('QA_FAILURE','QA合成失败');return generate(input,options);}});
  assert.equal(result.status,'partial');assert.equal(result.items[0].status,'failed');assert.equal(result.items[0].runId,undefined);assert.equal(result.items[1].status,'generated');assert.equal(result.releaseReady,false);
});
test('取消保留已完成平台，停止后续调用并记录未完成项',async t=>{
  const deps=await fixture(t),abort=new AbortController();let calls=0;
  const result=await createCampaign({sourceRunId:deps.source.id,platforms:['wechat','moments','poster']},{...deps,signal:abort.signal,generateRun:async(input,options)=>{calls++;const run=await generate(input,options);abort.abort();return run;}});
  assert.equal(calls,1);assert.equal(result.status,'cancelled');assert.deepEqual(result.items.map(i=>i.status),['generated','cancelled','cancelled']);assert.equal(deps.store.getCampaign(result.id)?.status,'cancelled');
});
test('规则内容包不伪装支持自由改写，非法/重复平台拒绝',async t=>{
  const deps=await fixture(t);
  await assert.rejects(createCampaign({sourceRunId:deps.source.id,platforms:['wechat','wechat']},deps),{code:'CAMPAIGN_INPUT'});
  const result=await createCampaign({sourceRunId:deps.source.id,platforms:['wechat'],instructions:'写得更幽默'},deps);
  assert.equal(result.status,'failed');assert.equal(result.items[0].error?.code,'RULES_INSTRUCTIONS');assert.equal(deps.store.list().length,1);
});
test('合成模型内容包每平台重新策划并使用其方向，改受众信息不丢失',async t=>{
  const deps=await fixture(t);deps.source.engine='llm';deps.source.brief.generation='model';deps.store.save(deps.source);
  let plans=0,generations=0;
  const result=await createCampaign({sourceRunId:deps.source.id,platforms:['wechat','poster'],audience:'商务人士',scene:'office',instructions:'围绕会议任务，不用未确认续航'}, {...deps,
    plan:async(input)=>{plans++;const b=(input as {brief:Brief}).brief;assert.equal(b.audience,'商务人士');assert.equal(b.scene,'office');assert.ok(b.requirements.includes('会议任务'));return {id:`qa-plan-${plans}`,engine:'model',engineLabel:'QA合成模型计划',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+1000).toISOString(),brief:b,product:{id:b.productId,name:'QA'},factIds:[],concepts:[],recommendedConceptId:`qa-concept-${plans}`,reason:'QA',warnings:[]};},
    generateRun:async(input)=>{generations++;const b=input as Brief;assert.equal(b.directorPlanId,`qa-plan-${generations}`);assert.equal(b.conceptId,`qa-concept-${generations}`);assert.equal(b.generation,'model');return deps.store.save({...structuredClone(deps.source),id:randomUUID(),parentId:deps.source.id,version:2,brief:b});}
  });
  assert.equal(plans,2);assert.equal(generations,2);assert.equal(result.status,'complete');
});
test('服务重启将遗留运行项记为中止，保留已经产出的版本引用',t=>{
  const files=knowledgeFixture();const filename=path.join(files.root,'campaign.sqlite');
  const store=new RunStore(filename),id=randomUUID(),sourceRunId=randomUUID();
  store.saveCampaign({id,sourceRunId,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),request:{sourceRunId,platforms:['wechat','poster']},engine:'llm',status:'running',releaseReady:false,items:[{platform:'wechat',status:'generated',runId:'qa-finished'},{platform:'poster',status:'running'}]});store.close();
  const reopened=new RunStore(filename);t.after(()=>{reopened.close();files.cleanup();});const recovered=reopened.getCampaign(id)!;
  assert.equal(recovered.status,'cancelled');assert.equal(recovered.items[0].runId,'qa-finished');assert.equal(recovered.items[1].status,'cancelled');assert.equal(recovered.items[1].error?.code,'PROCESS_RESTARTED');
});
