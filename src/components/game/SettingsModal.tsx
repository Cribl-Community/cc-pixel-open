import clsx from 'clsx';
import { Modal } from '../ui/Modal';
import { SPEEDS, useGame, type Assist, type GameSpeed } from '../../game/state/store';
import { toggleSound } from '../../game/audio/toggleSound';

function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={clsx(
            'pixel-corners-sm px-3 pt-1.5 pb-2 font-display text-[9px] uppercase',
            v === value ? 'bg-ball text-ink' : 'bg-panel-3 text-cream hover:bg-[#0f6270]',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const s = useGame((st) => st.settings);
  const update = useGame((st) => st.updateSettings);
  return (
    <Modal title="SETTINGS" onClose={onClose}>
      <div className="flex flex-col gap-5 font-body text-base">
        <label className="flex flex-col gap-2">
          <span className="font-display text-[9px] text-mute">SOUND</span>
          <div className="flex items-center gap-3">
            <Seg
              value={s.muted ? 'off' : 'on'}
              options={[
                ['off', 'Off'],
                ['on', 'On'],
              ]}
              onChange={(v) => {
                if ((v === 'on') === s.muted) void toggleSound();
              }}
            />
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.volume}
              onChange={(e) => update({ volume: Number(e.target.value) })}
              className="w-40 accent-[#00cccc]"
              aria-label="Volume"
            />
          </div>
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-display text-[9px] text-mute">GOAT MODE</span>
          <Seg
            value={s.goats ? 'on' : 'off'}
            options={[
              ['on', 'Goats'],
              ['off', 'Humans'],
            ]}
            onChange={(v) => update({ goats: v === 'on' })}
          />
          <span className="text-sm text-mute">
            Players, ball kids, the umpire and the whole crowd as Cribl goats. They bleat, too.
          </span>
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-display text-[9px] text-mute">UMPIRE & LINE CALLS</span>
          <Seg
            value={s.voice ? 'on' : 'off'}
            options={[
              ['on', 'On'],
              ['off', 'Off'],
            ]}
            onChange={(v) => update({ voice: v === 'on' })}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-display text-[9px] text-mute">GAME SPEED</span>
          <Seg<GameSpeed>
            value={s.speed}
            options={(Object.keys(SPEEDS) as GameSpeed[]).map((k) => [k, SPEEDS[k].label])}
            onChange={(v) => update({ speed: v })}
          />
          <span className="text-sm text-mute">
            The physics are real either way. Slower speeds give you more time.
          </span>
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-display text-[9px] text-mute">MOVEMENT</span>
          <Seg<Assist>
            value={s.assist}
            options={[
              ['auto', 'Auto-run'],
              ['move', 'Assisted'],
              ['off', 'Manual'],
            ]}
            onChange={(v) => update({ assist: v })}
          />
          <span className="text-sm text-mute">
            {s.assist === 'auto'
              ? 'Your player runs to every ball and recovers by themselves. You time the shots and aim; the direction keys only aim.'
              : s.assist === 'move'
                ? 'You move with WASD / arrows, with a nudge toward the ball while a shot is loaded.'
                : 'You do all the running yourself.'}
          </span>
        </label>
      </div>
    </Modal>
  );
}
