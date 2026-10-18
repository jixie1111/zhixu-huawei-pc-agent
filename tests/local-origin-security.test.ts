import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ImaAdapter } from '../server/ima';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zhixu-local-origin-'));
Object.assign(process.env, { DATA_DIR: directory, PUBLIC_DEPLOYMENT: 'false', PUBLIC_ORIGIN: '', FRAME_ANCESTORS: '', IMA_OPENAPI_CLIENTID: 'qa-client', IMA_OPENAPI_APIKEY: 'qa-secret' });
const { createApp } = await import('../server/app');
const { KnowledgeStore } = await import('../server/knowledge');
const { RunStore } = await import('../server/store');
const { allowsWriteOrigin, deploymentSecurity } = await import('../server/config');
const store = new RunStore(':memory:');
const knowledge = new KnowledgeStore(path.join(directory, 'no-knowledge'));
let server: Server;
let base = '';
before(async () => {
  const ima = { async connect() { throw new Error('No real network'); }, async retrieve() { throw new Error('No real network'); } } as unknown as ImaAdapter;
  server = await new Promise<Server>(resolve => { const instance = createApp({ knowledge, store, ima }).listen(0, '127.0.0.1', () => resolve(instance)); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  store.close();
  assert.equal(path.dirname(directory), fs.realpathSync(os.tmpdir()));
  assert.ok(path.basename(directory).startsWith('zhixu-local-origin-'));
  fs.rmSync(directory, { recursive: true, force: true });
});
const post = (extra: Record<string, string>) => fetch(base + '/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify({ text: '合成安全文字' }) });

test('本地默认禁止所有嵌入，并要求写入协议、主机和端口完全同源', async () => {
  const status = await fetch(base + '/api/status');
  assert.match(status.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
  assert.equal(status.headers.get('x-frame-options'), 'DENY');
  assert.equal((await post({ Origin: base })).status, 200);
  assert.equal((await post({ Origin: base.replace('http:', 'https:') })).status, 403);
  assert.equal((await post({ Origin: 'http://127.0.0.1:1' })).status, 403);
  assert.equal((await post({ Origin: 'null' })).status, 403);
  assert.equal((await post({ Origin: 'https://attacker.example', 'X-Forwarded-Host': 'attacker.example', 'X-Forwarded-Proto': 'https' })).status, 403);
  const forgedHostStatus = await new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest(base + '/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, Host: 'attacker.example', 'X-Forwarded-Host': new URL(base).host } }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject); request.end(JSON.stringify({ text: '合成文字' }));
  });
  assert.equal(forgedHostStatus, 403);
  const policy = deploymentSecurity({});
  assert.equal(allowsWriteOrigin('http://[::1]:3000', '[::1]:3000', 'http', policy, false), true);
  assert.equal(allowsWriteOrigin('http://localhost:3000', 'localhost:3000', 'http', policy, false), true);
  assert.equal(allowsWriteOrigin('http://localhost:3001', 'localhost:3000', 'http', policy, false), false);
});

test('本地搜索返回完整分类清单，不受搜索词、当前分类或分页影响', () => {
  const local = new KnowledgeStore(path.join(directory, 'empty-local-fixture'));
  local.docs = [
    { id: 'one', title: 'alpha', text: 'alpha', path: 'one', category: 'P1-产品' },
    { id: 'two', title: 'beta', text: 'beta', path: 'two', category: 'P2-场景' },
    { id: 'three', title: 'gamma', text: 'gamma', path: 'three', category: 'P1-产品' },
  ];
  const result = local.search('alpha', 'P1-产品', 2);
  assert.equal(result.total, 1); assert.deepEqual(result.items, []);
  assert.deepEqual(result.categories, ['P1-产品', 'P2-场景']);
});
