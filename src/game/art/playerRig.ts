/**
 * The player rig. Poses are authored for a right-handed player facing +y in
 * their own local frame (x = right, z = up, meters, for a 1.80 m body); the
 * renderer mirrors them for left-handers and scales them to each player's
 * height.
 *
 * Locomotion (ready stance, run, walk) is procedural. Strokes are keyframed
 * — takeback, racket drop, contact, follow-through — and interpolated with
 * Catmull-Rom splines. At contact the racket hand is retargeted onto the
 * actual ball, so the strings meet it wherever it really is.
 */

import {
  catmull,
  clamp,
  lerp,
  smoothstep,
  vadd,
  vcross,
  vlen,
  vnorm,
  vscale,
  vsub,
  type V3,
} from '../core/math';

export interface Pose {
  pelvis: V3;
  hipYaw: number;
  torsoYaw: number;
  /** Forward lean of the spine (rad). */
  lean: number;
  /** Side bend toward +x (rad). */
  tilt: number;
  headYaw: number;
  headPitch: number;
  footL: V3;
  footR: V3;
  /** Racket hand. */
  handR: V3;
  /** Free hand. */
  handL: V3;
  racketDir: V3;
  /** Minor axis of the racket head, perpendicular to racketDir. */
  racketUp: V3;
  /** 0..1: free hand on the grip/throat. */
  twoHands: number;
  /** Distance up the handle where the free hand holds on. */
  gripOff: number;
  ballInHand: number;
  jump: number;
}

/** Body proportions (meters, 1.80 m player). */
export const BODY = {
  pelvisZ: 0.95,
  spine: 0.47,
  neck: 0.07,
  headR: 0.17,
  shoulder: 0.19,
  hip: 0.1,
  hipDrop: 0.03,
  thigh: 0.44,
  shin: 0.43,
  ankleZ: 0.06,
  upperArm: 0.3,
  foreArm: 0.29,
  /** Grip to the racket head's center. */
  racketReach: 0.5,
  racketA: 0.165,
  racketB: 0.13,
  refHeight: 1.8,
};

export type StrokeKind =
  'fh' | 'bh1' | 'bh2' | 'fhSlice' | 'bhSlice' | 'fhVolley' | 'bhVolley' | 'serve' | 'smash';

type T3 = readonly [number, number, number];

interface Key {
  t: number;
  hand: T3;
  free?: T3;
  dir: T3;
  up?: T3;
  torso: number;
  hip?: number;
  pz: number;
  lean: number;
  tilt?: number;
  two?: number;
  grip?: number;
  footL?: T3;
  footR?: T3;
  jump?: number;
  ball?: number;
}

const READY: Key = {
  t: 0,
  hand: [0.16, 0.34, 1.0],
  dir: [-0.25, 0.45, 0.86],
  up: [1, 0, 0],
  torso: 0,
  hip: 0,
  pz: 0.86,
  lean: 0.22,
  two: 1,
  grip: 0.22,
};

const at = (t: number, k: Key): Key => ({ ...k, t });

/** Stroke library. `tc` is the contact phase; `pre`/`post` are seconds before/after it. */
export const STROKES: Record<
  StrokeKind,
  { tc: number; pre: number; post: number; keys: Key[]; legs: boolean }
