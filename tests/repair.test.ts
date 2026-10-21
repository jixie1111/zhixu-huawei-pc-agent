import test from 'node:test';
import assert from 'node:assert/strict';
import { repairModel, repairTargets } from '../server/llm';
import { configure, clearSession } from '../server/config';
import { composeLocal, buildStrategy, generate } from '../server/agent';
import { auditArticle } from '../server/audit';
import { RunStore } from '../server/store';
import type { KnowledgeStore } from '../server/knowledge';
import { brief, evidence, syntheticPng } from './fixtures';
import type { Article, Audit } from '../shared/types';
const response = (value: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
function setup() {
  const data = evidence(), article = composeLocal(brief, data, buildStrategy(brief));
  article.sections[0].text = 'QA错误承诺：续航99小时。';
  const audit: Audit = { status: 'blocked', releaseReady: false, factChecks: [], checkedAt: new Date().toISOString(), findings: [{ id: 'semantic-0', severity: 'block', category: 'fact', message: '合成错误', excerpt: '续航99小时', suggestion: '删除无依据承诺' }] };
  return { data, article, audit };
}
test('仅唯一定位字段可修订，重复片段/图片/来源问题不授权无关修改', () => {
  const { article, audit } = setup();
  assert.deepEqual(repairTargets(article, audit), ['sections.0.text']);
  article.lead += '续航99小时'; assert.deepEqual(repairTargets(article, audit), []);
  audit.findings[0].category = 'image'; assert.deepEqual(repairTargets(article, audit), []);
});

test('纯缺引用警告不授权修改标题，明确段落断言只修对应正文',()=>{
  const {article,audit}=setup();article.sections[1]={heading:'到店清单',text:'带上常用资料，到店确认任务。',factIds:[]};
  audit.findings=[{id:'no-evidence-1',category:'fact',severity:'warning',message:'缺少引用',excerpt:'到店清单',suggestion:'确认是否只有建议'}];
  assert.deepEqual(repairTargets(article,audit),[]);
  audit.findings.push({id:'unreferenced-claim-1',category:'fact',severity:'block',message:'含产品承诺',field:'sections.1.text',excerpt:article.sections[1].text,suggestion:'删除断言'});
  assert.deepEqual(repairTargets(article,audit),['sections.1.text']);
});
test('合成模型局部补丁保留无关字段/引用/原图，篡改字段和前值被拒绝', async t => {
  configure({ llmKey: 'qa-repair-key', llmModel: 'qa-repair-model', llmBaseUrl: 'https://api.siliconflow.cn/v1' }); t.after(clearSession);
  const { data, article, audit } = setup(); const original = structuredClone(article);
  let output: unknown = { patches: [{ field: 'sections.0.text', before: article.sections[0].text, after: '按实际任务到店体验。' }] };
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const payload=JSON.parse(String(init.body));assert.equal(payload.temperature,0.2);
    assert.ok(!payload.messages[0].content.includes('平台表达要求：'));return response(output);
  });
  const repaired = await repairModel(article, data, audit);
  assert.equal(repaired.article.sections[0].text, '按实际任务到店体验。');
  const expected = structuredClone(original); expected.sections[0].text = repaired.article.sections[0].text;
  assert.deepEqual(repaired.article, expected); assert.deepEqual(article, original);
  output = { patches: [{ field: 'title', before: article.title, after: '越权标题' }] };
  await assert.rejects(repairModel(article, data, audit), { code: 'REPAIR_SCOPE' });
  output = { patches: [{ field: 'sections.0.text', before: '虚假前值', after: '修改' }] };
  await assert.rejects(repairModel(article, data, audit), { code: 'REPAIR_PATCH' });
});
test('合成模型编排最多修订两次，每次重验，始终失败则保留阻断与差异', async t => {
  configure({ llmKey: 'qa-repair-key', llmModel: 'qa-repair-model', llmBaseUrl: 'https://api.siliconflow.cn/v1' }); t.after(clearSession);
  const data = evidence(); data.facts = data.facts.map(f => ({ ...f, sourceMode: 'ima' })); data.images = data.images.map(i => ({ ...i, sourceMode: 'ima', url: `/api/ima-assets/${i.id}` }));
  const input = { ...brief, mode: 'ima' as const, generation: 'model' as const, autoRepair: true };
  const initial = composeLocal(input, data, buildStrategy(input)); initial.sections[0].text = '待修正的功能说法A';
  let repairs = 0, verifications = 0;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body)); const system = payload.messages[0].content as string; const user = JSON.parse(payload.messages[1].content);
    if (system.includes('局部修订员')) { repairs++; return response({ patches: [{ field: 'sections.0.text', before: user.article.sections[0].text, after: `待修正的功能说法${repairs}` }] }); }
    if (system.includes('独立事实核验员')) { verifications++; const excerpt = user.article.match(/待修正的功能说法[^\n。]*/)?.[0] || '待修正的功能说法'; return response({ supported: false, issues: [{ excerpt, reason: 'QA模拟无依据功能', suggestion: '修订' }] }); }
    return response({ ...initial, images: initial.images.map(({ id, position, reason }) => ({ id, position, reason })) });
  });
  const store = new RunStore(':memory:'); t.after(() => store.close());
  const knowledge = { products: [data.product] } as KnowledgeStore;
  const run = await generate(input, { knowledge, store, ima: { retrieve: async () => data, asset: async () => ({ body: syntheticPng, type: 'image/png' }) } });
  assert.equal(repairs, 2); assert.equal(verifications, 3); assert.equal(run.repairHistory?.length, 2);
  assert.equal(run.audit.status, 'blocked'); assert.equal(run.audit.releaseReady, false);
  assert.deepEqual(run.article.images, initial.images); assert.equal(store.list().length, 1);
});
