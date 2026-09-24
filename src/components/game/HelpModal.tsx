import { Modal } from '../ui/Modal';

const ROWS: [string, string][] = [
  ['Mouse', 'Point where the ball should land'],
  ['Left click / J', 'Topspin — hold for power. Serving: flat'],
  ['Right click / K', 'Slice — aim short for a drop shot. Serving: slice'],
  ['Middle click / L', 'Lob. Serving: kick'],
  ['WASD / Arrows', 'Aim (and move, when auto-run is off)'],
  ['Space', 'Power shot (costs 250 STYLE)'],
  ['Shift', 'Sprint (drains the SPRINT bar)'],
  ['Esc / P', 'Pause'],
  ['M', 'Sound on / off'],
  ['Enter', 'Skip the changeover'],
];

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="HOW TO PLAY" onClose={onClose} wide>
      <div className="grid gap-5 font-body text-base leading-snug text-cream/90 md:grid-cols-2">
        <section>
          <h3 className="mb-2 font-display text-[10px] text-ball">SERVING</h3>
          <p>
            Hold a mouse button or shot key to toss the ball (left/J flat, right/K slice, middle/L
            kick). Keep holding: the meter climbs as the ball rises. Release in the{' '}
            <span className="text-ball">green zone</span> to strike it at the top of the toss. Point
            the mouse into the service box (or hold left or right) to aim.
          </p>
          <h3 className="mt-4 mb-2 font-display text-[10px] text-ball">RALLYING</h3>
          <p>
            <span className="text-ball">Auto-run</span> is on by default: your player reads the ball
            and gets there by themselves. Click (or press a shot key) before the ball arrives and
            you swing automatically when it reaches you. Hold longer to hit harder. Point the mouse
            where you want the ball to land. The ring on the court shows your target. Prefer to run
            yourself? Pick Assisted or Manual movement in Settings.
          </p>
          <h3 className="mt-4 mb-2 font-display text-[10px] text-ball">REAL PHYSICS</h3>
          <p>
            The ball has drag and spin (Magnus lift), and bounces with friction. Topspin dips and
            kicks up. Slice floats and skids low. Clay is slow and high, grass is fast and low.
            Hitting on the run, stretching, or swinging too hard makes errors more likely, and so
            does the <span className="text-rose">PRESSURE</span> of big points.
          </p>
        </section>
        <section>
          <h3 className="mb-2 font-display text-[10px] text-ball">CONTROLS</h3>
          <table className="w-full text-sm">
            <tbody>
              {ROWS.map(([k, v]) => (
                <tr key={k} className="border-b border-line/50">
                  <td className="py-1.5 pr-3 font-display text-[9px] whitespace-nowrap text-cream">
                    {k}
                  </td>
                  <td className="py-1.5 text-cream/80">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm text-mute">
            Gamepads work too: stick to aim (or move), A topspin, B slice, Y lob, X power, RB
            sprint.
          </p>
          <h3 className="mt-4 mb-2 font-display text-[10px] text-ball">STYLE</h3>
          <p className="text-sm">
            Aces, winners, lobs, drop shots and long rallies earn STYLE. Every 250 points is one
            power shot.
          </p>
        </section>
      </div>
    </Modal>
  );
}
