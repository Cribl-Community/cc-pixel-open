import { audio } from './engine';
import { useGame } from '../state/store';

/** Sound is off by default; turning it on must happen inside a user gesture. */
export async function toggleSound() {
  const s = useGame.getState();
  if (s.settings.muted) {
    await audio.init();
    s.updateSettings({ muted: false });
  } else {
    s.updateSettings({ muted: true });
  }
}
