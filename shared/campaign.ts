import type { Audit, Platform, Scene } from './types';
export interface CampaignRequest {
  sourceRunId: string; platforms: Platform[]; audience?: string; scene?: Scene; instructions?: string;
}
export interface CampaignItem {
  platform: Platform; status: 'pending' | 'running' | 'generated' | 'failed' | 'cancelled';
  runId?: string; auditStatus?: Audit['status']; releaseReady?: boolean;
  error?: { code: string; message: string };
}
export interface Campaign {
  id: string; sourceRunId: string; createdAt: string; updatedAt: string;
  request: CampaignRequest; engine: 'llm' | 'local-composer';
  status: 'running' | 'complete' | 'partial' | 'failed' | 'cancelled';
  releaseReady: boolean; items: CampaignItem[];
}
