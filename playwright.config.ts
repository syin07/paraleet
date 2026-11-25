import { defineConfig, devices } from '@playwright/test';
import { uiPort } from './vite.shared';

const UI_PORT = uiPort();

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
    },
  ],
  webServer: {
    command: 'npm run dev:ui',
    url: `http://localhost:${UI_PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
