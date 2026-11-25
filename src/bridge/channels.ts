// Channel names shared by the preload script and the main process. Kept free of imports so the
// sandboxed preload stays tiny. `contract.ts` checks at compile time that this list matches it.

export const IPC_PREFIX = 'paraleet:';

/** Sent from main to every window when data changed or the ParaLeet day rolled over. */
export const CHANGED_EVENT = 'paraleet:changed';

/** Sent from main to the main window to move it to a screen, for example `/settings` or `/today/swap`. */
export const NAVIGATE_EVENT = 'paraleet:navigate';

export const BRIDGE_METHODS = [
  'getToday',
  'swapToday',
  'getSwapCandidates',
  'openProblem',
  'openSolutionLink',
  'getReportContext',
  'revealKeyInsight',
  'submitReport',
  'listLoggedProblems',
  'getProblemDetail',
  'saveProblemNotes',
  'retireCard',
  'resetCard',
  'searchProblems',
  'parseProblemUrl',
  'addProblem',
  'setEquippedAccessories',
  'acknowledgeGreeting',
  'showMainWindow',
  'movePetWindowBy',
  'endPetDrag',
  'setPetInteractive',
  'showPetMenu',
  'getSettings',
  'updateSettings',
] as const;

export type BridgeMethodName = (typeof BRIDGE_METHODS)[number];
