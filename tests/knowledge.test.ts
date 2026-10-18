import test from 'node:test';
import assert from 'node:assert/strict';
import { KnowledgeStore, detectConflicts, digest, extractFacts } from '../server/knowledge';
import { fact, knowledgeFixture } from './fixtures';

test('事实抽取只采用明确字段，并保留精确型号和来源', () => {
  const result = extractFacts('# 合成资料\nhttps://consumer.huawei.com/cn/laptops/qa-fixture/specs/\n## 屏幕\n14 英寸。\n## 价格\n￥1999\n## 存储\n512 GB。\n即将离开consumer.huawei.com\n不可信尾部', 'product-a', '合成资料', 'local', 'fixture.md');
  assert.deepEqual(result.map(item => item.label), ['屏幕', '存储']);
  assert.ok(result.every(item => item.productId === 'product-a' && item.sourcePath === 'fixture.md' && item.sourceMode === 'local'));
  assert.equal(result[0].sourceUrl, 'https://consumer.huawei.com/cn/laptops/qa-fixture/specs/');
  assert.ok(!result[1].text.includes('不可信尾部'));
  assert.equal(result[0].id, extractFacts('## 屏幕\n14 英寸。', 'product-a', '合成资料', 'local')[0].id);
});

test('来源冲突与尺寸错位不得静默消失；纯空白差异不会误报', () => {
  assert.equal(detectConflicts([fact('内存', '16 GB'), fact('内存', '16   GB')]).length, 0);
  assert.ok(detectConflicts([fact('内存', '16 GB'), fact('内存', '32 GB')]).some(item => item.includes('冲突')));
  assert.ok(detectConflicts([fact('尺寸与重量', '长度 15 mm；厚度 312 mm。')]).some(item => item.includes('错位')));
  assert.equal(detectConflicts([fact('尺寸与重量', '长度 312 mm；厚度 15 mm。')]).length, 0);
});

test('索引排除 P4/90/99；检索可分页；外部读取不能修改原证据', t => {
  const fixture = knowledgeFixture(); t.after(fixture.cleanup);
  const store = new KnowledgeStore(fixture.root);
  assert.equal(store.products.length, 1);
  assert.equal(store.products[0].id, digest(fixture.productName));
  assert.equal(store.products[0].imageCount, 6);
  assert.equal(store.search('QA-SECRET').total, 0);
  assert.equal(store.search('14 英寸').total, 1);
  assert.equal(store.search('14 英寸', 'P1-产品事实').total, 1);
  assert.equal(store.search('14 英寸', undefined, 2).items.length, 0);
  const copy = store.get(store.products[0].id);
  copy.facts.length = 0; copy.product.name = 'tampered';
  assert.equal(store.get(store.products[0].id).facts.length, 3);
  assert.equal(store.get(store.products[0].id).product.name, fixture.productName);
  assert.throws(() => store.get('unknown-product'), { code: 'PRODUCT_UNKNOWN' });
});

test('图片索引中的另一个型号不能混入目标型号证据', t => {
  const fixture = knowledgeFixture({ mismatchedImage: true }); t.after(fixture.cleanup);
  const store = new KnowledgeStore(fixture.root);
  const data = store.get(store.products[0].id);
  assert.ok(data.images.every(image => image.productName === fixture.productName));
  assert.equal(data.images.length, 5);
});

test('导入后保留尺寸冲突状态供生成环节阻断', t => {
  const fixture = knowledgeFixture({ conflictingDimensions: true }); t.after(fixture.cleanup);
  const store = new KnowledgeStore(fixture.root);
  assert.ok(store.products[0].conflicts.some(item => item.includes('错位')));
});

test('本地图片索引不能将HTML或其他非图片内容映射成可访问素材', t => {
  const fixture = knowledgeFixture({ unsafeAsset: true }); t.after(fixture.cleanup);
  const store = new KnowledgeStore(fixture.root);
  const data = store.get(store.products[0].id);
  assert.equal(data.images.length, 6);
  assert.ok(!Array.from(store.assets.values()).some(filename => filename.endsWith('.html')));
  assert.ok(!Array.from(store.assets.values()).some(filename => filename.endsWith('not-a-real-png.png')));
});
