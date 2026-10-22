import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Run } from '../shared/types';
import type { Campaign } from '../shared/campaign';
import type { EcosystemRun } from '../shared/ecosystem';
import type { EcosystemCampaign } from '../shared/ecosystem-campaign';

export interface ReleasedHistory {
  runs: Run[]; campaigns: Campaign[]; ecosystem_runs: EcosystemRun[]; ecosystem_campaigns: EcosystemCampaign[];
}
export interface ReleasedData { root: string; history: ReleasedHistory; counts: Record<string, number> }

/** Only an explicit, hash-verified export can lift the public snapshot gate.
 * A mounted private directory or an arbitrary KNOWLEDGE_DIR does not do so. */
export function loadReleasedData(directory: string): ReleasedData {
  const root = path.resolve(directory);
  if (fs.lstatSync(root).isSymbolicLink()) throw Error('发布资料目录不得使用符号链接');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.format !== 'wuyan-authorized-data-v1' || !Array.isArray(manifest.files) || manifest.files.length > 20000 || typeof manifest.authorization !== 'string') throw Error('发布资料清单无效');
  const seen = new Set<string>();
  for (const file of manifest.files) {
    if (typeof file.path !== 'string' || file.path.includes('\\') || file.path.split('/').some((p: string) => !p || p === '..' || p === '.') || path.isAbsolute(file.path) || !/^(knowledge\/|history\.json$|ecosystem-relations\.json$)/.test(file.path) || seen.has(file.path)) throw Error('发布资料清单路径无效');
    seen.add(file.path);
    let actual = root;
    for (const part of file.path.split('/')) { actual = path.join(actual, part); if (fs.lstatSync(actual).isSymbolicLink()) throw Error('发布资料中存在符号链接'); }
    const bytes = fs.readFileSync(actual);
    if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw Error(`发布资料校验失败：${file.path}`);
  }
  if (!seen.has('history.json') || !seen.has('ecosystem-relations.json')) throw Error('发布作品或生态资料缺失');
  // Reject extra files too: the runtime may only index what was reviewed.
  const inspect = (dir: string, prefix = '') => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix + item.name;
      if (item.isSymbolicLink()) throw Error('发布资料中存在符号链接');
      if (item.isDirectory()) inspect(path.join(dir, item.name), `${relative}/`);
      else if (relative !== 'manifest.json' && !seen.has(relative)) throw Error(`未列入发布清单：${relative}`);
    }
  };
  inspect(root);
  const history = JSON.parse(fs.readFileSync(path.join(root, 'history.json'), 'utf8')) as ReleasedHistory;
  for (const table of ['runs', 'campaigns', 'ecosystem_runs', 'ecosystem_campaigns'] as const) {
    if (!Array.isArray(history[table]) || history[table].length !== manifest.counts[table] || history[table].some(r => !r.id || !r.updatedAt)) throw Error('发布作品数量或格式无效');
  }
  return { root, history, counts: manifest.counts };
}
