import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { setImmediate as turn } from 'node:timers/promises';
import { ImaAdapter } from '../server/ima';
import { verifyImageAvailability } from '../server/image-verification';
import { buildStrategy, composeLocal } from '../server/agent';
import { auditArticle } from '../server/audit';
import { brief, evidence, syntheticPng } from './fixtures';

const credentials = { clientId: 'cancel-fixture-client', imaKey: 'cancel-fixture-key', kbName: '合成取消测试库' };
const owner = createHash('sha256').update(`${credentials.clientId}\0${credentials.imaKey}\0${credentials.kbName}`).digest('hex');
const imageId = 'b'.repeat(32);
function gate<T = void>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function directory(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zhixu-ima-cancel-'));
  t.after(() => { assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)); fs.rmSync(root, { recursive: true, force: true }); });
  return root;
}
function assets(t: TestContext, stage: 'media' | 'download') {
  const root = directory(t), index = path.join(root, 'assets.json');
  fs.writeFileSync(index, JSON.stringify({ version: 1, assets: [{ opaqueId: imageId, owner, mediaId: 'synthetic-image', createdAt: Date.now(), lastAccessedAt: Date.now() }] }));
  const release = gate(), started = gate();
  let calls = 0, downloads = 0, upstream: AbortSignal | undefined;
  const adapter = new ImaAdapter({ credentials: () => credentials, assetIndexPath: index,
    call: async (_api, _body, signal) => {
      const attempt = ++calls;
      if (attempt === 1 && stage === 'media') { upstream = signal; started.resolve(); await release.promise; }
      return { code: 0, data: { media_type: 9, url_info: { url: `https://fixture.cos.ap-guangzhou.myqcloud.com/image.png?attempt=${attempt}` } } };
    },
    fetch: async (url, init) => {
      downloads++;
      const first = new URL(url).searchParams.get('attempt') === '1';
      if (first && stage === 'download') { upstream = init?.signal || undefined; started.resolve(); await release.promise; }
      return new Response(new Uint8Array(syntheticPng), { headers: { 'content-type': 'image/png' } });
    },
  });
  return { adapter, release, started, calls: () => calls, downloads: () => downloads, upstream: () => upstream };
}

for (const stage of ['media', 'download'] as const) {
  test(`图片${stage}阶段单个等待者取消不影响其他等待者`, async t => {
    const scope = assets(t, stage), first = new AbortController(), second = new AbortController();
    const reason = new Error('synthetic one subscriber cancelled');
    const cancelled = scope.adapter.asset(imageId, first.signal);
    const rejected = assert.rejects(cancelled, error => error === reason);
    const remaining = scope.adapter.asset(imageId, second.signal);
    await scope.started.promise;
    first.abort(reason);
    await rejected;
    assert.equal(scope.upstream()?.aborted, false);
    scope.release.resolve();
    assert.deepEqual((await remaining)?.body, syntheticPng);
    assert.equal(scope.calls(), 1); assert.equal(scope.downloads(), 1);
    assert.deepEqual((await scope.adapter.asset(imageId))?.body, syntheticPng);
    assert.equal(scope.calls(), 1);
  });

  test(`图片${stage}阶段全部等待者取消会中止上游，迟到结果不缓存且可立即重试`, async t => {
    const scope = assets(t, stage), first = new AbortController(), second = new AbortController();
    const one = new Error('synthetic first cancellation'), two = new Error('synthetic last cancellation');
    const failedOne = assert.rejects(scope.adapter.asset(imageId, first.signal), error => error === one);
    const failedTwo = assert.rejects(scope.adapter.asset(imageId, second.signal), error => error === two);
    await scope.started.promise;
    first.abort(one); assert.equal(scope.upstream()?.aborted, false);
    second.abort(two); assert.equal(scope.upstream()?.aborted, true);
    assert.equal(scope.upstream()?.reason, two);
    await Promise.all([failedOne, failedTwo]);
    assert.deepEqual((await scope.adapter.asset(imageId))?.body, syntheticPng, '无需等待已放弃transport返回便可重试');
    scope.release.resolve(); await turn();
    assert.deepEqual((await scope.adapter.asset(imageId))?.body, syntheticPng);
    assert.equal(scope.calls(), 2, '取消不自动重试，后续请求独立执行一次');
    assert.equal(scope.downloads(), stage === 'media' ? 1 : 2, '取消后的旧媒体请求不能继续下载');
  });
}

test('预先取消的检索和图片读取不会发出任何API请求', async () => {
  let calls = 0;
  const adapter = new ImaAdapter({ credentials: () => credentials, call: async () => { calls++; throw new Error('Unexpected API'); } });
  const controller = new AbortController(), reason = new Error('synthetic pre-cancel'); controller.abort(reason);
  await assert.rejects(() => adapter.retrieve(evidence().product, undefined, controller.signal), error => error === reason);
  await assert.rejects(() => adapter.asset(imageId, controller.signal), error => error === reason);
  assert.equal(calls, 0);
});

