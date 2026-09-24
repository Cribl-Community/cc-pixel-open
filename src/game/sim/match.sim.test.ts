import { describe, expect, it } from 'vitest';
import { Match, NO_INPUT, type HumanInput, type MatchEvent } from './match';
import { SIM_STEP } from './ball';
import { ROSTER } from './roster';
import { VENUES, type VenueId } from './venues';

function runMatch(
  a: number,
  b: number,
  venue: VenueId,
  skill: [number, number],
  seed: number,
  maxMinutes = 40,
) {
  const m = new Match({
    players: [ROSTER[a], ROSTER[b]],
    looks: [ROSTER[a].look, ROSTER[b].look],
    human: [false, false],
    skill,
    venue: VENUES[venue],
    format: 'short',
    assist: 'off',
    seed,
  });
  const counts: Record<string, number> = {};
  const rallies: number[] = [];
  let hits = 0;
  let whiffs = 0;
  let faults = 0;
  let lets = 0;
  const steps = Math.floor((maxMinutes * 60) / SIM_STEP);
  for (let i = 0; i < steps; i++) {
    m.step(SIM_STEP, NO_INPUT);
    for (const e of m.events as MatchEvent[]) {
      if (e.type === 'point') {
        counts[e.reason] = (counts[e.reason] ?? 0) + 1;
        rallies.push(e.rally);
      }
      if (e.type === 'hit') hits++;
      if (e.type === 'whiff') whiffs++;
      if (e.type === 'fault') faults++;
      if (e.type === 'let') lets++;
    }
    m.events.length = 0;
    if (m.phase === 'matchOver') break;
  }
  const avgRally = rallies.reduce((s, r) => s + r, 0) / Math.max(1, rallies.length);
  return { m, counts, rallies, avgRally, hits, whiffs, faults, lets, minutes: m.now / 60 };
}

describe('AI vs AI', () => {
  it('plays complete matches with plausible tennis', () => {
    const results = [
      runMatch(0, 1, 'harbour', [0.55, 0.55], 11),
      runMatch(2, 3, 'clay', [0.88, 0.88], 12),
      runMatch(4, 5, 'lawn', [0.22, 0.22], 13),
      runMatch(6, 8, 'empire', [0.7, 0.4], 14),
    ];
    for (const r of results) {
      const s = r.m.stats;
      const pts = r.rallies.length;
      console.log(
        `${r.m.cfg.venue.id.padEnd(8)} skill ${r.m.cfg.skill.join('/')} | ${r.m.phase} in ${r.minutes.toFixed(1)} min | points ${pts} | avg rally ${r.avgRally.toFixed(1)} | max ${Math.max(...r.rallies)} | hits ${r.hits} whiffs ${r.whiffs} | faults ${r.faults} lets ${r.lets} |`,
        JSON.stringify(r.counts),
        `| 1st in ${s.map((x) => ((100 * x.firstIn) / Math.max(1, x.firstTotal)).toFixed(0) + '%').join('/')}`,
        `| fastest ${s.map((x) => x.fastestServe).join('/')}`,
        `| score ${r.m.score.sets.map((x) => x.g.join('-')).join(' ')}`,
      );
      expect(pts).toBeGreaterThan(10);
      expect(r.m.phase).toBe('matchOver');
    }
  });
});

