import type { AccessoryId, GrowthStage } from '../types';
import type { ColorName } from './palette';
import type { Effect, EffectKind, Pose } from './moods';
import { COLOR_INDEX } from './palette';
import { Grid, inEllipse, SIZE } from './raster';
import { STAGES, type Ellipse, type StageSpec } from './stages';
import { BELLY_COLOR, TAIL_FACTOR, type Barring, type CheekShape, type SpriteTraits } from './traits';

// The drawing code. Layers go on in a fixed order: tail, body, belly, wing, feet, head, face,
// shell, accessories, items. Then the body gets rim shading and the whole silhouette gets a
// one pixel outline, and finally the floating effects (hearts, Z's) go on top.

// ---- small shapes ---------------------------------------------------------------------------

type Rows = readonly string[];

const CHEEKS: Record<CheekShape, Rows> = {
  dot: ['cc', 'cc'],
  bar: ['cccc'],
  double: ['cc.', '...', '.cc'],
  crescent: ['.cc', 'c..', '.cc'],
};

const BEAK_BIG: Record<'closed' | 'open', Rows> = {
  closed: ['.eeee', 'ccccc', 'c.bbb'],
  open: ['.eeee', 'ccccc', 'c.mmm', '..bbb'],
};
const BEAK_SMALL: Record<'closed' | 'open', Rows> = {
  closed: ['.eee', 'cccc', 'c.bb'],
  open: ['.eee', 'cccc', 'c.mm', '..bb'],
};
const BEAK_FRONT: Record<'closed' | 'open', Rows> = {
  closed: ['eeee', '.cc.', '.bb.'],
  open: ['eeee', '.cc.', '.mm.', '.bb.'],
};
const BEAK_LEGEND = { e: 'cere', c: 'beak', b: 'beakShade', m: 'mouth' } as const;

const GLYPHS: Record<EffectKind, { rows: Rows; legend: Partial<Record<string, ColorName>> }> = {
  zSmall: { rows: ['XXX', '.X.', 'XXX'], legend: { X: 'sleepBlue' } },
  zBig: { rows: ['XXXX', '..X.', '.X..', 'XXXX'], legend: { X: 'sleepBlue' } },
  heartBig: { rows: ['.X.X.', 'XXXXX', '.XXX.', '..X..'], legend: { X: 'heart' } },
  heartSmall: { rows: ['X.X', 'XXX', '.X.'], legend: { X: 'heart' } },
  note: { rows: ['.XX', '.X.', '.X.', 'XX.'], legend: { X: 'note' } },
  question: { rows: ['XXX', '..X', '.X.', '...', '.X.'], legend: { X: 'mark' } },
  exclaim: { rows: ['X', 'X', 'X', '.', 'X'], legend: { X: 'mark' } },
  sparkle: { rows: ['.X.', 'XXX', '.X.'], legend: { X: 'sparkle' } },
  twinkle: { rows: ['X'], legend: { X: 'sparkle' } },
  seedThought: { rows: ['.XXX.', 'XllsX', 'XsssX', '.XXX.'], legend: { X: 'beak', l: 'seedLight', s: 'seed' } },
  dot1: { rows: ['X'], legend: { X: 'note' } },
  dots2: { rows: ['X.X'], legend: { X: 'note' } },
  dots3: { rows: ['X.X.X'], legend: { X: 'note' } },
};

const SEED_ROWS: Rows = ['lls', 'sss'];
const CRUMB_ROWS: Rows = ['ll'];

// ---- the look: traits turned into drawing choices -------------------------------------------

export interface Look {
  traits: SpriteTraits;
}

function barred(barring: Barring, x: number, y: number): boolean {
  switch (barring) {
    case 'stripes':
      return y % 3 === 0;
    case 'scallops': {
      const col = (x + (Math.floor(y / 4) % 2) * 2) % 4;
      const row = y % 4;
      return (row === 0 && (col === 1 || col === 2)) || (row === 1 && (col === 0 || col === 3));
    }
    case 'spots':
      return y % 3 === 0 && (x + (Math.floor(y / 3) % 2) * 2) % 4 === 0;
    case 'chevrons': {
      const k = ((x % 6) + 6) % 6;
      return y % 4 === Math.min(k, 5 - k);
    }
  }
}

// ---- layers ---------------------------------------------------------------------------------

function drawTail(g: Grid, spec: StageSpec, look: Look): void {
  const tail = spec.tail;
  if (!tail) return;
  const length = Math.max(1, Math.round(tail.base * TAIL_FACTOR[look.traits.tailLength]));
  for (let i = 0; i < length; i++) {
    const t = length === 1 ? 0 : i / (length - 1);
    const width = Math.max(2, Math.round(tail.w0 + (tail.w1 - tail.w0) * t));
    const left = Math.round(tail.x + tail.slope * i - width / 2);
    for (let k = 0; k < width; k++) {
      const bar = i % 3 === 2 && (k + i) % 2 === 0;
      g.set(left + k, tail.y + i, bar ? 'wingBar' : 'wing');
    }
  }
}

