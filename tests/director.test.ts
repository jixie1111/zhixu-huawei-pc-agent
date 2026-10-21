import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectorService, planCreative } from '../server/director';
import { KnowledgeStore } from '../server/knowledge';
import { RunStore } from '../server/store';
import { generate } from '../server/agent';
import { brief, evidence, knowledgeFixture } from './fixtures';
import type { Brief } from '../shared/types';
import type { ModelTask } from '../server/model-policy';

const mockKnowledge = (data = evidence()) => ({ get: () => structuredClone(data) }) as unknown as KnowledgeStore;
const rulesBrief: Brief = { ...brief, generation: 'rules', autoRepair: true };
const planInput = { message: '面向大学新生做小红书', engine: 'rules', brief: rulesBrief };

test('意图与创意策划发送各自阶段，规则预览不发送模型任务',async()=>{
  const baseline=await createDirectorService().interpretIntent({message:planInput.message,engine:'rules'},[evidence().product]);
  const preview=await createDirectorService().planCreative(planInput,mockKnowledge());
  const tasks:(ModelTask|undefined)[]=[];
  const service=createDirectorService({chat:async(_system,_data,_signal,task)=>{
    tasks.push(task);
    if(task?.stage==='intent')return {summary:'QA合成需求',fields:baseline.fields};
    return {concepts:preview.concepts.map(({id,...concept})=>concept),recommendedIndex:0,reason:'QA合成推荐'};
  }});
  await service.interpretIntent({message:planInput.message,engine:'model'},[evidence().product]);
  await service.planCreative({...planInput,engine:'model',brief:{...rulesBrief,generation:'model'}},mockKnowledge());
  assert.deepEqual(tasks,[{stage:'intent'},{stage:'plan',platform:'xiaohongshu'}]);
  await service.planCreative(planInput,mockKnowledge());assert.equal(tasks.length,2);
});

