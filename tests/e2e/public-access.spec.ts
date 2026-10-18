import { test, expect } from '@playwright/test';
import type { Bootstrap, Run, RunSummary } from '../../shared/types';
import { brief, syntheticPng } from '../fixtures';

test('公开访问令牌恢复作品，受保护图片带头读取，撤销后清空私有内容', async ({ page }, testInfo) => {
  // This browser-only mock tests authorization plumbing, never live ima or LLM.
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const seed = await (await page.request.get('/api/bootstrap')).json() as Bootstrap;
  const generated = await page.request.post('/api/generate', { data: { ...brief, productId: seed.products[0].id } });
  const payload = /event: result\ndata: ([^\n]+)/.exec(await generated.text());
  expect(payload, '独立合成服务需要先产生QA测试稿').not.toBeNull();
  const run = JSON.parse(payload![1]) as Run;
  run.article.title = '[QA合成] 公开鉴权回归';
  run.article.images = run.article.images.map((image, index) => ({ ...image, id: `qa-public-${index}`, url: `/api/ima-assets/qa-public-${index}`, sourceMode: 'ima' }));
  const summary: RunSummary = { id: run.id, createdAt: run.createdAt, updatedAt: run.updatedAt, version: run.version, brief: run.brief, engine: run.engine, durationMs: run.durationMs, title: run.article.title, status: run.audit.status, releaseReady: false, cover: run.article.images[0].url };
  const publicBootstrap = { ...seed, runs: [], settings: { ...seed.settings, publicDeployment: true }, stats: { documents: 0, images: 0, products: 1, categories: 0 }, products: [{ ...seed.products[0], factCount: 0, imageCount: 0, cover: undefined }] };
  const token = 'qa-public-synthetic-access-token';
  const imageHeaders: string[] = [];
  let authorizedHistoryReads = 0;
  await page.route('**/api/bootstrap', route => route.fulfill({ json: publicBootstrap }));
  await page.route('**/api/runs', route => {
    if (route.request().headers()['x-admin-token'] !== token) return route.fulfill({ status: 401, json: { code: 'ADMIN_REQUIRED', message: 'QA合成：需要访问令牌' } });
    authorizedHistoryReads++;
    return route.fulfill({ json: [summary] });
  });
  await page.route(`**/api/runs/${run.id}`, route => route.request().headers()['x-admin-token'] === token ? route.fulfill({ json: run }) : route.fulfill({ status: 401, json: { message: 'QA合成：需要访问令牌' } }));
  await page.route('**/api/ima-assets/*', route => {
    const supplied = route.request().headers()['x-admin-token'] || '';
    imageHeaders.push(supplied);
    return supplied === token ? route.fulfill({ contentType: 'image/png', body: syntheticPng }) : route.fulfill({ status: 401, json: { message: 'QA合成：图片需要访问令牌' } });
  });

  await page.goto('/#settings');
  await page.getByText('管理公开环境的访问令牌', { exact: true }).click();
  await page.getByLabel('管理员访问令牌', { exact: true }).fill(token);
  await page.getByRole('button', { name: '应用令牌', exact: true }).click();
  await expect(page.getByLabel('管理员访问令牌', { exact: true })).toHaveValue('');
  await expect.poll(() => authorizedHistoryReads).toBeGreaterThan(0);
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: '打开导航' }).click();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: /^作品记录/ }).click();
  await page.locator('.history-card').filter({ hasText: '[QA合成] 公开鉴权回归' }).click();
  const result = page.getByRole('region', { name: '创作结果' });
  await expect(result).toBeVisible();
  await expect.poll(() => result.locator('button[aria-label^="查看配图"] img').evaluateAll(images => images.length > 0 && images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  expect(imageHeaders.length).toBeGreaterThan(0);
  expect(imageHeaders.every(header => header === token), '图片不得用无令牌的img裸请求').toBe(true);

  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: '打开导航' }).click();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '连接设置', exact: true }).click();
  await page.getByText('管理公开环境的访问令牌', { exact: true }).click();
  await page.getByRole('button', { name: '清除访问令牌', exact: true }).click();
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: '打开导航' }).click();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: /^作品记录/ }).click();
  await expect(page.locator('.history-card')).toHaveCount(0);
  await expect(page.getByText('[QA合成] 公开鉴权回归')).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage).length)).toBe(0);
  expect(errors).toEqual([]);
});
