import { useEffect, useLayoutEffect, useId, useRef, useState, type ImgHTMLAttributes, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, ArrowUpRight, Check, CheckCheck, FileText, Info, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import type { Audit, Finding, SourceMode } from '../shared/types';
import { getAdminHeaders } from './api';
import { isDemo } from './demo-mode';

/** Protected images use a header-authenticated same-origin request, never a token in a URL. */
export function SafeImage({ src, alt = '', className, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [blobUrl, setBlobUrl] = useState('');
  const [failedSource, setFailedSource] = useState<string | undefined>();
  const failed = !!src && failedSource === src;
  const [authVersion, setAuthVersion] = useState(0);
  const protectedSource = typeof src === 'string' && /^\/api\/(?:assets|ima-assets)\/[A-Za-z0-9_-]+$/.test(src);
  useEffect(() => {
    const changed = () => setAuthVersion(v => v + 1);
    window.addEventListener('zhixu:credentials-change', changed);
    return () => window.removeEventListener('zhixu:credentials-change', changed);
  }, []);
  useLayoutEffect(() => {
    setBlobUrl('');
    if (!protectedSource || !src) return;
    setFailedSource(undefined);
    const controller = new AbortController(); let objectUrl = '';
    fetch(src, { headers: getAdminHeaders(), signal: controller.signal, credentials: 'same-origin' })
      .then(async response => { if (!response.ok) throw new Error('图片受保护或暂不可用'); const blob = await response.blob(); if (!blob.type.startsWith('image/')) throw new Error('无效图片内容'); if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setBlobUrl(objectUrl); } })
      .catch(error => { if (error.name !== 'AbortError') setFailedSource(src); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src, protectedSource, authVersion]);
  if ((protectedSource && !blobUrl) || failed) return <span className={`${className || ''} protected-image-placeholder`} role={alt ? 'img' : undefined} aria-label={alt ? `${alt}，${failed ? '图片受保护或暂不可用' : '正在加载'}` : undefined} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eef0ea', color: '#6b756f', fontSize: 12, minHeight: 70, padding: 12, textAlign: 'center', ...props.style }}>{failed ? (isDemo ? '官方远程图片暂不可用' : '图片受保护或暂不可用') : '加载产品图片…'}</span>;
  return <img {...props} src={protectedSource ? blobUrl : src} alt={alt} className={className} onError={event => { setFailedSource(src); props.onError?.(event); }} />;
}

export function Spinner({ label = '正在加载' }: { label?: string }) { return <span className="spinner" role="status"><LoaderCircle size={18} aria-hidden="true" /><span>{label}</span></span>; }
export function Notice({ children, type = 'info', onClose }: { children: ReactNode; type?: 'info' | 'error' | 'success' | 'warning'; onClose?: () => void }) {
  const Icon = type === 'error' ? AlertCircle : type === 'warning' ? AlertTriangle : type === 'success' ? CheckCheck : Info;
  return <div className={`notice notice-${type}`} role={type === 'error' ? 'alert' : 'status'}><Icon size={17} aria-hidden="true" /><div>{children}</div>{onClose && <button className="icon-button" aria-label="关闭提示" onClick={onClose}><X size={16} /></button>}</div>;
}
export function EmptyState({ title, detail, children }: { title: string; detail: string; children?: ReactNode }) { return <div className="empty-state"><div className="empty-icon"><FileText size={28} strokeWidth={1.4} /></div><h3>{title}</h3><p>{detail}</p>{children}</div>; }
export function ModeBadge({ mode }: { mode: SourceMode }) { return <span className={`badge ${mode === 'ima' ? 'badge-green' : 'badge-sand'}`}><span className="status-dot" />{mode === 'ima' ? 'ima 在线来源' : isDemo ? '公开官网摘录' : '本地知识库'}</span>; }
export function AuditBadge({ status }: { status: Audit['status'] }) { return <span className={`badge ${status === 'passed' ? 'badge-green' : status === 'blocked' ? 'badge-red' : 'badge-sand'}`}>{status === 'passed' ? <ShieldCheck size={12} /> : <AlertTriangle size={12} />}{status === 'passed' ? '核验通过' : status === 'blocked' ? '存在阻断' : '待人工核验'}</span>; }
export function SafeLink({ url, children, className = 'source-link' }: { url: string; children: ReactNode; className?: string }) {
  if (!/^https?:\/\//i.test(url)) return <span className={className}>{children}</span>;
  return <a href={url} className={className} target="_blank" rel="noopener noreferrer">{children}<ArrowUpRight size={13} /></a>;
}
export function Findings({ findings }: { findings: Finding[] }) {
  const names: Record<Finding['category'], string> = { fact: '事实准确性', image: '图片一致性', compliance: '表达合规', source: '资料来源', platform: '平台适配' };
  if (!findings.length) return <div className="check-clear"><CheckCheck size={20} /><div><strong>本次规则检查未发现问题</strong><p>规则检查不替代人工审核，发布前请再次核实动态信息。</p></div></div>;
  return <div className="findings">{findings.map((finding, index) => <article key={`${finding.id}-${index}`} className={`finding finding-${finding.severity}`}><div className="finding-symbol">{finding.severity === 'block' ? <AlertCircle size={18} /> : finding.severity === 'warning' ? <AlertTriangle size={18} /> : <Info size={18} />}</div><div><div className="finding-meta"><span>{names[finding.category]}</span><span>{finding.severity === 'block' ? '必须处理' : finding.severity === 'warning' ? '需要关注' : '提示'}</span></div><h4>{finding.message}</h4>{finding.excerpt && <blockquote>{finding.excerpt}</blockquote>}<p>{finding.suggestion}</p></div></article>)}</div>;
}
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null); const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null; const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab') return;
      const elements = Array.from(ref.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || []);
      const first = elements[0], last = elements.at(-1);
      if (!first) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', key); previous?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><div className="modal-top"><h2 id={titleId}>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭窗口"><X size={20} /></button></div><div className="modal-content">{children}</div></div></div>;
}
export function CheckRow({ children }: { children: ReactNode }) { return <div className="check-row"><Check size={14} /><span>{children}</span></div>; }
export const dateLabel = (date: string) => new Date(date).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
