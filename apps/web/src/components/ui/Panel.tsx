import { useState, ReactNode } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
interface PanelProps { title: string; children: ReactNode; defaultOpen?: boolean; className?: string; }
export function Panel({ title, children, defaultOpen = false, className }: PanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className={clsx('rounded-lg border border-line bg-card', className)}>
      <button className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold hover:bg-ice-soft transition-colors" onClick={() => setIsOpen(!isOpen)} aria-expanded={isOpen}>
        <span>{title}</span>
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      <div className={clsx('panel-collapse', { collapsed: !isOpen })} style={{ maxHeight: isOpen ? '2000px' : '0' }} aria-hidden={!isOpen}>
        <div className="px-4 py-3 border-t border-line">{children}</div>
      </div>
    </div>
  );
}
