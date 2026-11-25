import { CalendarCheck, ChartColumn, ListChecks, Route, Settings, type LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { api } from './bridge';
import { SAMPLE_SEED, Sprite } from './components/Sprite';
import { cx } from './lib/format';
import { navigate, SCREENS, useScreen, type RouteId, type ScreenId } from './lib/navigation';
import { useBridgeQuery } from './lib/useBridgeQuery';
import { GalleryScreen } from './screens/gallery/GalleryScreen';
import { PlanScreen } from './screens/plan/PlanScreen';
import { ProblemsScreen } from './screens/problems/ProblemsScreen';
import { SettingsScreen } from './screens/settings/SettingsScreen';
import { StatsScreen } from './screens/stats/StatsScreen';
import { TodayScreen } from './screens/today/TodayScreen';

const NAV: Record<ScreenId, { label: string; icon: LucideIcon }> = {
  today: { label: 'Today', icon: CalendarCheck },
  problems: { label: 'Problems', icon: ListChecks },
  plan: { label: 'Plan', icon: Route },
  stats: { label: 'Stats', icon: ChartColumn },
  settings: { label: 'Settings', icon: Settings },
};

function NavItem({ id, active }: { id: ScreenId; active: boolean }) {
  const { label, icon: Icon } = NAV[id];
  return (
    <button
      type="button"
      onClick={() => navigate(id)}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'focus-ring app-no-drag flex h-8 w-full items-center gap-2.5 rounded-sm px-2 text-left text-base font-medium transition-colors duration-100',
        active ? 'bg-accent-subtle text-fg' : 'text-fg-secondary hover:bg-surface',
      )}
    >
      <Icon className={cx('h-4 w-4', active && 'text-accent')} aria-hidden />
      {label}
    </button>
  );
}

function Sidebar({ screen }: { screen: RouteId }) {
  const today = useBridgeQuery(() => api().getToday());
  const streak = today.data?.streak.current ?? 0;
  return (
    <nav aria-label="Main" className="flex w-[220px] shrink-0 flex-col border-r border-line-subtle bg-sunken">
      {/* Room for the macOS window buttons; the strip drags the window. */}
      <div className="app-drag h-[52px] shrink-0" />
      <div className="flex h-10 items-center gap-2 px-3">
        <Sprite seed={SAMPLE_SEED} stage="adult" size={32} decorative />
        <span className="text-base font-semibold text-fg">ParaLeet</span>
      </div>
      <div className="mt-2 flex flex-1 flex-col gap-0.5 px-2">
        {SCREENS.filter((id) => id !== 'settings').map((id) => (
          <NavItem key={id} id={id} active={screen === id} />
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 px-2 pb-2 text-sm text-fg-muted" data-testid="sidebar-streak">
          <span className={cx('h-1.5 w-1.5 rounded-full', streak > 0 ? 'bg-accent' : 'bg-line-strong')} />
          {streak > 0 ? `${streak}-day streak` : 'No streak yet'}
        </div>
        <NavItem id="settings" active={screen === 'settings'} />
        <div className="h-3" />
      </div>
    </nav>
  );
}

const SCREEN_VIEWS: Record<RouteId, () => React.JSX.Element> = {
  today: TodayScreen,
  problems: ProblemsScreen,
  plan: PlanScreen,
  stats: StatsScreen,
  settings: SettingsScreen,
  gallery: GalleryScreen,
};

export function App() {
  const screen = useScreen();

  useEffect(() => {
    // Cmd+1..5 switches screens.
    function onKeyDown(event: KeyboardEvent): void {
      if (!event.metaKey || event.altKey || event.shiftKey) return;
      const target = SCREENS[Number(event.key) - 1];
      if (target) {
        event.preventDefault();
        navigate(target);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    // Main can ask this window to show a screen, for example from the pet's right-click menu.
    const stopNavigating = api().onNavigate((path) => {
      window.location.hash = path;
    });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      stopNavigating();
    };
  }, []);

  const Screen = SCREEN_VIEWS[screen];
  return (
    <div className="flex h-full">
      <Sidebar screen={screen} />
      <main className="relative flex min-w-0 flex-1 flex-col">
        <div className="app-drag h-[52px] shrink-0" />
        <div className="min-h-0 flex-1 overflow-y-auto" data-testid={`screen-${screen}`}>
          <Screen />
        </div>
      </main>
    </div>
  );
}
