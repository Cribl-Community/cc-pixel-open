/**
 * Turns a Pose + PlayerLook into pixels, every frame. The skeleton is solved
 * in the player's local frame, placed in the world, projected with a local
 * orthographic basis taken along the camera ray to the player (so near and
 * far players are seen from the right angle and at the right size), and
 * rasterized into a scratch buffer that is composited into the frame.
 */

import { packRamp, rampFrom, type Ramp } from '../core/color';
import { RAMPS } from '../core/palette';
import { rotZ, type V3 } from '../core/math';
import { Raster } from '../art/raster';
import { BODY, solveSkeleton, type Pose, type Skeleton } from '../art/playerRig';
import type { Projected, ViewBasis } from '../sim/camera';

import type { PlayerLook } from '../sim/roster';
import type { Frame } from './frame';

/** Anything that can place a sprite: the broadcast camera or a portrait camera. */
export interface ViewCamera {
  project(x: number, y: number, z: number, out?: Projected): Projected;
  basisAt(x: number, y: number, z: number): ViewBasis;
}

const MAT_KEYS = [
  'skin',
  'hair',
  'eye',
  'top',
  'trim',
  'bottom',
  'socks',
  'shoe',
  'hat',
  'wrist',
  'frame',
  'accent',
  'strings',
  'grip',
  'ball',
  'horn',
  'nose',
] as const;
type MatKey = (typeof MAT_KEYS)[number];

export interface PlayerMaterials {
  ids: Record<MatKey, number>;
  ramps: Uint32Array[];
  noOutline: Uint8Array;
}

/** Fabric is matte: drop the glossy highlight step. */
const matte = (r: Ramp): Ramp => [r[0], r[1], r[2], r[3], r[3]];

export function buildPlayerMaterials(look: PlayerLook): PlayerMaterials {
  const hat = look.headwear.kind === 'none' ? '#ffffff' : look.headwear.color;
  const goat = look.goat;
  const table: Record<MatKey, Ramp> = {
    // Goats: the coat replaces skin, the beard takes the hair ramp, hooves the shoes.
    skin: goat ? matte(rampFrom(goat.coat)) : RAMPS[look.skin],
    hair: goat ? matte(rampFrom(goat.beard)) : RAMPS[look.hair],
    eye: RAMPS.eye,
    top: matte(rampFrom(look.top.color)),
    trim: matte(rampFrom(look.top.trim)),
    bottom: matte(rampFrom(look.bottom.color)),
    socks: matte(rampFrom(look.socks)),
    shoe: rampFrom(goat ? goat.hoof : look.shoes),
    hat: matte(rampFrom(hat)),
    wrist: matte(rampFrom(look.wristband ?? look.top.color)),
    frame: rampFrom(look.racket.frame),
    accent: rampFrom(look.racket.accent),
    strings: RAMPS.strings,
    grip: rampFrom('#34343f'),
    ball: RAMPS.ball,
    horn: rampFrom(goat?.horn ?? '#d8c7a2'),
    nose: rampFrom(goat?.nose ?? '#1e1a1c'),
  };
  const ids = {} as Record<MatKey, number>;
  const ramps: Uint32Array[] = [];
  const noOutline = new Uint8Array(MAT_KEYS.length);
  MAT_KEYS.forEach((k, i) => {
    ids[k] = i;
    ramps.push(packRamp(table[k]));
  });
  noOutline[ids.strings] = 1;
  noOutline[ids.grip] = 1;
  noOutline[ids.frame] = 1;
  noOutline[ids.accent] = 1;
  noOutline[ids.eye] = 1;
  return { ids, ramps, noOutline };
}

// Part ids: separation lines are drawn only between different parts.
const PART = {
  torso: 1,
  head: 2,
  hairX: 3,
  armL: 4,
  armR: 5,
  legL: 6,
  legR: 7,
  racket: 8,
  skirt: 9,
  brim: 10,
  ball: 11,
  shoeL: 12,
  shoeR: 13,
  foreL: 14,
  foreR: 15,
  pelvis: 16,
  tail: 17,
};

export interface PlayerDrawInput {
  look: PlayerLook;
  mats: PlayerMaterials;
  lefty: boolean;
  /** Ground position (world meters). */
  x: number;
  y: number;
  /** World yaw of the body's local +y. */
  yaw: number;
  pose: Pose;
  /** Hair sway (local meters), for ponytails and braids. */
  sway?: { x: number; y: number };
  /** Hide the racket (ball kids, umpire). */
  noRacket?: boolean;
  /** Size multiplier (ball kids are smaller). */
  scale?: number;
}

