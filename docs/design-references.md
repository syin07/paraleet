# ParaLeet design references

> **Mobbin was not connected.** On 2026-11-25 every Mobbin MCP call (`search_screens` and `search_flows`) failed with "Mobbin MCP requires a paid plan". Following PRD section 13, this file was written from PRD section 11 and from well-known, shipped patterns in the named app categories: habit and streak trackers, flashcard and spaced-repetition apps, virtual-pet apps, and coding-practice dashboards. Every reference below names a real app and screen, but none has a `mobbin_url` yet and none was checked against a screenshot. The specs describe the common pattern, not a pixel-perfect copy. When Mobbin is available, run the "Mobbin query" listed for each screen, confirm or replace the reference, add its `mobbin_url`, and correct the spec to match the image.

## A. How to use this file

This file is the design contract for every ParaLeet screen. Before you build or change a screen, read its section and build to the "Reproduce" spec using only the tokens in **B. Theme** and the primitives in **D. Shared components**. Do not invent new colors, radii, spacing values or button styles. If a screen needs something this file does not cover, find a reference (Mobbin first, if connected), add it to that screen's section with its link and a spec, and then build it. Copy layout, hierarchy, spacing and flow from references, never their logos, names, illustrations or brand assets. Para and all pet art are ParaLeet's own (PRD section 6). Compare your Playwright screenshots with these specs (PRD section 13, UI work steps 4 and 5).

## B. Theme

Dark only in v1. LeetCode orange is the **only** accent. Green, amber and red appear only as difficulty or rating semantics, never as decoration.

### Colors

| Token | Value | Use |
| --- | --- | --- |
| `--bg-base` | `#1A1A1A` | Window background, content area |
| `--bg-sunken` | `#141414` | Sidebar, inputs, table header, heatmap empty cells |
| `--surface` | `#262626` | Cards, table rows on hover, popovers, modals |
| `--surface-raised` | `#303030` | Hovered card, selected row, menu item hover, secondary button |
| `--border` | `#3E3E3E` | Card borders, input borders, dividers |
| `--border-subtle` | `#2E2E2E` | Table row dividers, inner separators |
| `--text-primary` | `#EFEFEF` | Titles, body text, values (15.1:1 on base, 13.2:1 on surface) |
| `--text-secondary` | `#A8A8A8` | Labels, descriptions (7.3:1 on base, 6.4:1 on surface) |
| `--text-muted` | `#999999` | Metadata, timestamps, placeholders, axis labels (6.1:1 on base, 5.3:1 on surface, 4.6:1 on raised) |
| `--text-on-accent` | `#1A1A1A` | Text on orange buttons (8.6:1) |
| `--accent` | `#FFA116` | Primary buttons, active nav, focus ring, progress fill, links (8.6:1 on base) |
| `--accent-hover` | `#FFB340` | Primary button hover |
| `--accent-pressed` | `#E08A00` | Primary button active |
| `--accent-subtle` | `rgba(255, 161, 22, 0.12)` | Active nav item background, selected chip, tinted badges (renders about `#33291A` on base) |
| `--accent-border` | `rgba(255, 161, 22, 0.40)` | Selected chip and selected rating button border |
| `--easy` / `--success` | `#2CBB5D` | Easy difficulty, "Good"/"Easy" rating dot, saved toast (6.9:1 on base) |
| `--medium` | `#FFB800` | Medium difficulty text only. Never use it for buttons or highlights, so it does not compete with the accent |
| `--hard` | `#EF4743` | Hard difficulty dot, danger button fill, error border |
| `--hard-text` / `--danger-text` | `#FF6B66` | Red text on dark (6.3:1 on base, 5.4:1 on surface). `#EF4743` text is only 4.1:1 on surface, so use it for fills and large text only |
| `--focus-ring` | `0 0 0 2px #1A1A1A, 0 0 0 4px #FFA116` | Keyboard focus on every control |
| `--overlay` | `rgba(0, 0, 0, 0.6)` | Modal backdrop |
| `--heat-0..4` | `#262626`, `#5C3D0F`, `#8F5A0E`, `#C77A0F`, `#FFA116` | Heatmap and chart intensity ramp (orange only) |

Codeforces ratings map to these colors via the normalized 1 to 5 difficulty: 1 to 2 easy, 3 medium, 4 to 5 hard.

Contrast checked (WCAG 2.x relative luminance): every text token is at least 4.5:1 on `--bg-base`, `--bg-sunken` and `--surface`. `--text-muted` is the lowest at 5.3:1 on surface. Do not put muted text on `--surface-raised` below 13px.

### Radii, spacing, type, sizes

