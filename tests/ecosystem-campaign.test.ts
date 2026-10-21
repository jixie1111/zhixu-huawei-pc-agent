import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { EcosystemStore } from '../server/ecosystem';
import { RunStore } from '../server/store';
import { generateEcosystem, editEcosystem, type EcosystemAgentDeps } from '../server/ecosystem-agent';
import { createEcosystemCampaign, reviseEcosystemCampaign, presentEcosystemCampaign } from '../server/ecosystem-campaign';
import { createApp } from '../server/app';
import { configure, clearSession } from '../server/config';
import { AppError } from '../server/errors';
import type { KnowledgeStore } from '../server/knowledge';
import type { EcosystemBrief, EcosystemContent, EcosystemRelation } from '../shared/ecosystem';
import { evidence, syntheticPng } from './fixtures';

// Synthetic devices/model transport; tests never establish real marketing quality.
async function setup(t:TestContext){
  let now=Date.parse('2026-10-19T00:00:00Z');
  const records=['qa-one','qa-two'].map(id=>{const e=evidence();e.product={...e.product,id,name:id};e.facts=e.facts.map(f=>({...f,id:id+f.id,productId:id}));e.images=e.images.slice(0,1).map(i=>({...i,id:id+i.id,productId:id,productName:id}));return e;});
  const knowledge={products:records.map(d=>d.product),get:(id:string)=>structuredClone(records.find(d=>d.product.id===id)!),assets:new Map()} as unknown as KnowledgeStore;
  const relation:EcosystemRelation={id:'qa-link',capability:'测试共享',statement:'测试条件下的合成共享',participants:records.map(d=>({productId:d.product.id,role:'测试角色',systems:['QA 1']})),conditions:[{key:'account',label:'账号',value:'测试一致'}],sourceTitle:'合成测试来源',sourceUrl:'https://consumer.huawei.com/cn/support/content/qa-fixture/',excerpt:'合成测试',reviewedAt:'2026-10-18T00:00:00Z',expiresAt:'2026-10-21T00:00:00Z'};
  const ecosystem=new EcosystemStore([relation],()=>now),store=new RunStore(':memory:');t.after(()=>store.close());
  const brief:EcosystemBrief={selection:{devices:records.map(d=>({productId:d.product.id,system:'QA 1'})),relationIds:[relation.id],conditions:{account:'测试一致'}},audience:'测试学生',platform:'wechat',goal:'到店了解',requirements:'原始创意约束',generation:'model',autoRepair:false};
  const inputs:{stage:string;data:any}[]=[],options={failPlatform:'',blockedPlatform:''};
  const block=(text:string)=>({text,facts:[],relationIds:[]});
  const chat:EcosystemAgentDeps['chat']=async(system,data)=>{
    const input=data as any;
    if(system.includes('创意导演')){inputs.push({stage:'plan',data:structuredClone(data)});if(input.brief.platform===options.failPlatform)throw new AppError('QA_FAILURE','测试平台失败',502);return {angle:'同一核心场景',rationale:'测试策略',deviceRoles:records.map(d=>({productId:d.product.id,role:'设备角色',factIds:[d.facts[0].id]})),relationIds:[relation.id],structure:[input.brief.platform,'体验建议'],visualDirection:'真实原图'};}
    if(system.includes('图文作者')){inputs.push({stage:'compose',data:structuredClone(data)});return {title:block(input.brief.platform+'测试作品'),lead:block(input.previous?.article?.lead.text??'测试导语'),sections:[{heading:block('协同场景'),body:{text:'按测试条件共享',facts:[],relationIds:[relation.id]}}],cta:block('到店了解'),tags:[],images:records.map(d=>({id:d.images[0].id,productId:d.product.id,position:'产品介绍',reason:'展示对应设备外观'}))};}
    if(system.includes('局部修订员'))throw new Error('Synthetic repair intentionally fails');
    inputs.push({stage:'verify',data:structuredClone(data)});
    return {checks:input.fields.map((f:any)=>({field:f.field,supported:!(options.blockedPlatform&&input.fields[0].text.startsWith(options.blockedPlatform)&&f.field==='title'),reason:'合成判定',suggestion:'测试修改'}))};
  };
  const deps:EcosystemAgentDeps={knowledge,ecosystem,store,images:{asset:async()=>({body:syntheticPng,type:'image/png'})},chat};
  const source=await generateEcosystem(brief,deps);inputs.length=0;
  return {knowledge,ecosystem,store,brief,source,deps,inputs,options,expire:()=>{now=Date.parse('2026-10-22T00:00:00Z');}};
}
const content=(a:EcosystemContent)=>({title:a.title,lead:a.lead,sections:a.sections,cta:a.cta,tags:a.tags});

