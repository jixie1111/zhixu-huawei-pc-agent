import type { Brief } from '../shared/types';
import { WRITING_CRAFT } from '../shared/writing-style';

export type ModelStage = 'intent' | 'plan' | 'compose' | 'verify' | 'repair' | 'connection';
export interface ModelTask { stage: ModelStage; platform?: Brief['platform'] }

// Sampling is an expression preference. Evidence and review stay separate.
export const MODEL_POLICY_VERSION = 'wuyan-stage-voice-v8';
export const PRODUCT_STORY_GUIDE = '产品关联要求：一篇围绕一个具体需要展开，先让读者知道这是什么产品、哪一点和自己有关。朋友圈和海报聚焦一两个特点；小红书和公众号可选择几个相关事实维度，同一维度里有用的信息可以充分介绍。产品信息占主体，场景只是开场或穿插的细节。每段给读者新的产品信息或一个明确观点，避免扩写成收纳、学习方法或生活态度教程。参数说清一次，含义以资料支持的范围为限。写清产品有什么，观点可用“我更在意屏幕”这类真实可表达的偏好，不虚构使用经历；已有特点不换算成未经证实的体验或效率。必要条件紧跟相关事实说明一次。段落有详有略，不逐段重复参数、选购指导或试机动作。体验或咨询邀请留在结尾，只提一个行动。配图按产品原图的整机、细节和演示用途安排。这些是内部创作要求，不写入成品。';
const voices: Record<Brief['platform'], { temperature: number; instruction: string }> = {
  xiaohongshu: { temperature: 0.8, instruction: '像门店里懂产品的朋友认真聊一件事。标题简短、具体，读者能认出产品或自己的问题；开头直接入题。短段落，长短句穿插，观点、日常细节和事实自然衔接；小标题可有可无，有时承载信息，有时保留一句有意思的话。emoji按语气少量使用，话题选择相关的人群、场景与品类。结尾选一个具体提问或轻量邀请。' },
  wechat: { temperature: 0.65, instruction: '有观点的产品编辑。标题讲清读者关心的问题，导语开门见山，按读者的决策逻辑推进。小标题有信息，段间有承接，事实和解释有详有略，读完能记住这款产品的一个特点。结尾回应主题，留一个轻量邀请。' },
  moments: { temperature: 0.7, instruction: '店员发给熟人看的朋友圈。lead一句生活场景，正文围绕一个亮点说人话，最后一句轻量邀请；称呼自然、短句有停顿，段落可长可短。时间、样机到店、值班与服务安排仅用已确认的信息。' },
  poster: { temperature: 0.7, instruction: '路过的人一眼能读懂的视觉文案。主副层次清楚，主标题说一个主题，副标题补充一个具体理由，正文最多三个有依据的亮点，再留一个行动。短句和留白承载信息。' },
};
export function modelPolicy(task: ModelTask = { stage: 'connection' }) {
  const temperatures: Record<ModelStage, number> = { intent: 0.15, plan: 0.7, compose: 0.7, verify: 0.1, repair: 0.2, connection: 0 };
  const voice = task.platform ? voices[task.platform] : undefined;
  if (!Object.hasOwn(temperatures, task.stage) || (task.platform && !Object.hasOwn(voices, task.platform))) throw new Error('Unknown model task');
  if ((task.stage === 'plan' || task.stage === 'compose') && !voice) throw new Error('Creative model task requires platform');
  return {
    version: MODEL_POLICY_VERSION, stage: task.stage, platform: task.platform,
    temperature: task.stage === 'compose' ? voice!.temperature : temperatures[task.stage],
    instruction: task.stage === 'plan' || task.stage === 'compose'
      ? `平台表达要求：${voice!.instruction}\n${PRODUCT_STORY_GUIDE}\n${WRITING_CRAFT}\n型号、参数、功能、比较结论及适用条件遵守本次证据约束。不得虚构亲身使用、顾客反馈与已发生的门店故事。面向读者的设问或未来计划可以自然叙述，不混入创作说明，不删事实的必要条件。` : '',
  };
}
