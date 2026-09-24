/**
 * Tennis ball flight and bounce physics.
 *
 * In flight: gravity, quadratic drag and Magnus lift from spin
 * (C_L = S / (2S + 1), S = rω / v, after Watts & Ferrer).
 * At the bounce: the ball slides on the court with Coulomb friction until its
 * contact point stops slipping (it "grips"), which is what makes topspin kick
 * through, slice skid, and clay play slower than grass (Cross, 2005).
 *
 * Everything is deterministic (net cords draw from a seeded hash), so the
 * trajectory predicted when a shot is struck is exactly the one it follows.
 */

import { hash2 } from '../core/rng';
import { ARENA, COURT, netHeightAt } from './court';

const M = 0.057;
const R = COURT.BALL_R;
const AREA = Math.PI * R * R;
const RHO = 1.21;
const CD = 0.55;
/** Moment of inertia over m·r² for a pressurized ball. */
const ALPHA = 0.55;
const G = 9.81;
/** A little extra Magnus so spin reads clearly on a small screen. */
const MAGNUS_GAIN = 1.15;
const K_DRAG = (0.5 * RHO * CD * AREA) / M;
const K_LIFT = ((0.5 * RHO * AREA) / M) * MAGNUS_GAIN;
/** Spin slowly decays in flight (seconds). */
const SPIN_DECAY = 7;

/** Physics substep (s). The game advances in multiples of this. */
export const SUBSTEP = 1 / 240;
export const SIM_STEP = 1 / 120;

export interface Surface {
  /** Vertical coefficient of restitution. */
  e: number;
  /** Sliding friction coefficient between ball and court. */
  mu: number;
}

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Spin, rad/s. */
  wx: number;
  wy: number;
  wz: number;
  /** Seed for net-cord randomness. */
  seed: number;
  /** Event counter, keeps net cords deterministic. */
  n: number;
  /** Resting on the ground. */
  rest: boolean;
}

export type BallEventKind = 'bounce' | 'net' | 'cord' | 'wall';

export interface BallEvent {
  kind: BallEventKind;
  x: number;
  y: number;
  z: number;
  /** Impact speed, m/s. */
  speed: number;
}

export function makeBall(seed = 1): Ball {
  return { x: 0, y: 0, z: 1, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, seed, n: 0, rest: false };
}

export const cloneBall = (b: Ball): Ball => ({ ...b });

export const ballSpeed = (b: Ball) => Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);

/** Advance by `dt` (a multiple of SUBSTEP), appending any impacts to `events`. */
export function stepBall(b: Ball, dt: number, surf: Surface, events?: BallEvent[]) {
  let left = dt;
  while (left > 1e-9) {
    const h = Math.min(SUBSTEP, left);
    integrate(b, h, surf, events);
    left -= h;
  }
}

function integrate(b: Ball, h: number, surf: Surface, events?: BallEvent[]) {
  if (b.rest) {
    // Rolling to a stop.
    const k = Math.max(0, 1 - 0.9 * h);
    b.vx *= k;
    b.vy *= k;
    b.x += b.vx * h;
    b.y += b.vy * h;
    walls(b, events);
    return;
  }
  const v = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
  let ax = 0;
  let ay = 0;
  let az = -G;
  if (v > 0.05) {
    const kd = K_DRAG * v;
    ax -= kd * b.vx;
    ay -= kd * b.vy;
    az -= kd * b.vz;
    const w = Math.sqrt(b.wx * b.wx + b.wy * b.wy + b.wz * b.wz);
    if (w > 0.5) {
      // ω × v
      const cx = b.wy * b.vz - b.wz * b.vy;
      const cy = b.wz * b.vx - b.wx * b.vz;
      const cz = b.wx * b.vy - b.wy * b.vx;
      const cl = Math.sqrt(cx * cx + cy * cy + cz * cz);
      if (cl > 1e-6) {
        const S = (R * w) / v;
        const CL = S / (2 * S + 1);
        const f = (K_LIFT * CL * v * v) / cl;
        ax += cx * f;
        ay += cy * f;
        az += cz * f;
      }
    }
  }
  b.vx += ax * h;
  b.vy += ay * h;
  b.vz += az * h;
  const py = b.y;
  b.x += b.vx * h;
  b.y += b.vy * h;
  b.z += b.vz * h;
  const decay = 1 - h / SPIN_DECAY;
  b.wx *= decay;
  b.wy *= decay;
  b.wz *= decay;

  // Net: detect crossing the plane y = 0 inside the posts.
  if (py < 0 !== b.y < 0 && py !== b.y) {
    const f = py / (py - b.y);
    const xc = b.x - b.vx * h * (1 - f);
    const zc = b.z - b.vz * h * (1 - f);
    if (Math.abs(xc) <= COURT.POST_X + R) {
      const top = netHeightAt(xc);
      if (zc - R < top) netHit(b, py, xc, zc, top, events);
    }
  }

  // Ground.
  if (b.z < R && b.vz < 0) bounce(b, surf, events);
  walls(b, events);
}

function rand(b: Ball) {
  b.n++;
  return hash2(b.seed, b.n, 911);
}

