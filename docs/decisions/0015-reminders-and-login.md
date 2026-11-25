# 0015. Daily reminders and launch at login

Date: 2026-11-25. Issues: SAN-117 and the main-process side of SAN-118. PRD section 11, "Reminders".

## Context

Two system notifications a day at most, each naming the problem, both skipped once Para is fed; clicking one opens the compact card. The app launches at login by default, starting with only Para and the menu bar icon.

## Decisions

1. **Reminders are checked on the 30-second tick,** the same tick that notices a new day and a mood change. No timer is set for 16:00 or 21:00: a sleeping Mac would miss it. A reminder therefore arrives within half a minute of its time, or right after the Mac wakes.

2. **What was sent is stored on the pet** (`reminder_first_day`, `reminder_evening_day`, migration 002) and written before the notification is shown. A restart or a second tick never repeats a reminder; if showing it fails, it is lost, not repeated.

3. **A late wake gets one notification.** If the evening time has passed and the first reminder was never sent, only the evening one is sent and both are recorded (the rule is in `src/core/reminders.ts`).

4. **The reminder names today's problem.** Sending one reads Today first, which assigns the day's problem if the app had not been looked at yet. With nothing to assign it says that any logged problem feeds Para.

5. **No reminder before Para has hatched.** The first-launch flow is where the reminder times are chosen.

6. **Notifications go through a port** (`ctx.notify`). Main shows an Electron `Notification` and keeps it alive until clicked or closed. Unit tests collect notices; end-to-end runs record them and show nothing on the owner's Mac. The first real notification makes macOS ask for permission; if the user refuses, Para's mood on the desktop is still the main reminder (PRD: "notifications are the backup").

7. **Clicking a notification opens the compact card** beside the floating pet when it is showing, otherwise under the menu bar icon (`WindowPort.openCard`, which opens and never toggles).

8. **Only a packaged app registers a login item.** `createLoginItemSync` calls `app.setLoginItemSettings` when the setting changes, and never in a development run, which would register the Electron binary itself.

9. **Telling a login launch from a normal one.** Before macOS 13 the system says so (`wasOpenedAtLogin`). From macOS 13 it does not, so a packaged app with the setting on that starts within three minutes of the Mac starting is taken to be the login launch and opens no main window. If the guess is wrong the user sees Para and the menu bar icon and is one click from the main window; opening the app again from the Dock or Finder also shows it.

10. **A first launch always shows the main window,** where Para hatches, however the app was started.

## Alternatives rejected

- **A timer per reminder:** unreliable across sleep, and the PRD forbids trusting long timers.
- **A hidden helper app registered as the login item, passing a flag:** the standard way to know a login launch for certain, but a second bundle to build and sign for a detail the uptime rule gets right almost always.
- **Always opening the main window:** simple, but an app that throws a window in your face at every login is the opposite of a quiet companion.

## Limits

- The login item and the uptime rule can only be tried in the packaged app (M4). An unsigned app may need the user's approval in System Settings, Login Items.
