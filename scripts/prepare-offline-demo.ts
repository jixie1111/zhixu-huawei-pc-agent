import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { KnowledgeStore } from '../server/knowledge';
import { buildStrategy, composeLocal } from '../server/agent';
import { auditArticle } from '../server/audit';
import { toHtml, escapeHtml } from '../server/export';
import { imageType } from '../server/network';
import { privateDir, publicDeployment } from '../server/config';
import { PLATFORMS, SCENES } from '../shared/rules';
import type { Brief, Evidence, Run } from '../shared/types';

export const OFFLINE_NOTICE = '本地规则草稿 · 非 ima 在线取证 · 非大模型生成 · 非正式参赛案例 · 仅限本机离线演示';
const cases = [
  { slug: '01-school-xiaohongshu', scene: 'school', platform: 'xiaohongshu', eyebrow: '01 / CAMPUS', title: '从校园的一天开始', intro: '用学习流程组织选购清单，查看小红书的短段落与三图编排。' },
  { slug: '02-office-wechat', scene: 'office', platform: 'wechat', eyebrow: '02 / WORKDAY', title: '让工作场景先开口', intro: '围绕办公任务解释配置与边界，查看公众号的层次与两图编排。' },
  { slug: '03-store-moments', scene: 'store', platform: 'moments', eyebrow: '03 / IN STORE', title: '带着问题，到店体验', intro: '收拢到一个可现场确认的问题，查看朋友圈的短内容与单图方案。' },
] as const;
const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
function ensure(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function requireLocal() { ensure(!publicDeployment && process.env.PUBLIC_DEPLOYMENT !== 'true', '公开部署禁止准备本地离线演示包。'); }

function copyLocalEvidence(evidence: Evidence): Evidence {
  ensure(!evidence.product.conflicts.length && evidence.facts.length > 0 && evidence.images.length >= 3, '需要有事实、无冲突且至少有三张来源图片的型号。');
  ensure(evidence.facts.every(fact => fact.sourceMode === 'local' && fact.productId === evidence.product.id) && evidence.images.every(image => image.sourceMode === 'local' && image.productId === evidence.product.id), '离线包只接受同型号本地资料，不混入 ima 记录。');
  return {
    product: { ...evidence.product, cover: undefined },
    facts: evidence.facts.map(({ sourcePath: _omitted, ...fact }) => ({ ...fact })),
    images: evidence.images.map(image => ({ ...image })),
    warnings: [OFFLINE_NOTICE],
    trace: [{ action: '离线规则编排', detail: OFFLINE_NOTICE, at: new Date().toISOString() }],
  };
}

function readLocalImage(knowledge: KnowledgeStore, image: Evidence['images'][number]): Buffer {
  const filename = knowledge.assets.get(image.id);
  ensure(filename, '有图片索引但缺少本地文件映射；未生成不完整演示。');
  const stat = fs.lstatSync(filename);
  ensure(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size < 8_000_000, '本地图片类型或大小未通过检查。');
  const body = fs.readFileSync(filename);
  const type = imageType(body);
  ensure(type, '本地图片没有合法位图签名。');
  if (type === 'image/png') {
    ensure((!image.width || body.readUInt32BE(16) === image.width) && (!image.height || body.readUInt32BE(20) === image.height), 'PNG 原图尺寸与索引不一致。');
  }
  return body;
}

/** Do not copy environment values or source paths into any output, including errors. */
function checkPayloads(payloads: Map<string, string>): void {
  const knownSecrets = ['IMA_OPENAPI_CLIENTID', 'IMA_CLIENT_ID', 'IMA_OPENAPI_APIKEY', 'IMA_API_KEY', 'LLM_API_KEY', 'ADMIN_TOKEN'].map(name => process.env[name] || '').filter(value => value.length >= 4);
  for (const text of payloads.values()) {
    const includesSecret = knownSecrets.some(value => text.includes(value) || text.includes(JSON.stringify(value).slice(1, -1))) || /\bsk-[A-Za-z0-9_-]{16,}\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:IMA_OPENAPI_APIKEY|IMA_API_KEY|LLM_API_KEY|ADMIN_TOKEN)\s*[:=]\s*["']?[^\s"']+/u.test(text);
    const includesPath = /"sourcePath"\s*:|file:\/\/|(?:^|[\s"'(>])[A-Za-z]:[\\/][^\s<>]|(?:^|[\s"'<>])\/(?:Users|home|mnt|etc|private|tmp|var|opt)\//mu.test(text);
    ensure(!includesSecret && !includesPath, '输出安全检查未通过，可能含凭据或绝对本地路径；没有生成演示包。');
  }
}

function banner(html: string): string {
  const fixed = `<aside aria-label="离线草稿声明" style="position:sticky;top:0;z-index:10;padding:13px 20px;background:#183f35;color:#fff;text-align:center;font:600 13px/1.65 system-ui;letter-spacing:.04em">${escapeHtml(OFFLINE_NOTICE)} <a href="index.html" style="color:#e6ca8b;margin-left:16px">返回演示目录 ↗</a></aside>`;
  return html.replace('<title>', '<title>【本地规则草稿】').replace('<body>', `<body>${fixed}`).replace('</body>', `<footer style="text-align:center;padding:20px;font:12px/1.8 system-ui">${escapeHtml(OFFLINE_NOTICE)}</footer></body>`);
}

function indexHtml(productName: string, createdAt: string, prepared: { run: Run; htmlFile: string; summaryFile: string }[]): string {
  const e = escapeHtml;
  const cards = prepared.map(({ run, htmlFile, summaryFile }, index) => {
    const item = cases[index];
    return `<article class="case"><span class="eyebrow">${item.eyebrow}</span><div class="case-number">0${index + 1}</div><h2>${item.title}</h2><p>${item.intro}</p><div class="meta"><span>${e(SCENES[run.brief.scene].name)}</span><span>${e(PLATFORMS[run.brief.platform].name)}</span><span>${run.article.images.length} 张内嵌原图</span></div><div class="audit">${run.audit.status === 'blocked' ? '有阻断项 · 查看审核简报' : '待人工审核 · 本地规则草稿'}</div><a class="open" href="${htmlFile}">打开图文草稿 <span>↗</span></a><a class="summary" href="${summaryFile}">查看输入与审核简报</a></article>`;
  }).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><title>知序 · 本机离线规则草稿</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f2eb;color:#213c32;font:15px/1.8 system-ui,'Microsoft YaHei',sans-serif}.shell{width:min(1180px,calc(100% - 56px));margin:auto}.top{padding:26px 0;display:flex;justify-content:space-between;border-bottom:1px solid #d4dacf}.brand{font-size:20px;font-weight:700;letter-spacing:.14em}.label{font-size:11px;letter-spacing:.15em;color:#6b7e70}.hero{padding:70px 0 42px;position:relative}.hero:after{content:'';position:absolute;right:10px;top:50px;width:160px;height:160px;border:1px solid #ccd8c7;border-radius:50%;box-shadow:0 0 0 18px #e9eee2,0 0 0 19px #d7dfd0;z-index:-1}.eyebrow{font-size:11px;letter-spacing:.2em;color:#71836d}.hero h1{font-size:clamp(36px,5vw,62px);letter-spacing:-.04em;line-height:1.2;font-weight:500;margin:18px 0 22px}.hero p{max-width:690px;color:#657769}.product{font-size:13px;color:#3e5d4c}.notice{border-left:3px solid #b58f4f;background:#eae5d8;padding:17px 22px;font-size:13px;color:#5d5b44;margin-bottom:36px}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}.case{background:#fff;padding:30px;border:1px solid #e2e6dc;border-radius:20px;position:relative;display:flex;flex-direction:column}.case-number{font:48px Georgia,serif;color:#dce4d6;position:absolute;right:26px;top:14px}.case h2{font-size:23px;font-weight:500;margin:40px 0 12px}.case p{font-size:13px;color:#73816f;min-height:72px}.meta{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}.meta span{background:#eff3eb;border-radius:5px;padding:3px 8px;font-size:10px}.audit{font-size:11px;color:#9c7946;margin:14px 0 22px}.open{background:#244b3b;color:#fff;border-radius:10px;padding:12px 16px;text-decoration:none;display:flex;justify-content:space-between;font-size:13px;margin-top:auto}.open:hover{background:#173a2b}.open:focus-visible,.summary:focus-visible{outline:3px solid #be9b55;outline-offset:4px}.summary{color:#667d68;text-align:center;font-size:11px;margin-top:12px}.end{display:flex;justify-content:space-between;gap:20px;border-top:1px solid #d4dacf;margin-top:48px;padding:24px 0 40px;color:#788473;font-size:11px}.end a{color:inherit}@media(max-width:800px){.cards{grid-template-columns:1fr}.hero{padding-top:42px}.hero:after{display:none}.case p{min-height:0}.case h2{margin-top:25px}.shell{width:calc(100% - 32px)}.end{display:block}.label{letter-spacing:0}}
</style></head><body><main class="shell"><header class="top"><div class="brand">知序 <span class="label">/ ZHIXU</span></div><div class="label">PRIVATE · OFFLINE DRAFTS</div></header><section class="hero"><div class="eyebrow">THE EVIDENCE-LED DESK / LOCAL PREVIEW</div><h1>三个场景，<br>让内容有据可循。</h1><p>这份备用演示展示本地规则编排、图文结构和审核提示。所有图片已嵌入文件，打开页面无需联网；没有调用 ima 或大模型。</p><div class="product">${e(productName)} · ${e(createdAt)}</div></section><div class="notice"><strong>${e(OFFLINE_NOTICE)}</strong><br>仅用于本机断网时讲解界面与规则流程，不是三组正式在线验收结果，不代表已获得素材公开许可。不能代替现场更换任务的真实检索与生成。</div><section class="cards" aria-label="三份本地规则草稿">${cards}</section><footer class="end"><div>永久保留本地来源、引擎与待审标记。请勿直接公开或作为在线接入证明。</div><div><a href="MANIFEST.json">SHA-256 清单</a> · <a href="README.txt">使用边界</a></div></footer></main></body></html>`;
}

export interface OfflineDemoOptions {
  knowledge?: KnowledgeStore;
  knowledgeRoot?: string;
  productId?: string;
  /** For isolated tests; the CLI always uses the configured private DATA_DIR. */
  outputRoot?: string;
  now?: Date;
}

export function prepareOfflineDemo(options: OfflineDemoOptions = {}) {
  requireLocal();
  const knowledge = options.knowledge || new KnowledgeStore(options.knowledgeRoot);
  const product = knowledge.products.find(value => (!options.productId || value.id === options.productId) && !value.conflicts.length && value.factCount > 0 && value.imageCount >= 3);
  ensure(product, '没有可用的无冲突、至少三图本地型号；未生成演示包。');
  const data = copyLocalEvidence(knowledge.get(product.id));
  const createdAt = (options.now || new Date()).toISOString();
  const outputRoot = path.resolve(options.outputRoot || privateDir);
  const outputDirectory = path.join(outputRoot, `demo-${createdAt.replace(/[:.]/g, '-')}`);
  ensure(!fs.existsSync(outputDirectory), '演示目录已存在，拒绝覆盖。请使用新的时间目录。');
  const payloads = new Map<string, string>();
  const images = new Map<string, { body: Buffer; type: string }>();
  const prepared: { run: Run; htmlFile: string; summaryFile: string }[] = [];
  for (const item of cases) {
    const brief: Brief = { productId: product.id, audience: SCENES[item.scene].audience, scene: item.scene, platform: item.platform, stage: item.scene === 'store' ? '到店体验' : '比较选型', goal: item.scene === 'store' ? '引导到店体验' : '帮助用户理解适用边界', requirements: OFFLINE_NOTICE, mode: 'local' };
    const strategy = buildStrategy(brief), article = composeLocal(brief, data, strategy);
    ensure(article.sections.length > 0 && article.images.length >= PLATFORMS[item.platform].range[0], '当前型号不足以编排全部三个本地场景；未生成演示包。');
    article.disclaimer = `${OFFLINE_NOTICE}。${article.disclaimer}`;
    const audit = auditArticle(article, data, brief, 'local-composer');
    audit.releaseReady = false;
    const run: Run = { id: randomUUID(), createdAt, updatedAt: createdAt, version: 1, brief, evidence: data, strategy, article, audit, engine: 'local-composer', durationMs: 0, trace: [{ action: '本地离线演示准备', detail: OFFLINE_NOTICE, at: createdAt }] };
    const imageData = new Map<string, string>();
    for (const image of article.images) {
      let asset = images.get(image.id);
      if (!asset) { const body = readLocalImage(knowledge, image); asset = { body, type: imageType(body) }; images.set(image.id, asset); }
      imageData.set(image.id, `data:${asset.type};base64,${asset.body.toString('base64')}`);
    }
    const htmlFile = `${item.slug}.html`, summaryFile = `${item.slug}.brief.json`;
    payloads.set(htmlFile, banner(toHtml(run, imageData)));
    payloads.set(summaryFile, JSON.stringify({ notice: OFFLINE_NOTICE, sourceMode: 'local', engine: 'local-composer', formalOnlineCase: false, releaseReady: false, createdAt, product: { id: product.id, name: product.name }, input: brief, strategy, audit: { status: audit.status, checkedAt: audit.checkedAt, releaseReady: false, findings: audit.findings, factCheckCount: audit.factChecks.length }, composition: { sectionCount: article.sections.length, imageCount: article.images.length, images: article.images.map(image => ({ name: image.name, description: image.description, position: image.position, reason: image.reason, sourceMode: 'local', sourceTitle: image.sourceTitle, sourceUrl: image.sourceUrl, sha256: sha256(images.get(image.id)!.body) })) } }, null, 2));
    prepared.push({ run, htmlFile, summaryFile });
  }
  payloads.set('index.html', indexHtml(product.name, createdAt, prepared));
  payloads.set('README.txt', `${OFFLINE_NOTICE}\n\n打开 index.html，选择三份内嵌原图的规则草稿。无需服务器、登录或网络。\n此包不会调用 ima 或模型，不包含完整原库、数据库或服务凭据，不提供实时生成。\n本地素材仅用于已授权本机演示，公开发布需另行确认；不得替代正式 ima+模型三案例、连续演示视频或现场任务测试。\n每份 *.brief.json 保留输入、来源模式、编排与审核简报；MANIFEST.json 校验其他输出文件的字节数和 SHA-256（不自校验）。\n`);
  const manifest = {
    status: 'LOCAL_OFFLINE_DRAFT_ONLY', notice: OFFLINE_NOTICE, createdAt,
    sourceMode: 'local', engine: 'local-composer', networkUsed: false,
    formalOnlineAcceptance: false, publicReleaseAuthorized: false,
    product: { id: product.id, name: product.name },
    cases: prepared.map(({ run, htmlFile, summaryFile }) => ({ scene: run.brief.scene, platform: run.brief.platform, html: htmlFile, summary: summaryFile, imageCount: run.article.images.length, auditStatus: run.audit.status, releaseReady: false })),
    files: [...payloads].map(([file, text]) => ({ path: file, bytes: Buffer.byteLength(text), sha256: sha256(text) })),
    excludes: ['原始ZIP与完整知识库', '绝对sourcePath', '服务凭据', '运行数据库', 'ima媒体ID与签名链接'],
  };
  payloads.set('MANIFEST.json', JSON.stringify(manifest, null, 2));
  checkPayloads(payloads);
  requireLocal();
  fs.mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
  ensure(!fs.lstatSync(outputRoot).isSymbolicLink(), '演示输出根目录不能是符号链接。');
  fs.mkdirSync(outputDirectory, { recursive: false, mode: 0o700 });
  for (const [file, content] of payloads) fs.writeFileSync(path.join(outputDirectory, file), content, { flag: 'wx', mode: 0o600 });
  return { directory: outputDirectory, index: path.join(outputDirectory, 'index.html'), files: payloads.size, cases: prepared.length, status: manifest.status };
}

export function main(args = process.argv.slice(2)): void {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log('Usage: npx tsx scripts/prepare-offline-demo.ts --prepare [--knowledge-dir <authorized-local-folder>] [--product-id <id>]\nWrites a new private/demo-<timestamp>/ directory only. Never uses the network or creates formal online cases.');
    return;
  }
  ensure(args[0] === '--prepare', '没有选择操作。请使用 --prepare 显式生成本机离线规则草稿，或 --help 查看说明。');
  const options: OfflineDemoOptions = {};
  for (let index = 1; index < args.length; index++) {
    const name = args[index], value = args[++index];
    ensure(['--knowledge-dir', '--product-id'].includes(name) && value && !value.startsWith('--'), '参数不完整或不受支持；请使用 --help。');
    if (name === '--knowledge-dir') { ensure(!options.knowledgeRoot, '不允许重复知识目录参数。'); options.knowledgeRoot = value; }
    else { ensure(!options.productId, '不允许重复型号参数。'); options.productId = value; }
  }
  const result = prepareOfflineDemo(options);
  console.log(JSON.stringify({ ...result, notice: OFFLINE_NOTICE, networkUsed: false, uploaded: false }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); } catch { console.error('离线演示准备未完成。请检查本地模式、至少三图且无冲突的授权型号、图片完整性、输出权限和安全检查；不会覆盖旧包或回退联网。'); process.exitCode = 1; }
}
