# 0012. Wiring the living pet into the app

Date: 2026-11-25. Issue: SAN-116. PRD sections 6, 10 and 11. Builds on 0011 (the rules) and 0010 (the pet window).

## Context

The rules for Para's mood, lines, unlocks and reminders are pure functions in `src/core`. This is how the app feeds them and what it has to remember to do so.

## Decisions

1. **Mood and line are computed on every read, never stored.** `petSummary` in `src/main/services/pet.ts` calls `deriveMood` and `pickLine` with the clock, the settings, the stored streak facts and today's open problem. The same summary feeds Today, the floating pet and (later) the menu bar icon.

2. **The celebration lives in memory.** After a report the service puts `{ meal, reportedAt }` in `ctx.session.celebration`. `deriveMood` turns that into checking, then eating or nibbling, then the normal mood. A restart skips the show; nothing about it is worth a database write.

3. **Main tells the windows when the mood changes.** Two mechanisms, both small:
   - After every change notice, main asks `nextCelebrationStep` and sets one short timer (two to five seconds) for the next step of the celebration. With the test clock no timer is set; tests move the clock and the same notice follows.
   - On the 30-second tick, `createMoodWatcher` compares the mood with the last one seen and sends a change notice when it differs (a reminder time passed, night fell).
   Screens never run their own clocks for this; they redraw when told.

4. **"Missed you" shows once per absence.** `pet.greeted_day` records the ParaLeet day the greeting was seen. Para has been greeted when that day is after the last fed day, so someone who opens the app every day without solving is greeted once, not daily. Feeding Para ends the greeting by itself.

5. **Seeing the greeting means a person was there.** It counts as seen when the pointer has been on the floating bird or the bird was clicked, or when Today has been open and in front for five seconds. A timer alone would "acknowledge" it on a Mac nobody is sitting at.

6. **Accessory unlocks are decided inside the report's transaction** with `unlockedAfterAttempt`, after the attempt is recorded, so the Hard-problem check sees it. The report's answer lists what was newly unlocked so the screen can say so.

7. **Stored unlocks must contain what replaying the attempts gives.** `replayUnlocks` folds the attempts in order exactly as reporting them would. A test checks equality after every report of a mixed month. At launch `reconcile` adds anything the attempts earned that is not stored, and never removes one.

8. **Migration 002** adds `pet.greeted_day`, `pet.reminder_first_day` and `pet.reminder_evening_day` (the reminder days are for SAN-117), marks a pet that has already been fed as hatched (so people who used the app before the first-launch flow existed are not sent through it), and adds the catalog's bookkeeping for M3 (`problems.solved_count`, `catalog_sources`) so that schema work lands once.

9. **The bubble says two things.** Para's line is in its own voice and does not always name the problem. The PRD asks for the problem and platform when not fed and the streak when fed, so the floating pet's bubble shows the line and, under it, that plain fact, unless the line already says it. During the short shows (checking, eating, nibbling, the greeting) only the line is shown.

10. **Growth and unlocks are announced on Today** with a toast after the report ("Para grew into a chick!", "New for Para: Bow tie. Put it on in Settings."). The stage and mood are also written under the bird.

## Alternatives rejected

- **Storing the mood, or a "celebrating until" time, in the database:** the PRD says mood is derived; a stored value would have to be kept in step with the clock.
- **Letting each screen time the celebration itself:** three windows with three timers drift apart, and the main process already knows the times.
- **Greeting every day until fed:** "missed you" from a bird that saw you yesterday reads as a nag.

## Limits

- The graduation cap needs plans (M3). Until then `plansFinished` is 0 everywhere.
