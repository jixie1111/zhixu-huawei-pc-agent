import type { CampaignItem, Campaign } from './campaign';
import type { Platform } from './types';

export interface EcosystemCampaignRequest {
  sourceRunId:string; platforms:Platform[];
  audience?:string; goal?:string; instructions?:string;
}
export interface EcosystemCampaignRevision {
  audience?:string; goal?:string; instructions:string;
  /** Optional explicit edited versions, each must descend from that platform's
   * prior run. Never silently choose the most recent global work. */
  editedRunIds?:Partial<Record<Platform,string>>;
}
export interface EcosystemCampaign {
  id:string; sourceRunId:string; parentCampaignId?:string;
  createdAt:string; updatedAt:string; request:EcosystemCampaignRequest;
  engine:'llm'; status:Campaign['status']; releaseReady:boolean;
  items:(CampaignItem&{sourceRunId:string})[];
}
