/**
 * The broadcast camera: high behind the near baseline with a long lens, so
 * the far end is only ~70% as wide as the near end. It never moves; it can
 * pan a few pixels to follow play, and shake on big hits.
 */

import { COURT } from './court';
import { vcross, vnorm, type V3 } from '../core/math';

const PITCH = (21 * Math.PI) / 180;
const DIST = 66;

export interface Projected {
  sx: number;
  sy: number;
  /** Distance along the view axis (meters). */
  depth: number;
  /** Pixels per meter at that depth. */
  s: number;
}

export interface ViewBasis {
  right: V3;
  up: V3;
  /** Points away from the camera. */
  fwd: V3;
  s: number;
}

export class Camera {
  readonly W: number;
  readonly H: number;
  readonly F: number;
  readonly cx: number;
  readonly cy: number;
  readonly pos: V3;
  readonly fwd: V3;
  readonly up: V3;
  /** Horizontal pan applied to every projection (pixels). */
  panX = 0;
  shakeX = 0;
  shakeY = 0;

  constructor(W: number, H: number) {
    this.W = W;
    this.H = H;
    this.F = 4.3 * H;
    this.fwd = { x: 0, y: Math.cos(PITCH), z: -Math.sin(PITCH) };
    this.up = { x: 0, y: Math.sin(PITCH), z: Math.cos(PITCH) };
    this.pos = { x: 0, y: -DIST * Math.cos(PITCH), z: DIST * Math.sin(PITCH) };
    this.cx = W / 2;
    // Put the near baseline at 85.5% of the screen height.
    const qy = -COURT.L - this.pos.y;
    const qz = -this.pos.z;
    const depth = qy * this.fwd.y + qz * this.fwd.z;
    const upc = qy * this.up.y + qz * this.up.z;
    this.cy = H * 0.855 + (this.F * upc) / depth;
  }

  /** Project a world point. Writes into `out` to avoid allocation in hot loops. */
  project(x: number, y: number, z: number, out: Projected = { sx: 0, sy: 0, depth: 0, s: 0 }) {
    const qx = x - this.pos.x;
    const qy = y - this.pos.y;
    const qz = z - this.pos.z;
    const depth = qy * this.fwd.y + qz * this.fwd.z;
    const upc = qy * this.up.y + qz * this.up.z;
    const s = this.F / depth;
    out.sx = this.cx + qx * s + this.panX + this.shakeX;
    out.sy = this.cy - upc * s + this.shakeY;
    out.depth = depth;
    out.s = s;
    return out;
  }

  /** Unnormalized ray direction through a screen pixel (ignores pan/shake). */
  ray(sx: number, sy: number): V3 {
    const a = (sx - this.cx) / this.F;
    const b = -(sy - this.cy) / this.F;
    return {
      x: this.fwd.x + a,
      y: this.fwd.y + b * this.up.y,
      z: this.fwd.z + b * this.up.z,
    };
  }

  /** Where a screen pixel's ray meets the ground plane (null above the horizon). */
  groundAt(sx: number, sy: number): { x: number; y: number } | null {
    const d = this.ray(sx - this.panX - this.shakeX, sy - this.shakeY);
    if (d.z >= -1e-6) return null;
    const t = -this.pos.z / d.z;
    return { x: this.pos.x + d.x * t, y: this.pos.y + d.y * t };
  }

  /**
   * A local orthographic basis for drawing a sprite at a world point: the
   * sprite is rasterized as seen along the actual ray to that point.
   */
  basisAt(x: number, y: number, z: number): ViewBasis {
    const fwd = vnorm({ x: x - this.pos.x, y: y - this.pos.y, z: z - this.pos.z });
    const right = vnorm(vcross(fwd, { x: 0, y: 0, z: 1 }));
    const up = vcross(right, fwd);
    const depth = (y - this.pos.y) * this.fwd.y + (z - this.pos.z) * this.fwd.z;
    return { right, up, fwd, s: this.F / depth };
  }
}
