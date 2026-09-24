/**
 * The Chicago skyline at night for the CriblCon landing: Willis Tower,
 * Trump Tower, the Aon Center and the Hancock under a magic sky with an
 * aurora of Cribl teal, a crescent moon, stars and lit windows. Painted per
 * pixel into a packed buffer like everything else, and animated by `t`.
 */

import { pack } from '../core/color';
import { hash2, makeRng } from '../core/rng';
import { mixPacked } from '../render/frame';
import { CRIBL } from './cribl';

interface Tower {
  /** Center and width as fractions of the width; height as a fraction of the height. */
  x: number;
  w: number;
  h: number;
  kind: 'plain' | 'willis' | 'hancock' | 'spire';
}

function towers(seed: number): Tower[] {
  const rng = makeRng(seed * 13 + 404);
  const out: Tower[] = [];
  for (let x = -0.02; x < 1.02;) {
    const w = 0.018 + rng() * 0.035;
    out.push({ x: x + w / 2, w, h: 0.14 + rng() * rng() * 0.36, kind: 'plain' });
    x += w + rng() * 0.006;
  }
  // Landmarks in front of the fill.
  out.push(
    { x: 0.5, w: 0.05, h: 0.6, kind: 'plain' },
    { x: 0.31, w: 0.066, h: 0.74, kind: 'willis' },
    { x: 0.575, w: 0.042, h: 0.64, kind: 'spire' },
    { x: 0.735, w: 0.06, h: 0.68, kind: 'hancock' },
  );
  return out;
}

function inTower(t: Tower, u: number, v: number): boolean {
  // u: horizontal fraction, v: height fraction above the bottom.
  const dx = Math.abs(u - t.x);
  const hw = t.w / 2;
  switch (t.kind) {
    case 'willis':
      if (Math.abs(dx - t.w * 0.16) < 0.0035 && v < t.h + 0.13) return true;
      if (dx > hw) return false;
      return v < (dx > hw * 0.62 ? t.h * 0.62 : dx > hw * 0.3 ? t.h * 0.82 : t.h);
    case 'hancock': {
      if (Math.abs(dx - t.w * 0.18) < 0.003 && v < t.h + 0.1) return true;
      const half = hw * (1 - (0.34 * Math.min(v, t.h)) / t.h);
      return dx < half && v < t.h;
    }
    case 'spire':
      if (dx < 0.003 && v < t.h + 0.16) return true;
      if (dx > hw) return false;
      return v < (dx > hw * 0.55 ? t.h * 0.72 : dx > hw * 0.25 ? t.h * 0.88 : t.h);
    default:
      return dx < hw && v < t.h;
  }
}

export function paintSkyline(buf: Uint32Array, W: number, H: number, t: number, seed = 26) {
  const list = towers(seed);
  const top = pack(CRIBL.navy);
  const mid = pack('#16205a');
  const glow = pack(CRIBL.teal600);
  const glow2 = pack(CRIBL.teal500);
  const aurora = pack(CRIBL.teal);
  const violet = pack(CRIBL.purple);
  const star = pack(CRIBL.white);
  const starDim = pack(CRIBL.tealLight);
  const moon = pack('#f4f0e2');
  const tower = pack('#041626');
  const rim = pack('#0b3a4e');
  const windows = ['#ffd98a', '#ffd98a', '#ffe6b0', CRIBL.teal, CRIBL.lavender].map((c) => pack(c));
  const mx = Math.round(W * 0.88);
  const my = Math.round(H * 0.2);
  const mr = Math.max(3, Math.round(H * 0.07));
  for (let y = 0; y < H; y++) {
    const v = 1 - (y + 0.5) / H;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      let c = 0;
      // The skyline, front-most tower first.
      for (let i = list.length - 1; i >= 0; i--) {
        const tw = list[i];
        if (Math.abs(u - tw.x) > tw.w / 2 + 0.005 || !inTower(tw, u, v)) continue;
        const lit =
          (x & 1) === 0 &&
          (y & 1) === 0 &&
          v > 0.04 &&
          hash2(x, y, seed + 21) < 0.34 &&
          // Now and then a window switches off and on.
          Math.sin(t * 0.7 + hash2(y, x, seed) * 40) > -0.85;
        c = lit
          ? windows[Math.floor(hash2(y, x, seed + 5) * windows.length)]
          : u > tw.x + tw.w * 0.36
            ? rim
            : tower;
        break;
      }
      if (!c) {
        // Night at the top, violet, then a teal glow over the city.
        c =
          v > 0.55
            ? mixPacked(mid, top, (v - 0.55) / 0.45)
            : v > 0.2
              ? mixPacked(glow, mid, (v - 0.2) / 0.35)
              : mixPacked(glow2, glow, v / 0.2);
        // Two ribbons of aurora drifting across.
        const r1 = 0.62 + Math.sin(u * 7 + t * 0.35) * 0.07 + Math.sin(u * 19 - t * 0.6) * 0.015;
        const d1 = Math.abs(v - r1);
        if (d1 < 0.06) c = mixPacked(c, aurora, 0.32 * (1 - d1 / 0.06));
        const r2 = 0.45 + Math.sin(u * 5 - t * 0.25 + 2) * 0.05;
        const d2 = Math.abs(v - r2);
        if (d2 < 0.035) c = mixPacked(c, violet, 0.22 * (1 - d2 / 0.035));
        // A crescent moon.
        const dm = Math.hypot(x - mx, y - my);
        if (dm < mr && Math.hypot(x - mx - mr * 0.45, y - my + mr * 0.2) > mr * 0.85) c = moon;
        else if (v > 0.3) {
          const h = hash2(x, y, seed + 77);
          const twinkle = Math.sin(t * 3 + h * 90) > 0.2;
          if (h > 0.994 && twinkle) c = star;
          else if (h > 0.986) c = mixPacked(c, starDim, 0.55);
        }
      }
      buf[y * W + x] = c;
    }
  }
  // Magic sparks rising over the skyline.
  for (let i = 0; i < 18; i++) {
    const a = (i * 0.6180339887) % 1;
    const b = (i * 0.7548776662) % 1;
    const period = 5 + b * 5;
    const k = ((t + a * period) % period) / period;
    const x = Math.round(a * W + Math.sin(t + i) * 3);
    const y = Math.round(H * (0.95 - k * 0.9));
    if (Math.sin(t * 4 + i * 1.7) < -0.3) continue;
    const c = [aurora, star, violet][i % 3];
    const set = (px: number, py: number, col: number) => {
      if (px >= 0 && py >= 0 && px < W && py < H) buf[py * W + px] = col;
    };
    set(x, y, c);
    if (Math.sin(t * 4 + i * 1.7) > 0.7) {
      set(x - 1, y, c);
      set(x + 1, y, c);
      set(x, y - 1, c);
      set(x, y + 1, c);
    }
  }
}
