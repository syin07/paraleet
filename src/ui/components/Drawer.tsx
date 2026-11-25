import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Button } from './Button';

export interface DrawerProps {
  title: ReactNode;
  /** A quiet line under the title: badges, difficulty, topics. */
  meta?: ReactNode;
  /** Extra icon buttons shown before the close button. */
  actions?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * A right-side panel, 400px wide, with no backdrop: the list behind it stays usable. Esc closes
 * it. Render it inside a `relative` container that fills the content area.
 */
export function Drawer({ title, meta, actions, onClose, footer, children }: DrawerProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <aside
      aria-label="Details"
      className="animate-slide-in-right absolute inset-y-0 right-0 z-30 flex w-[400px] max-w-full flex-col border-l border-line bg-surface shadow-popover"
    >
      <header className="flex items-start gap-2 px-5 pt-5 pb-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-fg" data-selectable>
            {title}
          </h2>
          {meta && <div className="mt-1.5 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions}
        <Button variant="ghost" size="sm" iconOnly aria-label="Close" onClick={onClose} icon={<X className="h-4 w-4" />} />
      </header>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 pb-5">{children}</div>
      {footer && <footer className="flex items-center gap-2 border-t border-line-subtle px-5 py-3">{footer}</footer>}
    </aside>
  );
}

/** A drawer section with a small caps header. */
export function DrawerSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="section-label mb-2">{label}</h3>
      {children}
    </section>
  );
}
