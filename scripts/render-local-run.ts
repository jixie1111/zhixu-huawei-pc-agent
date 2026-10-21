/** Re-layout a saved local run without changing its article or calling a model. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Run } from '../shared/types';
import { KnowledgeStore } from '../server/knowledge';
import { publicDeployment } from '../server/config';
import { createEvidenceImageReader } from '../server/evidence-images';
import { singleVisualDocument } from '../server/visual-document';
import { renderVisualBundle } from '../server/visual-renderer';

const input=process.argv.find(a=>a.startsWith('--run='))?.slice(6),root=path.resolve('private');
if(!input||publicDeployment)throw new Error('Use --run=private/.../run.json in local mode');
const filename=path.resolve(input),relative=path.relative(root,filename);
if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Saved run must stay inside private');
const bytes=await fs.readFile(filename),run=JSON.parse(bytes.toString()) as Run;
if(run.brief.mode!=='local')throw new Error('Local saved sources only');
const destination=await fs.mkdtemp(path.join(root,'visual-review-'));
const bundle=await renderVisualBundle(singleVisualDocument(run,!run.audit.releaseReady),createEvidenceImageReader(new KnowledgeStore(),{},'local'));
await fs.writeFile(path.join(destination,'visual.zip'),bundle.zip);
await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify(bundle.manifest,null,2));
for(const page of bundle.pages)await fs.writeFile(path.join(destination,page.filename),page.body);
await fs.writeFile(path.join(destination,'render-record.json'),JSON.stringify({source:filename,sourceSha256:createHash('sha256').update(bytes).digest('hex'),articleUnchanged:true,modelCalls:0,note:'仅重新排版保存的成稿，不是重新生成或重新语义核验。',pages:bundle.pages.length},null,2));
console.log(JSON.stringify({destination,pages:bundle.pages.length,articleUnchanged:true,modelCalls:0}));