> = {
  fh: {
    tc: 0.5,
    pre: 0.3,
    post: 0.42,
    legs: false,
    keys: [
      at(0, READY),
      {
        t: 0.2,
        hand: [0.42, -0.12, 1.2],
        free: [0.25, 0.25, 1.15],
        dir: [0.15, -0.35, 0.92],
        torso: -0.9,
        hip: -0.35,
        pz: 0.84,
        lean: 0.2,
        two: 0.35,
        grip: 0.22,
      },
      {
        t: 0.36,
        hand: [0.5, -0.3, 0.95],
        free: [0.32, 0.32, 1.15],
        dir: [0.25, -0.8, -0.45],
        up: [0, 0, 1],
        torso: -1.05,
        hip: -0.45,
        pz: 0.82,
        lean: 0.2,
        two: 0,
      },
      {
        t: 0.5,
        hand: [0.55, 0.3, 0.9],
        free: [-0.1, 0.3, 1.05],
        dir: [0.92, 0.35, 0.15],
        up: [0, 0, 1],
        torso: -0.15,
        hip: 0.05,
        pz: 0.85,
        lean: 0.2,
        two: 0,
      },
      {
        t: 0.64,
        hand: [0.25, 0.6, 1.18],
        free: [-0.35, 0.1, 1.05],
        dir: [0.35, 0.7, 0.6],
        torso: 0.5,
        hip: 0.25,
        pz: 0.86,
        lean: 0.2,
        two: 0,
      },
      {
        t: 0.8,
        hand: [-0.3, 0.25, 1.45],
        free: [-0.25, 0.3, 1.3],
        dir: [-0.45, -0.35, 0.82],
        torso: 0.9,
        hip: 0.4,
        pz: 0.88,
        lean: 0.18,
        two: 0.5,
        grip: 0.22,
      },
      at(1, READY),
    ],
  },
  bh2: {
    tc: 0.5,
    pre: 0.3,
    post: 0.42,
    legs: false,
    keys: [
      at(0, READY),
      {
        t: 0.2,
        hand: [-0.33, -0.05, 1.12],
        dir: [-0.2, -0.35, 0.9],
        torso: 1.0,
        hip: 0.4,
        pz: 0.84,
        lean: 0.2,
        two: 1,
        grip: 0.1,
      },
      {
        t: 0.36,
        hand: [-0.42, -0.25, 0.92],
        dir: [-0.3, -0.75, -0.45],
        up: [0, 0, 1],
        torso: 1.2,
        hip: 0.5,
        pz: 0.82,
        lean: 0.2,
        two: 1,
        grip: 0.1,
      },
      {
        t: 0.5,
        hand: [-0.22, 0.42, 0.95],
        dir: [-0.9, 0.4, 0.15],
        up: [0, 0, 1],
        torso: 0.4,
        hip: 0.1,
        pz: 0.85,
        lean: 0.2,
        two: 1,
        grip: 0.1,
      },
      {
        t: 0.65,
        hand: [-0.05, 0.6, 1.2],
        dir: [-0.3, 0.7, 0.65],
        torso: -0.4,
        hip: -0.2,
        pz: 0.86,
        lean: 0.2,
        two: 1,
        grip: 0.1,
      },
      {
        t: 0.8,
        hand: [0.3, 0.2, 1.45],
        dir: [0.45, -0.35, 0.82],
        torso: -0.9,
        hip: -0.4,
        pz: 0.88,
        lean: 0.18,
        two: 0.9,
        grip: 0.1,
      },
      at(1, READY),
    ],
  },
  bh1: {
    tc: 0.5,
    pre: 0.32,
    post: 0.42,
    legs: false,
    keys: [
      at(0, READY),
      {
        t: 0.2,
        hand: [-0.3, -0.05, 1.15],
        dir: [-0.1, -0.3, 0.95],
        torso: 1.1,
        hip: 0.45,
        pz: 0.84,
        lean: 0.2,
        two: 1,
        grip: 0.22,
      },
      {
        t: 0.36,
        hand: [-0.35, -0.25, 0.95],
        dir: [-0.25, -0.8, -0.35],
        up: [0, 0, 1],
        torso: 1.3,
        hip: 0.55,
        pz: 0.82,
        lean: 0.22,
        two: 0.8,
        grip: 0.22,
      },
      {
        t: 0.5,
        hand: [-0.12, 0.55, 0.95],
        free: [-0.15, -0.45, 1.05],
        dir: [-0.85, 0.45, 0.2],
        up: [0, 0, 1],
        torso: 0.7,
        hip: 0.3,
        pz: 0.85,
        lean: 0.2,
        two: 0,
      },
      {
        t: 0.65,
        hand: [0.15, 0.55, 1.35],
        free: [-0.35, -0.35, 1.15],
        dir: [-0.1, 0.5, 0.86],
        torso: 0.4,
        hip: 0.2,
        pz: 0.86,
        lean: 0.18,
        two: 0,
      },
      {
        t: 0.8,
        hand: [0.4, 0.25, 1.52],
        free: [-0.45, -0.3, 1.2],
        dir: [0.3, -0.3, 0.9],
        torso: 0.2,
        hip: 0.1,
        pz: 0.88,
        lean: 0.12,
        two: 0,
      },
      at(1, READY),
    ],
  },
  fhSlice: {
    tc: 0.5,
    pre: 0.3,
    post: 0.38,
    legs: false,
    keys: [
      at(0, READY),
      {
        t: 0.22,
        hand: [0.4, -0.2, 1.35],
        free: [0.25, 0.3, 1.15],
        dir: [0.25, -0.4, 0.88],
        torso: -0.9,
        hip: -0.35,
        pz: 0.84,
        lean: 0.2,
        two: 0.2,
        grip: 0.22,
      },
      {
        t: 0.38,
        hand: [0.5, -0.1, 1.2],
        free: [0.25, 0.3, 1.1],
        dir: [0.5, -0.5, 0.7],
        torso: -0.8,
        hip: -0.3,
        pz: 0.82,
        lean: 0.22,
        two: 0,
      },
      {
        t: 0.5,
        hand: [0.5, 0.3, 0.95],
        free: [-0.1, 0.25, 1.05],
        dir: [0.95, 0.25, 0.2],
        up: [0, 0, 1],
        torso: -0.2,
        hip: 0,
        pz: 0.83,
        lean: 0.24,
        two: 0,
      },
      {
        t: 0.68,
        hand: [0.3, 0.65, 0.8],
        free: [-0.3, 0.1, 1.05],
        dir: [0.6, 0.75, 0.25],
        torso: 0.2,
        hip: 0.1,
        pz: 0.84,
        lean: 0.28,
        two: 0,
      },
      {
        t: 0.82,
        hand: [0.15, 0.55, 0.85],
        free: [-0.3, 0.15, 1.05],
        dir: [0.4, 0.85, 0.35],
        torso: 0.2,
        hip: 0.1,
        pz: 0.85,
        lean: 0.26,
        two: 0,
      },
      at(1, READY),
    ],
  },
  bhSlice: {
    tc: 0.5,
    pre: 0.3,
    post: 0.38,
    legs: false,
    keys: [
      at(0, READY),
      {
        t: 0.22,
        hand: [-0.2, -0.05, 1.4],
        dir: [-0.3, -0.35, 0.88],
        torso: 1.1,
        hip: 0.45,
        pz: 0.84,
        lean: 0.2,
        two: 1,
        grip: 0.22,
      },
      {
        t: 0.38,
        hand: [-0.3, -0.15, 1.3],
        dir: [-0.5, -0.5, 0.7],
        torso: 1.2,
        hip: 0.5,
        pz: 0.82,
        lean: 0.22,
        two: 0.7,
        grip: 0.22,
      },
      {
        t: 0.5,
        hand: [-0.1, 0.52, 0.98],
        free: [-0.1, -0.45, 1.05],
        dir: [-0.9, 0.35, 0.25],
        up: [0, 0, 1],
        torso: 0.7,
        hip: 0.3,
        pz: 0.83,
        lean: 0.24,
        two: 0,
      },
      {
        t: 0.68,
        hand: [0.1, 0.75, 0.9],
        free: [-0.35, -0.35, 1.1],
        dir: [-0.3, 0.9, 0.3],
        torso: 0.4,
        hip: 0.2,
        pz: 0.84,
        lean: 0.26,
        two: 0,
      },
      {
        t: 0.82,
        hand: [0.2, 0.7, 0.95],
        free: [-0.35, -0.3, 1.1],
        dir: [-0.1, 0.9, 0.4],
        torso: 0.35,
        hip: 0.15,
        pz: 0.85,
        lean: 0.24,
        two: 0,
      },
      at(1, READY),
    ],
  },
  fhVolley: {
    tc: 0.45,
    pre: 0.2,
    post: 0.3,
    legs: false,
    keys: [
      at(0, { ...READY, pz: 0.88 }),
      {
        t: 0.25,
        hand: [0.42, 0.2, 1.25],
        free: [0.2, 0.45, 1.2],
        dir: [0.35, -0.05, 0.94],
        torso: -0.55,
        hip: -0.2,
        pz: 0.86,
        lean: 0.25,
        two: 0,
      },
      {
        t: 0.45,
        hand: [0.45, 0.55, 1.15],
        free: [-0.1, 0.35, 1.1],
        dir: [0.8, 0.35, 0.48],
        up: [0, 0, 1],
        torso: -0.3,
        hip: -0.1,
        pz: 0.84,
        lean: 0.28,
        two: 0,
      },
      {
        t: 0.65,
        hand: [0.4, 0.7, 1.05],
        free: [-0.15, 0.3, 1.05],
        dir: [0.7, 0.55, 0.45],
        torso: -0.2,
        hip: -0.1,
        pz: 0.85,
        lean: 0.28,
        two: 0,
      },
      at(1, { ...READY, pz: 0.88 }),
    ],
  },
  bhVolley: {
    tc: 0.45,
    pre: 0.2,
    post: 0.3,
    legs: false,
    keys: [
      at(0, { ...READY, pz: 0.88 }),
      {
        t: 0.25,
        hand: [-0.2, 0.2, 1.25],
        dir: [-0.3, -0.05, 0.95],
        torso: 0.7,
        hip: 0.3,
        pz: 0.86,
        lean: 0.25,
        two: 1,
        grip: 0.22,
      },
      {
        t: 0.45,
        hand: [-0.2, 0.58, 1.12],
        free: [-0.1, 0.0, 1.05],
        dir: [-0.8, 0.3, 0.5],
        up: [0, 0, 1],
        torso: 0.45,
        hip: 0.2,
        pz: 0.84,
        lean: 0.28,
        two: 0.1,
        grip: 0.22,
      },
      {
        t: 0.65,
        hand: [-0.15, 0.72, 1.05],
        free: [-0.3, -0.1, 1.05],
        dir: [-0.65, 0.6, 0.45],
        torso: 0.35,
        hip: 0.15,
        pz: 0.85,
        lean: 0.28,
        two: 0,
      },
      at(1, { ...READY, pz: 0.88 }),
    ],
  },
  serve: {
    tc: 0.62,
    pre: 0.95,
    post: 0.6,
    legs: true,
    keys: [
      {
        t: 0,
        hand: [0.2, 0.3, 0.95],
        free: [0.1, 0.42, 1.02],
        dir: [0.05, 0.85, -0.52],
        torso: -0.95,
        hip: -0.8,
        pz: 0.93,
        lean: 0.05,
        two: 0,
        footL: [-0.05, 0.28, 0],
        footR: [0.3, -0.12, 0],
        ball: 1,
      },
      {
        t: 0.18,
        hand: [0.4, 0.05, 0.78],
        free: [0.12, 0.3, 0.85],
        dir: [0.25, 0.15, -0.95],
        torso: -1.05,
        hip: -0.85,
        pz: 0.92,
        lean: 0.05,
        two: 0,
        footL: [-0.05, 0.28, 0],
        footR: [0.3, -0.12, 0],
        ball: 1,
      },
      {
        t: 0.34,
        hand: [0.5, -0.25, 1.25],
        free: [-0.05, 0.3, 2.0],
        dir: [0.15, -0.55, 0.82],
        torso: -1.2,
        hip: -0.85,
        pz: 0.84,
        lean: -0.15,
        two: 0,
        footL: [-0.05, 0.28, 0],
        footR: [0.22, -0.02, 0],
        ball: 1,
      },
      {
        t: 0.48,
        hand: [0.38, -0.12, 1.55],
        free: [0.0, 0.35, 1.82],
        dir: [0.1, 0.15, -0.98],
        up: [1, 0, 0],
        torso: -1.0,
        hip: -0.7,
        pz: 0.8,
        lean: -0.25,
        two: 0,
        footL: [-0.05, 0.28, 0],
        footR: [0.12, 0.08, 0],
        ball: 0,
      },
      {
        t: 0.62,
        hand: [0.18, 0.28, 2.12],
        free: [-0.2, 0.15, 1.1],
        dir: [0.05, 0.35, 0.94],
        up: [1, 0, 0],
        torso: 0.05,
        hip: -0.1,
        pz: 1.0,
        lean: 0.15,
        two: 0,
        footL: [-0.05, 0.34, 0.08],
        footR: [0.1, 0.12, 0.14],
        jump: 0.1,
        ball: 0,
      },
      {
        t: 0.8,
        hand: [-0.3, 0.45, 0.8],
        free: [-0.3, 0.2, 1.0],
        dir: [-0.35, 0.25, -0.9],
        torso: 0.85,
        hip: 0.5,
        pz: 0.85,
        lean: 0.5,
        two: 0,
        footL: [-0.05, 0.55, 0],
        footR: [0.25, 0.3, 0.12],
        ball: 0,
      },
      { ...READY, t: 1, footL: [-0.27, 0.45, 0], footR: [0.27, 0.45, 0] },
    ],
  },
  smash: {
    tc: 0.4,
    pre: 0.34,
    post: 0.45,
    legs: false,
    keys: [
      {
        t: 0,
        hand: [0.4, -0.1, 1.4],
        free: [-0.05, 0.4, 1.9],
        dir: [0.1, -0.3, 0.95],
        torso: -0.9,
        hip: -0.5,
        pz: 0.9,
        lean: 0,
        two: 0,
      },
      {
        t: 0.22,
        hand: [0.35, -0.12, 1.55],
        free: [0.0, 0.4, 1.85],
        dir: [0.1, 0.15, -0.98],
        up: [1, 0, 0],
        torso: -0.9,
        hip: -0.5,
        pz: 0.86,
        lean: -0.15,
        two: 0,
      },
      {
        t: 0.4,
        hand: [0.18, 0.3, 2.08],
        free: [-0.2, 0.2, 1.15],
        dir: [0.05, 0.45, 0.89],
        up: [1, 0, 0],
        torso: 0.05,
        hip: 0,
        pz: 1.0,
        lean: 0.15,
        two: 0,
        jump: 0.12,
      },
      {
        t: 0.65,
        hand: [-0.3, 0.45, 0.85],
        free: [-0.3, 0.2, 1.0],
        dir: [-0.35, 0.3, -0.88],
        torso: 0.8,
        hip: 0.4,
        pz: 0.86,
        lean: 0.45,
        two: 0,
      },
      at(1, READY),
    ],
  },
};

