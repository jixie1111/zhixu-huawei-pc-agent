import type { Platform, ProductImage } from './types';

export interface VisualText {
  id:string; heading:string; text:string;
  references:{productId?:string;factId?:string;relationId?:string;sourceUrl:string}[];
  kind:'lead'|'section'|'cta'|'tags'|'conditions';
}
export interface VisualDocument {
  runId:string; version:number; platform:Platform; title:string;
  products:{id:string;name:string}[]; images:ProductImage[];
  blocks:VisualText[]; draft:boolean; engine:'llm'|'local-composer';
  titleReferences:VisualText['references'];
}
export interface VisualPage {
  filename:string; kind:'cover'|'image'|'content'|'conditions'|'poster';
  width:number;height:number;sha256:string;
  imageIds:string[];
  textRanges:{blockId:string;start:number;end:number}[];
}
export interface VisualManifest {
  format:'wuyan-visual-bundle-v1'; runId:string;version:number;platform:Platform;
  draft:boolean;engine:VisualDocument['engine'];createdAt:string;
  title:string;pages:VisualPage[];
  originals:{id:string;productId:string;sourceUrl:string;sha256:string;width:number;height:number;editorial?:ProductImage['editorial']}[];
  content:VisualDocument;
  notes:string[];
}
