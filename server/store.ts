import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import type { Run, RunSummary } from '../shared/types';
import { privateDir } from './config';

export class RunStore {
  db:DatabaseSync;
  constructor(filename=path.join(privateDir,'zhixu.sqlite')) {
    this.db=new DatabaseSync(filename);
    this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, updated TEXT NOT NULL, payload TEXT NOT NULL)');
  }
  save(run:Run) {this.db.prepare('INSERT INTO runs(id,updated,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET updated=excluded.updated,payload=excluded.payload').run(run.id,run.updatedAt,JSON.stringify(run)); return run;}
  get(id:string):Run|undefined {const row=this.db.prepare('SELECT payload FROM runs WHERE id=?').get(id);return row?JSON.parse(row.payload as string):undefined;}
  list():RunSummary[] {return this.db.prepare('SELECT payload FROM runs ORDER BY updated DESC LIMIT 100').all().map(row=>{const r=JSON.parse(row.payload as string) as Run;return {id:r.id,createdAt:r.createdAt,updatedAt:r.updatedAt,version:r.version,brief:r.brief,engine:r.engine,durationMs:r.durationMs,title:r.article.title,status:r.audit.status,releaseReady:r.audit.releaseReady,cover:r.article.images[0]?.url};});}
  close(){this.db.close();}
}
