// Checks the packaged app, not the development build: `npm run dist:check` after `npm run dist`.
//
// It checks the built app's signature and that it holds both kinds of Mac, copies
// dist/mac-universal/ParaLeet.app to a folder whose name has spaces and accents, starts the copy
// on a throwaway data folder, and checks what only an installed copy can show: it knows it is
// installed, its windows may talk to it from that path, it writes its log, and the login item
// can be switched on and off.
//
// The login item is a real system setting, and macOS may know an app's login item by the app's
// identifier, not by where the app is. So the copy is given an identifier of its own
// (CHECK_BUNDLE_ID) and signed again: nothing this check does can reach the login item of a real
// ParaLeet installed on this Mac. Before the copy is deleted its login item is switched off from
// the main process, and if the copy has died it is started once more to do that.
//
//   npx tsx scripts/pack/check-app.ts
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, type ElectronApplication } from '@playwright/test';
import { DATABASE_FILE_NAME, openDatabase } from '../../src/data';
import { updateSettings } from '../../src/data/repos/settings';

const ROOT = resolve(import.meta.dirname, '../..');
const BUILT_APP = join(ROOT, 'dist/mac-universal/ParaLeet.app');
/** The copy's own identifier. Never the real app's (`appId` in electron-builder.yml). */
const CHECK_BUNDLE_ID = 'app.paraleet.mac.packaged-check';

/** Runs a command and gives back everything it printed, or null when it failed. */
function output(command: string, args: string[]): string | null {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return null;
  }
}

/** Like `output`, for tools that print what is asked for on the error stream (`codesign -dv`). */
function printed(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
}

async function until(read: () => Promise<boolean>, timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await read()) return true;
    await new Promise((done) => setTimeout(done, 200));
  }
  return read();
}

