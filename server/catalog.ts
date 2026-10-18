import type { Product } from '../shared/types';
import { createHash } from 'node:crypto';

// Public model names only. No private facts, images, prices or KB IDs are bundled.
// IDs are stable across local imports and source-only deployment.
const models = [
  ['HUAWEI MateBook 14（鸿蒙版）','鸿蒙电脑'],
  ['HUAWEI MateBook 14 酷睿 Ultra','Windows 电脑'],
  ['HUAWEI MateBook D 14 2024','Windows 电脑'],
  ['HUAWEI MateBook D 16 2024','Windows 电脑'],
  ['HUAWEI MateBook D 16 SE 版 2024','Windows 电脑'],
  ['HUAWEI MateBook Fold 非凡大师','鸿蒙电脑'],
  ['HUAWEI MateBook GT 14','Windows 电脑'],
  ['HUAWEI MateBook Pro','鸿蒙电脑'],
  ['HUAWEI MateBook Pro S','鸿蒙电脑'],
  ['HUAWEI MateBook X Pro 酷睿 Ultra 微绒典藏版','Windows 电脑'],
];
export const publicCatalog:Product[]=models.map(([name,family])=>({id:createHash('sha256').update(name).digest('hex').slice(0,16),name,shortName:name.replace(/^HUAWEI /,''),family,os:'待 ima 取证',factCount:0,imageCount:0,conflicts:[]}));
