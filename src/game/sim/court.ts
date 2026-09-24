/**
 * Regulation court geometry (ITF), in meters. The net runs along y = 0; the
 * near end (the human player's end) is y < 0.
 */

export const COURT = {
  /** Net to baseline. */
  L: 11.885,
  /** Center line to singles sideline. */
  SW: 4.115,
  /** Center line to doubles sideline. */
  DW: 5.485,
  /** Net to service line. */
  SV: 6.4,
  /** Net posts stand 0.914 m outside the doubles sidelines. */
  POST_X: 6.4,
  NET_CENTER: 0.914,
  NET_POST: 1.07,
  BALL_R: 0.0335,
} as const;

/** Net height across the court: the cord sags toward the center strap. */
export function netHeightAt(x: number): number {
  const t = Math.min(1, Math.abs(x) / COURT.POST_X);
  return COURT.NET_CENTER + (COURT.NET_POST - COURT.NET_CENTER) * t * t;
}

/** 0 = near end (y < 0), 1 = far end (y > 0). */
export type Side = 0 | 1;
export const sideOfY = (y: number): Side => (y < 0 ? 0 : 1);
export const otherSide = (s: Side): Side => (s === 0 ? 1 : 0);
/** World-y direction a player on this side faces when looking at the net. */
export const forwardSign = (s: Side) => (s === 0 ? 1 : -1);
/** World-x sign of this player's right-hand side. */
export const rightSign = (s: Side) => (s === 0 ? 1 : -1);
export const baselineY = (s: Side) => (s === 0 ? -COURT.L : COURT.L);
/** World yaw of a player on this side facing the net. */
export const facingYaw = (s: Side) => (s === 0 ? 0 : Math.PI);

export type CourtHalf = 'deuce' | 'ad';

/** World-x sign of a court half for a player at that end. */
export const halfSign = (s: Side, half: CourtHalf) => (half === 'deuce' ? 1 : -1) * rightSign(s);

export interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** The service box a serve must land in, on the receiver's side. */
export function serviceBox(receiver: Side, half: CourtHalf): Rect {
  const sx = halfSign(receiver, half);
  const [x0, x1] = sx > 0 ? [0, COURT.SW] : [-COURT.SW, 0];
  const [y0, y1] = receiver === 1 ? [0, COURT.SV] : [-COURT.SV, 0];
  return { x0, x1, y0, y1 };
}

/** Balls touching a line are in, so the ball radius counts as tolerance. */
export function inRect(r: Rect, x: number, y: number, tol: number = COURT.BALL_R) {
  return x >= r.x0 - tol && x <= r.x1 + tol && y >= r.y0 - tol && y <= r.y1 + tol;
}

export function singlesHalf(side: Side): Rect {
  return side === 1
    ? { x0: -COURT.SW, x1: COURT.SW, y0: 0, y1: COURT.L }
    : { x0: -COURT.SW, x1: COURT.SW, y0: -COURT.L, y1: 0 };
}

/**
 * How far outside the nearest line a bounce landed (negative = inside by that
 * much). Used for close-call replays and line-judge timing.
 */
export function lineMargin(r: Rect, x: number, y: number): number {
  const dx = Math.max(r.x0 - x, x - r.x1);
  const dy = Math.max(r.y0 - y, y - r.y1);
  if (dx <= 0 && dy <= 0) return Math.max(dx, dy);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
}

/** Where the arena walls stand. Everything a ball can reach lives inside. */
export const ARENA = {
  /** Baseline to the back wall. */
  backRun: 6.2,
  /** Doubles sideline to the side wall. */
  sideRun: 2.9,
  get yWall() {
    return COURT.L + this.backRun;
  },
  get xWall() {
    return COURT.DW + this.sideRun;
  },
};
