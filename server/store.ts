import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import type { Run, RunSummary } from '../shared/types';
import type { Campaign } from '../shared/campaign';
import type { EcosystemRun } from '../shared/ecosystem';
import type { EcosystemCampaign } from '../shared/ecosystem-campaign';
import { privateDir } from './config';

export class RunStore {
  db:DatabaseSync;
  constructor(filename=path.join(privateDir,'zhixu.sqlite')) {
    this.db=new DatabaseSync(filename);
    this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, updated TEXT NOT NULL, payload TEXT NOT NULL)');
    this.db.exec('CREATE TABLE IF NOT EXISTS campaigns (id TEXT PRIMARY KEY, updated TEXT NOT NULL, payload TEXT NOT NULL)');
    this.db.exec('CREATE TABLE IF NOT EXISTS ecosystem_runs (id TEXT PRIMARY KEY, updated TEXT NOT NULL, payload TEXT NOT NULL)');
    this.db.exec('CREATE TABLE IF NOT EXISTS ecosystem_campaigns (id TEXT PRIMARY KEY, updated TEXT NOT NULL, payload TEXT NOT NULL)');
    // No model request can survive a process restart. Preserve finished items,
    // and make the interrupted remainder explicit instead of showing "running" forever.
    for(const row of this.db.prepare('SELECT payload FROM campaigns').all()) {
      const campaign=JSON.parse(row.payload as string) as Campaign;
      if(campaign.status!=='running')continue;
      campaign.status='cancelled';campaign.releaseReady=false;campaign.updatedAt=new Date().toISOString();
      for(const item of campaign.items)if(item.status==='running'||item.status==='pending'){item.status='cancelled';item.error={code:'PROCESS_RESTARTED',message:'服务重启，当前平台任务已中止；已生成版本保留。'};}
      this.saveCampaign(campaign);
    }
    for(const row of this.db.prepare('SELECT payload FROM ecosystem_campaigns').all()) {
      const campaign=JSON.parse(row.payload as string) as EcosystemCampaign;
      if(campaign.status!=='running')continue;
      campaign.status='cancelled';campaign.releaseReady=false;campaign.updatedAt=new Date().toISOString();
      for(const item of campaign.items)if(item.status==='running'||item.status==='pending'){item.status='cancelled';item.error={code:'PROCESS_RESTARTED',message:'服务重启，已完成生态作品保留，其余任务已中止。'};}
      this.saveEcosystemCampaign(campaign);
    }
  }
  save(run:Run) {this.db.prepare('INSERT INTO runs(id,updated,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET updated=excluded.updated,payload=excluded.payload').run(run.id,run.updatedAt,JSON.stringify(run)); return run;}
  get(id:string):Run|undefined {const row=this.db.prepare('SELECT payload FROM runs WHERE id=?').get(id);return row?JSON.parse(row.payload as string):undefined;}
  list():RunSummary[] {return this.db.prepare('SELECT payload FROM runs ORDER BY updated DESC LIMIT 100').all().map(row=>{const r=JSON.parse(row.payload as string) as Run;return {id:r.id,createdAt:r.createdAt,updatedAt:r.updatedAt,version:r.version,brief:r.brief,engine:r.engine,durationMs:r.durationMs,title:r.article.title,status:r.audit.status,releaseReady:r.audit.releaseReady,cover:r.article.images[0]?.url};});}
  close(){this.db.close();}
  saveEcosystem(run:EcosystemRun) {this.db.prepare('INSERT INTO ecosystem_runs(id,updated,payload) VALUES(?,?,?)').run(run.id,run.updatedAt,JSON.stringify(run));return run;}
  getEcosystem(id:string):EcosystemRun|undefined {const row=this.db.prepare('SELECT payload FROM ecosystem_runs WHERE id=?').get(id);return row?JSON.parse(row.payload as string):undefined;}
  listEcosystem() {return this.db.prepare('SELECT payload FROM ecosystem_runs ORDER BY updated DESC LIMIT 50').all().map(row=>{const r=JSON.parse(row.payload as string) as EcosystemRun;return {id:r.id,createdAt:r.createdAt,version:r.version,parentId:r.parentId,title:r.article.title.text,platform:r.brief.platform,productIds:r.brief.selection.devices.map(d=>d.productId),status:r.audit.status,releaseReady:r.audit.releaseReady};});}
  saveEcosystemCampaign(campaign:EcosystemCampaign) {this.db.prepare('INSERT INTO ecosystem_campaigns(id,updated,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET updated=excluded.updated,payload=excluded.payload').run(campaign.id,campaign.updatedAt,JSON.stringify(campaign));return campaign;}
  getEcosystemCampaign(id:string):EcosystemCampaign|undefined {const row=this.db.prepare('SELECT payload FROM ecosystem_campaigns WHERE id=?').get(id);return row?JSON.parse(row.payload as string):undefined;}
  listEcosystemCampaigns():EcosystemCampaign[] {return this.db.prepare('SELECT payload FROM ecosystem_campaigns ORDER BY updated DESC LIMIT 50').all().map(row=>JSON.parse(row.payload as string));}
  saveCampaign(campaign:Campaign) {this.db.prepare('INSERT INTO campaigns(id,updated,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET updated=excluded.updated,payload=excluded.payload').run(campaign.id,campaign.updatedAt,JSON.stringify(campaign));return campaign;}
  getCampaign(id:string):Campaign|undefined {const row=this.db.prepare('SELECT payload FROM campaigns WHERE id=?').get(id);return row?JSON.parse(row.payload as string):undefined;}
  listCampaigns():Campaign[] {return this.db.prepare('SELECT payload FROM campaigns ORDER BY updated DESC LIMIT 50').all().map(row=>JSON.parse(row.payload as string));}
}
