import { useEffect, useRef } from 'react';

/** Follow a newly rendered workflow step once, never its live timer updates. */
export function useStepScroll<T extends HTMLElement>(step: string | boolean | null | undefined) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!step) return;
    const frame = requestAnimationFrame(() => {
      ref.current?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        block: 'start',
        inline: 'nearest',
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [step]);
  return ref;
}
