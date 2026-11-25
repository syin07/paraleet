// What the use-case layer needs from the outside world. Nothing in src/main/services imports
// Electron, so every service runs under the unit-test runner with a real SQLite database.
import type { CardAnchor, MainScreen } from '../../bridge/contract';
import { effectiveToday, paraDayOf } from '../../core/day';
import type { Celebration } from '../../core/pet';
import type { Settings } from '../../core/settings';
import type { ParaDay } from '../../core/types';
import type { Db } from '../../data/db';
import type { DatabaseSummary } from '../../data/transfer';
import type { LlmClient } from '../../llm/planGenerator';
import { ensurePet, type PetRecord } from '../../data/repos/pet';
import { getSettings } from '../../data/repos/settings';
import type { Clock } from '../clock';

/** What the services ask of the windows. Implemented with Electron in main, faked in tests. */
export interface WindowPort {
  showMain(screen: MainScreen | null): void;
  /** Shows the main window on Today with the swap choices open. */
  showSwap(): void;
  movePetBy(dx: number, dy: number): void;
  /** The drag ended: remember where the pet window is. */
  endPetDrag(): void;
  setPetInteractive(interactive: boolean): void;
  showPetMenu(): void;
  /** Opens the compact card beside the pet or under the menu bar icon; a second call from the same place closes it. */
  showCard(anchor: CardAnchor): void;
  hideCard(): void;
  setCardSize(width: number, height: number): void;
  /** Opens the compact card and leaves it open: beside the pet when it is showing, else under the menu bar icon. */
  openCard(): void;
}

/** A system notification. */
export interface Notice {
  title: string;
  body: string;
  /** Called when the user clicks the notification. */
  onClick(): void;
}

/** What the last launch did with a staged import. */
export type ImportOutcome = { status: 'applied' } | { status: 'rejected'; reason: string };

/** What the app remembers only while it is running. */
export interface SessionState {
  /** The most recent report, while Para may still be checking it or eating. */
  celebration: Celebration | null;
  /**
   * The file the user picked to import, checked and waiting for a yes or no. Main keeps the path:
   * the UI never hands main a file path.
   */
  pendingImport: { path: string; summary: DatabaseSummary } | null;
  /** Set at launch when an import was applied or refused, so Settings can say so. */
  lastImport: ImportOutcome | null;
}

export function newSession(lastImport: ImportOutcome | null = null): SessionState {
  return { celebration: null, pendingImport: null, lastImport };
}

/**
 * The system's file dialogs and Finder. Main implements it with Electron; tests script it. A
 * dialog answers null when the user cancels.
 */
export interface FilePort {
  /** Asks where to save a file, offering `suggestedName`. */
  chooseSavePath(suggestedName: string): Promise<string | null>;
  /** Asks for a database file to open. */
  chooseOpenPath(): Promise<string | null>;
  /** Shows a file in Finder. */
  reveal(path: string): void;
}

/**
 * Where the Anthropic API key lives: encrypted with the operating system's keychain, outside the
 * database, never in logs (PRD section 9). Main implements it; tests use an in-memory fake.
 */
export interface SecretStore {
  /** False when the system cannot encrypt, in which case no key is ever stored. */
  available(): boolean;
  getApiKey(): string | null;
  setApiKey(key: string): void;
  clearApiKey(): void;
}

/** How the app reaches a model. Main supplies the real client; tests supply saved answers. */
export interface ModelAccess {
  client(apiKey: string): LlmClient;
  /** The model IDs this key may use. Throws `LlmError` when the key is not accepted. */
  listModels(apiKey: string): Promise<string[]>;
}

export interface AppContext {
  db: Db;
  clock: Clock;
  secrets: SecretStore;
  models: ModelAccess;
  windows: WindowPort;
  files: FilePort;
  session: SessionState;
  /** Tells every window that data changed, so they refetch. */
  notifyChanged(): void;
  /** Shows a system notification. */
  notify(notice: Notice): void;
  /** Opens a link in the default browser. */
  openExternal(url: string): Promise<void>;
  /** A random 31-bit integer, used once to give a new pet its seed. */
  randomSeed(): number;
  /** Quits the app and starts it again. Used once an import is staged: it is applied at launch. */
  restart(): void;
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
