import { ArrowRight, ChevronDown, Compass, LoaderCircle } from 'lucide-react';
import type { Bootstrap, Brief, Platform, Scene } from '../shared/types';
import type { IntentProposal } from '../shared/director';
import { PERSONAS, PLATFORMS, SCENES } from '../shared/rules';
import type { Persona } from '../shared/types';
import { Notice, SafeImage, SafeLink } from './components';
import { isDemo } from './demo-mode';
import { useStepScroll } from './useStepScroll';

export type FocusAnswer='carry'|'screen'|'meeting'|'home';
interface Props{
  proposal:IntentProposal;draft:Brief;products:Bootstrap['products'];locked:boolean;
  focus?:FocusAnswer;planning:boolean;hasPlan:boolean;canPlan:boolean;
  onChange:<K extends keyof Brief>(key:K,value:Brief[K])=>void;
  onFocus:(value:FocusAnswer)=>void;onPlan:()=>void;
}
export default function BriefChoice({proposal,draft,products,locked,focus,planning,hasPlan,canPlan,onChange,onFocus,onPlan}:Props){
  const stepRef=useStepScroll<HTMLElement>(proposal.id);
  const product=products.find(p=>p.id===draft.productId);
  return <section ref={stepRef} className="brief-card"><div className="director-card-head"><span className="step-label">02 / 方向</span><span className="subtle-label">确认后开始策划</span></div><h2>{product?'这次，就这样创作。':'先选定这次的主角。'}</h2>
    {!product&&proposal.followUp&&<div className="focus-question"><h3>{proposal.followUp.question}</h3><div className="choice-row">{proposal.followUp.options.map(option=><button key={option.value} className="choice-chip" disabled={locked} aria-pressed={focus===option.value} onClick={()=>onFocus(option.value as FocusAnswer)}>{option.label}</button>)}</div></div>}
    {!product&&!!proposal.recommendations?.length&&<div className="product-shortlist" aria-label="可选产品">{proposal.recommendations.map(candidate=>{const p=products.find(p=>p.id===candidate.productId);return <article className="shortlist-card" key={candidate.productId}>{p?.cover&&<SafeImage src={p.cover} alt={candidate.name}/>}<h3>{candidate.name}</h3><p>{candidate.reason}</p><details><summary>查看原始资料<ChevronDown size={14}/></summary>{candidate.facts.map(f=><div className="shortlist-fact" key={f.id}><strong>{f.label}</strong><p>{f.text}</p><SafeLink url={f.sourceUrl}>官方来源</SafeLink></div>)}</details><button disabled={locked} className="button light small" onClick={()=>onChange('productId',candidate.productId)}>选择此型号<ArrowRight size={14}/></button></article>;})}</div>}
    <label className="field brief-product"><span>{product?'产品型号':'具体型号与版本'}</span><select aria-label="策划产品型号" disabled={locked} value={draft.productId} onChange={e=>onChange('productId',e.target.value)}><option value="">选择具体型号与版本</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}{p.conflicts.length?' · 资料待核实':''}</option>)}</select></label>
    {!isDemo && <fieldset className="persona-picker"><legend>谁来发<small>同一款产品，不同门店、不同人设写出来不一样</small></legend><div className="persona-row">{(Object.keys(PERSONAS) as Persona[]).map(id=><button key={id} type="button" className="persona-chip" disabled={locked} aria-pressed={draft.voice?.persona===id} onClick={()=>onChange('voice',draft.voice?.persona===id?undefined:{persona:id,store:draft.voice?.store})}><strong>{PERSONAS[id].name}</strong><small>{PERSONAS[id].hint}</small></button>)}</div><label className="field store-field"><span>门店名称（可选，写进行动引导）</span><input aria-label="门店名称" disabled={locked||!draft.voice} maxLength={40} placeholder={draft.voice?'例如：华为授权体验店 · 西湖银泰':'先选一个人设'} value={draft.voice?.store??''} onChange={e=>draft.voice&&onChange('voice',{...draft.voice,store:e.target.value||undefined})}/></label></fieldset>}
    <div className="brief-snapshot"><span>{draft.audience||'选择受众'}</span><span>{SCENES[draft.scene].name}</span><span>{PLATFORMS[draft.platform].name}</span><span>{draft.goal}</span></div>
    <details className="brief-more"><summary>调整受众、平台和要求<ChevronDown size={14}/></summary><div className="director-fields"><label className="field"><span>希望打动的人</span><input aria-label="策划目标人群" disabled={locked} value={draft.audience} maxLength={200} onChange={e=>onChange('audience',e.target.value)}/></label><label className="field"><span>发布到哪里</span><select aria-label="策划发布平台" disabled={locked} value={draft.platform} onChange={e=>onChange('platform',e.target.value as Platform)}>{Object.entries(PLATFORMS).map(([id,p])=><option key={id} value={id}>{p.name}</option>)}</select></label><label className="field"><span>使用场景</span><select aria-label="策划使用场景" disabled={locked} value={draft.scene} onChange={e=>onChange('scene',e.target.value as Scene)}>{Object.entries(SCENES).map(([id,s])=><option key={id} value={id}>{s.name}</option>)}</select></label><label className="field"><span>内容目标</span><input disabled={locked} value={draft.goal} maxLength={160} onChange={e=>onChange('goal',e.target.value)}/></label></div><label className="field"><span>创作要求</span><textarea aria-label="策划创作要求" disabled={locked} value={draft.requirements} maxLength={3000} rows={3} onChange={e=>onChange('requirements',e.target.value)}/></label></details>
    {product?.conflicts.length?<Notice type="warning">该型号资料待核实，请选择资料完整的型号。</Notice>:null}<div className="brief-action"><span className="brief-confirmation-hint">以上方向可随时调整。</span><button className="button primary" disabled={!canPlan} onClick={onPlan}>{planning?<LoaderCircle size={15} className="spinning"/>:<Compass size={15}/>} {hasPlan?'重新策划':'确认方向，开始策划'}<ArrowRight size={15}/></button></div>
  </section>;
}