```css
:root {
  /* radii */
  --radius-xs: 4px;   /* chips, badges, heatmap cells (2px for cells) */
  --radius-sm: 6px;   /* buttons, inputs, nav items */
  --radius-md: 8px;   /* cards, table container, popover */
  --radius-lg: 12px;  /* modals, compact card, pet stage */
  --radius-full: 999px; /* pills, toggles, progress bars */

  /* spacing scale (4px base) */
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px; --space-12: 48px;

  /* type: system UI for the tool */
  --font-ui: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
  --font-mono: "SF Mono", ui-monospace, Menlo, monospace;    /* problem IDs, minutes */
  --font-pixel: "Press Start 2P", "Silkscreen", monospace;   /* pet text only: bubbles, pet name, stage, hatch flow */
  --text-xs: 11px/16px;   /* table header caps, axis labels, badges */
  --text-sm: 12px/16px;   /* metadata, helper text */
  --text-base: 13px/20px; /* body, table cells, buttons, inputs (macOS tool density) */
  --text-md: 15px/22px;   /* card titles, problem title in rows of emphasis */
  --text-lg: 18px/24px;   /* section headers, today's problem title */
  --text-xl: 22px/28px;   /* page titles */
  --text-2xl: 32px/36px;  /* stat numbers, streak count */
  --weight-regular: 400; --weight-medium: 500; --weight-semibold: 600;
  --pixel-size: 8px or 10px; /* pixel font only at multiples of its native size, never below 8px */

  /* control heights */
  --control-sm: 24px;  /* chips, small buttons, table inline actions */
  --control-md: 32px;  /* default buttons, inputs, selects, nav items */
  --control-lg: 40px;  /* primary call to action, rating buttons label row */

  /* layout */
  --sidebar-width: 220px;
  --content-max: 960px;
  --window-default: 1100x720; --window-min: 860x580;
  --shadow-popover: 0 8px 24px rgba(0,0,0,0.5);
  --duration: 120ms; /* hovers; 200ms for drawers and modals, ease-out */
}
```

Rules: page title `--text-xl` semibold, section headers `--text-xs` uppercase, `--text-muted`, letter-spacing 0.06em. Numbers that matter (streak, totals) use `--text-2xl` semibold with `font-variant-numeric: tabular-nums`. The pixel font is never used for buttons, tables or forms.

## C. Screens

### 1. App shell

**References** (not verified on Mobbin): **Linear, sidebar with workspace navigation** (desktop/web). **Raycast or Things 3 for Mac, sidebar list** as a calmer second reference.
Mobbin query: `project management app sidebar navigation`, platform web.

**Why.** Linear's sidebar is the standard for a calm, dense, dark desktop tool: a narrow sunken rail, small icons plus labels, and one subtle highlight for the active item. Things 3 shows how a few top-level destinations can sit in a sidebar without feeling empty.

**Reproduce**
- Two columns. Left sidebar fixed at 220px, full height, `--bg-sunken`, 1px right border `--border-subtle`. Right content area fills the rest, `--bg-base`, scrolls on its own.
- Sidebar top: 52px area that holds the macOS traffic lights (hidden title bar, `titleBarStyle: hiddenInset`). It is a drag region. Below it, a 40px row with a 20px Para head sprite and the word "ParaLeet" in `--text-base` semibold, 12px left padding.
- Nav list: 8px horizontal padding. Five items, 32px tall, 8px left padding inside, 2px gap between items, radius 6px. Each item: 16px line icon, 10px gap, label `--text-base` medium `--text-secondary`. Hover: `--surface` background. Active: `--accent-subtle` background, label `--text-primary`, icon `--accent`.
- Order: Today, Problems, Plan, Stats, then a flexible spacer, then Settings pinned near the bottom.
- Sidebar footer, 12px padding, above Settings or below it: a single muted line such as "12-day streak" in `--text-sm` `--text-muted` with a 6px orange dot before it. No emoji.
- Content area: 32px top padding (below the 52px drag strip, which spans the content top too), 40px side padding, content max width 960px, left aligned. Page header row: title `--text-xl` semibold left, optional actions right (buttons `--control-md`), 24px gap below.
- Keyboard: Cmd+1..5 switches destinations. Window min 860x580; below 960px wide, side padding drops to 24px.

**ParaLeet adaptation**
- Workspace switcher slot becomes the Para head plus app name.
- Linear's Inbox/My issues/Views become Today, Problems, Plan, Stats; Settings sits at the bottom.
- Linear's team section is dropped. The footer shows the current streak only.

### 2. Today

**References**: **Duolingo web, Learn home** (main path plus the right rail with streak and daily quest cards). **LeetCode, problem-of-the-day card on the Problems page** for the problem card's content density.
Mobbin query: `language learning app home with streak and daily goal`, platform web.

**Why.** Duolingo puts the mascot and the single next action at the center and keeps streak and secondary tasks in quiet side cards. That is the PRD's loop: one required problem, everything else optional. LeetCode's daily card shows how to fit title, difficulty and a start button in one compact row.

