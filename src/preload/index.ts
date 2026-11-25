// The preload script: exposes the bridge to the UI as `window.paraleet`. It forwards calls to the
// main process and nothing else. It runs sandboxed, with no Node access.
import { contextBridge, ipcRenderer } from 'electron';
import { BRIDGE_METHODS, CHANGED_EVENT, IPC_PREFIX, NAVIGATE_EVENT } from '../bridge/channels';

const api: Record<string, unknown> = {};
for (const method of BRIDGE_METHODS) {
  api[method] = (input?: unknown) => ipcRenderer.invoke(IPC_PREFIX + method, input);
}
api.onChanged = (listener: () => void) => {
  const handler = (): void => listener();
  ipcRenderer.on(CHANGED_EVENT, handler);
  return () => {
    ipcRenderer.removeListener(CHANGED_EVENT, handler);
  };
};

api.onNavigate = (listener: (path: string) => void) => {
  const handler = (_event: unknown, path: unknown): void => {
    if (typeof path === 'string') listener(path);
  };
  ipcRenderer.on(NAVIGATE_EVENT, handler);
  return () => {
    ipcRenderer.removeListener(NAVIGATE_EVENT, handler);
  };
};

contextBridge.exposeInMainWorld('paraleet', api);
