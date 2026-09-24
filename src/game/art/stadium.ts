/**
 * The stadium painter. Every background pixel is ray-cast from the broadcast
 * camera into a simple 3D arena — the court, the boards, three raked stands
 * and the upper structure — then shaded by venue: surface texture, perfectly
 * straight 1-px lines in perspective, sun shadows cast by the stands and the
 * net, and floodlight falloff at night. It also lays out every seat for the
 * crowd, the sponsor board panels, and pre-renders the net.
 */

import { mix, pack } from '../core/color';
import { hash2, makeRng, fbm } from '../core/rng';
import { drawTextPx, glyphPixel, textWidth } from '../core/pixelFont';
import { Camera } from '../sim/camera';
import { ARENA, COURT, netHeightAt } from '../sim/court';
import type { BoardDef, VenueDef } from '../sim/venues';
import { mixPacked, scalePacked } from '../render/frame';
import { CRIBL, drawMark, mark, markAt, type Mark, type MarkId } from './cribl';

/** Extra background columns on each side so the camera can pan. */
export const PAN = 14;

const WALL_H = 0.95;
const ROW_D = 0.85;
const ROW_R = 0.42;
const FAR_ROWS = 12;
const SIDE_ROWS = 12;
const AISLE_EVERY = 6.2;
const AISLE_W = 0.9;
const SEAT_W = 0.56;

export type StandId = 'far' | 'left' | 'right';

export interface Seat {
  /** Screen position (background space) of the spectator's hip. */
  sx: number;
  sy: number;
  /** Pixels per meter at the seat. */
  s: number;
  stand: StandId;
  row: number;
  /** World position of the seat (for head tracking). */
  x: number;
  y: number;
  /** Light level 0..1 (night/indoor falloff, sun/shade). */
  light: number;
  /** Distance from the camera (m), for painter's ordering. */
  dist: number;
}

export interface BoardPanel {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  text: string;
  /** The board's design (none on the speed gun display). */
  def?: BoardDef;
}

export interface NetSprite {
  data: Uint32Array;
  w: number;
  h: number;
  /** Top-left in background space. */
  x: number;
  y: number;
}

export interface Stadium {
  venue: VenueDef;
  /** Background buffer, (W + 2·PAN) × H. */
  bg: Uint32Array;
  bw: number;
  bh: number;
  /** Pristine copy, restored when clay marks are swept. */
  clean: Uint32Array;
  seats: Seat[];
  boards: BoardPanel[];
  speedBoard: BoardPanel;
  net: NetSprite;
  /** Light multiplier for dynamic objects at a world point. */
  lightAt: (x: number, y: number, z: number) => number;
  /** 1 if a ground point is in shadow. */
  shadowAt: (x: number, y: number) => number;
}

// ---------------------------------------------------------------------------
// Ray casting

interface Hit {
  kind: 'ground' | 'farWall' | 'sideWall' | 'tread' | 'riser' | 'upper';
  stand: StandId | null;
  row: number;
  x: number;
  y: number;
  z: number;
  t: number;
}

const zRow = (k: number) => WALL_H + k * ROW_R;
const X_WALL = () => ARENA.xWall;
const Y_WALL = () => ARENA.yWall;
const FAR_HALF = () => X_WALL() + SIDE_ROWS * ROW_D + 6;

