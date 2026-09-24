import { FLAGS } from '../../game/art/flags';
import type { CountryCode } from '../../game/sim/roster';

/** A 9×6 pixel flag, drawn from code like everything else. */
export function Flag({
  code,
  scale = 2,
  className,
}: {
  code: CountryCode;
  scale?: number;
  className?: string;
}) {
  const f = FLAGS[code];
  const w = 9;
  const h = 6;
  const rects: React.ReactNode[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      rects.push(
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={f.px(x, y, w, h)} />,
      );
  return (
    <svg
      viewBox={`-0.5 -0.5 ${w + 1} ${h + 1}`}
      width={(w + 1) * scale}
      height={(h + 1) * scale}
      shapeRendering="crispEdges"
      className={className}
      role="img"
      aria-label={f.name}
    >
      <rect x={-0.5} y={-0.5} width={w + 1} height={h + 1} fill="#0b0d12" />
      {rects}
    </svg>
  );
}
