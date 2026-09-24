/**
 * Sound synthesis. Each function returns raw samples for one effect, built
 * from noise, damped resonant modes, formant filters and envelopes. There
 * are no audio files anywhere in the game.
 */

import { addBurst, addMode, Biquad, brown, makeLoopable, normalize, pink } from './dsp';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export type HitKind = 'drive' | 'slice' | 'serve' | 'volley' | 'frame' | 'smash';

/**
 * Ball on strings: a hard transient, the hollow "pock" of the ball's shell,
 * the string bed's ring and a body thump. Slices get a brush of the strings
 * first; serves and smashes crack; mishits clank off the frame.
 */
export function synthRacket(sr: number, kind: HitKind): Float32Array {
  const len = Math.floor(sr * 0.32);
  const buf = new Float32Array(len);
  const t0 = kind === 'slice' ? 0.035 : 0.004;
  if (kind === 'slice') {
    // Strings brushing up the back of the ball.
    const bp = new Biquad(sr, 'bandpass', 2600, 1.1);
    const n = Math.floor(sr * 0.045);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      buf[i] += bp.process(Math.random() * 2 - 1) * Math.sin(Math.PI * u) * 0.35;
    }
  }
  if (kind === 'frame') {
    addBurst(buf, sr, t0, { decay: 0.004, amp: 0.8, kind: 'bandpass', freq: 2200, q: 1.2 });
    for (const f of [rnd(820, 980), rnd(2000, 2300), rnd(3200, 3600)])
      addMode(buf, sr, t0, f, rnd(0.03, 0.06), 0.35);
    addMode(buf, sr, t0, rnd(300, 380), 0.04, 0.3);
    return normalize(buf, 0.8);
  }
  const hard = kind === 'serve' || kind === 'smash';
  addBurst(buf, sr, t0, {
    decay: hard ? 0.0035 : 0.0025,
    amp: hard ? 1.2 : 0.9,
    kind: 'bandpass',
    freq: rnd(3200, 4200),
    q: 0.8,
  });
  // Ball shell "pock".
  addMode(
    buf,
    sr,
    t0,
    rnd(1150, 1420),
    hard ? 0.014 : 0.011,
    kind === 'volley' ? 0.6 : 0.85,
    rnd(0, 6),
  );
  addMode(buf, sr, t0, rnd(2600, 3000), 0.006, 0.28, rnd(0, 6));
  // String bed ring.
  addMode(buf, sr, t0, rnd(470, 560), kind === 'volley' ? 0.016 : 0.022, 0.5, rnd(0, 6));
  // Body thump.
  addMode(buf, sr, t0, rnd(170, 230), 0.03, hard ? 0.75 : kind === 'slice' ? 0.3 : 0.45);
  if (hard) {
    // Whip crack.
    addBurst(buf, sr, t0 - 0.002, { decay: 0.006, amp: 0.5, kind: 'highpass', freq: 4500 });
  }
  return normalize(buf, 0.9);
}

export type BounceKind = 'hard' | 'clay' | 'grass' | 'indoor';

/** Ball meeting the court: shell resonance + the surface's own voice. */
export function synthBounce(sr: number, kind: BounceKind): Float32Array {
  const len = Math.floor(sr * 0.22);
  const buf = new Float32Array(len);
  if (kind === 'grass') {
    const lp = new Biquad(sr, 'lowpass', 520, 0.8);
    const n = Math.floor(sr * 0.05);
    for (let i = 0; i < n; i++)
      buf[i] += lp.process(Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.012)) * 1.2;
    addMode(buf, sr, 0, rnd(110, 140), 0.025, 0.55);
    addMode(buf, sr, 0, rnd(700, 820), 0.006, 0.12);
    return normalize(buf, 0.75);
  }
  if (kind === 'clay') {
    addMode(buf, sr, 0, rnd(130, 160), 0.028, 0.6);
    addMode(buf, sr, 0, rnd(880, 980), 0.007, 0.28);
    // Grit: a scatter of tiny crunches.
    for (let k = 0; k < 14; k++)
      addBurst(buf, sr, rnd(0, 0.035), {
        decay: 0.0015,
        amp: rnd(0.1, 0.35),
        kind: 'bandpass',
        freq: rnd(2800, 5200),
        q: 1.4,
      });
    addBurst(buf, sr, 0, { decay: 0.012, amp: 0.35, kind: 'lowpass', freq: 900 });
    return normalize(buf, 0.8);
  }
  // Hard / indoor: a bright "pong".
  addBurst(buf, sr, 0, {
    decay: 0.0022,
    amp: 0.7,
    kind: 'bandpass',
    freq: kind === 'indoor' ? 2300 : 1900,
    q: 1,
  });
  addMode(buf, sr, 0, rnd(950, 1120), 0.011, 0.75, rnd(0, 6));
  addMode(buf, sr, 0, rnd(165, 205), 0.022, 0.6);
  addMode(buf, sr, 0, rnd(2100, 2400), 0.005, 0.18);
  return normalize(buf, 0.85);
}

