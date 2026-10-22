import { DatabaseSync } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import type { Run, RunSummary } from '../shared/types';
import type { Campaign } from '../shared/campaign';
import type { EcosystemRun } from '../shared/ecosystem';
import type { EcosystemCampaign } from '../shared/ecosystem-campaign';
import type { ReleasedHistory } from './release-data';
import { privateDir, publicDeployment, releasedData } from './config';
import { AppError } from './errors';

type Table = keyof ReleasedHistory;
const tables: Table[] = ['runs', 'campaigns', 'ecosystem_runs', 'ecosystem_campaigns'];
const PUBLISHED = '@published';

export class RunStore {
  db: DatabaseSync;
  private scope = new AsyncLocalStorage<string>();
  private isolated: boolean;
  constructor(filename=path.join(privateDir,'zhixu.sqlite'), options: { history?: ReleasedHistory; isolateVisitors?: boolean } = {}) {
    this.isolated = options.isolateVisitors ?? (publicDeployment && !!releasedData);
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA journal_mode=WAL');
    for (const table of tables) this.db.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, updated TEXT NOT NULL, payload TEXT NOT NULL)`);
    this.db.exec('CREATE TABLE IF NOT EXISTS record_owners (kind TEXT NOT NULL, id TEXT NOT NULL, owner TEXT NOT NULL, PRIMARY KEY(kind,id)); CREATE INDEX IF NOT EXISTS owners_scope ON record_owners(kind,owner)');
    const history = options.history ?? releasedData?.history;
    if (history) this.importPublished(history);
    // Restart cancels only in-progress work, never rewrites the published snapshot.
    for (const table of ['campaigns','ecosystem_campaigns'] as const) {
      for (const row of this.db.prepare(`SELECT t.payload,o.owner FROM ${table} t LEFT JOIN record_owners o ON o.kind=? AND o.id=t.id`).all(table)) {
        const campaign=JSON.parse(row.payload as string) as Campaign | EcosystemCampaign;
        if(campaign.status!=='running'||row.owner===PUBLISHED)continue;
        campaign.status='cancelled';campaign.releaseReady=false;campaign.updatedAt=new Date().toISOString();
        for(const item of campaign.items)if(item.status==='running'||item.status==='pending'){item.status='cancelled';item.error={code:'PROCESS_RESTARTED',message:'服务重启，已完成作品保留，其余任务已中止。'};}
        this.inWorkspace(typeof row.owner==='string'?row.owner:'',()=>this.write(table,campaign));
      }
    }
  }
  inWorkspace<T>(id: string, work: () => T): T { return this.scope.run(id, work); }
  private importPublished(history: ReleasedHistory) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const table of tables) {
        // A new authorized snapshot replaces only its own records, never visitor work.
        this.db.prepare(`DELETE FROM ${table} WHERE id IN (SELECT id FROM record_owners WHERE kind=? AND owner=?)`).run(table,PUBLISHED);
        this.db.prepare('DELETE FROM record_owners WHERE kind=? AND owner=?').run(table,PUBLISHED);
        for (const record of history[table]) {
          if(this.db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(record.id))throw Error('发布记录与已有作品编号冲突');
          this.db.prepare(`INSERT INTO ${table}(id,updated,payload) VALUES(?,?,?)`).run(record.id,record.updatedAt,JSON.stringify(record));
          this.db.prepare('INSERT INTO record_owners(kind,id,owner) VALUES(?,?,?)').run(table,record.id,PUBLISHED);
        }
      }
      this.db.exec('COMMIT');
    } catch(error) { this.db.exec('ROLLBACK');throw error; }
  }
  private visible(table: Table) {
    return this.isolated ? { sql: ' AND EXISTS (SELECT 1 FROM record_owners o WHERE o.kind=? AND o.id=t.id AND (o.owner=? OR (o.owner=? AND o.owner!=\'\')))', args: [table,PUBLISHED,this.scope.getStore()||''] } : { sql: '', args: [] };
  }
  private read<T>(table: Table, id: string): T | undefined {
    const filter=this.visible(table);
    const row=this.db.prepare(`SELECT payload FROM ${table} t WHERE id=?${filter.sql}`).get(id,...filter.args);
    return row?JSON.parse(row.payload as string):undefined;
  }
  private all<T>(table: Table, limit: number): T[] {
    const filter=this.visible(table);
    return this.db.prepare(`SELECT payload FROM ${table} t WHERE 1=1${filter.sql} ORDER BY updated DESC,id LIMIT ?`).all(...filter.args,limit).map(row=>JSON.parse(row.payload as string));
  }
  private write<T extends { id:string; updatedAt:string }>(table:Table,record:T,insertOnly=false):T {
    const owner=this.scope.getStore()||'';
    if(this.isolated&&!owner)throw new AppError('WORKSPACE_REQUIRED','请刷新页面以建立创作空间。',401);
    const previous=this.db.prepare(`SELECT o.owner FROM ${table} t LEFT JOIN record_owners o ON o.kind=? AND o.id=t.id WHERE t.id=?`).get(table,record.id);
    if(previous?.owner===PUBLISHED||this.isolated&&previous&&previous.owner!==owner)throw new AppError('READ_ONLY_RECORD','已发布原稿保持不变，请另存新版本。',403);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const update=insertOnly?'':' ON CONFLICT(id) DO UPDATE SET updated=excluded.updated,payload=excluded.payload';
      this.db.prepare(`INSERT INTO ${table}(id,updated,payload) VALUES(?,?,?)${update}`).run(record.id,record.updatedAt,JSON.stringify(record));
      this.db.prepare('INSERT INTO record_owners(kind,id,owner) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET owner=excluded.owner').run(table,record.id,owner);
      this.db.exec('COMMIT');
    } catch(error) { this.db.exec('ROLLBACK');throw error; }
    return record;
  }
  save(run:Run) {return this.write('runs',run);}
  get(id:string) {return this.read<Run>('runs',id);}
  list():RunSummary[] {return this.all<Run>('runs',100).map(r=>({id:r.id,createdAt:r.createdAt,updatedAt:r.updatedAt,version:r.version,brief:r.brief,engine:r.engine,durationMs:r.durationMs,title:r.article.title,status:r.audit.status,releaseReady:r.audit.releaseReady,cover:r.article.images[0]?.url}));}
  saveCampaign(campaign:Campaign) {return this.write('campaigns',campaign);}
  getCampaign(id:string) {return this.read<Campaign>('campaigns',id);}
  listCampaigns() {return this.all<Campaign>('campaigns',50);}
  saveEcosystem(run:EcosystemRun) {return this.write('ecosystem_runs',run,true);}
  getEcosystem(id:string) {return this.read<EcosystemRun>('ecosystem_runs',id);}
  listEcosystem() {return this.all<EcosystemRun>('ecosystem_runs',50).map(r=>({id:r.id,createdAt:r.createdAt,version:r.version,parentId:r.parentId,title:r.article.title.text,platform:r.brief.platform,productIds:r.brief.selection.devices.map(d=>d.productId),status:r.audit.status,releaseReady:r.audit.releaseReady}));}
  saveEcosystemCampaign(campaign:EcosystemCampaign) {return this.write('ecosystem_campaigns',campaign);}
  getEcosystemCampaign(id:string) {return this.read<EcosystemCampaign>('ecosystem_campaigns',id);}
  listEcosystemCampaigns() {return this.all<EcosystemCampaign>('ecosystem_campaigns',50);}
  close(){this.db.close();}
}
