/** Editorial preferences are not fact findings or publication approval. They
 * apply only to the writer's words, never to source documents or audits. */
export const WRITING_CRAFT = '语言要求：用具体的人、物和动作说清意思，让句子像当面聊天时能说出口。产品名首次写清，后文自然指代。写实词、短句和少量有态度的话，段落节奏有变化。只选与主题有关的参数；可连接读者自己能做的动作，或作精确的质量、长度单位等值换算，不从参数推导身体感受、续航、画质或效率。没有用的数字直接省略，不把每段写成参数表或试机教程。删掉“值得关注”“把关注点落在”“明确的工作对象”等推荐套话，以及“单独拎出来”“留一点篇幅”“话题就轮到”“声音也有自己的位置”“接着聊工作里的另一面”等安排文章的旁白。直接说有依据的特点，避免反复用“不是……而是……”“不代表”“不等于”“并非”“无法保证”作防御式转折；必要的版本、配置和使用条件用简短陈述保留。通用说明合并一次，特定版本和功能的必要条件仍紧跟对应事实。正文不讨论资料不足、核验流程或创作意图。结尾服务本次营销目标：要咨询或到店线索时给一个私信或到店动作，只要评论互动时才只留讨论问题，不虚构样机、库存或门店安排。每次选择适合主题的结构，不套固定三步清单。';

export interface EditorialSignal { rule: string; examples: string[]; advisory?: boolean }
export interface WritingContext { platform?: string; goal?: string; cta?: string }
export function writingSignals(parts: readonly string[], context: WritingContext = {}): EditorialSignal[] {
  const text = parts.join('\n'), signals: EditorialSignal[] = [];
  const check = (rule: string, pattern: RegExp) => {
    const examples = [...new Set(text.match(pattern) ?? [])];
    if (examples.length) signals.push({ rule, examples: examples.slice(0, 5) });
  };
  check('抽象套话', /值得(?:关注|考虑|纳入|了解|放进)|把(?:这次换机的)?关注点(?:放回|落在)|明确的(?:起点|工作对象)|放进体验里|让关注点落在/gu);
  check('创作解释', /以下是(?:生成的)?文案|以下(?:为|是)假设|并非(?:真实|亲身|买家)经历|不是买家经历|这里关注[^。！？\n]{0,30}是因为|本段(?:旨在|意在)|本文将从|单独拎出来|留(?:一点|一些)?篇幅|补上一笔/gu);
  // Match editorial narration, not normal instructions such as “先看配置表”.
  check('推进旁白', /先看打开之后的样子|声音也有自己的位置|话题(?:就)?轮到|接着聊工作里的另一面|(?:接下来|下面)(?:我们|再)?(?:来)?(?:聊聊|介绍)|想聊聊HUAWEI[^。！？\n：]{1,40}的长焦/gu);
  check('固定反转句', /(?:并)?不是[^。！？\n]{1,45}[，,]?而是|不只是[^。！？\n]{1,35}[，,]?更是/gu);
  const defensive = text.match(/不代表|不等于|不意味着|并不意味着|并非|不能替(?:你|代)|不保证|无法保证|不能保证|未必(?:能|会)|不能据此/gu) ?? [];
  if (defensive.length >= 2) signals.push({ rule: '防御说法重复', examples: defensive.slice(0, 5) });
  const trialParagraphs = parts.filter(part => /到店|来店|在店里|现场/.test(part) && /试|验证|核对|确认|判断|看看/.test(part));
  if (trialParagraphs.length >= 3) signals.push({ rule: '试机邀请逐段重复', examples: trialParagraphs.slice(0, 3).map(s => s.slice(0, 100)) });
  // These are review hints, never fact failures or grounds to delete conditions.
  const dense = parts.filter(part => part.length > 45 && (part.match(/\d+\s*[×x]\s*\d+|\d+(?:\.\d+)?\s*(?:英寸|mm|cm|毫米|厘米|GB|TB|kg|千克|克|g\b|ppi|万像素|mAh|Wh|Hz)/gi) ?? []).length >= 3);
  if (dense.length) signals.push({ rule: '参数选择与读者动作', advisory: true, examples: dense.slice(0, 3).map(s => s.slice(0, 140)) });
  const qualifications = parts.filter(part => /实际(?:可视区域|有效像素|尺寸|机身重量|重量)|会因(?:配置|制造|测量)|以实际(?:产品|信息)为准/.test(part));
  if (qualifications.length >= 3) signals.push({ rule: '通用说明分散', advisory: true, examples: qualifications.slice(0, 4).map(s => s.slice(0, 140)) });
  if (context.platform === 'moments' && /咨询|私信|线索|推广|引流|转化|到店|成交/.test(context.goal ?? '') && context.cta !== undefined &&
    !/私信|问我|联系|到店|来店|店里|留言[^。！？]{0,12}(?:配置|型号|咨询)|聊聊[^。！？]{0,12}(?:型号|配置)/.test(context.cta)) {
    signals.push({ rule: '结尾未承接营销目标', examples: [context.cta] });
  }
  return signals;
}