/** Into the net: the mesh swallows it with a soft thump and a rattle. */
export function synthNet(sr: number): Float32Array {
  const len = Math.floor(sr * 0.45);
  const buf = new Float32Array(len);
  const lp = new Biquad(sr, 'lowpass', 520, 0.7);
  const n = Math.floor(sr * 0.09);
  for (let i = 0; i < n; i++)
    buf[i] += lp.process(Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.025)) * 0.9;
  addMode(buf, sr, 0, 78, 0.05, 0.6);
  for (let k = 0; k < 22; k++)
    addBurst(buf, sr, rnd(0.005, 0.2), {
      decay: 0.002,
      amp: rnd(0.05, 0.2),
      kind: 'bandpass',
      freq: rnd(1800, 4200),
      q: 1.2,
    });
  return normalize(buf, 0.7);
}

/** Net cord: the tape ticks and buzzes. */
export function synthCord(sr: number): Float32Array {
  const len = Math.floor(sr * 0.3);
  const buf = new Float32Array(len);
  addMode(buf, sr, 0, rnd(1600, 1900), 0.008, 0.7);
  addMode(buf, sr, 0, rnd(420, 520), 0.03, 0.4);
  const bp = new Biquad(sr, 'bandpass', 1200, 2);
  const n = Math.floor(sr * 0.12);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    buf[i] +=
      bp.process(Math.random() * 2 - 1) *
      Math.exp(-t / 0.04) *
      (0.6 + 0.4 * Math.sin(t * 2 * Math.PI * 95)) *
      0.5;
  }
  return normalize(buf, 0.7);
}

/** Ball into the boards / back wall. */
export function synthWall(sr: number): Float32Array {
  const buf = new Float32Array(Math.floor(sr * 0.4));
  addBurst(buf, sr, 0, { decay: 0.01, amp: 0.8, kind: 'lowpass', freq: 700 });
  addMode(buf, sr, 0, rnd(190, 240), 0.08, 0.5);
  addMode(buf, sr, 0, rnd(520, 600), 0.03, 0.2);
  return normalize(buf, 0.6);
}

/** A footstep for the surface. */
export function synthStep(sr: number, kind: BounceKind): Float32Array {
  const buf = new Float32Array(Math.floor(sr * 0.12));
  if (kind === 'clay') {
    for (let k = 0; k < 10; k++)
      addBurst(buf, sr, rnd(0, 0.03), {
        decay: 0.002,
        amp: rnd(0.15, 0.4),
        kind: 'bandpass',
        freq: rnd(2000, 4500),
        q: 1.2,
      });
    addBurst(buf, sr, 0, { decay: 0.01, amp: 0.3, kind: 'lowpass', freq: 400 });
  } else if (kind === 'grass') {
    addBurst(buf, sr, 0, { decay: 0.012, amp: 0.6, kind: 'lowpass', freq: 380 });
    addBurst(buf, sr, 0.004, { decay: 0.006, amp: 0.12, kind: 'bandpass', freq: 2400, q: 0.8 });
  } else {
    addBurst(buf, sr, 0, { decay: 0.003, amp: 0.5, kind: 'bandpass', freq: 1500, q: 1.2 });
    addMode(buf, sr, 0, rnd(90, 120), 0.018, 0.35);
  }
  return normalize(buf, 0.6);
}

