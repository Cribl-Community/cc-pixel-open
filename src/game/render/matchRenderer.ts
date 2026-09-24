/**
 * Composites a match frame in software: stadium background, animated LED
 * boards, the crowd, shadows on the court, depth-sorted players / ball kids /
 * net / umpire chair, the ball with its motion trail, particles and the
 * in-canvas power meter. One putImageData per frame.
 */

import { mix, pack } from '../core/color';
import { drawTextPx, textWidth } from '../core/pixelFont';
import { RAMPS } from '../core/palette';
import { clamp, type V3 } from '../core/math';
import { Crowd } from '../art/crowd';
import { CRIBL } from '../art/cribl';
import { goatify } from '../art/goat';
import {
  drawBox,
  paintBoardContent,
  paintStadium,
  PAN,
  type BoardPanel,
  type Stadium,
} from '../art/stadium';
import { locomotionPose, type Pose } from '../art/playerRig';
import { Camera } from '../sim/camera';
import { COURT } from '../sim/court';
import type { CountryCode, PlayerLook } from '../sim/roster';
import type { VenueDef } from '../sim/venues';
import { Frame, mixPacked, scalePacked } from './frame';
import { Particles } from './particles';
import { buildPlayerMaterials, PlayerRenderer, type PlayerMaterials } from './playerRenderer';

export interface RenderPlayer {
  x: number;
  y: number;
  yaw: number;
  pose: Pose;
  look: PlayerLook;
  mats: PlayerMaterials;
  lefty: boolean;
  sway: { x: number; y: number };
  hidden?: boolean;
}

export interface RenderBall {
  x: number;
  y: number;
  z: number;
  visible: boolean;
  /** Recent positions, newest last: [x, y, z, ...]. */
  trail: number[];
  power: boolean;
}

export interface RenderKid {
  x: number;
  y: number;
  yaw: number;
  pose: Pose;
  look: PlayerLook;
  mats: PlayerMaterials;
}

export interface MeterState {
  /** World position of the player the meter hangs beside. */
  x: number;
  y: number;
  value: number;
  /** Highlighted sweet zone (serve timing). */
  sweet?: [number, number];
  /** Flashes when the shot fires. */
  fired?: boolean;
}

export interface RenderState {
  time: number;
  panX: number;
  shake: number;
  players: RenderPlayer[];
  ball: RenderBall;
  kids: RenderKid[];
  umpirePose: Pose;
  meter: MeterState | null;
  /** Mouse aim point on the court; `hot` while a shot is loaded. */
  aim: { x: number; y: number; hot: boolean } | null;
  speedText: string;
  ledMessage: string | null;
  /** Flash of white over the frame (0..1), e.g. for a camera-flash finale. */
  flash: number;
}

const UMP_X = -(COURT.DW + 1.45);
const UMP_Y = 0.35;

interface Sprite {
  data: Uint32Array;
  w: number;
  h: number;
  x: number;
  y: number;
}

