import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const launcher = path.resolve('node_modules/tsx/dist/cli.mjs');
const packager = path.resolve('scripts/package-preview.ts');
function run(root: string) {
  return spawnSync(process.execPath, [launcher, packager], { cwd: root, encoding: 'utf8', timeout: 30_000, windowsHide: true });
}
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zhixu-qa-package-'));
  fs.mkdirSync(path.join(root, 'private'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'README.md'), '# Synthetic preview test\n');
  fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export const fixture = true;\n');
  fs.writeFileSync(path.join(root, 'private', 'private-original.md'), 'QA_PRIVATE_DO_NOT_PUBLISH');
  fs.writeFileSync(path.join(root, 'private', 'deploy.env'), 'MODELSCOPE_ACCESS_KEY=synthetic-private-deployment-only\n');
  fs.writeFileSync(path.join(root, '.env'), 'QA_SECRET_DO_NOT_PUBLISH');
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('预览包只含允许源码和哈希清单，原文/凭证不在包内', t => {
  const scope = fixture(); t.after(scope.cleanup);
  // Empty secret fields followed by another setting are safe; whitespace must
  // not cross a line and classify the following variable name as its value.
  fs.writeFileSync(path.join(scope.root, '.env.example'), 'IMA_OPENAPI_CLIENTID=\r\nIMA_OPENAPI_APIKEY=\r\nLLM_API_KEY= \r\nADMIN_TOKEN=\r\nPUBLIC_DEPLOYMENT=false\r\n');
  const result = run(scope.root);
  assert.equal(result.status, 0, result.stderr);
  const previews = fs.readdirSync(path.join(scope.root, 'output'));
  assert.equal(previews.length, 1);
  const directory = path.join(scope.root, 'output', previews[0]);
  assert.ok(!fs.existsSync(path.join(directory, 'private'))); assert.ok(!fs.existsSync(path.join(directory, '.env')));
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'PREVIEW-MANIFEST.json'), 'utf8'));
  assert.equal(manifest.status, 'SOURCE_PREVIEW_ONLY'); assert.equal(manifest.files.length, 3);
  assert.ok(manifest.files.every((entry: { sha256: string }) => /^[a-f0-9]{64}$/.test(entry.sha256)));
  assert.ok(result.stdout.includes('未执行上传或正式提交'));
});

test('部署密钥键名、常见令牌及私有deploy配置泄漏均拒绝且不输出秘密',t=>{
  const scope=fixture();t.after(scope.cleanup);
  const samples=[
    ...['MODELSCOPE_ACCESS_KEY','GH_TOKEN','GITHUB_TOKEN'].map(name=>`${name}=synthetic-deploy-value-not-public`),
    'Copied token: '+['ms','12345678-1234-1234-1234-123456789abc'].join('-'),
    'Copied token: '+['ghp','a'.repeat(36)].join('_'),
    'Copied token: '+['gho','a'.repeat(36)].join('_'),
    'Copied token: '+['agt','codex','a'.repeat(36)].join('_'),
    'Copied token: '+['github','pat','a'.repeat(80)].join('_'),
    'Copied token: synthetic-private-deployment-only',
  ];
  for(const sample of samples){
    fs.writeFileSync(path.join(scope.root,'README.md'),sample);
    const result=run(scope.root);
    assert.notEqual(result.status,0);
    assert.ok(!result.stdout.includes(sample)&&!result.stderr.includes(sample));
    assert.ok(!fs.existsSync(path.join(scope.root,'output')));
  }
});

test('复赛源码包含开发文档与Windows启动脚本，但不收集PDF或私有截图', t => {
  const scope = fixture(); t.after(scope.cleanup);
  fs.mkdirSync(path.join(scope.root, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(scope.root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(scope.root, 'docs', 'BACKEND-V2.md'), '# Synthetic backend documentation\n');
  fs.writeFileSync(path.join(scope.root, 'scripts', 'local-recording.ps1'), 'Write-Output "Synthetic launcher"\n');
  fs.writeFileSync(path.join(scope.root, 'docs', 'private-screenshot.png'), 'synthetic excluded binary');
  fs.writeFileSync(path.join(scope.root, 'docs', 'handbook.pdf'), 'synthetic separately reviewed PDF');
  const result = run(scope.root);
  assert.equal(result.status, 0, result.stderr);
  const directory = path.join(scope.root, 'output', fs.readdirSync(path.join(scope.root, 'output'))[0]);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'PREVIEW-MANIFEST.json'), 'utf8'));
  assert.ok(manifest.files.some((entry: { path: string }) => entry.path === 'docs/BACKEND-V2.md'));
  assert.ok(manifest.files.some((entry: { path: string }) => entry.path === 'scripts/local-recording.ps1'));
  assert.ok(!manifest.files.some((entry: { path: string }) => /\.(png|pdf)$/.test(entry.path)));
});

test('示例配置误填密钥时打包失败且不打印秘密', t => {
  const scope = fixture(); t.after(scope.cleanup);
  const secret = 'synthetic-secret-should-not-be-printed';
  fs.writeFileSync(path.join(scope.root, '.env.example'), `LLM_API_KEY=${secret}\n`);
  const result = run(scope.root);
  assert.notEqual(result.status, 0);
  assert.ok(!result.stdout.includes(secret)); assert.ok(!result.stderr.includes(secret));
  assert.ok(!fs.existsSync(path.join(scope.root, 'output')));
});

test('Client ID误填和已配置密钥散落在正文时均停止打包且不泄露值', t => {
  const scope = fixture(); t.after(scope.cleanup);
  const client = 'qa-sensitive-client-id-123456';
  fs.writeFileSync(path.join(scope.root, '.env.example'), `IMA_OPENAPI_CLIENTID=${client}\n`);
  let result = run(scope.root);
  assert.notEqual(result.status, 0);
  assert.ok(!result.stdout.includes(client) && !result.stderr.includes(client));
  fs.writeFileSync(path.join(scope.root, '.env.example'), 'IMA_OPENAPI_CLIENTID=\n');
  const key = 'qa-private-secret-in-document-0123456';
  fs.writeFileSync(path.join(scope.root, '.env'), `IMA_OPENAPI_APIKEY=${key}\n`);
  fs.writeFileSync(path.join(scope.root, 'README.md'), `A copied value: ${key}\n`);
  result = run(scope.root);
  assert.notEqual(result.status, 0);
  assert.ok(!result.stdout.includes(key) && !result.stderr.includes(key));
  assert.ok(!fs.existsSync(path.join(scope.root, 'output')));
});
