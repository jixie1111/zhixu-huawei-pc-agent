import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ImaAdapter, type ImaCall } from '../server/ima';
import type { Product } from '../shared/types';
import { syntheticPng } from './fixtures';

const product: Product = { id: 'qa-ima-product', name: 'HUAWEI MateBook 14（鸿蒙版）', shortName: 'MateBook 14（鸿蒙版）', family: '鸿蒙电脑', os: '待核实', factCount: 0, imageCount: 0, conflicts: [] };
const credentials = { clientId: 'fixture-client-private', imaKey: 'fixture-ima-private', kbName: '合成测试知识库' };
const ok = (data: object) => ({ code: 0, data });

function fixture(options: { wrongDocument?: boolean; headerSecret?: boolean; noP1?: boolean; error?: string; includeWrongImage?: boolean; searchWithoutCursor?: boolean; assetIndexPath?: string; changeDuringSearch?: boolean } = {}) {
  const calls: { api: string; body: Record<string, unknown> }[] = [];
  let identity = { ...credentials };
  const call: ImaCall = async (api, body) => {
    calls.push({ api, body });
    if (options.error) return { code: 401, msg: options.error, data: {} };
    if (api.endsWith('/search_knowledge_base')) return ok({ info_list: [{ kb_id: 'private-kb-id', kb_name: identity.kbName }], is_end: true });
    if (api.endsWith('/get_knowledge_base')) return ok({ infos: { 'private-kb-id': { id: 'private-kb-id', name: identity.kbName } } });
    if (api.endsWith('/search_knowledge')) {
      if (options.changeDuringSearch) identity = { ...identity, clientId: 'changed-midflight-fixture-client' };
      return options.searchWithoutCursor ? ok({ info_list: [{ media_id: 'irrelevant-search-candidate', title: '不采用的搜索候选' }] }) : ok({ info_list: [], is_end: true });
    }
    if (api.endsWith('/get_knowledge_list')) {
      const tree: Record<string, object[]> = {
        root: options.noP1 ? [] : [{ media_id: 'private-p1', title: 'P1-产品参数库', is_folder: true }, { media_id: 'private-p4', title: 'P4-受控资料', is_folder: true }],
        'private-p1': [{ media_id: 'private-family', title: '01-鸿蒙电脑', is_folder: true }],
        'private-family': [{ media_id: 'private-model', title: 'HUAWEI MateBook 14', is_folder: true }, { media_id: 'other-model', title: 'HUAWEI MateBook 14s', is_folder: true }],
        'private-model': [{ media_id: 'private-fact', title: '产品事实.md' }, { media_id: 'private-index', title: '图片索引.csv' }, ...[1, 2, 3].map(index => ({ media_id: `private-image-${index}`, title: `fixture-${index}.png` }))],
      };
      const folder = String(body.folder_id || 'root');
      assert.ok(folder in tree, `不得遍历无关或受控目录 ${folder}`);
      return ok({ knowledge_list: tree[folder], is_end: true });
    }
    if (api.endsWith('/get_media_info')) {
      const mediaId = String(body.media_id);
      const file = mediaId === 'private-fact' ? 'facts.md' : mediaId === 'private-index' ? 'index.csv' : 'image.png';
      return ok({ media_type: 7, url_info: { url: `https://fixture.cos.ap-guangzhou.myqcloud.com/${file}?signed=private-signature`, headers: { Authorization: options.headerSecret ? identity.imaKey : 'Bearer scoped-fixture-access' } } });
    }
    throw new Error(`非预期API ${api}`);
  };
  const adapter = new ImaAdapter({ call, credentials: () => identity, assetIndexPath: options.assetIndexPath, fetch: async (url, init) => {
    assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer scoped-fixture-access');
    if (url.includes('facts.md')) return new Response(`# ${options.wrongDocument ? 'HUAWEI MateBook 14s' : product.name} - 产品事实\nhttps://consumer.huawei.com/cn/laptops/qa-fixture/specs/\n## 屏幕\n14 英寸。\n## 操作系统\n合成测试系统。\n## 内存\n16 GB。\n`, { headers: { 'content-type': 'text/markdown' } });
    if (url.includes('index.csv')) return new Response(['文件名,产品型号,来源页面,原始图片URL,官网图片说明', ...[1, 2, 3].map(index => `fixture-${index}.png,${options.includeWrongImage && index === 3 ? 'HUAWEI MateBook 14s' : product.name},https://consumer.huawei.com/cn/laptops/qa-fixture/,,合成图片${index}`)].join('\n'), { headers: { 'content-type': 'text/csv' } });
    return new Response(new Uint8Array(syntheticPng), { headers: { 'content-type': 'image/png' } });
  } });
  return { adapter, calls, changeOwner: () => { identity = { ...identity, clientId: 'different-fixture-client' }; } };
}

