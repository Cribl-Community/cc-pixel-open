/**
 * The crowd: every occupied seat holds a little pixel spectator with their
 * own skin, hair, hat, shirt and sometimes a flag, a phone or an umbrella.
 * In goat mode the stands fill with goats instead: horns, ears, beards.
 * Heads follow the ball with a personal lag (so the side stands do the
 * famous tennis head-turn), and the crowd claps, oohs, groans, jumps up for
 * big points and even starts a wave at the changeover.
 */

import { mix, pack } from '../core/color';
import { makeRng, pick, range } from '../core/rng';
import { RAMPS } from '../core/palette';
import type { Seat, Stadium } from './stadium';
import type { VenueDef } from '../sim/venues';
import { scalePacked } from '../render/frame';
import { FLAGS } from './flags';
import type { CountryCode } from '../sim/roster';

export type CrowdMood =
  'watch' | 'quiet' | 'applause' | 'ovation' | 'ooh' | 'groan' | 'wave' | 'standing';

const SKINS = [
  RAMPS.skinPale,
  RAMPS.skinLight,
  RAMPS.skinTan,
  RAMPS.skinOlive,
  RAMPS.skinBrown,
  RAMPS.skinDeep,
];
const HAIRS = [
  RAMPS.hairBlack,
  RAMPS.hairBrown,
  RAMPS.hairChestnut,
  RAMPS.hairBlond,
  RAMPS.hairGrey,
  RAMPS.hairPlatinum,
];
const FORMAL = ['#1c2a55', '#2a2a33', '#4a4a55', '#e8e2d0', '#8a8f9a'];
/** Goat coats, weighted toward the classic white dairy goat. */
const COATS = [
  '#f2efe6',
  '#f2efe6',
  '#f2efe6',
  '#e0d2b0',
  '#b98a5a',
  '#6b4a2e',
  '#2f2a2c',
  '#9a9a94',
];

/** Ball position history (for staggered head tracking). */
const HIST = 48;

export class Crowd {
  readonly n: number;
  private readonly seats: Seat[];
  // Per-spectator looks (packed colors pre-lit by the seat's light level).
  private skin: Uint32Array;
  private skinD: Uint32Array;
  private hair: Uint32Array;
  private shirt: Uint32Array;
  private shirtD: Uint32Array;
  private hat: Uint32Array;
  private hatKind: Uint8Array;
  private hairLong: Uint8Array;
  private prop: Uint8Array;
  private fan: Int8Array;
  private phase: Float32Array;
  private delay: Uint8Array;
  private zeal: Float32Array;
  // Per-spectator state.
  private up: Float32Array;
  private look: Float32Array;
  private flash: Float32Array;
  private readonly eye: number;
  private readonly goats: boolean;
  private beard: Uint32Array;
  private nose: Uint32Array;
  private readonly flagColors: [number[], number[]];
  private readonly umbrellaColors: number[];
  private readonly phoneGlow: number;
  private readonly dark: number;
  // Ball history ring.
  private hx = new Float32Array(HIST);
  private hy = new Float32Array(HIST);
  private hsx = new Float32Array(HIST);
  private hi = 0;
  // Mood.
  mood: CrowdMood = 'watch';
  private moodT = 0;
  private intensity = 0;
  /** Which player the current reaction favors (for flag wavers). */
  private favor: 0 | 1 | -1 = -1;
  excitement = 0.2;
  private night: boolean;

