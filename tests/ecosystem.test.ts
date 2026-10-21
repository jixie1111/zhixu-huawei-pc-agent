import test from 'node:test';
import assert from 'node:assert/strict';
import { EcosystemStore } from '../server/ecosystem';
import { classifyProduct, detectConflicts, extractFacts, type KnowledgeStore } from '../server/knowledge';
import { evidence, fact } from './fixtures';
import type { EcosystemRelation, EcosystemRequest } from '../shared/ecosystem';
import { buildStrategy, composeLocal } from '../shared/local-composer';
import { brief } from './fixtures';

// Entirely synthetic records. These do not assert compatibility of any Huawei device.
const now=Date.parse('2026-10-19T00:00:00Z');
const relation=():EcosystemRelation=>({id:'qa-link',capability:'QA合成资料流转',statement:'QA组合在记录条件下支持合成演示任务。',participants:[{productId:'qa-phone',role:'来源设备',systems:['QA OS 1']},{productId:'qa-tablet',role:'目标设备',systems:['QA OS 2']}],conditions:[{key:'account',label:'账号状态',value:'同一测试账号'},{key:'network',label:'网络状态',value:'测试网络'}],sourceTitle:'QA官方域名合成fixture，不是产品依据',sourceUrl:'https://consumer.huawei.com/cn/support/content/qa-fiction/',excerpt:'仅合成测试范围',reviewedAt:'2026-10-18T00:00:00Z',expiresAt:'2026-10-21T00:00:00Z'});
const request=():EcosystemRequest=>({devices:[{productId:'qa-phone',system:'QA OS 1'},{productId:'qa-tablet',system:'QA OS 2'}],relationIds:['qa-link'],conditions:{account:'同一测试账号',network:'测试网络'}});
const knowledge={get:(id:string)=>{const data=evidence();data.product.id=id;data.product.name=id;data.facts=data.facts.map(f=>({...f,productId:id}));return data;}} as unknown as KnowledgeStore;
test('设备分类不赋予协同能力，手机/平板参数可提取，不套笔记本尺寸阈值',()=>{
  assert.equal(classifyProduct('HUAWEI MatePad QA',''),'tablet');assert.equal(classifyProduct('HUAWEI Pura QA',''),'phone');assert.equal(classifyProduct('HUAWEI MateBook QA',''),'computer');
  const facts=extractFacts('# QA\nhttps://consumer.huawei.com/cn/phones/qa/specs/\n## 充电\nQA仅测试\n## 后置摄像头\nQA相机\n## 未授权承诺\n永不卡顿','qa','QA','local');
  assert.deepEqual(facts.map(f=>f.label),['充电','后置摄像头']);
  const dimensions=[fact('尺寸与重量','长度 90 mm；厚度 8 mm。')];
  assert.equal(detectConflicts(dimensions,'phone').length,0);assert.equal(detectConflicts(dimensions,'computer').length,1);
});
test('生态能力需精确设备、系统、条件、官方来源与有效复核期',()=>{
  const store=new EcosystemStore([relation()],()=>now);const result=store.resolve(request(),knowledge);
  assert.equal(result.ready,true);assert.equal(result.capabilities[0].status,'supported');
  result.capabilities[0].relation!.statement='篡改';assert.notEqual(store.resolve(request(),knowledge).capabilities[0].relation!.statement,'篡改');
  const pending=request();pending.conditions={};pending.devices[0].system='';
  const answer=store.resolve(pending,knowledge);assert.equal(answer.ready,false);assert.equal(answer.capabilities[0].status,'needs-confirmation');assert.equal(answer.capabilities[0].reasons.length,3);
});
test('第三设备、不同系统、过期与缺关系均不能泛化为生态互联',()=>{
  const store=new EcosystemStore([relation()],()=>now);
  const cases=[request(),request(),request()];cases[0].devices.push({productId:'qa-extra',system:'QA OS 1'});cases[1].devices[0].system='QA OS NEW';cases[2].relationIds=['invented'];
  for(const input of cases){const result=store.resolve(input,knowledge);assert.equal(result.ready,false);assert.equal(result.capabilities[0].status,'unavailable');}
  assert.equal(new EcosystemStore([relation()],()=>Date.parse('2026-10-22T00:00:00Z')).resolve(request(),knowledge).ready,false);
  const bad=relation();bad.sourceUrl='https://example.com/arbitrary';assert.throws(()=>new EcosystemStore([bad]),{code:'ECOSYSTEM_RECORD'});
  assert.throws(()=>new EcosystemStore([relation(),relation()]),{code:'ECOSYSTEM_RECORD'});
});
test('缺设备资料或冲突停止生态解析，重复设备输入被拒绝',()=>{
  const store=new EcosystemStore([relation()],()=>now),input=request();input.devices[1]=input.devices[0];
  assert.throws(()=>store.resolve(input,knowledge),{code:'ECOSYSTEM_INPUT'});
  const conflict={get:()=>{const d=evidence();d.product.conflicts=['QA冲突'];return d;}} as unknown as KnowledgeStore;
  assert.throws(()=>store.resolve(request(),conflict),{code:'ECOSYSTEM_PRODUCT'});
});

test('手机/平板单品规则预览使用对应品类语言并保留完整规格条件',()=>{
  for(const category of ['phone','tablet'] as const){
    const data=evidence();data.product.category=category;data.product.name=category==='phone'?'QA手机':'QA平板';data.product.shortName=data.product.name;
    const input={...brief,scene:'creator' as const};const strategy=buildStrategy(input,category),article=composeLocal(input,data,strategy);
    assert.ok(!strategy.angle.includes('电脑'));assert.ok(!article.title.includes('电脑'));assert.ok(!article.lead.includes('电脑'));assert.ok(article.tags.includes(category==='phone'?'华为手机':'华为平板'));
    for(const section of article.sections){const original=data.facts.find(f=>f.id===section.factIds[0])!;assert.ok(section.text.includes(original.text),'规则摘要不能截断移动设备规格限制');}
  }
});
