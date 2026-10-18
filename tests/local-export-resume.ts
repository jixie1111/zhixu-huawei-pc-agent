import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Run, RunSummary } from '../shared/types';

// Read-only recovery of a previously UI-generated local QA draft. Never generates again.
const base = 'http://127.0.0.1:3000';
const output = path.resolve('private/qa-local', `export-resume-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const browser = await chromium.launch({ channel: 'msedge' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
context.setDefaultTimeout(20000);
const page = await context.newPage(), errors: string[] = [], blocked: string[] = [];
const files: object[] = [];
await context.route('**/*', route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== base || /^\/api\/(?:ima-assets|retrieve|settings|generate)(?:\/|$)/.test(url.pathname) || !['GET', 'HEAD'].includes(request.method())) {
    blocked.push(url.origin === base ? url.pathname : 'external-request');
    return route.abort();
  }
  return route.continue();
});
page.on('pageerror', error => errors.push(error.message));
try {
  const history = await (await context.request.get(`${base}/api/runs`)).json() as RunSummary[];
  const summary = history.find(run => run.brief.mode === 'local' && run.version === 2 && run.title.startsWith('[本地QA-不发布]') && run.brief.requirements.includes('local-ui-qa-'));
  assert(summary, 'A previously UI-edited local QA draft must exist.');
  const run = await (await context.request.get(`${base}/api/runs/${summary.id}`)).json() as Run;
  assert.equal(run.engine, 'local-composer'); assert.equal(run.audit.releaseReady, false);
  assert(run.parentId); assert(run.article.images.every(image => image.sourceMode === 'local'));
  const parent = await (await context.request.get(`${base}/api/runs/${run.parentId}`)).json() as Run;
  assert.equal(parent.version, 1); assert.equal(parent.brief.mode, 'local');
  await page.goto(`${base}/#history`, { waitUntil: 'networkidle' });
  await page.getByLabel('搜索作品', { exact: true }).fill('[本地QA-不发布]');
  await page.locator('.history-card').filter({ has: page.getByRole('heading', { name: run.article.title, exact: true }) }).first().click();
  const result = page.getByRole('region', { name: '创作结果' });
  await expect(result).toBeVisible();
  await expect(result.getByRole('button', { name: /版本记录 V2/ })).toBeVisible();
  await expect.poll(() => result.locator('button[aria-label^="查看配图"] img').evaluateAll(images => images.length >= 3 && images.every(element => (element as HTMLImageElement).naturalWidth > 0))).toBe(true);
  let reloads = 0;
  page.on('request', request => { if (request.isNavigationRequest() && request.resourceType() === 'document') reloads++; });
  fs.mkdirSync(output, { recursive: true });
  for (const item of [{ format: 'md', name: /Markdown/ }, { format: 'html', name: /HTML 图文/ }, { format: 'json', name: /JSON 数据/ }]) {
    await result.getByRole('button', { name: '导出草稿' }).click();
    const pending = page.waitForEvent('download', { timeout: 20000 });
    await result.getByRole('button', { name: item.name }).click();
    const download = await pending;
    assert.equal(await download.failure(), null);
    const filename = path.join(output, `local-qa-draft.${item.format}`);
    await download.saveAs(filename);
    const body = fs.readFileSync(filename, 'utf8');
    assert(body.includes('[本地QA-不发布]'));
    if (item.format === 'html') assert.equal((body.match(/<img src="data:image\//g) || []).length, run.article.images.length);
    if (item.format === 'json') { const data = JSON.parse(body) as Run; assert.equal(data.id, run.id); assert.equal(data.brief.mode, 'local'); assert.equal(data.audit.releaseReady, false); }
    // Give the dev file watcher time to react to the actual HTML download on disk.
    await page.waitForTimeout(1200);
    await expect(result).toBeVisible();
    assert.equal(reloads, 0, 'Saving an artifact must not reload the editor.');
    files.push({ format: item.format, bytes: fs.statSync(filename).size });
  }
  await result.getByRole('tab', { name: /核验结果/ }).click();
  await result.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, 'local-qa-audit.png') });
  assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
  const report = { status: 'LOCAL_UI_EXPORT_RESUME_PASSED', checkedAt: new Date().toISOString(), formalOnlineAcceptance: false, generatedAgain: false, sourceMode: 'local', runId: run.id, parentId: run.parentId, version: 2, product: run.evidence.product.name, imageCount: run.article.images.length, files, documentReloads: reloads, pageErrors: errors.length, realImaRequests: 0, blockedRequests: blocked.length };
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, ...report }, null, 2));
} finally { await context.close(); await browser.close(); }