/** The squeak of a tennis shoe biting a hard court. */
export function synthSqueak(sr: number): Float32Array {
  const dur = rnd(0.07, 0.16);
  const len = Math.floor(sr * (dur + 0.02));
  const buf = new Float32Array(len);
  const f0 = rnd(1500, 2100);
  const f1 = f0 * rnd(1.15, 1.45);
  const stick = rnd(90, 150);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const u = Math.min(1, t / dur);
    const f = f0 + (f1 - f0) * u + Math.sin(t * 2 * Math.PI * 23) * 60;
    ph += (2 * Math.PI * f) / sr;
    // Stick-slip: the rubber grabs and releases many times a second.
    const am = 0.55 + 0.45 * Math.sign(Math.sin(t * 2 * Math.PI * stick));
    const env = Math.min(1, t / 0.008) * (u < 1 ? Math.sin(Math.PI * u) ** 0.5 : 0);
    buf[i] = (Math.sin(ph) + 0.35 * Math.sin(ph * 2.01)) * am * env;
  }
  const bp = new Biquad(sr, 'bandpass', f0 * 1.2, 1.5);
  for (let i = 0; i < len; i++) buf[i] = bp.process(buf[i]) * 0.8 + buf[i] * 0.2;
  return normalize(buf, 0.5);
}

/** A slide on clay: a long, sweeping crunch. */
export function synthSlide(sr: number): Float32Array {
  const dur = rnd(0.3, 0.45);
  const len = Math.floor(sr * dur);
  const buf = new Float32Array(len);
  const bp = new Biquad(sr, 'bandpass', 3000, 0.9);
  for (let i = 0; i < len; i++) {
    const u = i / len;
    if (i % 64 === 0) bp.set('bandpass', 3800 - 1800 * u, 0.9);
    const grain = Math.random() < 0.08 ? (Math.random() * 2 - 1) * 2.5 : Math.random() * 2 - 1;
    buf[i] = bp.process(grain) * Math.sin(Math.PI * Math.min(1, u * 1.2)) * (1 - u * 0.5);
  }
  return normalize(buf, 0.55);
}

/** Racket cutting the air. */
export function synthSwing(sr: number): Float32Array {
  const len = Math.floor(sr * 0.22);
  const buf = new Float32Array(len);
  const bp = new Biquad(sr, 'bandpass', 500, 1.5);
  for (let i = 0; i < len; i++) {
    const u = i / len;
    bp.set('bandpass', 350 + 1900 * Math.sin(Math.PI * u), 1.6);
    buf[i] = bp.process(Math.random() * 2 - 1) * Math.sin(Math.PI * u) ** 2;
  }
  return normalize(buf, 0.5);
}

/**
 * A player's effort grunt, by formant synthesis: a glottal pulse train with
 * jitter, shaped by "uh"/"ah" vowel formants, over a breath of noise.
 */
export function synthGrunt(sr: number, pitch: number, strength: number): Float32Array {
  const high = pitch > 180;
  const dur = 0.1 + strength * 0.18 + rnd(0, 0.06);
  const len = Math.floor(sr * (dur + 0.12));
  const src = new Float32Array(len);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    // Pitch jumps up with effort, then sags.
    const f =
      pitch *
      (1.18 + 0.12 * strength - 0.3 * Math.min(1, t / dur)) *
      (1 + (Math.random() - 0.5) * 0.03);
    ph += f / sr;
    if (ph >= 1) ph -= 1;
    // Glottal pulse: a sharp rise and slower fall.
    const g = ph < 0.4 ? Math.sin((Math.PI * ph) / 0.4) : 0;
    const env =
      Math.min(1, t / 0.012) * (t < dur ? 1 - 0.35 * (t / dur) : Math.exp(-(t - dur) / 0.035));
    src[i] = (g * 1.1 + (Math.random() * 2 - 1) * (0.18 + 0.2 * strength)) * env;
  }
  const k = high ? 1.16 : 1;
  const vowel = Math.random() < 0.5 ? [650, 1100, 2450] : [720, 1240, 2600];
  const f1 = new Biquad(sr, 'bandpass', vowel[0] * k, 5);
  const f2 = new Biquad(sr, 'bandpass', vowel[1] * k, 7);
  const f3 = new Biquad(sr, 'bandpass', vowel[2] * k, 9);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const s = src[i];
    out[i] = f1.process(s) * 1.0 + f2.process(s) * 0.7 + f3.process(s) * 0.35;
  }
  return normalize(out, 0.75);
}

/**
 * A goat's bleat, for goat mode: a high, nasal "m-eh-eh-eh" whose throaty
 * wobble comes from a fast tremolo on both pitch and loudness.
 */
