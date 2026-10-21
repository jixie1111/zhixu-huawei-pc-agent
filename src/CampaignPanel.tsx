import { useEffect,useRef,useState } from 'react';
import { ArrowRight,Layers3,LoaderCircle } from 'lucide-react';
import type { Platform,Run } from '../shared/types';
import type { Campaign } from '../shared/campaign';
import { PLATFORMS } from '../shared/rules';
import { request } from './api';
import { Notice } from './components';

interface Props{run:Run;generating:boolean;onOpenRun:(id:string)=>Promise<void>;notify:(message:string)=>void}
const labels:Record<Campaign['items'][number]['status'],string>={pending:'等待创作',running:'正在创作',generated:'已生成',failed:'未完成',cancelled:'已停止'};
export default function CampaignPanel({run,generating,onOpenRun,notify}:Props){
  const [platforms,setPlatforms]=useState<Platform[]>(['moments','wechat'].filter(p=>p!==run.brief.platform) as Platform[]);
  const [instructions,setInstructions]=useState('');
  const [campaigns,setCampaigns]=useState<Campaign[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const controller=useRef<AbortController|null>(null),sequence=useRef(0);
  useEffect(()=>{
    const seq=++sequence.current,load=new AbortController();
    controller.current?.abort();setBusy(false);setError('');setCampaigns([]);setInstructions('');
    setPlatforms((['moments','wechat'] as Platform[]).filter(p=>p!==run.brief.platform));
    request<Campaign[]>('/api/campaigns',{signal:load.signal}).then(items=>{if(sequence.current===seq)setCampaigns(items.filter(c=>c.sourceRunId===run.id));}).catch(e=>{if(!load.signal.aborted&&sequence.current===seq)setError(e.message);});
    return()=>{sequence.current++;load.abort();controller.current?.abort();};
  },[run.id,run.brief.platform]);
  useEffect(()=>{
    if(!busy)return;
    const seq=sequence.current,load=new AbortController();let inflight=false;
    const tick=async()=>{if(inflight)return;inflight=true;try{const items=await request<Campaign[]>('/api/campaigns',{signal:load.signal});if(sequence.current===seq)setCampaigns(items.filter(c=>c.sourceRunId===run.id));}catch{}finally{inflight=false;}};
    const timer=setInterval(()=>void tick(),2500);return()=>{clearInterval(timer);load.abort();};
  },[busy,run.id]);
  function toggle(platform:Platform){setPlatforms(current=>current.includes(platform)?current.filter(p=>p!==platform):[...current,platform]);}
  async function start(selected=platforms){
    if(busy||generating||!selected.length)return;
    const seq=sequence.current,abort=new AbortController();controller.current=abort;setBusy(true);setError('');
    try{
      const result=await request<Campaign>('/api/campaigns',{method:'POST',body:JSON.stringify({sourceRunId:run.id,platforms:selected,instructions:instructions||undefined}),signal:abort.signal});
      if(seq!==sequence.current)return;
      setCampaigns(current=>[result,...current.filter(c=>c.id!==result.id)]);
      notify(result.status==='complete'?'多平台版本已生成，请逐份审阅':result.status==='partial'?'部分平台已完成，其余可单独重试':'本次内容包未全部完成，请查看状态');
    }catch(e){if(seq===sequence.current){if(abort.signal.aborted)notify('已停止后续创作，已完成的版本保留');else setError(e instanceof Error?e.message:'内容包未完成，请查看已有版本');}}
    finally{
      if(seq===sequence.current){setBusy(false);controller.current=null;try{const items=await request<Campaign[]>('/api/campaigns');if(seq===sequence.current)setCampaigns(items.filter(c=>c.sourceRunId===run.id));}catch{}}
    }
  }
  return <details className="campaign-panel"><summary><Layers3 size={18}/><span>一份创意，多平台表达</span><ArrowRight size={15}/></summary><div className="campaign-body"><p>保留这份作品的主题，分别创作、核验和保存。</p><div className="choice-row" aria-label="内容包平台">{(Object.keys(PLATFORMS)as Platform[]).map(p=><button key={p} disabled={busy||generating} className="choice-chip" aria-pressed={platforms.includes(p)} onClick={()=>toggle(p)}>{PLATFORMS[p].name}</button>)}</div><label className="field"><span>这一组还想调整什么？</span><input aria-label="内容包补充要求" maxLength={1200} disabled={busy||generating} value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="例如：更轻松些，突出日常携带"/></label>{run.engine==='local-composer'&&<p className="campaign-note">规则体验支持平台重排；自由改写在模型创作中提供。</p>}<div className="campaign-actions"><button className="button primary" disabled={busy||generating||!platforms.length} onClick={()=>void start()}>{busy?<LoaderCircle size={16} className="spinning"/>:<Layers3 size={16}/>}生成多平台版本</button>{busy&&<button className="text-button" onClick={()=>controller.current?.abort()}>停止后续创作</button>}</div>{error&&<Notice type="error">{error}</Notice>}<div className="campaign-results">{campaigns.slice(0,3).map(c=><section key={c.id} aria-label="内容包状态"><div className="campaign-status">{c.status==='running'?'创作中':c.status==='complete'?'本组已完成':c.status==='partial'?'本组部分完成':c.status==='cancelled'?'本组已停止':'本组待重试'}<span>{new Date(c.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</span></div>{c.items.map(item=><div className="campaign-item" key={item.platform}><strong>{PLATFORMS[item.platform].name}</strong><span>{labels[item.status]}{item.status==='generated'?(item.releaseReady?' · 核验通过':' · 待复核'):''}</span>{item.runId?<button className="text-button" disabled={busy||generating} onClick={()=>void onOpenRun(item.runId!)}>查看作品<ArrowRight size={13}/></button>:item.status==='failed'||item.status==='cancelled'?<button className="text-button" disabled={busy||generating} onClick={()=>void start([item.platform])}>单独重试</button>:null}{item.error&&<p>{item.error.message}</p>}</div>)}</section>)}</div></div></details>;
}