async function main(): Promise<void> {
  if (!existsSync(BUILT_APP)) throw new Error(`Build the app first (npm run dist): ${BUILT_APP} is missing.`);
  const root = mkdtempSync(join(tmpdir(), 'paraleet-check-'));
  const installDir = join(root, 'Applications ünïcode & spaces');
  const installed = join(installDir, 'ParaLeet.app');
  const dataDir = join(root, 'data folder');
  mkdirSync(installDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });

  // The app as it will be sent: signed (ad hoc), whole, and for both kinds of Mac.
  check('the built app has a valid signature', output('codesign', ['--verify', '--deep', '--strict', BUILT_APP]) !== null);
  const signature = printed('codesign', ['-dv', BUILT_APP]);
  check('it is signed ad hoc', /Signature=adhoc/.test(signature));
  check('its identifier is the real one', /^Identifier=app\.paraleet\.mac$/m.test(signature), signature.match(/^Identifier=.*$/m)?.[0] ?? '');
  const archs = output('lipo', ['-archs', join(BUILT_APP, 'Contents/MacOS/ParaLeet')]) ?? '';
  check('it runs on Apple silicon and on Intel', /\barm64\b/.test(archs) && /\bx86_64\b/.test(archs), archs.trim());

  // `ditto` copies an app bundle the way Finder does, signature included.
  execFileSync('ditto', [BUILT_APP, installed]);
  // The copy gets its own identifier and is signed again, so its login item is its own.
  execFileSync('plutil', ['-replace', 'CFBundleIdentifier', '-string', CHECK_BUNDLE_ID, join(installed, 'Contents/Info.plist')]);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', installed], { stdio: 'ignore' });
  const copySignature = printed('codesign', ['-dv', installed]);
  if (!new RegExp(`^Identifier=${CHECK_BUNDLE_ID.replaceAll('.', '\\.')}$`, 'm').test(copySignature)) {
    rmSync(root, { recursive: true, force: true });
    throw new Error('The copy could not be given its own identifier, so the check did not start: it must never touch the real app.');
  }

  // The data folder starts with "Launch at login" off, so starting the app registers nothing.
  const seedLoginOff = (folder: string = dataDir): void => {
    const seeded = openDatabase(join(folder, DATABASE_FILE_NAME), new Date().toISOString());
    updateSettings(seeded.db, { launchAtLogin: false });
    seeded.db.close();
  };
  seedLoginOff();

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    // Nothing from a development or test shell reaches the app, except where to keep its data.
    if (value !== undefined && !key.startsWith('PARALEET_') && !key.startsWith('ELECTRON_')) env[key] = value;
  }
  env.PARALEET_USER_DATA_DIR = dataDir;

  const launch = (): Promise<ElectronApplication> => electron.launch({ executablePath: join(installed, 'Contents/MacOS/ParaLeet'), env });
  /** Switches the copy's login item off from the main process, which needs no window, and says whether it is off. */
  const loginItemOff = (running: ElectronApplication): Promise<boolean> =>
    running.evaluate(({ app: electronApp }) => {
      electronApp.setLoginItemSettings({ openAtLogin: false });
      return !electronApp.getLoginItemSettings().openAtLogin;
    });

  let app: ElectronApplication | null = null;
  // True from the moment the check may have registered the copy's login item until it is known to be off.
  let loginItemMayBeOn = false;
  try {
    app = await launch();
    const facts = await app.evaluate(({ app: electronApp }) => ({
      packaged: electronApp.isPackaged,
      name: electronApp.getName(),
      version: electronApp.getVersion(),
      userData: electronApp.getPath('userData'),
      appData: electronApp.getPath('appData'),
    }));
    check('the app knows it is installed', facts.packaged);
    check('it is named ParaLeet', facts.name === 'ParaLeet', `${facts.name} ${facts.version}`);
    // Without the override, Electron keeps data in <appData>/<name>.
    check(
      'its own data folder would be ~/Library/Application Support/ParaLeet',
      facts.appData.endsWith('/Library/Application Support') && facts.name === 'ParaLeet',
      join(facts.appData, facts.name),
    );
    check('this run uses the throwaway data folder', facts.userData === dataDir, facts.userData);

    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    check('the window loads the app from a path with spaces and accents', page.url().includes('index.html'), decodeURI(page.url()).slice(-70));
    // The bridge answers only the app's own page: this fails if the path check is wrong.
    const today = (await page.evaluate(() =>
      (globalThis as unknown as { paraleet: { getToday(): Promise<{ today: string; pet: { hatched: boolean } }> } }).paraleet.getToday(),
    )) as { today: string; pet: { hatched: boolean } };
    check('the bridge answers the window', /^\d{4}-\d{2}-\d{2}$/.test(today.today), `today is ${today.today}`);
    check('a first launch has not hatched yet', today.pet.hatched === false);
    check(
      'the first-launch flow is on screen',
      await until(async () => (await page.getByText('Something is moving…').count()) > 0),
    );

    // Launch at login: on, then off again. It is the copy's own login item (see the top of the file).
    const setLaunchAtLogin = (on: boolean): Promise<unknown> =>
      page.evaluate(
        (value) =>
          (globalThis as unknown as { paraleet: { updateSettings(patch: { launchAtLogin: boolean }): Promise<unknown> } }).paraleet.updateSettings({
            launchAtLogin: value,
          }),
        on,
      );
    const loginItem = (): Promise<boolean> =>
      (app as ElectronApplication).evaluate(({ app: electronApp }) => electronApp.getLoginItemSettings().openAtLogin);
    loginItemMayBeOn = true;
    await setLaunchAtLogin(true);
    check('turning "Launch at login" on registers the login item', await until(loginItem));
    await setLaunchAtLogin(false);
    const off = await until(async () => !(await loginItem()));
    check('turning it off removes the login item', off);
    if (off) loginItemMayBeOn = false;

    await app.close();
    app = null;
    check('the database is in the data folder', existsSync(join(dataDir, DATABASE_FILE_NAME)));
    const logPath = join(dataDir, 'paraleet.log');
    const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
    check('the log file says an installed copy started', /INFO ParaLeet \S+ started \(installed, /.test(log), log.split('\n')[0] ?? '');
    check('the log holds no error', !/ ERROR /.test(log), log.split('\n').find((line) => line.includes(' ERROR ')) ?? '');

    // The Intel half. On an Apple silicon Mac it is started once under Rosetta, where Rosetta is
    // installed, on a data folder of its own with "Launch at login" off. Its log says it started.
    if (process.arch === 'arm64') {
      if (output('arch', ['-x86_64', '/usr/bin/true']) === null) {
        console.log('skip the Intel half was not started: Rosetta is not installed on this Mac');
      } else {
        const intelData = join(root, 'data intel');
        mkdirSync(intelData, { recursive: true });
        seedLoginOff(intelData);
        const intelLog = join(intelData, 'paraleet.log');
        const child = spawn('arch', ['-x86_64', join(installed, 'Contents/MacOS/ParaLeet')], {
          env: { ...env, PARALEET_USER_DATA_DIR: intelData },
          stdio: 'ignore',
        });
        const gone = new Promise<void>((done) => child.once('exit', () => done()));
        const readLog = (): string => (existsSync(intelLog) ? readFileSync(intelLog, 'utf8') : '');
        // Translating the app the first time is slow: give it a minute.
        const started = await until(async () => /INFO ParaLeet \S+ started \(installed, x64\)/.test(readLog()), 60_000);
        check('the Intel half starts (under Rosetta)', started, readLog().split('\n')[0] ?? '');
        // A little longer, so a failure right after the first line would be in the log.
        await new Promise((done) => setTimeout(done, 3_000));
        check('the Intel half logs no error', !/ ERROR /.test(readLog()), readLog().split('\n').find((line) => line.includes(' ERROR ')) ?? '');
        child.kill('SIGTERM');
        await Promise.race([gone, new Promise((done) => setTimeout(done, 10_000))]);
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }
    }
  } finally {
    // The copy is deleted next. A login item must not outlive it, whatever went wrong above.
    if (loginItemMayBeOn) {
      let off = false;
      try {
        if (app) off = await loginItemOff(app);
      } catch {
        // The copy has died. It is started once more, below, only to switch its login item off.
      }
      if (!off) {
        await app?.close().catch(() => undefined);
        app = null;
        try {
          seedLoginOff();
          app = await launch();
          off = await loginItemOff(app);
        } catch (error) {
          console.error(error);
        }
      }
      check(
        'no login item of the check is left behind',
        off,
        off ? '' : `remove "ParaLeet" (${CHECK_BUNDLE_ID}) by hand in System Settings, General, Login Items`,
      );
    }
    await app?.close().catch(() => undefined);
    rmSync(root, { recursive: true, force: true });
  }

  const failed = results.filter((result) => !result.ok);
  console.log(failed.length === 0 ? `\nAll ${results.length} checks passed.` : `\n${failed.length} of ${results.length} checks failed.`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
