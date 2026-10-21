/** Read-only verification of local official supplements, not a live LLM test. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { KnowledgeStore } from '../server/knowledge';
import { EcosystemStore } from '../server/ecosystem';
import { createEvidenceImageReader } from '../server/evidence-images';
import { privateDir, publicDeployment } from '../server/config';
if(publicDeployment)throw new Error('Local verification only');
const knowledge=new KnowledgeStore(),ecosystem=EcosystemStore.fromLocal();
const hash=(data:Buffer)=>createHash('sha256').update(data).digest('hex');
for(const slug of ['pura80','matepad-11-5-2026']){
  const directory=path.join(privateDir,'knowledge','official-ecosystem-2026-10',slug);
  const provenance=JSON.parse(fs.readFileSync(path.join(directory,'provenance.json'),'utf8'));
  assert.equal(hash(fs.readFileSync(path.join(directory,'source-specs.html'))),provenance.sha256);
  const product=knowledge.products.find(p=>p.name===provenance.product);assert.ok(product);assert.equal(product.conflicts.length,0);
  const evidence=knowledge.get(product.id);assert.equal(evidence.images.length,4);
  for(const image of provenance.images){assert.equal(hash(fs.readFileSync(path.join(directory,image.filename))),image.sha256);assert.ok(image.source.startsWith('https://consumer.huawei.com/'));}
  for(const image of evidence.images){const asset=await createEvidenceImageReader(knowledge,{},'local').asset!(image.id);assert.equal(asset?.type,'image/png');assert.ok(asset!.body.length>1000);assert.ok(image.width&&image.width>100);}
  console.log(`${product.name}: ${evidence.facts.length} fact groups, ${evidence.images.length} original images and provenance hashes OK`);
}
const relation=ecosystem.list().find(r=>r.id==='pura80-matepad115-2026-network-hos51');assert.ok(relation);
const selection={devices:relation.participants.map(p=>({productId:p.productId,system:p.systems[0]})),relationIds:[relation.id],conditions:{}};
const pending=ecosystem.resolve(selection,knowledge);assert.equal(pending.ready,false);assert.equal(pending.capabilities[0].status,'needs-confirmation');
// This verifies the resolver against the reviewed record; it does not confirm a
// real customer's devices/settings and never persists guessed confirmations.
const hypothetical=ecosystem.resolve({...selection,conditions:Object.fromEntries(relation.conditions.map(c=>[c.key,c.value]))},knowledge);
assert.equal(hypothetical.ready,true);
console.log('Reviewed two-device relation resolves only with all explicit conditions; actual-device confirmation and real LLM still pending.');
console.log(JSON.stringify(knowledge.stats));