function netHit(b: Ball, py: number, xc: number, zc: number, top: number, events?: BallEvent[]) {
  const from = py < 0 ? -1 : 1;
  const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
  // How much of the ball overlaps the tape: 0 = grazed the top, 1 = hit squarely.
  const overlap = (top - (zc - R)) / (2 * R);
  if (overlap < 1) {
    // Net cord. A graze barely deflects the ball; the more squarely it meets
    // the tape, the more pace it loses and the higher it pops (sometimes
    // straight back).
    const o = Math.max(0, overlap);
    const r1 = rand(b);
    const r2 = rand(b);
    const keep = (0.92 - 0.8 * o) * (0.85 + r1 * 0.3);
    b.vy *= o > 0.55 && r1 < 0.3 ? -0.12 : keep;
    b.vx *= 0.95 - 0.8 * o;
    b.vz = b.vz * (1 - o) + (0.25 + 2.4 * o) * (0.5 + r2 * 0.7);
    const spinKeep = 0.9 - 0.7 * o;
    b.wx *= spinKeep;
    b.wy *= spinKeep;
    b.wz *= spinKeep;
    b.x = xc;
    b.z = Math.max(zc, top + R);
    // Continue on whichever side the ball is now heading.
    b.y = b.vy * from > 0 ? from * 0.02 : -from * 0.02;
    events?.push({ kind: 'cord', x: xc, y: 0, z: zc, speed });
  } else {
    // Into the mesh: it dies and drops on the hitter's side.
    b.vy = -b.vy * 0.08;
    b.vx *= 0.25;
    b.vz = Math.min(b.vz, 0) * 0.3;
    b.wx = b.wy = b.wz = 0;
    b.x = xc;
    b.y = from * (R + 0.02);
    b.z = zc;
    events?.push({ kind: 'net', x: xc, y: 0, z: zc, speed });
  }
}

function bounce(b: Ball, surf: Surface, events?: BallEvent[]) {
  const vzIn = -b.vz;
  const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
  b.z = R;
  // Normal impulse per unit mass.
  const e = Math.max(0.5, Math.min(0.9, surf.e - 0.0035 * vzIn));
  const jn = (1 + e) * vzIn;
  // Slip velocity of the contact point: v − r(ω × ẑ).
  const sx = b.vx - R * b.wy;
  const sy = b.vy + R * b.wx;
  const slip = Math.sqrt(sx * sx + sy * sy);
  if (slip > 1e-5) {
    const jGrip = slip / (1 + 1 / ALPHA);
    const jf = Math.min(surf.mu * jn, jGrip);
    const dx = sx / slip;
    const dy = sy / slip;
    b.vx -= jf * dx;
    b.vy -= jf * dy;
    const k = jf / (ALPHA * R);
    b.wx -= k * dy;
    b.wy += k * dx;
  }
  // Sidespin survives, a bit weakened.
  b.wz *= 0.7;
  b.vz = e * vzIn;
  if (b.vz < 0.35) {
    b.vz = 0;
    b.rest = true;
  }
  events?.push({ kind: 'bounce', x: b.x, y: b.y, z: 0, speed: vzIn + speed * 0.15 });
}

function walls(b: Ball, events?: BallEvent[]) {
  const xw = ARENA.xWall - R;
  const yw = ARENA.yWall - R;
  let hit = false;
  if (b.x > xw && b.vx > 0) {
    b.x = xw;
    b.vx = -b.vx * 0.3;
    hit = true;
  } else if (b.x < -xw && b.vx < 0) {
    b.x = -xw;
    b.vx = -b.vx * 0.3;
    hit = true;
  }
  if (b.y > yw && b.vy > 0) {
    b.y = yw;
    b.vy = -b.vy * 0.3;
    hit = true;
  } else if (b.y < -yw && b.vy < 0) {
    b.y = -yw;
    b.vy = -b.vy * 0.3;
    hit = true;
  }
  if (hit) {
    b.vx *= 0.8;
    b.vy *= 0.8;
    events?.push({ kind: 'wall', x: b.x, y: b.y, z: b.z, speed: ballSpeed(b) });
  }
}

// ---------------------------------------------------------------------------
// Prediction

export interface Prediction {
  /** Interleaved samples [t, x, y, z] every SIM_STEP from the current state. */
  pts: Float32Array;
  n: number;
  /** Impacts along the way, with the sample index they occurred in. */
  events: (BallEvent & { i: number; t: number })[];
}

export function predict(b: Ball, surf: Surface, maxT = 3.2): Prediction {
  const sim = cloneBall(b);
  const steps = Math.ceil(maxT / SIM_STEP);
  const pts = new Float32Array((steps + 1) * 4);
  const events: Prediction['events'] = [];
  const evs: BallEvent[] = [];
  pts[0] = 0;
  pts[1] = sim.x;
  pts[2] = sim.y;
  pts[3] = sim.z;
  let n = 1;
  for (let i = 1; i <= steps; i++) {
    evs.length = 0;
    stepBall(sim, SIM_STEP, surf, evs);
    const t = i * SIM_STEP;
    for (const e of evs) events.push({ ...e, i, t });
    pts[n * 4] = t;
    pts[n * 4 + 1] = sim.x;
    pts[n * 4 + 2] = sim.y;
    pts[n * 4 + 3] = sim.z;
    n++;
    if (sim.rest && events.filter((e) => e.kind === 'bounce').length >= 2) break;
  }
  return { pts, n, events };
}
