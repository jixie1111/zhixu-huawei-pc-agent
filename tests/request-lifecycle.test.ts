import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createApp } from '../server/app';
import { KnowledgeStore } from '../server/knowledge';
import { RunStore } from '../server/store';
import { ImaAdapter } from '../server/ima';
import { AppError } from '../server/errors';
import { buildStrategy, composeLocal } from '../server/agent';
import { auditArticle } from '../server/audit';
import { configure, clearSession } from '../server/config';
import type { Brief, Evidence, Product, Run } from '../shared/types';
import { brief, knowledgeFixture, syntheticPng } from './fixtures';

const localFetch=globalThis.fetch;
function deferred<T=void>() {
  let resolve!:(value:T|PromiseLike<T>)=>void;
  let reject!:(error:unknown)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function cancellationGate() {
  const started=deferred<AbortSignal>(),stopped=deferred();
  return {started:started.promise,stopped:stopped.promise,wait:async(signal?:AbortSignal)=>{
    assert.ok(signal,'the HTTP request must pass its cancellation signal upstream');
    started.resolve(signal);
    try {
      signal.throwIfAborted();
      await new Promise<never>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
    } finally {stopped.resolve();}
  }};
}
type Asset={body:Buffer;type:string};
class SyntheticIma extends ImaAdapter {
  retrieveImpl:(product:Product,brief?:Brief,signal?:AbortSignal)=>Promise<Evidence>;
  assetImpl:(id:string,signal?:AbortSignal)=>Promise<Asset|undefined>=async()=>({body:syntheticPng,type:'image/png'});
  constructor(private knowledge:KnowledgeStore) {
    super({call:async()=>{throw new Error('Lifecycle tests forbid real ima calls');},credentials:()=>({clientId:'qa-lifecycle',imaKey:'qa-lifecycle',kbName:'Synthetic lifecycle test'})});
    this.retrieveImpl=async product=>this.onlineEvidence(product);
  }
  onlineEvidence(product:Product):Evidence {
    const value=this.knowledge.get(product.id);
    return {...value,facts:value.facts.map(f=>({...f,sourceMode:'ima'})),images:value.images.map(i=>({...i,sourceMode:'ima',url:`/api/ima-assets/${i.id}`}))};
  }
  override retrieve(product:Product,brief?:Brief,signal?:AbortSignal){return this.retrieveImpl(product,brief,signal);}
  override asset(id:string,signal?:AbortSignal){return this.assetImpl(id,signal);}
}
async function setup(t:TestContext) {
  const fixture=knowledgeFixture(),knowledge=new KnowledgeStore(fixture.root),store=new RunStore(':memory:'),ima=new SyntheticIma(knowledge);
  const app=createApp({knowledge,store,ima});
  const server=await new Promise<Server>(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  t.after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();fixture.cleanup();clearSession();});
  const input={...brief,productId:knowledge.products[0].id};
  const evidence=ima.onlineEvidence(knowledge.products[0]),strategy=buildStrategy(input),article=composeLocal(input,evidence,strategy);
  const run:Run={id:randomUUID(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),version:1,brief:{...input,mode:'ima'},evidence,strategy,article,audit:auditArticle(article,evidence,input,'llm'),engine:'llm',durationMs:1,trace:[]};
  store.save(run);
  const edit={title:article.title,lead:article.lead,sections:article.sections,cta:article.cta,tags:article.tags};
  const post=(url:string,body:unknown,signal?:AbortSignal)=>localFetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
  const get=(url:string,signal?:AbortSignal)=>localFetch(base+url,{signal});
  return {ima,store,input,run,edit,post,get};
}
const deadline={timeout:10000};

test('检索/生成/在线编辑/HTML导出共用两槽；轻量导出可用，失败释放槽位',deadline,async t=>{
  const h=await setup(t),retrieved=deferred(),exported=deferred(),releaseRetrieve=deferred(),releaseExport=deferred();
  h.ima.retrieveImpl=async()=>{retrieved.resolve();await releaseRetrieve.promise;throw new AppError('SYNTHETIC_FAILURE','合成检索失败',502);};
  h.ima.assetImpl=async()=>{exported.resolve();await releaseExport.promise;return {body:syntheticPng,type:'image/png'};};
  const first=h.post('/api/retrieve',{productId:h.input.productId,mode:'ima'});
  await retrieved.promise;
  const second=h.get(`/api/runs/${h.run.id}/export?format=html&draft=true`);
  await exported.promise;
  const blocked=await Promise.all([
    h.post('/api/retrieve',{productId:h.input.productId,mode:'ima'}),
    h.post('/api/generate',h.input),h.post(`/api/runs/${h.run.id}/edit`,h.edit),
    h.get(`/api/runs/${h.run.id}/export?format=html&draft=true`),
  ]);
  for(const response of blocked){assert.equal(response.status,429);assert.equal(response.headers.get('content-disposition'),null);assert.equal((await response.json()).code,'BUSY');}
  for(const format of ['md','json'])assert.equal((await h.get(`/api/runs/${h.run.id}/export?format=${format}&draft=true`)).status,200);
  assert.equal(h.store.list().length,1,'rejected edit and generate must not save anything');
  releaseRetrieve.resolve();releaseExport.resolve();
  assert.equal((await first).status,502);assert.equal((await second).status,200);
  h.ima.retrieveImpl=async product=>h.ima.onlineEvidence(product);
  assert.equal((await h.post('/api/retrieve',{productId:h.input.productId,mode:'ima'})).status,200);
  const generated=await h.post('/api/generate',h.input);
  assert.equal(generated.status,200);assert.match(await generated.text(),/event: result/);
});

