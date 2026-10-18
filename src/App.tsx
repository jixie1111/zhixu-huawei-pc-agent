import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, ChevronDown, ChevronRight, CircleHelp, Clock3, Command, Feather, Layers3, Menu, Plus, Settings2, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { Bootstrap, Brief, Evidence, Run, RunSummary, Settings } from '../shared/types';
import { SCENES } from '../shared/rules';
import { generate, hasAdminToken, request, type StageEvent } from './api';
import { EmptyState, Modal, Notice, Spinner } from './components';
import Studio from './Studio';
import Library from './Library';
import { AuditCenter, History } from './WorkspacePages';
import ConnectionSettings from './Settings';
import DemoSettings from './DemoSettings';
import { isDemo } from './demo-mode';

type Page = 'studio' | 'knowledge' | 'history' | 'audit' | 'settings';
const pages = [
  { id: 'studio' as const, name: '创作工作台', en: 'Workspace', icon: Feather },
  { id: 'knowledge' as const, name: '产品知识库', en: 'Knowledge', icon: BookOpen },
  { id: 'history' as const, name: '作品记录', en: 'My creations', icon: Layers3 },
  { id: 'audit' as const, name: '核验中心', en: 'Verification', icon: ShieldCheck },
  { id: 'settings' as const, name: '连接设置', en: 'Connections', icon: Settings2 },
];
const initialBrief: Brief = { productId: '', audience: SCENES.office.audience, scene: 'office', platform: 'xiaohongshu', stage: '了解产品', goal: '激发兴趣与收藏', requirements: '', mode: 'local', generation: 'rules' };
function getPage(): Page { const hash = location.hash.replace('#', ''); return pages.some(p => p.id === hash) ? hash as Page : 'studio'; }

