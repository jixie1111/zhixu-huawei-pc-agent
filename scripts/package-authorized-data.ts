import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { configuredSecrets, hasSensitiveContent } from './preview-security';

/** Explicit opt-in export. Copies knowledge, not private/, and exports live SQL
 * rows in one read transaction rather than publishing a WAL or deleted rows. */
export function packageAuthorizedData(root = process.cwd()) {
  const source = path.join(root, 'private/knowledge');
  const secrets = configuredSecrets(root);
  const payloads: { path: string; bytes: Buffer }[] = [];
  const allowed = new Set(['.md', '.csv', '.json', '.html', '.png', '.jpg', '.jpeg', '.webp']);
  const scan = (relative: string, bytes: Buffer) => {
    if (hasSensitiveContent(bytes.toString('utf8'), secrets)) throw Error(`发现疑似凭证，停止发布：${relative}`);
    payloads.push({ path: relative, bytes });
  };
  function collect(directory: string, relative = '') {
    if (fs.lstatSync(directory).isSymbolicLink()) throw Error('授权资料目录不得使用符号链接');
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const name = path.posix.join(relative, entry.name), absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw Error(`授权资料禁止符号链接：${name}`);
      if (entry.isDirectory()) collect(absolute, name);
      else {
        if (!entry.isFile() || !allowed.has(path.extname(entry.name).toLowerCase()) || entry.name.startsWith('.')) throw Error(`需确认的资料文件：${name}`);
        scan(`knowledge/${name}`, fs.readFileSync(absolute));
      }
    }
  }
  collect(source);
  const tables = ['runs', 'campaigns', 'ecosystem_runs', 'ecosystem_campaigns'] as const;
  const db = new DatabaseSync(path.join(root, 'private/zhixu.sqlite'), { readOnly: true });
  const history: Record<string, unknown[]> = {};
  try {
    db.exec('BEGIN');
    for (const table of tables) history[table] = db.prepare(`SELECT payload FROM ${table} ORDER BY updated, id`).all().map(row => JSON.parse(row.payload as string));
    db.exec('COMMIT');
  } finally { db.close(); }
  const serialized = JSON.stringify(history, null, 2);
  // Machine paths are not product evidence. Fail for review instead of silently
  // changing the user's articles or their stored audit outcome.
  if (/[A-Z]:[\\/](?:Users|Windows)[\\/]/i.test(serialized.replaceAll('\\\\', '\\'))) throw Error('作品记录包含本机绝对路径，请先核对导出字段');
  scan('history.json', Buffer.from(serialized));
  scan('ecosystem-relations.json', fs.readFileSync(path.join(root, 'private/ecosystem-relations.json')));
  payloads.sort((a, b) => a.path.localeCompare(b.path));
  const manifest = {
    format: 'wuyan-authorized-data-v1', createdAt: new Date().toISOString(),
    authorization: '项目持有人于 2026-10-21 明确确认主办方允许公开完整知识库，并要求同步本地作品记录至原 GitHub 仓库和魔搭空间。此记录不将第三方素材改授开源许可。',
    counts: { knowledgeFiles: payloads.filter(p => p.path.startsWith('knowledge/')).length, ...Object.fromEntries(tables.map(t => [t, history[t].length])) },
    files: payloads.map(p => ({ path: p.path, bytes: p.bytes.length, sha256: createHash('sha256').update(p.bytes).digest('hex') })),
  };
  const output = path.join(root, 'output', `authorized-data-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(output, { recursive: true });
  for (const p of payloads) { const dest = path.join(output, p.path); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, p.bytes, { flag: 'wx' }); }
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ output, counts: manifest.counts, bytes: payloads.reduce((sum, p) => sum + p.bytes.length, 0), credentialsIncluded: false, databaseIncluded: false }));
  return output;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv.includes('--authorized')) throw Error('完整资料与作品导出需要项目持有人明确授权，并使用 --authorized');
  packageAuthorizedData();
}
