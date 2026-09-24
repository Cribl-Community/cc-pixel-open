import clsx from 'clsx';
import { useState } from 'react';
import { audio } from '../../game/audio/engine';
import { playerById, ROSTER } from '../../game/sim/roster';
import { SURFACES } from '../../game/sim/surfaces';
import { VENUES, VENUE_ORDER } from '../../game/sim/venues';
import { ROUND_NAMES, tourSkill, useGame } from '../../game/state/store';
import { PixelButton } from '../ui/PixelButton';
import { PixelIcon } from '../ui/PixelIcon';
import { Flag } from './Flag';
import { PlayerCard, PlayerDetail } from './PlayerCard';
import { PlayerPortrait } from './PlayerPortrait';
import { VenueThumb } from './VenueThumb';

const skillLabel = (s: number) => (s < 0.22 ? 'Rookie' : s < 0.5 ? 'Pro' : 'Legend');

export function TourScreen() {
  const tour = useGame((s) => s.tour);
  const setPhase = useGame((s) => s.setPhase);
  const startTour = useGame((s) => s.startTour);
  const startMatch = useGame((s) => s.startMatch);
  const tourMatch = useGame((s) => s.tourMatch);
  const abandon = useGame((s) => s.abandonTour);
  const [pickId, setPickId] = useState(tour.playerId);
  const [confirm, setConfirm] = useState(false);

  const header = (
    <header className="flex items-center justify-between">
      <PixelButton variant="ghost" size="sm" onClick={() => setPhase('title')}>
        <PixelIcon name="back" size={10} />
        Menu
      </PixelButton>
      <h1 className="font-display text-sm text-ball sm:text-base">WORLD TOUR</h1>
      <div className="w-[72px]" />
    </header>
  );

  const trophies = (
    <div className="flex flex-wrap justify-center gap-3">
      {VENUE_ORDER.map((id) => {
        const n = tour.trophies[id] ?? 0;
        return (
          <div
            key={id}
            className={clsx(
              'flex items-center gap-1.5 font-display text-[8px]',
              n ? 'text-gold' : 'text-line',
            )}
          >
            <PixelIcon name="trophy" size={14} />
            <span>{VENUES[id].event.toUpperCase()}</span>
            {n > 1 && <span className="text-cream">×{n}</span>}
          </div>
        );
      })}
    </div>
  );

  if (!tour.active) {
    const pick = playerById(pickId);
    return (
      <div className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-4 px-3 py-4 sm:px-6">
        {header}
        <section className="pixel-panel pixel-corners p-4 text-center">
          {tour.completed > 0 && (
            <p className="mb-2 animate-pop font-display text-sm text-gold">
              TOUR CHAMPION ×{tour.completed}
            </p>
          )}
          <p className="mx-auto max-w-2xl font-body text-base text-cream/85">
            Six tournaments on four surfaces: five presented by a Cribl product, from the Stream
            Slam to the Insights Finals, then the grand finale at CriblCon 26 in Chicago. Each one
            is a quarterfinal, a semifinal and a final, and every round is tougher than the last.
            Win all six to be crowned Tour Champion.
          </p>
          <div className="mt-3">{trophies}</div>
        </section>
        <section className="pixel-panel pixel-corners p-4">
          <h2 className="mb-3 font-display text-[10px] text-cream">CHOOSE YOUR PLAYER</h2>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
            {ROSTER.map((p) => (
              <PlayerCard
                key={p.id}
                player={p}
                selected={p.id === pickId}
                onClick={() => {
                  audio.click();
                  setPickId(p.id);
                }}
              />
            ))}
          </div>
          <div className="mt-3">
            <PlayerDetail player={pick} />
          </div>
        </section>
        <div className="flex justify-center">
          <PixelButton
            variant="ball"
            size="lg"
            className="w-full max-w-md"
            onClick={() => {
              audio.chime(true);
              startTour(pickId);
            }}
          >
            <PixelIcon name="globe" size={12} />
            Start the tour
          </PixelButton>
        </div>
      </div>
    );
  }

  const me = playerById(tour.playerId);
  const next = tourMatch();
  const opp = next ? playerById(next.opponentId) : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-4 px-3 py-4 sm:px-6">
      {header}
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
        {VENUE_ORDER.map((id, i) => {
          const v = VENUES[id];
          const done = i < tour.stop;
          const current = i === tour.stop;
          return (
            <div
              key={id}
              className={clsx(
                'pixel-corners flex w-[216px] shrink-0 flex-col gap-2 p-2',
                current ? 'bg-panel-3 shadow-[inset_0_0_0_2px_var(--color-ball)]' : 'bg-panel-2',
                !done && !current && 'opacity-60',
              )}
            >
              <div className="relative">
                <VenueThumb venue={v} w={200} h={112} />
                {done && (
                  <span className="absolute inset-0 flex items-center justify-center bg-ink/55 text-gold">
                    <PixelIcon name="trophy" size={32} />
                  </span>
                )}
                {!done && !current && (
                  <span className="absolute top-1 right-1 text-cream/70">
                    <PixelIcon name="lock" size={12} />
                  </span>
                )}
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-display text-[9px] text-cream">{v.event.toUpperCase()}</span>
                <span className="font-display text-[7px] text-ball">
                  {SURFACES[v.surface].name.toUpperCase()}
                </span>
              </div>
              <div className="flex gap-1">
                {ROUND_NAMES.map((r, k) => (
                  <span
                    key={r}
                    className={clsx(
                      'flex-1 py-1 text-center font-display text-[6px]',
                      done || (current && k < tour.round)
                        ? 'bg-ball text-ink'
                        : current && k === tour.round
                          ? 'bg-gold text-ink'
                          : 'bg-ink/60 text-mute',
                    )}
                  >
                    {r === 'Quarterfinal' ? 'QF' : r === 'Semifinal' ? 'SF' : 'FINAL'}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {next && opp && (
        <section className="pixel-panel pixel-corners p-4">
          <p className="text-center font-display text-[9px] text-mute">
            {VENUES[next.venueId].event.toUpperCase()} ·{' '}
            {ROUND_NAMES[next.tour!.round].toUpperCase()} ·{' '}
            {skillLabel(tourSkill(next.tour!.stop, next.tour!.round)).toUpperCase()} OPPONENT
          </p>
          <div className="mt-3 flex items-center justify-center gap-4 sm:gap-10">
            <div className="flex flex-col items-center gap-2">
              <PlayerPortrait player={me} active w={56} h={74} scale={29} zoom={2} />
              <span className="flex items-center gap-1.5 font-display text-[9px] text-cream">
                <Flag code={me.country} scale={1} />
                {me.short.toUpperCase()}
              </span>
            </div>
            <span className="font-display text-lg text-ball">VS</span>
            <div className="flex flex-col items-center gap-2">
              <PlayerPortrait player={opp} active w={56} h={74} scale={29} zoom={2} />
              <span className="flex items-center gap-1.5 font-display text-[9px] text-cream">
                <Flag code={opp.country} scale={1} />
                {opp.short.toUpperCase()}
              </span>
            </div>
          </div>
          <p className="mx-auto mt-3 max-w-md text-center font-body text-sm text-cream/75">
            {opp.bio}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <PixelButton
              variant="ball"
              size="lg"
              onClick={() => {
                audio.chime(true);
                startMatch(next);
              }}
              autoFocus
            >
              <PixelIcon name="play" size={12} />
              Play the {ROUND_NAMES[next.tour!.round].toLowerCase()}
            </PixelButton>
            {confirm ? (
              <PixelButton
                variant="rose"
                onClick={() => {
                  abandon();
                  setConfirm(false);
                }}
              >
                Really abandon?
              </PixelButton>
            ) : (
              <PixelButton variant="ghost" onClick={() => setConfirm(true)}>
                Abandon tour
              </PixelButton>
            )}
          </div>
        </section>
      )}
      <div className="pixel-panel pixel-corners p-3">{trophies}</div>
    </div>
  );
}
