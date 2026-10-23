import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, Compass, LoaderCircle, Plus, ShieldCheck, Sparkles } from 'lucide-react';
import type { Brief, Evidence, ProductCategory } from '../shared/types';
import type { CreativePlan, DirectorEngine, IntentProposal } from '../shared/director';
import { request } from './api';
import { isDemo } from './demo-mode';
import { Notice, SafeImage, Spinner } from './components';
import Result from './Result';
import type { StudioProps } from './Studio';
import BriefChoice, { type FocusAnswer } from './BriefChoice';
import { AgentPipeline } from './AgentPipeline';
import { ProductShot } from './ProductShot';
import { displayCover, displayName, HERO_PRODUCTS } from './display-covers';
import { useStepScroll } from './useStepScroll';
import './director.css';

const examples = ['开学季，给大学新生写一篇小红书，介绍课堂笔记和小组汇报相关的产品特点。', '面向经常出差的商务人士，写一篇公众号，围绕真实办公任务展开。', '门店朋友圈，围绕周末拍花，介绍手机长焦。'];
const categoryName: Record<ProductCategory, string> = { computer: '笔记本', phone: '手机', tablet: '平板', other: '其他' };
const initialEngine: DirectorEngine = isDemo ? 'rules' : 'model';
const emptyBrief = (engine: DirectorEngine): Brief => ({ productId: '', audience: '', scene: 'school', platform: 'xiaohongshu', stage: '比较选型', goal: '介绍产品特点', requirements: '', mode: 'local', generation: engine, autoRepair: isDemo ? undefined : true });

