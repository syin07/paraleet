// M1 placeholder bird. The real procedural parakeet (PRD section 6) replaces this in M2; keep
// the props so screens do not change when it does.

const O = '#FFA116'; // body
const B = '#FFC766'; // belly
const W = '#3E3E3E'; // wing and tail
const K = '#1A1A1A'; // outline and eye
const C = '#F5E6C8'; // beak and feet
const G = '#2CBB5D'; // cheek

// A 16x16 sketch, one string per row. '.' is transparent.
const ROWS = [
  '................',
  '.....kkkkk......',
  '....kooooook....',
  '...kooooooook...',
  '...kookoooook...',
  '..ckooogoooook..',
  '..ccoooooooook..',
  '...koobbboowwk..',
  '...kobbbbbowwk..',
  '...kobbbbbowwk..',
  '...kobbbbbowwk..',
  '....kobbboowwk..',
  '.....kooookwwk..',
  '......c..c.kwk..',
  '.....cc.cc..kk..',
  '................',
];

const COLORS: Record<string, string> = { o: O, b: B, w: W, k: K, c: C, g: G };

export function PetPlaceholder({ size = 160 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      role="img"
      aria-label="Para the parakeet"
      className="pixelated shrink-0"
    >
      {ROWS.flatMap((row, y) =>
        [...row].map((cell, x) => {
          const fill = COLORS[cell];
          return fill ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} /> : null;
        }),
      )}
    </svg>
  );
}