// ---------------------------------------------------------------------------
// Helpers

const toV = (t: T3): V3 => ({ x: t[0], y: t[1], z: t[2] });

function orthoUp(dir: V3, up: V3 | null): V3 {
  let u = up ?? { x: 0, y: 0, z: 1 };
  // Remove the component along dir.
  const d = u.x * dir.x + u.y * dir.y + u.z * dir.z;
  u = { x: u.x - dir.x * d, y: u.y - dir.y * d, z: u.z - dir.z * d };
  if (vlen(u) < 0.2) {
    // Fall back to something perpendicular.
    u = vcross(dir, { x: 0, y: 1, z: 0 });
    if (vlen(u) < 0.2) u = vcross(dir, { x: 1, y: 0, z: 0 });
  }
  return vnorm(u);
}

function nlerp(a: V3, b: V3, t: number): V3 {
  return vnorm({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) });
}

function cat3(p0: T3, p1: T3, p2: T3, p3: T3, t: number): V3 {
  return {
    x: catmull(p0[0], p1[0], p2[0], p3[0], t),
    y: catmull(p0[1], p1[1], p2[1], p3[1], t),
    z: catmull(p0[2], p1[2], p2[2], p3[2], t),
  };
}

/** Free-hand target when a key doesn't specify one: on the handle. */
function freeOf(k: Key): T3 {
  if (k.free) return k.free;
  const d = vnorm(toV(k.dir));
  const g = k.grip ?? 0.1;
  return [k.hand[0] + d.x * g, k.hand[1] + d.y * g, k.hand[2] + d.z * g];
}