function crop(buf: Uint32Array, bw: number, bh: number): Sprite {
  let x0 = bw;
  let y0 = bh;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++)
      if (buf[y * bw + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return { data: new Uint32Array(1), w: 1, h: 1, x: 0, y: 0 };
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const data = new Uint32Array(w * h);
  for (let y = 0; y < h; y++)
    data.set(buf.subarray((y0 + y) * bw + x0, (y0 + y) * bw + x0 + w), y * w);
  return { data, w, h, x: x0, y: y0 };
}

export class MatchRenderer {
  readonly W: number;
  readonly H: number;
  readonly frame: Frame;
  readonly cam: Camera;
  readonly stadium: Stadium;
  readonly crowd: Crowd;
  readonly particles = new Particles();
  readonly venue: VenueDef;
  private readonly pr = new PlayerRenderer();
  private chairBack: Sprite;
  private chairFront: Sprite;
  readonly umpireLook: PlayerLook;
  private umpireMats: PlayerMaterials;
  private ballRamp: number[];
  private shadowTint: number;
  private readonly ledOn: number[];
  private readonly ledDim: number;
  private readonly ledOff: number;
  private readonly speedDigits: number;
  private readonly sparkColors: number[];
  marks = 0;

  constructor(
    venue: VenueDef,
    W: number,
    H: number,
    countries: [CountryCode, CountryCode],
    seed = 1,
    goats = false,
  ) {
    this.venue = venue;
    this.W = W;
    this.H = H;
    this.frame = new Frame(W, H);
    this.cam = new Camera(W, H);
    this.stadium = paintStadium(venue, W, H, seed);
    this.crowd = new Crowd(this.stadium, countries, seed, goats);
    this.ballRamp = RAMPS.ball.map((c) => pack(c));
    this.shadowTint = pack(venue.colors.shade);
    this.ledOn = [CRIBL.cyan, CRIBL.orange, CRIBL.teal, CRIBL.mint, CRIBL.white].map((c) =>
      pack(c),
    );
    this.ledDim = pack('#0a1a2a');
    this.ledOff = pack('#020a14');
    this.speedDigits = pack(CRIBL.orange);
    this.sparkColors = [CRIBL.teal, CRIBL.cyan, CRIBL.white, CRIBL.lavender, CRIBL.mint].map((c) =>
      pack(c),
    );
    if (venue.surface === 'clay')
      this.particles.dust = ['#e8a07a', '#d0805a', '#b0643e'].map((c) => pack(c));
    else if (venue.surface === 'grass')
      this.particles.dust = ['#c8d8a0', '#a8c080', '#90a868'].map((c) => pack(c));
    else this.particles.dust = ['#d8dce4', '#b8bcc8', '#9aa0ac'].map((c) => pack(c));

    // Umpire chair, split so the desk panel can sit in front of the umpire.
    const { bw, bh } = this.stadium;
    const bgCam = new Camera(bw, bh);
    const back = new Uint32Array(bw * bh);
    const front = new Uint32Array(bw * bh);
    const col = venue.colors.chair;
    const lit = (hex: string, k = 1) =>
      scalePacked(pack(hex), this.stadium.lightAt(UMP_X, UMP_Y, 1.5) * k);
    const box = (
      buf: Uint32Array,
      x0: number,
      x1: number,
      y0: number,
      y1: number,
      z0: number,
      z1: number,
      hex: string,
    ) =>
      drawBox(
        buf,
        bw,
        bh,
        bgCam,
        UMP_X + x0,
        UMP_X + x1,
        UMP_Y + y0,
        UMP_Y + y1,
        z0,
        z1,
        lit(mix(hex, '#ffffff', 0.18)),
        lit(hex),
        lit(mix(hex, '#000000', 0.3)),
      );
    for (const [lx, ly] of [
      [-0.3, -0.3],
      [0.22, -0.3],
      [-0.3, 0.22],
      [0.22, 0.22],
    ])
      box(back, lx, lx + 0.08, ly, ly + 0.08, 0, 1.85, col);
    box(back, -0.2, 0.15, -0.28, -0.26, 0.4, 0.45, col);
    box(back, -0.2, 0.15, -0.28, -0.26, 0.9, 0.95, col);
    box(back, -0.2, 0.15, -0.28, -0.26, 1.4, 1.45, col);
    box(back, -0.36, 0.34, -0.36, 0.34, 1.85, 1.98, col);
    box(back, -0.4, -0.3, -0.36, 0.34, 1.98, 2.55, col);
    box(front, 0.28, 0.36, -0.36, 0.34, 1.98, 2.3, mix(col, '#ffffff', 0.1));
    this.chairBack = crop(back, bw, bh);
    this.chairFront = crop(front, bw, bh);
    const umpire: PlayerLook = {
      skin: 'skinLight',
      hair: 'hairGrey',
      hairStyle: 'short',
      headwear: { kind: 'none' },
      top: { color: CRIBL.navy2, trim: CRIBL.teal, style: 'polo' },
      bottom: { color: '#e8e2d0', style: 'shorts' },
      socks: '#1a1a22',
      shoes: '#1a1a22',
      racket: { frame: '#000000', accent: '#000000' },
      height: 1.78,
      build: 1,
    };
    this.umpireLook = goats ? goatify(umpire) : umpire;
    this.umpireMats = buildPlayerMaterials(this.umpireLook);
  }

  /** Paint a ball mark into the background (clay). */
  markCourt(x: number, y: number) {
    if (this.venue.surface !== 'clay') return;
    const { bg, bw } = this.stadium;
    const cam = new Camera(bw, this.H);
    const p = cam.project(x, y, 0);
    const cx = Math.round(p.sx);
    const cy = Math.round(p.sy);
    const i = cy * bw + cx;
    if (cx < 1 || cy < 1 || cx >= bw - 2 || cy >= this.H - 1) return;
    const dark = pack('#8e3f22');
    const rim = pack('#dc8a64');
    bg[i] = mixPacked(bg[i], dark, 0.55);
    bg[i + 1] = mixPacked(bg[i + 1], dark, 0.45);
    bg[i - 1] = mixPacked(bg[i - 1], rim, 0.4);
    bg[i + 2] = mixPacked(bg[i + 2], rim, 0.3);
    this.marks++;
  }

  /** Scuff marks from sliding feet (clay) — a short streak. */
  slideMark(x: number, y: number, dx: number, dy: number) {
    if (this.venue.surface !== 'clay') return;
    for (let k = 0; k < 3; k++) this.markCourt(x - dx * k * 0.12, y - dy * k * 0.12);
  }

  sweep() {
    this.stadium.bg.set(this.stadium.clean);
    this.marks = 0;
  }

  project(x: number, y: number, z: number) {
    return this.cam.project(x, y, z);
  }

  render(ctx: CanvasRenderingContext2D, st: RenderState) {
    const { frame, cam, stadium, W, H } = this;
    const panX = Math.round(clamp(st.panX, -PAN, PAN));
    cam.panX = panX;
    const shake = st.shake > 0 ? Math.round((Math.random() - 0.5) * 2 * st.shake) : 0;
    cam.shakeX = shake;
    cam.shakeY = st.shake > 0 ? Math.round((Math.random() - 0.5) * st.shake) : 0;
    const ox = -PAN + panX + shake;
    const { bg, bw } = stadium;
    const data = frame.data;

    // 1. Background.
    for (let y = 0; y < H; y++) {
      const sy = Math.min(H - 1, Math.max(0, y - cam.shakeY));
      const src = sy * bw - ox;
      data.set(bg.subarray(src, src + W), y * W);
    }

    // 2. Boards.
    this.drawBoards(st, ox);

    // 3. Crowd.
    this.crowd.draw(data, W, H, ox, st.time);

    // 4. Shadows.
    for (const p of st.players) if (!p.hidden) this.blobShadow(p.x, p.y, 0.42, 0.28, 0.9);
    for (const k of st.kids) this.blobShadow(k.x, k.y, 0.3, 0.2, 0.7);
    if (st.ball.visible) this.ballShadow(st.ball);
    if (st.aim) this.drawAim(st.aim, st.time);

    // 5. Depth-sorted objects (far to near).
    type D = { y: number; draw: () => void };
    const list: D[] = [];
    for (const p of st.players) {
      if (p.hidden) continue;
      list.push({
        y: p.y,
        draw: () =>
          this.pr.draw(frame, cam, {
            look: p.look,
            mats: p.mats,
            lefty: p.lefty,
            x: p.x,
            y: p.y,
            yaw: p.yaw,
            pose: p.pose,
            sway: p.sway,
          }),
      });
    }
    for (const k of st.kids)
      list.push({
        y: k.y,
        draw: () =>
          this.pr.draw(frame, cam, {
            look: k.look,
            mats: k.mats,
            lefty: false,
            x: k.x,
            y: k.y,
            yaw: k.yaw,
            pose: k.pose,
            noRacket: true,
            scale: 0.8,
          }),
      });
    list.push({
      y: 0,
      draw: () => {
        const n = stadium.net;
        frame.blit(n.data, n.w, n.h, n.x + ox, n.y + cam.shakeY);
      },
    });
    list.push({
      y: UMP_Y,
      draw: () => {
        frame.blit(
          this.chairBack.data,
          this.chairBack.w,
          this.chairBack.h,
          this.chairBack.x + ox,
          this.chairBack.y + cam.shakeY,
        );
        this.pr.draw(frame, cam, {
          look: this.umpireLook,
          mats: this.umpireMats,
          lefty: false,
          x: UMP_X,
          y: UMP_Y,
          yaw: -Math.PI / 2,
          pose: st.umpirePose,
          noRacket: true,
        });
        frame.blit(
          this.chairFront.data,
          this.chairFront.w,
          this.chairFront.h,
          this.chairFront.x + ox,
          this.chairFront.y + cam.shakeY,
        );
      },
    });
    if (st.ball.visible) list.push({ y: st.ball.y, draw: () => this.drawBall(st.ball) });
    list.sort((a, b) => b.y - a.y);
    for (const d of list) d.draw();

    // 6. Particles, CriblCon magic and the meter.
    this.particles.draw(frame, cam);
    if (this.venue.magic) this.drawMagic(st.time);
    if (st.meter) this.drawMeter(st.meter, st.time);

    if (st.flash > 0) {
      const k = Math.min(1, st.flash);
      for (let i = 0; i < data.length; i++) data[i] = mixPacked(data[i], 0xffffffff, k);
    }
    ctx.putImageData(frame.image, 0, 0);
  }

  // ---- pieces --------------------------------------------------------------

  private blobShadow(x: number, y: number, rx: number, ry: number, strength: number) {
    const v = this.venue;
    const sun = v.sun;
    const casts: [number, number, number][] = sun
      ? [[x - (sun.x / sun.z) * 0.45, y - (sun.y / sun.z) * 0.45, strength]]
      : v.light === 'night'
        ? [
            [x - 0.28, y - 0.2, strength * 0.55],
            [x + 0.28, y - 0.2, strength * 0.55],
            [x, y + 0.25, strength * 0.4],
          ]
        : [[x, y, strength * 0.9]];
    for (const [cx, cy, k] of casts) this.groundEllipse(cx, cy, rx, ry, 0.42 * k);
  }

  private groundEllipse(cx: number, cy: number, rx: number, ry: number, amount: number) {
    const { cam, frame } = this;
    const a = cam.project(cx - rx, cy + ry, 0);
    const b = cam.project(cx + rx, cy - ry, 0);
    const x0 = Math.max(0, Math.floor(a.sx) - 1);
    const x1 = Math.min(this.W - 1, Math.ceil(b.sx) + 1);
    const y0 = Math.max(0, Math.floor(a.sy) - 1);
    const y1 = Math.min(this.H - 1, Math.ceil(b.sy) + 1);
    const pos = cam.pos;
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const d = cam.ray(px + 0.5 - cam.panX - cam.shakeX, py + 0.5 - cam.shakeY);
        if (d.z >= 0) continue;
        const t = -pos.z / d.z;
        const gx = (pos.x + d.x * t - cx) / rx;
        const gy = (pos.y + d.y * t - cy) / ry;
        if (gx * gx + gy * gy > 1) continue;
        frame.tint(px, py, this.shadowTint, amount);
      }
    }
  }

  private ballShadow(b: RenderBall) {
    const sun = this.venue.sun;
    const off = sun ? b.z / Math.max(0.3, sun.z) : 0;
    const sx = sun ? b.x - sun.x * off : b.x;
    const sy = sun ? b.y - sun.y * off : b.y;
    const r = 0.07 + Math.min(0.05, b.z * 0.01);
    this.groundEllipse(sx, sy, r * 1.3, r, 0.5);
    if (!sun && this.venue.light === 'night') this.groundEllipse(b.x, b.y, r, r * 0.8, 0.25);
  }

  private drawBall(b: RenderBall) {
    const { cam, frame } = this;
    // Motion trail.
    const tr = b.trail;
    const n = tr.length / 3;
    for (let k = 0; k < n - 1; k++) {
      const p = cam.project(tr[k * 3], tr[k * 3 + 1], tr[k * 3 + 2]);
      const age = (n - 1 - k) / n;
      const c = b.power
        ? mixPacked(pack('#8fd0ff'), 0xffffffff, 1 - age)
        : mixPacked(this.ballRamp[2], this.ballRamp[1], age);
      frame.set(Math.round(p.sx), Math.round(p.sy), c);
    }
    const p = cam.project(b.x, b.y, b.z);
    const d = p.s > 17 ? 4 : 3;
    const x0 = Math.round(p.sx - d / 2);
    const y0 = Math.round(p.sy - d / 2);
    const R = this.ballRamp;
    // Outline, then shaded disk with a top-left highlight.
    const mask4 = ['.##.', '####', '####', '.##.'];
    const mask3 = ['.#.', '###', '.#.'];
    const mask = d === 4 ? mask4 : mask3;
    for (let y = -1; y <= d; y++)
      for (let x = -1; x <= d; x++) {
        const inside = y >= 0 && x >= 0 && y < d && x < d && mask[y][x] === '#';
        if (inside) continue;
        const nb = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ].some(([u, v]) => u >= 0 && v >= 0 && u < d && v < d && mask[v][u] === '#');
        if (nb) frame.set(x0 + x, y0 + y, R[0]);
      }
    for (let y = 0; y < d; y++)
      for (let x = 0; x < d; x++) {
        if (mask[y][x] !== '#') continue;
        const l = x + y;
        const c = l <= 1 ? R[4] : l <= d - 1 ? R[3] : R[2];
        frame.set(x0 + x, y0 + y, b.power ? mixPacked(c, pack('#bfe8ff'), 0.35) : c);
      }
  }

  /** A flat target ring on the court where the shot is aimed. */
  private drawAim(a: { x: number; y: number; hot: boolean }, time: number) {
    const { cam, frame } = this;
    const hot = a.hot;
    const c = hot ? pack('#d6ef3a') : pack('#f6f3ea');
    const dark = pack('#0b0d12');
    const r = hot ? 0.42 + Math.sin(time * 12) * 0.06 : 0.36;
    const p = { sx: 0, sy: 0, depth: 0, s: 0 };
    const n = 28;
    for (let k = 0; k < n; k++) {
      // Dashed ring: skip every fourth dot so it reads as a target, not a ball.
      if (!hot && k % 4 === 3) continue;
      const t = (k / n) * Math.PI * 2;
      cam.project(a.x + Math.cos(t) * r, a.y + Math.sin(t) * r * 0.9, 0, p);
      const x = Math.round(p.sx);
      const y = Math.round(p.sy);
      frame.set(x, y + 1, dark);
      frame.set(x, y, c);
    }
    cam.project(a.x, a.y, 0, p);
    const cx = Math.round(p.sx);
    const cy = Math.round(p.sy);
    frame.set(cx, cy, c);
    if (hot) {
      frame.set(cx - 1, cy, c);
      frame.set(cx + 1, cy, c);
    }
  }

  private drawMeter(m: MeterState, time: number) {
    const p = this.cam.project(m.x, m.y, 0);
    const h = 22;
    const w = 4;
    const x0 = Math.round(p.sx + p.s * 0.75);
    const y0 = Math.round(p.sy - h - 2);
    const f = this.frame;
    const frameC = pack('#1a1f2e');
    const edge = pack('#8a94ad');
    for (let y = -1; y <= h; y++) {
      f.set(x0 - 1, y0 + y, edge);
      f.set(x0 + w, y0 + y, edge);
    }
    for (let x = -1; x <= w; x++) {
      f.set(x0 + x, y0 - 1, edge);
      f.set(x0 + x, y0 + h, edge);
    }
    const lit = Math.round(clamp(m.value, 0, 1) * h);
    const cyan = '#5fe8ff';
    const pink = '#ff6fb8';
    for (let i = 0; i < h; i++) {
      const y = y0 + h - 1 - i;
      const t = i / (h - 1);
      const inSweet = m.sweet && t >= m.sweet[0] && t <= m.sweet[1];
      let c: number;
      if (i < lit) c = pack(mix(cyan, pink, t));
      else c = inSweet ? pack('#3a4a2a') : frameC;
      if (m.fired && i < lit && Math.floor(time * 20) % 2) c = 0xffffffff;
      for (let x = 0; x < w; x++)
        f.set(x0 + x, y, i & 1 && i < lit ? mixPacked(c, 0xff000000, 0.15) : c);
      if (inSweet) {
        f.set(x0 - 2, y, pack('#d6ef3a'));
      }
    }
  }

  private drawBoards(st: RenderState, ox: number) {
    const { frame, stadium, venue } = this;
    const data = frame.data;
    const W = this.W;
    const H = this.H;
    const shifted = (b: BoardPanel): BoardPanel => ({ ...b, x0: b.x0 + ox, x1: b.x1 + ox });
    const dim = (b: BoardPanel) => {
      for (let y = b.y0; y <= b.y1; y++)
        for (let x = b.x0; x <= b.x1; x++)
          if (x >= 0 && x < W && y >= 0 && y < H)
            data[y * W + x] = (x + y) & 1 ? this.ledDim : this.ledOff;
    };
    const draw = (b: BoardPanel, text: string, color: number, scroll = -1) => {
      const h = b.y1 - b.y0;
      const scale = h >= 13 && textWidth(text, 2) < b.x1 - b.x0 - 2 ? 2 : 1;
      const tw = textWidth(text, scale);
      // Scrolling messages enter from the right and run off the left.
      const cx =
        scroll >= 0 ? b.x1 - ((scroll * 28) % (tw + (b.x1 - b.x0))) + tw / 2 : (b.x0 + b.x1) / 2;
      drawTextPx(data, W, H, text, cx, b.y0 + Math.floor((h - 5 * scale) / 2), color, {
        align: 'center',
        scale,
        clip: [Math.max(0, b.x0), Math.max(0, b.y0), Math.min(W, b.x1 + 1), Math.min(H, b.y1 + 1)],
      });
    };
    const light = stadium.lightAt(0, stadium.speedBoard.y0, 0.5);
    // Speed gun board (always electronic).
    const speed = shifted(stadium.speedBoard);
    dim(speed);
    draw(speed, st.speedText, scalePacked(this.speedDigits, Math.max(0.8, light)));
    if (!venue.led) return;
    const phase = Math.max(0, Math.floor(st.time / 4));
    const panels = stadium.boards.filter((b) => b !== stadium.speedBoard);
    // Every third beat one board runs a scrolling Cribl Apps message.
    const tickerAt = phase % 3 === 2 && venue.ticker.length ? phase % panels.length : -1;
    panels.forEach((raw, i) => {
      const b = shifted(raw);
      dim(b);
      if (st.ledMessage) {
        const c = this.ledOn[Math.floor(st.time * 4) % 2 ? 1 : 2];
        draw(b, st.ledMessage, c);
      } else if (i === tickerAt) {
        const msg = venue.ticker[Math.floor(phase / 3) % venue.ticker.length];
        draw(b, msg, this.ledOn[phase % this.ledOn.length], st.time - phase * 4);
      } else {
        const def = venue.boards[(i + phase) % venue.boards.length];
        paintBoardContent(data, W, H, b, def, pack(def.fg), pack(def.markColor ?? def.fg));
      }
    });
  }

  /** CriblCon: sparks drifting up through the floodlights. */
  private drawMagic(time: number) {
    const { cam, frame } = this;
    const p = { sx: 0, sy: 0, depth: 0, s: 0 };
    for (let i = 0; i < 46; i++) {
      const a = (i * 0.6180339887) % 1;
      const b = (i * 0.7548776662) % 1;
      const period = 7 + b * 6;
      const t = (time + a * period) % period;
      const x = (a - 0.5) * 22 + Math.sin(time * 0.7 + i) * 0.6;
      const y = (b - 0.5) * 34;
      const z = 0.3 + (t / period) * 6.5;
      cam.project(x, y, z, p);
      const px = Math.round(p.sx);
      const py = Math.round(p.sy);
      const tw = Math.sin(time * (3 + b * 4) + i * 1.7);
      if (tw < -0.2) continue;
      const c = this.sparkColors[i % this.sparkColors.length];
      frame.set(px, py, c);
      if (tw > 0.75) {
        // A four-point twinkle at its brightest.
        const dimC = mixPacked(c, 0xff000000, 0.35);
        frame.set(px - 1, py, dimC);
        frame.set(px + 1, py, dimC);
        frame.set(px, py - 1, dimC);
        frame.set(px, py + 1, dimC);
      }
    }
  }
}

