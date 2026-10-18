import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

test('官方CLI执行路径收到取消后实际结束合成本机子进程并保留取消原因', { timeout: 10_000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zhixu-ima-cli-cancel-'));
  const script = path.join(root, 'ima_api.cjs'), marker = path.join(root, 'pid.txt');
  const priorPath = process.env.IMA_SKILL_PATH, priorData = process.env.DATA_DIR;
  const controller = new AbortController(), reason = new Error('synthetic CLI cancellation');
  t.after(() => {
    controller.abort(reason);
    if (priorPath === undefined) delete process.env.IMA_SKILL_PATH; else process.env.IMA_SKILL_PATH = priorPath;
    if (priorData === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = priorData;
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  });
  fs.writeFileSync(script, "require('node:fs').writeFileSync(require('node:path').join(__dirname, 'pid.txt'), String(process.pid)); setInterval(() => {}, 1000);");
  fs.writeFileSync(path.join(root, 'meta.json'), JSON.stringify({ version: 'synthetic-cancellation-test' }));
  process.env.IMA_SKILL_PATH = script; process.env.DATA_DIR = root;
  const { ImaAdapter } = await import('../server/ima');
  const adapter = new ImaAdapter({ credentials: () => ({ clientId: 'synthetic-cli-client', imaKey: 'synthetic-cli-key', kbName: '合成子进程测试库' }), assetIndexPath: false });
  const pending = adapter.connect(controller.signal);
  const rejected = assert.rejects(pending, error => error === reason);
  for (let attempt = 0; attempt < 150 && !fs.existsSync(marker); attempt++) await delay(20);
  assert.equal(fs.existsSync(marker), true, '合成子进程应已启动');
  const pid = Number(fs.readFileSync(marker, 'utf8')); assert.ok(Number.isSafeInteger(pid) && pid > 0 && pid !== process.pid);
  controller.abort(reason); await rejected;
  let alive = true;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { process.kill(pid, 0); } catch { alive = false; break; }
    await delay(20);
  }
  assert.equal(alive, false, '取消必须结束本次CLI子进程');
});
