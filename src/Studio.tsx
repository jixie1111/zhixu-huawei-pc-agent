import { useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { ArrowRight, ArrowUpRight, BookOpen, Check, ChevronRight, Circle, Clock3, FileCheck2, Flower2, GraduationCap, Image, Laptop, Layers3, Leaf, MessageCircle, PanelTop, ShieldCheck, Sparkles, WandSparkles } from 'lucide-react';
import type { Bootstrap, Brief, Evidence, Platform, Run, Scene } from '../shared/types';
import { PLATFORMS, SCENES } from '../shared/rules';
import type { StageEvent } from './api';
import { CheckRow, ModeBadge, Notice, Spinner, SafeImage } from './components';
import Result from './Result';
import EvidencePreview from './EvidencePreview';
import { isDemo } from './demo-mode';
import DirectorStudio from './DirectorStudio';
import EcosystemStudio from './EcosystemStudio';

export interface StudioProps {
  bootstrap: Bootstrap; brief: Brief; onBrief: Dispatch<SetStateAction<Brief>>;
  evidence: Evidence | null; evidenceError: string; evidenceLoading: boolean; run: Run | null;
  generating: boolean; stages: StageEvent[]; generationError: string;
  onGenerate: (brief: Brief) => Promise<void>; onCancel: () => void; onSaveRun: (run: Run) => void;
  onOpenRun: (id: string) => Promise<void>; onSettings: () => void; onKnowledge: () => void;
  onNew: () => void; notify: (message: string) => void; outputRef: RefObject<HTMLDivElement | null>;
}
const platformIcons = { xiaohongshu: BookOpen, wechat: MessageCircle, moments: Circle, poster: PanelTop };
const goals = ['激发兴趣与收藏', '帮助理解产品', '引导到店体验', '引导私信咨询', '辅助配置决策', '提升活动关注'];
const phases = ['了解产品', '比较与考虑', '准备购买', '到店体验', '换新升级'];

export default function Studio(props: StudioProps) {
  const [entry,setEntry]=useState<'director'|'classic'|'ecosystem'>(()=>new URLSearchParams(location.search).get('workspace')==='classic'?'classic':'director');
  const localDirector = !isDemo && !props.bootstrap.settings.publicDeployment;
  const switcher = localDirector && <div className="studio-entry-switch" aria-label="工作台模式"><button aria-pressed={entry==='director'} disabled={props.generating} onClick={() => setEntry('director')}>创意导演</button><button aria-pressed={entry==='ecosystem'} disabled={props.generating} onClick={() => setEntry('ecosystem')}>生态创作</button><button aria-pressed={entry==='classic'} disabled={props.generating} onClick={() => setEntry('classic')}>经典表单</button></div>;
  return <>{switcher}{localDirector&&entry==='director'?<DirectorStudio {...props}/>:localDirector&&entry==='ecosystem'?<EcosystemStudio bootstrap={props.bootstrap} notify={props.notify}/>:<ClassicStudio {...props}/>}</>;
}

function ClassicStudio(props: StudioProps) {
  const { bootstrap, brief, onBrief, evidence, evidenceError, evidenceLoading, run, generating, stages, generationError, onGenerate, onCancel, onSettings, onKnowledge, onNew } = props;
  const selectedProduct = bootstrap.products.find(p => p.id === brief.productId);
  const set = <K extends keyof Brief>(key: K, value: Brief[K]) => onBrief(current => ({ ...current, [key]: value }));
  const changeScene = (scene: Scene) => onBrief(current => ({ ...current, scene, audience: SCENES[scene].audience }));
  const sourceBlocked = brief.mode === 'ima' && !bootstrap.settings.imaConfigured;
  const usesModel = brief.mode === 'ima' || brief.generation === 'model';
  const modelBlocked = usesModel && !bootstrap.settings.llmConfigured;
  const conflictBlocked = brief.mode === 'local' && !!selectedProduct?.conflicts.length;
  const platform = PLATFORMS[brief.platform];

  return <>
    <section className="studio-hero" aria-label="创作工作台介绍">
      <div className="hero-copy"><div className="eyebrow"><span className="tiny-star">✳</span> EVIDENCE-LED CREATION</div><h1>按表单写一篇，<br />每一处都有出处</h1><p>选好机型、人群、场景和平台，一次生成完整图文。{!isDemo && <><br />想要更多写法，回到创意导演。</>}</p><div className="hero-trust"><span><FileCheck2 size={14} /> 事实有依据</span><span><Layers3 size={14} /> 多平台适配</span><span><ShieldCheck size={14} /> 内容先核验</span></div></div>
      <div className="hero-visual"><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />{selectedProduct?.cover ? <SafeImage className="hero-product" src={selectedProduct.cover} alt={`${selectedProduct.name} 官方产品资料图`} onError={e => { e.currentTarget.style.opacity = '0'; }} /> : <div className="hero-product-placeholder"><Laptop size={125} strokeWidth={0.8} /><span>给好产品，一个好故事。</span></div>}<div className="hero-caption"><span className="hero-caption-line" /><div><strong>{selectedProduct?.shortName || 'HUAWEI PC'}</strong><span>{isDemo ? '官方远程图片 · 官网公开资料摘录' : bootstrap.settings.publicDeployment ? '产品素材展示以已授权来源为准' : '产品图源自本地知识库 · 保留原始依据'}</span></div><ArrowUpRight size={17} /></div><div className="hero-label"><Leaf size={15} /><span>真实，才有力量</span></div></div>
    </section>

    <div className="section-heading"><div><span className="section-kicker">LET’S CREATE</span><h2>开启一次有序创作 <span>把想法交给物有言，把时间留给灵感。</span></h2></div>{run && <button className="button light small" onClick={onNew}>新建创作 <ArrowRight size={14} /></button>}</div>
    <div className="creation-layout">
      <form className="composer card" onSubmit={e => { e.preventDefault(); if (!sourceBlocked && !modelBlocked && !conflictBlocked) void onGenerate({ ...brief, generation: usesModel ? 'model' : 'rules', parentId: undefined, revision: undefined }); }}>
        <fieldset disabled={generating} className="composer-fieldset">
          <div className="form-section"><div className="form-section-title"><span>01</span><h3>这次，想在哪里表达？</h3><span className="form-hint">选择内容平台</span></div><div className="platform-grid">{(Object.keys(PLATFORMS) as Platform[]).map(key => { const p = PLATFORMS[key], Icon = platformIcons[key]; return <label key={key} className={`platform-option ${brief.platform === key ? 'selected' : ''}`} style={{ '--platform-color': p.color } as React.CSSProperties}><input type="radio" name="platform" value={key} checked={brief.platform === key} onChange={() => set('platform', key)} /><span className="platform-icon"><Icon size={19} strokeWidth={1.8} /></span><strong>{p.name}</strong><span className="platform-detail">{p.range[0] === p.range[1] ? `${p.range[0]} 张图` : `${p.range[0]}–${p.range[1]} 张图`} · {key === 'poster' ? '醒目简明' : key === 'moments' ? '轻量触达' : key === 'wechat' ? '深度解读' : '生活分享'}</span>{brief.platform === key && <Check className="platform-check" size={13} />}</label>; })}</div></div>
          <div className="form-section"><div className="form-section-title"><span>02</span><h3>说对产品，也说给对的人。</h3></div>
            <div className="field-row product-row"><label className="field"><span>产品型号 <em>*</em></span><select aria-label="产品型号" value={brief.productId} onChange={e => set('productId', e.target.value)} required><option value="" disabled>请选择准确的产品型号</option>{bootstrap.products.map(product => <option key={product.id} value={product.id}>{product.name}{product.conflicts.length ? '（资料待核实）' : ''}</option>)}</select></label><label className="field"><span>目标人群 <em>*</em></span><input aria-label="目标人群" value={brief.audience} onChange={e => set('audience', e.target.value)} placeholder="例如：经常出差的职场人士" maxLength={150} required /></label></div>
            <div className="field scene-field"><span>使用场景 <small>选一个场景，受众也会同步调整</small></span><div className="scene-options">{(Object.keys(SCENES) as Scene[]).map(scene => <button type="button" key={scene} onClick={() => changeScene(scene)} className={`scene-chip ${brief.scene === scene ? 'selected' : ''}`} aria-pressed={brief.scene === scene}>{scene === 'school' && <GraduationCap size={14} />}{scene === 'office' && <Laptop size={14} />}{scene === 'festival' && <Flower2 size={14} />}{SCENES[scene].name}{brief.scene === scene && <Check size={12} />}</button>)}</div></div>
            <div className="field-row"><label className="field"><span>购买阶段</span><select aria-label="购买阶段" value={brief.stage} onChange={e => set('stage', e.target.value)}>{phases.map(phase => <option key={phase}>{phase}</option>)}</select></label><label className="field"><span>内容目标</span><select aria-label="内容目标" value={brief.goal} onChange={e => set('goal', e.target.value)}>{goals.map(goal => <option key={goal}>{goal}</option>)}</select></label></div>
          </div>
          <div className="form-section last"><div className="form-section-title"><span>03</span><h3>还有什么，想特别告诉我？</h3><span className="form-hint">选填</span></div><label className="field requirements-field"><span className="sr-only">额外创作要求</span><textarea aria-label="额外创作要求" rows={3} maxLength={1500} value={brief.requirements} onChange={e => set('requirements', e.target.value)} placeholder="比如：语气轻松一些，围绕差旅会议展开，不要夸张描述。\n涉及价格、活动或补贴，请提供可核实的来源。" /><span className="character-count">{brief.requirements.length} / 1500</span></label>
            <div className="source-select"><span className="source-caption">资料来源</span><label><input type="radio" name="source-mode" checked={brief.mode === 'local'} onChange={() => set('mode', 'local')} disabled={bootstrap.settings.publicDeployment} />{isDemo ? '公开官网摘录' : '本地知识库'}<span>{bootstrap.stats.documents ? (isDemo ? '示例资料' : '已导入') : '待导入'}</span></label><label><input type="radio" name="source-mode" disabled={isDemo} checked={brief.mode === 'ima'} onChange={() => set('mode', 'ima')} />ima 共享知识库<span className={bootstrap.settings.connected ? 'tag-connected' : ''}>{bootstrap.settings.connected ? '已连接' : '待配置'}</span></label></div>
            <div className="source-select generation-select"><span className="source-caption">生成方式</span><label><input type="radio" name="generation-mode" disabled={isDemo} checked={usesModel} onChange={() => set('generation', 'model')} />AI 模型创作<span>场景表达</span></label><label><input type="radio" name="generation-mode" checked={!usesModel} onChange={() => set('generation', 'rules')} disabled={brief.mode === 'ima'} />规则预览<span>不调用模型</span></label></div>
          </div>
        </fieldset>
        {sourceBlocked && <div className="form-notice"><Notice type="warning">请先配置有效 ima 凭证，再使用在线资料检索。<button type="button" className="text-button" onClick={onSettings}>前往连接设置 <ArrowRight size={13} /></button></Notice></div>}
        {modelBlocked && !sourceBlocked && <div className="form-notice"><Notice type="warning">{brief.mode === 'local' ? (bootstrap.stats.documents ? '本地知识库已就绪。AI 创作只需配置模型，无需连接 ima；也可明确选择“规则预览”体验流程。' : '尚未导入本地资料。请先完成资料导入；AI 创作还需另外配置模型。') : 'ima 已配置；生成图文还需要模型凭证。可先使用右侧“预览 ima 取证”检查资料。'}<button type="button" className="text-button" onClick={onSettings}>配置生成模型 <ArrowRight size={13} /></button></Notice></div>}
        {conflictBlocked && <div className="form-notice"><Notice type="error">该型号资料存在冲突，已停止生成。请更换无冲突型号，或核实原始资料。</Notice></div>}
        {generationError && <div className="form-notice"><Notice type="error">{generationError}</Notice></div>}
        {generating ? <div className="generation-progress" aria-live="polite"><div className="generation-title"><Spinner label={stages.at(-1)?.name || '正在准备创作'} /><button type="button" className="text-button muted" onClick={onCancel}>停止等待</button></div><div className="progress-track"><span style={{ width: `${Math.min(96, Math.max(8, stages.length * 15))}%` }} /></div><p>{stages.at(-1)?.detail || '正在连接创作服务，请稍等片刻。'}</p><div className="stage-pills">{stages.map(stage => <span key={stage.step}><Check size={11} />{stage.name}</span>)}</div></div> : <div className="composer-footer"><p><ShieldCheck size={14} /><span>{usesModel ? (brief.mode === 'local' ? '本地知识检索 + AI 模型创作 · 结果可溯源' : 'ima 资料检索 + AI 模型创作 · 结果可溯源') : '规则预览 · 不调用模型 · 结果仍需核验'}</span></p><button type="submit" className="button primary generate-button" disabled={!brief.productId || sourceBlocked || modelBlocked || conflictBlocked || (brief.mode === 'local' && !bootstrap.stats.documents)}><Sparkles size={17} />开始创作<ArrowRight size={16} /></button></div>}
      </form>

      <aside className="creative-sidebar">
        <div className="evidence-card card"><div className="side-card-heading"><span className="small-icon"><BookOpen size={17} /></span><h3>这次创作，有据可循</h3></div><p className="side-card-subtitle">精确到型号，让每个亮点都站得住。</p>{selectedProduct && <div className="selected-product">{selectedProduct.cover ? <SafeImage src={selectedProduct.cover} alt="" /> : <Laptop size={36} />}<div><span>{selectedProduct.family}</span><strong>{selectedProduct.shortName}</strong></div></div>}{evidenceLoading ? <div className="side-loading"><Spinner label="读取产品资料" /></div> : evidenceError ? <Notice type="warning">{evidenceError}</Notice> : <><div className="evidence-counts"><div><strong>{selectedProduct?.factCount ?? '—'}<small>项</small></strong><span>产品事实</span></div><div><strong>{selectedProduct?.imageCount ?? '—'}<small>张</small></strong><span>同型号素材</span></div></div><div className="side-facts">{evidence?.facts.slice(0, 3).map(fact => <div key={fact.id}><span className="fact-dot" /><span>{fact.label}</span><Check size={12} /></div>)}</div></>}<button className="side-link" onClick={onKnowledge}>查看知识库与素材 <ArrowUpRight size={14} /></button><div className="source-boundary"><InfoMark /><span>{brief.mode === 'local' ? (isDemo ? '仅使用随站发布的官网公开事实摘录。图片直接引用官网，未包含私有 ZIP 知识库。' : '从已导入的 ZIP 知识库检索事实与图片，保留文件及原始来源。此流程不消耗 ima 读取额度。') : '在线事实与图片将在创作时从指定共享知识库检索。'}</span></div>{brief.mode === 'ima' && <div style={{ padding: '0 18px 18px' }}><EvidencePreview productId={brief.productId} productName={selectedProduct?.name || '所选产品'} configured={bootstrap.settings.imaConfigured} disabled={generating} onSettings={onSettings} /></div>}</div>
        <div className="strategy-note"><div className="strategy-note-top"><WandSparkles size={17} /><span>本次内容配方</span><span className="recipe-number">01 / 03</span></div><h3>{SCENES[brief.scene].name} × {platform.name}</h3><p>{SCENES[brief.scene].angle}</p><div className="recipe-tags"><span>{platform.length}</span><span>{platform.range[0] === platform.range[1] ? `${platform.range[0]} 张配图` : `${platform.range[0]}–${platform.range[1]} 张配图`}</span></div><div className="recipe-footer"><span className="tiny-star">✳</span><span>先理解场景，再选择表达。</span></div></div>
        <div className="assurance"><ShieldCheck size={22} strokeWidth={1.4} /><div><strong>放心创作，谨慎发布</strong><p>型号不混用 · 事实不编造<br />动态价格与优惠需人工确认</p></div></div>
      </aside>
    </div>

    {run && <div ref={props.outputRef} className="output-anchor"><Result run={run} runs={bootstrap.runs} generating={generating} onGenerate={props.onGenerate} onSaveRun={props.onSaveRun} onOpenRun={props.onOpenRun} notify={props.notify} /></div>}
    {!run && <section className="workflow-strip" aria-label="创作流程"><div className="workflow-intro"><span className="section-kicker">THOUGHTFULLY CONNECTED</span><h3>灵感与事实之间，<br />每一步都清晰。</h3></div>{[{ icon: BookOpen, title: '检索产品事实', text: '锁定型号，匹配可信知识' }, { icon: Sparkles, title: '理解场景与表达', text: '适配受众、目标与平台' }, { icon: ShieldCheck, title: '逐项核验输出', text: '事实、图片与表达一并检查' }].map((item, index) => <div className="workflow-step" key={item.title}><span className="workflow-index">0{index + 1}</span><item.icon size={20} strokeWidth={1.5} /><h4>{item.title}</h4><p>{item.text}</p>{index < 2 && <ChevronRight className="workflow-arrow" size={16} />}</div>)}</section>}
  </>;
}
function InfoMark() { return <span className="info-mark">i</span>; }
