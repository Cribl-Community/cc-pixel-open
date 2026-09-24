/**
 * The match: players, ball, rules and flow. Everything happens in sim time
 * (fixed 1/120 s steps). The renderer and audio only observe; they learn
 * what happened through the event queue.
 */

import { gaussian, makeRng, type Rng } from '../core/rng';
import { clamp, kmh, type V3 } from '../core/math';
import {
  contactOffset,
  solveSkeleton,
  STROKES,
  strokePose,
  locomotionPose,
  type StrokeKind,
} from '../art/playerRig';
import {
  ballSpeed,
  makeBall,
  predict,
  SIM_STEP,
  stepBall,
  type Ball,
  type BallEvent,
  type Prediction,
} from './ball';
import {
  baselineY,
  COURT,
  halfSign,
  inRect,
  lineMargin,
  otherSide,
  serviceBox,
  sideOfY,
  singlesHalf,
  type CourtHalf,
  type Side,
} from './court';
import { PlayerBody } from './player';
import type { PlayerDef, PlayerLook } from './roster';
import {
  awardPoint,
  courtHalf,
  gameCall,
  newScore,
  pointCall,
  pressureOf,
  situation,
  type MatchFormat,
  type PlayerIdx,
  type PointOutcome,
  type Score,
} from './scoring';
import { perturb, solveShot, type ShotKind, type ShotSpec } from './shots';
import { SURFACES, type SurfaceDef } from './surfaces';
import type { VenueDef } from './venues';
import { AIBrain } from './ai';
import type { CrowdMood } from '../art/crowd';

export type Phase =
  'intro' | 'toServe' | 'serving' | 'rally' | 'pointOver' | 'changeover' | 'matchOver';

export interface HumanInput {
  mx: number;
  my: number;
  sprint: boolean;
  /** Shot button currently held. */
  held: ShotKind | null;
  /** Shot button pressed this step. */
  pressed: ShotKind | null;
  released: boolean;
  /** Power-shot button pressed this step. */
  power: boolean;
  /** Skip button (changeovers). */
  skip: boolean;
  /** Where the mouse points on the court (world meters), if it is aiming. */
  aim: { x: number; y: number } | null;
}

export const NO_INPUT: HumanInput = {
  mx: 0,
  my: 0,
  sprint: false,
  held: null,
  pressed: null,
  released: false,
  power: false,
  skip: false,
  aim: null,
};

export type PointReason =
  'ace' | 'serviceWinner' | 'doubleFault' | 'winner' | 'forced' | 'unforced' | 'net' | 'out';

export type MatchEvent =
  | {
      type: 'hit';
      player: PlayerIdx;
      shot: ShotKind;
      speed: number;
      power: number;
      x: number;
      y: number;
      z: number;
      quality: number;
      super: boolean;
      serve: boolean;
    }
  | { type: 'whiff'; player: PlayerIdx; dx: number; dy: number; dz: number; stroke: StrokeKind }
  | { type: 'swing'; player: PlayerIdx; stroke: StrokeKind; power: number }
  | {
      type: 'bounce';
      x: number;
      y: number;
      speed: number;
      line: boolean;
      out: boolean;
      dead: boolean;
    }
  | { type: 'net'; x: number; cord: boolean; speed: number }
  | { type: 'wall'; x: number; y: number; speed: number }
  | { type: 'toss'; player: PlayerIdx }
  | { type: 'dribble'; player: PlayerIdx; x: number; y: number }
  | { type: 'fault'; second: boolean }
  | { type: 'let' }
  | { type: 'out'; x: number; y: number; close: boolean; cm: number }
  | { type: 'lineCall'; x: number; y: number }
  | { type: 'point'; winner: PlayerIdx; reason: PointReason; rally: number; big: boolean }
  | { type: 'score'; outcome: PointOutcome }
  | { type: 'call'; text: string; voice: 'umpire' | 'line' }
  | { type: 'crowd'; mood: CrowdMood; intensity: number; favor: PlayerIdx | -1 }
  | { type: 'step'; player: PlayerIdx; x: number; y: number; slide: boolean; speed: number }
  | { type: 'serveSpeed'; kmh: number }
  | { type: 'callout'; text: string; tone: 'good' | 'bad' | 'info' | 'big' }
  | { type: 'style'; amount: number; label: string }
  | { type: 'changeover' }
  | { type: 'sweep' }
  | { type: 'matchOver'; winner: PlayerIdx };

export interface PlayerStats {
  points: number;
  aces: number;
  doubleFaults: number;
  firstIn: number;
  firstTotal: number;
  firstWon: number;
  secondWon: number;
  secondTotal: number;
  winners: number;
  unforced: number;
  forced: number;
  netPoints: number;
  netWon: number;
  breakPoints: number;
  breaksWon: number;
  fastestServe: number;
  serveSum: number;
  serveCount: number;
  distance: number;
}

const newStats = (): PlayerStats => ({
  points: 0,
  aces: 0,
  doubleFaults: 0,
  firstIn: 0,
  firstTotal: 0,
  firstWon: 0,
  secondWon: 0,
  secondTotal: 0,
  winners: 0,
  unforced: 0,
  forced: 0,
  netPoints: 0,
  netWon: 0,
  breakPoints: 0,
  breaksWon: 0,
  fastestServe: 0,
  serveSum: 0,
  serveCount: 0,
  distance: 0,
});

interface PointState {
  server: PlayerIdx;
  receiver: PlayerIdx;
  half: CourtHalf;
  serveNo: 1 | 2;
  lastHitter: PlayerIdx | null;
  /** Shots struck (the serve counts as 1). */
  hits: number;
  /** Bounces since the last hit, and on which side. */
  bounces: number;
  bounceSide: Side | null;
  serveInFlight: boolean;
  cordOnServe: boolean;
  receiverTouched: boolean;
  lastShot: ShotKind | null;
  /** How hard the last incoming ball was to handle (0 easy … 1 very hard). */
  pressureOnReceiver: number;
  lastQuality: number;
  /** How hard the last shot was to play (for classifying the error): what the hitter faced, and how fast they were running. */
  lastFaced: number;
  lastBalance: number;
  netRusher: [boolean, boolean];
  over: boolean;
  winner: PlayerIdx | null;
  reason: PointReason | null;
  deadT: number;
  wasBreakPoint: boolean;
  netCordThisShot: boolean;
  firstBounce: { x: number; y: number } | null;
}

export interface MatchConfig {
  players: [PlayerDef, PlayerDef];
  looks: [PlayerLook, PlayerLook];
  human: [boolean, boolean];
  skill: [number, number];
  venue: VenueDef;
  format: MatchFormat;
  /** auto = the player runs to the ball by itself; move = a nudge while a shot is loaded. */
  assist: 'off' | 'move' | 'auto';
  seed: number;
  /** Attract mode: skip intros and long pauses. */
  demo?: boolean;
}

/** Contact planning result. */
export interface Contact {
  t: number;
  x: number;
  y: number;
  z: number;
  stroke: StrokeKind;
  bounced: boolean;
  /** Ball position relative to the stroke's sweet spot (pose frame, m). */
  dx: number;
  dy: number;
  dz: number;
}

const SERVE_SWING = 0.12;

export class Match {
  readonly cfg: MatchConfig;
  readonly surface: SurfaceDef;
  readonly players: [PlayerBody, PlayerBody];
  readonly ai: [AIBrain | null, AIBrain | null];
  readonly rng: Rng;
  ball: Ball;
  /** Ball is flying under physics. */
  ballLive = false;
  ballVisible = false;
  /** Ball held in the server's hand (drawn by the rig). */
  pred: Prediction | null = null;
  predT0 = 0;
  score: Score;
  phase: Phase = 'intro';
  phaseT = 0;
  now = 0;
  point: PointState;
  stats: [PlayerStats, PlayerStats] = [newStats(), newStats()];
  events: MatchEvent[] = [];
  style = 0;
  longestRally = 0;
  lastServeKmh = 0;
  /** Serve toss state. */
  toss: {
    t0: number;
    ideal: number;
    kind: ShotKind;
    releaseAt: number | null;
    swingAt: number | null;
  } | null = null;
  /** Human input captured for aiming at contact. */
  private input: HumanInput = NO_INPUT;
  private superArmed = false;
  private changeoverPending = false;
  private pendingOutcome: PointOutcome | null = null;
  private evBuf: BallEvent[] = [];
  private toServeT = 0;
  ballTrail: number[] = [];
  superBall = false;
  /** Latest contact estimate per player (for movement during a swing). */
  contacts: [Contact | null, Contact | null] = [null, null];
  /** Auto-run: footwork for human players, planned the same way the AI plans. */
  runners: [AIBrain | null, AIBrain | null] = [null, null];