// ---------------------------------------------------------------------------
// Locomotion

export interface LocoInput {
  /** Seconds, for idle motion. */
  time: number;
  /** Gait phase 0..1 (advanced by distance travelled). */
  phase: number;
  /** Speed (m/s). */
  speed: number;
  /** Movement direction in local space (unit, or zero). */
  dx: number;
  dy: number;
  mode: 'ready' | 'run' | 'walk' | 'idle';
}

export function locomotionPose(inp: LocoInput): Pose {
  const { time, phase, speed, dx, dy, mode } = inp;
  const moving = speed > 0.15;
  const c = Math.cos(phase * Math.PI * 2);
  const s = Math.sin(phase * Math.PI * 2);
  const relaxed = mode === 'idle' || mode === 'walk';

  const stride = relaxed
    ? clamp(0.18 + 0.2 * speed, 0.15, 0.5)
    : clamp(0.2 + 0.11 * speed, 0.2, 0.85);
  const lift = relaxed ? 0.07 : clamp(0.06 + 0.035 * speed, 0.06, 0.24);
  const moveAmt = moving ? smoothstep(0.15, 1.2, speed) : 0;
  const w = relaxed ? 0.15 : mode === 'ready' && !moving ? 0.27 : 0.16;

  const hipTurn = !relaxed && moving ? clamp((speed - 1.5) / 3, 0, 0.55) * Math.abs(dx) : 0;
  const hipYaw = -Math.sign(dx) * hipTurn;

  const footL: V3 = {
    x: -w + dx * (stride / 2) * c * moveAmt,
    y: 0.02 + dy * (stride / 2) * c * moveAmt,
    z: lift * Math.max(0, s) * moveAmt,
  };
  const footR: V3 = {
    x: w - dx * (stride / 2) * c * moveAmt,
    y: 0.02 - dy * (stride / 2) * c * moveAmt,
    z: lift * Math.max(0, -s) * moveAmt,
  };

  const bob = 0.03 * Math.abs(Math.cos(phase * Math.PI * 4)) * moveAmt;
  const breathe = Math.sin(time * 2.4) * 0.008;
  const ready = mode === 'ready';
  const pz =
    (relaxed ? 0.94 : ready ? 0.86 : 0.9) -
    bob +
    (ready && !moving ? Math.sin(time * 7) * 0.012 : breathe);

  let handR: V3;
  let dir: V3;
  let handL: V3;
  let two = 0;
  let grip = 0.22;
  if (relaxed) {
    const swing = moving ? s * 0.1 : 0;
    handR = { x: 0.3, y: 0.05 + swing, z: 0.82 };
    dir = vnorm({ x: 0.1, y: 0.55, z: -0.83 });
    handL = { x: -0.29, y: 0.02 - swing, z: 0.84 };
  } else if (moving && speed > 1.2) {
    handR = { x: 0.3, y: 0.18 - s * 0.16 * moveAmt, z: 1.0 + c * 0.05 };
    dir = vnorm({ x: 0.08, y: 0.55, z: 0.83 });
    handL = { x: -0.3, y: 0.12 + s * 0.16 * moveAmt, z: 1.0 - c * 0.05 };
    two = 0;
  } else {
    handR = { x: 0.16, y: 0.34, z: 1.0 };
    dir = vnorm({ x: -0.25, y: 0.45, z: 0.86 });
    handL = vadd(handR, dir, 0.22);
    two = 1;
    grip = 0.22;
  }

  return {
    pelvis: { x: dx * 0.04 * moveAmt, y: 0.02 * dy * moveAmt, z: pz },
    hipYaw,
    torsoYaw: hipYaw * 0.45,
    lean: relaxed ? 0.05 : 0.14 + 0.05 * moveAmt + 0.04 * speed * dy,
    tilt: 0.02 * speed * dx,
    headYaw: 0,
    headPitch: 0,
    footL,
    footR,
    handR,
    handL,
    racketDir: dir,
    racketUp: orthoUp(dir, { x: 1, y: 0, z: 0 }),
    twoHands: two,
    gripOff: grip,
    ballInHand: 0,
    jump: 0,
  };
}