export default function App() {
  const [page, setPage] = useState<Page>(getPage);
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [bootError, setBootError] = useState('');
  const [brief, setBrief] = useState<Brief>(initialBrief);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [evidenceError, setEvidenceError] = useState('');
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [generating, setGenerating] = useState(false);
  const [stages, setStages] = useState<StageEvent[]>([]);
  const [generationError, setGenerationError] = useState('');
  const [openingRun, setOpeningRun] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [help, setHelp] = useState(false);
  const [toast, setToast] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const outputRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const authEpoch = useRef(0);

  const notify = useCallback((message: string) => { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 4200); }, []);
  const navigate = useCallback((next: Page) => { setPage(next); location.hash = next; setMobileNav(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);
  const refresh = useCallback(async () => {
    const epoch = authEpoch.current;
    try {
      const data = await request<Bootstrap>('/api/bootstrap');
      if (data.settings.publicDeployment && hasAdminToken()) {
        try { data.runs = await request<RunSummary[]>('/api/runs'); if (epoch === authEpoch.current) notify(`访问令牌已验证，已同步 ${data.runs.length} 份受保护作品`); }
        catch (error) { if (epoch === authEpoch.current) { setRun(null); notify(error instanceof Error ? error.message : '访问令牌验证失败'); } data.runs = []; }
      }
      if (epoch !== authEpoch.current) return;
      setBootstrap(data); setBootError('');
      setBrief(current => ({ ...current, productId: current.productId || data.products[0]?.id || '', mode: data.settings.publicDeployment ? 'ima' : current.mode }));
    } catch (error) { setBootError(error instanceof Error ? error.message : '无法连接工作台服务'); }
  }, [notify]);
  useEffect(() => { void refresh(); const listener = () => setPage(getPage()); window.addEventListener('hashchange', listener); return () => { window.removeEventListener('hashchange', listener); abortRef.current?.abort(); clearTimeout(toastTimer.current); }; }, [refresh]);
  useEffect(() => {
    const changed = () => {
      authEpoch.current += 1;
      if (bootstrap?.settings.publicDeployment) {
        abortRef.current?.abort(); setRun(null); setEvidence(null); setStages([]); setGenerationError('');
        setBootstrap(current => current ? { ...current, runs: [] } : current);
        void refresh();
      }
    };
    window.addEventListener('zhixu:credentials-change', changed);
    return () => window.removeEventListener('zhixu:credentials-change', changed);
  }, [bootstrap?.settings.publicDeployment, refresh]);
  useEffect(() => {
    if (!brief.productId || bootstrap?.settings.publicDeployment) { setEvidence(null); return; }
    const controller = new AbortController(); setEvidenceLoading(true); setEvidenceError(''); setEvidence(null);
    request<Evidence>(`/api/products/${encodeURIComponent(brief.productId)}`, { signal: controller.signal }).then(setEvidence).catch(error => { if (error.name !== 'AbortError') setEvidenceError(error.message); }).finally(() => { if (!controller.signal.aborted) setEvidenceLoading(false); });
    return () => controller.abort();
  }, [brief.productId, bootstrap?.settings.publicDeployment]);
  useEffect(() => { document.title = `${pages.find(p => p.id === page)?.name} · 知序 ZHIXU`; }, [page]);
  useEffect(() => {
    if (!mobileNav) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebarRef.current?.querySelector<HTMLElement>('button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMobileNav(false); return; }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') || []);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [mobileNav]);

  function updateSettings(settings: Settings) { setBootstrap(current => current ? { ...current, settings } : current); }
  function saveRun(result: Run) {
    setRun(result);
    const summary: RunSummary = { id: result.id, createdAt: result.createdAt, updatedAt: result.updatedAt, version: result.version, brief: result.brief, engine: result.engine, durationMs: result.durationMs, title: result.article.title, status: result.audit.status, releaseReady: result.audit.releaseReady, cover: result.article.images[0]?.url };
    setBootstrap(current => current ? { ...current, runs: [summary, ...current.runs.filter(r => r.id !== result.id)] } : current);
  }
  async function startGeneration(nextBrief: Brief) {
    if (generating) return;
    setGenerationError(''); setStages([]); setGenerating(true); setBrief(nextBrief); navigate('studio');
    setTimeout(() => document.querySelector('.generation-progress')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    const controller = new AbortController(); abortRef.current = controller;
    const epoch = authEpoch.current;
    try {
      const result = await generate(nextBrief, stage => setStages(current => [...current.filter(s => s.step !== stage.step), stage]), controller.signal);
      if (epoch !== authEpoch.current) return;
      saveRun(result); notify(`第 ${result.version} 版作品已生成并保存`);
      setTimeout(() => outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') { notify('已停止等待；可到作品记录确认是否已有结果'); }
      else setGenerationError(error instanceof Error ? error.message : '生成遇到问题，请稍后重试');
    } finally { setGenerating(false); abortRef.current = null; }
  }
  async function openRun(id: string) {
    setOpeningRun(true);
    const epoch = authEpoch.current;
    try { const result = await request<Run>(`/api/runs/${encodeURIComponent(id)}`); if (epoch !== authEpoch.current) return; setRun(result); setBrief({ ...result.brief, generation: result.engine === 'llm' ? 'model' : 'rules' }); navigate('studio'); setTimeout(() => outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); }
    catch (error) { notify(error instanceof Error ? error.message : '作品加载失败'); }
    finally { setOpeningRun(false); }
  }
  function newCreation() { if (generating) { notify('请先等待当前创作完成，或停止生成'); return; } setRun(null); setGenerationError(''); setBrief(current => ({ ...initialBrief, productId: current.productId, mode: current.mode })); navigate('studio'); notify('新的创作已准备就绪'); }

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">跳至主要内容</a>
    {mobileNav && <button className="sidebar-scrim" aria-label="关闭导航" onClick={() => setMobileNav(false)} />}
    <aside ref={sidebarRef} className={`sidebar ${mobileNav ? 'is-open' : ''}`} role={mobileNav ? 'dialog' : undefined} aria-modal={mobileNav ? true : undefined} aria-label={mobileNav ? '工作空间导航' : undefined}>
      <button className="brand" onClick={() => navigate('studio')} aria-label="知序首页"><span className="brand-mark"><Feather size={25} strokeWidth={1.6} /></span><span className="brand-word">知序<span>ZHIXU STUDIO</span></span></button>
      <button className="workspace-pill" onClick={() => { setMobileNav(false); setHelp(true); }}><span className="workspace-avatar">H</span><span>华为 PC 创作空间<small>营销图文智能体</small></span><ChevronDown size={14} /></button>
      <div className="navigation-label">WORKSPACE <span>工作空间</span></div>
      <nav aria-label="主导航">{pages.map(({ id, name, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => navigate(id)} aria-current={page === id ? 'page' : undefined}><Icon size={19} strokeWidth={1.7} /><span>{name}</span>{id === 'history' && !!bootstrap?.runs.length && <span className="nav-count">{bootstrap.runs.length}</span>}{page === id && <span className="nav-active-dot" />}</button>)}</nav>
      <div className="sidebar-note"><span className="sidebar-note-icon"><ShieldCheck size={20} strokeWidth={1.5} /></span><h3>让表达，有据可循。</h3><p>从产品事实到内容表达，<br />每一步都有清晰的来路。</p><button onClick={() => navigate('audit')}>了解内容核验 <ArrowRight size={13} /></button></div>
      <div className="sidebar-bottom"><div className="profile-avatar">知</div><div><strong>创作者工作空间</strong><span>{isDemo ? '无需 API · 公开规则演示' : bootstrap?.settings.publicDeployment ? '公开预览环境' : '本地知识库创作'}</span></div><button className="icon-button" aria-label="打开连接设置" onClick={() => navigate('settings')}><Settings2 size={17} /></button></div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumbs"><button className="icon-button mobile-menu" aria-label="打开导航" onClick={() => setMobileNav(true)}><Menu size={20} /></button><span className="breadcrumb-root">工作空间</span><ChevronRight size={13} /><strong>{pages.find(p => p.id === page)?.name}</strong></div><div className="topbar-actions"><button className={`connection-pill ${(brief.mode === 'local' ? !!bootstrap?.stats.documents : bootstrap?.settings.connected) ? 'connected' : ''}`} onClick={() => navigate('settings')}><span className="status-dot" />{brief.mode === 'local' ? (bootstrap?.stats.documents ? (isDemo ? '公开资料已就绪' : '本地知识库已就绪') : '资料尚未导入') : bootstrap?.settings.connected ? 'ima 已连接' : 'ima 待连接'}</button><span className="topbar-divider" /><button className="icon-button" aria-label="使用指南" onClick={() => setHelp(true)}><CircleHelp size={19} /></button><span className="mini-avatar" aria-label="创作者">Z</span></div></header>
      <main id="main-content" className={`main-content page-${page}`}>
        {!bootstrap && !bootError && <div className="boot-loading"><span className="brand-mark"><Feather size={25} /></span><Spinner label="正在准备你的创作空间…" /></div>}
        {bootError && <div className="boot-error"><EmptyState title="暂时无法连接创作空间" detail={bootError}><button className="button primary" onClick={() => void refresh()}>重新连接 <ArrowRight size={15} /></button></EmptyState></div>}
        {bootstrap && <>
          {isDemo && <div className="demo-banner"><div><Sparkles size={18} /><strong>无需 API · 规则交互演示</strong><span>官网公开摘录驱动，浏览器实时生成；未调用大模型或 ima。</span></div><button className="text-button" onClick={() => navigate('settings')}>查看演示说明 <ArrowRight size={14} /></button></div>}
          {page === 'studio' && <Studio bootstrap={bootstrap} brief={brief} onBrief={setBrief} evidence={evidence} evidenceError={evidenceError} evidenceLoading={evidenceLoading} run={run} generating={generating} stages={stages} generationError={generationError} onGenerate={startGeneration} onCancel={() => abortRef.current?.abort()} onSaveRun={saveRun} onOpenRun={openRun} onSettings={() => navigate('settings')} onKnowledge={() => navigate('knowledge')} onNew={newCreation} notify={notify} outputRef={outputRef} />}
          {page === 'knowledge' && <Library products={bootstrap.products} stats={bootstrap.stats} isPublic={bootstrap.settings.publicDeployment} onCreate={productId => { setBrief(current => ({ ...current, productId })); setRun(null); navigate('studio'); }} notify={notify} />}
          {page === 'history' && <History runs={bootstrap.runs} onOpen={openRun} onNew={newCreation} opening={openingRun} onRefresh={refresh} />}
          {page === 'audit' && <AuditCenter products={bootstrap.products} onSettings={() => navigate('settings')} />}
          {page === 'settings' && (isDemo ? <DemoSettings /> : <ConnectionSettings settings={bootstrap.settings} onUpdate={updateSettings} notify={notify} />)}
        </>}
      </main>
      <footer className="app-footer"><span><Feather size={12} /> 知序 ZHIXU</span><p>为好产品，写有依据的好内容。</p><span>来源可追溯 · 发布需审核</span></footer>
    </div>
    {toast && <div className="toast" role="status"><CheckToast /><span>{toast}</span><button aria-label="关闭消息" onClick={() => setToast('')}><X size={15} /></button></div>}
    {help && <Modal title="把产品事实，变成恰到好处的表达" onClose={() => setHelp(false)}><div className="help-intro"><span className="eyebrow">A MORE THOUGHTFUL WORKFLOW</span><p>知序是面向华为 PC 门店营销的图文创作工作台。选择准确型号，描述真实场景，让内容从一份可信的创作简报开始。</p></div><div className="help-steps">{[{ icon: BookOpen, title: '01 · 选定资料与型号', detail: isDemo ? '本演示仅使用公开官网摘录与官方远程图片，直接浏览即可创作。' : '本地知识库默认支持免 API 规则编排；真实模型创作与 ima 资料来源可另外配置。' }, { icon: Sparkles, title: '02 · 描述受众与场景', detail: '平台、购买阶段和内容目标将共同决定结构、语气与配图数量。' }, { icon: ShieldCheck, title: '03 · 核验后再发布', detail: '检查每条事实、图片来源与合规风险；待审核作品只导出标记草稿。' }].map(item => <div key={item.title}><item.icon size={20} /><section><h3>{item.title}</h3><p>{item.detail}</p></section></div>)}</div><Notice>{isDemo ? '示例记录仅保存在当前浏览器，最多 20 条。公开演示不接收密钥，也不访问私人知识库。' : '作品默认保存在当前服务端。凭证仅存本机服务内存，不保存到浏览器；公开环境禁止通过页面修改凭证。'}</Notice><button className="button primary full-width" onClick={() => { setHelp(false); navigate('settings'); }}>查看我的连接状态 <ArrowRight size={16} /></button></Modal>}
  </div>;
}
function CheckToast() { return <span className="toast-icon"><Command size={15} /></span>; }