  constructor(cfg: MatchConfig) {
    this.cfg = cfg;
    this.surface = SURFACES[cfg.venue.surface];
    this.rng = makeRng(cfg.seed);
    this.players = [
      new PlayerBody(0, cfg.players[0], cfg.looks[0], 0),
      new PlayerBody(1, cfg.players[1], cfg.looks[1], 1),
    ];
    this.ai = [
      cfg.human[0] ? null : new AIBrain(this, this.players[0], cfg.skill[0]),
      cfg.human[1] ? null : new AIBrain(this, this.players[1], cfg.skill[1]),
    ];
    this.setAssist(cfg.assist);
    // Human players get arcade-quick feet.
    for (const p of this.players) if (cfg.human[p.idx]) p.tune(1.3, 1.6);
    this.ball = makeBall(cfg.seed);
    const first = (this.rng() < 0.5 ? 0 : 1) as PlayerIdx;
    this.score = newScore(cfg.format, first);
    this.point = this.freshPoint();
    for (const p of this.players) {
      p.onStep = (pl, slide) =>
        this.emit({ type: 'step', player: pl.idx, x: pl.x, y: pl.y, slide, speed: pl.speed });
    }
    // Walk on from the back of the court.
    for (const p of this.players) {
      p.x = (p.idx ? -1 : 1) * 2.5;
      p.y = baselineY(p.side) + (p.side === 0 ? -3 : 3);
      p.mode = 'walk';
    }
    this.placeForPoint(false);
    if (cfg.demo) {
      for (const p of this.players) {
        if (p.target) {
          p.x = p.target.x;
          p.y = p.target.y;
        }
      }
      this.setPhase('toServe');
    }
  }

  emit(e: MatchEvent) {
    this.events.push(e);
  }

  /** Switch assist live (auto-run builds a flawless footwork planner). */
  setAssist(a: MatchConfig['assist']) {
    this.cfg.assist = a;
    for (const p of this.players) {
      const human = this.cfg.human[p.idx];
      const on = human && a === 'auto';
      if (on && !this.runners[p.idx]) this.runners[p.idx] = new AIBrain(this, p, 1);
      if (!on) this.runners[p.idx] = null;
      p.autoRun = on;
    }
  }

  /** Tell every planner (AI and auto-run) that a ball was struck. */
  private notifyStruck(by: PlayerIdx) {
    for (const b of this.ai) b?.onStruck(by);
    for (const r of this.runners) r?.onStruck(by);
  }

  get human(): PlayerBody | null {
    return this.cfg.human[0] ? this.players[0] : this.cfg.human[1] ? this.players[1] : null;
  }

  get names(): [string, string] {
    return [this.cfg.players[0].short, this.cfg.players[1].short];
  }

  get pressure() {
    return pressureOf(this.score);
  }

  private freshPoint(): PointState {
    const server = this.score.server;
    return {
      server,
      receiver: (1 - server) as PlayerIdx,
      half: courtHalf(this.score),
      serveNo: 1,
      lastHitter: null,
      hits: 0,
      bounces: 0,
      bounceSide: null,
      serveInFlight: false,
      cordOnServe: false,
      receiverTouched: false,
      lastShot: null,
      pressureOnReceiver: 0,
      lastQuality: 1,
      lastFaced: 0,
      lastBalance: 0,
      netRusher: [false, false],
      over: false,
      winner: null,
      reason: null,
      deadT: 0,
      wasBreakPoint: situation(this.score).breakPoint,
      netCordThisShot: false,
      firstBounce: null,
    };
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.phaseT = 0;
  }

  /** Where each player stands for the next serve. */
  private placeForPoint(keepServeNo: boolean) {
    const pt = this.point;
    const sv = this.players[pt.server];
    const rc = this.players[pt.receiver];
    const hs = halfSign(sv.side, pt.half);
    sv.target = { x: hs * (0.55 + this.rng() * 0.5), y: baselineY(sv.side) - sv.fwd * 0.25 };
    const hr = halfSign(rc.side, pt.half);
    const serveThreat = sv.def.stats.serve / 10;
    const back = 0.6 + serveThreat * 1.4 + (pt.serveNo === 2 ? -0.8 : 0);
    rc.target = { x: hr * 2.55, y: baselineY(rc.side) - rc.fwd * back };
    for (const p of this.players) {
      p.mode = 'walk';
      p.swing = null;
      p.serve = null;
      p.armed = null;
      p.charge = 0;
      p.holding = false;
    }
    void keepServeNo;
  }

  // ---------------------------------------------------------------------------
  // Main step

  step(dt: number, input: HumanInput) {
    this.input = input;
    this.now += dt;
    this.phaseT += dt;
    switch (this.phase) {
      case 'intro':
        this.stepIntro();
        break;
      case 'toServe':
        this.stepToServe(dt);
        break;
      case 'serving':
        this.stepServing(dt);
        break;
      case 'rally':
        this.stepRally(dt);
        break;
      case 'pointOver':
        this.stepPointOver();
        break;
      case 'changeover':
        if (
          this.phaseT > 5.5 ||
          (input.skip && this.phaseT > 0.6) ||
          (this.cfg.demo && this.phaseT > 2)
        ) {
          this.emit({ type: 'call', text: 'Time', voice: 'umpire' });
          this.beginPoint();
        }
        break;
      case 'matchOver':
        break;
    }
    this.movePlayers(dt);
    this.stepBallPhysics(dt);
    for (const p of this.players) {
      p.lookAt = { x: this.ball.x, y: this.ball.y, z: this.ball.z };
      p.updateSwing(this.now);
    }
  }

  private stepIntro() {
    if (this.phaseT > 0.4 && this.phaseT - SIM_STEP <= 0.4)
      this.emit({ type: 'call', text: 'Quiet please', voice: 'umpire' });
    if (this.phaseT > 0.4 && this.phaseT - SIM_STEP <= 0.4)
      this.emit({ type: 'crowd', mood: 'quiet', intensity: 0.5, favor: -1 });
    if (this.phaseT > 3) {
      this.emit({ type: 'call', text: 'Play', voice: 'umpire' });
      this.setPhase('toServe');
      this.toServeT = 0;
    }
  }

  private arrived(p: PlayerBody) {
    return !p.target || Math.hypot(p.target.x - p.x, p.target.y - p.y) < 0.15;
  }

  private stepToServe(dt: number) {
    const pt = this.point;
    const sv = this.players[pt.server];
    this.toServeT += dt;
    const ready = this.arrived(sv) && this.arrived(this.players[pt.receiver]);
    if (!ready && this.toServeT < 6) return;
    for (const p of this.players) {
      if (this.arrived(p)) {
        p.target = null;
        p.mode = 'ready';
      }
    }
    if (!sv.serve) {
      sv.serve = { phase: 'bounce', t: 0, st: 0, bounceT: 0 };
      this.emit({ type: 'crowd', mood: 'quiet', intensity: 0.5, favor: -1 });
    }
    const s = sv.serve;
    if (s.phase === 'bounce') {
      s.t += dt;
      const prev = s.bounceT;
      s.bounceT += dt;
      // A dribble every ~0.62 s.
      if (Math.floor(prev / 0.62) !== Math.floor(s.bounceT / 0.62) && s.bounceT > 0.3) {
        const hand = this.handWorld(sv);
        this.emit({ type: 'dribble', player: sv.idx, x: hand.x, y: hand.y });
      }
      const brain = this.ai[sv.idx];
      if (brain) {
        if (s.t > brain.serveDelay) this.startToss(sv, brain.pickServe(pt.serveNo === 1).kind);
      } else {
        // A fresh press, or a key already held when the server is ready.
        const want = this.input.pressed ?? (s.t > 0.35 ? this.input.held : null);
        if (want && s.t > 0.2)
          this.startToss(
            sv,
            want === 'slice' ? 'serveSlice' : want === 'lob' ? 'serveKick' : 'serveFlat',
          );
      }
    }
  }

