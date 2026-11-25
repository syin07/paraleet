import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, makeUserDataDir, type RunningApp } from './launch';

type Bridge = Record<string, (input?: unknown) => Promise<unknown>>;
const call = <T>(page: Page, method: string, input?: unknown): Promise<T> =>
  page.evaluate(([name, value]) => (globalThis as unknown as { paraleet: Bridge }).paraleet[name as string]!(value), [
    method,
    input,
  ] as const) as Promise<T>;

const NOW = '2026-11-25T20:00:00.000Z';

interface DataInfo {
  path: string;
  summary: { attempts: number; problems: number };
  hasImportBackup: boolean;
  lastImport: { status: string; reason?: string } | null;
}

// PRD section 12, M4: "export and import". The file dialogs are answered by the test; the files
// and the restart are real.
test('a backup from one install is imported into another, which restarts on it and keeps what it replaced', async () => {
  const first = makeUserDataDir();
  const second = makeUserDataDir();
  const files = makeUserDataDir();
  const backup = join(files.dir, 'ParaLeet backup.sqlite3');
  let running: RunningApp | null = null;
  try {
    // The first install: one solve, then a copy saved where the user chose.
    running = await launchApp({ userDataDir: first.dir, now: NOW });
    await expect(running.page.getByTestId('today-title')).toHaveText('1. Two Sum');
    const today = await call<{ assignment: { problem: { id: number } } }>(running.page, 'getToday');
    await call(running.page, 'submitReport', {
      problemId: today.assignment.problem.id,
      rating: 'good',
      minutes: null,
      keyInsight: 'A hash map of value to index.',
      notes: null,
      insightRevealed: false,
    });
    // Closing the dialog saves nothing.
    await running.setDialogPaths({ save: null });
    expect(await call(running.page, 'exportData')).toEqual({ saved: false });
    await running.setDialogPaths({ save: backup });
    expect(await call(running.page, 'exportData')).toEqual({ saved: true, path: backup });
    expect(existsSync(backup)).toBe(true);
    await running.close();
    running = null;

    // The second install starts empty.
    running = await launchApp({ userDataDir: second.dir, now: NOW });
    await expect(running.page.getByTestId('today-title')).toHaveText('1. Two Sum');
    const before = await call<DataInfo>(running.page, 'getDataInfo');
    expect(before).toMatchObject({
      path: join(second.dir, 'paraleet.sqlite3'),
      summary: { attempts: 0 },
      hasImportBackup: false,
      lastImport: null,
    });
    await call(running.page, 'showDataInFinder');
    expect(await running.revealedPaths()).toEqual([join(second.dir, 'paraleet.sqlite3')]);

    // A file that is not ParaLeet's is refused in plain words, and nothing changes.
    const wrong = join(files.dir, 'notes.sqlite3');
    writeFileSync(wrong, 'Not a database.');
    await running.setDialogPaths({ open: wrong });
    expect(await call(running.page, 'chooseImport')).toMatchObject({
      chosen: true,
      ok: false,
      fileName: 'notes.sqlite3',
      reason: 'That file is not a ParaLeet database, or it is damaged.',
    });
    expect(existsSync(join(second.dir, 'paraleet.sqlite3.import'))).toBe(false);

    // The backup: the app says what is in it, and on yes it quits to restart.
    await running.setDialogPaths({ open: backup });
    expect(await call(running.page, 'chooseImport')).toMatchObject({
      chosen: true,
      ok: true,
      fileName: 'ParaLeet backup.sqlite3',
      incoming: { attempts: 1, problems: 1, firstDay: '2026-11-25', lastDay: '2026-11-25' },
      current: { attempts: 0 },
    });
    const closed = running.app.waitForEvent('close');
    // The app may be gone before the answer arrives.
    await call(running.page, 'applyImport').catch(() => undefined);
    await closed;
    running = null;
    expect(existsSync(join(second.dir, 'paraleet.sqlite3.import'))).toBe(true);

    // Started again, as the installed app does by itself: it runs on the imported data, on
    // Settings, and what it replaced is kept beside the database.
    running = await launchApp({ userDataDir: second.dir, now: NOW });
    await expect(running.page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    expect(await call<DataInfo>(running.page, 'getDataInfo')).toMatchObject({
      summary: { attempts: 1, problems: 1 },
      hasImportBackup: true,
      lastImport: { status: 'applied' },
    });
    expect(await call(running.page, 'getToday')).toMatchObject({ fed: true, streak: { current: 1, longest: 1 } });
    expect(existsSync(join(second.dir, 'paraleet.sqlite3.before-import'))).toBe(true);
    expect(existsSync(join(second.dir, 'paraleet.sqlite3.import'))).toBe(false);
    // The key insight came along with the attempt.
    const logged = await call<{ problem: { id: number } }[]>(running.page, 'listLoggedProblems');
    expect(logged).toHaveLength(1);
    expect(await call(running.page, 'revealKeyInsight', { problemId: logged[0]!.problem.id })).toEqual({
      keyInsight: 'A hash map of value to index.',
    });
    await running.close();
    running = null;

    // An ordinary launch after that says nothing about an import.
    running = await launchApp({ userDataDir: second.dir, now: NOW });
    await expect(running.page.getByTestId('today-title')).toBeVisible();
    expect((await call<DataInfo>(running.page, 'getDataInfo')).lastImport).toBeNull();
  } finally {
    await running?.close().catch(() => undefined);
    first.remove();
    second.remove();
    files.remove();
  }
});

test('a staged import that went bad is refused at launch, and the data is untouched', async () => {
  const data = makeUserDataDir();
  let running: RunningApp | null = null;
  try {
    running = await launchApp({ userDataDir: data.dir, now: NOW });
    const today = await call<{ assignment: { problem: { id: number } } }>(running.page, 'getToday');
    await call(running.page, 'submitReport', {
      problemId: today.assignment.problem.id,
      rating: 'hard',
      minutes: null,
      keyInsight: null,
      notes: null,
      insightRevealed: false,
    });
    await running.close();
    running = null;

    // Something left a broken file where a staged import goes.
    writeFileSync(join(data.dir, 'paraleet.sqlite3.import'), 'half a file');
    running = await launchApp({ userDataDir: data.dir, now: NOW });
    await expect(running.page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    const info = await call<DataInfo>(running.page, 'getDataInfo');
    expect(info.lastImport).toMatchObject({ status: 'rejected' });
    expect(info.lastImport?.reason).toMatch(/not a ParaLeet database|damaged/);
    expect(info).toMatchObject({ summary: { attempts: 1 }, hasImportBackup: false });
    expect(existsSync(join(data.dir, 'paraleet.sqlite3.import'))).toBe(false);
  } finally {
    await running?.close().catch(() => undefined);
    data.remove();
  }
});

test('an import that passes the check but will not open is undone at launch: the earlier data is back', async () => {
  const data = makeUserDataDir();
  const files = makeUserDataDir();
  let running: RunningApp | null = null;
  try {
    running = await launchApp({ userDataDir: data.dir, now: NOW });
    const today = await call<{ assignment: { problem: { id: number } } }>(running.page, 'getToday');
    await call(running.page, 'submitReport', {
      problemId: today.assignment.problem.id,
      rating: 'good',
      minutes: null,
      keyInsight: null,
      notes: null,
      insightRevealed: false,
    });
    const backup = join(files.dir, 'backup.sqlite3');
    await running.setDialogPaths({ save: backup });
    expect(await call(running.page, 'exportData')).toMatchObject({ saved: true });

    // The copy is made to lie about its version: it looks like a ParaLeet database, but bringing
    // it "up to date" cannot work. The app refuses it when asked to import it...
    const liar = new DatabaseSync(backup);
    const version = (liar.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    liar.exec(`PRAGMA user_version = ${version - 1}`);
    liar.close();
    await running.setDialogPaths({ open: backup });
    expect(await call(running.page, 'chooseImport')).toMatchObject({ chosen: true, ok: true });
    const refused = await running.page.evaluate(() =>
      (globalThis as unknown as { paraleet: Bridge }).paraleet.applyImport!().then(
        () => 'applied',
        (error: unknown) => (error instanceof Error ? error.message : String(error)),
      ),
    );
    expect(refused).toBe('That file could not be brought up to date, so it cannot be imported. Your data was not changed.');
    expect(await running.mainWindowOpen()).toBe(true);
    expect(existsSync(join(data.dir, 'paraleet.sqlite3.import'))).toBe(false);
    await running.close();
    running = null;

    // ...and if such a file is ever staged anyway, the launch puts the earlier data back.
    copyFileSync(backup, join(data.dir, 'paraleet.sqlite3.import'));
    running = await launchApp({ userDataDir: data.dir, now: NOW });
    await expect(running.page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    const info = await call<DataInfo>(running.page, 'getDataInfo');
    expect(info.lastImport).toEqual({
      status: 'rejected',
      reason: 'The imported file could not be opened, so your earlier data was put back.',
    });
    expect(info).toMatchObject({ summary: { attempts: 1 }, hasImportBackup: false });
    expect(await call(running.page, 'getToday')).toMatchObject({ fed: true, streak: { current: 1 } });
    expect(existsSync(join(data.dir, 'paraleet.sqlite3.import'))).toBe(false);
  } finally {
    await running?.close().catch(() => undefined);
    data.remove();
    files.remove();
  }
});
