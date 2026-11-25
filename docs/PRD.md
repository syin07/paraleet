# ParaLeet PRD

Nov 25, 2026 · @Sandy

## 1. Vision

ParaLeet is a Mac desktop app that makes daily algorithm practice stick. A pixel-art parakeet lives on your desktop, gets hungry once a day, and is fed only when you solve the problem it picked for you.

It solves four problems with practicing on LeetCode, CSES and Codeforces:

| Problem | ParaLeet's answer |
| --- | --- |
| Hard to follow a learning plan | Pick topics; the app builds a staged problem list across platforms |
| Hard to track what you solved | One local database of every problem and attempt, with tags and notes |
| Solutions are memorized, not internalized | Spaced repetition where a review means re-solving from scratch |
| Hard to stay consistent | A pet that reminds you, names today's problem, and links straight to it |

**Users.** One person (the owner) on one Mac. A second person, a friend on his own Mac, should be able to install and use it later with no shared server.

**The name.** Parakeet + LeetCode. The bird wears LeetCode's orange and dark gray instead of natural parakeet green.

## 2. Ownership charter (read this first, Claude)

**This codebase is yours.** The human owner has little full-stack experience and does not want to go deep into it. He cannot give you good advice on tools, stack, structure or libraries, and he will not review architecture. Every technical decision is yours to make and yours to live with.

What that means in practice:

- **Decide, don't ask.** Never ask the owner which library, framework, schema or pattern to use. Pick one, write down why, and move on.
- **Never stop work to ask.** This PRD has no open questions. When you meet a product detail it does not cover, pick the option that best fits sections 1 to 3, record it in the decision log, and keep building. Mention such choices in your end-of-session report so the owner can change them later.
- **Section 9 is a recommendation, not a mandate.** It records the stack chosen during planning and the reasons. If you find a better option while building, change it and record the decision.
- **Keep a decision log.** Add a short entry to `docs/decisions/` for every non-obvious choice: context, decision, alternatives rejected. You will be the one reading it in a later session with no memory of this one.
- **Optimize for your future self.** Later sessions start cold. Keep `README.md` (how to run, test, build) and `docs/ARCHITECTURE.md` (module map, data flow) accurate at the end of every session.
- **Prefer boring, well-documented technology.** Few dependencies, no clever abstractions, no infrastructure the owner would have to operate.
- **Leave it working.** Every session ends with tests passing, the app launching, and changes committed with clear messages.
- **Verify your own work.** Run the app and exercise the feature before calling it done. The owner will judge by using it, not by reading code.
- **Explain in product terms.** When you report to the owner, say what he can now do in the app and how to try it. Skip the implementation tour unless he asks.

Hard constraints you may not trade away:

1. The app runs entirely on the user's Mac. No hosted backend, no accounts, no server to keep alive.
2. All user data stays in a local database file the user can back up by copying.
3. The app is fully usable with no LLM key. Only learning-plan generation needs one.
4. Problem statements are never copied or stored. Store metadata and links only.
5. A second person can install it on another Mac without the owner's help beyond sending a file.

## 3. Scope

**Decisions already made by the owner**

| Topic | Decision |
| --- | --- |
| Audience | Owner only for now; one friend may try it later |
| Device | Mac only. No phone app, no phone widget |
| Verification | Self-report in v1. Automatic checking comes later |
| Pet stakes | A missed day resets the streak. That is the only penalty in the app |
| Stack | Claude's choice (section 2) |

**In scope for v1**

- Problem log across LeetCode, CSES and Codeforces, with tags, difficulty, notes and attempt history
- Daily problem assignment with a direct link
- Spaced-repetition scheduling of re-solves
- A desktop pet with hunger, a streak and reminders
- Topic-based learning plans generated with an LLM from a local problem catalog

**Out of scope for v1** (design so these can be added, but do not build them)

- Automatic verification through platform APIs or a browser extension
- Importing solve history from a LeetCode or Codeforces account
- Pet death, sickness, streak freezes or any penalty beyond the streak reset
- Sync between devices, accounts, social features, leaderboards
- An in-app code editor or judge
- Windows, Linux, iOS or Android builds

