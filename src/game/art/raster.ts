/**
 * A tiny software rasterizer for pixel-art sprites (grown from the one in
 * Pixel Downs).
 *
 * Shapes are pseudo-3D primitives (spheres, ellipsoids, tapered capsules and
 * flat disks) sampled at pixel centers into a depth buffer together with a
 * lighting value derived from their surface normal. `resolve` quantizes the
 * lighting into palette tones, draws selective outlines around the silhouette
 * and dark separation lines wherever one part passes in front of another,
 * then composites the result straight into the frame buffer. Players are
 * rasterized like this every frame, so they can turn, crouch and swing freely.
 */

/** Material resolver: a fixed id, or a function of the pixel & primitive coords. */
export type MatSpec = number | ((px: number, py: number, t: number, across: number) => number);

// Key light from the upper left, slightly toward the viewer.
const L_LEN = Math.hypot(-0.34, -0.8, 0.52);
const LX = -0.34 / L_LEN;
const LY = -0.8 / L_LEN;
const LZ = 0.52 / L_LEN;

const EMPTY_Z = -1e9;

/** 4×4 ordered-dither matrix, centered on 0. */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47);

export interface ResolveOptions {
  /** Lighting thresholds between tones 1|2, 2|3 and 3|4. */
  thresholds?: [number, number, number];
  /** Amount of ordered dithering applied to lighting before quantizing. */
  dither?: number;
  /** Depth jump that triggers an internal separation line. */
  edgeDepth?: number;
  /** Per-material flag: 1 = never cast an outer outline (thin details). */
  noOutline?: Uint8Array;
}

