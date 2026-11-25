# 0017. Stats, and export and import

Date: 2026-11-25. Issues: SAN-124 (Stats) and SAN-132 (export and import). PRD sections 10, 11 and 12 (M4).

## Context

The Stats screen shows solves per week, topic coverage, a calendar heatmap of fed days and the streaks. Settings exports and imports the whole database as one file.

## Decisions: Stats

1. **The rules are in core** (`buildStats` in `src/core/stats.ts`), pure, with today as an argument. The service (`src/main/services/stats.ts`) reads the attempts with each problem's topics and adds the streaks. One bridge method, `getStats({ range })`, returns everything the screen shows.

2. **A solve is an attempt rated Hard, Good or Easy.** A fed day is a day with any attempt, also one rated Again, because honest reporting must never cost anything (PRD section 4).

3. **The heatmap counts different problems per day,** not attempts: 0, 1, 2, 3, 4 or more (the tokens `heat-0` to `heat-4`). Two attempts on one problem in a day count once, so the tooltip can say "2 problems" and mean it.

4. **The weekly bars count solves.** Topic coverage counts the different problems solved in each topic, over all time, most first; ties keep the fixed list's order.

5. **Weeks start on Monday, in ParaLeet days.** Each attempt carries the ParaLeet day it was made on, so the 04:00 boundary is already applied. Ranges are 12, 26 and 53 week columns, the current week included.

6. **Attempts dated after today count in the totals but never light a future day** or a week's bar. They can only exist after a clock error; hiding them from the calendar keeps it honest.

7. **Streaks are not computed twice.** The current and the longest streak come from the pet facts (`displayedStreak` for the current one), the same numbers Today, the card and the menu bar show.

8. **Nothing scolds** (PRD section 5): no goal lines, no "missed" markers, no count of days not fed. A day with nothing shows only its date.

## Alternatives rejected

- **Computing stats in SQL:** the week and range arithmetic is date logic that core already owns and tests with injected time.
- **Counting attempts per day:** simpler, but a second try on the same problem would read as a second problem.
- **A chart library:** two small charts do not justify a dependency; they are drawn with plain elements.