test('检索取消透传到API且不会继续目录链或持久化索引', async t => {
  const index = path.join(directory(t), 'assets.json'), release = gate();
  const controller = new AbortController(), reason = new Error('synthetic retrieval cancellation');
  let calls = 0, upstream: AbortSignal | undefined;
  const adapter = new ImaAdapter({ credentials: () => credentials, assetIndexPath: index, call: async (_api, _body, signal) => {
    calls++; upstream = signal; await release.promise;
    return { code: 0, data: { info_list: [{ kb_id: 'synthetic-kb', kb_name: credentials.kbName }], is_end: true } };
  } });
  const pending = adapter.retrieve(evidence().product, undefined, controller.signal);
  controller.abort(reason);
  await assert.rejects(pending, error => error === reason);
  assert.equal(upstream?.aborted, true); assert.equal(upstream?.reason, reason);
  release.resolve(); await turn();
  assert.equal(calls, 1); assert.equal(fs.existsSync(index), false);
});

test('检索两分钟总期限中止API且不继续执行', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_800_000_000_000 });
  let calls = 0, upstream: AbortSignal | undefined;
  const adapter = new ImaAdapter({ credentials: () => credentials, call: async (_api, _body, signal) => { calls++; upstream = signal; return new Promise(() => {}); } });
  const pending = adapter.retrieve(evidence().product);
  t.mock.timers.tick(120_000);
  await assert.rejects(pending, { code: 'IMA_TIMEOUT' });
  assert.equal(upstream?.aborted, true); assert.equal(calls, 1);
});

test('取消旧连接不清空另一并发连接已经确认的知识库', async () => {
  const release = gate(), controller = new AbortController(), reason = new Error('synthetic old connection cancelled');
  let searches = 0;
  const adapter = new ImaAdapter({ credentials: () => credentials, call: async api => {
    if (api.endsWith('search_knowledge_base')) {
      searches++;
      if (searches === 1) await release.promise;
      return { code: 0, data: { info_list: [{ kb_id: 'synthetic-kb', kb_name: credentials.kbName }], is_end: true } };
    }
    if (api.endsWith('get_knowledge_base')) return { code: 0, data: { infos: { 'synthetic-kb': { name: credentials.kbName } } } };
    return { code: 1, msg: 'Synthetic stop after established connection', data: {} };
  } });
  const cancelled = assert.rejects(adapter.connect(controller.signal), error => error === reason);
  assert.equal((await adapter.connect()).connected, true);
  controller.abort(reason); await cancelled;
  release.resolve(); await turn();
  await assert.rejects(() => adapter.retrieve(evidence().product), { code: 'IMA_API' });
  assert.equal(searches, 2, '后续检索应沿用已成功的连接，不因旧操作取消而重复连接');
});

test('原文流读取取消阻止后续资料读取及索引保存', async t => {
  const index = path.join(directory(t), 'assets.json'), reading = gate();
  const controller = new AbortController(), reason = new Error('synthetic original cancellation');
  const product = evidence().product;
  let mediaCalls = 0, cancelled: unknown;
  const adapter = new ImaAdapter({ credentials: () => credentials, assetIndexPath: index,
    call: async (api, body) => {
      if (api.endsWith('search_knowledge_base')) return { code: 0, data: { info_list: [{ kb_id: 'fixture-kb', kb_name: credentials.kbName }], is_end: true } };
      if (api.endsWith('get_knowledge_base')) return { code: 0, data: { infos: { 'fixture-kb': { name: credentials.kbName } } } };
      if (api.endsWith('search_knowledge')) return { code: 0, data: { info_list: [], is_end: true } };
      if (api.endsWith('get_media_info')) { mediaCalls++; return { code: 0, data: { media_type: 7, url_info: { url: 'https://fixture.cos.ap-guangzhou.myqcloud.com/facts.md' } } }; }
      if (api.endsWith('get_knowledge_list')) {
        const tree: Record<string, object[]> = {
          root: [{ media_id: 'p1', title: 'P1-产品参数', is_folder: true }],
          p1: [{ media_id: 'model', title: product.name, is_folder: true }],
          model: [{ media_id: 'facts', title: '产品事实.md' }, { media_id: 'index', title: '图片索引.csv' }],
        };
        return { code: 0, data: { knowledge_list: tree[String(body.folder_id || 'root')], is_end: true } };
      }
      throw new Error('Unexpected synthetic API');
    },
    fetch: async () => new Response(new ReadableStream<Uint8Array>({ pull() { reading.resolve(); }, cancel(value) { cancelled = value; } }, { highWaterMark: 0 }), { headers: { 'content-type': 'text/markdown' } }),
  });
  const pending = adapter.retrieve(product, undefined, controller.signal);
  await reading.promise;
  controller.abort(reason);
  await assert.rejects(pending, error => error === reason);
  assert.equal(cancelled, reason); assert.equal(mediaCalls, 1); assert.equal(fs.existsSync(index), false);
});

test('图片核验传递取消信号，取消不会标记缺图或继续读取下一张', async () => {
  const data = evidence(), article = composeLocal(brief, data, buildStrategy(brief));
  const audit = auditArticle(article, data, brief, 'local-composer'), before = structuredClone(audit);
  const controller = new AbortController(), reason = new Error('synthetic image verification cancellation'), started = gate();
  let calls = 0;
  const pending = verifyImageAvailability(article, audit, { asset: async (_id, signal) => {
    calls++; assert.equal(signal, controller.signal); started.resolve();
    return new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(signal!.reason), { once: true }));
  } }, controller.signal);
  await started.promise; controller.abort(reason);
  await assert.rejects(pending, error => error === reason);
  assert.equal(calls, 1); assert.deepEqual(audit, before);
});
