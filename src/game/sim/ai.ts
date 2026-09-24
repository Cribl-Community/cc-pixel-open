/**
 * The computer opponent. It reads the ball the same way a player does — from
 * the flight it can see (the predicted trajectory) — after a reaction delay
 * that shrinks with skill. It plans where to meet the ball, runs there,
 * chooses shots by play style and situation, and aims with margins that
 * tighten as skill rises.
 */

import { gaussian, makeRng, type Rng } from '../core/rng';
import { clamp } from '../core/math';
import { contactOffset, type StrokeKind } from '../art/playerRig';
import { SIM_STEP } from './ball';
import { baselineY, COURT, sideOfY, singlesHalf, inRect } from './court';
import type { Contact, Match } from './match';
import type { PlayerBody } from './player';
import type { ShotKind } from './shots';

interface Plan {
  x: number;
  y: number;
  /** Sim time the ball arrives there. */
  t: number;
}

export class AIBrain {
  readonly skill: number;
  private readonly m: Match;
  private readonly p: PlayerBody;
  private readonly rng: Rng;
  private plan: Plan | null = null;
  private recover: { x: number; y: number } | null = null;
  private reactAt = 0;
  private serveChoice: { key: string; kind: ShotKind; aim: number } | null = null;
  serveDelay = 1.4;
  serveTimingError = 0;
  private approaching = false;
  private lastTarget = { x: 0, y: 0 };
  /** The current plan meets the ball before it bounces. */
  planVolley = false;

  constructor(m: Match, p: PlayerBody, skill: number) {
    this.m = m;
    this.p = p;
    this.skill = skill;
    this.rng = makeRng(m.cfg.seed * 13 + p.idx * 7 + 1);
  }

  private get style() {
    return this.p.def.style;
  }

  private get opp(): PlayerBody {
    return this.m.players[1 - this.p.idx];
  }

  // ---------------------------------------------------------------------------
  // Serving

  pickServe(first: boolean): { kind: ShotKind; aim: number } {
    const key = `${this.m.score.played}-${this.m.point.serveNo}`;
    if (this.serveChoice?.key === key) return this.serveChoice;
    const r = this.rng();
    const s = this.style;
    let kind: ShotKind;
    if (first) {
      const flat = s === 'bigServer' ? 0.7 : s === 'serveVolley' ? 0.4 : 0.45;
      const kick = s === 'serveVolley' ? 0.3 : 0.15;
      kind = r < flat ? 'serveFlat' : r < flat + kick ? 'serveKick' : 'serveSlice';
    } else {
      kind = r < 0.72 ? 'serveKick' : 'serveSlice';
    }
    const a = this.rng();
    const aim = first
      ? (a < 0.4 ? -1 : a < 0.8 ? 1 : 0) * (0.85 + this.skill * 0.15)
      : a < 0.5
        ? -0.5
        : 0.5;
    this.serveChoice = { key, kind, aim };
    this.serveDelay = 0.9 + this.rng() * 1.6;
    this.serveTimingError = gaussian(this.rng) * (0.045 * (1 - this.skill) + 0.012);
    return this.serveChoice;
  }

  wantsNetAfterServe(first: boolean) {
    const s = this.style;
    const p =
      s === 'serveVolley'
        ? first
          ? 0.85
          : 0.5
        : s === 'allCourt'
          ? 0.18
          : s === 'bigServer'
            ? 0.08
            : 0.02;
    const go = this.rng() < p;
    this.approaching = go;
    return go;
  }

  /** Remember where our own shot went (auto-run recovers relative to it). */
  noteTarget(x: number, y: number) {
    this.lastTarget = { x, y };
  }

  // ---------------------------------------------------------------------------
  // Reading the ball

