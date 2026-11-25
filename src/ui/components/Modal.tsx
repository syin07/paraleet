import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { cx } from '../lib/format';
import { Button } from './Button';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  title: string;
  /** A quiet line under the title. */
  subtitle?: ReactNode;
  onClose: () => void;
  /** 480 for forms (default), 520 for the add-problem dialog. */
  width?: number;
  /** Right-aligned buttons; put the primary one last. */
  footer?: ReactNode;
  children: ReactNode;
}

/** A centered dialog over a dark backdrop. Esc closes it and Tab stays inside it. */
export function Modal({ title, subtitle, onClose, width = 480, footer, children }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current;
    first?.focus();
    return () => previous?.focus?.();
  }, []);

  function onKeyDown(event: React.KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-overlay p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={{ width }}
        className={cx(
          'animate-rise-in flex max-h-[80vh] max-w-full flex-col rounded-lg border border-line bg-surface shadow-popover outline-none',
        )}
      >
        <div className="flex items-start gap-3 px-6 pt-6">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-fg">{title}</h2>
            {subtitle && <div className="mt-1 text-sm text-fg-secondary">{subtitle}</div>}
          </div>
          <Button variant="ghost" size="sm" iconOnly aria-label="Close" onClick={onClose} icon={<X className="h-4 w-4" />} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-6 pb-6">{footer}</div>}
      </div>
    </div>
  );
}
