import { cx } from '../lib/format';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Read by screen readers; the visible label sits next to the toggle. */
  label: string;
  disabled?: boolean;
}

/** An on/off switch (docs/design-references.md, section C.8): 32x18 track, 14px knob. */
export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'focus-ring app-no-drag relative h-[18px] w-8 shrink-0 rounded-full border transition-colors duration-100 disabled:opacity-40',
        checked ? 'border-accent bg-accent' : 'border-line-strong bg-raised hover:bg-raised-hover',
      )}
    >
      <span
        aria-hidden
        className={cx(
          'absolute top-px left-px h-3.5 w-3.5 rounded-full bg-white transition-transform duration-100',
          checked && 'translate-x-3.5',
        )}
      />
    </button>
  );
}
