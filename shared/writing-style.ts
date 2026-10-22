import type { Finding } from './types';

/** Editorial preferences are not fact findings or publication approval. They
 * apply only to the writer's words, never to source documents or audits. */
export const WRITING_CRAFT = [
  '语言要求：成品不使用第一人称，包括标题、小标题、正文、引语、话题和结尾；不写“我、我们、咱们、本人、笔者、本店”等自述，也不用英文第一人称。直接陈述产品与生活情境，或面向读者写“你”；不把店员写成学生买家，不以模拟读者说“我想……”绕过要求。人设只改变口吻与节奏。',
  '全文回答一个与这款产品有关的具体问题，用有辨识度的产品特点支撑主题。产品信息是主体，不把任何同类产品都能做的通用操作当卖点。各段增加新的产品内容；用准确的功能与设计名称说特点，只保留能帮助读者理解和选择的关键数字，不把文案写成规格目录，也不解释数字本身的含义。事实有主次：关键处讲清，旁支简短带过，无关的数字省略；篇幅用足够的相关事实支撑，不把少量事实反复解释。段落承担不同任务，长短和信息密度有变化，不固定清单、时间线或“参数＋试一试”的节拍。',
  '用日常能说出口的实词、短句和有内容的观点。产品名首次写清，后文自然指代。日常动作可以保留，抓住有辨识度的细节，压缩成有画面感、有节奏的表达；略去中间步骤，不按先后逐项交代，不反复叙述状态变化。生活场景点到即止，接住产品特点，不展开生活教程或用想象情节撑篇幅。每句话带来有用信息、鲜明画面或主题推进；文采克制，修辞服务产品主题，不堆砌辞藻。能表达特点就直接表达，不为每个参数补一个动作，也不为每段补一句空泛收束。删掉不增加信息的单位复述；精确质量、长度单位换算仅在确有帮助时使用，不从参数推导身体感受、续航、画质或效率。',
  '直接介绍产品，不把文案写成需求访谈或操作教程，不要求读者说明使用细节、整理任务或逐项验证。删去不增加信息的解释和评价。开头直接入题，不先总览再逐段重复，不用个人表态给事实收尾。介绍结束即止，不另加提问、私信、咨询、到店等行动引导；cta留空，不补口号或重复总结。',
  '删掉“值得关注”“把关注点落在”“明确的工作对象”等推荐套话，以及“单独拎出来”“留一点篇幅”“话题就轮到”“声音也有自己的位置”“接着聊工作里的另一面”等安排文章的旁白。直接说有依据的特点，成品不写防御性表达，不预先反驳质疑，不用主观体验提醒给卖点收尾。无依据的效果直接省略，审核中的不确定性留在后台。',
  '必要的版本、配置和功能条件紧跟对应事实，简短说明一次；通用尺寸、重量测量说明放独立的文末说明，不混进另一主题段落，不把所有限定堆成正文末段。正文不讨论资料不足、核验流程或创作意图，不虚构样机、库存或门店安排。',
].join('');

/** Scan authored copy only. Product source text, original captions, and user
 * requirements are not copy and must never be rewritten to satisfy this rule. */
export function firstPersonExamples(text: string): string[] {
  return [...new Set(text.match(/(?<![自忘敌故唯])我(?:们|方|店)?|咱(?:们|家)?|本人|笔者|本店|本号|本账号|\b(?:I|me|my|mine|we|us|our|ours|myself|ourselves)\b/giu) ?? [])].slice(0, 5);
}

/** An explicit output-style requirement, not a factual or legal finding. */
export function firstPersonFindings(fields: readonly { field: string; text: string }[]): Finding[] {
  return fields.flatMap(({ field, text }) => {
    const examples = firstPersonExamples(text);
    return examples.length ? [{ id: `writing-person-${field}`, category: 'platform' as const,
      severity: 'block' as const, field, excerpt: text,
      message: `成品仍含第一人称表达：${examples.join('、')}。`,
      suggestion: '改为直接产品陈述或第二人称，删除多余邀约；保留原有事实、引用和必要条件，不只删除代词造成病句。' }] : [];
  });
}