## 4. The daily loop

One loop is the product; every other feature feeds it.

1. A new ParaLeet day starts and the pet becomes hungry.
2. The app assigns today's problem and shows its title, platform, difficulty and a link.
3. The pet reminds the user until the problem is done (section 11).
4. The user clicks the link, solves the problem on the platform, and comes back.
5. The user reports the attempt: a rating, optional time taken, optional one-line key insight.
6. The pet "checks" the report with a short animation, eats, and the streak goes up.
7. The attempt updates the problem's review schedule and the learning plan's progress.

**Day boundary.** A ParaLeet day runs from 04:00 to 04:00 local time, so a solve at 01:00 counts for the previous day. The hour is a setting.

**How today's problem is chosen**, in order:

1. The most overdue review, if any review is due.
2. Otherwise the next unsolved problem in the active learning plan.
3. Otherwise the next problem from the built-in starter list (section 8).

The user can swap today's problem for another due review or plan item, or log any problem they solved on their own. Any logged attempt today feeds the pet.

**Daily goal.** One problem feeds the pet and keeps the streak. More problems that day are welcome and give the pet extra growth (section 6), but are never required.

**What counts as solved in v1.** The user's word. An attempt rated "Again" (needed the editorial) still counts for the day and keeps the streak, because honest reporting must never cost it. It earns a smaller reward than a real solve (section 6).

**Verification seam.** Feeding goes through a single `verifyAttempt` step. In v1 it always trusts the self-report. Later versions can plug in automatic checks without touching the pet or scheduler.

## 5. Spaced repetition

A review is a full re-solve of the problem on its platform, never a flashcard. Recognizing a problem is the short-term memorization this app exists to prevent.

**Scheduler.** Use FSRS through an existing open-source library rather than writing the algorithm. Each solved problem gets one review card. Target retention is a setting, default 0.85.

**Ratings.** After every attempt the user picks one of four, with these exact meanings shown in the UI:

| Rating | Meaning |
| --- | --- |
| Again | Could not solve it without reading the solution |
| Hard | Solved it, but needed a hint or got badly stuck |
| Good | Solved it alone with normal effort |
| Easy | Saw the approach immediately and coded it cleanly |

**Key insight note.** Each problem has one short free-text field: the trick in a sentence. The app asks for it after the first solve. During a review it stays hidden until the user reports the attempt or chooses to reveal it; revealing it before solving pre-selects "Hard" at best.

**Keeping the backlog humane.**

- Only one review is ever required per day.
- The app shows at most 5 due reviews at a time, most overdue first.
- Missing days never produces a guilt screen or a count of overdue items above that cap.
- A user can retire a card ("I've got this one") or reset it.

**Mixing reviews and new problems.** Reviews come first for the required daily slot. If reviews have filled the daily slot for 3 days running and a plan is active, the next day's slot goes to a new plan problem so the plan keeps moving.

**Later, not v1.** Scheduling by pattern: when a trick keeps failing, pull a different problem that uses the same trick. Store pattern tags on attempts now so this is possible.

## 6. The pet

The pet's only job is to make the user want to solve one problem today. It is always encouraging. The only penalty in the app is a streak reset after a missed day.

**Moods**

| Mood | When | Behavior |
| --- | --- | --- |
| Sleeping | Before the reminder time, or after being fed late at night | Eyes closed, slow breathing |
| Content | Fed today | Idle hops, preening, occasional chirp |
| Peckish | Not fed, reminder time has passed | Looks at the user, speech bubble with today's problem |
| Hungry | Not fed, evening | More animated, pecks at the screen edge, second reminder |
| Checking | User just reported an attempt | Inspects the report for about 2 seconds |
| Eating | Check passed | Eats a seed, hearts, streak counter ticks up |
| Missed you | First launch after one or more missed days | Excited greeting, no scolding |