const RW = 120;
const RH = 104;
const AX = 60;
const AY = 96;

export class PlayerRenderer {
  private readonly raster = new Raster(RW, RH);

  /** Last solved skeleton (world-space offsets are not stored; local only). */
  lastSkeleton: Skeleton | null = null;

  draw(frame: Frame, cam: ViewCamera, inp: PlayerDrawInput) {
    const { look, mats, pose } = inp;
    const ids = mats.ids;
    const r = this.raster;
    r.clear();
    const height = look.height * (inp.scale ?? 1);
    const k = height / BODY.refHeight;
    const b = look.build;
    const sk = solveSkeleton(pose, height, inp.lefty);
    this.lastSkeleton = sk;

    const basis = cam.basisAt(inp.x, inp.y, 0.9);
    const { right, up, fwd } = basis;
    const s = basis.s;
    const root = cam.project(inp.x, inp.y, 0);
    const ox = Math.round(root.sx) - AX;
    const oy = Math.round(root.sy) - AY;
    const cy = Math.cos(inp.yaw);
    const sy = Math.sin(inp.yaw);

    // Local (player frame) → raster coordinates.
    const P = (v: V3): [number, number, number] => {
      const wx = v.x * cy - v.y * sy;
      const wy = v.x * sy + v.y * cy;
      const wz = v.z;
      return [
        AX + (wx * right.x + wy * right.y + wz * right.z) * s,
        AY - (wx * up.x + wy * up.y + wz * up.z) * s,
        -(wx * fwd.x + wy * fwd.y + wz * fwd.z) * s,
      ];
    };
    // Local direction → world direction.
    const W = (v: V3): V3 => rotZ(v, inp.yaw);
    const px = (m: number) => Math.max(0.62, m * s);

    const cap = (
      a: V3,
      bb: V3,
      ra: number,
      rb: number,
      mat: number | ((t: number, across: number) => number),
      part: number,
    ) => {
      const A = P(a);
      const B = P(bb);
      r.capsule(
        A[0],
        A[1],
        A[2],
        B[0],
        B[1],
        B[2],
        px(ra),
        px(rb),
        typeof mat === 'number' ? mat : (_x, _y, t, across) => mat(t, across),
        part,
      );
    };

    // ---- Legs
    const shorts = look.bottom.style === 'shorts';
    const thighMat = (t: number) => (shorts && t < 0.5 ? ids.bottom : ids.skin);
    const shinMat = (t: number) => (t > 0.7 ? ids.socks : ids.skin);
    cap(sk.hipL, sk.knL, 0.085 * b * k, 0.066 * b * k, thighMat, PART.legL);
    cap(sk.hipR, sk.knR, 0.085 * b * k, 0.066 * b * k, thighMat, PART.legR);
    cap(sk.knL, sk.anL, 0.062 * b * k, 0.046 * k, shinMat, PART.legL);
    cap(sk.knR, sk.anR, 0.062 * b * k, 0.046 * k, shinMat, PART.legR);
    cap(sk.anL, sk.toeL, 0.058 * k, 0.052 * k, ids.shoe, PART.shoeL);
    cap(sk.anR, sk.toeR, 0.058 * k, 0.052 * k, ids.shoe, PART.shoeR);

    // ---- Pelvis & torso
    const up3 = (v: V3, dz: number): V3 => ({ x: v.x, y: v.y, z: v.z + dz * k });
    if (shorts) {
      cap(
        up3(sk.pelvis, -0.06),
        up3(sk.pelvis, 0.1),
        0.14 * b * k,
        0.135 * b * k,
        ids.bottom,
        PART.pelvis,
      );
    } else {
      const skirtMat = look.top.style === 'dress' ? ids.top : ids.bottom;
      cap(
        up3(sk.pelvis, 0.06),
        up3(sk.pelvis, -0.2),
        0.14 * b * k,
        0.21 * b * k,
        skirtMat,
        PART.skirt,
      );
    }
    if (look.goat) {
      // A short tail flicking up behind the shorts.
      const back = (d: number, dz: number): V3 => ({
        x: sk.pelvis.x - sk.hipFwd.x * d * k,
        y: sk.pelvis.y - sk.hipFwd.y * d * k,
        z: sk.pelvis.z + dz * k,
      });
      cap(back(0.12, 0.06), back(0.21, 0.2), 0.04 * k, 0.022 * k, ids.skin, PART.tail);
    }
    const style = look.top.style;
    cap(
      up3(sk.pelvis, 0.04),
      sk.chest,
      0.13 * b * k,
      0.16 * b * k,
      (t) => {
        if (style === 'polo' && t > 0.93) return ids.trim;
        if ((style === 'tee' || style === 'tank') && t > 0.95) return ids.trim;
        if (style === 'dress' && t < 0.1) return ids.trim;
        return ids.top;
      },
      PART.torso,
    );
    cap(
      sk.shL,
      sk.shR,
      0.075 * b * k,
      0.075 * b * k,
      (t) => {
        if (style === 'tank' && (t < 0.18 || t > 0.82)) return ids.skin;
        return ids.top;
      },
      PART.torso,
    );
    cap(sk.chest, sk.neck, 0.05 * k, 0.05 * k, ids.skin, PART.torso);

    // ---- Arms
    const sleeve = style === 'polo' || style === 'tee';
    const upperMat = (t: number) =>
      sleeve ? (t < 0.36 ? ids.top : t < 0.44 ? ids.trim : ids.skin) : ids.skin;
    const wrist = look.wristband ? ids.wrist : ids.skin;
    const foreMat = (t: number) => (t > 0.76 ? wrist : ids.skin);
    cap(sk.shL, sk.elL, 0.058 * b * k, 0.048 * b * k, upperMat, PART.armL);
    cap(sk.shR, sk.elR, 0.058 * b * k, 0.048 * b * k, upperMat, PART.armR);
    cap(sk.elL, sk.haL, 0.046 * b * k, 0.04 * k, foreMat, PART.foreL);
    cap(sk.elR, sk.haR, 0.046 * b * k, 0.04 * k, foreMat, PART.foreR);
    const hL = P(sk.haL);
    const hR = P(sk.haR);
    r.sphere(hL[0], hL[1], hL[2], px(0.05 * k), ids.skin, PART.foreL);
    r.sphere(hR[0], hR[1], hR[2], px(0.05 * k), ids.skin, PART.foreR);

    // ---- Head
    if (look.goat) {
      this.goatHead(inp, sk, P, W, cap, px, basis, k);
    } else {
      this.humanHead(inp, sk, P, W, cap, px, basis, k);
    }

    // ---- Racket
    if (!inp.noRacket) this.racket(sk, P, k, ids);

    // ---- Ball in the tossing hand
    if (sk.ball) {
      const bp = P(sk.ball);
      r.sphere(bp[0], bp[1], bp[2] + 1, Math.max(1, 0.05 * s), ids.ball, PART.ball);
    }

    r.resolve(frame.data, frame.w, frame.h, ox, oy, mats.ramps, {
      noOutline: mats.noOutline,
      edgeDepth: 1.2,
    });
  }

