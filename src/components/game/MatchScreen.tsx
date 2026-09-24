import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { audio } from '../../game/audio/engine';
import { MatchController } from '../../game/render/matchController';
import { playerById } from '../../game/sim/roster';
import { VENUES } from '../../game/sim/venues';
import { useHud, type MatchResult } from '../../game/state/hud';
import { ROUND_NAMES, SPEEDS, useGame } from '../../game/state/store';
import { usePixelViewport } from '../../hooks/usePixelViewport';
import { PixelButton } from '../ui/PixelButton';
import { PixelIcon } from '../ui/PixelIcon';
import { PixelMark } from '../cribl/PixelMark';
import { Flag } from './Flag';
import { HelpModal } from './HelpModal';
import { MatchHud } from './MatchHud';
import { SettingsModal } from './SettingsModal';
import { TouchControls } from './TouchControls';
import { toggleSound } from '../../game/audio/toggleSound';

/** HUD scale for a canvas of this CSS width (designed at 800px). */
const hudScale = (cssW: number) => Math.min(1.6, Math.max(0.55, cssW / 800));

export function MatchScreen() {
  const match = useGame((s) => s.match);
  const matchKey = useGame((s) => s.matchKey);
  const settings = useGame((s) => s.settings);
  const box = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vp = usePixelViewport(box, { minW: 400, minH: 225, maxW: 480, maxH: 270 });
  const ctrl = useRef<MatchController | null>(null);
  const builtKey = useRef(-1);
  const [controller, setController] = useState<MatchController | null>(null);
  const paused = useHud((s) => s.paused);
  const result = useHud((s) => s.result);
  const [modal, setModal] = useState<'help' | 'settings' | null>(null);

  // Build the match once per (re)start; later resizes only repaint the stadium.
  useEffect(() => {
    if (!vp || !match) return;
    const canvas = canvasRef.current!;
    const existing = ctrl.current;
    if (existing && existing.opts.canvas === canvas && builtKey.current === matchKey) {
      existing.resize(canvas, vp.W, vp.H);
      return;
    }
    existing?.stop();
    const s = useGame.getState().settings;
    const c = new MatchController({
      canvas,
      W: vp.W,
      H: vp.H,
      players: [playerById(match.playerId), playerById(match.opponentId)],
      venue: VENUES[match.venueId],
      format: match.format,
      skill: [0.6, match.skill],
      human: [true, false],
      timeScale: SPEEDS[s.speed].scale,
      assist: s.assist,
      sound: !s.muted,
      goats: s.goats,
      onMatchOver: (r: MatchResult) =>
        useGame.getState().recordMatch({
          won: r.humanWon,
          aces: r.stats[0].aces,
          winners: r.stats[0].winners,
          fastestServe: r.stats[0].fastestServe,
          longestRally: r.longestRally,
          style: r.style,
        }),
    });
    builtKey.current = matchKey;
    ctrl.current = c;
    // Handy for debugging in the browser console during development.
    if (import.meta.env.DEV)
      (window as unknown as { __pixelOpen: MatchController }).__pixelOpen = c;
    setController(c);
    c.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vp?.W, vp?.H, matchKey, match]);

  useEffect(
    () => () => {
      ctrl.current?.stop();
      ctrl.current = null;
    },
    [],
  );

  useEffect(() => {
    ctrl.current?.configure(SPEEDS[settings.speed].scale, settings.assist);
    if (!settings.muted) ctrl.current?.startSound();
  }, [settings]);

  if (!match) return null;
  const me = playerById(match.playerId);
  const opp = playerById(match.opponentId);
  const venue = VENUES[match.venueId];

  const quit = () => {
    ctrl.current?.stop();
    ctrl.current = null;
    useGame.getState().setPhase(match.tour ? 'tour' : 'title');
  };

  return (
    <div
      ref={box}
      className="relative flex h-dvh w-full items-center justify-center overflow-hidden bg-ink"
    >
      {vp && (
        <div className="relative" style={{ width: vp.cssW, height: vp.cssH }}>
          <canvas
            ref={canvasRef}
            width={vp.W}
            height={vp.H}
            className="pixelated block cursor-crosshair"
            style={{ width: vp.cssW, height: vp.cssH }}
            // Mouse: hold left = topspin, right = slice, middle = lob; the cursor aims.
            onPointerDown={(e) => {
              if (e.pointerType !== 'mouse') return;
              e.preventDefault();
              try {
                // Keep receiving the release even if the cursor leaves the court.
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                // Synthetic or already-released pointers can't be captured.
              }
              ctrl.current?.aimAtClient(
                e.clientX,
                e.clientY,
                e.currentTarget.getBoundingClientRect(),
              );
              ctrl.current?.controls.mouseDown(e.button);
            }}
            onPointerUp={(e) => {
              if (e.pointerType !== 'mouse') return;
              ctrl.current?.controls.mouseUp();
            }}
            onPointerMove={(e) => {
              if (e.pointerType !== 'mouse') return;
              ctrl.current?.aimAtClient(
                e.clientX,
                e.clientY,
                e.currentTarget.getBoundingClientRect(),
              );
            }}
            onPointerLeave={(e) => {
              if (e.pointerType === 'mouse' && !e.buttons) ctrl.current?.controls.clearAim();
            }}
            onMouseDown={(e) => e.button === 1 && e.preventDefault()}
            onContextMenu={(e) => e.preventDefault()}
          />
          {/* Overlays are laid out for an 800px-wide screen and scaled with the canvas. */}
          <div
            className="pointer-events-none absolute top-0 left-0"
            style={{
              width: vp.cssW / hudScale(vp.cssW),
              height: vp.cssH / hudScale(vp.cssW),
              transform: `scale(${hudScale(vp.cssW)})`,
              transformOrigin: 'top left',
            }}
          >
            <MatchHud />
            <button
              onClick={() => ctrl.current?.setPaused(true)}
              className="hud-glass pointer-events-auto absolute top-11 right-3 flex items-center gap-1.5 px-2 py-1.5 font-display text-[7px] text-cream/80 hover:text-cream sm:top-12"
              aria-label="Pause"
            >
              <PixelIcon name="pause" size={10} /> ESC
            </button>
            <button
              onClick={() => void toggleSound()}
              className="hud-glass pointer-events-auto absolute top-11 right-[72px] flex items-center px-2 py-1.5 text-cream/80 hover:text-cream sm:top-12"
              aria-label={settings.muted ? 'Turn sound on' : 'Mute'}
            >
              <PixelIcon name={settings.muted ? 'soundOff' : 'soundOn'} size={10} />
            </button>
            <TouchControls controls={controller?.controls ?? null} />
            {paused && !result && (
              <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-ink/70">
                <div className="pixel-panel pixel-corners flex w-72 animate-pop flex-col gap-2 p-5">
                  <h2 className="mb-1 text-center font-display text-xs text-ball">PAUSED</h2>
                  <p className="mb-2 text-center font-body text-sm text-cream/70">
                    {me.short} v {opp.short} · {venue.name}
                    {match.tour && ` · ${ROUND_NAMES[match.tour.round]}`}
                  </p>
                  <PixelButton
                    variant="ball"
                    onClick={() => ctrl.current?.setPaused(false)}
                    autoFocus
                  >
                    <PixelIcon name="play" size={10} /> Resume
                  </PixelButton>
                  <PixelButton variant="panel" onClick={() => useGame.getState().rematch()}>
                    <PixelIcon name="retry" size={10} /> Restart
                  </PixelButton>
                  <div className="grid grid-cols-2 gap-2">
                    <PixelButton variant="ghost" size="sm" onClick={() => setModal('settings')}>
                      <PixelIcon name="gear" size={10} /> Settings
                    </PixelButton>
                    <PixelButton variant="ghost" size="sm" onClick={() => setModal('help')}>
                      <PixelIcon name="help" size={10} /> Help
                    </PixelButton>
                  </div>
                  <PixelButton variant="rose" size="sm" onClick={quit}>
                    <PixelIcon name="home" size={10} /> Quit match
                  </PixelButton>
                </div>
              </div>
            )}
            {result && <Results result={result} onQuit={quit} />}
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-16 hidden justify-center px-6 portrait:max-md:flex">
        <p className="pixel-panel pixel-corners animate-blink px-4 py-3 text-center font-display text-[9px] leading-relaxed text-ball">
          TURN YOUR PHONE SIDEWAYS FOR A BIGGER COURT
        </p>
      </div>
      {modal === 'help' && <HelpModal onClose={() => setModal(null)} />}
      {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} />}
    </div>
  );
}

function Results({ result, onQuit }: { result: MatchResult; onQuit: () => void }) {
  const match = useGame((s) => s.match)!;
  const tour = useGame((s) => s.tour);
  const goats = useGame((s) => s.settings.goats);
  const me = playerById(match.playerId);
  const opp = playerById(match.opponentId);
  const players = [me, opp];
  const winner = players[result.winner];
  const [a, b] = result.stats;
  const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : '—');
  const rows: [string, string, string][] = [
    ['Points won', String(a.points), String(b.points)],
    ['Aces', String(a.aces), String(b.aces)],
    ['Double faults', String(a.doubleFaults), String(b.doubleFaults)],
    ['1st serve in', pct(a.firstIn, a.firstTotal), pct(b.firstIn, b.firstTotal)],
    ['1st serve pts won', pct(a.firstWon, a.firstIn), pct(b.firstWon, b.firstIn)],
    ['Winners', String(a.winners), String(b.winners)],
    ['Unforced errors', String(a.unforced), String(b.unforced)],
    ['Net points won', `${a.netWon}/${a.netPoints}`, `${b.netWon}/${b.netPoints}`],
    ['Break points won', `${a.breaksWon}/${a.breakPoints}`, `${b.breaksWon}/${b.breakPoints}`],
    ['Fastest serve', `${a.fastestServe} km/h`, `${b.fastestServe} km/h`],
    ['Distance run', `${Math.round(a.distance)} m`, `${Math.round(b.distance)} m`],
  ];
  const inTour = !!match.tour;
  const title =
    inTour && result.humanWon && match.tour!.round === 2
      ? 'CHAMPION!'
      : result.humanWon
        ? 'VICTORY'
        : 'DEFEAT';
  const next = () => {
    audio.click();
    const g = useGame.getState();
    if (inTour) {
      g.setPhase('tour');
      return;
    }
    g.setPhase('setup');
  };
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center overflow-y-auto bg-ink/75 p-3">
      <div className="pixel-panel pixel-corners w-full max-w-lg animate-pop p-5">
        <p className="text-center font-display text-[8px] tracking-widest text-mute">
          GAME, SET AND MATCH
        </p>
        <h2
          className={clsx(
            'mt-2 text-center font-display text-2xl',
            result.humanWon ? 'text-ball' : 'text-rose',
          )}
        >
          {title}
        </h2>
        <div className="mt-3 flex items-center justify-center gap-2 font-display text-[10px] text-cream">
          <Flag code={winner.country} scale={2} />
          {winner.name.toUpperCase()}
          <span className="text-gold">{result.scoreLine}</span>
        </div>
        <table className="mt-4 w-full font-body text-sm">
          <thead>
            <tr className="font-display text-[8px] text-mute">
              <th className="py-1 text-left font-normal">{me.short.toUpperCase()}</th>
              <th />
              <th className="py-1 text-right font-normal">{opp.short.toUpperCase()}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, x, y]) => (
              <tr key={label} className="border-t border-line/40">
                <td className="py-1 text-left text-cream">{x}</td>
                <td className="py-1 text-center text-cream/60">{label}</td>
                <td className="py-1 text-right text-cream">{y}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {goats && result.humanWon && (
          <p className="mt-1 text-center font-display text-[8px] tracking-widest text-orange">
            G.O.A.T. STATUS UNLOCKED
          </p>
        )}
        <p className="mt-3 text-center font-display text-[8px] text-ball">
          STYLE {result.style} · LONGEST RALLY {result.longestRally} SHOTS
        </p>
        <p className="mt-2 flex items-center justify-center gap-2 font-body text-sm text-cream/70">
          <PixelMark id="goat" size={12} colors={['#00cccc', '#118285']} className="h-4 w-4" />
          Game, set, app. This match ran on Cribl Apps.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {inTour ? (
            <PixelButton variant="ball" onClick={next} autoFocus>
              <PixelIcon name="globe" size={10} />
              {result.humanWon ? (tour.active ? 'Continue tour' : 'Tour complete') : 'Back to tour'}
            </PixelButton>
          ) : (
            <>
              <PixelButton variant="ball" onClick={() => useGame.getState().rematch()} autoFocus>
                <PixelIcon name="retry" size={10} /> Rematch
              </PixelButton>
              <PixelButton variant="panel" onClick={next}>
                <PixelIcon name="racket" size={10} /> New match
              </PixelButton>
            </>
          )}
          <PixelButton variant="ghost" onClick={onQuit}>
            <PixelIcon name="home" size={10} /> Menu
          </PixelButton>
        </div>
      </div>
    </div>
  );
}
