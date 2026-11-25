import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import { productionCsp } from './vite.shared.ts';

// Third-party code is bundled into main and preload (externalizeDeps: false), so the packaged app
// needs no node_modules folder. Electron and Node built-ins stay external.
export default defineConfig({
  main: {
    build: {
      externalizeDeps: false,
      rollupOptions: { input: { index: resolve('src/main/index.ts') } },
    },
  },
  preload: {
    build: {
      externalizeDeps: false,
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
        // Sandboxed preload scripts must be CommonJS.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve('src/ui'),
    build: {
      rollupOptions: { input: { index: resolve('src/ui/index.html') } },
    },
    plugins: [react(), tailwindcss(), productionCsp()],
  },
});
