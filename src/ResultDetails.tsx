import type { Article, Run } from '../shared/types';
import { ChevronDown, FileCheck2 } from 'lucide-react';
import { Modal, Notice, SafeLink } from './components';
import './result-details.css';

export function FactDetail({ run, index, onClose }: { run: Run; index: number; onClose: () => void }) {
  const section = run.article.sections[index];
  if (!section) return null;
  return <Modal title="这段内容的依据" onClose={onClose} wide><div className="claim-detail"><blockquote><h3>{section.heading}</h3><p>{section.text}</p></blockquote><div className="claim-sources">{section.factIds.map(id => { const fact = run.evidence.facts.find(f => f.id === id); return fact ? <article key={id}><div><FileCheck2 size={17} /><h3>{fact.label}</h3></div><p>{fact.text}</p><footer><span>{fact.sourceTitle}</span><SafeLink url={fact.sourceUrl}>原始来源</SafeLink></footer></article> : <Notice type="warning" key={id}>这项引用需要重新核对。</Notice>; })}</div><p className="claim-scope">引用范围：{run.evidence.product.name} · 核验结果见当前版本</p></div></Modal>;
}
export function DirectorDetail({ run }: { run: Run }) {
  if (!run.director) return null;
  return <section className="chosen-direction"><span>本次创意</span><h3>{run.director.conceptName}</h3><p>{run.director.reason}</p><details><summary>图文安排<ChevronDown size={14} /></summary><p>{run.director.visualDirection}</p><div>{run.director.factIds.map(id => <span key={id}>{run.evidence.facts.find(f => f.id === id)?.label || '待核对依据'}</span>)}</div></details></section>;
}
function fieldValue(article: Article, field: string) {
  const match = /^sections\.(\d+)\.(heading|text)$/.exec(field);
  if (match) return article.sections[Number(match[1])]?.[match[2] as 'heading' | 'text'] || '';
  const value = article[field as keyof Article];
  return Array.isArray(value) ? value.join(' / ') : String(value ?? '');
}
export function RepairDetail({ run }: { run: Run }) {
  if (!run.repairHistory?.length) return null;
  const labels: Record<string, string> = { title: '标题', lead: '导语', cta: '行动引导', tags: '话题', disclaimer: '适用说明' };
  return <details className="repair-detail"><summary>查看 {run.repairHistory.length} 次内容修订<ChevronDown size={14} /></summary>{run.repairHistory.map(item => <section key={item.attempt}><h3>第 {item.attempt} 次 · {item.status === 'failed' ? '保留原稿' : item.audit.status === 'passed' ? '复核通过' : '已修订，待复核'}</h3>{item.error && <p>{item.error}</p>}{item.changedFields.map(field => <div className="repair-diff" key={field}><strong>{labels[field] || `第 ${Number(field.split('.')[1]) + 1} 段${field.endsWith('heading') ? '标题' : '正文'}`}</strong><div><span>修订前</span><p>{fieldValue(item.before, field)}</p></div><div><span>修订后</span><p>{fieldValue(item.after, field)}</p></div></div>)}</section>)}</details>;
}