**Reproduce**
- Header row: "Today" title left; right side shows the date in `--text-sm` `--text-muted` ("Tue, Nov 25").
- Below, two columns with a 24px gap: main column flexible (min 480px), right rail 280px. Below 960px window width the rail moves under the main column.
- Main column, top to bottom, 16px gaps:
  1. **Pet stage**: card, `--surface`, radius 12px, height 240px, the sprite centered at 160px (5x of 32px), nearest-neighbor. A pixel-font speech bubble with Para's line for the day sits above-right of the bird, 184px wide at most so it stays inside the card. Below the bird, centered, the stage and mood line ("Chick · peckish") in `--font-pixel` 8px `--text-muted`. After a report a toast says so when Para grew or an accessory was unlocked.
  2. **Today's problem card**: `--surface`, 1px `--border`, radius 8px, 20px padding. Row 1: small caps label "TODAY'S PROBLEM" `--text-xs` muted, and on the right a reason badge ("Review" / "Plan: Binary search" / "Starter"). Row 2 (8px below): title `--text-lg` semibold. Row 3 (6px below): metadata line `--text-sm`: platform badge, difficulty in its color, topic chips (max 3, "+2" overflow). Row 4 (16px below): buttons left-aligned with 8px gap: primary lg "Open problem" (orange), secondary lg "I solved it", then a ghost sm "Swap" pushed to the right edge. When fed, the card collapses to one 56px row: green check, title in `--text-secondary`, "Fed" badge, and a ghost "Log another" button.
  3. **Due reviews**: section header "DUE FOR REVIEW" plus muted count ("3"). A list card, radius 8px, rows 44px tall, 16px horizontal padding, 1px `--border-subtle` dividers. Row: difficulty dot 8px, title `--text-base`, platform badge, muted "due 2d ago" right aligned, and on hover a ghost sm "Make today's" action. Max 5 rows; never show a total beyond 5. Empty state: one 44px row in `--text-muted`: "Nothing due. Para approves."
- Right rail, 16px gaps:
  1. **Streak card**: 20px padding. Large number `--text-2xl` semibold `--text-primary`, label "day streak" `--text-sm` muted beneath, then a 7-cell week strip (Mon to Sun), cells 24x24 radius 6px, fed days `--accent`, today outlined with `--accent-border`, empty `--bg-sunken`. A muted line "Longest: 31".
  2. **Quick log card**: header "Log another problem", one input (`--control-md`, placeholder "Paste a problem URL or search"), results appear as a dropdown list of 36px rows. Choosing one opens the report form.
- Flow: Open problem launches the browser. I solved it opens the report form modal (screen 3). On submit, the pet stage plays checking, then eating, and the problem card collapses to its fed state.

**ParaLeet adaptation**
- Duolingo's path area becomes the pet stage plus the single problem card.
- Duolingo's streak card and daily quests rail become the streak card and quick log.
- Duolingo's "Start" lesson button becomes "Open problem"; there is no XP, gems or league slot.
- LeetCode's daily card supplies the title, difficulty color and topic chip layout.

### 3. Report form

**References**: **Anki, review screen answer buttons** (Again / Hard / Good / Easy with next-interval labels). **Streaks (iOS), log entry sheet** for a minimal two-tap completion.
Mobbin query: `flashcard app review rating buttons`, platform ios.

**Why.** Anki's four horizontal buttons are the canonical spaced-repetition rating control and map one to one to the PRD ratings. A habit tracker's log sheet shows how to keep optional fields visually quiet so the minimum path is pick a rating, then submit.

**Reproduce**
- Modal, 480px wide, `--surface`, radius 12px, 24px padding, centered over `--overlay`. Also used as the second step inside the compact card (screen 9), where it fills the card width.
- Header: "How did it go?" `--text-lg` semibold; below it the problem title `--text-sm` `--text-secondary` with platform badge. Close button top right (ghost icon 24px).
- Rating group, 20px below: four equal buttons in one row, 8px gaps, each 72px tall, radius 8px, `--bg-sunken` fill, 1px `--border`. Inside, centered: label `--text-md` semibold (Again, Hard, Good, Easy), and under it a one-line meaning in `--text-xs` `--text-muted`, wrapped to 2 lines max. Keyboard shortcuts 1 to 4 shown as small muted digits in the top-left corner. Selected: `--accent-subtle` fill, `--accent-border` border, label `--accent`. Only the selected one uses the accent; ratings never get semantic colors here, so "Again" never looks like a failure.
- Below the buttons, 6px gap, one muted line that changes with the selection: "Next review in about 4 days" (from the scheduler). For Again: "Counts for today. Para gets a crumb."
- Optional fields, 20px below, 12px gaps, all `--control-md` inputs with labels in `--text-sm` `--text-secondary`:
  - Minutes (numeric, 96px wide) on the same row as Key insight (flexible) on a single row with 12px gap.
  - Key insight: one line, placeholder "The trick in one sentence". On a first solve it is visible and its label gets a small orange "New" badge; on reviews it is collapsed behind a "Reveal key insight" ghost link (revealing caps the rating at Hard, show that as a muted note).
  - Notes: a "+ Add notes" ghost link that expands into a 3-line textarea.
- Footer, 24px below: right aligned, secondary md "Cancel", primary md "Feed Para" (disabled until a rating is picked). Enter submits once a rating is chosen.
- Minimum path: click a rating, click Feed Para. Two clicks.

