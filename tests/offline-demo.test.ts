import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { knowledgeFixture } from './fixtures';

const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zhixu-offline-demo-test-'));
Object.assign(process.env, { PUBLIC_DEPLOYMENT: 'false', DATA_DIR: path.join(taskRoot, 'private'), PUBLIC_ORIGIN: '', FRAME_ANCESTORS: '' });
const { prepareOfflineDemo, main, OFFLINE_NOTICE } = await import('../scripts/prepare-offline-demo');
const { KnowledgeStore } = await import('../server/knowledge');
const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error('Offline QA forbids all network'); };
after(() => {
  globalThis.fetch = originalFetch;
  assert.equal(networkCalls, 0);
  assert.equal(path.dirname(taskRoot), fs.realpathSync(os.tmpdir()));
  assert.ok(path.basename(taskRoot).startsWith('zhixu-offline-demo-test-'));
  fs.rmSync(taskRoot, { recursive: true, force: true });
});

test('三场景三平台离线草稿完全内嵌图片、永久本地标识并有可复核hash', t => {
  const fixture = knowledgeFixture(); t.after(fixture.cleanup);
  const knowledge = new KnowledgeStore(fixture.root);
  knowledge.evidence.get(knowledge.products[0].id)!.facts[0].sourcePath = 'C:\\PRIVATE-DO-NOT-COPY\\原文.md';
  const options = { knowledge, now: new Date('2026-10-18T00:00:00.000Z') };
  const result = prepareOfflineDemo(options);
  assert.equal(path.dirname(result.directory), path.join(taskRoot, 'private'));
  const manifest = JSON.parse(fs.readFileSync(path.join(result.directory, 'MANIFEST.json'), 'utf8'));
  assert.equal(result.cases, 3); assert.equal(result.files, 9);
  assert.equal(manifest.networkUsed, false); assert.equal(manifest.formalOnlineAcceptance, false); assert.equal(manifest.publicReleaseAuthorized, false);
  assert.deepEqual(manifest.cases.map((value: { scene: string; platform: string }) => [value.scene, value.platform]), [['school', 'xiaohongshu'], ['office', 'wechat'], ['store', 'moments']]);
  assert.deepEqual(manifest.cases.map((value: { imageCount: number }) => value.imageCount), [3, 2, 1]);
  for (const item of manifest.files) {
    const body = fs.readFileSync(path.join(result.directory, item.path));
    assert.equal(body.length, item.bytes);
    assert.equal(createHash('sha256').update(body).digest('hex'), item.sha256);
    const text = body.toString('utf8');
    assert.ok(text.includes(OFFLINE_NOTICE));
    assert.ok(!text.includes('PRIVATE-DO-NOT-COPY')); assert.ok(!text.includes(fixture.root));
    assert.ok(!text.includes('"sourcePath":')); assert.ok(!text.includes('QA-SECRET'));
    assert.ok(!/<script[\s>]|(?:src|href)\s*=\s*["']https?:\/\//iu.test(text));
    if (item.path.endsWith('.brief.json')) {
      const brief = JSON.parse(text); assert.equal(brief.input.mode, 'local'); assert.equal(brief.engine, 'local-composer'); assert.equal(brief.audit.releaseReady, false);
    }
  }
  for (const item of manifest.cases) {
    const html = fs.readFileSync(path.join(result.directory, item.html), 'utf8');
    assert.equal((html.match(/<img src="data:image\/png;base64,/g) || []).length, item.imageCount);
    assert.ok(!html.includes('图片未嵌入')); assert.ok(!html.includes('自动核验通过，发布前请人工审阅。'));
  }
  const previous = fs.readFileSync(result.index);
  assert.throws(() => prepareOfflineDemo(options), /拒绝覆盖/);
  assert.deepEqual(fs.readFileSync(result.index), previous);
});

test('公开模式、无明确操作和无合适本地型号均不生成包', () => {
  assert.throws(() => main([]), /没有选择操作/);
  process.env.PUBLIC_DEPLOYMENT = 'true';
  try { assert.throws(() => prepareOfflineDemo({ outputRoot: path.join(taskRoot, 'should-not-exist') }), /公开部署禁止/); }
  finally { process.env.PUBLIC_DEPLOYMENT = 'false'; }
  assert.equal(fs.existsSync(path.join(taskRoot, 'should-not-exist')), false);
  const empty = new KnowledgeStore(path.join(taskRoot, 'missing-knowledge'));
  assert.throws(() => prepareOfflineDemo({ knowledge: empty, outputRoot: path.join(taskRoot, 'empty-rejected') }), /没有可用/);
  assert.equal(fs.existsSync(path.join(taskRoot, 'empty-rejected')), false);
});

test('冲突、缺失或伪造图片不会成为看似完整的离线包', t => {
  const fixture = knowledgeFixture(); t.after(fixture.cleanup);
  const knowledge = new KnowledgeStore(fixture.root), outputRoot = path.join(taskRoot, 'invalid-images');
  const product = knowledge.products[0];
  product.conflicts = ['synthetic conflict'];
  assert.throws(() => prepareOfflineDemo({ knowledge, outputRoot }), /没有可用/);
  product.conflicts = [];
  const image = knowledge.get(product.id).images[0];
  knowledge.assets.set(image.id, path.join(taskRoot, 'missing-image.png'));
  assert.throws(() => prepareOfflineDemo({ knowledge, outputRoot }));
  assert.equal(fs.existsSync(outputRoot), false);
  const fake = path.join(taskRoot, 'fake-image.png'); fs.writeFileSync(fake, '<!doctype html><script>unsafe</script>');
  knowledge.assets.set(image.id, fake);
  assert.throws(() => prepareOfflineDemo({ knowledge, outputRoot }), /位图签名/);
  assert.equal(fs.existsSync(outputRoot), false);
});

test('资料混入已配置密钥时拒绝写包且错误不回显秘密', t => {
  const fixture = knowledgeFixture(); t.after(fixture.cleanup);
  const knowledge = new KnowledgeStore(fixture.root), outputRoot = path.join(taskRoot, 'secret-rejected');
  const secret = 'qa-offline-demo-secret-do-not-copy-012345';
  const original = process.env.LLM_API_KEY; process.env.LLM_API_KEY = secret;
  try {
    const data = knowledge.evidence.get(knowledge.products[0].id)!;
    data.facts.find(fact => fact.label === '屏幕')!.text += ` ${secret}`;
    assert.throws(() => prepareOfflineDemo({ knowledge, outputRoot }), (error: unknown) => error instanceof Error && error.message.includes('安全检查') && !error.message.includes(secret));
    assert.equal(fs.existsSync(outputRoot), false);
  } finally { if (original === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = original; }
});
