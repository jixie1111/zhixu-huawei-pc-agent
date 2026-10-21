import { test, expect, type Page } from '@playwright/test';
import type { Bootstrap, Evidence } from '../../shared/types';

const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const errors: string[] = []; runtimeErrors.set(page, errors); page.on('pageerror', error => errors.push(error.message)); });
test.afterEach(({ page }) => expect(runtimeErrors.get(page) || [], '页面不得出现未捕获异常').toEqual([]));

async function openPage(page: Page, hash = '') {
  await page.goto('/' + hash);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  if (!hash || hash === '#studio') {
    await page.getByRole('button',{name:'经典表单',exact:true}).click();
    await page.getByRole('radio', { name: /规则预览/ }).check();
  }
}
async function create(page: Page) {
  await openPage(page);
  await page.getByRole('button', { name: '开学季', exact: true }).click();
  await page.getByRole('button', { name: '开始创作', exact: true }).click();
  await expect(page.getByRole('region', { name: '创作结果' })).toBeVisible();
  await expect(page.getByRole('button', { name: '导出草稿' })).toBeEnabled();
}

test('首屏、来源标识、八场景四平台与必填校验', async ({ page }) => {
  const pageErrors: string[] = []; page.on('pageerror', error => pageErrors.push(error.message));
  await openPage(page);
  await expect(page.getByLabel('产品型号')).toContainText('虚构 QA Notebook A');
  for (const name of ['开学季', '职场办公', '内容创作', '家庭换新', '企业采购', '门店到访', '新品首发', '节日营销']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  for (const name of ['小红书', '微信公众号', '门店朋友圈', '门店海报']) await expect(page.getByRole('radio', { name: new RegExp(name) })).toBeAttached();
  await page.getByLabel('目标人群').fill('');
  await page.getByRole('button', { name: '开始创作', exact: true }).click();
  await expect(page.getByRole('region', { name: '创作结果' })).toHaveCount(0);
  expect(await page.getByLabel('目标人群').evaluate((element: HTMLInputElement) => element.validity.valueMissing)).toBe(true);
  expect(pageErrors).toEqual([]);
});

test('生成、策略、依据、核验和草稿下载完整闭环', async ({ page }) => {
  await create(page);
  const result = page.getByRole('region', { name: '创作结果' });
  await expect(result.getByText('规则预览 · 未调用模型')).toBeVisible();
  await expect(result.getByRole('button', { name: /^查看配图/ })).toHaveCount(3);
  await expect(result.locator('[data-image-slot="cover"] button')).toHaveCount(1);
  await expect(result.locator('.article-body > section').nth(0).locator('[data-image-slot="after-1"] button')).toHaveCount(1);
  await expect(result.locator('.article-body > section').nth(1).locator('[data-image-slot="after-2"] button')).toHaveCount(1);
  await expect.poll(() => result.locator('button[aria-label^="查看配图"] img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await result.getByRole('button', { name: /^查看配图 1/ }).click();
  await expect(page.getByRole('dialog', { name: '配图与来源' })).toBeVisible();
  await page.keyboard.press('Escape');
  await result.getByRole('tab', { name: '创作策略' }).click();
  await expect(result.getByRole('heading', { name: '为什么这样写？' })).toBeVisible();
  await result.getByRole('tab', { name: '知识依据' }).click();
  await expect(result.getByRole('heading', { name: '每一句亮点，都有来处。' })).toBeVisible();
  await expect(result.locator('.fact-detail')).toHaveCount(3);
  await result.getByRole('tab', { name: /核验结果/ }).click();
  await expect(result.getByText('这是本地知识库的规则预览稿。')).toBeVisible();
  await result.getByRole('button', { name: '导出草稿' }).click();
  const downloadPromise = page.waitForEvent('download');
  await result.getByRole('button', { name: /Markdown/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/待审核草稿\.md$/);
  expect(await download.failure()).toBeNull();
  for (const format of [{ label: /HTML 图文/, extension: 'html' }, { label: /JSON 数据/, extension: 'json' }]) {
    await result.getByRole('button', { name: '导出草稿' }).click();
    const pending = page.waitForEvent('download');
    await result.getByRole('button', { name: format.label }).click();
    const file = await pending;
    expect(file.suggestedFilename()).toMatch(new RegExp(`待审核草稿\\.${format.extension}$`));
    expect(await file.failure()).toBeNull();
  }
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await result.getByRole('button', { name: '复制正文', exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('【待人工审核草稿，不可直接发布】');
});

test('编辑创建新版本、阻断风险并保留版本记录', async ({ page }) => {
  await create(page);
  const result = page.getByRole('region', { name: '创作结果' });
  await result.getByRole('button', { name: '编辑正文', exact: true }).click();
  await result.getByLabel('话题标签', { exact: true }).fill('场景标签');
  await result.getByLabel('话题标签', { exact: true }).press('End');
  await result.getByLabel('话题标签', { exact: true }).press('Enter');
  await result.getByLabel('话题标签', { exact: true }).pressSequentially('second-tag');
  await expect(result.getByLabel('话题标签', { exact: true })).toHaveValue('场景标签\nsecond-tag');
  await result.getByLabel('第 1 段正文', { exact: true }).fill('全网第一，限时只要999元，吊打竞品。');
  await result.getByRole('button', { name: '保存并重新核验', exact: true }).click();
  await expect(result.getByRole('button', { name: /版本记录 V2/ })).toBeVisible();
  await expect(result.locator('.article-tags')).toContainText('#second-tag');
  await result.getByRole('tab', { name: /核验结果/ }).click();
  await expect(result.getByText('这份内容需要先处理风险')).toBeVisible();
  await expect(result.getByText('绝对化宣传或无依据排名')).toBeVisible();
  await result.getByRole('button', { name: /版本记录/ }).click();
  const modal = page.getByRole('dialog', { name: '作品版本记录' });
  await expect(modal).toBeVisible();
  await expect(modal.locator('.version-number')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
});

test('平台转换重新生成，海报保持一图最多三个卖点', async ({ page }) => {
  await create(page);
  const result = page.getByRole('region', { name: '创作结果' });
  await result.getByLabel('换个平台').selectOption('poster');
  await result.getByRole('button', { name: '转换平台' }).click();
  await expect(result.getByRole('button', { name: /版本记录 V2/ })).toBeVisible();
  await expect(result.getByRole('button', { name: /^查看配图/ })).toHaveCount(1);
  expect(await result.locator('.article-body > section').count()).toBeLessThanOrEqual(3);
  await result.getByRole('tab', { name: '创作策略' }).click();
  await expect(result.getByText('60–150 字 · 1–1 张同型号图片')).toBeVisible();
});

test('知识检索、无结果与产品图来源弹窗', async ({ page }) => {
  await openPage(page, '#knowledge');
  await page.getByLabel('搜索知识库').fill('不存在的关键词-qa');
  await expect(page.getByRole('heading', { name: '没有找到匹配的资料' })).toBeVisible();
  await page.getByRole('button', { name: '查看全部资料' }).click();
  await expect(page.locator('.document-row')).toHaveCount(1);
  await page.locator('.document-row').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '产品图库', exact: true }).click();
  await expect(page.locator('.gallery-item')).toHaveCount(6);
  await page.locator('.gallery-item').first().click();
  await expect(page.getByRole('dialog', { name: '产品素材与来源' })).toBeVisible();
  await page.getByRole('button', { name: '关闭窗口' }).click();
});

test('核验中心风险样例与修改后结果过期提示', async ({ page }) => {
  await openPage(page, '#audit');
  await page.getByRole('button', { name: '试一段风险样例' }).click();
  await page.getByRole('button', { name: '开始核验', exact: true }).click();
  await expect(page.getByRole('heading', { name: '核验结果', exact: true })).toBeVisible();
  await expect(page.getByText('绝对化宣传或无依据排名').first()).toBeVisible();
  await page.getByLabel('待核验文案').fill('欢迎带上常用软件到店体验。');
  await expect(page.getByText('文案已经修改，以下仍是上一次检查结果。请重新核验。')).toBeVisible();
  await page.getByRole('button', { name: '开始核验', exact: true }).click();
  await expect(page.getByText('绝对化宣传或无依据排名')).toHaveCount(0);
});

test('设置字段为密码且只显示真实连接状态，不发起第三方调用', async ({ page }) => {
  await openPage(page, '#settings');
  for (const name of ['ima Client ID', 'ima API Key', '模型 API Key']) await expect(page.getByLabel(name, { exact: true })).toHaveAttribute('type', 'password');
  await expect(page.getByText('ima 尚未通过连接测试')).toBeVisible();
  await expect(page.getByLabel('ima API Key', { exact: true })).toHaveValue('');
  expect(await page.evaluate(() => Object.keys(localStorage).length)).toBe(0);
});

test('运行时配置保存后清空输入，清除操作可取消和确认', async ({ page }) => {
  await openPage(page, '#settings');
  await page.getByLabel('ima Client ID', { exact: true }).fill('qa-e2e-synthetic-client');
  await page.getByLabel('ima API Key', { exact: true }).fill('qa-e2e-synthetic-secret');
  await page.getByRole('button', { name: '保存连接配置', exact: true }).click();
  await expect(page.getByLabel('ima API Key', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('ima Client ID', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: '清除运行时凭证', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '清除本次运行的连接凭证？' })).toBeVisible();
  await page.getByRole('button', { name: '保留配置', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '清除运行时凭证', exact: true }).click();
  await page.getByRole('button', { name: '确认清除', exact: true }).click();
  await expect(page.getByText('运行时凭证已清除；环境变量配置仍由部署环境管理')).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).length)).toBe(0);
});

test('缺在线配置阻止生成，服务器失败可见且能恢复本地创作', async ({ page }) => {
  await page.route('**/api/bootstrap', async route => {
    const response = await route.fetch();
    const bootstrap = await response.json() as Bootstrap;
    bootstrap.settings = { ...bootstrap.settings, imaConfigured: false, llmConfigured: false, connected: false };
    await route.fulfill({ response, json: bootstrap });
  });
  await openPage(page);
  await page.getByRole('radio', { name: /ima 共享知识库/ }).check();
  await expect(page.getByRole('button', { name: '开始创作', exact: true })).toBeDisabled();
  await expect(page.getByText('请先配置有效 ima 凭证，再使用在线资料检索。')).toBeVisible();
  await page.getByRole('radio', { name: /本地知识库/ }).check();
  await page.route('**/api/generate', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'QA_UNAVAILABLE', message: 'QA合成失败，稍后重试。' }) }), { times: 1 });
  await page.getByRole('button', { name: '开始创作', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('QA合成失败，稍后重试。');
  await expect(page.getByRole('button', { name: '开始创作', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '开始创作', exact: true }).click();
  await expect(page.getByRole('region', { name: '创作结果' })).toBeVisible();
});

test('无模型时仍能只读取证，来源清楚且不调用生成', async ({ page }) => {
  const bootstrap = await (await page.request.get('/api/bootstrap')).json() as Bootstrap;
  const source = await (await page.request.get(`/api/products/${bootstrap.products[0].id}`)).json() as Evidence;
  const online = { ...source, facts: source.facts.map(fact => ({ ...fact, sourceMode: 'ima' })), images: source.images.map(image => ({ ...image, sourceMode: 'ima' })), warnings: ['QA合成在线检索响应，不代表真实ima验收。'] };
  let retrievals = 0;
  let generations = 0;
  await page.route('**/api/bootstrap', route => route.fulfill({ json: { ...bootstrap, settings: { ...bootstrap.settings, imaConfigured: true, llmConfigured: false, connected: false } } }));
  await page.route('**/api/retrieve', route => { retrievals++; expect(route.request().postDataJSON()).toEqual({ productId: source.product.id, mode: 'ima' }); return route.fulfill({ json: online }); });
  await page.route('**/api/generate', route => { generations++; return route.abort(); });
  await openPage(page);
  await page.getByRole('radio', { name: /ima 共享知识库/ }).check();
  await expect(page.getByRole('button', { name: '开始创作', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '预览 ima 取证' }).click();
  const modal = page.getByRole('dialog', { name: /^ima 在线取证/ });
  await expect(modal).toBeVisible();
  await expect(modal.getByText('QA合成在线检索响应，不代表真实ima验收。')).toBeVisible();
  await expect(modal.locator('.fact-detail')).toHaveCount(3);
  await expect(modal.locator('.image-evidence-grid article')).toHaveCount(6);
  await modal.locator('.fact-detail').first().locator('summary').click();
  await expect(modal.getByRole('link', { name: '查看事实来源' }).first()).toHaveAttribute('href', /^https:\/\/consumer\.huawei\.com\//);
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  expect(retrievals).toBe(1);
  expect(generations).toBe(0);
});

test('本地改写边界明确，任意语气被拒绝且精简生成新版本', async ({ page }) => {
  await create(page);
  const result = page.getByRole('region', { name: '创作结果' });
  await expect(result.getByText('规则预览支持精简/缩短与平台转换；其他语气或结构调整请直接编辑正文。')).toBeVisible();
  await result.getByLabel('改写指令').fill('请改成有趣的幽默风格');
  await result.getByRole('button', { name: '按指令改写' }).click();
  await expect(page.getByRole('alert')).toContainText('规则预览仅支持');
  await expect(result.getByRole('button', { name: /版本记录 V1/ })).toBeVisible();
  const oldCount = await result.locator('.article-body > section').count();
  await result.getByLabel('改写指令').fill('精简正文');
  await result.getByRole('button', { name: '按指令改写' }).click();
  await expect(result.getByRole('button', { name: /版本记录 V2/ })).toBeVisible();
  expect(await result.locator('.article-body > section').count()).toBeLessThan(oldCount);
});

test('等待中的创作可取消，不展示假完成结果', async ({ page }) => {
  await openPage(page);
  let release: () => void = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/generate', async route => { await held; await route.abort().catch(() => {}); }, { times: 1 });
  try {
    await page.getByRole('button', { name: '开始创作', exact: true }).click();
    await expect(page.getByRole('button', { name: '停止等待', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '停止等待', exact: true }).click();
    await expect(page.getByRole('button', { name: '开始创作', exact: true })).toBeEnabled();
    await expect(page.getByRole('region', { name: '创作结果' })).toHaveCount(0);
    await expect(page.getByText('已停止等待；可到作品记录确认是否已有结果')).toBeVisible();
  } finally { release(); }
});

test('导航与弹窗支持键盘，移动导航能关闭并进入作品记录', async ({ page }, testInfo) => {
  await openPage(page);
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: '打开导航' }).click();
  const navigation = page.getByRole('navigation', { name: '主导航' });
  await navigation.getByRole('button', { name: /^作品记录/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '好想法，值得好好留存。' })).toBeVisible();
  if (testInfo.project.name === 'mobile') await expect(page.getByRole('button', { name: '关闭导航' })).toHaveCount(0);
  const help = page.getByRole('button', { name: '使用指南' });
  await help.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.getByRole('dialog').evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(help).toBeFocused();
});

test('各页面在当前视口无横向溢出并保存QA截图', async ({ page }, testInfo) => {
  for (const hash of ['', '#knowledge', '#history', '#audit', '#settings']) {
    await openPage(page, hash);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  }
  await openPage(page);
  await page.screenshot({ path: testInfo.outputPath('qa-synthetic-workspace.png'), fullPage: true });
});
