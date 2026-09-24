/**
 * The frame buffer. The whole scene is composited here in software — court,
 * crowd, shadows, players, ball, particles — and handed to the canvas with a
 * single putImageData per frame.
 */

export class Frame {
  readonly w: number;
  readonly h: number;
  readonly image: ImageData;
  readonly data: Uint32Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.image = new ImageData(w, h);
    this.data = new Uint32Array(this.image.data.buffer);
  }

  set(x: number, y: number, c: number) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data[y * this.w + x] = c;
  }

  rect(x: number, y: number, w: number, h: number, c: number) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.floor(x + w));
    const y1 = Math.min(this.h, Math.floor(y + h));
    for (let yy = y0; yy < y1; yy++) this.data.fill(c, yy * this.w + x0, yy * this.w + x1);
  }

  /** Multiply a pixel toward `tint` by `k` (0 = unchanged, 1 = tint). */
  tint(x: number, y: number, tint: number, k: number) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    this.data[i] = mixPacked(this.data[i], tint, k);
  }

  /** Copy a sprite (0 = transparent) with its top-left at (dx, dy). */
  blit(src: Uint32Array, sw: number, sh: number, dx: number, dy: number) {
    dx = Math.round(dx);
    dy = Math.round(dy);
    for (let y = 0; y < sh; y++) {
      const fy = dy + y;
      if (fy < 0 || fy >= this.h) continue;
      const row = fy * this.w;
      const srow = y * sw;
      for (let x = 0; x < sw; x++) {
        const c = src[srow + x];
        if (!c) continue;
        const fx = dx + x;
        if (fx < 0 || fx >= this.w) continue;
        this.data[row + fx] = c;
      }
    }
  }
}

/** Mix two packed ABGR colors. */
export function mixPacked(a: number, b: number, t: number): number {
  const ar = a & 255;
  const ag = (a >>> 8) & 255;
  const ab = (a >>> 16) & 255;
  const br = b & 255;
  const bg = (b >>> 8) & 255;
  const bb = (b >>> 16) & 255;
  const r = (ar + (br - ar) * t) | 0;
  const g = (ag + (bg - ag) * t) | 0;
  const bl = (ab + (bb - ab) * t) | 0;
  return ((255 << 24) | (bl << 16) | (g << 8) | r) >>> 0;
}

/** Scale a packed color's brightness. */
export function scalePacked(a: number, k: number): number {
  const r = Math.min(255, (a & 255) * k) | 0;
  const g = Math.min(255, ((a >>> 8) & 255) * k) | 0;
  const b = Math.min(255, ((a >>> 16) & 255) * k) | 0;
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}
