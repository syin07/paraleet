import type { ReactNode } from 'react';
import { cx } from '../lib/format';

/**
 * Para's speech bubble: pixel font on a hard-edged box with a small stepped tail. `tail` says
 * where the bird is: below the bubble (the floating pet) or to its lower left (the Today screen).
 * Pet text is the only place the pixel font is used (docs/design-references.md, D).
 */
export function SpeechBubble({
  children,
  className,
  tail = 'down',
}: {
  children: ReactNode;
  className?: string;
  tail?: 'down' | 'left';
}) {
  const steps =
    tail === 'down'
      ? ['left-1/2 -ml-1.5 w-3', 'left-1/2 -ml-1 mt-0.5 w-2', 'left-1/2 -ml-0.5 mt-1 w-1']
      : ['left-2 w-3', 'left-2 mt-0.5 w-2', 'left-2 mt-1 w-1'];
  return (
    <div className={cx('relative inline-block', className ?? 'max-w-[208px]')}>
      <div className="border-2 border-line bg-surface px-2 py-2 font-pixel text-[8px] leading-[14px] text-fg [overflow-wrap:anywhere]">
        {children}
      </div>
      {steps.map((step) => (
        <div key={step} className={cx('absolute top-full h-0.5 bg-line', step)} aria-hidden />
      ))}
    </div>
  );
}
