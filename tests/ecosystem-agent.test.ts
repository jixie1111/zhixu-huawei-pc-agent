import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { EcosystemBrief, EcosystemContent, EcosystemPlan, EcosystemRelation, ScopedBlock } from '../shared/ecosystem';
import { EcosystemStore } from '../server/ecosystem';
import { generateEcosystem, editEcosystem, ecosystemFields, presentEcosystem, auditEcosystem, type EcosystemAgentDeps } from '../server/ecosystem-agent';
import { ecosystemHtml, ecosystemMarkdown } from '../server/ecosystem-export';
import type { KnowledgeStore } from '../server/knowledge';
import { RunStore } from '../server/store';
import { createApp } from '../server/app';
import { configure, clearSession } from '../server/config';
import { evidence, syntheticPng, syntheticText } from './fixtures';

// Entire test file uses invented products, relations, images and model responses.
// Passing these contracts is NOT a real model / real device compatibility test.
const block=(text:string,facts:ScopedBlock['facts']=[],relationIds:string[]=[]):ScopedBlock=>({text,facts,relationIds});
function setup(t:TestContext){
  let now=Date.parse('2026-10-19T01:00:00Z');
  const records=['qa-phone','qa-tablet'].map(id=>{const e=evidence();e.product={...e.product,id,name:id,shortName:id};e.facts=e.facts.map(f=>({...f,id:id+':'+f.id,productId:id}));e.images=e.images.slice(0,1).map(i=>({...i,id:id+'-image',productId:id,productName:id}));return e;});
  const knowledge={get:(id:string)=>{const e=records.find(d=>d.product.id===id);if(!e)throw new Error('unknown');return structuredClone(e);},products:records.map(r=>r.product),assets:new Map(),stats:{documents:2,images:2,products:2,categories:2}} as unknown as KnowledgeStore;
  const relation:EcosystemRelation={id:'qa-relation',capability:'QA合成共享',statement:'仅测试条件下共享合成资料。',participants:records.map(r=>({productId:r.product.id,role:'测试设备',systems:['QA 1']})),conditions:[{key:'account',label:'测试账号',value:'一致'}],sourceTitle:'QA虚构文档',sourceUrl:'https://consumer.huawei.com/cn/support/content/qa/',excerpt:'虚构测试证据',reviewedAt:'2026-10-18T00:00:00Z',expiresAt:'2026-10-20T00:00:00Z'};
  const ecosystem=new EcosystemStore([relation],()=>now),store=new RunStore(':memory:');t.after(()=>store.close());
  const brief:EcosystemBrief={selection:{devices:records.map(d=>({productId:d.product.id,system:'QA 1'})),relationIds:[relation.id],conditions:{account:'一致'}},audience:'合成测试受众',platform:'wechat',goal:'测试到店体验',requirements:'',generation:'model',autoRepair:false};
  const plan:EcosystemPlan={angle:'QA两设备故事',rationale:'测试规划',deviceRoles:records.map(d=>({productId:d.product.id,role:'QA专属角色',factIds:[d.facts[0].id]})),relationIds:[relation.id],structure:['场景','设备','关系'],visualDirection:'QA真实原图说明'};
  const output={title:block('一起安排一天'),lead:block('从日常任务开始'),sections:records.map(d=>({heading:block(d.product.name),body:block(d.product.name+' 的测试规格',[{productId:d.product.id,factId:d.facts[0].id}])})).concat([{heading:block('合成协同'),body:block('按已确认条件共享测试资料',[],[relation.id])}]),cta:block(''),tags:[],images:records.map(d=>({id:d.images[0].id,productId:d.product.id,position:'产品介绍后',reason:'说明对应设备的外观'}))};
  output.sections[1].body.text+=syntheticText(850);
  const calls:string[]=[];
  const options={reviewFail:false,incomplete:false,wrongField:false,problem:false,repairBad:false,alwaysProblem:false};let repairs=0;
  const chat:EcosystemAgentDeps['chat']=async(system,data)=>{
    if(system.includes('创意导演')){calls.push('plan');return structuredClone(plan);}
    if(system.includes('图文作者')){calls.push('compose');return structuredClone(output);}
    if(system.includes('局部修订员')){calls.push('repair');repairs++;const d=data as {fields:({field:string}&ScopedBlock)[]};const f=d.fields.find(f=>f.field==='sections.0.body')!;return {patches:[{field:options.repairBad?'title':f.field,before:options.repairBad?output.title.text:f.text,after:'修订后的测试建议'+repairs}]};}
    calls.push('verify');if(options.reviewFail)throw new Error('QA semantic outage');
    const fields=(data as {fields:{field:string}[]}).fields;let checks=fields.map(f=>({field:f.field,supported:!((options.alwaysProblem||options.problem&&repairs===0)&&f.field==='sections.0.body'),reason:'QA合成字段判定',suggestion:'改为建议'}));
    if(options.incomplete)checks=checks.slice(1);if(options.wrongField)checks[0].field='unknown';return {checks};
  };
  const deps:EcosystemAgentDeps={knowledge,ecosystem,store,images:{asset:async()=>({body:syntheticPng,type:'image/png'})},chat};
  return {records,knowledge,ecosystem,store,brief,plan,output,options,calls,deps,expire:()=>{now=Date.parse('2026-10-21T00:00:00Z');}};
}
const content=(a:EcosystemContent):EcosystemContent=>({title:a.title,lead:a.lead,sections:a.sections,cta:a.cta,tags:a.tags});