**ParaLeet adaptation**
- Anki's interval labels under each button become the PRD's one-line meanings; the next interval moves to the line below.
- The habit sheet's note field becomes key insight (one line) plus collapsible notes.
- Submit label is "Feed Para".

### 4. Problems

**References**: **LeetCode, Problems list** (status, title, difficulty, tags table). **Linear, issue list with filter bar and side peek** for the filter chips and row detail drawer.
Mobbin query: `issue tracker list view with filters`, platform web; `table row detail side panel`, platform web.

**Why.** LeetCode's list is the familiar shape for exactly this data. Linear's filter bar and right-side peek give a fast, keyboard-friendly way to open a row without leaving the table.

**Reproduce**
- Header: "Problems" title, muted count ("84 solved") next to it, primary md "Add problem" on the right.
- Toolbar, 16px below: search input 280px (`--control-md`, magnifier icon, placeholder "Search title or ID"), then filter buttons as secondary sm dropdowns: Platform, Topic, Difficulty, Status (Due / Active / Retired). Active filters render as chips after the buttons: `--accent-subtle`, `--text-primary`, 24px tall, radius 4px, with an x. A ghost "Clear" link at the end.
- Table, 12px below, inside a container with 1px `--border`, radius 8px, overflow hidden.
  - Header row 32px, `--bg-sunken`, `--text-xs` uppercase muted, sortable columns show a small chevron on the sorted one.
  - Columns and widths: Title (flex, min 240px; title `--text-base` `--text-primary`, ID in `--font-mono` muted after it), Platform (100px, badge), Topics (180px, up to 2 chips plus "+n"), Difficulty (90px, colored text), Last attempt (110px, relative date plus rating dot), Next review (110px, "in 3d" or orange "due" badge), Attempts (70px, right aligned, tabular).
  - Body rows 40px, 16px horizontal cell padding, dividers `--border-subtle`, hover `--surface`, selected `--surface-raised` with a 2px left `--accent` bar.
  - Default sort: next review ascending.
  - Empty state (nothing logged): centered in the table area, 64px Para sprite, `--text-md` "No problems yet", muted line "Solve today's problem or add one by URL", and a secondary md "Add problem" button.
- Row detail: clicking a row opens a right drawer 400px wide, `--surface`, 1px left `--border`, slides in over 200ms; the table stays visible and interactive. Esc closes.
  - Drawer header 20px padding: title `--text-lg` semibold, metadata line (platform, difficulty, topics), icon buttons "Open on platform" and close.
  - Section "KEY INSIGHT": editable inline text, muted placeholder.
  - Section "ATTEMPTS": vertical timeline rows 36px: date, rating chip (neutral chip with a dot: Again muted, Hard amber, Good/Easy green), minutes in mono, kind ("first solve" / "review"). Newest first.
  - Section "NOTES": textarea that saves on blur, small muted "Saved".
  - Footer: ghost buttons "Retire card" and "Reset schedule"; destructive-looking only on confirm.

**ParaLeet adaptation**
- LeetCode's status column is dropped (everything listed is solved); acceptance rate and frequency become Last attempt, Next review and Attempts.
- Linear's assignee/priority filters become Platform, Topic, Difficulty, Status.
- Linear's issue peek becomes attempt history plus key insight and notes.

### 5. Add problem by URL

**References**: **Notion or Linear, paste-a-link bookmark/attachment flow** (paste, preview card fills in). **Raindrop.io, add bookmark dialog** (URL first, fetched fields editable below).
Mobbin query: `add bookmark by URL modal`, platform web.

**Why.** Bookmark managers solved "paste a link, we fill what we can, you fix the rest" with a URL-first field and editable fields that appear once recognized.

**Reproduce**
- Modal 520px wide, radius 12px, 24px padding. Title "Add a problem".
- Step 1: one large URL input, `--control-lg` (40px), autofocus, placeholder "https://leetcode.com/problems/…". Supported platforms listed under it in `--text-sm` muted: "LeetCode, CSES, Codeforces, or any other link".
- On paste (no submit button needed), within 200ms: a recognition line appears under the input: platform badge plus "Found in catalog" (green dot) or "Not in catalog, fill in the details" (muted dot), or "Other site" for unknown hosts.
- Step 2 fields slide in below (16px gap, two-column grid, 12px gaps): Title (full width), Platform (select), Platform ID (mono), Difficulty (segmented Easy/Medium/Hard for LeetCode and Other, number input for Codeforces rating), Topics (multi-select chip input, full width). Catalog-filled fields show their values with a tiny muted "from catalog" tag and stay editable.
- Below the fields, a checkbox row: "I solved it today" (checked by default when opened from quick log). If checked, the primary button reads "Add and report"; it opens the report form. Otherwise "Add problem".
- Footer: Cancel (secondary) and the primary on the right. Duplicate URL: inline notice "Already in your problems" with a link that opens that row instead.

**ParaLeet adaptation**
- The bookmark preview card becomes the recognition line plus pre-filled fields.
- Collections/tags become Topics chips from the fixed topic list.

### 6. Plan

