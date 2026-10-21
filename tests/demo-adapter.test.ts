import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { demoGenerate, demoExport } from '../src/demo-adapter';
import { demoEvidence } from '../src/demo-evidence';
import type { Brief } from '../shared/types';

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const values = new Map<string, string>();
before(() => Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
} }));
after(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});
const brief: Brief = {
  productId: demoEvidence[0].product.id, audience: '准备开学的大学新生', scene: 'school',
  platform: 'xiaohongshu', stage: '了解产品', goal: '引导到店体验', requirements: '', mode: 'local', generation: 'rules',
};
const generate = (value: Brief) => demoGenerate(value, () => {}, new AbortController().signal);

test('公开规则编辑器清空模型字段后，精简与平台转换仍保留版本链', async () => {
  const initial = await generate(brief);
  const shorter = await generate({ ...initial.brief, directorPlanId: undefined, conceptId: undefined, parentId: initial.id, revision: '精简正文' });
  assert.equal(shorter.parentId, initial.id);
  assert.equal(shorter.version, 2);
  assert.ok(shorter.article.sections.length < initial.article.sections.length);
  const poster = await generate({ ...shorter.brief, directorPlanId: undefined, conceptId: undefined, parentId: shorter.id, platform: 'poster', revision: '保持产品与场景，将内容改写为门店海报版本。' });
  assert.equal(poster.parentId, shorter.id);
  assert.equal(poster.version, 3);
  assert.equal(poster.article.images.length, 1);
  assert.equal(poster.engine, 'local-composer');
  assert.equal(poster.audit.releaseReady, false);
  const exported = JSON.parse(await (await demoExport(poster.id, 'json')).text());
  assert.equal(exported.demo, true);
  assert.ok(!Object.hasOwn(exported.brief, 'directorPlanId'));
  assert.ok(!Object.hasOwn(exported.brief, 'conceptId'));
});

test('公开规则入口仍拒绝模型模式和非空模型专用字段', async () => {
  for (const input of [{ ...brief, generation: 'model' as const }, { ...brief, directorPlanId: 'not-a-demo-plan' }, { ...brief, conceptId: 'not-a-demo-concept' }]) {
    await assert.rejects(() => generate(input), /公开演示仅支持本地规则创作/);
  }
});
