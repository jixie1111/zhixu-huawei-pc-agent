import type { Audit, Evidence, Platform, ProductImage } from './types';
export interface EcosystemRelation {
  id:string; capability:string; statement:string;
  participants:{productId:string;role:string;systems:string[]}[];
  conditions:{key:string;label:string;value:string}[];
  sourceTitle:string;sourceUrl:string;excerpt:string;
  supportingSources?:{title:string;url:string;excerpt:string}[];
  reviewedAt:string;expiresAt:string;
}
export interface EcosystemRequest {
  devices:{productId:string;system:string}[];
  relationIds:string[];
  conditions:Record<string,string>;
}
export interface EcosystemEvidence {
  devices:Evidence[];
  capabilities:{relationId:string;capability:string;status:'supported'|'needs-confirmation'|'unavailable';reasons:string[];relation?:EcosystemRelation}[];
  ready:boolean; checkedAt:string;
}

/** Multi-device content has its own domain type; it is never disguised as a
 * single-product Run or flattened into the primary product's facts. */
export interface EcosystemBrief {
  selection:EcosystemRequest;
  audience:string; platform:Platform; goal:string; requirements:string;
  generation:'model'; autoRepair:boolean; parentId?:string;
}
export interface ScopedBlock {
  text:string;
  facts:{productId:string;factId:string}[];
  relationIds:string[];
}
export interface EcosystemContent {
  title:ScopedBlock; lead:ScopedBlock;
  sections:{heading:ScopedBlock;body:ScopedBlock}[];
  cta:ScopedBlock; tags:ScopedBlock[];
}
export interface EcosystemArticle extends EcosystemContent {
  images:ProductImage[];
  disclosures:{relationId:string;capability:string;systems:string[];conditions:string[];sourceUrl:string}[];
}
export interface EcosystemPlan {
  angle:string; rationale:string;
  deviceRoles:{productId:string;role:string;factIds:string[]}[];
  relationIds:string[]; structure:string[]; visualDirection:string;
}
export interface EcosystemRun {
  id:string; createdAt:string; updatedAt:string; version:number; parentId?:string;
  brief:EcosystemBrief; plan:EcosystemPlan; evidence:EcosystemEvidence;
  article:EcosystemArticle; audit:Audit; engine:'llm'; model:string;
  evidenceFingerprint:string; durationMs:number;
  repairHistory:{before:EcosystemArticle;after:EcosystemArticle;changedFields:string[];audit:Audit}[];
}
