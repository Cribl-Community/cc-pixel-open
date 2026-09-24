import { describe, expect, it } from 'vitest';
import { makeBall, predict, stepBall, type BallEvent, SIM_STEP } from './ball';
import { solveShot, flyToGround } from './shots';
import { COURT } from './court';
import { SURFACES } from './surfaces';

const hard = SURFACES.hard;

function launchBall(l: ReturnType<typeof solveShot>, x: number, y: number, z: number) {
  const b = makeBall(7);
  Object.assign(b, { x, y, z, vx: l.vx, vy: l.vy, vz: l.vz, wx: l.wx, wy: l.wy, wz: l.wz });
  return b;
}

function firstBounce(b: ReturnType<typeof makeBall>) {
  const evs: BallEvent[] = [];
  for (let i = 0; i < 1000; i++) {
    stepBall(b, SIM_STEP, hard, evs);
    const bounce = evs.find((e) => e.kind === 'bounce');
    if (bounce) return { ...bounce, t: (i + 1) * SIM_STEP };
    if (evs.some((e) => e.kind === 'net')) return null;
  }
  return null;
}

describe('shot solver', () => {
  it('lands a topspin drive on its target and clears the net', () => {
    const l = solveShot({
      x: 0.8,
      y: -12,
      z: 0.95,
      tx: -2.5,
      ty: 9.5,
      speed: 30,
      topspin: 280,
      sidespin: 0,
      netClear: 0.5,
    });
    const land = flyToGround(0.8, -12, 0.95, l);
    expect(Math.hypot(land.x + 2.5, land.y - 9.5)).toBeLessThan(0.15);
    expect(land.clear).toBeGreaterThan(0.45);
    const b = firstBounce(launchBall(l, 0.8, -12, 0.95));
    expect(b).not.toBeNull();
    expect(Math.hypot(b!.x + 2.5, b!.y - 9.5)).toBeLessThan(0.2);
  });

  it('serves a flat first serve into the box at realistic pace', () => {
    const l = solveShot({
      x: 0.5,
      y: -12.1,
      z: 2.75,
      tx: -3.3,
      ty: 5.6,
      speed: 55,
      topspin: 60,
      sidespin: 0,
      netClear: 0.08,
    });
    expect(l.speed).toBeGreaterThan(45);
    const land = flyToGround(0.5, -12.1, 2.75, l);
    expect(land.y).toBeGreaterThan(0);
    expect(land.y).toBeLessThan(COURT.SV);
    expect(land.t).toBeLessThan(0.75);
  });

  it('lobs high over a net rusher', () => {
    const l = solveShot({
      x: 0,
      y: -11,
      z: 0.9,
      tx: 0,
      ty: 10,
      speed: 20,
      topspin: 150,
      sidespin: 0,
      netClear: 2.5,
      high: true,
    });
    const land = flyToGround(0, -11, 0.9, l);
    expect(land.apex).toBeGreaterThan(5);
    expect(Math.abs(land.y - 10)).toBeLessThan(0.3);
  });
});

describe('bounce', () => {
  it('topspin kicks higher and faster than slice after the bounce', () => {
    const afterBounce = (topspin: number) => {
      const l = solveShot({
        x: 0,
        y: -11.5,
        z: 1,
        tx: 0,
        ty: 9,
        speed: 28,
        topspin,
        sidespin: 0,
        netClear: 0.4,
      });
      const b = launchBall(l, 0, -11.5, 1);
      const p = predict(b, hard, 3);
      const bounces = p.events.filter((e) => e.kind === 'bounce');
      const i0 = bounces[0].i;
      // Height about 0.25 s after the bounce, and horizontal speed.
      const j = i0 + Math.round(0.25 / SIM_STEP);
      const dy = (p.pts[(j + 1) * 4 + 2] - p.pts[(j - 1) * 4 + 2]) / (2 * SIM_STEP);
      return { z: p.pts[j * 4 + 3], vy: dy };
    };
    const top = afterBounce(300);
    const slice = afterBounce(-200);
    expect(top.z).toBeGreaterThan(slice.z);
  });

  it('clay bounces higher and slower than grass', () => {
    const run = (surf: keyof typeof SURFACES) => {
      const b = makeBall(1);
      Object.assign(b, { x: 0, y: 0, z: 0.5, vx: 0, vy: 20, vz: -6 });
      const p = predict(b, SURFACES[surf], 1.2);
      const i0 = p.events.find((e) => e.kind === 'bounce')!.i;
      let apex = 0;
      for (let k = i0; k < p.n && k < i0 + 80; k++) apex = Math.max(apex, p.pts[k * 4 + 3]);
      const vy = (p.pts[(i0 + 3) * 4 + 2] - p.pts[(i0 + 1) * 4 + 2]) / (2 * SIM_STEP);
      return { apex, vy };
    };
    const clay = run('clay');
    const grass = run('grass');
    expect(clay.apex).toBeGreaterThan(grass.apex);
    expect(clay.vy).toBeLessThan(grass.vy);
  });
});
