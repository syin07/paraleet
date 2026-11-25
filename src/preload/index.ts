// The preload script: exposes the bridge to the UI as `window.paraleet`. It forwards calls to the
// main process and nothing else. It runs sandboxed, with no Node access.
import { contextBridge, ipcRenderer } from 'electron';
import { BRIDGE_METHODS, CHANGED_EVENT, IPC_PREFIX, NAVIGATE_EVENT, unwrapReply } from '../bridge/channels';

const api: Record<string, unknown> = {};
for (const method of BRIDGE_METHODS) {
  // Main answers with the value or a message; a failure is thrown here with that message as it is.
  api[method] = (input?: unknown) => ipcRenderer.invoke(IPC_PREFIX + method, input).then(unwrapReply);
}
api.onChanged = (listener: () => void) => {
  const handler = (): void => listener();
  ipcRenderer.on(CHANGED_EVENT, handler);
  return () => {
    ipcRenderer.removeListener(CHANGED_EVENT, handler);
  };
};

// Main may ask for a screen before the UI has started listening: the page is loaded, but the app
// in it is still starting. The last such request is kept and handed to the next listener to register.
const navigateListeners = new Set<(path: string) => void>();
let waitingPath: string | null = null;
ipcRenderer.on(NAVIGATE_EVENT, (_event: unknown, path: unknown): void => {
  if (typeof path !== 'string') return;
  if (navigateListeners.size === 0) {
    waitingPath = path;
    return;
  }
  for (const listener of navigateListeners) listener(path);
});

api.onNavigate = (listener: (path: string) => void) => {
  navigateListeners.add(listener);
  if (waitingPath !== null) {
    const path = waitingPath;
    waitingPath = null;
    listener(path);
  }
  return () => {
    navigateListeners.delete(listener);
  };
};

contextBridge.exposeInMainWorld('paraleet', api);
