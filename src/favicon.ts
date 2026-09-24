// A 16×16 tennis ball with its seam, drawn in code like everything else.
const ART = [
  '.....oooooo.....',
  '...oobbbbbboo...',
  '..obbhhbbbbwbo..',
  '.obhhhbbbbwbbbo.',
  '.obhhbbbbwbbbbo.',
  'obhhbbbbwbbbbbbo',
  'obbbbbbwbbbbbbbo',
  'obbbbbwbbbbbbbbo',
  'obbbbwbbbbbbbbbo',
  'obbbwbbbbbbbbbdo',
  'obbwbbbbbbbbbddo',
  '.owbbbbbbbbbddo.',
  '.obbbbbbbbbdddo.',
  '..obbbbbbbdddo..',
  '...oodddddddoo..',
  '.....oooooo.....',
];

const COLORS: Record<string, string> = {
  o: '#3d4a08',
  b: '#d6ef3a',
  h: '#f6ff9a',
  d: '#9ab416',
  w: '#fbfbf2',
};

/** Paints the ball at 2× and installs it as the page icon (seen outside Cribl). */
export function installFavicon() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ART.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (!COLORS[c]) return;
      ctx.fillStyle = COLORS[c];
      ctx.fillRect(x * 2, y * 2, 2, 2);
    }),
  );
  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = canvas.toDataURL('image/png');
  document.head.appendChild(link);
}
