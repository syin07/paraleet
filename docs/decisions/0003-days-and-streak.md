# 0003. ParaLeet days, time zones and the streak

Date: 2026-11-25. Status: accepted.

## Context

The streak must be right across the 04:00 boundary, missed days, sleep and time-zone changes (PRD sections 4, 6, 9, 10).

## Decision

- A ParaLeet day is the local calendar date on which it started, written `YYYY-MM-DD`. `paraDayOf(instant, timeZone, boundaryHour)` computes it with `Intl.DateTimeFormat`; no date library.
- Each attempt stores its ParaLeet day as computed at the moment it was made, in the zone the user was in. The streak is arithmetic on those date strings.
- Stored streak facts: `current_streak` (as of `last_fed_day`), `longest_streak`, `last_fed_day`. Shown values are derived:
  - fed today when `last_fed_day >= today`;
  - displayed streak is `current_streak` while `today - last_fed_day <= 1`, otherwise 0.
- **Moving to an earlier time zone** can make the computed day step back behind a day already fed. `effectiveToday` keeps the app's day at the last fed day in that case (only within 2 days, so a badly wrong system clock cannot freeze the app). The pet does not turn hungry again and no day is counted twice.
- **Moving to a later time zone** shortens the current day. If a whole calendar date is skipped (for example across the date line), that day counts as missed. No special handling.
- The current time zone is read from macOS on every call (`/etc/localtime`), not from the JavaScript engine, which can hold a stale zone in a long-running process.
- The day is recomputed on a 30-second tick and on wake and unlock. No long timers.
- Changing the day-boundary setting takes effect at once and never rewrites past attempts.
- Every attempt creates or updates the problem's review card, including one rated Again. A problem the user could not solve is exactly the one that should come back soon.
- Days the app was not open get no assignment row. Assignments are never backfilled.

## Known limit: a clock that was wrong in the future

If an attempt is logged while the system clock is far ahead, `last_fed_day` lands in the future. After the clock is corrected the pet would look fed, and new attempts would not move the streak, until real time caught up. SAN-105 adds the guard: a last fed day more than 2 days ahead of today is treated as a clock error, so the pet is not fed and the next attempt starts a streak of 1 on the real day.

## Alternatives rejected

- **Storing days in UTC or as offsets from install time**: wrong at the boundary for anyone who travels.
- **Recomputing every attempt's day in the current zone**: past days would shift when the user moves, changing a streak after the fact.
- **A streak-repair rule for date-line crossings**: rare, and any rule is exploitable by changing the clock.

## Consequences

- `recomputePetFacts(attempts)` is the reference: stored facts must always equal it, and tests check that.
