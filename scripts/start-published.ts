import path from 'node:path';
import { spawn } from 'node:child_process';
const child=spawn(process.execPath,[path.resolve('node_modules/tsx/dist/cli.mjs'),path.resolve('server/index.ts'),'--production'],{
  stdio:'inherit',windowsHide:true,
  env:{...process.env,PUBLISHED_DATA_DIR:path.resolve('published-data'),DATA_DIR:process.env.DATA_DIR||path.resolve('private/published-workspace')},
});
child.on('exit',code=>process.exit(code??1));
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>child.kill(signal));