**Streak.** Counts consecutive ParaLeet days with at least one attempt. A missed day resets the current streak to zero. That is the only consequence: no freezes, no sickness, no lost growth, no scolding. The longest streak and total solves stay visible.

**Growth.** Attempts rated Hard, Good or Easy are growth solves. They move the bird through four stages: egg, chick, fledgling, adult, at 0, 3, 15 and 50 growth solves. These thresholds are final. Growth never goes backward. Milestones (first Hard, 7-day streak, 30-day streak, first plan finished) unlock small accessories the user can toggle.

**Again earns a smaller reward.** An attempt rated Again keeps the streak and marks the day as fed, but Para only nibbles a crumb: a shorter eating animation with no hearts. It does not count as a growth solve and does not unlock accessories. Every other rating gets the full meal.

**Name.** The bird is named Para on every install. There is no naming step and no rename setting.

**Voice.** Speech bubbles are short, warm and a little funny. Never guilt, never sarcasm about missed days. Keep a pool of lines per mood so they do not repeat daily.

**Sprite: procedural pixel art, no image files**

- Draw on a 32×32 grid, scaled up with nearest-neighbor so pixels stay crisp.
- Compose the bird from layers defined in code: body, belly, head, cheek patch, eye, beak, wing, tail, feet.
- Each user gets a seed (random at first launch, stored). The seed varies small traits: cheek patch shape, wing barring pattern, belly shade, tail length. Two installs produce recognizably different birds.
- Animations are small frame sequences per mood, 2 to 6 frames each, at roughly 6 frames per second.
- The renderer is a pure function `(seed, stage, mood, frame, accessories) → pixel grid`, so it can be unit-tested and previewed.
- Ship a sprite gallery screen (dev-only is fine) showing every stage × mood for several seeds. Use it to check the art by eye.

**Sprite quality check.** Render the sprite gallery, screenshot it with Playwright, and look at it. Para must read as a parakeet at actual size (round head, hooked beak, long tail), each mood must be distinguishable at a glance, and animation must not jitter. Iterate on the drawing code until it does.

**Palette** (starting point; tune by eye, keep it recognizably LeetCode)

