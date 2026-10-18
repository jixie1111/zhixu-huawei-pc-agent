import { KnowledgeStore } from '../server/knowledge';

const knowledge = new KnowledgeStore();
const ready = knowledge.products.some(product => product.factCount > 0 && product.imageCount > 0);
console.log(JSON.stringify({
  notice: '本地快照索引检查；不代表 ima 在线检索，不输出知识库原文或凭证。',
  stats: knowledge.stats,
  products: knowledge.products.map(({ id, name, factCount, imageCount, conflicts }) => ({
    id, name, factCount, imageCount, conflicts,
  })),
  readyForLocalDevelopment: ready,
}, null, 2));
if (!ready) {
  console.error('未发现可索引资料。请将已获授权的开发快照放入 private/knowledge，或设置 KNOWLEDGE_DIR。');
  process.exitCode = 1;
}
