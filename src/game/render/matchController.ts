/**
 * Runs a match: fixed-step simulation, input, rendering, sound, crowd, ball
 * kids and the HUD. The Match only knows the rules; this is where it gets
 * its sights and sounds.
 */

import { audio } from '../audio/engine';
import type { BounceKind, HitKind } from '../audio/sounds';
import { hashString, makeRng, pick } from '../core/rng';
import { clamp, damp, kmh } from '../core/math';
import { locomotionPose, type Pose } from '../art/playerRig';
import { Controls } from '../input/controls';
import { SIM_STEP } from '../sim/ball';
import { COURT, sideOfY } from '../sim/court';
import { Match, NO_INPUT, type MatchEvent } from '../sim/match';
import { whiteDressCode, type PlayerDef, type PlayerLook } from '../sim/roster';
import { pointLabels, scoreLine } from '../sim/scoring';
import type { MatchFormat } from '../sim/scoring';
import type { ShotKind } from '../sim/shots';
import type { VenueDef } from '../sim/venues';
import { useHud, type MatchResult } from '../state/hud';
import type { Assist } from '../state/store';
import {
  MatchRenderer,
  kneelPose,
  standBackPose,
  umpirePose,
  type RenderKid,
} from './matchRenderer';
import { PKind } from './particles';
import { buildPlayerMaterials, type PlayerMaterials } from './playerRenderer';
import { PAN } from '../art/stadium';
import { goatify } from '../art/goat';

export interface ControllerOptions {
  canvas: HTMLCanvasElement;
  W: number;
  H: number;
  players: [PlayerDef, PlayerDef];
  venue: VenueDef;
  format: MatchFormat;
  /** AI skill for computer players. */
  skill: [number, number];
  human: [boolean, boolean];
  timeScale: number;
  assist: Assist;
  demo?: boolean;
  /** Play sound (the attract loop runs silent until the player opts in). */
  sound: boolean;
  /** Goat mode: players, ball kids, umpire and crowd are all goats. */
  goats?: boolean;
  onMatchOver?: (r: MatchResult) => void;
}

interface Kid {
  home: { x: number; y: number; yaw: number; kneel: boolean };
  x: number;
  y: number;
  yaw: number;
  state: 'home' | 'fetch' | 'back';
  gait: number;
  speed: number;
  look: PlayerLook;
  mats: PlayerMaterials;
}

const SURF: Record<string, BounceKind> = {
  hard: 'hard',
  clay: 'clay',
  grass: 'grass',
  indoor: 'indoor',
};

function hitKind(shot: ShotKind, quality: number): HitKind {
  if (quality < 0.18) return 'frame';
  if (shot === 'serveFlat' || shot === 'serveSlice' || shot === 'serveKick') return 'serve';
  if (shot === 'smash') return 'smash';
  if (shot === 'slice' || shot === 'drop') return 'slice';
  if (shot === 'volley') return 'volley';
  return 'drive';
}

export class MatchController {
  readonly match: Match;
  renderer: MatchRenderer;
  readonly controls = new Controls();
  readonly opts: ControllerOptions;
  private ctx: CanvasRenderingContext2D;
  private seed: number;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private time = 0;
  paused = false;
  private pan = 0;
  private shake = 0;
  private flash = 0;
  private kids: Kid[] = [];
  private mats: [PlayerMaterials, PlayerMaterials];
  private looks: [PlayerLook, PlayerLook];
  private hudT = 0;
  private calloutId = 0;
  private led: { text: string; until: number } | null = null;
  private surfaceSound: BounceKind;
  private deadSince = -1;
  private resultSent = false;
  private started = false;
  sound: boolean;

