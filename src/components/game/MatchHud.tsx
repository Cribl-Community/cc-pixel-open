import clsx from 'clsx';
import { useHud } from '../../game/state/hud';
import { useGame } from '../../game/state/store';
import { Flag } from './Flag';

function Scoreboard() {
  const names = useHud((s) => s.names);
  const countries = useHud((s) => s.countries);
  const colors = useHud((s) => s.colors);
  const sets = useHud((s) => s.sets);
  const games = useHud((s) => s.games);
  const points = useHud((s) => s.points);
  const server = useHud((s) => s.server);
  const tiebreak = useHud((s) => s.tiebreak);
  return (
    <div className="hud-glass pointer-events-none flex flex-col font-display text-[9px] sm:text-[11px]">
      {[0, 1].map((i) => (
        <div key={i} className={clsx('flex items-stretch', i === 0 && 'border-b border-white/10')}>
          <span className="w-1.5" style={{ background: colors[i] }} />
          <div className="flex min-w-[124px] items-center gap-1.5 px-2 py-1.5 sm:min-w-[156px]">
            <Flag code={countries[i]} scale={1} />
            <span className="text-cream">{names[i].toUpperCase()}</span>
            {server === i && (
              <span
                className="ml-auto h-2 w-2 rounded-full bg-ball shadow-[0_0_0_1px_#0b0d12]"
                aria-label="Serving"
              />
            )}
          </div>
          {sets.map((st, k) => (
            <span
              key={k}
              className="flex w-6 items-center justify-center bg-white/5 text-cream/70 sm:w-7"
            >
              {st.g[i]}
              {st.tb && st.g[i] < st.g[1 - i] && <sup className="text-[6px]">{st.tb[i]}</sup>}
            </span>
          ))}
          <span className="flex w-6 items-center justify-center bg-white/10 text-cream sm:w-7">
            {games[i]}
          </span>
          <span
            className={clsx(
              'flex w-8 items-center justify-center sm:w-9',
              tiebreak ? 'bg-rose/80 text-cream' : 'bg-cream/85 text-ink',
            )}
          >
            {points[i]}
          </span>
        </div>
      ))}
    </div>
  );
}

function Segments({
  n,
  value,
  on,
  className,
}: {
  n: number;
  value: number;
  on: (i: number) => string;
  className?: string;
}) {
  return (
    <div className={clsx('flex gap-[3px]', className)}>
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className={clsx('h-2.5 w-2.5 sm:h-3 sm:w-3', i < value ? on(i) : 'bg-white/15')}
        />
      ))}
    </div>
  );
}

function Pressure() {
  const p = useHud((s) => s.pressure);
  const lit = Math.round(p * 6);
  return (
    <div className="pointer-events-none flex items-center gap-2">
      <span
        className={clsx(
          'font-display text-[8px] sm:text-[9px]',
          lit >= 5 ? 'animate-blink text-rose' : 'text-cream/70',
        )}
      >
        PRESSURE
      </span>
      <Segments
        n={6}
        value={lit}
        on={(i) => (i < 2 ? 'bg-gold' : i < 4 ? 'bg-orange' : 'bg-rose')}
      />
    </div>
  );
}

