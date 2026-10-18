import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Product, Run } from '../shared/types';
import type { ImaAdapter } from '../server/ima';
import { brief, evidence } from './fixtures';

// Each test file runs in a separate Node process. No real API or secrets are used.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zhixu-deployment-security-'));
Object.assign(process.env, {
  DATA_DIR: directory, PUBLIC_DEPLOYMENT: 'true',
  PUBLIC_ORIGIN: 'https://qa-preview.ms.show',
  FRAME_ANCESTORS: 'https://modelscope.cn,https://www.modelscope.cn',
  ADMIN_TOKEN: 'qa-deployment-token', IMA_OPENAPI_CLIENTID: 'qa-client',
  IMA_OPENAPI_APIKEY: 'qa-ima-key', LLM_API_KEY: 'qa-llm-key',
  LLM_MODEL: 'qa-model', LLM_BASE_URL: 'https://api.siliconflow.cn/v1',
});
const { createApp } = await import('../server/app');
const { deploymentSecurity, allowsWriteOrigin } = await import('../server/config');
const { publicCatalog } = await import('../server/catalog');
const { KnowledgeStore } = await import('../server/knowledge');
const { RunStore } = await import('../server/store');
const { generate, buildStrategy, composeLocal } = await import('../server/agent');
const { auditArticle } = await import('../server/audit');
const { hasPublicOnlineLineage } = await import('../server/public-history');
const { AppError } = await import('../server/errors');

const knowledge = new KnowledgeStore(path.join(directory, 'missing-knowledge'));
// Simulate an incorrectly injected snapshot, including a colliding public ID.
knowledge.products = [{ ...publicCatalog[0], name: 'PRIVATE_SNAPSHOT_MARKER', os: 'PRIVATE_SYSTEM', factCount: 999, imageCount: 999, cover: '/api/assets/private-marker' }, evidence().product];
const retrieved: Product[] = [];
const ima = {
  async retrieve(product: Product) {
    retrieved.push(structuredClone(product));
    return { product, facts: [], images: [], warnings: ['Synthetic evidence only'], trace: [] };
  },
  async asset() { throw new Error('QA forbids real asset access'); },
  async connect() { throw new Error('QA forbids real ima access'); },
} as unknown as ImaAdapter;
const store = new RunStore(':memory:');
let server: Server;
let base = '';
before(async () => {
  const app = createApp({ knowledge, store, ima });
  assert.equal(app.get('trust proxy'), false);
  server = await new Promise<Server>(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  store.close();
  assert.equal(path.dirname(directory), fs.realpathSync(os.tmpdir()));
  assert.ok(path.basename(directory).startsWith('zhixu-deployment-security-'));
  fs.rmSync(directory, { recursive: true, force: true });
});
const headers = { 'Content-Type': 'application/json', 'X-Admin-Token': 'qa-deployment-token' };
const post = (endpoint: string, body: unknown, extra: Record<string, string> = {}) => new Promise<Response>((resolve, reject) => {
  // Native HTTP preserves explicit Host headers; fetch may silently replace them.
  const request = httpRequest(base + endpoint, { method: 'POST', headers: { ...headers, ...extra } }, response => {
    const chunks: Buffer[] = [];
    response.on('data', chunk => chunks.push(Buffer.from(chunk)));
    response.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode })));
    response.on('error', reject);
  });
  request.on('error', reject);
  request.end(JSON.stringify(body));
});