  constructor(o: ControllerOptions) {
    this.opts = o;
    this.sound = o.sound;
    const looks = o.players.map((p) => {
      const look = o.venue.id === 'lawn' ? whiteDressCode(p.look) : p.look;
      return o.goats ? goatify(look) : look;
    }) as [PlayerLook, PlayerLook];
    this.looks = looks;
    const seed =
      (hashString(o.players[0].id + o.players[1].id + o.venue.id) ^ (Date.now() & 0xffff)) >>> 0;
    this.match = new Match({
      players: o.players,
      looks,
      human: o.human,
      skill: o.skill,
      venue: o.venue,
      format: o.format,
      assist: o.assist,
      seed,
      demo: o.demo,
    });
    this.seed = seed;
    this.renderer = new MatchRenderer(
      o.venue,
      o.W,
      o.H,
      [o.players[0].country, o.players[1].country],
      seed & 0xff,
      !!o.goats,
    );
    this.mats = [buildPlayerMaterials(looks[0]), buildPlayerMaterials(looks[1])];
    this.surfaceSound = SURF[o.venue.surface];
    const ctx = o.canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
    this.buildKids(seed);
    // The mouse aims at the court point under the cursor, through the live camera.
    this.controls.resolveAim = (sx, sy) => this.renderer.cam.groundAt(sx, sy);
    const hud = useHud.getState();
    hud.set({
      active: !o.demo,
      names: [o.players[0].short, o.players[1].short],
      countries: [o.players[0].country, o.players[1].country],
      colors: [o.players[0].look.top.color, o.players[1].look.top.color],
      human: o.human[0] ? 0 : o.human[1] ? 1 : -1,
      sets: [],
      games: [0, 0],
      points: ['0', '0'],
      server: this.match.score.server,
      tiebreak: false,
      pressure: 0,
      style: 0,
      sprint: 1,
      phase: 'intro',
      serveKmh: null,
      callouts: [],
      toasts: [],
      paused: false,
      changeover: false,
      result: null,
      hint: o.demo ? null : 'serve',
    });
  }

  private buildKids(seed: number) {
    const v = this.opts.venue;
    const rng = makeRng(seed + 99);
    const skins = [
      'skinPale',
      'skinLight',
      'skinTan',
      'skinOlive',
      'skinBrown',
      'skinDeep',
    ] as const;
    const hairs = ['hairBlack', 'hairBrown', 'hairBlond', 'hairChestnut'] as const;
    const homes = [
      { x: COURT.POST_X + 0.9, y: 0.45, yaw: -Math.PI / 2, kneel: true },
      { x: -(COURT.POST_X - 0.1), y: -0.9, yaw: Math.PI / 2, kneel: true },
      { x: 6.7, y: COURT.L + 4.3, yaw: Math.PI, kneel: false },
      { x: -6.7, y: COURT.L + 4.3, yaw: Math.PI, kneel: false },
      { x: 7.5, y: -(COURT.L + 2.6), yaw: 0, kneel: false },
      { x: -7.5, y: -(COURT.L + 2.6), yaw: 0, kneel: false },
    ];
    for (const h of homes) {
      const look: PlayerLook = {
        skin: pick(rng, skins),
        hair: pick(rng, hairs),
        hairStyle: rng() < 0.4 ? 'ponytail' : 'short',
        headwear: rng() < 0.5 ? { kind: 'cap', color: v.kids.top } : { kind: 'none' },
        top: { color: v.kids.top, trim: '#f4f4f0', style: 'tee' },
        bottom: { color: v.kids.bottom, style: 'shorts' },
        socks: '#f4f4f0',
        shoes: '#f4f4f0',
        racket: { frame: '#000', accent: '#000' },
        height: 1.72,
        build: 0.9,
      };
      const kidLook = this.opts.goats ? goatify(look) : look;
      this.kids.push({
        home: h,
        x: h.x,
        y: h.y,
        yaw: h.yaw,
        state: 'home',
        gait: 0,
        speed: 0,
        look: kidLook,
        mats: buildPlayerMaterials(kidLook),
      });
    }
  }

  start() {
    this.controls.attach();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    if (this.sound) this.startSound();
  }

  startSound() {
    this.sound = true;
    if (!audio.ready || this.started) return;
    this.started = true;
    const v = this.opts.venue;
    audio.setRoom(v.reverb);
    audio.setAmbience(v.ambience);
    void audio.startCrowd(0.2);
    for (const p of this.opts.players) audio.prepareVoice(p.id, p.voice.pitch, !!this.opts.goats);
    audio.goats = !!this.opts.goats;
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.controls.detach();
    if (this.started) {
      audio.stopCrowd();
      audio.setAmbience(null);
      audio.hush();
    }
    useHud.getState().set({ active: false });
  }

