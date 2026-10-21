import type { Product } from '../shared/types';
import { isDemo } from './demo-mode';

/** Display-only thumbnails for the local knowledge base, picked on 2026-10-20 by
 * reviewing every image of each model. The server's cover choice is kept for
 * articles; this only avoids showing chip stickers or lifestyle shots as the
 * model's face in the picker. Products with no full-device shot show no image. */
const reviewed: Record<string, string | null> = {
  ba31be3e28ba81ce: 'ed96016d68695cae', // MateBook 14 鸿蒙版：45°整机，透明底
  '2e36efc687651401': '0eee1e3eb83f7f30', // MateBook 14 酷睿 Ultra：正面整机
  '1932ce9450239b1a': '3742e469590aa862', // MateBook D 14 2024：正面整机
  '3eb01a24674b0828': null, // MateBook D 16 2024：仅有芯片贴纸与示意图
  ae14855fd6143bce: 'd2db9bf3ee67715d', // MateBook D 16 SE：45°整机
  d1c98a04d931418e: '81f9c9aa392d1c84', // MateBook Fold：整机
  ade82cac3e3845a0: 'b7d849c0fdbcc8d7', // MateBook GT 14：黑底双机位
  '3d677e42bc581fe3': '7782277aa86c2d96', // MateBook Pro：暗调棚拍整机
  d1cc06c2e1ce753e: 'f218c422f5f434d3', // MateBook Pro S：正面开盖
  '50fed98e13006bf1': null, // MateBook X Pro 微绒典藏版：仅有人物照
  '89b845fb87a4c142': '9ab134aec1cd114a', // MatePad 11.5 2026：深空灰背面
};
/** Dark-stage friendly hero shots, in order of preference. */
export const HERO_PRODUCTS = ['ba31be3e28ba81ce', '3d677e42bc581fe3', 'ade82cac3e3845a0'];

export function displayCover(product: Product): string | undefined {
  if (isDemo) return product.cover;
  if (!Object.hasOwn(reviewed, product.id)) return product.cover;
  const id = reviewed[product.id];
  return id ? `/api/assets/${id}` : undefined;
}
/** "MateBook 14（鸿蒙版）" wraps badly in narrow cards; show the edition inline. */
export const displayName = (product: Product) => product.shortName.replace(/（(.+?)）/u, ' $1');
