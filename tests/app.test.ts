import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app';
import { KnowledgeStore } from '../server/knowledge';
import { RunStore } from '../server/store';
import { ImaAdapter } from '../server/ima';
import { AppError } from '../server/errors';
import type { Bootstrap, Run } from '../shared/types';
import { brief, knowledgeFixture } from './fixtures';

const fixture = knowledgeFixture();
const knowledge = new KnowledgeStore(fixture.root);
const store = new RunStore(':memory:');
class SyntheticIma extends ImaAdapter {
  failNext = false;
  constructor() { super({ call: async () => { throw new Error('QA forbids real ima API calls'); }, credentials: () => ({ clientId: 'synthetic-only', imaKey: 'synthetic-only-key', kbName: 'Synthetic only' }) }); }
  override async retrieve(product: import('../shared/types').Product) {
    if (this.failNext) { this.failNext = false; throw new AppError('IMA_TEST_FAILURE', '合成接口失败', 502); }
    const data = knowledge.get(product.id);
    return { ...data, facts: data.facts.map(item => ({ ...item, sourceMode: 'ima' as const })), images: data.images.map(item => ({ ...item, sourceMode: 'ima' as const })), warnings: ['仅合成HTTP契约测试，不是真实在线依据'] };
  }
}
const ima = new SyntheticIma();
let server: Server; let base = '';
before(async () => {
  const app = createApp({ knowledge, store, ima });
  server = await new Promise<Server>(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); store.close(); fixture.cleanup(); });
const post = (url: string, body: unknown, headers: Record<string, string> = {}) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
function events(text: string) {
  return text.split('\n\n').filter(block => block.includes('event:')).map(block => ({
    event: block.split('\n').find(line => line.startsWith('event:'))!.slice(6).trim(),
    data: JSON.parse(block.split('\n').find(line => line.startsWith('data:'))!.slice(5).trim()),
  }));
}
async function createRun() {
  const response = await post('/api/generate', { ...brief, productId: knowledge.products[0].id });
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type')!, /text\/event-stream/);
  const output = events(await response.text());
  const result = output.find(item => item.event === 'result');
  assert.ok(result, JSON.stringify(output));
  return { run: result.data as Run, output };
}

test('bootstrap/产品/搜索/资源端点返回真实状态并隔离受控目录', async () => {
  const response = await fetch(base + '/api/bootstrap');
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(response.headers.get('content-security-policy')?.includes("object-src 'none'"));
  assert.equal(response.headers.get('x-powered-by'), null);
  const bootstrap = await response.json() as Bootstrap;
  assert.equal(bootstrap.products.length, 1); assert.equal(bootstrap.stats.images, 6);
  const details = await fetch(base + `/api/products/${knowledge.products[0].id}`);
  assert.equal(details.status, 200);
  const searched = await (await fetch(base + '/api/knowledge?q=QA-SECRET')).json();
  assert.equal(searched.total, 0);
  assert.equal((await fetch(base + '/api/products/unknown')).status, 422);
  assert.equal((await fetch(base + '/api/assets/unknown')).status, 404);
  assert.equal((await fetch(base + '/api/assets/%2E%2E%2F.env')).status, 404);
  const image = knowledge.get(knowledge.products[0].id).images[0];
  assert.equal((await fetch(base + image.url)).status, 200);
});

test('跨站写入、伪Host、非JSON、超长或错误输入被拒绝', async () => {
  assert.equal((await post('/api/audit', { text: '正常文字' }, { Origin: 'https://untrusted.example' })).status, 403);
  const hostStatus = await new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest(base + '/api/status', { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject); request.end();
  });
  assert.equal(hostStatus, 403);
  assert.equal((await fetch(base + '/api/audit', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'text' })).status, 415);
  assert.equal((await post('/api/audit', { text: '' })).status, 422);
  assert.equal((await post('/api/audit', { text: 'a'.repeat(20001) })).status, 422);
  const missing = events(await (await post('/api/generate', {})).text());
  assert.equal(missing.find(item => item.event === 'error')?.data.code, 'BRIEF_INCOMPLETE');
  assert.ok(!missing.some(item => item.event === 'result'));
});

