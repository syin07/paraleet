// Export and import through the services: the dialogs are scripted, the files are real. The UI
// never passes a path; main asks the dialogs and remembers what was picked.
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyStagedImport,
  DATABASE_FILE_NAME,
  Db,
  hasStagedImport,
  IMPORT_BACKUP_FILE_NAME,
  inspectDatabaseFile,
  LATEST_SCHEMA_VERSION,
  STAGED_IMPORT_FILE_NAME,
} from '../../data';
import { listStarterQueue } from '../../data/repos/problems';
import { newSession } from './context';
import { createTestApp, noonLA, type TestApp } from './testing';

let dir: string;
const apps: TestApp[] = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'paraleet-data-'));
});
afterEach(() => {
  for (const app of apps.splice(0)) {
    try {
      app.close();
    } catch {
      // Already closed by the test.
    }
  }
  rmSync(dir, { recursive: true, force: true });
});

/** An app on a real database file in its own folder, as installed. */
function startApp(name: string, now = noonLA('2026-11-25')): TestApp & { dataDir: string } {
  const dataDir = mkdtempSync(join(dir, `${name}-`));
  const app = createTestApp({ now, path: join(dataDir, DATABASE_FILE_NAME) });
  apps.push(app);
  return Object.assign(app, { dataDir });
}

async function reportStarters(app: TestApp, count: number): Promise<void> {
  for (const problemId of listStarterQueue(app.db).slice(0, count)) {
    await app.handlers.submitReport({ problemId, rating: 'good', minutes: null, keyInsight: null, notes: null, insightRevealed: false });
  }
}

const countAttempts = (path: string): number => {
  const db = new Db(path);
  try {
    return db.get<{ n: number }>('SELECT COUNT(*) AS n FROM attempts')!.n;
  } finally {
    db.close();
  }
};

describe('where the data is', () => {
  it('says where the database file is and what it holds', async () => {
    const app = startApp('mine');
    expect(await app.handlers.getDataInfo(undefined)).toEqual({
      path: join(app.dataDir, DATABASE_FILE_NAME),
      summary: { attempts: 0, problems: 0, firstDay: null, lastDay: null, longestStreak: 0 },
      hasImportBackup: false,
      importBackupName: IMPORT_BACKUP_FILE_NAME,
      lastImport: null,
    });
    await reportStarters(app, 2);
    app.clock.set(noonLA('2026-11-26'));
    await reportStarters(app, 1);
    expect((await app.handlers.getDataInfo(undefined)).summary).toEqual({
      attempts: 3,
      problems: 3,
      firstDay: '2026-11-25',
      lastDay: '2026-11-26',
      longestStreak: 2,
    });
  });

  it('shows the database file in Finder, and never asks the UI for a path', async () => {
    const app = startApp('mine');
    expect(await app.handlers.showDataInFinder(undefined)).toEqual({ ok: true });
    expect(app.dialogs.revealed).toEqual([join(app.dataDir, DATABASE_FILE_NAME)]);
  });
});

