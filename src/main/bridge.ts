// Registers one IPC handler per bridge method. Every input is validated here before it reaches
// a service, and calls from anything other than the app's own windows are refused.
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { BRIDGE_METHODS, IPC_PREFIX } from '../bridge/channels';
import { inputSchemas, type BridgeHandlers } from '../bridge/contract';

export function registerBridge(handlers: BridgeHandlers, isTrustedSender: (event: IpcMainInvokeEvent) => boolean): void {
  for (const method of BRIDGE_METHODS) {
    ipcMain.handle(IPC_PREFIX + method, async (event, raw: unknown) => {
      if (!isTrustedSender(event)) throw new Error('Refused: unknown sender');
      const parsed = inputSchemas[method].safeParse(raw);
      if (!parsed.success) {
        throw new Error(`Invalid input for ${method}: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
      }
      const handler = handlers[method] as (input: unknown) => unknown;
      return await handler(parsed.data);
    });
  }
}