function castRay(
  cx: number,
  cy: number,
  cz: number,
  dx: number,
  dy: number,
  dz: number,
): Hit | null {
  const xw = X_WALL();
  const yw = Y_WALL();
  let best: Hit | null = null;
  const consider = (h: Hit) => {
    if (h.t > 0 && (!best || h.t < best.t)) best = h;
  };
  // Ground inside the arena wins outright (nothing can be in front of it).
  if (dz < 0) {
    const t = -cz / dz;
    const x = cx + dx * t;
    const y = cy + dy * t;
    if (Math.abs(x) <= xw && y <= yw) return { kind: 'ground', stand: null, row: 0, x, y, z: 0, t };
  }
  // Far wall.
  if (dy > 0) {
    const t = (yw - cy) / dy;
    const x = cx + dx * t;
    const z = cz + dz * t;
    if (z >= 0 && z <= WALL_H && Math.abs(x) <= xw)
      consider({ kind: 'farWall', stand: 'far', row: 0, x, y: yw, z, t });
  }
  // Side walls.
  if (Math.abs(dx) > 1e-9) {
    const sx = dx > 0 ? xw : -xw;
    const t = (sx - cx) / dx;
    const y = cy + dy * t;
    const z = cz + dz * t;
    if (z >= 0 && z <= WALL_H && y <= yw)
      consider({ kind: 'sideWall', stand: dx > 0 ? 'right' : 'left', row: 0, x: sx, y, z, t });
  }
  // Far stand.
  const farHalf = FAR_HALF();
  for (let k = 0; k < FAR_ROWS; k++) {
    const zt = zRow(k);
    if (dz < 0) {
      const t = (zt - cz) / dz;
      const y = cy + dy * t;
      const x = cx + dx * t;
      if (y >= yw + k * ROW_D && y <= yw + (k + 1) * ROW_D && Math.abs(x) <= farHalf)
        consider({ kind: 'tread', stand: 'far', row: k, x, y, z: zt, t });
    }
    if (k > 0 && dy > 0) {
      const yr = yw + k * ROW_D;
      const t = (yr - cy) / dy;
      const z = cz + dz * t;
      const x = cx + dx * t;
      if (z >= zRow(k - 1) && z <= zt && Math.abs(x) <= farHalf)
        consider({ kind: 'riser', stand: 'far', row: k, x, y: yr, z, t });
    }
  }
  // Back structure behind the last far row.
  if (dy > 0) {
    const yb = yw + FAR_ROWS * ROW_D;
    const t = (yb - cy) / dy;
    const z = cz + dz * t;
    const x = cx + dx * t;
    if (z >= zRow(FAR_ROWS - 1) && Math.abs(x) <= farHalf + 2)
      consider({ kind: 'upper', stand: 'far', row: FAR_ROWS, x, y: yb, z, t });
  }
  // Side stands (the one on the side the ray is heading).
  if (Math.abs(dx) > 1e-9) {
    const sgn = dx > 0 ? 1 : -1;
    const stand: StandId = sgn > 0 ? 'right' : 'left';
    for (let k = 0; k < SIDE_ROWS; k++) {
      const zt = zRow(k);
      if (dz < 0) {
        const t = (zt - cz) / dz;
        const x = (cx + dx * t) * sgn;
        const y = cy + dy * t;
        if (x >= xw + k * ROW_D && x <= xw + (k + 1) * ROW_D && y <= yw + k * ROW_D)
          consider({ kind: 'tread', stand, row: k, x: x * sgn, y, z: zt, t });
      }
      if (k > 0) {
        const xr = (xw + k * ROW_D) * sgn;
        const t = (xr - cx) / dx;
        const z = cz + dz * t;
        const y = cy + dy * t;
        if (z >= zRow(k - 1) && z <= zt && y <= yw + k * ROW_D)
          consider({ kind: 'riser', stand, row: k, x: xr, y, z, t });
      }
    }
    const xb = (xw + SIDE_ROWS * ROW_D) * sgn;
    const t = (xb - cx) / dx;
    const z = cz + dz * t;
    if (z >= zRow(SIDE_ROWS - 1))
      consider({ kind: 'upper', stand, row: SIDE_ROWS, x: xb, y: cy + dy * t, z, t });
  }
  return best;
}

// ---------------------------------------------------------------------------
// Light & shadow

function makeLight(v: VenueDef) {
  const night = v.light === 'night';
  const indoor = v.light === 'indoor';
  return (x: number, y: number, z: number) => {
    if (!night && !indoor) return 1;
    const ax = Math.max(0, Math.abs(x) - COURT.DW);
    const ay = Math.max(0, Math.abs(y) - COURT.L);
    const out = Math.hypot(ax, ay);
    if (indoor) {
      // Spotlit court, dark bowl.
      const onCourt = Math.max(0, 1 - out / 7);
      const pool = Math.max(0, 1 - Math.hypot(x / 7, y / 13) ** 2) * 0.12;
      return 0.34 + 0.62 * onCourt + pool - Math.min(0.12, z * 0.012);
    }
    const onCourt = Math.max(0, 1 - out / 11);
    return 0.52 + 0.46 * onCourt - Math.min(0.1, z * 0.01);
  };
}

function makeShadow(v: VenueDef) {
  const sun = v.sun;
  if (!sun) return () => 0;
  const xw = X_WALL();
  const yw = Y_WALL();
  const slope = ROW_R / ROW_D;
  const topZ = zRow(SIDE_ROWS - 1) + ROW_R;
  const roofZ = topZ + 6;
  const standX = SIDE_ROWS * ROW_D;
  // Height of a stand at horizontal distance d beyond its wall.
  const standH = (d: number) => (d < 0 ? 0 : d >= standX ? roofZ : WALL_H + d * slope);
  return (x: number, y: number) => {
    // Net.
    if (sun.y !== 0 && y < 0 === sun.y > 0) {
      const t = -y / sun.y;
      if (t > 0) {
        const nx = x + sun.x * t;
        const nz = sun.z * t;
        if (Math.abs(nx) <= COURT.POST_X && nz < netHeightAt(nx)) return 1;
      }
    }
    // Stands: sample where the sun ray crosses the arena boundary and beyond.
    for (const d of [0, 1.5, 4, 8, standX, standX + 2]) {
      if (Math.abs(sun.x) > 1e-3) {
        const sgn = sun.x > 0 ? 1 : -1;
        const t = (sgn * (xw + d) - x) / sun.x;
        if (t > 0) {
          const yy = y + sun.y * t;
          if (yy < yw + 3 && sun.z * t < standH(d)) return 1;
        }
      }
      if (sun.y > 1e-3) {
        const t = (yw + d - y) / sun.y;
        if (t > 0) {
          const xx = x + sun.x * t;
          if (Math.abs(xx) < FAR_HALF() && sun.z * t < standH(d)) return 1;
        }
      }
    }
    return 0;
  };
}

