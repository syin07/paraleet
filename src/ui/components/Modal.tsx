import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  const body = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  // Whether the body scrolls, and whether it is already at its end (the fade then has nothing to hint at).
  const [scroll, setScroll] = useState({ scrolls: false, atEnd: true });

  useEffect(() => {
    const element = body.current;
    if (!element) return;
    function measure(): void {
      if (!element) return;
      const scrolls = element.scrollHeight - element.clientHeight > 1;
      const atEnd = element.scrollHeight - element.clientHeight - element.scrollTop <= 1;
      setScroll((current) => (current.scrolls === scrolls && current.atEnd === atEnd ? current : { scrolls, atEnd }));
    }
    measure();
    element.addEventListener('scroll', measure);
    // The body changes size with the window; its content changes size when fields appear.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (content.current) observer.observe(content.current);
    return () => {
      element.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, []);

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
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div ref={body} data-scrolls={scroll.scrolls} className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div ref={content}>{children}</div>
          </div>
          {scroll.scrolls && !scroll.atEnd && (
            <div
              aria-hidden
              data-testid="modal-scroll-fade"
              className="pointer-events-none absolute right-0 bottom-0 left-0 h-8"
              style={{ background: 'linear-gradient(to top, var(--color-surface), transparent)' }}
            />
          )}
        </div>
        {footer && (
          // The border is always there but only visible while the body scrolls; the negative margin
          // keeps the layout the same either way.
          <div
            data-testid="modal-footer"
            className={cx(
              '-mt-px flex justify-end gap-2 border-t px-6 pb-6',
              scroll.scrolls ? 'border-line-subtle pt-4' : 'border-transparent',
            )}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
