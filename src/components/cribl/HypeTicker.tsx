const ITEMS = [
  ['CRIBLCON 26', 'text-ball'],
  ['CHICAGO · SEP 28-30', 'text-cream'],
  ['MAGIC IN THE MAKING', 'text-lavender'],
  ['THIS GAME IS A CRIBL APP', 'text-orange'],
  ['GOAT MODE: ON BY DEFAULT', 'text-mint'],
  ['NPX @CRIBL/APPS CREATE', 'text-ball'],
  ['SIX STADIUMS · TEN GOATS · REAL PHYSICS', 'text-cream'],
  ['PROMPT IT. SHIP IT. PLAY IT.', 'text-orange'],
] as const;

/** A stadium-style ticker along the bottom of the landing. */
export function HypeTicker({ className }: { className?: string }) {
  const run = [...ITEMS, ...ITEMS];
  return (
    <div
      className={`overflow-hidden border-t-2 border-ball/70 bg-ink/90 py-1.5 ${className ?? ''}`}
      aria-label="CriblCon 26 in Chicago, September 28 to 30. This game is a Cribl App."
    >
      <div className="flex w-max animate-marquee gap-6 whitespace-nowrap" aria-hidden>
        {run.map(([text, color], i) => (
          <span key={i} className={`font-display text-[8px] leading-none ${color}`}>
            {text}
            <span className="ml-6 text-ball/60">·</span>
          </span>
        ))}
      </div>
    </div>
  );
}
