import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import type { Run } from '../shared/types';
import type { VisualDocument, VisualManifest } from '../shared/visual-export';
import type { EcosystemRun } from '../shared/ecosystem';
import { singleVisualDocument, ecosystemVisualDocument, validateVisualDocument } from '../server/visual-document';
import { renderVisualBundle, VISUAL_SIZES } from '../server/visual-renderer';
import { buildStrategy, composeLocal } from '../shared/local-composer';
import { evidence, brief, syntheticPng } from './fixtures';

function runFixture():Run{
  const data=evidence(),strategy=buildStrategy(brief),article=composeLocal(brief,data,strategy);
  return {id:randomUUID(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),version:1,brief,strategy,evidence:data,article,audit:{status:'review',releaseReady:false,checkedAt:new Date().toISOString(),findings:[],factChecks:[]},engine:'local-composer',durationMs:0,trace:[]};
}
function docFixture():VisualDocument{
  const doc=singleVisualDocument(runFixture(),true);doc.title='从真实需求开始';doc.images=doc.images.slice(0,1);doc.blocks=[{id:'body',heading:'测试场景',text:'一段完整的测试文案。适用条件：仅用于虚构资料的自动化验证。',references:[],kind:'section'}];return doc;
}
const reader={asset:async()=>({body:syntheticPng,type:'image/png'})};
test('单品文档保留完整段落、引用、免责声明；未通过作品必须明确草稿',()=>{
  const run=runFixture();assert.throws(()=>singleVisualDocument(run),{code:'EXPORT_NOT_APPROVED'});
  const doc=singleVisualDocument(run,true);assert.equal(doc.draft,true);assert.equal(doc.engine,'local-composer');assert.equal(doc.blocks.find(b=>b.id==='section-0')!.text,run.article.sections[0].text);assert.equal(doc.blocks.find(b=>b.id==='disclaimer')!.text,run.article.disclaimer);assert.ok(doc.blocks.find(b=>b.id==='section-0')!.references.length);
  run.audit.releaseReady=true;run.audit.status='passed';assert.equal(singleVisualDocument(run,true).draft,true,'explicit draft stays visibly draft even for passed work');
});
test('单品导出拒绝伪造配图与未知事实引用',()=>{
  const run=runFixture();run.article.images[0].productId='wrong';assert.throws(()=>singleVisualDocument(run,true),{code:'VISUAL_IMAGE'});
  const unknown=runFixture();unknown.article.sections[0].factIds=['invented'];assert.throws(()=>singleVisualDocument(unknown,true),{code:'VISUAL_REFERENCE'});
});
test('生态图文保留每设备图片身份、字段引用与全部协同条件',()=>{
  const source=runFixture();const ref={productId:source.evidence.product.id,factId:source.evidence.facts[0].id};const b=(text:string)=>({text,facts:[ref],relationIds:[]});
  const run={...source,engine:'llm',brief:{...source.brief},evidence:{devices:[source.evidence],capabilities:[]},article:{title:b('测试生态标题'),lead:b('导语'),sections:[{heading:b('标题'),body:b('正文完整保留')}],cta:b('体验'),tags:[],images:source.article.images,disclosures:[{relationId:'r',capability:'测试连接',systems:['QA系统'],conditions:['账号必须一致','只能一对一'],sourceUrl:'https://consumer.huawei.com/cn/support/content/qa/'}]}} as unknown as EcosystemRun;
  const doc=ecosystemVisualDocument(run,true);assert.deepEqual(doc.titleReferences,[{...ref,sourceUrl:source.evidence.facts[0].sourceUrl}]);assert.match(doc.blocks.find(b=>b.kind==='conditions')!.text,/QA系统\n账号必须一致\n只能一对一/);assert.deepEqual(doc.images,source.article.images);
});
test('拒绝过大输入、重复素材和缺少设备原图，不以截断替代完整导出',()=>{
  const doc=docFixture();doc.blocks[0].text='甲'.repeat(8001);assert.throws(()=>validateVisualDocument(doc),{code:'VISUAL_LENGTH'});
  const duplicates=docFixture();duplicates.images.push(duplicates.images[0]);assert.throws(()=>validateVisualDocument(duplicates),{code:'VISUAL_INPUT'});
  const missing=docFixture();missing.products.push({id:'second',name:'第二台设备'});assert.throws(()=>validateVisualDocument(missing),{code:'VISUAL_IMAGE'});
});
test('原图缺失、假位图、尺寸不符均停止，取消不启动渲染',async()=>{
  await assert.rejects(renderVisualBundle(docFixture(),{}),{code:'VISUAL_IMAGE'});
  await assert.rejects(renderVisualBundle(docFixture(),{asset:async()=>({body:Buffer.from('<html>fake</html>'),type:'image/png'})}),{code:'VISUAL_IMAGE'});
  const mismatch=docFixture();mismatch.images[0].width=99;await assert.rejects(renderVisualBundle(mismatch,reader),{code:'VISUAL_IMAGE'});
  const c=new AbortController();c.abort();await assert.rejects(renderVisualBundle(docFixture(),reader,{signal:c.signal}),{name:'AbortError'});
});
test('真实浏览器四种版式PNG、ZIP完整性、Unicode无丢字、草稿和原图hash',async()=>{
  for(const platform of ['xiaohongshu','wechat','moments','poster'] as const){
    const doc=docFixture();doc.platform=platform;
    doc.blocks[0].text=('课堂与生活之间，带着实际任务到店体验。👩‍💻\n').repeat(platform==='moments'?75:1);
    if(platform==='xiaohongshu'){const image=runFixture().article.images[1];image.position='第 1 段后';doc.images.push(image);}
    doc.blocks.push({id:'conditions',heading:'适用条件',text:'实际配置以对应型号资料为准。测试原图并非真实商品图片。',references:[],kind:'conditions'});
    const result=await renderVisualBundle(doc,reader);
    const archive=unzipSync(result.zip),manifest=JSON.parse(strFromU8(archive['manifest.json'])) as VisualManifest;
    assert.equal(manifest.draft,true);assert.ok(manifest.notes.some(n=>n.includes('草稿')));assert.equal(manifest.originals[0].sha256,createHash('sha256').update(syntheticPng).digest('hex'));
    for(const p of manifest.pages){const body=Buffer.from(archive[p.filename]);assert.equal(body.readUInt32BE(16),VISUAL_SIZES[platform][0]);assert.equal(body.readUInt32BE(20),VISUAL_SIZES[platform][1]);assert.equal(createHash('sha256').update(body).digest('hex'),p.sha256);}
    for(const block of doc.blocks){const ranges=manifest.pages.flatMap(p=>p.textRanges).filter(r=>r.blockId===block.id);let previous=0;for(const range of ranges){assert.equal(range.start,previous);assert.ok(range.end>range.start);previous=range.end;}assert.equal(previous,Array.from(block.text).length);}
    assert.equal(result.pages.length,manifest.pages.length);assert.ok(archive['index.html']);assert.ok(archive['README.txt']);
    if(platform==='moments')assert.ok(manifest.pages.filter(p=>p.kind==='content').length>1);
    if(platform==='poster'){assert.equal(manifest.pages.length,1);assert.equal(manifest.pages[0].kind,'poster');assert.equal(manifest.pages[0].textRanges.length,doc.blocks.length);}
    if(platform==='xiaohongshu')assert.ok(manifest.pages.some(p=>p.kind==='content'&&p.imageIds.includes(doc.images[1].id)),'段落配图应与对应文字同卡，不能全堆到封面前');
  }
});
test('渲染期间取消能关闭隔离浏览器，输出超过页数上限明确失败',async()=>{
  const c=new AbortController();const pending=renderVisualBundle(docFixture(),reader,{signal:c.signal});setTimeout(()=>c.abort(),200);await assert.rejects(pending,{name:'AbortError'});
  const doc=docFixture();doc.blocks[0].text='不可遗漏的完整正文。'.repeat(100);
  await assert.rejects(renderVisualBundle(doc,reader,{pageLimit:2}),{code:'VISUAL_PAGE_LIMIT'});
});
test('模型HTML注入作为普通文字排版，渲染末尾来源检查仍可否决下载',async()=>{
  const doc=docFixture();doc.title='<img src="https://evil.invalid/pixel">';doc.blocks[0].text='<script>fetch("http://127.0.0.1/private")</script>';
  const result=await renderVisualBundle(doc,reader);assert.equal(result.manifest.content.title,doc.title);assert.ok(!strFromU8(unzipSync(result.zip)['index.html']).includes('<img src="https://evil'));
  await assert.rejects(renderVisualBundle(docFixture(),reader,{beforeReturn:()=>{throw new Error('Source changed during rendering');}}),/Source changed/);
});
test('长海报不能截字、缩字或只导出封面冒充完整海报',async()=>{
  const doc=docFixture();doc.platform='poster';doc.blocks[0].text='不可省略的测试使用条件。'.repeat(200);
  await assert.rejects(renderVisualBundle(doc,reader),{code:'VISUAL_OVERFLOW'});
});
test('短导语、段落、标签和条件合并排版，Unicode范围连续且不丢原图',async()=>{
  const doc=docFixture();
  doc.blocks=[
    {id:'lead',heading:'',text:'把第一份课堂笔记，留给自己的表达。👩‍💻',references:[],kind:'lead'},
    {...doc.blocks[0],text:'读一页资料，写下一句自己的理解。'},
    {id:'cta',heading:'一起体验',text:'带着具体任务来聊聊。',references:[],kind:'cta'},
    {id:'tags',heading:'',text:'#校园生活 #新学期',references:[],kind:'tags'},
    {id:'conditions',heading:'适用说明',text:'具体配置和适用条件请核对原始资料。',references:[],kind:'conditions'},
  ];
  const result=await renderVisualBundle(doc,reader);
  assert.equal(result.pages.length,2,'一个封面和一张合并正文，不给每句文字单独开页');
  assert.equal(result.manifest.pages[1].textRanges.length,5);
  for(const block of doc.blocks){const ranges=result.manifest.pages.flatMap(p=>p.textRanges).filter(r=>r.blockId===block.id);assert.deepEqual(ranges,[{blockId:block.id,start:0,end:Array.from(block.text).length}]);}
});

