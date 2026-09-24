/**
 * Offline DSP helpers for synthesizing sound effects straight into
 * Float32Arrays: RBJ biquads, noise colors, envelopes and modal resonators.
 * Everything the game plays is generated from these — no audio files.
 */

export type BiquadKind = 'lowpass' | 'highpass' | 'bandpass';

export class Biquad {
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  private readonly sr: number;

  constructor(sr: number, kind: BiquadKind, freq: number, q = 0.707) {
    this.sr = sr;
    this.set(kind, freq, q);
  }

  set(kind: BiquadKind, freq: number, q = 0.707) {
    const w0 = (2 * Math.PI * Math.min(freq, this.sr * 0.45)) / this.sr;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    let b0: number;
    let b1: number;
    let b2: number;
    if (kind === 'lowpass') {
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = (1 - cos) / 2;
    } else if (kind === 'highpass') {
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = (1 + cos) / 2;
    } else {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    }
    const a0 = 1 + alpha;
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  process(x: number): number {
    const y =
      this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

export function white(len: number, rand: () => number = Math.random): Float32Array {
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = rand() * 2 - 1;
  return out;
}

/** Paul Kellet's economy pink noise. */
export function pink(len: number): Float32Array {
  const out = new Float32Array(len);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    out[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
  }
  return out;
}

export function brown(len: number): Float32Array {
  const out = new Float32Array(len);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    out[i] = last * 3.5;
  }
  return out;
}

export function normalize(buf: Float32Array, peak = 0.9): Float32Array {
  let m = 0;
  for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
  if (m > 0) {
    const k = peak / m;
    for (let i = 0; i < buf.length; i++) buf[i] *= k;
  }
  return buf;
}

/** Crossfade the tail into the head so the buffer loops seamlessly. */
export function makeLoopable(buf: Float32Array, sr: number, fade = 0.6): Float32Array {
  const n = Math.floor(sr * fade);
  const len = buf.length - n;
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = buf[i];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    out[i] = buf[len + i] * Math.cos(t * Math.PI * 0.5) + buf[i] * Math.sin(t * Math.PI * 0.5);
  }
  return out;
}

/** Add a damped sinusoid (a struck resonant mode) into buf at `start` seconds. */
export function addMode(
  buf: Float32Array,
  sr: number,
  start: number,
  freq: number,
  decay: number,
  amp: number,
  phase = 0,
) {
  const s = Math.floor(start * sr);
  const len = Math.min(buf.length - s, Math.floor(decay * 7 * sr));
  const w = (2 * Math.PI * freq) / sr;
  for (let i = 0; i < len; i++) {
    const env = Math.exp(-i / (decay * sr));
    buf[s + i] += Math.sin(w * i + phase) * env * amp;
  }
}

/** Short filtered noise burst with exponential decay. */
export function addBurst(
  buf: Float32Array,
  sr: number,
  start: number,
  opts: {
    decay: number;
    amp: number;
    kind?: BiquadKind;
    freq?: number;
    q?: number;
    attack?: number;
  },
) {
  const s = Math.floor(start * sr);
  const len = Math.min(buf.length - s, Math.floor(opts.decay * 7 * sr));
  const f = opts.kind ? new Biquad(sr, opts.kind, opts.freq ?? 1000, opts.q ?? 0.8) : null;
  const atk = Math.max(1, Math.floor((opts.attack ?? 0.001) * sr));
  for (let i = 0; i < len; i++) {
    const env = Math.min(1, i / atk) * Math.exp(-i / (opts.decay * sr));
    let x = Math.random() * 2 - 1;
    if (f) x = f.process(x);
    buf[s + i] += x * env * opts.amp;
  }
}

export function toBuffer(
  ctx: BaseAudioContext,
  data: Float32Array | [Float32Array, Float32Array],
): AudioBuffer {
  if (Array.isArray(data)) {
    const b = ctx.createBuffer(2, data[0].length, ctx.sampleRate);
    b.getChannelData(0).set(data[0]);
    b.getChannelData(1).set(data[1]);
    return b;
  }
  const b = ctx.createBuffer(1, data.length, ctx.sampleRate);
  b.getChannelData(0).set(data);
  return b;
}