test('公开代理写入仅匹配显式HTTPS来源，不信任Host或Forwarded', async () => {
  const valid = await post('/api/audit', { text: '安全合成文字' }, { Origin: 'https://qa-preview.ms.show', Host: 'internal-container:7860', 'X-Forwarded-Host': 'attacker.example', 'X-Forwarded-Proto': 'http' });
  assert.equal(valid.status, 200, 'Public origin remains valid when proxy rewrites the internal Host');
  for (const origin of ['https://attacker.example', 'https://modelscope.cn', 'http://qa-preview.ms.show', 'https://qa-preview.ms.show:8443', 'https://qa-preview.ms.show/extra', 'https://qa-preview.ms.show.evil.example', 'null', 'https://qa-preview.ms.show https://attacker.example', 'https://qa-preview.ms.show?']) {
    const denied = await post('/api/audit', { text: '安全合成文字' }, { Origin: origin, Host: 'qa-preview.ms.show', 'X-Forwarded-Host': 'qa-preview.ms.show', 'X-Forwarded-Proto': 'https', Forwarded: 'host=qa-preview.ms.show;proto=https' });
    assert.equal(denied.status, 403, origin);
    assert.equal((await denied.json()).code, 'ORIGIN_DENIED');
  }
  assert.equal((await post('/api/audit', { text: '安全合成文字' }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await post('/api/audit', { text: '安全合成文字' })).status, 200, 'Authenticated non-browser API clients need no Origin header');
});

test('公开CSP仅允许配置的父页面，不启用跨域读写或开发连接', async () => {
  const response = await fetch(base + '/api/status', { headers: { Origin: 'https://modelscope.cn' } });
  const csp = response.headers.get('content-security-policy') || '';
  assert.match(csp, /frame-ancestors https:\/\/modelscope\.cn https:\/\/www\.modelscope\.cn(?:;|$)/);
  assert.match(csp, /connect-src 'self'(?:;|$)/);
  assert.match(csp, /script-src 'self'(?:;|$)/);
  assert.equal(response.headers.get('x-frame-options'), null, 'No contradictory legacy frame header');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
  const preflight = await fetch(base + '/api/audit', { method: 'OPTIONS', headers: { Origin: 'https://modelscope.cn', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-admin-token' } });
  assert.equal(preflight.headers.get('access-control-allow-origin'), null);
});

test('来源和嵌入配置拒绝通配/注入/路径；本地不能误启用嵌入', () => {
  assert.deepEqual(deploymentSecurity({}), { frameAncestors: ["'none'"] });
  assert.deepEqual(deploymentSecurity({ PUBLIC_DEPLOYMENT: 'true' }), { publicOrigin: undefined, frameAncestors: ["'none'"] });
  assert.equal(allowsWriteOrigin('https://qa-preview.ms.show', 'qa-preview.ms.show', 'https', deploymentSecurity({ PUBLIC_DEPLOYMENT: 'true' }), true), false);
  const env = { PUBLIC_DEPLOYMENT: 'true', PUBLIC_ORIGIN: 'https://qa-preview.ms.show' };
  for (const raw of ['*', 'https:', 'https://*.modelscope.cn', 'http://modelscope.cn', 'https://u:p@modelscope.cn', 'https://modelscope.cn/path', 'https://modelscope.cn;script-src *', "'self'", 'https://modelscope.cn,', 'https://modelscope.cn\nhttps://attacker.example']) {
    assert.throws(() => deploymentSecurity({ ...env, FRAME_ANCESTORS: raw }), /FRAME_ANCESTORS/, raw);
  }
  for (const raw of ['https://qa-preview.ms.show/path', 'https://qa-preview.ms.show#', 'http://qa-preview.ms.show', 'https://*.ms.show', 'https://qa-preview.ms.show,https://other.example']) {
    assert.throws(() => deploymentSecurity({ ...env, PUBLIC_ORIGIN: raw }), /PUBLIC_ORIGIN/, raw);
  }
  assert.throws(() => deploymentSecurity({ FRAME_ANCESTORS: 'https://modelscope.cn' }), /本地/);
  assert.throws(() => deploymentSecurity({ PUBLIC_DEPLOYMENT: 'true', FRAME_ANCESTORS: 'https://modelscope.cn' }), /PUBLIC_ORIGIN/);
  assert.deepEqual(deploymentSecurity({ ...env, FRAME_ANCESTORS: 'https://modelscope.cn, https://modelscope.cn/' }).frameAncestors, ['https://modelscope.cn']);
});

test('公开构造不扫描误挂载快照，bootstrap/检索/核验始终用公开型号', async () => {
  const notDirectory = path.join(directory, 'private-file.txt');
  fs.writeFileSync(notDirectory, 'PRIVATE_SNAPSHOT_MARKER');
  const isolated = new KnowledgeStore(notDirectory);
  assert.deepEqual(isolated.products, publicCatalog);
  assert.equal(isolated.docs.length, 0); assert.equal(isolated.assets.size, 0); assert.equal(isolated.evidence.size, 0);
  assert.equal(isolated.stats.documents, 0); assert.equal(isolated.stats.images, 0);
  assert.throws(() => isolated.search('anything'), (error: unknown) => error instanceof AppError && error.code === 'PRIVATE_SNAPSHOT');
  assert.throws(() => isolated.get(publicCatalog[0].id), (error: unknown) => error instanceof AppError && error.code === 'PRIVATE_SNAPSHOT');
  const bootstrap = await (await fetch(base + '/api/bootstrap')).json();
  assert.deepEqual(bootstrap.products, publicCatalog);
  assert.ok(!JSON.stringify(bootstrap).includes('PRIVATE_SNAPSHOT_MARKER'));
  for (const endpoint of ['/api/knowledge', '/api/knowledge/any', '/api/assets/any']) {
    assert.equal((await fetch(base + endpoint, { headers })).status, 403, endpoint);
  }
  const publicResult = await post('/api/retrieve', { productId: publicCatalog[0].id, mode: 'ima' });
  assert.equal(publicResult.status, 200);
  assert.deepEqual(retrieved.at(-1), publicCatalog[0]);
  assert.equal((await post('/api/retrieve', { productId: evidence().product.id, mode: 'ima' })).status, 422);
  assert.equal((await post('/api/audit', { text: '合成文字', productId: publicCatalog[0].id })).status, 200);
  assert.equal((await post('/api/audit', { text: '合成文字', productId: evidence().product.id })).status, 422);
});

test('公开生成不能绕过公开清单或退回本地快照，HTTP与直接调用均拒绝', async () => {
  const deps = { knowledge, store, ima };
  await assert.rejects(generate({ ...brief, productId: publicCatalog[0].id, mode: 'local' }, deps), (error: unknown) => error instanceof AppError && error.code === 'PRIVATE_SNAPSHOT');
  await assert.rejects(generate({ ...brief, productId: evidence().product.id, mode: 'ima' }, deps), (error: unknown) => error instanceof AppError && error.code === 'PRODUCT_UNKNOWN');
  await assert.rejects(generate({ ...brief, productId: publicCatalog[0].id, mode: 'ima' }, deps), (error: unknown) => error instanceof AppError && error.code === 'NO_FACTS');
  assert.deepEqual(retrieved.at(-1), publicCatalog[0]);
  const local = await post('/api/generate', { ...brief, productId: publicCatalog[0].id, mode: 'local' });
  const localStream = await local.text();
  assert.match(localStream, /"code":"PRIVATE_SNAPSHOT"/);
  assert.ok(!localStream.includes('event: result'));
  const online = await post('/api/generate', { ...brief, productId: publicCatalog[0].id, mode: 'ima' });
  const onlineStream = await online.text();
  assert.match(onlineStream, /"code":"NO_FACTS"/);
  assert.ok(!onlineStream.includes('PRIVATE_SNAPSHOT_MARKER'));
  assert.deepEqual(retrieved.at(-1), publicCatalog[0]);
  assert.equal(store.list().length, 0, 'No synthetic evidence was published or saved as a completed work');
});

test('缺少模型或非允许端点在ima检索前失败，不浪费检索额度', async () => {
  const previous = { key: process.env.LLM_API_KEY, model: process.env.LLM_MODEL, url: process.env.LLM_BASE_URL };
  const input = { ...brief, productId: publicCatalog[0].id, mode: 'ima' };
  const count = retrieved.length;
  try {
    process.env.LLM_API_KEY = '';
    await assert.rejects(generate(input, { knowledge, store, ima }), { code: 'LLM_MISSING' });
    process.env.LLM_API_KEY = 'qa-llm-key'; process.env.LLM_MODEL = '';
    const stream = await (await post('/api/generate', input)).text();
    assert.match(stream, /"code":"LLM_MISSING"/);
    process.env.LLM_MODEL = 'qa-model'; process.env.LLM_BASE_URL = 'https://attacker.example/v1';
    await assert.rejects(generate(input, { knowledge, store, ima }), { code: 'MODEL_ENDPOINT' });
    assert.equal(retrieved.length, count, 'Invalid model configuration must never call ima.retrieve');
  } finally {
    process.env.LLM_API_KEY = previous.key;
    process.env.LLM_MODEL = previous.model;
    process.env.LLM_BASE_URL = previous.url;
  }
});

test('公开历史过滤本地及混合来源，详情/导出/编辑/改写均不可绕过', async () => {
  const now = new Date().toISOString();
  const data = evidence();
  data.product = structuredClone(publicCatalog[0]);
  data.facts = data.facts.map(fact => ({ ...fact, productId: data.product.id }));
  data.images = data.images.map(image => ({ ...image, productId: data.product.id, productName: data.product.name }));
  const input = { ...brief, productId: data.product.id };
  const strategy = buildStrategy(input), article = composeLocal(input, data, strategy);
  const local: Run = { id: randomUUID(), createdAt: now, updatedAt: now, version: 1, brief: input, evidence: data, strategy, article, audit: auditArticle(article, data, input, 'local-composer'), engine: 'local-composer', durationMs: 1, trace: [] };
  const online: Run = structuredClone(local);
  online.id = randomUUID(); online.engine = 'llm'; online.brief.mode = 'ima';
  online.evidence.facts.forEach(fact => { fact.sourceMode = 'ima'; });
  for (const image of [...online.evidence.images, ...online.article.images]) { image.sourceMode = 'ima'; image.url = `/api/ima-assets/${image.id}`; }
  const mixed: Run = structuredClone(online); mixed.id = randomUUID(); mixed.evidence.facts[0].sourceMode = 'local';
  const descended: Run = structuredClone(online); descended.id = randomUUID(); descended.parentId = local.id; descended.brief.parentId = local.id;
  const orphan: Run = structuredClone(online); orphan.id = randomUUID(); orphan.parentId = randomUUID();
  const cycle: Run = structuredClone(online); cycle.id = randomUUID(); cycle.parentId = cycle.id;
  for (const run of [local, online, mixed, descended, orphan, cycle]) store.save(run);
  const visible = await (await fetch(base + '/api/runs', { headers })).json();
  assert.deepEqual(visible.map((item: { id: string }) => item.id), [online.id]);
  assert.equal((await fetch(base + `/api/runs/${online.id}`, { headers })).status, 200);
  const originalCalls = retrieved.length;
  for (const run of [local, mixed, descended, orphan, cycle]) {
    assert.equal(hasPublicOnlineLineage(run, id => store.get(id)), false);
    for (const suffix of ['', '/export?format=md&draft=true', '/export?format=json&draft=true', '/export?format=html&draft=true']) {
      const response = await fetch(base + `/api/runs/${run.id}${suffix}`, { headers });
      assert.equal(response.status, 403, `${run.id}${suffix}`);
      assert.equal((await response.json()).code, 'PRIVATE_RUN');
    }
    assert.equal((await post(`/api/runs/${run.id}/edit`, {})).status, 403);
    await assert.rejects(generate({ ...input, mode: 'ima', parentId: run.id, revision: '精简正文' }, { knowledge, store, ima }), { code: 'PRIVATE_RUN' });
  }
  assert.equal(retrieved.length, originalCalls, 'Hidden ancestors must be rejected before retrieval or model use');
  assert.equal(store.list().length, 6, 'No local history was deleted or modified');
  assert.deepEqual(store.get(local.id), JSON.parse(JSON.stringify(local)));
});