export class Raster {
  readonly w: number;
  readonly h: number;
  readonly z: Float32Array;
  readonly mat: Uint8Array;
  readonly lum: Float32Array;
  readonly part: Uint8Array;
  /** Bounding box of written pixels, so clearing and resolving stay cheap. */
  private bx0 = 0;
  private by0 = 0;
  private bx1 = -1;
  private by1 = -1;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.z = new Float32Array(w * h);
    this.mat = new Uint8Array(w * h);
    this.lum = new Float32Array(w * h);
    this.part = new Uint8Array(w * h);
    this.z.fill(EMPTY_Z);
    this.bx0 = w;
    this.by0 = h;
  }

  clear() {
    if (this.bx1 < this.bx0) return;
    const { w } = this;
    for (let y = this.by0; y <= this.by1; y++) {
      const a = y * w + this.bx0;
      const b = y * w + this.bx1 + 1;
      this.z.fill(EMPTY_Z, a, b);
      this.mat.fill(0, a, b);
      this.part.fill(0, a, b);
    }
    this.bx0 = this.w;
    this.by0 = this.h;
    this.bx1 = -1;
    this.by1 = -1;
  }

  private write(i: number, x: number, y: number, z: number, m: number, part: number, lum: number) {
    this.z[i] = z;
    this.mat[i] = m + 1;
    this.part[i] = part;
    this.lum[i] = lum;
    if (x < this.bx0) this.bx0 = x;
    if (x > this.bx1) this.bx1 = x;
    if (y < this.by0) this.by0 = y;
    if (y > this.by1) this.by1 = y;
  }

  /** Ellipsoid with radii rx/ry in the picture plane rotated by `rot`, depth radius rz. */
  ellipsoid(
    cx: number,
    cy: number,
    cz: number,
    rx: number,
    ry: number,
    rz: number,
    rot: number,
    mat: MatSpec,
    part: number,
    bias = 0,
  ) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const R = Math.max(rx, ry) + 1;
    const x0 = Math.max(0, Math.floor(cx - R));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + R));
    for (let y = y0; y <= y1; y++) {
      const py = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5 - cx;
        const lx = px * c + py * s;
        const ly = -px * s + py * c;
        const qx = lx / rx;
        const qy = ly / ry;
        const q = qx * qx + qy * qy;
        if (q > 1) continue;
        const nz = Math.sqrt(1 - q);
        const z = cz + rz * nz;
        const i = y * this.w + x;
        if (z <= this.z[i]) continue;
        const nx = qx * c - qy * s;
        const ny = qx * s + qy * c;
        const m = typeof mat === 'number' ? mat : mat(x + 0.5, y + 0.5, qx, qy);
        if (m < 0) continue;
        this.write(i, x, y, z, m, part, nx * LX + ny * LY + nz * LZ + bias);
      }
    }
  }

  /**
   * Sphere whose material callback receives the view-space unit normal
   * (x right, y down, z toward the viewer) — used for heads, where hair, caps
   * and headbands are decided in the head's own frame.
   */
  sphere(
    cx: number,
    cy: number,
    cz: number,
    r: number,
    mat: number | ((nx: number, ny: number, nz: number) => number),
    part: number,
    bias = 0,
  ) {
    const x0 = Math.max(0, Math.floor(cx - r - 1));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + r + 1));
    const y0 = Math.max(0, Math.floor(cy - r - 1));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + r + 1));
    const r2 = r * r;
    for (let y = y0; y <= y1; y++) {
      const py = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5 - cx;
        const d2 = px * px + py * py;
        if (d2 > r2) continue;
        const nz = Math.sqrt(1 - d2 / r2);
        const z = cz + r * nz;
        const i = y * this.w + x;
        if (z <= this.z[i]) continue;
        const nx = px / r;
        const ny = py / r;
        const m = typeof mat === 'number' ? mat : mat(nx, ny, nz);
        if (m < 0) continue;
        this.write(i, x, y, z, m, part, nx * LX + ny * LY + nz * LZ + bias);
      }
    }
  }

  /**
   * Tapered capsule from A to B (radii ra → rb). The material callback receives
   * t (0 at A … 1 at B) and `across` (−1 … 1, positive on the left of A→B).
   */
  capsule(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    ra: number,
    rb: number,
    mat: MatSpec,
    part: number,
    bias = 0,
  ) {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const len = Math.sqrt(len2) || 1;
    const R = Math.max(ra, rb) + 1;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - R));
    const x1 = Math.min(this.w - 1, Math.ceil(Math.max(ax, bx) + R));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - R));
    const y1 = Math.min(this.h - 1, Math.ceil(Math.max(ay, by) + R));
    for (let y = y0; y <= y1; y++) {
      const py = y + 0.5;
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - (ax + dx * t);
        const ey = py - (ay + dy * t);
        const r = ra + (rb - ra) * t;
        const d2 = ex * ex + ey * ey;
        if (d2 > r * r) continue;
        const nz = Math.sqrt(1 - d2 / (r * r));
        const z = az + (bz - az) * t + r * nz;
        const i = y * this.w + x;
        if (z <= this.z[i]) continue;
        const nx = ex / r;
        const ny = ey / r;
        let m: number;
        if (typeof mat === 'number') m = mat;
        else m = mat(px, py, t, (dx * ey - dy * ex) / (len * r));
        if (m < 0) continue;
        this.write(i, x, y, z, m, part, nx * LX + ny * LY + nz * LZ + bias);
      }
    }
  }

  /**
   * A flat elliptical disk (a racket head): center C and semi-axes U, V given
   * in raster space [x, y, z]. The rim becomes `rimMat`, the inside `fillMat`.
   * Seen edge-on it collapses to a line of rim.
   */
  disk(
    c: readonly [number, number, number],
    u: readonly [number, number, number],
    v: readonly [number, number, number],
    rimMat: number,
    fillMat: number,
    part: number,
    lum = 0.55,
  ) {
    const det = u[0] * v[1] - u[1] * v[0];
    const ul = Math.hypot(u[0], u[1]);
    const vl = Math.hypot(v[0], v[1]);
    if (Math.abs(det) < 0.9 * Math.max(ul, vl, 1)) {
      // Nearly edge-on: draw the long axis as a line.
      const a = ul >= vl ? u : v;
      this.line(
        c[0] - a[0],
        c[1] - a[1],
        c[2] - a[2],
        c[0] + a[0],
        c[1] + a[1],
        c[2] + a[2],
        rimMat,
        part,
        lum,
      );
      return;
    }
    const R = Math.max(ul, vl) + 1;
    const x0 = Math.max(0, Math.floor(c[0] - R));
    const x1 = Math.min(this.w - 1, Math.ceil(c[0] + R));
    const y0 = Math.max(0, Math.floor(c[1] - R));
    const y1 = Math.min(this.h - 1, Math.ceil(c[1] + R));
    const inv = 1 / det;
    for (let y = y0; y <= y1; y++) {
      const py = y + 0.5 - c[1];
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5 - c[0];
        const a = (px * v[1] - py * v[0]) * inv;
        const b = (u[0] * py - u[1] * px) * inv;
        const rho = Math.sqrt(a * a + b * b);
        if (rho > 1) continue;
        const z = c[2] + a * u[2] + b * v[2];
        const i = y * this.w + x;
        if (z <= this.z[i]) continue;
        // Ellipse radius along this pixel's direction, for a 1-px rim.
        const reach = rho > 1e-6 ? Math.hypot(px, py) / rho : R;
        const rim = rho > 1 - 1.05 / Math.max(1, reach);
        this.write(i, x, y, z, rim ? rimMat : fillMat, part, lum);
      }
    }
  }

  /** Single pixel (float coords are floored). */
  plot(x: number, y: number, z: number, mat: number, part: number, lum = 0.5) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    const i = yi * this.w + xi;
    if (z <= this.z[i]) return;
    this.write(i, xi, yi, z, mat, part, lum);
  }

  /** 1-px Bresenham line, depth interpolated. */
  line(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    mat: number,
    part: number,
    lum = 0.5,
  ) {
    let xa = Math.floor(x0);
    let ya = Math.floor(y0);
    const xb = Math.floor(x1);
    const yb = Math.floor(y1);
    const dx = Math.abs(xb - xa);
    const dy = -Math.abs(yb - ya);
    const sx = xa < xb ? 1 : -1;
    const sy = ya < yb ? 1 : -1;
    const steps = Math.max(dx, -dy) || 1;
    let err = dx + dy;
    let k = 0;
    for (let guard = 0; guard < 512; guard++) {
      this.plot(xa, ya, z0 + ((z1 - z0) * k) / steps, mat, part, lum);
      if (xa === xb && ya === yb) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        xa += sx;
      }
      if (e2 <= dx) {
        err += dx;
        ya += sy;
      }
      k++;
    }
  }

  /**
   * Quantize lighting into ramp tones and composite into `out` (a packed
   * frame `outW`×`outH`) with the raster's (0,0) at (ox, oy). Empty pixels
   * are left untouched; outline pixels are drawn around the silhouette.
   * ramps[m] = packed [outline, shadow, mid, base, highlight].
   */
  resolve(
    out: Uint32Array,
    outW: number,
    outH: number,
    ox: number,
    oy: number,
    ramps: Uint32Array[],
    opts: ResolveOptions = {},
  ) {
    if (this.bx1 < this.bx0) return;
    const [t1, t2, t3] = opts.thresholds ?? [-0.08, 0.3, 0.68];
    const dither = opts.dither ?? 0;
    const edge = opts.edgeDepth ?? 1.6;
    const noOutline = opts.noOutline;
    const { w, h, z, mat, lum, part } = this;
    // One pixel of margin for outlines.
    const xs = Math.max(0, this.bx0 - 1);
    const xe = Math.min(w - 1, this.bx1 + 1);
    const ys = Math.max(0, this.by0 - 1);
    const ye = Math.min(h - 1, this.by1 + 1);

    for (let y = ys; y <= ye; y++) {
      const fy = oy + y;
      if (fy < 0 || fy >= outH) continue;
      for (let x = xs; x <= xe; x++) {
        const fx = ox + x;
        if (fx < 0 || fx >= outW) continue;
        const i = y * w + x;
        const o = fy * outW + fx;
        const m = mat[i];
        if (m) {
          const ramp = ramps[m - 1];
          // Separation line: a different part sits clearly in front of us.
          let isEdge = false;
          const zi = z[i] + edge;
          const pi = part[i];
          if (x > 0 && mat[i - 1] && part[i - 1] !== pi && z[i - 1] > zi) isEdge = true;
          else if (x < w - 1 && mat[i + 1] && part[i + 1] !== pi && z[i + 1] > zi) isEdge = true;
          else if (y > 0 && mat[i - w] && part[i - w] !== pi && z[i - w] > zi) isEdge = true;
          else if (y < h - 1 && mat[i + w] && part[i + w] !== pi && z[i + w] > zi) isEdge = true;
          if (isEdge) {
            out[o] = ramp[0];
            continue;
          }
          const l = lum[i] + (dither ? BAYER4[(y & 3) * 4 + (x & 3)] * dither : 0);
          out[o] = ramp[l < t1 ? 1 : l < t2 ? 2 : l < t3 ? 3 : 4];
          continue;
        }
        // Outer outline: pick the front-most filled neighbour.
        let best = -1;
        let bestZ = EMPTY_Z;
        let fromBelow = false;
        for (let k = 0; k < 4; k++) {
          let j: number;
          if (k === 0) {
            if (x === 0) continue;
            j = i - 1;
          } else if (k === 1) {
            if (x === w - 1) continue;
            j = i + 1;
          } else if (k === 2) {
            if (y === 0) continue;
            j = i - w;
          } else {
            if (y === h - 1) continue;
            j = i + w;
          }
          const mj = mat[j];
          if (!mj || (noOutline && noOutline[mj - 1])) continue;
          if (z[j] > bestZ) {
            bestZ = z[j];
            best = j;
            fromBelow = k === 3;
          }
        }
        if (best >= 0) {
          const ramp = ramps[mat[best] - 1];
          // Sel-out: the outline over the lit top edge is a touch softer.
          out[o] = fromBelow && lum[best] > t3 ? ramp[1] : ramp[0];
        }
      }
    }
  }
}