  /** New canvas size: repaint the stadium, keep the match going. */
  resize(canvas: HTMLCanvasElement, W: number, H: number) {
    const o = this.opts;
    o.W = W;
    o.H = H;
    this.renderer = new MatchRenderer(
      o.venue,
      W,
      H,
      [o.players[0].country, o.players[1].country],
      this.seed & 0xff,
      !!o.goats,
    );
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
  }

  /** Live settings. */
  configure(timeScale: number, assist: Assist) {
    this.opts.timeScale = timeScale;
    if (this.match.cfg.assist !== assist) this.match.setAssist(assist);
  }

  /** Mouse over the canvas (client coords): aim at whatever is under it. */
  aimAtClient(clientX: number, clientY: number, rect: DOMRect) {
    const sx = ((clientX - rect.left) / rect.width) * this.opts.W;
    const sy = ((clientY - rect.top) / rect.height) * this.opts.H;
    this.controls.setAimScreen(sx, sy);
  }

  setPaused(p: boolean) {
    this.paused = p;
    useHud.getState().set({ paused: p });
    if (this.started) audio.setCrowd(p ? 0.05 : 0.2, p ? 0.3 : 1);
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    // rAF timestamps can precede the performance.now() taken at start: never step backwards.
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    const m = this.match;
    const peek = this.controls.sample(false);
    if (peek.pause && !this.opts.demo && m.phase !== 'matchOver') {
      this.controls.sample(true);
      this.setPaused(!this.paused);
    }
    if (!this.paused) {
      this.acc += dt * this.opts.timeScale;
      let steps = 0;
      while (this.acc >= SIM_STEP && steps < 14) {
        const input = this.opts.demo ? NO_INPUT : this.controls.sample(true);
        m.step(SIM_STEP, input);
        this.acc -= SIM_STEP;
        steps++;
        this.processEvents();
      }
      this.time += dt;
      this.updateVisuals(dt);
    }
    this.draw();
  };

  // ---------------------------------------------------------------------------
  // Events → sights & sounds

  private pan01(x: number, y: number, z = 0) {
    const p = this.renderer.cam.project(x, y, z);
    return {
      pan: clamp((p.sx - this.opts.W / 2) / (this.opts.W / 2), -1, 1),
      dist: clamp((y + 12) / 24, 0, 1),
    };
  }

  private callout(text: string, tone: 'good' | 'bad' | 'info' | 'big') {
    const hud = useHud.getState();
    const id = ++this.calloutId;
    hud.set({ callouts: [...hud.callouts.slice(-2), { id, text, tone }] });
    setTimeout(() => {
      const h = useHud.getState();
      h.set({ callouts: h.callouts.filter((c) => c.id !== id) });
    }, 1800);
  }

