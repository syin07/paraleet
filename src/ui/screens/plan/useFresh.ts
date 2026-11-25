import { useState } from 'react';

/**
 * Shows the newest of two sources: data a query loaded, and a value a command just returned.
 * A command's answer is shown at once; once the query loads something new, that wins again.
 */
export function useFresh<T>(loaded: T | undefined): [T | undefined, (value: T) => void] {
  const [returned, setReturned] = useState<{ value: T; basedOn: T | undefined } | null>(null);
  const current = returned && returned.basedOn === loaded ? returned.value : loaded;
  return [current, (value) => setReturned({ value, basedOn: loaded })];
}
