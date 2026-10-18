import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, BookOpen, Check, Image, LoaderCircle, Search } from 'lucide-react';
import type { Evidence } from '../shared/types';
import { request } from './api';
import { Modal, ModeBadge, Notice, SafeImage, SafeLink, Spinner } from './components';

/** Read-only online retrieval deliberately remains usable before configuring a generation model. */
export default function EvidencePreview({ productId, productName, configured, disabled, onSettings }: { productId: string; productName: string; configured: boolean; disabled: boolean; onSettings: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { setEvidence(null); setError(''); setOpen(false); return () => controller.current?.abort(); }, [productId]);
  async function retrieve() {
    setOpen(true); setLoading(true); setError(''); setEvidence(null);
    const task = new AbortController(); controller.current = task;
    try { const result = await request<Evidence>('/api/retrieve', { method: 'POST', body: JSON.stringify({ productId, mode: 'ima' }), signal: task.signal }); if (!task.signal.aborted) setEvidence(result); }
    catch (failure) { if (!task.signal.aborted) setError(failure instanceof Error ? failure.message : '在线取证失败，请检查共享库权限。'); }
    finally { if (!task.signal.aborted) setLoading(false); }
  }
  function close() { controller.current?.abort(); setLoading(false); setOpen(false); }
  return <>
    <button type="button" className="button light full-width" onClick={() => void retrieve()} disabled={!productId || !configured || disabled || loading}><Search size={15} />预览 ima 取证 <ArrowUpRight size={13} /></button>
    <p className="muted-text" style={{ fontSize: 11, margin: '9px 0 0', lineHeight: 1.6 }}>仅检索资料与来源，不生成文案，无需配置模型。</p>
    {open && <Modal title={`ima 在线取证 · ${productName}`} onClose={close} wide>
      <Notice>这是对指定共享知识库的实际检索结果，不是本地快照，也不代表营销稿件已通过发布审核。</Notice>
      {loading && <div className="content-loading"><Spinner label="正在从 ima 检索产品事实与图片来源…" /></div>}
      {error && <><Notice type="error">{error}</Notice><div className="modal-actions"><button className="button light" onClick={() => void retrieve()}>重新取证</button><button className="button primary" onClick={() => { close(); onSettings(); }}>检查连接设置 <ArrowRight size={14} /></button></div></>}
      {evidence && <div className="evidence-view"><div className="evidence-overview"><ModeBadge mode="ima" /><span>{evidence.facts.length} 项事实</span><span>{evidence.images.length} 张素材</span></div>{evidence.warnings.map((warning, index) => <Notice type="warning" key={index}>{warning}</Notice>)}<h4 className="detail-subheading"><BookOpen size={16} />检索到的事实依据</h4><div className="fact-list">{evidence.facts.map((fact, index) => <details className="fact-detail" key={fact.id}><summary><span className="fact-index">{String(index + 1).padStart(2, '0')}</span><strong>{fact.label}</strong><span className="fact-source-name">{fact.sourceTitle}</span></summary><div className="fact-detail-body"><p>{fact.text}</p><SafeLink url={fact.sourceUrl}>查看事实来源</SafeLink>{fact.sourcePath && <code>{fact.sourcePath}</code>}</div></details>)}</div><h4 className="detail-subheading"><Image size={16} />同型号图片来源</h4><div className="image-evidence-grid">{evidence.images.slice(0, 12).map(image => <article key={image.id}><SafeImage src={image.url} alt={image.description} loading="lazy" /><div><strong>{image.productName}</strong><p>{image.description}</p><SafeLink url={image.sourceUrl}>查看图片来源</SafeLink></div></article>)}</div>{evidence.images.length > 12 && <p className="muted-text">共检索到 {evidence.images.length} 张素材，此处预览前 12 张。</p>}<details className="trace-details"><summary>查看取证轨迹 <ArrowRight size={14} /></summary><ol>{evidence.trace.map((item, index) => <li key={index}><strong>{item.action}</strong><p>{item.detail}</p></li>)}</ol></details></div>}
    </Modal>}
  </>;
}
