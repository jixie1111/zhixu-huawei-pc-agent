import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { creativeHistory, checkCreativeReuse } from '../server/creative-memory';
import { createDirectorService } from '../server/director';
import { brief, evidence } from './fixtures';
import type { Run } from '../shared/types';
import type { KnowledgeStore } from '../server/knowledge';
const knowledge={get:()=>evidence()} as unknown as KnowledgeStore;
const input={message:'为大学新生策划小红书',engine:'rules' as const,brief:{...brief,generation:'rules' as const}};
async function prior(){
  const plan=await createDirectorService().planCreative(input,knowledge);
  const chosen=plan.concepts[0];
  const run={id:randomUUID(),engine:'llm',brief:input.brief,article:{title:'QA旧作',sections:[]},strategy:{angle:chosen.angle,structure:chosen.structure},director:{angle:chosen.angle}} as unknown as Run;
  return {plan,chosen,run};
}
test('历史按型号平台和引擎筛选，改写保留创意继承；参数正文不参与创意相似度',async()=>{
  const {chosen,run}=await prior(),other={...run,id:randomUUID(),brief:{...run.brief,productId:'other'}};
  const references=creativeHistory(brief,[other,{...run,engine:'local-composer'},run]);
  assert.equal(references.length,1);assert.equal(references[0].runId,run.id);
  assert.deepEqual(creativeHistory({...brief,parentId:run.id},[run]),[]);
  const same=checkCreativeReuse([chosen],references);assert.equal(same[0].similar,true);
  assert.equal(checkCreativeReuse([{angle:'家庭会议里的三种不同声音',structure:['家人提案','照片与视频','家庭投票']}],references)[0].similar,false);
});
test('复用推荐触发一次重策划并保留比较范围；独立新角度不额外调用',async()=>{
  const {plan,run}=await prior();
  const original={concepts:plan.concepts.map(({id,...c})=>c),recommendedIndex:0,reason:'QA原推荐'};
  let calls=0;
  const service=createDirectorService({chat:async(_system,data)=>{
    calls++;assert.equal((data as {history:unknown[]}).history.length,1);
    if(calls===1)return structuredClone(original);
    return {...original,concepts:original.concepts.map((c,i)=>({...c,angle:['家庭会议的多种声音','出门前整理背包','读者给出自己的问题'][i],structure:[`QA新问题${i}`,`QA场景答案${i}`]}))};
  }});
  const result=await service.planCreative({...input,engine:'model',brief:{...input.brief,generation:'model'}},knowledge,undefined,[run]);
  assert.equal(calls,2);assert.equal(result.originality?.retryCount,1);assert.deepEqual(result.originality?.comparedRunIds,[run.id]);
  assert.equal(result.originality?.scope,'local-history');assert.ok(!result.originality?.checks[0].similar);
  const novel=createDirectorService({chat:async()=>{calls++;return {...original,concepts:original.concepts.map((c,i)=>({...c,angle:`另一种完全原创的安排${i}`,structure:[`新的引子${i}`,`新的结尾${i}`]}))};}});
  await novel.planCreative({...input,engine:'model',brief:{...input.brief,generation:'model'}},knowledge,undefined,[run]);assert.equal(calls,3);
});
test('反复撞稿最多再策划一次，返回相似提示；重新策划的假引用仍拒绝',async()=>{
  const {plan,run}=await prior(),output={concepts:plan.concepts.map(({id,...c})=>c),recommendedIndex:0,reason:'QA'};let calls=0;
  const service=createDirectorService({chat:async()=>{calls++;return output;}});
  const modelInput={...input,engine:'model',brief:{...input.brief,generation:'model'}};
  const result=await service.planCreative(modelInput,knowledge,undefined,[run]);assert.equal(calls,2);
  assert.equal(result.originality?.checks[0].similar,true);assert.ok(result.warnings.some(s=>s.includes('较接近')));
  let count=0;const bad=createDirectorService({chat:async()=>{count++;return count===1?output:{...output,concepts:output.concepts.map(c=>({...c,factIds:['invented']}))};}});
  await assert.rejects(bad.planCreative(modelInput,knowledge,undefined,[run]),{code:'PLAN_FACT_UNKNOWN'});
});