// ---------------------------------------------------------------------------
// Painting

export function paintStadium(v: VenueDef, W: number, H: number, seed = 1): Stadium {
  const bw = W + PAN * 2;
  const bh = H;
  const cam = new Camera(bw, bh);
  const bg = new Uint32Array(bw * bh);
  const light = makeLight(v);
  const shadow = makeShadow(v);
  const C = v.colors;
  const rng = makeRng(seed * 7919 + 17);
  const surf = v.surface;
  const cz = cam.pos.z;
  const cyPos = cam.pos.y;
  const shadeP = pack(C.shade);
  const shadeAmt = v.light === 'dusk' ? 0.4 : 0.34;

  const courtP = pack(C.court);
  const apronP = pack(C.apron);
  const courtDark = pack(mix(C.court, '#000000', 0.07));
  const courtLight = pack(mix(C.court, '#ffffff', 0.06));
  const apronDark = pack(mix(C.apron, '#000000', 0.07));
  const apronLight = pack(mix(C.apron, '#ffffff', 0.06));
  const stripeA = pack(mix(C.court, '#ffffff', 0.07));
  const stripeB = pack(mix(C.court, '#000000', 0.05));
  const wornA = pack('#b49a62');
  const wornB = pack('#9c8450');
  const wallP = pack(C.wall);
  const wallTopP = pack(C.wallTop);
  const riserP = pack(C.riser);
  const stairP = pack(C.stair);
  const upperP = pack(C.upper);
  const seatA = pack(C.seats[0]);
  const seatB = pack(C.seats[1]);
  const seatShadowA = pack(mix(C.seats[0], '#000000', 0.35));
  const seatShadowB = pack(mix(C.seats[1], '#000000', 0.35));

  const ground = (x: number, y: number, px: number, py: number): number => {
    const inCourt = Math.abs(x) <= COURT.DW && Math.abs(y) <= COURT.L;
    const n = hash2(px, py, seed);
    let c: number;
    if (surf === 'grass') {
      // Mowing stripes across the court, lawn wear behind the baselines.
      const band = Math.floor((y + 40) / 1.46) & 1;
      c = band ? stripeA : stripeB;
      if (!inCourt) c = band ? apronLight : apronDark;
      const wear =
        Math.max(0, 1 - Math.abs(x) / 3.2) *
          Math.max(0, 1 - Math.abs(Math.abs(y) - COURT.L - 0.6) / 2.4) +
        Math.max(0, 1 - Math.abs(x) / 1.2) *
          Math.max(0, 1 - Math.abs(Math.abs(y) - COURT.SV) / 1.2) *
          0.45;
      const wn = fbm(x * 0.9, y * 0.9, seed + 3, 3);
      if (wear * (0.7 + wn * 0.6) > 0.55) c = wn > 0.52 ? wornA : wornB;
      else if (n < 0.08) c = mixPacked(c, 0xff000000, 0.08);
    } else if (surf === 'clay') {
      const g = fbm(x * 1.7, y * 1.7, seed + 5, 3);
      c = inCourt ? courtP : apronP;
      if (g > 0.6) c = inCourt ? courtLight : apronLight;
      else if (g < 0.38) c = inCourt ? courtDark : apronDark;
      if (n < 0.06) c = mixPacked(c, 0xffffffff, 0.12);
      else if (n > 0.95) c = mixPacked(c, 0xff000000, 0.14);
      // Faint sweep marks from the drag mats.
      if (Math.abs(Math.sin(y * 2.3 + Math.sin(x * 0.35) * 1.2)) < 0.05 && n > 0.4)
        c = mixPacked(c, 0xffffffff, 0.06);
    } else {
      c = inCourt ? courtP : apronP;
      if (n < 0.1) c = inCourt ? courtDark : apronDark;
      else if (n > 0.93) c = inCourt ? courtLight : apronLight;
    }
    return c;
  };

  // Rows: world y and pixel footprint on the ground depend only on the row.
  for (let py = 0; py < bh; py++) {
    for (let px = 0; px < bw; px++) {
      const d = cam.ray(px + 0.5, py + 0.5);
      const hit = castRay(cam.pos.x, cyPos, cz, d.x, d.y, d.z);
      let c = upperP;
      if (hit) {
        switch (hit.kind) {
          case 'ground':
            c = ground(hit.x, hit.y, px, py);
            if (shadow(hit.x, hit.y)) c = mixPacked(c, shadeP, shadeAmt);
            break;
          case 'farWall':
          case 'sideWall': {
            c = hit.z > WALL_H - 0.12 ? wallTopP : wallP;
            if (hit.z < 0.06) c = scalePacked(wallP, 0.7);
            break;
          }
          case 'tread': {
            const along = hit.stand === 'far' ? hit.x : hit.y;
            const inAisle = ((along % AISLE_EVERY) + AISLE_EVERY) % AISLE_EVERY < AISLE_W;
            const section = Math.floor(along / AISLE_EVERY) & 1;
            const depthIn =
              hit.stand === 'far'
                ? (hit.y - Y_WALL() - hit.row * ROW_D) / ROW_D
                : (Math.abs(hit.x) - X_WALL() - hit.row * ROW_D) / ROW_D;
            if (inAisle) c = depthIn > 0.5 ? stairP : scalePacked(stairP, 0.8);
            else if (depthIn > 0.62) c = section ? seatA : seatB;
            else c = section ? seatShadowA : seatShadowB;
            break;
          }
          case 'riser':
            c = riserP;
            break;
          case 'upper':
            c = upperP;
            if (v.light !== 'day' && v.light !== 'dusk' && hash2(px >> 2, py, seed + 9) > 0.985)
              c = pack('#fff6d8');
            break;
        }
        const l = light(hit.x, hit.y, hit.z);
        if (l !== 1) c = scalePacked(c, l);
      }
      bg[py * bw + px] = c;
    }
  }

  // ---- Court lines, 1 px, snapped to the pixel containing the line center.
  const lineP = pack(C.line);
  const lineDim = pack(mix(C.line, C.court, 0.25));
  const rowY = new Float64Array(bh + 1);
  const rowS = new Float64Array(bh);
  for (let py = 0; py <= bh; py++) {
    const d = cam.ray(bw / 2, py);
    rowY[py] = d.z < 0 ? cyPos + d.y * (-cz / d.z) : Infinity;
  }
  for (let py = 0; py < bh; py++) {
    const d = cam.ray(bw / 2, py + 0.5);
    rowS[py] = d.z < 0 ? cam.F / (-cz / d.z) : 0;
  }
  const lineAt = (px: number, py: number, dim = false) => {
    if (px < 0 || px >= bw || py < 0 || py >= bh) return;
    const i = py * bw + px;
    let c = dim ? lineDim : lineP;
    const d = cam.ray(px + 0.5, py + 0.5);
    const t = -cz / d.z;
    const gx = d.x * t;
    const gy = cyPos + d.y * t;
    if (shadow(gx, gy)) c = mixPacked(c, shadeP, shadeAmt);
    const l = light(gx, gy, 0);
    if (l !== 1) c = scalePacked(c, l);
    if (surf === 'clay' && hash2(px, py, seed + 1) < 0.12) c = mixPacked(c, pack(C.court), 0.35);
    bg[i] = c;
  };
  const vLine = (X: number, y0: number, y1: number) => {
    for (let py = 0; py < bh; py++) {
      const ymid = (rowY[py] + rowY[py + 1]) / 2;
      if (!isFinite(ymid) || ymid < y0 - 0.02 || ymid > y1 + 0.02) continue;
      const sx = cam.cx + X * rowS[py];
      lineAt(Math.floor(sx), py);
    }
  };
  const hLine = (Y: number, x0: number, x1: number) => {
    for (let py = 0; py < bh; py++) {
      // Screen y grows as world y shrinks.
      if (!(rowY[py] >= Y && rowY[py + 1] < Y)) continue;
      const s = rowS[py];
      const a = Math.round(cam.cx + x0 * s);
      const b = Math.round(cam.cx + x1 * s);
      for (let px = a; px <= b; px++) lineAt(px, py);
    }
  };
  const { L, SW, DW, SV } = COURT;
  hLine(-L, -DW, DW);
  hLine(L, -DW, DW);
  hLine(-SV, -SW, SW);
  hLine(SV, -SW, SW);
  vLine(-DW, -L, L);
  vLine(DW, -L, L);
  vLine(-SW, -L, L);
  vLine(SW, -L, L);
  vLine(0, -SV, SV);
  vLine(0, -L, -L + 0.12);
  vLine(0, L - 0.12, L);

  // ---- Painted lettering and Cribl marks on the aprons.
  const paint = pack(mix(C.apron, C.line, 0.55));
  const paintDim = pack(mix(C.apron, C.line, 0.3));
  const shaded = (x: number, y: number) => (shadow(x, y) ? 1 : 0);
  const logoW = Math.min(11, 0.9 * v.logo.length);
  paintGroundText(bg, bw, bh, cam, v.logo, 0, L + 3.5, logoW, 2.1, paint, shaded, light);
  const sideMarks: [MarkId, MarkId] =
    v.product === 'cribl' ? ['cribl', 'goat'] : [v.product, 'cribl'];
  sideMarks.forEach((id, k) => {
    const sgn = k === 0 ? -1 : 1;
    paintGroundMark(
      bg,
      bw,
      bh,
      cam,
      mark(id, 40),
      sgn * (logoW / 2 + 1.8),
      L + 3.5,
      2.5,
      4.4,
      [paint, paintDim],
      shaded,
      light,
    );
  });
  const apronW = Math.min(12.4, 0.6 * v.apronText.length);
  paintGroundText(bg, bw, bh, cam, v.apronText, 0, -(L + 2.1), apronW, 1.25, paint, shaded, light);

  // ---- Sponsor boards on the far wall.
  const boards: BoardPanel[] = [];
  const xw = X_WALL();
  const yw = Y_WALL();
  // Four sponsor panels and a narrower speed-gun display on the right.
  const edges = [-xw, -xw * 0.56, -xw * 0.1, xw * 0.34, xw * 0.72, xw];
  const nPanels = edges.length - 1;
  for (let i = 0; i < nPanels; i++) {
    const x0 = edges[i] + 0.12;
    const x1 = edges[i + 1] - 0.12;
    const a = cam.project(x0, yw, WALL_H - 0.14);
    const b = cam.project(x1, yw, 0.08);
    boards.push({
      x0: Math.round(a.sx),
      y0: Math.round(a.sy),
      x1: Math.round(b.sx),
      y1: Math.round(b.sy),
      text: v.boards[i % v.boards.length].text,
      def: v.boards[i % v.boards.length],
    });
  }
  const speedBoard = boards[nPanels - 1];
  speedBoard.text = 'SPEED';
  speedBoard.def = undefined;
  if (!v.led) {
    const bl = light(0, yw, 0.5);
    for (const b of boards) {
      if (b === speedBoard || !b.def) continue;
      const lit = (hex: string) => scalePacked(pack(hex), bl);
      fillRect(bg, bw, bh, b.x0, b.y0, b.x1, b.y1, lit(b.def.bg));
      paintBoardContent(bg, bw, bh, b, b.def, lit(b.def.fg), lit(b.def.markColor ?? b.def.fg));
    }
  }

  // ---- Static props: benches, ball-kid stools, TV cameras.
  paintProps(bg, bw, bh, cam, v, light, shadow);

  // ---- Seats.
  const seats = layoutSeats(cam, v, rng, light, shadow);

  const net = buildNet(cam, v, light);

  return {
    venue: v,
    bg,
    bw,
    bh,
    clean: bg.slice(),
    seats,
    boards,
    speedBoard,
    net,
    lightAt: light,
    shadowAt: shadow,
  };
}

