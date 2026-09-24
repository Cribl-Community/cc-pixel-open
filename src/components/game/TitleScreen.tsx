import { useState } from 'react';
import { audio } from '../../game/audio/engine';
import { useGame } from '../../game/state/store';
import { PixelButton } from '../ui/PixelButton';
import { PixelIcon } from '../ui/PixelIcon';
import { AppsHype } from '../cribl/AppsHype';
import { CriblConBadge } from '../cribl/CriblConBadge';
import { HypeTicker } from '../cribl/HypeTicker';
import { PixelMark } from '../cribl/PixelMark';
import { Skyline } from '../cribl/Skyline';
import { AttractMatch } from './AttractMatch';
import { HelpModal } from './HelpModal';
import { SettingsModal } from './SettingsModal';
import { toggleSound } from '../../game/audio/toggleSound';

const TITLE_SHADOW =
  '4px 4px 0 #01070e, -2px -2px 0 #01070e, 2px -2px 0 #01070e, -2px 2px 0 #01070e, 0 6px 0 #118285';

/** The CriblCon landing: skyline, goats, the attract match and the Cribl Apps pitch. */
export function TitleScreen() {
  const muted = useGame((s) => s.settings.muted);
  const goats = useGame((s) => s.settings.goats);
  const updateSettings = useGame((s) => s.updateSettings);
  const records = useGame((s) => s.records);
  const tour = useGame((s) => s.tour);
  const setPhase = useGame((s) => s.setPhase);
  const [label, setLabel] = useState('');
  const [help, setHelp] = useState(false);
  const [settings, setSettings] = useState(false);

  const go = async (phase: 'setup' | 'tour') => {
    // Warm up the audio graph inside the click (it stays silent while muted).
    await audio.init();
    audio.whoosh();
    setPhase(phase);
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <AttractMatch onLabel={setLabel} />
      <Skyline className="pointer-events-none absolute inset-x-0 top-0 h-[34%] [mask-image:linear-gradient(to_bottom,black_55%,transparent)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-ink via-ink/70 to-transparent" />

      <div className="relative z-10 flex h-full flex-col items-center justify-between px-4 pt-4 pb-10 sm:pt-6">
        <header className="flex animate-rise flex-col items-center text-center">
          <CriblConBadge />
          <h1
            className="mt-3 flex items-center font-display text-4xl leading-tight text-cream sm:text-6xl md:text-7xl"
            style={{ textShadow: TITLE_SHADOW }}
          >
            PIXEL
            {goats ? (
              <PixelMark
                id="goat"
                size={16}
                colors={['#00cccc', '#118285']}
                label="O"
                className="mx-2 h-[0.9em] w-[0.9em] drop-shadow-[4px_4px_0_#01070e]"
              />
            ) : (
              <span className="mx-2 inline-block h-[0.72em] w-[0.72em] rounded-full bg-tennis shadow-[inset_-0.08em_-0.1em_0_0_#8fae16,4px_4px_0_0_#01070e]" />
            )}
            PEN
          </h1>
          <p className="mt-2 font-display text-[9px] tracking-[0.25em] text-ball sm:text-[11px]">
            CRIBLCON 26 EDITION <span className="text-orange">·</span>{' '}
            <span className="text-lavender">MAGIC IN THE MAKING</span>
          </p>
          <p className="mt-3 font-body text-base text-cream/90 drop-shadow-[2px_2px_0_#01070e] sm:text-lg">
            Real ball physics. Six stadiums. {goats ? 'Ten goats' : 'Ten players'}. One match point
            away from glory.
          </p>
        </header>

        <div className="flex w-full max-w-md flex-col items-center gap-3">
          <PixelButton
            variant="ball"
            size="lg"
            className="w-full animate-pop"
            onClick={() => void go('setup')}
            autoFocus
          >
            <PixelIcon name="racket" size={14} />
            Quick match
          </PixelButton>
          <PixelButton variant="court" size="md" className="w-full" onClick={() => void go('tour')}>
            <PixelIcon name="globe" size={12} />
            {tour.active ? 'Continue World Tour' : 'World Tour'}
          </PixelButton>
          <div className="flex flex-wrap justify-center gap-2">
            <PixelButton
              variant={goats ? 'orange' : 'ghost'}
              size="sm"
              onClick={() => updateSettings({ goats: !goats })}
              aria-pressed={goats}
            >
              <PixelMark
                id="goat"
                size={12}
                colors={goats ? ['#01070e'] : ['#fcfaf8']}
                className="h-3 w-3"
              />
              {goats ? 'Goat mode on' : 'Goat mode off'}
            </PixelButton>
            <PixelButton
              variant="ghost"
              size="sm"
              onClick={() => void toggleSound()}
              aria-label={muted ? 'Turn sound on' : 'Mute'}
            >
              <PixelIcon name={muted ? 'soundOff' : 'soundOn'} size={12} />
              {muted ? 'Sound off' : 'Sound on'}
            </PixelButton>
            <PixelButton variant="ghost" size="sm" onClick={() => setHelp(true)}>
              <PixelIcon name="help" size={12} />
              How to play
            </PixelButton>
            <PixelButton variant="ghost" size="sm" onClick={() => setSettings(true)}>
              <PixelIcon name="gear" size={12} />
              Settings
            </PixelButton>
          </div>
          <AppsHype className="hidden sm:block" />
          {records.played > 0 && (
            <p className="font-display text-[8px] leading-relaxed text-cream/70">
              W-L {records.won}-{records.played - records.won} · TITLES {records.titles} · ACES{' '}
              {records.aces} · FASTEST SERVE {records.fastestServe} KM/H
            </p>
          )}
          <p className="text-center font-body text-sm text-mute">
            <span className="text-cream/80">{label}</span>
            <span className="mx-2 text-line">|</span>
            {muted
              ? 'Sound is off — turn it on to hear the goats.'
              : 'Every pixel and every sound is made in code.'}
          </p>
        </div>
      </div>
      <HypeTicker className="absolute inset-x-0 bottom-0 z-20" />
      {help && <HelpModal onClose={() => setHelp(false)} />}
      {settings && <SettingsModal onClose={() => setSettings(false)} />}
    </div>
  );
}
