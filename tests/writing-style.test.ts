import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { writingSignals, firstPersonExamples, WRITING_CRAFT } from '../shared/writing-style';
import { polishWriting } from '../server/style-editing';
import { configure, clearSession } from '../server/config';
import { composeModel, verifySemantic } from '../server/llm';
import { auditArticle } from '../server/audit';
import { buildStrategy } from '../shared/local-composer';
import { modelPolicy } from '../server/model-policy';
import { brief, evidence, syntheticText } from './fixtures';

const oldText='把关注点落在每天的任务上。'+syntheticText(530);
const newText='课本、水杯和电脑，一起放进上课的包。'+syntheticText(530);
const fields=[{field:'title',text:'合成标题'},{field:'lead',text:'聊聊上课背的包。'},{field:'sections.0.text',text:oldText},{field:'cta',text:''}];
const patch={field:'sections.0.text',before:oldText,after:newText};
const envelope=(data:unknown)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(data)}}]}));

test('编辑信号识别抽象套话、固定反转、单句防御和逐段试机，正常否定与条件不误伤',()=>{
  assert.ok(writingSignals(['值得关注，把关注点落在日常任务上。']).some(s=>s.rule==='抽象套话'));
  assert.ok(writingSignals(['不是参数，而是体验。']).some(s=>s.rule==='固定反转句'));
  assert.ok(writingSignals(['键盘也补上一笔，给它们留一点篇幅。']).some(s=>s.rule==='创作解释'));
  for(const text of ['分辨率不代表清晰，尺寸不等于效率。','至于按键是否适合自己的敲击习惯，单凭键程数字不能替你作判断。','不能保证每种用法都有相同效果。']){
    assert.ok(writingSignals([text]).some(s=>s.rule==='防御性表达'),text);
  }
  assert.ok(writingSignals(['到店试试屏幕。','在店里看看键盘。','现场确认手感。']).some(s=>s.rule==='试机邀请逐段重复'));
  assert.deepEqual(writingSignals(['第一堂课前，把电脑放进包。','Linux版不支持该快捷键。','不喜欢大包的话，可以聊聊机身尺寸。']),[]);
  assert.deepEqual(writingSignals(['该功能仅柔光版支持。','实际重量依配置、制造工艺与测量方法有所差异。']),[],'objective product conditions remain intact');
});

test('平台创作使用语言要求，独立核验不接收风格信号或强制句式模板',()=>{
  for(const stage of ['plan','compose','verify','repair','intent','connection'] as const){
    assert.equal(modelPolicy({stage,platform:'xiaohongshu'}).instruction.includes(WRITING_CRAFT),stage==='plan'||stage==='compose');
  }
});

test('通用原则允许日常动作成景，省略过程流水账与防御收尾，不按案例堆句式',()=>{
  const system=readFileSync(new URL('../prompts/system.md',import.meta.url),'utf8');
  for(const instruction of [system,...(['xiaohongshu','wechat','moments','poster'] as const).flatMap(platform=>(['plan','compose'] as const).map(stage=>modelPolicy({stage,platform}).instruction))]){
    assert.ok(instruction.includes('日常动作可以保留'));
    assert.ok(instruction.includes('有画面感、有节奏的表达'));
    assert.ok(instruction.includes('文采克制，修辞服务产品主题'));
    assert.ok(instruction.includes('略去中间步骤，不按先后逐项交代'));
    assert.ok(instruction.includes('不把任何同类产品都能做的通用操作当卖点'));
    assert.ok(instruction.includes('不展开生活教程或用想象情节撑篇幅'));
    assert.ok(!instruction.includes('读者已经熟悉的通用操作不展开'));
    assert.ok(instruction.includes('成品不写防御性表达'));
    assert.ok(!instruction.includes('一段也可以只推进场景'));
    assert.ok(!instruction.includes('不代表”“不等于”反复防御'));
  }
});

