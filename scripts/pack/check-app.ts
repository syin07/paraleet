// Checks the packaged app, not the development build: `npm run dist:check` after `npm run dist`.
//
// It copies dist/mac-universal/ParaLeet.app to a folder whose name has spaces and accents, starts
// it on a throwaway data folder, and checks what only an installed copy can show: it knows it is
// installed, its windows may talk to it from that path, it writes its log, and the login item
// can be switched on and off. The login item is a real system setting: it is left as it was found.
//
//   npx tsx scripts/pack/check-app.ts
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, type ElectronApplication } from '@playwright/test';
import { DATABASE_FILE_NAME, openDatabase } from '../../src/data';
import { updateSettings } from '../../src/data/repos/settings';

const ROOT = resolve(import.meta.dirname, '../..');
const BUILT_APP = join(ROOT, 'dist/mac-universal/ParaLeet.app');

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
  // `ditto` copies an app bundle the way Finder does, signature included.
  execFileSync('ditto', [BUILT_APP, installed]);

  // The data folder starts with "Launch at login" off, so starting the app registers nothing.
  const seeded = openDatabase(join(dataDir, DATABASE_FILE_NAME), new Date().toISOString());
  updateSettings(seeded.db, { launchAtLogin: false });
  seeded.db.close();

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    // Nothing from a development or test shell reaches the app, except where to keep its data.
    if (value !== undefined && !key.startsWith('PARALEET_') && !key.startsWith('ELECTRON_')) env[key] = value;
  }
  env.PARALEET_USER_DATA_DIR = dataDir;

  let app: ElectronApplication | null = null;
  try {
    app = await electron.launch({ executablePath: join(installed, 'Contents/MacOS/ParaLeet'), env });
    const facts = await app.evaluate(({ app: electronApp }) => ({
      packaged: electronApp.isPackaged,
      name: electronApp.getName(),
      version: electronApp.getVersion(),
      userData: electronApp.getPath('userData'),
      appData: electronApp.getPath('appData'),
      loginItem: electronApp.getLoginItemSettings().openAtLogin,
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

    // Launch at login: on, then off again. Whatever it was before is what it is afterwards.
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
    check('no login item is registered at the start', facts.loginItem === false);
    try {
      await setLaunchAtLogin(true);
      check('turning "Launch at login" on registers the login item', await until(loginItem));
    } finally {
      await setLaunchAtLogin(false);
      const off = await until(async () => !(await loginItem()));
      check('turning it off removes the login item', off);
    }

    await app.close();
    app = null;
    check('the database is in the data folder', existsSync(join(dataDir, DATABASE_FILE_NAME)));
    const logPath = join(dataDir, 'paraleet.log');
    const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
    check('the log file says an installed copy started', /INFO ParaLeet \S+ started \(installed, /.test(log), log.split('\n')[0] ?? '');
    check('the log holds no error', !/ ERROR /.test(log), log.split('\n').find((line) => line.includes(' ERROR ')) ?? '');
  } finally {
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