export function synthBleat(sr: number, pitch: number, strength: number): Float32Array {
  const f0 = Math.max(250, pitch * rnd(1.9, 2.4));
  const dur = 0.3 + strength * 0.28 + rnd(0, 0.08);
  const len = Math.floor(sr * (dur + 0.1));
  const wob = rnd(19, 27);
  const src = new Float32Array(len);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const u = Math.min(1, t / dur);
    const trem = 0.5 + 0.5 * Math.sin(2 * Math.PI * wob * t);
    // Up at the start, sagging off at the end.
    const f =
      f0 * (1 + 0.1 * Math.sin(Math.PI * Math.min(1, u * 1.6)) - 0.12 * u) * (1 + 0.05 * trem);
    ph += f / sr;
    if (ph >= 1) ph -= 1;
    const g = ph < 0.35 ? Math.sin((Math.PI * ph) / 0.35) : 0;
    const env =
      Math.min(1, t / 0.02) * (t < dur ? 0.55 + 0.45 * trem : Math.exp(-(t - dur) / 0.04));
    src[i] = (g + (Math.random() * 2 - 1) * 0.08) * env;
  }
  // Nasal "m" for the first few centiseconds, then an open "eh".
  const m = new Biquad(sr, 'lowpass', 420, 0.8);
  const f1 = new Biquad(sr, 'bandpass', 620, 4);
  const f2 = new Biquad(sr, 'bandpass', 1850, 6);
  const f3 = new Biquad(sr, 'bandpass', 2750, 8);
  const out = new Float32Array(len);
  const open = Math.floor(sr * 0.05);
  for (let i = 0; i < len; i++) {
    const x = src[i];
    const vowel = f1.process(x) + f2.process(x) * 0.8 + f3.process(x) * 0.35;
    const hum = m.process(x) * 0.5;
    const k = Math.min(1, i / open);
    out[i] = hum * (1 - k) + vowel * k;
  }
  return normalize(out, 0.7);
}

/** The ball being bounced before a serve (softer than a rally bounce). */
export function synthDribble(sr: number, kind: BounceKind): Float32Array {
  const b = synthBounce(sr, kind);
  for (let i = 0; i < b.length; i++) b[i] *= 0.6;
  return b;
}

// ---------------------------------------------------------------------------
// UI

export function synthClick(sr: number): Float32Array {
  const buf = new Float32Array(Math.floor(sr * 0.06));
  addBurst(buf, sr, 0, { decay: 0.003, amp: 0.7, kind: 'bandpass', freq: 2200, q: 1.4 });
  addMode(buf, sr, 0, 1800, 0.008, 0.3);
  return normalize(buf, 0.6);
}

export function synthWhoosh(sr: number): Float32Array {
  const len = Math.floor(sr * 0.45);
  const buf = new Float32Array(len);
  const bp = new Biquad(sr, 'bandpass', 500, 1.2);
  for (let i = 0; i < len; i++) {
    const t = i / len;
    bp.set('bandpass', 400 + 2600 * t * t, 1.4);
    buf[i] = bp.process(Math.random() * 2 - 1) * Math.sin(Math.PI * t) ** 1.5;
  }
  return normalize(buf, 0.6);
}

/** Two-note chime for confirmations and scoreboard updates. */
export function synthChime(sr: number, up = true): Float32Array {
  const buf = new Float32Array(Math.floor(sr * 0.9));
  const notes = up ? [1318.5, 1760] : [1174.7, 880];
  notes.forEach((f, i) => {
    [1, 2.0, 3.01].forEach((p, j) =>
      addMode(buf, sr, i * 0.11, f * p, 0.35 / (1 + j * 1.5), 0.3 / (1 + j)),
    );
  });
  return normalize(buf, 0.55);
}

// ---------------------------------------------------------------------------
// Ambience

/** Stereo reverb impulse response: decaying, darkening noise. */
export function synthImpulse(sr: number, dur = 2.4): [Float32Array, Float32Array] {
  const len = Math.floor(sr * dur);
  const mk = () => {
    const b = new Float32Array(len);
    const lp = new Biquad(sr, 'lowpass', 6000, 0.7);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      if (i % 256 === 0) lp.set('lowpass', 6000 * Math.exp(-t / 0.9) + 400, 0.7);
      b[i] = lp.process(Math.random() * 2 - 1) * Math.exp(-t / 0.6) * (t < 0.015 ? t / 0.015 : 1);
    }
    return normalize(b, 0.5);
  };
  return [mk(), mk()];
}

