/** Creates local review artifacts from genuine indexed product pictures and an
 * explicit rule draft. No model, no public upload, no publication approval. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { KnowledgeStore } from '../server/knowledge';
import { buildStrategy, composeLocal } from '../shared/local-composer';
import type { Brief, Run } from '../shared/types';
import { createEvidenceImageReader } from '../server/evidence-images';
import { singleVisualDocument } from '../server/visual-document';
import { renderVisualBundle } from '../server/visual-renderer';
import { auditArticle } from '../server/audit';

const knowledge=new KnowledgeStore(),product=knowledge.products.find(p=>p.name==='HUAWEI Pura 80');
if(!product)throw new Error('Import reviewed local supplement first');
const brief:Brief={productId:product.id,audience:'希望记录校园日常的大学生',scene:'school',platform:'xiaohongshu',stage:'比较选型',goal:'引导到店体验',requirements:'',mode:'local',generation:'rules'};
const evidence=knowledge.get(product.id),strategy=buildStrategy(brief,product.category),article=composeLocal(brief,evidence,strategy);
const now=new Date().toISOString(),run:Run={id:randomUUID(),createdAt:now,updatedAt:now,version:1,brief,strategy,evidence,article,audit:auditArticle(article,evidence,brief,'local-composer'),engine:'local-composer',durationMs:0,trace:[]};
const bundle=await renderVisualBundle(singleVisualDocument(run,true),createEvidenceImageReader(knowledge,{},'local'));
const destination=await fs.mkdtemp(path.resolve('tmp','visual-review-'));
await fs.writeFile(path.join(destination,'wuyan-visual-DRAFT.zip'),bundle.zip);
await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify(bundle.manifest,null,2));
for(const page of bundle.pages)await fs.writeFile(path.join(destination,page.filename),page.body);
console.log(JSON.stringify({directory:destination,pages:bundle.pages.length,bytes:bundle.zip.length,draft:bundle.manifest.draft,engine:bundle.manifest.engine}));