  /** World position of a player's free hand at the toss (approx.). */
  private handWorld(p: PlayerBody): V3 {
    const pose = strokePose(
      'serve',
      0.34,
      locomotionPose({ time: 0, phase: 0, speed: 0, dx: 0, dy: 0, mode: 'idle' }),
    );
    const sk = solveSkeleton(pose, p.look.height, p.lefty);
    const w = p.toWorldDir(sk.haL.x, sk.haL.y);
    return { x: p.x + w.x, y: p.y + w.y, z: sk.haL.z };
  }

  private startToss(sv: PlayerBody, kind: ShotKind) {
    sv.serve = { phase: 'toss', t: 0, st: 0.18, bounceT: 0 };
    this.setPhase('serving');
    this.toss = { t0: this.now, ideal: 0, kind, releaseAt: null, swingAt: null };
    sv.holding = true;
    this.superArmed = false;
    // Receiver's split-step read begins.
    this.emit({ type: 'toss', player: sv.idx });
  }

  private stepServing(dt: number) {
    const pt = this.point;
    const sv = this.players[pt.server];
    const s = sv.serve;
    const toss = this.toss;
    if (!s || !toss) return;
    s.t += dt;
    const brain = this.ai[sv.idx];
    const k = sv.look.height / 1.8;
    const contactZ = contactOffset('serve').z * k + 0.1;
    if (toss.releaseAt === null) {
      // Arms drop, then the ball leaves the hand at st = 0.34.
      const u = Math.min(1, s.t / 0.3);
      s.st = 0.18 + 0.16 * u;
      if (u >= 1) {
        toss.releaseAt = this.now;
        const hand = this.handWorld(sv);
        const apex = contactZ + 0.5;
        const vz = Math.sqrt(2 * 9.81 * Math.max(0.3, apex - hand.z));
        const fwd = sv.toWorldDir((sv.lefty ? -1 : 1) * 0.14 * k, 0.42 * k);
        const drift = 0.45;
        Object.assign(this.ball, {
          x: hand.x,
          y: hand.y,
          z: hand.z,
          vx: ((sv.x + fwd.x - hand.x) / drift) * 0.5,
          vy: ((sv.y + fwd.y - hand.y) / drift) * 0.5,
          vz,
          wx: 0,
          wy: 0,
          wz: 0,
          rest: false,
        });
        this.ballLive = true;
        this.ballVisible = true;
        const g = 9.81;
        const up = vz / g;
        const down = Math.sqrt((2 * Math.max(0.05, apex - contactZ)) / g);
        toss.ideal = this.now + up + down;
      }
      return;
    }
    // Ball in the air: hold the trophy position.
    if (toss.swingAt === null) {
      const u = clamp(
        (this.now - toss.releaseAt) / Math.max(0.2, toss.ideal - toss.releaseAt - SERVE_SWING),
        0,
        1,
      );
      s.st = 0.34 + 0.14 * u;
      // Power meter: 0.85 at the perfect release.
      const idealRelease = toss.ideal - SERVE_SWING;
      sv.charge = clamp(((this.now - toss.t0) / (idealRelease - toss.t0)) * 0.85, 0, 1);
      let go = false;
      if (brain) go = this.now >= idealRelease + brain.serveTimingError;
      else go = this.input.released || (!this.input.held && this.now - toss.releaseAt > 0.15);
      if (this.input.power && !brain && this.style >= 250) this.superArmed = true;
      if (go) {
        toss.swingAt = this.now;
        sv.holding = false;
        this.emit({ type: 'swing', player: sv.idx, stroke: 'serve', power: 1 });
      } else if (this.ball.z < contactZ - 0.9 && this.ball.vz < 0) {
        // Bad toss: catch it and go again.
        this.ballLive = false;
        this.ballVisible = false;
        sv.serve = { phase: 'bounce', t: 0.6, st: 0, bounceT: 0 };
        sv.holding = false;
        this.toss = null;
        this.setPhase('toServe');
        this.emit({ type: 'callout', text: 'TOSS AGAIN', tone: 'info' });
      }
      return;
    }
    // Swing to contact.
    const u = clamp((this.now - toss.swingAt) / SERVE_SWING, 0, 1);
    s.st = 0.48 + 0.14 * u;
    if (u >= 1) this.serveContact(sv, contactZ);
  }

  private serveContact(sv: PlayerBody, contactZ: number) {
    const toss = this.toss!;
    const pt = this.point;
    const brain = this.ai[sv.idx];
    // Timing quality: how close the ball was to the ideal height.
    const dz = this.ball.z - contactZ;
    const q = clamp(1 - Math.abs(dz) / (dz > 0 ? 0.9 : 0.6), 0, 1);
    const kind = toss.kind;
    const st = sv.def.stats;
    let base = (150 + 7 * st.serve) / 3.6;
    if (kind === 'serveSlice') base *= 0.87;
    if (kind === 'serveKick') base *= 0.75;
    if (pt.serveNo === 2 && brain) base *= 0.93;
    // Easier opponents serve softer.
    if (brain) base *= 0.84 + 0.16 * brain.skill;
    const superShot = this.superArmed && kind === 'serveFlat';
    if (superShot) {
      base *= 1.1;
      this.addStyle(-250, 'POWER SERVE');
    }
    const speed = base * (0.8 + 0.2 * q);
    const box = serviceBox(otherSide(sv.side), pt.half);
    // Aim: human input or AI choice, as a fraction across the box.
    let aim: number;
    if (brain) aim = brain.pickServe(pt.serveNo === 1).aim;
    else {
      const ix = this.input.mx;
      aim = Math.abs(ix) < 0.2 ? 0 : Math.sign(ix);
    }
    const xMid = (box.x0 + box.x1) / 2;
    const xHalf = (box.x1 - box.x0) / 2 - (pt.serveNo === 1 ? 0.3 : 0.45);
    let tx = xMid + aim * xHalf;
    // A mistimed toss drops the ball shorter.
    const short = (1 - q) * 0.4;
    let ty = sv.side === 0 ? box.y1 - 0.55 - short : box.y0 + 0.55 + short;
    const mouse = !brain ? this.input.aim : null;
    if (mouse && sideOfY(mouse.y) !== sv.side) {
      // Pointing into the box: serve right there (a bad toss still drifts).
      tx = clamp(mouse.x, box.x0 + 0.22, box.x1 - 0.22);
      const near = sv.side === 0 ? box.y0 : box.y1;
      const far = sv.side === 0 ? box.y1 : box.y0;
      const f = clamp((mouse.y - near) / (far - near), 0.2, 0.93);
      ty = near + (far - near) * f - sv.fwd * short;
    }
    const handed = sv.lefty ? -1 : 1;
    const fw = sv.fwd;
    // Sidespin sign in world terms: right-hander's slice curves to their left.
    const side =
      (kind === 'serveSlice' ? 230 : kind === 'serveKick' ? -110 : 0) * handed * (fw > 0 ? 1 : 1);
    const spec: ShotSpec = {
      x: this.ball.x,
      y: this.ball.y,
      z: this.ball.z,
      tx,
      ty,
      speed,
      topspin: kind === 'serveKick' ? 380 : kind === 'serveSlice' ? 110 : 45,
      sidespin: side,
      netClear: kind === 'serveKick' ? 0.32 : kind === 'serveSlice' ? 0.12 : 0.07,
      minSpeed: speed * 0.6,
    };
    let launch = solveShot(spec);
    // Execution error.
    const skill = brain ? brain.skill : 0.75;
    const control = (st.serve + st.control) / 20;
    const pressure = this.pressure;
    const sig =
      (0.005 + (1 - q) * 0.018 + (1 - control) * 0.01 + pressure * 0.004) *
      (brain ? 1.5 - skill * 0.8 : 0.5) *
      (kind === 'serveFlat' ? 1.3 : kind === 'serveKick' ? 0.8 : 0.95) *
      (superShot ? 0.35 : 1);
    launch = perturb(
      launch,
      gaussian(this.rng) * sig * 0.5,
      gaussian(this.rng) * sig,
      gaussian(this.rng) * 0.015,
    );
    this.launchBall(launch);
    const kmhV = kmh(launch.speed);
    this.lastServeKmh = kmhV;
    const stt = this.stats[sv.idx];
    stt.fastestServe = Math.max(stt.fastestServe, kmhV);
    stt.serveSum += kmhV;
    stt.serveCount++;
    this.emit({ type: 'serveSpeed', kmh: kmhV });
    this.emit({
      type: 'hit',
      player: sv.idx,
      shot: kind,
      speed: launch.speed,
      power: q,
      x: this.ball.x,
      y: this.ball.y,
      z: this.ball.z,
      quality: q,
      super: superShot,
      serve: true,
    });
    this.superBall = superShot;
    sv.serve = { phase: 'done', t: 0, st: 0.62, bounceT: 0 };
    sv.startSwing('serve', kind, this.now - 0.001, this.now);
    sv.swing!.resolved = true;
    sv.charge = 0;
    pt.lastHitter = sv.idx;
    pt.hits = 1;
    pt.bounces = 0;
    pt.bounceSide = null;
    pt.serveInFlight = true;
    pt.cordOnServe = false;
    pt.lastShot = kind;
    pt.lastQuality = q;
    pt.pressureOnReceiver = clamp((launch.speed - 38) / 18, 0, 1);
    pt.netCordThisShot = false;
    this.toss = null;
    if (pt.serveNo === 1) this.stats[sv.idx].firstTotal++;
    else this.stats[sv.idx].secondTotal++;
    this.setPhase('rally');
    this.notifyStruck(sv.idx);
    // Serve-and-volleyers follow it in.
    const brain2 = this.ai[sv.idx];
    if (brain2 && brain2.wantsNetAfterServe(pt.serveNo === 1)) pt.netRusher[sv.idx] = true;
  }

