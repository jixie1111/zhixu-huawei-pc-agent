import type { Platform, Scene } from './types';
import { lengthLabel } from './writing-length';

export const PLATFORMS: Record<Platform, { name: string; short: string; color: string; range: [number,number]; tone: string; structure: string[]; length: string; cta: string }> = {
  xiaohongshu: { name:'小红书', short:'RED', color:'#df6972', range:[3,6], tone:'朋友聊天的语气，具体、短段落、节奏自然', structure:['直接入题','沿一个主题展开相关事实与日常细节','一个提问或邀请与相关话题'], length:lengthLabel('xiaohongshu'), cta:'你挑电脑时更在意哪一点？聊聊你的日常用法。' },
  wechat: { name:'微信公众号', short:'WX', color:'#5a9171', range:[2,4], tone:'有观点的产品编辑，讲清一件事，事实和解释有详有略', structure:['读者的问题与文章观点','用相关产品信息展开理由','回应主题与一个行动'], length:lengthLabel('wechat'), cta:'想看看文中这款机型，可以预约一次到店体验。' },
  moments: { name:'门店朋友圈', short:'M', color:'#8a85b2', range:[1,3], tone:'熟人之间的自然交流，一个生活细节和一个产品亮点', structure:['一句具体处境','聊一个相关亮点','一句私信或到店邀请'], length:lengthLabel('moments'), cta:'想聊聊这款的具体配置，私信我就好。' },
  poster: { name:'门店海报', short:'P', color:'#bc9559', range:[1,1], tone:'简明醒目，主副标题与不多于三个卖点', structure:['主标题','副标题','至多三个卖点','到店说明'], length:lengthLabel('poster'), cta:'来店里，看看这款产品。' },
};
export const SCENES: Record<Scene, { name:string; audience:string; angle:string; problem:string; priorities:string[]; hook:string; }> = {
  school:{ name:'开学季',audience:'准备开学购机的大学新生',angle:'课本、水杯和电脑一起装进每天背的包',problem:'上课携带、课后查资料和记笔记，需要怎样的电脑',priorities:['尺寸与重量','屏幕','电池','存储','操作系统'],hook:'课表排好了，书包里给电脑留了多大地方？' },
  office:{ name:'职场办公',audience:'经常出差的职场人士',angle:'通勤包里有电脑，工作地点从工位换到会议室',problem:'经常带电脑出门，最常用的文档、接口和设备是什么',priorities:['尺寸与重量','接口','摄像头','内存','特色应用'],hook:'会议资料发来了，通勤包里的电脑也该选好了。' },
  creator:{ name:'内容创作',audience:'设计与影像内容创作者',angle:'相册里的照片到成稿前，还要挑选、查看和修改',problem:'经常处理怎样的素材，对屏幕、空间和软件有什么要求',priorities:['屏幕','内存','存储','处理器','接口'],hook:'刚拍完一组照片，你通常先打开哪一张？' },
  family:{ name:'家庭换新',audience:'准备为家庭更换电脑的用户',angle:'周末翻全家福、写作业、给家里换台电脑',problem:'家里谁用电脑，平常打开哪些照片、资料和软件',priorities:['操作系统','存储','屏幕','摄像头','键盘和触控板'],hook:'家里的电脑，周末轮到谁用？' },
  business:{ name:'企业采购',audience:'中小企业的团队采购负责人',angle:'给同事配电脑，把常用软件和外设列清楚',problem:'岗位、软件、显示器和接口分别需要什么配置',priorities:['操作系统','内存','接口','存储','处理器'],hook:'给同事配电脑，先聊他们每天用什么。' },
  store:{ name:'门店到访',audience:'门店附近有购机需求的顾客',angle:'从机身、屏幕或键盘挑一个顾客关心的细节',problem:'这款产品的哪个特点和顾客的日常用法有关',priorities:['屏幕','尺寸与重量','键盘和触控板'],hook:'选电脑，你通常会先看屏幕，还是先摸键盘？' },
  launch:{ name:'新品首发',audience:'正在关注新产品的用户',angle:'新机里挑一个和日常使用有关的具体特点',problem:'新品有哪些已确认的信息，分别对应什么使用需要',priorities:['操作系统','屏幕','处理器','尺寸与重量'],hook:'新机来了，先聊聊它一个具体的特点。' },
  festival:{ name:'节日营销',audience:'希望为家人挑选电脑作为礼物的用户',angle:'给家人挑一件平常就能用到的礼物',problem:'收礼的人常用电脑做什么，喜欢怎样的尺寸与配置',priorities:['屏幕','尺寸与重量','存储','操作系统'],hook:'送给家人的电脑，你知道他平常会打开什么吗？' },
};

/** Who is posting. Thousands of stores sending the same text is the core
 * "千篇一律" problem; persona changes voice, rhythm and CTA, never product facts. */
export const PERSONAS: Record<import('./types').Persona, { name: string; hint: string; voice: string }> = {
  advisor: { name: '门店顾问', hint: '专业、给明确建议', voice: '懂产品的门店顾问，直接聊读者关心的特点，讲清建议的理由。说话稳当，句子简洁，段落有详有略；按平台写自然的标题和结尾。一处轻量邀请就够。身份只决定口吻，经历和门店安排以已确认的信息为准。' },
  friend: { name: '数码朋友', hint: '口语、轻松、像聊天', voice: '像懂数码的朋友发帖：口语化短句，可以用“说真的”“我跟你讲”这类口头语，适量 emoji（全文 2–4 个），段落每段一到两句。允许一点俏皮和夸张的语气词，但事实不夸大。结尾按营销目标选私信、到店或轻松提问，不因朋友口吻丢掉咨询邀请。' },
  editor: { name: '测评编辑', hint: '有观点、讲取舍', voice: '有判断的产品编辑，围绕一个问题讲透相关特点。事实承担依据，解释回应读者。语气清楚、克制，结构随主题安排；确有配置区别时简短交代，不额外安排劝退段落。' },
  story: { name: '场景故事', hint: '用一个画面带出产品', voice: '从一个日常画面开始，用面向读者的动作和细节推进，产品特点随场景自然出现。时间地点可以简短带过，段落节奏像讲故事；只用未来计划、普通情境或用户确认的经历。结尾接住开头的画面。' },
  minimal: { name: '极简种草', hint: '短句、聚焦、留白', voice: '极简种草：标题不超过 14 个字；用短句和留白组织内容，每段一至两句，围绕一个核心亮点展开场景、已有事实和选择理由；总段数随平台篇幅安排，不限制整篇只写两段。不用“我建议”；结尾一句邀请，不提问。达到平台篇幅，内容聚焦，不重复凑字。' },
};