**References**: **Duolingo, unit path with sections** and **Coursera or Codecademy, course syllabus with module progress** for the active plan. **Headspace or Duolingo onboarding, topic and level pickers** (chip multi-select, single-choice cards) for plan creation.
Mobbin query: `online course syllabus with module progress`, platform web; `onboarding select interests chips`, platform ios.

**Why.** A syllabus with modules and lessons is the closest match to stages and named pattern groups, and it already shows per-module progress. Interest pickers are the established pattern for choosing several topics fast.

**Reproduce — active plan**
- Header: plan name ("Binary search + Graphs") with muted subtitle (platforms, created date), right side: secondary md "Edit", ghost "Archive", and overall progress "12 / 40" with a 120px progress bar.
- One block per topic if the plan has several, topic name `--text-lg` semibold, 32px between topics.
- Inside a topic, one card per stage (Foundations, each pattern group, Challenge), 12px gaps, `--surface`, radius 8px.
  - Card header 56px, 16px padding: stage label `--text-xs` caps muted ("FOUNDATIONS" / "PATTERN" / "CHALLENGE"), group name `--text-md` semibold, then the one-sentence description in `--text-sm` `--text-secondary` on the next line. Right side: "3 / 4" tabular and a 80px progress bar.
  - Rows 40px: state icon (empty circle pending, green check done, muted dash skipped), title, platform badge, difficulty text, and on the current next item an orange "Next" badge. Done rows dim their title to `--text-secondary`.
  - Completed cards collapse to the header by default, with a chevron to expand.
- **Empty state, no API key**: centered card 480px, 64px sleeping Para sprite, `--text-lg` "Plans need an Anthropic API key", one paragraph `--text-base` `--text-secondary` ("ParaLeet asks Claude to pick problems from its local catalog. Everything else works without a key."), primary md "Add API key" (opens Settings at the key field) and a ghost "Why?" link.
- **Empty state, key but no plan**: same card, "No active plan", primary "Create a plan". Archived plans listed under it as 40px rows.

**Reproduce — plan creation** (full content area, max width 640px, three stacked sections, not a wizard)
- "Topics": chips in a wrapping row, 8px gaps, 32px tall, radius 999px, 14px horizontal padding, `--bg-sunken` with 1px `--border`; selected: `--accent-subtle` fill, `--accent-border`, `--text-primary`, leading check icon. Muted count "3 selected".
- "Platforms": three toggle chips the same shape (LeetCode, CSES, Codeforces).
- "Level": three single-choice cards in a row, 8px gaps, 72px tall, radius 8px: name `--text-base` semibold and a one-line muted description; selected uses the accent border.
- "Size": segmented control (10 / 20 / 30 per topic), default 20.
- Sticky footer bar 64px, `--bg-base` with top border: muted summary ("About 60 problems from 3 topics"), primary lg "Generate plan" right. While generating: the button shows a spinner and "Para is picking problems…" (pixel font not used here). Errors appear as an inline red-text notice above the footer with "Try again".

**Reproduce — review/edit before activating**
- Same layout as the active plan, with a top banner (`--accent-subtle`, radius 8px, 12px padding): "Draft plan. Remove, reorder or swap problems, then activate." and primary md "Activate plan" on the banner's right.
- Each row gains, on hover, a drag handle at left (6-dot, muted) and right-side ghost icon buttons: Swap (opens a popover listing 5 alternatives from the same topic) and Remove. Already-solved items show a muted "solved, will be offered as review" tag.

**ParaLeet adaptation**
- Course modules become stages; lessons become problems; module descriptions become pattern-group descriptions written by the model.
- Interest chips become the fixed topic list; level cards become the PRD's three levels.

### 7. Stats

**References**: **GitHub, profile contribution graph** for the heatmap. **Duolingo web, Profile statistics tiles** and **Strava or Apple Fitness, weekly bar chart** for the stat tiles and solves-per-week chart.
Mobbin query: `habit tracker statistics with calendar heatmap`, platform web.

**Why.** The GitHub grid is the most recognized "days you showed up" visual and works perfectly in a single-accent ramp. Duolingo-style tiles put the few numbers that matter (streak, longest, total) above the charts.

**Reproduce**
- Header "Stats", right side a segmented range control (12 weeks / 6 months / 1 year), default 6 months.
- Row 1: four stat tiles in a grid, 12px gaps, each `--surface`, radius 8px, 16px padding, 88px tall: value `--text-2xl` semibold, label `--text-sm` muted. Tiles: Current streak, Longest streak, Total solves, Reviews done.
- Row 2 (24px below): **Fed days heatmap** card, 20px padding. Title `--text-md` semibold. Grid of weeks as columns, Monday to Sunday rows, cells 12x12 with 3px gaps, radius 2px, colors `--heat-0` (not fed) to `--heat-4` (3+ problems). Month labels above in `--text-xs` muted, Mon/Wed/Fri labels at left. Legend "Less ▢▢▢▢▢ More" bottom right. Hover tooltip: "Nov 12 · 2 problems".
- Row 3: two cards side by side, 16px gap.
  - **Solves per week**: vertical bars, one per week, bar width 60% of slot, radius 3px top corners, `--accent` fill; current week `--accent-subtle` with dashed `--accent-border` outline. Y axis 3 gridlines `--border-subtle`, labels `--text-xs` muted. Chart height 180px. Tooltip on hover.
  - **Topic coverage**: horizontal bar list, one row per topic (24px rows, 8px gaps): topic name 120px `--text-sm`, a track `--bg-sunken` radius 999px height 8px, fill `--accent` proportional to solved count, count right aligned tabular. Sorted descending; topics with zero shown muted at the bottom (collapsed after 8 rows with "Show all").
