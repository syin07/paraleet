// What the use-case layer needs from the outside world. Nothing in src/main/services imports
// Electron, so every service runs under the unit-test runner with a real SQLite database.
import type { CardAnchor, MainScreen } from '../../bridge/contract';
import { effectiveToday, paraDayOf } from '../../core/day';
import type { Celebration } from '../../core/pet';
import type { Settings } from '../../core/settings';
import type { ParaDay } from '../../core/types';
import type { Db } from '../../data/db';
import { ensurePet, type PetRecord } from '../../data/repos/pet';
import { getSettings } from '../../data/repos/settings';
import type { Clock } from '../clock';

/** What the services ask of the windows. Implemented with Electron in main, faked in tests. */
export interface WindowPort {
  showMain(screen: MainScreen | null): void;
  movePetBy(dx: number, dy: number): void;
  /** The drag ended: remember where the pet window is. */
  endPetDrag(): void;
  setPetInteractive(interactive: boolean): void;
  showPetMenu(): void;
  /** Opens the compact card beside the pet or under the menu bar icon; a second call from the same place closes it. */
  showCard(anchor: CardAnchor): void;
  hideCard(): void;
  setCardSize(width: number, height: number): void;
}

/** What the app remembers only while it is running. */
export interface SessionState {
  /** The most recent report, while Para may still be checking it or eating. */
  celebration: Celebration | null;
}

export function newSession(): SessionState {
  return { celebration: null };
}

export interface AppContext {
  db: Db;
  clock: Clock;
  windows: WindowPort;
  session: SessionState;
  /** Tells every window that data changed, so they refetch. */
  notifyChanged(): void;
  /** Opens a link in the default browser. */
  openExternal(url: string): Promise<void>;
  /** A random 31-bit integer, used once to give a new pet its seed. */
  randomSeed(): number;
}

export interface Moment {
  now: Date;
  timeZone: string;
  settings: Settings;
  pet: PetRecord;
  /** The ParaLeet day the app treats as today. */
  today: ParaDay;
}

/** Reads the clock, the settings and the pet once, so one request sees one consistent "now". */
export function currentMoment(ctx: AppContext): Moment {
  const now = ctx.clock.now();
  const timeZone = ctx.clock.timeZone();
  const settings = getSettings(ctx.db);
  const pet = ensurePet(ctx.db, ctx.randomSeed(), now.toISOString());
  const today = effectiveToday(paraDayOf(now, timeZone, settings.dayBoundaryHour), pet.lastFedDay);
  return { now, timeZone, settings, pet, today };
}
