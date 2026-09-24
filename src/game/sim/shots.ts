/**
 * Shot solver. Given a contact point, a landing target, a pace and spin, find
 * the launch angles that land the ball on the target under the full flight
 * model (drag + Magnus) while clearing the net. Execution error is added by
 * the caller afterwards, so misses are physical: long, wide, or in the net.
 */

import { COURT, netHeightAt } from './court';

const G = 9.81;
const R = COURT.BALL_R;
const K_DRAG = (0.5 * 1.21 * 0.55 * Math.PI * R * R) / 0.057;
const K_LIFT = ((0.5 * 1.21 * Math.PI * R * R) / 0.057) * 1.15;
const DT = 1 / 240;

export type ShotKind =
  | 'topspin'
  | 'flat'
  | 'slice'
  | 'lob'
  | 'drop'
  | 'volley'
  | 'smash'
  | 'serveFlat'
  | 'serveSlice'
  | 'serveKick';

export interface Launch {
  vx: number;
  vy: number;
  vz: number;
  wx: number;
  wy: number;
  wz: number;
  speed: number;
  /** Elevation angle (rad). */
  elev: number;
  /** Horizontal direction (rad, atan2(dy, dx)). */
  azim: number;
}

export interface ShotSpec {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  speed: number;
  /** rad/s, positive = topspin, negative = backspin. */
  topspin: number;
  /** rad/s about the vertical; positive curves to the hitter's left. */
  sidespin: number;
  /** Required clearance over the net tape (m). */
  netClear: number;
  /** Solve for a high arc (lobs). */
  high?: boolean;
  minSpeed?: number;
}

interface Landing {
  x: number;
  y: number;
  /** Height above the tape when crossing the net (−Infinity if it never crosses). */
  clear: number;
  apex: number;
  t: number;
}

export function launchVector(
  speed: number,
  elev: number,
  azim: number,
  topspin: number,
  sidespin: number,
): Launch {
  const hx = Math.cos(azim);
  const hy = Math.sin(azim);
  const ce = Math.cos(elev);
  // Topspin axis is ẑ × ĥ; sidespin is about ẑ.
  return {
    vx: speed * ce * hx,
    vy: speed * ce * hy,
    vz: speed * Math.sin(elev),
    wx: -hy * topspin,
    wy: hx * topspin,
    wz: sidespin,
    speed,
    elev,
    azim,
  };
}

/** Fly a launch until it reaches the ground (no net collision, no bounce). */
export function flyToGround(x: number, y: number, z: number, l: Launch): Landing {
  let vx = l.vx;
  let vy = l.vy;
  let vz = l.vz;
  const { wx, wy, wz } = l;
  let clear = -Infinity;
  let apex = z;
  let t = 0;
  const crossesNet = y < 0 !== vy < 0 || y === 0;
  for (let i = 0; i < 2000; i++) {
    const v = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const kd = K_DRAG * v;
    let ax = -kd * vx;
    let ay = -kd * vy;
    let az = -G - kd * vz;
    const w = Math.sqrt(wx * wx + wy * wy + wz * wz);
    if (w > 0.5 && v > 0.05) {
      const cx = wy * vz - wz * vy;
      const cy = wz * vx - wx * vz;
      const cz = wx * vy - wy * vx;
      const cl = Math.sqrt(cx * cx + cy * cy + cz * cz);
      if (cl > 1e-6) {
        const S = (R * w) / v;
        const f = (K_LIFT * (S / (2 * S + 1)) * v * v) / cl;
        ax += cx * f;
        ay += cy * f;
        az += cz * f;
      }
    }
    vx += ax * DT;
    vy += ay * DT;
    vz += az * DT;
    const py = y;
    x += vx * DT;
    y += vy * DT;
    z += vz * DT;
    t += DT;
    if (z > apex) apex = z;
    if (crossesNet && py < 0 !== y < 0) {
      const f = py / (py - y);
      const xc = x - vx * DT * (1 - f);
      const zc = z - vz * DT * (1 - f);
      clear = zc - R - netHeightAt(xc);
    }
    if (z <= R && vz < 0) break;
  }
  return { x, y, clear: crossesNet ? clear : Infinity, apex, t };
}

