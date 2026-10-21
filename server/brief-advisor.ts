import type { Product, Evidence, Platform, ProductCategory } from '../shared/types';
import type { IntentProposal, ProductSuggestion } from '../shared/director';
import { PLATFORMS } from '../shared/rules';

export type BriefFocus = 'carry' | 'screen' | 'meeting' | 'home';
export interface BriefAnswers { productId?: string; platform?: Platform; focus?: BriefFocus; category?: ProductCategory }
const focusOptions: Record<BriefFocus,string> = { carry:'每天带着走', screen:'阅读与看资料', meeting:'会议与沟通', home:'家里多人使用' };
const labelOrder: Record<BriefFocus,string[]> = {
  carry:['尺寸与重量','电池','屏幕'], screen:['屏幕','尺寸与重量','存储'],
  meeting:['摄像头','麦克风','音频','接口'], home:['屏幕','存储','内存','接口'],
};
export function focusLabel(focus:BriefFocus){return focusOptions[focus];}
function categoryFrom(message:string):ProductCategory|undefined {
  const kinds:ProductCategory[]=[];
  if(/电脑|笔记本|轻薄本|MateBook/i.test(message))kinds.push('computer');
  if(/手机|Pura|nova/i.test(message))kinds.push('phone');
  if(/平板|MatePad/i.test(message))kinds.push('tablet');
  return kinds.length===1?kinds[0]:undefined;
}
function focusFrom(message:string):BriefFocus|undefined {
  if(/携带|轻薄|背着|差旅|出差/.test(message))return 'carry';
  if(/屏幕|阅读|看资料|看文献/.test(message))return 'screen';
  if(/会议|开会|沟通/.test(message))return 'meeting';
  if(/家里|家庭|家用/.test(message))return 'home';
  return undefined;
}
/** A small, source-backed shortlist. It ranks evidence coverage, never predicts
 * performance, quietness, compatibility, sales conversion or personal fit. */
export function adviseBrief(proposal:IntentProposal,products:Product[],getEvidence:(id:string)=>Evidence,answers:BriefAnswers={}):Pick<IntentProposal,'recommendations'|'followUp'> {
  if(proposal.suggestedBrief.productId)return {};
  const category=answers.category??categoryFrom(proposal.message);
  const focus=answers.focus??focusFrom(proposal.message);
  const platform=proposal.suggestedBrief.platform;
  const min=platform?PLATFORMS[platform].range[0]:1;
  const labels=labelOrder[focus??'screen'];
  const eligible=products.filter(p=>!p.conflicts.length&&p.imageCount>=min&&(!category||(p.category??'computer')===category));
  const records=eligible.map(product=>{
    const evidence=getEvidence(product.id);
    if(evidence.product.id!==product.id||evidence.product.conflicts.length||evidence.facts.some(f=>f.productId!==product.id||f.sourceMode!=='local'))return undefined;
    const facts=labels.flatMap(label=>evidence.facts.filter(f=>f.label===label)).slice(0,2);
    if(!facts.length)return undefined;
    const suggestion:ProductSuggestion={productId:product.id,name:product.name,reason:`可先核对${facts.map(f=>f.label).join('、')}资料，再确认具体型号与配置。`,facts:facts.map(({id,label,text,sourceTitle,sourceUrl})=>({id,label,text,sourceTitle,sourceUrl}))};
    const score=facts.reduce((sum,f)=>sum+labels.length-labels.indexOf(f.label),0);
    return {score,suggestion};
  }).filter(record=>record!==undefined).sort((a,b)=>b.score-a.score||a.suggestion.productId.localeCompare(b.suggestion.productId));
  return {
    recommendations:records.slice(0,2).map(r=>r.suggestion),
    followUp:!focus&&eligible.length>2?{key:'focus',question:'这次想先回应顾客哪一类日常需求？',options:Object.entries(focusOptions).map(([value,label])=>({value,label}))}:undefined,
  };
}