test('检索断开中止上游并释放两个占用槽位',deadline,async t=>{
  const h=await setup(t),gates=[cancellationGate(),cancellationGate()];let calls=0;
  h.ima.retrieveImpl=async(product,_brief,signal)=>{await gates[calls++].wait(signal);return h.ima.onlineEvidence(product);};
  const controllers=[new AbortController(),new AbortController()];
  const responses=controllers.map(controller=>h.post('/api/retrieve',{productId:h.input.productId,mode:'ima'},controller.signal).catch(error=>error));
  const signals=await Promise.all(gates.map(gate=>gate.started));
  for(const controller of controllers)controller.abort();
  await Promise.all(gates.map(gate=>gate.stopped));await Promise.all(responses);
  assert.ok(signals.every(signal=>signal.aborted));
  h.ima.retrieveImpl=async product=>h.ima.onlineEvidence(product);
  const recovered=await Promise.all([h.post('/api/retrieve',{productId:h.input.productId,mode:'ima'}),h.post('/api/generate',h.input)]);
  for(const response of recovered)assert.equal(response.status,200);
  assert.match(await recovered[1].text(),/event: result/);
});

test('HTML导出断开只取消当前图片，不吞取消或继续下载下一张',deadline,async t=>{
  const h=await setup(t),gate=cancellationGate(),controller=new AbortController();let calls=0;
  h.ima.assetImpl=async(_id,signal)=>{calls++;await gate.wait(signal);return {body:syntheticPng,type:'image/png'};};
  const response=h.get(`/api/runs/${h.run.id}/export?format=html&draft=true`,controller.signal).catch(error=>error);
  const signal=await gate.started;controller.abort();await gate.stopped;await response;
  assert.ok(signal.aborted);
  h.ima.assetImpl=async()=>({body:syntheticPng,type:'image/png'});
  const recovered=await h.get(`/api/runs/${h.run.id}/export?format=html&draft=true`);
  assert.equal(recovered.status,200);assert.equal(calls,1);assert.equal(h.store.list().length,1);
});

test('在线编辑图片核验取消不保存新版本，也不继续其余图片',deadline,async t=>{
  const h=await setup(t),gate=cancellationGate(),controller=new AbortController();let calls=0;
  h.ima.assetImpl=async(_id,signal)=>{calls++;await gate.wait(signal);return {body:syntheticPng,type:'image/png'};};
  const response=h.post(`/api/runs/${h.run.id}/edit`,h.edit,controller.signal).catch(error=>error);
  const signal=await gate.started;controller.abort();await gate.stopped;await response;
  assert.ok(signal.aborted);
  const probe=await h.post('/api/generate',h.input);assert.match(await probe.text(),/event: result/);
  assert.equal(calls,1);assert.equal(h.store.list().length,2,'only the explicit recovery generation is saved');
  assert.equal(h.store.list().filter(run=>run.id===h.run.id).length,1);
});

test('在线编辑语义核验取消不变成待审保存；普通核验失败仍保留待审版本',deadline,async t=>{
  const h=await setup(t),gate=cancellationGate(),controller=new AbortController();
  configure({llmKey:'qa-lifecycle-model-key',llmModel:'qa-lifecycle-model'});
  let fail=false;
  t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>{
    if(fail)throw new Error('Synthetic model failure');
    await gate.wait(init.signal||undefined);
    throw new Error('Unreachable after cancellation');
  });
  const response=h.post(`/api/runs/${h.run.id}/edit`,h.edit,controller.signal).catch(error=>error);
  const signal=await gate.started;controller.abort();await gate.stopped;await response;
  assert.ok(signal.aborted);
  fail=true;
  const recovered=await h.post(`/api/runs/${h.run.id}/edit`,h.edit);
  assert.equal(recovered.status,200);
  const edited=await recovered.json() as Run;
  assert.equal(edited.parentId,h.run.id);assert.equal(edited.audit.releaseReady,false);
  assert.ok(edited.audit.findings.some(f=>f.id==='semantic-failed'));
  assert.equal(h.store.list().length,2,'cancelled semantic verification must not save a phantom third version');
});

