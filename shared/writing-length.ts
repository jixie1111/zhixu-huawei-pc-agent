import type { Article, Brief, Finding, Platform } from './types';

export const WRITING_LENGTH: Record<Platform, readonly [number, number]> = {
  xiaohongshu: [500, 750], wechat: [800, 1200], moments: [120, 260], poster: [80, 180],
};
export const lengthLabel = (platform: Platform) => `${WRITING_LENGTH[platform][0]}–${WRITING_LENGTH[platform][1]} 字`;
export const shortRevision = (revision: string) => /^(?:请)?(?:把(?:内容|正文))?(?:更)?(?:精简|缩短|删减|简短)(?:正文|内容|篇幅)?(?:一点|一些)?[。！!]?$/u.test(revision.trim());
export type LengthBrief = Pick<Brief, 'platform' | 'revision'>;
/** Count visible body characters, not citations, headings, tags or disclaimers. */
export const bodyLength = (parts: readonly string[]) => Array.from(parts.join('').replace(/[\s\p{Cf}]/gu, '')).length;
export const articleBody = (article: Pick<Article, 'lead' | 'sections' | 'cta'>) => [article.lead, ...article.sections.map(s => s.text), article.cta];
export function lengthInstruction(brief: LengthBrief): string {
  if (shortRevision(brief.revision || '')) return '本次明确要求精简：在原稿基础上缩短正文，保留产品事实、必要适用条件与行动引导，不为默认篇幅扩写。';
  return `正文篇幅要求：${lengthLabel(brief.platform)}。只计算导语、各段正文和行动引导的非空白字符（含标点），不计标题、小标题、话题、图片说明、来源和免责声明。以区间中部为目标，完整展开具体处境、产品事实、选择理由与体验动作；人设只改变语气和单段节奏，不覆盖本篇幅要求。保持真实依据，不新增无依据效果，不重复参数或用空话凑字；资料不足时保留短稿供复核。`;
}
export function lengthFinding(parts: readonly string[], brief: LengthBrief): Finding | undefined {
  if (shortRevision(brief.revision || '')) return;
  const actual = bodyLength(parts), [min, max] = WRITING_LENGTH[brief.platform];
  if (actual >= min && actual <= max) return;
  return { id: 'body-length', category: 'platform', severity: 'warning',
    message: `正文约 ${actual} 字，${actual < min ? '少于' : '超过'}本平台 ${min}–${max} 字的目标篇幅。`,
    suggestion: actual < min ? '补充与已有事实相关的场景、选择理由或体验动作后复核；不增加无依据卖点或重复凑字。' : '精简重复表达，保留事实和必要适用条件后复核。' };
}
