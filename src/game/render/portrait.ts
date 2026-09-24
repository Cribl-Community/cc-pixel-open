/**
 * Front-on portrait rendering for menus: the same rig and renderer as the
 * match, seen through a simple fixed camera at a larger scale.
 */

import type { Projected, ViewBasis } from '../sim/camera';
import type { ViewCamera } from './playerRenderer';
import { Frame } from './frame';
import { buildPlayerMaterials, PlayerRenderer, type PlayerMaterials } from './playerRenderer';
import type { PlayerLook } from '../sim/roster';
import type { Pose } from '../art/playerRig';

export class PortraitCamera implements ViewCamera {
  private readonly basis: ViewBasis;
  readonly cx: number;
  readonly cy: number;
  readonly s: number;
  constructor(cx: number, cy: number, s: number, pitchDeg = 12) {
    this.cx = cx;
    this.cy = cy;
    this.s = s;
    const p = (pitchDeg * Math.PI) / 180;
    this.basis = {
      right: { x: 1, y: 0, z: 0 },
      up: { x: 0, y: Math.sin(p), z: Math.cos(p) },
      fwd: { x: 0, y: Math.cos(p), z: -Math.sin(p) },
      s,
    };
  }
  project(x: number, y: number, z: number, out: Projected = { sx: 0, sy: 0, depth: 0, s: 0 }) {
    const u = this.basis.up;
    out.sx = this.cx + x * this.s;
    out.sy = this.cy - (y * u.y + z * u.z) * this.s;
    out.depth = 10;
    out.s = this.s;
    return out;
  }
  basisAt(): ViewBasis {
    return this.basis;
  }
}

export class PortraitPainter {
  readonly frame: Frame;
  private readonly pr = new PlayerRenderer();
  private readonly cam: PortraitCamera;
  private mats: PlayerMaterials;
  readonly w: number;
  readonly h: number;
  private look: PlayerLook;
  constructor(w: number, h: number, look: PlayerLook, scale: number) {
    this.w = w;
    this.h = h;
    this.look = look;
    this.frame = new Frame(w, h);
    this.cam = new PortraitCamera(w / 2, h - 5, scale);
    this.mats = buildPlayerMaterials(look);
  }
  setLook(look: PlayerLook) {
    this.look = look;
    this.mats = buildPlayerMaterials(look);
  }
  draw(ctx: CanvasRenderingContext2D, pose: Pose, lefty: boolean, yaw = Math.PI) {
    this.frame.data.fill(0);
    this.pr.draw(this.frame, this.cam, {
      look: this.look,
      mats: this.mats,
      lefty,
      x: 0,
      y: 0,
      yaw,
      pose,
    });
    ctx.putImageData(this.frame.image, 0, 0);
  }
}