describe('export', () => {
  it('saves a complete copy where the user chose, named for today', async () => {
    const app = startApp('mine');
    await reportStarters(app, 3);
    const target = join(dir, 'My backup.sqlite3');
    app.dialogs.save = target;
    expect(await app.handlers.exportData(undefined)).toEqual({ saved: true, path: target });
    expect(app.dialogs.suggestedNames).toEqual(['ParaLeet backup 2026-11-25.sqlite3']);
    const check = inspectDatabaseFile(target);
    expect(check).toMatchObject({ ok: true, summary: { attempts: 3, problems: 3, schemaVersion: LATEST_SCHEMA_VERSION } });
    // The app keeps working on its own file afterwards.
    await reportStarters(app, 1);
    expect(countAttempts(target)).toBe(3);
  });

  it('does not carry the API key', async () => {
    const app = startApp('mine');
    await app.handlers.saveApiKey({ apiKey: 'sk-ant-secret-key-123456' });
    const target = join(dir, 'backup.sqlite3');
    app.dialogs.save = target;
    await app.handlers.exportData(undefined);
    const copy = new Db(target);
    try {
      const tables = copy.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").map((row) => row.name);
      for (const table of tables) {
        expect(JSON.stringify(copy.all(`SELECT * FROM "${table}"`))).not.toContain('sk-ant-secret-key-123456');
      }
    } finally {
      copy.close();
    }
  });

  it('does nothing when the dialog is cancelled', async () => {
    const app = startApp('mine');
    app.dialogs.save = null;
    expect(await app.handlers.exportData(undefined)).toEqual({ saved: false });
  });

  it('says so in plain words when the copy cannot be written, or would overwrite the database itself', async () => {
    const app = startApp('mine');
    app.dialogs.save = join(dir, 'no-such-folder', 'backup.sqlite3');
    await expect(app.handlers.exportData(undefined)).rejects.toThrow(
      'The copy could not be saved there. Choose another place and try again.',
    );
    app.dialogs.save = join(app.dataDir, DATABASE_FILE_NAME);
    await expect(app.handlers.exportData(undefined)).rejects.toThrow(
      'That is the file ParaLeet is using. Choose another place for the copy.',
    );
    // The database is still whole and in use.
    await reportStarters(app, 1);
    expect((await app.handlers.getDataInfo(undefined)).summary.attempts).toBe(1);
  });
});

