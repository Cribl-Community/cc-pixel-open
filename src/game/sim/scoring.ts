/**
 * Tennis scoring as pure data: points → games → sets → match, with deuce and
 * advantage, 7-point tiebreaks, serve rotation, court halves and change of
 * ends. Also produces the chair umpire's calls.
 */

export type PlayerIdx = 0 | 1;

export type MatchFormat = 'short' | 'set' | 'bo3';

export interface FormatDef {
  id: MatchFormat;
  label: string;
  blurb: string;
  /** Games needed to win a set. */
  games: number;
  /** Sets needed to win the match. */
  sets: number;
}

export const FORMATS: Record<MatchFormat, FormatDef> = {
  short: {
    id: 'short',
    label: 'Short set',
    blurb: 'First to 4 games, tiebreak at 4-4',
    games: 4,
    sets: 1,
  },
  set: {
    id: 'set',
    label: 'One set',
    blurb: 'First to 6 games, tiebreak at 6-6',
    games: 6,
    sets: 1,
  },
  bo3: {
    id: 'bo3',
    label: 'Best of 3',
    blurb: 'Two sets to win, tiebreaks at 6-6',
    games: 6,
    sets: 2,
  },
};

export interface Score {
  format: MatchFormat;
  /** Completed sets: games won by each player. Tiebreak scores kept for display. */
  sets: { g: [number, number]; tb?: [number, number] }[];
  /** Games in the current set. */
  games: [number, number];
  /** Points in the current game (raw counts; also tiebreak points). */
  points: [number, number];
  tiebreak: boolean;
  /** Who serves the current point. */
  server: PlayerIdx;
  /** Who served first in the current tiebreak. */
  tbFirstServer: PlayerIdx;
  winner: PlayerIdx | null;
  /** Total points played (for stats). */
  played: number;
}

export function newScore(format: MatchFormat, firstServer: PlayerIdx): Score {
  return {
    format,
    sets: [],
    games: [0, 0],
    points: [0, 0],
    tiebreak: false,
    server: firstServer,
    tbFirstServer: firstServer,
    winner: null,
    played: 0,
  };
}

const other = (p: PlayerIdx): PlayerIdx => (p === 0 ? 1 : 0);

export function setsWon(s: Score): [number, number] {
  const w: [number, number] = [0, 0];
  for (const set of s.sets) w[set.g[0] > set.g[1] ? 0 : 1]++;
  return w;
}

/** Which half of the court the next point is served from. */
export function courtHalf(s: Score): 'deuce' | 'ad' {
  const n = s.points[0] + s.points[1];
  return n % 2 === 0 ? 'deuce' : 'ad';
}

export type PointOutcome = {
  /** Game won by this player on this point. */
  game: PlayerIdx | null;
  /** Set won on this point. */
  set: PlayerIdx | null;
  match: PlayerIdx | null;
  /** The server lost the game. */
  breakOfServe: boolean;
  /** Players should change ends after this point. */
  changeEnds: boolean;
};

/** Apply a won point. Mutates and returns what it completed. */
export function awardPoint(s: Score, p: PlayerIdx): PointOutcome {
  const fmt = FORMATS[s.format];
  const out: PointOutcome = {
    game: null,
    set: null,
    match: null,
    breakOfServe: false,
    changeEnds: false,
  };
  if (s.winner !== null) return out;
  s.played++;
  s.points[p]++;
  const [a, b] = s.points;
  if (s.tiebreak) {
    const n = a + b;
    // Serve rotates after the first point, then every two points.
    if (n % 2 === 1) s.server = other(s.server);
    if (n % 6 === 0) out.changeEnds = true;
    if ((a >= 7 || b >= 7) && Math.abs(a - b) >= 2) {
      const tb: [number, number] = [a, b];
      s.games[p]++;
      out.game = p;
      winSet(s, p, tb, out);
      // The player who received first in the tiebreak serves the next set.
      s.server = other(s.tbFirstServer);
    }
    return out;
  }
  const won = (a >= 4 || b >= 4) && Math.abs(a - b) >= 2;
  if (!won) return out;
  out.game = p;
  out.breakOfServe = p !== s.server;
  s.points = [0, 0];
  s.games[p]++;
  const [ga, gb] = s.games;
  const total = ga + gb;
  if ((ga >= fmt.games || gb >= fmt.games) && Math.abs(ga - gb) >= 2) {
    winSet(s, p, undefined, out);
  } else if (ga === fmt.games && gb === fmt.games) {
    s.tiebreak = true;
    s.tbFirstServer = other(s.server);
  }
  s.server = other(s.server);
  if (out.set === null && total % 2 === 1) out.changeEnds = true;
  return out;
}

function winSet(s: Score, p: PlayerIdx, tb: [number, number] | undefined, out: PointOutcome) {
  const fmt = FORMATS[s.format];
  const games = s.games[0] + s.games[1];
  s.sets.push({ g: [s.games[0], s.games[1]], tb });
  s.games = [0, 0];
  s.points = [0, 0];
  s.tiebreak = false;
  out.set = p;
  // Ends change at the start of a new set if the set had an odd number of games.
  out.changeEnds = games % 2 === 1;
  if (setsWon(s)[p] >= fmt.sets) {
    s.winner = p;
    out.match = p;
  }
}

// ---------------------------------------------------------------------------
// Situations

