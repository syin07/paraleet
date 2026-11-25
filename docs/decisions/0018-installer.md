# 0018. The installer, the log file and the packaged-app check

Date: 2026-11-25. Issue: SAN-125. PRD section 12 (M4), section 2 (hard constraint 5) and the Risks table.

## Context

A second person must be able to install ParaLeet on another Mac from one file, with no help beyond that file. There is no paid Apple developer certificate.

## Decisions

1. **electron-builder builds the `.dmg`** (`npm run dist`, configured in `electron-builder.yml`). It is the most used packager for Electron, it makes the disk image, the universal app and the signature in one step, and it is a development dependency only: nothing of it ships.

2. **One universal file,** for Apple silicon and Intel. It is about twice the size of a single-architecture build (about 220 MB), and the friend never has to know which Mac he has.

3. **Signed ad hoc** (`identity: "-"`). An unsigned app does not start at all on Apple silicon; an ad hoc signature costs nothing and lets it start. The hardened runtime is off, because it is for notarized apps and breaks an ad hoc signed one. The app is not notarized, so the first open shows macOS's warning; `docs/INSTALL.md` is the one-page note that walks through it (PRD Risks: "document the steps; paid code signing only if this becomes a real obstacle").

4. **The app ships no `node_modules`.** The build in `out/` already bundles every package, so the installer's `files` are `out/**` and `package.json` only.

5. **The icon is drawn by code,** like Para: `scripts/pack/build-icon.ts` renders the adult bird on a dark rounded square at every size the system wants and calls `iconutil`. The `.icns` is built at packaging time and not checked in.

6. **A log file, `paraleet.log`, next to the database** (`src/main/log.ts`). A packaged app has no console anyone sees. The log gets one line per launch, the launch self-check's repairs, failed bridge calls (never their input), failed tick steps and errors nothing caught. It is appended, set aside as `paraleet.log.old` at about 1 MB, and never throws. Errors are written as their stack only, so nothing that hangs off an error object (a request, its headers) reaches the file.

7. **An error nothing caught is logged and the app keeps running.** Electron's default is a dialog and an app in an unknown state; for a pet that lives on the desktop, staying up and leaving a trace is the better trade. Database writes run in transactions that roll back before an error leaves them, so carrying on cannot leave half a write behind. The one exception is an error while the app is still starting: it is shown in a dialog and the app quits, because carrying on could leave it running with no window at all. A thrown value that is not an error is never written to the log whole, only its message.

8. **`npm run dist:check` checks the packaged app,** not the development build. It checks the built app's signature (valid, ad hoc, the real identifier) and that it holds both architectures; then it copies the app to a folder with spaces and accents in its name, starts the copy on a throwaway data folder, and checks that it knows it is installed, that its windows may talk to it from that path (`isRendererUrl`), that it writes its log, and that "Launch at login" registers and unregisters the system's login item. The login item is a real system setting, and macOS may know it by the app's identifier and not by its path. So the copy is given an identifier of its own (`app.paraleet.mac.packaged-check`) and is signed again before it is started: the check cannot switch off, or on, the login item of a real ParaLeet installed on the same Mac. Before the copy is deleted its login item is switched off from the main process; if the copy has died it is started once more to do that, and if even that fails the check says what to remove by hand.

## Alternatives rejected

- **`@electron/packager` plus `hdiutil` and `codesign` by hand:** fewer packages, but three steps of our own to keep right, where electron-builder's are used by thousands of apps.
- **Two files, one per architecture:** half the size each, but the friend would have to pick.
- **Paying for a developer certificate and notarizing:** removes the warning; not worth it for one friend (PRD Risks).
- **A zip of the app:** no drag-to-Applications window, and Safari unpacks it into Downloads, where people run it from.

## Limits

- The Intel half was started under Rosetta on an Apple silicon Mac, not on an Intel Mac.
- A real login launch of the installed app (only Para and the menu bar icon, no main window) is not part of `dist:check`: it needs a logout. The rule is unit-tested (`src/main/loginItem.test.ts`) and the development build is tested end to end; the installed app is a hand check for the owner.
- The log holds file paths, which include the Mac's user name, and it holds failures of the main process only: an error inside a window's page is not written to it.
- The Electron switch that lets the app binary be run as plain Node (`ELECTRON_RUN_AS_NODE`) is left on. Turning it off is hardening for later, not something a friend's install needs.
- Whether macOS keeps an ad hoc signed app's login item across a restart of the Mac was not checked: that needs a logout. It is a hand check for the owner.
- No auto-update. A new version is a new `.dmg`.
