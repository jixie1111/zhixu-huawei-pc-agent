import type { Evidence, Fact, ProductImage } from '../shared/types';

// Small, independently checked public-page digest. Never generated from private/.
// Product pictures remain links to Huawei's public website, not redistributed files.
const productId = 'public-matebook-14-harmonyos';
const productName = 'HUAWEI MateBook 14（鸿蒙版）';
const sourceUrl = 'https://consumer.huawei.com/cn/harmonyos-computer/matebook-14-harmonyos-version/specs/';
const productUrl = sourceUrl.replace('specs/', '');
const retrievedAt = '2026-10-18T08:02:45.490Z';
const entries: [string, string][] = [
  ['操作系统', '官网当前规格列出 HarmonyOS 6。常用应用和外设是否适用，应按实际软件、系统版本逐项确认。'],
  ['尺寸与重量', '长度 312.6 mm；宽度 226.8 mm；厚度 14.5 mm。\n重量\n圆键盘版约 1.33 kg（含电池）；方键盘版约 1.32 kg（含电池）。\n配置、工艺和测量方法会带来差异。'],
  ['屏幕', '14.2 英寸\nOLED 抗反射屏\n按标准矩形测量对角线，圆角处实际显示面积略小。标准版与柔光版存在规格差异，选择时须核对具体版本。'],
  ['内存', '官网列有 24 GB 和 32 GB 配置选项；不代表每个销售版本同时具备两种配置。'],
  ['存储', '官网列有 512 GB 和 1 TB 配置选项；应核对所选销售版本。'],
  ['电池', '额定容量为 70 Wh。\n这是电池容量，不能直接推断实际续航时长。'],
  ['接口', '配有 HDMI、USB-C、USB-A 以及耳机麦克风二合一接口。不同接口的具体数据、供电和显示能力，以官网对应说明为准。'],
  ['摄像头', '官网标注 1080P 摄像头；拍照、录像模式不同，实际像素表现可能不同。'],
  ['键盘和触控板', '全尺寸背光键盘；触控板支持 5 点触控。请以具体销售版本和现场使用效果为准。'],
];
const facts: Fact[] = entries.map(([label, text], index) => ({
  id: `public-mb14-fact-${index + 1}`, label, text, productId, sourceMode: 'local',
  sourceTitle: '华为官网公开规格 · 精简参考摘要（非原始私有知识库）', sourceUrl, retrievedAt,
}));
const imageRoot = 'https://consumer.huawei.com/content/dam/huawei-cbg-site/cn/mkt/pdp/harmonyos-computer/matebook-14-harmonyos-version/img/design/';
const images: ProductImage[] = ([['green', '原野绿'], ['pink', '樱粉金'], ['grey', '深空灰']] as const).map(([color, title], index) => ({
  id: `public-mb14-image-${index + 1}`, name: `MateBook 14 · ${title}`, productId, productName,
  url: `${imageRoot}huawei-matebook-14-color-${color}.png`, sourceUrl: productUrl,
  description: `华为官网 MateBook 14 ${title}外观示意；颜色、屏幕内容和实物效果以实际产品为准。`,
  width: 817, height: 892, sourceMode: 'local', sourceTitle: '华为官网公开产品页 · 原站图片链接',
}));

export const demoEvidence: Evidence[] = [{
  product: { id: productId, name: productName, shortName: 'MateBook 14（鸿蒙版）', family: '鸿蒙电脑',
    os: 'HarmonyOS 6', category: 'computer', factCount: facts.length, imageCount: images.length, cover: images[0].url, conflicts: [] },
  facts, images,
  warnings: ['无需 API 的规则演示；不是大模型生成。', '公开官网精简摘要，独立于本机完整 ZIP 知识库。',
    '图片直接访问华为官网，需要网络；本文不提供原始资料库或素材下载。', '具体销售配置与动态信息，发布前仍需核对。'],
  trace: [{ action: '公开官网资料核对', detail: '已实际读取华为官网本型号规格页（HTTP 200），仅整理少量事实用于交互演示；未公开原始知识库。', at: retrievedAt }],
}];