- Empty state (no attempts): the tiles show "0", the heatmap renders all empty cells, and the chart areas show a centered muted line "Your first solve shows up here".

**ParaLeet adaptation**
- GitHub contributions become fed days, intensity by problems solved that day.
- Duolingo's XP and league tiles become streak, longest streak, total solves, reviews done.
- No goal lines or "missed" markers, so missing days never look like a scolding (PRD section 5).

### 8. Settings

**References**: **Linear, Settings > Preferences** (grouped rows with label left, control right). **Raycast, Settings > General** for desktop-native toggles and hotkey-style fields.
Mobbin query: `app settings preferences page`, platform web.

**Why.** Grouped label/control rows are the calmest and most scannable settings layout, and both are dark desktop tools with the density ParaLeet needs.

**Reproduce**
- Single column, max width 640px. Page title "Settings".
- Groups separated by 32px, each with a header `--text-xs` caps muted and a card `--surface`, radius 8px, 1px `--border`. Rows inside are 56px minimum, 16px horizontal padding, dividers `--border-subtle`. Each row: left column label `--text-base` `--text-primary` with an optional description `--text-sm` muted below; right column the control, right aligned.
- Groups and rows, as built in M2:
  - **Reminders**: First reminder and Evening reminder (text inputs for a 24-hour time, 96px, `--control-md`, saved on blur or Enter; an invalid time shows "Use a 24-hour time like 16:00" under the row and is not saved), Day starts at (select, 00:00 to 08:00, description "A solve before this hour counts for the previous day."). One muted line under the card: "At most two a day. Skipped once Para is fed."
  - **Review schedule**: Target retention (segmented control: 80%, 85%, 90%, 95%; a saved value that is none of these shows as a fifth segment). Description: "How sure Para wants you to be when a review comes up. Higher means more frequent reviews."
  - **Para**: Show Para on the desktop (toggle), Launch at login (toggle, description "Para and the menu bar icon start with your Mac."), Accessories (stacked row: the four accessories as chips under the label; a worn one uses the accent-subtle style with a leading check; a locked one is disabled with a lock icon, and a line under the chips says what unlocks it).
  - **Account handles**: LeetCode handle (text input 200px, description "Not used yet. Saved for checking solves automatically in a later version.").
  - Still to come: **Learning plans** in M3 (Anthropic API key: password input 280px with "Saved, encrypted" muted state and a Remove ghost button once stored; Model select) and **Data** in M4 (Export database, Import database with a confirm modal that warns it replaces current data, a muted line with the database file location and "Show in Finder").
- Toggles: 32x18px track, radius 999px, off `--surface-raised` with a 1px strong border, on `--accent`, 14px white knob. A real `role="switch"` button.
- Changes save immediately; a small toast "Saved" bottom-center, 2s, one toast for several quick changes. A failed save shows the error in a `role="alert"` line under the row and the control goes back to its saved value.

**ParaLeet adaptation**
- Linear's theme/font rows become reminder, day boundary and pet rows.
- Linear's API page pattern (masked key, created state) becomes the Anthropic key row.

### 9. Compact card

**References**: **Fantastical or Things 3, menu bar popover** (small panel with the next item and actions). **Raycast, menu bar extra panel**.
Mobbin query: `menu bar app popover`, platform web; fallback `today widget with task and button`, platform ios.

**Why.** Menu bar popovers are the native pattern for a glanceable "what's next and one action" panel and match both entry points (pet click and menu bar icon).

**Reproduce**
- Panel 320px wide, auto height (about 200px), `--surface`, radius 12px, 1px `--border`, `--shadow-popover`, 16px padding. Opens anchored to the pet (above or beside it, within the screen) or under the menu bar icon with a small arrow.
- Row 1: 32px Para head sprite, then "Para is peckish" in `--font-pixel` 8px `--text-secondary`; right side streak "12" `--text-md` semibold with muted "day streak".
- Divider 12px margins.
- Row 2: label "TODAY'S PROBLEM" caps muted; title `--text-md` semibold (2 lines max, ellipsis); metadata line platform badge and difficulty text.
- Row 3, 16px below: two buttons full width split 50/50, 8px gap, `--control-md`: primary "Open problem", secondary "I solved it".
- Footer link row, 12px below: ghost sm "Open ParaLeet" left, ghost sm "Swap" right.
- "I solved it" turns the card into the report form (screen 3) in place, card width 360px, with a back chevron. On submit the card shows a 1.5s confirmation ("Para ate! Streak 13") and closes, while the pet plays its animation.
- Fed state: Row 2 shows a green check and "Fed for today", the buttons become one secondary "Log another problem".
- Esc or clicking elsewhere closes it. It never steals focus from other apps until clicked.

