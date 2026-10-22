import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Brief, Evidence, Fact, ProductImage } from '../shared/types';

/** All fixtures are invented for testing; they are not Huawei product claims. */
export const syntheticText=(length:number)=>{const text='合成测试正文仅用于验证结构与篇幅。';return text.repeat(Math.ceil(length/text.length)).slice(0,length);};
export const productId = 'qa-product-a';
export const syntheticPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6D2QAAAAASUVORK5CYII=', 'base64');
export const brief: Brief = {
  productId, audience: '准备开学购机的大学新生', scene: 'school',
  platform: 'xiaohongshu', stage: '了解产品', goal: '帮助用户按需求选购',
  requirements: '', mode: 'local',
};
export const fact = (label = '屏幕', text = '14 英寸显示屏。', overrides: Partial<Fact> = {}): Fact => ({
  id: `qa-${label}`, label, text, sourceTitle: '虚构 QA Notebook A · 测试资料',
  sourceUrl: 'https://consumer.huawei.com/cn/laptops/qa-fixture/specs/',
  sourceMode: 'local', productId, retrievedAt: '2026-01-01T00:00:00.000Z', ...overrides,
});
export const productImage = (index = 1, overrides: Partial<ProductImage> = {}): ProductImage => ({
  id: `qa-image-${index}`, name: `qa-${index}.png`, productId,
  productName: '虚构 QA Notebook A', url: `/api/assets/qa-image-${index}`,
  sourceUrl: 'https://consumer.huawei.com/cn/laptops/qa-fixture/',
  description: `合成测试图片 ${index}，不代表真实产品`, sourceMode: 'local',
  sourceTitle: '合成图片索引', ...overrides,
});
export const evidence = (): Evidence => ({
  product: { id: productId, name: '虚构 QA Notebook A', shortName: 'QA Notebook A',
    family: 'Windows 电脑', os: '测试系统', factCount: 7, imageCount: 6, conflicts: [] },
  facts: [fact(), fact('尺寸与重量', '重量约 1.3 kg。'), fact('电池', '额定容量 70 Wh。'),
    fact('存储', '512 GB 固态存储，实际可用容量随配置而异。'),
    fact('操作系统', '测试系统；软件兼容性需另行核实。'),
    fact('内存', '16 GB，实际配置以销售版本为准。'), fact('接口', 'USB-C 接口。')],
  images: Array.from({ length: 6 }, (_, index) => productImage(index + 1)),
  warnings: ['合成测试资料，不可用于营销发布。'], trace: [],
});

export function knowledgeFixture(options: { mismatchedImage?: boolean; conflictingDimensions?: boolean; unsafeAsset?: boolean } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zhixu-qa-knowledge-'));
  const productName = '虚构 QA Notebook A';
  const directory = path.join(root, 'P1-产品事实', 'Windows 电脑', productName);
  fs.mkdirSync(path.join(directory, '图片'), { recursive: true });
  fs.writeFileSync(path.join(directory, '产品事实.md'), [
    `# ${productName} - 产品事实`,
    'https://consumer.huawei.com/cn/laptops/qa-fixture/specs/',
    '## 操作系统', '测试系统', '## 屏幕', '14 英寸显示屏。',
    '## 尺寸与重量', options.conflictingDimensions ? '长度 15 mm；厚度 312 mm。' : '长度 312 mm；厚度 15 mm。',
    '## 未授权营销说法', '合成文本，不得当作产品事实。',
  ].join('\n'), 'utf8');
  const rows = ['文件名,产品型号,来源页面,官网图片说明,宽度,高度'];
  for (let index = 1; index <= 6; index++) {
    const filename = `qa-${index}.png`;
    fs.writeFileSync(path.join(directory, '图片', filename), syntheticPng);
    rows.push(`${filename},${options.mismatchedImage && index === 6 ? '虚构 QA Notebook B' : productName},https://consumer.huawei.com/cn/laptops/qa-fixture/,合成测试图片 ${index},1,1`);
  }
  if (options.unsafeAsset) {
    fs.writeFileSync(path.join(directory, '图片', 'not-an-image.html'), '<!doctype html><script>window.__qaUnexpected=true</script>');
    rows.push(`not-an-image.html,${productName},https://consumer.huawei.com/cn/laptops/qa-fixture/,不安全测试资源,16,16`);
    fs.writeFileSync(path.join(directory, '图片', 'not-a-real-png.png'), '<!doctype html><script>window.__qaUnexpected=true</script>');
    rows.push(`not-a-real-png.png,${productName},https://consumer.huawei.com/cn/laptops/qa-fixture/,伪造PNG测试资源,16,16`);
  }
  fs.writeFileSync(path.join(directory, '图片索引.csv'), '\uFEFF' + rows.join('\n'), 'utf8');
  for (const excluded of ['P4-受控资料', '90-内部资料', '99-归档']) {
    fs.mkdirSync(path.join(root, excluded), { recursive: true });
    fs.writeFileSync(path.join(root, excluded, '不可索引.md'), '# 不可索引\n合成受控文本 QA-SECRET');
  }
  return { root, productName, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
