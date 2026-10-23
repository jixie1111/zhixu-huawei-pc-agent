import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import type { StageEvent } from './api';
import { useStepScroll } from './useStepScroll';

/** Server stage order from server/agent.ts. Step 5 may repeat for bounded repair. */
export const PIPELINE = [
  { step: 0, name: '理解需求', hint: '人群 · 场景 · 平台' },
  { step: 1, name: '制定策略', hint: '切入点与卖点顺序' },
  { step: 2, name: '检索知识库', hint: '精确型号事实与原图' },
  { step: 3, name: '组织配图', hint: '同型号图片与位置' },
  { step: 4, name: '撰写图文', hint: '段落绑定事实依据' },
  { step: 5, name: '核验修订', hint: '事实 · 图片 · 合规' },
  { step: 6, name: '保存证据链', hint: '版本与来源可追溯' },
] as const;

function useElapsed(running: boolean) {
  const [ms, setMs] = useState(0); const start = useRef(0);
  useEffect(() => {
    if (!running) return;
    start.current = performance.now(); setMs(0);
    const id = setInterval(() => setMs(performance.now() - start.current), 100);
    return () => clearInterval(id);
  }, [running]);
  return ms;
}

/** Live agent pipeline driven only by real server stage events, never a fake timer. */
export function AgentPipeline({ stages, running, onCancel }: { stages: StageEvent[]; running: boolean; onCancel?: () => void }) {
  const progressRef = useStepScroll<HTMLElement>(running);
  const elapsed = useElapsed(running);
  const current = stages.length ? Math.max(...stages.map(s => s.step)) : -1;
  const latest = stages.find(s => s.step === current);
  return <section ref={progressRef} className="agent-pipeline" aria-label="智能体执行过程" aria-live="polite">
    <header className="pipeline-head">
      <div><span className="pipeline-pulse" aria-hidden="true" /><h3>智能体正在工作</h3></div>
      <span className="pipeline-clock" aria-label={`已用时 ${(elapsed / 1000).toFixed(0)} 秒`}>{(elapsed / 1000).toFixed(1)}s</span>
    </header>
    <ol className="pipeline-track">
      {PIPELINE.map(item => {
        const state = item.step < current ? 'done' : item.step === current ? 'active' : 'waiting';
        const event = stages.find(s => s.step === item.step);
        return <li key={item.step} className={`pipeline-node is-${state}`} aria-current={state === 'active' ? 'step' : undefined}>
          <span className="node-dot">{state === 'done' ? <Check size={13} strokeWidth={3} /> : state === 'active' ? <LoaderCircle size={14} className="spinning" /> : null}</span>
          <span className="node-text"><strong>{event?.name || item.name}</strong><small>{state === 'active' && event?.detail ? event.detail : item.hint}</small></span>
        </li>;
      })}
    </ol>
    <footer className="pipeline-foot"><p>{latest?.detail || '正在连接创作服务'}</p>{onCancel && <button type="button" className="text-button" onClick={onCancel}>停止等待</button>}</footer>
  </section>;
}
