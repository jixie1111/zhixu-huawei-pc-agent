/** Editorial preferences are not fact findings or publication approval. They
 * apply only to the writer's words, never to source documents or audits. */
export const WRITING_CRAFT = '语言要求：用具体的人、物和动作说清意思，让句子像当面聊天时能说出口。产品名首次写清，后文自然指代。写实词、短句和少量有态度的话，段落节奏有变化。删掉“值得关注”“把关注点落在”“明确的工作对象”等推荐套话和写作解释，也删掉“单独拎出来”“留一点篇幅”“补上一笔”等作者选材和安排文章的旁白。直接说有依据的特点，避免反复用“不是……而是……”“不代表”“不等于”“并非”“无法保证”作防御式转折；必要的版本、配置和使用条件用简短陈述保留。正文不讨论资料不足、核验流程或创作意图，不用重复试机指令凑篇幅。每次选择适合主题的结构，不套固定三步清单。';

export interface EditorialSignal { rule: string; examples: string[] }
export function writingSignals(parts: readonly string[]): EditorialSignal[] {
  const text = parts.join('\n'), signals: EditorialSignal[] = [];
  const check = (rule: string, pattern: RegExp) => {
    const examples = [...new Set(text.match(pattern) ?? [])];
    if (examples.length) signals.push({ rule, examples: examples.slice(0, 5) });
  };
  check('抽象套话', /值得(?:关注|考虑|纳入|了解|放进)|把(?:这次换机的)?关注点(?:放回|落在)|明确的(?:起点|工作对象)|放进体验里|让关注点落在/gu);
  check('创作解释', /以下是(?:生成的)?文案|以下(?:为|是)假设|并非(?:真实|亲身|买家)经历|不是买家经历|这里关注[^。！？\n]{0,30}是因为|本段(?:旨在|意在)|本文将从|单独拎出来|留(?:一点|一些)?篇幅|补上一笔/gu);
  check('固定反转句', /(?:并)?不是[^。！？\n]{1,45}[，,]?而是|不只是[^。！？\n]{1,35}[，,]?更是/gu);
  const defensive = text.match(/不代表|不等于|不意味着|并不意味着|并非|不能替(?:你|代)|不保证|无法保证|不能保证|未必(?:能|会)|不能据此/gu) ?? [];
  if (defensive.length >= 2) signals.push({ rule: '防御说法重复', examples: defensive.slice(0, 5) });
  const trialParagraphs = parts.filter(part => /到店|来店|在店里|现场/.test(part) && /试|验证|核对|确认|判断|看看/.test(part));
  if (trialParagraphs.length >= 3) signals.push({ rule: '试机邀请逐段重复', examples: trialParagraphs.slice(0, 3).map(s => s.slice(0, 100)) });
  return signals;
}
