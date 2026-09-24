/**
 * Color helpers. Pixels are written straight into Uint32Array views of
 * ImageData, so colors are packed as little-endian ABGR integers.
 */

export type Packed = number;

/** A 5-step shading ramp: [outline, shadow, mid, base, highlight]. */
export type Ramp = readonly [string, string, string, string, string];

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function pack(hex: string, alpha = 255): Packed {
  const [r, g, b] = hexToRgb(hex);
  return ((alpha << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function packRamp(ramp: readonly string[]): Uint32Array {
  const out = new Uint32Array(ramp.length);
  for (let i = 0; i < ramp.length; i++) out[i] = pack(ramp[i]);
  return out;
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** Rotate a hue toward a target hue by `amount` degrees (shortest path). */
function hueToward(h: number, target: number, amount: number): number {
  let d = target - h;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return h + Math.sign(d) * Math.min(Math.abs(d), amount);
}

/**
 * Build a pixel-art ramp from one base color: shadows drift toward blue,
 * highlights toward warm yellow, which reads far richer than plain
 * darken/lighten.
 */
export function rampFrom(baseHex: string): Ramp {
  const [r, g, b] = hexToRgb(baseHex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const grey = s < 0.08;
  const shade = (dl: number, ds: number, hueShift: number, target: number) =>
    hslToHex(grey ? h : hueToward(h, target, hueShift), s + ds, l + dl);
  const outline = shade(-Math.min(l * 0.72, 0.42), 0.08, 22, 250);
  const shadow = shade(-Math.min(l * 0.38, 0.24), 0.06, 14, 250);
  const mid = shade(-Math.min(l * 0.17, 0.11), 0.03, 6, 250);
  const hi = shade(Math.min((1 - l) * 0.42, 0.2), -0.04, 10, 55);
  return [outline, shadow, mid, baseHex, hi];
}

export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}