export function fillRect(
  buf: Uint32Array,
  bw: number,
  bh: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: number,
) {
  for (let y = Math.max(0, y0); y <= Math.min(bh - 1, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(bw - 1, x1); x++) buf[y * bw + x] = c;
}

/**
 * A board's mark and text, centered on the panel. Falls back to the short
 * text, then to text without the mark, when the panel is too narrow.
 */
export function paintBoardContent(
  buf: Uint32Array,
  bw: number,
  bh: number,
  b: BoardPanel,
  def: BoardDef,
  textColor: number,
  markColor: number,
  text: string = def.text,
  dx = 0,
) {
  const h = b.y1 - b.y0 + 1;
  const room = b.x1 - b.x0 - 3;
  const size = Math.max(5, Math.min(12, h - 2));
  const withMark = (t: string) => (def.mark ? size + 2 : 0) + textWidth(t);
  let t = text;
  let showMark = !!def.mark;
  if (withMark(t) > room && def.short && text === def.text) t = def.short;
  if (withMark(t) > room) showMark = false;
  const total = (showMark ? size + 2 : 0) + textWidth(t);
  let x = Math.round((b.x0 + b.x1 + 1 - total) / 2) + dx;
  const clip: [number, number, number, number] = [
    Math.max(0, b.x0),
    Math.max(0, b.y0),
    Math.min(bw, b.x1 + 1),
    Math.min(bh, b.y1 + 1),
  ];
  if (showMark && def.mark) {
    const m = mark(def.mark, size);
    const dim = mixPacked(markColor, 0xff000000, 0.28);
    const ink = pack(CRIBL.navy);
    drawMark(buf, bw, bh, m, x, b.y0 + Math.floor((h - size) / 2), [markColor, dim, ink], clip);
    x += size + 2;
  }
  drawTextPx(buf, bw, bh, t, x, b.y0 + Math.floor((h - 5) / 2), textColor, { clip });
}

type Lighting = (x: number, y: number, z: number) => number;

/**
 * Paint onto a ground rectangle in perspective: `sample(u, v)` returns a
 * color (or 0) for each point, u across and v away from the camera.
 */
function paintGround(
  bg: Uint32Array,
  bw: number,
  bh: number,
  cam: Camera,
  cx: number,
  cy: number,
  width: number,
  height: number,
  sample: (u: number, v: number) => number,
  shadow: (x: number, y: number) => number,
  light: Lighting,
) {
  // Only the rectangle's screen footprint needs rays.
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of [
    [cx - width / 2, cy - height / 2],
    [cx + width / 2, cy - height / 2],
    [cx - width / 2, cy + height / 2],
    [cx + width / 2, cy + height / 2],
  ]) {
    const p = cam.project(x, y, 0);
    x0 = Math.min(x0, p.sx);
    y0 = Math.min(y0, p.sy);
    x1 = Math.max(x1, p.sx);
    y1 = Math.max(y1, p.sy);
  }
  for (let py = Math.max(0, Math.floor(y0) - 1); py <= Math.min(bh - 1, Math.ceil(y1) + 1); py++) {
    for (
      let px = Math.max(0, Math.floor(x0) - 1);
      px <= Math.min(bw - 1, Math.ceil(x1) + 1);
      px++
    ) {
      const d = cam.ray(px + 0.5, py + 0.5);
      if (d.z >= 0) continue;
      const t = -cam.pos.z / d.z;
      const gx = d.x * t;
      const gy = cam.pos.y + d.y * t;
      const u = (gx - (cx - width / 2)) / width;
      const w = (cy + height / 2 - gy) / height;
      if (u < 0 || u >= 1 || w < 0 || w >= 1) continue;
      let color = sample(u, w);
      if (!color) continue;
      const l = light(gx, gy, 0);
      if (l !== 1) color = scalePacked(color, l);
      const i = py * bw + px;
      bg[i] = shadow(gx, gy) ? mixPacked(color, bg[i], 0.5) : color;
    }
  }
}

