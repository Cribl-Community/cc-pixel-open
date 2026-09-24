/**
 * The sound of match day, synthesized in the browser with the Web Audio API.
 *
 * Graph: every bus → master → compressor → speakers, with a convolution
 * reverb send (the stadium) whose level depends on the venue. Starts muted;
 * the settings store unmutes it.
 */

import { toBuffer } from './dsp';
import {
  renderCrowd,
  synthApplause,
  synthBird,
  synthBleat,
  synthBounce,
  synthChime,
  synthCicadas,
  synthCity,
  synthClick,
  synthCord,
  synthDribble,
  synthGrunt,
  synthGull,
  synthHvac,
  synthImpulse,
  synthNet,
  synthPlane,
  synthRacket,
  synthShush,
  synthSlide,
  synthSqueak,
  synthStep,
  synthSwing,
  synthWall,
  synthWhoosh,
  synthWind,
  type BounceKind,
  type HitKind,
} from './sounds';
import type { Ambience } from '../sim/venues';

interface Loop {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

const pickOne = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private ui!: GainNode;
  private amb!: GainNode;
  private crowdBus!: GainNode;
  private verbSend!: GainNode;
  private verbReturn!: GainNode;
  private b: Record<string, AudioBuffer> = {};
  private hits: Record<HitKind, AudioBuffer[]> = {} as Record<HitKind, AudioBuffer[]>;
  private bounces: Record<BounceKind, AudioBuffer[]> = {} as Record<BounceKind, AudioBuffer[]>;
  private steps: Record<BounceKind, AudioBuffer[]> = {} as Record<BounceKind, AudioBuffer[]>;
  private squeaks: AudioBuffer[] = [];
  private slides: AudioBuffer[] = [];
  private swings: AudioBuffer[] = [];
  private birds: AudioBuffer[] = [];
  private gulls: AudioBuffer[] = [];
  private grunts = new Map<string, AudioBuffer[]>();
  private crowdBleats: AudioBuffer[] = [];
  /** Goat mode: players bleat instead of grunting, and so does the crowd. */
  goats = false;
  private murmur: Loop | null = null;
  private roar: Loop | null = null;
  private roarFilter: BiquadFilterNode | null = null;
  private ambLoops: Loop[] = [];
  private ambKind: Ambience | null = null;
  private ambTimer: ReturnType<typeof setTimeout> | null = null;
  private volume = 0.8;
  private muted = true;
  private crowdReady: Promise<void> | null = null;
  private voice: SpeechSynthesisVoice | null = null;
  private lineVoice: SpeechSynthesisVoice | null = null;
  private lastSqueak = 0;
  private stepWindow = 0;
  private stepCount = 0;
  voiceOn = true;
  ready = false;

  get context() {
    return this.ctx;
  }

  /** Must be called from a user gesture (browser autoplay rules). */
  async init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const sr = ctx.sampleRate;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(comp);

    const bus = (v: number) => {
      const g = ctx.createGain();
      g.gain.value = v;
      g.connect(this.master);
      return g;
    };
    this.sfx = bus(0.95);
    this.ui = bus(0.5);
    this.amb = bus(0.45);
    this.crowdBus = bus(0.8);

    const verb = ctx.createConvolver();
    verb.buffer = toBuffer(ctx, synthImpulse(sr));
    this.verbReturn = ctx.createGain();
    this.verbReturn.gain.value = 0.25;
    verb.connect(this.verbReturn);
    this.verbReturn.connect(this.master);
    this.verbSend = ctx.createGain();
    this.verbSend.gain.value = 1;
    this.verbSend.connect(verb);

