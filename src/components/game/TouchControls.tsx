import { useRef, useState } from 'react';
import type { Controls } from '../../game/input/controls';
import type { ShotKind } from '../../game/sim/shots';

/** On-screen stick and shot buttons for touch screens. */
export function TouchControls({ controls }: { controls: Controls | null }) {
  // Client-only component (the match screen never renders on the server).
  const [touch] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
  );
  const stick = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  if (!touch || !controls) return null;

  const move = (e: React.PointerEvent) => {
    const el = stick.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const len = Math.hypot(dx, dy);
    const k = len > 1 ? 1 / len : 1;
    controls.setStick(dx * k, -dy * k);
    setKnob({ x: dx * k, y: dy * k });
  };
  const end = () => {
    controls.setStick(0, 0);
    setKnob({ x: 0, y: 0 });
  };
  const btn = (label: string, kind: ShotKind | 'power', cls: string) => (
    <button
      className={`pixel-corners pointer-events-auto flex h-14 w-14 items-center justify-center font-display text-[8px] text-ink active:translate-y-[2px] ${cls}`}
      onPointerDown={(e) => {
        e.preventDefault();
        controls.shotDown(kind);
      }}
      onPointerUp={() => controls.shotUp()}
      onPointerCancel={() => controls.shotUp()}
    >
      {label}
    </button>
  );

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-16 flex items-end justify-between px-4">
      <div
        ref={stick}
        className="pointer-events-auto relative h-28 w-28 touch-none rounded-full bg-white/10 shadow-[inset_0_0_0_2px_rgb(255_255_255/0.2)]"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={(e) => e.buttons && move(e)}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <span
          className="absolute h-12 w-12 rounded-full bg-white/40"
          style={{
            left: `calc(50% - 24px + ${knob.x * 36}px)`,
            top: `calc(50% - 24px + ${knob.y * 36}px)`,
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {btn('LOB', 'lob', 'bg-sky')}
        {btn('POWER', 'power', 'bg-gold')}
        {btn('SLICE', 'slice', 'bg-clay')}
        {btn('TOP', 'topspin', 'bg-ball')}
        <button
          className="pixel-corners pointer-events-auto col-span-2 h-9 bg-white/30 font-display text-[8px] text-cream"
          onPointerDown={() => controls.setSprint(true)}
          onPointerUp={() => controls.setSprint(false)}
          onPointerCancel={() => controls.setSprint(false)}
        >
          SPRINT
        </button>
      </div>
    </div>
  );
}
