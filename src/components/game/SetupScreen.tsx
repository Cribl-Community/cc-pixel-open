import clsx from 'clsx';
import { audio } from '../../game/audio/engine';
import { FORMATS, type MatchFormat } from '../../game/sim/scoring';
import { playerById, ROSTER } from '../../game/sim/roster';
import { SURFACES } from '../../game/sim/surfaces';
import { VENUES, VENUE_ORDER } from '../../game/sim/venues';
import { DIFFICULTY, useGame, type Difficulty } from '../../game/state/store';
import { PixelButton } from '../ui/PixelButton';
import { PixelIcon } from '../ui/PixelIcon';
import { PlayerCard, PlayerDetail } from './PlayerCard';
import { VenueThumb } from './VenueThumb';

/** CriblCon leads the picker; the tour still ends there. */
const PICKER_ORDER = ['criblcon' as const, ...VENUE_ORDER.filter((id) => id !== 'criblcon')];

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="pixel-panel pixel-corners p-4">
      <h2 className="mb-3 flex items-center gap-2 font-display text-[10px] text-cream">
        <span className="flex h-5 w-5 items-center justify-center bg-ball text-[9px] text-ink">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function SetupScreen() {
  const setup = useGame((s) => s.setup);
  const update = useGame((s) => s.updateSetup);
  const setPhase = useGame((s) => s.setPhase);
  const startMatch = useGame((s) => s.startMatch);
  const me = playerById(setup.playerId);
  const opp = playerById(
    setup.opponentId === setup.playerId ? ROSTER.find((p) => p.id !== me.id)!.id : setup.opponentId,
  );

  const pickMe = (id: string) => {
    audio.click();
    update({
      playerId: id,
      opponentId: id === setup.opponentId ? ROSTER.find((p) => p.id !== id)!.id : setup.opponentId,
    });
  };

  const play = () => {
    audio.chime(true);
    startMatch({
      ...setup,
      opponentId: opp.id,
      skill: DIFFICULTY[setup.difficulty].skill,
      tour: undefined,
    });
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-4 px-3 py-4 sm:px-6">
      <header className="flex items-center justify-between">
        <PixelButton variant="ghost" size="sm" onClick={() => setPhase('title')}>
          <PixelIcon name="back" size={10} />
          Back
        </PixelButton>
        <h1 className="font-display text-sm text-ball sm:text-base">QUICK MATCH</h1>
        <div className="w-[72px]" />
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section n={1} title="YOUR PLAYER">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
            {ROSTER.map((p) => (
              <PlayerCard
                key={p.id}
                player={p}
                selected={p.id === me.id}
                onClick={() => pickMe(p.id)}
              />
            ))}
          </div>
          <div className="mt-3">
            <PlayerDetail player={me} />
          </div>
        </Section>
        <Section n={2} title="OPPONENT">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
            {ROSTER.map((p) => (
              <PlayerCard
                key={p.id}
                player={p}
                selected={p.id === opp.id}
                disabled={p.id === me.id}
                onClick={() => {
                  audio.click();
                  update({ opponentId: p.id });
                }}
              />
            ))}
          </div>
          <div className="mt-3">
            <PlayerDetail player={opp} />
          </div>
        </Section>
      </div>

      <Section n={3} title="VENUE">
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
          {PICKER_ORDER.map((id) => {
            const v = VENUES[id];
            const sel = setup.venueId === id;
            return (
              <button
                key={id}
                onClick={() => {
                  audio.click();
                  update({ venueId: id });
                }}
                className={clsx(
                  'pixel-corners flex w-[216px] shrink-0 flex-col gap-2 p-2 text-left',
                  sel
                    ? 'bg-panel-3 shadow-[inset_0_0_0_2px_var(--color-ball)]'
                    : 'bg-panel-2 hover:bg-panel-3',
                )}
                aria-pressed={sel}
              >
                <VenueThumb venue={v} w={200} h={112} />
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-[9px] text-cream">{v.name.toUpperCase()}</span>
                  <span className="font-display text-[7px] text-ball">
                    {SURFACES[v.surface].pace.toUpperCase()}
                  </span>
                </div>
                <span className="font-body text-sm leading-tight text-cream/70">
                  {v.event} · {SURFACES[v.surface].name} ·{' '}
                  {v.light === 'day'
                    ? 'Day'
                    : v.light === 'dusk'
                      ? 'Late afternoon'
                      : v.light === 'night'
                        ? 'Night'
                        : 'Indoor'}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 font-body text-sm text-mute">{VENUES[setup.venueId].blurb}</p>
      </Section>

      <Section n={4} title="MATCH">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 font-display text-[8px] text-mute">FORMAT</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(FORMATS) as MatchFormat[]).map((f) => (
                <button
                  key={f}
                  onClick={() => update({ format: f })}
                  className={clsx(
                    'pixel-corners-sm flex flex-col px-3 pt-1.5 pb-2 text-left',
                    setup.format === f
                      ? 'bg-ball text-ink'
                      : 'bg-panel-3 text-cream hover:bg-[#0f6270]',
                  )}
                >
                  <span className="font-display text-[9px]">{FORMATS[f].label.toUpperCase()}</span>
                  <span className="font-body text-xs opacity-80">{FORMATS[f].blurb}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 font-display text-[8px] text-mute">DIFFICULTY</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
                <button
                  key={d}
                  onClick={() => update({ difficulty: d })}
                  className={clsx(
                    'pixel-corners-sm flex flex-col px-3 pt-1.5 pb-2 text-left',
                    setup.difficulty === d
                      ? 'bg-ball text-ink'
                      : 'bg-panel-3 text-cream hover:bg-[#0f6270]',
                  )}
                >
                  <span className="font-display text-[9px]">
                    {DIFFICULTY[d].label.toUpperCase()}
                  </span>
                  <span className="font-body text-xs opacity-80">{DIFFICULTY[d].blurb}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <div className="sticky bottom-3 z-10 flex justify-center">
        <PixelButton
          variant="ball"
          size="lg"
          className="w-full max-w-md shadow-[0_6px_0_0_rgb(0_0_0/0.4)]"
          onClick={play}
        >
          <PixelIcon name="play" size={12} />
          Play {me.short} v {opp.short}
        </PixelButton>
      </div>
    </div>
  );
}