test('四平台分别策划/创作/核验，源创意与有效人工信息传至两个模型阶段',async t=>{
  const s=await setup(t);const campaign=await createEcosystemCampaign({sourceRunId:s.source.id,platforms:['xiaohongshu','wechat','moments','poster']},s.deps);
  assert.equal(campaign.status,'complete');assert.equal(campaign.releaseReady,true);assert.equal(campaign.items.length,4);
  assert.equal(s.inputs.filter(i=>i.stage==='plan').length,4);assert.equal(s.inputs.filter(i=>i.stage==='compose').length,4);
  for(const i of s.inputs.filter(i=>i.stage==='plan'||i.stage==='compose')){assert.deepEqual(i.data.previous.plan,s.source.plan);assert.deepEqual(i.data.previous.article,content(s.source.article));}
  for(const item of campaign.items){const run=s.store.getEcosystem(item.runId!)!;assert.equal(run.parentId,s.source.id);assert.equal(run.brief.platform,item.platform);assert.deepEqual(run.brief.selection,s.source.brief.selection);}
  assert.deepEqual(s.store.getEcosystem(s.source.id),s.source);assert.equal(s.store.listCampaigns().length,0);
});
test('平台失败只影响该项，全部产出与全部审核通过严格区分',async t=>{
  const s=await setup(t);s.options.failPlatform='wechat';const partial=await createEcosystemCampaign({sourceRunId:s.source.id,platforms:['moments','wechat','poster']},s.deps);assert.equal(partial.status,'partial');assert.equal(partial.releaseReady,false);assert.deepEqual(partial.items.map(i=>i.status),['generated','failed','generated']);
  s.options.failPlatform='';s.options.blockedPlatform='poster';const blocked=await createEcosystemCampaign({sourceRunId:s.source.id,platforms:['moments','poster']},s.deps);assert.equal(blocked.status,'complete');assert.equal(blocked.releaseReady,false);assert.equal(blocked.items[1].auditStatus,'blocked');
});
test('输入、超长要求、过期来源在创建任务或调用模型前拒绝',async t=>{
  const s=await setup(t);await assert.rejects(createEcosystemCampaign({sourceRunId:s.source.id,platforms:['poster','poster']},s.deps),{code:'CAMPAIGN_INPUT'});
  const long={...s.source,id:randomUUID(),brief:{...s.source.brief,requirements:'甲'.repeat(2900)}};s.store.saveEcosystem(long);await assert.rejects(createEcosystemCampaign({sourceRunId:long.id,platforms:['poster'],instructions:'乙'.repeat(200)},s.deps),{code:'CAMPAIGN_INPUT'});
  s.expire();await assert.rejects(createEcosystemCampaign({sourceRunId:s.source.id,platforms:['poster']},s.deps),{code:'ECOSYSTEM_NOT_READY'});assert.equal(s.inputs.length,0);assert.equal(s.store.listEcosystemCampaigns().length,0);
});
test('联动修改基于各平台原版，明确编辑版可传递，不覆盖旧内容包',async t=>{
  const s=await setup(t),old=await createEcosystemCampaign({sourceRunId:s.source.id,platforms:['wechat','moments']},s.deps);
  const original=s.store.getEcosystem(old.items[0].runId!)!,changes=content(structuredClone(original.article));changes.lead.text='人工保留的门店场景';const edited=await editEcosystem(original,changes,s.deps);
  s.inputs.length=0;const next=await reviseEcosystemCampaign(old.id,{audience:'测试商务人士',goal:'预约体验',instructions:'突出携带场景',editedRunIds:{wechat:edited.id}},s.deps);
  assert.equal(next.parentCampaignId,old.id);assert.equal(next.items[0].sourceRunId,edited.id);assert.equal(next.items[1].sourceRunId,old.items[1].runId);assert.deepEqual(s.store.getEcosystemCampaign(old.id),old);
  for(const item of next.items){const run=s.store.getEcosystem(item.runId!)!;assert.equal(run.brief.audience,'测试商务人士');assert.equal(run.brief.goal,'预约体验');assert.match(run.brief.requirements,/原始创意约束\n突出携带场景/);}
  const writers=s.inputs.filter(i=>i.stage==='compose');assert.equal(writers[0].data.previous.article.lead.text,'人工保留的门店场景');
});
test('编辑版本不能跨平台/跨作品混入，运行中的内容包拒绝联动修改',async t=>{
  const s=await setup(t),old=await createEcosystemCampaign({sourceRunId:s.source.id,platforms:['wechat','moments']},s.deps);
  await assert.rejects(reviseEcosystemCampaign(old.id,{instructions:'调整语气',editedRunIds:{wechat:old.items[1].runId}},s.deps),{code:'CAMPAIGN_LINEAGE'});
  await assert.rejects(reviseEcosystemCampaign(old.id,{instructions:'调整语气',editedRunIds:{poster:old.items[0].runId}},s.deps),{code:'CAMPAIGN_INPUT'});
  const unrelated=await generateEcosystem(s.brief,s.deps);await assert.rejects(reviseEcosystemCampaign(old.id,{instructions:'调整语气',editedRunIds:{wechat:unrelated.id}},s.deps),{code:'CAMPAIGN_LINEAGE'});
  s.store.saveEcosystemCampaign({...old,status:'running'});await assert.rejects(reviseEcosystemCampaign(old.id,{instructions:'调整语气'},s.deps),{code:'CAMPAIGN_RUNNING'});
});
test('部分失败包可按原平台重试，成功平台基于已有成稿，失败平台基于原稿',async t=>{
  const s=await setup(t);s.options.failPlatform='moments';const old=await createEcosystemCampaign({sourceRunId:s.source.id,platforms:['wechat','moments']},s.deps);s.options.failPlatform='';
  const next=await reviseEcosystemCampaign(old.id,{instructions:'重新整理'},s.deps);assert.equal(next.status,'complete');assert.equal(next.items[0].sourceRunId,old.items[0].runId);assert.equal(next.items[1].sourceRunId,s.source.id);
});
test('取消保留已经完成平台；过期后聚合状态不沿用旧通过结论',async t=>{
  const s=await setup(t),controller=new AbortController();const campaign=await createEcosystemCampaign({sourceRunId:s.source.id,platforms:['wechat','moments','poster']},{...s.deps,signal:controller.signal,onCampaign:c=>{if(c.items[0].status==='generated')controller.abort();}});
  assert.equal(campaign.status,'cancelled');assert.deepEqual(campaign.items.map(i=>i.status),['generated','cancelled','cancelled']);assert.ok(s.store.getEcosystem(campaign.items[0].runId!));assert.equal(campaign.releaseReady,false);
  const completed=await createEcosystemCampaign({sourceRunId:s.source.id,platforms:['poster']},s.deps);assert.equal(completed.releaseReady,true);s.expire();assert.equal(presentEcosystemCampaign(completed,s.deps).releaseReady,false);assert.equal(s.store.getEcosystemCampaign(completed.id)!.releaseReady,true);
});
test('最后一个平台完成时来源变化，所有已产出平台重新检查；缺结果不通过',async t=>{
  const s=await setup(t);const result=await createEcosystemCampaign({sourceRunId:s.source.id,platforms:['wechat','moments']},{...s.deps,onCampaign:c=>{if(c.items.every(i=>i.status==='generated'))s.expire();}});assert.equal(result.status,'complete');assert.equal(result.releaseReady,false);assert.ok(result.items.every(i=>i.releaseReady===false));
  const fresh=await setup(t),ready=await createEcosystemCampaign({sourceRunId:fresh.source.id,platforms:['poster']},fresh.deps);const missing=structuredClone(ready);missing.items[0].runId=randomUUID();assert.equal(presentEcosystemCampaign(missing,fresh.deps).releaseReady,false);
});
test('重启中止遗留任务且保留已完成版本引用',async t=>{
  const s=await setup(t),campaign=await createEcosystemCampaign({sourceRunId:s.source.id,platforms:['wechat','moments']},s.deps);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'wuyan-eco-campaign-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'test.sqlite');
  const store=new RunStore(file);store.saveEcosystemCampaign({...campaign,status:'running',items:[campaign.items[0],{platform:'moments',sourceRunId:s.source.id,status:'running'}]});store.close();
  const reopened=new RunStore(file);try{const recovered=reopened.getEcosystemCampaign(campaign.id)!;assert.equal(recovered.status,'cancelled');assert.equal(recovered.items[0].runId,campaign.items[0].runId);assert.equal(recovered.items[1].error?.code,'PROCESS_RESTARTED');assert.equal(recovered.releaseReady,false);}finally{reopened.close();}
});
test('生态内容包HTTP创建/查询/联动修改可用，模型响应全部为合成数据',async t=>{
  const s=await setup(t);configure({llmKey:'qa-key',llmModel:'qa-model',llmBaseUrl:'https://api.siliconflow.cn/v1'});t.after(clearSession);
  const realFetch=globalThis.fetch;t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{if(String(input).startsWith('https://api.siliconflow.cn/')){const data=JSON.parse(String(init!.body));const value=await s.deps.chat!(data.messages[0].content,JSON.parse(data.messages[1].content));return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}));}return realFetch(input,init);});
  const server:Server=await new Promise(resolve=>{const value=createApp({knowledge:s.knowledge,store:s.store,ecosystem:s.ecosystem}).listen(0,'127.0.0.1',()=>resolve(value));});t.after(()=>new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve())));
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`,post=(url:string,body:unknown)=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const response=await post('/api/ecosystem/campaigns',{sourceRunId:s.source.id,platforms:['wechat','moments']});assert.equal(response.status,200);const campaign=await response.json();assert.equal(campaign.status,'complete');assert.equal(campaign.releaseReady,false,'no on-disk originals in fixture');
  assert.equal((await fetch(base+`/api/ecosystem/campaigns/${campaign.id}`)).status,200);assert.equal((await(await fetch(base+'/api/ecosystem/campaigns')).json()).length,1);
  const revised=await post(`/api/ecosystem/campaigns/${campaign.id}/revise`,{instructions:'突出场景'});assert.equal(revised.status,200);assert.equal((await revised.json()).parentCampaignId,campaign.id);
});
