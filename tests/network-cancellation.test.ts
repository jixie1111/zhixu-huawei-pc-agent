import test from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns/promises';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { IncomingMessage, ClientRequest } from 'node:http';
import { safeDownload } from '../server/network';

const url = 'https://fixture.cos.ap-guangzhou.myqcloud.com/file.md';
function gate<T = void>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test('下载预先取消不发请求；等待响应时取消保留原始原因并传至transport', async () => {
  const controller = new AbortController(), reason = new Error('synthetic download cancellation');
  let calls = 0, captured: AbortSignal | undefined;
  const pending = safeDownload(url, { kind: 'text', signal: controller.signal, fetch: async (_url, init) => {
    calls++; captured = init!.signal!; return new Promise<Response>(() => {});
  } });
  controller.abort(reason);
  await assert.rejects(pending, error => error === reason);
  assert.equal(captured?.aborted, true);
  assert.equal(captured?.reason, reason);
  await assert.rejects(() => safeDownload(url, { kind: 'text', signal: controller.signal, fetch: async () => { calls++; return new Response('unused'); } }), error => error === reason);
  assert.equal(calls, 1);
});

test('下载取消会停止正在等待的流读取，流的cancel钩子不完成也不阻塞退出', { timeout: 3000 }, async () => {
  const controller = new AbortController(), reason = new Error('synthetic stream cancellation'), reading = gate();
  let cancelled: unknown, sent = false;
  const body = new ReadableStream<Uint8Array>({
    pull(stream) { if (!sent) { sent = true; stream.enqueue(new TextEncoder().encode('partial')); } else reading.resolve(); },
    cancel(value) { cancelled = value; return new Promise<void>(() => {}); },
  });
  const pending = safeDownload(url, { kind: 'text', signal: controller.signal, fetch: async () => new Response(body, { headers: { 'content-type': 'text/plain' } }) });
  await reading.promise;
  controller.abort(reason);
  await assert.rejects(pending, error => error === reason);
  assert.equal(cancelled, reason);
});

test('下载总期限也会中止忽略signal的transport，不等到返回正文', { timeout: 3000 }, async t => {
  const keepAlive = setInterval(() => {}, 1000); t.after(() => clearInterval(keepAlive));
  let captured: AbortSignal | undefined;
  await assert.rejects(() => safeDownload(url, { kind: 'text', timeoutMs: 10, fetch: async (_url, init) => {
    captured = init!.signal!; return new Promise<Response>(() => {});
  } }), { code: 'IMA_DOWNLOAD_TIMEOUT' });
  assert.equal(captured?.aborted, true);
});

test('取消后迟到的fetch响应会关闭正文流，不继续后台读取', async () => {
  const controller = new AbortController(), reason = new Error('synthetic late response cancellation');
  const response = gate<Response>(), closed = gate<unknown>();
  const pending = safeDownload(url, { kind: 'text', signal: controller.signal, fetch: () => response.promise });
  controller.abort(reason);
  await assert.rejects(pending, error => error === reason);
  response.resolve(new Response(new ReadableStream({ cancel(value) { closed.resolve(value); } }), { headers: { 'content-type': 'text/plain' } }));
  assert.equal(await closed.promise, reason);
});

test('取消DNS会调用当前Resolver.cancel且不启动HTTPS连接', async t => {
  const controller = new AbortController(), reason = new Error('synthetic DNS cancellation');
  let cancelled = 0, resolutions = 0, requests = 0;
  class Resolver {
    resolve4() { resolutions++; return new Promise<string[]>(() => {}); }
    resolve6() { resolutions++; return new Promise<string[]>(() => {}); }
    cancel() { cancelled++; }
  }
  t.mock.method(dns, 'Resolver', function () { return new Resolver(); });
  t.mock.method(https, 'request', () => { requests++; throw new Error('Unexpected real network'); });
  const pending = safeDownload(url, { kind: 'text', signal: controller.signal });
  assert.equal(resolutions, 2);
  controller.abort(reason);
  await assert.rejects(pending, error => error === reason);
  assert.ok(cancelled > 0);
  assert.equal(requests, 0);
});

test('HTTPS传输取消会销毁请求和响应流，仍使用已验证DNS地址', async t => {
  const controller = new AbortController(), reason = new Error('synthetic socket cancellation'), reading = gate();
  class Resolver { async resolve4() { return ['8.8.8.8']; } async resolve6() { return []; } cancel() {} }
  t.mock.method(dns, 'Resolver', function () { return new Resolver(); });
  const body = new PassThrough() as PassThrough & IncomingMessage;
  body.statusCode = 200; body.headers = { 'content-type': 'text/plain' };
  let destroyed = false, pinned = '';
  t.mock.method(https, 'request', (_url: URL, options: https.RequestOptions, callback: (response: IncomingMessage) => void) => {
    assert.ok(options.signal);
    const lookup = options.lookup as Function;
    lookup('ignored', { all: false }, (_error: unknown, address: string) => { pinned = address; });
    const request = new EventEmitter() as EventEmitter & { end(): void; destroy(): void };
    request.destroy = () => { destroyed = true; };
    request.end = () => queueMicrotask(() => { callback(body); body.write('partial'); reading.resolve(); });
    return request as unknown as ClientRequest;
  });
  const pending = safeDownload(url, { kind: 'text', signal: controller.signal });
  await reading.promise;
  controller.abort(reason);
  await assert.rejects(pending, error => error === reason);
  assert.equal(pinned, '8.8.8.8');
  assert.equal(destroyed, true); assert.equal(body.destroyed, true);
});

test('可取消DNS仍拒绝A/AAAA中的任一私网地址', async t => {
  class Resolver { async resolve4() { return ['8.8.8.8']; } async resolve6() { return ['fc00::1']; } cancel() {} }
  t.mock.method(dns, 'Resolver', function () { return new Resolver(); });
  let requests = 0;
  t.mock.method(https, 'request', () => { requests++; throw new Error('Unexpected real network'); });
  await assert.rejects(() => safeDownload(url, { kind: 'text' }), { code: 'IMA_PRIVATE_NETWORK' });
  assert.equal(requests, 0);
});

test('可取消HTTPS路径正常结束时返回完整正文并保留地址绑定', async t => {
  class Resolver { async resolve4() { return ['8.8.8.8']; } async resolve6() { return []; } cancel() {} }
  t.mock.method(dns, 'Resolver', function () { return new Resolver(); });
  const body = new PassThrough() as PassThrough & IncomingMessage;
  body.statusCode = 200; body.headers = { 'content-type': 'text/markdown' };
  let destroyed = false;
  t.mock.method(https, 'request', (_url: URL, options: https.RequestOptions, callback: (response: IncomingMessage) => void) => {
    assert.equal(options.agent, false);
    assert.ok(options.signal);
    (options.lookup as Function)('ignored', { all: true }, (_error: unknown, answers: { address: string; family: number }[]) => assert.deepEqual(answers, [{ address: '8.8.8.8', family: 4 }]));
    const request = new EventEmitter() as EventEmitter & { end(): void; destroy(): void };
    request.destroy = () => { destroyed = true; };
    request.end = () => queueMicrotask(() => { callback(body); body.end('# complete synthetic original'); });
    return request as unknown as ClientRequest;
  });
  const result = await safeDownload(url, { kind: 'text' });
  assert.equal(result.body.toString(), '# complete synthetic original');
  assert.equal(destroyed, false);
});
