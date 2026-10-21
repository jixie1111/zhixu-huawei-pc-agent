import type { Article, Brief, Evidence, Fact, ProductCategory, Strategy } from './types';
import { PLATFORMS, SCENES } from './rules';

function sceneFor(brief:Brief,category:ProductCategory='computer') {
  const base=SCENES[brief.scene];
  if(category==='computer')return base;
  const label=category==='phone'?'手机':category==='tablet'?'平板':'设备';
  const adapt=(value:string)=>value.replace(/电脑|笔记本/g,label);
  return {...base,angle:adapt(base.angle),problem:adapt(base.problem),hook:adapt(base.hook),priorities:category==='phone'?['屏幕','尺寸与重量','后置摄像头','电池','存储','操作系统']:['屏幕','尺寸与重量','操作系统','内存','电池']};
}
export function buildStrategy(brief:Brief,category:ProductCategory='computer'):Strategy {
  const scene=sceneFor(brief,category),platform=PLATFORMS[brief.platform];
  const phase=/到店|体验/.test(brief.stage)?{focus:'把关注点转成可现场验证的体验步骤',priorities:['屏幕','键盘和触控板','接口']}:
    /购买|决策|下单/.test(brief.stage)?{focus:'先确认具体销售版本、必需软件与配置条件，再给出决策检查单',priorities:['操作系统','内存','存储']}:
    /换新|升级/.test(brief.stage)?{focus:'先梳理旧设备资料迁移、常用软件与新增任务，避免只看参数升级',priorities:['操作系统','存储','接口']}:
    /比较|考虑|选型/.test(brief.stage)?{focus:'用任务与配置对应清单解释适用边界，不作无依据的品牌对比',priorities:[]}:
    {focus:'先从日常问题建立产品认知，解释事实价值，不催促购买',priorities:[]};
  const priorities=[...new Set([...phase.priorities,...scene.priorities])];
  const goalAction=/收藏|兴趣/.test(brief.goal)?'先收藏这份任务清单，想清楚自己最常用的场景':
    /私信|咨询/.test(brief.goal)?'私信说明常用软件、外设和任务，逐项核对适用配置':
    /配置|决策/.test(brief.goal)?'核对具体销售版本、软件适配与使用条件后，再做配置决定':
    /理解/.test(brief.goal)?'对照资料逐项理解配置与限制，记录仍需确认的问题':
    /活动/.test(brief.goal)?'咨询门店核实活动时间和参与条件，不预设优惠权益':'';
  const base=goalAction?(brief.platform==='poster'?`${goalAction} · 以实际核实为准`:brief.platform==='moments'?`${goalAction}，欢迎带着问题到店体验。`:`${goalAction}。${platform.cta}`):platform.cta;
  // A store name makes thousands of identical rule drafts at least locally distinct.
  const store=brief.voice?.store?.trim();
  const cta=store?base.replace(/到店/u,`到${store}`):base;
  return {angle:scene.angle,problem:scene.problem,priorities,tone:platform.tone,structure:platform.structure,cta,imageMin:platform.range[0],imageMax:platform.range[1],targetLength:platform.length,stage:brief.stage,goal:brief.goal,rationale:`面向${brief.audience}，处于“${brief.stage}”阶段：${phase.focus}。优先回答“${scene.problem}”，以${priorities.slice(0,3).join('、')}取证，采用${platform.name}的${platform.structure.join(' → ')}结构，服务于“${brief.goal}”。`};
}
export const shortRevision = (revision: string) => /^(?:请)?(?:把(?:内容|正文))?(?:更)?(?:精简|缩短|删减|简短)(?:正文|内容|篇幅)?(?:一点|一些)?[。！!]?$/u.test(revision.trim());
function summary(f:Fact):string {
  const clean=f.text.replace(/\*+/g,'').split('\n').map(s=>s.trim().replace(/[。；，;,.]+$/u,'')).filter(Boolean);
  if(f.label==='尺寸与重量') {
    const at=clean.findIndex(s=>s==='重量');
    if(at>=0)return clean.slice(at+1).filter(s=>/kg|\bg\b|差异|配置|测量/.test(s)).slice(0,4).join('；');
  }
  if(f.label==='屏幕') {
    const size=clean.find(s=>/英寸/.test(s)&&s.length<35);const type=clean.find(s=>/OLED|LCD|IPS/.test(s)&&s.length<50);
    return [size,type,'具体屏幕版本、亮度与功能限制请查阅规格依据'].filter(Boolean).join('，');
  }
  if(f.label==='电池')return clean.filter(s=>/Wh|额定|典型/.test(s)).slice(0,2).join('；')+'。额定容量不等于实际续航时长，续航需结合真实任务验证';
  if(f.label==='特色应用')return '相关协同功能需满足设备、系统和软件版本条件，具体支持范围请查看原始资料并现场确认';
  return clean.slice(0,4).join('；').slice(0,220);
}
export function composeLocal(brief:Brief,evidence:Evidence,strategy:Strategy):Article {
  const category=evidence.product.category??'computer',scene=sceneFor(brief,category),platform=PLATFORMS[brief.platform];
  const productLabel=category==='phone'?'手机':category==='tablet'?'平板':category==='other'?'设备':'电脑';
  // New official mobile records keep qualifications in the same paragraph.
  // Never truncate their specs and inadvertently drop a variant/accessory caveat.
  const summarize=(f:Fact)=>category==='computer'?summary(f):f.text;
  let count=brief.platform==='moments'?1:brief.platform==='poster'?3:brief.platform==='wechat'?4:3;
  if(shortRevision(brief.revision||''))count=Math.max(1,count-1);
  const facts=(strategy.prioritizedFactIds?.length?strategy.prioritizedFactIds.map(id=>evidence.facts.find(f=>f.id===id)):strategy.priorities.map(label=>evidence.facts.find(f=>f.label===label))).filter((f):f is Fact=>!!f).slice(0,count);
  const contexts:Record<string,string>={
    '尺寸与重量':'每天放进包里的设备，先看携带条件。建议带上平时的背包，到店感受机身与配件一起携带的状态。',
    '屏幕':'阅读资料、整理文档或查看素材时，显示需求各不相同。可以用常用文档现场确认字号、显示效果与交互是否适合自己。',
    '电池':'把一天的任务与可充电时段列出来，能比单看一个参数更接近真实需求。不要把电池容量直接当成续航保证。',
    '接口':'先列出显示器、会议设备和其他外设的连接方式，再确认接口、线材和转接需求。',
    '操作系统':'购机前列出不可替代的应用，核对操作系统与软件版本。专业软件、业务系统及外设应逐项验证，不预设兼容。',
    '内存':'可以带着实际的多任务清单咨询具体配置；不把不同销售版本的内存选项混为一谈。',
    '存储':'先清点现有文件和未来的素材需求，再选择配置；同时安排迁移与备份，避免只关注纸面容量。',
    '摄像头':'经常视频沟通的话，建议现场核对会议软件、环境和实际使用效果，不虚构实测结果。',
    '处理器':'性能是否满足任务，仍需结合应用版本与真实项目验证，不能仅凭型号承诺软件运行效果。',
  };
  const sections=facts.map((f,i)=>({heading:brief.platform==='poster'?f.label:brief.platform==='moments'?'这次，先关注这一点':`${String(i+1).padStart(2,'0')} / ${f.label}`,text:brief.platform==='poster'?summarize(f):brief.platform==='moments'?`${evidence.product.shortName}：${summarize(f)}。建议带着常用任务现场确认。`:`${contexts[f.label]||'请结合日常任务确认这一配置是否合适。'}\n\n资料依据：${summarize(f)}。${brief.platform==='wechat'?'这并不意味着同系列的每一个版本都具备相同配置。选购时，应把具体销售版本、使用条件与自己的任务一一对应，无法确认的项目先向门店或官方渠道核实。':''}`,factIds:[f.id]}));
  const images=evidence.images.slice(0,Math.min(strategy.imageMax,strategy.imageMin)).map((image,i)=>({...image,position:i===0?'封面主视觉':`第 ${Math.min(i,sections.length)} 段后`,reason:i===0?`展示 ${evidence.product.shortName} 的产品外观，明确本篇讨论的型号。`:`围绕“${sections[Math.min(i-1,sections.length-1)]?.heading||scene.name}”组织视觉节奏；图片仅说明画面内容，不作为性能证明。`}));
  const titles={xiaohongshu:`${scene.name}选${productLabel}，先想清楚这几件事`,wechat:`${scene.angle}｜${evidence.product.shortName}`,moments:`${scene.name}，从一个真实需求开始`,poster:scene.name==='开学季'?'新学期，自有新可能':scene.angle};
  return {title:titles[brief.platform],lead:brief.platform==='poster'?evidence.product.name:brief.platform==='moments'?scene.hook:`${scene.hook}\n面向${brief.audience}，这次以 ${evidence.product.name} 为例，把“${scene.problem}”逐项展开。`,sections,cta:strategy.cta,tags:brief.platform==='xiaohongshu'?[`华为${productLabel}`,scene.name,`${productLabel}选购`,'到店体验']:[],images,disclaimer:'具体配置、系统版本、适用条件和实际体验以产品资料及现场核实为准。此稿由规则模板与所选资料编排，未调用大模型；规则核验不替代人工审核，发布前请复核来源、适用条件与动态信息。'};
}