function inBody(spec: StageSpec, x: number, y: number, lean: number, breath: boolean): boolean {
  const b = breath ? 0.5 : 0;
  const c = spec.chest;
  const r = spec.rump;
  return (
    inEllipse(x, y, c.cx - lean, c.cy, c.rx + b, c.ry) || inEllipse(x, y, r.cx, r.cy, r.rx + b, r.ry)
  );
}

function drawBody(g: Grid, spec: StageSpec, look: Look, pose: Pose): void {
  const b = pose.breath ? 0.5 : 0;
  const c = spec.chest;
  const r = spec.rump;
  g.ellipse(r.cx, r.cy, r.rx + b, r.ry, 'body');
  g.ellipse(c.cx - pose.lean, c.cy, c.rx + b, c.ry, 'body');
  const belly = spec.belly;
  g.ellipse(belly.cx - pose.lean, belly.cy, belly.rx, belly.ry, BELLY_COLOR[look.traits.bellyShade], 0, (x, y) =>
    inBody(spec, x, y, pose.lean, pose.breath),
  );
}

function drawWing(g: Grid, spec: StageSpec, look: Look, pose: Pose): void {
  if (!spec.wing || !spec.wingUp) return;
  let w: Ellipse = spec.wing;
  if (pose.wing === 'ruffle') w = { ...spec.wing, cy: spec.wing.cy - 1, angle: (spec.wing.angle ?? 0) - 8 };
  if (pose.wing === 'upA') w = spec.wingUp[0];
  if (pose.wing === 'upB') w = spec.wingUp[1];
  const angle = w.angle ?? 0;
  const cos = Math.cos((angle * Math.PI) / 180);
  const sin = Math.sin((angle * Math.PI) / 180);
  // The chick has only a nub of a wing, so it gets no barring.
  const bars = spec.tail !== null && spec.tail.base > 2;
  g.ellipse(
    w.cx,
    w.cy,
    w.rx,
    w.ry,
    (x, y) => {
      if (!inEllipse(x - 1, y - 1, w.cx, w.cy, w.rx, w.ry, cos, sin)) return 'wingLight';
      return bars && barred(look.traits.barring, x, y) ? 'wingBar' : 'wing';
    },
    angle,
  );
}

function drawFeet(g: Grid, spec: StageSpec): void {
  if (!spec.feet) return;
  for (const x of spec.feet.xs) {
    g.stamp(['.b.', 'bbb'], x, spec.feet.y, { b: 'beakShade' });
  }
}

function headTopRow(spec: StageSpec): number {
  const { cx, cy, rx, ry } = spec.head;
  for (let y = 0; y < SIZE; y++) if (inEllipse(cx, y, cx, cy, rx, ry)) return y;
  return Math.floor(cy - ry);
}

function headBottomRow(spec: StageSpec): number {
  const { cx, cy, rx, ry } = spec.head;
  for (let y = SIZE - 1; y >= 0; y--) if (inEllipse(cx, y, cx, cy, rx, ry)) return y;
  return Math.ceil(cy + ry);
}

function drawEye(g: Grid, ex: number, ey: number, state: Pose['eyes'], tilt = 0): void {
  const y = ey + tilt;
  switch (state) {
    case 'open':
      g.stamp(['wo', 'oo'], ex, y, { o: 'outline', w: 'white' });
      break;
    case 'blink':
      g.stamp(['oo'], ex, y + 1, { o: 'outline' });
      break;
    case 'closed':
      g.stamp(['ooo'], ex - 1, y + 1, { o: 'outline' });
      break;
    case 'happy':
      g.stamp(['.o.', 'o.o'], ex - 0, y, { o: 'outline' });
      break;
    case 'narrow':
      g.stamp(['oo', '..'], ex, y + 1, { o: 'outline' });
      g.stamp(['.ooo'], ex - 1, y - 1, { o: 'outline' });
      break;
  }
}

function drawCheek(g: Grid, shape: CheekShape, x: number, y: number, color: ColorName, mirror = false): void {
  const rows = mirror ? CHEEKS[shape].map((row) => [...row].reverse().join('')) : CHEEKS[shape];
  g.stamp(rows, x, y, { c: color });
}

