# 0017. Stats, and export and import

Date: 2026-11-25. Issues: SAN-124 (Stats) and SAN-132 (export and import). PRD sections 10, 11 and 12 (M4).

## Context

The Stats screen shows solves per week, topic coverage, a calendar heatmap of fed days and the streaks. Settings exports and imports the whole database as one file.

## Decisions: Stats

1. **The rules are in core** (`buildStats` in `src/core/stats.ts`), pure, with today as an argument. The service (`src/main/services/stats.ts`) reads the attempts with each problem's topics and adds the streaks. One bridge method, `getStats({ range })`, returns everything the screen shows.

2. **A solve is an attempt rated Hard, Good or Easy.** A fed day is a day with any attempt, also one rated Again, because honest reporting must never cost anything (PRD section 4).

3. **The heatmap counts different problems per day,** not attempts: 0, 1, 2, 3, 4 or more (the tokens `heat-0` to `heat-4`). Two attempts on one problem in a day count once, so the tooltip can say "2 problems" and mean it.

4. **The weekly bars count solves.** Topic coverage counts the different problems solved in each topic, over all time, most first; ties keep the fixed list's order.

5. **Weeks start on Monday, in ParaLeet days.** Each attempt carries the ParaLeet day it was made on, so the 04:00 boundary is already applied. Ranges are 12, 26 and 53 week columns, the current week included.

6. **Attempts dated after today count in the totals but never light a future day** or a week's bar. They can only exist after a clock error; hiding them from the calendar keeps it honest.

7. **Streaks are not computed twice.** The current and the longest streak come from the pet facts (`displayedStreak` for the current one), the same numbers Today, the card and the menu bar show.

8. **Nothing scolds** (PRD section 5): no goal lines, no "missed" markers, no count of days not fed. A day with nothing shows only its date.

## Decisions: export and import

9. **Export is a complete, compact copy made by SQLite itself** (`VACUUM INTO`), written beside the place the user chose and then renamed, so a failure never leaves half a file under the chosen name. It is safe while the app runs. The API key is not in the database, so it is not in an export (decision 0016).

10. **Import never touches the open database.** The chosen file is checked (`inspectDatabaseFile`: a real ParaLeet database, not newer than the app, passing SQLite's integrity check), the user is shown what is in it next to what it would replace, and on yes it is checked again and copied next to the database as `paraleet.sqlite3.import`. The app then restarts. At launch, before the database is opened, `applyStagedImport` checks the staged file once more and swaps it in.

11. **The database an import replaces is kept** as `paraleet.sqlite3.before-import`, next to the database. One backup is kept; the next import overwrites it. It can itself be imported, which undoes an import.

12. **The user's data is never left without a file that opens under its name** (`openDataFolder` in `src/data/index.ts`). The staged copy is ours, so on yes it is opened once the way the app opens its database (`stageCheckedImport`): a file that looks like a ParaLeet database but cannot be brought up to date is refused then, with nothing changed. At launch, a swap that fails half way puts the old database back and drops the staged file; an imported database that still will not open is moved aside as `paraleet.sqlite3.import-failed` and the one it replaced is put back; and a staged file older than ten minutes is dropped, because the restart it waited for never came and applying it later would replace whatever was logged since. Each of these is told to the user in Settings.

    Three rarer cases, from the second review. (a) If the app dies between the swap's two renames, the data sits under the backup name and nothing sits under the database name. Every launch checks for that first (`restoreMissingDatabase`) and puts the backup back, so the app never starts on a new, empty database while the user's data lies beside it; if putting it back fails, the launch fails loudly instead. (b) A journal that a crash left beside a staged file is removed with that file and before the next file is staged, because SQLite would apply it to whatever file next gets that name. (c) No step of an import deletes the last copy of anything: a failed import is kept as `import-failed` because, when the user imports the backup to undo an import, that file is the only copy of what they wanted back. Export also asks the disk to flush the copy before it is given its name.

13. **An older database is brought up to date by the normal migrations** when the app opens it after the swap. A database from a newer ParaLeet is refused.

14. **Two paths are the same file when the disk says so,** not when they are spelled the same: the Mac's disk ignores case and a folder can be reached through a link, so export compares what the files are on disk before it refuses to write over the database.

15. **The UI never hands main a file path.** Main asks the system's dialogs (`ctx.files`), and remembers the file picked for an import in `ctx.session` until the user says yes or no. The UI is shown paths (where the database is, where a copy was saved) but never sends one back.

16. **After a launch that applied or refused an import, the app opens on Settings,** where the Data group says what happened (`DataInfo.lastImport`, kept for that run only).

17. **Restarting** is `app.relaunch()` then `app.quit()`, a moment after the answer is sent, so the window that asked hears back and the database is closed on the way out. End-to-end runs answer the dialogs from test hooks and only quit; the test starts the app again on the same folder.

## Alternatives rejected

- **Replacing the database connection in place on import:** every holder of the database (services, the pet window, the tray) would have to follow the swap, and a mistake would write to the wrong file. A restart is simple and certain.
- **Merging an import into the current data:** attempts are append-only and IDs would collide; "replace, and keep a backup" is a promise that can be kept and explained.
- **A custom export format (JSON, zip):** the database file already is the one file the PRD asks for, and copying it by hand stays a valid backup.

- **Computing stats in SQL:** the week and range arithmetic is date logic that core already owns and tests with injected time.
- **Counting attempts per day:** simpler, but a second try on the same problem would read as a second problem.
- **A chart library:** two small charts do not justify a dependency; they are drawn with plain elements.
