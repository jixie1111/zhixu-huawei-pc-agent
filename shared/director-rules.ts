import type { Brief, Evidence, Product } from './types';
import type { IntentField, IntentFieldName } from './director';
import { buildStrategy } from './local-composer';

/** Pure rules shared by the local service and the public browser preview. */
export const fieldNames = ['productId', 'audience', 'scene', 'platform', 'stage', 'goal', 'requirements'] as const;
const normalize = (s: string) => s.normalize('NFKC').replace(/\s+/g, '').toLowerCase();

export function userFields(message: string, products: Product[]): Map<IntentFieldName, string> {
  const direct = new Map<IntentFieldName, string>([['requirements', message]]);
  const normalized = normalize(message);
  const explicit = products.filter(p => [p.name, p.shortName].some(n => n.length > 3 && normalized.includes(normalize(n))));
  // A generic family name must never silently select a variant.
  const longest = explicit.filter(p => !explicit.some(other => other.id !== p.id && normalize(other.name).includes(normalize(p.name))));
  if (longest.length === 1) direct.set('productId', longest[0].id);
  const platforms: [RegExp, string][] = [[/小红书/i,'xiaohongshu'],[/公众号|微信长文/,'wechat'],[/朋友圈/,'moments'],[/海报/,'poster']];
  const selected = platforms.filter(([re]) => re.test(message));
  if (selected.length === 1) direct.set('platform', selected[0][1]);
  const scenes: [RegExp, string][] = [[/开学|新生|新学期/,'school'],[/企业采购|团队采购|批量采购/,'business'],[/商务|出差|办公|上班/,'office'],[/创作|剪辑|设计师/,'creator'],[/家庭|家用/,'family'],[/新品|发布会/,'launch'],[/节日|双十一|国庆/,'festival']];
  const selectedScenes = scenes.filter(([re]) => re.test(message));
  if (selectedScenes.length === 1) direct.set('scene', selectedScenes[0][1]);
  const audience = message.match(/大学新生|大学生|商务人士|出差人士|设计师|上班族|学生|家长|职场新人/);
  if (audience) direct.set('audience', audience[0]);
  const goal = message.match(/吸引咨询|引导咨询|引导到店体验|到店体验|促进收藏|引导私信/);
  if (goal) direct.set('goal', goal[0]);
  return direct;
}
export function defaultFields(message: string, products: Product[]): IntentField[] {
  const direct = userFields(message, products);
  const defaults: Partial<Record<IntentFieldName, string>> = { audience: '有产品选购需求的顾客', scene: 'store', stage: '比较选型', goal: '引导到店体验' };
  return fieldNames.map(field => ({field, value: direct.get(field) ?? defaults[field] ?? null,
    origin: direct.has(field) ? 'user' : field === 'productId' || field === 'platform' ? 'needs-confirmation' : 'inferred',
    reason: direct.has(field) ? '从本次需求中识别；可在简报中修正。' : field === 'productId' ? '必须确认具体型号与版本，不依据“轻薄本”等泛称推断。' : field === 'platform' ? '发布平台影响结构与配图数量，请选择。' : '这是可修改的策划建议，不是已确认事实。',
  }));
}
export function localConcepts(brief: Brief, evidence: Evidence) {
  const base = buildStrategy(brief,evidence.product.category);
  const ordered = [...evidence.facts].sort((a, b) => {
    const index = (s: string) => base.priorities.includes(s) ? base.priorities.indexOf(s) : 99;
    return index(a.label) - index(b.label);
  });
  const ids = ordered.slice(0, 3).map(f => f.id);
  return { concepts: [
    { name:'一天的任务线', angle:`从${brief.audience}一天中的真实任务切入`, problem:'怎样把选购关注点放回自己的日常任务？', factIds:ids, structure:['一个日常任务开场','按任务解释可核实的配置','到店验证清单'], visualDirection:'原始产品图作封面；任务卡与事实卡交替，不更改产品外观。', tone:'具体、轻松，不虚构亲身体验', cta:base.cta, reason:'先让读者认出自己的场景，再用事实回应；这是预设规则方向。' },
    { name:'带着问题做选择', angle:'用一份选择清单拆解购买决定', problem:'哪些问题应该先核实，而不是先被参数打动？', factIds:[...ids].reverse(), structure:['提出选购分歧','逐项列出事实和适用边界','整理需要现场确认的问题'], visualDirection:'真实产品图配对照清单；每张卡只承载一个判断维度。', tone:'清晰、客观、便于收藏', cta:'保存问题清单，带着常用任务到店逐项确认。', reason:'让事实服务于购买判断，避免把参数罗列当结论；这是预设规则方向。' },
    { name:'从一个小困扰开始', angle:'先回应一种生活感受，再介绍可以核实的产品信息', problem:'怎样让内容引起共鸣，又不虚构使用体验和效果？', factIds:ids.length > 1 ? [...ids.slice(1),ids[0]] : ids, structure:['用设问引出日常感受','将困扰转为选购关注点','用资料回答并邀请体验'], visualDirection:'留白封面配一行场景设问；后续使用原图与简短证据注释。', tone:'温和、有共鸣，不作效果承诺', cta:'说说你最在意的使用场景，一起核对适用条件。', reason:'情绪只来自场景设问，不冒充真实用户见证；这是预设规则方向。' },
  ], recommendedIndex:0, reason:'规则预览默认推荐任务线，帮助确认方向；未执行模型推理，不代表质量排序。' };
}
