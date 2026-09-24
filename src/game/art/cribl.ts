/**
 * Cribl branding for the stadiums: the brand palette (from Capra's design
 * tokens) and Cribl's own marks — the logo, the goat and the product logos —
 * rasterized into pixel masks.
 *
 * The marks come straight from `@capra/icons`. Their SVG path data is read
 * off the icon components and filled with Path2D at a small size, so the
 * boards carry the real logos, drawn in code like everything else.
 */

import { createElement, type ReactNode } from 'react';
import { glyphPixel } from '../core/pixelFont';
import { CriblOutlined, GoatSolid } from '@capra/icons';
import { EdgeColor, InsightsColor, LakeColor, SearchColor, StreamColor } from '@capra/icons/logos';

/** Cribl brand colors (Capra `brand.*` tokens, plus CriblCon's orange). */
export const CRIBL = {
  navy: '#020e1b',
  navy2: '#021a35',
  blueDeep: '#032836',
  teal900: '#002432',
  teal800: '#062b38',
  teal700: '#083b44',
  teal600: '#0a4e5b',
  teal500: '#118285',
  teal: '#00cccc',
  cyan: '#00ffff',
  tealLight: '#99edeb',
  mint: '#9dffbd',
  blue: '#086cd9',
  blueLight: '#62a4ec',
  purple: '#5959ff',
  lavender: '#a5a3ff',
  indigo: '#2d389a',
  orange: '#ff8b00',
  slate: '#3b4e63',
  gray: '#73808f',
  mist: '#d6dade',
  cream: '#fcfaf8',
  white: '#ffffff',
} as const;

export type MarkId =
  | 'cribl'
  | 'goat'
  | 'stream'
  | 'edge'
  | 'search'
  | 'lake'
  | 'insights'
  /** CriblCon 26's two cards (drawn here, not a Capra icon). */
  | 'cards26';

// ---------------------------------------------------------------------------
// Reading path data off the icon components

interface SvgPath {
  d: string;
  /** Index of the path's fill among the icon's distinct fills (1-based). */
  tone: number;
  rule: CanvasFillRule;
}

interface SvgArt {
  size: number;
  paths: SvgPath[];
}

type AnyProps = Record<string, unknown>;
interface ElementLike {
  type: unknown;
  props: AnyProps;
}

/**
 * Walks an icon's element tree. Capra icons are forwardRef components with
 * no hooks, so their render functions can be called directly. Paths inside
 * <defs>/<clipPath> are skipped; `fromMask` takes the paths inside <mask>
 * instead (the solid logo shape behind an outlined icon).
 */
function collect(
  node: ReactNode,
  fromMask: boolean,
  out: SvgArt,
  fills: string[],
  state = { mask: false, defs: false },
) {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) collect(n as ReactNode, fromMask, out, fills, state);
    return;
  }
  const el = node as unknown as ElementLike;
  const type = el.type as { render?: (p: AnyProps, r: null) => ReactNode } | string | undefined;
  if (type && typeof type === 'object' && typeof type.render === 'function') {
    collect(type.render(el.props, null), fromMask, out, fills, state);
    return;
  }
  if (typeof type !== 'string') return;
  const p = el.props;
  if (type === 'svg' && typeof p.viewBox === 'string')
    out.size = Number(p.viewBox.split(/\s+/)[2]) || 24;
  if (type === 'path' && typeof p.d === 'string' && !state.defs && state.mask === fromMask) {
    const fill = typeof p.fill === 'string' ? p.fill.toLowerCase() : 'currentcolor';
    let tone = fills.indexOf(fill) + 1;
    if (!tone) tone = fills.push(fill);
    out.paths.push({ d: p.d, tone, rule: p.fillRule === 'evenodd' ? 'evenodd' : 'nonzero' });
  }
  const inner = {
    mask: state.mask || type === 'mask',
    defs: state.defs || type === 'defs' || type === 'clipPath',
  };
  collect(p.children as ReactNode, fromMask, out, fills, inner);
}

const SOURCES: Record<Exclude<MarkId, 'cards26'>, { icon: unknown; fromMask?: boolean }> = {
  cribl: { icon: CriblOutlined, fromMask: true },
  goat: { icon: GoatSolid },
  stream: { icon: StreamColor },
  edge: { icon: EdgeColor },
  search: { icon: SearchColor },
  lake: { icon: LakeColor },
  insights: { icon: InsightsColor },
};

const artCache = new Map<MarkId, SvgArt>();