export function synthWind(sr: number): Float32Array {
  const raw = pink(Math.floor(sr * 6.6));
  const lp = new Biquad(sr, 'lowpass', 500, 0.7);
  for (let i = 0; i < raw.length; i++) {
    const t = i / sr;
    raw[i] = lp.process(raw[i]) * (0.6 + 0.4 * Math.sin(t * 0.9) * Math.sin(t * 0.37 + 1));
  }
  return normalize(makeLoopable(raw, sr), 0.6);
}

/** City hum: traffic rumble with the odd distant horn. */
export function synthCity(sr: number): Float32Array {
  const len = Math.floor(sr * 8.6);
  const raw = brown(len);
  const lp = new Biquad(sr, 'lowpass', 240, 0.7);
  for (let i = 0; i < len; i++) raw[i] = lp.process(raw[i]) * 0.9;
  const hornAt = rnd(2, 6);
  const hornLen = 0.35;
  for (let i = Math.floor(hornAt * sr); i < (hornAt + hornLen) * sr; i++) {
    const t = i / sr - hornAt;
    const env = Math.sin((Math.PI * t) / hornLen);
    raw[i] += (Math.sin(t * 2 * Math.PI * 392) + Math.sin(t * 2 * Math.PI * 494)) * env * 0.02;
  }
  return normalize(makeLoopable(raw, sr), 0.6);
}

/** A jet passing overhead (the famous night-session flight path). */
export function synthPlane(sr: number): Float32Array {
  const len = Math.floor(sr * 11);
  const buf = new Float32Array(len);
  const lp = new Biquad(sr, 'lowpass', 600, 0.7);
  const bp = new Biquad(sr, 'bandpass', 900, 1.5);
  let b = 0;
  for (let i = 0; i < len; i++) {
    const u = i / len;
    const env = Math.sin(Math.PI * u) ** 2;
    b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    if (i % 256 === 0) bp.set('bandpass', 1100 - 500 * u, 1.5);
    const n = Math.random() * 2 - 1;
    buf[i] = (lp.process(b * 3) * 0.8 + bp.process(n) * 0.25) * env;
  }
  return normalize(buf, 0.5);
}

/** Indoor air handling: a mains hum under soft noise. */
export function synthHvac(sr: number): Float32Array {
  const len = Math.floor(sr * 4.6);
  const raw = pink(len);
  const lp = new Biquad(sr, 'lowpass', 350, 0.7);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    raw[i] =
      lp.process(raw[i]) * 0.6 +
      Math.sin(t * 2 * Math.PI * 60) * 0.05 +
      Math.sin(t * 2 * Math.PI * 120) * 0.03;
  }
  return normalize(makeLoopable(raw, sr), 0.5);
}

export function synthCicadas(sr: number): Float32Array {
  const len = Math.floor(sr * 5.6);
  const raw = new Float32Array(len);
  const bp = new Biquad(sr, 'bandpass', 4600, 3);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 38);
    const swell = 0.4 + 0.6 * Math.sin(t * 0.9) ** 2;
    raw[i] = bp.process(Math.random() * 2 - 1) * pulse * swell;
  }
  return normalize(makeLoopable(raw, sr), 0.4);
}

export function synthBird(sr: number): Float32Array {
  const syllables = 2 + Math.floor(Math.random() * 5);
  const buf = new Float32Array(Math.floor(sr * (0.12 * syllables + 0.3)));
  const base = 2600 + Math.random() * 2200;
  let t = 0;
  for (let s = 0; s < syllables; s++) {
    const len = 0.04 + Math.random() * 0.07;
    const f0 = base * (0.85 + Math.random() * 0.3);
    const f1 = f0 * (Math.random() < 0.5 ? 1.4 : 0.7);
    let ph = 0;
    const start = Math.floor(t * sr);
    const n = Math.floor(len * sr);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const f = f0 + (f1 - f0) * u + Math.sin(u * Math.PI * 6) * 180;
      ph += (2 * Math.PI * f) / sr;
      buf[start + i] += Math.sin(ph) * Math.sin(Math.PI * u) * 0.5;
    }
    t += len + 0.03 + Math.random() * 0.06;
  }
  return buf;
}

