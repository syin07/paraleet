import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { uiPort } from './vite.shared';

// Serves the renderer alone in a normal browser. There is no Electron preload there, so the UI
// falls back to the mock bridge in src/ui/mock. Used for fast UI work and the Playwright UI tests.
export default defineConfig({
  root: resolve('src/ui'),
  plugins: [react(), tailwindcss()],
  server: { port: uiPort(), strictPort: true },
});
