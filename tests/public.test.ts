import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { knowledgeFixture } from './fixtures';

// Node's test runner isolates this file in its own child process.
process.env.PUBLIC_DEPLOYMENT = 'true';
process.env.ADMIN_TOKEN = 'qa-public-token';
const { createApp } = await import('../server/app');
const { KnowledgeStore, digest } = await import('../server/knowledge');
const { RunStore } = await import('../server/store');
const fixture = knowledgeFixture(); const knowledge = new KnowledgeStore(fixture.root); const store = new RunStore(':memory:');
const privateProductId = digest(fixture.productName);
let server: Server; let base = '';
before(async () => {
  server = await new Promise<Server>(resolve => { const value = createApp({ knowledge, store }).listen(0, '127.0.0.1', () => resolve(value)); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); store.close(); fixture.cleanup(); });

test('公开预览允许状态与脱敏bootstrap，不泄漏作品记录', async () => {
  assert.equal((await fetch(base + '/api/status')).status, 200);
  const response = await fetch(base + '/api/bootstrap'); const body = await response.json();
  assert.equal(body.settings.publicDeployment, true); assert.deepEqual(body.runs, []);
  assert.ok(!JSON.stringify(body).includes('qa-public-token'));
});

test('公开模式私有读取与写入均需要令牌；授权后仍禁本地快照和网页配置', async () => {
  for (const endpoint of ['/api/runs', '/api/knowledge', `/api/products/${privateProductId}`, '/api/assets/any', '/api/ima-assets/any']) assert.equal((await fetch(base + endpoint)).status, 401, endpoint);
  assert.equal((await fetch(base + '/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '测试' }) })).status, 401);
  const headers = { 'X-Admin-Token': 'qa-public-token', 'Content-Type': 'application/json' };
  assert.equal((await fetch(base + '/api/runs', { headers })).status, 200);
  assert.equal((await fetch(base + '/api/knowledge', { headers })).status, 403);
  assert.equal((await fetch(base + `/api/products/${privateProductId}`, { headers })).status, 404, '私有合成型号不属于公开名称清单');
  const bootstrap = await (await fetch(base + '/api/bootstrap')).json();
  assert.ok(bootstrap.products.length > 0, '没有快照也提供非敏感产品名称清单');
  const publicProduct = await (await fetch(base + `/api/products/${bootstrap.products[0].id}`, { headers })).json();
  assert.deepEqual(publicProduct.facts, []); assert.deepEqual(publicProduct.images, []);
  assert.equal((await fetch(base + '/api/settings', { method: 'POST', headers, body: '{}' })).status, 403);
});

test('未知或长度相同的错误令牌不能取得授权', async () => {
  for (const token of ['x', 'qa-public-fake', 'xx-public-token']) assert.equal((await fetch(base + '/api/runs', { headers: { 'X-Admin-Token': token } })).status, 401);
});
