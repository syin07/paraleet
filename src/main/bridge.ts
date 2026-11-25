// Registers one IPC handler per bridge method. Calls from anything other than the app's own
// windows are refused; everything else goes through `dispatch`, which validates the input and
// turns a failure into a reply the UI can show.
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { BRIDGE_METHODS, IPC_PREFIX, type BridgeMethodName as BridgeMethod } from '../bridge/channels';
import type { BridgeHandlers } from '../bridge/contract';
import { dispatch } from './services/dispatch';

export function registerBridge(
  handlers: BridgeHandlers,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean,
  onFailure: (method: BridgeMethod, error: unknown) => void = () => undefined,
): void {
  for (const method of BRIDGE_METHODS) {
    ipcMain.handle(IPC_PREFIX + method, (event, raw: unknown) => {
      if (!isTrustedSender(event)) throw new Error('Refused: unknown sender');
      return dispatch(handlers, method, raw, onFailure);
    });
  }
}