test('生态生成分阶段决策和核验，保留设备归属并独立持久化',async t=>{
  const s=setup(t),delegate=s.deps.chat!,tasks:unknown[]=[];
  s.deps.chat=async(system,data,signal,task)=>{tasks.push(task);return delegate(system,data,signal,task);};
  const run=await generateEcosystem(s.brief,s.deps);
  assert.deepEqual(tasks,[{stage:'plan',platform:'wechat'},{stage:'compose',platform:'wechat'},{stage:'verify'}]);
  assert.deepEqual(s.calls,['plan','compose','verify']);assert.equal(run.audit.releaseReady,true);
  assert.equal(run.evidence.devices.length,2);assert.equal(run.article.disclosures[0].conditions[0],'测试账号：一致');
  assert.ok(run.audit.factChecks.every(c=>c.status==='supported'));assert.equal(s.store.list().length,0);assert.equal(s.store.listEcosystem().length,1);
  assert.deepEqual(s.store.getEcosystem(run.id),run);assert.throws(()=>s.store.saveEcosystem(run),'existing version cannot be overwritten');
});
test('生态输入拒绝规则冒充模型，缺条件在调用模型前阻断',async t=>{
  const s=setup(t);await assert.rejects(generateEcosystem({...s.brief,generation:'rules'},s.deps));
  s.brief.selection.conditions={};await assert.rejects(generateEcosystem(s.brief,s.deps),{code:'ECOSYSTEM_NOT_READY'});assert.equal(s.calls.length,0);
});
test('生态短稿一次补足篇幅后核验，设备引用、关系与图片保持原样',async t=>{
  const s=setup(t);s.output.sections[1].body.text='合成设备正文';
  const delegate=s.deps.chat!;let adjustments=0;
  s.deps.chat=async(system,data,signal,task)=>{
    if(system.includes('正文篇幅编辑')){adjustments++;assert.equal(task?.stage,'repair');assert.ok(system.includes('600–1000 字'));
      return {patches:[{field:'sections.1.body',before:s.output.sections[1].body.text,after:syntheticText(900)}]};}
    return delegate(system,data,signal,task);
  };
  const run=await generateEcosystem(s.brief,s.deps);assert.equal(adjustments,1);assert.equal(run.audit.releaseReady,true);
  assert.deepEqual(run.article.sections[1].body.facts,s.output.sections[1].body.facts);
  assert.deepEqual(run.article.sections[2].body.relationIds,s.output.sections[2].body.relationIds);
  assert.deepEqual(run.article.images.map(i=>i.id),s.output.images.map(i=>i.id));assert.ok(s.calls.includes('verify'));
  const edited=content(structuredClone(run.article));edited.sections[1].body.text='变短后的人工稿';
  const short=await editEcosystem(run,edited,s.deps);assert.equal(adjustments,1);assert.equal(short.audit.releaseReady,false);
  assert.ok(short.audit.findings.some(f=>f.id==='body-length'));assert.equal(s.store.getEcosystem(run.id)!.audit.releaseReady,true);
});
test('策划引用他设备事实、遗漏设备或发明关系不能进入生成',async t=>{
  for(const kind of ['fact','device','relation']){const s=setup(t);if(kind==='fact')s.plan.deviceRoles[0].factIds=[s.records[1].facts[0].id];if(kind==='device')s.plan.deviceRoles[1]=s.plan.deviceRoles[0];if(kind==='relation')s.plan.relationIds=['unknown'];await assert.rejects(generateEcosystem(s.brief,s.deps),{code:'ECOSYSTEM_PLAN'});assert.deepEqual(s.calls,['plan']);}
});
test('正文串设备引用被结构核验拦截，即使合成语义核验误报通过',async t=>{
  const s=setup(t);s.output.sections[0].body.facts[0].productId='qa-tablet';const run=await generateEcosystem(s.brief,s.deps);assert.equal(run.audit.releaseReady,false);assert.ok(run.audit.findings.some(f=>f.id.startsWith('ownership-')));
});
test('未知生态关系、遗漏关系与设备图片覆盖不足均保留阻断',async t=>{
  for(const kind of ['unknown','missing','image']){const s=setup(t);if(kind==='unknown')s.output.sections[2].body.relationIds=['unknown'];if(kind==='missing')s.output.sections[2].body.relationIds=[];if(kind==='image')s.output.images[1]=s.output.images[0];const run=await generateEcosystem(s.brief,s.deps);assert.equal(run.audit.releaseReady,false,kind);}
});
test('配图设备错配、来源归属混乱在发布前拒绝',async t=>{
  const s=setup(t);s.output.images[0].productId='qa-tablet';await assert.rejects(generateEcosystem(s.brief,s.deps),{code:'ECOSYSTEM_IMAGE'});
  const bad=setup(t);bad.records[0].facts[0].productId='qa-tablet';await assert.rejects(generateEcosystem(bad.brief,bad.deps),{code:'ECOSYSTEM_OWNERSHIP'});assert.equal(bad.calls.length,0);
});
test('原图签名异常阻断，不进行文本修订掩盖图片错误',async t=>{
  const s=setup(t);s.brief.autoRepair=true;s.deps.images={asset:async()=>({body:Buffer.from('not a PNG'),type:'image/png'})};const run=await generateEcosystem(s.brief,s.deps);assert.equal(run.audit.releaseReady,false);assert.ok(run.audit.findings.some(f=>f.category==='image'));assert.ok(!s.calls.includes('repair'));
});
test('独立核验缺字段、错字段或服务失败均不放行，不降级规则',async t=>{
  for(const key of ['incomplete','wrongField','reviewFail'] as const){const s=setup(t);s.options[key]=true;s.brief.autoRepair=true;const run=await generateEcosystem(s.brief,s.deps);assert.equal(run.audit.releaseReady,false);assert.ok(run.audit.findings.some(f=>f.id==='semantic-failed'));assert.deepEqual(s.calls,['plan','compose','verify']);}
});
test('局部修订只改被定位文本，保留引用/原图/无关段落并重新核验',async t=>{
  const s=setup(t),delegate=s.deps.chat!,stages:string[]=[];
  s.deps.chat=async(system,data,signal,task)=>{stages.push(task!.stage);return delegate(system,data,signal,task);};
  s.options.problem=true;s.brief.autoRepair=true;const run=await generateEcosystem(s.brief,s.deps);
  assert.deepEqual(stages,['plan','compose','verify','repair','verify']);
  assert.equal(run.audit.releaseReady,true);assert.deepEqual(s.calls,['plan','compose','verify','repair','verify']);assert.equal(run.repairHistory.length,1);
  assert.equal(run.article.title.text,s.output.title.text);assert.deepEqual(run.article.sections[0].body.facts,s.output.sections[0].body.facts);assert.deepEqual(run.repairHistory[0].changedFields,['sections.0.body']);
});
test('越权修订保留原稿，持续不通过最多两轮且维持阻断',async t=>{
  const s=setup(t);s.options.problem=true;s.options.repairBad=true;s.brief.autoRepair=true;const run=await generateEcosystem(s.brief,s.deps);assert.equal(run.article.title.text,s.output.title.text);assert.equal(run.audit.releaseReady,false);assert.ok(run.audit.findings.some(f=>f.id==='repair-failed'));
  const loop=setup(t);loop.options.alwaysProblem=true;loop.brief.autoRepair=true;const failed=await generateEcosystem(loop.brief,loop.deps);assert.equal(failed.repairHistory.length,2);assert.equal(loop.calls.filter(c=>c==='verify').length,3);assert.equal(failed.audit.releaseReady,false);
});
test('改人群及平台重新策划，新版本不覆盖旧稿，更换设备需新作品',async t=>{
  const s=setup(t),parent=await generateEcosystem(s.brief,s.deps);const next=await generateEcosystem({...s.brief,parentId:parent.id,platform:'moments',audience:'另一组测试受众'},s.deps);assert.equal(next.version,2);assert.equal(next.parentId,parent.id);assert.equal(s.calls.filter(c=>c==='plan').length,2);assert.deepEqual(s.store.getEcosystem(parent.id),parent);
  const bad={...s.brief,parentId:parent.id,selection:{...s.brief.selection,devices:[{productId:'qa-phone',system:'QA 1'},{productId:'another',system:'QA 1'}]}};await assert.rejects(generateEcosystem(bad,s.deps));
});
test('手工编辑创建版本重新核验，无法改图片和适用条件',async t=>{
  const s=setup(t),original=await generateEcosystem(s.brief,s.deps),edited=content(structuredClone(original.article));edited.title.text='新的合成标题';s.options.problem=true;
  const run=await editEcosystem(original,edited,s.deps);assert.equal(run.version,2);assert.equal(run.parentId,original.id);assert.equal(run.audit.releaseReady,false);assert.deepEqual(s.store.getEcosystem(original.id),original);assert.deepEqual(run.article.images,original.article.images);
  await assert.rejects(editEcosystem(original,{...edited,disclosures:[]},s.deps));await assert.rejects(editEcosystem(original,{...edited,images:[]},s.deps));
});