/** Seagull: a descending, nasal "kee-ow". */
export function synthGull(sr: number): Float32Array {
  const calls = 1 + Math.floor(Math.random() * 3);
  const buf = new Float32Array(Math.floor(sr * (0.45 * calls + 0.2)));
  for (let c = 0; c < calls; c++) {
    const start = c * rnd(0.3, 0.42);
    const dur = rnd(0.2, 0.32);
    const f0 = rnd(1500, 1900);
    let ph = 0;
    for (let i = 0; i < dur * sr; i++) {
      const u = i / (dur * sr);
      const f = f0 * (1 + 0.25 * Math.sin(Math.PI * Math.min(1, u * 1.6))) * (1 - 0.35 * u);
      ph += (2 * Math.PI * f) / sr;
      let s = 0;
      for (let h = 1; h <= 5; h++) s += Math.sin(ph * h) / h;
      buf[Math.floor(start * sr) + i] += s * Math.sin(Math.PI * u) ** 0.7 * 0.4;
    }
  }
  const bp = new Biquad(sr, 'bandpass', 2400, 1.2);
  for (let i = 0; i < buf.length; i++) buf[i] = bp.process(buf[i]);
  return normalize(buf, 0.5);
}

// ---------------------------------------------------------------------------
// Crowd

/** Many hands clapping, spread across the stereo field. */
export function synthApplause(sr: number, dur = 4.5, density = 90): [Float32Array, Float32Array] {
  const len = Math.floor(sr * dur);
  const L = new Float32Array(len);
  const R = new Float32Array(len);
  let t = 0;
  while (t < dur - 0.1) {
    const x = t / dur;
    const d =
      density * Math.min(1, x / 0.06) * (x > 0.45 ? Math.max(0, 1 - (x - 0.45) / 0.55) : 1) + 3;
    t += -Math.log(1 - Math.random()) / d;
    const pan = Math.random();
    const amp = rnd(0.15, 0.55);
    const f = rnd(850, 2600);
    const dd = rnd(0.006, 0.016);
    addBurst(L, sr, t, { decay: dd, amp: amp * (1 - pan), kind: 'bandpass', freq: f, q: 1.1 });
    addBurst(R, sr, t, { decay: dd, amp: amp * pan, kind: 'bandpass', freq: f, q: 1.1 });
  }
  normalize(L, 0.7);
  normalize(R, 0.7);
  return [L, R];
}

/** The crowd shushing: overlapping "shh"s. */
export function synthShush(sr: number): [Float32Array, Float32Array] {
  const len = Math.floor(sr * 1.6);
  const L = new Float32Array(len);
  const R = new Float32Array(len);
  for (let k = 0; k < 14; k++) {
    const start = rnd(0, 0.6);
    const dur = rnd(0.4, 0.9);
    const pan = Math.random();
    const bp = new Biquad(sr, 'bandpass', rnd(3200, 5200), 1.4);
    for (let i = 0; i < dur * sr; i++) {
      const u = i / (dur * sr);
      const s = bp.process(Math.random() * 2 - 1) * Math.sin(Math.PI * u) ** 1.5 * rnd(0.8, 1);
      const j = Math.floor(start * sr) + i;
      L[j] += s * (1 - pan);
      R[j] += s * pan;
    }
  }
  normalize(L, 0.5);
  normalize(R, 0.5);
  return [L, R];
}

const VOWELS: [number, number][] = [
  [730, 1090],
  [570, 840],
  [300, 870],
  [530, 1840],
  [390, 1990],
  [660, 1720],
];

/**
 * Crowd voices: dozens of formant-filtered "people" rendered offline.
 * murmur/roar loop; ooh, groan and gasp are one-shots.
 */
