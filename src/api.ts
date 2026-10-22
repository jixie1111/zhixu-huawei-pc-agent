import type { Brief, Run } from '../shared/types';
import { isDemo } from './demo-mode';

let adminToken = '';
let workspaceId = '';
function workspaceHeaders(): Record<string,string> {
  if (isDemo) return {};
  if (!workspaceId) {
    try { const saved=localStorage.getItem('wuyan-workspace-id');workspaceId=saved&&/^[0-9a-f-]{36}$/i.test(saved)?saved:crypto.randomUUID();localStorage.setItem('wuyan-workspace-id',workspaceId); }
    catch { workspaceId=crypto.randomUUID(); }
  }
  return { 'X-Workspace-Id':workspaceId };
}
export const setAdminToken = (token: string) => { adminToken = token; window.dispatchEvent(new Event('zhixu:credentials-change')); };
export const getAdminHeaders = (): Record<string, string> => ({...workspaceHeaders(),...(adminToken ? { 'X-Admin-Token': adminToken } : {})});
export const hasAdminToken = () => !!adminToken;
export class ApiError extends Error {
  code?: string;
  details?: unknown;
  constructor(message: string, code?: string, details?: unknown) { super(message); this.code = code; this.details = details; }
}
export async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  if (isDemo) return (await import('./demo-adapter')).demoRequest<T>(url, init);
  const response = await fetch(url, {
    ...init,
    headers: { ...(init.body || ['POST', 'PUT', 'PATCH'].includes(init.method || '') ? { 'Content-Type': 'application/json' } : {}), ...getAdminHeaders(), ...init.headers },
  });
  const data = await response.json().catch(() => ({ message: '服务暂时不可用，请稍后再试。' }));
  if (!response.ok) throw new ApiError(data.message || data.error?.message || (typeof data.error === 'string' ? data.error : '') || '请求失败，请重试。', data.code || data.error?.code, data.details || data.error?.details);
  return data as T;
}
export interface StageEvent { step: number; name: string; detail: string }
export async function generate(brief: Brief, onStage: (event: StageEvent) => void, signal: AbortSignal): Promise<Run> {
  if (isDemo) return (await import('./demo-adapter')).demoGenerate(brief, onStage, signal);
  const response = await fetch('/api/generate', { method: 'POST', body: JSON.stringify(brief), signal, headers: { 'Content-Type': 'application/json', ...getAdminHeaders() } });
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data.message || data.error?.message || (typeof data.error === 'string' ? data.error : '') || '生成请求失败', data.code, data.details);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: Run | undefined;
  const parse = (block: string) => {
    const event = block.split('\n').find(line => line.startsWith('event:'))?.slice(6).trim();
    const raw = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
    if (!raw) return;
    const data = JSON.parse(raw);
    if (event === 'stage') onStage(data);
    if (event === 'result') result = data;
    if (event === 'error') throw new ApiError(data.message || '生成未完成，请核实输入后再试。', data.code, data.details);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
      let index: number;
      while ((index = buffer.indexOf('\n\n')) >= 0) { parse(buffer.slice(0, index)); buffer = buffer.slice(index + 2); }
      if (done) { if (buffer.trim()) parse(buffer); break; }
    }
  } finally { reader.releaseLock(); }
  if (!result) throw new Error('生成连接已结束，但未收到完整作品。请检查作品记录后重试。');
  return result;
}
export async function downloadRun(id: string, format: 'md' | 'html' | 'json' | 'png-pack', draft: boolean): Promise<void> {
  if (isDemo) { if(format==='png-pack')throw new Error('图文配图包在本地创作版提供。');saveDownload(await (await import('./demo-adapter')).demoExport(id, format), id, format, true); return; }
  const response = await fetch(`/api/runs/${encodeURIComponent(id)}/export?format=${format}&draft=${draft}`, { headers: getAdminHeaders() });
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || data.error?.message || '导出失败，请先处理核验问题。'); }
  const blob = await response.blob();
  saveDownload(blob, id, format==='png-pack'?'zip':format, draft);
}
function saveDownload(blob: Blob, id: string, format: string, draft: boolean) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `物有言-${id}${draft ? '-待审核草稿' : ''}.${format}`; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function downloadEcosystem(id:string,format:'html'|'md'|'json'|'png-pack',draft:boolean){
  const response=await fetch(`/api/ecosystem/runs/${encodeURIComponent(id)}/export?format=${format}&draft=${draft}`,{headers:getAdminHeaders()});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.message||data.error?.message||'生态图文导出未完成，请检查作品状态。');}
  saveDownload(await response.blob(),id,format==='png-pack'?'zip':format,draft);
}
export function articleText(run: Run) {
  const { article: a } = run;
  return [a.title, a.lead, ...a.sections.map(s => `${s.heading}\n${s.text}`), a.cta, a.tags.map(t => t.startsWith('#') ? t : `#${t}`).join(' '), a.disclaimer, !run.audit.releaseReady ? '【待人工审核草稿，不可直接发布】' : ''].filter(Boolean).join('\n\n');
}