  private launchBall(l: {
    vx: number;
    vy: number;
    vz: number;
    wx: number;
    wy: number;
    wz: number;
  }) {
    const b = this.ball;
    b.vx = l.vx;
    b.vy = l.vy;
    b.vz = l.vz;
    b.wx = l.wx;
    b.wy = l.wy;
    b.wz = l.wz;
    b.rest = false;
    b.seed = (b.seed * 1103515245 + 12345) >>> 0;
    b.n = 0;
    this.ballLive = true;
    this.ballVisible = true;
    this.pred = predict(b, this.surface, 3.4);
    this.predT0 = this.now;
  }

  // ---------------------------------------------------------------------------
  // Rally

  private stepRally(dt: number) {
    void dt;
    const pt = this.point;
    if (pt.over) return;
    for (const p of this.players) {
      const brain = this.ai[p.idx];
      const eligible = this.eligible(p);
      if (!eligible) {
        if (!brain) this.humanArming(p, null);
        continue;
      }
      const planner = brain ?? this.runners[p.idx];
      const c = this.findContact(p, planner ? planner.planVolley : true);
      this.contacts[p.idx] = c;
      if (brain) {
        if (!p.swing && c) {
          const tau = c.t - this.now;
          if (tau <= STROKES[c.stroke].pre && tau > -0.02 && brain.willSwing(c)) {
            const shot = brain.pickShotKind(c);
            this.beginSwing(p, c, shotForStroke(c, shot));
          }
        }
      } else {
        this.humanArming(p, c);
      }
      if (p.swing && !p.swing.resolved && c && !p.swing.locked) {
        // Keep the swing phase locked onto the ball as the player moves.
        const tau = c.t - this.now;
        p.swing.contactAt = c.t;
        if (tau < 0.06) p.swing.locked = true;
        // Early in the takeback the ball can still switch sides.
        if (
          p.swing.t < 0.3 &&
          sideOfStroke(p.swing.stroke) !== sideOfStroke(c.stroke) &&
          c.stroke !== 'smash'
        ) {
          const sliceSwing = p.swing.stroke === 'fhSlice' || p.swing.stroke === 'bhSlice';
          p.swing.stroke =
            sliceSwing &&
            (c.stroke === 'fh' || (c.stroke.startsWith('bh') && !c.stroke.includes('Volley')))
              ? sideOfStroke(c.stroke) > 0
                ? 'fhSlice'
                : 'bhSlice'
              : c.stroke;
        }
        this.retarget(p, c);
      }
      if (p.swing && !p.swing.resolved && this.now >= p.swing.contactAt - 1e-6)
        this.resolveContact(p);
    }
  }

  /** Can this player legally play the ball that's coming? */
  eligible(p: PlayerBody): boolean {
    const pt = this.point;
    if (!this.ballLive || pt.over) return false;
    if (pt.lastHitter === p.idx) return false;
    if (pt.lastHitter === null) return false;
    // Ball must be heading to (or already on) this side.
    const onSide = sideOfY(this.ball.y) === p.side;
    const heading = (p.side === 0 ? this.ball.vy < 0 : this.ball.vy > 0) || onSide;
    if (!heading) return false;
    if (pt.bounces >= 2) return false;
    return true;
  }

  private humanArming(p: PlayerBody, c: Contact | null) {
    const inp = this.input;
    // Arm on press, charge while held.
    if (inp.pressed || inp.power) {
      p.armed = inp.power ? 'flat' : inp.pressed;
      p.holding = true;
      if (inp.power && this.style >= 250) this.superArmed = true;
      p.charge = Math.max(p.charge, 0.6);
    }
    if (inp.released) p.holding = false;
    if (p.armed && p.holding) p.charge = Math.min(1, p.charge + SIM_STEP * 1.6);
    if (!c) return;
    const tau = c.t - this.now;
    if (!p.swing && p.armed) {
      if (tau <= STROKES[c.stroke].pre && tau > -0.1) {
        const shot = this.humanShotKind(p, c);
        this.beginSwing(p, c, shotForStroke(c, shot));
      }
    }
  }

  private humanShotKind(p: PlayerBody, c: Contact): ShotKind {
    const armed = p.armed ?? 'topspin';
    const back = this.input.my * p.fwd < -0.5;
    const aim = this.mouseAim(p);
    const shortAim = !!aim && Math.abs(aim.y) < 4.2;
    if (armed === 'slice' && (back || shortAim)) return 'drop';
    if (!c.bounced && c.z > 2.1 && armed !== 'lob') return 'smash';
    return armed;
  }

  private beginSwing(p: PlayerBody, c: Contact, shot: ShotKind) {
    p.startSwing(c.stroke, shot, this.now, c.t);
    this.retarget(p, c);
    this.emit({ type: 'swing', player: p.idx, stroke: c.stroke, power: p.charge });
  }

  private retarget(p: PlayerBody, c: Contact) {
    const sw = p.swing!;
    sw.delta = {
      x: clamp(c.dx, -0.55, 0.55),
      y: clamp(c.dy, -0.35, 0.35),
      z: clamp(c.dz, -0.7, 0.55),
    };
    sw.crouch = clamp(-c.dz * 0.55, 0, 0.32);
  }

