/**
 * The tour's ten players. Looks are data: the renderer builds each player's
 * sprite from these fields every frame. Stats run 1–10.
 */

import type { HairColor, SkinTone } from '../core/palette';

export type HairStyle =
  'short' | 'buzz' | 'bald' | 'long' | 'ponytail' | 'bun' | 'afro' | 'braid' | 'bob';

export type Headwear =
  | { kind: 'none' }
  | { kind: 'headband'; color: string }
  | { kind: 'cap'; color: string; backwards?: boolean }
  | { kind: 'visor'; color: string };

export interface PlayerLook {
  skin: SkinTone;
  hair: HairColor;
  hairStyle: HairStyle;
  beard?: boolean;
  headwear: Headwear;
  top: { color: string; trim: string; style: 'polo' | 'tee' | 'tank' | 'dress' };
  bottom: { color: string; style: 'shorts' | 'skirt' };
  socks: string;
  shoes: string;
  wristband?: string;
  racket: { frame: string; accent: string };
  /** Standing height in meters. */
  height: number;
  /** Shoulder and limb bulk multiplier. */
  build: number;
  /** Goat mode: the coat this player wears instead of skin and hair. */
  goat?: GoatCoat;
}

export interface GoatCoat {
  coat: string;
  beard: string;
  horn: string;
  hoof: string;
  nose: string;
}

export type PlayStyle = 'baseliner' | 'counter' | 'bigServer' | 'serveVolley' | 'allCourt';

export const STYLE_LABEL: Record<PlayStyle, string> = {
  baseliner: 'Aggressive baseliner',
  counter: 'Counter-puncher',
  bigServer: 'Big server',
  serveVolley: 'Serve & volley',
  allCourt: 'All-court',
};

export interface Stats {
  power: number;
  speed: number;
  spin: number;
  control: number;
  serve: number;
  volley: number;
  stamina: number;
}

export type CountryCode =
  'JPN' | 'GER' | 'NGA' | 'ARG' | 'GBR' | 'CRO' | 'USA' | 'IND' | 'SWE' | 'FRA';

export interface PlayerDef {
  id: string;
  name: string;
  /** Surname for the scoreboard and the umpire. */
  short: string;
  nick: string;
  country: CountryCode;
  hand: 'R' | 'L';
  backhand: 1 | 2;
  style: PlayStyle;
  stats: Stats;
  /** Grunt voice: fundamental (Hz) and loudness 0–1. */
  voice: { pitch: number; grunt: number };
  bio: string;
  look: PlayerLook;
}

