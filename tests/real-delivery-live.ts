/** Actual local UI delivery acceptance. No mocks, credentials, uploads or ima.
 * --run --source=<saved genuine run id> consumes real multi-platform inference.
 * --ecosystem-only reopens a saved ecosystem work and checks selection/export;
 * it does not generate a new ecosystem work or verify physical devices. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { unzipSync } from 'fflate';
import type { Bootstrap,Run } from '../shared/types';
import type { Campaign } from '../shared/campaign';
import type { EcosystemRelation,EcosystemRun } from '../shared/ecosystem';
import { MODEL_POLICY_VERSION } from '../server/model-policy';

const base=process.argv.find(a=>a.startsWith('--base='))?.slice(7)??'http://127.0.0.1:3000';
assert.match(base,/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/);assert.ok(Number(new URL(base).port)<=65535);
if(!process.argv.includes('--run'))throw new Error('Explicit --run required');
const ecosystemOnly=process.argv.includes('--ecosystem-only');
const sourceId=process.argv.find(a=>a.startsWith('--source='))?.slice(9);
if(!ecosystemOnly)assert.match(sourceId??'',/^[a-f0-9-]{36}$/);
async function get<T>(route:string):Promise<T>{const r=await fetch(base+route);assert.equal(r.status,200,route);return r.json() as Promise<T>;}
const bootstrap=await get<Bootstrap>('/api/bootstrap');
assert.ok(!bootstrap.settings.publicDeployment&&bootstrap.settings.llmConfigured);
const destination=await fs.mkdtemp(path.resolve('private/real-delivery-ui-'));
const report:Record<string,unknown>={startedAt:new Date().toISOString(),scope:ecosystemOnly?'saved ecosystem UI, explicit conditions, no new inference, no physical device test':'genuine saved article to new real multi-platform works via UI',policyVersion:MODEL_POLICY_VERSION,model:bootstrap.settings.llmModel,requestedReasoningEffort:bootstrap.settings.llmReasoningEffort,errors:[]};
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
const page=await context.newPage();page.setDefaultTimeout(30000);
page.on('pageerror',e=>(report.errors as string[]).push(e.message));
async function download(buttonName:string,prefix:string){
  const event=page.waitForEvent('download',{timeout:120000});
  await page.getByRole('button',{name:buttonName,exact:true}).click();
  const file=await event,archivePath=path.join(destination,prefix+'.zip');await file.saveAs(archivePath);
  const archive=unzipSync(await fs.readFile(archivePath));
  for(const [name,body]of Object.entries(archive))if(/^(?:\d{2}-(?:cover|content|conditions|image)\.png|manifest\.json)$/.test(name))await fs.writeFile(path.join(destination,prefix+'-'+name),body);
  assert.ok(archive['manifest.json']);return Object.keys(archive).filter(n=>n.endsWith('.png')).length;
}
try{
  await page.goto(base,{waitUntil:'networkidle'});
  if(!ecosystemOnly){
    const source=await get<Run>('/api/runs/'+sourceId);assert.equal(source.engine,'llm');assert.equal(source.audit.releaseReady,true);
    const previous=await get<Campaign[]>('/api/campaigns');
    await page.getByRole('button',{name:/作品记录/}).first().click();
    await page.locator('.history-card').filter({has:page.getByRole('heading',{name:source.article.title,exact:true})}).filter({has:page.locator('.history-version').filter({hasText:new RegExp('^V'+source.version+'$')})}).first().click();
    const result=page.getByRole('region',{name:'创作结果'});await result.waitFor();
    await result.getByText('一份创意，多平台表达',{exact:true}).click();
    const platforms=result.getByLabel('内容包平台');
    assert.equal(await platforms.getByRole('button',{name:'门店朋友圈',exact:true}).getAttribute('aria-pressed'),'true');
    assert.equal(await platforms.getByRole('button',{name:'微信公众号',exact:true}).getAttribute('aria-pressed'),'true');
    await result.getByLabel('内容包补充要求').fill('保留图书馆自习的主题。朋友圈只讲一个准备动作；公众号写成一段有起伏的校园小故事。不要虚构买家经历，不要写优惠金额或续航时长。');
    const started=Date.now();await result.getByRole('button',{name:'生成多平台版本',exact:true}).click();
    await result.getByRole('button',{name:'停止后续创作',exact:true}).waitFor();
    await result.getByRole('button',{name:'停止后续创作',exact:true}).waitFor({state:'hidden',timeout:600000});
    report.campaignDurationMs=Date.now()-started;
    const created=(await get<Campaign[]>('/api/campaigns')).filter(c=>c.sourceRunId===source.id&&!previous.some(p=>p.id===c.id));
    assert.equal(created.length,1);const campaign=created[0];
    await fs.writeFile(path.join(destination,'campaign.json'),JSON.stringify(campaign,null,2));
    report.campaign=campaign;await result.screenshot({path:path.join(destination,'01-campaign-results.png')});
    assert.equal(campaign.status,'complete');assert.equal(campaign.engine,'llm');
    assert.equal(campaign.releaseReady,true,'All platform audits must actually pass');
    const works:Run[]=[];
    for(const item of campaign.items){
      assert.ok(item.runId);const run=await get<Run>('/api/runs/'+item.runId);
      assert.equal(run.engine,'llm');assert.equal(run.model,bootstrap.settings.llmModel);
      assert.equal(run.parentId,source.id);assert.equal(run.audit.releaseReady,true);works.push(run);
      await fs.writeFile(path.join(destination,item.platform+'-run.json'),JSON.stringify(run,null,2));
    }
    assert.notEqual(works[0].article.lead,works[1].article.lead);
    report.comparison=works.map(r=>({platform:r.brief.platform,title:r.article.title,lead:r.article.lead,sections:r.article.sections.map(s=>s.heading),images:r.article.images.length}));
    await result.getByRole('region',{name:'内容包状态'}).first().getByRole('button',{name:'查看作品'}).first().click();
    await page.getByRole('region',{name:'创作结果'}).getByRole('heading',{name:works[0].article.title,exact:true}).waitFor();
    report.platformPngPages=await download('下载配图包','platform');
    await page.screenshot({path:path.join(destination,'02-platform-work.png'),fullPage:true});
  }
  await page.goto(base,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'生态创作',exact:true}).click();
  const {relations}=await get<{relations:(EcosystemRelation&{active:boolean})[]}>('/api/ecosystem');
  const relation=relations.find(r=>r.active);assert.ok(relation);
  await page.getByLabel('生态协同主题').selectOption(relation.id);
  const resolve=page.getByRole('button',{name:'核对适用范围',exact:true});assert.equal(await resolve.isDisabled(),true);
  for(let i=0;i<relation.participants.length;i++)await page.locator('.ecosystem-devices select').nth(i).selectOption(relation.participants[i].systems[0]);
  const checkboxes=page.locator('.ecosystem-conditions').getByRole('checkbox');assert.equal(await checkboxes.count(),relation.conditions.length);
  for(let i=0;i<relation.conditions.length-1;i++)await checkboxes.nth(i).check();
  assert.equal(await resolve.isDisabled(),true,'Missing one condition must prevent resolution');
  await checkboxes.last().check();assert.equal(await resolve.isEnabled(),true);await resolve.click();
  await page.getByRole('button',{name:'生成生态图文',exact:true}).waitFor();
  const summaries=await get<{id:string;title:string;releaseReady:boolean}[]>('/api/ecosystem/runs');
  const saved=summaries.find(s=>s.releaseReady);assert.ok(saved,'A previously verified genuine ecosystem work is required');
  const ecosystem=await get<EcosystemRun>('/api/ecosystem/runs/'+saved.id);assert.equal(ecosystem.engine,'llm');
  await page.getByText('已有生态作品',{exact:true}).click();
  await page.getByRole('button',{name:saved.title,exact:false}).first().click();
  const ecoResult=page.getByRole('region',{name:'生态创作结果'});await ecoResult.waitFor();
  for(const disclosure of ecosystem.article.disclosures)for(const condition of disclosure.conditions)assert.ok((await ecoResult.innerText()).includes(condition));
  report.ecosystem={runId:ecosystem.id,restored:true,newGeneration:false,conditionCount:relation.conditions.length,pngPages:await download('下载生态配图包','ecosystem')};
  await fs.writeFile(path.join(destination,'ecosystem-run.json'),JSON.stringify(ecosystem,null,2));
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
    await page.setViewportSize(viewport);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=1);
    await page.screenshot({path:path.join(destination,'ecosystem-'+viewport.width+'.png'),fullPage:true});
  }
  assert.deepEqual(report.errors,[]);report.status='passed-real-delivery-ui';
}catch(error){report.status='failed-real-delivery-ui';report.error=error instanceof Error?error.message:String(error);process.exitCode=1;await page.screenshot({path:path.join(destination,'failure.png'),fullPage:true}).catch(()=>undefined);}
finally{await context.close();await browser.close();await fs.writeFile(path.join(destination,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({destination,...report}));}