/** Map a line of pixel-font text onto a ground rectangle in perspective. */
function paintGroundText(
  bg: Uint32Array,
  bw: number,
  bh: number,
  cam: Camera,
  text: string,
  cx: number,
  cy: number,
  width: number,
  height: number,
  color: number,
  shadow: (x: number, y: number) => number,
  light: Lighting,
) {
  const tw = text.length * 4 - 1;
  paintGround(
    bg,
    bw,
    bh,
    cam,
    cx,
    cy,
    width,
    height,
    (u, w) => {
      const tx = Math.floor(u * tw);
      const ch = Math.floor(tx / 4);
      const gxp = tx % 4;
      if (gxp === 3 || ch >= text.length) return 0;
      return glyphOn(text[ch], gxp, Math.floor(w * 5)) ? color : 0;
    },
    shadow,
    light,
  );
}

/** A Cribl mark painted on the ground, like a court logo. */
function paintGroundMark(
  bg: Uint32Array,
  bw: number,
  bh: number,
  cam: Camera,
  m: Mark,
  cx: number,
  cy: number,
  width: number,
  height: number,
  tones: number[],
  shadow: (x: number, y: number) => number,
  light: Lighting,
) {
  paintGround(
    bg,
    bw,
    bh,
    cam,
    cx,
    cy,
    width,
    height,
    (u, w) => {
      const t = markAt(m, u, w);
      return t ? tones[Math.min(tones.length, t) - 1] : 0;
    },
    shadow,
    light,
  );
}