  /**
   * Find when the ball will cross this player's contact plane (from where
   * they stand now), which stroke that calls for, and how far it will be
   * from the sweet spot.
   */
  findContact(p: PlayerBody, allowVolley = true): Contact | null {
    const pred = this.pred;
    if (!pred) return null;
    const pt = this.point;
    const i0 = Math.max(0, Math.ceil((this.now - this.predT0) / SIM_STEP - 1e-6));
    const k = p.k;
    const serveReturn = pt.serveInFlight && pt.lastHitter === pt.server && p.idx === pt.receiver;
    // The prediction starts at the last hit, so it already contains every
    // bounce since then (the ones behind us and the ones still to come).
    let bounces = 0;
    let ei = 0;
    const evs = pred.events;
    while (ei < evs.length && evs[ei].i <= i0) {
      if (evs[ei].kind === 'bounce' && sideOfY(evs[ei].y) === p.side) bounces++;
      ei++;
    }
    const plane = 0.5 * k;
    let prevLy = NaN;
    let first = true;
    for (let i = i0; i < pred.n; i++) {
      while (ei < evs.length && evs[ei].i <= i) {
        const e = evs[ei];
        if (e.kind === 'bounce' && sideOfY(e.y) === p.side) bounces++;
        if (e.kind === 'net') return null;
        ei++;
      }
      if (bounces >= 2) return null;
      const t = pred.pts[i * 4];
      const x = pred.pts[i * 4 + 1];
      const y = pred.pts[i * 4 + 2];
      const z = pred.pts[i * 4 + 3];
      if (sideOfY(y) !== p.side) {
        prevLy = NaN;
        continue;
      }
      if ((serveReturn || !allowVolley) && bounces === 0) {
        prevLy = NaN;
        continue;
      }
      const loc = p.toLocal(x, y);
      // Crossing the contact plane — or, on the very first sample, a ball that
      // is only just past it (a late swing still catches it).
      const crossing = prevLy > plane && loc.y <= plane;
      const justPast = first && loc.y <= plane && loc.y > plane - 0.35;
      first = false;
      if ((crossing || justPast) && z > 0.12) {
        const bounced = bounces > 0;
        const lx = p.lefty ? -loc.x : loc.x;
        let stroke: StrokeKind;
        if (z > 2.05 * k) stroke = 'smash';
        else if (!bounced) stroke = lx >= 0 ? 'fhVolley' : 'bhVolley';
        else stroke = lx >= 0 ? 'fh' : p.def.backhand === 1 ? 'bh1' : 'bh2';
        const o = contactOffset(stroke);
        return {
          t: this.predT0 + t,
          x,
          y,
          z,
          stroke,
          bounced,
          dx: lx - o.x * k,
          dy: loc.y - o.y * k,
          dz: z - o.z * k,
        };
      }
      prevLy = loc.y;
    }
    return null;
  }

  /** Ball meets racket (or doesn't). */
  private resolveContact(p: PlayerBody) {
    const sw = p.swing!;
    sw.resolved = true;
    if (!this.eligible(p)) return;
    const pt = this.point;
    const serveReturn = pt.serveInFlight && pt.lastHitter === pt.server && p.idx === pt.receiver;
    if (serveReturn && pt.bounces === 0) return;
    const b = this.ball;
    if (sideOfY(b.y) !== p.side) return;
    const k = p.k;
    const loc = p.toLocal(b.x, b.y);
    const lx = p.lefty ? -loc.x : loc.x;
    const o = contactOffset(sw.stroke);
    const dx = lx - o.x * k;
    const dy = loc.y - o.y * k;
    const dz = b.z - o.z * k;
    // Reach: lunging sideways and reaching down go further than reaching up.
    const reachX = 0.78 * k + 0.12;
    const rx = dx / reachX;
    const ry = dy / 0.75;
    const rz = dz > 0 ? dz / 1.0 : dz / 0.95;
    const miss = rx * rx + ry * ry + rz * rz;
    if (miss > 1) {
      this.emit({ type: 'whiff', player: p.idx, dx, dy, dz, stroke: sw.stroke });
      p.armed = null;
      p.charge = 0;
      return;
    }
    // A swing started late (clicked after it should have begun) is rushed.
    const late = clamp(1 - sw.pre / STROKES[sw.stroke].pre, 0, 1);
    const quality = clamp(1 - Math.pow(miss, 0.75), 0, 1) * (1 - 0.55 * late);
    this.strike(p, sw.shot, quality);
  }

  private strike(p: PlayerBody, shot: ShotKind, quality: number) {
    const pt = this.point;
    const b = this.ball;
    const brain = this.ai[p.idx];
    const st = p.def.stats;
    const incoming = ballSpeed(b);
    // A quick click already hits solidly; holding adds the rest.
    let power = brain ? brain.power(shot) : Math.max(0.6, p.charge);
    let superShot = false;
    if (!brain && this.superArmed && this.style >= 250 && shot !== 'drop' && shot !== 'lob') {
      superShot = true;
      this.addStyle(-250, 'POWER SHOT');
      power = 1;
    }
    this.superArmed = false;
    // Target.
    let tx: number;
    let ty: number;
    if (brain) {
      const tgt = brain.pickTarget(shot, quality);
      tx = tgt.x;
      ty = tgt.y;
    } else {
      const t = this.humanTarget(p, shot);
      tx = t.x;
      ty = t.y;
    }
    // Shot recipe.
    const pw = 0.82 + st.power * 0.035;
    const sp = st.spin;
    const lowBall = b.z < 0.45;
    let spec: ShotSpec;
    const common = { x: b.x, y: b.y, z: b.z, tx, ty };
    switch (shot) {
      case 'slice':
        spec = {
          ...common,
          speed: (16 + 9 * power) * pw,
          topspin: -(110 + 12 * sp),
          sidespin: 0,
          netClear: 0.28,
        };
        break;
      case 'lob':
        spec = {
          ...common,
          speed: (13.5 + 5 * power) * pw,
          topspin: 110 + 12 * sp,
          sidespin: 0,
          netClear: 2.2,
          high: true,
          minSpeed: 9,
        };
        break;
      case 'drop':
        spec = {
          ...common,
          speed: 9 + 3 * power,
          topspin: -260,
          sidespin: 0,
          netClear: 0.14,
          minSpeed: 5,
        };
        break;
      case 'volley':
        spec = {
          ...common,
          speed: (15 + 11 * power) * (0.85 + st.volley * 0.025),
          topspin: -50,
          sidespin: 0,
          netClear: 0.1,
          minSpeed: 7,
        };
        break;
      case 'smash':
        spec = {
          ...common,
          speed: (31 + 10 * power) * pw,
          topspin: 30,
          sidespin: 0,
          netClear: 0.12,
          minSpeed: 16,
        };
        break;
      case 'flat':
        spec = {
          ...common,
          speed: (27 + 11 * power) * pw,
          topspin: 55,
          sidespin: 0,
          netClear: 0.22,
        };
        break;
      default:
        spec = {
          ...common,
          speed: (20 + 13 * power) * pw,
          topspin: 140 + 24 * sp,
          sidespin: 0,
          netClear: 0.42 + (1 - power) * 0.3,
        };
    }
    // Players hit bigger than the computer (drives, volleys, smashes).
    if (!brain && shot !== 'lob' && shot !== 'drop') spec.speed *= 1.18;
    if (superShot) spec.speed *= 1.22;
    if (lowBall && shot !== 'drop' && shot !== 'lob') spec.speed *= 0.78;
    // Taking pace off a fast incoming ball is easier than generating it.
    spec.speed += clamp(incoming - 20, 0, 20) * 0.12;
    let launch = solveShot(spec);
    // Execution error.
    const control = st.control / 10;
    const skill = brain ? brain.skill : 0.7;
    const hard = pt.pressureOnReceiver;
    // Hitting on the run is harder, less so when auto-run set the feet.
    const balance = clamp(p.speed / p.maxSpeed, 0, 1) * (p.autoRun ? 0.45 : 1);
    // Angular error (rad). Depth is several times more sensitive to launch
    // elevation than width is to direction, so elevation error is smaller.
    let sig =
      0.004 +
      (1 - quality) * 0.05 +
      power * power * 0.016 +
      (1 - control) * 0.01 +
      hard * 0.022 +
      balance * 0.03 +
      this.pressure * 0.005;
    if (shot === 'drop') sig *= 1.3;
    if (shot === 'volley') sig *= 1.1 - st.volley * 0.04;
    // The AI scales with its skill. Players land close to where they aim:
    // only a badly stretched or very hard incoming ball throws them off.
    if (brain) sig *= 2.2 - skill * 1.8;
    else sig = 0.0025 + (1 - quality) * 0.02 + hard * 0.006 + this.pressure * 0.002;
    if (superShot) sig *= 0.3;
    launch = perturb(
      launch,
      gaussian(this.rng) * sig * (brain ? 0.42 : 0.35),
      gaussian(this.rng) * sig,
      gaussian(this.rng) * (brain ? 0.03 : 0.01),
    );
    // Recenter the ball on the racket and fly.
    this.launchBall(launch);
    this.superBall = superShot;
    pt.hits++;
    pt.lastHitter = p.idx;
    pt.bounces = 0;
    pt.bounceSide = null;
    pt.lastShot = shot;
    pt.lastQuality = quality;
    pt.lastFaced = pt.pressureOnReceiver;
    pt.lastBalance = balance;
    pt.netCordThisShot = false;
    // How hard is this to deal with for the opponent?
    pt.pressureOnReceiver =
      clamp((launch.speed - 22) / 18 + (superShot ? 0.4 : 0), 0, 1) * 0.7 +
      (shot === 'drop' ? 0.35 : 0);
    if (pt.serveInFlight) {
      pt.serveInFlight = false;
      pt.receiverTouched = true;
    }
    const nearNet = Math.abs(p.y) < 5;
    if (nearNet) pt.netRusher[p.idx] = true;
    p.armed = null;
    p.holding = false;
    const charged = p.charge;
    p.charge = 0;
    if (shot === 'smash' || superShot || power > 0.85) p.recoil(0.12);
    this.emit({
      type: 'hit',
      player: p.idx,
      shot,
      speed: launch.speed,
      power: Math.max(power, charged),
      x: b.x,
      y: b.y,
      z: b.z,
      quality,
      super: superShot,
      serve: false,
    });
    this.runners[p.idx]?.noteTarget(tx, ty);
    this.notifyStruck(p.idx);
  }

