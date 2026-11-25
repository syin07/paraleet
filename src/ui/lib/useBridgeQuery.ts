import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../bridge';

export interface QueryState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  /** Fetches again now. */
  reload: () => void;
}

/**
 * Loads data through the bridge and reloads it whenever the app says something changed (an
 * attempt was reported, the day rolled over, settings were edited). `deps` works like useEffect's.
 */
export function useBridgeQuery<T>(load: () => Promise<T>, deps: readonly unknown[] = []): QueryState<T> {
  const [state, setState] = useState<{ data: T | undefined; error: string | null; loading: boolean }>({
    data: undefined,
    error: null,
    loading: true,
  });
  const loadRef = useRef(load);
  const requestId = useRef(0);

  useEffect(() => {
    loadRef.current = load;
  });

  const reload = useCallback(() => {
    const id = ++requestId.current;
    loadRef.current().then(
      (data) => {
        if (id === requestId.current) setState({ data, error: null, loading: false });
      },
      (error: unknown) => {
        if (id === requestId.current) {
          setState((previous) => ({
            data: previous.data,
            error: error instanceof Error ? error.message : String(error),
            loading: false,
          }));
        }
      },
    );
  }, []);

  useEffect(() => {
    reload();
    return api().onChanged(reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller's deps decide when to refetch
  }, [reload, ...deps]);

  return { ...state, reload };
}
