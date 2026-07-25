import { useState, ReactNode } from 'react';
import { clsx } from 'clsx';
import { useDismissible } from '@/hooks/useDismissible';
type Position = 'top' | 'bottom' | 'left' | 'right';
interface TooltipProps { content: ReactNode; position?: Position; children: ReactNode; className?: string; }
export function Tooltip({ content, position = 'top', children, className }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  // WCAG 2.2 SC 1.4.13 requires hover/focus content to be dismissible without
  // moving the pointer. On the stack rather than a listener of its own so that a
  // tooltip shown over a dialog takes the first Escape and the dialog takes the
  // second, instead of both reacting to one press.
  useDismissible(visible, () => setVisible(false), 'tooltip');
  const posClasses = { top: 'bottom-full left-1/2 -translate-x-1/2 mb-2', bottom: 'top-full left-1/2 -translate-x-1/2 mt-2', left: 'right-full top-1/2 -translate-y-1/2 mr-2', right: 'left-full top-1/2 -translate-y-1/2 ml-2' };
  return (
    <div className="relative inline-block">
      <div tabIndex={0} role="button" aria-describedby="tooltip" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)} onFocus={() => setVisible(true)} onBlur={() => setVisible(false)} onKeyDown={(e) => { if (e.key === 'Escape') setVisible(false); }}>{children}</div>
      {visible && <div id="tooltip" role="tooltip" className={clsx('absolute z-50 rounded-md bg-navy-deep px-2 py-1 text-xs text-slate-100 shadow-lg pointer-events-none', posClasses[position], className)}>{content}</div>}
    </div>
  );
}
