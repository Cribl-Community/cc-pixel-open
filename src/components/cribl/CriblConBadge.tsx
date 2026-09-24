import { PixelMark } from './PixelMark';

/** "CriblCon 26 · Chicago · Sep 28–30", with the two cards from the event logo. */
export function CriblConBadge({ className }: { className?: string }) {
  return (
    <div
      className={`pixel-corners-sm inline-flex items-center gap-2 bg-ink/80 px-3 pt-1.5 pb-2 shadow-[inset_0_0_0_2px_var(--color-ball)] ${className ?? ''}`}
    >
      <PixelMark
        id="cards26"
        size={11}
        colors={['#00cccc', '#118285', '#020e1b']}
        className="h-[22px] w-[22px]"
      />
      <span className="font-display text-[8px] leading-none text-cream sm:text-[9px]">
        CRIBLCON 26 <span className="text-ball">·</span> CHICAGO{' '}
        <span className="text-ball">·</span> <span className="text-orange">SEP 28-30</span>
      </span>
    </div>
  );
}