  /** The mouse aim point, if it points into the opponent's half. */
  private mouseAim(p: PlayerBody): { x: number; y: number } | null {
    const a = this.input.aim;
    if (!a || sideOfY(a.y) === p.side) return null;
    return a;
  }

  /**
   * Human aim: the mouse points where the ball should land; otherwise the
   * direction keys at contact pick side and depth.
   */
  private humanTarget(p: PlayerBody, shot: ShotKind): { x: number; y: number } {
    const inp = this.input;
    const f = p.fwd;
    const mouse = this.mouseAim(p);
    if (mouse) {
      let depth = clamp(Math.abs(mouse.y), 1.6, COURT.L + 0.6);
      if (shot === 'lob') depth = Math.max(depth, 7.5);
      if (shot === 'drop') depth = Math.min(depth, 3.6);
      return { x: clamp(mouse.x, -COURT.SW - 0.5, COURT.SW + 0.5), y: f * depth };
    }
    // Screen-relative: right = +x; for the near player "up" = deeper.
    const ax = clamp(inp.mx, -1, 1);
    const ay = clamp(inp.my * f, -1, 1);
    const L = COURT.L;
    let x = ax * 3.25;
    let depth = ay > 0.3 ? 10.3 : ay < -0.3 ? 6.4 : 9.1;
    if (Math.abs(ax) < 0.2 && Math.abs(ay) < 0.2) {
      // No input: a safe ball away from the opponent.
      const opp = this.players[1 - p.idx];
      x = clamp(-opp.x * 0.35, -1.6, 1.6);
    }
    if (ay < -0.3) x = ax * 3.6;
    if (shot === 'lob') depth = 10.2 + ay * 0.5;
    if (shot === 'drop') depth = 2.6;
    if (shot === 'smash' || shot === 'volley') depth = ay < -0.3 ? 4.5 : 8.8;
    depth = Math.min(depth, L - 0.35);
    return { x, y: f * depth };
  }

  // ---------------------------------------------------------------------------
  // Ball physics & rules

  private stepBallPhysics(dt: number) {
    if (!this.ballLive) {
      // The server holds the ball: nothing to simulate.
      return;
    }
    const evs = this.evBuf;
    evs.length = 0;
    const b = this.ball;
    stepBall(b, dt, this.surface, evs);
    // Trail.
    this.ballTrail.push(b.x, b.y, b.z);
    if (this.ballTrail.length > 18) this.ballTrail.splice(0, 3);
    if (this.phase === 'serving') {
      // Toss in the air: no rules yet.
      if (b.z < 0.2) this.ballLive = false;
      return;
    }
    for (const e of evs) this.onBallEvent(e);
    if (this.point.over) {
      this.point.deadT += dt;
    }
  }

  private onBallEvent(e: BallEvent) {
    const pt = this.point;
    if (e.kind === 'cord' || e.kind === 'net') {
      this.emit({ type: 'net', x: e.x, cord: e.kind === 'cord', speed: e.speed });
      if (pt.over) return;
      if (e.kind === 'cord') {
        if (pt.serveInFlight) pt.cordOnServe = true;
        pt.netCordThisShot = true;
        this.emit({ type: 'crowd', mood: 'ooh', intensity: 0.6, favor: -1 });
      }
      return;
    }
    if (e.kind === 'wall') {
      if (pt.over || pt.lastHitter === null) return;
      this.emit({ type: 'wall', x: e.x, y: e.y, speed: e.speed });
      const hitter = pt.lastHitter;
      const wallSide = sideOfY(e.y);
      const hitterSide = this.players[hitter].side;
      if (pt.bounces === 0 && wallSide !== hitterSide) {
        // Flew out without landing.
        if (pt.serveInFlight) this.fault('out');
        else this.endPoint((1 - hitter) as PlayerIdx, 'out');
      } else if (pt.bounces >= 1 && pt.bounceSide !== hitterSide) {
        this.endPoint(
          hitter,
          pt.hits <= 1 ? (pt.receiverTouched ? 'serviceWinner' : 'ace') : 'winner',
        );
      }
      return;
    }
    // Bounce.
    const side = sideOfY(e.y);
    const bounceEv = { x: e.x, y: e.y, speed: e.speed };
    if (pt.over || pt.lastHitter === null) {
      this.emit({ type: 'bounce', ...bounceEv, line: false, out: false, dead: true });
      return;
    }
    const hitter = pt.lastHitter;
    const hitterSide = this.players[hitter].side;
    if (side === hitterSide) {
      // Never crossed the net.
      this.emit({ type: 'bounce', ...bounceEv, line: false, out: false, dead: false });
      if (pt.serveInFlight) this.fault('net');
      else this.endPoint((1 - hitter) as PlayerIdx, 'net');
      return;
    }
    if (pt.bounceSide !== side) {
      pt.bounceSide = side;
      pt.bounces = 0;
    }
    pt.bounces++;
    if (pt.bounces === 1) {
      const rect = pt.serveInFlight ? serviceBox(side, pt.half) : singlesHalf(side);
      const margin = lineMargin(rect, e.x, e.y);
      const inside = inRect(rect, e.x, e.y);
      const line = Math.abs(margin) < 0.06;
      this.emit({ type: 'bounce', ...bounceEv, line, out: !inside, dead: false });
      pt.firstBounce = { x: e.x, y: e.y };
      if (!inside) {
        // How far the ball's edge missed the outside of the line.
        const cm = Math.max(1, Math.round((margin - COURT.BALL_R) * 100));
        const close = cm <= 15;
        this.emit({ type: 'out', x: e.x, y: e.y, close, cm });
        if (pt.serveInFlight) this.fault('out');
        else {
          this.emit({ type: 'call', text: 'Out', voice: 'line' });
          this.endPoint((1 - hitter) as PlayerIdx, 'out');
        }
        return;
      }
      if (pt.serveInFlight && pt.cordOnServe) {
        this.let();
        return;
      }
      // Clipped the line (5 cm wide): the crowd notices.
      if (margin > -0.05 - COURT.BALL_R) this.emit({ type: 'lineCall', x: e.x, y: e.y });
      if (margin > -0.25) this.emit({ type: 'crowd', mood: 'ooh', intensity: 0.4, favor: -1 });
      return;
    }
    // Second bounce: the other player didn't get there.
    this.emit({ type: 'bounce', ...bounceEv, line: false, out: false, dead: false });
    let reason: PointReason = 'winner';
    if (pt.hits === 1) reason = pt.receiverTouched ? 'serviceWinner' : 'ace';
    this.endPoint(hitter, reason);
  }