describe('import', () => {
  /** A backup made by another install, with `attempts` attempts. */
  async function makeBackup(attempts: number): Promise<string> {
    const other = startApp('other', noonLA('2026-10-10'));
    await reportStarters(other, attempts);
    const target = join(dir, `backup-${attempts}.sqlite3`);
    other.dialogs.save = target;
    await other.handlers.exportData(undefined);
    return target;
  }

  it('says what is in the chosen file and what it would replace, and changes nothing yet', async () => {
    const backup = await makeBackup(4);
    const app = startApp('mine');
    await reportStarters(app, 1);
    app.dialogs.open = backup;
    expect(await app.handlers.chooseImport(undefined)).toEqual({
      chosen: true,
      ok: true,
      fileName: 'backup-4.sqlite3',
      incoming: { attempts: 4, problems: 4, firstDay: '2026-10-10', lastDay: '2026-10-10', longestStreak: 1 },
      current: { attempts: 1, problems: 1, firstDay: '2026-11-25', lastDay: '2026-11-25', longestStreak: 1 },
    });
    expect(hasStagedImport(app.dataDir)).toBe(false);
    expect(app.restarts()).toBe(0);
    expect((await app.handlers.getDataInfo(undefined)).summary.attempts).toBe(1);
  });

  it('on yes: stages the file, restarts, and the next launch runs on the imported data with a backup kept', async () => {
    const backup = await makeBackup(4);
    const app = startApp('mine');
    await reportStarters(app, 1);
    app.dialogs.open = backup;
    await app.handlers.chooseImport(undefined);
    expect(await app.handlers.applyImport(undefined)).toEqual({ ok: true });
    expect(app.restarts()).toBe(1);
    expect(existsSync(join(app.dataDir, STAGED_IMPORT_FILE_NAME))).toBe(true);
    // Until the restart the app is still on its own data.
    expect((await app.handlers.getDataInfo(undefined)).summary.attempts).toBe(1);

    // The restart: the database is closed, the staged file is swapped in, the app opens again.
    app.close();
    expect(applyStagedImport(app.dataDir)).toMatchObject({ status: 'applied' });
    const again = createTestApp({ now: noonLA('2026-11-25'), path: join(app.dataDir, DATABASE_FILE_NAME) });
    apps.push(again);
    again.ctx.session = newSession({ status: 'applied' });
    const info = await again.handlers.getDataInfo(undefined);
    expect(info.summary).toMatchObject({ attempts: 4, problems: 4 });
    expect(info).toMatchObject({ hasImportBackup: true, lastImport: { status: 'applied' } });
    expect(countAttempts(join(app.dataDir, IMPORT_BACKUP_FILE_NAME))).toBe(1);
    // The imported streak is from October: the app shows it as it is today.
    expect((await again.handlers.getToday(undefined)).streak).toMatchObject({ current: 0, longest: 1 });
  });

  it('refuses a file that is not a ParaLeet database, a damaged one and the database itself, and changes nothing', async () => {
    const app = startApp('mine');
    await reportStarters(app, 1);
    const text = join(dir, 'notes.sqlite3');
    writeFileSync(text, 'This is not a database at all.');
    app.dialogs.open = text;
    expect(await app.handlers.chooseImport(undefined)).toEqual({
      chosen: true,
      ok: false,
      fileName: 'notes.sqlite3',
      reason: 'That file is not a ParaLeet database, or it is damaged.',
    });
    app.dialogs.open = join(app.dataDir, DATABASE_FILE_NAME);
    expect(await app.handlers.chooseImport(undefined)).toMatchObject({
      chosen: true,
      ok: false,
      reason: 'That is the file ParaLeet is already using.',
    });
    // Nothing was remembered, so a yes has nothing to apply.
    await expect(Promise.resolve().then(() => app.handlers.applyImport(undefined))).rejects.toThrow('Choose a file to import first.');
    expect(hasStagedImport(app.dataDir)).toBe(false);
    expect(app.restarts()).toBe(0);
    expect((await app.handlers.getDataInfo(undefined)).summary.attempts).toBe(1);
  });

  it('refuses a file from a newer ParaLeet', async () => {
    const backup = await makeBackup(2);
    const newer = new Db(backup);
    newer.exec(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION + 1}`);
    newer.close();
    const app = startApp('mine');
    app.dialogs.open = backup;
    expect(await app.handlers.chooseImport(undefined)).toMatchObject({
      chosen: true,
      ok: false,
      reason: 'That file was made by a newer ParaLeet. Update ParaLeet, then import it.',
    });
  });

  it('does nothing when the dialog is cancelled, or when the user says no', async () => {
    const backup = await makeBackup(2);
    const app = startApp('mine');
    app.dialogs.open = null;
    expect(await app.handlers.chooseImport(undefined)).toEqual({ chosen: false });
    app.dialogs.open = backup;
    await app.handlers.chooseImport(undefined);
    expect(await app.handlers.cancelImport(undefined)).toEqual({ ok: true });
    await expect(Promise.resolve().then(() => app.handlers.applyImport(undefined))).rejects.toThrow('Choose a file to import first.');
    expect(hasStagedImport(app.dataDir)).toBe(false);
    expect(app.restarts()).toBe(0);
  });

  it('checks the file again on yes: one that went bad in the meantime is refused and nothing restarts', async () => {
    const backup = await makeBackup(2);
    const app = startApp('mine');
    await reportStarters(app, 1);
    app.dialogs.open = backup;
    await app.handlers.chooseImport(undefined);
    writeFileSync(backup, 'overwritten by something else');
    await expect(Promise.resolve().then(() => app.handlers.applyImport(undefined))).rejects.toThrow(
      'That file is not a ParaLeet database, or it is damaged.',
    );
    expect(hasStagedImport(app.dataDir)).toBe(false);
    expect(app.restarts()).toBe(0);
    expect((await app.handlers.getDataInfo(undefined)).summary.attempts).toBe(1);
  });

  it('tells Settings when the launch refused a staged import', async () => {
    const app = startApp('mine');
    app.ctx.session = newSession({ status: 'rejected', reason: 'That file is damaged and cannot be imported.' });
    expect((await app.handlers.getDataInfo(undefined)).lastImport).toEqual({
      status: 'rejected',
      reason: 'That file is damaged and cannot be imported.',
    });
  });
});
