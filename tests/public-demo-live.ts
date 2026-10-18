/** Real deployed-browser acceptance. No routes or mock responses; no model/ima calls. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium, expect, type Page, type Frame } from '@playwright/test';

const target = process.argv[2];
if (!target) throw new Error('Pass a deployed HTTPS URL or a private deployment-result JSON file.');
const url = target.startsWith('https://') || target.startsWith('http://127.0.0.1:') ? target : JSON.parse(await fs.readFile(target, 'utf8')).urls.share_url;
const address = new URL(url);
if (address.protocol !== 'https:' && address.hostname !== '127.0.0.1') throw new Error('HTTPS deployment or loopback only.');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const directory = path.resolve('private', `public-live-${stamp}`);
await fs.mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
const report: { site: string; at: string; cases: unknown[]; errors: string[]; apiRequests: string[]; video?: string; passed?: boolean } = {
  site: address.origin + address.pathname, at: new Date().toISOString(), cases: [], errors: [], apiRequests: [],
};
const readRecords = (page: Page | Frame) => page.evaluate(() => JSON.parse(localStorage.getItem('zhixu-public-demo-v1') || '[]') as { id: string; version: number; brief: { scene: string; platform: string; generation: string }; article: { title: string; sections: unknown[] }; parentId?: string }[]);
try {
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, acceptDownloads: true,
      ...(viewport.name === 'desktop' ? { recordVideo: { dir: directory, size: { width: 1440, height: 1000 } } } : {}) });
    const rootPage = await context.newPage();
    rootPage.setDefaultTimeout(30000);
    rootPage.on('pageerror', error => report.errors.push(`${viewport.name}: ${error.message}`));
    rootPage.on('request', request => { const requestUrl = new URL(request.url()); if (requestUrl.origin === address.origin && requestUrl.pathname.startsWith('/api/')) report.apiRequests.push(request.url().split('?')[0]); });
    await rootPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // ModelScope may wrap the real app in its public studio iframe.
    await expect.poll(() => rootPage.frames().some(frame => frame.url().startsWith(address.origin)), { timeout: 60000 }).toBe(true);
    let page: Page | Frame = rootPage.frames().find(frame => frame.url().startsWith(address.origin))!;
    await page.getByRole('button', { name: '开始创作', exact: true }).waitFor();
    await rootPage.screenshot({ path: path.join(directory, `workspace-${viewport.name}.png`), fullPage: false });
    for (const scenario of [{ scene: '开学季', sceneId: 'school', platform: 'xiaohongshu', images: 3 }, { scene: '职场办公', sceneId: 'office', platform: 'wechat', images: 2 }, { scene: '门店到访', sceneId: 'store', platform: 'moments', images: 1 }]) {
      await page.locator(`input[name="platform"][value="${scenario.platform}"]`).check({ force: true });
      await page.getByRole('button', { name: scenario.scene, exact: true }).click();
      const oldId = (await readRecords(page))[0]?.id;
      await page.getByRole('button', { name: '开始创作', exact: true }).click();
      await page.waitForFunction(id => JSON.parse(localStorage.getItem('zhixu-public-demo-v1') || '[]')[0]?.id !== id, oldId);
      const current: Awaited<ReturnType<typeof readRecords>>[number] = (await readRecords(page))[0];
      assert.equal(current.brief.scene, scenario.sceneId); assert.equal(current.brief.platform, scenario.platform); assert.equal(current.brief.generation, 'rules');
      const images = page.locator('.article-preview .article-image img');
      await expect(images).toHaveCount(scenario.images);
      for (const img of await images.all()) { await img.scrollIntoViewIfNeeded(); await img.evaluate(async node => { const image = node as HTMLImageElement; if (!image.complete) await image.decode(); if (!image.naturalWidth) throw new Error('Official product image did not decode'); }); }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
      await page.locator('.result-section').scrollIntoViewIfNeeded();
      await rootPage.screenshot({ path: path.join(directory, `${scenario.sceneId}-${viewport.name}.png`), fullPage: false });
      report.cases.push({ viewport: viewport.name, scene: scenario.sceneId, platform: scenario.platform, id: current.id, imageCount: scenario.images });
      if (viewport.name === 'desktop' && scenario.sceneId === 'school') {
        for (const [format, label] of [['md', 'Markdown'], ['html', 'HTML 图文'], ['json', 'JSON 数据']] as const) {
          await page.getByRole('button', { name: '导出草稿', exact: true }).click();
          const downloadEvent = rootPage.waitForEvent('download');
          await page.getByRole('button', { name: new RegExp(label) }).click();
          const download = await downloadEvent;
          const output = path.join(directory, `school.${format}`);
          await download.saveAs(output);
          const content = await fs.readFile(output, 'utf8');
          assert.ok(content.includes('公开官网摘录'));
          if (format === 'html') assert.equal((content.match(/<img src="data:image\//g) || []).length, 3);
          if (format === 'json') { const run = JSON.parse(content); assert.equal(run.demo, true); assert.equal(run.engine, 'local-composer'); assert.equal(run.audit.releaseReady, false); }
        }
      }
    }
    if (viewport.name === 'desktop') {
      const prior = (await readRecords(page))[0];
      await page.getByLabel('换个平台', { exact: true }).selectOption('poster');
      await page.getByRole('button', { name: '转换平台' }).click();
      await page.waitForFunction(id => JSON.parse(localStorage.getItem('zhixu-public-demo-v1') || '[]')[0]?.id !== id, prior.id);
      const poster = (await readRecords(page))[0];
      assert.equal(poster.parentId, prior.id); assert.equal(poster.brief.platform, 'poster'); assert.ok(poster.article.sections.length <= 3);
      await page.getByRole('button', { name: '编辑正文', exact: true }).click();
      await page.getByLabel('作品标题', { exact: true }).fill(poster.article.title + ' · 体验清单');
      await page.getByRole('button', { name: '保存并重新核验', exact: true }).click();
      await page.waitForFunction(id => JSON.parse(localStorage.getItem('zhixu-public-demo-v1') || '[]')[0]?.id !== id, poster.id);
      const edited = (await readRecords(page))[0];
      assert.equal(edited.parentId, poster.id); assert.equal(edited.version, poster.version + 1);
      report.cases.push({ platformConversion: true, manualEdit: true, id: edited.id, version: edited.version });
    }
    const before = await readRecords(page);
    await rootPage.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => rootPage.frames().some(frame => frame.url().startsWith(address.origin)), { timeout: 60000 }).toBe(true);
    page = rootPage.frames().find(frame => frame.url().startsWith(address.origin))!;
    await page.getByRole('button', { name: '开始创作', exact: true }).waitFor();
    assert.deepEqual((await readRecords(page)).map(record => record.id), before.map(record => record.id));
    await page.evaluate(() => { location.hash = 'settings'; });
    await page.getByRole('heading', { name: '打开就能创作，无需配置密钥。' }).waitFor();
    assert.equal(await page.locator('input[type="password"]').count(), 0);
    const video = rootPage.video();
    await context.close();
    if (video) report.video = await video.path();
  }
  assert.deepEqual(report.apiRequests, []); assert.deepEqual(report.errors, []); report.passed = true;
} catch (error) { report.passed = false; report.errors.push(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
finally { await browser.close(); await fs.writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ passed: report.passed, site: report.site, cases: report.cases.length, errors: report.errors, apiRequests: report.apiRequests.length, directory }, null, 2));
