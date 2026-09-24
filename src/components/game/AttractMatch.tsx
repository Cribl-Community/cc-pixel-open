import { useEffect, useRef, useState } from 'react';
import { MatchController } from '../../game/render/matchController';
import { ROSTER } from '../../game/sim/roster';
import { VENUES, VENUE_ORDER } from '../../game/sim/venues';
import { useGame } from '../../game/state/store';
import { usePixelViewport } from '../../hooks/usePixelViewport';

/** Title-screen backdrop: a live AI-vs-AI match that tours the stadiums, CriblCon first. */
export function AttractMatch({ onLabel }: { onLabel?: (label: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vp = usePixelViewport(box, { minW: 400, minH: 225, maxW: 480, maxH: 270 });
  const muted = useGame((s) => s.settings.muted);
  const goats = useGame((s) => s.settings.goats);
  const [fade, setFade] = useState(true);
  const ctrl = useRef<MatchController | null>(null);

  useEffect(() => {
    if (!vp) return;
    const canvas = canvasRef.current!;
    let idx = VENUE_ORDER.indexOf('criblcon');
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const launch = () => {
      if (!alive) return;
      const venue = VENUES[VENUE_ORDER[idx % VENUE_ORDER.length]];
      const pool = [...ROSTER].sort(() => Math.random() - 0.5);
      const c = new MatchController({
        canvas,
        W: vp.W,
        H: vp.H,
        players: [pool[0], pool[1]],
        venue,
        format: 'set',
        skill: [0.72, 0.72],
        human: [false, false],
        timeScale: 0.9,
        assist: 'off',
        demo: true,
        sound: !useGame.getState().settings.muted,
        goats,
      });
      ctrl.current = c;
      c.start();
      onLabel?.(`Live from ${venue.name} · ${pool[0].short} v ${pool[1].short}`);
      setFade(false);
      timer = setTimeout(() => {
        setFade(true);
        timer = setTimeout(() => {
          c.stop();
          idx++;
          launch();
        }, 450);
      }, 38000);
    };
    launch();
    return () => {
      alive = false;
      clearTimeout(timer);
      ctrl.current?.stop();
      ctrl.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vp?.W, vp?.H, goats]);

  // Sound switched on from the title: bring the stadium to life.
  useEffect(() => {
    if (!muted && ctrl.current) ctrl.current.startSound();
  }, [muted]);

  return (
    <div
      ref={box}
      className="absolute inset-0 flex items-center justify-center overflow-hidden bg-ink"
    >
      {vp && (
        <canvas
          ref={canvasRef}
          width={vp.W}
          height={vp.H}
          className="pixelated transition-opacity duration-300"
          style={{ width: vp.cssW, height: vp.cssH, opacity: fade ? 0 : 1 }}
        />
      )}
    </div>
  );
}
