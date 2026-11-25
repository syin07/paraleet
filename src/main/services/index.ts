// The use-case layer: one handler per bridge method. Electron-free, so it is unit-tested directly.
import type { BridgeHandlers } from '../../bridge/contract';
import { paraDayOf } from '../../core/day';
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
import { getSwapCandidates, getToday, swapToday } from './today';

export type { AppContext } from './context';

export function createHandlers(ctx: AppContext): BridgeHandlers {
  return {
    getToday: () => getToday(ctx),
    swapToday: ({ problemId }) => swapToday(ctx, problemId),
    getSwapCandidates: () => getSwapCandidates(ctx),
    openProblem: async ({ problemId }) => {
      const problem = getProblem(ctx.db, problemId);
      // Only links stored in the database are opened, and only web links.
      if (!problem || !/^https?:\/\//i.test(problem.url)) return { opened: false };
      await ctx.openExternal(problem.url);
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
