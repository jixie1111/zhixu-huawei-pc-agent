import type { Article, Audit } from '../shared/types';
import { imageType } from './network';

export interface ImageReader { asset?(id:string,signal?:AbortSignal):Promise<{body:Buffer;type:string}|undefined> }

/** Metadata alignment alone does not establish that a usable original image exists. */
export async function verifyImageAvailability(article:Article,audit:Audit,reader:ImageReader,signal?:AbortSignal):Promise<number> {
  let verified=0;
  for(const image of article.images) {
    signal?.throwIfAborted();
    try {
      if(!reader.asset)throw new Error('No image transport');
      const result=await reader.asset(image.id,signal);
      signal?.throwIfAborted();
      const actual=result?imageType(result.body):'';
      if(!result||!actual||actual!==result.type)throw new Error('Invalid original image');
      if(actual==='image/png') {
        if(image.width&&result.body.readUInt32BE(16)!==image.width)throw new Error('Width differs from index');
        if(image.height&&result.body.readUInt32BE(20)!==image.height)throw new Error('Height differs from index');
      }
      verified++;
    } catch(error) {
      signal?.throwIfAborted();
      audit.findings.push({id:`image-unavailable-${image.id}`,category:'image',severity:'block',message:'原始配图无法读取，或其文件签名/尺寸与来源索引不一致。',excerpt:image.name,suggestion:'重新检索并核对原图；图片索引存在不能代替原图可用性核验。'});
      audit.status='blocked';audit.releaseReady=false;
    }
  }
  return verified;
}
