import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

async function boot(): Promise<void> {
  if (!window.paraleet) {
    // A plain browser has no Electron preload: use the in-memory mock (dev and UI tests only).
    const { installMockBridge } = await import('./mock/mockBridge');
    installMockBridge(new URLSearchParams(window.location.search).get('scenario'));
  }
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root');
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