/** Ball kid & umpire poses. */
export function kneelPose(time: number): Pose {
  const base = locomotionPose({ time, phase: 0, speed: 0, dx: 0, dy: 0, mode: 'idle' });
  return {
    ...base,
    pelvis: { x: 0, y: -0.05, z: 0.5 },
    lean: 0.35,
    footL: { x: -0.12, y: 0.32, z: 0 },
    footR: { x: 0.14, y: -0.42, z: 0.02 },
    handL: { x: -0.12, y: 0.35, z: 0.6 },
    handR: { x: 0.12, y: 0.3, z: 0.62 },
    headPitch: 0.1,
  };
}

export function standBackPose(time: number): Pose {
  const base = locomotionPose({ time, phase: 0, speed: 0, dx: 0, dy: 0, mode: 'idle' });
  return {
    ...base,
    handL: { x: -0.08, y: -0.22, z: 0.85 },
    handR: { x: 0.08, y: -0.22, z: 0.85 },
  };
}

export function umpirePose(time: number, lookYaw: number): Pose {
  const base = locomotionPose({ time, phase: 0, speed: 0, dx: 0, dy: 0, mode: 'idle' });
  return {
    ...base,
    pelvis: { x: 0, y: -0.05, z: 2.05 },
    lean: 0.08,
    footL: { x: -0.12, y: 0.32, z: 1.45 },
    footR: { x: 0.12, y: 0.32, z: 1.45 },
    handL: { x: -0.12, y: 0.35, z: 2.12 },
    handR: { x: 0.14, y: 0.35, z: 2.12 },
    headYaw: clamp(lookYaw, -1.2, 1.2),
    headPitch: -0.15,
  };
}

export const V0: V3 = { x: 0, y: 0, z: 0 };
