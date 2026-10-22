import test from 'node:test';
import assert from 'node:assert/strict';
import { WRITING_LENGTH, articleBody, bodyLength, lengthFinding, lengthInstruction } from '../shared/writing-length';
import { PLATFORMS, PERSONAS } from '../shared/rules';
import { adjustBodyLength } from '../server/length-adjustment';
import { composeModel, verifySemantic, repairTargets, type chatStructured } from '../server/llm';
import { auditArticle } from '../server/audit';
import { buildStrategy } from '../shared/local-composer';
import { configure, clearSession } from '../server/config';
import { brief, evidence, syntheticText } from './fixtures';
type Chat=typeof chatStructured;
const fields=[{field:'lead',text:'合成导语'},{field:'sections.0.text',text:'合成测试正文'},{field:'cta',text:'合成邀请'}];
const response=(value:unknown)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}));

test('四平台统一篇幅；正文计数排除空白/标题/话题/说明，标点和emoji按码点计数',()=>{
  assert.deepEqual(WRITING_LENGTH,{xiaohongshu:[500,750],wechat:[800,1200],moments:[120,260],poster:[80,180]});
  assert.equal(bodyLength(['甲 \n乙。','\u200b😀']),4);
  assert.equal(bodyLength(articleBody({lead:'导语',sections:[{heading:'不计入',text:'正文',factIds:[]}],cta:'行动'})),6);
  assert.equal(PLATFORMS.xiaohongshu.length,'500–750 字');
  assert.ok(PERSONAS.minimal.voice.includes('平台篇幅'));assert.ok(!PERSONAS.minimal.voice.includes('正文最多两段'));
  for(const platform of Object.keys(WRITING_LENGTH) as (keyof typeof WRITING_LENGTH)[]){
    const min:number=WRITING_LENGTH[platform][0],max:number=WRITING_LENGTH[platform][1];
    const input={...brief,platform};
    for(const n of [min,max])assert.equal(lengthFinding([syntheticText(n)],input),undefined);
    for(const n of [min-1,max+1])assert.equal(lengthFinding([syntheticText(n)],input)?.id,'body-length');
    assert.ok(lengthInstruction(input).includes(PLATFORMS[platform].length));
  }
});

test('达标稿和明确精简稿不增加调用；策划保留精简例外',async()=>{
  let calls=0;const chat:Chat=async()=>{calls++;throw Error('must not call');};
  const ready=[{field:'lead',text:syntheticText(600)}];
  assert.deepEqual([...await adjustBodyLength(brief,ready,{},chat)],ready.map(f=>[f.field,f.text]));
  const shorter={...brief,revision:'精简正文'};
  await adjustBodyLength(shorter,fields,{},chat);assert.equal(calls,0);
  assert.equal(lengthFinding(['短稿'],shorter),undefined);
  assert.ok(lengthInstruction(shorter).includes('不为默认篇幅扩写'));
  assert.ok(buildStrategy(shorter).targetLength.includes('按原稿精简'));
  assert.equal(buildStrategy(brief).targetLength,'500–750 字');
});

test('短稿或过长稿只做一次正文补丁，不改输入、标题、事实引用及图片',async()=>{
  for(const original of [fields,[{field:'sections.0.text',text:syntheticText(900)}]]){
    let calls=0;const before=structuredClone(original);
    const chat:Chat=async(system,data,_signal,task)=>{
      calls++;assert.equal(task?.stage,'repair');assert.ok(system.includes('500–750 字'));
      assert.ok(system.includes('不能增加产品事实'));assert.deepEqual((data as any).fields,original);
      return {patches:[{field:'sections.0.text',before:original.find(f=>f.field==='sections.0.text')!.text,after:syntheticText(600)}]};
    };
    const next=await adjustBodyLength(brief,original,{facts:[]},chat);
    assert.equal(calls,1);assert.equal(lengthFinding([...next.values()],brief),undefined);assert.deepEqual(original,before);
  }
});

test('越权/前值错误/重复/未知字段/仍不达标的篇幅补丁均整批拒绝，原稿保留',async()=>{
  const valid={field:'sections.0.text',before:fields[1].text,after:syntheticText(600)};
  const cases=[{patches:[{...valid,field:'title'}]},{patches:[{...valid,field:'images.0.id'}]},
    {patches:[{...valid,field:'sections.0.factIds'}]},{patches:[{...valid,before:'wrong'}]},
    {patches:[valid,valid]},{patches:[{...valid,after:'仍然短'}]},{patches:[{...valid,after:syntheticText(800)}]},
    {patches:[{...valid,after:valid.before}]},{patches:[{...valid,factIds:['unknown']}]},{patches:[valid],approved:true}];
  for(const raw of cases){let calls=0;const result=await adjustBodyLength(brief,fields,{},async()=>{calls++;return raw;});
    assert.equal(calls,1);assert.deepEqual([...result],fields.map(f=>[f.field,f.text]));assert.ok(lengthFinding([...result.values()],brief));
  }
});

