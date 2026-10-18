import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ImaAdapter, type ImaCredentials } from '../server/ima';
import { syntheticPng } from './fixtures';

const identity: ImaCredentials = { clientId: 'concurrency-fixture-client', imaKey: 'concurrency-fixture-key', kbName: '合成并发测试库' };
const fingerprint = (value: ImaCredentials) => createHash('sha256').update(`${value.clientId}\0${value.imaKey}\0${value.kbName}`).digest('hex');
const idFor = (index: number) => index.toString(16).padStart(32, '0');
const record = (index: number, credentials = identity, mediaId = `synthetic-picture-${index}`) => ({
  opaqueId: idFor(index), owner: fingerprint(credentials), mediaId, createdAt: Date.now(), lastAccessedAt: Date.now(),
});

function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

type Request = { owner: string; mediaId: string; attempt: number };
function fixture(t: TestContext, options: {
  records?: ReturnType<typeof record>[];
  beforeMedia?: (request: Request) => void | Promise<void>;
  beforeDownload?: (request: Request) => void | Promise<void>;
} = {}) {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('合成测试禁止真实网络'); });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zhixu-ima-concurrency-'));
  const file = path.join(root, 'assets.json');
  t.after(() => {
    const target = path.resolve(root);
    assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('zhixu-ima-concurrency-'));
    fs.rmSync(target, { recursive: true, force: true });
  });
  fs.writeFileSync(file, JSON.stringify({ version: 1, assets: options.records || [record(1)] }), { mode: 0o600 });
  let current = { ...identity };
  const calls: Request[] = [], downloads: Request[] = [];
  const adapter = new ImaAdapter({
    assetIndexPath: file,
    credentials: () => current,
    call: async (api, body) => {
      assert.equal(api, 'openapi/wiki/v1/get_media_info');
      const request = { owner: fingerprint(current), mediaId: String(body.media_id), attempt: calls.length + 1 };
      calls.push(request);
      await options.beforeMedia?.(request);
      return { code: 0, data: { media_type: 9, url_info: { url: `https://fixture.cos.ap-guangzhou.myqcloud.com/picture.png?attempt=${request.attempt}` } } };
    },
    fetch: async url => {
      const request = calls[Number(new URL(url).searchParams.get('attempt')) - 1];
      assert.ok(request);
      downloads.push(request);
      await options.beforeDownload?.(request);
      return new Response(new Uint8Array(syntheticPng), { headers: { 'content-type': 'image/png' } });
    },
  });
  return { adapter, calls, downloads, setCredentials: (next: ImaCredentials) => { current = { ...next }; } };
}

test('同图在取链接和下载阶段的并发调用只读取一次，每位调用者拿到独立Buffer', { timeout: 10_000 }, async t => {
  const media = gate(), download = gate(), startedDownload = gate();
  t.after(() => { media.release(); download.release(); });
  const scope = fixture(t, {
    beforeMedia: () => media.promise,
    beforeDownload: () => { startedDownload.release(); return download.promise; },
  });
  const firstWave = Array.from({ length: 4 }, () => scope.adapter.asset(idFor(1)));
  const mediaCallsWhileHeld = scope.calls.length;
  media.release();
  await startedDownload.promise;
  const secondWave = Array.from({ length: 3 }, () => scope.adapter.asset(idFor(1)));
  download.release();
  const results = await Promise.all([...firstWave, ...secondWave]);
  assert.equal(mediaCallsWhileHeld, 1);
  assert.equal(scope.calls.length, 1);
  assert.equal(scope.downloads.length, 1);
  for (const image of results) { assert.ok(image); assert.deepEqual(image.body, syntheticPng); }
  results[0]!.body.fill(0);
  for (const image of results.slice(1)) assert.deepEqual(image!.body, syntheticPng);
  assert.deepEqual((await scope.adapter.asset(idFor(1)))?.body, syntheticPng, '调用方修改不得污染共享响应或缓存');
  assert.equal(scope.calls.length, 1);
});

test('不同图片ID的并发读取不被合并', { timeout: 10_000 }, async t => {
  const media = gate();
  t.after(() => media.release());
  const scope = fixture(t, { records: [record(1), record(2)], beforeMedia: () => media.promise });
  const pending = [scope.adapter.asset(idFor(1)), scope.adapter.asset(idFor(2))];
  const mediaCallsWhileHeld = scope.calls.length;
  media.release();
  const results = await Promise.all(pending);
  assert.ok(results.every(Boolean));
  assert.equal(mediaCallsWhileHeld, 2);
  assert.equal(scope.downloads.length, 2);
  assert.deepEqual(new Set(scope.calls.map(item => item.mediaId)), new Set(['synthetic-picture-1', 'synthetic-picture-2']));
});

