import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { stageDemo } from './stage-demo';

const root=process.cwd();
function run(relative:string,args:string[],env:NodeJS.ProcessEnv=process.env) {
  const result=spawnSync(process.execPath,[path.join(root,relative),...args],{cwd:root,env,stdio:'inherit',windowsHide:true});
  if(result.error)throw new Error('无法启动本地构建工具，请先 npm ci。');
  if(result.status!==0)process.exit(result.status||1);
}
run('node_modules/typescript/bin/tsc',['--noEmit']);
// Only the Vite child receives this flag. The parent and normal dist stay unchanged.
run('node_modules/vite/bin/vite.js',['build','--outDir','dist-demo','--base=./'],{...process.env,VITE_PUBLIC_DEMO:'true'});
stageDemo(root);
