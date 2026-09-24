import { useEffect } from 'react';
import { audio } from '../../game/audio/engine';
import { toggleSound } from '../../game/audio/toggleSound';
import { useGame } from '../../game/state/store';
import { TitleScreen } from './TitleScreen';
import { SetupScreen } from './SetupScreen';
import { TourScreen } from './TourScreen';
import { MatchScreen } from './MatchScreen';

export function GameShell() {
  const hydrated = useGame((s) => s.hydrated);
  const phase = useGame((s) => s.phase);
  const settings = useGame((s) => s.settings);

  useEffect(() => {
    // The save comes from the Cribl KV store, so this is a network read.
    void Promise.resolve(useGame.persist.rehydrate()).then(() =>
      useGame.setState({ hydrated: true }),
    );
  }, []);

  useEffect(() => {
    audio.setMuted(settings.muted);
    audio.setVolume(settings.volume);
    audio.voiceOn = settings.voice;
  }, [settings]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      if (e.code === 'KeyM') void toggleSound();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!hydrated) {
    return (
      <main className="flex h-dvh items-center justify-center">
        <p className="animate-blink font-display text-xs text-ball">ROLLING THE COURT…</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh">
      {phase === 'title' && <TitleScreen />}
      {phase === 'setup' && <SetupScreen />}
      {phase === 'tour' && <TourScreen />}
      {phase === 'match' && <MatchScreen />}
    </main>
  );
}
