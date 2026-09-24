/**
 * App state: which screen is up, settings, the last match setup, World Tour
 * progress and career records. Settings, setup, tour and records persist to
 * the Cribl app KV store (see kvStorage).
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { MatchFormat } from '../sim/scoring';
import { ROSTER } from '../sim/roster';
import { VENUE_ORDER, type VenueId } from '../sim/venues';
import { kvStorage } from './kvStorage';

export type Phase = 'title' | 'setup' | 'tour' | 'match';
export type Difficulty = 'rookie' | 'pro' | 'legend';
export type GameSpeed = 'relaxed' | 'normal' | 'real';
/** auto = auto-run to the ball; move = a nudge while a shot is loaded; off = all manual. */
export type Assist = 'auto' | 'move' | 'off';

export const DIFFICULTY: Record<Difficulty, { label: string; skill: number; blurb: string }> = {
  rookie: {
    label: 'Rookie',
    skill: 0.1,
    blurb: 'Friendly. Soft serves, slow feet, lots of errors.',
  },
  pro: { label: 'Pro', skill: 0.36, blurb: 'Steady club star. Will punish a short ball.' },
  legend: { label: 'Legend', skill: 0.64, blurb: 'The real test. Most balls come back.' },
};

/** Time scale applied to the whole simulation. Physics stay real either way. */
export const SPEEDS: Record<GameSpeed, { label: string; scale: number }> = {
  relaxed: { label: 'Relaxed', scale: 0.62 },
  normal: { label: 'Normal', scale: 0.78 },
  real: { label: 'Real time', scale: 1 },
};

export interface Settings {
  volume: number;
  muted: boolean;
  /** Chair umpire and line calls (speech synthesis). */
  voice: boolean;
  music: boolean;
  speed: GameSpeed;
  assist: Assist;
  /** Goat mode: players, ball kids, umpire and crowd are Cribl goats. */
  goats: boolean;
}

/** Sound starts off; players opt in from the title screen or with M. Goats are on. */
export const DEFAULT_SETTINGS: Settings = {
  volume: 0.8,
  muted: true,
  voice: true,
  music: true,
  speed: 'normal',
  assist: 'auto',
  goats: true,
};

export interface MatchSetup {
  playerId: string;
  opponentId: string;
  venueId: VenueId;
  format: MatchFormat;
  difficulty: Difficulty;
  /** 0..1 AI skill (derived from difficulty, or from tour progress). */
  skill: number;
  tour?: { stop: number; round: number };
}

export interface TourState {
  active: boolean;
  playerId: string;
  stop: number;
  round: number;
  /** Opponent ids for every stop/round, drawn when the tour starts. */
  draw: string[][];
  trophies: Partial<Record<VenueId, number>>;
  completed: number;
}

export interface Records {
  played: number;
  won: number;
  aces: number;
  winners: number;
  fastestServe: number;
  longestRally: number;
  bestStyle: number;
  titles: number;
}

export interface MatchSummary {
  won: boolean;
  aces: number;
  winners: number;
  fastestServe: number;
  longestRally: number;
  style: number;
}

export const ROUND_NAMES = ['Quarterfinal', 'Semifinal', 'Final'];

interface GameState {
  hydrated: boolean;
  phase: Phase;
  settings: Settings;
  setup: MatchSetup;
  match: MatchSetup | null;
  /** Bumped to restart the current match. */
  matchKey: number;
  tour: TourState;
  records: Records;
  setPhase: (p: Phase) => void;
  updateSettings: (s: Partial<Settings>) => void;
  updateSetup: (s: Partial<MatchSetup>) => void;
  startMatch: (m: MatchSetup) => void;
  rematch: () => void;
  recordMatch: (s: MatchSummary) => void;
  startTour: (playerId: string) => void;
  tourMatch: () => MatchSetup | null;
  abandonTour: () => void;
}

const EMPTY_RECORDS: Records = {
  played: 0,
  won: 0,
  aces: 0,
  winners: 0,
  fastestServe: 0,
  longestRally: 0,
  bestStyle: 0,
  titles: 0,
};