function drawHead(g: Grid, spec: StageSpec, look: Look, pose: Pose): void {
  const h = spec.head;
  const hx = h.cx;
  const hy = h.cy;
  const cheekColor: ColorName = look.traits.cheekColor === 'green' ? 'cheekGreen' : 'cheekRed';
  const inHead = (x: number, y: number): boolean => inEllipse(x, y, h.cx, h.cy, h.rx, h.ry);
  const top = headTopRow(spec);

  g.ellipse(h.cx, h.cy, h.rx, h.ry, (x, y) => {
    // A shaded line where the head's underside meets the body, so the head reads as round.
    if (!inHead(x, y + 1) && g.at(x + g.ox, y + 1 + g.oy) > 0) return 'bodyShade';
    return 'body';
  });
  // The lighter face mask around the beak and forehead.
  g.ellipse(h.cx - 5, h.cy + 1, 2.6, 3.4, 'highlight', 0, (x, y) => inHead(x, y) && y > top);

  if (pose.face === 'front') {
    const tilt = pose.tilt ? 1 : 0;
    drawEye(g, hx - 4, hy + spec.eye[1], pose.eyes);
    drawEye(g, hx + 2, hy + spec.eye[1], pose.eyes, tilt);
    drawCheek(g, look.traits.cheekShape, hx - 6, hy + 1, cheekColor);
    drawCheek(g, look.traits.cheekShape, hx + 5 - CHEEKS[look.traits.cheekShape][0]!.length + 1, hy + 1 + tilt, cheekColor, true);
    g.stamp(BEAK_FRONT[pose.beak], hx - 2 + (pose.tilt ? 1 : 0), hy - 1 + (pose.tilt ? 1 : 0), BEAK_LEGEND);
  } else {
    drawEye(g, hx + spec.eye[0], hy + spec.eye[1], pose.eyes);
    drawCheek(g, look.traits.cheekShape, hx + spec.cheek[0], hy + spec.cheek[1], cheekColor);
    const rows = (spec.smallBeak ? BEAK_SMALL : BEAK_BIG)[pose.beak];
    g.stamp(rows, hx + spec.beak[0], hy + spec.beak[1], BEAK_LEGEND);
  }

  if (spec.tuft) {
    g.set(hx - 1, top - 1, 'body');
    g.set(hx, top - 2, 'body');
    g.set(hx + 1, top - 1, 'body');
  }
}

// ---- the egg shell --------------------------------------------------------------------------

/** The whole egg: a wide lower ellipse under a narrower upper one. */
export function inEgg(x: number, y: number): boolean {
  return inEllipse(x, y, 16, 19.5, 10.5, 10) || inEllipse(x, y, 16, 14.5, 8.5, 8.5);
}

// The jagged top edge of the lower half of the shell, as rows above or below 21 for x = 5 to 27.
// Low and calm on the left, where the beak is, and tall on the right, where the crack runs.
const RIM_TEETH = [-1, 0, -1, 0, -1, 1, -1, -2, 0, 1, -1, -2, 0, 1, -1, -3, -1, 0, -2, -3, 0, 1, 0];
export function rimY(x: number): number {
  return 21 + (RIM_TEETH[Math.min(Math.max(x - 5, 0), RIM_TEETH.length - 1)] ?? 0);
}

function shadedEgg(g: Grid, keep: (x: number, y: number) => boolean, dx = 0, dy = 0): void {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (!inEgg(x, y) || !keep(x, y)) continue;
      const edgeR = !inEgg(x + 1, y) || !keep(x + 1, y);
      const edgeB = !inEgg(x, y + 1) || !keep(x, y + 1);
      g.set(x + dx, y + dy, edgeR || edgeB ? 'shellShade' : 'shell');
    }
  }
}

function drawShell(g: Grid): void {
  shadedEgg(g, (x, y) => y >= rimY(x));
  // One crack running down from the rim.
  for (const [x, y] of [
    [19, 23],
    [20, 24],
    [19, 25],
    [20, 26],
  ] as const) {
    g.set(x, y, 'cere');
  }
}

/** The whole egg for the hatching animation, with `cracks` crack lines and a sideways wobble. */
export function drawWholeEgg(g: Grid, cracks: number, dx: number): void {
  shadedEgg(g, () => true, dx);
  const lines: readonly (readonly (readonly [number, number])[])[] = [
    [[13, 9], [14, 10], [13, 11], [14, 12], [13, 13]],
    [[19, 14], [18, 15], [19, 16], [18, 17], [19, 18]],
    [[7, 21], [9, 20], [11, 22], [13, 21], [15, 23], [17, 21], [19, 22], [21, 20], [23, 22], [25, 21]],
  ];
  lines.slice(0, cracks).forEach((line) => {
    for (const [x, y] of line) g.set(x + dx, y, 'cere');
  });
}

/** The top of the egg flung off: only the cap above the cut line, lifted and tilted away. */
export function drawEggCap(g: Grid): void {
  shadedEgg(g, (x, y) => y < 13, 3, -4);
}

// ---- accessories ----------------------------------------------------------------------------

