import { describe, expect, it } from 'vitest';
import {
  awardPoint,
  courtHalf,
  gameCall,
  newScore,
  pointCall,
  pointLabels,
  scoreLine,
  situation,
  type PlayerIdx,
  type Score,
} from './scoring';

const names: [string, string] = ['Kai', 'Lena'];

function play(s: Score, seq: string) {
  let last = null;
  for (const c of seq) last = awardPoint(s, Number(c) as PlayerIdx);
  return last!;
}

describe('points and games', () => {
  it('counts 15-30-40 and wins a game at 4 points', () => {
    const s = newScore('set', 0);
    play(s, '00');
    expect(pointLabels(s)).toEqual(['30', '0']);
    expect(pointCall(s, names)).toBe('Thirty Love');
    play(s, '0');
    expect(situation(s).gamePoint).toBe(0);
    const out = play(s, '0');
    expect(out.game).toBe(0);
    expect(s.games).toEqual([1, 0]);
    expect(s.server).toBe(1);
    expect(out.changeEnds).toBe(true);
  });

  it('plays deuce and advantage', () => {
    const s = newScore('set', 0);
    play(s, '000111');
    expect(pointCall(s, names)).toBe('Deuce');
    expect(situation(s).deuce).toBe(true);
    play(s, '1');
    expect(pointLabels(s)).toEqual(['', 'AD']);
    expect(pointCall(s, names)).toBe('Advantage Lena');
    expect(situation(s).breakPoint).toBe(true);
    play(s, '0');
    expect(pointCall(s, names)).toBe('Deuce');
    const out = play(s, '11');
    expect(out.game).toBe(1);
    expect(out.breakOfServe).toBe(true);
  });

  it('calls the server score first', () => {
    const s = newScore('set', 1);
    play(s, '0');
    expect(pointCall(s, names)).toBe('Love Fifteen');
  });

  it('alternates court halves', () => {
    const s = newScore('set', 0);
    expect(courtHalf(s)).toBe('deuce');
    play(s, '0');
    expect(courtHalf(s)).toBe('ad');
  });
});

describe('sets, tiebreaks and matches', () => {
  it('goes to a tiebreak at 6-6 and rotates serve', () => {
    const s = newScore('set', 0);
    // Hold serve alternately to 6-6.
    for (let g = 0; g < 12; g++) play(s, String(s.server).repeat(4));
    expect(s.games).toEqual([6, 6]);
    expect(s.tiebreak).toBe(true);
    expect(s.server).toBe(0);
    play(s, '0');
    expect(s.server).toBe(1);
    play(s, '1');
    expect(s.server).toBe(1);
    play(s, '1');
    expect(s.server).toBe(0);
    expect(pointCall(s, names)).toBe('2 1, Lena');
    // Lena wins it 7-1.
    const out = play(s, '11111');
    expect(out.set).toBe(1);
    expect(out.match).toBe(1);
    expect(s.sets[0]).toEqual({ g: [6, 7], tb: [1, 7] });
    expect(scoreLine(s, 1)).toBe('7-6(1)');
    expect(gameCall(s, out, names)).toBe('Game, set and match, Lena');
  });

  it('plays a best of three', () => {
    const s = newScore('bo3', 0);
    for (let g = 0; g < 6; g++) play(s, '0000');
    expect(s.sets.length).toBe(1);
    expect(s.winner).toBe(null);
    for (let g = 0; g < 6; g++) play(s, '1111');
    expect(s.sets.length).toBe(2);
    for (let g = 0; g < 5; g++) play(s, '0000');
    expect(situation(s).matchPoint).toBe(null);
    play(s, '000');
    expect(situation(s).matchPoint).toBe(0);
    const out = play(s, '0');
    expect(out.match).toBe(0);
    expect(scoreLine(s, 0)).toBe('6-0 0-6 6-0');
  });

  it('short sets finish at 4 games', () => {
    const s = newScore('short', 0);
    for (let g = 0; g < 3; g++) play(s, '0000');
    expect(situation(s).matchPoint).toBe(null);
    play(s, '000');
    expect(situation(s).matchPoint).toBe(0);
    expect(play(s, '0').match).toBe(0);
  });
});
