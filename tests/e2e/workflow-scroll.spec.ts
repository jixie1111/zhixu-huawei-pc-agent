import { test, expect, type Locator, type Page } from '@playwright/test';

async function expectInView(target: Locator) {
  await expect(target).toBeInViewport();
  await expect.poll(async () => {
    const bounds = await target.boundingBox();
    return bounds !== null && bounds.y >= 60;
  }).toBe(true);
}

async function prepareDirection(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '规则体验', exact: true }).click();
  await page.getByLabel('创作想法').fill('为大学新生写一篇开学季小红书，介绍产品特点');
  await page.getByRole('button', { name: '整理创作方向', exact: true }).click();
  const choice = page.locator('.brief-card');
  await expect(choice).toBeVisible();
  const catalog = await (await page.request.get('/api/bootstrap')).json();
  await page.getByLabel('策划产品型号').selectOption(catalog.products[0].id);
  return choice;
}

async function holdRequest(page: Page, endpoint = '/api/generate') {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**' + endpoint, async route => {
    await pending;
    await route.continue();
  });
  return release;
}

test('流程逐步定位到需求确认、创意方案、执行进度和最终作品', async ({ page }, testInfo) => {
  const choice = await prepareDirection(page);
  await expectInView(choice.getByRole('heading', { level: 2 }));
  await page.getByRole('button', { name: '确认方向，开始策划', exact: true }).click();
  const plans = page.getByRole('region', { name: '创意方案' });
  await expectInView(plans.getByRole('heading', { name: '三种写法，选一个', exact: true }));

  const release = await holdRequest(page);
  try {
    await page.getByRole('button', { name: '生成规则体验稿', exact: true }).click();
    const pipeline = page.getByRole('region', { name: '智能体执行过程' });
    await expectInView(pipeline.getByRole('heading', { name: '智能体正在工作', exact: true }));
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath('generation-progress-in-view.png') });

    // Updating the elapsed clock must not repeatedly steal the user's scroll.
    const before = await pipeline.locator('.pipeline-clock').innerText();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect(pipeline.locator('.pipeline-clock')).not.toHaveText(before);
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  } finally { release(); }

  const result = page.getByRole('region', { name: '创作结果' });
  await expectInView(result.locator('.result-heading h2'));
});

test('已有作品再次生成时定位到执行进度，不跳到顶部或旧作品', async ({ page }) => {
  await prepareDirection(page);
  await page.getByRole('button', { name: '确认方向，开始策划', exact: true }).click();
  await page.getByRole('button', { name: '生成规则体验稿', exact: true }).click();
  const result = page.getByRole('region', { name: '创作结果' });
  await expect(result).toBeVisible();

  const release = await holdRequest(page);
  try {
    await result.getByLabel('换个平台').selectOption('poster');
    await result.getByRole('button', { name: '转换平台', exact: true }).click();
    await expectInView(page.getByRole('heading', { name: '智能体正在工作', exact: true }));
  } finally { release(); }
  await expect(result.getByRole('button', { name: /版本记录 V2/ })).toBeVisible();
});

test('经典表单生成时仍自动显示进度区域', async ({ page }) => {
  await page.goto('/?workspace=classic');
  await page.getByRole('radio', { name: /规则预览/ }).check();
  const release = await holdRequest(page);
  try {
    await page.getByRole('button', { name: '开始创作', exact: true }).click();
    await expectInView(page.locator('.generation-progress .generation-title'));
  } finally { release(); }
  await expect(page.getByRole('region', { name: '创作结果' })).toBeVisible();
});

test('需求理解与策划的等待区也跟随流程，并支持减少动态效果', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const releaseIntent = await holdRequest(page, '/api/director/interpret');
  const releasePlan = await holdRequest(page, '/api/director/plan');
  try {
    await page.goto('/');
    await page.getByRole('button', { name: '规则体验', exact: true }).click();
    await page.getByLabel('创作想法').fill('为大学新生写一篇开学季小红书，介绍产品特点');
    await page.getByRole('button', { name: '整理创作方向', exact: true }).click();
    await expectInView(page.locator('.director-busy'));
    releaseIntent();
    await expectInView(page.locator('.brief-card h2'));
    const catalog = await (await page.request.get('/api/bootstrap')).json();
    await page.getByLabel('策划产品型号').selectOption(catalog.products[0].id);
    await page.getByRole('button', { name: '确认方向，开始策划', exact: true }).click();
    await expectInView(page.locator('.director-busy'));
    await expect(page.locator('.director-busy')).toContainText('正在策划三个写法');
    releasePlan();
    await expectInView(page.getByRole('heading', { name: '三种写法，选一个', exact: true }));
  } finally { releaseIntent(); releasePlan(); }
});