function art(id: Exclude<MarkId, 'cards26'>): SvgArt {
  let a = artCache.get(id);
  if (!a) {
    const src = SOURCES[id];
    a = { size: 24, paths: [] };
    collect(createElement(src.icon as Parameters<typeof createElement>[0]), !!src.fromMask, a, []);
    artCache.set(id, a);
  }
  return a;
}

// ---------------------------------------------------------------------------
// Rasterizing

/**
 * A pixel mask: 0 = empty, otherwise the 1-based tone of the path that covers
 * it (tone 3 is reserved for ink drawn on top, like the digits on the cards).
 */
export interface Mark {
  w: number;
  h: number;
  px: Uint8Array;
}

const SS = 6;
const markCache = new Map<string, Mark>();

function scratch(w: number, h: number) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * The mark at `size` pixels square. Each pixel is on when at least `fill` of
 * it is covered, and takes the tone that covers most of it.
 */
export function mark(id: MarkId, size: number, fill = 0.42): Mark {
  const key = `${id}:${size}:${fill}`;
  const hit = markCache.get(key);
  if (hit) return hit;
  if (id === 'cards26') {
    const m = cards26(size);
    markCache.set(key, m);
    return m;
  }
  const a = art(id);
  const n = size * SS;
  const px = new Uint8Array(size * size);
  const out: Mark = { w: size, h: size, px };
  const canvas = scratch(n, n);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx || typeof Path2D === 'undefined') {
    markCache.set(key, out);
    return out;
  }
  const k = n / a.size;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  for (const p of a.paths) {
    // Encode the tone in the red channel; alpha carries the coverage.
    ctx.fillStyle = `rgb(${p.tone * 16}, 0, 0)`;
    ctx.fill(new Path2D(p.d), p.rule);
  }
  const img = ctx.getImageData(0, 0, n, n).data;
  const tones = new Float32Array(16);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      tones.fill(0);
      let cover = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * n + x * SS + sx) * 4;
          const al = img[i + 3] / 255;
          if (al <= 0) continue;
          cover += al;
          // getImageData returns straight (not premultiplied) color.
          tones[Math.min(15, Math.round(img[i] / 16))] += al;
        }
      if (cover / (SS * SS) < fill) continue;
      let best = 1;
      for (let t = 1; t < 16; t++) if (tones[t] > tones[best]) best = t;
      px[y * size + x] = best;
    }
  markCache.set(key, out);
  return out;
}

/** The "2" and "6" cards from the CriblCon 26 logo, the second one tipped up a pixel. */
function cards26(size: number): Mark {
  const px = new Uint8Array(size * size);
  const w = Math.max(3, Math.floor((size - 1) / 2));
  const h = Math.min(size - 1, Math.round(w * 1.7));
  const set = (x: number, y: number, t: number) => {
    if (x >= 0 && y >= 0 && x < size && y < size) px[y * size + x] = t;
  };
  (
    [
      ['2', 0, size - h],
      ['6', w + 1, size - h - 1],
    ] as const
  ).forEach(([digit, x0, y0]) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x0 + x, y0 + y, 1);
    for (let gy = 0; gy < 5; gy++)
      for (let gx = 0; gx < 3; gx++)
        if (glyphPixel(digit, gx, gy)) set(x0 + ((w - 3) >> 1) + gx, y0 + ((h - 5) >> 1) + gy, 3);
  });
  return { w: size, h: size, px };
}

/** Blit a mark into a packed buffer; `colors[tone - 1]` paints each tone. */
export function drawMark(
  buf: Uint32Array,
  bw: number,
  bh: number,
  m: Mark,
  x0: number,
  y0: number,
  colors: number[],
  clip?: [number, number, number, number],
) {
  const [cx0, cy0, cx1, cy1] = clip ?? [0, 0, bw, bh];
  for (let y = 0; y < m.h; y++) {
    const py = y0 + y;
    if (py < cy0 || py >= cy1) continue;
    for (let x = 0; x < m.w; x++) {
      const t = m.px[y * m.w + x];
      if (!t) continue;
      const px = x0 + x;
      if (px < cx0 || px >= cx1) continue;
      buf[py * bw + px] = colors[Math.min(colors.length, t) - 1];
    }
  }
}

/** Sample a mark at normalized coordinates (u right, v down), for decals in perspective. */
export function markAt(m: Mark, u: number, v: number): number {
  if (u < 0 || v < 0 || u >= 1 || v >= 1) return 0;
  return m.px[Math.floor(v * m.h) * m.w + Math.floor(u * m.w)];
}
