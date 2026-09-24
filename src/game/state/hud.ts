/**
 * Live match HUD state, written by the match controller and read by the
 * React overlay (scoreboard, meters, callouts, results).
 */

import { create } from 'zustand';
import type { Phase, PlayerStats } from '../sim/match';
import type { CountryCode } from '../sim/roster';

export interface Callout {
  id: number;
  text: string;
  tone: 'good' | 'bad' | 'info' | 'big';
}

export interface StyleToast {
  id: number;
  amount: number;
  label: string;
}

export interface MatchResult {
  winner: 0 | 1;
  humanWon: boolean;
  scoreLine: string;
  stats: [PlayerStats, PlayerStats];
  style: number;
  longestRally: number;
}

export interface HudState {
  active: boolean;
  names: [string, string];
  countries: [CountryCode, CountryCode];
  colors: [string, string];
  human: 0 | 1 | -1;
  sets: { g: [number, number]; tb?: [number, number] }[];
  games: [number, number];
  points: [string, string];
  server: 0 | 1;
  tiebreak: boolean;
  pressure: number;
  style: number;
  sprint: number;
  phase: Phase;
  serveKmh: number | null;
  /** Bumped on every serve so the popup re-animates. */
  serveId: number;
  callouts: Callout[];
  toasts: StyleToast[];
  paused: boolean;
  changeover: boolean;
  result: MatchResult | null;
  hint: string | null;
  set: (s: Partial<HudState>) => void;
}

export const useHud = create<HudState>()((set) => ({
  active: false,
  names: ['', ''],
  countries: ['JPN', 'GER'],
  colors: ['#ffffff', '#ffffff'],
  human: 0,
  sets: [],
  games: [0, 0],
  points: ['0', '0'],
  server: 0,
  tiebreak: false,
  pressure: 0,
  style: 0,
  sprint: 1,
  phase: 'intro',
  serveKmh: null,
  serveId: 0,
  callouts: [],
  toasts: [],
  paused: false,
  changeover: false,
  result: null,
  hint: null,
  set: (s) => set(s),
}));
