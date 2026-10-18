import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RunStore } from '../server/store';
import { buildStrategy, composeLocal } from '../server/agent';
import { auditArticle } from '../server/audit';
import type { Run } from '../shared/types';
import { brief, evidence } from './fixtures';

test('SQLite重启后保留完整证据和版本，查询ID按数据处理', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zhixu-qa-store-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const filename = path.join(root, 'qa.sqlite');
  const data = evidence(); const strategy = buildStrategy(brief); const article = composeLocal(brief, data, strategy);
  const now = new Date().toISOString();
  const run: Run = { id: 'qa-id-1', createdAt: now, updatedAt: now, version: 1, brief, evidence: data, strategy, article, audit: auditArticle(article, data, brief, 'local-composer'), engine: 'local-composer', durationMs: 1, trace: [] };
  const first = new RunStore(filename); first.save(run); first.close();
  const second = new RunStore(filename);
  try {
    assert.deepEqual(second.get(run.id), JSON.parse(JSON.stringify(run)), 'JSON存储按约定省略undefined可选字段');
    assert.equal(second.list().length, 1); assert.equal(second.list()[0].title, article.title);
    assert.equal(second.get("' OR 1=1 --"), undefined);
    second.save({ ...run, id: 'qa-id-2', parentId: run.id, version: 2 });
    assert.equal(second.list().length, 2); assert.equal(second.get(run.id)?.version, 1);
  } finally { second.close(); }
});