// ---------------------------------------------------------------------------
// Strokes

export interface StrokeOptions {
  /** Retarget: move the contact onto this sweet-spot offset (local, meters). */
  delta?: V3;
  /** Extra crouch for low balls (meters). */
  crouch?: number;
  /** Lob: lift the follow-through. */
  lift?: number;
}

/**
 * Evaluate a stroke at phase t ∈ [0, 1]. Legs come from `legs` unless the
 * stroke owns its footwork (the serve).
 */
export function strokePose(
  kind: StrokeKind,
  t: number,
  legs: Pose,
  opts: StrokeOptions = {},
): Pose {
  const def = STROKES[kind];
  const keys = def.keys;
  t = clamp(t, 0, 1);
  let k = 0;
  while (k < keys.length - 2 && t >= keys[k + 1].t) k++;
  const a = keys[k];
  const b = keys[k + 1];
  const p = keys[Math.max(0, k - 1)];
  const n = keys[Math.min(keys.length - 1, k + 2)];
  const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
  const su = smoothstep(0, 1, u);

  let hand = cat3(p.hand, a.hand, b.hand, n.hand, u);
  let free = cat3(freeOf(p), freeOf(a), freeOf(b), freeOf(n), u);
  let dir = nlerp(vnorm(toV(a.dir)), vnorm(toV(b.dir)), su);
  const upA = orthoUp(vnorm(toV(a.dir)), a.up ? toV(a.up) : null);
  const upB = orthoUp(vnorm(toV(b.dir)), b.up ? toV(b.up) : null);
  const two = lerp(a.two ?? 0, b.two ?? 0, su);
  const grip = lerp(a.grip ?? 0.1, b.grip ?? 0.1, su);

  // Retarget around contact with a bell-shaped weight.
  if (opts.delta) {
    const wgt = Math.exp(-(((t - def.tc) / 0.13) ** 2));
    hand = vadd(hand, opts.delta, wgt);
    free = vadd(free, opts.delta, wgt * two);
  }
  if (opts.lift && t > def.tc) {
    const l = smoothstep(def.tc, def.tc + 0.2, t) * opts.lift;
    hand = { x: hand.x, y: hand.y, z: hand.z + l * 0.35 };
    dir = vnorm({ x: dir.x, y: dir.y, z: dir.z + l });
  }
  const crouch = (opts.crouch ?? 0) * Math.exp(-(((t - def.tc) / 0.3) ** 2));
  const pz = lerp(a.pz, b.pz, su) - crouch;

  let footL = legs.footL;
  let footR = legs.footR;
  if (def.legs && a.footL && b.footL && a.footR && b.footR) {
    footL = vlerpT(a.footL, b.footL, su);
    footR = vlerpT(a.footR, b.footR, su);
  } else if (!def.legs) {
    // Load onto a wider base during the swing.
    const spread = 0.05 * Math.sin(t * Math.PI);
    footL = { ...footL, x: footL.x - spread };
    footR = { ...footR, x: footR.x + spread };
  }

  return {
    pelvis: {
      x: legs.pelvis.x * 0.5,
      y: legs.pelvis.y,
      z: def.legs ? pz : Math.min(pz, legs.pelvis.z + 0.02),
    },
    hipYaw: lerp(a.hip ?? 0, b.hip ?? 0, su) + (def.legs ? 0 : legs.hipYaw * 0.4),
    torsoYaw: lerp(a.torso, b.torso, su),
    lean: lerp(a.lean, b.lean, su) + crouch * 0.6,
    tilt: lerp(a.tilt ?? 0, b.tilt ?? 0, su),
    headYaw: 0,
    headPitch: 0,
    footL,
    footR,
    handR: hand,
    handL: two > 0.5 ? vadd(hand, dir, grip) : vlerpV(free, vadd(hand, dir, grip), two),
    racketDir: dir,
    racketUp: orthoUp(dir, nlerp(upA, upB, su)),
    twoHands: two,
    gripOff: grip,
    ballInHand: lerp(a.ball ?? 0, b.ball ?? 0, u < 0.5 ? 0 : 1),
    jump: lerp(a.jump ?? 0, b.jump ?? 0, su),
  };
}

