import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

// Explicit local artifact only: never discover, fetch or authenticate external sources.
const directory = path.resolve(process.argv[2] || '');
assert.ok(process.argv[2], 'Provide the private demo directory explicitly.');
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'MANIFEST.json'), 'utf8'));
assert.equal(manifest.status, 'LOCAL_OFFLINE_DRAFT_ONLY');
assert.equal(manifest.formalOnlineAcceptance, false);
for (const file of manifest.files) {
  assert.equal(path.basename(file.path), file.path);
  const body = fs.readFileSync(path.join(directory, file.path));
  assert.equal(body.length, file.bytes);
  assert.equal(createHash('sha256').update(body).digest('hex'), file.sha256);
}
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) });
const results: object[] = [], externalRequests: string[] = [], errors: string[] = [];
const evidenceDirectory = path.resolve('tmp/offline-demo-qa');
fs.mkdirSync(evidenceDirectory, { recursive: true });
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const name = viewport.width === 390 ? 'mobile' : 'desktop';
    const context = await browser.newContext({ viewport, offline: true });
    await context.route(/^https?:\/\//, route => { externalRequests.push(new URL(route.request().url()).origin); return route.abort(); });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const indexUrl = pathToFileURL(path.join(directory, 'index.html')).href;
    await page.goto(indexUrl);
    assert.equal(await page.locator('.case').count(), 3);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(evidenceDirectory, `index-${name}.png`), fullPage: true });
    for (const [index, item] of manifest.cases.entries()) {
      await page.locator('a.open').nth(index).click();
      assert.equal(page.url(), pathToFileURL(path.join(directory, item.html)).href);
      assert.equal(await page.locator('[aria-label="离线草稿声明"]').count(), 1);
      assert.ok((await page.locator('body').innerText()).includes('非正式参赛案例'));
      await page.locator('img').evaluateAll(async images => Promise.all(images.map(image => (image as HTMLImageElement).decode())));
      const images = await page.locator('img').evaluateAll(images => images.map(element => {
        const image = element as HTMLImageElement;
        return { embedded: image.src.startsWith('data:image/'), width: image.naturalWidth, height: image.naturalHeight, complete: image.complete };
      }));
      assert.equal(images.length, item.imageCount);
      assert.ok(images.every(image => image.embedded && image.complete && image.width > 0 && image.height > 0));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.locator('summary').click();
      assert.equal(await page.locator('details').getAttribute('open'), '');
      await page.locator('summary').click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(evidenceDirectory, `case-${index + 1}-${name}.png`), fullPage: true });
      results.push({ viewport: name, case: item.html, images, passed: true });
      await page.getByRole('link', { name: '返回演示目录 ↗' }).click();
      assert.equal(page.url(), indexUrl);
    }
    await context.close();
  }
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(errors, []);
  const report = { checkedAt: new Date().toISOString(), status: 'LOCAL_OFFLINE_BROWSER_QA_PASSED', formalOnlineAcceptance: false, offline: true, externalRequests: externalRequests.length, pageErrors: errors.length, manifestFilesVerified: manifest.files.length, results };
  fs.writeFileSync(path.join(evidenceDirectory, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