  private processEvents() {
    const m = this.match;
    const evs = m.events;
    if (!evs.length) return;
    const snd = this.started && this.sound;
    const r = this.renderer;
    for (const e of evs as MatchEvent[]) {
      switch (e.type) {
        case 'hit': {
          const { pan, dist } = this.pan01(e.x, e.y, e.z);
          if (snd) {
            audio.hit(hitKind(e.shot, e.quality), Math.max(0.3, e.power), pan, dist);
            const p = this.opts.players[e.player];
            const effort = e.serve ? 0.8 : e.power;
            if (p.voice.grunt > 0 && (effort > 0.45 || Math.random() < 0.25))
              audio.grunt(p.id, effort, p.voice.grunt, pan, dist);
          }
          if (e.super) {
            r.particles.burst(PKind.Spark, e.x, e.y, e.z, 26, 3.5, 2.5, 0.5);
            this.shake = 3;
            this.flash = 0.25;
          } else if (e.shot === 'smash') this.shake = 2;
          break;
        }
        case 'swing': {
          if (snd) {
            const p = this.match.players[e.player];
            const { pan, dist } = this.pan01(p.x, p.y);
            audio.swing(e.power, pan, dist);
          }
          break;
        }
        case 'bounce': {
          const { pan, dist } = this.pan01(e.x, e.y);
          if (snd) audio.bounce(this.surfaceSound, e.speed, pan, dist);
          const surf = this.opts.venue.surface;
          if (surf === 'clay') {
            r.particles.burst(
              PKind.Dust,
              e.x,
              e.y,
              0.02,
              7 + Math.round(e.speed * 0.4),
              0.9,
              0.5,
              0.7,
            );
            r.markCourt(e.x, e.y);
          } else if (surf === 'grass')
            r.particles.burst(PKind.Grass, e.x, e.y, 0.02, 3, 1.2, 1.5, 0.4);
          if (e.line) r.particles.burst(PKind.Chalk, e.x, e.y, 0.03, 10, 1.2, 0.6, 0.6);
          break;
        }
        case 'net': {
          const { pan } = this.pan01(e.x, 0);
          if (snd) audio.net(e.cord, pan);
          break;
        }
        case 'wall': {
          const { pan, dist } = this.pan01(e.x, e.y);
          if (snd) audio.wall(pan, dist);
          break;
        }
        case 'dribble': {
          const { pan, dist } = this.pan01(e.x, e.y);
          if (snd) audio.dribble(this.surfaceSound, pan, dist);
          break;
        }
        case 'step': {
          const { pan, dist } = this.pan01(e.x, e.y);
          const surf = this.opts.venue.surface;
          if (snd) {
            if (e.slide) {
              if (surf === 'clay') audio.slide(pan, dist);
              else if (surf !== 'grass') audio.squeak(pan, dist);
            } else audio.step(this.surfaceSound, pan, dist, e.speed);
            if (
              !e.slide &&
              (surf === 'hard' || surf === 'indoor') &&
              e.speed > 5.2 &&
              Math.random() < 0.18
            )
              audio.squeak(pan, dist);
          }
          if (surf === 'clay') {
            if (e.slide) {
              const p = m.players[e.player];
              r.particles.burst(PKind.Dust, e.x, e.y, 0.02, 10, 1.6, 0.4, 0.8);
              const sp = Math.hypot(p.vx, p.vy) || 1;
              r.slideMark(e.x, e.y, p.vx / sp, p.vy / sp);
            } else if (e.speed > 4.5 && Math.random() < 0.5)
              r.particles.burst(PKind.Dust, e.x, e.y, 0.02, 2, 0.5, 0.3, 0.5);
          }
          break;
        }
        case 'out':
          if (e.close && !this.opts.demo) this.callout(`OUT · ${e.cm} CM`, 'info');
          break;
        case 'lineCall':
          if (!this.opts.demo && !m.point.over) this.callout('ON THE LINE!', 'info');
          break;
        case 'serveSpeed': {
          const id = useHud.getState().serveId + 1;
          useHud.getState().set({ serveKmh: e.kmh, serveId: id });
          setTimeout(() => {
            if (useHud.getState().serveId === id) useHud.getState().set({ serveKmh: null });
          }, 1800);
          break;
        }
        case 'callout':
          if (!this.opts.demo) this.callout(e.text, e.tone);
          if (['BREAK POINT', 'SET POINT', 'MATCH POINT', 'ACE!', 'BREAK!'].includes(e.text))
            this.led = { text: e.text.replace('!', ''), until: this.time + 4 };
          break;
        case 'style': {
          if (this.opts.demo) break;
          const hud = useHud.getState();
          const id = ++this.calloutId;
          hud.set({ toasts: [...hud.toasts.slice(-2), { id, amount: e.amount, label: e.label }] });
          setTimeout(() => {
            const h = useHud.getState();
            h.set({ toasts: h.toasts.filter((t) => t.id !== id) });
          }, 1600);
          break;
        }
        case 'call':
          if (snd && !this.opts.demo) audio.say(e.text, e.voice);
          break;
        case 'crowd': {
          r.crowd.react(e.mood, e.intensity, e.favor);
          if (!snd) break;
          if (e.mood === 'applause') audio.applause(e.intensity);
          else if (e.mood === 'ovation') {
            audio.applause(Math.max(0.6, e.intensity));
            audio.cheer(2.2, e.intensity);
          } else if (e.mood === 'standing') {
            audio.applause(1);
            audio.cheer(4.5, 1);
          } else if (e.mood === 'groan') void audio.groan(e.intensity);
          else if (e.mood === 'ooh') void audio.ooh(e.intensity);
          else if (e.mood === 'wave') audio.cheer(3, 0.5);
          else if (e.mood === 'quiet' && Math.random() < 0.3 && r.crowd.excitement > 0.35)
            audio.shush();
          break;
        }
        case 'score': {
          const s = m.score;
          useHud.getState().set({
            sets: s.sets.map((x) => ({ g: [...x.g] as [number, number], tb: x.tb })),
            games: [...s.games] as [number, number],
            points: pointLabels(s),
            server: s.server,
            tiebreak: s.tiebreak,
          });
          break;
        }
        case 'changeover':
          if (!this.opts.demo) {
            useHud.getState().set({ changeover: true });
            setTimeout(() => useHud.getState().set({ changeover: false }), 2500);
          }
          break;
        case 'sweep':
          r.sweep();
          break;
        case 'matchOver': {
          const humanIdx = this.opts.human[0] ? 0 : this.opts.human[1] ? 1 : -1;
          const won = humanIdx === e.winner;
          if (snd && !this.opts.demo) audio.fanfare(humanIdx === -1 ? true : won);
          const w = m.players[e.winner];
          for (let k = 0; k < 6; k++)
            r.particles.burst(
              PKind.Confetti,
              w.x + (Math.random() - 0.5) * 6,
              w.y + (Math.random() - 0.5) * 6,
              6 + Math.random() * 3,
              30,
              2,
              0.5,
              6,
            );
          if (!this.resultSent && !this.opts.demo) {
            this.resultSent = true;
            const result: MatchResult = {
              winner: e.winner,
              humanWon: won,
              scoreLine: scoreLine(m.score, e.winner),
              stats: [m.stats[0], m.stats[1]],
              style: m.style,
              longestRally: m.longestRally,
            };
            setTimeout(() => {
              useHud.getState().set({ result });
              this.opts.onMatchOver?.(result);
            }, 3200);
          }
          break;
        }
        default:
          break;
      }
    }
    evs.length = 0;
  }