export interface EditorialSignal { rule: string; examples: string[]; advisory?: boolean }
export interface WritingContext { platform?: string; goal?: string; cta?: string }
export function writingSignals(parts: readonly string[], context: WritingContext = {}): EditorialSignal[] {
  const text = parts.join('\n'), signals: EditorialSignal[] = [];
  const firstPerson = firstPersonExamples(text);
  if (firstPerson.length) signals.push({ rule: '第一人称', examples: firstPerson });
  const check = (rule: string, pattern: RegExp) => {
    const examples = [...new Set(text.match(pattern) ?? [])];
    if (examples.length) signals.push({ rule, examples: examples.slice(0, 5) });
  };
  check('抽象套话', /值得(?:关注|考虑|纳入|了解|放进)|把(?:这次换机的)?关注点(?:放回|落在)|明确的(?:起点|工作对象)|放进体验里|让关注点落在/gu);
  check('创作解释', /以下是(?:生成的)?文案|以下(?:为|是)假设|并非(?:真实|亲身|买家)经历|不是买家经历|这里关注[^。！？\n]{0,30}是因为|本段(?:旨在|意在)|本文将从|单独拎出来|留(?:一点|一些)?篇幅|补上一笔/gu);
  // Match editorial narration, not normal instructions such as “先看配置表”.
  check('推进旁白', /先看打开之后的样子|声音也有自己的位置|话题(?:就)?轮到|接着聊工作里的另一面|(?:接下来|下面)(?:我们|再)?(?:来)?(?:聊聊|介绍)|想聊聊HUAWEI[^。！？\n：]{1,40}的长焦/gu);
  check('介绍安排旁白', /我会(?:先|优先|一起)(?:介绍|聊)|我更想(?:先)?(?:介绍|聊)|我(?:更)?愿意(?:继续|认真)?介绍|我介绍这款时(?:会)?先说|比堆(?:一长串)?(?:无关)?参数更贴题|可以继续了解的理由|把[^。！？\n]{1,25}(?:信息|参数)(?:放在前面|一起介绍)/gu);
  check('固定反转句', /(?:并)?不是[^。！？\n]{1,45}[，,]?而是|不只是[^。！？\n]{1,35}[，,]?更是/gu);
  const defensive = text.match(/不代表|不等于|不意味着|并不意味着|并非|不能替(?:你|代)|不保证|无法保证|不能保证|未必(?:能|会)|不能据此/gu) ?? [];
  if (defensive.length) signals.push({ rule: '防御性表达', examples: defensive.slice(0, 5) });
  const trialParagraphs = parts.filter(part => /到店|来店|在店里|现场/.test(part) && /试|验证|核对|确认|判断|看看/.test(part));
  if (trialParagraphs.length >= 3) signals.push({ rule: '试机邀请逐段重复', examples: trialParagraphs.slice(0, 3).map(s => s.slice(0, 100)) });
  // These are review hints, never fact failures or grounds to delete conditions.
  const instructions = parts.filter(part => /(?:我会|我建议|建议你|你可以|可以先|买之前)[^。！？\n]{0,36}(?:打开|拿|握|敲|点|试|装|带|看看)/u.test(part));
  if (instructions.length >= 3) signals.push({ rule: '重复试用指导结构', advisory: true, examples: instructions.slice(0, 4).map(s => s.slice(0, 140)) });
  const dense = parts.filter(part => part.length > 45 && (part.match(/\d+\s*[×x]\s*\d+|\d+(?:\.\d+)?\s*(?:英寸|mm|cm|毫米|厘米|GB|TB|kg|千克|克|g\b|ppi|万像素|mAh|Wh|Hz)/gi) ?? []).length >= 3);
  if (dense.length) signals.push({ rule: '参数密度', advisory: true, examples: dense.slice(0, 3).map(s => s.slice(0, 140)) });
  const qualifications = parts.filter(part => /实际(?:可视区域|有效像素|尺寸|机身重量|重量)|会因(?:配置|制造|测量)|以实际(?:产品|信息)为准/.test(part));
  if (qualifications.length >= 3) signals.push({ rule: '通用说明分散', advisory: true, examples: qualifications.slice(0, 4).map(s => s.slice(0, 140)) });
  if (context.cta?.trim()) signals.push({ rule: '多余行动引导', examples: [context.cta] });
  check('邀约或需求访谈', /私信(?:咨询|联系|了解|告知|说明|告诉|说说)?|(?:欢迎|可以|可|请)?到店(?:咨询|了解|体验|试试)|(?:请|欢迎|可以|可)(?:向|把|将)?[^。！？\n]{0,20}(?:说明|告诉|提供|列出|整理)[^。！？\n]{0,24}(?:需求|用法|任务|软件|文档|光照)|(?:这些|具体)(?:任务|需求)[^。！？\n]{0,16}(?:咨询|沟通)/gu);
  return signals;
}
