# Installing ParaLeet

ParaLeet is a Mac app that comes as one file, `ParaLeet-<version>.dmg`. It works on Apple silicon and Intel Macs with macOS 13 (Ventura) or later. Nothing else needs to be installed, and there is no account.

## Install

1. Open `ParaLeet-<version>.dmg`.
2. Drag **ParaLeet** onto **Applications**.
3. Eject the ParaLeet disk in Finder. You can delete the `.dmg`.

## Open it the first time

ParaLeet is not signed with a paid Apple developer certificate, so macOS stops it the first time and says it could not verify the app. That is expected. You only do this once.

**macOS 15 (Sequoia) or later**

1. Open ParaLeet from Applications. macOS shows a warning. Choose **Done** (not "Move to Trash").
2. Open **System Settings**, then **Privacy & Security**, and scroll down to **Security**.
3. Next to "ParaLeet was blocked to protect your Mac", choose **Open Anyway**.
4. Confirm with your password or Touch ID, then choose **Open Anyway** again.

**macOS 13 or 14**

1. In Applications, hold **Control** and click ParaLeet, then choose **Open**.
2. In the warning, choose **Open**.

**If neither works.** Open the Terminal app, paste this line and press Return. It removes the mark macOS puts on downloaded files, for this app only:

```sh
xattr -dr com.apple.quarantine /Applications/ParaLeet.app
```

## What happens next

- An egg hatches, you meet Para, and you pick two reminder times. It takes under a minute.
- Para sits on your desktop and a small bird appears in the menu bar. Click either one for today's problem.
- The first reminder makes macOS ask whether ParaLeet may send notifications. Say yes if you want the two daily reminders; Para on the desktop reminds you either way.
- ParaLeet starts when you log in, showing only Para and the menu bar icon. macOS may tell you it added a login item. You can turn this off in ParaLeet's Settings ("Launch at login").
- Learning plans are optional and need your own Anthropic API key, added in Settings. Everything else works without one.

## Your data

- Everything is in one file on your Mac: `~/Library/Application Support/ParaLeet/paraleet.sqlite3`. Settings, Data shows it in Finder.
- To back up, use Settings, Data, **Export**, or copy that file while ParaLeet is not running.
- To move to another Mac, export on the old Mac and use Settings, Data, **Import** on the new one. The API key does not travel with the data: add it again on the new Mac.

## Updating and removing

- **Update:** install the new `.dmg` the same way and replace the old app. Your data stays. macOS asks you to allow the new copy once, as above.
- **Remove:** quit ParaLeet from the menu bar icon, drag it from Applications to the Trash, and, if you also want your data gone, delete the folder `~/Library/Application Support/ParaLeet`.

## If something goes wrong

ParaLeet keeps a log next to your data: `~/Library/Application Support/ParaLeet/paraleet.log`. It holds errors and one line per launch, never your API key. Send that file along when you report a problem.