test('单句防御触发一次语言整理，必要适用条件与原稿保留',async()=>{
  const condition='该功能仅柔光版支持。';
  const originalText=condition+'单凭键程数字不能替你作判断。'+syntheticText(660);
  const cleanText=condition+syntheticText(660);
  const input=[{field:'lead',text:'合成导语'},{field:'sections.0.text',text:originalText},{field:'cta',text:''}];
  const before=structuredClone(input);
  let calls=0;
  const result=await polishWriting({platform:'wechat'},input,{facts:[condition]},async(system,data)=>{
    calls++;
    assert.ok(system.includes('600–1000 字'));
    assert.ok(system.includes('成品不写防御性表达'));
    assert.ok((data as any).hints.some((hint:{rule:string})=>hint.rule==='防御性表达'));
    return {patches:[{field:'sections.0.text',before:originalText,after:cleanText}]};
  });
  assert.equal(calls,1);
  assert.equal(result.get('sections.0.text'),cleanText);
  assert.deepEqual(input,before);
  assert.deepEqual(writingSignals([...result.values()]),[]);
});

test('推进旁白精准提示，不把普通动作、数值标题或必要版本条件一律判成问题',()=>{
  for(const text of ['先看打开之后的样子。','声音也有自己的位置。','合上电脑，话题就轮到机身。','接着聊工作里的另一面。','想聊聊HUAWEI Pura 80的长焦。']){
    assert.ok(writingSignals([text]).some(s=>s.rule==='推进旁白'),text);
  }
  assert.deepEqual(writingSignals(['970g的机身','先看配置表，下面的两个选项按需要选择。','柔光屏仅柔光版支持；应用支持取决于系统版本。']),[]);
});

test('参数堆砌和通用说明密度仅供编辑选择，必要条件不成为事实失败',()=>{
  const dense='11.5英寸屏幕，2456×1600分辨率，256ppi，机身厚6.1毫米、约515克，逐项罗列这一组数字作为整段内容。';
  assert.ok(writingSignals([dense]).some(s=>s.rule==='参数密度'&&s.advisory));
  const clauses=['实际可视区域略小。','实际有效像素略少。','实际尺寸和重量会因配置而有差异。'];
  assert.ok(writingSignals(clauses).some(s=>s.rule==='通用说明分散'&&s.advisory));
  assert.deepEqual(writingSignals(clauses.slice(0,2)),[]);
});

test('全篇重复试用指导只作编辑提醒，单处动作和普通场景不误伤',()=>{
  const repeated=['你可以先打开一页资料读一读。','买之前，你可以横着、竖着各拿一会儿。','你可以敲一段准备交的文字。'];
  assert.ok(writingSignals(repeated).some(s=>s.rule==='重复试用指导结构'&&s.advisory));
  assert.deepEqual(writingSignals(repeated.slice(0,2)),[]);
  assert.deepEqual(writingSignals(['你上课要带课本和电脑。','柔光屏仅柔光版支持。']),[]);
});

test('恢复主体写作策略后，策划与初稿都保留统一视角、主题和事实条件',()=>{
  assert.ok(WRITING_CRAFT.includes('成品不使用第一人称'));
  assert.match(WRITING_CRAFT,/不把店员写成(?:学生)?买家/u);
  assert.ok(WRITING_CRAFT.includes('不固定清单、时间线'));
  assert.ok(WRITING_CRAFT.includes('通用尺寸、重量测量说明放独立的文末说明'));
  assert.ok(WRITING_CRAFT.includes('必要的版本、配置和功能条件紧跟对应事实'));
  for(const stage of ['plan','compose'] as const){
    const instruction=modelPolicy({stage,platform:'xiaohongshu'}).instruction;
    assert.ok(instruction.includes('全文围绕一个具体主题'));
    assert.ok(instruction.includes('未经证实的体验或效率'));
    assert.ok(instruction.includes('不要求每段各占一个参数'));
  }
});

test('介绍理由与推荐过程不作为成品旁白，直接介绍产品无需追加邀约',()=>{
  for(const text of ['我会先聊机身、屏幕和声音。','这是我愿意继续介绍它的主要原因。','比堆一长串无关参数更贴题。','多了一个可以继续了解的理由。']){
    assert.ok(writingSignals([text]).some(s=>s.rule==='介绍安排旁白'),text);
  }
  assert.deepEqual(writingSignals(['屏幕也支持触控。','产品页面标明了具体版本。']),[]);
});

