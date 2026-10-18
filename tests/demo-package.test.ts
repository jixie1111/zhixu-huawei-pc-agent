import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stageDemo } from '../scripts/stage-demo';

function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'zhixu-qa-static-'));
  fs.mkdirSync(path.join(root,'dist-demo','assets'),{recursive:true});
  fs.mkdirSync(path.join(root,'private'),{recursive:true});
  fs.writeFileSync(path.join(root,'dist-demo','index.html'),'<!doctype html><script src="./assets/app.js"></script>');
  fs.writeFileSync(path.join(root,'dist-demo','assets','app.js'),'console.log("synthetic static preview");');
  fs.writeFileSync(path.join(root,'private','knowledge.md'),'Private material, never a static asset');
  fs.writeFileSync(path.join(root,'private','deploy.env'),'GH_TOKEN=synthetic-static-private-token\n');
  return {root,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('静态上传准备只复制dist-demo及说明卡，不带原库、配置或源码',t=>{
  const scope=fixture();t.after(scope.cleanup);
  const destination=stageDemo(scope.root);
  assert.deepEqual(fs.readdirSync(destination).sort(),['README.md','assets','index.html']);
  assert.equal(fs.readFileSync(path.join(destination,'assets','app.js'),'utf8'),'console.log("synthetic static preview");');
  assert.ok(fs.readFileSync(path.join(destination,'README.md'),'utf8').includes('不会调用 ima 或真实大模型'));
  assert.ok(!fs.existsSync(path.join(destination,'private')));
});
test('静态构建中误含部署凭据或非构建文件时在复制前阻断',t=>{
  const scope=fixture();t.after(scope.cleanup);
  fs.writeFileSync(path.join(scope.root,'dist-demo','assets','app.js'),'console.log("synthetic-static-private-token");');
  assert.throws(()=>stageDemo(scope.root),/疑似包含凭证/);
  assert.ok(!fs.existsSync(path.join(scope.root,'output')));
  fs.writeFileSync(path.join(scope.root,'dist-demo','assets','app.js'),'console.log("safe");');
  fs.writeFileSync(path.join(scope.root,'dist-demo','deployment.env'),'private data');
  assert.throws(()=>stageDemo(scope.root),/非构建文件/);
  assert.ok(!fs.existsSync(path.join(scope.root,'output')));
});