test('生态稿同样要求无第一人称，独立事实通过不能放过编辑加入的自述',async t=>{
  const s=setup(t),original=await generateEcosystem(s.brief,s.deps);
  const edited=content(structuredClone(original.article));edited.cta.text='私信我咨询';
  const run=await editEcosystem(original,edited,s.deps);
  assert.equal(run.audit.releaseReady,false);
  assert.ok(run.audit.findings.some(f=>f.id==='writing-person-cta'&&f.category==='platform'&&f.field==='cta'));
  assert.equal(s.store.getEcosystem(original.id)!.audit.releaseReady,true,'the saved original is unchanged');
});
test('过期证据不沿用历史通过状态，编辑及生成中途过期均停止',async t=>{
  const s=setup(t),run=await generateEcosystem(s.brief,s.deps);s.expire();assert.equal(presentEcosystem(run,s.deps).audit.releaseReady,false);assert.equal(s.store.getEcosystem(run.id)!.audit.releaseReady,true);await assert.rejects(editEcosystem(run,content(run.article),s.deps),{code:'ECOSYSTEM_NOT_READY'});
  const pending=setup(t),chat=pending.deps.chat!;pending.deps.chat=async(system,data,signal)=>{const output=await chat(system,data,signal);if(system.includes('独立多设备'))pending.expire();return output;};await assert.rejects(generateEcosystem(pending.brief,pending.deps),{code:'ECOSYSTEM_NOT_READY'});assert.equal(pending.store.listEcosystem().length,0);
});
test('资料变化令历史版本需要复核，取消任务不保存假完成',async t=>{
  const s=setup(t),run=await generateEcosystem(s.brief,s.deps);s.records[0].facts[0].text='已变更';assert.equal(presentEcosystem(run,s.deps).audit.releaseReady,false);await assert.rejects(editEcosystem(run,content(run.article),s.deps),{code:'ECOSYSTEM_CHANGED'});
  const cancelled=setup(t),controller=new AbortController(),chat=cancelled.deps.chat!;cancelled.deps.signal=controller.signal;cancelled.deps.chat=async(system,data,signal)=>{const output=await chat(system,data,signal);controller.abort();return output;};await assert.rejects(generateEcosystem(cancelled.brief,cancelled.deps),{name:'AbortError'});assert.equal(cancelled.store.listEcosystem().length,0);
});
test('MD/HTML导出保留设备引用与适用条件，转义模型注入文本',async t=>{
  const s=setup(t),run=await generateEcosystem(s.brief,s.deps);run.article.title.text='<script>alert(1)</script> ![x](https://evil.test/x)';const html=ecosystemHtml(run,new Map()),md=ecosystemMarkdown(run);assert.ok(!html.includes('<script>'));assert.match(html,/default-src 'none'/);assert.match(html,/测试账号/);assert.match(md,/qa-phone/);assert.ok(!md.includes('![x]'));assert.match(md,/依据/);
  run.article.disclosures=[];const audit=auditEcosystem(run.article,run.evidence,run.brief);assert.equal(audit.releaseReady,false);assert.ok(audit.findings.some(f=>f.id==='disclosures'));
});
test('生态HTTP接口本地生成/读写/导出闭环与源过期状态（模型为合成响应）',async t=>{
  const s=setup(t);configure({llmKey:'qa-eco-key',llmModel:'qa-eco-model',llmBaseUrl:'https://api.siliconflow.cn/v1'});t.after(clearSession);
  const fetchOriginal=globalThis.fetch;
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    if(String(input).startsWith('https://api.siliconflow.cn/')){const p=JSON.parse(String(init!.body));const answer=await s.deps.chat!(p.messages[0].content,JSON.parse(p.messages[1].content));return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(answer)}}]}));}
    return fetchOriginal(input,init);
  });
  const server:Server=await new Promise(resolve=>{const value=createApp({knowledge:s.knowledge,store:s.store,ecosystem:s.ecosystem}).listen(0,'127.0.0.1',()=>resolve(value));});t.after(()=>new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve())));
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`,post=(suffix:string,body:unknown)=>fetch(base+suffix,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const created=await post('/api/ecosystem/runs',s.brief);assert.equal(created.status,200);const run=await created.json();assert.equal(run.audit.releaseReady,false,'HTTP fixture has no on-disk originals; image check must block');
  assert.equal((await fetch(base+`/api/ecosystem/runs/${run.id}`)).status,200);assert.equal((await(await fetch(base+'/api/ecosystem/runs')).json()).length,1);
  assert.equal((await fetch(base+`/api/ecosystem/runs/${run.id}/export?format=json`)).status,409);
  assert.equal((await fetch(base+`/api/ecosystem/runs/${run.id}/export?format=json&draft=true`)).status,200);
  const html=await fetch(base+`/api/ecosystem/runs/${run.id}/export?format=html&draft=true`);assert.equal(html.status,200);assert.match(await html.text(),/待审草稿/);
  assert.equal((await post(`/api/ecosystem/runs/${run.id}/edit`,content(run.article))).status,200);
  s.expire();assert.equal((await post(`/api/ecosystem/runs/${run.id}/edit`,content(run.article))).status,422);assert.equal((await(await fetch(base+`/api/ecosystem/runs/${run.id}`)).json()).audit.releaseReady,false);
});
