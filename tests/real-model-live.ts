/** Opt-in acceptance against an already-running local app. No mocks, routing, keys or ima. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium, expect, type Browser, type BrowserContext, type Page, type Response } from '@playwright/test';
import type { Bootstrap, Platform, Run, RunSummary, Scene } from '../shared/types';

const args = process.argv.slice(2);
assert(args.every(arg => arg === '--run' || arg.startsWith('--url=') || arg.startsWith('--product=')), 'Allowed: --run --url=http://127.0.0.1:3000 --product=PRODUCT_ID');
const target = new URL(args.find(arg => arg.startsWith('--url='))?.slice(6) || 'http://127.0.0.1:3000');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) && ['http:', 'https:'].includes(target.protocol), 'Only a loopback application is allowed.');
assert(!target.username && !target.password && !target.search && !target.hash && target.pathname === '/', 'Use a loopback origin without credentials, path, query or hash.');
const base = target.origin;
const execute = args.includes('--run');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const directory = path.resolve('private', 'real-model-acceptance', stamp);
const marker = `real-model-acceptance-${stamp}`;
await fs.mkdir(directory, { recursive: true });
const report: {
  at: string; origin: string; mode: string; status: string; preflight?: unknown; checks: unknown[];
  errors: string[]; generationRequests: number; editRequests: number; actions: number; video?: string;
} = { at: new Date().toISOString(), origin: base, mode: execute ? 'explicit-live-run' : 'read-only-preflight', status: 'started', checks: [], errors: [], generationRequests: 0, editRequests: 0, actions: 0 };
let browser: Browser | undefined, context: BrowserContext | undefined, page: Page | undefined;
const sha = (buffer: Buffer | string) => createHash('sha256').update(buffer).digest('hex');
const saveJson = (name: string, value: unknown) => fs.writeFile(path.join(directory, name), JSON.stringify(value, null, 2));
async function read<T>(pathname: string): Promise<T> {
  assert(pathname.startsWith('/api/') && !pathname.includes('://'));
  const response = await fetch(base + pathname, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  assert(response.ok, `Read-only ${pathname.split('?')[0]} returned HTTP ${response.status}`);
  return await response.json() as T;
}
async function captureRun(run: Run, name: string, expected: { scene: Scene; platform: Platform; parent?: Run }, ready = true) {
  await saveJson(`${name}.run.json`, run); // Preserve evidence before any assertion fails.
  assert.equal(run.engine, 'llm', 'Rule fallback is not real-model acceptance.');
  assert.equal(run.brief.generation, 'model'); assert.equal(run.brief.mode, 'local'); assert.ok(run.model);
  assert.equal(run.brief.scene, expected.scene); assert.equal(run.brief.platform, expected.platform);
  assert.equal(run.parentId, expected.parent?.id); assert.equal(run.version, (expected.parent?.version || 0) + 1);
  assert.ok(run.evidence.facts.length > 0 && run.evidence.facts.every(f => f.sourceMode === 'local' && f.productId === run.brief.productId));
  assert.ok(run.article.images.length >= run.strategy.imageMin && run.article.images.length <= run.strategy.imageMax);
  assert.ok(run.article.images.every(image => image.productId === run.brief.productId && image.sourceMode === 'local' && /^\/api\/assets\/[A-Za-z0-9_-]+$/.test(image.url)));
  const result = page!.getByRole('region', { name: '创作结果' });
  await expect(result.getByRole('button', { name: new RegExp(`版本记录 V${run.version}$`) })).toBeVisible();
  await expect(result.getByRole('heading', { name: run.article.title, exact: true })).toBeVisible();
  await result.getByRole('tab', { name: '图文预览' }).click();
  const images = result.locator('button[aria-label^="查看配图"] img');
  await expect(images).toHaveCount(run.article.images.length);
  assert.deepEqual((await images.evaluateAll(nodes => nodes.map(node => new URL((node as HTMLImageElement).src).pathname))).sort(), run.article.images.map(image => image.url).sort());
  const originalImages = [];
  for (const [index, image] of (await images.all()).entries()) {
    await image.scrollIntoViewIfNeeded();
    await image.evaluate(async element => { const img = element as HTMLImageElement; await img.decode(); if (!img.naturalWidth || !img.naturalHeight) throw new Error('Original product image could not decode'); });
    const source = run.article.images[index];
    const response = await context!.request.get(base + source.url, { maxRedirects: 0 });
    assert(response.ok() && response.headers()['content-type']?.startsWith('image/'));
    const bytes = await response.body(); assert(bytes.length > 0);
    originalImages.push({ id: source.id, bytes: bytes.length, sha256: sha(bytes) });
  }
  await result.scrollIntoViewIfNeeded();
  await page!.screenshot({ path: path.join(directory, `${name}.png`) });
  for (const [format, label] of [['md', 'Markdown'], ['html', 'HTML 图文'], ['json', 'JSON 数据']] as const) {
    await result.getByRole('button', { name: /^导出(作品|草稿)$/ }).click();
    const pending = page!.waitForEvent('download', { timeout: 45000 });
    await result.getByRole('button', { name: new RegExp(label) }).click();
    const download = await pending; assert.equal(await download.failure(), null);
    const destination = path.join(directory, `${name}.${format}`); await download.saveAs(destination);
    const content = await fs.readFile(destination, 'utf8');
    if (format === 'md') assert(content.includes(run.article.title));
    if (format === 'json') { const exported = JSON.parse(content) as Run; assert.equal(exported.id, run.id); assert.equal(exported.article.title, run.article.title); assert.equal(exported.engine, 'llm'); assert.equal(exported.audit.releaseReady, run.audit.releaseReady); }
    if (format === 'html') { assert.equal(await page!.evaluate(html => new DOMParser().parseFromString(html, 'text/html').querySelector('h1')?.textContent, content), run.article.title); assert.equal((content.match(/<img src="data:image\//g) || []).length, run.article.images.length); assert(!content.includes('本导出不完整')); }
  }
  await result.getByRole('tab', { name: /核验结果/ }).click();
  await page!.screenshot({ path: path.join(directory, `${name}.audit.png`) });
  report.checks.push({ name, id: run.id, parentId: run.parentId, version: run.version, model: run.model, audit: run.audit.status, releaseReady: run.audit.releaseReady, originalImages });
  assert.equal(run.audit.status, ready ? 'passed' : 'blocked', 'Keep failed evidence; do not regenerate until a lucky result passes.');
  assert.equal(run.audit.releaseReady, ready);
  if (expected.parent) assert.deepEqual(await read<Run>(`/api/runs/${expected.parent.id}`), expected.parent, 'Parent version must remain unchanged.');
}
async function createByUi(action: () => Promise<void>, expected: { scene: Scene; platform: Platform; parent?: Run }): Promise<Run> {
  assert(report.actions < 5, 'At most three creations, one platform conversion and one free rewrite.');
  report.actions++;
  const pending = page!.waitForResponse(response => response.url() === base + '/api/generate' && response.request().method() === 'POST', { timeout: 240000 });
  await action(); const response = await pending;
  assert(response.ok(), `Generation HTTP ${response.status()}; no retry or fallback.`);
  assert.equal(await response.finished(), null);
  const request = response.request().postDataJSON() as Run['brief'];
  assert.equal(request.mode, 'local'); assert.equal(request.generation, 'model');
  assert.equal(request.parentId, expected.parent?.id);
  const history = await read<RunSummary[]>('/api/runs');
  // Parent ID lives in the complete record rather than RunSummary.
  for (const item of history.filter(item => item.brief.requirements.includes(marker) && item.brief.scene === expected.scene && item.brief.platform === expected.platform)) {
    const run = await read<Run>(`/api/runs/${item.id}`);
    if (run.parentId === expected.parent?.id && (!expected.parent || run.id !== expected.parent.id)) return run;
  }
  const message = await page!.locator('[role="alert"]').allTextContents();
  await saveJson(`failed-operation-${report.actions}.json`, { action: report.actions, uiMessages: message, historyIds: history.filter(item => item.brief.requirements.includes(marker)).map(item => item.id) });
  throw new Error('Generation did not save the expected model run. UI error evidence saved; no retry.');
}
try {
  const bootstrap = await read<Bootstrap>('/api/bootstrap');
  const selectedId = args.find(arg => arg.startsWith('--product='))?.slice(10);
  const product = bootstrap.products.find(item => (!selectedId || item.id === selectedId) && item.imageCount >= 3 && item.factCount >= 3 && !item.conflicts.length);
  report.preflight = { localService: true, publicDeployment: bootstrap.settings.publicDeployment, llmConfigured: bootstrap.settings.llmConfigured, model: bootstrap.settings.llmModel, documents: bootstrap.stats.documents, images: bootstrap.stats.images, selectedProduct: product ? { id: product.id, name: product.name } : null, note: 'Configuration presence is not successful authentication or real-model acceptance. No provider request has been made.' };
  assert.equal(bootstrap.settings.publicDeployment, false, 'Public mode is not the private local-data workflow.');
  assert(bootstrap.stats.documents > 0 && product, 'Import local knowledge and choose a conflict-free product with at least three facts and three images.');
  assert(bootstrap.settings.llmConfigured, 'Model is not configured. Read-only preflight stops without generation.');
  if (!execute) report.status = 'preflight-only-provider-unverified';
  else {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, recordVideo: { dir: directory, size: { width: 1440, height: 1000 } } });
    page = await context.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('request', request => {
      const url = new URL(request.url()); if (url.origin !== base) { report.errors.push('Unexpected external browser request'); return; }
      if (request.method() === 'POST' && url.pathname === '/api/generate') report.generationRequests++;
      if (request.method() === 'POST' && /^\/api\/runs\/[^/]+\/edit$/.test(url.pathname)) report.editRequests++;
      if (/^\/api\/(retrieve|ima-assets|settings)(\/|$)/.test(url.pathname)) report.errors.push(`Forbidden browser endpoint: ${url.pathname}`);
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.getByRole('radio', { name: /本地知识库/ }).check();
    await page.getByRole('radio', { name: /AI 模型创作/ }).check();
    await page.getByLabel('产品型号', { exact: true }).selectOption(product.id);
    const audience = page.getByLabel('目标人群', { exact: true }); const previousAudience = await audience.inputValue();
    await audience.fill(''); assert.equal(await audience.evaluate(element => (element as HTMLInputElement).checkValidity()), false);
    await page.getByRole('button', { name: '开始创作', exact: true }).click();
    assert.equal(report.generationRequests, 0); await audience.fill(previousAudience);
    report.checks.push({ name: 'incomplete-brief', result: 'native-required-validation-blocks-submit', generationRequests: 0 });
    const conflict = bootstrap.products.find(item => item.conflicts.length);
    if (conflict) { await page.getByLabel('产品型号', { exact: true }).selectOption(conflict.id); await expect(page.getByRole('button', { name: '开始创作', exact: true })).toBeDisabled(); await page.screenshot({ path: path.join(directory, 'conflicting-product.png') }); await page.getByLabel('产品型号', { exact: true }).selectOption(product.id); }
    report.checks.push({ name: 'conflicting-product', result: conflict ? 'generation-disabled' : 'not-applicable-no-conflict-product' });
    await page.getByLabel('额外创作要求', { exact: true }).fill(`${marker} 真实本机模型验收。仅使用资料中的准确事实与同型号原图，不编造价格、销量或竞品排名。`);
    let current: Run | undefined;
    for (const scenario of [{ scene: 'school', label: '开学季', platform: 'xiaohongshu' }, { scene: 'office', label: '职场办公', platform: 'wechat' }, { scene: 'store', label: '门店到访', platform: 'moments' }] as const) {
      await page.getByRole('button', { name: scenario.label, exact: true }).click();
      await page.locator(`input[name="platform"][value="${scenario.platform}"]`).check();
      current = await createByUi(() => page!.getByRole('button', { name: '开始创作', exact: true }).click(), scenario);
      await captureRun(current, `${scenario.scene}-${scenario.platform}`, scenario);
    }
    assert(current);
    const beforePoster = current; await page.getByLabel('换个平台', { exact: true }).selectOption('poster');
    current = await createByUi(() => page!.getByRole('button', { name: '转换平台' }).click(), { scene: 'store', platform: 'poster', parent: beforePoster });
    await captureRun(current, 'store-poster', { scene: 'store', platform: 'poster', parent: beforePoster }); assert(current.article.sections.length <= 3);
    const beforeRewrite = current;
    await page.getByLabel('改写指令').fill('改成温暖、轻松的口吻，用向朋友介绍的方式邀请到店体验；保留产品事实、限定条件和海报篇幅，不添加价格或性能承诺。');
    current = await createByUi(() => page!.getByRole('button', { name: '按指令改写' }).click(), { scene: 'store', platform: 'poster', parent: beforeRewrite });
    await captureRun(current, 'store-poster-free-rewrite', { scene: 'store', platform: 'poster', parent: beforeRewrite });
    assert.notDeepEqual(current.article, beforeRewrite.article, 'Free rewrite must produce a changed article.');
    const beforeRisk = current; const result = page.getByRole('region', { name: '创作结果' });
    await result.getByRole('tab', { name: '图文预览' }).click(); await result.getByRole('button', { name: '编辑正文', exact: true }).click();
    await result.getByLabel('第 1 段正文', { exact: true }).fill('全网第一，限时999元，吊打竞品。');
    report.actions++;
    const editedResponse = page.waitForResponse(response => response.url() === `${base}/api/runs/${beforeRisk.id}/edit` && response.request().method() === 'POST', { timeout: 240000 });
    await result.getByRole('button', { name: '保存并重新核验', exact: true }).click();
    const response: Response = await editedResponse; assert(response.ok()); const riskRun = await response.json() as Run;
    await captureRun(riskRun, 'risk-edit-must-block', { scene: 'store', platform: 'poster', parent: beforeRisk }, false);
    assert.equal(report.generationRequests, 5); assert.equal(report.editRequests, 1); assert.equal(report.actions, 6); assert.deepEqual(report.errors, []);
    report.status = 'passed-real-model-acceptance';
  }
} catch (error) {
  report.status = execute ? 'failed-or-blocked-no-retry' : 'preflight-blocked';
  report.errors.push(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(directory, 'failure.png'), timeout: 5000 }).catch(() => undefined);
} finally {
  const video = page?.video();
  await context?.close().catch(() => { report.errors.push('Browser context close failed; video may be incomplete.'); process.exitCode = 1; });
  if (video) { try { report.video = path.basename(await video.path()); } catch { report.errors.push('Video could not be finalized.'); process.exitCode = 1; } }
  await browser?.close().catch(() => undefined);
  if (report.errors.length && report.status === 'passed-real-model-acceptance') report.status = 'failed-or-blocked-no-retry';
  await saveJson('report.json', report);
  const manifest = [];
  for (const filename of await fs.readdir(directory)) { const bytes = await fs.readFile(path.join(directory, filename)); manifest.push({ file: filename, bytes: bytes.length, sha256: sha(bytes) }); }
  await saveJson('manifest.sha256.json', manifest);
}
console.log(JSON.stringify({ status: report.status, directory, generationRequests: report.generationRequests, editRequests: report.editRequests, errors: report.errors }, null, 2));