**ParaLeet adaptation**
- Calendar's next event becomes today's problem; "Join" becomes "Open problem"; "I solved it" is the second action.

### 10. First-launch flow

**References**: **Finch (iOS), onboarding: hatch and meet your pet** for the egg-to-pet reveal. **Duolingo, onboarding goal and reminder steps** for the reminder time picker.
Mobbin query: `virtual pet app onboarding`, platform ios; `onboarding set reminder time`, platform ios.

**Why.** Finch's hatching reveal is the closest shipped analogue to "hatch the egg, meet Para" and keeps text short and warm. Duolingo's reminder step shows how to ask for notification time in one screen with a sensible default.

**Reproduce**
- Shown in the main window with the sidebar hidden: a centered column 440px wide on `--bg-base`. Four steps, a progress row of 4 dots at top (8px dots, 8px gaps, current `--accent`, done `--accent` at 50%, upcoming `--border`). "Skip" ghost sm at top right from step 3 on.
  1. **Hatch**: egg sprite 192px centered, pixel-font line "Something is moving…" 10px, primary lg "Hatch" (or click the egg). Click plays a 3-frame crack animation, about 1.5s.
  2. **Meet Para**: chick sprite 192px, pixel-font speech bubble "Hi! I'm Para. Feed me one problem a day." Body text `--text-base` `--text-secondary`, 2 lines max, explaining the loop. Primary lg "Nice to meet you".
  3. **Reminders**: title `--text-lg` "When should Para remind you?", two rows (First reminder 16:00, Evening reminder 21:00) as label left, time input right, inside a `--surface` card; description muted "At most two a day. Skipped once Para is fed." Primary lg "Continue" (requests notification permission here).
  4. **API key (optional)**: title "Want learning plans?", one paragraph, password input full width, primary lg "Save key", secondary lg "Skip for now". Both lead to the Today screen, where the pet window also appears.
- Each step fits without scrolling at the 860x580 minimum window size. Total time under one minute: no reading-heavy screens, every step has one primary button.

**ParaLeet adaptation**
- Finch's naming step is removed (Para is always Para, PRD section 6).
- Duolingo's goal picker is removed; the daily goal is fixed at one problem.
- The paywall and account steps are removed entirely.

### 11. Pet window

The floating window that shows only Para (PRD section 11). No reference app was used; the layout follows the PRD.

- **Window:** 240×280 points, fully transparent, no frame, no shadow. Nothing is drawn except the bird and, on hover, its bubble.
- **Bird:** 128 points square, centred horizontally, 8 points above the bottom edge. Pixel art is scaled with nearest-neighbor only. Cursor `grab`, `grabbing` while pressed.
- **Speech bubble:** 12 points above the bird, centred. Pixel font (`font-pixel`) 8px with 14px line height, `text-fg` on `bg-surface`, a 2px `line` border with square corners, padding 8px, 208px wide at most, long text wraps (the line is cut after four rows, the fact after three). A three-step pixel tail points down at the bird. The bubble only informs: clicks on it pass through to whatever is underneath.
- **Bubble text:** first Para's line for the day and mood, in its own voice. Under it, in `text-fg-secondary`, the plain fact: today's problem and platform when not fed ("LeetCode · 121. Best Time to Buy and Sell Stock", platform first so a long title is what gets cut), the streak when fed ("12-day streak"), or "Any problem feeds me" when nothing is assigned. The fact is left out when the line already says it.
- **When it shows:** while the pointer is over the bird, and by itself during Para's short shows: checking a report, eating, nibbling, and the "missed you" greeting. The greeting counts as seen once the pointer has been on the bird or the bird was clicked.
- **Click** opens the main window (the compact card from SAN-115 replaces this). **Drag** moves the window. **Right-click** opens a native menu: Open ParaLeet, Swap today's problem…, Hide Para for 1 hour, Settings…, Quit ParaLeet.
- **States:** idle (bird only), hover (bird and bubble). No focus ring: the window never takes keyboard focus, and everything it does is also reachable from the main window and the menu.

## D. Shared components

All sizes use the tokens in B. Every interactive element shows `--focus-ring` on keyboard focus and has a disabled state at 40% opacity with no hover change.

**Button**

| Variant | Fill / text | Hover | Pressed | Use |
| --- | --- | --- | --- | --- |
| Primary | `--accent` / `--text-on-accent`, semibold | `--accent-hover` | `--accent-pressed` | One per view region: Open problem, Feed Para, Generate plan |
| Secondary | `--surface-raised` / `--text-primary`, 1px `--border` | border `#4A4A4A`, fill `#383838` | fill `--surface` | I solved it, Cancel, Export |
| Ghost | transparent / `--text-secondary` | `--surface` fill, `--text-primary` | `--surface-raised` | Swap, Clear, inline row actions |
| Danger | `--hard` / `#FFFFFF` (4.0:1, only at 13px semibold or larger; otherwise use ghost with `--danger-text`) | `#F25C58` | `#D93C38` | Confirm import, reset schedule (in confirm modals only) |