  private fault(why: 'out' | 'net') {
    const pt = this.point;
    const sv = pt.server;
    if (pt.serveNo === 1) {
      this.emit({ type: 'call', text: 'Fault', voice: why === 'out' ? 'line' : 'umpire' });
      this.emit({ type: 'fault', second: false });
      this.emit({ type: 'callout', text: 'FAULT', tone: 'info' });
      this.emit({ type: 'crowd', mood: 'ooh', intensity: 0.25, favor: -1 });
      pt.serveNo = 2;
      this.afterServeReset(1.1);
    } else {
      this.emit({ type: 'call', text: 'Fault', voice: why === 'out' ? 'line' : 'umpire' });
      this.emit({ type: 'fault', second: true });
      this.stats[sv].doubleFaults++;
      this.endPoint((1 - sv) as PlayerIdx, 'doubleFault');
    }
  }

  private let() {
    this.emit({ type: 'call', text: 'Let', voice: 'umpire' });
    this.emit({ type: 'let' });
    this.emit({ type: 'callout', text: 'LET', tone: 'info' });
    this.afterServeReset(1.0);
  }

  private resetDelay = 0;

  /** After a fault or let: pause, then serve again. */
  private afterServeReset(delay: number) {
    const pt = this.point;
    pt.lastHitter = null;
    pt.hits = 0;
    pt.bounces = 0;
    pt.bounceSide = null;
    pt.serveInFlight = false;
    pt.cordOnServe = false;
    pt.receiverTouched = false;
    this.resetDelay = delay;
    this.setPhase('pointOver');
    pt.over = false;
    for (const p of this.players) p.swing = null;
  }

  private endPoint(winner: PlayerIdx, reason: PointReason) {
    const pt = this.point;
    if (pt.over) return;
    pt.over = true;
    pt.winner = winner;
    pt.reason = reason;
    this.resetDelay = 0;
    const loser = (1 - winner) as PlayerIdx;
    const rally = pt.hits;
    this.longestRally = Math.max(this.longestRally, rally);
    // Classify errors: if the loser hit the ball last, it's an error.
    let finalReason = reason;
    if ((reason === 'out' || reason === 'net') && pt.lastHitter === loser) {
      const forced = pt.lastQuality < 0.5 || pt.lastFaced > 0.45 || pt.lastBalance > 0.55;
      finalReason = forced ? 'forced' : 'unforced';
      // A missed return is credited to the serve.
      if (pt.hits === 2 && loser === pt.receiver) finalReason = 'serviceWinner';
    }
    pt.reason = finalReason;
    const sw = this.stats[winner];
    const sl = this.stats[loser];
    sw.points++;
    if (finalReason === 'ace') sw.aces++;
    if (finalReason === 'winner' || finalReason === 'ace' || finalReason === 'serviceWinner')
      sw.winners++;
    if (finalReason === 'unforced') sl.unforced++;
    if (finalReason === 'forced') sl.forced++;
    const server = pt.server;
    if (pt.serveNo === 1 && finalReason !== 'doubleFault') {
      this.stats[server].firstIn++;
      if (winner === server) this.stats[server].firstWon++;
    } else if (pt.serveNo === 2 && winner === server) this.stats[server].secondWon++;
    for (const i of [0, 1] as PlayerIdx[]) {
      if (pt.netRusher[i]) {
        this.stats[i].netPoints++;
        if (winner === i) this.stats[i].netWon++;
      }
    }
    if (pt.wasBreakPoint) {
      this.stats[pt.receiver].breakPoints++;
      if (winner === pt.receiver) this.stats[pt.receiver].breaksWon++;
    }
    const sit = situation(this.score);
    const big =
      sit.setPoint === winner ||
      sit.matchPoint === winner ||
      (pt.wasBreakPoint && winner === pt.receiver) ||
      rally >= 12;
    this.emit({ type: 'point', winner, reason: finalReason, rally, big });
    this.pointCallouts(winner, finalReason, rally, big);
    this.setPhase('pointOver');
    // Players react.
    const w = this.players[winner];
    const l = this.players[loser];
    if (big || finalReason === 'ace' || (finalReason === 'winner' && this.rng() < 0.6)) {
      w.gesture = 'celebrate';
      w.gestureT = 0;
      if (w.side === 0 && big) w.faceCamera = true;
    }
    if (finalReason === 'unforced' || finalReason === 'doubleFault') {
      l.gesture = 'dejected';
      l.gestureT = 0;
    }
  }

  private pointCallouts(winner: PlayerIdx, reason: PointReason, rally: number, big: boolean) {
    const human = this.human?.idx ?? -1;
    const good = winner === human;
    const tone = human === -1 ? 'info' : good ? 'good' : 'bad';
    const label =
      reason === 'ace'
        ? 'ACE!'
        : reason === 'doubleFault'
          ? 'DOUBLE FAULT'
          : reason === 'serviceWinner'
            ? 'SERVICE WINNER'
            : reason === 'winner'
              ? this.point.lastShot === 'drop'
                ? 'DROP SHOT!'
                : this.point.lastShot === 'lob'
                  ? 'LOB WINNER!'
                  : this.point.lastShot === 'volley' || this.point.lastShot === 'smash'
                    ? this.point.lastShot === 'smash'
                      ? 'SMASH!'
                      : 'VOLLEY WINNER'
                    : 'WINNER!'
              : reason === 'unforced'
                ? 'UNFORCED ERROR'
                : reason === 'forced'
                  ? 'FORCED ERROR'
                  : reason === 'net'
                    ? 'NET'
                    : 'OUT';
    this.emit({ type: 'callout', text: label, tone: big ? 'big' : tone });
    // Crowd.
    let mood: CrowdMood = 'applause';
    let intensity = 0.5;
    if (reason === 'ace') {
      mood = 'applause';
      intensity = 0.75;
    }
    if (reason === 'winner') {
      mood = rally >= 8 ? 'ovation' : 'applause';
      intensity = 0.65 + Math.min(0.35, rally * 0.03);
    }
    if (reason === 'doubleFault') {
      mood = 'groan';
      intensity = 0.7;
    }
    if (reason === 'unforced') {
      mood = rally >= 8 ? 'applause' : 'groan';
      intensity = 0.45;
    }
    if (big) {
      mood = 'ovation';
      intensity = 0.95;
    }
    this.emit({ type: 'crowd', mood, intensity, favor: winner });
    // Style for the human.
    if (human === -1) return;
    if (winner === human) {
      const shot = this.point.lastShot;
      if (reason === 'ace') this.addStyle(50, 'ACE');
      else if (reason === 'serviceWinner') this.addStyle(25, 'SERVICE WINNER');
      else if (reason === 'winner') {
        let pts = 35;
        let lbl = 'WINNER';
        if (shot === 'drop') {
          pts = 45;
          lbl = 'DROP SHOT';
        } else if (shot === 'lob') {
          pts = 50;
          lbl = 'LOB';
        } else if (shot === 'volley') {
          pts = 40;
          lbl = 'VOLLEY';
        } else if (shot === 'smash') {
          pts = 40;
          lbl = 'SMASH';
        }
        if (this.point.netCordThisShot) {
          pts += 5;
          lbl = 'NET CORD';
        }
        this.addStyle(pts, lbl);
      } else if (reason === 'forced') this.addStyle(15, 'FORCED ERROR');
      if (rally >= 9) this.addStyle(3 * (rally - 8), `${rally}-SHOT RALLY`);
    }
  }

  addStyle(amount: number, label: string) {
    this.style = clamp(this.style + amount, 0, 1000);
    if (amount > 0) this.emit({ type: 'style', amount, label });
  }

