import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { EcosystemEvidence, EcosystemRelation } from '../shared/ecosystem';
import type { KnowledgeStore } from './knowledge';
import { privateDir, publicDeployment } from './config';
import { AppError } from './errors';

const text=(max=1000)=>z.string().trim().min(1).max(max);
const officialUrl=text(2000).refine(value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&['consumer.huawei.com','www.vmall.com','vmall.com'].includes(u.hostname)&&u.pathname!=='/';}catch{return false;}},'需要具体官方来源页面');
export const relationSchema=z.object({
  id:text(100),capability:text(160),statement:text(2000),
  participants:z.array(z.object({productId:text(100),role:text(160),systems:z.array(text(160)).min(1).max(20)}).strict()).min(2).max(4),
  conditions:z.array(z.object({key:text(100),label:text(200),value:text(300)}).strict()).min(1).max(20),
  sourceTitle:text(300),sourceUrl:officialUrl,excerpt:text(8000),
  supportingSources:z.array(z.object({title:text(300),url:officialUrl,excerpt:text(2000)}).strict()).max(5).optional(),
  reviewedAt:z.iso.datetime(),expiresAt:z.iso.datetime(),
}).strict().superRefine((value,ctx)=>{
  if(new Set(value.participants.map(p=>p.productId)).size!==value.participants.length)ctx.addIssue({code:'custom',message:'参与型号应唯一'});
  if(new Set(value.conditions.map(c=>c.key)).size!==value.conditions.length)ctx.addIssue({code:'custom',message:'条件键应唯一'});
  if(Date.parse(value.expiresAt)<=Date.parse(value.reviewedAt))ctx.addIssue({code:'custom',message:'复核有效期无效'});
});
export const ecosystemRequestSchema=z.object({
  devices:z.array(z.object({productId:text(100),system:z.string().trim().max(160)}).strict()).min(2).max(4),
  relationIds:z.array(text(100)).min(1).max(10),conditions:z.record(z.string().max(100),z.string().max(300)),
}).strict().superRefine((value,ctx)=>{
  if(new Set(value.devices.map(d=>d.productId)).size!==value.devices.length)ctx.addIssue({code:'custom',message:'设备型号应唯一'});
  if(new Set(value.relationIds).size!==value.relationIds.length)ctx.addIssue({code:'custom',message:'协同能力应唯一'});
  if(Object.keys(value.conditions).length>30)ctx.addIssue({code:'custom',message:'条件过多'});
});

/** Only a locally reviewed relation record can support cross-device claims.
 * Neither family membership nor individual device features establish a relation. */
export class EcosystemStore {
  private relations=new Map<string,EcosystemRelation>();
  constructor(records:unknown[]=[],private now:()=>number=Date.now) {
    for(const raw of records){const parsed=relationSchema.safeParse(raw);if(!parsed.success)throw new AppError('ECOSYSTEM_RECORD','生态证据记录格式或来源无效，请核对本地资料。',422);if(this.relations.has(parsed.data.id))throw new AppError('ECOSYSTEM_RECORD','生态证据编号重复。',422);this.relations.set(parsed.data.id,structuredClone(parsed.data));}
  }
  static fromLocal(filename=path.join(privateDir,'ecosystem-relations.json')) {
    if(publicDeployment||!fs.existsSync(filename))return new EcosystemStore();
    const stat=fs.lstatSync(filename);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2_000_000)throw new AppError('ECOSYSTEM_RECORD','生态证据文件格式或大小不符合要求。',422);
    let parsed:unknown;try{parsed=JSON.parse(fs.readFileSync(filename,'utf8'));}catch{throw new AppError('ECOSYSTEM_RECORD','生态证据文件需要有效JSON。',422);}
    if(!Array.isArray(parsed)||parsed.length>500)throw new AppError('ECOSYSTEM_RECORD','生态证据清单需要不超过500条记录。',422);
    return new EcosystemStore(parsed);
  }
  list() {return [...this.relations.values()].map(r=>({id:r.id,capability:r.capability,participants:structuredClone(r.participants),conditions:structuredClone(r.conditions),sourceTitle:r.sourceTitle,sourceUrl:r.sourceUrl,reviewedAt:r.reviewedAt,expiresAt:r.expiresAt,active:Date.parse(r.reviewedAt)<=this.now()&&Date.parse(r.expiresAt)>this.now()}));}
  resolve(input:unknown,knowledge:KnowledgeStore):EcosystemEvidence {
    const parsed=ecosystemRequestSchema.safeParse(input);if(!parsed.success)throw new AppError('ECOSYSTEM_INPUT','请选择二至四款具体设备，填写系统及所需协同能力。',422);
    const request=parsed.data,devices=request.devices.map(d=>knowledge.get(d.productId));
    if(devices.some(d=>d.product.conflicts.length||!d.facts.length))throw new AppError('ECOSYSTEM_PRODUCT','参与设备需要完整且无冲突的产品事实。',422);
    const capabilities:EcosystemEvidence['capabilities']=request.relationIds.map(relationId=>{
      const relation=this.relations.get(relationId);
      if(!relation)return {relationId,capability:'待补充协同能力',status:'unavailable',reasons:['缺少该组合的官方协同证据。']};
      const reasons:string[]=[];let unavailable=false;
      if(Date.parse(relation.reviewedAt)>this.now()||Date.parse(relation.expiresAt)<=this.now()){reasons.push('来源复核日期或有效期需要更新。');unavailable=true;}
      // Exact-set binding prevents a valid two-device relation being presented
      // as a promise covering an added, unverified third device.
      if(relation.participants.length!==request.devices.length||relation.participants.some(p=>!request.devices.some(d=>d.productId===p.productId))){reasons.push('所选设备组合与证据适用范围不同。');unavailable=true;}
      for(const participant of relation.participants){const device=request.devices.find(d=>d.productId===participant.productId);if(device&&!device.system)reasons.push(`请确认${devices.find(d=>d.product.id===participant.productId)?.product.name??participant.role}的系统版本。`);else if(device&&!participant.systems.includes(device.system)){reasons.push(`${participant.role}的系统版本不在已核实清单中。`);unavailable=true;}}
      for(const condition of relation.conditions)if(request.conditions[condition.key]!==condition.value)reasons.push(`请确认${condition.label}：${condition.value}。`);
      return {relationId,capability:relation.capability,status:unavailable?'unavailable':reasons.length?'needs-confirmation':'supported',reasons,relation:structuredClone(relation)};
    });
    return {devices,capabilities,ready:capabilities.every(c=>c.status==='supported'),checkedAt:new Date(this.now()).toISOString()};
  }
}
