# 0007. Review scheduling with FSRS

Date: 2026-11-25. Status: accepted. Issue: SAN-106.

## Context

PRD section 5 asks for FSRS through an existing library, one card per problem, with reviews that are full re-solves. A re-solve happens at most once a day, at any hour.

## Decision

- `src/core/scheduler.ts` wraps `ts-fsrs` 6. Its same-day learning steps and its random fuzz are turned off, so every interval is a whole number of days and the same input always gives the same schedule.
- The library is run in "day space". It measures the gap between reviews in UTC calendar days, which would make the next interval depend on the time of day the user re-solves. So it is only ever given noon-UTC dates built from ParaLeet days, and the stored state keeps the last review as a ParaLeet day (`lastReviewDay`), not an instant. Two attempts on one ParaLeet day are 0 days apart; an attempt on the next is 1.
- `dueAt` is an instant placed so that its ParaLeet day is exactly today plus the interval: start from now plus N times 24 hours, then nudge by whole hours across a clock change. If no such instant exists the scheduler throws instead of storing a wrong day.
- Stored card state is checked before use. Damaged state (wrong shape, out-of-range numbers) is scheduled as a new card. A last review dated after today is a clock error: the memory is kept and the gap counts as 0 days. Scheduling never throws because of stored state.
- Target retention must be between 0.7 and 0.97 (a `RangeError` otherwise). Settings validate the same range.
- The library's default maximum interval is kept. With default parameters at 0.85 retention, repeated Good gives about 4 days, 1 month, 6 months, 2 years; repeated Hard gives 2, 9, 23, 47, 81 days. Well-known problems leave the queue on their own, which keeps the backlog humane without a separate rule.
- Retiring keeps the card's state, so nothing is lost if the user resets later. Resetting gives a brand-new card due today.
- `dueDayOf` and `isDueOn` read only the due time and the status, never the scheduler state.

## Alternatives rejected

- **Passing real instants to the library**: intervals changed with the hour of the review (found in review, with a reproduction).
- **A yearly cap on intervals**: every mastered problem would return once a year forever, and reviews would crowd out new problems.
- **Writing the algorithm ourselves**: forbidden by the PRD, and pointless.

## Consequences

- The library's `fsrs().next()` API is marked deprecated in favor of a newer one in the same version. It works and is stable for v6; revisit on the next major upgrade.
- UI text must format long intervals in weeks, months or years, not raw days.