    const many = <T>(n: number, f: () => T) => Array.from({ length: n }, f);
    for (const k of ['drive', 'slice', 'serve', 'volley', 'frame', 'smash'] as HitKind[])
      this.hits[k] = many(4, () => toBuffer(ctx, synthRacket(sr, k)));
    for (const k of ['hard', 'clay', 'grass', 'indoor'] as BounceKind[]) {
      this.bounces[k] = many(4, () => toBuffer(ctx, synthBounce(sr, k)));
      this.steps[k] = many(4, () => toBuffer(ctx, synthStep(sr, k)));
    }
    this.squeaks = many(6, () => toBuffer(ctx, synthSqueak(sr)));
    this.slides = many(3, () => toBuffer(ctx, synthSlide(sr)));
    this.swings = many(3, () => toBuffer(ctx, synthSwing(sr)));
    this.birds = many(4, () => toBuffer(ctx, synthBird(sr)));
    this.gulls = many(3, () => toBuffer(ctx, synthGull(sr)));
    this.b.net = toBuffer(ctx, synthNet(sr));
    this.b.cord = toBuffer(ctx, synthCord(sr));
    this.b.wall = toBuffer(ctx, synthWall(sr));
    this.b.dribbleHard = toBuffer(ctx, synthDribble(sr, 'hard'));
    this.b.dribbleClay = toBuffer(ctx, synthDribble(sr, 'clay'));
    this.b.dribbleGrass = toBuffer(ctx, synthDribble(sr, 'grass'));
    this.b.click = toBuffer(ctx, synthClick(sr));
    this.b.whoosh = toBuffer(ctx, synthWhoosh(sr));
    this.b.chimeUp = toBuffer(ctx, synthChime(sr, true));
    this.b.chimeDown = toBuffer(ctx, synthChime(sr, false));
    this.b.applause = toBuffer(ctx, synthApplause(sr, 4.5, 110));
    this.b.applauseLight = toBuffer(ctx, synthApplause(sr, 2.6, 45));
    this.b.applauseBig = toBuffer(ctx, synthApplause(sr, 7, 180));
    this.b.shush = toBuffer(ctx, synthShush(sr));
    this.b.wind = toBuffer(ctx, synthWind(sr));
    this.b.city = toBuffer(ctx, synthCity(sr));
    this.b.plane = toBuffer(ctx, synthPlane(sr));
    this.b.hvac = toBuffer(ctx, synthHvac(sr));
    this.b.cicadas = toBuffer(ctx, synthCicadas(sr));