  // ---------------------------------------------------------------------------
  // Visual updates

  private updateVisuals(dt: number) {
    const m = this.match;
    const r = this.renderer;
    const b = m.ball;
    const scaled = dt * this.opts.timeScale;
    for (const p of m.players) p.computePose(this.time, scaled);
    const bp = r.cam.project(b.x, b.y, b.z);
    r.crowd.update(dt, b.x, b.y, bp.sx);
    r.particles.update(scaled);
    // Camera pans a little with play.
    const focus = m.ballVisible ? b.x : (m.players[0].x + m.players[1].x) / 2;
    const targetPan = clamp(-focus * 2.6, -PAN + 2, PAN - 2);
    this.pan += (targetPan - this.pan) * damp(2.2, dt);
    this.shake = Math.max(0, this.shake - dt * 8);
    this.flash = Math.max(0, this.flash - dt * 1.5);
    this.updateKids(scaled);
    if (this.started && this.sound) {
      // Hush for the serve, buzz during rallies.
      const quiet = m.phase === 'toServe' || m.phase === 'serving';
      const level = quiet ? 0.04 : m.phase === 'rally' ? 0.12 + r.crowd.excitement * 0.15 : 0.18;
      audio.setCrowd(level, quiet ? 0.25 : 1);
    }
    // HUD meters at ~12 Hz.
    this.hudT += dt;
    if (this.hudT > 0.08 && !this.opts.demo) {
      this.hudT = 0;
      const human = m.human;
      useHud.getState().set({
        pressure: m.pressure,
        style: m.style,
        sprint: human ? human.sprint : 1,
        phase: m.phase,
        hint:
          m.score.played < 2 && human
            ? m.phase === 'toServe' && m.point.server === human.idx
              ? 'serve'
              : m.phase === 'rally' || (m.phase === 'toServe' && m.point.server !== human.idx)
                ? 'rally'
                : null
            : null,
      });
    }
  }

