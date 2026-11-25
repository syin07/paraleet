// The use-case layer: one handler per bridge method. Electron-free, so it is unit-tested directly.
import type { BridgeHandlers, Done } from '../../bridge/contract';
import { paraDayOf } from '../../core/day';
import { getNotes } from '../../data/repos/notes';
import { getProblem } from '../../data/repos/problems';
import { getSettings, updateSettings } from '../../data/repos/settings';
import type { AppContext } from './context';
import { applyImport, cancelImport, chooseImport, exportData, getDataInfo, showDataInFinder } from './data';
import { acknowledgeGreeting, completeOnboarding } from './pet';
import { skipRemindersAlreadyPassed } from './reminders';
import {
  activatePlan,
  archivePlan,
  deletePlan,
  generatePlan,
  getPlan,
  getPlanOverview,
  getPlanSwapOptions,
  movePlanItem,
  removeApiKey,
  removePlanItem,
  saveApiKey,
  swapPlanItem,
  testApiKey,
} from './plans';
import {
  addProblem,
  getProblemDetail,
  listLoggedProblems,
  parseProblemUrl,
  resetCard,
  retireCard,
  saveProblemNotes,
  searchProblems,
} from './problems';
import { getReportContext, revealKeyInsight, submitReport } from './report';
import { getStats } from './stats';
import { getSwapCandidates, getToday, setEquippedAccessories, swapToday } from './today';

export {
  newSession,
  type AppContext,
  type FilePort,
  type ImportOutcome,
  type ModelAccess,
  type Notice,
  type SecretStore,
  type SessionState,
  type WindowPort,
} from './context';
export { createMoodWatcher, nextCelebrationStep, trayState } from './pet';
export { PlanError } from './plans';
export { reconcile, type ReconcileResult } from './reconcile';
export { sendDueReminder } from './reminders';

/**
 * The UI never hands main a URL to open. Main opens only links stored in the database, and only
 * http and https ones.
 */
function isWebLink(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function done(action: () => void): Done {
  action();
  return { ok: true };
}

export function createHandlers(ctx: AppContext): BridgeHandlers {
  return {
    getToday: () => getToday(ctx),
    swapToday: ({ problemId }) => swapToday(ctx, problemId),
    getSwapCandidates: () => getSwapCandidates(ctx),
    openProblem: async ({ problemId }) => {
      const problem = getProblem(ctx.db, problemId);
      if (!problem || !isWebLink(problem.url)) return { opened: false };
      await ctx.openExternal(problem.url);
      return { opened: true };
    },
    openSolutionLink: async ({ problemId }) => {
      const url = getNotes(ctx.db, problemId).solutionUrl;
      if (!url || !isWebLink(url)) return { opened: false };
      await ctx.openExternal(url);
      return { opened: true };
    },
    getReportContext: ({ problemId }) => getReportContext(ctx, problemId),
    revealKeyInsight: ({ problemId }) => revealKeyInsight(ctx, problemId),
    submitReport: (input) => submitReport(ctx, input),
    listLoggedProblems: () => listLoggedProblems(ctx),
    getProblemDetail: ({ problemId }) => getProblemDetail(ctx, problemId),
    saveProblemNotes: (input) => saveProblemNotes(ctx, input),
    retireCard: ({ problemId }) => retireCard(ctx, problemId),
    resetCard: ({ problemId }) => resetCard(ctx, problemId),
    searchProblems: (input) => searchProblems(ctx, input),
    parseProblemUrl: ({ url }) => parseProblemUrl(ctx, url),
    addProblem: (input) => addProblem(ctx, input),
    setEquippedAccessories: ({ accessories }) => setEquippedAccessories(ctx, accessories),
    acknowledgeGreeting: () => acknowledgeGreeting(ctx, getToday),
    showMainWindow: ({ screen }) => done(() => ctx.windows.showMain(screen)),
    showSwap: () => done(() => ctx.windows.showSwap()),
    movePetWindowBy: ({ dx, dy }) => done(() => ctx.windows.movePetBy(dx, dy)),
    endPetDrag: () => done(() => ctx.windows.endPetDrag()),
    setPetInteractive: ({ interactive }) => done(() => ctx.windows.setPetInteractive(interactive)),
    showPetMenu: () => done(() => ctx.windows.showPetMenu()),
    showCard: ({ anchor }) => done(() => ctx.windows.showCard(anchor)),
    hideCard: () => done(() => ctx.windows.hideCard()),
    setCardSize: ({ width, height }) => done(() => ctx.windows.setCardSize(width, height)),
    completeOnboarding: (input) => completeOnboarding(ctx, input, getToday, skipRemindersAlreadyPassed),
    getPlanOverview: () => getPlanOverview(ctx),
    generatePlan: (input) => generatePlan(ctx, input),
    getPlan: ({ planId }) => getPlan(ctx, planId),
    removePlanItem: (input) => removePlanItem(ctx, input),
    movePlanItem: (input) => movePlanItem(ctx, input),
    getPlanSwapOptions: (input) => getPlanSwapOptions(ctx, input),
    swapPlanItem: (input) => swapPlanItem(ctx, input),
    activatePlan: ({ planId }) => activatePlan(ctx, planId),
    archivePlan: ({ planId }) => archivePlan(ctx, planId),
    deletePlan: ({ planId }) => deletePlan(ctx, planId),
    saveApiKey: ({ apiKey }) => saveApiKey(ctx, apiKey),
    removeApiKey: () => removeApiKey(ctx),
    testApiKey: () => testApiKey(ctx),
    getStats: ({ range }) => getStats(ctx, range),
    getDataInfo: () => getDataInfo(ctx),
    exportData: () => exportData(ctx),
    chooseImport: () => chooseImport(ctx),
    applyImport: () => applyImport(ctx),
    cancelImport: () => cancelImport(ctx),
    showDataInFinder: () => showDataInFinder(ctx),
    getSettings: () => getSettings(ctx.db),
    updateSettings: (patch) => {
      const settings = updateSettings(ctx.db, patch);
      ctx.notifyChanged();
      return settings;
    },
  };
}

/**
 * Watches for the ParaLeet day rolling over. Call `check` on a timer and when the Mac wakes: long
 * timers are not trusted (PRD section 9), so the day is recomputed from the clock every time.
 */
export function createDayWatcher(ctx: AppContext): { check(): boolean } {
  let lastSeen: string | null = null;
  return {
    check() {
      const settings = getSettings(ctx.db);
      const key = `${paraDayOf(ctx.clock.now(), ctx.clock.timeZone(), settings.dayBoundaryHour)}|${ctx.clock.timeZone()}`;
      const changed = lastSeen !== null && key !== lastSeen;
      lastSeen = key;
      if (changed) ctx.notifyChanged();
      return changed;
    },
  };
}