test('生成流按阶段返回；手动编辑新版本并核验，草稿限制不能绕过', async () => {
  const { run, output } = await createRun();
  assert.deepEqual(output.filter(item => item.event === 'stage').map(item => item.data.step), [0, 1, 2, 3, 4, 5, 6]);
  const changed = await post(`/api/runs/${run.id}/edit`, {
    title: run.article.title, lead: run.article.lead,
    sections: run.article.sections.map((section, index) => index ? section : { ...section, text: '全网第一，999元，吊打竞品。' }),
    cta: run.article.cta, tags: run.article.tags,
  });
  assert.equal(changed.status, 200);
  const edited = await changed.json() as Run;
  assert.notEqual(edited.id, run.id); assert.equal(edited.parentId, run.id); assert.equal(edited.version, 2);
  assert.equal(edited.audit.status, 'blocked'); assert.equal(edited.audit.releaseReady, false);
  const original = await (await fetch(base + `/api/runs/${run.id}`)).json() as Run;
  assert.equal(original.version, 1); assert.ok(!original.article.sections[0].text.includes('999元'));
  assert.equal((await fetch(base + `/api/runs/${edited.id}/export?format=md`)).status, 409);
  assert.equal((await fetch(base + `/api/runs/${edited.id}/export?format=exe&draft=true`)).status, 400);
  const markdown = await (await fetch(base + `/api/runs/${edited.id}/export?format=md&draft=true`)).text();
  for (const label of ['未验收草稿', '一、场景判断', '二、知识库依据', '三、图文软文', '四、核验结果', '已拦截']) assert.ok(markdown.includes(label), label);
  const json = await fetch(base + `/api/runs/${edited.id}/export?format=json&draft=true`);
  assert.match(json.headers.get('content-disposition')!, /-DRAFT\.json/);
  assert.equal((await json.json()).id, edited.id);
});

test('HTML导出转义正文和属性，禁用脚本且保留审核信息', async () => {
  const { run } = await createRun();
  const changed = await post(`/api/runs/${run.id}/edit`, { title: '<script>window.__injected=true</script>', lead: '<img src=x onerror=alert(1)>', sections: run.article.sections, cta: '安全导出', tags: [] });
  const edited = await changed.json() as Run;
  const response = await fetch(base + `/api/runs/${edited.id}/export?format=html&draft=true`);
  const html = await response.text();
  assert.equal(response.status, 200); assert.ok(!html.includes('<script>window.__injected'));
  assert.ok(html.includes('&lt;script&gt;window.__injected=true&lt;/script&gt;'));
  assert.ok(!html.includes('<img src=x onerror=')); assert.ok(html.includes('default-src \'none\''));
  assert.ok(html.includes('未验收草稿')); assert.ok(html.includes('完整场景、事实依据、图片来源与核验记录'));
});

test('独立文本核验不伪称完成产品事实认证；设置数据不回传秘密', async () => {
  const audit = await (await post('/api/audit', { text: '全网第一，国补500元。', productId: knowledge.products[0].id })).json();
  assert.ok(audit.findings.some((item: { severity: string }) => item.severity === 'block'));
  assert.ok(audit.findings.some((item: { id: string; message: string }) => item.id === 'scope' && item.message.includes('未进行')));
  const settings = await post('/api/settings', { clientId: 'qa-http-client', imaKey: 'qa-http-secret', llmKey: 'qa-http-model-secret', llmModel: 'qa-fixture-model' });
  const text = await settings.text();
  for (const secret of ['qa-http-client', 'qa-http-secret', 'qa-http-model-secret']) assert.ok(!text.includes(secret));
  assert.equal((await post('/api/settings/clear', {})).status, 200);
});

test('单独在线检索端点不触发模型或保存作品，校验模式并释放失败状态', async () => {
  const count = store.list().length;
  const response = await post('/api/retrieve', { productId: knowledge.products[0].id, mode: 'ima' });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.facts.length, 3); assert.equal(data.images.length, 6);
  assert.ok(data.facts.every((item: { sourceMode: string }) => item.sourceMode === 'ima'));
  assert.equal(store.list().length, count);
  assert.equal((await post('/api/retrieve', { productId: knowledge.products[0].id, mode: 'local' })).status, 422);
  assert.equal((await post('/api/retrieve', { productId: 'unknown', mode: 'ima' })).status, 422);
  ima.failNext = true;
  assert.equal((await post('/api/retrieve', { productId: knowledge.products[0].id, mode: 'ima' })).status, 502);
  assert.equal((await post('/api/retrieve', { productId: knowledge.products[0].id, mode: 'ima' })).status, 200);
});
