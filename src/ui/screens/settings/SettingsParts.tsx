import { Check, Lock } from 'lucide-react';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { ACCESSORIES, ACCESSORY_IDS, type AccessoryId } from '../../../core/types';
import { Card } from '../../components/Layout';
import { Input } from '../../components/Field';
import { cx } from '../../lib/format';

/** A titled group: small caps header, then a card of rows. */
export function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mb-8" aria-label={title}>
      <h2 className="section-label mb-2 px-1">{title}</h2>
      <Card padding="none" className="divide-y divide-line-subtle">
        {children}
      </Card>
      {note && <p className="mt-2 px-1 text-sm text-fg-muted">{note}</p>}
    </section>
  );
}

/** One row: label and description on the left, the control on the right, an error line below. */
export function Row({
  label,
  description,
  error,
  stacked = false,
  children,
}: {
  label: string;
  description?: string;
  error?: string | null;
  /** Puts the control under the label, for controls too wide to sit beside it. */
  stacked?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-14 flex-col justify-center px-4 py-2.5">
      <div className={cx('flex', stacked ? 'flex-col gap-2.5' : 'items-center justify-between gap-4')}>
        <div className="min-w-0">
          <div className="text-base text-fg">{label}</div>
          {description && <div className="text-sm text-fg-muted">{description}</div>}
        </div>
        <div className={cx(!stacked && 'shrink-0')}>{children}</div>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-sm text-hard-text">
          {error}
        </p>
      )}
    </div>
  );
}

/** One comparison for choosing a segment and for deciding whether a saved value is one of the choices. */
export function sameValue(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

export interface SegmentOption {
  value: number;
  label: string;
}

/** The generic segmented control (design section D): one sunken container, the chosen segment raised. */
export function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: SegmentOption[];
  value: number;
  onChange: (value: number) => void;
}) {
  const selected = Math.max(
    0,
    options.findIndex((option) => sameValue(option.value, value)),
  );

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = options[(selected + step + options.length) % options.length];
    if (next) onChange(next.value);
    const buttons = event.currentTarget.parentElement?.querySelectorAll('button');
    buttons?.[(selected + step + options.length) % options.length]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} className="app-no-drag inline-flex h-8 gap-0.5 rounded-sm bg-sunken p-0.5">
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={index === selected}
          tabIndex={index === selected ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={onKeyDown}
          className={cx(
            'focus-ring rounded-xs px-3 text-base transition-colors duration-100',
            index === selected ? 'bg-raised font-medium text-fg' : 'text-fg-secondary hover:text-fg',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A text field that saves when it loses focus or Enter is pressed. While the user has typed
 * something the field shows their text, so a change made elsewhere never overwrites it.
 */
export function DraftInput({
  label,
  value,
  onCommit,
  onEdit,
  invalid,
  className,
  ...inputProps
}: {
  label: string;
  /** The saved value. */
  value: string;
  /** Called with the typed text; resolves true when it was saved, false when it was refused. */
  onCommit: (text: string) => Promise<boolean>;
  /** Called on every keystroke, so the row can drop its old error. */
  onEdit: () => void;
  invalid: boolean;
  className?: string;
  placeholder?: string;
  maxLength?: number;
  inputMode?: 'numeric' | 'text';
}) {
  const [draft, setDraft] = useState<string | null>(null);

  async function commit(): Promise<void> {
    if (draft === null) return;
    const sent = draft;
    const saved = await onCommit(sent);
    // Keep anything typed while the save was running.
    if (saved) setDraft((current) => (current === sent ? null : current));
  }

  return (
    <Input
      aria-label={label}
      aria-invalid={invalid}
      value={draft ?? value}
      invalid={invalid}
      className={className}
      autoComplete="off"
      spellCheck={false}
      onChange={(event) => {
        setDraft(event.target.value);
        onEdit();
      }}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        // Blur does the saving, so Enter and focus loss take the same path.
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      {...inputProps}
    />
  );
}

/** Four selectable chips, one per accessory. A locked chip is disabled and its unlock text stays visible. */
export function AccessoryChips({
  unlocked,
  equipped,
  onChange,
}: {
  unlocked: readonly AccessoryId[];
  equipped: readonly AccessoryId[];
  onChange: (next: AccessoryId[]) => void;
}) {
  const locked = ACCESSORY_IDS.filter((id) => !unlocked.includes(id));

  function toggle(id: AccessoryId): void {
    const wearing = new Set(equipped);
    if (wearing.has(id)) wearing.delete(id);
    else wearing.add(id);
    onChange(ACCESSORY_IDS.filter((candidate) => wearing.has(candidate)));
  }

  return (
    <div>
      <div role="group" aria-label="Accessories" className="flex flex-wrap gap-2">
        {ACCESSORY_IDS.map((id) => {
          const isLocked = !unlocked.includes(id);
          const on = !isLocked && equipped.includes(id);
          const { label, unlockedBy } = ACCESSORIES[id];
          return (
            <button
              key={id}
              type="button"
              aria-pressed={isLocked ? undefined : on}
              disabled={isLocked}
              title={isLocked ? unlockedBy : undefined}
              onClick={() => toggle(id)}
              className={cx(
                'focus-ring app-no-drag inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-base transition-colors duration-100',
                on
                  ? 'border-accent-border bg-accent-subtle text-fg'
                  : 'border-line bg-sunken text-fg hover:bg-raised',
                isLocked && 'pointer-events-none text-fg-muted opacity-60',
              )}
            >
              {on && <Check className="h-3.5 w-3.5 text-accent" aria-hidden />}
              {isLocked && <Lock className="h-3 w-3" aria-hidden />}
              {label}
            </button>
          );
        })}
      </div>
      {locked.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-sm text-fg-muted">
          {locked.map((id) => (
            <li key={id}>
              {ACCESSORIES[id].label}: {ACCESSORIES[id].unlockedBy}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
