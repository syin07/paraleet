# 0008. How the daily loop is wired in the main process

Date: 2026-11-25. Status: accepted. Issue: SAN-111.

## Context

M1's pieces were built separately: day and streak rules, the scheduler, the assignment policy, the platform adapters and two screens. This records the choices made when joining them in `src/main/services/`.

## Decision

- **One report, one transaction.** `submitReport` verifies the attempt, then in a single transaction appends the attempt, saves the key insight, creates or updates the review card, updates the pet facts and marks today's assignment done if it was that problem. If any step fails, nothing is saved and the user sees the error.
- **Every attempt schedules the card**, including one rated Again and including attempts on a retired card (the card's memory updates and it stays retired).
- **Today's assignment is chosen lazily**, the first time a day is asked about, and then kept for the whole day. Days the app was not opened get no assignment.
- **Swap rules.** A swap is allowed only to one of the offered candidates (the other due reviews, then the next plan problems), and not once today's problem is done. A swap is stored with the reason `user_swap`, which also breaks the run of three review days that gives the plan a turn. The app cannot tell a review-for-review swap from any other, and the reason list is fixed by the PRD.
- **Any attempt feeds the pet.** Quick-logging a different problem marks the day fed but leaves today's assignment open as an optional extra.
- **Reconcile at launch.** `reconcile()` runs once before any window opens. It recomputes the streak and totals from the attempts and corrects the stored values if they differ, and it rebuilds review cards for problems that have attempts but no card by replaying their attempts through the scheduler. It never changes attempts, and it does nothing when the data already agrees. It logs one line when it had to fix something.
- **The scheduler uses the real ParaLeet day**, from the clock. The streak uses `effectiveToday`, which can hold the day at the last fed day after a move to an earlier time zone. The two can differ by a day in that one case, which only moves a due date by a day.
- **Links open by ID.** The UI asks main to open a problem or a saved solution link by problem ID; main opens the stored link.

## Alternatives rejected

- **Choosing tomorrow's problem ahead of time**: it would go stale when the user logs more problems tonight.
- **A separate "swapped review" reason**: the PRD lists four reasons, and the extra precision buys little.
- **Repairing derived data silently on every write**: a launch-time check is enough, is cheap to reason about and leaves a log line.

## Consequences

- A database from an older version of the app (attempts but no cards) heals itself on first launch.
- End-to-end tests cover: report, restart, day rollover, a due review taking the slot, swap, and quick-log.
