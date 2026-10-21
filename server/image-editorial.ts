import { createHash } from 'node:crypto';
import type { ProductImage } from '../shared/types';

// Visual inspection of the eight existing MateBook 14 Ultra source assets.
// Match exact bytes AND product, never infer identity or capabilities from names.
const productId='2e36efc687651401';
const records:Record<string,{role:NonNullable<ProductImage['editorial']>['role'];caption:string;note:string}>={
  fbbaed8b92725dfc7873783c40d458321ec9c88f4e4946bee7f93a122712651c:{role:'screen-demo',caption:'屏幕演示画面',note:'仅有森林演示画面，没有产品机身；不作产品封面，不由画面推断屏幕性能。'},
  '8c943ab29658ddaf3dbdcafccc656c66d5c6a3216cdbdf221724334c8f37ade5':{role:'screen-demo',caption:'屏幕演示画面',note:'仅有森林演示画面，没有产品机身；不作产品封面，不由画面推断屏幕性能。'},
  '3c1145f841caab0c3b13aef08a825cffb8c36d8d59b8935bc4269639c06485da':{role:'product-view',caption:'正面整机原图',note:'正面屏幕和机身原图；可作产品封面，显示画面仅为示意。'},
  eee2123a29badc715f9be786d9e3ce9f418ac5daedd7f82a229040402d7cdb86:{role:'screen-demo',caption:'屏幕演示画面',note:'仅有建筑风景画面，没有产品机身；不作产品封面，不作为产品实拍或功能证明。'},
  '1287e5a6d1d6fd75e79f2dc4ca19c83e0436253e53b9c11f178be023c2d38981':{role:'product-view',caption:'绿色整机主视觉',note:'绿色产品整机主视觉，可作封面；保留原图文字和产品外观。'},
  '36b36120c6d3d390d1c2f5465830695fc90d4b99c06074fc94b9ea688d4436da':{role:'product-view',caption:'绿色整机主视觉',note:'绿色产品整机主视觉，可作封面；保留原图文字和产品外观。'},
  '58fc4d2b72b827ea9a6942315067b0e2d3f8a5c908c40bfd0c1c6303e325cb24':{role:'detail',caption:'屏幕与机身局部',note:'屏幕与机身局部，画面有手写笔；不据此承诺配件包含、兼容性或书写效果。'},
  '42fe5f2856ddddf71d2099e9d2a43a53e100c08ead52d63b7a616a31276bba29':{role:'detail',caption:'屏幕与键盘局部',note:'屏幕、手写笔与键盘局部，非独立键盘特写；不据此推断配件、舒适度或功能。'},
};
export function reviewedImage(image:Pick<ProductImage,'productId'>,body:Buffer):ProductImage['editorial'] {
  if(image.productId!==productId)return undefined;
  const sha256=createHash('sha256').update(body).digest('hex'),record=records[sha256];
  return record?{...record,sha256,reviewedAt:'2026-10-19',basis:'visual-review'}:undefined;
}
/** Preserve source wording as provenance, never turn it into a performance claim. */
export function imageDescription(sourceDescription:string,editorial:ProductImage['editorial']):Pick<ProductImage,'description'|'sourceDescription'> {
  return editorial?.caption?{description:editorial.caption,sourceDescription}:{description:sourceDescription};
}
export function coverPreference(image:ProductImage){
  return image.editorial?.role==='product-view'?3:image.editorial?.role==='screen-demo'?-1:image.editorial?.role==='detail'?0:1;
}