    this.crowdReady = (async () => {
      const [murmur, roar, groan, ooh] = await Promise.all([
        renderCrowd(sr, 'murmur', 9),
        renderCrowd(sr, 'roar', 9),
        renderCrowd(sr, 'groan', 2),
        renderCrowd(sr, 'ooh', 1.8),
      ]);
      this.b.murmur = murmur;
      this.b.roar = roar;
      this.b.groan = groan;
      this.b.ooh = ooh;
    })();
    this.ready = true;

    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
    this.pickVoices();
    if ('speechSynthesis' in window)
      window.speechSynthesis.onvoiceschanged = () => this.pickVoices();
  }

  setVolume(v: number) {
    this.volume = v;
    this.applyMaster();
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyMaster();
    if (m && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  get isMuted() {
    return this.muted;
  }

  /** Stadium size: how much reverb everything gets. */
  setRoom(wet: number) {
    if (!this.ctx) return;
    this.verbReturn.gain.setTargetAtTime(wet, this.ctx.currentTime, 0.2);
  }

  private applyMaster() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, t, 0.05);
  }

  private play(
    buffer: AudioBuffer | undefined,
    opts: {
      bus?: GainNode;
      gain?: number;
      pan?: number;
      rate?: number;
      when?: number;
      verb?: number;
      loop?: boolean;
    } = {},
  ): Loop | null {
    const ctx = this.ctx;
    if (!ctx || !buffer) return null;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = !!opts.loop;
    src.playbackRate.value = opts.rate ?? 1;
    const g = ctx.createGain();
    g.gain.value = opts.gain ?? 1;
    src.connect(g);
    let tail: AudioNode = g;
    if (opts.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      g.connect(p);
      tail = p;
    }
    tail.connect(opts.bus ?? this.sfx);
    if (opts.verb) {
      const s = ctx.createGain();
      s.gain.value = opts.verb;
      tail.connect(s);
      s.connect(this.verbSend);
    }
    src.start(ctx.currentTime + (opts.when ?? 0));
    return { src, gain: g };
  }

  // ---- UI -------------------------------------------------------------------

  click() {
    this.play(this.b.click, { bus: this.ui, rate: 0.9 + Math.random() * 0.2, gain: 0.8 });
  }
  whoosh() {
    this.play(this.b.whoosh, { bus: this.ui, gain: 0.5 });
  }
  chime(up = true) {
    this.play(up ? this.b.chimeUp : this.b.chimeDown, { bus: this.ui, gain: 0.7 });
  }

  // ---- Ball & players ---------------------------------------------------------

  /** Racket on ball. `dist` 0 = near end, 1 = far end. */
  hit(kind: HitKind, power: number, pan: number, dist: number) {
    this.play(pickOne(this.hits[kind]), {
      gain: (0.55 + power * 0.45) * (1 - dist * 0.35),
      pan: pan * 0.8,
      rate: 0.94 + Math.random() * 0.12 + (kind === 'serve' ? -0.04 : 0),
      verb: 0.18 + dist * 0.2,
    });
  }

  bounce(kind: BounceKind, speed: number, pan: number, dist: number) {
    const g = Math.min(1, 0.25 + speed / 16) * (1 - dist * 0.35);
    this.play(pickOne(this.bounces[kind]), {
      gain: g,
      pan: pan * 0.8,
      rate: 0.95 + Math.random() * 0.1,
      verb: 0.15 + dist * 0.2,
    });
  }

  dribble(kind: BounceKind, pan: number, dist: number) {
    const b =
      kind === 'clay'
        ? this.b.dribbleClay
        : kind === 'grass'
          ? this.b.dribbleGrass
          : this.b.dribbleHard;
    this.play(b, {
      gain: 0.5 * (1 - dist * 0.4),
      pan: pan * 0.8,
      rate: 0.95 + Math.random() * 0.1,
      verb: 0.2,
    });
  }

  net(cord: boolean, pan: number) {
    this.play(cord ? this.b.cord : this.b.net, {
      gain: cord ? 0.8 : 0.7,
      pan: pan * 0.8,
      verb: 0.2,
    });
  }

  wall(pan: number, dist: number) {
    this.play(this.b.wall, { gain: 0.45 * (1 - dist * 0.4), pan: pan * 0.9, verb: 0.25 });
  }

  /** Footfall; rate-limited so two sprinting players don't clutter the mix. */
  step(kind: BounceKind, pan: number, dist: number, speed: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.stepWindow > 0.06) {
      this.stepWindow = now;
      this.stepCount = 0;
    }
    if (++this.stepCount > 2) return;
    this.play(pickOne(this.steps[kind]), {
      gain: Math.min(0.5, 0.1 + speed * 0.05) * (1 - dist * 0.5),
      pan: pan * 0.8,
      rate: 0.9 + Math.random() * 0.2,
    });
  }

  squeak(pan: number, dist: number) {
    const ctx = this.ctx;
    if (!ctx || ctx.currentTime - this.lastSqueak < 0.25) return;
    this.lastSqueak = ctx.currentTime;
    this.play(pickOne(this.squeaks), {
      gain: 0.3 * (1 - dist * 0.5),
      pan: pan * 0.8,
      rate: 0.9 + Math.random() * 0.25,
      verb: 0.15,
    });
  }

  slide(pan: number, dist: number) {
    this.play(pickOne(this.slides), {
      gain: 0.45 * (1 - dist * 0.4),
      pan: pan * 0.8,
      rate: 0.9 + Math.random() * 0.2,
    });
  }

  swing(power: number, pan: number, dist: number) {
    this.play(pickOne(this.swings), {
      gain: (0.12 + power * 0.2) * (1 - dist * 0.5),
      pan: pan * 0.8,
      rate: 0.9 + power * 0.3,
    });
  }

  /** Build a player's grunts (pitch = voice fundamental), or bleats for a goat. */
  prepareVoice(id: string, pitch: number, goat = false) {
    const ctx = this.ctx;
    const key = goat ? `${id}:goat` : id;
    if (!ctx || this.grunts.has(key)) return;
    const synth = goat ? synthBleat : synthGrunt;
    this.grunts.set(
      key,
      [0.3, 0.6, 0.9, 1].map((s) => toBuffer(ctx, synth(ctx.sampleRate, pitch, s))),
    );
  }

  grunt(id: string, strength: number, loudness: number, pan: number, dist: number) {
    const set = (this.goats && this.grunts.get(`${id}:goat`)) || this.grunts.get(id);
    if (!set || loudness <= 0) return;
    const i = Math.min(set.length - 1, Math.floor(strength * set.length));
    this.play(set[i], {
      gain: loudness * (0.4 + 0.5 * strength) * (1 - dist * 0.4),
      pan: pan * 0.7,
      rate: 0.96 + Math.random() * 0.08,
      verb: 0.25,
    });
  }

  // ---- Crowd ----------------------------------------------------------------

  async startCrowd(level = 0.25) {
    const ctx = this.ctx;
    if (!ctx) return;
    await this.crowdReady;
    if (!this.murmur)
      this.murmur = this.play(this.b.murmur, {
        bus: this.crowdBus,
        gain: 0,
        loop: true,
        verb: 0.2,
      });
    if (!this.roar) {
      const src = ctx.createBufferSource();
      src.buffer = this.b.roar;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1500;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f);
      f.connect(g);
      g.connect(this.crowdBus);
      const s = ctx.createGain();
      s.gain.value = 0.3;
      g.connect(s);
      s.connect(this.verbSend);
      src.start(ctx.currentTime, Math.random() * 4);
      this.roar = { src, gain: g };
      this.roarFilter = f;
    }
    this.setCrowd(level);
  }

  /** 0 = hushed before a serve … 1 = a stadium on its feet. */
  setCrowd(level: number, murmur = 1) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const x = Math.max(0, Math.min(1, level));
    this.murmur?.gain.gain.setTargetAtTime(0.42 * murmur * (1 - x * 0.5), t, 0.5);
    this.roar?.gain.gain.setTargetAtTime(0.9 * Math.pow(x, 1.4), t, 0.25);
    this.roarFilter?.frequency.setTargetAtTime(1200 + 5200 * x, t, 0.3);
  }

  stopCrowd() {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const l of [this.murmur, this.roar]) {
      if (!l) continue;
      l.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      l.src.stop(ctx.currentTime + 3);
    }
    this.murmur = null;
    this.roar = null;
  }

  applause(intensity: number) {
    const b =
      intensity > 0.8
        ? this.b.applauseBig
        : intensity > 0.45
          ? this.b.applause
          : this.b.applauseLight;
    this.play(b, {
      bus: this.crowdBus,
      gain: 0.45 + intensity * 0.5,
      verb: 0.25,
      rate: 0.95 + Math.random() * 0.1,
    });
  }

  /** A roar with whistles on top. */
  cheer(length = 2.5, intensity = 0.8) {
    const ctx = this.ctx;
    if (!ctx) return;
    const l = this.play(this.b.roar, { bus: this.crowdBus, gain: 0.0001, verb: 0.3 });
    if (l) {
      const t = ctx.currentTime;
      l.gain.gain.setTargetAtTime(0.75 * intensity, t, 0.12);
      l.gain.gain.setTargetAtTime(0, t + length, 0.8);
      l.src.stop(t + length + 4);
    }
    const n = Math.round(2 + intensity * 5);
    for (let i = 0; i < n; i++)
      this.whistle(0.1 + Math.random() * 1.6, (Math.random() - 0.5) * 1.6);
    if (this.goats) this.bleats(Math.round(2 + intensity * 4), length);
  }

  /** A few goats in the stands joining in. */
  bleats(n: number, spread = 1.5) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.crowdBleats.length)
      this.crowdBleats = [140, 170, 210, 250, 300].map((p) =>
        toBuffer(ctx, synthBleat(ctx.sampleRate, p, 0.5 + Math.random() * 0.5)),
      );
    for (let i = 0; i < n; i++)
      this.play(pickOne(this.crowdBleats), {
        bus: this.crowdBus,
        when: Math.random() * spread,
        gain: 0.12 + Math.random() * 0.14,
        pan: (Math.random() - 0.5) * 1.6,
        rate: 0.9 + Math.random() * 0.25,
        verb: 0.35,
      });
  }

  whistle(when: number, pan: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f = 1700 + Math.random() * 700;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.55, t + 0.14);
    o.frequency.exponentialRampToValueAtTime(f * 1.3, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.04);
    g.gain.setValueAtTime(0.05, t + 0.4);
    g.gain.linearRampToValueAtTime(0, t + 0.55);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(g);
    g.connect(p);
    p.connect(this.crowdBus);
    o.start(t);
    o.stop(t + 0.6);
  }

  async ooh(intensity = 0.6) {
    await this.crowdReady;
    this.play(this.b.ooh, {
      bus: this.crowdBus,
      gain: 0.35 + intensity * 0.5,
      verb: 0.3,
      rate: 0.95 + Math.random() * 0.1,
    });
  }

  async groan(intensity = 0.6) {
    await this.crowdReady;
    this.play(this.b.groan, { bus: this.crowdBus, gain: 0.35 + intensity * 0.5, verb: 0.3 });
  }

  shush() {
    this.play(this.b.shush, { bus: this.crowdBus, gain: 0.45, verb: 0.2 });
  }

  // ---- Ambience -------------------------------------------------------------

  setAmbience(kind: Ambience | null) {
    const ctx = this.ctx;
    if (!ctx || kind === this.ambKind) return;
    this.ambKind = kind;
    for (const l of this.ambLoops) {
      l.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
      l.src.stop(ctx.currentTime + 3);
    }
    this.ambLoops = [];
    if (this.ambTimer) clearTimeout(this.ambTimer);
    this.ambTimer = null;
    if (!kind) return;
    const loop = (buf: AudioBuffer | undefined, gain: number) => {
      const l = this.play(buf, { bus: this.amb, gain: 0.0001, loop: true });
      if (l) {
        l.gain.gain.setTargetAtTime(gain, ctx.currentTime, 0.8);
        this.ambLoops.push(l);
      }
    };
    const every = (min: number, max: number, fn: () => void) => {
      const next = () => {
        fn();
        this.ambTimer = setTimeout(next, (min + Math.random() * (max - min)) * 1000);
      };
      this.ambTimer = setTimeout(next, min * 500);
    };
    if (kind === 'harbour') {
      loop(this.b.wind, 0.22);
      loop(this.b.cicadas, 0.12);
      every(3, 9, () =>
        this.play(pickOne(this.gulls), {
          bus: this.amb,
          gain: 0.14 + Math.random() * 0.1,
          pan: (Math.random() - 0.5) * 1.6,
        }),
      );
    } else if (kind === 'garden' || kind === 'lawn') {
      loop(this.b.wind, kind === 'lawn' ? 0.2 : 0.15);
      if (kind === 'garden') loop(this.b.city, 0.06);
      every(1.5, 5, () =>
        this.play(pickOne(this.birds), {
          bus: this.amb,
          gain: 0.08 + Math.random() * 0.1,
          pan: (Math.random() - 0.5) * 1.6,
          rate: 0.85 + Math.random() * 0.3,
        }),
      );
    } else if (kind === 'city') {
      loop(this.b.city, 0.2);
      loop(this.b.wind, 0.08);
      every(25, 55, () =>
        this.play(this.b.plane, { bus: this.amb, gain: 0.35, pan: (Math.random() - 0.5) * 0.8 }),
      );
    } else if (kind === 'dome') {
      loop(this.b.hvac, 0.25);
    }
  }

  // ---- Voices ---------------------------------------------------------------

  private pickVoices() {
    if (!('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
    const find = (prefs: RegExp[]) => {
      for (const re of prefs) {
        const v = voices.find((x) => re.test(x.name));
        if (v) return v;
      }
      return null;
    };
    this.voice =
      find([/Daniel/i, /Google UK English Male/i, /Arthur/i, /Oliver/i, /Serena/i, /Male/i]) ??
      voices.find((v) => v.lang === 'en-GB') ??
      voices[0] ??
      null;
    this.lineVoice =
      find([/Google UK English Female/i, /Kate/i, /Samantha/i, /Karen/i, /Moira/i]) ?? this.voice;
  }

  /** Umpire announcement; the line judge shouts. */
  say(text: string, who: 'umpire' | 'line' = 'umpire') {
    if (!this.voiceOn || this.muted || !('speechSynthesis' in window) || !text) return;
    const synth = window.speechSynthesis;
    if (who === 'line') synth.cancel();
    const u = new SpeechSynthesisUtterance(who === 'line' ? `${text}!` : text);
    const v = who === 'line' ? this.lineVoice : this.voice;
    if (v) u.voice = v;
    u.rate = who === 'line' ? 1.25 : 1.02;
    u.pitch = who === 'line' ? 1.15 : 0.95;
    u.volume = Math.min(1, this.volume * (who === 'line' ? 1.2 : 1));
    synth.speak(u);
  }

  hush() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  // ---- Music ----------------------------------------------------------------

  /** A short chiptune fanfare: square lead over a triangle bass. */
  fanfare(win = true) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.05;
    const lead = win
      ? [
          [0, 0.12, 72],
          [0.12, 0.12, 76],
          [0.24, 0.12, 79],
          [0.36, 0.36, 84],
          [0.78, 0.12, 79],
          [0.9, 0.6, 84],
        ]
      : [
          [0, 0.2, 72],
          [0.22, 0.2, 70],
          [0.44, 0.2, 67],
          [0.66, 0.7, 64],
        ];
    const bass = win
      ? [
          [0, 0.36, 48],
          [0.36, 0.42, 43],
          [0.78, 0.72, 48],
        ]
      : [
          [0, 0.44, 45],
          [0.44, 0.92, 40],
        ];
    const note = (type: OscillatorType, [s, d, m]: number[], vol: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = 440 * Math.pow(2, (m - 69) / 12);
      const g = ctx.createGain();
      const t = t0 + s;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.setValueAtTime(vol * 0.8, t + d * 0.7);
      g.gain.linearRampToValueAtTime(0, t + d);
      o.connect(g);
      g.connect(this.ui);
      o.start(t);
      o.stop(t + d + 0.02);
    };
    lead.forEach((n) => note('square', n, 0.07));
    bass.forEach((n) => note('triangle', n, 0.12));
  }
}

export const audio = new AudioEngine();