const glyphOn = (ch: string, x: number, y: number) => glyphPixel(ch, x, y);

// ---------------------------------------------------------------------------
// Props

type Pt = [number, number];

/** Even-odd polygon fill into a packed buffer. */
export function fillPoly(buf: Uint32Array, bw: number, bh: number, pts: Pt[], c: number) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of pts) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(bh - 1, Math.ceil(maxY));
  const n = pts.length;
  const xs: number[] = [];
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    xs.length = 0;
    for (let a = 0, b = n - 1; a < n; b = a++) {
      const [ax, ay] = pts[a];
      const [bx, by] = pts[b];
      if (ay > py !== by > py) xs.push(ax + ((py - ay) * (bx - ax)) / (by - ay));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k] - 0.5));
      const xb = Math.min(bw - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = xa; x <= xb; x++) buf[y * bw + x] = c;
    }
  }
}

/** A lit box in world space: top, camera-facing front and one side. */
export function drawBox(
  buf: Uint32Array,
  bw: number,
  bh: number,
  cam: Camera,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  top: number,
  front: number,
  side: number,
) {
  const P = (x: number, y: number, z: number): Pt => {
    const p = cam.project(x, y, z);
    return [p.sx, p.sy];
  };
  // Side facing the camera (camera sits at x = 0).
  if (x0 > 0)
    fillPoly(buf, bw, bh, [P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1)], side);
  else if (x1 < 0)
    fillPoly(buf, bw, bh, [P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], side);
  fillPoly(buf, bw, bh, [P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)], front);
  fillPoly(buf, bw, bh, [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], top);
}