  constructor(stadium: Stadium, countries: [CountryCode, CountryCode], seed = 1, goats = false) {
    const v: VenueDef = stadium.venue;
    this.seats = stadium.seats;
    this.goats = goats;
    const n = (this.n = this.seats.length);
    this.beard = new Uint32Array(n);
    this.nose = new Uint32Array(n);
    this.skin = new Uint32Array(n);
    this.skinD = new Uint32Array(n);
    this.hair = new Uint32Array(n);
    this.shirt = new Uint32Array(n);
    this.shirtD = new Uint32Array(n);
    this.hat = new Uint32Array(n);
    this.hatKind = new Uint8Array(n);
    this.hairLong = new Uint8Array(n);
    this.prop = new Uint8Array(n);
    this.fan = new Int8Array(n);
    this.phase = new Float32Array(n);
    this.delay = new Uint8Array(n);
    this.zeal = new Float32Array(n);
    this.up = new Float32Array(n);
    this.look = new Float32Array(n);
    this.flash = new Float32Array(n);
    this.night = v.light === 'night' || v.light === 'indoor';
    this.eye = pack('#140d0a');
    this.dark = pack('#0c0c10');
    this.phoneGlow = pack('#e8f4ff');
    this.flagColors = [
      FLAGS[countries[0]].stripes.map((c) => pack(c)),
      FLAGS[countries[1]].stripes.map((c) => pack(c)),
    ];
    this.umbrellaColors = ['#d8263a', '#f4f4f0', '#2352c4', '#f2d027', '#3fb58a'].map((c) =>
      pack(c),
    );
    const rng = makeRng(seed * 31 + 5);
    const c = v.crowd;
    for (let i = 0; i < n; i++) {
      const L = this.seats[i].light;
      const lit = (hex: string) => scalePacked(pack(hex), L);
      const sk = pick(rng, SKINS);
      this.skin[i] = lit(sk[3]);
      this.skinD[i] = lit(sk[2]);
      this.hair[i] = lit(pick(rng, HAIRS)[rng() < 0.5 ? 2 : 3]);
      const shirtHex = rng() < c.formal ? pick(rng, FORMAL) : pick(rng, c.shirts);
      this.shirt[i] = lit(shirtHex);
      this.shirtD[i] = lit(mix(shirtHex, '#000000', 0.3));
      if (rng() < c.hats) {
        this.hatKind[i] = rng() < 0.5 ? 1 : 2;
        this.hat[i] = lit(pick(rng, c.hatColors));
      }
      this.hairLong[i] = rng() < 0.35 ? 1 : 0;
      if (goats) {
        // Skin becomes the coat, hair the horns; no hats over the horns.
        const coat = pick(rng, COATS);
        const light = coat === '#f2efe6' || coat === '#e0d2b0' || coat === '#9a9a94';
        this.skin[i] = lit(coat);
        this.skinD[i] = lit(mix(coat, '#000000', 0.25));
        this.hair[i] = lit(light ? '#9a8866' : '#d8c7a2');
        this.beard[i] = lit(mix(coat, light ? '#6b5a44' : '#000000', 0.45));
        this.nose[i] = lit(light ? '#c99a92' : '#1a1618');
        this.hatKind[i] = 0;
        this.hairLong[i] = 0;
      }
      const r = rng();
      if (r < c.umbrellas) this.prop[i] = 3;
      else if (r < c.umbrellas + c.phones) this.prop[i] = 2;
      else if (r < c.umbrellas + c.phones + c.flags) this.prop[i] = 1;
      this.fan[i] = rng() < 0.5 ? 0 : 1;
      this.phase[i] = rng() * Math.PI * 2;
      this.delay[i] = Math.floor(range(rng, 2, HIST - 2));
      this.zeal[i] = range(rng, 0.25, 1);
    }
  }

  /** Trigger a reaction. `intensity` 0..1 scales how many join in and for how long. */
  react(mood: CrowdMood, intensity = 0.6, favor: 0 | 1 | -1 = -1) {
    this.mood = mood;
    this.moodT = 0;
    this.intensity = intensity;
    this.favor = favor;
    if (mood === 'ovation' || mood === 'standing')
      this.excitement = Math.min(1, this.excitement + 0.3);
    if (this.night && (mood === 'ovation' || mood === 'standing' || mood === 'applause')) {
      for (let i = 0; i < this.n; i++)
        if (Math.random() < 0.02 * intensity) this.flash[i] = 0.08 + Math.random() * 0.5;
    }
  }

