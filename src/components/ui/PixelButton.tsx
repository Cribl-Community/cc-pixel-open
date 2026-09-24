import clsx from 'clsx';
import type { ButtonHTMLAttributes } from 'react';
import { audio } from '../../game/audio/engine';

type Variant = 'ball' | 'gold' | 'panel' | 'rose' | 'court' | 'clay' | 'orange' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  ball: 'bg-ball text-ink shadow-[inset_0_-4px_0_0_#118285,inset_0_2px_0_0_#99edeb] hover:bg-[#2adada]',
  gold: 'bg-gold text-ink shadow-[inset_0_-4px_0_0_#a8790f,inset_0_2px_0_0_#ffe38a] hover:bg-[#ffd452]',
  panel:
    'bg-panel-3 text-cream shadow-[inset_0_-4px_0_0_rgb(0_0_0/0.35),inset_0_2px_0_0_rgb(255_255_255/0.08)] hover:bg-[#0f6270]',
  rose: 'bg-rose text-cream shadow-[inset_0_-4px_0_0_#a00729,inset_0_2px_0_0_#ff8992] hover:bg-[#ff4d59]',
  court:
    'bg-court text-cream shadow-[inset_0_-4px_0_0_#0c55a5,inset_0_2px_0_0_#62a4ec] hover:bg-[#1f7ce4]',
  clay: 'bg-clay text-cream shadow-[inset_0_-4px_0_0_#8a3f1f,inset_0_2px_0_0_#f0a07a] hover:bg-[#dd7a4c]',
  orange:
    'bg-orange text-ink shadow-[inset_0_-4px_0_0_#b35f00,inset_0_2px_0_0_#ffc27a] hover:bg-[#ff9d2a]',
  ghost: 'bg-transparent text-cream hover:bg-white/8 shadow-[inset_0_0_0_2px_var(--color-line)]',
};

const SIZES: Record<Size, string> = {
  sm: 'px-2.5 pt-1.5 pb-2.5 text-[9px]',
  md: 'px-4 pt-2.5 pb-3.5 text-[11px]',
  lg: 'px-6 pt-4 pb-5 text-sm',
};

export function PixelButton({
  variant = 'panel',
  size = 'md',
  className,
  silent,
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; silent?: boolean }) {
  return (
    <button
      {...rest}
      onClick={(e) => {
        if (!silent) audio.click();
        onClick?.(e);
      }}
      className={clsx(
        'pixel-corners inline-flex items-center justify-center gap-2 font-display uppercase leading-none tracking-wide transition-[transform,background-color] duration-75 select-none',
        'active:translate-y-[2px] active:shadow-none disabled:opacity-40 disabled:active:translate-y-0',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    />
  );
}
