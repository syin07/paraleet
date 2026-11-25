import { useEffect, useState } from 'react';

export const SCREENS = ['today', 'problems', 'plan', 'stats', 'settings'] as const;
export type ScreenId = (typeof SCREENS)[number];

/** Everything the hash can route to. The sprite gallery is a tool screen: routable, but not in the sidebar or Cmd+1..5. */
export type RouteId = ScreenId | 'gallery';

function fromHash(hash: string): RouteId {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0] ?? '';
  if (name === 'gallery') return 'gallery';
  return (SCREENS as readonly string[]).includes(name) ? (name as ScreenId) : 'today';
}

/** Moves to a screen. The hash is the single source of truth, so tests and main can deep-link. */
export function navigate(screen: ScreenId): void {
  window.location.hash = `/${screen}`;
}

/**
 * Counts how many times the URL has asked for an action on a screen, as in `#/today/swap`. The
 * action is cleared from the URL as it is read, so reloading or going back does not repeat it,
 * and asking again later counts again.
 */
export function useHashAction(screen: ScreenId, action: string): number {
  const [requests, setRequests] = useState(0);
  useEffect(() => {
    function check(): void {
      const [first, second] = window.location.hash.replace(/^#\/?/, '').split(/[/?]/);
      if (first === screen && second === action) {
        setRequests((count) => count + 1);
        window.history.replaceState(null, '', `#/${screen}`);
      }
    }
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
  }, [screen, action]);
  return requests;
}

export function useScreen(): RouteId {
  const [screen, setScreen] = useState<RouteId>(() => fromHash(window.location.hash));
  useEffect(() => {
    const onChange = (): void => setScreen(fromHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return screen;
}