  private humanHead(
    inp: PlayerDrawInput,
    sk: Skeleton,
    P: (v: V3) => [number, number, number],
    W: (v: V3) => V3,
    cap: CapFn,
    px: (m: number) => number,
    basis: ViewBasis,
    k: number,
  ) {
    const { look, mats } = inp;
    const ids = mats.ids;
    const r = this.raster;
    const { right, up, fwd } = basis;
    const s = basis.s;
    const hd = P(sk.head);
    const hf = W(sk.headFwd);
    const hr = W(sk.headRight);
    const hu = W(sk.headUp);
    const hs = look.hairStyle;
    const [front, side, back] =
      hs === 'short'
        ? [0.45, 0.05, -0.45]
        : hs === 'buzz'
          ? [0.55, 0.25, -0.1]
          : hs === 'long' || hs === 'afro'
            ? [0.42, -0.3, -1.1]
            : hs === 'bob'
              ? [0.3, -0.45, -1.1]
              : hs === 'bald'
                ? [2, 2, 2]
                : [0.42, 0.0, -0.55];
    const hw = look.headwear;
    const beard = !!look.beard;
    r.sphere(
      hd[0],
      hd[1],
      hd[2],
      px(BODY.headR * k),
      (nx, ny, nz) => {
        // View-space normal → world → head frame.
        const wx = right.x * nx - up.x * ny - fwd.x * nz;
        const wy = right.y * nx - up.y * ny - fwd.y * nz;
        const wz = right.z * nx - up.z * ny - fwd.z * nz;
        const f = wx * hf.x + wy * hf.y + wz * hf.z;
        const u = wx * hu.x + wy * hu.y + wz * hu.z;
        const rr = wx * hr.x + wy * hr.y + wz * hr.z;
        if (hw.kind === 'cap' && u > 0.26) return ids.hat;
        if (hw.kind === 'headband' && u > 0.26 && u < 0.5) return ids.hat;
        if (hw.kind === 'visor' && u > 0.3 && u < 0.48) return ids.hat;
        if (beard && u < -0.12 && f > 0.1 && Math.abs(rr) < 0.9) return ids.hair;
        const thr = f >= 0 ? side + (front - side) * f : side + (side - back) * f;
        if (u > thr) return ids.hair;
        if (hs === 'bald' && f < -0.2 && u > -0.4 && u < 0.18) return ids.hair;
        return ids.skin;
      },
      PART.head,
    );

    // Extra hair volumes and brims (head-local offsets → local frame).
    const hl = (fw: number, upn: number, rt = 0): V3 => ({
      x: sk.head.x + (sk.headFwd.x * fw + sk.headUp.x * upn + sk.headRight.x * rt) * k,
      y: sk.head.y + (sk.headFwd.y * fw + sk.headUp.y * upn + sk.headRight.y * rt) * k,
      z: sk.head.z + (sk.headFwd.z * fw + sk.headUp.z * upn + sk.headRight.z * rt) * k,
    });
    const sw = inp.sway ?? { x: 0, y: 0 };
    const swayV = (v: V3, amt: number): V3 => ({
      x: v.x + sw.x * amt,
      y: v.y + sw.y * amt,
      z: v.z,
    });
    if (hs === 'ponytail') {
      cap(hl(-0.15, 0.08), swayV(hl(-0.3, -0.16), 1), 0.055 * k, 0.035 * k, ids.hair, PART.hairX);
    } else if (hs === 'braid') {
      cap(hl(-0.15, -0.02), swayV(hl(-0.2, -0.46), 1.3), 0.042 * k, 0.03 * k, ids.hair, PART.hairX);
    } else if (hs === 'bun') {
      const bp = P(hl(-0.1, 0.15));
      r.sphere(bp[0], bp[1], bp[2], px(0.075 * k), ids.hair, PART.hairX);
    } else if (hs === 'long') {
      cap(hl(-0.08, 0.02), swayV(hl(-0.12, -0.34), 0.5), 0.16 * k, 0.13 * k, ids.hair, PART.hairX);
    } else if (hs === 'afro') {
      const ap = P(hl(-0.05, 0.06));
      r.sphere(ap[0], ap[1], ap[2] - 0.06 * k * s, px(0.24 * k), ids.hair, PART.hairX);
    }
    if (hw.kind === 'cap' || hw.kind === 'visor') {
      const dirn = hw.kind === 'cap' && hw.backwards ? -1 : 1;
      cap(hl(0.1 * dirn, 0.08), hl(0.27 * dirn, 0.05), 0.045 * k, 0.04 * k, ids.hat, PART.brim);
    }

    // Eyes, when the face is turned toward the camera.
    const facing = -(hf.x * fwd.x + hf.y * fwd.y + hf.z * fwd.z);
    if (facing > 0.3) {
      for (const side2 of [-1, 1]) {
        const e = P(hl(BODY.headR * 0.9, 0.0, side2 * BODY.headR * 0.36));
        r.plot(e[0], e[1], e[2] + 2, ids.eye, PART.head, 0);
      }
    }
  }

