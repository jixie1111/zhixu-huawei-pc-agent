import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectorService } from '../server/director';
import { evidence } from './fixtures';

function catalog(){
  const records=['a','b','c','blocked','few-images','phone'].map(id=>{
    const e=evidence();e.product={...e.product,id,name:`QA-${id}`,shortName:`QA-${id}`,category:id==='phone'?'phone' as const:'computer' as const};
    e.facts=e.facts.map(f=>({...f,id:id+f.id,productId:id,text:f.text+'\nQA限定：仅指定配置。'}));
    e.images=e.images.map(i=>({...i,productId:id}));
    if(id==='blocked')e.product.conflicts=['QA冲突'];if(id==='few-images')e.product.imageCount=1;
    return e;
  });
  return {products:records.map(e=>e.product),get:(id:string)=>structuredClone(records.find(e=>e.product.id===id)!)};
}
test('泛化需求给至多两个原文候选，排除冲突与配图不足型号，仍需确认具体型号',async()=>{
  const knowledge=catalog(),service=createDirectorService();
  const proposal=await service.interpretIntent({message:'给学生写电脑小红书',engine:'rules'},knowledge.products,undefined,knowledge);
  assert.equal(proposal.suggestedBrief.productId,undefined);assert.equal(proposal.recommendations?.length,2);
  assert.ok(proposal.questions.some(q=>q.field==='productId'));assert.equal(proposal.followUp?.key,'focus');
  for(const item of proposal.recommendations!){
    assert.ok(!['phone','blocked','few-images'].includes(item.productId));
    assert.ok(item.facts.every(f=>f.text===knowledge.get(item.productId).facts.find(original=>original.id===f.id)?.text));
    assert.ok(item.facts.every(f=>f.text.includes('仅指定配置')));
  }
});
test('补充关注点和型号平台后不重复追问，用户选择覆盖推断并进入简报',async()=>{
  const knowledge=catalog(),service=createDirectorService();
  const first=await service.interpretIntent({message:'给学生写电脑推广',engine:'rules',answers:{focus:'carry',platform:'moments'}},knowledge.products,undefined,knowledge);
  assert.equal(first.followUp,undefined);assert.equal(first.suggestedBrief.platform,'moments');
  assert.ok(first.recommendations?.[0].facts.some(f=>f.label==='尺寸与重量'));
  const confirmed=await service.interpretIntent({message:'给学生写电脑推广',engine:'rules',answers:{focus:'carry',platform:'moments',productId:'a'}},knowledge.products,undefined,knowledge);
  assert.equal(confirmed.questions.length,0);assert.equal(confirmed.recommendations,undefined);
  assert.equal(confirmed.suggestedBrief.productId,'a');assert.equal(confirmed.fields.find(f=>f.field==='productId')?.origin,'user');
  assert.ok(confirmed.suggestedBrief.requirements?.includes('每天带着走'));
  await assert.rejects(service.interpretIntent({message:'写推广',engine:'rules',answers:{productId:'invented'}},knowledge.products,undefined,knowledge),{code:'PRODUCT_UNKNOWN'});
});
test('明确型号不增加候选问题，补充答案传入模型且不被模型猜测替代',async()=>{
  const knowledge=catalog(),baseline=await createDirectorService().interpretIntent({message:'写推广',engine:'rules'},knowledge.products);
  let calls=0;const service=createDirectorService({chat:async(_system,data)=>{
    calls++;assert.ok((data as {message:string}).message.includes('产品型号：QA-a'));
    return {summary:'QA模拟判断',fields:baseline.fields};
  }});
  const proposal=await service.interpretIntent({message:'写推广',engine:'model',answers:{productId:'a',platform:'wechat'}},knowledge.products,undefined,knowledge);
  assert.equal(calls,1);assert.equal(proposal.suggestedBrief.productId,'a');assert.equal(proposal.suggestedBrief.platform,'wechat');
  assert.equal(proposal.recommendations,undefined);assert.equal(proposal.questions.length,0);
});
