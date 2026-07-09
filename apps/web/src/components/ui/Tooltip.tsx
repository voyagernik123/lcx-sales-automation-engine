import { useState, useEffect, ReactNode } from 'react';
import { clsx } from 'clsx';
type Position = 'top' | 'bottom' | 'left' | 'right';
interface TooltipProps { content: ReactNode; position?: Position; children: ReactNode; className?: string; }
export function Tooltip({ content, position = 'top', children, className }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { if (!visible) return; const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setVisible(false); }; document.addEventListener('keydown', handleKey); return () => document.removeEventListener('keydown', handleKey); }, [visible]);
  const posClasses = { top: 'bottom-full left-1/2 -translate-x-1/2 mb-2', bottom: 'top-full left-1/2 -translate-x-1/2 mt-2', left: 'right-full top-1/2 -translate-y-1/2 mr-2', right: 'left-full top-1/2 -translate-y-1/2 ml-2' };
  return (
    <div className="relative inline-block">
      <div tabIndex={0} role="button" aria-describedby="tooltip" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)} onFocus={() => setVisible(true)} onBlur={() => setVisible(false)} onKeyDown={(e) => { if (e.key === 'Escape') setVisible(false); }}>{children}</div>
      {visible && <div id="tooltip" role="tooltip" className={clsx('absolute z-50 rounded-md bg-navy-deep px-2 py-1 text-xs text-ice shadow-lg pointer-events-none', posClasses[position], className)}>{content}</div>}
    </div>
  );
}
