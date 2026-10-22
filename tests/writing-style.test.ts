import test from 'node:test';
import assert from 'node:assert/strict';
import { writingSignals, WRITING_CRAFT } from '../shared/writing-style';
import { polishWriting } from '../server/style-editing';
import { configure, clearSession } from '../server/config';
import { composeModel, verifySemantic } from '../server/llm';
import { auditArticle } from '../server/audit';
import { buildStrategy } from '../shared/local-composer';
import { modelPolicy } from '../server/model-policy';
import { brief, evidence, syntheticText } from './fixtures';

const oldText='把关注点落在每天的任务上。'+syntheticText(530);
const newText='课本、水杯和电脑，一起放进上课的包。'+syntheticText(530);
const fields=[{field:'title',text:'合成标题'},{field:'lead',text:'聊聊上课背的包。'},{field:'sections.0.text',text:oldText},{field:'cta',text:'你平时喜欢怎样的包？'}];
const patch={field:'sections.0.text',before:oldText,after:newText};
const envelope=(data:unknown)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(data)}}]}));

test('编辑信号识别抽象套话、固定反转、重复防御和逐段试机，正常否定与条件不误伤',()=>{
  assert.ok(writingSignals(['值得关注，把关注点落在日常任务上。']).some(s=>s.rule==='抽象套话'));
  assert.ok(writingSignals(['不是参数，而是体验。']).some(s=>s.rule==='固定反转句'));
  assert.ok(writingSignals(['键盘也补上一笔，给它们留一点篇幅。']).some(s=>s.rule==='创作解释'));
  assert.ok(writingSignals(['分辨率不代表清晰，尺寸不等于效率。']).some(s=>s.rule==='防御说法重复'));
  assert.ok(writingSignals(['到店试试屏幕。','在店里看看键盘。','现场确认手感。']).some(s=>s.rule==='试机邀请逐段重复'));
  assert.deepEqual(writingSignals(['第一堂课前，把电脑放进包。','Linux版不支持该快捷键。','不喜欢大包的话，可以聊聊机身尺寸。']),[]);
  assert.deepEqual(writingSignals(['不等于同一型号。']),[],'a single factual qualification is not repetitive defensiveness');
});

test('平台创作使用语言要求，独立核验不接收风格信号或强制句式模板',()=>{
  for(const stage of ['plan','compose','verify','repair','intent','connection'] as const){
    assert.equal(modelPolicy({stage,platform:'xiaohongshu'}).instruction.includes(WRITING_CRAFT),stage==='plan'||stage==='compose');
  }
});

test('自然稿无需额外调用；语言补丁只整理现有字段，原稿不变',async()=>{
  let calls=0;
  const clean=fields.map(f=>({...f,text:f.text.replace('把关注点落在每天的任务上。','')}));
  assert.deepEqual([...await polishWriting(brief,clean,{},async()=>{throw Error('no call');})],clean.map(f=>[f.field,f.text]));
  const before=structuredClone(fields);
  const result=await polishWriting(brief,fields,{facts:[]},async(system,data,_signal,task)=>{
    calls++;assert.equal(task?.stage,'repair');assert.ok(system.includes('500–900 字'));assert.ok(system.includes('必要条件'));
    assert.deepEqual((data as any).fields,fields);return {patches:[patch]};
  });
  assert.equal(calls,1);assert.equal(result.get('sections.0.text'),newText);assert.deepEqual(fields,before);
});

test('越权、前值错误、重复、风格未改和篇幅失效的补丁整批拒绝',async()=>{
  for(const raw of [{patches:[{...patch,field:'images.0.id'}]},{patches:[{...patch,field:'sections.0.factIds'}]},
    {patches:[{...patch,field:'disclaimer'}]},{patches:[{...patch,before:'wrong'}]},{patches:[patch,patch]},
    {patches:[{...patch,after:'短稿'}]},{patches:[{...patch,after:'值得关注。'+syntheticText(530)}]},
    {patches:[{...patch,approved:true}]},{patches:[patch],approved:true}]){
    const result=await polishWriting(brief,fields,{},async()=>raw);
    assert.deepEqual([...result],fields.map(f=>[f.field,f.text]));
  }
});

test('语言整理故障保留原稿，取消信号继续传播；生态正文同样计数',async()=>{
  assert.deepEqual([...await polishWriting(brief,fields,{},async()=>{throw Error('offline');})],fields.map(f=>[f.field,f.text]));
  const controller=new AbortController();let calls=0;
  const transport=async()=>{calls++;controller.abort(Error('operator stopped'));return {};};
  await assert.rejects(polishWriting(brief,fields,{},transport,controller.signal),/operator stopped/);
  await assert.rejects(polishWriting(brief,fields,{},transport,controller.signal),/operator stopped/);assert.equal(calls,1);
  const eco=[{field:'lead',text:'合成导语'},{field:'sections.0.body',text:oldText},{field:'cta',text:'聊聊你的用法'}];
  const result=await polishWriting(brief,eco,{},async()=>({patches:[{field:'sections.0.body',before:oldText,after:newText}]}));
  assert.equal(result.get('sections.0.body'),newText);
});

test('语言整理不能充当事实审批：保留引用与原图，新编效果仍独立阻断',async t=>{
  configure({llmKey:'qa-style-test-only',llmModel:'qa-only',llmBaseUrl:'https://api.siliconflow.cn/v1'});t.after(clearSession);
  const data=evidence();let edits=0,reviews=0;
  const output={title:'合成标题',lead:fields[1].text,sections:[{heading:'合成段落',text:oldText,factIds:['qa-屏幕']}],cta:fields[3].text,tags:[],disclaimer:'合成说明',images:data.images.slice(0,3).map(i=>({id:i.id,position:'封面',reason:'合成产品图'}))};
  t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>{
    const system=JSON.parse(String(init.body)).messages[0].content;
    if(system.includes('你是语言编辑')){edits++;return envelope({patches:[{...patch,after:'续航99小时。'+syntheticText(530)}]});}
    if(system.includes('独立事实核验员')){reviews++;return envelope({supported:false,issues:[{excerpt:'续航99小时',reason:'无此事实',suggestion:'删除'}]});}
    return envelope(output);
  });
  const article=await composeModel(brief,data,buildStrategy(brief));assert.equal(edits,1);
  assert.deepEqual(article.sections[0].factIds,output.sections[0].factIds);assert.deepEqual(article.images.map(i=>i.id),output.images.map(i=>i.id));
  const audit=await verifySemantic(article,data,auditArticle(article,data,brief,'llm'),undefined,'local');
  assert.equal(reviews,1);assert.equal(audit.releaseReady,false);assert.ok(audit.findings.some(f=>f.id.startsWith('semantic-')));
});