test('创意策划保留原图用途和精确事实，不能从文件名推断画面或产品能力',async()=>{
  const data=evidence();
  data.images[0].editorial={role:'screen-demo',note:'合成用途注释：演示画面，非整机',sha256:'a'.repeat(64),reviewedAt:'2026-10-19',basis:'visual-review'};
  const baseline=await createDirectorService().planCreative(planInput,mockKnowledge(data));
  const service=createDirectorService({chat:async(system,input)=>{
    const payload=input as {images:unknown[];facts:{id:string;text:string}[]};
    assert.deepEqual(payload.images[0],{id:data.images[0].id,description:data.images[0].description,editorial:data.images[0].editorial});
    assert.equal(payload.facts[0].text,data.facts[0].text);
    assert.ok(system.includes('不证明功能'));assert.ok(system.includes('产品选择有关'));
    return {concepts:baseline.concepts.map(({id,...concept})=>concept),recommendedIndex:0,reason:'合成策划'};
  }});
  await service.planCreative({...planInput,engine:'model',brief:{...rulesBrief,generation:'model'}},mockKnowledge(data));
});
test('规则意图保留用户原话，泛化型号需要确认，商务出差不误归企业采购', async () => {
  const service = createDirectorService({ chat: async () => { throw new Error('规则路径禁止调用模型'); } });
  const proposal = await service.interpretIntent({ message: '为出差商务人士做公众号', engine: 'rules' }, [evidence().product]);
  assert.equal(proposal.engine, 'rules'); assert.equal(proposal.suggestedBrief.productId, undefined);
  assert.equal(proposal.suggestedBrief.platform, 'wechat'); assert.equal(proposal.suggestedBrief.scene, 'office');
  assert.ok(proposal.questions.some(q => q.field === 'productId'));
  assert.equal(proposal.fields.find(f => f.field === 'goal')?.origin, 'inferred');
});
test('合成模型意图不能替用户选型号，错误字段/重复字段与模型服务失败不回退', async () => {
  const baseline = await createDirectorService().interpretIntent({ message: '帮我推广轻薄本', engine: 'rules' }, [evidence().product]);
  const fields = structuredClone(baseline.fields); fields.find(f => f.field === 'productId')!.value = evidence().product.id;
  let output: unknown = { summary: 'QA模拟需求响应', fields };
  const service = createDirectorService({ chat: async () => output });
  const proposal = await service.interpretIntent({ message: '帮我推广轻薄本', engine: 'model' }, [evidence().product]);
  assert.equal(proposal.suggestedBrief.productId, undefined);
  output = { summary: 'QA模拟错误', fields: fields.map(() => fields[0]) };
  await assert.rejects(service.interpretIntent({ message: '帮我推广轻薄本', engine: 'model' }, []), { code: 'INTENT_SCHEMA' });
  await assert.rejects(createDirectorService({ chat: async () => { throw new Error('QA mock denied'); } }).interpretIntent({ message: '帮我推广', engine: 'model' }, []), /QA mock denied/);
});
test('三个创意结构独立，方案绑定简报和引擎，客户端变更和篡改不起作用', async () => {
  const service = createDirectorService();
  const plan = await service.planCreative(planInput, mockKnowledge());
  assert.equal(plan.concepts.length, 3); assert.equal(new Set(plan.concepts.map(c => c.structure.join('|'))).size, 3);
  const original = structuredClone(plan.concepts[1]);
  plan.concepts[1].angle = '客户端篡改';
  const resolved = service.resolveDirectorPlan(plan.id, original.id, { ...rulesBrief, directorPlanId: plan.id, conceptId: original.id });
  assert.equal(resolved.strategy.angle, original.angle);
  assert.deepEqual(resolved.strategy.prioritizedFactIds, original.factIds);
  assert.equal(resolved.strategy.imageMin, 3);
  assert.throws(() => service.resolveDirectorPlan(plan.id, original.id, { ...rulesBrief, platform: 'poster' }), { code: 'PLAN_CHANGED' });
  assert.throws(() => service.resolveDirectorPlan(plan.id, original.id, { ...rulesBrief, generation: 'model' }), { code: 'PLAN_CHANGED' });
  assert.throws(() => service.resolveDirectorPlan(plan.id, 'unknown', rulesBrief), { code: 'CONCEPT_UNKNOWN' });
  service.validateDirectorEvidence(plan.id,evidence());
  const changed=evidence();changed.facts[0].text+='新的条件';
  assert.throws(()=>service.validateDirectorEvidence(plan.id,changed),{code:'PLAN_EVIDENCE_CHANGED'});
});
test('方案到期及有界缓存淘汰，返回对象与缓存隔离', async () => {
  let now = 1_000_000;
  const service = createDirectorService({ now: () => now, ttlMs: 1000, maxPlans: 1 });
  const one = await service.planCreative(planInput, mockKnowledge());
  const two = await service.planCreative(planInput, mockKnowledge());
  assert.throws(() => service.resolveDirectorPlan(one.id, one.concepts[0].id, rulesBrief), { code: 'PLAN_EXPIRED' });
  now += 1001;
  assert.throws(() => service.resolveDirectorPlan(two.id, two.concepts[0].id, rulesBrief), { code: 'PLAN_EXPIRED' });
});
test('策划在冲突、图片不足、混型号和取消时停止', async () => {
  const service = createDirectorService();
  for (const kind of ['conflict', 'images', 'mixed'] as const) {
    const data = evidence();
    if (kind === 'conflict') data.product.conflicts.push('QA测试冲突');
    if (kind === 'images') data.images = [];
    if (kind === 'mixed') data.facts[0].productId = 'another-model';
    await assert.rejects(service.planCreative(planInput, mockKnowledge(data)), { code: { conflict: 'SOURCE_CONFLICT', images: 'INSUFFICIENT_IMAGES', mixed: 'PLAN_SOURCE' }[kind] });
  }
  const abort = new AbortController(); abort.abort();
  await assert.rejects(service.planCreative(planInput, mockKnowledge(), abort.signal), { name: 'AbortError' });
});
test('合成模型策划拒绝虚构事实、重复创意和结构缺失', async () => {
  const rules = await createDirectorService().planCreative(planInput, mockKnowledge());
  const concepts = rules.concepts.map(({ id, ...rest }) => rest);
  let output: unknown;
  const service = createDirectorService({ chat: async () => output });
  const input = { ...planInput, engine: 'model', brief: { ...rulesBrief, generation: 'model' } };
  for (const [bad, code] of [
    [{ concepts: concepts.map(c => ({ ...c, factIds: ['invented'] })), recommendedIndex: 0, reason: 'QA' }, 'PLAN_FACT_UNKNOWN'],
    [{ concepts: concepts.map(() => concepts[0]), recommendedIndex: 0, reason: 'QA' }, 'PLAN_DUPLICATE'],
    [{ concepts: [], recommendedIndex: 0, reason: 'QA' }, 'PLAN_SCHEMA'],
  ] as const) { output = bad; await assert.rejects(service.planCreative(input, mockKnowledge()), { code }); }
});
test('真实本地编排集成：选择创意后生成并持久化选择，改需求必须重策划', async t => {
  const fixture = knowledgeFixture(); t.after(fixture.cleanup);
  const knowledge = new KnowledgeStore(fixture.root), store = new RunStore(':memory:'); t.after(() => store.close());
  const input = { ...rulesBrief, productId: knowledge.products[0].id };
  const plan = await planCreative({ ...planInput, brief: input }, knowledge);
  const selection = plan.concepts[1];
  const requested = { ...input, directorPlanId: plan.id, conceptId: selection.id };
  const deps = { knowledge, store, ima: { retrieve: async () => { throw new Error('禁止ima'); } } };
  const run = await generate(requested, deps);
  assert.equal(run.director?.conceptName, selection.name); assert.equal(run.strategy.angle, selection.angle);
  assert.equal(run.engine, 'local-composer'); assert.equal(run.audit.releaseReady, false);
  assert.deepEqual(run.article.sections.map(s => s.factIds[0]), selection.factIds.slice(0, 3));
  await assert.rejects(generate({ ...requested, audience: '新受众' }, deps), { code: 'PLAN_CHANGED' });
  assert.equal(store.list().length, 1);
});
