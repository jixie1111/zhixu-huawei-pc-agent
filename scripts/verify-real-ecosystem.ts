/** Real local API acceptance. Not physical device compatibility testing. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import type { EcosystemRelation, EcosystemRun } from '../shared/ecosystem';

if(!process.argv.includes('--run'))throw new Error('Explicit --run required');
const base='http://127.0.0.1:3000',root=path.resolve('private');
const destination=await fs.mkdtemp(path.join(root,'real-ecosystem-'));
const report:Record<string,unknown>={startedAt:new Date().toISOString(),testKind:'real local API; no mocked responses',conditionsScope:'验收脚本操作员显式输入来源中的条件，只验证生成与条件保留；非实机验证。'};
async function json<T>(route:string,body?:unknown):Promise<T>{
  const response=await fetch(base+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(480000)});
  const value=await response.json();if(!response.ok)throw new Error(value.message||value.error?.message||'Local API failed');return value;
}
try{
  const bootstrap=await json<{settings:{llmConfigured:boolean;llmModel:string;publicDeployment:boolean}}>('/api/bootstrap');
  if(!bootstrap.settings.llmConfigured||bootstrap.settings.publicDeployment)throw new Error('Configured local model service required');
  const catalog=await json<{relations:EcosystemRelation[]}>('/api/ecosystem');
  const relation=catalog.relations.find(r=>r.id==='pura80-matepad115-2026-network-hos51');
  if(!relation)throw new Error('Reviewed relation missing');
  const input={selection:{devices:relation.participants.map(p=>({productId:p.productId,system:p.systems[0]})),relationIds:[relation.id],conditions:Object.fromEntries(relation.conditions.map(c=>[c.key,c.value]))},audience:'经常带平板出门看资料的职场人士',platform:'moments',goal:'引导到店了解手机和平板的具体协同条件',requirements:'写一条自然、有生活感的朋友圈。围绕出门看资料的一个场景，清楚区分手机和平板，不编造使用经历或便利性实测。保留协同限定，不夸大为所有设备通用。',generation:'model',autoRepair:true};
  await fs.writeFile(path.join(destination,'confirmed-input.json'),JSON.stringify({confirmedBy:'acceptance-script operator, not user device confirmation',input},null,2));
  console.log(JSON.stringify({stage:'生成真实手机平板生态朋友圈',destination}));
  const started=Date.now(),run=await json<EcosystemRun>('/api/ecosystem/runs',input);
  await fs.writeFile(path.join(destination,'run.json'),JSON.stringify(run,null,2));
  report.model=run.model;report.durationMs=Date.now()-started;report.audit=run.audit.status;report.releaseReady=run.audit.releaseReady;report.repairs=run.repairHistory?.length??0;
  const used=run.article.images.map(i=>i.productId);
  report.imageOwnership=run.evidence.devices.every(d=>used.includes(d.product.id));
  report.conditionsExact=run.article.disclosures.every(d=>JSON.stringify(d.conditions)===JSON.stringify(relation.conditions.map(c=>`${c.label}：${c.value}`)));
  if(run.model!==bootstrap.settings.llmModel)throw new Error('Returned model differs from configured model');
  const response=await fetch(`${base}/api/ecosystem/runs/${run.id}/export?format=png-pack&draft=${!run.audit.releaseReady}`,{signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw new Error('PNG export failed: '+response.status);
  const zip=Buffer.from(await response.arrayBuffer());await fs.writeFile(path.join(destination,'visual.zip'),zip);
  const files=unzipSync(zip);
  for(const [name,data]of Object.entries(files))if(/^(?:\d{2}-(?:cover|content|image|conditions)\.png|manifest\.json|index\.html|README\.txt)$/.test(name))await fs.writeFile(path.join(destination,name),data);
  report.pages=Object.keys(files).filter(n=>n.endsWith('.png')).length;
  console.log(JSON.stringify({destination,...report}));
}catch(error){report.error=error instanceof Error?error.message:'Unknown failure';process.exitCode=1;console.log(JSON.stringify({destination,error:report.error}));}
finally{await fs.writeFile(path.join(destination,'report.json'),JSON.stringify(report,null,2));}