  update(dt: number, ballX: number, ballY: number, ballSX: number) {
    this.hi = (this.hi + 1) % HIST;
    this.hx[this.hi] = ballX;
    this.hy[this.hi] = ballY;
    this.hsx[this.hi] = ballSX;
    this.moodT += dt;
    this.excitement = Math.max(0.15, this.excitement - dt * 0.03);
    const mood = this.mood;
    const t = this.moodT;
    // Reactions wind down on their own.
    const dur =
      mood === 'applause'
        ? 1.6 + this.intensity * 2
        : mood === 'ovation'
          ? 3.2
          : mood === 'standing'
            ? 6
            : mood === 'ooh'
              ? 1.2
              : mood === 'groan'
                ? 1.4
                : mood === 'wave'
                  ? 9
                  : 0;
    if (dur && t > dur) {
      this.mood = 'watch';
      this.moodT = 0;
    }
    const k = Math.min(1, dt * 10);
    for (let i = 0; i < this.n; i++) {
      const seat = this.seats[i];
      // Head tracking with a personal lag.
      const j = (this.hi - this.delay[i] + HIST) % HIST;
      let target: number;
      if (seat.stand === 'far') target = Math.max(-1, Math.min(1, (this.hsx[j] - seat.sx) / 70));
      else target = Math.max(-1, Math.min(1, (seat.y - this.hy[j]) / 7));
      if (mood === 'quiet') target *= 0.3;
      this.look[i] += (target - this.look[i]) * k;

      // Standing up.
      let wantUp = 0;
      const z = this.zeal[i];
      if (mood === 'ovation') wantUp = z > 1 - this.intensity * 0.9 && t > (1 - z) * 0.5 ? 1 : 0;
      else if (mood === 'standing') wantUp = t > (1 - z) * 0.8 ? 1 : 0;
      else if (mood === 'wave') {
        // A wave rolls around the bowl, ordered by screen x.
        const pos =
          seat.stand === 'left'
            ? seat.sx * 0.5
            : seat.stand === 'far'
              ? seat.sx
              : 400 + (500 - seat.sy);
        const front = t * 240 - 60;
        wantUp = Math.abs(pos - front) < 34 ? 1 : 0;
      }
      this.up[i] += (wantUp - this.up[i]) * Math.min(1, dt * (wantUp ? 9 : 5));
      if (this.flash[i] > 0) this.flash[i] -= dt;
    }
  }