/** Distance of a landing along the aim direction, and sideways miss. */
function along(spec: ShotSpec, land: Landing, azim: number) {
  const dx = land.x - spec.x;
  const dy = land.y - spec.y;
  const hx = Math.cos(azim);
  const hy = Math.sin(azim);
  return { d: dx * hx + dy * hy, side: -dx * hy + dy * hx };
}

function solveElevation(
  spec: ShotSpec,
  speed: number,
  azim: number,
  dist: number,
): { elev: number; land: Landing } | null {
  const fly = (e: number) =>
    flyToGround(spec.x, spec.y, spec.z, launchVector(speed, e, azim, spec.topspin, spec.sidespin));
  const range = (e: number) => along(spec, fly(e), azim).d;
  const lowE = -0.6;
  // Find the elevation of maximum range (coarse scan), used to split the two branches.
  let bestE = 0.2;
  let bestR = -Infinity;
  for (let e = -0.2; e <= 1.2; e += 0.1) {
    const r = range(e);
    if (r > bestR) {
      bestR = r;
      bestE = e;
    }
  }
  if (bestR < dist) return null;
  let lo: number;
  let hi: number;
  if (spec.high) {
    // Range falls as elevation rises past the max-range angle.
    lo = bestE;
    hi = 1.35;
    if (range(hi) > dist) return { elev: hi, land: fly(hi) };
    for (let k = 0; k < 22; k++) {
      const mid = (lo + hi) / 2;
      if (range(mid) > dist) lo = mid;
      else hi = mid;
    }
  } else {
    lo = lowE;
    hi = bestE;
    if (range(lo) > dist) return null;
    for (let k = 0; k < 22; k++) {
      const mid = (lo + hi) / 2;
      if (range(mid) < dist) lo = mid;
      else hi = mid;
    }
  }
  const elev = (lo + hi) / 2;
  return { elev, land: fly(elev) };
}

/**
 * Solve a shot. Pace is reduced step by step until the ball both reaches the
 * target and clears the net with the requested margin — exactly what a
 * player does when the target is short or the contact point is low.
 */
export function solveShot(spec: ShotSpec): Launch {
  const minSpeed = spec.minSpeed ?? 6;
  let speed = spec.speed;
  let fallback: Launch | null = null;
  let fallbackClear = -Infinity;
  for (let attempt = 0; attempt < 18 && speed >= minSpeed; attempt++) {
    let azim = Math.atan2(spec.ty - spec.y, spec.tx - spec.x);
    const dist = Math.hypot(spec.tx - spec.x, spec.ty - spec.y);
    let sol = solveElevation(spec, speed, azim, dist);
    if (!sol) {
      // Too slow to get there: add pace instead of taking it off.
      if (attempt === 0 && !spec.high) {
        speed *= 1.25;
        continue;
      }
      speed *= 0.9;
      continue;
    }
    // Correct for sideways curve (sidespin, drag asymmetry): two passes.
    for (let k = 0; k < 2 && sol; k++) {
      const a = along(spec, sol.land, azim);
      azim -= Math.atan2(a.side, Math.max(1, a.d));
      sol = solveElevation(spec, speed, azim, dist) ?? sol;
    }
    const launch = launchVector(speed, sol.elev, azim, spec.topspin, spec.sidespin);
    if (sol.land.clear >= spec.netClear) return launch;
    if (sol.land.clear > fallbackClear) {
      fallbackClear = sol.land.clear;
      fallback = launch;
    }
    speed *= 0.92;
  }
  if (fallback) return fallback;
  // Nothing worked: a looping safety ball toward the target.
  const azim = Math.atan2(spec.ty - spec.y, spec.tx - spec.x);
  return launchVector(Math.max(minSpeed, 12), 0.45, azim, spec.topspin * 0.5, 0);
}

/** Perturb a launch: angles in radians, speed as a fraction. */
export function perturb(l: Launch, dElev: number, dAzim: number, dSpeed: number): Launch {
  const hx = Math.cos(l.azim);
  const hy = Math.sin(l.azim);
  // Recover topspin magnitude from the spin vector along ẑ × ĥ.
  const top = -l.wx * hy + l.wy * hx;
  return launchVector(l.speed * (1 + dSpeed), l.elev + dElev, l.azim + dAzim, top, l.wz);
}
