# 0011. Pet rules: stages, moods, voice, accessories, reminders

Date: 2026-11-25. Issues: SAN-112, SAN-113, SAN-128. PRD sections 6 and 11.

## Context

The PRD fixes the moods, the growth thresholds, the voice and the two reminders. It leaves a number of small questions open. These are the answers, with the reason for each.

## Decisions

1. **The egg stage is Para peeking out of a cracked shell.** The PRD has both an egg stage (until 3 growth solves) and a hatching on first launch. A closed egg cannot show a mood, so on first launch the egg cracks open (a separate short animation, `renderHatching`) and from then on the "egg" stage is the bird in the lower half of its shell, with eyes, beak and cheek visible.

2. **A second, smaller meal: `nibbling`.** The PRD's moods end at Eating; an attempt rated Again "only nibbles a crumb". That is its own mood in code (`nibbling`: shorter, a crumb, no hearts), so the sprite and the timing can treat it apart from `eating`.

3. **Four accessories: scarf, bow tie, crown, graduation cap,** for the PRD's four milestones in order: first Hard, 7-day streak, 30-day streak, first plan finished. Crown and cap both sit on the head; worn together, only the cap is drawn.

4. **"First Hard" means the first Hard problem solved,** not the first attempt rated Hard. The rating "Hard" describes how the attempt felt and is given often; a milestone should mark something achieved. A problem is Hard when its normalized difficulty is 4 or 5 (LeetCode Hard, Codeforces 1900 and up), and "solved" means a growth solve (rated Hard, Good or Easy).

5. **An attempt rated Again unlocks nothing, including streak milestones.** Again keeps the streak, so the attempt that takes the streak to 7 can be an Again. The PRD says Again "does not unlock accessories", so callers use `unlockedAfterAttempt`, which returns the list unchanged for Again; the next attempt with any other rating picks up whatever has been earned. Unlocks are never taken away.

6. **A fed Para sleeps from 23:00 to 06:00 local time, whatever the day boundary.** The first version tied the sleep window to the day boundary hour, which made a fed bird sleep all day for a late boundary. Night is night on the wall clock. Unfed moods are measured in minutes into the ParaLeet day, so 01:00 with a 04:00 boundary is still "evening, hungry".

7. **Reminder times out of order are tolerated:** the later of the two is treated as the evening one. Settings does not refuse the combination.

8. **One notification after a late wake.** If the evening reminder is due and the first was never sent, only the evening one is sent and both are marked sent.

9. **Lines never repeat two days running, by construction.** Each mood's pool is split by position: even days pick from even positions, odd days from odd ones, and the pick within the half is a hash of the bird's seed, the day and the mood. A line's position never changes, so two consecutive days cannot pick the same line even when what is eligible changes (a problem assigned one day and not the next). Each half of every pool keeps at least one line with no placeholder. Lines that name the problem need both title and platform; lines that name the streak need a streak of 2 or more.

10. **Voice rules are tested.** No template may contain guilt words ("missed" outside the missed-you greeting, "late", "finally", "overdue", "behind", "should") or any digit other than the streak. Fed lines do not claim a solve, because Para is fed by any attempt, including Again.

11. **Seed traits:** cheek shape, cheek color (green or red), wing barring, belly shade and tail length. The silhouette and the orange body never vary. The palette is the PRD's, plus a few named supporting colors (a lighter gray for wing feather edges so the barring reads on a dark desktop, white for the eye glint, effect colors).

## Alternatives rejected

- **A closed egg until 3 growth solves:** three or more days of a pet with no face, at exactly the time the habit is being formed.
- **Scarf for the first attempt rated Hard:** it would unlock on day one for most people and mean nothing.
- **Remembering yesterday's line in the database to avoid repeats:** a stored value for something a pure function can guarantee.
