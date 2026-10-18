import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeFixture } from './fixtures';
import { KnowledgeStore } from '../server/knowledge';
import { RunStore } from '../server/store';
import { generate, composeLocal, buildStrategy } from '../server/agent';
import { auditArticle } from '../server/audit';
import { toHtml, toMarkdown } from '../server/export';
import type { Brief } from '../shared/types';

function fixture() {
  const files = knowledgeFixture();
  const knowledge = new KnowledgeStore(files.root), store = new RunStore(':memory:');
  const product = knowledge.products[0];
  const brief: Brief = { productId: product.id, mode: 'local', generation: 'model', audience: '合成测试受众', scene: 'school', platform: 'xiaohongshu', stage: '比较选型', goal: '理解适用边界', requirements: '' };
  const data = knowledge.get(product.id);
  const article = composeLocal(brief, data, buildStrategy(brief));
  article.disclaimer = '具体配置与适用条件需结合原始资料核实。';
  const output = { ...article, images: article.images.map(({ id, position, reason }) => ({ id, position, reason })) };
  let imaCalls = 0;
  const ima = { async retrieve() { imaCalls++; throw new Error('Local model must not call ima'); }, async asset() { imaCalls++; throw new Error('Local image must not call ima'); } };
  return { files, knowledge, store, brief, data, article, output, ima, calls: () => imaCalls, cleanup: () => { store.close(); files.cleanup(); } };
}
const response = (data: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(data) } }] }), { headers: { 'Content-Type': 'application/json' } });
function modelEnvironment(t: TestContext) {
  const names = ['LLM_API_KEY', 'LLM_MODEL', 'LLM_BASE_URL', 'IMA_OPENAPI_CLIENTID', 'IMA_OPENAPI_APIKEY'];
  const previous = names.map(name => process.env[name]);
  Object.assign(process.env, { LLM_API_KEY: 'synthetic-local-model-only', LLM_MODEL: 'synthetic-model', LLM_BASE_URL: 'https://api.siliconflow.cn/v1', IMA_OPENAPI_CLIENTID: '', IMA_OPENAPI_APIKEY: '' });
  t.after(() => names.forEach((name, index) => { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index]; }));
}

test('本地知识库模型生成与独立核验均真实走模型接口合约，完全不调用ima', async t => {
  modelEnvironment(t); const f = fixture(); t.after(f.cleanup);
  const requests: Record<string, any>[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://api.siliconflow.cn/v1/chat/completions');
    const body = JSON.parse(String(init.body)); requests.push(body);
    return response(requests.length % 2 ? f.output : { supported: true, issues: [] });
  });
  const run = await generate(f.brief, f);
  assert.equal(requests.length, 2); assert.equal(f.calls(), 0);
  assert.equal(run.engine, 'llm'); assert.equal(run.model, 'synthetic-model'); assert.equal(run.brief.mode, 'local');
  assert.equal(run.audit.releaseReady, true); assert.equal(run.audit.status, 'passed');
  assert(run.evidence.facts.every(fact => fact.sourceMode === 'local'));
  assert(run.article.images.every(image => image.sourceMode === 'local' && image.url.startsWith('/api/assets/')));
  const promptInput = JSON.parse(requests[0].messages[1].content);
  assert.equal(promptInput.brief.generation, 'model'); assert(!JSON.stringify(promptInput).includes('sourcePath'));
  const html = toHtml(run); assert(html.includes('本地知识库。 模型生成。')); assert(!html.includes('本地规则编排。'));
  assert(toMarkdown(run).includes('来源：本地 ZIP 快照｜引擎：synthetic-model'));
});

test('本地模型支持自定义语气改写且保留父版本，不降级为固定规则', async t => {
  modelEnvironment(t); const f = fixture(); t.after(f.cleanup);
  let calls = 0; let revisedInput: any;
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    calls++;
    if (calls === 3) revisedInput = JSON.parse(JSON.parse(String(init.body)).messages[1].content);
    return response(calls % 2 ? { ...f.output, title: calls === 3 ? '调整语气后的合成测试标题' : f.output.title } : { supported: true, issues: [] });
  });
  const original = await generate(f.brief, f);
  const revised = await generate({ ...f.brief, parentId: original.id, revision: '让语气更亲切，保留配置限制' }, f);
  assert.equal(revised.version, 2); assert.equal(revised.parentId, original.id); assert.equal(revised.engine, 'llm');
  assert.equal(revised.article.title, '调整语气后的合成测试标题');
  assert.equal(revisedInput.previous.article.title, original.article.title); assert.equal(f.calls(), 0);
  assert.equal(f.store.get(original.id)?.version, 1);
});

test('本地模型缺配置明确报错，规则预览仍可显式使用且不能标成模型通过', async t => {
  modelEnvironment(t); process.env.LLM_API_KEY = '';
  const f = fixture(); t.after(f.cleanup);
  let requests = 0; t.mock.method(globalThis, 'fetch', async () => { requests++; throw new Error('No network expected'); });
  await assert.rejects(generate(f.brief, f), { code: 'LLM_MISSING' });
  assert.equal(f.store.list().length, 0);
  const preview = await generate({ ...f.brief, generation: 'rules' }, f);
  assert.equal(preview.engine, 'local-composer'); assert.equal(preview.audit.releaseReady, false);
  assert.equal(requests, 0); assert.equal(f.calls(), 0);
});

test('本地模型原图缺失或来源混用时不能通过独立核验，不回退到ima', async t => {
  modelEnvironment(t); const f = fixture(); t.after(f.cleanup);
  let calls = 0; t.mock.method(globalThis, 'fetch', async () => response(++calls % 2 ? f.output : { supported: true, issues: [] }));
  f.knowledge.assets.delete(f.article.images[0].id);
  const run = await generate(f.brief, f);
  assert.equal(run.audit.releaseReady, false); assert.equal(run.audit.status, 'blocked'); assert.equal(f.calls(), 0);
  assert(run.audit.findings.some(finding => finding.id.startsWith('image-unavailable-')));
  f.data.facts[0].sourceMode = 'ima';
  assert(auditArticle(f.article, f.data, f.brief, 'llm').findings.some(finding => finding.id.startsWith('fact-origin-') && finding.severity === 'block'));
});
