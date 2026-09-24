import type { Ramp } from './color';

/**
 * Hand-tuned 5-step ramps: [outline, shadow, mid, base, highlight].
 * Every player pixel is resolved through one of these (fabric colors are
 * derived with rampFrom).
 */
export const RAMPS = {
  // Skin
  skinPale: ['#5c3226', '#b97a66', '#dba28a', '#f0c4a8', '#fde2cc'],
  skinLight: ['#5a2e22', '#b0705a', '#d49478', '#ecb898', '#fbd9bf'],
  skinTan: ['#4a2618', '#9a5a3c', '#c07a54', '#dc9a72', '#f0bf98'],
  skinOlive: ['#3e2414', '#85573a', '#a8704b', '#c48c62', '#dcac82'],
  skinBrown: ['#2e160d', '#6a3a22', '#8a5032', '#a86a45', '#c68b62'],
  skinDeep: ['#1a0c07', '#3d2116', '#57301f', '#70412b', '#8c5a40'],

  // Hair
  hairBlack: ['#060608', '#121218', '#1d1d26', '#2b2b38', '#454a60'],
  hairBrown: ['#1c0e07', '#3b2012', '#56301b', '#704226', '#8e5a36'],
  hairChestnut: ['#2a0f06', '#5a220e', '#7a3316', '#98461f', '#b8612f'],
  hairBlond: ['#5a4222', '#9a7640', '#c29c5c', '#dfc184', '#f4e2b4'],
  hairPlatinum: ['#6a6660', '#b3ada2', '#d4cfc4', '#ebe7de', '#fffdf6'],
  hairGinger: ['#3a1206', '#7a2a0e', '#a33e16', '#c85a22', '#e8803a'],
  hairGrey: ['#2e3036', '#5d626c', '#838995', '#a9afba', '#d3d8df'],

  eye: ['#050405', '#0b0909', '#141011', '#1e1818', '#6b6060'],
  ball: ['#3d4a08', '#8aa012', '#bcd21e', '#dcef3a', '#f6ff9a'],
  strings: ['#6a6660', '#bdb8ae', '#dcd8cf', '#f0ede6', '#ffffff'],
  sole: ['#6a6660', '#bdb8ae', '#dcd8cf', '#f0ede6', '#ffffff'],
} as const satisfies Record<string, Ramp>;

export type SkinTone =
  'skinPale' | 'skinLight' | 'skinTan' | 'skinOlive' | 'skinBrown' | 'skinDeep';
export type HairColor =
  | 'hairBlack'
  | 'hairBrown'
  | 'hairChestnut'
  | 'hairBlond'
  | 'hairPlatinum'
  | 'hairGinger'
  | 'hairGrey';

/** CSS swatches for the UI (base tone of each ramp). */
export const SKIN_CSS: Record<SkinTone, string> = {
  skinPale: RAMPS.skinPale[3],
  skinLight: RAMPS.skinLight[3],
  skinTan: RAMPS.skinTan[3],
  skinOlive: RAMPS.skinOlive[3],
  skinBrown: RAMPS.skinBrown[3],
  skinDeep: RAMPS.skinDeep[3],
};