test('主体写作保留信息取舍，不用统一参数动作节拍或后台推荐理由',()=>{
  assert.ok(WRITING_CRAFT.includes('无关的数字省略'));
  assert.ok(WRITING_CRAFT.includes('不为每个参数补一个动作'));
  assert.ok(WRITING_CRAFT.includes('不从参数推导身体感受、续航、画质或效率'));
  assert.ok(WRITING_CRAFT.includes('不把所有限定堆成正文末段'));
  const plan=modelPolicy({stage:'plan',platform:'xiaohongshu'}).instruction;
  const compose=modelPolicy({stage:'compose',platform:'wechat'}).instruction;
  assert.ok(plan.includes('structure组织读者要看的内容'));
  assert.ok(plan.includes('reason用于后台说明'));
  assert.ok(WRITING_CRAFT.includes('成品不写防御性表达'));
  assert.ok(compose.includes('不抄规划文字或推荐理由'));
});

test('写作不接收后台推荐理由，仍接收原策略的主题与证据优先次序',async t=>{
  configure({llmKey:'qa-style-test-only',llmModel:'qa-only',llmBaseUrl:'https://api.siliconflow.cn/v1'});t.after(clearSession);
  const data=evidence(),strategy={...buildStrategy(brief),rationale:'internal rationale must not become copy'};
  const output={title:'合成标题',lead:'合成导语',sections:[{heading:'',text:syntheticText(530),factIds:['qa-屏幕']}],cta:'',tags:[],disclaimer:'合成说明',images:data.images.slice(0,3).map(i=>({id:i.id,position:'封面',reason:'合成产品图'}))};
  t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>{
    const payload=JSON.parse(String(init.body)),input=JSON.parse(payload.messages[1].content);
    assert.equal(input.strategy.rationale,undefined);
    const {rationale:_rationale,...expected}=strategy;assert.deepEqual(input.strategy,expected);
    return envelope(output);
  });
  await composeModel(brief,data,strategy);assert.equal(strategy.rationale,'internal rationale must not become copy');
});

test('所有平台可直接结束，营销目标不强迫补邀约或访谈',()=>{
  for(const platform of ['xiaohongshu','wechat','moments','poster']){
    assert.deepEqual(writingSignals(['屏幕支持触控。'],{platform,goal:'到店咨询',cta:''}),[]);
    assert.ok(writingSignals(['屏幕支持触控。'],{platform,goal:'到店咨询',cta:'欢迎私信咨询。'}).some(s=>s.rule==='多余行动引导'));
  }
  for(const text of ['欢迎私信咨询。','欢迎到店体验。','可私信说明常见办公位置的光照情况。','这些具体任务，也适合带到版本咨询中一并沟通。'])assert.ok(writingSignals([text]).some(s=>s.rule==='邀约或需求访谈'),text);
});

