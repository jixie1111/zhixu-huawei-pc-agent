import { test, expect } from '@playwright/test';
import type { Bootstrap } from '../../shared/types';

test('截图仅包含隔离合成QA资料，不作为真实ima验收证据', async ({ page }, testInfo) => {
  await page.route('**/api/bootstrap', async route => {
    const response = await route.fetch();
    const data = await response.json() as Bootstrap;
    // The 1px fixture is not product photography: exercise the intentional empty-cover design.
    data.products = data.products.map(product => ({ ...product, cover: undefined }));
    await route.fulfill({ response, json: data });
  });
  await page.goto('/');
  await page.getByRole('button',{name:'经典表单',exact:true}).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.evaluate(() => {
    const stamp = document.createElement('div');
    stamp.id = 'qa-screenshot-stamp';
    stamp.textContent = 'QA 合成数据 · 非真实产品 / ima 验收证据';
    stamp.style.cssText = 'position:fixed;bottom:10px;right:12px;z-index:1000;background:#fcf3de;border:1px solid #e5d4ad;color:#8b764f;border-radius:6px;padding:5px 9px;font:10px Microsoft YaHei,sans-serif;pointer-events:none';
    document.body.append(stamp);
  });
  if (testInfo.project.name === 'mobile') {
    await page.screenshot({ path: 'tmp/ui-workspace-mobile.png', animations: 'disabled' });
    await page.locator('.composer').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'tmp/ui-form-mobile.png', animations: 'disabled' });
  } else {
    await page.screenshot({ path: 'tmp/ui-workspace-desktop.png', animations: 'disabled' });
  }
  await page.getByRole('radio', { name: /规则预览/ }).check();
  await page.getByRole('button', { name: '开学季', exact: true }).click();
  await page.getByRole('button', { name: '开始创作', exact: true }).click();
  const result = page.getByRole('region', { name: '创作结果' });
  await expect(result).toBeVisible();
  for (const tab of ['图文预览', '创作策略', '知识依据', '核验结果']) {
    await result.getByRole('tab', { name: new RegExp(tab) }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
  await result.getByRole('tab', { name: '创作策略' }).click();
  await result.evaluate(element => window.scrollTo({ top: window.scrollY + element.getBoundingClientRect().top - 24, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `tmp/ui-result-${testInfo.project.name}.png`, animations: 'disabled' });
});
