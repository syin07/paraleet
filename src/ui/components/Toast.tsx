import { Check } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Holds the one toast message and clears it after `durationMs`. A new `show` restarts the timer. */
export function useToast(durationMs = 2000): { message: string | null; show: (message: string) => void } {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback(
    (next: string) => {
      window.clearTimeout(timer.current);
      setMessage(next);
      timer.current = window.setTimeout(() => setMessage(null), durationMs);
    },
    [durationMs],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { message, show };
}

/** A small confirmation at the bottom centre. The live region stays mounted so screen readers announce it. */
export function Toast({ message }: { message: string | null }) {
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center"
    >
      {message && (
        <div className="flex h-9 items-center gap-2 rounded-md border border-line bg-raised px-3 text-base text-fg shadow-popover">
          <Check className="h-3.5 w-3.5 text-easy" aria-hidden />
          {message}
        </div>
      )}
    </div>
  );
}
