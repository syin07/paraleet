// The Stats screen's numbers (PRD section 11). The rules are in core (`buildStats`); this reads
// the attempts with each problem's topics and adds the streaks, which the pet facts already hold.
import type { StatsView } from '../../bridge/contract';
import { buildStats, type StatsRange } from '../../core/stats';
import { displayedStreak } from '../../core/streak';
import { listStatsAttempts } from '../../data/repos/attempts';
import { currentMoment, type AppContext } from './context';

export function getStats(ctx: AppContext, range: StatsRange): StatsView {
  const { pet, today } = currentMoment(ctx);
  const stats = buildStats({ attempts: listStatsAttempts(ctx.db), today, range });
  return {
    ...stats,
    today,
    streak: {
      // The same number Today, the card and the menu bar show: 0 once a day was missed.
      current: displayedStreak({ current: pet.currentStreak, longest: pet.longestStreak, lastFedDay: pet.lastFedDay }, today),
      longest: pet.longestStreak,
    },
  };
}