function paintProps(
  bg: Uint32Array,
  bw: number,
  bh: number,
  cam: Camera,
  v: VenueDef,
  light: (x: number, y: number, z: number) => number,
  shadow: (x: number, y: number) => number,
) {
  const xw = X_WALL();
  const yw = Y_WALL();
  const lit = (hex: string, x: number, y: number, z: number, k = 1) =>
    scalePacked(pack(hex), light(x, y, z) * k);
  const box = (
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    hex: string,
  ) => {
    const x = (x0 + x1) / 2;
    const y = (y0 + y1) / 2;
    const sh = shadow(x, y) ? 0.75 : 1;
    drawBox(
      bg,
      bw,
      bh,
      cam,
      x0,
      x1,
      y0,
      y1,
      z0,
      z1,
      lit(mix(hex, '#ffffff', 0.15), x, y, z1, sh),
      lit(hex, x, y, z1, sh * 0.9),
      lit(mix(hex, '#000000', 0.3), x, y, z1, sh),
    );
  };
  // Player benches on the left, split either side of the umpire.
  const chair = v.colors.chair;
  for (const y of [-2.6, 2.1]) {
    box(-xw + 0.25, -xw + 1.05, y, y + 1.6, 0, 0.45, chair);
    // Towel and bag.
    box(-xw + 0.35, -xw + 0.8, y + 0.2, y + 0.55, 0.45, 0.52, '#f4f4f0');
    box(-xw + 0.3, -xw + 0.95, y + 0.95, y + 1.45, 0.45, 0.72, y > 0 ? '#d8263a' : '#2352c4');
  }
  // Drinks cooler.
  box(-xw + 0.3, -xw + 0.8, -0.7, -0.2, 0, 0.5, '#e8e2d0');
  // TV cameras at the back corners.
  for (const sgn of [-1, 1]) {
    const x = sgn * (xw - 0.7);
    box(x - 0.25, x + 0.25, yw - 0.9, yw - 0.4, 0, 1.1, '#2a2a33');
    box(x - 0.3, x + 0.3, yw - 1.1, yw - 0.35, 1.1, 1.45, '#3a3a44');
  }
  if (v.magic) {
    // CriblCon's sword in the stone, courtside.
    const sx = 7.2;
    const sy = -6.4;
    box(sx - 0.55, sx + 0.55, sy - 0.36, sy + 0.36, 0, 0.3, '#5f6b78');
    box(sx - 0.36, sx + 0.3, sy - 0.26, sy + 0.2, 0.3, 0.5, '#7d8997');
    const seg = (x0: number, z0: number, x1: number, z1: number, hex: string, dx = 0) =>
      drawSeg(bg, bw, bh, cam, [sx + x0, sy, z0], [sx + x1, sy, z1], lit(hex, sx, sy, 1), dx);
    seg(0, 0.5, 0, 1.28, '#e6eef6');
    seg(0, 0.5, 0, 1.28, '#9aa8b8', 1);
    seg(-0.2, 1.3, 0.2, 1.3, '#e0a93a');
    seg(0, 1.32, 0, 1.52, '#6a4426');
    seg(0, 1.56, 0, 1.58, CRIBL.orange);
  }
}

/** A 1-px segment between two world points (`dx` shifts it sideways in pixels). */
function drawSeg(
  bg: Uint32Array,
  bw: number,
  bh: number,
  cam: Camera,
  a: [number, number, number],
  b: [number, number, number],
  c: number,
  dx = 0,
) {
  const pa = cam.project(a[0], a[1], a[2]);
  const pb = cam.project(b[0], b[1], b[2]);
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(pb.sx - pa.sx), Math.abs(pb.sy - pa.sy))));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(pa.sx + ((pb.sx - pa.sx) * i) / n) + dx;
    const y = Math.round(pa.sy + ((pb.sy - pa.sy) * i) / n);
    if (x >= 0 && y >= 0 && x < bw && y < bh) bg[y * bw + x] = c;
  }
}

// ---------------------------------------------------------------------------
// Seats

function layoutSeats(
  cam: Camera,
  v: VenueDef,
  rng: () => number,
  light: (x: number, y: number, z: number) => number,
  shadow: (x: number, y: number) => number,
): Seat[] {
  const seats: Seat[] = [];
  const xw = X_WALL();
  const yw = Y_WALL();
  const farHalf = FAR_HALF();
  const inAisle = (a: number) => ((a % AISLE_EVERY) + AISLE_EVERY) % AISLE_EVERY < AISLE_W + 0.15;
  const sunInShade = (x: number, y: number, z: number) => {
    if (!v.sun) return 1;
    // Crude: a stand seat is shaded if the sun comes from behind it.
    const s = v.sun;
    void z;
    if (Math.abs(x) > xw && Math.sign(x) === Math.sign(s.x)) return 0.72;
    if (y > yw && s.y > 0) return 0.72;
    return shadow(x, y) ? 0.72 : 1;
  };
  const push = (x: number, y: number, z: number, stand: StandId, row: number) => {
    if (rng() > v.crowd.density) return;
    const p = cam.project(x, y, z + 0.45);
    if (p.sx < -8 || p.sx > cam.W + 8 || p.sy < -2 || p.sy > cam.H + 14) return;
    seats.push({
      sx: p.sx,
      sy: p.sy,
      s: p.s,
      stand,
      row,
      x,
      y,
      light: light(x, y, z) * sunInShade(x, y, z),
      dist: Math.hypot(x - cam.pos.x, y - cam.pos.y, z + 0.9 - cam.pos.z),
    });
  };
  // Far stand: back rows first, so nearer rows overlap them.
  for (let k = FAR_ROWS - 1; k >= 0; k--) {
    const y = yw + (k + 0.62) * ROW_D;
    const z = zRow(k);
    for (let x = -farHalf; x <= farHalf; x += SEAT_W) {
      if (inAisle(x)) continue;
      // Corners belong to the side stands.
      if (Math.abs(x) > xw + (k + 1) * ROW_D && k < SIDE_ROWS) continue;
      push(x + (rng() - 0.5) * 0.08, y, z, 'far', k);
    }
  }
  // Side stands, outer rows first.
  for (let k = SIDE_ROWS - 1; k >= 0; k--) {
    const z = zRow(k);
    for (const sgn of [-1, 1]) {
      const x = sgn * (xw + (k + 0.62) * ROW_D);
      for (let y = yw + k * ROW_D - 0.4; y > -40; y -= SEAT_W) {
        if (inAisle(y)) continue;
        push(x, y + (rng() - 0.5) * 0.08, z, sgn < 0 ? 'left' : 'right', k);
      }
    }
  }
  // Paint order: farthest first.
  seats.sort((a, b) => b.dist - a.dist);
  return seats;
}