Sizes: sm 24px tall, 8px padding, `--text-sm`; md 32px, 12px padding, `--text-base`; lg 40px, 16px padding, `--text-base` semibold. Radius 6px. Icon-only buttons are square at the same heights. Loading: spinner replaces the leading icon, label stays, button disabled.

**Card**: `--surface`, 1px `--border`, radius 8px (12px for the pet stage, compact card and modals), padding 16px (compact) or 20px (default). Interactive cards hover to `--surface-raised`. Card header: caps label `--text-xs` muted, then title. No shadows except popovers and modals.

**Chip / tag / badge**
- Topic chip: 20px tall, 6px horizontal padding, radius 4px, `--bg-sunken` fill, `--text-sm` `--text-secondary`.
- Filter or selectable chip: 32px (pickers) or 24px (filters), radius 999px for pickers and 4px for filters; default `--bg-sunken` with 1px `--border`; hover `--surface-raised`; selected `--accent-subtle` with `--accent-border` and a leading check.
- Platform badge: 20px, radius 4px, 1px `--border`, `--text-xs` medium `--text-secondary`, text "LeetCode" / "CSES" / "Codeforces" / "Other". No third-party logos.
- Difficulty: text only, `--text-sm` medium, in `--easy` / `--medium` / `--hard-text`, or an 8px dot in the same colors in dense rows.
- Status badges ("Review", "Next", "Due", "New"): 20px, radius 4px, `--accent-subtle` fill, `--accent` text, `--text-xs` semibold.

**Table row / list row**: 40px (tables) or 44px (Today lists), 16px horizontal padding, `--border-subtle` divider, hover `--surface`, selected `--surface-raised` plus 2px left `--accent` bar, header 32px `--bg-sunken` caps muted. Row actions appear on hover as ghost sm buttons at the right edge. Whole row is clickable; keyboard up/down moves selection, Enter opens.

**Form field**: label above (`--text-sm` `--text-secondary`, 6px gap) or left in settings rows. Input 32px (lg 40px for the URL field), `--bg-sunken`, 1px `--border`, radius 6px, 10px horizontal padding, `--text-base`, placeholder `--text-muted`. Hover border `#4A4A4A`; focus border `--accent` plus focus ring; error border `--hard` with `--text-sm` `--danger-text` message below. Helper text `--text-sm` muted. Textarea same styling, min 3 lines. Select and time inputs share the input shell with a trailing chevron. Toggle as specified in Settings.

**Progress bar**: track `--bg-sunken`, radius 999px, height 6px (inline) or 8px (topic coverage); fill `--accent`; complete at 100% stays `--accent` with a small green check beside the count. Always paired with a tabular "done / total" label in `--text-sm`.

**Segmented rating buttons**: 4 equal cells, 8px gaps, 72px tall (56px in the compact card), radius 8px, `--bg-sunken` with 1px `--border`. Content: label `--text-md` semibold, meaning `--text-xs` muted, shortcut digit top-left. Hover `--surface-raised`. Selected `--accent-subtle`, `--accent-border`, label `--accent`. Single-select, arrow keys move, 1 to 4 select. Generic segmented control (range, size): one 32px container `--bg-sunken` radius 6px, 2px inner padding, segments radius 4px, selected segment `--surface-raised` with `--text-primary`.

**Modal**: centered, width 480px (forms) or 520px (add problem), max height 80vh with an internal scroll, `--surface`, radius 12px, 1px `--border`, `--shadow-popover`, 24px padding, backdrop `--overlay`. Header title `--text-lg` semibold plus close icon button; footer right-aligned buttons, 8px gap, primary last. Opens with a 200ms fade and 8px rise. Esc closes; focus is trapped.

**Drawer**: right side, 400px, full height of the content area, `--surface`, 1px left `--border`, no backdrop (the list stays usable), 200ms slide. Header 56px with title and close; sections separated by 24px with caps headers.

**Popover / dropdown**: `--surface`, radius 8px, 1px `--border`, `--shadow-popover`, 4px padding, items 32px tall, radius 4px, hover `--surface-raised`.

**Toast**: bottom-center, `--surface-raised`, radius 8px, 36px tall, `--text-base`, optional leading green check, auto-dismiss after 2s.

**Empty state**: centered block inside its container, 48 to 64px Para sprite in a fitting mood, title `--text-md` semibold, one muted line, at most one button (secondary, or primary if it is the only path forward). Warm copy, never guilt.

**Pet text** (speech bubbles, hatch flow lines, compact card mood line): `--font-pixel` at 8px or 10px, `--text-primary` on a `--surface` bubble with a 2px `--border` pixel-stepped outline and a stepped tail, 8px padding, max width 200px.
