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
  'showSwap',
  'movePetWindowBy',
  'endPetDrag',
  'setPetInteractive',
  'showPetMenu',
  'showCard',
  'hideCard',
  'setCardSize',
  'completeOnboarding',
  'getPlanOverview',
  'generatePlan',
  'getPlan',
  'removePlanItem',
  'movePlanItem',
  'getPlanSwapOptions',
  'swapPlanItem',
  'activatePlan',
  'archivePlan',
  'deletePlan',
  'saveApiKey',
  'removeApiKey',
  'testApiKey',
  'getStats',
  'getDataInfo',
  'exportData',
  'chooseImport',
  'applyImport',
  'cancelImport',
  'showDataInFinder',
  'getSettings',
  'updateSettings',
] as const;

export type BridgeMethodName = (typeof BRIDGE_METHODS)[number];

/**
 * How main answers every bridge call: the value, or a message that can be shown to the user as
 * it is. A failure travels as data, not as a rejected call, because Electron rewrites the message
 * of a rejected call ("Error invoking remote method ...").
 */
export type BridgeReply = { ok: true; value: unknown } | { ok: false; message: string };

/** The preload's half: hands back the value, or throws an error with main's message. */
export function unwrapReply(reply: unknown): unknown {
  if (typeof reply === 'object' && reply !== null && 'ok' in reply) {
    const answer = reply as BridgeReply;
    if (answer.ok) return answer.value;
    throw new Error(answer.message);
  }
  throw new Error('ParaLeet did not answer. Try again.');
}
