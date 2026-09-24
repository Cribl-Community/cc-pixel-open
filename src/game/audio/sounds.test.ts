import { describe, expect, it } from 'vitest';
import {
  synthApplause,
  synthBleat,
  synthBounce,
  synthCicadas,
  synthCord,
  synthGrunt,
  synthGull,
  synthNet,
  synthPlane,
  synthRacket,
  synthShush,
  synthSlide,
  synthSqueak,
  synthStep,
  synthSwing,
} from './sounds';

const SR = 44100;

function check(buf: Float32Array) {
  let peak = 0;
  let energy = 0;
  for (let i = 0; i < buf.length; i++) {
    expect(Number.isFinite(buf[i])).toBe(true);
    peak = Math.max(peak, Math.abs(buf[i]));
    energy += buf[i] * buf[i];
  }
  expect(peak).toBeGreaterThan(0.05);
  expect(peak).toBeLessThanOrEqual(1);
  expect(energy).toBeGreaterThan(0);
}

describe('synthesized sounds', () => {
  it('racket hits of every kind', () => {
    for (const k of ['drive', 'slice', 'serve', 'volley', 'frame', 'smash'] as const)
      check(synthRacket(SR, k));
  });
  it('bounces and footsteps on every surface', () => {
    for (const k of ['hard', 'clay', 'grass', 'indoor'] as const) {
      check(synthBounce(SR, k));
      check(synthStep(SR, k));
    }
  });
  it('net, cord, squeaks, slides, swings and grunts', () => {
    check(synthNet(SR));
    check(synthCord(SR));
    check(synthSqueak(SR));
    check(synthSlide(SR));
    check(synthSwing(SR));
    check(synthGrunt(SR, 120, 0.8));
    check(synthGrunt(SR, 230, 0.3));
    check(synthBleat(SR, 120, 0.9));
    check(synthBleat(SR, 230, 0.3));
  });
  it('crowd and ambience', () => {
    const [l, r] = synthApplause(SR, 2, 60);
    check(l);
    check(r);
    check(synthShush(SR)[0]);
    check(synthGull(SR));
    check(synthCicadas(SR));
    check(synthPlane(SR));
  });
});
