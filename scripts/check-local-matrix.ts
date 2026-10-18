import { KnowledgeStore } from '../server/knowledge';
import { buildStrategy, composeLocal } from '../server/agent';
import { auditArticle } from '../server/audit';
import { PLATFORMS, SCENES } from '../shared/rules';
import type { Brief, Platform, Scene } from '../shared/types';

// Read-only sweep of the actual permitted local snapshot; no fake model calls,
// no saved runs, and no reproduction of private original content in the report.
const knowledge=new KnowledgeStore();
let safeDrafts=0,expectedStops=0;
const failures:{product:string;scene:string;platform:string;messages:string[]}[]=[];
for(const product of knowledge.products)for(const scene of Object.keys(SCENES) as Scene[])for(const platform of Object.keys(PLATFORMS) as Platform[]) {
  const brief:Brief={productId:product.id,audience:SCENES[scene].audience,scene,platform,stage:'比较选型',goal:'引导到店体验',requirements:'',mode:'local'};
  const evidence=knowledge.get(product.id),strategy=buildStrategy(brief);
  if(product.conflicts.length||evidence.images.length<strategy.imageMin){expectedStops++;continue;}
  const article=composeLocal(brief,evidence,strategy),audit=auditArticle(article,evidence,brief,'local-composer');
  if(audit.status==='blocked')failures.push({product:product.name,scene:SCENES[scene].name,platform:PLATFORMS[platform].name,messages:audit.findings.filter(f=>f.severity==='block').map(f=>`${f.message} ${f.excerpt||''}`)});
  else safeDrafts++;
}
process.stdout.write(JSON.stringify({notice:'实际本地快照只读矩阵，不代表大模型或 ima 在线成稿验收',total:knowledge.products.length*32,safeDrafts,expectedStops,unexpectedFailures:failures},null,2)+'\n');
if(failures.length)process.exitCode=1;