  /**
   * A goat's head: rounder cranium, a muzzle with a dark (or pink) nose,
   * horns sweeping back, ears out to the sides and a beard.
   */
  private goatHead(
    inp: PlayerDrawInput,
    sk: Skeleton,
    P: (v: V3) => [number, number, number],
    W: (v: V3) => V3,
    cap: CapFn,
    px: (m: number) => number,
    basis: ViewBasis,
    k: number,
  ) {
    const { look, mats } = inp;
    const ids = mats.ids;
    const r = this.raster;
    const { right, up, fwd } = basis;
    const hf = W(sk.headFwd);
    const hr = W(sk.headRight);
    const hu = W(sk.headUp);
    const hw = look.headwear;
    const hl = (fw: number, upn: number, rt = 0): V3 => ({
      x: sk.head.x + (sk.headFwd.x * fw + sk.headUp.x * upn + sk.headRight.x * rt) * k,
      y: sk.head.y + (sk.headFwd.y * fw + sk.headUp.y * upn + sk.headRight.y * rt) * k,
      z: sk.head.z + (sk.headFwd.z * fw + sk.headUp.z * upn + sk.headRight.z * rt) * k,
    });
    const hd = P(sk.head);
    r.sphere(
      hd[0],
      hd[1],
      hd[2],
      px(0.155 * k),
      (nx, ny, nz) => {
        const wx = right.x * nx - up.x * ny - fwd.x * nz;
        const wy = right.y * nx - up.y * ny - fwd.y * nz;
        const wz = right.z * nx - up.z * ny - fwd.z * nz;
        const u = wx * hu.x + wy * hu.y + wz * hu.z;
        // Headbands and visors still fit between the horns.
        if (hw.kind === 'cap' && u > 0.3) return ids.hat;
        if (hw.kind === 'headband' && u > 0.22 && u < 0.46) return ids.hat;
        if (hw.kind === 'visor' && u > 0.28 && u < 0.46) return ids.hat;
        return ids.skin;
      },
      PART.head,
    );
    // Muzzle, forward and a little down, ending in the nose.
    cap(
      hl(0.07, -0.035),
      hl(0.25, -0.1),
      0.088 * k,
      0.062 * k,
      (t) => (t > 0.84 ? ids.nose : ids.skin),
      PART.head,
    );
    for (const side of [-1, 1]) {
      // Horns: up and back, then curling further back.
      cap(
        hl(0.01, 0.11, side * 0.065),
        hl(-0.07, 0.23, side * 0.09),
        0.028 * k,
        0.021 * k,
        ids.horn,
        PART.hairX,
      );
      cap(
        hl(-0.07, 0.23, side * 0.09),
        hl(-0.17, 0.22, side * 0.1),
        0.021 * k,
        0.012 * k,
        ids.horn,
        PART.hairX,
      );
      // Ears, out to the side and drooping.
      cap(
        hl(-0.02, 0.04, side * 0.12),
        hl(0.02, -0.03, side * 0.26),
        0.026 * k,
        0.036 * k,
        ids.skin,
        PART.hairX,
      );
    }
    // The beard.
    cap(hl(0.16, -0.15), hl(0.13, -0.28), 0.032 * k, 0.014 * k, ids.hair, PART.hairX);
    if (hw.kind === 'cap' || hw.kind === 'visor') {
      const dirn = hw.kind === 'cap' && hw.backwards ? -1 : 1;
      cap(hl(0.1 * dirn, 0.1), hl(0.26 * dirn, 0.08), 0.045 * k, 0.04 * k, ids.hat, PART.brim);
    }
    // Eyes sit on the sides of a goat's head: draw whichever faces the camera.
    for (const side of [-1, 1]) {
      const nx = hf.x * 0.55 + hr.x * side * 0.8;
      const ny = hf.y * 0.55 + hr.y * side * 0.8;
      const nz = hf.z * 0.55 + hr.z * side * 0.8;
      if (-(nx * fwd.x + ny * fwd.y + nz * fwd.z) < 0.05) continue;
      const e = P(hl(0.09, 0.035, side * 0.105));
      r.plot(e[0], e[1], e[2] + 2, ids.eye, PART.head, 0);
    }
  }

