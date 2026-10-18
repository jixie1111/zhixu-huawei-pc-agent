export type Platform = 'xiaohongshu' | 'wechat' | 'moments' | 'poster';
export type SourceMode = 'local' | 'ima';
export type Scene = 'school' | 'office' | 'creator' | 'family' | 'business' | 'store' | 'launch' | 'festival';
export interface Brief {
  productId: string; audience: string; scene: Scene; platform: Platform;
  stage: string; goal: string; requirements: string; mode: SourceMode;
  generation?: 'model' | 'rules';
  parentId?: string; revision?: string;
}
export interface Fact {
  id: string; label: string; text: string; sourceTitle: string; sourceUrl: string;
  sourcePath?: string; sourceMode: SourceMode; productId: string; retrievedAt: string;
}
export interface ProductImage {
  id: string; name: string; productId: string; productName: string; url: string;
  sourceUrl: string; description: string; width?: number; height?: number;
  sourceMode: SourceMode; sourceTitle: string; position?: string; reason?: string;
}
export interface Product {
  id: string; name: string; shortName: string; family: string; os: string;
  factCount: number; imageCount: number; cover?: string; conflicts: string[];
}
export interface Evidence {
  product: Product; facts: Fact[]; images: ProductImage[];
  warnings: string[]; trace: { action: string; detail: string; at: string }[];
}
export interface Strategy {
  angle: string; problem: string; priorities: string[]; tone: string;
  structure: string[]; cta: string; imageMin: number; imageMax: number;
  targetLength: string; rationale: string; stage: string; goal: string;
}
export interface Paragraph { heading: string; text: string; factIds: string[] }
export interface Article {
  title: string; lead: string; sections: Paragraph[]; cta: string; tags: string[];
  images: ProductImage[]; disclaimer: string;
}
export interface Finding {
  id: string; category: 'fact' | 'image' | 'compliance' | 'source' | 'platform';
  severity: 'block' | 'warning' | 'info'; message: string; excerpt?: string; suggestion: string;
}
export interface Audit {
  status: 'blocked' | 'review' | 'passed'; findings: Finding[];
  factChecks: { factId: string; label: string; status: 'supported' | 'unverified'; evidence: string }[];
  checkedAt: string; releaseReady: boolean;
}
export interface Run {
  id: string; createdAt: string; updatedAt: string; version: number; parentId?: string;
  brief: Brief; strategy: Strategy; evidence: Evidence; article: Article; audit: Audit;
  engine: 'local-composer' | 'llm'; model?: string; durationMs: number;
  trace: { action: string; detail: string; at: string }[];
}
export interface Settings {
  imaConfigured: boolean; llmConfigured: boolean; accountLabel: string;
  kbName: string; llmBaseUrl: string; llmModel: string; publicDeployment: boolean;
  connected: boolean; connectionCheckedAt?: string; connectionMessage?: string;
}
export interface Bootstrap {
  products: Product[]; stats: { documents: number; images: number; products: number; categories: number };
  settings: Settings; runs: RunSummary[];
}
export type RunSummary = Pick<Run, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'brief' | 'engine' | 'durationMs'> & {
  title: string; status: Audit['status']; releaseReady: boolean; cover?: string;
};