  private updateKids(dt: number) {
    const m = this.match;
    const b = m.ball;
    const dead = m.point.over && m.ballVisible;
    if (dead) {
      if (this.deadSince < 0) this.deadSince = this.time;
    } else this.deadSince = -1;
    const fetchNow =
      dead && this.time - this.deadSince > 1.1 && (b.rest || this.time - this.deadSince > 2.4);
    if (fetchNow && !this.kids.some((k) => k.state === 'fetch')) {
      let best: Kid | null = null;
      let bd = Infinity;
      for (const k of this.kids) {
        const d = Math.hypot(k.x - b.x, k.y - b.y);
        if (k.state === 'home' && d < bd) {
          bd = d;
          best = k;
        }
      }
      if (best) best.state = 'fetch';
    }
    for (const k of this.kids) {
      let tx = k.home.x;
      let ty = k.home.y;
      if (k.state === 'fetch') {
        if (!m.ballVisible) k.state = 'back';
        tx = b.x;
        ty = b.y;
        if (Math.hypot(tx - k.x, ty - k.y) < 0.35 && m.ballVisible) {
          m.ballVisible = false;
          k.state = 'back';
        }
      }
      const dx = tx - k.x;
      const dy = ty - k.y;
      const d = Math.hypot(dx, dy);
      const vmax = k.state === 'home' ? 0 : 4.6;
      k.speed = d > 0.05 && vmax ? Math.min(vmax, d * 4) : 0;
      if (k.speed > 0) {
        k.x += (dx / d) * k.speed * dt;
        k.y += (dy / d) * k.speed * dt;
        k.yaw = Math.atan2(-dx, dy);
        k.gait = (k.gait + (k.speed * dt) / 1.1) % 1;
      }
      if (k.state === 'back' && d < 0.08) {
        k.state = 'home';
        k.x = k.home.x;
        k.y = k.home.y;
        k.yaw = k.home.yaw;
      }
    }
  }

  private kidPose(k: Kid): Pose {
    if (k.state !== 'home') {
      return locomotionPose({
        time: this.time,
        phase: k.gait,
        speed: k.speed,
        dx: 0,
        dy: 1,
        mode: 'run',
      });
    }
    return k.home.kneel ? kneelPose(this.time) : standBackPose(this.time);
  }

  private draw() {
    const m = this.match;
    const r = this.renderer;
    const b = m.ball;
    const human = m.human;
    let meter = null;
    const sm = m.serveMeter();
    if (sm && human) meter = { x: human.x, y: human.y, value: sm.value, sweet: sm.sweet };
    else if (human && human.armed && (m.phase === 'rally' || m.phase === 'serving'))
      meter = { x: human.x, y: human.y, value: human.charge };
    const kids: RenderKid[] = this.kids.map((k) => ({
      x: k.x,
      y: k.y,
      yaw: k.yaw,
      pose: this.kidPose(k),
      look: k.look,
      mats: k.mats,
    }));
    const umpLook = Math.atan2(b.y - 0.35, b.x + COURT.DW + 1.45);
    // Aim reticle where the mouse points into the opponent's half.
    const aimPt = human && !this.opts.demo ? this.controls.aim : null;
    const aimPhase = m.phase === 'rally' || m.phase === 'toServe' || m.phase === 'serving';
    const aim =
      aimPt && aimPhase && sideOfY(aimPt.y) !== human!.side
        ? { x: aimPt.x, y: aimPt.y, hot: !!human!.armed || m.phase === 'serving' }
        : null;
    const fast = m.ballLive && Math.hypot(b.vx, b.vy, b.vz) > 14;
    r.render(this.ctx, {
      time: this.time,
      panX: this.pan,
      shake: this.shake,
      players: m.players.map((p, i) => ({
        x: p.x,
        y: p.y,
        yaw: p.yaw,
        pose: p.pose,
        look: this.looks[i],
        mats: this.mats[i],
        lefty: p.lefty,
        sway: p.sway,
      })),
      ball: {
        x: b.x,
        y: b.y,
        z: b.z,
        visible: m.ballVisible,
        trail: fast ? m.ballTrail : [],
        power: m.superBall,
      },
      kids,
      umpirePose: umpirePose(this.time, umpLook),
      meter,
      aim,
      speedText: m.lastServeKmh ? `${m.lastServeKmh} KM/H` : 'SPEED',
      ledMessage: this.led && this.led.until > this.time ? this.led.text : null,
      flash: this.flash,
    });
  }
}

export const kmhOf = kmh;
