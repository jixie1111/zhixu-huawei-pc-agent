import { z } from 'zod';
import type { Brief, Evidence, Run, Strategy } from '../shared/types';
import type { CreativePlan, DirectorDecision, IntentProposal } from '../shared/director';
import { defaultFields, localConcepts } from '../shared/director-rules';
import { buildStrategy, composeLocal } from '../shared/local-composer';
import { PLATFORMS, SCENES } from '../shared/rules';
import { adviseBrief, focusLabel } from '../server/brief-advisor';

const platformSchema = z.enum(['xiaohongshu', 'wechat', 'moments', 'poster']);
const baseBriefSchema = z.object({
  productId: z.string().min(1).max(100), audience: z.string().trim().min(2).max(200),
  scene: z.enum(['school', 'office', 'creator', 'family', 'business', 'store', 'launch', 'festival']),
  platform: platformSchema, stage: z.string().min(1).max(80), goal: z.string().min(1).max(160),
  requirements: z.string().max(3000), mode: z.literal('local'), generation: z.literal('rules').optional(),
  parentId: z.string().uuid().optional(), revision: z.string().max(1500).optional(), autoRepair: z.literal(false).optional(),
}).strict();
export const demoBriefSchema = baseBriefSchema.extend({ directorPlanId: z.string().uuid().optional(), conceptId: z.string().uuid().optional() })
  .refine(value => !!value.directorPlanId === !!value.conceptId, '方案和方向必须成对绑定');
export const directionSchema = z.object({ index: z.number().int().min(0).max(2), planId: z.string().uuid(), conceptId: z.string().uuid(), plannedAt: z.string().datetime() }).strict();
type Direction = z.infer<typeof directionSchema>;
const inputSchema = z.object({ message: z.string().trim().min(2).max(3000), engine: z.literal('rules'), answers: z.object({
  productId: z.string().min(1).max(100).optional(), platform: platformSchema.optional(),
  focus: z.enum(['carry', 'screen', 'meeting', 'home']).optional(), category: z.enum(['computer', 'phone', 'tablet', 'other']).optional(),
}).strict().optional() }).strict();
const planSchema = z.object({ message: z.string().trim().min(2).max(3000), engine: z.literal('rules'), brief: baseBriefSchema }).strict();
const engineLabel = '规则方案预览 · 未调用大模型';
const clean = (brief: Brief) => {
  const { directorPlanId: _plan, conceptId: _concept, ...rest } = brief;
  return baseBriefSchema.parse({ ...rest, generation: rest.generation ?? 'rules' });
};

