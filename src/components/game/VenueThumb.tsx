import { useEffect, useRef } from 'react';
import { venuePreview } from '../../game/render/venuePreview';
import type { VenueDef } from '../../game/sim/venues';
import { useGame } from '../../game/state/store';

/** The real stadium, painted small. */
export function VenueThumb({
  venue,
  w = 200,
  h = 112,
  zoom = 1,
  className,
}: {
  venue: VenueDef;
  w?: number;
  h?: number;
  zoom?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const goats = useGame((s) => s.settings.goats);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    // Paint after the first frame so the menu appears instantly.
    const id = requestAnimationFrame(() =>
      c.getContext('2d')!.putImageData(venuePreview(venue, w, h, goats), 0, 0),
    );
    return () => cancelAnimationFrame(id);
  }, [venue, w, h, goats]);
  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      className={`pixelated bg-ink ${className ?? ''}`}
      style={{ width: w * zoom, height: h * zoom }}
      aria-label={venue.name}
    />
  );
}
