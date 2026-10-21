/** Explicit real-model UI acceptance of the local creative director.
 * No request interception, mocks, key reads, ima, uploads or external navigation. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { unzipSync } from 'fflate';
import type { Bootstrap,Run } from '../shared/types';
import { MODEL_POLICY_VERSION } from '../server/model-policy';

const base=process.argv.find(a=>a.startsWith('--base='))?.slice(7)??'http://127.0.0.1:3000';
assert.match(base,/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/);assert.ok(Number(new URL(base).port)<=65535);
if(!process.argv.includes('--run'))throw new Error('Use explicit --run; consumes real model inference');
const bootstrap=await(await fetch(base+'/api/bootstrap')).json() as Bootstrap;
assert.ok(bootstrap.settings.llmConfigured&&!bootstrap.settings.publicDeployment);
const product=bootstrap.products.find(p=>p.id==='2e36efc687651401');assert.ok(product&&!product.conflicts.length);
const destination=await fs.mkdtemp(path.resolve('private/real-director-ui-'));
const report:Record<string,unknown>={startedAt:new Date().toISOString(),scope:'real model via actual UI; no response replacement',policyVersion:MODEL_POLICY_VERSION,model:bootstrap.settings.llmModel,requestedReasoningEffort:bootstrap.settings.llmReasoningEffort||'provider-default',profileNote:'Requested configuration only; bridge execution profile is not independently attested.',errors:[],apiCalls:[]};
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,acceptDownloads:true});
const page=await context.newPage();page.setDefaultTimeout(30000);
page.on('pageerror',e=>(report.errors as string[]).push(e.message));
let generated:Run|undefined;
page.on('response',response=>{
  if(response.url().startsWith(base+'/api/'))(report.apiCalls as unknown[]).push({path:new URL(response.url()).pathname,status:response.status(),method:response.request().method()});
});
try{
  await page.goto(base,{waitUntil:'networkidle'});
  const resumed=process.argv.find(a=>a.startsWith('--resume='))?.slice(9);
  const recheck=process.argv.includes('--recheck');
  let started=Date.now();
  if(resumed){
    assert.match(resumed,/^[a-f0-9-]{36}$/);generated=await(await fetch(base+'/api/runs/'+resumed)).json() as Run;
    await page.getByRole('button',{name:/作品记录/}).first().click();
    await page.locator('.history-card').filter({has:page.getByRole('heading',{name:generated.article.title,exact:true})}).filter({has:page.locator('.history-version').filter({hasText:new RegExp('^V'+generated.version+'$')})}).first().click();
    report.scope='resume a saved real UI run; no fresh generation, no response replacement';
    if(recheck){
      const original=generated;
      await page.getByRole('button',{name:'编辑正文',exact:true}).click();
      const saved=page.waitForResponse(r=>r.url()===base+'/api/runs/'+original.id+'/edit'&&r.request().method()==='POST',{timeout:180000});
      await page.getByRole('button',{name:'保存并重新核验',exact:true}).click();
      const response=await saved;assert.equal(response.status(),200);generated=await response.json() as Run;
      assert.deepEqual(generated.article,original.article,'Recheck must preserve the exact original text and images');
      assert.equal(generated.parentId,original.id);
      report.scope='saved actual UI generation, unchanged article rechecked through UI into a new version; not a new full generation';
      report.originalRunId=original.id;
    }
  }else{
  const task=process.argv.find(a=>a.startsWith('--message='))?.slice(10)??`为${product.name}做一篇给大学新生的小红书。围绕第一次准备去图书馆自习的心情，写得自然、有趣，邀请到店体验。不要写虚构亲测经历。`;
  assert.ok(task.length>=2&&task.length<=3000);
  await page.getByLabel('创作想法').fill(task);
  started=Date.now();await page.getByRole('button',{name:'整理创作方向'}).click();
  await page.getByRole('heading',{name:'这次，就这样创作。'}).waitFor({timeout:180000});
  assert.equal(await page.getByLabel('策划产品型号').inputValue(),product.id);
  await page.screenshot({path:path.join(destination,'01-confirmed-direction.png'),fullPage:true});
  const planned=page.waitForResponse(r=>r.url()===base+'/api/director/plan'&&r.request().method()==='POST',{timeout:180000});
  await page.getByRole('button',{name:'确认方向，开始策划'}).click();
  const plans=page.getByRole('region',{name:'创意方案'});
  await Promise.race([plans.waitFor({timeout:180000}),page.locator('.director-error,.notice-error').first().waitFor({timeout:180000}).then(async()=>{throw new Error(await page.locator('.director-error,.notice-error').first().innerText());})]);
  assert.equal(await plans.getByRole('button',{name:/方向 0/}).count(),3);
  const plannedResponse=await planned;assert.equal(plannedResponse.status(),200);
  const plan=await plannedResponse.json();
  assert.equal(await plans.locator('.concept-card p').first().innerText(),plan.concepts[0].problem);
  await fs.writeFile(path.join(destination,'plan.json'),JSON.stringify(plan,null,2));
  await plans.screenshot({path:path.join(destination,'02-creative-options.png')});
  await page.getByRole('button',{name:'生成图文作品',exact:true}).click();
  await page.getByRole('region',{name:'创作结果'}).waitFor({timeout:240000});
  // Chromium may evict an SSE response body. Read the newly persisted run via
  // the same unmodified application API, not an intercepted or substituted one.
  const after=await(await fetch(base+'/api/bootstrap')).json() as Bootstrap;
  const created=after.runs.filter(r=>!bootstrap.runs.some(old=>old.id===r.id)&&r.brief.productId===product.id&&r.engine==='llm');
  assert.equal(created.length,1,'Exactly one new run must result from this UI creation');
  generated=await(await fetch(base+'/api/runs/'+created[0].id)).json() as Run;
  }
  const result=page.getByRole('region',{name:'创作结果'});await result.waitFor({timeout:30000});
  assert.ok(generated,'Genuine saved result required');
  assert.equal(generated.engine,'llm');assert.equal(generated.model,bootstrap.settings.llmModel);
  await fs.writeFile(path.join(destination,'run.json'),JSON.stringify(generated,null,2));
  report.durationMs=Date.now()-started;report.runId=generated.id;report.audit=generated.audit.status;report.releaseReady=generated.audit.releaseReady;report.repairCount=generated.repairHistory?.length??0;
  await result.screenshot({path:path.join(destination,'03-real-result.png')});
  assert.equal(generated.audit.status,'passed','Actual model audit must pass, no rules fallback');
  const downloadPromise=page.waitForEvent('download',{timeout:120000});
  await result.getByRole('button',{name:'下载配图包'}).click();
  const download=await downloadPromise;await download.saveAs(path.join(destination,'visual.zip'));
  const archive=unzipSync(await fs.readFile(path.join(destination,'visual.zip')));
  for(const [name,body]of Object.entries(archive))if(/^(?:\d{2}-(?:cover|content|conditions|image)\.png|manifest\.json)$/.test(name))await fs.writeFile(path.join(destination,name),body);
  report.pngPages=Object.keys(archive).filter(n=>n.endsWith('.png')).length;
  for(const viewport of[{width:1440,height:1000},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(overflow<=1,'UI horizontal overflow');
    await page.screenshot({path:path.join(destination,`layout-${viewport.width}.png`),fullPage:true});
  }
  if(!resumed)report.operatorActions=4; // input, interpret, confirm plan, generate; export separate.
  report.note='操作次数不含输入字数与等待；端到端时间单独记录。生成等待没有加速。导出另外一次点击。';
  assert.deepEqual(report.errors,[]);
  report.status='passed-real-director-ui';
}catch(error){report.status='failed-real-director-ui';report.error=error instanceof Error?error.message:String(error);process.exitCode=1;await page.screenshot({path:path.join(destination,'failure.png'),fullPage:true}).catch(()=>undefined);}
finally{await context.close();await browser.close();await fs.writeFile(path.join(destination,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({destination,...report}));}
