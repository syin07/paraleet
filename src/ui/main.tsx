import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/press-start-2p/latin-ext-400.css';
import { App } from './App';
import './styles.css';
import { CardWindow } from './windows/card/CardWindow';
import { PetWindow } from './windows/pet/PetWindow';

/** Small windows load the same bundle with their own route and none of the main window's shell. */
function windowKind(): 'main' | 'pet' | 'card' {
  const route = window.location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return route === 'pet' || route === 'card' ? route : 'main';
}

async function boot(): Promise<void> {
  if (!window.paraleet) {
    // A plain browser has no Electron preload: use the in-memory mock (dev and UI tests only).
    const { installMockBridge } = await import('./mock/mockBridge');
    installMockBridge(new URLSearchParams(window.location.search).get('scenario'));
  }
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root');
  const kind = windowKind();
  // The stylesheet makes the page transparent for the pet window and the card.
  document.documentElement.dataset.window = kind;
  const page = kind === 'pet' ? <PetWindow /> : kind === 'card' ? <CardWindow /> : <App />;
  createRoot(root).render(<StrictMode>{page}</StrictMode>);
}

void boot();
