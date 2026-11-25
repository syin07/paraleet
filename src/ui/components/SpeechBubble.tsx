import type { ReactNode } from 'react';
import { cx } from '../lib/format';

/**
 * Para's speech bubble: pixel font on a stepped, hard-edged box with a small tail pointing down
 * at the bird. Pet text is the only place the pixel font is used (docs/design-references.md, D).
 */
export function SpeechBubble({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('relative inline-block max-w-[208px]', className)} role="status">
      <div className="border-2 border-line bg-surface px-2 py-2 font-pixel text-[8px] leading-[14px] text-fg [overflow-wrap:anywhere]">
        {children}
      </div>
      {/* A two-step pixel tail under the bubble. */}
      <div className="absolute top-full left-1/2 -ml-1.5 h-0.5 w-3 bg-line" aria-hidden />
      <div className="absolute top-full left-1/2 -ml-1 mt-0.5 h-0.5 w-2 bg-line" aria-hidden />
      <div className="absolute top-full left-1/2 -ml-0.5 mt-1 h-0.5 w-1 bg-line" aria-hidden />
    </div>
  );
}
