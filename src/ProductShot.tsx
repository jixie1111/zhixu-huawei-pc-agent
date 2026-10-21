import { useState, type ImgHTMLAttributes } from 'react';
import { SafeImage } from './components';

/** Product photo that adapts to its own backdrop. Knowledge-base covers mix
 * transparent PNGs with white-studio JPGs; a white rectangle floating on the dark
 * stage looks broken, so light-backed photos get a light display plinth instead. */
export function ProductShot({ className = '', ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [backdrop, setBackdrop] = useState<'clear' | 'light' | 'dark'>('clear');
  function inspect(img: HTMLImageElement) {
    try {
      const w = img.naturalWidth, h = img.naturalHeight; if (!w || !h) return;
      const canvas = document.createElement('canvas'); canvas.width = 24; canvas.height = 24;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); if (!ctx) return;
      ctx.drawImage(img, 0, 0, 24, 24);
      const corners = [[1, 1], [22, 1], [1, 22], [22, 22]].map(([x, y]) => ctx.getImageData(x, y, 1, 1).data);
      const opaque = corners.filter(c => c[3] > 200);
      if (opaque.length < 3) { setBackdrop('clear'); return; }
      const light = opaque.filter(c => (c[0] + c[1] + c[2]) / 3 > 200).length;
      setBackdrop(light >= 3 ? 'light' : 'dark');
    } catch { /* blob images are same-origin; keep the default on any canvas failure */ }
  }
  return <span className={`product-shot on-${backdrop} ${className}`}><SafeImage {...props} onLoad={event => { inspect(event.currentTarget); props.onLoad?.(event); }} /></span>;
}