const CROWN: Rows = ['g.g.g', 'ggggg', 'dgjgd'];
const CROWN_LEGEND = { g: 'gold', d: 'goldDark', j: 'jewel' } as const;
const CAP: Rows = ['..bbbbb..', 'bbbbbbbbb', '..ddddd..'];
const CAP_LEGEND = { b: 'capBoard', d: 'capBand' } as const;
const SCARF: Rows = ['ssssssss', 'sdsdsdsd', '......ss', '......sd', '......ss'];
const SCARF_LEGEND = { s: 'scarf', d: 'scarfDark' } as const;
const BOW: Rows = ['bb.bb', 'bbkbb', 'bb.bb'];
const BOW_LEGEND = { b: 'bow', k: 'bowDark' } as const;

function drawAccessories(g: Grid, spec: StageSpec, accessories: readonly AccessoryId[]): void {
  const hx = spec.head.cx;
  const top = headTopRow(spec);
  const bottom = headBottomRow(spec);
  const has = (id: AccessoryId): boolean => accessories.includes(id);
  if (has('scarf')) g.stamp(SCARF, hx + spec.scarf[0], bottom - 1 + spec.scarf[1], SCARF_LEGEND);
  if (has('bow_tie')) g.stamp(BOW, hx + spec.bow[0], bottom + spec.bow[1], BOW_LEGEND);
  // A cap and a crown cannot share one head: the cap wins.
  if (has('grad_cap')) {
    g.stamp(CAP, hx + spec.cap[0], top - 2 + spec.cap[1], CAP_LEGEND);
    g.set(hx + spec.cap[0] + 8, top, 'gold');
    g.set(hx + spec.cap[0] + 8, top + 1, 'gold');
    g.set(hx + spec.cap[0] + 4, top - 2, 'gold');
  } else if (has('crown')) {
    g.stamp(CROWN, hx + spec.crown[0], top - 2 + spec.crown[1], CROWN_LEGEND);
  }
}

// ---- the whole bird -------------------------------------------------------------------------

export interface DrawOptions {
  stage: GrowthStage;
  look: Look;
  pose: Pose;
  accessories: readonly AccessoryId[];
  /** Extra layers drawn in front of the bird, before shading and the outline (the flung egg cap). */
  extra?: (g: Grid) => void;
}

/** Rim shading on the orange: the right edge and the underside are a little darker. */
function shade(g: Grid): void {
  const snapshot = g.cells.slice();
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= SIZE || y >= SIZE ? 0 : (snapshot[y * SIZE + x] ?? 0));
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (at(x, y) !== BODY_INDEX) continue;
      if (at(x + 1, y) === 0 || at(x, y + 1) === 0) g.cells[y * SIZE + x] = SHADE_INDEX;
    }
  }
}

export function outlineGrid(g: Grid): void {
  const snapshot = g.cells.slice();
  const filled = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < SIZE && y < SIZE && (snapshot[y * SIZE + x] ?? 0) !== 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (filled(x, y)) continue;
      if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
        g.cells[y * SIZE + x] = OUTLINE_INDEX;
      }
    }
  }
}

const BODY_INDEX = COLOR_INDEX.body;
const SHADE_INDEX = COLOR_INDEX.bodyShade;
const OUTLINE_INDEX = COLOR_INDEX.outline;

export function drawBird({ stage, look, pose, accessories, extra }: DrawOptions): Grid {
  const spec = STAGES[stage];
  const g = new Grid();

  // Everything the bird is made of lifts when it hops.
  g.oy = -pose.hop;
  drawTail(g, spec, look);
  drawBody(g, spec, look, pose);
  drawWing(g, spec, look, pose);
  drawFeet(g, spec);

  g.ox = pose.head[0];
  g.oy = pose.head[1] - pose.hop;
  drawHead(g, spec, look, pose);

  // The shell sits in front of the bird, and accessories go on top of both.
  const headShift: [number, number] = [g.ox, g.oy];
  g.ox = 0;
  g.oy = 0;
  if (stage === 'egg') drawShell(g);
  [g.ox, g.oy] = headShift;
  drawAccessories(g, spec, accessories);
  g.ox = 0;
  g.oy = 0;
  extra?.(g);
  if (pose.item) {
    g.stamp(pose.item.kind === 'seed' ? SEED_ROWS : CRUMB_ROWS, pose.item.x, pose.item.y, {
      s: 'seed',
      l: 'seedLight',
    });
  }

  shade(g);
  outlineGrid(g);
  for (const effect of pose.effects) drawEffect(g, effect);
  return g;
}

export function drawEffect(g: Grid, effect: Effect): void {
  const glyph = GLYPHS[effect.kind];
  g.stamp(glyph.rows, effect.x, effect.y, glyph.legend);
}