// ---------------------------------------------------------------------------
// Net

function buildNet(
  cam: Camera,
  v: VenueDef,
  light: (x: number, y: number, z: number) => number,
): NetSprite {
  const top = cam.project(0, 0, COURT.NET_POST + 0.12);
  const left = cam.project(-COURT.POST_X - 0.2, 0, 0);
  const right = cam.project(COURT.POST_X + 0.2, 0, 0);
  const x0 = Math.floor(left.sx) - 1;
  const x1 = Math.ceil(right.sx) + 1;
  const y0 = Math.floor(top.sy) - 2;
  const y1 = Math.ceil(left.sy) + 2;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const data = new Uint32Array(w * h);
  const l = light(0, 0, 1);
  const tape = scalePacked(pack('#f6f6f2'), l);
  const tapeShade = scalePacked(pack('#c8ccd4'), l);
  const mesh = scalePacked(pack(v.light === 'indoor' ? '#05050a' : '#1b1e26'), 1);
  const band = scalePacked(pack('#e8e8e4'), l);
  const post = scalePacked(pack(v.colors.post), Math.max(0.6, l));
  const postHi = scalePacked(pack(mix(v.colors.post, '#ffffff', 0.35)), Math.max(0.6, l));
  const set = (x: number, y: number, c: number) => {
    const xi = x - x0;
    const yi = y - y0;
    if (xi < 0 || yi < 0 || xi >= w || yi >= h) return;
    data[yi * w + xi] = c;
  };
  // Mesh + tape, column by column.
  for (let sx = x0; sx <= x1; sx++) {
    const gx = (sx + 0.5 - cam.cx) / (cam.F / cam.project(0, 0, 0).depth);
    if (Math.abs(gx) > COURT.POST_X) continue;
    const hTop = netHeightAt(gx);
    const pTop = cam.project(gx, 0, hTop);
    const pBot = cam.project(gx, 0, 0);
    const yt = Math.round(pTop.sy);
    const yb = Math.round(pBot.sy);
    for (let y = yt + 2; y < yb; y++) if ((sx + y) & 1) set(sx, y, mesh);
    set(sx, yb, mesh);
    set(sx, yt, tape);
    set(sx, yt + 1, tapeShade);
    // Center strap.
    if (Math.abs(gx) < 0.5 * (cam.project(0, 0, 0).depth / cam.F) + 0.02)
      for (let y = yt + 1; y < yb; y++) set(sx, y, band);
  }
  // Cribl on both ends of the net, the way sponsors dress real nets.
  const logo = scalePacked(pack('#f4f6f8'), Math.max(0.75, l));
  const logoMark = scalePacked(pack(CRIBL.teal), Math.max(0.75, l));
  for (const sgn of [-1, 1]) {
    const gx = sgn * (COURT.POST_X - 1.35);
    const pTop = cam.project(gx, 0, netHeightAt(gx));
    const pBot = cam.project(gx, 0, 0);
    const room = Math.round(pBot.sy) - Math.round(pTop.sy) - 3;
    if (room < 6) continue;
    const size = Math.min(9, room);
    const m = mark('cribl', size);
    const tw = textWidth('CRIBL');
    const left = Math.round(pTop.sx - (size + 2 + tw) / 2) - x0;
    const top = Math.round(pTop.sy) + 2 + Math.floor((room - size) / 2) - y0;
    drawMark(data, w, h, m, left, top, [logoMark, logoMark, logoMark]);
    drawTextPx(data, w, h, 'CRIBL', left + size + 2, top + Math.floor((size - 5) / 2), logo);
  }

  // Posts.
  for (const sgn of [-1, 1]) {
    const pb = cam.project(sgn * (COURT.POST_X + 0.05), 0, 0);
    const pt = cam.project(sgn * (COURT.POST_X + 0.05), 0, COURT.NET_POST + 0.06);
    const px = Math.round(pb.sx);
    for (let y = Math.round(pt.sy); y <= Math.round(pb.sy); y++) {
      set(px, y, post);
      set(px + sgn, y, postHi);
    }
    set(px, Math.round(pt.sy) - 1, postHi);
  }
  return { data, w, h, x: x0, y: y0 };
}