for (const failureStage of ['media', 'download'] as const) {
  test(`同图并发${failureStage === 'media' ? '取链接' : '下载'}失败后移除进行中的请求，后续可重新读取`, { timeout: 10_000 }, async t => {
    const failedRequest = gate(), started = gate();
    t.after(() => failedRequest.release());
    let fail = true;
    const hook = async () => { if (fail) { started.release(); await failedRequest.promise; throw new Error('合成临时错误'); } };
    const scope = fixture(t, failureStage === 'media' ? { beforeMedia: hook } : { beforeDownload: hook });
    const pending = Promise.allSettled([scope.adapter.asset(idFor(1)), scope.adapter.asset(idFor(1)), scope.adapter.asset(idFor(1))]);
    await started.promise;
    failedRequest.release();
    const results = await pending;
    assert.ok(results.every(item => item.status === 'rejected'));
    for (const result of results) if (result.status === 'rejected') assert.equal(result.reason.code, failureStage === 'media' ? 'IMA_API' : 'IMA_DOWNLOAD_FAILED');
    assert.equal(scope.calls.length, 1, '同一失败也应由等待者共享，不应重试扩大调用数');
    assert.equal(scope.downloads.length, failureStage === 'media' ? 0 : 1);
    fail = false;
    assert.deepEqual((await scope.adapter.asset(idFor(1)))?.body, syntheticPng);
    assert.equal(scope.calls.length, 2, '失败的Promise不能永久留在进行中索引');
    assert.equal(scope.downloads.length, failureStage === 'media' ? 1 : 2);
  });
}

for (const changedDuring of ['media', 'download'] as const) {
  test(`同图并发${changedDuring === 'media' ? '取链接' : '下载'}期间更换账号/密钥/知识库不会跨作用域返回或缓存`, { timeout: 10_000 }, async t => {
    for (const changedField of ['clientId', 'imaKey', 'kbName'] as const) {
      const next = { ...identity, [changedField]: `changed-${changedField}-fixture` };
      const originalOwner = fingerprint(identity), holdOriginal = gate(), started = gate();
      t.after(() => holdOriginal.release());
      let hold = true;
      const hook = async (request: Request) => { if (hold && request.owner === originalOwner) { started.release(); await holdOriginal.promise; } };
      const scope = fixture(t, {
        records: [record(1, identity, 'shared-media-fixture'), record(2, next, 'shared-media-fixture')],
        ...(changedDuring === 'media' ? { beforeMedia: hook } : { beforeDownload: hook }),
      });
      const original = Promise.all([scope.adapter.asset(idFor(1)), scope.adapter.asset(idFor(1))]);
      await started.promise;
      scope.setCredentials(next);
      assert.equal(await scope.adapter.asset(idFor(1)), undefined, '新凭据不能加入旧作用域的等待队列');
      assert.deepEqual((await scope.adapter.asset(idFor(2)))?.body, syntheticPng, '同媒体ID的新作用域需独立读取');
      assert.equal(scope.calls.filter(item => item.owner === fingerprint(next)).length, 1);
      holdOriginal.release();
      assert.deepEqual(await original, [undefined, undefined], '旧作用域的全部等待者必须丢弃响应');
      assert.equal(scope.downloads.filter(item => item.owner === originalOwner).length, changedDuring === 'media' ? 0 : 1);
      hold = false;
      scope.setCredentials(identity);
      assert.deepEqual((await scope.adapter.asset(idFor(1)))?.body, syntheticPng);
      assert.equal(scope.calls.filter(item => item.owner === originalOwner).length, 2, '被丢弃响应不能进入旧作用域缓存');
      assert.equal(await scope.adapter.asset(idFor(2)), undefined, '新作用域缓存不能被旧凭据读取');
    }
  });
}

test('并发合并不延长图片缓存的60秒期限', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  const scope = fixture(t);
  assert.ok(await scope.adapter.asset(idFor(1)));
  t.mock.timers.tick(59_999);
  assert.ok(await scope.adapter.asset(idFor(1)));
  assert.equal(scope.calls.length, 1);
  t.mock.timers.tick(1);
  const results = await Promise.all([scope.adapter.asset(idFor(1)), scope.adapter.asset(idFor(1))]);
  assert.ok(results.every(Boolean));
  assert.equal(scope.calls.length, 2, '缓存到期后须重新读取，进行中的请求只合并当前读取');
  assert.equal(scope.downloads.length, 2);
});
