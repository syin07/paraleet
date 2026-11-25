# 0010. The floating pet window

Date: 2026-11-25. Issue: SAN-114. PRD section 11, "Desktop pet window".

## Context

Para lives in a small window that floats over everything: transparent, no frame, always on top, on every desktop, never taking keyboard focus, letting clicks on its empty area through, draggable, and in the same place after a restart. A spike on the owner's Mac confirmed Electron 45 can do each of these.

## Decisions

1. **A second window on the same page bundle.** The pet window loads the same renderer with the route `#/pet`. `src/ui/main.tsx` renders `PetWindow` instead of the app shell for that route and marks `<html data-window="pet">`, which makes the page background transparent. One bundle, one bridge, one preload.

2. **Services ask for window actions through a port.** `AppContext.windows` (`WindowPort`) has `showMain`, `movePetBy`, `endPetDrag`, `setPetInteractive` and `showPetMenu`. Main implements it with Electron; tests use a fake that records calls. The service layer stays free of Electron (decision 0004).

3. **Click-through is switched by the page.** The window starts with `setIgnoreMouseEvents(true, { forward: true })`. The page still receives pointer movement, and calls `setPetInteractive` once when the pointer enters or leaves anything marked `data-hit` (the bird; the bubble only informs and stays click-through). Only main knows window state; only the page knows where the bird is.

4. **Dragging goes over the bridge, not `-webkit-app-region: drag`.** A drag region swallows every mouse event, so the bird could not also be clicked, hovered or right-clicked. Instead the page captures the pointer, sends whole-point deltas with `movePetWindowBy`, and calls `endPetDrag` on release. A press that travels less than 4 points is a click.

5. **The position is saved when a drag ends,** in the `petWindowPosition` setting (the one database file). It is not saved on every move.

6. **The bird, not the window, must be on a screen.** The window is 240×250 and mostly transparent; the bird is a 128-point box in it (`PET_BIRD_BOX`). `keepOnScreen` in `src/main/windows/placement.ts` leaves the window alone while at least 48 points of the bird show on some screen. Otherwise it moves the window the shortest way that puts the whole bird on the nearest screen. It runs when the window is created, when a drag ends, on every tick and when displays change. With nothing saved, the window goes to the bottom-right corner of the primary screen.

7. **macOS moves a window fully onto the screen as it is shown.** So after `showInactive()` the window is put back at its exact position (`showAt`). Without this a bird left at a screen edge jumps inward on every launch.

8. **"Hide for 1 hour" lives in memory.** It is checked on the 30-second tick, so Para is back within half a minute of the hour. Quitting and reopening the app shows Para again, which is what a user who relaunches expects, and so does switching "Show Para on the desktop" off and on. If the clock is set back, the hide ends rather than lasting longer than an hour. The lasting switch is the `petVisible` setting.

9. **The Dock icon is hidden only while the pet is the only thing showing.** With the main window open, or with the pet hidden, the icon stays so the app can always be reached. macOS ignores a request to hide the icon made while a window is closing or within a second of the icon being shown, so `updateDock` decides a moment after the event, touches the icon only when it is wrong, and checks again until it is right.

10. **Main can ask the main window to show a screen.** The pet's menu opens Settings or the swap dialog by sending `paraleet:navigate` with a path such as `/settings` or `/today/swap`; a new window is created with that path as its route. `#/today/swap` is an action, cleared from the URL as it is read.

11. **Native things are tested through main.** Playwright cannot click a native menu or read window flags from the page. In end-to-end runs only, main exposes the pet window's facts, its menu template and the Dock state on `globalThis.__paraleetTest`. The menu test clicks the same template items the real menu is built from.

## Alternatives rejected

- **A native drag region with a separate click target:** no hover or right-click on the bird, and the two regions would have to be split across its body.
- **Polling the cursor position from main to decide click-through:** a timer running all day for something the page already knows.
- **Keeping the Dock icon always:** the PRD wants the pet to feel like a companion, not an open app; a permanent icon for a 128-point bird is noise.
- **Saving "hidden until" in the database:** a schema or settings change for a one-hour state that should not outlive the session.

## Limits

- Tests send pointer events straight into the page, which goes around the operating system's own delivery. Hover, click, drag and click-through with a real mouse while another app is in front were confirmed in the spike, not by an automated test. Electron has no way to read back whether a window ignores mouse events, so the tests check the controller's own record of it.
- If the pet page's process dies, the window is dropped and the next tick creates a new one.

- A desktop screenshot could not be taken in this session (no screen-recording permission), so see-through rendering is checked by reading the real window's pixels (`capturePage`): its corners have no pixels and the bird does.
- The menu bar icon and the compact card come with SAN-115; until then a click on the bird opens the main window.