export default function DirectorStudio(props: StudioProps) {
  const { bootstrap, generating, run } = props;
  const [message, setMessage] = useState('');
  const [picked, setPicked] = useState('');
  const [engine, setEngine] = useState<DirectorEngine>(initialEngine);
  const [proposal, setProposal] = useState<IntentProposal | null>(null);
  const [draft, setDraft] = useState<Brief>(() => emptyBrief(initialEngine));
  const [focus,setFocus]=useState<FocusAnswer|undefined>();
  const [plan, setPlan] = useState<CreativePlan | null>(null);
  const [conceptId, setConceptId] = useState('');
  const [busy, setBusy] = useState<'intent' | 'plan' | null>(null);
  const [error, setError] = useState('');
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [evidenceError, setEvidenceError] = useState('');
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const planRef = useStepScroll<HTMLElement>(plan?.id);
  const busyRef = useStepScroll<HTMLDivElement>(busy);
  const requestSequence = useRef(0);
  const locked = !!busy || generating;
  const product = bootstrap.products.find(p => p.id === draft.productId);
  const selected = plan?.concepts.find(c => c.id === conceptId);
  const modelReady = engine === 'rules' || bootstrap.settings.llmConfigured;
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!draft.productId) { setEvidence(null); setEvidenceBusy(false); setEvidenceError(''); return; }
    const abort = new AbortController(); setEvidence(null); setEvidenceError(''); setEvidenceBusy(true);
    request<Evidence>(`/api/products/${encodeURIComponent(draft.productId)}`, { signal: abort.signal }).then(setEvidence).catch(e => { if (!abort.signal.aborted) setEvidenceError(e.message); }).finally(() => { if (!abort.signal.aborted) setEvidenceBusy(false); });
    return () => abort.abort();
  }, [draft.productId]);
  useEffect(() => {
    setExpired(!!plan && Date.parse(plan.expiresAt) <= Date.now());
    if (!plan) return;
    const timer = setTimeout(() => setExpired(true), Math.max(0, Date.parse(plan.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [plan]);
  function resetPlan() { setPlan(null); setConceptId(''); setError(''); }
  function changeMessage(value: string) { setMessage(value); setProposal(null); setDraft(emptyBrief(engine)); setFocus(undefined); resetPlan(); }
  function changeEngine(value: DirectorEngine) { setEngine(value); setProposal(null); setDraft(emptyBrief(value)); setFocus(undefined); resetPlan(); }
  function change<K extends keyof Brief>(key: K, value: Brief[K]) { setDraft(current => ({ ...current, [key]: value })); resetPlan(); }
  async function interpret(nextFocus=focus) {
    if (locked || !modelReady || message.trim().length < 2) return;
    const seq = ++requestSequence.current, abort = new AbortController(); controller.current = abort;
    setBusy('intent'); setError(''); resetPlan();
    try {
      // A strip pick is sent as an explicit user answer; the server still resolves
      // and records it, so a click never bypasses clarification of other fields.
      const answers = { ...(nextFocus ? { focus: nextFocus } : {}), ...(picked ? { productId: picked } : {}) };
      const next = await request<IntentProposal>('/api/director/interpret', { method: 'POST', body: JSON.stringify({ message, engine, answers }), signal: abort.signal });
      if (abort.signal.aborted || seq !== requestSequence.current) return;
      setProposal(next);setFocus(nextFocus); setDraft({ ...emptyBrief(engine), ...next.suggestedBrief, requirements:next.suggestedBrief.requirements??message, mode: 'local', generation: engine, autoRepair: isDemo ? undefined : true });
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : '请稍后重试'); }
    finally { if (seq === requestSequence.current) { setBusy(null); controller.current = null; } }
  }
  async function makePlan() {
    if (locked || !product || product.conflicts.length || !modelReady || !draft.audience.trim() || !evidence || evidenceBusy) return;
    const seq = ++requestSequence.current, abort = new AbortController(); controller.current = abort;
    setBusy('plan'); setError(''); setPlan(null);
    try {
      const next = await request<CreativePlan>('/api/director/plan', { method: 'POST', body: JSON.stringify({ message, engine, brief: draft }), signal: abort.signal });
      if (abort.signal.aborted || seq !== requestSequence.current) return;
      setPlan(next); setConceptId(next.recommendedConceptId);
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : '请稍后重新策划'); }
    finally { if (seq === requestSequence.current) { setBusy(null); controller.current = null; } }
  }
  function cancel() { controller.current?.abort(); requestSequence.current++; setBusy(null); }
  function startOver() { if (locked) return; changeMessage(''); props.onNew(); }

  const withCover = (p?: typeof product) => p && displayCover(p) ? p : undefined;
  const featured = withCover(product) ?? withCover(bootstrap.products.find(p => p.id === picked)) ?? HERO_PRODUCTS.map(id => withCover(bootstrap.products.find(p => p.id === id))).find(Boolean) ?? bootstrap.products.map(withCover).find(Boolean);
  const featuredCover = featured && displayCover(featured);
  const { stats } = bootstrap;
  const pickedId = proposal ? draft.productId : picked;
  function pick(id: string) { setPicked(id); if (proposal) change('productId', id); }
  return <div className="director-workspace">
    <header className="director-hero">
      <div className="hero-text">
        <p className="hero-status"><span className="hero-figure"><b>{stats.products}</b>款机型</span><span className="hero-figure"><b>{stats.documents}</b>{isDemo ? '项公开资料' : '份资料'}</span><span className="hero-figure"><b>{stats.images}</b>{isDemo ? '张官网图' : '张原图'}</span></p>
        <h1>让真实产品，<br />一句话变成<wbr />能发的图文</h1>
        <p className="hero-sub">{isDemo ? '卖点取自官网公开资料，搭配同型号官网图片，成稿后核验事实与表达。' : <>卖点只取自知识库原文，配图只用<span className="nowrap">同型号原图</span>，成稿后自动核验事实与合规。</>}</p>
        <div className="idea-card"><div className="director-card-head"><span className="step-label">01 需求</span>{isDemo ? <span className="subtle-label">规则体验</span> : <div className="engine-toggle" aria-label="创作引擎"><button disabled={locked} aria-pressed={engine === 'model'} onClick={() => changeEngine('model')}>模型创作</button><button disabled={locked} aria-pressed={engine === 'rules'} onClick={() => changeEngine('rules')}>规则体验</button></div>}</div><label htmlFor="director-message"><h2>这次要写什么？</h2></label><textarea id="director-message" aria-label="创作想法" value={message} onChange={e => changeMessage(e.target.value)} disabled={locked} maxLength={3000} placeholder="比如：开学季，给大学新生写一篇小红书，介绍 MateBook 14 的键盘与触屏。" rows={4} /><div className="idea-bottom"><span>写清机型、人群和平台，缺的会追问</span><button className="button primary" disabled={locked || !modelReady || message.trim().length < 2} onClick={() => void interpret()}>{busy === 'intent' ? <LoaderCircle size={16} className="spinning" /> : <Sparkles size={16} />}整理创作方向<ArrowRight size={16} /></button></div>{!modelReady && <div className="director-setup"><span>模型未连接，可以先用规则体验</span><button className="text-button" onClick={props.onSettings}>连接模型 <ArrowRight size={13} /></button></div>}{engine === 'rules' && <p className="director-mode-note">规则体验：预设方向与规则编排，不调用大模型</p>}</div>
      </div>
      <figure className="hero-stage" aria-hidden="true"><span className="stage-ring" />{featuredCover && <ProductShot key={featured.id} src={featuredCover} alt="" loading="eager" fetchPriority="high" />}<figcaption>{featured?.name}</figcaption></figure>
    </header>
    {!proposal && <div className="idea-examples" aria-label="示例需求">{examples.map(text => <button key={text} disabled={locked} onClick={() => changeMessage(text)}>{text}</button>)}</div>}
    <section className="model-strip" aria-label="选择机型">
      <div className="strip-head"><h2>选一款机型</h2><p>共 {bootstrap.products.length} 款，左右滑动查看；也可以直接在需求里写型号</p></div>
      <div className="strip-scroll">{bootstrap.products.map(p => <button key={p.id} className={`model-card ${pickedId === p.id ? 'selected' : ''}`} aria-pressed={pickedId === p.id} disabled={locked || !!p.conflicts.length} onClick={() => pick(p.id)}><span className="model-thumb">{displayCover(p) ? <ProductShot src={displayCover(p)} alt="" /> : <span className="thumb-empty">{categoryName[p.category ?? 'other']}</span>}</span><strong>{displayName(p)}</strong><small className={p.conflicts.length ? 'is-flag' : ''}>{p.conflicts.length ? '资料待核实' : categoryName[p.category ?? 'other']}</small></button>)}</div>
    </section>
    <div className={`director-layout ${product ? 'has-side' : ''}`}><section className="director-main">
      {proposal && <BriefChoice proposal={proposal} draft={draft} products={bootstrap.products} locked={locked} focus={focus} planning={busy==='plan'} hasPlan={!!plan} canPlan={!locked&&!!product&&!product.conflicts.length&&!!draft.audience.trim()&&modelReady&&!evidenceBusy&&!!evidence} onChange={change} onFocus={value=>void interpret(value)} onPlan={()=>void makePlan()}/>}
      {error && <Notice type="error">{error}</Notice>}{busy && <div ref={busyRef} className="director-busy" aria-live="polite"><Spinner label={busy === 'intent' ? '正在理解需求' : '正在策划三个写法'} /><button className="text-button" onClick={cancel}>取消</button></div>}
      {plan && <section ref={planRef} className="creative-plans" aria-label="创意方案">
        <div className="director-card-head"><span className="step-label">03 写法</span><span className="subtle-label">同一款产品，同一批事实</span></div>
        <h2>三种写法，选一个</h2>
        <div className="concept-grid">{plan.concepts.map((concept, i) =>
          <button className={`concept-card ${conceptId === concept.id ? 'selected' : ''}`} key={concept.id} aria-pressed={conceptId === concept.id} disabled={locked} onClick={() => setConceptId(concept.id)}>
            <div className="concept-top"><span>方向 0{i + 1}</span>{concept.id === plan.recommendedConceptId ? <small>推荐</small> : <Compass size={15} />}</div>
            <h3>{concept.name}</h3><p>{concept.problem}</p>
            <div className="concept-choice">{conceptId === concept.id ? <><Check size={14} />已选择</> : <>选这个写法</>}</div>
          </button>
        )}</div>
        {selected && <details className="concept-notes">
          <summary>查看配图安排与选用的事实<ChevronDown size={14}/></summary>
          <p>{selected.reason}</p><p>{selected.visualDirection}</p>
          <div className="selected-facts">{selected.factIds.map(id=><span key={id}>{evidence?.facts.find(f=>f.id===id)?.label||'产品事实'}</span>)}</div>
          {plan.originality && <p>已和本机 {plan.originality.comparedRunIds.length} 篇同型号、同平台作品比对，避开重复的角度与结构。</p>}
        </details>}
        {expired && <Notice type="warning">这份方案已过期，重新策划即可继续。</Notice>}
        <div className="director-launch"><span><ShieldCheck size={15} />成稿后自动核验</span><button className="button primary" disabled={locked || expired || !selected || !modelReady} onClick={() => void props.onGenerate({ ...plan.brief, directorPlanId: plan.id, conceptId })}><Sparkles size={16} />{engine === 'model' ? '生成图文作品' : '生成规则体验稿'}<ArrowRight size={16} /></button></div>
      </section>}
    </section>{product && <aside className="director-side"><div className="director-material"><div className="director-card-head"><span className="step-label">知识库资料</span><span className="subtle-label">{product.family}</span></div><div className="material-picture">{displayCover(product) && <ProductShot src={displayCover(product)} alt={product.name} />}</div><h3>{product.shortName}</h3><div className="material-counts"><span><strong>{product.factCount}</strong>项事实</span><span><strong>{product.imageCount}</strong>张原图</span></div>{evidenceBusy && <Spinner label="读取资料" />}{evidenceError && <Notice type="warning">{evidenceError}</Notice>}{evidence?.facts.slice(0, 4).map(f => <details className="material-fact" key={f.id}><summary>{f.label}<Plus size={12} /></summary><p>{f.text}</p></details>)}<button className="text-button" onClick={props.onKnowledge}>浏览全部资料 <ArrowRight size={13} /></button></div></aside>}</div>
    {props.generationError && <Notice type="error">{props.generationError}</Notice>}{generating && <AgentPipeline stages={props.stages} running={generating} onCancel={props.onCancel} />}
    {run && <div ref={props.outputRef} className="output-anchor"><Result run={run} runs={bootstrap.runs} generating={generating} onGenerate={props.onGenerate} onSaveRun={props.onSaveRun} onOpenRun={props.onOpenRun} notify={props.notify} /><button className="button light director-new" disabled={locked} onClick={startOver}><Plus size={15} />开始下一份创作</button></div>}
  </div>;
}
