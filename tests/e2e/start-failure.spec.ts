import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { makeUserDataDir, ROOT, TEST_ZONE } from './launch';

// Decision 0018, item 7: a start that fails must not leave the app running with no window. It is
// written to the log and the app quits. (An installed app also shows a dialog; a test run has
// nobody to close one.) The app is started as a plain process here, because it is expected to
// quit before a test driver could attach to it.
test('a start that fails is written to the log and the app quits', async () => {
  const data = makeUserDataDir();
  try {
    // In Node, the electron package's export is the path of its binary.
    const electronPath = createRequire(import.meta.url)('electron') as unknown as string;
    const child = spawn(electronPath, [ROOT], {
      cwd: ROOT,
      stdio: 'ignore',
      env: {
        ...process.env,
        PARALEET_E2E: '1',
        PARALEET_USER_DATA_DIR: data.dir,
        PARALEET_FAKE_NOW: '2026-11-25T20:00:00.000Z',
        PARALEET_FAKE_TZ: TEST_ZONE,
        PARALEET_E2E_FAIL_START: '1',
      },
    });
    const code = await new Promise<number | null>((resolve) => {
      const timer = setTimeout(() => {
        // Still running: that is the failure this test is for. Stop it and say so.
        child.kill('SIGKILL');
        resolve(null);
      }, 30_000);
      child.once('exit', (exitCode) => {
        clearTimeout(timer);
        resolve(exitCode);
      });
    });
    expect(code).toBe(1);
    const logPath = join(data.dir, 'paraleet.log');
    expect(existsSync(logPath)).toBe(true);
    const log = readFileSync(logPath, 'utf8');
    expect(log).toMatch(/ERROR ParaLeet could not start: Error: A test asked the start to fail\./);
    // The start got as far as opening the database, and no half-made import is left behind.
    expect(existsSync(join(data.dir, 'paraleet.sqlite3'))).toBe(true);
  } finally {
    data.remove();
  }
});