function vlerpT(a: T3, b: T3, t: number): V3 {
  return { x: lerp(a[0], b[0], t), y: lerp(a[1], b[1], t), z: lerp(a[2], b[2], t) };
}

function vlerpV(a: V3, b: V3, t: number): V3 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

/** Blend two poses (for transitions). */
export function blendPose(a: Pose, b: Pose, t: number): Pose {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const dir = nlerp(a.racketDir, b.racketDir, t);
  return {
    pelvis: vlerpV(a.pelvis, b.pelvis, t),
    hipYaw: lerp(a.hipYaw, b.hipYaw, t),
    torsoYaw: lerp(a.torsoYaw, b.torsoYaw, t),
    lean: lerp(a.lean, b.lean, t),
    tilt: lerp(a.tilt, b.tilt, t),
    headYaw: lerp(a.headYaw, b.headYaw, t),
    headPitch: lerp(a.headPitch, b.headPitch, t),
    footL: vlerpV(a.footL, b.footL, t),
    footR: vlerpV(a.footR, b.footR, t),
    handR: vlerpV(a.handR, b.handR, t),
    handL: vlerpV(a.handL, b.handL, t),
    racketDir: dir,
    racketUp: orthoUp(dir, nlerp(a.racketUp, b.racketUp, t)),
    twoHands: lerp(a.twoHands, b.twoHands, t),
    gripOff: lerp(a.gripOff, b.gripOff, t),
    ballInHand: t < 0.5 ? a.ballInHand : b.ballInHand,
    jump: lerp(a.jump, b.jump, t),
  };
}

// ---------------------------------------------------------------------------
// Gestures

