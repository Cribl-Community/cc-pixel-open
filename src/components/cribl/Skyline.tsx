import { useEffect, useRef } from 'react';
import { paintSkyline } from '../../game/art/skyline';
import { usePixelViewport } from '../../hooks/usePixelViewport';

/** The animated Chicago skyline over the CriblCon landing. */
export function Skyline({ className }: { className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const vp = usePixelViewport(box, { minW: 320, minH: 96, maxW: 720, maxH: 220 });

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!vp || !ctx) return;
    const img = ctx.createImageData(vp.W, vp.H);
    const buf = new Uint32Array(img.data.buffer);
    const t0 = performance.now();
    let last = -Infinity;
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      // Twelve frames a second is plenty for twinkling windows and drifting aurora.
      if (now - last < 80) return;
      last = now;
      paintSkyline(buf, vp.W, vp.H, (now - t0) / 1000);
      ctx.putImageData(img, 0, 0);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [vp]);

  return (
    <div ref={box} className={className} aria-hidden>
      {vp && (
        <canvas
          ref={canvas}
          width={vp.W}
          height={vp.H}
          className="pixelated mx-auto block"
          style={{ width: vp.cssW, height: vp.cssH }}
        />
      )}
    </div>
  );
}
