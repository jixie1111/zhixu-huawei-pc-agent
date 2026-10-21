import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';

test('端口占用时明确启动失败且退出非零，不误报成功或影响原服务',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'wuyan-startup-test-'));
  const existing=createServer((_req,res)=>res.end('qa-existing-service'));
  await new Promise<void>(resolve=>existing.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise<void>(resolve=>existing.close(()=>{
    assert.ok(root.startsWith(os.tmpdir()+path.sep)&&path.basename(root).startsWith('wuyan-startup-test-'));
    fs.rmSync(root,{recursive:true,force:true});resolve();
  })));
  const port=(existing.address() as {port:number}).port;
  const result=spawnSync(process.execPath,['--import','tsx',path.resolve('server/index.ts'),'--production'],{
    encoding:'utf8',timeout:30000,windowsHide:true,
    env:{...process.env,HOST:'127.0.0.1',PORT:String(port),NODE_ENV:'production',PUBLIC_DEPLOYMENT:'true',PUBLIC_ORIGIN:'',FRAME_ANCESTORS:'',DATA_DIR:root,KNOWLEDGE_DIR:path.join(root,'empty-knowledge'),LLM_API_KEY:'',LLM_MODEL:''},
  });
  assert.equal(result.error,undefined,'The rejected server must exit, not hang until a timeout');
  assert.equal(result.status,1);
  assert.ok(!result.stdout.includes('物有言已启动'));
  assert.match(result.stderr,/物有言启动失败.*端口已被占用/u);
  assert.equal(await(await fetch(`http://127.0.0.1:${port}`)).text(),'qa-existing-service');
});
