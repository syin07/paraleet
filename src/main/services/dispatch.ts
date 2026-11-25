// One bridge call, from raw input to the reply that goes back to the window. The input is
// validated here, before it reaches a use case, and a failure becomes a reply with its message
// instead of a rejected call (see `BridgeReply`).
import type { BridgeMethodName as BridgeMethod, BridgeReply } from '../../bridge/channels';
import { inputSchemas, type BridgeHandlers } from '../../bridge/contract';

export async function dispatch(
  handlers: BridgeHandlers,
  method: BridgeMethod,
  raw: unknown,
  /** Told about every failure, for the log. Never given the input, which may hold a secret. */
  onFailure: (method: BridgeMethod, error: unknown) => void = () => undefined,
): Promise<BridgeReply> {
  const parsed = inputSchemas[method].safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: `Invalid input for ${method}: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
    };
  }
  try {
    const handler = handlers[method] as (input: unknown) => unknown;
    return { ok: true, value: await handler(parsed.data) };
  } catch (error) {
    onFailure(method, error);
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