describe('auto-run', () => {
  it('gets a human who only presses "hit" to the ball', () => {
    const m = new Match({
      players: [ROSTER[0], ROSTER[1]],
      looks: [ROSTER[0].look, ROSTER[1].look],
      human: [true, false],
      skill: [0.6, 0.55],
      venue: VENUES.harbour,
      format: 'bo3',
      assist: 'auto',
      seed: 21,
    });
    let hits = 0;
    let whiffs = 0;
    let points = 0;
    let passedUntouched = 0;
    const reasons: string[] = [];
    // Play 40 points (or the whole match, if it ends first).
    for (let i = 0; i < (60 * 60) / SIM_STEP && m.phase !== 'matchOver' && points < 40; i++) {
      const me = m.players[0];
      const input: HumanInput = { ...NO_INPUT };
      if (m.point.server === 0 && m.phase === 'toServe') input.held = 'topspin';
      if (m.point.server === 0 && m.phase === 'serving' && m.toss?.releaseAt)
        if (m.now < m.toss.ideal - 0.12) input.held = 'topspin';
        else input.released = true;
      // Never touches the direction keys: auto-run does all the footwork.
      if (m.phase === 'rally' && m.point.lastHitter === 1 && !me.armed) {
        input.pressed = 'topspin';
        input.held = 'topspin';
      }
      m.step(SIM_STEP, input);
      for (const e of m.events as MatchEvent[]) {
        if (e.type === 'hit' && e.player === 0 && !e.serve) hits++;
        if (e.type === 'whiff' && e.player === 0) whiffs++;
        if (e.type === 'point') {
          points++;
          reasons.push(`${e.winner}:${e.reason}:${e.rally}`);
          if (e.winner === 1 && e.reason === 'winner') passedUntouched++;
        }
      }
      m.events.length = 0;
    }
    console.log(
      `auto-run human: ${hits} shots, ${whiffs} whiffs, ${passedUntouched} winners past them in ${points} points (${m.phase}) score ${m.score.sets.map((x) => x.g.join('-'))} | ${reasons.join(' ')}`,
    );
    expect(points).toBeGreaterThanOrEqual(30);
    expect(hits).toBeGreaterThan(points);
    expect(whiffs / (hits + whiffs)).toBeLessThan(0.12);
    expect(passedUntouched / points).toBeLessThan(0.2);
  });
});

describe('mouse aim', () => {
  it("lands a human's groundstrokes where they point", () => {
    const targets = [
      { x: -3, y: 9.5 },
      { x: 3, y: 9.5 },
      { x: -2.5, y: 6 },
      { x: 2.5, y: 7 },
      { x: 0, y: 10.5 },
    ];
    const errs: number[] = [];
    let outs = 0;
    for (let seed = 1; seed <= 3; seed++) {
      const m = new Match({
        players: [ROSTER[0], ROSTER[1]],
        looks: [ROSTER[0].look, ROSTER[1].look],
        human: [true, false],
        skill: [0.6, 0.55],
        venue: VENUES.harbour,
        format: 'bo3',
        assist: 'auto',
        seed,
      });
      let pending: { x: number; y: number } | null = null;
      let k = 0;
      for (let i = 0; i < (12 * 60) / SIM_STEP && m.phase !== 'matchOver'; i++) {
        const aim = targets[k % targets.length];
        const input: HumanInput = { ...NO_INPUT, aim };
        if (m.point.server === 0 && m.phase === 'toServe') input.held = 'topspin';
        if (m.point.server === 0 && m.phase === 'serving' && m.toss?.releaseAt) {
          input.aim = { x: m.point.half === 'deuce' ? -2.5 : 2.5, y: 5.2 };
          if (m.now < m.toss.ideal - 0.12) input.held = 'topspin';
          else input.released = true;
        }
        if (m.phase === 'rally' && m.point.lastHitter === 1 && !m.players[0].armed) {
          input.pressed = 'topspin';
          input.held = 'topspin';
        }
        m.step(SIM_STEP, input);
        for (const e of m.events as MatchEvent[]) {
          if (e.type === 'hit' && e.player === 0 && !e.serve) {
            pending = aim;
            k++;
          }
          if (e.type === 'bounce' && pending && !e.dead) {
            if (e.out) outs++;
            errs.push(Math.hypot(e.x - pending.x, e.y - pending.y));
            pending = null;
          }
        }
        m.events.length = 0;
      }
    }
    errs.sort((a, b) => a - b);
    const median = errs[Math.floor(errs.length / 2)];
    const p90 = errs[Math.floor(errs.length * 0.9)];
    console.log(
      `aim: ${errs.length} shots, ${outs} out, miss distance median ${median.toFixed(2)} m, p90 ${p90.toFixed(2)} m`,
    );
    expect(errs.length).toBeGreaterThan(60);
    expect(median).toBeLessThan(0.6);
    expect(p90).toBeLessThan(1.2);
    expect(outs / errs.length).toBeLessThan(0.05);
  });
});