export interface Situation {
  breakPoint: boolean;
  setPoint: PlayerIdx | null;
  matchPoint: PlayerIdx | null;
  gamePoint: PlayerIdx | null;
  deuce: boolean;
}

/** Would winning the next point win the game (or tiebreak) for p? */
function winsGameNext(s: Score, p: PlayerIdx): boolean {
  const pts = [...s.points] as [number, number];
  pts[p]++;
  const [a, b] = pts;
  if (s.tiebreak) return (a >= 7 || b >= 7) && Math.abs(a - b) >= 2;
  return (a >= 4 || b >= 4) && Math.abs(a - b) >= 2;
}

function winsSetNext(s: Score, p: PlayerIdx): boolean {
  if (!winsGameNext(s, p)) return false;
  if (s.tiebreak) return true;
  const fmt = FORMATS[s.format];
  const g = [...s.games] as [number, number];
  g[p]++;
  return (g[0] >= fmt.games || g[1] >= fmt.games) && Math.abs(g[0] - g[1]) >= 2;
}

export function situation(s: Score): Situation {
  const out: Situation = {
    breakPoint: false,
    setPoint: null,
    matchPoint: null,
    gamePoint: null,
    deuce: false,
  };
  if (s.winner !== null) return out;
  const fmt = FORMATS[s.format];
  for (const p of [0, 1] as PlayerIdx[]) {
    if (!winsGameNext(s, p)) continue;
    out.gamePoint = p;
    if (!s.tiebreak && p !== s.server) out.breakPoint = true;
    if (winsSetNext(s, p)) {
      out.setPoint = p;
      if (setsWon(s)[p] + 1 >= fmt.sets) out.matchPoint = p;
    }
  }
  const [a, b] = s.points;
  out.deuce = !s.tiebreak && a >= 3 && a === b;
  return out;
}

/** 0 = routine … 1 = match point. Feeds the pressure meter and the crowd. */
export function pressureOf(s: Score): number {
  const sit = situation(s);
  let p = 0.08;
  if (sit.deuce) p = 0.35;
  if (sit.gamePoint !== null) p = Math.max(p, 0.3);
  if (sit.breakPoint) p = Math.max(p, 0.55);
  if (s.tiebreak) p = Math.max(p, 0.5 + 0.03 * (s.points[0] + s.points[1]));
  if (sit.setPoint !== null) p = Math.max(p, 0.75);
  if (sit.matchPoint !== null) p = 1;
  return Math.min(1, p);
}

// ---------------------------------------------------------------------------
// Display & calls

const CALL = ['Love', 'Fifteen', 'Thirty', 'Forty'];
const SHORT = ['0', '15', '30', '40'];

/** Points column for the scoreboard, per player. */
export function pointLabels(s: Score): [string, string] {
  const [a, b] = s.points;
  if (s.tiebreak) return [String(a), String(b)];
  if (a >= 3 && b >= 3) {
    if (a === b) return ['40', '40'];
    return a > b ? ['AD', ''] : ['', 'AD'];
  }
  return [SHORT[Math.min(a, 3)], SHORT[Math.min(b, 3)]];
}

/** The umpire's call after a point (before any game/set call). */
export function pointCall(s: Score, names: [string, string]): string {
  const [a, b] = s.points;
  if (s.tiebreak) {
    if (a === b) return `${a} all`;
    const leader = a > b ? 0 : 1;
    return `${Math.max(a, b)} ${Math.min(a, b) || 'zero'}, ${names[leader]}`;
  }
  if (a === 0 && b === 0) return '';
  if (a >= 3 && b >= 3) {
    if (a === b) return 'Deuce';
    return `Advantage ${a > b ? names[0] : names[1]}`;
  }
  // Server's score first.
  const sv = s.server;
  const sp = s.points[sv];
  const rp = s.points[other(sv)];
  if (sp === rp) return `${CALL[sp]} all`;
  return `${CALL[sp]} ${CALL[rp]}`;
}

const ORD = ['first', 'second', 'third'];

/** Call after a game or set is won (s already updated). */
export function gameCall(s: Score, out: PointOutcome, names: [string, string]): string {
  if (out.match !== null) return `Game, set and match, ${names[out.match]}`;
  if (out.set !== null) {
    const setNo = s.sets.length;
    const last = s.sets[setNo - 1];
    const w = out.set;
    return `Game and ${ORD[setNo - 1] ?? 'the'} set, ${names[w]}, ${last.g[w]} games to ${last.g[other(w)]}`;
  }
  if (out.game === null) return '';
  const [ga, gb] = s.games;
  const lead = ga === gb ? null : ga > gb ? 0 : 1;
  let tail: string;
  if (lead === null) tail = `${ga} games all`;
  else tail = `${names[lead]} leads ${Math.max(ga, gb)} games to ${Math.min(ga, gb)}`;
  if (s.tiebreak) tail = `${ga} games all. Tiebreak`;
  return `Game ${names[out.game]}. ${tail}`;
}

/** Final score line from the winner's perspective, e.g. "6-4 3-6 7-6(5)". */
export function scoreLine(s: Score, perspective: PlayerIdx): string {
  const o = other(perspective);
  return s.sets
    .map((set) => {
      const base = `${set.g[perspective]}-${set.g[o]}`;
      return set.tb ? `${base}(${Math.min(set.tb[0], set.tb[1])})` : base;
    })
    .join(' ');
}