  /** Draw every spectator into the frame (background-space x offset `ox`). */
  draw(data: Uint32Array, fw: number, fh: number, ox: number, time: number) {
    const mood = this.mood;
    const t = this.moodT;
    for (let i = 0; i < this.n; i++) {
      const seat = this.seats[i];
      const s = seat.s;
      const hw = s < 12.5 ? 2 : s < 16 ? 3 : s < 20 ? 4 : 5;
      const tw = hw + 2;
      const th = Math.max(3, Math.round(0.34 * s));
      const cx = Math.round(seat.sx + ox);
      if (cx < -6 || cx > fw + 6) continue;
      const z = this.zeal[i];
      const ph = this.phase[i];
      const lift = Math.round(this.up[i] * 0.34 * s);
      const baseY = Math.round(seat.sy) - lift;
      if (baseY - th - hw - 6 > fh || baseY + lift < -2) continue;

      // Mood-driven arms: 0 none, 1 clap, 2 up, 3 hands on head.
      let arms = 0;
      let bob = 0;
      if (mood === 'applause' && z > 0.2 && t > (1 - z) * 0.4 && t < 1.2 + this.intensity * 2 * z)
        arms = 1;
      else if (mood === 'ovation' || mood === 'standing')
        arms = this.up[i] > 0.5 ? (z > 0.55 ? 2 : 1) : z > 0.3 ? 1 : 0;
      else if (mood === 'ooh' && z > 0.35 && t < 1) arms = z > 0.8 ? 3 : 0;
      else if (mood === 'groan' && z > 0.5 && t < 1.3) arms = 3;
      else if (mood === 'wave' && this.up[i] > 0.5) arms = 2;
      if (mood === 'ovation' || mood === 'standing')
        bob = this.up[i] > 0.5 && Math.sin(time * 9 + ph) > 0.3 ? 1 : 0;
      const y0 = baseY - bob;

      const shirt = this.shirt[i];
      const shirtD = this.shirtD[i];
      const skin = this.skin[i];
      // Torso (grows downward when standing so bodies read taller).
      const left = cx - (tw >> 1);
      const torsoTop = y0 - th;
      const torsoBottom = y0 + lift;
      for (let y = torsoTop; y < torsoBottom; y++) {
        if (y < 0 || y >= fh) continue;
        const row = y * fw;
        for (let x = left; x < left + tw; x++) {
          if (x < 0 || x >= fw) continue;
          const edge =
            x === left + tw - 1 || (y === torsoTop && (x === left || x === left + tw - 1));
          if (y === torsoTop && (x === left || x === left + tw - 1) && hw < 4) continue;
          data[row + x] = edge ? shirtD : shirt;
        }
      }
      // Head.
      const hx0 = cx - (hw >> 1);
      const hy0 = torsoTop - hw;
      const look = this.look[i];
      const side = seat.stand;
      // How far the face is turned: shifts the face patch within the head.
      let faceShift = 0;
      let faceVis = 1;
      if (side === 'far') faceShift = look > 0.35 ? 1 : look < -0.35 ? -1 : 0;
      else {
        faceVis = look > 0.2 ? 1 : look > -0.3 ? 0.6 : 0.25;
        faceShift = side === 'left' ? 1 : -1;
      }
      const hair = this.hair[i];
      const hk = this.hatKind[i];
      const hatC = this.hat[i];
      if (this.goats) this.goatHead(data, fw, fh, i, hx0, hy0, hw, side, faceShift, faceVis);
      else
        for (let yy = 0; yy < hw; yy++) {
          const y = hy0 + yy;
          if (y < 0 || y >= fh) continue;
          for (let xx = 0; xx < hw; xx++) {
            const x = hx0 + xx;
            if (x < 0 || x >= fw) continue;
            // Round the corners of bigger heads.
            if (hw >= 4 && (yy === 0 || yy === hw - 1) && (xx === 0 || xx === hw - 1)) continue;
            let c = skin;
            if (yy === 0) c = hair;
            else if (side === 'far') {
              // Hair shows on the side the face turns away from.
              if (faceShift === 1 && xx === 0 && yy < hw - 1) c = hair;
              if (faceShift === -1 && xx === hw - 1 && yy < hw - 1) c = hair;
            } else {
              const back = side === 'left' ? xx : hw - 1 - xx;
              const faceCols = Math.max(1, Math.round(hw * faceVis * 0.7));
              if (back < hw - faceCols) c = hair;
            }
            if (this.hairLong[i] && yy > 0 && (xx === 0 || xx === hw - 1) && side === 'far')
              c = hair;
            if (c === skin && hw >= 4 && yy === hw - 1) c = this.skinD[i];
            data[y * fw + x] = c;
          }
        }
      // Hair below the head for long hair seen from behind/side.
      if (this.hairLong[i] && side !== 'far' && hw >= 3) {
        const x = side === 'left' ? hx0 : hx0 + hw - 1;
        for (let y = torsoTop; y < torsoTop + 2; y++)
          if (y >= 0 && y < fh && x >= 0 && x < fw) data[y * fw + x] = hair;
      }
      // Eyes on bigger, front-facing heads.
      if (hw >= 4 && side === 'far' && !this.goats) {
        const ey = hy0 + 2;
        const ex = hx0 + 1 + (faceShift > 0 ? 1 : 0) - (faceShift < 0 ? 0 : 0);
        if (ey >= 0 && ey < fh) {
          if (ex >= 0 && ex < fw) data[ey * fw + ex] = this.eye;
          if (ex + 2 < fw && ex + 2 >= 0 && faceShift === 0) data[ey * fw + ex + 2] = this.eye;
        }
      }
      // Hats.
      if (hk) {
        const y = hy0;
        if (y >= 0 && y < fh) {
          const wide = hk === 2 ? 1 : 0;
          for (let x = hx0 - wide; x < hx0 + hw + wide; x++)
            if (x >= 0 && x < fw) data[y * fw + x] = hatC;
          if (hk === 1 && hw >= 3 && y - 1 >= 0) {
            for (let x = hx0 + 1; x < hx0 + hw - 1; x++)
              if (x >= 0 && x < fw) data[(y - 1) * fw + x] = hatC;
          }
        }
      }
      // Arms.
      if (arms === 1) {
        // Clapping: hands meet in front of the chest.
        const beat = Math.sin(time * (11 + z * 5) + ph) > 0;
        const hy = torsoTop + 1;
        if (hy >= 0 && hy < fh) {
          if (beat) {
            if (cx >= 0 && cx < fw) data[hy * fw + cx] = skin;
          } else {
            if (cx - 1 >= 0 && cx - 1 < fw) data[hy * fw + cx - 1] = skin;
            if (cx + 1 >= 0 && cx + 1 < fw) data[hy * fw + cx + 1] = skin;
          }
        }
      } else if (arms === 2) {
        const wave = Math.sin(time * 8 + ph) > 0 ? 1 : 0;
        for (let k = 0; k < hw + 1; k++) {
          const y = torsoTop - k - wave;
          if (y < 0 || y >= fh) continue;
          const xl = left - 1 - (k > hw - 1 ? 1 : 0);
          const xr = left + tw + (k > hw - 1 ? 1 : 0);
          if (xl >= 0 && xl < fw) data[y * fw + xl] = skin;
          if (xr >= 0 && xr < fw) data[y * fw + xr] = skin;
        }
      } else if (arms === 3) {
        // Hands on head.
        const y = hy0;
        if (y >= 0 && y < fh) {
          if (hx0 - 1 >= 0 && hx0 - 1 < fw) data[y * fw + hx0 - 1] = skin;
          if (hx0 + hw < fw && hx0 + hw >= 0) data[y * fw + hx0 + hw] = skin;
        }
      }
      // Props.
      const prop = this.prop[i];
      if (prop === 1) {
        // Flag for one of the players: waved high when their player wins a point.
        const cheering =
          (mood === 'ovation' || mood === 'standing' || mood === 'applause') &&
          (this.favor === -1 || this.favor === this.fan[i]);
        const cols = this.flagColors[this.fan[i]];
        const fwid = hw + 2;
        const fy = cheering ? hy0 - 4 - (Math.sin(time * 9 + ph) > 0 ? 1 : 0) : torsoTop + 1;
        const fx = cheering ? cx + (Math.sin(time * 6 + ph) > 0 ? 0 : -2) : cx - 1;
        const rows = cols.length >= 3 ? 3 : 2;
        for (let r = 0; r < rows; r++) {
          const y = fy + r;
          if (y < 0 || y >= fh) continue;
          for (let x = fx; x < fx + fwid; x++) {
            if (x < 0 || x >= fw) continue;
            data[y * fw + x] =
              cols[Math.min(cols.length - 1, Math.floor((r * cols.length) / rows))];
          }
        }
      } else if (prop === 2) {
        // Phone held up to film.
        const filming = mood !== 'quiet' && z > 0.5;
        if (filming) {
          const px = cx + (hw >> 1);
          const py = hy0 - 1;
          if (py >= 0 && py + 1 < fh && px >= 0 && px < fw) {
            data[py * fw + px] = this.dark;
            data[(py + 1) * fw + px] = this.night ? this.phoneGlow : this.dark;
          }
        }
      } else if (prop === 3 && mood !== 'wave') {
        // Umbrella.
        const uc = this.umbrellaColors[i % this.umbrellaColors.length];
        const uw = hw + 4;
        const uy = hy0 - 3;
        for (let r = 0; r < 2; r++) {
          const y = uy + r;
          if (y < 0 || y >= fh) continue;
          const inset = r === 0 ? 1 : 0;
          for (let x = cx - (uw >> 1) + inset; x < cx - (uw >> 1) + uw - inset; x++)
            if (x >= 0 && x < fw) data[y * fw + x] = uc;
        }
      }
      // Camera flash.
      if (this.flash[i] > 0 && this.flash[i] < 0.08) {
        const y = hy0;
        if (y >= 0 && y < fh && cx >= 0 && cx < fw) {
          data[y * fw + cx] = 0xffffffff;
          if (cx + 1 < fw) data[y * fw + cx + 1] = 0xffffffff;
          if (y + 1 < fh) data[(y + 1) * fw + cx] = 0xffffffff;
        }
      }
    }
  }

