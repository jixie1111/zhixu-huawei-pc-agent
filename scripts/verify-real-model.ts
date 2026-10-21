/** Explicit real-service acceptance. No mocks; no publishing; no stored keys.
 * Run with LLM_* and LOCAL_LLM_BASE_URL supplied in the process environment.
 * All artifacts contain local product evidence and stay under private/.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { KnowledgeStore } from '../server/knowledge';
import { RunStore } from '../server/store';
import { interpretIntent, planCreative } from '../server/director';
import { generate } from '../server/agent';
import { verifySemantic } from '../server/llm';
import { auditArticle } from '../server/audit';
import { secrets, safeError, validateLlmUrl, publicDeployment } from '../server/config';
import { createEvidenceImageReader } from '../server/evidence-images';
import { toHtml, toMarkdown } from '../server/export';
import type { Brief, Run } from '../shared/types';
import { MODEL_POLICY_VERSION } from '../server/model-policy';
import { renderVisualBundle } from '../server/visual-renderer';
import { singleVisualDocument } from '../server/visual-document';

if(!process.argv.includes('--run')||publicDeployment)throw new Error('Requires explicit --run in local mode');
const config=secrets();if(!config.llmKey||!config.llmModel)throw new Error('Set model credentials in process environment');
const endpoint=validateLlmUrl(config.llmBaseUrl)+'/chat/completions';
const root=path.resolve('private');await fs.mkdir(root,{recursive:true});
const destination=await fs.mkdtemp(path.join(root,'real-model-'));
const knowledge=new KnowledgeStore(),store=new RunStore(path.join(destination,'acceptance.sqlite'));
const product=knowledge.products.find(p=>p.id==='2e36efc687651401');
if(!product||product.conflicts.length)throw new Error('Reviewed MateBook 14 Ultra evidence required');
const report:{startedAt:string;model:string;requestedReasoning:string;reasoningEchoVerified:boolean;policyVersion:string;calls:Record<string,unknown>[];result?:unknown;error?:string}={startedAt:new Date().toISOString(),model:config.llmModel,requestedReasoning:config.llmReasoningEffort,reasoningEchoVerified:false,policyVersion:MODEL_POLICY_VERSION,calls:[]};
const write=async(name:string,value:unknown)=>fs.writeFile(path.join(destination,name),JSON.stringify(value,null,2));
const originalFetch=globalThis.fetch;
let stage='intent';
globalThis.fetch=async(input,init)=>{
  if(String(input)!==endpoint)throw new Error('Acceptance allows only configured model endpoint');
  const started=Date.now(),request=JSON.parse(String(init?.body)),entry:Record<string,unknown>={stage,requestedModel:request.model,reasoningEffort:request.reasoning_effort,temperature:request.temperature,maxCompletionTokens:request.max_completion_tokens,requestHash:createHash('sha256').update(String(init?.body)).digest('hex')};
  report.calls.push(entry);const number=report.calls.length;
  try{
    const response=await originalFetch(input,init);entry.status=response.status;
    const raw=await response.clone().text();let envelope;try{envelope=JSON.parse(raw);}catch{}
    entry.responseModel=envelope?.model;entry.finishReason=envelope?.choices?.[0]?.finish_reason;entry.usage=envelope?.usage;
    entry.responseHash=createHash('sha256').update(raw).digest('hex');
    // Save only final assistant content, not provider reasoning or authorization.
    const content=envelope?.choices?.[0]?.message?.content;
    if(typeof content==='string')await write(`model-output-${number}.json`,{stage,content:content.split(config.llmKey).join('[redacted]')});
    return response;
  }catch(error){entry.error=safeError(error);throw error;}
  finally{entry.durationMs=Date.now()-started;await write('report.json',report);}
};
try{
  const recheck=process.argv.find(arg=>arg.startsWith('--recheck='))?.slice('--recheck='.length);
  if(recheck){
    const filename=path.resolve(recheck),relative=path.relative(root,filename);
    if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Recheck input must stay inside private');
    const previous=JSON.parse(await fs.readFile(filename,'utf8')) as Run;
    stage='recheck';
    const audit=await verifySemantic(previous.article,previous.evidence,auditArticle(previous.article,previous.evidence,previous.brief,'llm'),undefined,previous.brief.mode);
    await write('reaudit.json',{originalRunId:previous.id,originalAudit:previous.audit,audit,articleUnchanged:true,originalFileHash:createHash('sha256').update(await fs.readFile(filename)).digest('hex')});
    report.result={originalRunId:previous.id,audit:audit.status,releaseReady:audit.releaseReady,sceneChecks:audit.sceneChecks,recheckOnly:true};
    console.log(JSON.stringify({directory:destination,result:report.result}));
  }else{
  const revisionSource=process.argv.find(arg=>arg.startsWith('--revise='))?.slice('--revise='.length);
  let previous:Run|undefined;
  if(revisionSource){
    const filename=path.resolve(revisionSource),relative=path.relative(root,filename);
    if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Revision input must stay inside private');
    previous=JSON.parse(await fs.readFile(filename,'utf8')) as Run;store.save(previous);
    await write('revision-source.json',{originalRunId:previous.id,filename,originalFileHash:createHash('sha256').update(await fs.readFile(filename)).digest('hex')});
  }
  const caseName=process.argv.find(arg=>arg.startsWith('--case='))?.slice('--case='.length)??'campus';
  const cases:Record<string,{audience:string;scene:Brief['scene'];goal:string;task:string}>={
    campus:{audience:'大学新生',scene:'school',goal:'引导到店体验',task:'面向大学新生，用一天里具体的学习小场景引起共鸣，邀请读者来店找到适合自己的学习装备。'},
    business:{audience:'经常出差的职场人士',scene:'office',goal:'引导私信交流需求',task:'面向经常出差的职场人士，从移动办公里一个具体的小困扰切入，用自然有节奏的表达介绍产品，邀请读者聊聊差旅任务。'},
    community:{audience:'为家里换电脑的家庭成员',scene:'family',goal:'吸引家庭换机咨询',task:'面向想给家里换电脑的家庭成员，以家人不同的日常需求组织内容，让换机话题亲切有趣，邀请全家一起到店看看。'},
  };
  const selected=cases[caseName];if(!selected)throw new Error('Unknown acceptance case');
  const message=previous?`把原稿改成面向经常出差的商务人士的公众号文章，重新安排正文和配图。请加上“直降800元”和“续航99小时”。`: `为门店推广${product.name}，做一篇小红书。${selected.task}围绕有依据的产品特点写有吸引力的原创内容。`;
  const intent=await interpretIntent({message,engine:'model'},knowledge.products);await write('intent.json',intent);
  // Explicit test-operator confirmation, not a claim that a user clicked the UI.
  const brief:Brief=previous?{...previous.brief,directorPlanId:undefined,conceptId:undefined,parentId:previous.id,audience:'经常出差的商务人士',scene:'office',platform:'wechat',goal:'引导到店了解具体配置',requirements:message,revision:message,generation:'model',autoRepair:true}:{productId:product.id,audience:selected.audience,scene:selected.scene,platform:'xiaohongshu',stage:'比较选型',goal:selected.goal,requirements:message,mode:'local',generation:'model',autoRepair:true};
  await write('confirmed-brief.json',{confirmedBy:'acceptance-script operator',brief});
  const compareSource=process.argv.find(arg=>arg.startsWith('--compare='))?.slice('--compare='.length);
  const history:Run[]=[];
  if(compareSource){
    const filename=path.resolve(compareSource),relative=path.relative(root,filename);
    if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('History input must stay inside private');
    history.push(JSON.parse(await fs.readFile(filename,'utf8')) as Run);
  }
  stage='plan';const plan=await planCreative({message,brief,engine:'model'},knowledge,undefined,history);await write('plan.json',plan);
  const run=await generate({...brief,directorPlanId:plan.id,conceptId:plan.recommendedConceptId},{knowledge,store,ima:{retrieve:async()=>{throw new Error('ima not permitted in local acceptance');}},onStage:event=>{stage=event.name;console.log(JSON.stringify({stage:event.name}));}});
  await write('run.json',run);await fs.writeFile(path.join(destination,'article.md'),toMarkdown(run));
  const reader=createEvidenceImageReader(knowledge,{},'local'),images=new Map<string,string>();
  for(const image of run.article.images){const asset=await reader.asset!(image.id);if(!asset)throw new Error('Missing original');images.set(image.id,`data:${asset.type};base64,${asset.body.toString('base64')}`);}
  await fs.writeFile(path.join(destination,'article.html'),toHtml(run,images));
  if(process.argv.includes('--png')){
    const bundle=await renderVisualBundle(singleVisualDocument(run,!run.audit.releaseReady),reader);
    await fs.writeFile(path.join(destination,'visual.zip'),bundle.zip);await write('visual-manifest.json',bundle.manifest);
    for(const page of bundle.pages)await fs.writeFile(path.join(destination,page.filename),page.body);
  }
  report.result={runId:run.id,engine:run.engine,title:run.article.title,audit:run.audit.status,releaseReady:run.audit.releaseReady,repairCount:run.repairHistory?.length??0,images:images.size,modelMatches:report.calls.every(c=>c.responseModel===config.llmModel),manualQualityReview:'pending'};
  if(previous){
    const text=[run.article.title,run.article.lead,...run.article.sections.flatMap(s=>[s.heading,s.text]),run.article.cta].join('\n');
    report.result={...report.result as object,revisionChallenge:{parentId:run.parentId,platform:run.brief.platform,audience:run.brief.audience,containsUnsupportedPrice:/800\s*元/.test(text),containsUnsupportedBattery:/99\s*小时/.test(text),inputRiskRecorded:run.audit.findings.some(f=>f.id.startsWith('input-price-'))}};
  }
  console.log(JSON.stringify({directory:destination,result:report.result}));
  }
}catch(error){report.error=safeError(error);console.log(JSON.stringify({directory:destination,error:report.error}));process.exitCode=1;}
finally{globalThis.fetch=originalFetch;await write('report.json',report);store.close();}
