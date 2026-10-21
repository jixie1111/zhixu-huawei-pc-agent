import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoDirector, restoreDirection, composeDemoDirection, demoBriefSchema } from '../src/demo-director';
import { demoEvidence } from '../src/demo-evidence';
import type { Brief } from '../shared/types';

const brief: Brief = { productId: demoEvidence[0].product.id, audience: '大学新生', scene: 'school', platform: 'xiaohongshu', stage: '比较选型', goal: '引导到店体验', requirements: '', mode: 'local', generation: 'rules' };
const request = { message: '开学季给大学新生写小红书', engine: 'rules', brief };

test('公开导演准确识别人群和平台，泛称型号仍须用户确认', () => {
  const service = createDemoDirector(demoEvidence);
  const proposal = service.interpret({ message: '开学季，给大学新生写一篇小红书，推荐华为轻薄本', engine: 'rules' });
  assert.equal(proposal.engine, 'rules'); assert.equal(proposal.suggestedBrief.platform, 'xiaohongshu');
  assert.equal(proposal.suggestedBrief.audience, '大学新生'); assert.equal(proposal.suggestedBrief.productId, undefined);
  assert.ok(proposal.questions.some(q => q.field === 'productId'));
  assert.ok(proposal.recommendations?.every(r => demoEvidence.some(e => e.product.id === r.productId)));
  const picked = service.interpret({ message: request.message, engine: 'rules', answers: { productId: brief.productId } });
  assert.equal(picked.suggestedBrief.productId, brief.productId);
  assert.throws(() => service.interpret({ message: request.message, engine: 'rules', answers: { productId: 'private-model' } }), /公开资料/);
  assert.throws(() => service.interpret({ message: request.message, engine: 'model' }), /规则/);
  assert.throws(() => service.plan({ ...request, engine: 'model' }), /规则/);
});

test('三个规则方向形成不同稿件，并绑定同型号公开事实与图片', () => {
  const service = createDemoDirector(demoEvidence), plan = service.plan(request);
  assert.equal(plan.concepts.length, 3);
  const articles = plan.concepts.map(concept => {
    const input = { ...plan.brief, directorPlanId: plan.id, conceptId: concept.id };
    const direction = service.resolve(input);
    const { strategy, director } = restoreDirection(input, demoEvidence[0], direction);
    assert.equal(director?.conceptName, concept.name);
    assert.deepEqual(strategy.prioritizedFactIds, concept.factIds);
    const article = composeDemoDirection(input, demoEvidence[0], strategy, direction);
    assert.ok(article.images.every(i => i.productId === brief.productId && i.url.startsWith('https://consumer.huawei.com/')));
    assert.ok(article.sections.every(s => s.factIds.every(id => demoEvidence[0].facts.some(f => f.id === id))));
    return article;
  });
  assert.equal(new Set(articles.map(a => a.title)).size, 3);
  assert.equal(new Set(articles.map(a => a.lead)).size, 3);
  assert.equal(new Set(articles.map(a => JSON.stringify(a.sections))).size, 3);
});

test('公开方案拒绝跨方案引用、过期、需求篡改及证据变化', () => {
  let clock = Date.now(); const source = structuredClone(demoEvidence);
  const service = createDemoDirector(source, () => clock, 1000);
  const plan = service.plan(request), other = service.plan(request);
  const input = { ...plan.brief, directorPlanId: plan.id, conceptId: plan.concepts[0].id };
  assert.throws(() => service.resolve({ ...input, conceptId: other.concepts[0].id }), /不属于/);
  assert.throws(() => service.resolve({ ...input, audience: '商务人士' }), /改变/);
  assert.throws(() => service.resolve({ ...input, generation: 'model' }));
  plan.concepts[0].factIds.push('injected');
  assert.ok(service.resolve(input));
  source[0].facts[0].text += ' changed';
  assert.throws(() => service.resolve(input), /资料已改变/);
  clock += 1001;
  assert.throws(() => service.resolve(input), /到期/);
});

test('公开导演保持严格的模型和私有功能边界', () => {
  for (const change of [{ generation: 'model' }, { mode: 'ima' }, { voice: { persona: 'friend' } }, { autoRepair: true }, { directorPlanId: crypto.randomUUID() }, { conceptId: crypto.randomUUID() }]) {
    assert.equal(demoBriefSchema.safeParse({ ...brief, ...change }).success, false);
  }
  const service = createDemoDirector(demoEvidence);
  let oldest;
  for (let i = 0; i < 51; i++) { const plan = service.plan(request); if (!i) oldest = plan; }
  assert.throws(() => service.resolve({ ...brief, directorPlanId: oldest!.id, conceptId: oldest!.concepts[0].id }), /到期/);
});
