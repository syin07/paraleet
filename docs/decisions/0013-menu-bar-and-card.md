# 0013. The menu bar icon and the compact card window

Date: 2026-11-25. Issue: SAN-115 (main-process side). PRD section 11, "Menu bar icon" and "Desktop pet window".

## Context

The PRD asks for a tiny bird head in the menu bar whose expression matches the mood, with the streak beside it, and for a compact card (today's problem, Open problem, I solved it) that opens from the floating pet and from that icon. This record covers the main-process side; the card's own page is a UI issue.

## Decisions

1. **The icon is cut from the sprite.** `src/main/trayIcon.ts` renders the mood's first frame with `renderSprite`, takes `headBox(stage)`, doubles each pixel and hands the bytes to `nativeImage.createFromBitmap` at scale 2. A 16-pixel head is a 16-point icon on a Retina display. No image file exists anywhere, and the icon can never disagree with the bird in the windows. It is a full-color icon, not a template image: Para is orange.

2. **The streak is the icon's title** (`tray.setTitle(' 12')`), nothing when the streak is zero. The tooltip says the mood in plain words ("Para is peckish · 12-day streak").

3. **The icon is redrawn only when it would look different.** `TrayController.sync()` runs on every change notice and every tick, and compares a key (seed, stage, mood, accessories), the title and the tooltip with what is showing.

4. **The card window is created when it opens and destroyed when it closes.** It always starts on its first view, and a closed card costs no memory. It is shown only after its page has reported its size (`setCardSize`), with a 600 ms fallback, so it never opens at the wrong size.

5. **The card takes the keyboard.** The user just clicked Para or the icon, and the report form needs typing, so the card is shown and focused like any menu bar popover. It closes when it loses focus, when its page asks (`hideCard`), or when it is asked for again from the same place. Asking from the other place moves it there.

6. **Placement is pure geometry.** `placePopover` in `src/main/windows/placement.ts` centres the card on its anchor (the bird's box, or the icon's bounds), above the bird or below the icon, flips sides when it does not fit, and keeps it inside the work area of the screen the anchor is on.

7. **Closing answers first.** `hideCard` destroys the window on the next turn of the event loop, so the page's own request gets its answer before the page is gone.

8. **The icon's right-click menu** is: Open ParaLeet, Swap today's problem…, Hide Para from the desktop (or Show Para on the desktop), Settings…, Quit ParaLeet. Hiding Para from here changes the same setting as the switch in Settings; with Para hidden the icon still carries the card (PRD: "The pet can be hidden entirely; the menu bar icon then carries the same card").

9. **The Dock rule is unchanged** (decision 0010): the Dock icon shows while the main window is open or Para is hidden. A crowded menu bar can hide a menu bar icon, so the icon alone is not treated as a guaranteed way back into the app.

10. **Para stays in its egg until the first-launch flow is done.** The floating pet is not shown while the pet has not hatched (`pet.hatched_at` is null); finishing the flow (`completeOnboarding`) hatches it and the pet appears. End-to-end tests start hatched unless they ask otherwise (`launchApp({ hatched: false })`), so the other tests do not have to walk through the flow.

## Alternatives rejected

- **A template (monochrome) icon:** it adapts to the menu bar's color by itself, but Para without its orange and its cheek patch is not Para, and the expression is harder to read in one color.
- **Keeping the card window alive and hidden:** faster to open by a few tenths of a second, at the cost of a renderer process running all day and state to reset on every open.
- **A card that does not take focus:** it could not close on a click elsewhere and could not be typed into without an extra click.
