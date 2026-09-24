/**
 * Pooled, allocation-free 3D particles: clay dust, chalk puffs from line
 * hits, grass clippings, power-shot sparks and trophy confetti. Positions are
 * world meters; each particle steps through a small color ramp as it ages.
 */

import { pack } from '../core/color';
import type { Camera } from '../sim/camera';
import type { Frame } from './frame';

const MAX = 900;

export const PKind = { Dust: 0, Chalk: 1, Grass: 2, Spark: 3, Confetti: 4, Sweat: 5 } as const;
export type PKind = (typeof PKind)[keyof typeof PKind];

const CONFETTI = ['#d6ef3a', '#f2c230', '#f28fb6', '#6fa4d8', '#f4f4f0', '#e0364a', '#3fb58a'].map(
  (c) => pack(c),
);
const CHALK = ['#ffffff', '#f2f2ee', '#d8d8d4'].map((c) => pack(c));
const SPARK = ['#ffffff', '#fff6a8', '#d6ef3a', '#8fd0ff'].map((c) => pack(c));
const SWEAT = ['#dff4ff', '#b8e4ff'].map((c) => pack(c));

export class Particles {
  readonly x = new Float32Array(MAX);
  readonly y = new Float32Array(MAX);
  readonly z = new Float32Array(MAX);
  readonly vx = new Float32Array(MAX);
  readonly vy = new Float32Array(MAX);
  readonly vz = new Float32Array(MAX);
  readonly life = new Float32Array(MAX);
  readonly maxLife = new Float32Array(MAX);
  readonly kind = new Uint8Array(MAX);
  readonly color = new Uint32Array(MAX);
  private next = 0;
  /** Ramp used by dust (set per venue: clay orange, hard-court grey…). */
  dust: number[] = [pack('#e0a080'), pack('#c8805a'), pack('#a8603e')];
  grass: number[] = [pack('#7ac25a'), pack('#4f9a3a'), pack('#3a7a2a')];

  spawn(
    kind: PKind,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
  ) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.kind[i] = kind;
    this.color[i] = kind === PKind.Confetti ? CONFETTI[i % CONFETTI.length] : 0;
  }

  burst(
    kind: PKind,
    x: number,
    y: number,
    z: number,
    n: number,
    speed: number,
    up: number,
    life: number,
  ) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.6);
      this.spawn(
        kind,
        x,
        y,
        z,
        Math.cos(a) * sp,
        Math.sin(a) * sp,
        up * (0.5 + Math.random()),
        life * (0.6 + Math.random() * 0.6),
      );
    }
  }

  update(dt: number) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = this.kind[i];
      if (k === PKind.Dust || k === PKind.Chalk) {
        const d = 1 - 3 * dt;
        this.vx[i] *= d;
        this.vy[i] *= d;
        this.vz[i] = this.vz[i] * d + 0.15 * dt;
      } else if (k === PKind.Confetti) {
        this.vz[i] -= 2.2 * dt;
        if (this.vz[i] < -1.2) this.vz[i] = -1.2;
        this.vx[i] += Math.sin(this.life[i] * 7 + i) * 2 * dt;
      } else {
        this.vz[i] -= 9.8 * dt;
      }
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.z[i] += this.vz[i] * dt;
      if (this.z[i] < 0) {
        this.z[i] = 0;
        if (k === PKind.Confetti) this.life[i] = Math.min(this.life[i], 2);
        this.vx[i] *= 0.5;
        this.vy[i] *= 0.5;
        this.vz[i] = 0;
      }
    }
  }

  draw(frame: Frame, cam: Camera) {
    const p = { sx: 0, sy: 0, depth: 0, s: 0 };
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      cam.project(this.x[i], this.y[i], this.z[i], p);
      const age = 1 - this.life[i] / this.maxLife[i];
      const k = this.kind[i];
      let c: number;
      let size = 1;
      if (k === PKind.Dust) {
        c = this.dust[Math.min(2, Math.floor(age * 3))];
        size = age < 0.4 && p.s > 16 ? 2 : 1;
      } else if (k === PKind.Chalk) c = CHALK[Math.min(2, Math.floor(age * 3))];
      else if (k === PKind.Grass) c = this.grass[i % 3];
      else if (k === PKind.Spark) c = SPARK[Math.min(3, Math.floor(age * 4))];
      else if (k === PKind.Sweat) c = SWEAT[i % 2];
      else c = this.color[i];
      if (k === PKind.Dust && age > 0.75 && i & 1) continue;
      const x = Math.round(p.sx);
      const y = Math.round(p.sy);
      frame.set(x, y, c);
      if (size === 2) {
        frame.set(x + 1, y, c);
        frame.set(x, y - 1, c);
      }
      if (k === PKind.Confetti && i & 1) frame.set(x + 1, y, c);
    }
  }

  clear() {
    this.life.fill(0);
  }
}
