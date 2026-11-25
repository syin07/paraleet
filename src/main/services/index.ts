// The use-case layer: one handler per bridge method. Electron-free, so it is unit-tested directly.
import type { BridgeHandlers } from '../../bridge/contract';
import { paraDayOf } from '../../core/day';
import { getNotes } from '../../data/repos/notes';
import { getProblem } from '../../data/repos/problems';
import { getSettings, updateSettings } from '../../data/repos/settings';
import type { AppContext } from './context';
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
import { getSwapCandidates, getToday, setEquippedAccessories, swapToday } from './today';

export type { AppContext } from './context';
export { reconcile, type ReconcileResult } from './reconcile';

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