test('各平台策略不生成行动句，人设与共享原则不强迫邀约',()=>{
  for(const platform of ['xiaohongshu','wechat','moments','poster'] as const){
    for(const goal of ['促进收藏','引导私信','到店体验','比较配置','激发兴趣'])assert.equal(buildStrategy({...brief,platform,goal}).cta,'');
    for(const stage of ['plan','compose'] as const){
      const instruction=modelPolicy({stage,platform}).instruction;
      assert.ok(instruction.includes('cta留空'));
      assert.ok(instruction.includes('不要求读者说明使用细节'));
      assert.ok(!/一句轻量邀请|一个具体提问或轻量邀请|结尾按实际目标选具体行动/.test(instruction));
    }
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
  const eco=[{field:'lead',text:'合成导语'},{field:'sections.0.body',text:oldText},{field:'cta',text:''}];
  const result=await polishWriting(brief,eco,{},async()=>({patches:[{field:'sections.0.body',before:oldText,after:newText}]}));
  assert.equal(result.get('sections.0.body'),newText);
});

test('保留必要限定的改稿可留下软提示，明确旁白仍拒绝；允许删除多余行动字段',async()=>{
  const conditions='实际可视区域略小。实际有效像素略少。';
  const qualified=fields.map(f=>f.field==='sections.0.text'?{...f,text:oldText+conditions}:f);
  const result=await polishWriting(brief,qualified,{},async()=>({patches:[{field:'sections.0.text',before:oldText+conditions,after:newText+conditions}]}));
  assert.equal(result.get('sections.0.text'),newText+conditions);
  const advisory='11.5英寸屏幕，2456×1600分辨率，256ppi，机身厚6.1毫米、约515克，具体配置及相应条件随产品版本确认。';
  const soft=fields.map(f=>f.field==='sections.0.text'?{...f,text:oldText+advisory}:f);
  const accepted=await polishWriting(brief,soft,{},async()=>({patches:[{field:'sections.0.text',before:oldText+advisory,after:newText+advisory}]}));
  assert.equal(accepted.get('sections.0.text'),newText+advisory,'soft hints cannot force deletion of supported details');
  const moments=[{field:'lead',text:syntheticText(230)},{field:'cta',text:'欢迎私信咨询。'}];
  const cta='';
  const changed=await polishWriting({platform:'moments',goal:'推广与咨询'},moments,{},async(_system,data)=>{
    assert.equal((data as any).context.goal,'推广与咨询');return{patches:[{field:'cta',before:moments[1].text,after:cta}]};
  });
  assert.equal(changed.get('cta'),cta);
  for(const field of ['title','lead','sections.0.text']){
    const invalid=await polishWriting(brief,fields,{},async()=>({patches:[{field,before:fields.find(f=>f.field===field)!.text,after:''}]}));
    assert.deepEqual([...invalid],fields.map(f=>[f.field,f.text]),'Blank body fields remain invalid');
  }
});

test('第一人称覆盖自述、引语、咨询动作及英文，普通词和产品名不误伤',()=>{
  for(const text of ['我挺喜欢这款。','对我来说，屏幕很重要。','我们聊聊。','咱们去看看。','本人建议。','笔者认为。','本店提供咨询。','“我想选一台电脑。”','想了解配置，私信我。','We like this screen.','This is my choice.']){
    assert.ok(firstPersonExamples(text).length>0,text);
    assert.ok(writingSignals([text]).some(signal=>signal.rule==='第一人称'),text);
  }
  for(const text of ['你可以到店咨询。','支持自我管理的计划。','HUAWEI MateBook，USB-C接口。','Wi-Fi与HDMI接口。','英特尔酷睿i7。'])assert.deepEqual(firstPersonExamples(text),[],text);
});

test('去第一人称补丁保留事实，服务故障留下风格拦截而不伪装通过',async t=>{
  const personal=fields.map(field=>field.field==='sections.0.text'?{...field,text:'我挺喜欢屏幕。'+syntheticText(530)}:field);
  const neutral='屏幕支持触控。'+syntheticText(530);
  const changed=await polishWriting(brief,personal,{},async()=>({patches:[{field:'sections.0.text',before:personal[2].text,after:neutral}]}));
  assert.equal(changed.get('sections.0.text'),neutral);
  const failed=await polishWriting(brief,personal,{},async()=>{throw Error('offline');});
  assert.equal(failed.get('sections.0.text'),personal[2].text);
  const data=evidence(),article={title:'合成标题',lead:'合成导语',sections:[{heading:'',text:personal[2].text,factIds:['qa-屏幕']}],cta:'欢迎私信咨询',tags:[],disclaimer:'合成说明',images:data.images.slice(0,3)};
  const audit=auditArticle(article,data,brief,'llm');
  assert.ok(audit.findings.some(f=>f.id==='writing-person-sections.0.text'&&f.category==='platform'&&f.field==='sections.0.text'));
  configure({llmKey:'qa-style-test-only',llmModel:'qa-only',llmBaseUrl:'https://api.siliconflow.cn/v1'});t.after(clearSession);
  t.mock.method(globalThis,'fetch',async()=>envelope({supported:true,issues:[]}));
  const reviewed=await verifySemantic(article,data,audit,undefined,'local');
  assert.equal(reviewed.releaseReady,false,'fact approval cannot bypass an explicit copy requirement');
  assert.ok(reviewed.findings.some(f=>f.id==='writing-person-sections.0.text'));
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