/** The public preview uses the same deterministic rules, never a private API. */
export function createDemoDirector(evidence: Evidence[], now = Date.now, ttlMs = 30 * 60_000) {
  const plans = new Map<string, { plan: CreativePlan; binding: string; evidence: string }>();
  const get = (id: string) => {
    const found = evidence.find(e => e.product.id === id);
    if (!found) throw new Error('请选择公开资料中的准确型号与版本。');
    return structuredClone(found);
  };
  const prune = () => { for (const [id, item] of plans) if (Date.parse(item.plan.expiresAt) <= now()) plans.delete(id); };
  return {
    interpret(input: unknown): IntentProposal {
      const parsed = inputSchema.safeParse(input);
      if (!parsed.success) throw new Error('公开体验使用规则整理需求，请输入 2–3000 字并选择公开型号。');
      const { message, answers = {} } = parsed.data;
      if (answers.productId) get(answers.productId);
      const products = evidence.map(e => e.product);
      const effective = [message, answers.focus ? `关注：${focusLabel(answers.focus)}` : ''].filter(Boolean).join('\n');
      if (effective.length > 3000) throw new Error('需求与补充选择合计超过 3000 字，请精简。');
      const fields = defaultFields(effective, products);
      for (const field of fields) {
        const value = field.field === 'productId' ? answers.productId : field.field === 'platform' ? answers.platform : undefined;
        if (value) Object.assign(field, { value, origin: 'user', reason: '来自本次明确选择。' });
      }
      const suggestedBrief: Partial<Brief> = { mode: 'local', generation: 'rules' };
      for (const field of fields) if (field.value !== null) (suggestedBrief as Record<string, unknown>)[field.field] = field.value;
      const proposal: IntentProposal = {
        id: crypto.randomUUID(), engine: 'rules', engineLabel, message, summary: '请确认这次的型号、受众和发布平台。',
        fields, suggestedBrief, questions: fields.filter(f => f.origin === 'needs-confirmation').map(f => ({
          field: f.field, question: f.field === 'productId' ? '这次推广哪一个型号与版本？' : '准备发到哪个平台？',
          options: f.field === 'productId' ? products.map(p => ({ value: p.id, label: p.name })) : Object.entries(PLATFORMS).map(([value, p]) => ({ value, label: p.name })),
        })), warnings: ['公开官网资料与预设规则；自由文本文风要求可在成稿中手动调整。'],
      };
      Object.assign(proposal, adviseBrief(proposal, products, get, answers));
      return proposal;
    },
    plan(input: unknown): CreativePlan {
      const parsed = planSchema.safeParse(input);
      if (!parsed.success) throw new Error('请确认型号、受众、场景与平台。公开体验使用规则策划。');
      const brief = clean(parsed.data.brief), source = get(brief.productId), base = buildStrategy(brief);
      if (source.product.conflicts.length || source.facts.length < 2 || source.facts.some(f => f.productId !== brief.productId) || source.images.some(i => i.productId !== brief.productId)) throw new Error('产品资料存在冲突或不足，请先核实。');
      if (source.images.length < base.imageMin) throw new Error('公开图片数量不足所选平台要求。');
      const raw = localConcepts(brief, source), time = now();
      const concepts = raw.concepts.map(c => ({ ...c, id: crypto.randomUUID() }));
      const plan: CreativePlan = {
        id: crypto.randomUUID(), engine: 'rules', engineLabel, createdAt: new Date(time).toISOString(), expiresAt: new Date(time + ttlMs).toISOString(),
        brief, product: { id: source.product.id, name: source.product.name }, concepts, factIds: [...new Set(concepts.flatMap(c => c.factIds))],
        recommendedConceptId: concepts[raw.recommendedIndex].id, reason: raw.reason, warnings: source.warnings,
      };
      prune(); while (plans.size >= 50) plans.delete(plans.keys().next().value!);
      plans.set(plan.id, { plan: structuredClone(plan), binding: JSON.stringify(brief), evidence: JSON.stringify(source) });
      return structuredClone(plan);
    },
    resolve(brief: Brief): Direction | undefined {
      if (!brief.directorPlanId && !brief.conceptId) return undefined;
      prune(); const cached = plans.get(brief.directorPlanId!);
      if (!cached) throw new Error('这份方案已到期或页面已刷新，请重新策划。');
      if (JSON.stringify(clean(brief)) !== cached.binding || JSON.stringify(get(brief.productId)) !== cached.evidence) throw new Error('需求或资料已改变，请重新策划。');
      const index = cached.plan.concepts.findIndex(c => c.id === brief.conceptId);
      if (index < 0) throw new Error('所选写法不属于当前方案。');
      return { index, planId: cached.plan.id, conceptId: brief.conceptId!, plannedAt: cached.plan.createdAt };
    },
  };
}

/** History stores only a bounded selection, never user-supplied evidence or URLs. */
export function restoreDirection(brief: Brief, evidence: Evidence, direction?: Direction): { strategy: Strategy; director?: DirectorDecision } {
  const base = buildStrategy(brief);
  if (!direction) return { strategy: base };
  const concept = localConcepts(brief, evidence).concepts[direction.index];
  return {
    strategy: { ...base, angle: concept.angle, problem: concept.problem, tone: concept.tone, structure: concept.structure, cta: concept.cta, prioritizedFactIds: concept.factIds, visualDirection: concept.visualDirection, rationale: concept.reason },
    director: { planId: direction.planId, conceptId: direction.conceptId, engine: 'rules', conceptName: concept.name, angle: concept.angle, factIds: concept.factIds, visualDirection: concept.visualDirection, reason: concept.reason, plannedAt: direction.plannedAt },
  };
}
export function savedDirection(run: Run): Direction | undefined {
  if (!run.director) return undefined;
  const index = localConcepts(run.brief, run.evidence).concepts.findIndex(c => c.name === run.director!.conceptName);
  return directionSchema.parse({ index, planId: run.director.planId, conceptId: run.director.conceptId, plannedAt: run.director.plannedAt });
}
export function composeDemoDirection(brief: Brief, evidence: Evidence, strategy: Strategy, direction?: Direction) {
  const article = composeLocal(brief, evidence, strategy);
  if (!direction) return article;
  const scene = SCENES[brief.scene], name = evidence.product.shortName;
  const titles = [`${name}，放进${scene.name}的一天`, `选${name}前，先带上这份清单`, '下一台电脑，你想先解决什么？'];
  const leads = [
    `${scene.hook}\n从一天的任务出发，看看 ${name} 的这些配置。`,
    `面向${brief.audience}，先列出自己的选购问题，再逐项看看 ${name} 的公开资料。`,
    `面对“${scene.problem}”，你最在意哪一点？把日常的小困扰，变成挑选 ${name} 的具体问题。`,
  ];
  return { ...article, title: titles[direction.index], lead: brief.platform === 'poster' ? evidence.product.name : leads[direction.index],
    sections: article.sections.map((section, index) => ({ ...section, heading: direction.index === 1 ? `清单 ${index + 1} · ${evidence.facts.find(f => f.id === section.factIds[0])?.label || '配置'}` : direction.index === 2 ? `你在意的这一点 · ${evidence.facts.find(f => f.id === section.factIds[0])?.label || '配置'}` : section.heading })),
  };
}
