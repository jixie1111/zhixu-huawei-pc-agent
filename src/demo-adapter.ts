import { z } from 'zod';
import type { Article, Bootstrap, Brief, Evidence, Run, RunSummary } from '../shared/types';
import { PLATFORMS, SCENES } from '../shared/rules';
import { shortRevision } from '../shared/local-composer';
import { auditArticle, scanCompliance } from '../server/audit';
import { toHtml, toMarkdown } from '../server/export';
import { demoEvidence } from './demo-evidence';
import { demoBriefSchema as briefSchema, createDemoDirector, directionSchema, restoreDirection, savedDirection, composeDemoDirection } from './demo-director';
const demoDirector = createDemoDirector(demoEvidence);
import type { StageEvent } from './api';

const STORAGE_KEY = 'zhixu-public-demo-v1';
const LIMIT = 20;
const MAX_STORAGE = 1_500_000;
const storageBytes = (text: string) => new TextEncoder().encode(text).byteLength;
const sectionSchema = z.object({ heading: z.string().max(200), text: z.string().min(1).max(5000), factIds: z.array(z.string().max(100)).max(20) });
const editSchema = z.object({ title: z.string().trim().min(1).max(200), lead: z.string().trim().min(1).max(4000), sections: z.array(sectionSchema).min(1).max(12), cta: z.string().max(1000), tags: z.array(z.string().max(80)).max(20) }).strict();
const savedSchema = z.object({ id: z.string().uuid(), parentId: z.string().uuid().optional(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(), version: z.number().int().min(1).max(99999), brief: briefSchema, direction: directionSchema.optional(), article: editSchema, trace: z.array(z.object({ action: z.string().max(100), detail: z.string().max(1000), at: z.string().datetime() })).max(40).optional(), durationMs: z.number().min(0).max(300000).optional() }).strict();
type Saved = z.infer<typeof savedSchema>;
let runs: Run[] | undefined;
let storageAvailable = true;
const disclaimer = '公开官网摘录 · 无需 API 的规则演示。未调用大模型或 ima，不包含私有 ZIP 知识库。具体配置、图片与动态信息请向官方核实；本稿待人工审核。';
const settings: Bootstrap['settings'] = { imaConfigured: false, llmConfigured: false, connected: false, accountLabel: '', kbName: '公开官网摘录演示资料', llmBaseUrl: '', llmModel: '', publicDeployment: false };
const evidenceFor = (id: string): Evidence => {
  const evidence = demoEvidence.find(item => item.product.id === id);
  if (!evidence) throw new Error('请选择演示资料中的准确产品型号。');
  return structuredClone(evidence);
};
const summarize = (run: Run): RunSummary => ({ id: run.id, createdAt: run.createdAt, updatedAt: run.updatedAt, version: run.version, brief: run.brief, engine: run.engine, durationMs: run.durationMs, title: run.article.title, status: run.audit.status, releaseReady: false, cover: run.article.images[0]?.url });
function audit(run: Run) {
  const result = auditArticle(run.article, run.evidence, run.brief, 'local-composer');
  result.findings = result.findings.map(finding => finding.id === 'offline-source' ? { ...finding, message: '资料来自公开官网摘录，当前为浏览器内规则演示。', suggestion: '保留原始官网链接与取证时间；不代表完整私有知识库、ima 检索或大模型生成。' } : finding);
  result.releaseReady = false;
  if (result.status === 'passed') result.status = 'review';
  return result;
}
function restore(saved: Saved): Run {
  const evidence = evidenceFor(saved.brief.productId);
  if (saved.brief.directorPlanId && (!saved.direction || saved.direction.planId !== saved.brief.directorPlanId || saved.direction.conceptId !== saved.brief.conceptId)) throw new Error('草稿方案记录不完整。');
  const { strategy, director } = restoreDirection(saved.brief, evidence, saved.direction);
  const baseline = composeDemoDirection(saved.brief, evidence, strategy, saved.direction);
  const article: Article = { ...baseline, ...saved.article, disclaimer };
  if (saved.brief.requirements.trim()) evidence.warnings.push('规则演示根据结构化场景与平台编排；自由文本要求不作为已执行的自定义文风修改，需在编辑正文中调整。');
  const run: Run = { ...saved, evidence, strategy, director, article, engine: 'local-composer', durationMs: saved.durationMs || 0, trace: saved.trace || [{ action: '公开官网摘录', detail: '独立的浏览器演示记录，仅引用当前随站发布的公开事实。', at: saved.createdAt }] , audit: { status: 'review', releaseReady: false, findings: [], factChecks: [], checkedAt: saved.updatedAt } };
  run.audit = audit(run);
  return run;
}
function history(): Run[] {
  if (runs) return runs;
  runs = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || raw.length > MAX_STORAGE || storageBytes(raw) > MAX_STORAGE) return runs;
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values) || values.length > LIMIT) return runs;
    for (const value of values) {
      const saved = savedSchema.safeParse(value);
      if (saved.success) { try { runs.push(restore(saved.data)); } catch { /* Removed demo products do not restore stale evidence. */ } }
    }
  } catch { storageAvailable = false; }
  return runs;
}
function save(run: Run): Run {
  runs = [run, ...history().filter(item => item.id !== run.id)].slice(0, LIMIT);
  const records = () => runs!.map(run => { const { id, parentId, createdAt, updatedAt, version, brief, article, trace, durationMs } = run; return { id, parentId, createdAt, updatedAt, version, brief, direction: savedDirection(run), durationMs, trace: trace.slice(-40), article: { title: article.title, lead: article.lead, sections: article.sections, cta: article.cta, tags: article.tags } }; });
  let serialized = JSON.stringify(records());
  while (storageBytes(serialized) > MAX_STORAGE && runs.length > 1) { runs.pop(); serialized = JSON.stringify(records()); }
  try { if (storageBytes(serialized) <= MAX_STORAGE) localStorage.setItem(STORAGE_KEY, serialized); else storageAvailable = false; } catch { storageAvailable = false; }
  return structuredClone(run);
}
const getRun = (id: string) => { const run = history().find(item => item.id === id); if (!run) throw new Error('演示记录不存在或已超过最近 20 条保留范围。'); return structuredClone(run); };
const documents = () => demoEvidence.flatMap(e => e.facts.map(f => ({ id: f.id, title: `${e.product.shortName} · ${f.label}`, category: f.label, path: f.sourceUrl, excerpt: f.text, text: `${f.text}\n\n原始来源：${f.sourceTitle}\n${f.sourceUrl}\n取证时间：${f.retrievedAt}\n\n公开官网摘录，不是完整私有知识库。` })));
export async function demoRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  init.signal?.throwIfAborted();
  const parsed = new URL(url, location.origin);
  const path = parsed.pathname;
  const payload = init.body ? JSON.parse(String(init.body)) : {};
  let result: unknown;
  if (path === '/api/bootstrap') result = { products: demoEvidence.map(e => e.product), stats: { documents: documents().length, images: demoEvidence.reduce((n, e) => n + e.images.length, 0), products: demoEvidence.length, categories: new Set(documents().map(d => d.category)).size }, settings, runs: history().map(summarize) } satisfies Bootstrap;
  else if (path === '/api/director/interpret' && init.method === 'POST') result = demoDirector.interpret(payload);
  else if (path === '/api/director/plan' && init.method === 'POST') result = demoDirector.plan(payload);
  else if (path.startsWith('/api/products/')) result = evidenceFor(decodeURIComponent(path.slice('/api/products/'.length)));
  else if (path === '/api/knowledge') {
    const all = documents();
    const q = (parsed.searchParams.get('q') || '').toLowerCase();
    const category = parsed.searchParams.get('category') || '';
    const page = Math.max(1, Math.min(1000, Number(parsed.searchParams.get('page')) || 1));
    const matches = all.filter(d => (!q || `${d.title} ${d.text}`.toLowerCase().includes(q)) && (!category || d.category === category));
    result = { total: matches.length, page, items: matches.slice((page - 1) * 20, page * 20), categories: [...new Set(all.map(d => d.category))] };
  } else if (path.startsWith('/api/knowledge/')) {
    result = documents().find(d => d.id === decodeURIComponent(path.slice('/api/knowledge/'.length)));
    if (!result) throw new Error('该公开事实摘录不存在。');
  } else if (path === '/api/runs') result = history().map(summarize);
  else if (/^\/api\/runs\/[^/]+\/edit$/.test(path)) {
    const parent = getRun(path.split('/')[3]);
    const edited = editSchema.safeParse(payload);
    if (!edited.success) throw new Error('请检查标题、导语、正文和标签的格式与长度。');
    const stamp = new Date().toISOString();
    const next: Run = { ...parent, id: crypto.randomUUID(), parentId: parent.id, version: parent.version + 1, createdAt: stamp, updatedAt: stamp, brief: { ...parent.brief, parentId: parent.id }, article: { ...parent.article, ...edited.data }, trace: [...parent.trace, { action: '手动编辑', detail: '创建独立版本并重新运行事实与合规规则。', at: stamp }] };
    next.audit = audit(next); result = save(next);
  } else if (/^\/api\/runs\/[^/]+$/.test(path)) result = getRun(path.split('/')[3]);
  else if (path === '/api/audit') {
    if (typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length > 20000) throw new Error('请输入 1–20,000 字的待核验文案。');
    if (payload.productId) evidenceFor(payload.productId);
    result = { findings: [...scanCompliance(payload.text), { id: 'scope', category: 'fact', severity: 'info', message: '此独立文本检查仅扫描营销合规规则，未进行逐项产品事实认证。', suggestion: '请在创作流程中绑定来源后运行完整事实核验。' }] };
  } else if (path === '/api/settings' && (!init.method || init.method === 'GET')) result = settings;
  else throw new Error('当前为免 API 静态演示；真实模型与 ima 连接请在本机完整版配置。');
  return structuredClone(result) as T;
}
export async function demoGenerate(input: Brief, onStage: (event: StageEvent) => void, signal: AbortSignal): Promise<Run> {
  // Match JSON transport: cleared optional fields are absent. Plan references
  // must resolve in the public cache; model/private fields remain rejected.
  const parsed = briefSchema.safeParse(Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)));
  if (!parsed.success) throw new Error('请补充准确型号、受众、场景与平台。公开演示仅支持本地规则创作。');
  const brief: Brief = { ...parsed.data, generation: 'rules' };
  const parent = brief.parentId ? getRun(brief.parentId) : undefined;
  if (parent && parent.brief.productId !== brief.productId) throw new Error('修改版本不能更换产品型号，请新建创作。');
  const conversion = parent && brief.platform !== parent.brief.platform && brief.revision === `保持产品与场景，将内容改写为${PLATFORMS[brief.platform].name}版本。`;
  if (brief.revision?.trim() && !shortRevision(brief.revision) && !conversion) throw new Error('规则演示支持“精简正文”和平台转换。其他语气调整请直接编辑正文；本机完整版可另选模型创作新稿。');
  const started = performance.now();
  const stamp = new Date().toISOString();
  const evidence = evidenceFor(brief.productId);
  if (evidence.product.conflicts.length || evidence.facts.length < 2) throw new Error('当前型号公开资料不足或存在冲突，暂不能生成。');
  const direction = demoDirector.resolve(brief) ?? (parent ? savedDirection(parent) : undefined);
  const { strategy, director } = restoreDirection(brief, evidence, direction);
  if (evidence.images.length < strategy.imageMin) throw new Error('当前型号的公开官方图片不足此平台要求，请切换平台或型号。');
  const trace: Run['trace'] = [];
  for (const [step, name, detail] of [[0, '理解创作需求', `${SCENES[brief.scene].name} · ${PLATFORMS[brief.platform].name}`], [1, '制定平台策略', strategy.angle], [2, '读取公开官网摘录', `${evidence.facts.length} 项事实 · ${evidence.images.length} 张官方远程图片`], [3, '浏览器内规则编排', '规则根据本次输入实时组织内容，未调用模型或 ima。']] as const) {
    signal.throwIfAborted(); onStage({ step, name, detail }); trace.push({ action: name, detail, at: stamp });
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  signal.throwIfAborted();
  const article = { ...composeDemoDirection(brief, evidence, strategy, direction), disclaimer };
  const run: Run = { id: crypto.randomUUID(), parentId: parent?.id, version: parent ? parent.version + 1 : 1, createdAt: stamp, updatedAt: stamp, brief, strategy, director, evidence, article, engine: 'local-composer', durationMs: Math.round(performance.now() - started), trace, audit: { status: 'review', releaseReady: false, findings: [], factChecks: [], checkedAt: stamp } };
  run.audit = audit(run);
  for (const finding of scanCompliance(brief.requirements)) run.audit.findings.push({ ...finding, id: `input-${finding.id}`, severity: 'info', message: `已拒绝附加要求中的风险：${finding.message}` });
  if (brief.requirements.trim()) run.evidence.warnings.push('规则演示根据结构化场景与平台编排；自由文本要求不作为已执行的自定义文风修改，需在编辑正文中调整。');
  onStage({ step: 4, name: '核验与保存', detail: '绑定来源、检查表达与数值，保存至当前浏览器。' });
  return save(run);
}
const demoLabels = (text: string) => text.replaceAll('本地 ZIP 快照', '公开官网摘录').replaceAll('本地快照', '公开官网摘录').replaceAll('本地知识库。', '公开官网摘录。');
export async function demoExport(id: string, format: 'md' | 'html' | 'json'): Promise<Blob> {
  const run = getRun(id);
  if (format === 'json') return new Blob([JSON.stringify({ ...run, demo: true, sourceDescription: '公开官网摘录；无需 API 的浏览器规则演示' }, null, 2)], { type: 'application/json;charset=utf-8' });
  if (format === 'md') return new Blob([demoLabels(toMarkdown(run))], { type: 'text/markdown;charset=utf-8' });
  const embedded = new Map<string, string>();
  await Promise.all(run.article.images.map(async image => {
    try {
      const canonical = demoEvidence.flatMap(e => e.images).find(i => i.id === image.id && i.url === image.url);
      if (!canonical) return;
      const response = await fetch(canonical.url, { mode: 'cors', credentials: 'omit', signal: AbortSignal.timeout(15000) });
      if (!response.ok) return;
      const blob = await response.blob();
      if (!/^image\/(png|jpeg|webp)$/.test(blob.type) || blob.size > 2_000_000) return;
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
      embedded.set(image.id, data);
    } catch { /* Export keeps an explicit missing-image notice; no substitute image is invented. */ }
  }));
  return new Blob([demoLabels(toHtml(run, embedded))], { type: 'text/html;charset=utf-8' });
}
export function demoStorageStatus() { history(); return storageAvailable; }