function drawTour(playerId: string): string[][] {
  const pool = ROSTER.filter((p) => p.id !== playerId).map((p) => p.id);
  const out: string[][] = [];
  for (let s = 0; s < VENUE_ORDER.length; s++) {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    out.push(shuffled.slice(0, 3));
  }
  return out;
}

export const tourSkill = (stop: number, round: number) =>
  Math.min(0.66, 0.08 + stop * 0.11 + round * 0.04);

export const useGame = create<GameState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      phase: 'title',
      settings: DEFAULT_SETTINGS,
      setup: {
        playerId: ROSTER[0].id,
        opponentId: ROSTER[1].id,
        venueId: 'criblcon',
        format: 'short',
        difficulty: 'pro',
        skill: DIFFICULTY.pro.skill,
      },
      match: null,
      matchKey: 0,
      tour: {
        active: false,
        playerId: ROSTER[0].id,
        stop: 0,
        round: 0,
        draw: [],
        trophies: {},
        completed: 0,
      },
      records: EMPTY_RECORDS,

      setPhase: (phase) => set({ phase }),
      updateSettings: (s) => set({ settings: { ...get().settings, ...s } }),
      updateSetup: (s) => set({ setup: { ...get().setup, ...s } }),
      startMatch: (m) => set({ match: m, phase: 'match', matchKey: get().matchKey + 1 }),
      rematch: () => set({ matchKey: get().matchKey + 1 }),

      recordMatch: (s) => {
        const { records, tour, match } = get();
        const next: Records = {
          played: records.played + 1,
          won: records.won + (s.won ? 1 : 0),
          aces: records.aces + s.aces,
          winners: records.winners + s.winners,
          fastestServe: Math.max(records.fastestServe, s.fastestServe),
          longestRally: Math.max(records.longestRally, s.longestRally),
          bestStyle: Math.max(records.bestStyle, s.style),
          titles: records.titles,
        };
        let t = tour;
        if (match?.tour && tour.active) {
          const { stop, round } = match.tour;
          if (s.won) {
            if (round >= 2) {
              const venue = VENUE_ORDER[stop];
              t = {
                ...tour,
                trophies: { ...tour.trophies, [venue]: (tour.trophies[venue] ?? 0) + 1 },
                stop: stop + 1,
                round: 0,
              };
              next.titles++;
              if (stop + 1 >= VENUE_ORDER.length)
                t = { ...t, active: false, completed: tour.completed + 1 };
            } else {
              t = { ...tour, round: round + 1 };
            }
          }
        }
        set({ records: next, tour: t });
      },

      startTour: (playerId) =>
        set({
          tour: {
            ...get().tour,
            active: true,
            playerId,
            stop: 0,
            round: 0,
            draw: drawTour(playerId),
          },
          phase: 'tour',
        }),

      tourMatch: () => {
        const { tour, setup } = get();
        if (!tour.active) return null;
        const venueId = VENUE_ORDER[tour.stop];
        const opp = tour.draw[tour.stop]?.[tour.round] ?? ROSTER[1].id;
        return {
          playerId: tour.playerId,
          opponentId: opp,
          venueId,
          format: setup.format,
          difficulty: setup.difficulty,
          skill: tourSkill(tour.stop, tour.round),
          tour: { stop: tour.stop, round: tour.round },
        };
      },

      abandonTour: () => set({ tour: { ...get().tour, active: false } }),
    }),
    {
      name: 'pixel-open-v1',
      version: 2,
      // v2: auto-run became the default assist ("full" auto-swing was retired).
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as { settings?: Partial<Settings> };
        if (version < 2 && p.settings) p.settings = { ...p.settings, assist: 'auto' };
        return p as unknown as GameState;
      },
      storage: createJSONStorage(kvStorage),
      skipHydration: true,
      partialize: (s) => ({
        settings: s.settings,
        setup: s.setup,
        tour: s.tour,
        records: s.records,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<GameState>;
        return {
          ...current,
          ...p,
          settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
          records: { ...EMPTY_RECORDS, ...(p.records ?? {}) },
        };
      },
    },
  ),
);
