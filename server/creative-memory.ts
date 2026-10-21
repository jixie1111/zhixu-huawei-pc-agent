import type { Brief, Run } from '../shared/types';

export interface CreativeReference {
  runId:string; title:string; audience:string; angle:string; structure:string[];
}
const normalize=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s\d]+/gu,'');
function grams(text:string){const chars=Array.from(normalize(text)),result=new Set<string>();for(let i=0;i<chars.length-1;i++)result.add(chars[i]+chars[i+1]);return result;}
export function creativeSimilarity(a:string,b:string){
  if(!normalize(a)||!normalize(b))return 0;
  if(normalize(a)===normalize(b))return 1;
  const x=grams(a),y=grams(b),union=new Set([...x,...y]);
  return union.size?[...x].filter(v=>y.has(v)).length/union.size:0;
}
/** Compare only creative angles/structure; common specifications, mandatory
 * conditions and product names in body text do not count as reused creativity. */
export function creativeHistory(brief:Brief,runs:readonly Run[]):CreativeReference[]{
  if(brief.parentId)return []; // Intentional rewrites keep their creative lineage.
  return runs.filter(run=>run.brief.productId===brief.productId&&run.brief.platform===brief.platform&&run.engine==='llm')
    .slice(0,20).map(run=>({runId:run.id,title:run.article.title.slice(0,150),audience:run.brief.audience.slice(0,200),angle:(run.director?.angle??run.strategy.angle).slice(0,600),structure:run.strategy.structure.slice(0,8).map(s=>s.slice(0,200))}));
}
export function checkCreativeReuse(concepts:{angle:string;structure:string[]}[],history:CreativeReference[]){
  return concepts.map((concept,conceptIndex)=>{
    let closest:{runId:string;similarity:number}|undefined;
    for(const prior of history){
      const angle=creativeSimilarity(concept.angle,prior.angle),structure=creativeSimilarity(concept.structure.join('\n'),prior.structure.join('\n'));
      const similarity=0.6*angle+0.4*structure;
      if(!closest||similarity>closest.similarity)closest={runId:prior.runId,similarity};
    }
    return {conceptIndex,similar:!!closest&&closest.similarity>=0.72,closestRunId:closest?.runId,similarity:closest?Number(closest.similarity.toFixed(3)):0};
  });
}
