import { useEffect, useRef, type CSSProperties } from 'react';
import { mark, type MarkId } from '../../game/art/cribl';

/** A Cribl mark as crisp pixel art; `colors[tone - 1]` paints each tone. */
export function PixelMark({
  id,
  size,
  colors,
  className,
  style,
  label,
}: {
  id: MarkId;
  size: number;
  colors: string[];
  className?: string;
  style?: CSSProperties;
  label?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const palette = colors.join(',');
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const inks = palette.split(',');
    ctx.clearRect(0, 0, size, size);
    const m = mark(id, size);
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        const t = m.px[y * m.w + x];
        if (!t) continue;
        ctx.fillStyle = inks[Math.min(inks.length, t) - 1];
        ctx.fillRect(x, y, 1, 1);
      }
  }, [id, size, palette]);
  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      className={`pixelated ${className ?? ''}`}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
