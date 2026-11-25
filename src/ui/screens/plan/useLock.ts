import { useCallback, useRef, useState } from 'react';

/**
 * One command at a time. `guard` runs the work unless another is in flight and says whether it
 * ran. The ref makes a double-click safe: state alone would still be false for the second click.
 */
export interface Lock {
  busy: boolean;
  guard: <T>(work: () => Promise<T>) => Promise<{ ran: false } | { ran: true; value: T }>;
}

export function useLock(): Lock {
  const flying = useRef(false);
  const [busy, setBusy] = useState(false);
  const guard = useCallback(async <T,>(work: () => Promise<T>) => {
    if (flying.current) return { ran: false as const };
    flying.current = true;
    setBusy(true);
    try {
      return { ran: true as const, value: await work() };
    } finally {
      flying.current = false;
      setBusy(false);
    }
  }, []);
  return { busy, guard };
}
