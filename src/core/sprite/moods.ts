import type { GrowthStage, Mood } from '../types';
import { STAGES } from './stages';

// Each mood is a short loop of poses. A pose says what moves; the drawing code does the rest.
// Anything a pose leaves out stays at rest, so the body stays planted between frames.

export type EyeState = 'open' | 'blink' | 'closed' | 'happy' | 'narrow';
export type BeakState = 'closed' | 'open';
export type WingState = 'folded' | 'ruffle' | 'upA' | 'upB';
export type EffectKind =
  | 'zSmall'
  | 'zBig'
  | 'heartBig'
  | 'heartSmall'
  | 'note'
  | 'question'
  | 'exclaim'
  | 'sparkle'
  | 'twinkle'
  | 'seedThought';

export interface Effect {
  kind: EffectKind;
  x: number;
  y: number;
}

export interface Pose {
  /** Whole bird lifted this many pixels (feet off the ground). */
  hop: number;
  /** Head offset from rest. */
  head: readonly [number, number];
  /** The chest leans this many pixels to the left; rump, tail and feet stay put. */
  lean: number;
  /** One pixel fuller across the body (sleeping breath). */
  breath: boolean;
  eyes: EyeState;
  /** 'front' turns the face to look at the viewer. */
  face: 'side' | 'front';
  tilt: boolean;
  beak: BeakState;
  wing: WingState;
  effects: readonly Effect[];
  item: { kind: 'seed' | 'crumb'; x: number; y: number } | null;
}

const REST: Pose = {
  hop: 0,
  head: [0, 0],
  lean: 0,
  breath: false,
  eyes: 'open',
  face: 'side',
  tilt: false,
  beak: 'closed',
  wing: 'folded',
  effects: [],
  item: null,
};

const pose = (changes: Partial<Pose>): Pose => ({ ...REST, ...changes });

type Maker = (stage: GrowthStage) => Pose[];

const SLEEPING: Maker = (stage) => {
  const [fx, fy] = STAGES[stage].fx;
  // Z's drift up and to the right; the small one leaves as the big one arrives.
  const frames: Pose[] = [];
  for (let f = 0; f < 6; f++) {
    const effects: Effect[] = [];
    if (f <= 3) effects.push({ kind: 'zSmall', x: fx + f, y: fy + 8 - Math.round(f * 1.5) });
    if (f >= 2) effects.push({ kind: 'zBig', x: fx + 2 + (f - 2), y: fy + 6 - Math.round((f - 2) * 1.5) });
    frames.push(pose({ head: [1, 2], eyes: 'closed', breath: f >= 3, effects }));
  }
  return frames;
};

const CONTENT: Maker = (stage) => {
  const [fx, fy] = STAGES[stage].fx;
  return [
    pose({}),
    pose({ hop: 1 }),
    pose({ wing: 'ruffle' }),
    pose({ beak: 'open', effects: [{ kind: 'note', x: fx, y: fy + 8 }] }),
    pose({ beak: 'open', effects: [{ kind: 'note', x: fx + 1, y: fy + 5 }] }),
    pose({ eyes: 'blink' }),
  ];
};

const PECKISH: Maker = (stage) => {
  const [fx, fy] = STAGES[stage].fx;
  const ask: Effect = { kind: 'question', x: fx + 1, y: fy + 2 };
  return [
    pose({ face: 'front' }),
    pose({ face: 'front', tilt: true }),
    pose({ face: 'front', tilt: true, effects: [ask] }),
    pose({ face: 'front', eyes: 'blink', effects: [ask] }),
  ];
};

const HUNGRY: Maker = (stage) => {
  const [fx, fy] = STAGES[stage].fx;
  const thought: Effect = { kind: 'seedThought', x: fx + 3, y: fy };
  return [
    pose({ head: [-1, 1], lean: 1, beak: 'open', wing: 'upA', effects: [thought] }),
    pose({ head: [-2, 2], lean: 1, effects: [thought] }),
    pose({ head: [-1, 1], lean: 1, beak: 'open', wing: 'upB', effects: [thought] }),
    pose({ head: [-2, 2], lean: 1 }),
  ];
};