function StyleMeter() {
  const style = useHud((s) => s.style);
  const toasts = useHud((s) => s.toasts);
  const charges = Math.floor(style / 250);
  return (
    <div className="pointer-events-none relative flex flex-col gap-1">
      <div className="absolute bottom-full left-0 mb-1 flex flex-col gap-0.5">
        {toasts.map((t) => (
          <span
            key={t.id}
            className="animate-rise font-display text-[8px] text-ball drop-shadow-[1px_1px_0_#0b0d12]"
          >
            +{t.amount} {t.label}
          </span>
        ))}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[8px] text-cream sm:text-[9px]">STYLE</span>
        <span className="font-display text-[7px] text-cream/60">{style} / 1000</span>
        {charges > 0 && (
          <span className="animate-blink font-display text-[7px] text-ball">
            POWER SHOT [SPACE]
          </span>
        )}
      </div>
      <div className="hud-glass flex h-3 w-40 gap-[2px] p-[2px] sm:w-52">
        {[0, 1, 2, 3].map((i) => {
          const fill = Math.max(0, Math.min(1, (style - i * 250) / 250));
          return (
            <span key={i} className="relative flex-1 bg-white/10">
              <span
                className={clsx('absolute inset-y-0 left-0', fill >= 1 ? 'bg-ball' : 'bg-sky')}
                style={{ width: `${fill * 100}%` }}
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Sprint() {
  const sprint = useHud((s) => s.sprint);
  return (
    <div className="pointer-events-none flex flex-col items-end gap-1">
      <span className="font-display text-[8px] text-cream sm:text-[9px]">SPRINT</span>
      <div className="hud-glass h-3 w-32 p-[2px] sm:w-40">
        <div
          className={clsx('h-full', sprint < 0.25 ? 'bg-rose' : 'bg-[#5fe8ff]')}
          style={{ width: `${Math.round(sprint * 100)}%` }}
        />
      </div>
    </div>
  );
}

function Callouts() {
  const callouts = useHud((s) => s.callouts);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[26%] flex flex-col items-center gap-1">
      {callouts.slice(-2).map((c) => (
        <span
          key={c.id}
          className={clsx(
            'animate-callout font-display drop-shadow-[3px_3px_0_#0b0d12]',
            c.tone === 'big' ? 'text-2xl text-gold sm:text-4xl' : 'text-lg sm:text-2xl',
            c.tone === 'good' && 'text-ball',
            c.tone === 'bad' && 'text-rose',
            c.tone === 'info' && 'text-cream',
          )}
        >
          {c.text}
        </span>
      ))}
    </div>
  );
}

function ServeSpeed() {
  const kmh = useHud((s) => s.serveKmh);
  const id = useHud((s) => s.serveId);
  if (!kmh) return null;
  return (
    <div
      key={id}
      className="hud-glass pointer-events-none absolute top-20 right-3 animate-pop px-3 py-1.5 font-display text-[9px] text-gold sm:top-24 sm:text-[11px]"
    >
      {kmh} KM/H <span className="text-cream/60">· {Math.round(kmh / 1.609)} MPH</span>
    </div>
  );
}

function Hint() {
  const hint = useHud((s) => s.hint);
  const human = useHud((s) => s.human);
  const assist = useGame((s) => s.settings.assist);
  if (!hint || human === -1) return null;
  const lines: [string, string][] =
    hint === 'serve'
      ? [
          ['SERVE', ''],
          ['HOLD CLICK / J', 'to toss the ball'],
          ['RELEASE', 'in the green zone'],
          ['POINT', 'the mouse into the box to aim'],
        ]
      : [
          [assist === 'auto' ? 'AUTO-RUN IS ON' : 'MOVE', assist === 'auto' ? '' : 'WASD / arrows'],
          ['CLICK / J', 'topspin · hold for power'],
          ['RIGHT-CLICK / K', 'slice'],
          ['MIDDLE / L', 'lob'],
          ['POINT', 'where the ball should land'],
        ];
  return (
    <div className="hud-glass pointer-events-none absolute top-[62px] left-2 flex w-[236px] flex-col gap-1 px-3 py-2 font-display text-[7px] leading-relaxed text-cream sm:top-[70px]">
      {lines.map(([k, v]) => (
        <p key={k}>
          <span className="text-ball">{k}</span> {v}
        </p>
      ))}
    </div>
  );
}

function Changeover() {
  const on = useHud((s) => s.changeover);
  if (!on) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[40%] flex justify-center">
      <span className="hud-glass animate-pop px-5 py-3 font-display text-xs text-cream sm:text-sm">
        CHANGEOVER <span className="text-cream/50">· CLICK OR ENTER TO SKIP</span>
      </span>
    </div>
  );
}

export function MatchHud() {
  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      <div className="absolute top-2 left-2">
        <Scoreboard />
      </div>
      <div className="absolute top-3 right-3">
        <Pressure />
      </div>
      <div className="absolute bottom-3 left-3">
        <StyleMeter />
      </div>
      <div className="absolute right-3 bottom-3">
        <Sprint />
      </div>
      <ServeSpeed />
      <Callouts />
      <Hint />
      <Changeover />
    </div>
  );
}
