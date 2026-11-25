import { useEffect, useState } from 'react';

export const SCREENS = ['today', 'problems', 'plan', 'stats', 'settings'] as const;
export type ScreenId = (typeof SCREENS)[number];

function fromHash(hash: string): ScreenId {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0] ?? '';
  return (SCREENS as readonly string[]).includes(name) ? (name as ScreenId) : 'today';
}

/** Moves to a screen. The hash is the single source of truth, so tests and main can deep-link. */
export function navigate(screen: ScreenId): void {
  window.location.hash = `/${screen}`;
}

export function useScreen(): ScreenId {
  const [screen, setScreen] = useState<ScreenId>(() => fromHash(window.location.hash));
  useEffect(() => {
    const onChange = (): void => setScreen(fromHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return screen;
}
