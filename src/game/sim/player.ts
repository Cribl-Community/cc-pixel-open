/**
 * A player on court: movement (acceleration-limited, stat-driven), sprint
 * stamina, footwork events, and the swing/serve/gesture state that drives
 * the rig. Human and AI players share this; they only differ in who
 * supplies the movement input and shot decisions.
 */

import { approach, clamp, smoothstep, type V3 } from '../core/math';
import {
  blendPose,
  bouncePose,
  celebratePose,
  contactOffset,
  dejectedPose,
  locomotionPose,
  STROKES,
  strokePose,
  type Pose,
  type StrokeKind,
} from '../art/playerRig';
import { ARENA, COURT, facingYaw, forwardSign, type Side } from './court';
import type { PlayerDef, PlayerLook } from './roster';
import type { ShotKind } from './shots';

export interface Swing {
  stroke: StrokeKind;
  shot: ShotKind;
  /** Sim time of contact. */
  contactAt: number;
  startedAt: number;
  /** Seconds from start to contact (may be shorter than the stroke's `pre` when late). */
  pre: number;
  t: number;
  resolved: boolean;
  /** Retarget offset in the pose frame (m). */
  delta: V3;
  crouch: number;
  lift: number;
  /** Frozen contact estimate (last few frames before contact). */
  locked: boolean;
}

export type Gesture = 'celebrate' | 'dejected' | null;

export interface ServeAnim {
  phase: 'bounce' | 'toss' | 'swing' | 'done';
  t: number;
  /** Phase within the serve stroke (0..1). */
  st: number;
  bounceT: number;
}

export class PlayerBody {
  readonly idx: 0 | 1;
  readonly def: PlayerDef;
  look: PlayerLook;
  readonly lefty: boolean;
  side: Side;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  yaw: number;
  gait = 0;
  mode: 'ready' | 'idle' | 'walk' = 'ready';
  swing: Swing | null = null;
  serve: ServeAnim | null = null;
  gesture: Gesture = null;
  gestureT = 0;
  sprint = 1;
  sprinting = false;
  /** Power meter for the human (0..1). */
  charge = 0;
  armed: ShotKind | null = null;
  holding = false;
  /** World point the head looks at. */
  lookAt: V3 = { x: 0, y: 0, z: 1 };
  pose: Pose;
  sway = { x: 0, y: 0 };
  /** Auto-walk target (between points). */
  target: { x: number; y: number } | null = null;
  /** Face the camera (celebrating near player). */
  faceCamera = false;
  /** Footwork is automatic (auto-run): loading a shot doesn't slow the feet. */
  autoRun = false;
  maxSpeed: number;
  accel: number;
  /** Footstep callback: world position, whether sliding. */
  onStep?: (p: PlayerBody, slide: boolean) => void;
  private lastGaitHalf = 0;
  private hitStop = 0;

  constructor(idx: 0 | 1, def: PlayerDef, look: PlayerLook, side: Side) {
    this.idx = idx;
    this.def = def;
    this.look = look;
    this.lefty = def.hand === 'L';
    this.side = side;
    this.yaw = facingYaw(side);
    // Arcade-quick feet: 6.2–9.1 m/s flat out, and snappy starts and stops.
    this.maxSpeed = 5.9 + 0.32 * def.stats.speed;
    this.accel = 17 + 1.3 * def.stats.speed;
    this.pose = locomotionPose({ time: 0, phase: 0, speed: 0, dx: 0, dy: 0, mode: 'ready' });
  }

  get k() {
    return this.look.height / 1.8;
  }