export function celebratePose(time: number, legs: Pose): Pose {
  const pump = Math.abs(Math.sin(time * Math.PI * 2.2));
  const handR = { x: 0.22, y: 0.12, z: 1.72 + pump * 0.08 };
  const dir = vnorm({ x: 0.05, y: 0.1, z: 1 });
  return {
    ...legs,
    pelvis: { ...legs.pelvis, z: 0.95 },
    lean: -0.05,
    torsoYaw: Math.sin(time * 3) * 0.2,
    headPitch: 0.35,
    handR,
    handL: { x: -0.3, y: 0.28, z: 1.2 + pump * 0.18 },
    racketDir: dir,
    racketUp: orthoUp(dir, { x: 1, y: 0, z: 0 }),
    twoHands: 0,
    jump: pump * 0.05,
  };
}

export function dejectedPose(time: number, legs: Pose): Pose {
  const dir = vnorm({ x: 0.08, y: 0.2, z: -0.97 });
  return {
    ...legs,
    pelvis: { ...legs.pelvis, z: 0.94 },
    lean: 0.32,
    headPitch: -0.6,
    headYaw: Math.sin(time * 0.8) * 0.3,
    handR: { x: 0.3, y: 0.08, z: 0.76 },
    handL: { x: -0.24, y: -0.02, z: 1.0 },
    racketDir: dir,
    racketUp: orthoUp(dir, { x: 1, y: 0, z: 0 }),
    twoHands: 0,
  };
}

/** Pre-serve ball bounce: the free hand dribbles; `h` is the ball-hand height 0..1. */
export function bouncePose(h: number, time: number): Pose {
  const base = strokePose(
    'serve',
    0,
    locomotionPose({ time, phase: 0, speed: 0, dx: 0, dy: 0, mode: 'idle' }),
  );
  return {
    ...base,
    lean: 0.18,
    handL: { x: 0.12, y: 0.42, z: 0.78 + h * 0.18 },
    handR: { x: 0.28, y: 0.15, z: 0.85 },
    ballInHand: 0,
  };
}

/** The racket's sweet spot for a pose (local, pre-mirroring, unscaled). */
export function sweetSpot(p: Pose): V3 {
  return vadd(p.handR, p.racketDir, BODY.racketReach);
}

// ---------------------------------------------------------------------------
// Skeleton (IK)

export interface Skeleton {
  pelvis: V3;
  chest: V3;
  neck: V3;
  head: V3;
  headFwd: V3;
  headRight: V3;
  headUp: V3;
  shL: V3;
  shR: V3;
  elL: V3;
  elR: V3;
  haL: V3;
  haR: V3;
  hipL: V3;
  hipR: V3;
  knL: V3;
  knR: V3;
  anL: V3;
  anR: V3;
  toeL: V3;
  toeR: V3;
  hipFwd: V3;
  torsoFwd: V3;
  racketGrip: V3;
  racketHead: V3;
  racketU: V3;
  racketV: V3;
  ball: V3 | null;
}

const rotz = (x: number, y: number, a: number): [number, number] => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
};

function twoBone(a: V3, target: V3, l1: number, l2: number, pole: V3): { joint: V3; end: V3 } {
  const d = vsub(target, a);
  let dist = vlen(d);
  const maxR = (l1 + l2) * 0.999;
  const minR = Math.abs(l1 - l2) + 1e-3;
  let dirv = dist > 1e-6 ? vscale(d, 1 / dist) : { x: 0, y: 0, z: -1 };
  if (dist > maxR) dist = maxR;
  if (dist < minR) dist = minR;
  const end = vadd(a, dirv, dist);
  const along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  // Pole direction perpendicular to the bone line.
  const pd = pole.x * dirv.x + pole.y * dirv.y + pole.z * dirv.z;
  let perp = { x: pole.x - dirv.x * pd, y: pole.y - dirv.y * pd, z: pole.z - dirv.z * pd };
  if (vlen(perp) < 1e-4) perp = { x: 0, y: 1, z: 0 };
  perp = vnorm(perp);
  dirv = vnorm(dirv);
  return { joint: vadd(vadd(a, dirv, along), perp, h), end };
}

/**
 * Solve a pose into joint positions in the player's local frame, scaled to
 * their height and mirrored for left-handers.
 */