test('篇幅整理服务失败保留待审稿，预先或过程中取消必须传播',async()=>{
  const result=await adjustBodyLength(brief,fields,{},async()=>{throw Error('provider unavailable');});
  assert.deepEqual([...result],fields.map(f=>[f.field,f.text]));
  const controller=new AbortController();let calls=0;
  const chat:Chat=async()=>{calls++;controller.abort(new Error('operator stopped'));return {};};
  await assert.rejects(adjustBodyLength(brief,fields,{},chat,controller.signal),/operator stopped/);assert.equal(calls,1);
  await assert.rejects(adjustBodyLength(brief,fields,{},chat,controller.signal),/operator stopped/);assert.equal(calls,1);
});

test('篇幅整理后仍完整核验，模型新编参数被拦截；长度告警不授权事实修订无限扩写',async t=>{
  configure({llmKey:'qa-length-only',llmModel:'qa-length-model',llmBaseUrl:'https://api.siliconflow.cn/v1'});t.after(clearSession);
  const data=evidence(),short={title:'合成标题',lead:'合成导语',sections:[{heading:'合成小标题',text:'14 英寸显示屏。',factIds:['qa-屏幕']}],cta:'到店了解',tags:['测试'],disclaimer:'合成测试',images:data.images.slice(0,3).map(i=>({id:i.id,position:'封面',reason:'合成产品图'}))};
  let edits=0,reviews=0;
  t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>{
    const payload=JSON.parse(String(init.body)),system=payload.messages[0].content;
    if(system.includes('正文篇幅编辑')){edits++;return response({patches:[{field:'sections.0.text',before:short.sections[0].text,after:'续航99小时。'+syntheticText(600)}]});}
    if(system.includes('独立事实核验员')){reviews++;return response({supported:false,issues:[{excerpt:'续航99小时',reason:'无依据',suggestion:'删除'}]});}
    assert.ok(system.includes('500–750 字'));return response(short);
  });
  const article=await composeModel(brief,data,buildStrategy(brief));assert.equal(edits,1);
  assert.equal(article.title,short.title);assert.deepEqual(article.sections[0].factIds,short.sections[0].factIds);assert.deepEqual(article.images.map(i=>i.id),short.images.map(i=>i.id));
  const audit=await verifySemantic(article,data,auditArticle(article,data,brief,'llm'),undefined,'local');
  assert.equal(reviews,1);assert.equal(audit.releaseReady,false);assert.ok(audit.findings.some(f=>f.id.startsWith('quantity-')));
  article.sections[0].text='14 英寸显示屏。';
  const shortAudit=auditArticle(article,data,brief,'llm');assert.ok(shortAudit.findings.some(f=>f.id==='body-length'));
  assert.deepEqual(repairTargets(article,{...shortAudit,findings:shortAudit.findings.filter(f=>f.id==='body-length')}),[]);
});

test('语义通过不能消除篇幅警告，人工编辑/事实修订后按最终正文重新计数',async t=>{
  configure({llmKey:'qa-length-only',llmModel:'qa-length-model',llmBaseUrl:'https://api.siliconflow.cn/v1'});t.after(clearSession);
  const data=evidence(),article={title:'合成标题',lead:'合成导语',sections:[{heading:'合成标题',text:'14 英寸显示屏。',factIds:['qa-屏幕']}],cta:'到店了解',tags:['测试'],disclaimer:'',images:data.images.slice(0,3).map(i=>({...i,position:'封面',reason:'合成原图'}))};
  t.mock.method(globalThis,'fetch',async()=>response({supported:true,issues:[]}));
  const checked=await verifySemantic(article,data,auditArticle(article,data,brief,'llm'),undefined,'local');
  assert.equal(checked.status,'review');assert.equal(checked.releaseReady,false);assert.ok(checked.findings.some(f=>f.id==='body-length'));
  article.sections[0].text+=syntheticText(600);
  const passed=await verifySemantic(article,data,auditArticle(article,data,brief,'llm'),undefined,'local');assert.equal(passed.releaseReady,true);
});
