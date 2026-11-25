// The compact card's page (PRD section 11; docs/design-references.md, section 9): today's
// problem, "Open problem" and "I solved it", opened from the floating pet or the menu bar icon.
// The real card arrives with SAN-115; this stand-in keeps the route and the window working.
import { api } from '../../bridge';
import { problemTitle } from '../../lib/format';
import { useBridgeQuery } from '../../lib/useBridgeQuery';

export function CardWindow() {
  const today = useBridgeQuery(() => api().getToday());
  const problem = today.data?.assignment?.problem ?? null;
  return (
    <div className="m-2 rounded-xl border border-line bg-surface p-4 text-base text-fg shadow-popover" data-testid="card">
      {problem ? problemTitle(problem) : 'Nothing assigned today'}
    </div>
  );
}