  /** Scale top speed and acceleration (human players run faster). */
  tune(speedMul: number, accelMul: number) {
    this.maxSpeed *= speedMul;
    this.accel *= accelMul;
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  /** Where this player meets the ball for a stroke (world), from where they stand now. */
  contactPoint(stroke: StrokeKind): V3 {
    const o = contactOffset(stroke);
    const k = this.k;
    const lx = (this.lefty ? -o.x : o.x) * k;
    const ly = o.y * k;
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    return { x: this.x + lx * c - ly * s, y: this.y + lx * s + ly * c, z: o.z * k };
  }

  /** World → this player's body frame (x right, y forward). */
  toLocal(wx: number, wy: number): { x: number; y: number } {
    const dx = wx - this.x;
    const dy = wy - this.y;
    const c = Math.cos(-this.yaw);
    const s = Math.sin(-this.yaw);
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  }

  /** Body-frame direction → world. */
  toWorldDir(lx: number, ly: number): { x: number; y: number } {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    return { x: lx * c - ly * s, y: lx * s + ly * c };
  }

  /**
   * Move toward an input direction (world, magnitude ≤ 1).
   * `grip` < 1 on clay/grass makes starts and stops slower (and slides).
   */
  move(
    dt: number,
    ix: number,
    iy: number,
    wantSprint: boolean,
    grip: number,
    bounds: 'rally' | 'free',
  ) {
    const mag = Math.hypot(ix, iy);
    if (mag > 1) {
      ix /= mag;
      iy /= mag;
    }
    const swinging = !!this.swing && !this.swing.resolved;
    const serving = !!this.serve && this.serve.phase !== 'done';
    let top = this.maxSpeed;
    this.sprinting = wantSprint && this.sprint > 0.05 && mag > 0.2 && !serving;
    if (this.sprinting) {
      top *= 1.2;
      this.sprint = Math.max(0, this.sprint - dt * (0.42 - this.def.stats.stamina * 0.02));
    } else {
      this.sprint = Math.min(1, this.sprint + dt * (0.12 + this.def.stats.stamina * 0.012));
    }
    if (swinging) top *= 0.75;
    if (this.holding && !swinging && !this.autoRun) top *= 0.7;
    if (serving) top = 0;
    if (this.gesture) top *= 0.3;
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      top *= 0.2;
    }
    const tvx = ix * top;
    const tvy = iy * top;
    const dvx = tvx - this.vx;
    const dvy = tvy - this.vy;
    const dv = Math.hypot(dvx, dvy);
    // Braking is quicker than accelerating, both scaled by footing.
    const braking = this.vx * dvx + this.vy * dvy < 0;
    const a = this.accel * grip * (braking ? 1.35 : 1) * dt;
    if (dv > a) {
      this.vx += (dvx / dv) * a;
      this.vy += (dvy / dv) * a;
    } else {
      this.vx = tvx;
      this.vy = tvy;
    }
    // Hard braking on clay leaves a slide.
    if (braking && grip < 0.9 && this.speed > 3.2 && dv > 4 && Math.random() < dt * 14)
      this.onStep?.(this, true);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.clampToCourt(bounds);
    const sp = this.speed;
    // Gait: one cycle per ~1.35 m at speed, slower when shuffling.
    this.gait = (this.gait + (sp * dt) / (0.9 + sp * 0.12)) % 1;
    const half = Math.floor(this.gait * 2);
    if (half !== this.lastGaitHalf && sp > 0.8) this.onStep?.(this, false);
    this.lastGaitHalf = half;
    // Ponytails and braids lag behind the motion.
    this.sway.x = approach(this.sway.x, -this.vx * 0.03, dt * 1.5);
    this.sway.y = approach(this.sway.y, -this.vy * 0.03, dt * 1.5);
  }

  clampToCourt(bounds: 'rally' | 'free') {
    const xw = ARENA.xWall - 0.45;
    const yw = ARENA.yWall - 0.6;
    this.x = clamp(this.x, -xw, xw);
    if (bounds === 'rally') {
      if (this.side === 0) this.y = clamp(this.y, -yw, -0.35);
      else this.y = clamp(this.y, 0.35, yw);
    } else {
      this.y = clamp(this.y, -yw, yw);
    }
  }

  /** Brief slowdown after a big shot (recovery). */
  recoil(s: number) {
    this.hitStop = Math.max(this.hitStop, s);
  }

  // ---------------------------------------------------------------------------
  // Swings

