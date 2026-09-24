import { PixelMark } from './PixelMark';

/** Product marketing, in the game's own pixels: this game is a Cribl App. */
export function AppsHype({ className }: { className?: string }) {
  return (
    <div
      className={`pixel-panel pixel-corners w-full px-3 pt-2.5 pb-3 text-left ${className ?? ''}`}
    >
      <p className="flex items-center gap-2 font-display text-[9px] leading-none text-ball">
        <PixelMark
          id="goat"
          size={12}
          colors={['#00cccc', '#118285']}
          className="h-[18px] w-[18px]"
        />
        THIS GAME IS A CRIBL APP
        <span className="ml-auto bg-purple px-1.5 pt-1 pb-1.5 text-[7px] text-cream">PREVIEW</span>
      </p>
      <p className="mt-2 font-body text-sm leading-snug text-cream/85">
        Scaffolded with Cribl Apps and running right inside Cribl: a Vite + React game with real
        physics, saves in the app&apos;s KV store, and not a single image file. Idea to app in
        hours.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <code className="bg-ink/80 px-2 pt-1 pb-1.5 font-display text-[8px] text-mint">
          $ npx @cribl/apps create
        </code>
        <a
          href="https://docs.cribl.io/apps/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-display text-[8px] text-orange underline decoration-2 underline-offset-4 hover:text-cream"
        >
          BUILD YOURS »
        </a>
      </div>
    </div>
  );
}
