// A filter button that opens a small checkable menu. Local to the Problems screen.
import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { cx } from '../../lib/format';

export interface FilterOption<T extends string> {
  value: T;
  label: string;
}

export function FilterMenu<T extends string>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: FilterOption<T>[];
  selected: T[];
  onChange: (next: T[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent): void {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  function toggle(value: T): void {
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  }

  return (
    <div
      ref={root}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          // Keep Esc from also closing the detail drawer behind the menu.
          event.preventDefault();
          setOpen(false);
        }
      }}
    >
      <Button
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cx(selected.length > 0 && 'border-accent-border')}
      >
        {label}
        {selected.length > 0 && <span className="text-accent">{selected.length}</span>}
        <ChevronDown className="h-3 w-3 text-fg-muted" aria-hidden />
      </Button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute left-0 top-full z-20 mt-1 max-h-72 min-w-44 overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-popover"
        >
          {options.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemcheckbox"
                aria-checked={checked}
                onClick={() => toggle(option.value)}
                className="focus-ring flex h-8 w-full items-center gap-2 rounded-xs px-2 text-left text-base text-fg hover:bg-raised"
              >
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                  {checked && <Check className="h-3.5 w-3.5 text-accent" aria-hidden />}
                </span>
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