  private racket(
    sk: Skeleton,
    P: (v: V3) => [number, number, number],
    k: number,
    ids: PlayerMaterials['ids'],
  ) {
    const r = this.raster;
    {
      const g = sk.racketGrip;
      const d = sk.racketU;
      const dl = Math.hypot(d.x, d.y, d.z) || 1;
      const dn = { x: d.x / dl, y: d.y / dl, z: d.z / dl };
      const along = (m: number): V3 => ({
        x: g.x + dn.x * m * k,
        y: g.y + dn.y * m * k,
        z: g.z + dn.z * m * k,
      });
      const g0 = P(along(-0.06));
      const g1 = P(along(0.12));
      const t1 = P(along(BODY.racketReach - BODY.racketA * 0.95));
      r.line(g0[0], g0[1], g0[2], g1[0], g1[1], g1[2], ids.grip, PART.racket, 0.4);
      r.line(g1[0], g1[1], g1[2], t1[0], t1[1], t1[2], ids.accent, PART.racket, 0.6);
      const c = P(sk.racketHead);
      const U = P({
        x: sk.racketHead.x + sk.racketU.x,
        y: sk.racketHead.y + sk.racketU.y,
        z: sk.racketHead.z + sk.racketU.z,
      });
      const V = P({
        x: sk.racketHead.x + sk.racketV.x,
        y: sk.racketHead.y + sk.racketV.y,
        z: sk.racketHead.z + sk.racketV.z,
      });
      r.disk(
        c,
        [U[0] - c[0], U[1] - c[1], U[2] - c[2]],
        [V[0] - c[0], V[1] - c[1], V[2] - c[2]],
        ids.frame,
        ids.strings,
        PART.racket,
      );
    }
  }
}

type CapFn = (
  a: V3,
  b: V3,
  ra: number,
  rb: number,
  mat: number | ((t: number, across: number) => number),
  part: number,
) => void;