  /**
   * A goat's head, `hw` pixels wide: seen face-on from the far stand, in
   * profile (snout toward the court) from the side stands.
   */
  private goatHead(
    data: Uint32Array,
    fw: number,
    fh: number,
    i: number,
    hx0: number,
    hy0: number,
    hw: number,
    side: Seat['stand'],
    faceShift: number,
    faceVis: number,
  ) {
    const set = (x: number, y: number, c: number) => {
      if (x >= 0 && x < fw && y >= 0 && y < fh) data[y * fw + x] = c;
    };
    const coat = this.skin[i];
    const coatD = this.skinD[i];
    const horn = this.hair[i];
    const beard = this.beard[i];
    const nose = this.nose[i];
    for (let yy = 0; yy < hw; yy++)
      for (let xx = 0; xx < hw; xx++) {
        if (hw >= 4 && yy === 0 && (xx === 0 || xx === hw - 1)) continue;
        set(hx0 + xx, hy0 + yy, hw >= 4 && yy === hw - 1 ? coatD : coat);
      }
    if (side === 'far') {
      const mid = hx0 + (hw >> 1) + (hw >= 4 ? faceShift : 0);
      // Horns in a V, ears out to the sides, nose and beard under the chin.
      if (hw <= 3) {
        set(hx0, hy0 - 1, horn);
        set(hx0 + hw - 1, hy0 - 1, horn);
      } else {
        set(hx0 + 1, hy0 - 1, horn);
        set(hx0 + hw - 2, hy0 - 1, horn);
        set(hx0, hy0 - 2, horn);
        set(hx0 + hw - 1, hy0 - 2, horn);
      }
      if (hw >= 3) {
        set(hx0 - 1, hy0 + 1, coatD);
        set(hx0 + hw, hy0 + 1, coatD);
        set(mid, hy0 + hw - 1, nose);
        set(mid, hy0 + hw, beard);
      }
      if (hw >= 4) {
        set(hx0 + 1 + (faceShift > 0 ? 1 : 0), hy0 + 1, this.eye);
        set(hx0 + hw - 2 + (faceShift < 0 ? -1 : 0), hy0 + 1, this.eye);
      }
      if (hw >= 5) set(mid, hy0 + hw + 1, beard);
      return;
    }
    // Side stands: the snout points at the court when the goat watches play.
    const dir = side === 'left' ? 1 : -1;
    const front = dir > 0 ? hx0 + hw - 1 : hx0;
    const back = dir > 0 ? hx0 : hx0 + hw - 1;
    set(back, hy0 - 1, horn);
    if (hw >= 3) set(back - dir, hy0 - 2, horn);
    set(back - dir, hy0 + 1, coatD);
    if (faceVis > 0.5 && hw >= 3) {
      set(front + dir, hy0 + hw - 2, coat);
      set(front + dir, hy0 + hw - 1, nose);
      set(front, hy0 + hw, beard);
      if (hw >= 4) set(front - dir, hy0 + 1, this.eye);
    }
  }
}
