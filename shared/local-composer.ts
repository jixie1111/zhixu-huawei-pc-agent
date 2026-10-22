import type { Article, Brief, Evidence, Fact, ProductCategory, Strategy } from './types';
import { PLATFORMS, SCENES } from './rules';
import { shortRevision } from './writing-length';

function sceneFor(brief:Brief,category:ProductCategory='computer') {
  const base=SCENES[brief.scene];
  if(category==='computer')return base;
  const label=category==='phone'?'手机':category==='tablet'?'平板':'设备';
  const adapt=(value:string)=>value.replace(/电脑|笔记本/g,label);
  return {...base,angle:adapt(base.angle),problem:adapt(base.problem),hook:adapt(base.hook),priorities:category==='phone'?['屏幕','尺寸与重量','后置摄像头','电池','存储','操作系统']:['屏幕','尺寸与重量','操作系统','内存','电池']};
}
export function buildStrategy(brief:Brief,category:ProductCategory='computer'):Strategy {
  const scene=sceneFor(brief,category),platform=PLATFORMS[brief.platform];
  const phase=/到店|体验/.test(brief.stage)?{focus:'讲清一个可现场体验的具体特点',priorities:['屏幕','键盘和触控板','接口']}:
    /购买|决策|下单/.test(brief.stage)?{focus:'回答具体销售版本、常用软件和配置的问题',priorities:['操作系统','内存','存储']}:
    /换新|升级/.test(brief.stage)?{focus:'聊旧资料、常用软件和换机后准备做的事',priorities:['操作系统','存储','接口']}:
    /比较|考虑|选型/.test(brief.stage)?{focus:'解释和日常任务有关的配置特点',priorities:[]}:
    {focus:'从日常问题介绍相关产品特点',priorities:[]};
  const priorities=[...new Set([...phase.priorities,...scene.priorities])];
  // A marketing goal guides information selection, not an automatic invitation.
  const cta='';
  return {angle:scene.angle,problem:scene.problem,priorities,tone:platform.tone,structure:platform.structure,cta,imageMin:platform.range[0],imageMax:platform.range[1],targetLength:shortRevision(brief.revision||'')?'按原稿精简，保留必要事实与条件':platform.length,stage:brief.stage,goal:brief.goal,rationale:`面向${brief.audience}，处于“${brief.stage}”阶段：${phase.focus}。优先回答“${scene.problem}”，以${priorities.slice(0,3).join('、')}取证，采用${platform.name}的${platform.structure.join(' → ')}结构，服务于“${brief.goal}”。`};
}
export { shortRevision } from './writing-length';
function summary(f:Fact):string {
  const clean=f.text.replace(/\*+/g,'').split('\n').map(s=>s.trim().replace(/[。；，;,.]+$/u,'')).filter(Boolean);
  if(f.label==='尺寸与重量') {
    const at=clean.findIndex(s=>s==='重量');
    if(at>=0)return clean.slice(at+1).filter(s=>/kg|\bg\b|差异|配置|测量/.test(s)).slice(0,4).join('；');
  }
  if(f.label==='屏幕') {
    const size=clean.find(s=>/英寸/.test(s)&&s.length<35);const type=clean.find(s=>/OLED|LCD|IPS/.test(s)&&s.length<50);
    return [size,type].filter(Boolean).join('，');
  }
  if(f.label==='电池')return clean.filter(s=>/Wh|额定|典型/.test(s)).slice(0,2).join('；');
  if(f.label==='特色应用')return '相关协同功能需满足设备、系统和软件版本条件，具体支持范围见原始资料';
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
    '尺寸与重量':'从教室到办公室，电脑也是随包携带的一件物品。',
    '屏幕':'文档、照片和课程资料，都呈现在这块屏幕上。',
    '电池':'移动使用还涉及设备的电池配置。',
    '接口':'显示器和其他外设的连接会用到机身接口。',
    '操作系统':'这款设备搭载的操作系统是：',
    '内存':'内存有不同配置选项。',
    '存储':'课程文件、工作文档与照片都需要存储空间。',
    '摄像头':'视频沟通会用到机身摄像头。',
    '处理器':'这款设备的处理器配置是：',
  };
  const sections=facts.map((f,i)=>({heading:brief.platform==='poster'?f.label:brief.platform==='moments'?'':`${String(i+1).padStart(2,'0')} / ${f.label}`,text:brief.platform==='poster'?summarize(f):`${contexts[f.label]||''}\n\n${summarize(f)}。`.trim(),factIds:[f.id]}));
  const images=evidence.images.slice(0,Math.min(strategy.imageMax,strategy.imageMin)).map((image,i)=>({...image,position:i===0?'封面主视觉':`第 ${Math.min(i,sections.length)} 段后`,reason:i===0?`展示 ${evidence.product.shortName} 的产品外观，明确本篇讨论的型号。`:`围绕“${sections[Math.min(i-1,sections.length-1)]?.heading||scene.name}”组织视觉节奏；图片仅说明画面内容，不作为性能证明。`}));
  const titles={xiaohongshu:`${scene.name}选${productLabel}，先想清楚这几件事`,wechat:`${scene.angle}｜${evidence.product.shortName}`,moments:`${scene.name}，从一个真实需求开始`,poster:scene.name==='开学季'?'新学期，自有新可能':scene.angle};
  return {title:titles[brief.platform],lead:brief.platform==='poster'?evidence.product.name:brief.platform==='moments'?scene.hook:`${scene.hook}\n${evidence.product.name}，${scene.angle}。`,sections,cta:'',tags:brief.platform==='xiaohongshu'?[`华为${productLabel}`,scene.name,`${productLabel}选购`]:[],images,disclaimer:'具体配置、系统版本和适用条件以产品资料为准。此稿由规则模板与所选资料编排，未调用大模型；规则核验不替代人工审核，发布前请复核来源、适用条件与动态信息。'};
}
