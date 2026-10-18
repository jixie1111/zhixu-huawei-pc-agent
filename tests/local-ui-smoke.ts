import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Bootstrap, Run, RunSummary } from '../shared/types';

// Explicit opt-in local-only acceptance. Never run this as part of synthetic tests.
const base = 'http://127.0.0.1:3000';
const output = path.resolve('private', 'qa-local', `ui-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
const errors: string[] = [], blockedRequests: string[] = [];
let initial: Run | undefined, edited: Run | undefined;
const files: { format: string; file: string; bytes: number }[] = [];
const qaMarker = `local-ui-qa-${Date.now()}`;
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', route => {
  const url = new URL(route.request().url());
  const forbidden = url.origin !== base || /^\/api\/(?:ima-assets|retrieve|settings)(?:\/|$)/.test(url.pathname);
  if (forbidden) { blockedRequests.push(url.origin === base ? url.pathname : 'external-origin-blocked'); return route.abort('blockedbyclient'); }
  if (url.pathname === '/api/generate' && route.request().method() === 'POST') {
    if (route.request().postDataJSON()?.mode !== 'local') { blockedRequests.push('non-local-generation-blocked'); return route.abort('blockedbyclient'); }
  }
  return route.continue();
});
try {
  const bootstrapResponse = await context.request.get(`${base}/api/bootstrap`);
  assert(bootstrapResponse.ok(), 'Local application must already be running on port 3000.');
  const bootstrap = await bootstrapResponse.json() as Bootstrap;
  assert.equal(bootstrap.settings.publicDeployment, false);
  const product = bootstrap.products.find(item => item.imageCount >= 3 && item.factCount >= 3 && !item.conflicts.length);
  assert(product, 'No conflict-free product with at least three same-model images.');
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('产品型号', { exact: true }).selectOption(product.id);
  await page.getByRole('button', { name: '开学季', exact: true }).click();
  await page.getByRole('radio', { name: /本地快照/ }).check();
  await page.getByLabel('额外创作要求', { exact: true }).fill(`${qaMarker} 本地UI验收专用：仅核实工作流，不作为正式比赛在线案例，不对外发布。`);
  const generatedResponse = page.waitForResponse(response => response.url() === `${base}/api/generate` && response.request().method() === 'POST');
  await page.getByRole('button', { name: '开始创作', exact: true }).click();
  assert((await generatedResponse).ok());
  const result = page.getByRole('region', { name: '创作结果' });
  await expect(result).toBeVisible();
  // Chromium may discard an SSE response body across hash navigation. Verify the saved
  // result through read-only APIs after the UI actually renders it, not a second generation.
  const history = await (await context.request.get(`${base}/api/runs`)).json() as RunSummary[];
  const generated = history.find(item => item.brief.requirements.includes(qaMarker));
  assert(generated, 'The UI-generated QA run was not saved.');
  initial = await (await context.request.get(`${base}/api/runs/${generated.id}`)).json() as Run;
  assert.equal(initial.engine, 'local-composer'); assert.equal(initial.brief.mode, 'local');
  assert(initial.article.images.length >= 3); assert(initial.article.images.every(image => image.sourceMode === 'local' && image.url.startsWith('/api/assets/')));
  await expect.poll(() => result.locator('button[aria-label^="查看配图"] img').evaluateAll(images => images.length >= 3 && images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await result.getByRole('button', { name: '编辑正文', exact: true }).click();
  await result.getByLabel('作品标题', { exact: true }).fill(`[本地QA-不发布] ${initial.article.title}`);
  const editedResponse = page.waitForResponse(response => response.url().endsWith(`/api/runs/${initial!.id}/edit`) && response.request().method() === 'POST');
  await result.getByRole('button', { name: '保存并重新核验', exact: true }).click();
  edited = await (await editedResponse).json() as Run;
  assert.equal(edited.version, 2); assert.equal(edited.engine, 'local-composer'); assert.equal(edited.parentId, initial.id); assert.equal(edited.audit.releaseReady, false);
  await expect(result.getByRole('button', { name: /版本记录 V2/ })).toBeVisible();
  for (const item of [{ format: 'md', label: /Markdown/ }, { format: 'html', label: /HTML 图文/ }, { format: 'json', label: /JSON 数据/ }]) {
    await result.getByRole('button', { name: '导出草稿' }).click();
    const pending = page.waitForEvent('download'); await result.getByRole('button', { name: item.label }).click();
    const download = await pending; assert.equal(await download.failure(), null);
    const filename = path.join(output, `local-qa-draft.${item.format}`); await download.saveAs(filename);
    const body = fs.readFileSync(filename, 'utf8'); assert(body.includes('[本地QA-不发布]'));
    if (item.format === 'html') assert(body.includes('data:image/'), 'HTML export must embed real local image data.');
    if (item.format === 'json') assert.equal((JSON.parse(body) as Run).brief.mode, 'local');
    files.push({ format: item.format, file: path.basename(filename), bytes: fs.statSync(filename).size });
  }
  await result.getByRole('tab', { name: /核验结果/ }).click();
  await result.evaluate(element => window.scrollTo({ top: scrollY + element.getBoundingClientRect().top - 20, behavior: 'instant' }));
  await page.screenshot({ path: path.join(output, 'local-qa-audit.png') });
  assert.deepEqual(errors, []); assert.deepEqual(blockedRequests, [], 'The local-only flow must not even attempt an ima or external request.');
  const report = { scope: 'Local snapshot UI QA only; not ima competition acceptance', product: product.name, sourceMode: 'local', engine: 'local-composer', createdRunId: initial.id, editedRunId: edited.id, version: edited.version, imageCount: edited.article.images.length, releaseReady: edited.audit.releaseReady, exports: files, imageOrigin: '/api/assets/', realImaRequests: 0, pageErrors: errors, blockedRequests, checkedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  process.stdout.write(JSON.stringify({ ok: true, output, ...report }, null, 2));
} finally { await context.close(); await browser.close(); }
