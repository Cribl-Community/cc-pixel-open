import { useLayoutEffect, useState, type RefObject } from 'react';

export interface PixelViewport {
  /** Logical (game) resolution. */
  W: number;
  H: number;
  /** Device pixels per game pixel (always an integer). */
  scale: number;
  /** CSS size of the canvas element. */
  cssW: number;
  cssH: number;
}

/**
 * Picks the largest integer scale (in *device* pixels) that fits the
 * container, then widens/heightens the logical canvas to fill the rest —
 * crisp pixels on every screen, no letterboxing on wide monitors.
 */
export function usePixelViewport(
  ref: RefObject<HTMLElement | null>,
  opts: { minW: number; minH: number; maxW: number; maxH: number },
): PixelViewport | null {
  const [vp, setVp] = useState<PixelViewport | null>(null);
  const { minW, minH, maxW, maxH } = opts;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const compute = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return;
      const dpr = window.devicePixelRatio || 1;
      const devW = Math.floor(r.width * dpr);
      const devH = Math.floor(r.height * dpr);
      const scale = Math.max(1, Math.floor(Math.min(devW / minW, devH / minH)));
      const W = Math.max(minW, Math.min(maxW, Math.floor(devW / scale)));
      const H = Math.max(minH, Math.min(maxH, Math.floor(devH / scale)));
      const next = { W, H, scale, cssW: (W * scale) / dpr, cssH: (H * scale) / dpr };
      setVp((prev) =>
        prev &&
        prev.W === next.W &&
        prev.H === next.H &&
        prev.scale === next.scale &&
        prev.cssW === next.cssW
          ? prev
          : next,
      );
    };
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    compute();
    return () => ro.disconnect();
  }, [ref, minW, minH, maxW, maxH]);

  return vp;
}
