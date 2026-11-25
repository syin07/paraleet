import { defineConfig, devices } from '@playwright/test';
import { uiPort } from './vite.shared.ts';

const UI_PORT = uiPort();

// The browser-only UI server is needed by the `ui` project only. Skipping it for
// `--project=e2e` keeps end-to-end runs fast and free of port clashes between worktrees.
const onlyE2E = process.argv.includes('--project=e2e');

// Two projects:
//   ui  - the renderer in a browser against the mock bridge (fast; used for screen work and screenshots)
//   e2e - the built Electron app with a real database in a temp folder (smoke tests)
export default defineConfig({
  outputDir: 'test-results',
  reporter: [['list']],
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  projects: [
    {
      name: 'ui',
      testDir: 'tests/ui',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${UI_PORT}`,
        viewport: { width: 1100, height: 720 },
        colorScheme: 'dark',
      },
    },
    {
      name: 'e2e',
      testDir: 'tests/e2e',
      // The real app can be slow to start while several agents build at once.
      expect: { timeout: 20_000 },
    },
  ],
  webServer: onlyE2E
    ? undefined
    : {
        command: 'npm run dev:ui',
        url: `http://localhost:${UI_PORT}`,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
