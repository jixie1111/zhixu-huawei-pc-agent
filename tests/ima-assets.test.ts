import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ImaAdapter, type ImaCredentials } from '../server/ima';
import { syntheticPng } from './fixtures';

const identity: ImaCredentials = { clientId: 'asset-fixture-client', imaKey: 'asset-fixture-key', kbName: '合成资产测试库' };
const owner = createHash('sha256').update(`${identity.clientId}\0${identity.imaKey}\0${identity.kbName}`).digest('hex');
const oldTime = Date.now() - 2 * 24 * 60 * 60 * 1000;
const idFor = (index: number) => index.toString(16).padStart(32, '0');
const mediaRecord = (index: number) => ({ opaqueId: idFor(index), owner, mediaId: `synthetic-asset-${index}`, createdAt: oldTime, lastAccessedAt: oldTime });

function registry(t: TestContext, records: unknown[] = [mediaRecord(1)]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zhixu-ima-assets-'));
  const file = path.join(root, 'assets.json');
  t.after(() => {
    const target = path.resolve(root), allowed = path.resolve(os.tmpdir()) + path.sep;
    assert.ok(target.startsWith(allowed) && path.basename(target).startsWith('zhixu-ima-assets-'));
    fs.rmSync(target, { recursive: true, force: true });
  });
  fs.writeFileSync(file, JSON.stringify({ version: 1, assets: records }), { mode: 0o600 });
  return { root, file };
}

function fixture(file: string, hooks: { duringCall?: () => void; duringFetch?: () => void } = {}) {
  let current = { ...identity };
  let calls = 0, downloads = 0;
  const adapter = new ImaAdapter({
    assetIndexPath: file,
    credentials: () => current,
    call: async (api, body) => {
      calls++;
      assert.equal(api, 'openapi/wiki/v1/get_media_info');
      assert.match(String(body.media_id), /^synthetic-asset-/);
      hooks.duringCall?.();
      return { code: 0, data: { media_type: 9, url_info: { url: `https://fixture.cos.ap-guangzhou.myqcloud.com/picture.png?signature=fresh-${calls}`, headers: { Authorization: 'Bearer short-lived-scoped-token' } } } };
    },
    fetch: async (_url, init) => {
      downloads++;
      assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer short-lived-scoped-token');
      hooks.duringFetch?.();
      return new Response(new Uint8Array(syntheticPng), { headers: { 'content-type': 'image/png' } });
    },
  });
  return { adapter, calls: () => calls, downloads: () => downloads, setOwner: (next: ImaCredentials) => { current = next; } };
}

test('旧图片引用跨重启可恢复且更新访问时间，不持久化签名或访问头', async t => {
  const { root, file } = registry(t);
  const first = fixture(file);
  assert.equal((await first.adapter.asset(idFor(1)))?.type, 'image/png');
  const raw = fs.readFileSync(file, 'utf8');
  for (const secret of [identity.clientId, identity.imaKey, 'signature', 'Authorization', 'short-lived-scoped-token', 'myqcloud.com']) assert.ok(!raw.includes(secret));
  assert.deepEqual(fs.readdirSync(root), ['assets.json'], '原子写入不能遗留临时副本');
  assert.ok(JSON.parse(raw).assets[0].lastAccessedAt > oldTime);
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const restored = fixture(file);
  assert.deepEqual((await restored.adapter.asset(idFor(1)))?.body, syntheticPng);
  assert.equal(restored.calls(), 1, '重启后应重新获取短时访问链接');
});

test('内存图片缓存不能被调用方修改，且账号或密钥变更立即拒绝缓存命中', async t => {
  const { file } = registry(t);
  const scope = fixture(file);
  const first = await scope.adapter.asset(idFor(1)); assert.ok(first);
  first.body.fill(0);
  const second = await scope.adapter.asset(idFor(1)); assert.ok(second);
  assert.deepEqual(second.body, syntheticPng);
  second.body.fill(0);
  assert.deepEqual((await scope.adapter.asset(idFor(1)))?.body, syntheticPng);
  assert.equal(scope.downloads(), 1);
  scope.setOwner({ ...identity, imaKey: 'rotated-key' });
  assert.equal(await scope.adapter.asset(idFor(1)), undefined);
  assert.equal(scope.downloads(), 1);
  scope.setOwner({ ...identity, clientId: 'different-account' });
  assert.equal(await scope.adapter.asset(idFor(1)), undefined);
});

