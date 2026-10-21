import type { Brief } from '../shared/types';

export type ModelStage = 'intent' | 'plan' | 'compose' | 'verify' | 'repair' | 'connection';
export interface ModelTask { stage: ModelStage; platform?: Brief['platform'] }

// Sampling is a writing preference, never a substitute for evidence or review.
// These are server-owned defaults, not instructions extracted from user text.
export const MODEL_POLICY_VERSION = 'wuyan-stage-voice-v5';
// v5: v4 copy hedged ("参数不替你判断"、"合不合习惯要自己试") because the guide listed what
// facts do NOT prove and the model echoed those caveats into the post. Limits stay
// with the independent verifier; this guide says what to write, not what to doubt.
export const PRODUCT_STORY_GUIDE = '产品关联要求：每篇只讲一个读者真的会遇到的任务，再让一至三个事实正面回答它。写法是“处境—事实—这意味着什么—去店里试一下”：事实用肯定句直接说出来，紧接着把它放进读者的具体画面或一个能亲手验证的动作里（比如“1.31 kg 的机身，放进每天背的通勤包”“3:2 的屏幕，到店打开一页你常看的文档”）。不要替读者断言身体感受、效率提升或无基准的比较（如“不压肩”“一屏多看几行”“更省力”“更流畅”）；没有证据的性能、续航、兼容或体验效果不得推导。不要在正文里替读者怀疑参数，不写“参数不能替你判断”“合不合适要自己试”“仅供参考”这类自我否定的话；适用条件照原文保留在对应事实旁即可，存储容量不等于文件整理能力、尺寸不等于效率这类边界由核验把关。选主线事实时，优先选这类人群一眼就能感知、最有吸引力的卖点（如屏幕、重量与厚度、处理器、电池容量、摄像头、特色应用），冷门细节和版本差异不作主线，只在必要时作为一句限定带过。同一个参数只解释一次，不换个说法重复；宁短勿水。不要用教科书口吻解释参数是什么（如“3:2是横向三份纵向两份”“分辨率是横向2880个像素”），写出参数后直接接读者场景里的画面或动作。同一条适用条件全文只写一次，放在第一次出现该参数的地方。标题不要套“选电脑先看X”“X前先想想Y”的格式，用产品最打动人的点或一个具体画面做标题。每段正文都要服务主线，没有事实的铺垫段最多一段且不超过两句。邀请读者做一个承接正文的体验动作，不列到店核对清单。选图优先已标记的整机原图和相关细节，屏幕演示画面仅作补充，不用多张风景图凑数。这些是内部创作要求，不写入成品。';
const voices: Record<Brief['platform'], { temperature: number; instruction: string }> = {
  xiaohongshu: { temperature: 0.8, instruction: '标题是一句有态度的话或一个具体问题，带一个数字或画面更好。开头一两句直接进入处境，短段落，每段二至三句，可以有少量有意义的emoji。观点要鲜明：直接说这台机器适合谁、哪一点最值得看。结尾抛一个读者愿意回答的问题。像懂行的朋友在分享，不假扮买家，不使用“亲测”“用了一个月”等虚构经历，不套用爆款原句。' },
  wechat: { temperature: 0.65, instruction: '像克制但有观点的科技编辑。导语用一个具体场景或问题开场，正文按“问题—事实—意义”的决策逻辑层层推进，结尾回应开头。可以直接给出判断（适合谁、为什么），段落之间有承接。避免参数堆砌、空泛排比和朋友圈式口号。' },
  moments: { temperature: 0.7, instruction: '门店顾问发朋友圈：lead写一句开场场景（不能为空），一个有依据的亮点和它对读者意味着什么，一句轻量邀请。短句，手机一屏读完。避免长篇攻略、刷屏标签、虚构顾客反馈或紧迫库存。' },
  poster: { temperature: 0.7, instruction: '视觉文案：一句鲜明主张、一句副标题、最多三个有依据的卖点（每个卖点“参数+一句含义”）、一个行动引导。主副层次明确，删去套话，保留每项参数的必要限定，不靠缩小字号容纳长文。' },
};
export function modelPolicy(task: ModelTask = { stage: 'connection' }) {
  const temperatures: Record<ModelStage, number> = { intent: 0.15, plan: 0.7, compose: 0.7, verify: 0.1, repair: 0.2, connection: 0 };
  const voice = task.platform ? voices[task.platform] : undefined;
  if (!Object.hasOwn(temperatures, task.stage) || (task.platform && !Object.hasOwn(voices, task.platform))) throw new Error('Unknown model task');
  if ((task.stage === 'plan' || task.stage === 'compose') && !voice) throw new Error('Creative model task requires platform');
  return {
    version: MODEL_POLICY_VERSION,
    stage: task.stage,
    platform: task.platform,
    temperature: task.stage === 'compose' ? voice!.temperature : temperatures[task.stage],
    instruction: task.stage === 'plan' || task.stage === 'compose'
      ? `平台表达要求：${voice!.instruction}\n${PRODUCT_STORY_GUIDE}\n表达自由仅用于切入点、节奏、标题和场景设问。型号、参数、价格、功能、比较结论及适用条件必须遵守原有证据约束。不得模仿受保护文章的独特原句，不把想象场景说成已发生的真实体验。场景优先用面向读者的设问或未来计划表达，成品不混入“以下是假设”“不是买家经历”等写作自我解释；不删事实的必要条件。` : '',
  };
}
