import type { Run } from '../shared/types';
import { publicCatalog } from './catalog';

/** Public deployments must not recover local snapshots through an old SQLite file. */
function isOnlineRun(run: Run): boolean {
  const productId = run.brief.productId;
  if (run.engine !== 'llm' || run.brief.mode !== 'ima' || !publicCatalog.some(product => product.id === productId) || run.evidence.product.id !== productId) return false;
  if (!run.evidence.facts.length || !run.evidence.images.length) return false;
  if (run.evidence.facts.some(fact => fact.sourceMode !== 'ima' || fact.productId !== productId)) return false;
  if ([...run.evidence.images, ...run.article.images].some(image => image.sourceMode !== 'ima' || image.productId !== productId || !/^\/api\/ima-assets\/[A-Za-z0-9_-]+$/u.test(image.url))) return false;
  return true;
}

/** Mixed-source ancestors, missing parents and cycles fail closed; data is retained. */
export function hasPublicOnlineLineage(run: Run, read: (id: string) => Run | undefined): boolean {
  try {
    const seen = new Set<string>();
    let current: Run | undefined = run;
    while (current) {
      if (seen.has(current.id) || seen.size >= 100 || !isOnlineRun(current)) return false;
      seen.add(current.id);
      if (current.parentId && current.brief.parentId && current.parentId !== current.brief.parentId) return false;
      const parentId: string | undefined = current.parentId || current.brief.parentId;
      if (!parentId) return true;
      current = read(parentId);
      if (!current || current.brief.productId !== run.brief.productId) return false;
    }
  } catch { /* Unknown legacy shapes must not disclose data through error recovery. */ }
  return false;
}