  private stepPointOver() {
    const pt = this.point;
    // Faults and lets: quick reset, same point.
    if (!pt.over) {
      if (this.phaseT > this.resetDelay) {
        this.ballLive = false;
        this.ballVisible = false;
        this.placeForPoint(true);
        this.setPhase('toServe');
        this.toServeT = 0;
      }
      return;
    }
    const wait = this.cfg.demo ? 1.6 : 1.9;
    if (this.phaseT < wait) return;
    if (!this.pendingOutcome) {
      const out = awardPoint(this.score, pt.winner!);
      this.pendingOutcome = out;
      this.emit({ type: 'score', outcome: out });
      const call =
        out.game !== null
          ? gameCall(this.score, out, this.names)
          : pointCall(this.score, this.names);
      if (call) this.emit({ type: 'call', text: call, voice: 'umpire' });
      if (out.game !== null) {
        const breakMsg = out.breakOfServe && out.set === null && out.match === null;
        if (breakMsg)
          this.emit({
            type: 'callout',
            text: 'BREAK!',
            tone: pt.winner === this.human?.idx ? 'good' : 'bad',
          });
        if (breakMsg && pt.winner === this.human?.idx) this.addStyle(20, 'BREAK');
        this.emit({ type: 'callout', text: out.set !== null ? 'SET' : 'GAME', tone: 'info' });
      }
      if (out.match !== null) {
        this.emit({ type: 'crowd', mood: 'standing', intensity: 1, favor: out.match });
        this.emit({ type: 'matchOver', winner: out.match });
        this.setPhase('matchOver');
        const w = this.players[out.match];
        w.gesture = 'celebrate';
        w.gestureT = 0;
        w.faceCamera = true;
        const l = this.players[1 - out.match];
        l.gesture = 'dejected';
        l.gestureT = 0;
        return;
      }
      if (out.set !== null)
        this.emit({ type: 'crowd', mood: 'standing', intensity: 0.9, favor: out.set });
      this.changeoverPending = out.changeEnds;
      return;
    }
    if (this.phaseT < wait + (this.pendingOutcome.game !== null ? 1.2 : 0.4)) return;
    this.pendingOutcome = null;
    if (this.changeoverPending) {
      this.changeoverPending = false;
      this.ballLive = false;
      this.ballVisible = false;
      this.emit({ type: 'changeover' });
      this.emit({ type: 'sweep' });
      if (this.rng() < 0.4) this.emit({ type: 'crowd', mood: 'wave', intensity: 1, favor: -1 });
      this.setPhase('changeover');
      this.point = this.freshPoint();
      this.placeForPoint(false);
      return;
    }
    this.beginPoint();
  }

  private beginPoint() {
    this.point = this.freshPoint();
    this.ballLive = false;
    this.ballVisible = false;
    this.ballTrail.length = 0;
    for (const p of this.players) {
      p.gesture = null;
      p.faceCamera = false;
    }
    this.placeForPoint(false);
    this.setPhase('toServe');
    this.toServeT = 0;
    const sit = situation(this.score);
    const h = this.human?.idx;
    if (sit.matchPoint !== null)
      this.emit({
        type: 'callout',
        text: 'MATCH POINT',
        tone: h === undefined ? 'info' : sit.matchPoint === h ? 'good' : 'bad',
      });
    else if (sit.setPoint !== null)
      this.emit({
        type: 'callout',
        text: 'SET POINT',
        tone: h === undefined ? 'info' : sit.setPoint === h ? 'good' : 'bad',
      });
    else if (sit.breakPoint) this.emit({ type: 'callout', text: 'BREAK POINT', tone: 'info' });
  }

  // ---------------------------------------------------------------------------
  // Movement

  private movePlayers(dt: number) {
    const grip = this.surface.grip;
    for (const p of this.players) {
      let ix = 0;
      let iy = 0;
      let sprint = false;
      let bounds: 'rally' | 'free' = 'rally';
      if (p.target) {
        // Auto-walk between points.
        const dx = p.target.x - p.x;
        const dy = p.target.y - p.y;
        const d = Math.hypot(dx, dy);
        const walkSpeed = this.phase === 'rally' ? 1 : 0.85;
        if (d > 0.05) {
          const k = Math.min(1, d / 0.8) * walkSpeed;
          ix = (dx / d) * k;
          iy = (dy / d) * k;
        }
        bounds = 'free';
        if (d < 0.15 && this.phase !== 'intro') p.mode = 'ready';
      } else {
        const brain = this.ai[p.idx];
        const canMove =
          this.phase === 'rally' ||
          this.phase === 'toServe' ||
          this.phase === 'serving' ||
          this.phase === 'pointOver';
        if (brain) {
          if (canMove) {
            const m = brain.update(dt);
            ix = m.x;
            iy = m.y;
            sprint = m.sprint;
          }
        } else if (this.runners[p.idx] && this.phase !== 'toServe' && this.phase !== 'serving') {
          // Auto-run: the player reads the ball and gets there by themselves;
          // the direction keys only aim.
          if (canMove) {
            const m = this.runners[p.idx]!.update(dt);
            ix = m.x;
            iy = m.y;
            sprint = m.sprint;
          }
        } else if (canMove && !(p.serve && p.serve.phase !== 'done')) {
          const inp = this.input;
          ix = inp.mx;
          iy = inp.my;
          sprint = inp.sprint;
          // Movement assist: drift toward the ideal hitting spot while a shot
          // is loaded or the racket is already going back.
          const swinging = p.swing && !p.swing.resolved;
          if (this.cfg.assist === 'move' && (p.armed || swinging) && this.phase === 'rally') {
            const c = this.contacts[p.idx];
            if (c && c.t - this.now < 0.9) {
              let dx = c.dx;
              let dy = c.dy;
              if (swinging) {
                // Settle into the stance of the stroke actually being played.
                const o = contactOffset(p.swing!.stroke);
                const loc = p.toLocal(c.x, c.y);
                dx = (p.lefty ? -loc.x : loc.x) - o.x * p.k;
                dy = loc.y - o.y * p.k;
              }
              const w = p.toWorldDir(p.lefty ? -dx : dx, dy);
              const pull = swinging ? 1.6 : 0.9;
              ix += clamp(w.x * pull, -0.9, 0.9);
              iy += clamp(w.y * pull * 0.5, -0.5, 0.5);
            }
          }
          // Serving: slide along the baseline only.
          if (this.phase === 'toServe' && this.point.server === p.idx) {
            iy = 0;
            const hs = halfSign(p.side, this.point.half);
            const lo = hs > 0 ? 0.2 : -COURT.SW + 0.3;
            const hi = hs > 0 ? COURT.SW - 0.3 : -0.2;
            if ((p.x <= lo && ix < 0) || (p.x >= hi && ix > 0)) ix = 0;
          }
        }
        if (
          this.phase === 'pointOver' ||
          this.phase === 'matchOver' ||
          this.phase === 'changeover'
        ) {
          if (!p.target) {
            ix *= 0.3;
            iy *= 0.3;
          }
        }
      }
      const before = { x: p.x, y: p.y };
      p.move(dt, ix, iy, sprint, grip, bounds);
      this.stats[p.idx].distance += Math.hypot(p.x - before.x, p.y - before.y);
      if (this.phase === 'toServe' && this.point.server === p.idx && !p.target) {
        // Keep the server behind the baseline, in the right half.
        const bl = baselineY(p.side);
        p.y = p.side === 0 ? Math.min(p.y, bl - 0.12) : Math.max(p.y, bl + 0.12);
      }
      p.settleYaw(dt);
    }
  }

  /** Serve-meter state for the HUD. */
  serveMeter(): { value: number; sweet: [number, number] } | null {
    if (this.phase !== 'serving' || !this.toss || this.toss.swingAt !== null) return null;
    const sv = this.players[this.point.server];
    if (this.ai[sv.idx]) return null;
    return { value: sv.charge, sweet: [0.74, 0.95] };
  }
}

/** +1 forehand side, −1 backhand side, 0 overhead. */
export function sideOfStroke(s: StrokeKind): number {
  if (s === 'smash' || s === 'serve') return 0;
  return s === 'fh' || s === 'fhSlice' || s === 'fhVolley' ? 1 : -1;
}

/** Map a shot choice onto the stroke the ball position calls for. */
export function shotForStroke(c: Contact, shot: ShotKind): ShotKind {
  if (c.stroke === 'smash') return shot === 'lob' ? 'lob' : 'smash';
  if (c.stroke === 'fhVolley' || c.stroke === 'bhVolley')
    return shot === 'drop' ? 'drop' : shot === 'lob' ? 'lob' : 'volley';
  if (shot === 'slice' || shot === 'drop') {
    c.stroke = c.stroke === 'fh' ? 'fhSlice' : 'bhSlice';
  }
  return shot;
}
