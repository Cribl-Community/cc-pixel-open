import clsx from 'clsx';
import { overall, STYLE_LABEL, type PlayerDef, type Stats } from '../../game/sim/roster';
import { Flag } from './Flag';
import { PlayerPortrait } from './PlayerPortrait';

export function PlayerCard({
  player,
  selected,
  disabled,
  onClick,
}: {
  player: PlayerDef;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'pixel-corners flex w-[104px] shrink-0 flex-col items-center gap-1 px-1 pt-2 pb-2 text-center transition-colors',
        selected
          ? 'bg-panel-3 shadow-[inset_0_0_0_2px_var(--color-ball)]'
          : 'bg-panel shadow-[inset_0_0_0_2px_var(--color-line)] hover:bg-panel-2',
        disabled && 'opacity-35',
      )}
      aria-pressed={selected}
    >
      <div className="relative flex h-[74px] w-[84px] items-end justify-center overflow-hidden bg-gradient-to-b from-[#0a4e5b] to-[#032836]">
        <PlayerPortrait player={player} active={selected} w={42} h={56} scale={22} zoom={1.5} />
      </div>
      <div className="flex items-center gap-1">
        <Flag code={player.country} scale={1} />
        <span className="font-display text-[8px] text-cream">{player.short.toUpperCase()}</span>
      </div>
      <span className="font-display text-[7px] text-ball">OVR {overall(player)}</span>
    </button>
  );
}

const STAT_LABELS: [keyof Stats, string][] = [
  ['power', 'POWER'],
  ['speed', 'SPEED'],
  ['spin', 'SPIN'],
  ['control', 'CONTROL'],
  ['serve', 'SERVE'],
  ['volley', 'VOLLEY'],
  ['stamina', 'STAMINA'],
];

export function StatBars({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-[64px_1fr] items-center gap-x-2 gap-y-1">
      {STAT_LABELS.map(([k, label]) => (
        <div key={k} className="contents">
          <span className="font-display text-[7px] text-mute">{label}</span>
          <div className="flex gap-[2px]">
            {Array.from({ length: 10 }, (_, i) => (
              <span
                key={i}
                className={clsx(
                  'h-2 flex-1',
                  i < stats[k] ? (stats[k] >= 9 ? 'bg-ball' : 'bg-sky') : 'bg-ink/70',
                )}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PlayerDetail({ player }: { player: PlayerDef }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-[150px] w-[112px] shrink-0 items-end justify-center overflow-hidden bg-gradient-to-b from-[#0a4e5b] to-[#032836] pixel-corners">
        <PlayerPortrait player={player} active w={56} h={74} scale={29} zoom={2} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Flag code={player.country} scale={2} />
            <h3 className="font-display text-[11px] text-cream">{player.name.toUpperCase()}</h3>
          </div>
          <p className="mt-1 font-body text-sm text-ball">
            “{player.nick}” · {STYLE_LABEL[player.style]} · {player.hand === 'L' ? 'Left' : 'Right'}
            -handed · {player.backhand === 1 ? 'one' : 'two'}-handed backhand
          </p>
        </div>
        <StatBars stats={player.stats} />
        <p className="font-body text-sm leading-snug text-cream/75">{player.bio}</p>
      </div>
    </div>
  );
}
