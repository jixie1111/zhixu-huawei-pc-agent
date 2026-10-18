import type { Platform, Scene } from './types';

export const PLATFORMS: Record<Platform, { name: string; short: string; color: string; range: [number,number]; tone: string; structure: string[]; length: string; cta: string }> = {
  xiaohongshu: { name:'小红书', short:'RED', color:'#df6972', range:[3,6], tone:'自然口语、短段落、具体问题；不伪造第一人称体验', structure:['问题切入','场景清单','选购提醒','互动与话题'], length:'350–650 字', cta:'收藏这份选购清单，带上常用软件到店体验，再决定是否适合自己。' },
  wechat: { name:'微信公众号', short:'WX', color:'#5a9171', range:[2,4], tone:'专业、克制、逻辑清晰，解释适用条件', structure:['场景导语','问题拆解','事实与价值','适用边界','行动建议'], length:'650–1000 字', cta:'欢迎预约到店体验，带上你的工作流程与设备清单，一起确认适合的配置。' },
  moments: { name:'门店朋友圈', short:'M', color:'#8a85b2', range:[1,3], tone:'简短亲切，围绕一个核心卖点和到店理由', structure:['一句场景','一个核心卖点','咨询或到店引导'], length:'100–220 字', cta:'想了解适合你的配置？私信说说使用需求，欢迎到店亲自体验。' },
  poster: { name:'门店海报', short:'P', color:'#bc9559', range:[1,1], tone:'简明醒目，主副标题与不多于三个卖点', structure:['主标题','副标题','至多三个卖点','到店说明'], length:'60–150 字', cta:'欢迎到店体验 · 具体配置与活动以门店核实信息为准' },
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
