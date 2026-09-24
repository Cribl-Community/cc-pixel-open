import { useEffect, useRef } from 'react';
import { PortraitPainter } from '../../game/render/portrait';
import { locomotionPose, strokePose, type StrokeKind } from '../../game/art/playerRig';
import type { PlayerDef } from '../../game/sim/roster';
import { goatify } from '../../game/art/goat';
import { useGame } from '../../game/state/store';

const DEMO: StrokeKind[] = ['fh', 'serve', 'fh', 'bh2'];

/**
 * A live, rasterized player portrait. `active` cycles through strokes;
 * otherwise the player bounces in the ready position.
 */
export function PlayerPortrait({
  player,
  active = false,
  w = 56,
  h = 74,
  scale = 29,
  zoom = 2,
  className,
}: {
  player: PlayerDef;
  active?: boolean;
  w?: number;
  h?: number;
  scale?: number;
  zoom?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const goats = useGame((s) => s.settings.goats);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const painter = new PortraitPainter(w, h, goats ? goatify(player.look) : player.look, scale);
    const lefty = player.hand === 'L';
    const t0 = performance.now() - Math.random() * 1000;
    let raf = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      const time = (performance.now() - t0) / 1000;
      const legs = locomotionPose({ time, phase: 0, speed: 0, dx: 0, dy: 0, mode: 'ready' });
      let pose = legs;
      if (active) {
        const cycle = 1.9;
        const k = Math.floor(time / cycle) % DEMO.length;
        let stroke = DEMO[k];
        if (stroke === 'bh2' && player.backhand === 1) stroke = 'bh1';
        const t = (time % cycle) / cycle;
        pose = t < 0.85 ? strokePose(stroke, t / 0.85, legs) : legs;
      }
      painter.draw(ctx, pose, lefty);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [player, active, w, h, scale, goats]);
  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      className={`pixelated ${className ?? ''}`}
      style={{ width: w * zoom, height: h * zoom }}
      aria-label={player.name}
    />
  );
}