test('SSE生成和编辑占满两槽；两者取消后不保存作品，后续生成仍正常',deadline,async t=>{
  const h=await setup(t),gate=cancellationGate(),editGate=cancellationGate(),controller=new AbortController(),editController=new AbortController();
  configure({llmKey:'qa-lifecycle-model-key',llmModel:'qa-lifecycle-model'});
  h.ima.retrieveImpl=async(product,_brief,signal)=>{await gate.wait(signal);return h.ima.onlineEvidence(product);};
  h.ima.assetImpl=async(_id,signal)=>{await editGate.wait(signal);return {body:syntheticPng,type:'image/png'};};
  const response=await h.post('/api/generate',{...h.input,mode:'ima'},controller.signal);
  assert.equal(response.status,200);assert.match(response.headers.get('content-type')||'',/event-stream/);
  const body=response.text().catch(error=>error);
  const signal=await gate.started;
  const editing=h.post(`/api/runs/${h.run.id}/edit`,h.edit,editController.signal).catch(error=>error);
  const editSignal=await editGate.started;
  for(const blocked of await Promise.all([h.post('/api/retrieve',{productId:h.input.productId,mode:'ima'}),h.get(`/api/runs/${h.run.id}/export?format=html&draft=true`)])){
    assert.equal(blocked.status,429);assert.equal((await blocked.json()).code,'BUSY');
  }
  controller.abort();editController.abort();await gate.stopped;await editGate.stopped;await body;await editing;
  assert.ok(signal.aborted);assert.ok(editSignal.aborted);
  const recovered=await h.post('/api/generate',h.input);assert.match(await recovered.text(),/event: result/);
  assert.equal(h.store.list().length,2);
});

test('三张单图可并发读取且各自传递断开信号，不争抢两个工作流槽位',deadline,async t=>{
  const h=await setup(t),gate=cancellationGate(),twoStarted=deferred(),release=deferred();let calls=0;
  h.ima.assetImpl=async(id,signal)=>{
    calls++;
    if(id==='cancel')await gate.wait(signal);
    else {assert.ok(signal);if(calls===3)twoStarted.resolve();await release.promise;}
    return {body:syntheticPng,type:'image/png'};
  };
  const controller=new AbortController(),cancelled=h.get('/api/ima-assets/cancel',controller.signal).catch(error=>error);
  const signal=await gate.started;
  const remaining=[h.get('/api/ima-assets/keep-a'),h.get('/api/ima-assets/keep-b')];await twoStarted.promise;
  assert.equal((await h.post('/api/retrieve',{productId:h.input.productId,mode:'ima'})).status,200);
  controller.abort();await gate.stopped;await cancelled;release.resolve();
  assert.ok(signal.aborted);
  for(const response of await Promise.all(remaining)){assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),syntheticPng);}
});

test('本地资料模型稿编辑核验读取本地原图，不调用ima或改写来源',deadline,async t=>{
  const h=await setup(t);
  const local=structuredClone(h.run);
  local.brief.mode='local';
  for(const fact of local.evidence.facts)fact.sourceMode='local';
  for(const image of [...local.evidence.images,...local.article.images]){image.sourceMode='local';image.url=`/api/assets/${image.id}`;}
  h.store.save(local);
  h.ima.assetImpl=async()=>{assert.fail('local image verification must not request ima assets');};
  configure({llmKey:'qa-lifecycle-model-key',llmModel:'qa-lifecycle-model'});
  let modelCalls=0;
  t.mock.method(globalThis,'fetch',async()=>{
    modelCalls++;
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({supported:true,issues:[]})}}]}));
  });
  const response=await h.post(`/api/runs/${local.id}/edit`,h.edit);
  assert.equal(response.status,200);
  const edited=await response.json() as Run;
  assert.equal(modelCalls,1);assert.equal(edited.brief.mode,'local');assert.equal(edited.engine,'llm');
  assert.ok(edited.evidence.facts.every(fact=>fact.sourceMode==='local'));
  assert.ok(edited.article.images.every(image=>image.sourceMode==='local'));
  assert.ok(!edited.audit.findings.some(f=>f.id.startsWith('image-unavailable-')));
});

test('本地HTML导出采用可取消文件读取，断开后不读取下一张原图',deadline,async t=>{
  const h=await setup(t),gate=cancellationGate(),controller=new AbortController();
  const local=structuredClone(h.run);local.brief.mode='local';
  for(const image of local.article.images)image.sourceMode='local';
  h.store.save(local);
  let reads=0;
  const readFile=t.mock.method(fs.promises,'readFile',async(_filename:unknown,options?:unknown)=>{
    reads++;
    const signal=typeof options==='object'&&options!==null&&'signal' in options?options.signal:undefined;
    await gate.wait(signal instanceof AbortSignal?signal:undefined);
    return syntheticPng;
  });
  const response=h.get(`/api/runs/${local.id}/export?format=html&draft=true`,controller.signal).catch(error=>error);
  const signal=await gate.started;controller.abort();await gate.stopped;await response;
  assert.ok(signal.aborted);
  readFile.mock.restore();
  const recovered=await h.get(`/api/runs/${local.id}/export?format=html&draft=true`);
  assert.equal(recovered.status,200);assert.equal(reads,1);
});