test('文末配图与收尾文字同页，全部原图保留且不强制单开空白大图页',async()=>{
  const doc=docFixture();
  doc.images.push(...runFixture().article.images.slice(1,3).map(i=>({...i,position:'文末'})));
  doc.blocks.push({id:'cta',heading:'来试一页资料',text:'欢迎到店看看你关心的那一页。',references:[],kind:'cta'},{id:'conditions',heading:'适用条件',text:'合成测试，实际配置以对应型号资料为准。',references:[],kind:'conditions'});
  const bundle=await renderVisualBundle(doc,reader);
  assert.equal(bundle.pages.length,2);
  assert.ok(bundle.manifest.pages.every(p=>p.kind!=='image'));
  assert.deepEqual(bundle.manifest.pages.flatMap(p=>p.imageIds).sort(),doc.images.map(i=>i.id).sort());
  assert.ok(bundle.manifest.pages[1].textRanges.some(r=>r.blockId==='cta'));
  assert.equal(bundle.manifest.pages[1].imageIds.length,2);
});

test('多个文末配图分组排版，跨页文字连续且图片不会遗漏或重复',async()=>{
  const doc=docFixture();
  doc.images.push(...Array.from({length:4},(_,i)=>({...doc.images[0],id:`tail-${i}`,position:'文末'})));
  doc.blocks[0].text='从课堂到图书馆，先找到你关心的一页。👩‍💻\n'.repeat(35);
  doc.blocks.push({id:'cta',heading:'体验邀请',text:'带着关注点来聊聊。',references:[],kind:'cta'});
  const bundle=await renderVisualBundle(doc,reader);
  assert.deepEqual(bundle.manifest.pages.flatMap(p=>p.imageIds).sort(),doc.images.map(i=>i.id).sort());
  for(const block of doc.blocks){let end=0;for(const range of bundle.manifest.pages.flatMap(p=>p.textRanges).filter(r=>r.blockId===block.id)){assert.equal(range.start,end);end=range.end;}assert.equal(end,Array.from(block.text).length);}
});
