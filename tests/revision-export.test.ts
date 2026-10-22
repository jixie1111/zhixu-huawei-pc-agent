import test from 'node:test';
import assert from 'node:assert/strict';
import type { Run } from '../shared/types';
import { planImagePlacement } from '../shared/layout';
import { buildStrategy, composeLocal } from '../server/agent';
import { auditArticle } from '../server/audit';
import { composeModel, verifySemantic } from '../server/llm';
import { configure, clearSession } from '../server/config';
import { toHtml, toMarkdown } from '../server/export';
import { verifyImageAvailability } from '../server/image-verification';
import { brief, evidence, syntheticPng } from './fixtures';

function sampleRun(): Run {
  const data=evidence(), strategy=buildStrategy(brief), article=composeLocal(brief,data,strategy);
  return {id:'qa-layout',createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',version:1,brief,evidence:data,strategy,article,audit:auditArticle(article,data,brief,'local-composer'),engine:'local-composer',durationMs:1,trace:[]};
}
const response=(value:unknown)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}));

test('改写请求包含原稿且不携带旧图片地址，要求重新绑定本次证据', async t=>{
  configure({llmKey:'qa-revision-model-secret',llmModel:'qa-model'}); t.after(clearSession);
  const previous=sampleRun(); previous.article.title='需要保留的原稿主题';
  const input={...brief,mode:'ima' as const,revision:'请缩短但保留原主题',parentId:previous.id};
  const output={...previous.article,images:previous.article.images.map(({id,position,reason})=>({id,position,reason}))};
  t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>{
    const payload=JSON.parse(String(init.body)), data=JSON.parse(payload.messages[1].content);
    assert.equal(data.previous.article.title,'需要保留的原稿主题');
    assert.equal(data.previous.version,1);
    assert.equal(data.previous.article.images[0].url,undefined);
    assert.ok(payload.messages[0].content.includes('以原稿为修改起点'));
    assert.ok(!JSON.stringify(data).includes('qa-revision-model-secret'));
    return response(output);
  });
  const next=await composeModel(input,previous.evidence,previous.strategy,undefined,previous);
  assert.equal(next.title,previous.article.title);
});

test('图文编排遵循段号并保留全部六图，不按正文数量截断',()=>{
  const run=sampleRun(); run.article.sections=run.article.sections.slice(0,1);
  run.article.images=run.evidence.images.map((image,index)=>({...image,position:index===0?'封面':index===5?'文末':'第 1 段后',reason:'测试用途'}));
  const layout=planImagePlacement(run.article.images,1);
  assert.equal(layout.cover.length,1); assert.equal(layout.after[0].length,4); assert.equal(layout.end.length,1);
  const data=new Map(run.article.images.map(image=>[image.id,`data:image/png;base64,${syntheticPng.toString('base64')}`]));
  const html=toHtml(run,data);
  assert.equal((html.match(/<figure>/g)||[]).length,6);
  assert.equal((html.match(/<img src=/g)||[]).length,6);
  assert.ok(html.indexOf('<figure>')<html.indexOf('<section>'));
  assert.ok(html.indexOf('合成测试图片 2')>html.indexOf('<section>'));
  assert.ok(html.indexOf('合成测试图片 6')>html.indexOf('</section>'));
});

test('无效配图位置保留于文末并需复核，缺图导出不可显示完整通过',()=>{
  const run=sampleRun(); run.article.images[0].position='第 99 段后';
  const checked=auditArticle(run.article,run.evidence,run.brief,'local-composer');
  assert.ok(checked.findings.some(f=>f.id===`image-position-${run.article.images[0].id}`));
  assert.equal(planImagePlacement(run.article.images,3).end.length,1);
  run.audit.releaseReady=true;
  const html=toHtml(run,new Map([[run.article.images[0].id,'javascript:alert(1)']]));
  assert.ok(html.includes('本导出不完整'));
  assert.ok(!html.includes('<img src="javascript:'));
  assert.ok(html.includes('未验收草稿'));
});

test('语义复核可见图片来源说明与编排理由，不虚构像素识别能力',async t=>{
  configure({llmKey:'qa-revision-model-secret',llmModel:'qa-model'}); t.after(clearSession);
  const run=sampleRun();
  t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>{
    const data=JSON.parse(JSON.parse(String(init.body)).messages[1].content);
    assert.equal(data.imageReferences.length,6);
    assert.equal(data.selectedImages.length,3);
    assert.ok(data.imageReviewScope.includes('不声称执行了像素级视觉识别'));
    return response({supported:true,issues:[]});
  });
  const audit=await verifySemantic(run.article,run.evidence,run.audit);
  assert.equal(audit.releaseReady,false);
});

test('规则编排不会把事实自带句号与模板拼成连续重复标点',()=>{
  const {article}=sampleRun();
  assert.ok(!article.sections.some(section=>/[。；，]{2}/.test(section.text)));
});

test('购买阶段和内容目标影响事实优先级、决策理由与CTA',()=>{
  const awareness=buildStrategy({...brief,stage:'了解产品',goal:'激发兴趣与收藏'});
  const decision=buildStrategy({...brief,stage:'准备购买',goal:'辅助配置决策'});
  const experience=buildStrategy({...brief,stage:'到店体验',goal:'引导私信咨询'});
  assert.notDeepEqual(awareness.priorities,decision.priorities);
  assert.notDeepEqual(experience.priorities,decision.priorities);
  assert.ok(decision.rationale.includes('具体销售版本'));
  assert.ok(awareness.cta.includes('收藏'));assert.ok(experience.cta.includes('私信'));
  assert.equal(composeLocal(brief,evidence(),experience).cta,experience.cta);
});

test('线上配图必须可读且签名和PNG尺寸匹配，不仅检查索引数量',async()=>{
  const run=sampleRun();
  const missing=structuredClone(run.audit);
  assert.equal(await verifyImageAvailability(run.article,missing,{asset:async()=>undefined}),0);
  assert.equal(missing.status,'blocked');
  const forged=structuredClone(run.audit);
  await verifyImageAvailability(run.article,forged,{asset:async()=>({body:Buffer.from('<html>not an image</html>'),type:'image/png'})});
  assert.ok(forged.findings.some(f=>f.id.startsWith('image-unavailable-')));
  const valid=structuredClone(run.audit);
  assert.equal(await verifyImageAvailability(run.article,valid,{asset:async()=>({body:syntheticPng,type:'image/png'})}),3);
  assert.ok(!valid.findings.some(f=>f.id.startsWith('image-unavailable-')));
  run.article.images[0].width=999;
  const mismatch=structuredClone(run.audit);
  assert.equal(await verifyImageAvailability(run.article,mismatch,{asset:async()=>({body:syntheticPng,type:'image/png'})}),2);
  assert.equal(mismatch.status,'blocked');
});

test('文本与图文导出保留标题/导语可引用但未绑定正文段落的原始事实',()=>{
  const run=sampleRun();
  run.article.title='70 Wh 电池，先看日常需求';
  run.article.sections=[{heading:'屏幕',text:'14 英寸显示屏。',factIds:['qa-屏幕']}];
  run.audit=auditArticle(run.article,run.evidence,run.brief,run.engine);
  assert.deepEqual(run.audit.factChecks.map(f=>f.label),['屏幕']);
  for(const output of [toMarkdown(run),toHtml(run)]) {
    assert.ok(output.includes('### 电池'));
    assert.ok(output.includes('额定容量 70 Wh。'));
    assert.ok(output.includes(run.evidence.facts.find(f=>f.label==='电池')!.sourceUrl));
  }
});
