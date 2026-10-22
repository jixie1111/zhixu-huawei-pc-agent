import type { Brief } from '../shared/types';
import { WRITING_CRAFT } from '../shared/writing-style';

export type ModelStage = 'intent' | 'plan' | 'compose' | 'verify' | 'repair' | 'connection';
export interface ModelTask { stage: ModelStage; platform?: Brief['platform'] }

// Sampling is an expression preference. Evidence and review stay separate.
export const MODEL_POLICY_VERSION = 'wuyan-stage-voice-v18';
export const PRODUCT_STORY_GUIDE = '产品关联要求：全文围绕一个具体主题，让读者认识这款产品有辨识度的特点。产品信息占主体，不把任何同类产品都能做的通用操作当卖点。选题应有足够的产品信息支撑篇幅，不为一个狭窄场景反复解释少量事实。小红书和公众号的段落可以有不同任务，不要求每段各占一个参数；朋友圈和海报聚焦一两个特点。生活细节简练成景，点到即止并接回产品，不展开生活教程。每段增加新的产品内容或有意义的解释，不同义重说前文。成品不使用第一人称，不把策划reason和推荐思路写进成品。特点不换算成未经证实的体验或效率，保留必要版本和功能条件，通用测量说明单列文末。介绍完自然结束，不重复总结，不安排需求访谈或行动引导，cta留空。配图使用同型号原图。这些是内部创作要求，不写入成品。';
const voices: Record<Brief['platform'], { temperature: number; instruction: string }> = {
  xiaohongshu: { temperature: 0.8, instruction: '像门店里懂产品的朋友认真聊一件事。标题简短、具体，读者能认出产品或自己的问题；开头直接入题。短段落，长短句穿插，观点、日常细节和事实自然衔接；小标题可有可无，有时承载信息，有时保留一句有意思的话。emoji按语气少量使用，话题选择相关的人群、场景与品类。介绍完自然结束。' },
  wechat: { temperature: 0.65, instruction: '有观点的产品编辑。标题讲清读者关心的问题，导语开门见山，按读者的决策逻辑推进。小标题有信息，段间有承接，事实和解释有详有略，读完能记住这款产品的一个特点。介绍完自然结束，不重复总结。' },
  moments: { temperature: 0.7, instruction: '店员发给熟人看的朋友圈。lead一句生活场景，正文围绕一个亮点说人话，介绍完自然结束；称呼自然、短句有停顿，段落可长可短。时间、样机到店、值班与服务安排仅用已确认的信息。' },
  poster: { temperature: 0.7, instruction: '路过的人一眼能读懂的视觉文案。主副层次清楚，主标题说一个主题，副标题补充一个具体理由，正文最多三个有依据的亮点，不另加行动引导。短句和留白承载信息。' },
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
      ? `平台表达要求：${voice!.instruction}\n${PRODUCT_STORY_GUIDE}\n${WRITING_CRAFT}\n${task.stage === 'plan' ? '策划补充：structure组织读者要看的内容，不按屏幕、机身、声音逐项分配段落，也不安排“总览参数—分项重述—再总结”的目录。节点不能只是同一判断换句话说。reason用于后台说明，不能代替正文。' : '成稿补充：把策划结构写成面向读者的成品，不抄规划文字或推荐理由，不解说自己如何写或介绍。每个数字正文原则上只出现一次，必要的前提仍与其同句或就近说明；小标题和正文的正常呼应不受此限。'}\n型号、参数、功能、比较结论及适用条件遵守本次证据约束。不得虚构亲身使用、顾客反馈与已发生的门店故事。面向读者的设问或未来计划可以自然叙述，不混入创作说明，不删事实的必要条件。` : '',
  };
}
