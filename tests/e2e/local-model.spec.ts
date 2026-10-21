import { test, expect } from '@playwright/test';
import type { Bootstrap, Brief, Run } from '../../shared/types';
import { brief } from '../fixtures';

test('经典入口默认免API规则，主动选择模型后缺配置不调用生成或ima', async ({ page }) => {
  const bootstrap = await (await page.request.get('/api/bootstrap')).json() as Bootstrap;
  await page.route('**/api/bootstrap', route => route.fulfill({ json: { ...bootstrap, settings: { ...bootstrap.settings, imaConfigured: false, llmConfigured: false, connected: false } } }));
  let generations = 0;
  let imaCalls = 0;
  await page.route('**/api/generate', route => { generations++; return route.abort(); });
  await page.route('**/api/retrieve', route => { imaCalls++; return route.abort(); });
  await page.goto('/');
  await page.getByRole('button',{name:'经典表单',exact:true}).click();
  await expect(page.getByRole('radio', { name: /本地知识库/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /规则预览/ })).toBeChecked();
  await expect(page.getByRole('button', { name: '开始创作', exact: true })).toBeEnabled();
  await page.getByRole('radio', { name: /AI 模型创作/ }).check();
  await expect(page.getByRole('radio', { name: /AI 模型创作/ })).toBeChecked();
  await expect(page.getByText('本地知识库已就绪。AI 创作只需配置模型，无需连接 ima；也可明确选择“规则预览”体验流程。')).toBeVisible();
  await expect(page.getByRole('button', { name: '开始创作', exact: true })).toBeDisabled();
  // Keyboard submit must obey the same preflight as the disabled button.
  await page.getByLabel('目标人群').press('Enter');
  expect(generations).toBe(0);
  expect(imaCalls).toBe(0);
  await page.getByRole('radio', { name: /规则预览/ }).check();
  await expect(page.getByRole('button', { name: '开始创作', exact: true })).toBeEnabled();
  await expect(page.getByRole('radio', { name: /AI 模型创作/ })).not.toBeChecked();
});

test('合成本地模型结果保留本地来源，允许语气改写且导出不依赖ima', async ({ page }, testInfo) => {
  // Only the isolated 3101 synthetic knowledge is used. No live model or ima requests.
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const bootstrap = await (await page.request.get('/api/bootstrap')).json() as Bootstrap;
  const seeded = await page.request.post('/api/generate', { data: { ...brief, generation: 'rules', productId: bootstrap.products[0].id } });
  const match = /event: result\ndata: ([^\n]+)/.exec(await seeded.text());
  expect(match).not.toBeNull();
  const template = JSON.parse(match![1]) as Run;
  template.engine = 'llm';
  template.model = 'qa-synthetic-model';
  template.brief = { ...template.brief, mode: 'local', generation: 'model' };
  template.article.title = '[QA合成模型响应] 本地知识库创作';
  template.article.tags = ['HUAWEI MateBook 14', '校园生活'];
  template.evidence.warnings = ['QA 合成模型响应，仅用于浏览器交互验收，不代表真实模型生成。'];
  template.audit.findings = [];
  template.audit.status = 'review';
  template.audit.releaseReady = false;
  let requests: Brief[] = [];
  let imaCalls = 0;
  await page.route('**/api/bootstrap', route => route.fulfill({ json: { ...bootstrap, runs: [], settings: { ...bootstrap.settings, imaConfigured: false, llmConfigured: true, connected: false } } }));
  await page.route('**/api/retrieve', route => { imaCalls++; return route.abort(); });
  await page.route('**/api/generate', route => {
    const incoming = route.request().postDataJSON() as Brief;
    requests.push(incoming);
    const run: Run = { ...template, id: `qa-local-model-${requests.length}`, version: requests.length, parentId: incoming.parentId, brief: incoming };
    return route.fulfill({ contentType: 'text/event-stream', body: `event: result\ndata: ${JSON.stringify(run)}\n\n` });
  });
  await page.route('**/api/runs/qa-local-model-*/export?*', route => route.fulfill({ contentType: 'text/markdown; charset=utf-8', body: '# QA合成模型响应\n本地知识库 · 待人工审核草稿\n' }));
  await page.goto('/');
  await page.getByRole('button',{name:'经典表单',exact:true}).click();
  await page.getByRole('radio', { name: /AI 模型创作/ }).check();
  await expect(page.getByRole('button', { name: '开始创作', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '开始创作', exact: true }).click();
  const result = page.getByRole('region', { name: '创作结果' });
  await expect(result.getByText('模型创作 · qa-synthetic-model')).toBeVisible();
  await expect(result.getByText('本地知识库', { exact: true })).toBeVisible();
  await expect(result.getByText('规则预览 · 未调用模型')).toHaveCount(0);
  expect(requests[0]).toMatchObject({ mode: 'local', generation: 'model' });
  await result.getByRole('tab', { name: '知识依据' }).click();
  await expect(result.getByText('QA 合成模型响应，仅用于浏览器交互验收，不代表真实模型生成。')).toBeVisible();
  await expect(result.getByText('ima 在线来源')).toHaveCount(0);
  await result.locator('.fact-detail').first().locator('summary').click();
  await expect(result.getByRole('link', { name: '查看原始来源' }).first()).toHaveAttribute('href', /^https:\/\/consumer\.huawei\.com\//);
  await result.getByLabel('改写指令').fill('请改成轻松幽默的风格');
  await result.getByRole('button', { name: '按指令改写' }).click();
  await expect(result.getByRole('button', { name: /版本记录 V2/ })).toBeVisible();
  expect(requests[1]).toMatchObject({ mode: 'local', generation: 'model', parentId: 'qa-local-model-1', revision: '请改成轻松幽默的风格' });
  await result.getByRole('button', { name: '导出草稿' }).click();
  const pending = page.waitForEvent('download');
  await result.getByRole('button', { name: /Markdown/ }).click();
  expect(await (await pending).failure()).toBeNull();
  // An untouched edit must not split a multiword topic into separate tags.
  let edited: {tags:string[]}|undefined;
  await page.route('**/api/runs/qa-local-model-2/edit',route=>{
    const body=route.request().postDataJSON();edited=body;
    return route.fulfill({json:{...template,id:'qa-local-edited-3',version:3,parentId:'qa-local-model-2',article:{...template.article,...body}}});
  });
  await result.getByRole('tab',{name:'图文预览'}).click();
  await result.getByRole('button',{name:'编辑正文',exact:true}).click();
  await expect(result.getByLabel('话题标签',{exact:true})).toHaveValue('HUAWEI MateBook 14\n校园生活');
  await result.getByRole('button',{name:'保存并重新核验',exact:true}).click();
  await expect(result.getByRole('button',{name:/版本记录 V3/})).toBeVisible();
  expect(edited?.tags).toEqual(template.article.tags);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await result.screenshot({ path: testInfo.outputPath('qa-synthetic-local-model.png') });
  expect(imaCalls).toBe(0);
  expect(errors).toEqual([]);
});