test('资产读取途中切换账户会丢弃内容；不会把错误账户结果写入缓存', async t => {
  const { file } = registry(t);
  let scope: ReturnType<typeof fixture>;
  let shouldSwitch = true;
  scope = fixture(file, { duringFetch: () => { if (shouldSwitch) scope.setOwner({ ...identity, clientId: 'account-changed-in-flight' }); } });
  assert.equal(await scope.adapter.asset(idFor(1)), undefined);
  shouldSwitch = false; scope.setOwner(identity);
  assert.deepEqual((await scope.adapter.asset(idFor(1)))?.body, syntheticPng);
  assert.equal(scope.downloads(), 2, '上次被丢弃的响应不能进入缓存');
  let other: ReturnType<typeof fixture>;
  other = fixture(file, { duringCall: () => other.setOwner({ ...identity, clientId: 'account-changed-before-download' }) });
  assert.equal(await other.adapter.asset(idFor(1)), undefined);
  assert.equal(other.downloads(), 0, '原文链接返回时账号已变，不能继续下载');
});

test('缓存条目有界，超过64项时旧图片会重新核验取回', async t => {
  const { file } = registry(t, Array.from({ length: 65 }, (_, i) => mediaRecord(i + 1)));
  const scope = fixture(file);
  for (let i = 1; i <= 65; i++) assert.ok(await scope.adapter.asset(idFor(i)));
  assert.equal(scope.downloads(), 65);
  assert.ok(await scope.adapter.asset(idFor(65))); assert.equal(scope.downloads(), 65);
  assert.ok(await scope.adapter.asset(idFor(1))); assert.equal(scope.downloads(), 66);
});

test('损坏、重复标识、超限及携带签名的索引会被拒绝且原文件不被覆盖', t => {
  const { file } = registry(t);
  const invalid = [
    'not json',
    JSON.stringify({ version: 1, assets: [mediaRecord(1), mediaRecord(1)] }),
    JSON.stringify({ version: 1, assets: Array.from({ length: 2001 }, (_, i) => mediaRecord(i + 1)) }),
    JSON.stringify({ version: 1, assets: [{ ...mediaRecord(1), Authorization: 'unexpected-secret' }] }),
    JSON.stringify({ version: 1, assets: [{ ...mediaRecord(1), mediaId: undefined, urlReference: 'https://consumer.huawei.com/a.png?signature=do-not-save' }] }),
    JSON.stringify({ version: 1, assets: [{ ...mediaRecord(1), mediaId: undefined, urlReference: 'https://fixture.cos.ap-guangzhou.myqcloud.com/a.png' }] }),
  ];
  for (const raw of invalid) {
    fs.writeFileSync(file, raw);
    assert.throws(() => fixture(file), { code: 'IMA_ASSET_INDEX' });
    assert.equal(fs.readFileSync(file, 'utf8'), raw);
  }
  fs.writeFileSync(file, ' '.repeat(8 * 1024 * 1024 + 1));
  assert.throws(() => fixture(file), { code: 'IMA_ASSET_INDEX' });
});

test('官方无签名公开图片可恢复，主凭证伪装在URL中时不发起下载', async t => {
  const publicRecord = { ...mediaRecord(1), mediaId: undefined, urlReference: 'https://consumer.huawei.com/content/dam/fixture.png' };
  const { file } = registry(t, [publicRecord]);
  let downloads = 0;
  const adapter = new ImaAdapter({ assetIndexPath: file, credentials: () => identity, call: async () => { throw new Error('公开图片不得调用媒体接口'); }, fetch: async (_url, init) => {
    downloads++;
    assert.equal((init?.headers as Record<string, string>).authorization, undefined);
    return new Response(new Uint8Array(syntheticPng), { headers: { 'content-type': 'image/png' } });
  } });
  assert.deepEqual((await adapter.asset(idFor(1)))?.body, syntheticPng);
  assert.equal(downloads, 1);
  fs.writeFileSync(file, JSON.stringify({ version: 1, assets: [{ ...publicRecord, urlReference: `https://consumer.huawei.com/${identity.imaKey}.png` }] }));
  const guarded = new ImaAdapter({ assetIndexPath: file, credentials: () => identity, call: async () => ({ code: 0, data: {} }), fetch: async () => { throw new Error('不应到达外部请求'); } });
  await assert.rejects(() => guarded.asset(idFor(1)), { code: 'IMA_URL_SECRET' });
});
