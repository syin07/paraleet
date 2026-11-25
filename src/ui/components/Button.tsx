import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/format';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent font-semibold hover:bg-accent-hover active:bg-accent-pressed',
  secondary:
    'bg-raised text-fg border border-line hover:bg-raised-hover hover:border-line-strong active:bg-surface',
  ghost: 'bg-transparent text-fg-secondary hover:bg-surface hover:text-fg active:bg-raised',
  danger: 'bg-hard text-white font-semibold hover:bg-hard-hover active:bg-hard-pressed',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-6 px-2 text-sm gap-1',
  md: 'h-8 px-3 text-base gap-1.5',
  lg: 'h-10 px-4 text-base font-semibold gap-2',
};

const ICON_ONLY: Record<ButtonSize, string> = { sm: 'h-6 w-6', md: 'h-8 w-8', lg: 'h-10 w-10' };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shown before the label. Replaced by a spinner while `loading`. */
  icon?: ReactNode;
  /** Disables the button and shows a spinner; the label stays. */
  loading?: boolean;
  /** Square button with only an icon. Give it an `aria-label`. */
  iconOnly?: boolean;
}

/** The one button. Variants and sizes are in docs/design-references.md, section D. */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  iconOnly = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx(
        'focus-ring app-no-drag inline-flex shrink-0 items-center justify-center rounded-sm whitespace-nowrap transition-colors duration-100',
        'disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        iconOnly ? ICON_ONLY[size] : SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}
