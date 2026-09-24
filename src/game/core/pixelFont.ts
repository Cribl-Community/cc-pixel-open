/**
 * A 3×5 bitmap font, defined in code. Used for sponsor boards, the speed gun
 * display, painted court lettering and the in-canvas power meter.
 */

const GLYPHS: Record<string, string> = {
  '0': '###|#.#|#.#|#.#|###',
  '1': '.#.|##.|.#.|.#.|###',
  '2': '###|..#|###|#..|###',
  '3': '###|..#|.##|..#|###',
  '4': '#.#|#.#|###|..#|..#',
  '5': '###|#..|###|..#|###',
  '6': '###|#..|###|#.#|###',
  '7': '###|..#|.#.|.#.|.#.',
  '8': '###|#.#|###|#.#|###',
  '9': '###|#.#|###|..#|###',
  A: '.#.|#.#|###|#.#|#.#',
  B: '##.|#.#|##.|#.#|##.',
  C: '.##|#..|#..|#..|.##',
  D: '##.|#.#|#.#|#.#|##.',
  E: '###|#..|##.|#..|###',
  F: '###|#..|##.|#..|#..',
  G: '.##|#..|#.#|#.#|.##',
  H: '#.#|#.#|###|#.#|#.#',
  I: '###|.#.|.#.|.#.|###',
  J: '..#|..#|..#|#.#|.#.',
  K: '#.#|#.#|##.|#.#|#.#',
  L: '#..|#..|#..|#..|###',
  M: '#.#|###|###|#.#|#.#',
  N: '###|#.#|#.#|#.#|#.#',
  O: '.#.|#.#|#.#|#.#|.#.',
  P: '##.|#.#|##.|#..|#..',
  Q: '.#.|#.#|#.#|##.|.##',
  R: '##.|#.#|##.|#.#|#.#',
  S: '.##|#..|.#.|..#|##.',
  T: '###|.#.|.#.|.#.|.#.',
  U: '#.#|#.#|#.#|#.#|###',
  V: '#.#|#.#|#.#|#.#|.#.',
  W: '#.#|#.#|###|###|#.#',
  X: '#.#|#.#|.#.|#.#|#.#',
  Y: '#.#|#.#|.#.|.#.|.#.',
  Z: '###|..#|.#.|#..|###',
  '.': '...|...|...|...|.#.',
  ',': '...|...|...|.#.|#..',
  ':': '...|.#.|...|.#.|...',
  '-': '...|...|###|...|...',
  '!': '.#.|.#.|.#.|...|.#.',
  '?': '##.|..#|.#.|...|.#.',
  '/': '..#|..#|.#.|#..|#..',
  '+': '...|.#.|###|.#.|...',
  '%': '#.#|..#|.#.|#..|#.#',
  "'": '.#.|.#.|...|...|...',
  '>': '#..|.#.|..#|.#.|#..',
  '<': '..#|.#.|#..|.#.|..#',
  '#': '#.#|###|#.#|###|#.#',
  '(': '.#.|#..|#..|#..|.#.',
  ')': '.#.|..#|..#|..#|.#.',
  '*': '...|#.#|.#.|#.#|...',
  '&': '.#.|#.#|.#.|#.#|.##',
  '=': '...|###|...|###|...',
  '@': '.##|#.#|###|#..|.##',
  '·': '...|...|.#.|...|...',
  ' ': '...|...|...|...|...',
};

/** Glyph bitmaps as 15-bit masks, row-major, MSB = top-left. */
const MASKS = new Map<string, number>();
for (const [ch, rows] of Object.entries(GLYPHS)) {
  let m = 0;
  for (const c of rows.replaceAll('|', '')) m = (m << 1) | (c === '#' ? 1 : 0);
  MASKS.set(ch, m);
}

export function glyphPixel(ch: string, gx: number, gy: number): boolean {
  if (gx < 0 || gx > 2 || gy < 0 || gy > 4) return false;
  const m = MASKS.get(ch.toUpperCase()) ?? 0;
  return ((m >> (14 - (gy * 3 + gx))) & 1) === 1;
}

export const textWidth = (text: string, scale = 1) => Math.max(0, text.length * 4 - 1) * scale;

/**
 * Draw text straight into a packed pixel buffer (see Frame). Pixels outside
 * the clip rectangle are skipped.
 */
export function drawTextPx(
  data: Uint32Array,
  bw: number,
  bh: number,
  text: string,
  x: number,
  y: number,
  color: number,
  opts: {
    scale?: number;
    align?: 'left' | 'center' | 'right';
    shadow?: number;
    clip?: [number, number, number, number];
  } = {},
) {
  const scale = opts.scale ?? 1;
  let ox = Math.round(x);
  if (opts.align === 'center') ox = Math.round(x - textWidth(text, scale) / 2);
  if (opts.align === 'right') ox = Math.round(x - textWidth(text, scale));
  const oy = Math.round(y);
  const [cx0, cy0, cx1, cy1] = opts.clip ?? [0, 0, bw, bh];
  const pass = (dx: number, dy: number, c: number) => {
    for (let i = 0; i < text.length; i++) {
      const m = MASKS.get(text[i].toUpperCase()) ?? 0;
      if (!m) continue;
      for (let gy = 0; gy < 5; gy++)
        for (let gx = 0; gx < 3; gx++) {
          if (!((m >> (14 - (gy * 3 + gx))) & 1)) continue;
          for (let sy = 0; sy < scale; sy++)
            for (let sx = 0; sx < scale; sx++) {
              const px = ox + (i * 4 + gx) * scale + sx + dx;
              const py = oy + gy * scale + sy + dy;
              if (px < cx0 || py < cy0 || px >= cx1 || py >= cy1) continue;
              data[py * bw + px] = c;
            }
        }
    }
  };
  if (opts.shadow) pass(scale, scale, opts.shadow);
  pass(0, 0, color);
}
