import type { InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cx } from '../lib/format';

const SHELL =
  'focus-ring app-no-drag w-full rounded-sm border bg-sunken px-2.5 text-base text-fg placeholder:text-fg-muted transition-colors duration-100 hover:border-line-strong focus:border-accent disabled:opacity-40';

function border(invalid?: boolean): string {
  return invalid ? 'border-hard' : 'border-line';
}

export interface FieldProps {
  label: ReactNode;
  /** Quiet helper text under the control. */
  hint?: ReactNode;
  /** Red text under the control; also marks it invalid. */
  error?: string | null;
  className?: string;
  children: ReactNode;
}

/** A label above a control, with optional helper or error text below. */
export function Field({ label, hint, error, className, children }: FieldProps) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 flex items-center gap-1.5 text-sm text-fg-secondary">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-sm text-hard-text">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-sm text-fg-muted">{hint}</span>
      )}
    </label>
  );
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** `lg` is the 40px URL field; `md` (32px) is the default. */
  size?: 'md' | 'lg';
  invalid?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function Input({ size = 'md', invalid, className, ...rest }: InputProps) {
  return <input className={cx(SHELL, border(invalid), size === 'lg' ? 'h-10' : 'h-8', className)} {...rest} />;
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ invalid, className, rows = 3, ...rest }: TextareaProps) {
  return <textarea rows={rows} className={cx(SHELL, border(invalid), 'resize-none py-1.5', className)} {...rest} />;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export function Select({ invalid, className, children, ...rest }: SelectProps) {
  return (
    <select className={cx(SHELL, border(invalid), 'h-8 pr-7', className)} {...rest}>
      {children}
    </select>
  );
}
