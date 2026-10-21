import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const launcher=path.resolve('scripts/local-recording.ps1');
const quote=(value:string)=>`'${value.replaceAll("'","''")}'`;
const windows={skip:process.platform!=='win32'};
const qaKey='qa-recording-fixture-not-an-actual-credential';
function invoke(command:string){return spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',command],{encoding:'utf8',timeout:30000,windowsHide:true});}
function fixture(t:{after:(fn:()=>void)=>void}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'wuyan-recording-test-'));
  t.after(()=>{assert.ok(root.startsWith(os.tmpdir()+path.sep)&&path.basename(root).startsWith('wuyan-recording-test-'));fs.rmSync(root,{recursive:true,force:true});});
  const profile=path.join(root,'profile.json');
  const args=`& ${quote(launcher)} -ProfilePath ${quote(profile)}`;
  const configure=(extra='')=>invoke(`$qaKey = [Security.SecureString]::new(); foreach ($character in ${quote(qaKey)}.ToCharArray()) { $qaKey.AppendChar($character) }; $qaKey.MakeReadOnly(); ${args} -Mode Configure -ApiKey $qaKey ${extra}`);
  return {profile,args,configure};
}

test('本机录制配置使用当前用户加密，两个独立进程恢复相同low档且不输出密钥',windows,t=>{
  const f=fixture(t),configured=f.configure();assert.equal(configured.status,0,configured.stderr);
  const stored=fs.readFileSync(f.profile,'utf8');assert.ok(!stored.includes(qaKey));
  const expected=JSON.parse(stored);assert.equal(expected.reasoningEffort,'low');assert.ok(expected.protectedApiKey.length>100);
  for(let i=0;i<2;i++){
    const inspected=invoke(`${f.args} -Mode Inspect`);assert.equal(inspected.status,0,inspected.stderr);
    assert.ok(!inspected.stdout.includes(qaKey));assert.ok(!inspected.stdout.includes(expected.protectedApiKey));
    const state=JSON.parse(inspected.stdout);assert.equal(state.reasoningEffort,'low');assert.equal(state.keyConfigured,true);assert.equal(state.credentialsProtectedForCurrentUser,true);
  }
  assert.equal(fs.readFileSync(f.profile,'utf8'),stored);
  const repeated=f.configure();assert.notEqual(repeated.status,0);assert.equal(fs.readFileSync(f.profile,'utf8'),stored,'refuse accidental replacement');
});

test('录制配置拒绝非回环地址、查询参数和无效端口，不借录制放开任意端点',windows,t=>{
  const f=fixture(t);
  for(const url of ['https://example.com/v1','http://192.168.1.1:55460/v1','http://localhost:55460/v1?x=1','http://localhost:70000/v1']){
    const configured=f.configure(`-BaseUrl ${quote(url)}`);assert.notEqual(configured.status,0);assert.ok(!fs.existsSync(f.profile));assert.ok(!configured.stderr.includes(qaKey));
  }
});

test('档位篡改与加密损坏明确失败，不输出配置内容或密钥',windows,t=>{
  const f=fixture(t);assert.equal(f.configure().status,0);
  const original=JSON.parse(fs.readFileSync(f.profile,'utf8'));
  for(const bad of [{...original,reasoningEffort:'high'},{...original,protectedApiKey:'not-a-windows-ciphertext'}]){
    fs.writeFileSync(f.profile,JSON.stringify(bad));
    const inspected=invoke(`${f.args} -Mode Inspect`);assert.notEqual(inspected.status,0);
    assert.ok(!inspected.stderr.includes(qaKey));assert.ok(!inspected.stderr.includes(original.protectedApiKey));
    assert.equal(inspected.stdout.trim(),'');
  }
});
