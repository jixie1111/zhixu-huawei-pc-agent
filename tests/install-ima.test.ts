import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { downloadPinnedArchive, IMA_RELEASE, installPinnedArchive, main, parsePinnedArchive, verifyInstalled } from '../scripts/install-ima';

function temporary(t: { after(callback: () => void): void }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zhixu-qa-ima-install-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('固定ima包摘要不匹配时不解压、不写入、不覆盖已有文件', t => {
  const directory = temporary(t), target = path.join(directory, 'runtime');
  const fake = Buffer.alloc(IMA_RELEASE.bytes, 0);
  assert.throws(() => parsePinnedArchive(fake), /SHA-256/);
  assert.throws(() => installPinnedArchive(fake, target), /SHA-256/);
  assert.equal(fs.existsSync(target), false);
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'user-content.txt'), 'keep-me');
  assert.throws(() => installPinnedArchive(fake, target), /SHA-256/);
  assert.equal(fs.readFileSync(path.join(target, 'user-content.txt'), 'utf8'), 'keep-me');
});

test('安装校验拒绝根目录、工作区、空目录与额外文件，不删除用户内容', t => {
  assert.throws(() => verifyInstalled(path.parse(process.cwd()).root), /Refusing/);
  assert.throws(() => verifyInstalled(process.cwd()), /Refusing/);
  const directory = temporary(t), target = path.join(directory, 'runtime');
  fs.mkdirSync(target);
  assert.throws(() => verifyInstalled(target), /incomplete/);
  fs.writeFileSync(path.join(target, 'user-content.txt'), 'keep-me');
  assert.throws(() => verifyInstalled(target), /unexpected files/);
  assert.equal(fs.readFileSync(path.join(target, 'user-content.txt'), 'utf8'), 'keep-me');
});

test('下载器只取固定公开地址，拒绝重定向、失败与超限响应', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = (url: string, status = 200, length?: string) => {
    const value = new Response(new Uint8Array([1, 2, 3]), { status, headers: length ? { 'content-length': length } : {} });
    Object.defineProperty(value, 'url', { value: url });
    return value;
  };
  globalThis.fetch = async (input, init) => {
    assert.equal(input, IMA_RELEASE.url);
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal instanceof AbortSignal);
    const headers = new Headers(init?.headers);
    assert.equal(headers.has('Authorization'), false);
    assert.equal(headers.has('Cookie'), false);
    return response(IMA_RELEASE.url);
  };
  assert.deepEqual(await downloadPinnedArchive(), Buffer.from([1, 2, 3]));
  // Downloading is separate from acceptance: synthetic bytes can never install.
  assert.throws(() => parsePinnedArchive(Buffer.from([1, 2, 3])), /SHA-256/);
  globalThis.fetch = async () => response('https://unexpected.example/asset.zip');
  await assert.rejects(downloadPinnedArchive(), /No redirect/);
  globalThis.fetch = async () => response(IMA_RELEASE.url, 503);
  await assert.rejects(downloadPinnedArchive(), /download failed/);
  globalThis.fetch = async () => response(IMA_RELEASE.url, 200, '1048577');
  await assert.rejects(downloadPinnedArchive(), /size limit/);
  globalThis.fetch = async () => {
    const value = new Response(new Uint8Array(1048577));
    Object.defineProperty(value, 'url', { value: IMA_RELEASE.url });
    return value;
  };
  await assert.rejects(downloadPinnedArchive(), /size limit/);
});

test('安装命令没有隐式动作，矛盾参数和缺路径在联网前失败', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => { throw new Error('test: unexpected network'); };
  await assert.rejects(main([]), /No action selected/);
  await assert.rejects(main(['--download']), /explicit --target/);
  await assert.rejects(main(['--download', '--check']), /exactly one/);
  await assert.rejects(main(['--archive']), /local file path/);
  await assert.rejects(main(['--check', '--target', 'unused', '--verify-only']), /cannot be combined/);
});