  startSwing(stroke: StrokeKind, shot: ShotKind, now: number, contactAt: number) {
    const pre = Math.max(0.05, Math.min(STROKES[stroke].pre, contactAt - now));
    this.swing = {
      stroke,
      shot,
      contactAt,
      startedAt: now,
      pre,
      t: 0,
      resolved: false,
      delta: { x: 0, y: 0, z: 0 },
      crouch: 0,
      lift: shot === 'lob' ? 0.6 : 0,
      locked: false,
    };
  }

  /** Advance the swing phase from the clock. */
  updateSwing(now: number) {
    const sw = this.swing;
    if (!sw) return;
    const def = STROKES[sw.stroke];
    if (now < sw.contactAt) {
      const u = 1 - (sw.contactAt - now) / sw.pre;
      // Late starts skip the early takeback.
      const start = sw.pre < def.pre ? def.tc * (1 - sw.pre / def.pre) : 0;
      sw.t = start + (def.tc - start) * clamp(u, 0, 1);
    } else {
      sw.t = def.tc + ((now - sw.contactAt) / def.post) * (1 - def.tc);
      if (sw.t >= 1) this.swing = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Pose

  computePose(time: number, dt: number): Pose {
    const c = Math.cos(-this.yaw);
    const s = Math.sin(-this.yaw);
    const sp = this.speed;
    const dx = sp > 0.05 ? (this.vx * c - this.vy * s) / sp : 0;
    const dy = sp > 0.05 ? (this.vx * s + this.vy * c) / sp : 0;
    const legs = locomotionPose({
      time: time + this.idx * 1.7,
      phase: this.gait,
      speed: sp,
      dx: this.lefty ? -dx : dx,
      dy,
      mode:
        this.mode === 'ready'
          ? sp > 0.3
            ? 'run'
            : 'ready'
          : this.mode === 'walk'
            ? 'walk'
            : 'idle',
    });
    let pose = legs;
    if (this.serve && this.serve.phase !== 'done') {
      const sv = this.serve;
      if (sv.phase === 'bounce') {
        const h = Math.abs(Math.sin(sv.bounceT * Math.PI * 1.6));
        pose = bouncePose(h, time);
      } else {
        pose = strokePose('serve', sv.st, legs);
      }
    } else if (this.swing) {
      const sw = this.swing;
      const sp2 = strokePose(sw.stroke, sw.t, legs, {
        delta: sw.delta,
        crouch: sw.crouch,
        lift: sw.lift,
      });
      const w = smoothstep(0, 0.1, sw.t) * (1 - smoothstep(0.86, 1, sw.t));
      pose = blendPose(legs, sp2, w);
    } else if (this.gesture) {
      this.gestureT += dt;
      pose =
        this.gesture === 'celebrate'
          ? celebratePose(this.gestureT, legs)
          : dejectedPose(this.gestureT, legs);
    }
    // Look at the ball.
    if (!this.gesture) {
      const loc = this.toLocal(this.lookAt.x, this.lookAt.y);
      const lx = this.lefty ? -loc.x : loc.x;
      const ang = Math.atan2(-lx, Math.max(0.2, loc.y));
      const dist = Math.hypot(loc.x, loc.y);
      pose = {
        ...pose,
        headYaw: clamp(ang - pose.torsoYaw, -1.1, 1.1) * 0.8,
        headPitch: clamp(Math.atan2(this.lookAt.z - 1.6, Math.max(1, dist)), -0.6, 0.7),
      };
    }
    this.pose = pose;
    return pose;
  }

  /** Face the net (or the camera). */
  settleYaw(dt: number) {
    const base = facingYaw(this.side);
    let target = base;
    if (this.faceCamera && this.side === 0) target = Math.PI;
    if (this.mode === 'walk' && this.speed > 0.5 && !this.faceCamera)
      target = Math.atan2(-this.vx, this.vy);
    let d = target - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * 8);
  }

  /** Direction toward the opponent's baseline (world y sign). */
  get fwd() {
    return forwardSign(this.side);
  }

  /** Singles court edge helper for AI/targets. */
  static readonly SW = COURT.SW;
}