export function solveSkeleton(pose: Pose, heightM: number, lefty: boolean): Skeleton {
  const k = heightM / BODY.refHeight;
  const m = lefty ? -1 : 1;
  const P = (v: V3): V3 => ({ x: v.x * k * m, y: v.y * k, z: v.z * k });
  const D = (v: V3): V3 => ({ x: v.x * m, y: v.y, z: v.z });

  // Everything is computed in the right-handed frame, then mapped with P/D.
  const pel = { ...pose.pelvis, z: pose.pelvis.z + pose.jump };
  const [cfx, cfy] = rotz(0, 1, pose.torsoYaw);
  const lean = pose.lean;
  const chest = {
    x: pel.x + Math.sin(pose.tilt) * BODY.spine + cfx * Math.sin(lean) * BODY.spine,
    y: pel.y + cfy * Math.sin(lean) * BODY.spine,
    z: pel.z + Math.cos(lean) * Math.cos(pose.tilt) * BODY.spine,
  };
  const [srx, sry] = rotz(BODY.shoulder, 0, pose.torsoYaw);
  const shR = { x: chest.x + srx, y: chest.y + sry, z: chest.z - 0.02 };
  const shL = { x: chest.x - srx, y: chest.y - sry, z: chest.z - 0.02 };
  const neck = {
    x: chest.x + cfx * Math.sin(lean) * BODY.neck,
    y: chest.y + cfy * Math.sin(lean) * BODY.neck,
    z: chest.z + BODY.neck,
  };
  const hy = pose.torsoYaw + pose.headYaw;
  const [hfx, hfy] = rotz(0, 1, hy);
  const hp = pose.headPitch - lean * 0.4;
  const headFwd = vnorm({ x: hfx * Math.cos(hp), y: hfy * Math.cos(hp), z: Math.sin(hp) });
  const head = {
    x: neck.x + hfx * 0.02,
    y: neck.y + hfy * 0.02,
    z: neck.z + BODY.headR * 0.8,
  };

  const [hrx, hry] = rotz(BODY.hip, 0, pose.hipYaw);
  const hipR = { x: pel.x + hrx, y: pel.y + hry, z: pel.z - BODY.hipDrop };
  const hipL = { x: pel.x - hrx, y: pel.y - hry, z: pel.z - BODY.hipDrop };
  const [hfwx, hfwy] = rotz(0, 1, pose.hipYaw);
  const hipFwd = { x: hfwx, y: hfwy, z: 0 };
  const ankle = (f: V3) => ({ x: f.x, y: f.y, z: f.z + BODY.ankleZ + pose.jump * 0.6 });
  const legR = twoBone(hipR, ankle(pose.footR), BODY.thigh, BODY.shin, {
    x: hfwx,
    y: hfwy,
    z: 0.1,
  });
  const legL = twoBone(hipL, ankle(pose.footL), BODY.thigh, BODY.shin, {
    x: hfwx,
    y: hfwy,
    z: 0.1,
  });
  const toeR = vadd(legR.end, { x: hfwx * 0.16 + 0.03, y: hfwy * 0.16, z: -0.03 });
  const toeL = vadd(legL.end, { x: hfwx * 0.16 - 0.03, y: hfwy * 0.16, z: -0.03 });

  const [tfx, tfy] = [cfx, cfy];
  const armPoleR = { x: srx * 2 - tfx * 0.6, y: sry * 2 - tfy * 0.6, z: -1 };
  const armPoleL = { x: -srx * 2 - tfx * 0.6, y: -sry * 2 - tfy * 0.6, z: -1 };
  const armR = twoBone(shR, pose.handR, BODY.upperArm, BODY.foreArm, armPoleR);
  const armL = twoBone(shL, pose.handL, BODY.upperArm, BODY.foreArm, armPoleL);

  const dir = pose.racketDir;
  const up = pose.racketUp;
  const grip = armR.end;
  const headC = vadd(grip, dir, BODY.racketReach);

  let ball: V3 | null = null;
  if (pose.ballInHand > 0.5) ball = vadd(armL.end, { x: 0.02, y: 0.04, z: 0.05 });

  // Head axes are rebuilt after mirroring so "right" stays the head's right.
  const fwdM = D(headFwd);
  const rightM = vnorm(vcross(fwdM, { x: 0, y: 0, z: 1 }));
  return {
    pelvis: P(pel),
    chest: P(chest),
    neck: P(neck),
    head: P(head),
    headFwd: fwdM,
    headRight: rightM,
    headUp: vcross(rightM, fwdM),
    shL: P(lefty ? shR : shL),
    shR: P(lefty ? shL : shR),
    elL: P(lefty ? armR.joint : armL.joint),
    elR: P(lefty ? armL.joint : armR.joint),
    haL: P(lefty ? armR.end : armL.end),
    haR: P(lefty ? armL.end : armR.end),
    hipL: P(lefty ? hipR : hipL),
    hipR: P(lefty ? hipL : hipR),
    knL: P(lefty ? legR.joint : legL.joint),
    knR: P(lefty ? legL.joint : legR.joint),
    anL: P(lefty ? legR.end : legL.end),
    anR: P(lefty ? legL.end : legR.end),
    toeL: P(lefty ? toeR : toeL),
    toeR: P(lefty ? toeL : toeR),
    hipFwd: D(hipFwd),
    torsoFwd: D({ x: cfx, y: cfy, z: 0 }),
    racketGrip: P(grip),
    racketHead: P(headC),
    racketU: vscale(D(dir), BODY.racketA * k),
    racketV: vscale(D(up), BODY.racketB * k),
    ball: ball ? P(ball) : null,
  };
}

// ---------------------------------------------------------------------------
// Calibration: where each stroke meets the ball, relative to the feet.

const SWEET = new Map<StrokeKind, V3>();

export function contactOffset(kind: StrokeKind): V3 {
  let v = SWEET.get(kind);
  if (!v) {
    const legs = locomotionPose({ time: 0, phase: 0, speed: 0, dx: 0, dy: 0, mode: 'ready' });
    const pose = strokePose(kind, STROKES[kind].tc, legs);
    v = solveSkeleton(pose, BODY.refHeight, false).racketHead;
    SWEET.set(kind, v);
  }
  return v;
}