export async function renderCrowd(
  sr: number,
  mode: 'murmur' | 'roar' | 'groan' | 'ooh',
  seconds: number,
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.floor(sr * seconds), sr);
  const out = ctx.createGain();
  out.gain.value = 0.55;
  out.connect(ctx.destination);
  const voices = mode === 'murmur' ? 32 : mode === 'roar' ? 42 : 28;
  for (let v = 0; v < voices; v++) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const female = Math.random() < 0.45;
    const base =
      mode === 'murmur'
        ? rnd(95, 240)
        : mode === 'roar'
          ? rnd(190, 440)
          : female
            ? rnd(210, 290)
            : rnd(110, 160);
    osc.frequency.setValueAtTime(base, 0);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.Q.value = 6;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.Q.value = 8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, 0);
    const g2 = ctx.createGain();
    g2.gain.value = 0.5;
    const pan = ctx.createStereoPanner();
    pan.pan.value = rnd(-0.95, 0.95);
    osc.connect(f1);
    osc.connect(f2);
    f1.connect(g);
    f2.connect(g2);
    g2.connect(g);
    g.connect(pan);
    pan.connect(out);

    if (mode === 'groan') {
      const start = rnd(0, 0.2);
      osc.frequency.setValueAtTime(base * 1.08, start);
      osc.frequency.exponentialRampToValueAtTime(base * 0.62, start + 1.2);
      f1.frequency.value = 620;
      f2.frequency.value = 950;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(rnd(0.05, 0.1), start + 0.2);
      g.gain.linearRampToValueAtTime(0, start + rnd(1.1, 1.5));
    } else if (mode === 'ooh') {
      // A collective "ooooh": pitch rises then falls, lips rounded.
      const start = rnd(0, 0.15);
      osc.frequency.setValueAtTime(base * 0.95, start);
      osc.frequency.linearRampToValueAtTime(base * 1.25, start + 0.35);
      osc.frequency.exponentialRampToValueAtTime(base * 0.8, start + 1.1);
      f1.frequency.value = 330;
      f2.frequency.value = 760;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(rnd(0.05, 0.1), start + 0.18);
      g.gain.linearRampToValueAtTime(0, start + rnd(0.9, 1.3));
    } else {
      let t = rnd(0, 0.4);
      let lastAmp = 0;
      while (t < seconds) {
        const [F1, F2] = VOWELS[Math.floor(Math.random() * VOWELS.length)];
        f1.frequency.setValueAtTime(F1 * rnd(0.9, 1.1), t);
        f2.frequency.setValueAtTime(F2 * rnd(0.9, 1.1), t);
        if (mode === 'murmur') {
          const syl = rnd(0.09, 0.26);
          const amp = rnd(0.03, 0.08);
          osc.frequency.setValueAtTime(base * rnd(0.92, 1.1), t);
          osc.frequency.linearRampToValueAtTime(base * rnd(0.85, 1.05), t + syl);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(amp, t + 0.025);
          g.gain.setValueAtTime(amp, t + syl);
          g.gain.linearRampToValueAtTime(0, t + syl + 0.05);
          t += syl + 0.05 + (Math.random() < 0.25 ? rnd(0.3, 0.9) : rnd(0.02, 0.12));
        } else {
          const hold = rnd(0.4, 1.4);
          const amp = rnd(0.04, 0.09);
          osc.frequency.setValueAtTime(base * rnd(0.9, 1.0), t);
          osc.frequency.linearRampToValueAtTime(base * rnd(1.05, 1.3), t + hold * 0.6);
          osc.frequency.linearRampToValueAtTime(base * rnd(0.9, 1.1), t + hold);
          g.gain.setValueAtTime(lastAmp, t);
          g.gain.linearRampToValueAtTime(amp, t + 0.12);
          lastAmp = amp * rnd(0.3, 0.8);
          g.gain.linearRampToValueAtTime(lastAmp, t + hold);
          t += hold;
        }
      }
    }
    osc.start(0);
    osc.stop(seconds);
  }
  // Air: the room tone of a big crowd.
  const air = ctx.createBufferSource();
  const nb = ctx.createBuffer(1, Math.floor(sr * seconds), sr);
  nb.getChannelData(0).set(pink(nb.length));
  air.buffer = nb;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = mode === 'roar' ? 1400 : 800;
  bp.Q.value = 0.5;
  const ag = ctx.createGain();
  ag.gain.value = mode === 'roar' ? 0.35 : mode === 'murmur' ? 0.12 : 0.05;
  air.connect(bp);
  bp.connect(ag);
  ag.connect(out);
  air.start(0);
  const rendered = await ctx.startRendering();
  if (mode === 'groan' || mode === 'ooh') {
    normalize(rendered.getChannelData(0), 0.7);
    normalize(rendered.getChannelData(1), 0.7);
    return rendered;
  }
  const L = makeLoopable(rendered.getChannelData(0), sr, 0.8);
  const R = makeLoopable(rendered.getChannelData(1), sr, 0.8);
  normalize(L, 0.8);
  normalize(R, 0.8);
  const outBuf = new AudioBuffer({ numberOfChannels: 2, length: L.length, sampleRate: sr });
  outBuf.getChannelData(0).set(L);
  outBuf.getChannelData(1).set(R);
  return outBuf;
}
