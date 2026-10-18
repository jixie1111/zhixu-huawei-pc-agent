import type { ProductImage } from './types';

export type ImageSlot = 'cover' | 'end' | number;

/** A paragraph number is one-based, matching the labels shown to the writer. */
export function imageSlot(position: string | undefined, sectionCount: number): ImageSlot | undefined {
  const value = (position || '').normalize('NFKC').replace(/\s+/g, '');
  if (/^(?:封面|封面主视觉|主视觉|正文前)$/.test(value)) return 'cover';
  if (/^(?:文末|正文后|结尾)$/.test(value)) return 'end';
  const paragraph = /^第(\d+)段后$/.exec(value);
  if (paragraph && Number(paragraph[1]) >= 1 && Number(paragraph[1]) <= sectionCount) return Number(paragraph[1]);
  return undefined;
}

/** Never drop extra or unrecognised images; unknown placement stays visible at the end. */
export function planImagePlacement(images: ProductImage[], sectionCount: number) {
  const layout: { cover: ProductImage[]; after: ProductImage[][]; end: ProductImage[] } = {
    cover: [], after: Array.from({ length: sectionCount }, () => []), end: [],
  };
  for (const image of images) {
    const slot = imageSlot(image.position, sectionCount);
    if (slot === 'cover') layout.cover.push(image);
    else if (typeof slot === 'number') layout.after[slot - 1].push(image);
    else layout.end.push(image);
  }
  return layout;
}
