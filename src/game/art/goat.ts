/**
 * Goat mode: every player, ball kid and umpire becomes a goat — the Cribl
 * mascot — in the same kit. The coat follows the player's hair color, so a
 * blond player is a cream Saanen, a dark-haired one a black goat, and so on.
 */

import type { HairColor } from '../core/palette';
import type { GoatCoat, PlayerLook } from '../sim/roster';

const COATS: Record<HairColor, [coat: string, beard: string]> = {
  hairBlack: ['#3b3538', '#1b1719'],
  hairBrown: ['#80583a', '#3e2718'],
  hairChestnut: ['#a8663c', '#4a2a16'],
  hairBlond: ['#e8dcc0', '#b3a07a'],
  hairPlatinum: ['#f4f1e8', '#cfc8b8'],
  hairGinger: ['#c9803f', '#7a3f16'],
  hairGrey: ['#aeaea8', '#6c6c68'],
};

const lightness = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255;
};

export function goatCoat(hair: HairColor): GoatCoat {
  const [coat, beard] = COATS[hair];
  const light = lightness(coat) > 0.55;
  return {
    coat,
    beard,
    horn: light ? '#8f7d5f' : '#b8a582',
    hoof: '#2b2422',
    nose: light ? '#c99a92' : '#1e1a1c',
  };
}

/** The same look as a goat (idempotent). */
export function goatify(look: PlayerLook): PlayerLook {
  if (look.goat) return look;
  return { ...look, goat: goatCoat(look.hair) };
}
