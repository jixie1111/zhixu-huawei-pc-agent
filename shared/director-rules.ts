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
    { name:'一天里的一个片段', angle:`聊聊${brief.audience}平常使用产品的一件小事`, problem:'这件日常小事，会用到产品的哪个特点？', factIds:ids, structure:['一个和产品有关的日常片段','自然展开相关特点和使用需要','一句回应主题的邀请'], visualDirection:'整机原图作封面，细节图跟随相应内容排布。', tone:'具体、轻松，不虚构亲身体验', cta:base.cta, reason:'从日常场景介绍相关特点；这是预设规则方向。' },
    { name:'一个选择的理由', angle:'挑一个具体疑问，聊产品的相关特点', problem:'这款产品的哪一点会影响你的选择？', factIds:[...ids].reverse(), structure:['一个购买时会问的问题','从相关事实展开选择理由','给一句明确建议'], visualDirection:'产品整机图与相关细节图相互补充。', tone:'清晰、有观点、便于阅读', cta:'选这类产品，你还会问什么？', reason:'围绕一个具体问题给出依据；这是预设规则方向。' },
    { name:'从一个小困扰开始', angle:'从生活里的一件小麻烦聊起，介绍相关产品特点', problem:'平时哪件小事让你想换一台设备？', factIds:ids.length > 1 ? [...ids.slice(1),ids[0]] : ids, structure:['聊一个日常小困扰','展开相关产品特点','一句自然的回应'], visualDirection:'整机图作封面，后续原图呼应相邻段落。', tone:'轻松、具体、有共鸣', cta:'平常用电脑，你最在意的细节是什么？', reason:'用生活问题引出产品特点；这是预设规则方向。' },
  ], recommendedIndex:0, reason:'规则预览默认推荐任务线，帮助确认方向；未执行模型推理，不代表质量排序。' };
}