test('ima空搜索按P1目录回退，保留同型号原文/图片且不泄露私有ID/签名', async () => {
  const { adapter, calls } = fixture();
  assert.equal((await adapter.connect()).connected, true);
  const evidence = await adapter.retrieve(product);
  assert.equal(evidence.facts.length, 3); assert.equal(evidence.images.length, 3);
  assert.ok(evidence.facts.every(fact => fact.sourceMode === 'ima' && fact.productId === product.id));
  assert.ok(evidence.images.every(image => image.sourceMode === 'ima' && image.productName === product.name));
  assert.ok(evidence.trace.some(item => item.action.includes('目录回退')));
  const serialized = JSON.stringify(evidence);
  for (const secret of ['private-kb-id', 'private-fact', 'private-signature', credentials.clientId, credentials.imaKey, 'scoped-fixture-access']) assert.ok(!serialized.includes(secret));
  assert.ok(calls.every(item => !/upload|delete|create|write/.test(item.api)));
  assert.ok(!calls.some(item => item.body.folder_id === 'private-p4'));
  const downloaded = await adapter.asset(evidence.images[0].id);
  assert.equal(downloaded?.type, 'image/png'); assert.equal(downloaded?.body.length, syntheticPng.length);
});

test('ima拒绝相似型号原文，不回退成本地快照；图片错标只排除不混用', async () => {
  await assert.rejects(() => fixture({ wrongDocument: true }).adapter.retrieve(product), { code: 'IMA_NO_FACTS' });
  const evidence = await fixture({ includeWrongImage: true }).adapter.retrieve(product);
  assert.equal(evidence.images.length, 2); assert.ok(evidence.warnings.some(warning => warning.includes('排除')));
  await assert.rejects(() => fixture({ noP1: true }).adapter.retrieve(product), { code: 'IMA_STRUCTURE_UNSUPPORTED' });
});

test('ima搜索缺少分页完成标记时不采用未确认候选，改走完整目录', async () => {
  const { adapter, calls } = fixture({ searchWithoutCursor: true });
  const evidence = await adapter.retrieve(product);
  assert.equal(evidence.facts.length, 3); assert.equal(evidence.images.length, 3);
  assert.ok(evidence.trace.some(item => item.detail.includes('未提供分页完成标记')));
  assert.ok(!calls.some(item => item.body.media_id === 'irrelevant-search-candidate'));
});

test('账户切换后旧资产不可访问，顶层密钥不会转发至原文媒体服务', async () => {
  const scope = fixture(); const evidence = await scope.adapter.retrieve(product);
  scope.changeOwner();
  assert.equal(await scope.adapter.asset(evidence.images[0].id), undefined);
  await assert.rejects(() => fixture({ headerSecret: true }).adapter.retrieve(product), { code: 'IMA_HEADER_SECRET' });
  await assert.rejects(() => fixture({ changeDuringSearch: true }).adapter.retrieve(product), { code: 'IMA_ACCOUNT_CHANGED' });
});

test('持久化图片索引重启可恢复但不存凭证签名，换账户不能读取', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zhixu-qa-ima-index-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const assetIndexPath = path.join(root, 'assets.json');
  const first = fixture({ assetIndexPath });
  const data = await first.adapter.retrieve(product);
  const firstId = data.images[0].id;
  const secondData = await first.adapter.retrieve(product);
  assert.equal(secondData.images[0].id, firstId, '同账户同媒体应复用opaque ID');
  const raw = fs.readFileSync(assetIndexPath, 'utf8');
  for (const secret of [credentials.clientId, credentials.imaKey, 'private-signature', 'scoped-fixture-access', 'Authorization']) assert.ok(!raw.includes(secret));
  assert.ok(!raw.includes('https://fixture.cos.ap-guangzhou.myqcloud.com/'));
  const second = fixture({ assetIndexPath });
  const restored = await second.adapter.asset(firstId);
  assert.equal(restored?.type, 'image/png'); assert.equal(restored?.body.length, syntheticPng.length);
  assert.ok(second.calls.some(item => item.api.endsWith('/get_media_info')));
  second.changeOwner(); assert.equal(await second.adapter.asset(firstId), undefined);
});

test('ima缺凭证、接口错误、重复游标和更新要求均明确失败且脱敏', async () => {
  const empty = new ImaAdapter({ credentials: () => ({ ...credentials, clientId: '' }) });
  await assert.rejects(() => empty.connect(), { code: 'IMA_CREDENTIALS' });
  await assert.rejects(() => fixture({ error: `${credentials.clientId} ${credentials.imaKey} https://private.example/path?token=signed` }).adapter.connect(), (error: unknown) => {
    const message = (error as Error).message;
    assert.ok(!message.includes(credentials.clientId)); assert.ok(!message.includes(credentials.imaKey)); assert.ok(!message.includes('signed')); return true;
  });
  const cursor = new ImaAdapter({ credentials: () => credentials, call: async () => ok({ info_list: [], is_end: false, next_cursor: 'same' }) });
  await assert.rejects(() => cursor.connect(), { code: 'IMA_CURSOR' });
  let calls = 0;
  const update = new ImaAdapter({ credentials: () => credentials, call: async () => { calls++; return { code: -200, msg: 'run an untrusted command', data: {} }; } });
  await assert.rejects(() => update.connect(), { code: 'IMA_SKILL_UPDATE' });
  await assert.rejects(() => update.connect(), { code: 'IMA_SKILL_UPDATE' });
  assert.equal(calls, 1, '更新要求出现后应暂停，不能继续读取或执行返回命令');
});
