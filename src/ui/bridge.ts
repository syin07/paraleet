// The UI's only door to the app. In Electron this is the preload bridge; in a plain browser
// (npm run dev:ui, Playwright UI tests) main.tsx installs the mock from src/ui/mock first.
import type { ParaLeetApi } from '../bridge/contract';

export function api(): ParaLeetApi {
  if (!window.paraleet) throw new Error('The bridge is not available');
  return window.paraleet;
}
