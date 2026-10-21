/** Local renderer inspection, manually assembled factual draft, NOT model output
 * or a verified cross-device interoperability claim. Never persisted as a Run. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { KnowledgeStore } from '../server/knowledge';
import { createEvidenceImageReader } from '../server/evidence-images';
import { renderVisualBundle } from '../server/visual-renderer';
import type { VisualDocument } from '../shared/visual-export';

const knowledge=new KnowledgeStore();
const devices=['HUAWEI Pura 80','HUAWEI MatePad 11.5 2026'].map(name=>{
  const product=knowledge.products.find(p=>p.name===name);if(!product)throw new Error('Missing official supplement');return knowledge.get(product.id);
});
const doc:VisualDocument={runId:randomUUID(),version:1,platform:'poster',title:'把日常装进一套设备',products:devices.map(d=>({id:d.product.id,name:d.product.name})),images:devices.map(d=>d.images[0]),draft:true,engine:'local-composer',titleReferences:[],blocks:[
  ...devices.map(d=>{const fact=d.facts.find(f=>f.label==='电池')!;return {id:d.product.id,heading:d.product.name,text:fact.text,references:[{productId:d.product.id,factId:fact.id,sourceUrl:fact.sourceUrl}],kind:'section' as const};}),
  {id:'visit',heading:'把选择放回你的日常',text:'带上常用任务，到店了解具体配置。',references:[],kind:'cta'},
  {id:'scope',heading:'适用说明',text:'具体配置以官方资料及实物为准；电池容量不等于续航时长。此图为人工编排的排版验证草稿，未调用模型。',references:[],kind:'conditions'},
]};
const result=await renderVisualBundle(doc,createEvidenceImageReader(knowledge,{},'local'));
const directory=await fs.mkdtemp(path.resolve('tmp','visual-poster-review-'));
for(const page of result.pages)await fs.writeFile(path.join(directory,page.filename),page.body);
await fs.writeFile(path.join(directory,'manifest.json'),JSON.stringify(result.manifest,null,2));
await fs.writeFile(path.join(directory,'poster-DRAFT.zip'),result.zip);
console.log(JSON.stringify({directory,pages:result.pages.length,originals:result.manifest.originals.length,draft:true,engine:'local-composer'}));
