// Every color the sprite may use, by name. Pixels are stored as indexes into COLOR_NAMES, so a
// pixel can only ever be one of these (the unit tests check the bytes against this object).

export const PALETTE = {
  // The bird (PRD section 6).
  body: '#FFA116',
  bodyShade: '#E8870A', // rim shading on the back and underside, keeps the body round
  highlight: '#FFC766', // forehead and face mask
  bellyPale: '#FFF6E0', // the three belly shades, picked by seed: all clearly lighter than the body
  bellyCream: '#FFE29E',
  bellyHoney: '#FFC766',
  wing: '#3E3E3E',
  wingBar: '#262626',
  wingEdge: '#5A5A5A', // feather edges, used sparingly so the barring reads at 96 px
  outline: '#1A1A1A', // also the eye
  cheekGreen: '#2CBB5D',
  cheekRed: '#EF4743',
  beak: '#F5E6C8',
  beakShade: '#D8C294', // lower beak and the feet's toes
  cere: '#C9A56B', // the slightly darker patch above the beak
  mouth: '#7A2B2B', // inside of an open beak
  white: '#FFFFFF', // the eye glint, and nothing else
  // The egg shell.
  shell: '#FFF1D6',
  shellShade: '#E9D3AA',
  // Things in the scene.
  seed: '#8A5A2B',
  seedLight: '#C48A4A',
  heart: '#FF4F7B',
  sleepBlue: '#6FA8FF',
  note: '#B58CFF',
  sparkle: '#FFD83D',
  mark: '#FF6B3D', // question and exclamation marks
  // Accessories.
  gold: '#FFD23F',
  goldDark: '#D9A400',
  jewel: '#E5484D',
  capBoard: '#3B4256',
  capBand: '#2B3040',
  scarf: '#4C8DF6',
  scarfDark: '#2F62C4',
  bow: '#8E5BE0',
  bowDark: '#6234B5',
} as const;

export type ColorName = keyof typeof PALETTE;
export const COLOR_NAMES = Object.keys(PALETTE) as ColorName[];

/** Index into COLOR_NAMES plus one, so that 0 can mean transparent. */
export const COLOR_INDEX: Record<ColorName, number> = Object.fromEntries(
  COLOR_NAMES.map((name, i) => [name, i + 1]),
) as Record<ColorName, number>;

/** RGB bytes by color index (index 0 is unused). */
export const COLOR_RGB: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  ...COLOR_NAMES.map((name): [number, number, number] => {
    const hex = PALETTE[name];
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
  }),
];