export const ROSTER: PlayerDef[] = [
  {
    id: 'nakamura',
    name: 'Kai Nakamura',
    short: 'Nakamura',
    nick: 'The Metronome',
    country: 'JPN',
    hand: 'R',
    backhand: 2,
    style: 'counter',
    stats: { power: 6, speed: 9, spin: 7, control: 9, serve: 6, volley: 6, stamina: 9 },
    voice: { pitch: 132, grunt: 0.35 },
    bio: 'Returns everything. Rallies of forty shots are a warm-up.',
    look: {
      skin: 'skinLight',
      hair: 'hairBlack',
      hairStyle: 'short',
      headwear: { kind: 'cap', color: '#f4f4f0' },
      top: { color: '#1d2f66', trim: '#f4f4f0', style: 'polo' },
      bottom: { color: '#f4f4f0', style: 'shorts' },
      socks: '#f4f4f0',
      shoes: '#1d2f66',
      wristband: '#f4f4f0',
      racket: { frame: '#1a1a22', accent: '#d8263a' },
      height: 1.78,
      build: 0.95,
    },
  },
  {
    id: 'brandt',
    name: 'Lena Brandt',
    short: 'Brandt',
    nick: 'The Hammer',
    country: 'GER',
    hand: 'R',
    backhand: 2,
    style: 'baseliner',
    stats: { power: 9, speed: 6, spin: 6, control: 7, serve: 8, volley: 5, stamina: 7 },
    voice: { pitch: 232, grunt: 0.8 },
    bio: 'Takes the ball early and hits it very, very hard.',
    look: {
      skin: 'skinPale',
      hair: 'hairBlond',
      hairStyle: 'ponytail',
      headwear: { kind: 'visor', color: '#f4f4f0' },
      top: { color: '#d8263a', trim: '#f4f4f0', style: 'tank' },
      bottom: { color: '#f4f4f0', style: 'skirt' },
      socks: '#f4f4f0',
      shoes: '#f4f4f0',
      wristband: '#d8263a',
      racket: { frame: '#f4f4f0', accent: '#d8263a' },
      height: 1.8,
      build: 1,
    },
  },
  {
    id: 'oduya',
    name: 'Marcus Oduya',
    short: 'Oduya',
    nick: 'Big Serve Marcus',
    country: 'NGA',
    hand: 'R',
    backhand: 1,
    style: 'serveVolley',
    stats: { power: 8, speed: 6, spin: 5, control: 6, serve: 10, volley: 8, stamina: 6 },
    voice: { pitch: 104, grunt: 0.6 },
    bio: 'Two meters of serve. Follows it to the net and dares you to pass.',
    look: {
      skin: 'skinDeep',
      hair: 'hairBlack',
      hairStyle: 'buzz',
      beard: true,
      headwear: { kind: 'headband', color: '#1f8a3a' },
      top: { color: '#1f8a3a', trim: '#f4f4f0', style: 'tee' },
      bottom: { color: '#f4f4f0', style: 'shorts' },
      socks: '#f4f4f0',
      shoes: '#1f8a3a',
      wristband: '#f4f4f0',
      racket: { frame: '#1a1a22', accent: '#35c25a' },
      height: 1.96,
      build: 1.12,
    },
  },
  {
    id: 'reyes',
    name: 'Sofia Reyes',
    short: 'Reyes',
    nick: 'Queen of Clay',
    country: 'ARG',
    hand: 'L',
    backhand: 2,
    style: 'baseliner',
    stats: { power: 7, speed: 7, spin: 10, control: 7, serve: 6, volley: 5, stamina: 9 },
    voice: { pitch: 218, grunt: 0.7 },
    bio: 'A left-hander whose forehand kicks up over your shoulder.',
    look: {
      skin: 'skinTan',
      hair: 'hairBrown',
      hairStyle: 'long',
      headwear: { kind: 'headband', color: '#78b8e8' },
      top: { color: '#78b8e8', trim: '#f4f4f0', style: 'dress' },
      bottom: { color: '#78b8e8', style: 'skirt' },
      socks: '#f4f4f0',
      shoes: '#f4f4f0',
      wristband: '#78b8e8',
      racket: { frame: '#f2c230', accent: '#1a1a22' },
      height: 1.72,
      build: 0.95,
    },
  },
  {
    id: 'crane',
    name: 'Elliot Crane',
    short: 'Crane',
    nick: 'The Gentleman',
    country: 'GBR',
    hand: 'R',
    backhand: 1,
    style: 'allCourt',
    stats: { power: 6, speed: 7, spin: 6, control: 8, serve: 7, volley: 9, stamina: 7 },
    voice: { pitch: 124, grunt: 0.2 },
    bio: 'Slice, touch and a classic one-handed backhand. Loves the grass.',
    look: {
      skin: 'skinPale',
      hair: 'hairGinger',
      hairStyle: 'short',
      headwear: { kind: 'none' },
      top: { color: '#f4f4f0', trim: '#5b2a86', style: 'polo' },
      bottom: { color: '#f4f4f0', style: 'shorts' },
      socks: '#f4f4f0',
      shoes: '#f4f4f0',
      racket: { frame: '#8a5a2c', accent: '#2e5a2a' },
      height: 1.85,
      build: 0.98,
    },
  },
  {
    id: 'kovac',
    name: 'Ana Kovač',
    short: 'Kovac',
    nick: 'Flatliner',
    country: 'CRO',
    hand: 'R',
    backhand: 2,
    style: 'bigServer',
    stats: { power: 8, speed: 7, spin: 5, control: 8, serve: 8, volley: 6, stamina: 6 },
    voice: { pitch: 244, grunt: 0.55 },
    bio: 'Flat, fast and on the line. Points rarely last past four shots.',
    look: {
      skin: 'skinLight',
      hair: 'hairBrown',
      hairStyle: 'bun',
      headwear: { kind: 'headband', color: '#f4f4f0' },
      top: { color: '#c8202a', trim: '#f4f4f0', style: 'dress' },
      bottom: { color: '#c8202a', style: 'skirt' },
      socks: '#f4f4f0',
      shoes: '#24337a',
      wristband: '#f4f4f0',
      racket: { frame: '#24337a', accent: '#f4f4f0' },
      height: 1.83,
      build: 1,
    },
  },
  {
    id: 'hollis',
    name: 'Duke Hollis',
    short: 'Hollis',
    nick: 'The Duke',
    country: 'USA',
    hand: 'L',
    backhand: 2,
    style: 'bigServer',
    stats: { power: 9, speed: 7, spin: 7, control: 5, serve: 9, volley: 6, stamina: 6 },
    voice: { pitch: 116, grunt: 0.9 },
    bio: 'Lefty cannon. Wears the cap backwards and the crowd loves it.',
    look: {
      skin: 'skinBrown',
      hair: 'hairBlack',
      hairStyle: 'short',
      headwear: { kind: 'cap', color: '#f07d1a', backwards: true },
      top: { color: '#f07d1a', trim: '#1a1a22', style: 'tee' },
      bottom: { color: '#1a1a22', style: 'shorts' },
      socks: '#f4f4f0',
      shoes: '#f07d1a',
      wristband: '#1a1a22',
      racket: { frame: '#f07d1a', accent: '#1a1a22' },
      height: 1.9,
      build: 1.1,
    },
  },
  {
    id: 'sharma',
    name: 'Priya Sharma',
    short: 'Sharma',
    nick: 'The Surgeon',
    country: 'IND',
    hand: 'R',
    backhand: 1,
    style: 'allCourt',
    stats: { power: 5, speed: 8, spin: 7, control: 10, serve: 6, volley: 7, stamina: 8 },
    voice: { pitch: 226, grunt: 0.3 },
    bio: 'Drop shots, angles and slices. She finds lines you did not know were there.',
    look: {
      skin: 'skinBrown',
      hair: 'hairBlack',
      hairStyle: 'braid',
      headwear: { kind: 'visor', color: '#1aa39a' },
      top: { color: '#1aa39a', trim: '#f4f4f0', style: 'tank' },
      bottom: { color: '#f4f4f0', style: 'skirt' },
      socks: '#f4f4f0',
      shoes: '#f4f4f0',
      wristband: '#1aa39a',
      racket: { frame: '#f4f4f0', accent: '#1aa39a' },
      height: 1.68,
      build: 0.92,
    },
  },
  {
    id: 'holm',
    name: 'Viktor Holm',
    short: 'Holm',
    nick: 'The Iceman',
    country: 'SWE',
    hand: 'R',
    backhand: 2,
    style: 'baseliner',
    stats: { power: 7, speed: 8, spin: 8, control: 8, serve: 6, volley: 5, stamina: 10 },
    voice: { pitch: 120, grunt: 0.15 },
    bio: 'Never smiles, never tires. Heavy topspin from miles behind the baseline.',
    look: {
      skin: 'skinPale',
      hair: 'hairBlond',
      hairStyle: 'long',
      beard: true,
      headwear: { kind: 'headband', color: '#2352c4' },
      top: { color: '#f4f4f0', trim: '#2352c4', style: 'polo' },
      bottom: { color: '#2352c4', style: 'shorts' },
      socks: '#f4f4f0',
      shoes: '#f4f4f0',
      wristband: '#f2d027',
      racket: { frame: '#8a5a2c', accent: '#f2d027' },
      height: 1.82,
      build: 1,
    },
  },
  {
    id: 'laurent',
    name: 'Zoé Laurent',
    short: 'Laurent',
    nick: 'Flair',
    country: 'FRA',
    hand: 'R',
    backhand: 1,
    style: 'serveVolley',
    stats: { power: 7, speed: 8, spin: 7, control: 6, serve: 7, volley: 9, stamina: 7 },
    voice: { pitch: 238, grunt: 0.45 },
    bio: 'Tweeners, drop volleys and diving stops. Never boring.',
    look: {
      skin: 'skinDeep',
      hair: 'hairBlack',
      hairStyle: 'afro',
      headwear: { kind: 'headband', color: '#8a3ec8' },
      top: { color: '#8a3ec8', trim: '#f2c230', style: 'tee' },
      bottom: { color: '#f4f4f0', style: 'skirt' },
      socks: '#f4f4f0',
      shoes: '#8a3ec8',
      wristband: '#f2c230',
      racket: { frame: '#f4f4f0', accent: '#8a3ec8' },
      height: 1.76,
      build: 0.97,
    },
  },
];

export const playerById = (id: string) => ROSTER.find((p) => p.id === id) ?? ROSTER[0];

/** Royal Lawn's dress code: predominantly white, trims keep their color. */
export function whiteDressCode(look: PlayerLook): PlayerLook {
  const W = '#f4f4f0';
  const keep = (c: string) => c;
  return {
    ...look,
    top: { ...look.top, color: W, trim: look.top.color === W ? look.top.trim : look.top.color },
    bottom: { ...look.bottom, color: W },
    socks: W,
    shoes: W,
    headwear:
      look.headwear.kind === 'none'
        ? look.headwear
        : {
            ...look.headwear,
            color: look.headwear.kind === 'headband' ? keep(look.headwear.color) : W,
          },
  };
}

/** Overall rating shown on player cards. */
export function overall(p: PlayerDef) {
  const s = p.stats;
  return Math.round(
    (s.power * 1.1 +
      s.speed * 1.2 +
      s.spin * 0.8 +
      s.control * 1.2 +
      s.serve +
      s.volley * 0.7 +
      s.stamina * 0.6) *
      (100 / 66),
  );
}