  onStruck(by: number) {
    if (by === this.p.idx) {
      // Recover after our own shot.
      this.plan = null;
      this.planVolley = false;
      this.recover = this.recoveryPoint();
      return;
    }
    this.recover = null;
    // Serves are hardest to read: a longer split-step before the first move.
    const serve = this.m.point.serveInFlight;
    this.reactAt =
      this.m.now + (serve ? 0.44 - 0.2 * this.skill : 0.34 - 0.2 * this.skill) + this.rng() * 0.06;
    this.plan = this.makePlan();
  }

  private recoveryPoint(): { x: number; y: number } {
    const p = this.p;
    const bl = baselineY(p.side);
    const tx = this.lastTarget.x;
    if (this.approaching || this.m.point.netRusher[p.idx]) {
      this.approaching = true;
      return { x: clamp(tx * 0.45, -2.5, 2.5), y: -p.fwd * 3.2 };
    }
    const depth = this.style === 'counter' ? 1.6 : this.style === 'baseliner' ? 0.9 : 0.7;
    return { x: clamp(tx * 0.3, -1.6, 1.6), y: bl - p.fwd * depth };
  }

  private makePlan(): Plan | null {
    const m = this.m;
    const pred = m.pred;
    if (!pred) return null;
    const p = this.p;
    const k = p.k;
    const i0 = Math.max(0, Math.ceil((m.now - m.predT0) / SIM_STEP));
    const pt = m.point;
    const serveReturn = pt.serveInFlight && p.idx === pt.receiver;
    const react = Math.max(0, this.reactAt - m.now);
    const vmax = p.maxSpeed * (0.8 + 0.2 * this.skill) * 1.1;
    const aRate = p.accel;
    const canVolley = !serveReturn && (Math.abs(p.y) < 7 || this.approaching);
    let bounces = 0;
    let ei = 0;
    const evs = pred.events;
    let best: Plan | null = null;
    let bestScore = -Infinity;
    let bestVolley = false;
    let fallback: Plan | null = null;
    let fallbackDef = Infinity;
    let fallbackVolley = false;
    for (let i = i0; i < pred.n; i += 2) {
      while (ei < evs.length && evs[ei].i <= i) {
        if (evs[ei].kind === 'bounce' && sideOfY(evs[ei].y) === p.side) bounces++;
        ei++;
      }
      if (bounces >= 2) break;
      const x = pred.pts[i * 4 + 1];
      const y = pred.pts[i * 4 + 2];
      const z = pred.pts[i * 4 + 3];
      if (sideOfY(y) !== p.side) continue;
      if (bounces === 0 && !canVolley) continue;
      if (z < 0.25 || z > 2.2 * k + 0.5) continue;
      const t = pred.pts[i * 4] + m.predT0;
      // Forehand or backhand, whichever is closer (forehand favored by attackers).
      const loc = p.toLocal(x, y);
      const lx = p.lefty ? -loc.x : loc.x;
      const fhFav = this.style === 'baseliner' || this.style === 'bigServer' ? 0.35 : 0.1;
      const useFh = lx > -fhFav;
      let stroke: StrokeKind = useFh ? 'fh' : p.def.backhand === 1 ? 'bh1' : 'bh2';
      if (bounces === 0) stroke = useFh ? 'fhVolley' : 'bhVolley';
      if (z > 2.05 * k) stroke = 'smash';
      const o = contactOffset(stroke);
      const off = p.toWorldDir((p.lefty ? -o.x : o.x) * k, o.y * k);
      const sx = x - off.x;
      const sy = y - off.y;
      const d = Math.hypot(sx - p.x, sy - p.y);
      const need = react + d / vmax + (d > 0.5 ? vmax / (2 * aRate) : 0);
      const avail = t - m.now;
      const slack = avail - need;
      if (slack < 0) {
        if (-slack < fallbackDef) {
          fallbackDef = -slack;
          fallback = { x: sx, y: sy, t };
          fallbackVolley = bounces === 0;
        }
        continue;
      }
      // Prefer comfortable heights, not too deep, reached with time to set.
      const comfort = -Math.abs(z - 1.0) * 2.2;
      const deep = -Math.max(0, Math.abs(sy) - COURT.L - 1.2) * 0.8;
      const early =
        this.style === 'baseliner' || this.style === 'bigServer' ? -avail * 0.6 : -avail * 0.2;
      const volleyBonus = bounces === 0 && this.approaching ? 1.2 : 0;
      const score = comfort + deep + early + Math.min(slack, 0.5) * 2 + volleyBonus;
      if (score > bestScore) {
        bestScore = score;
        best = { x: sx, y: sy, t };
        bestVolley = bounces === 0;
      }
    }
    const plan = best ?? fallback;
    this.planVolley = best ? bestVolley : fallbackVolley;
    if (plan) {
      // Misjudgement shrinks with skill.
      const err = (1 - this.skill) * 0.45;
      plan.x += gaussian(this.rng) * err;
      plan.y += gaussian(this.rng) * err * 0.6;
    }
    return plan;
  }

