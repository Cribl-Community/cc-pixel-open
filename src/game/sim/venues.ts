/**
 * The six stadiums on the tour, dressed in Cribl colors. Each one is data:
 * surface, light, palette, crowd make-up, boards and ambience. The stadium
 * painter and the crowd generator build everything else from this.
 *
 * Five tournaments are presented by a Cribl product; the tour finale is
 * CriblCon 26 in Chicago.
 */

import type { MarkId } from '../art/cribl';
import type { SurfaceId } from './surfaces';

export type VenueId = 'harbour' | 'clay' | 'lawn' | 'empire' | 'neon' | 'criblcon';
export type Light = 'day' | 'dusk' | 'night' | 'indoor';
export type Ambience = 'harbour' | 'garden' | 'lawn' | 'city' | 'dome';

/** One sponsor board: a Cribl mark and a line of text on a colored panel. */
export interface BoardDef {
  text: string;
  /** Used when the full text doesn't fit the panel. */
  short?: string;
  mark?: MarkId;
  /** Panel color (painted boards only; LED boards are dark). */
  bg: string;
  fg: string;
  /** Mark color (defaults to the text color). */
  markColor?: string;
}

export interface VenueDef {
  id: VenueId;
  name: string;
  event: string;
  city: string;
  blurb: string;
  surface: SurfaceId;
  light: Light;
  /** Direction toward the sun (world), for shadows. Null = overhead floodlights. */
  sun: { x: number; y: number; z: number } | null;
  colors: {
    court: string;
    apron: string;
    line: string;
    wall: string;
    wallTop: string;
    boardText: string;
    seats: [string, string];
    riser: string;
    stair: string;
    upper: string;
    chair: string;
    post: string;
    shade: string;
  };
  crowd: {
    density: number;
    shirts: string[];
    hats: number;
    hatColors: string[];
    flags: number;
    phones: number;
    umbrellas: number;
    /** Share of spectators in dark/formal clothes. */
    formal: number;
  };
  kids: { top: string; bottom: string };
  ambience: Ambience;
  reverb: number;
  /** Far-wall boards; LED venues cycle through them. */
  boards: BoardDef[];
  /** Scrolling LED messages mixed into the cycle. */
  ticker: string[];
  /** LED boards animate (night/indoor). */
  led: boolean;
  /** Lettering on the apron behind the far baseline. */
  logo: string;
  /** Lettering behind the near baseline. */
  apronText: string;
  /** The Cribl product presenting the event (court decals). */
  product: MarkId;
  /** CriblCon: sparks in the air and a sword in a stone. */
  magic?: boolean;
}

/** Brand colors, repeated here so this module stays free of the art code. */
const C = {
  navy: '#020e1b',
  navy2: '#021a35',
  blueDeep: '#032836',
  teal800: '#062b38',
  teal700: '#083b44',
  teal600: '#0a4e5b',
  teal500: '#118285',
  teal: '#00cccc',
  cyan: '#00ffff',
  tealLight: '#99edeb',
  mint: '#9dffbd',
  blue: '#086cd9',
  blue500: '#0c55a5',
  purple: '#5959ff',
  lavender: '#a5a3ff',
  indigo: '#2d389a',
  orange: '#ff8b00',
  slate: '#3b4e63',
  cream: '#fcfaf8',
  white: '#ffffff',
};

/** Shirts in the stands: plenty of Cribl swag. */
const SWAG = [C.teal, C.navy, C.orange, C.purple, C.cream, C.mint];

/** The hype that runs on every LED board. */
const APPS_TICKER = [
  'THIS GAME IS A CRIBL APP',
  'NPX @CRIBL/APPS CREATE',
  'IDEA TO APP IN HOURS',
  'PROMPT IT. SHIP IT. PLAY IT.',
];

