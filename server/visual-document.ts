import type { Run } from '../shared/types';
import type { EcosystemRun, ScopedBlock } from '../shared/ecosystem';
import type { VisualDocument, VisualText } from '../shared/visual-export';
import { AppError } from './errors';
import type { ProductImage } from '../shared/types';

function originalImages(selected:ProductImage[],originals:ProductImage[]){
  for(const image of selected){const original=originals.find(i=>i.id===image.id&&i.productId===image.productId);if(!original||['url','sourceUrl','sourceMode','productName','name','description','width','height','sourceTitle'].some(k=>(image as unknown as Record<string,unknown>)[k]!==(original as unknown as Record<string,unknown>)[k]))throw new AppError('VISUAL_IMAGE','所选原图与证据清单不一致，请重新核验。',422);}
}

/** Retain whole paragraphs and their qualifications. Rendering never asks a
 * second model to shorten verified facts or invent cover slogans. */
export function singleVisualDocument(run:Run,explicitDraft=false):VisualDocument {
  if(!run.audit.releaseReady&&!explicitDraft)throw new AppError('EXPORT_NOT_APPROVED','当前作品仅可导出带标识的草稿。',409);
  originalImages(run.article.images,run.evidence.images);
  const ref=(ids:string[])=>ids.map(id=>{const fact=run.evidence.facts.find(f=>f.id===id);if(!fact)throw new AppError('VISUAL_REFERENCE','稿件存在无效事实引用，请重新核验。',422);return {productId:fact.productId,factId:fact.id,sourceUrl:fact.sourceUrl};});
  return {runId:run.id,version:run.version,platform:run.brief.platform,title:run.article.title,products:[{id:run.evidence.product.id,name:run.evidence.product.name}],images:structuredClone(run.article.images),draft:explicitDraft||!run.audit.releaseReady,engine:run.engine,titleReferences:[],blocks:([
    {id:'lead',heading:'',text:run.article.lead,references:[],kind:'lead'},
    ...run.article.sections.map((s,i):VisualText=>({id:`section-${i}`,heading:s.heading,text:s.text,references:ref(s.factIds),kind:'section'})),
    {id:'cta',heading:'到店了解',text:run.article.cta,references:[],kind:'cta'},
    {id:'tags',heading:'',text:run.article.tags.join('  '),references:[],kind:'tags'},
    {id:'disclaimer',heading:'适用说明',text:run.article.disclaimer,references:[],kind:'conditions'},
  ] satisfies VisualText[]).filter(b=>b.text.trim())};
}
export function ecosystemVisualDocument(run:EcosystemRun,explicitDraft=false):VisualDocument {
  if(!run.audit.releaseReady&&!explicitDraft)throw new AppError('EXPORT_NOT_APPROVED','当前生态作品仅可导出带标识的草稿。',409);
  originalImages(run.article.images,run.evidence.devices.flatMap(d=>d.images));
  const refs=(block:ScopedBlock):VisualText['references']=>[
    ...block.facts.map(r=>{const f=run.evidence.devices.find(d=>d.product.id===r.productId)?.facts.find(f=>f.id===r.factId);if(!f)throw new AppError('VISUAL_REFERENCE','设备事实引用无效，请重新核验。',422);return {...r,sourceUrl:f.sourceUrl};}),
    ...block.relationIds.map(id=>{const relation=run.evidence.capabilities.find(c=>c.relationId===id)?.relation;if(!relation)throw new AppError('VISUAL_REFERENCE','协同引用无效，请重新核验。',422);return {relationId:id,sourceUrl:relation.sourceUrl};}),
  ];
  return {runId:run.id,version:run.version,platform:run.brief.platform,title:run.article.title.text,products:run.evidence.devices.map(d=>({id:d.product.id,name:d.product.name})),images:structuredClone(run.article.images),draft:explicitDraft||!run.audit.releaseReady,engine:'llm',titleReferences:refs(run.article.title),blocks:([
    {id:'lead',heading:'',text:run.article.lead.text,references:refs(run.article.lead),kind:'lead'},
    ...run.article.sections.map((s,i):VisualText=>({id:`section-${i}`,heading:s.heading.text,text:s.body.text,references:[...refs(s.heading),...refs(s.body)],kind:'section'})),
    {id:'cta',heading:'到店了解',text:run.article.cta.text,references:refs(run.article.cta),kind:'cta'},
    {id:'tags',heading:'',text:run.article.tags.map(t=>t.text).join('  '),references:run.article.tags.flatMap(refs),kind:'tags'},
    ...run.article.disclosures.map((d,i):VisualText=>({id:`condition-${i}`,heading:d.capability+' · 适用条件',text:[...d.systems,...d.conditions].join('\n'),references:[{relationId:d.relationId,sourceUrl:d.sourceUrl}],kind:'conditions'})),
  ] satisfies VisualText[]).filter(b=>b.text.trim())};
}
export function validateVisualDocument(doc:VisualDocument){
  if(!doc.title.trim()||doc.title.length>150||!doc.products.length||doc.products.length>4||doc.blocks.length>40||!doc.images.length||doc.images.length>6)throw new AppError('VISUAL_INPUT','图文结构或数量不符合导出范围。',422);
  if(new Set(doc.images.map(i=>i.id)).size!==doc.images.length||new Set(doc.blocks.map(b=>b.id)).size!==doc.blocks.length)throw new AppError('VISUAL_INPUT','图片或内容编号重复。',422);
  if(doc.blocks.some(b=>b.text.length>8000||b.heading.length>200)||doc.blocks.reduce((n,b)=>n+b.text.length,0)>40000)throw new AppError('VISUAL_LENGTH','图文过长，请先拆分作品后导出。',422);
  for(const image of doc.images)if(!doc.products.some(p=>p.id===image.productId)||!image.sourceUrl)throw new AppError('VISUAL_IMAGE','原图型号或来源不完整。',422);
  for(const product of doc.products)if(!doc.images.some(i=>i.productId===product.id))throw new AppError('VISUAL_IMAGE','每台设备需要至少一张原始配图。',422);
}