  /** Movement input for this step (world direction, magnitude ≤ 1). */
  update(dt: number): { x: number; y: number; sprint: boolean } {
    void dt;
    const m = this.m;
    const p = this.p;
    if (m.phase === 'toServe' || m.phase === 'serving') {
      if (m.point.receiver === p.idx && m.phase === 'serving') return { x: 0, y: 0, sprint: false };
      return { x: 0, y: 0, sprint: false };
    }
    if (m.phase === 'pointOver') return { x: 0, y: 0, sprint: false };
    let target: { x: number; y: number } | null = null;
    let urgent = false;
    const c = m.contacts[p.idx];
    if (p.swing && !p.swing.resolved && c) {
      // Mid-swing: shuffle so the ball meets the sweet spot of this stroke.
      const o = contactOffset(p.swing.stroke);
      const off = p.toWorldDir((p.lefty ? -o.x : o.x) * p.k, o.y * p.k);
      target = { x: c.x - off.x, y: c.y - off.y };
      urgent = true;
    } else if (this.plan && m.now >= this.reactAt) {
      if (m.point.lastHitter === p.idx || m.now > this.plan.t + 0.2) this.plan = null;
      else {
        target = this.plan;
        urgent = this.plan.t - m.now < 0.9;
      }
    } else if (this.recover) {
      target = this.recover;
    }
    if (!target) return { x: 0, y: 0, sprint: false };
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.06) return { x: 0, y: 0, sprint: false };
    const pace = 0.72 + 0.28 * this.skill;
    const arrive = Math.min(1, d / (urgent ? 0.35 : 0.9));
    return {
      x: (dx / d) * arrive * pace,
      y: (dy / d) * arrive * pace,
      sprint: urgent && d > 1.8 && p.sprint > 0.2,
    };
  }

  // ---------------------------------------------------------------------------
  // Shots

  /** Leave balls that are flying out (volleys), as good players do. */
  willSwing(c: Contact): boolean {
    if (c.bounced) return true;
    const pred = this.m.pred;
    if (!pred) return true;
    const bounce = pred.events.find((e) => e.kind === 'bounce');
    if (!bounce) return true;
    if (sideOfY(bounce.y) !== this.p.side) return true;
    const rect = singlesHalf(this.p.side);
    if (inRect(rect, bounce.x, bounce.y, 0.25)) return true;
    // Clearly out: a strong player lets it go.
    return this.rng() > this.skill * 0.9;
  }

  pickShotKind(c: Contact): ShotKind {
    const p = this.p;
    const o = this.opp;
    const r = this.rng();
    if (c.stroke === 'smash') return 'smash';
    const stretched = Math.abs(c.dx) > 0.45 || c.z < 0.32 || c.z > 1.75;
    const oppAtNet = Math.abs(o.y) < 5.5;
    const oppDeep = Math.abs(o.y) > COURT.L + 1.5;
    const inside = Math.abs(p.y) < COURT.L - 1.5;
    if (c.stroke === 'fhVolley' || c.stroke === 'bhVolley') {
      if (oppDeep && this.skill > 0.5 && r < 0.2) return 'drop';
      return 'volley';
    }
    if (stretched) {
      if (oppAtNet && r < 0.55) return 'lob';
      return r < 0.65 ? 'slice' : 'topspin';
    }
    if (oppAtNet) return r < 0.25 ? 'lob' : r < 0.45 ? 'flat' : 'topspin';
    if (inside && oppDeep) {
      const dropP = this.style === 'allCourt' ? 0.3 : 0.1;
      if (r < dropP) return 'drop';
    }
    if (inside) {
      // Short ball: attack, and maybe follow it in.
      if (this.style === 'serveVolley' || this.style === 'allCourt')
        this.approaching = this.rng() < 0.7;
      return this.style === 'bigServer' || this.style === 'baseliner'
        ? r < 0.5
          ? 'flat'
          : 'topspin'
        : 'topspin';
    }
    if (this.style === 'allCourt' && r < 0.22) return 'slice';
    if (this.style === 'counter' && r < 0.12) return 'slice';
    return 'topspin';
  }

  power(shot: ShotKind): number {
    const aggr =
      this.style === 'bigServer'
        ? 0.86
        : this.style === 'baseliner'
          ? 0.78
          : this.style === 'counter'
            ? 0.6
            : 0.68;
    const base =
      shot === 'flat' || shot === 'smash'
        ? aggr + 0.15
        : shot === 'lob' || shot === 'drop'
          ? 0.4
          : aggr;
    return clamp(base + (this.rng() - 0.5) * 0.25, 0.2, 1);
  }

  pickTarget(shot: ShotKind, quality: number): { x: number; y: number } {
    const p = this.p;
    const o = this.opp;
    const f = p.fwd;
    const L = COURT.L;
    const SW = COURT.SW;
    const risk =
      this.style === 'bigServer' || this.style === 'baseliner'
        ? 0.72
        : this.style === 'counter'
          ? 1.15
          : 1;
    const mx = (0.35 + (1 - this.skill) * 1.1 + (1 - quality) * 0.6) * risk;
    const my = (0.45 + (1 - this.skill) * 1.3 + (1 - quality) * 0.5) * risk;
    const open = o.x > 0.4 ? -1 : o.x < -0.4 ? 1 : this.rng() < 0.5 ? -1 : 1;
    const r = () => this.rng();
    let x: number;
    let depth: number;
    switch (shot) {
      case 'drop':
        x = open * (1 + r() * 1.5);
        depth = 2.2 + r() * 1.2;
        break;
      case 'lob':
        x = clamp(-o.x * 0.4, -2.5, 2.5);
        depth = L - 1.1 - my * 0.5;
        break;
      case 'volley':
      case 'smash':
        x = open * (SW - mx);
        depth = r() < 0.5 ? 6.5 + r() : L - my;
        break;
      case 'flat':
        x = open * (SW - mx) * (0.75 + r() * 0.25);
        depth = L - my - r() * 0.8;
        break;
      case 'slice':
        x = (r() - 0.5) * 2 * (SW - mx - 0.6);
        depth = L - my - 0.6 - r() * 1.2;
        break;
      default: {
        const oppAtNet = Math.abs(o.y) < 5.5;
        if (oppAtNet) {
          x = open * (SW - mx * 0.8);
          depth = 7.5 + r() * 1.5;
        } else if (Math.abs(o.x) > 1.8) {
          // Opponent pulled wide: go to the open court.
          x = open * (SW - mx);
          depth = L - my - r() * 1.2;
        } else if (quality < 0.45) {
          // Scrambling: deep and central buys time.
          x = (r() - 0.5) * 1.6;
          depth = L - my - 0.4;
        } else {
          x = open * (SW - mx) * (0.75 + r() * 0.25);
          depth = L - my - r() * 1.4;
        }
      }
    }
    x = clamp(x, -SW + 0.25, SW - 0.25);
    depth = clamp(depth, 1.8, L - 0.3);
    this.lastTarget = { x, y: f * depth };
    return this.lastTarget;
  }
}
