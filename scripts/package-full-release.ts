import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadReleasedData } from '../server/release-data';
import { configuredSecrets, hasSensitiveContent } from './preview-security';

const root=process.cwd(),source=path.resolve(process.argv[2]||''),data=path.resolve(process.argv[3]||'');
if(path.dirname(source)!==path.join(root,'output')||!path.basename(source).startsWith('source-preview-')||path.dirname(data)!==path.join(root,'output')||!path.basename(data).startsWith('authorized-data-'))throw Error('需要明确指定 output 下的源码预览包与授权资料包');
loadReleasedData(data);
const sourceManifest=JSON.parse(fs.readFileSync(path.join(source,'PREVIEW-MANIFEST.json'),'utf8'));
const dataManifest=JSON.parse(fs.readFileSync(path.join(data,'manifest.json'),'utf8'));
const secrets=configuredSecrets(root);
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const payloads:{path:string;bytes:Buffer}[]=[];
for(const file of sourceManifest.files){
  if(path.isAbsolute(file.path)||file.path.split('/').includes('..'))throw Error('源码清单路径无效');
  const bytes=fs.readFileSync(path.join(source,file.path));
  if(hash(bytes)!==file.sha256||hash(fs.readFileSync(path.join(root,file.path)))!==file.sha256)throw Error(`源码打包后发生变更：${file.path}`);
  payloads.push({path:file.path,bytes});
}
payloads.push({path:'PREVIEW-MANIFEST.json',bytes:fs.readFileSync(path.join(source,'PREVIEW-MANIFEST.json'))});
for(const file of [...dataManifest.files,{path:'manifest.json'}])payloads.push({path:`published-data/${file.path}`,bytes:fs.readFileSync(path.join(data,file.path))});
const pdf=fs.readFileSync(path.join(root,'output/pdf/物有言-复赛作品说明书.pdf'));
if(hash(pdf)!=='6a0074aead679ad7f41a25b985626cabb7e6afef5b3aa8d6b7a6ec6c1641ff53')throw Error('作品说明书已变化，需要重新检查后发布');
payloads.push({path:'docs/作品说明书.pdf',bytes:pdf});
for(const p of payloads)if(hasSensitiveContent(p.bytes.toString('utf8'),secrets))throw Error(`发现疑似凭据，停止发布：${p.path}`);
const manifest={format:'wuyan-full-release-v1',createdAt:new Date().toISOString(),counts:dataManifest.counts,files:payloads.map(p=>({path:p.path,bytes:p.bytes.length,sha256:hash(p.bytes)}))};
const output=path.join(root,'output',`full-release-${new Date().toISOString().replace(/[:.]/g,'-')}`);
fs.mkdirSync(output,{recursive:true});
for(const p of payloads){const dest=path.join(output,p.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,p.bytes,{flag:'wx'});}
fs.writeFileSync(path.join(output,'RELEASE-MANIFEST.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
console.log(JSON.stringify({output,files:payloads.length,bytes:payloads.reduce((s,p)=>s+p.bytes.length,0),counts:dataManifest.counts}));
