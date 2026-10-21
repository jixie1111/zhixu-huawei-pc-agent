import type { Brief } from './types';

export type DirectorEngine = 'model' | 'rules';
export type IntentFieldName = 'productId' | 'audience' | 'scene' | 'platform' | 'stage' | 'goal' | 'requirements';
export interface IntentField {
  field: IntentFieldName;
  value: string | null;
  origin: 'user' | 'inferred' | 'needs-confirmation';
  reason: string;
}
export interface IntentProposal {
  id: string;
  engine: DirectorEngine;
  engineLabel: string;
  message: string;
  summary: string;
  fields: IntentField[];
  suggestedBrief: Partial<Brief>;
  questions: { field: IntentFieldName; question: string; options?: { value: string; label: string }[] }[];
  warnings: string[];
  recommendations?: ProductSuggestion[];
  followUp?: { key:'focus'; question:string; options:{value:string;label:string}[] };
}
export interface ProductSuggestion {
  productId:string; name:string; reason:string;
  facts:{id:string;label:string;text:string;sourceTitle:string;sourceUrl:string}[];
}
export interface CreativeConcept {
  id: string;
  name: string;
  angle: string;
  problem: string;
  factIds: string[];
  structure: string[];
  visualDirection: string;
  tone: string;
  cta: string;
  reason: string;
}
export interface CreativePlan {
  id: string;
  engine: DirectorEngine;
  engineLabel: string;
  createdAt: string;
  expiresAt: string;
  brief: Brief;
  product: { id: string; name: string };
  factIds: string[];
  concepts: CreativeConcept[];
  recommendedConceptId: string;
  reason: string;
  warnings: string[];
  originality?: {
    scope:'local-history'; comparedRunIds:string[]; retryCount:number;
    checks:{conceptId:string;similar:boolean;closestRunId?:string;similarity:number}[];
    method:'angle-structure-bigram-v1';
  };
}
export interface DirectorDecision {
  planId: string;
  conceptId: string;
  engine: DirectorEngine;
  conceptName: string;
  angle: string;
  factIds: string[];
  visualDirection: string;
  reason: string;
  plannedAt: string;
}