| Role | Color |
| --- | --- |
| Body, primary | `#FFA116` LeetCode orange |
| Belly, highlight | `#FFC766` |
| Wing, tail | `#3E3E3E` with `#262626` barring |
| Outline | `#1A1A1A` |
| Cheek patch | `#2CBB5D` or `#EF4743` (LeetCode's easy green or hard red, chosen by seed) |
| Beak, feet | `#F5E6C8` |

## 7. Learning plans

The user ticks the topics they are focusing on and gets an ordered, staged list of real problems across the platforms they chose.

**Rule: the LLM selects, it never invents.** Left to write freely, a model produces plausible problem titles and links that do not exist. The model only ever picks IDs from candidates the app hands it.

**Generation flow**

1. The user picks one or more topics from a fixed list (binary search, two pointers, sliding window, prefix sums, stacks, heaps, graphs BFS/DFS, shortest paths, union-find, trees, dynamic programming, greedy, backtracking, bit manipulation, math, strings, and so on).
2. The user picks platforms, a rough level (new to this, some practice, comfortable) and a target size (default about 20 problems per topic).
3. The app pulls candidate problems for each topic from the local catalog, with ID, title, platform, difficulty and tags, and marks those already solved.
4. The app sends the candidates to the model and asks for a structured plan.
5. The app validates the response: every problem ID must be in the candidate set, no duplicates, stages in the required shape. On failure it retries once with the error, then shows a plain error.
6. The user reviews the plan and can remove, reorder or swap problems before activating it.

**Plan shape per topic**

| Stage | Purpose | Typical size |
| --- | --- | --- |
| Foundations | Reps on the most basic form of the technique | 3 to 5 |
| Pattern groups | One group per common trick, each with a name and a one-sentence description of the trick | 2 to 4 groups of 3 to 4 |
| Challenge | Harder problems that combine tricks or hide the technique | 2 to 3 |

The group names and descriptions ("Binary search on the answer: guess a value, check feasibility") are written by the model and shown in the plan. They also become the pattern tags used in section 5.

**Using the plan.** One plan is active at a time. The daily loop draws new problems from it in order. Already-solved problems are skipped by default and offered as reviews instead. Progress shows per stage and per group.

**LLM details**

- Provider: Anthropic API, called from the app's main process with the user's own key.
- Model name is a setting with a sensible current default; look up the current model list when you build this.
- Request structured output and validate it with a schema.
- Each user supplies their own key. Without a key, the plan screen explains what is needed and the rest of the app works normally.
- Cost is small: one request per plan, a few thousand tokens.

## 8. Problem catalog and platforms

The catalog is a local table of problem metadata that plans and daily assignments draw from. It holds platform, platform ID, title, URL, difficulty and tags. It never holds problem statements.

**Sources**

| Platform | How to get metadata | Notes |
| --- | --- | --- |
| Codeforces | Official public API (`problemset.problems`) | Gives tags and ratings. Refresh on demand from inside the app |
| CSES | The public problem set listing | No API. Build the list once with a script and ship it as a data file. Tags come from CSES's own section names |
| LeetCode | No official API | Ship a curated data file. An unofficial GraphQL endpoint exists and can be used by a build-time script, but the app must not depend on it at runtime |

**Rules for seed data**

- Seed files are generated by scripts in the repo, checked in, and loaded on first launch.
- Do not write problem lists from memory. Every entry must come from a fetched source, and a script must check that IDs and URL slugs are well-formed and unique.
- If a source cannot be reached while building, ship a smaller verified catalog and note the gap. A small correct catalog beats a large one with dead links.
- Normalize each platform's tags onto the app's fixed topic list, and keep the original tags too.
- Difficulty is stored per platform as given (Easy/Medium/Hard, or a Codeforces rating) plus a normalized 1 to 5 value for sorting.

**Starter list.** A built-in ordered list of about 30 well-known easy and medium problems across core topics. It gives the daily loop something to assign before any plan exists.

**Manual add.** The user can add any problem by pasting its URL. The app recognizes the three platforms from the URL, fills what it can from the catalog, and lets the user type the rest. Unknown sites are accepted as platform "Other".

**Platform adapters.** Put everything platform-specific behind one interface per platform: recognize a URL, build a URL from an ID, map tags and difficulty, and (later) verify a solve. v1 implements everything except verification.

**Future verification, for context only.** Codeforces can be checked through its official API by handle. LeetCode would need the unofficial endpoint or a browser extension. CSES would need an extension. None of this is v1. Settings holds a LeetCode handle field for that later work, empty by default and unused in v1; the owner's handle is syin0519. There is no Codeforces handle field until Codeforces verification is built.

## 9. Architecture (recommended; yours to change)

A local-first Mac desktop app with no server. This removes hosting, accounts, auth and deployment, which is the full-stack work the owner does not want.

**Recommended stack**

| Layer | Choice | Why |
| --- | --- | --- |
| App shell | Electron | Transparent always-on-top windows, menu bar icon, notifications and launch-at-login are all built in and well documented |
| Language | TypeScript everywhere | One language across the whole codebase; strong typing helps cold-start sessions |
| UI | React with Vite | Mainstream, fast to iterate |
| Storage | SQLite in a single file under the app's user-data folder | No database server; backup is copying one file |
| Scheduling | An existing FSRS library for TypeScript | Do not reimplement the algorithm |
| Validation | A schema library for LLM output and IPC payloads | Catches bad data at the edges |
| LLM | Anthropic's TypeScript SDK, main process only | Keeps the key out of the renderer |
| Tests | A fast unit-test runner; a handful of end-to-end smoke tests | See section 12 |
| Packaging | A standard Electron packager producing a `.dmg` | The friend installs by opening a file |

Alternatives considered: Tauri (smaller app, but adds Rust as a second language) and native Swift (best macOS widgets, but weaker library support for the scheduler and sprite work). Reconsider only if Electron blocks something.

**Module boundaries**

- **core**: pure TypeScript with no Electron, database or network imports. Holds the daily-assignment policy, scheduler wrapper, pet state machine, streak logic, sprite generator and plan validation. Time is passed in, never read from the system clock, so everything is testable.
- **data**: the SQLite layer, migrations and seed loading.
- **platforms**: one adapter per platform (section 8).
- **llm**: plan generation; takes candidates in, returns a validated plan.
- **main**: Electron main process. Windows, menu bar, notifications, timers, and the typed bridge to the UI.
- **ui**: React screens and the pet window.

**Rules**

- The UI never touches the database or the network directly; it goes through a small typed bridge to the main process.
- Schema changes go through numbered migrations from day one, so the owner's data survives updates.
- The API key is stored encrypted using the operating system's keychain facilities, never in plain text, never in the repo, never in logs.
- The app must behave when the Mac sleeps, wakes after days, or changes time zone. Recompute the current ParaLeet day on wake and on a periodic tick; do not trust long-running timers.
- Only one instance of the app can run at a time.

## 10. Data model

A starting shape, not a final schema. Adjust names and columns as you build, through migrations.

| Table | Holds | Key fields |
| --- | --- | --- |
| `problems` | Catalog entries and user-added problems | platform, platform ID, title, URL, difficulty (raw and normalized), topics, source tags, origin (seed or user) |
| `attempts` | Every reported attempt, append-only | problem, timestamp, ParaLeet day, rating, minutes taken, kind (first solve or review), verification method (`self_report` in v1), notes |
| `problem_notes` | The user's per-problem notes | problem, key insight, pattern tags, free notes, optional link to their solution |
| `review_cards` | One spaced-repetition card per solved problem | problem, scheduler state, due date, status (active, retired) |
| `plans` | Generated learning plans | topics, platforms, level, status (draft, active, done, archived), model used, created date |
| `plan_items` | Problems in a plan, in order | plan, stage, group name, group description, position, problem, state (pending, done, skipped) |
| `daily_assignments` | What was assigned each day | ParaLeet day, problem, reason (review, plan, starter, user swap), completed flag |
| `pet` | The single pet | seed, growth solves, total attempts, current streak, longest streak, last fed day, unlocked and equipped accessories |
| `settings` | Key-value settings | day-boundary hour, reminder times, target retention, pet window position and visibility, model name, LeetCode handle |

Notes:

- `attempts` is the source of truth. Streak, growth stage and plan progress can all be recomputed from it; write a function that does so and test the stored values against it.
- Store timestamps in UTC and the ParaLeet day as a local calendar date string.
- Stage, mood and hunger are derived from stored facts and the current time. Do not store them.
- Provide export and import of the whole database as one file from the settings screen.

## 11. Screens and reminders

**Desktop pet window.** This is the app's front door.

- A small transparent, frameless, always-on-top window showing only the bird, at about 96 to 128 points on screen.
- Draggable anywhere; position is remembered. Visible on every desktop space. Never steals keyboard focus.
- Hovering shows a speech bubble: today's problem title and platform when unfed, the streak when fed.
- Clicking opens a compact card: today's problem, an "Open problem" button that opens the default browser, and an "I solved it" button that opens the report form.
- Right-click menu: open main window, swap today's problem, hide pet for 1 hour, settings, quit.
- The pet can be hidden entirely; the menu bar icon then carries the same card.

**Menu bar icon.** A tiny bird head whose expression matches the mood, with the streak number beside it. Clicking shows the same compact card.

**Report form.** Rating (four buttons with the meanings from section 5), minutes taken (optional), key insight (one line, optional, prompted on first solve), notes (optional). Two clicks is the minimum to feed the pet.

**Main window**

| Screen | Contents |
| --- | --- |
| Today | The pet large, today's problem, other due reviews (up to 5), streak, quick-log for any other problem |
| Problems | Searchable, filterable table of everything solved: platform, topics, difficulty, last attempt, next review, attempt count. Row opens history and notes |
| Plan | Active plan by stage and group with progress; create, edit, archive plans |
| Stats | Solves per week, topic coverage, a calendar heatmap of fed days, longest streak |
| Settings | Reminder times, day boundary, API key, pet visibility, LeetCode handle, launch at login, export and import |

**Reminders**

- Two system notifications a day at most: a first reminder (default 16:00) and an evening one (default 21:00). Both are skipped once the pet is fed.
- Each names the problem, and clicking it opens the compact card.
- The pet's on-screen mood change is the main reminder; notifications are the backup.
- The app launches at login by default (a setting), starting with only the pet and menu bar icon.
- First launch: hatch the egg, meet Para, pick reminder times, optionally add an API key. Under one minute.

**Look and feel.** Dark theme first, LeetCode orange as the single accent, pixel font for pet-related text only. The pet should feel alive; the rest should feel like a calm tool.

## 12. Milestones, testing and risks

Build in vertical slices. Each milestone ends with something the owner can use, and each should fit in one or two agent sessions.

**M1. The loop works** (plain UI, placeholder bird)

- [ ] App launches on macOS from one documented command; data persists across restarts
- [ ] Starter list loaded; today's problem is assigned and opens in the browser
- [ ] Report form records an attempt and marks the day as fed
- [ ] Streak counts correctly across the 04:00 boundary, missed days and time-zone changes
- [ ] Each solved problem gets a review card; due reviews take the daily slot
- [ ] Problems screen lists everything logged; a problem can be added by URL

**M2. The pet is alive**

- [ ] Procedural parakeet renders for all four stages and every mood; sprite gallery exists
- [ ] Two different seeds give visibly different birds
- [ ] Floating pet window: transparent, always on top, draggable, position remembered
- [ ] Menu bar icon with mood and streak; compact card from both entry points
- [ ] Checking and eating animations play on report; growth stage advances at thresholds
- [ ] Two daily notifications fire at the set times and are skipped once fed
- [ ] Launch at login works; first-launch hatching flow works

**M3. Catalog and learning plans**

- [ ] Catalog seeded for all three platforms by scripts in the repo, with validation
- [ ] Topic picker, plan generation and schema validation with one retry
- [ ] No plan ever contains a problem that is not in the catalog (tested with a faked bad model response)
- [ ] Plan review, edit and activate; daily loop draws from the active plan
- [ ] App works with no API key; the key is stored encrypted

**M4. Ready for a friend**

- [ ] Stats screen; export and import
- [ ] A `.dmg` build that installs on a second Mac, with a one-page install note covering the unsigned-app warning
- [ ] A week of the owner's own daily use with no data loss; fix what that week turns up

**Later:** Codeforces verification by handle, LeetCode verification, history import, pattern-level scheduling. Do not start any of these, or ask about them, until the owner requests one.

**Testing**

- Unit-test everything in **core** with injected time: day boundary, streak, assignment order, review scheduling, pet mood, growth, sprite determinism per seed.
- Test platform URL parsing against real example URLs.
- Test plan validation against good, malformed and hallucinated model responses, using saved responses rather than live calls.
- Test migrations by upgrading a database created at each earlier version.
- A few end-to-end smoke tests: launch, log an attempt, pet is fed, restart, state persists.

**Risks**

| Risk | Handling |
| --- | --- |
| Self-report makes it easy to cheat yourself | Accepted for v1. The verification seam exists for later |
| LeetCode metadata has no official source | Ship a verified data file; never depend on the unofficial endpoint at runtime |
| Unsigned app triggers macOS security warnings on the friend's Mac | Document the steps to open it; paid code signing only if this becomes a real obstacle |
| Review backlog discourages the user | One required problem a day, a cap of 5 shown, no overdue counts |
| The pet becomes ignorable after a few weeks | Growth, unlocks, varied lines and the streak reset |

**Open questions: none.** Every product question is decided in this PRD. Anything it does not cover is yours to decide under section 2: choose, log it, keep building.

## 13. Agent workflow

One lead agent owns the codebase and delegates scoped tasks to worker agents; nothing merges without passing the gate below.

**Roles**

| Role | Model | Owns | Does not do |
| --- | --- | --- | --- |
| Lead | The strongest model available | Architecture, schema, main process, UI wiring, Linear, every merge, the docs in section 2 | Hand off cross-module decisions |
| Worker | Sonnet | One Linear issue, in its own git worktree and branch | Change interfaces, schema or dependencies without the lead's say |
| Reviewer | Any; fresh context | A verdict on one branch, given only the diff, the issue and this PRD | Write or fix code |

The section 2 charter applies to the lead. Workers and the reviewer follow the lead's brief.

**Setup**

- Define `implementer` and `reviewer` as project subagents in `.claude/agents/`, with the model set in each definition and worktree isolation on for `implementer`.
- `CLAUDE.md` summarizes section 2, the module map and the commands to run, test and build. Every agent reads it.
- At most 3 workers run at once.

**Order of work**

1. **Lead alone:** repo, build, test runner, database layer with migrations, the module layout from section 9, `CLAUDE.md`, and one thin end-to-end path (assign a problem, report it, see it persisted). No workers until this is merged.
2. **Fan out by module:** workers take issues inside one module each. Good worker tasks: anything in `core` (streak, assignment policy, pet state machine, sprite generator), platform adapters, seed scripts, the `llm` module, individual screens once the bridge exists.
3. **Lead integrates:** wiring between modules, window and menu bar behavior, and anything touching more than one module stays with the lead.

**Worker brief.** Every delegation states: the Linear issue and its acceptance criteria, the module and files the worker may touch, the interfaces it must conform to, and the test command. The worker returns: what it built, the tests it added, and any decision it made that the lead should log.

**UI work.** Any agent building or changing a screen follows these steps:

1. **Find references on Mobbin first.** Use the Mobbin MCP to pull screens from shipped apps in the same categories: habit and streak trackers, flashcard and spaced-repetition apps, virtual-pet apps, and coding-practice or learning dashboards. Pick one or two references per screen in section 11.
2. **Copy what works.** Reproduce the reference's layout, hierarchy, spacing, component patterns and flows closely; do not design from scratch. Apply ParaLeet's own theme from section 11 (dark, orange accent). Do not copy another app's logo, name, illustrations or other brand assets.
3. **Record the references.** List which app and screen each ParaLeet screen is modeled on in `docs/design-references.md`, so later agents stay consistent.
4. **Test with Playwright.** The Playwright MCP is already installed. Run the UI, click through the feature, and take screenshots at the main window's default and minimum sizes. Run the renderer against a mock of the bridge for fast iteration, and use Playwright's Electron support for the end-to-end smoke tests in section 12.
5. **Look and fix.** Compare each screenshot with its reference. Fix overflow, misalignment, cramped spacing, unreadable contrast and dead controls, then re-screenshot. A screen is not done until its screenshot would pass as a finished app.

If the Mobbin MCP is not connected, design from section 11 and well-known patterns of those same app categories, note that in `docs/design-references.md`, and carry on. The merge gate for a UI issue includes steps 4 and 5, with the final screenshots attached to the Linear issue.

**Merge gate.** A branch merges only when all of these hold:

- [ ] Type check, lint and the full test suite pass on the branch after rebasing on main
- [ ] New behavior has tests; `core` changes have unit tests with injected time
- [ ] The app launches and the lead has exercised the feature
- [ ] Every acceptance criterion on the issue is checked off
- [ ] The reviewer reports no blocking findings (correctness, data loss, PRD violations, hard constraints in section 2)
- [ ] `README.md`, `docs/ARCHITECTURE.md` and the decision log are updated if the change affects them

The lead merges one branch at a time. A failed gate goes back to a worker with the specific failure; the lead does not merge and patch afterward.

**Linear conventions**

- One Linear project named ParaLeet, with milestones M1 to M4 from section 12.
- One issue per vertical slice: a title in product terms, acceptance criteria copied or derived from section 12, the module label, and blocked-by links.
- Write M1 issues in full detail at the start. Write M2 to M4 as one coarse issue per checklist line, and detail each milestone only when the one before it is done.
- Do not create issues for anything on the "Later" list.
- The lead moves issues through Todo, In Progress, In Review and Done, and links the merge commit on Done.
- If the Linear connection is unavailable, track the same issues in `docs/BACKLOG.md` and carry on; sync to Linear when it returns.

**PRD and Linear: which to change**

| Change | Where it goes |
| --- | --- |
| New feature, or a change to how the app should behave | Edit `docs/PRD.md` first, then create issues that cite the section |
| Bug, polish, refactor, or work that already matches the PRD | Linear issue only |
| A technical choice | Decision log; the PRD only if section 9 becomes wrong |

The repo copy, `docs/PRD.md`, is canonical once the build starts. If Linear and the PRD disagree, the PRD wins and the issue is corrected. When a feature ships, its PRD text describes the app as built, so a cold-start agent can trust the document.

## 14. Running unattended

The lead runs as one long session and keeps working until milestones M1 to M4 are built. The owner is not watching and will not answer questions mid-run.

**The loop**

1. Read `docs/STATUS.md` and the Linear project to see where things stand.
2. Pick the unblocked issues for the current milestone, up to 3.
3. Brief one worker per issue (section 13) and let them run in parallel.
4. As each worker returns, run the merge gate. Merge what passes; send what fails back with the specific failure.
5. Update Linear and `docs/STATUS.md`. Commit and push.
6. Go to step 2. When a milestone's checklist is complete, write the next milestone's detailed issues and continue without pausing.

**Do not stop to report.** Finishing an issue, a milestone or a batch of merges is not a reason to end the turn, summarize or ask whether to continue. Progress goes in `docs/STATUS.md` and Linear, where the owner can read it at any time.

**The only reasons to stop**

| Condition | What to do |
| --- | --- |
| Every M1 to M4 checklist item the agent can do is done and merged | Write DONE at the top of `docs/STATUS.md` with how to run and install the app, then stop |
| A blocker only the owner can clear: a missing credential, a tool that needs him to sign in, a permission that keeps being denied | Record exactly what is needed at the top of `docs/STATUS.md`, finish every other unblocked issue first, and stop only when nothing unblocked remains |

The M4 item "a week of the owner's own daily use" is the owner's to do and does not hold the session open.

**`docs/STATUS.md` is the lead's memory.** The session's context is compacted automatically on long runs, and a restarted session starts cold. Keep this file current after every merge: current milestone, issues in flight with their branch names, what is next, blockers, and decisions made since the last entry. On start, and whenever earlier context is no longer visible, re-read `CLAUDE.md`, `docs/STATUS.md` and the relevant PRD sections before acting.

**Never loop on a failure.**

- An issue that fails the merge gate 3 times is taken over by the lead, or split into smaller issues.
- A worker that returns nothing useful is re-briefed once with a narrower task, then the lead does the task itself.
- A failing command is diagnosed, not retried unchanged.
- If main is ever broken, fixing it comes before any new work.

**Kickoff (for the owner)**

1. Commit this PRD as `docs/PRD.md` in a new repo and confirm the Linear, Mobbin and Playwright MCP servers are connected.
2. Keep the Mac awake and plugged in for the run.
3. Start Claude Code in the repo in auto mode, on the strongest model at high effort.
4. Send the first prompt: "Read docs/PRD.md in full. You are the lead described in sections 2, 13 and 14. Set up the Linear project, then build M1 to M4 by running the loop in section 14."
5. Set the goal so the session continues turn after turn: `/goal docs/STATUS.md begins with DONE, every M1 to M4 checklist item in docs/PRD.md section 12 except the owner's one-week trial is merged to main with the section 13 merge gate passed, and the test suite passes on main`
6. If the session ends early, from a usage limit, a restart or an error, resume it and set the same goal again. The lead picks up from `docs/STATUS.md`.