const CHECKING: Maker = () => [
  pose({ head: [-2, 1], eyes: 'narrow' }),
  pose({ head: [-1, 1], eyes: 'narrow' }),
  pose({ head: [0, 1], eyes: 'narrow' }),
  pose({ head: [-1, 1], eyes: 'narrow' }),
];

const EATING: Maker = (stage) => {
  const spec = STAGES[stage];
  const [fx, fy] = spec.fx;
  const [dx, dy] = spec.dip;
  const [sx, sy] = spec.seedAt;
  const seed = { kind: 'seed' as const, x: sx, y: sy };
  const half: [number, number] = [Math.round(dx / 2), Math.round(dy / 2)];
  return [
    pose({ item: seed }),
    pose({ head: half, beak: 'open', item: seed }),
    pose({ head: [dx, dy], beak: 'open', item: seed }),
    pose({ head: [dx, dy], eyes: 'happy' }),
    pose({ head: half, eyes: 'happy', beak: 'open', effects: [{ kind: 'heartBig', x: fx, y: fy + 8 }] }),
    pose({
      eyes: 'happy',
      effects: [
        { kind: 'heartBig', x: fx + 1, y: fy + 4 },
        { kind: 'heartSmall', x: fx + 6, y: fy + 9 },
      ],
    }),
  ];
};

const NIBBLING: Maker = (stage) => {
  const spec = STAGES[stage];
  const [dx, dy] = spec.dip;
  const [sx, sy] = spec.seedAt;
  const crumb = { kind: 'crumb' as const, x: sx + 1, y: sy + 1 };
  const small: [number, number] = [Math.round(dx / 2), Math.round(dy / 2)];
  return [
    pose({ item: crumb }),
    pose({ head: small, item: crumb }),
    pose({ item: crumb, eyes: 'blink' }),
    pose({ head: small, beak: 'open' }),
  ];
};

const MISSED_YOU: Maker = (stage) => {
  const [fx, fy] = STAGES[stage].fx;
  const mark: Effect = { kind: 'exclaim', x: fx + 5, y: fy + 1 };
  return [
    pose({
      eyes: 'happy',
      beak: 'open',
      wing: 'upA',
      effects: [mark, { kind: 'sparkle', x: fx, y: fy + 6 }, { kind: 'twinkle', x: fx + 6, y: fy + 9 }],
    }),
    pose({
      hop: 1,
      eyes: 'happy',
      beak: 'open',
      wing: 'upB',
      effects: [mark, { kind: 'twinkle', x: fx, y: fy + 6 }, { kind: 'sparkle', x: fx + 6, y: fy + 9 }],
    }),
    pose({
      eyes: 'happy',
      beak: 'open',
      wing: 'upB',
      effects: [mark, { kind: 'sparkle', x: fx, y: fy + 6 }, { kind: 'twinkle', x: fx + 6, y: fy + 9 }],
    }),
    pose({
      hop: 1,
      eyes: 'happy',
      beak: 'open',
      wing: 'upA',
      effects: [mark, { kind: 'twinkle', x: fx, y: fy + 6 }, { kind: 'sparkle', x: fx + 6, y: fy + 9 }],
    }),
  ];
};

const MAKERS: Record<Mood, Maker> = {
  sleeping: SLEEPING,
  content: CONTENT,
  peckish: PECKISH,
  hungry: HUNGRY,
  checking: CHECKING,
  eating: EATING,
  nibbling: NIBBLING,
  missed_you: MISSED_YOU,
};

export function posesFor(stage: GrowthStage, mood: Mood): Pose[] {
  return MAKERS[mood](stage);
}

export { REST as REST_POSE };
