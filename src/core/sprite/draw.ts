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

// A small hooked beak tucked against the face: the upper beak curves down over a shorter lower one.
const BEAK: Record<'closed' | 'open', Rows> = {
  closed: ['.ee', 'ccc', 'cb.'],
  open: ['.ee', 'ccc', 'cm.', '.b.'],
};
const BEAK_FRONT: Record<'closed' | 'open', Rows> = {
  closed: ['eeee', '.cc.', '.bb.'],
  open: ['eeee', '.cc.', '.mm.', '.bb.'],
};
const BEAK_LEGEND = { e: 'cere', c: 'beak', b: 'beakShade', m: 'mouth' } as const;

const GLYPHS: Record<EffectKind, { rows: Rows; legend: Partial<Record<string, ColorName>> }> = {
  zSmall: { rows: ['XXXX', '..X.', '.X..', 'XXXX'], legend: { X: 'sleepBlue' } },
  zBig: { rows: ['XXXXX', '...X.', '..X..', '.X...', 'XXXXX'], legend: { X: 'sleepBlue' } },
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

function drawTail(g: Grid, spec: StageSpec, look: Look, clip?: (x: number, y: number) => boolean): void {
  const tail = spec.tail;
  if (!tail) return;
  const length = Math.max(1, Math.round(tail.base * TAIL_FACTOR[look.traits.tailLength]));
  for (let i = 0; i < length; i++) {
    const t = length === 1 ? 0 : i / (length - 1);
    const width = Math.max(2, Math.round(tail.w0 + (tail.w1 - tail.w0) * t));
    const left = Math.round(tail.x + tail.slope * i - width / 2);
    for (let k = 0; k < width; k++) {
      const bar = i % 3 === 2 && (k + i) % 2 === 0;
      if (clip && !clip(left + k, tail.y + i)) continue;
      g.set(left + k, tail.y + i, bar ? 'wingBar' : 'wing');
    }
  }
}

function inSpec(e: Ellipse, x: number, y: number, dx = 0, grow = 0): boolean {
  const a = ((e.angle ?? 0) * Math.PI) / 180;
  return inEllipse(x, y, e.cx - dx, e.cy, e.rx + grow, e.ry, Math.cos(a), Math.sin(a));
}

function inBody(spec: StageSpec, x: number, y: number, lean: number, puff: number): boolean {
  return inSpec(spec.chest, x, y, lean, puff) || inSpec(spec.rump, x, y, 0, puff);
}

function drawBody(g: Grid, spec: StageSpec, look: Look, pose: Pose): void {
  const c = spec.chest;
  const r = spec.rump;
  g.ellipse(r.cx, r.cy, r.rx + pose.puff, r.ry, 'body', r.angle ?? 0);
  g.ellipse(c.cx - pose.lean, c.cy, c.rx + pose.puff, c.ry, 'body', c.angle ?? 0);
  const belly = spec.belly;
  g.ellipse(belly.cx - pose.lean, belly.cy, belly.rx, belly.ry, BELLY_COLOR[look.traits.bellyShade], 0, (x, y) =>
    inBody(spec, x, y, pose.lean, pose.puff),
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
  const bars = spec.wingBars;
  const barring = look.traits.barring;
  const wingIdx = [COLOR_INDEX.wing, COLOR_INDEX.wingBar];
  // A dark line where the wing's edge meets the tail, so the two read as separate shapes.
  g.ellipse(
    w.cx,
    w.cy,
    w.rx + 1,
    w.ry + 1,
    'outline',
    angle,
    (x, y) => !inEllipse(x, y, w.cx, w.cy, w.rx, w.ry, cos, sin) && wingIdx.includes(g.at(x + g.ox, y + g.oy)),
  );
  g.ellipse(
    w.cx,
    w.cy,
    w.rx,
    w.ry,
    (x, y) => {
      if (!inEllipse(x - 1, y - 1, w.cx, w.cy, w.rx, w.ry, cos, sin)) return 'wingEdge';
      if (!bars) return 'wing';
      if (barred(barring, x, y)) return 'wingBar';
      // The light edge of a feather sits just below its dark bar, on alternate pixels only.
      return (x + y) % 2 === 0 && barred(barring, x, y - 1) ? 'wingEdge' : 'wing';
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

function drawEye(g: Grid, ex: number, ey: number, state: Pose['eyes'], big: boolean, tilt = 0): void {
  const y = ey + tilt;
  const w = big ? 3 : 2;
  const line = 'o'.repeat(w);
  switch (state) {
    case 'open':
      g.stamp(big ? ['woo', 'ooo', 'oo.'] : ['wo', 'oo'], ex, y, { o: 'outline', w: 'white' });
      break;
    case 'blink':
      g.stamp([line], ex, y + 1, { o: 'outline' });
      break;
    case 'closed':
      g.stamp([line], ex, y + (big ? 2 : 1), { o: 'outline' });
      break;
    case 'happy':
      g.stamp(['.o.', 'o.o'], ex, y + (big ? 1 : 0), { o: 'outline' });
      break;
    case 'narrow':
      g.stamp([line], ex, y + 1, { o: 'outline' });
      g.stamp(['.ooo', 'o...'], ex - 1, y - 1, { o: 'outline' });
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
  g.ellipse(h.cx - 4.5, h.cy + 1.5, 2.6, 3.2, 'highlight', 0, (x, y) => inHead(x, y) && y > top);

  if (pose.face === 'front') {
    const tilt = pose.tilt ? 1 : 0;
    const big = spec.bigEye;
    drawEye(g, hx - (big ? 5 : 4), hy + spec.eye[1] + (big ? 1 : 0), pose.eyes, big);
    drawEye(g, hx + 2, hy + spec.eye[1] + (big ? 1 : 0), pose.eyes, big, tilt);
    drawCheek(g, look.traits.cheekShape, hx - 6, hy + 1, cheekColor);
    drawCheek(g, look.traits.cheekShape, hx + 5 - CHEEKS[look.traits.cheekShape][0]!.length + 1, hy + 1 + tilt, cheekColor, true);
    g.stamp(BEAK_FRONT[pose.beak], hx - 2 + (pose.tilt ? 1 : 0), hy - 1 + (pose.tilt ? 1 : 0), BEAK_LEGEND);
  } else {
    drawEye(g, hx + spec.eye[0], hy + spec.eye[1], pose.eyes, spec.bigEye);
    drawCheek(g, look.traits.cheekShape, hx + spec.cheek[0], hy + spec.cheek[1], cheekColor);
    g.stamp(BEAK[pose.beak], hx + spec.beak[0], hy + spec.beak[1], BEAK_LEGEND);
  }

  if (spec.tuft) {
    // One small curl: a column two high with a nub beside it, so the tip is a single pixel.
    g.set(hx, top - 1, 'body');
    g.set(hx, top - 2, 'body');
    g.set(hx + 1, top - 1, 'body');
  }
}

// ---- the egg shell --------------------------------------------------------------------------

/** The whole egg: a wide lower ellipse under a narrower upper one. */
export function inEgg(x: number, y: number): boolean {
  // One smooth curve, widest at row 18 and a little wider below it than above, so there are no seams.
  const dy = y + 0.5 - 18;
  const u = dy / (dy < 0 ? 12 : 11.5);
  if (Math.abs(u) > 1) return false;
  const halfWidth = 10.2 * Math.sqrt(1 - u * u) * (1 + 0.15 * u);
  return Math.abs(x + 0.5 - 16) <= halfWidth;
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
    [21, 24],
    [22, 25],
    [21, 26],
    [22, 27],
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
const SCARF: Rows = ['ssssssss', 'sdsdsdsd', '......ss', '......sd'];
// The band alone, longer, for when a bow tie covers its front end.
const SCARF_BAND: Rows = ['ssssssssss', 'sdsdsdsdsd'];
const SCARF_LEGEND = { s: 'scarf', d: 'scarfDark' } as const;
const BOW: Rows = ['bb.bb', 'bbkbb', 'bb.bb'];
const BOW_LEGEND = { b: 'bow', k: 'bowDark' } as const;

/** A dark ring around a stamp's pixels, so it stands out from whatever it lies on. */
function outlineStamp(g: Grid, rows: Rows, x: number, y: number): void {
  const filled = (dx: number, dy: number): boolean => rows[dy]?.[dx] !== undefined && rows[dy]?.[dx] !== '.';
  for (let dy = -1; dy <= rows.length; dy++) {
    for (let dx = -1; dx <= (rows[0]?.length ?? 0); dx++) {
      if (filled(dx, dy)) continue;
      if (filled(dx - 1, dy) || filled(dx + 1, dy) || filled(dx, dy - 1) || filled(dx, dy + 1)) g.set(x + dx, y + dy, 'outline');
    }
  }
}

function drawAccessories(g: Grid, spec: StageSpec, accessories: readonly AccessoryId[]): void {
  const hx = spec.head.cx;
  const top = headTopRow(spec);
  const bottom = headBottomRow(spec);
  const has = (id: AccessoryId): boolean => accessories.includes(id);
  const both = has('scarf') && has('bow_tie');
  // Worn together, the scarf is only a band and the bow tie sits on it, outlined, at the throat.
  if (has('scarf')) g.stamp(both ? SCARF_BAND : SCARF, hx + spec.scarf[0], bottom - 1 + spec.scarf[1], SCARF_LEGEND);
  if (has('bow_tie')) {
    const bx = hx + spec.bow[0];
    const by = bottom + spec.bow[1] - (both ? 1 : 0);
    if (both) outlineStamp(g, BOW, bx, by);
    g.stamp(BOW, bx, by, BOW_LEGEND);
  }
  // A cap and a crown cannot share one head: the cap wins.
  if (has('grad_cap')) {
    g.stamp(CAP, hx + spec.cap[0], top - 1 + spec.cap[1], CAP_LEGEND);
    g.set(hx + spec.cap[0] + 8, top + 1, 'gold');
    g.set(hx + spec.cap[0] + 8, top + 2, 'gold');
    g.set(hx + spec.cap[0] + 4, top - 1, 'gold');
  } else if (has('crown')) {
    g.stamp(CROWN, hx + spec.crown[0], top - 1 + spec.crown[1], CROWN_LEGEND);
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
  // A puffed-up body must not paint over the tail: put the tail back wherever the rested body is not.
  if (pose.puff > 0) drawTail(g, spec, look, (x, y) => !inBody(spec, x, y, 0, 0));
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
