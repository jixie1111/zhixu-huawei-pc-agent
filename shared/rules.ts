import type { Platform, Scene } from './types';
import { lengthLabel } from './writing-length';

export const PLATFORMS: Record<Platform, { name: string; short: string; color: string; range: [number,number]; tone: string; structure: string[]; length: string; cta: string }> = {
  xiaohongshu: { name:'小红书', short:'RED', color:'#df6972', range:[3,6], tone:'自然口语、短段落、具体问题；不伪造第一人称体验', structure:['问题切入','场景清单','选购提醒','互动与话题'], length:lengthLabel('xiaohongshu'), cta:'收藏这份选购清单，带上常用软件到店体验，再决定是否适合自己。' },
  wechat: { name:'微信公众号', short:'WX', color:'#5a9171', range:[2,4], tone:'专业、克制、逻辑清晰，解释适用条件', structure:['场景导语','问题拆解','事实与价值','适用边界','行动建议'], length:lengthLabel('wechat'), cta:'欢迎预约到店体验，带上你的工作流程与设备清单，一起确认适合的配置。' },
  moments: { name:'门店朋友圈', short:'M', color:'#8a85b2', range:[1,3], tone:'简短亲切，围绕一个核心卖点和到店理由', structure:['一句场景','一个核心卖点','咨询或到店引导'], length:lengthLabel('moments'), cta:'想了解适合你的配置？私信说说使用需求，欢迎到店亲自体验。' },
  poster: { name:'门店海报', short:'P', color:'#bc9559', range:[1,1], tone:'简明醒目，主副标题与不多于三个卖点', structure:['主标题','副标题','至多三个卖点','到店说明'], length:lengthLabel('poster'), cta:'欢迎到店体验 · 具体配置与活动以门店核实信息为准' },
};
export const SCENES: Record<Scene, { name:string; audience:string; angle:string; problem:string; priorities:string[]; hook:string; }> = {
  school:{ name:'开学季',audience:'准备开学购机的大学新生',angle:'从第一堂课到图书馆，先把学习流程想清楚',problem:'携带负担、课堂笔记、专业软件与学习资料如何兼顾',priorities:['尺寸与重量','屏幕','电池','存储','操作系统'],hook:'新学期的装备清单，不妨先从你的一天开始。' },
  office:{ name:'职场办公',audience:'经常出差的职场人士',angle:'把移动办公的节奏，放在选电脑之前',problem:'差旅携带、文档多任务、会议连接与设备协作',priorities:['尺寸与重量','接口','摄像头','内存','特色应用'],hook:'从通勤路上到会议桌前，工作地点在变，流程不必被打断。' },
  creator:{ name:'内容创作',audience:'设计与影像内容创作者',angle:'沿着素材到作品的路径，找到真正需要的配置',problem:'画面呈现、素材空间与创作软件的适配边界',priorities:['屏幕','内存','存储','处理器','接口'],hook:'选一台创作电脑，先列出你最常做的那几件事。' },
  family:{ name:'家庭换新',audience:'准备为家庭更换电脑的用户',angle:'让全家人的使用清单，成为换新的起点',problem:'旧资料迁移、常用软件、视频通话和多人共用',priorities:['操作系统','存储','屏幕','摄像头','键盘和触控板'],hook:'家里的电脑要换新，先把每个人的需求放到同一张清单里。' },
  business:{ name:'企业采购',audience:'中小企业的团队采购负责人',angle:'从团队任务到试点验收，采购有据可依',problem:'办公软件兼容、接口需求、配置统一与服务核实',priorities:['操作系统','内存','接口','存储','处理器'],hook:'一份可靠的采购方案，应该先回答团队每天用电脑完成什么。' },
  store:{ name:'门店到访',audience:'门店附近有购机需求的顾客',angle:'带着一个问题来，亲手找到答案',problem:'不知道实际手感、屏幕和常用任务是否适合自己',priorities:['屏幕','尺寸与重量','键盘和触控板'],hook:'参数可以先了解，适不适合自己，不妨来店里试一试。' },
  launch:{ name:'新品首发',audience:'正在关注新产品的用户',angle:'先看适用场景，再判断新产品是否值得了解',problem:'型号差异、版本边界与现有设备需求如何匹配',priorities:['操作系统','屏幕','处理器','尺寸与重量'],hook:'关注一款电脑，不必只看“新”，更要看是否契合自己的使用习惯。' },
  festival:{ name:'节日营销',audience:'希望为家人挑选电脑作为礼物的用户',angle:'把礼物选进对方的日常',problem:'收礼人的真实任务、喜好、软件与配置要求',priorities:['屏幕','尺寸与重量','存储','操作系统'],hook:'一份用得上的礼物，往往从认真听懂对方的需要开始。' },
};

/** Who is posting. Thousands of stores sending the same text is the core
 * "千篇一律" problem; persona changes voice, rhythm and CTA, never product facts. */
export const PERSONAS: Record<import('./types').Persona, { name: string; hint: string; voice: string }> = {
  advisor: { name: '门店顾问', hint: '专业、给明确建议', voice: '门店顾问身份，用“你”称呼读者。标题直接点出这台机器最适合的一类人。正文第一段就给结论（适合谁、为什么），后面每段一个事实加一句建议。语气稳重、不俏皮、不用 emoji、不用反问开头。结尾邀请读者带着具体问题来店里找你。' },
  friend: { name: '数码朋友', hint: '口语、轻松、像聊天', voice: '像懂数码的朋友发帖：口语化短句，可以用“说真的”“我跟你讲”这类口头语，适量 emoji（全文 2–4 个），段落每段一到两句。允许一点俏皮和夸张的语气词，但事实不夸大。结尾抛一个轻松的问题让人评论。' },
  editor: { name: '测评编辑', hint: '有观点、讲取舍', voice: '克制的科技编辑。标题是一个明确的判断句。正文按“观点—依据—适合谁—不适合谁”组织，必须写出一句“如果你更看重……，可以再看看别的配置/型号”这类取舍（只基于已给事实，不点名竞品）。不用 emoji、不用感叹号。' },
  story: { name: '场景故事', hint: '用一个画面带出产品', voice: '写一个具体的未来画面：开头一句交代时间和地点（如“周三晚上十点，宿舍书桌前”），用第二人称和动作推进，产品事实在动作里出现。不用“我建议”“值得”这类推荐口吻，结尾停在画面里，再接一句邀请。不虚构已发生的经历。' },
  minimal: { name: '极简种草', hint: '短句、聚焦、留白', voice: '极简种草：标题不超过 14 个字；用短句和留白组织内容，每段一至两句，围绕一个核心亮点展开场景、已有事实和选择理由；总段数随平台篇幅安排，不限制整篇只写两段。不用“我建议”；结尾一句邀请，不提问。达到平台篇幅，内容聚焦，不重复凑字。' },
};