export const VENUES: Record<VenueId, VenueDef> = {
  harbour: {
    id: 'harbour',
    name: 'Harbour Park',
    event: 'Stream Slam',
    city: 'Harbour City',
    blurb: 'Cribl-blue hard court in the midday sun. A medium-paced, true bounce.',
    surface: 'hard',
    light: 'day',
    sun: { x: -0.35, y: -0.55, z: 0.76 },
    colors: {
      court: C.blue500,
      apron: C.blue,
      line: '#f6f8fb',
      wall: C.navy2,
      wallTop: C.teal,
      boardText: C.white,
      seats: [C.teal500, C.teal600],
      riser: C.teal800,
      stair: '#99a6b4',
      upper: C.blueDeep,
      chair: C.navy2,
      post: C.navy2,
      shade: '#031c3a',
    },
    crowd: {
      density: 0.93,
      shirts: [...SWAG, C.white, '#f2d027', '#78b8e8', '#f28fb6', C.blue],
      hats: 0.34,
      hatColors: [C.cream, C.teal, C.orange, C.navy, '#f2e6c9'],
      flags: 0.035,
      phones: 0.01,
      umbrellas: 0.025,
      formal: 0.05,
    },
    kids: { top: C.teal, bottom: C.cream },
    ambience: 'harbour',
    reverb: 0.22,
    boards: [
      { text: 'STREAM', mark: 'stream', bg: C.navy, fg: C.white, markColor: C.teal },
      { text: 'CRIBL APPS', short: 'APPS', mark: 'goat', bg: C.teal, fg: C.navy },
      { text: 'CRIBL.IO', mark: 'cribl', bg: C.cream, fg: C.navy, markColor: C.teal500 },
      { text: 'BUILD YOURS', short: 'BUILD!', bg: C.orange, fg: C.navy },
    ],
    ticker: APPS_TICKER,
    led: false,
    logo: 'STREAM SLAM',
    apronText: 'BUILT WITH CRIBL APPS',
    product: 'stream',
  },
  clay: {
    id: 'clay',
    name: 'Terre Rouge',
    event: 'Edge Masters',
    city: 'Paris',
    blurb: 'Crushed red brick in a teal bowl. Slow, high bounces, long rallies and sliding.',
    surface: 'clay',
    light: 'dusk',
    sun: { x: -0.62, y: 0.42, z: 0.42 },
    colors: {
      court: '#c8653d',
      apron: '#c05d36',
      line: '#f2ede2',
      wall: C.teal700,
      wallTop: C.teal,
      boardText: C.cream,
      seats: ['#b85a3a', C.teal600],
      riser: C.teal800,
      stair: '#a89a8a',
      upper: '#04222a',
      chair: C.teal700,
      post: C.teal800,
      shade: '#4a1e14',
    },
    crowd: {
      density: 0.9,
      shirts: [...SWAG, '#f4f4f0', '#e8dcc0', '#24337a', '#8a8f9a', '#d9c9a3'],
      hats: 0.3,
      hatColors: ['#e8d9a8', '#f4f4f0', C.teal, C.navy],
      flags: 0.02,
      phones: 0.01,
      umbrellas: 0.01,
      formal: 0.2,
    },
    kids: { top: C.teal600, bottom: C.cream },
    ambience: 'garden',
    reverb: 0.25,
    boards: [
      { text: 'EDGE', mark: 'edge', bg: C.teal600, fg: C.white, markColor: C.teal },
      { text: 'CRIBL APPS', short: 'APPS', mark: 'goat', bg: C.navy, fg: C.teal },
      { text: 'CRIBL.IO', mark: 'cribl', bg: C.teal, fg: C.navy },
      { text: 'GAME SET APP', short: 'SET APP', bg: C.cream, fg: C.navy },
    ],
    ticker: APPS_TICKER,
    led: false,
    logo: 'EDGE MASTERS',
    apronText: 'BUILT WITH CRIBL APPS',
    product: 'edge',
  },
  lawn: {
    id: 'lawn',
    name: 'Royal Lawn',
    event: 'Lake Championships',
    city: 'London',
    blurb: 'Fast, low and slick. Worn baselines, whites only, purple and teal.',
    surface: 'grass',
    light: 'day',
    sun: { x: 0.45, y: 0.35, z: 0.82 },
    colors: {
      court: '#4f9a3a',
      apron: '#478f34',
      line: '#fbfbf6',
      wall: C.teal800,
      wallTop: C.purple,
      boardText: C.cream,
      seats: [C.teal600, C.teal700],
      riser: '#041c24',
      stair: '#8a8f86',
      upper: '#03161c',
      chair: C.indigo,
      post: C.teal800,
      shade: '#1c3a14',
    },
    crowd: {
      density: 0.97,
      shirts: [...SWAG, '#f4f4f0', '#1c2a55', '#e8dcc0', '#b8d8f0', C.lavender],
      hats: 0.3,
      hatColors: ['#e8d9a8', '#f4f4f0', C.purple, C.navy],
      flags: 0.015,
      phones: 0.01,
      umbrellas: 0.015,
      formal: 0.3,
    },
    kids: { top: C.indigo, bottom: C.indigo },
    ambience: 'lawn',
    reverb: 0.2,
    boards: [
      { text: 'LAKE', mark: 'lake', bg: C.purple, fg: C.white },
      { text: 'CRIBL APPS', short: 'APPS', mark: 'goat', bg: C.teal800, fg: C.mint },
      { text: 'CRIBL.IO', mark: 'cribl', bg: C.cream, fg: C.indigo, markColor: C.purple },
      { text: 'NO LOCK-IN', short: 'NO LOCK', bg: C.teal600, fg: C.cream },
    ],
    ticker: APPS_TICKER,
    led: false,
    logo: 'CRIBL LAKE',
    apronText: 'BUILT WITH CRIBL APPS',
    product: 'lake',
  },
  empire: {
    id: 'empire',
    name: 'Empire Arena',
    event: 'Search Nights',
    city: 'Empire City',
    blurb: 'Cribl-blue court, teal surround, loud crowd under the floodlights.',
    surface: 'hard',
    light: 'night',
    sun: null,
    colors: {
      court: C.blue500,
      apron: C.teal600,
      line: '#f8f8f4',
      wall: C.navy,
      wallTop: C.teal,
      boardText: C.cyan,
      seats: [C.blue500, '#0a3f7a'],
      riser: C.navy2,
      stair: '#4a5468',
      upper: '#01070e',
      chair: C.teal600,
      post: C.navy,
      shade: '#010a14',
    },
    crowd: {
      density: 0.96,
      shirts: [...SWAG, '#f4f4f0', '#1a1a22', '#f2d027', C.blue, C.lavender],
      hats: 0.22,
      hatColors: [C.navy, C.teal, C.orange, '#f4f4f0'],
      flags: 0.03,
      phones: 0.06,
      umbrellas: 0,
      formal: 0.1,
    },
    kids: { top: C.teal600, bottom: C.navy },
    ambience: 'city',
    reverb: 0.32,
    boards: [
      { text: 'SEARCH', mark: 'search', bg: C.navy, fg: C.cyan },
      { text: 'CRIBL APPS', short: 'APPS', mark: 'goat', bg: C.navy, fg: C.teal },
      { text: 'CRIBL.IO', mark: 'cribl', bg: C.navy, fg: C.white, markColor: C.teal },
      { text: 'NOW IN PREVIEW', short: 'PREVIEW', bg: C.navy, fg: C.orange },
      { text: 'GOAT MODE', mark: 'goat', bg: C.navy, fg: C.mint },
    ],
    ticker: APPS_TICKER,
    led: true,
    logo: 'CRIBL SEARCH',
    apronText: 'BUILT WITH CRIBL APPS',
    product: 'search',
  },
  neon: {
    id: 'neon',
    name: 'Neon Dome',
    event: 'Insights Finals',
    city: 'Indoor',
    blurb: 'Indoor finals under violet spotlights. Quick, low and very loud.',
    surface: 'indoor',
    light: 'indoor',
    sun: null,
    colors: {
      court: C.indigo,
      apron: C.navy2,
      line: '#f0f4ff',
      wall: '#01060c',
      wallTop: C.purple,
      boardText: C.cyan,
      seats: ['#1c2358', '#161c48'],
      riser: '#070b1c',
      stair: '#2e2a44',
      upper: '#02040a',
      chair: C.indigo,
      post: '#01060c',
      shade: '#02030a',
    },
    crowd: {
      density: 0.95,
      shirts: [...SWAG, '#1a1a22', C.lavender, C.cyan, C.blue],
      hats: 0.15,
      hatColors: ['#1a1a22', C.purple, C.cyan],
      flags: 0.02,
      phones: 0.1,
      umbrellas: 0,
      formal: 0.2,
    },
    kids: { top: C.purple, bottom: C.navy },
    ambience: 'dome',
    reverb: 0.45,
    boards: [
      { text: 'INSIGHTS', mark: 'insights', bg: C.navy, fg: C.lavender },
      { text: 'CRIBL APPS', short: 'APPS', mark: 'goat', bg: C.navy, fg: C.cyan },
      { text: 'CRIBL.IO', mark: 'cribl', bg: C.navy, fg: C.teal },
      { text: 'GOAT MODE', mark: 'goat', bg: C.navy, fg: C.orange },
      { text: 'GAME SET APP', short: 'SET APP', bg: C.navy, fg: C.white },
    ],
    ticker: APPS_TICKER,
    led: true,
    logo: 'INSIGHTS FINALS',
    apronText: 'BUILT WITH CRIBL APPS',
    product: 'insights',
  },
  criblcon: {
    id: 'criblcon',
    name: 'CriblCon Court',
    event: 'CriblCon 26',
    city: 'Chicago',
    blurb:
      'Magic in the Making: Chicago, Sep 28–30. A teal court, goats in hoodies, sparks in the air and a sword in a stone.',
    surface: 'hard',
    light: 'night',
    sun: null,
    colors: {
      court: '#0e7a80',
      apron: C.teal800,
      line: '#f2fbfb',
      wall: C.navy,
      wallTop: C.purple,
      boardText: C.cyan,
      seats: [C.indigo, '#232d7e'],
      riser: C.navy2,
      stair: C.slate,
      upper: C.navy,
      chair: C.teal600,
      post: C.navy,
      shade: '#01060c',
    },
    crowd: {
      density: 0.97,
      shirts: [...SWAG, C.blue, C.teal600, C.lavender, C.tealLight],
      hats: 0.25,
      hatColors: [C.teal, C.orange, C.navy, C.purple],
      flags: 0.03,
      phones: 0.12,
      umbrellas: 0,
      formal: 0.04,
    },
    kids: { top: C.teal, bottom: C.navy },
    ambience: 'city',
    reverb: 0.34,
    boards: [
      { text: 'CRIBLCON', mark: 'cards26', bg: C.navy, fg: C.white, markColor: C.teal },
      { text: 'CHICAGO', mark: 'cribl', bg: C.navy, fg: C.white, markColor: C.teal },
      { text: 'SEP 28-30', bg: C.navy, fg: C.orange },
      { text: 'CRIBL APPS', short: 'APPS', mark: 'goat', bg: C.navy, fg: C.cyan },
      { text: 'MAGIC', mark: 'goat', bg: C.navy, fg: C.lavender },
      { text: 'GOAT MODE', mark: 'goat', bg: C.navy, fg: C.mint },
    ],
    ticker: [
      'MAGIC IN THE MAKING',
      'CRIBLCON 26 · CHICAGO · SEP 28-30',
      'THIS GAME IS A CRIBL APP',
      'NPX @CRIBL/APPS CREATE',
      'PROMPT IT. SHIP IT. PLAY IT.',
    ],
    led: true,
    logo: 'CRIBLCON 26',
    apronText: 'MAGIC IN THE MAKING',
    product: 'cribl',
    magic: true,
  },
};

/** Tour order: the five product events, then the CriblCon finale. */
export const VENUE_ORDER: VenueId[] = ['harbour', 'clay', 'lawn', 'empire', 'neon', 'criblcon'];
