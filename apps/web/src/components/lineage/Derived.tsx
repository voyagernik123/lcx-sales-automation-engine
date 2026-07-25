import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { EvidenceNode, Lineage } from '@/lib/lineage';
import { isCommandOpen } from '@/lib/keyboard';

/**
 * The lineage affordance (FINAL_MASTER_PLAN 3.3): wrap any derived value and
 * it wears the dotted underline; clicking opens the evidence tree — source
 * fact → transformation → value. One grammar for all nine families, so the
 * platform never asserts a number it can't explain.
 */

function Contribution({ signed, max }: { signed: number; max?: number }) {
  const up = signed >= 0;
  return (
    <span
      className={`num-tabular shrink-0 font-mono text-[10px] font-bold ${
        up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
      }`}
    >
      {up ? '▲' : '▼'}
      {up ? '+' : '−'}
      {Math.abs(Math.round(signed))}
      {max != null && <span className="font-medium text-grey">/{max}</span>}
    </span>
  );
}

function NodeRow({ node, depth = 0 }: { node: EvidenceNode; depth?: number }) {
  return (
    <>
      <div className={depth > 0 ? 'ml-3 border-l border-line/70 pl-2.5' : ''}>
        <div className="flex items-baseline justify-between gap-3 py-1">
          <span className="min-w-0 text-micro font-semibold text-navy">{node.label}</span>
          {node.signed != null ? (
            <Contribution signed={node.signed} max={node.max} />
          ) : node.value ? (
            <span className="num-tabular shrink-0 font-mono text-[10px] font-semibold text-navy">{node.value}</span>
          ) : null}
        </div>
        {node.detail && <p className="-mt-0.5 pb-1 text-[10px] leading-relaxed text-grey">{node.detail}</p>}
      </div>
      {node.children?.map((c, i) => <NodeRow key={i} node={c} depth={depth + 1} />)}
    </>
  );
}

export interface DerivedProps {
  lineage: Lineage;
  children: ReactNode;
  /** Popover horizontal anchor (default 'left'); use 'right' near right edges. */
  align?: 'left' | 'right';
  className?: string;
}

export function Derived({ lineage, children, align = 'left', className }: DerivedProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // The command line is a higher-priority overlay: while it is open it owns
        // Escape. Without this, our capture-phase stopPropagation swallows the key
        // and one Escape closes two things at once.
        if (isCommandOpen()) return;
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex min-w-0">
      <span
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={`Why? ${lineage.family.toLowerCase()} evidence`}
        title="Click for the evidence behind this value"
        onClick={e => {
          e.stopPropagation();
          e.preventDefault();
          setOpen(o => !o);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            e.preventDefault();
            setOpen(o => !o);
          }
        }}
        className={`derived inline-flex min-w-0 items-baseline ${className ?? ''}`}
      >
        {children}
      </span>

      {open && (
        <span
          className={`absolute top-full z-50 mt-1.5 block w-72 cursor-default rounded-lg border border-line bg-card p-3 text-left shadow-overlay ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          onClick={e => e.stopPropagation()}
        >
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-grey">
              {lineage.family}
            </span>
            <span className="num-tabular font-mono text-label font-bold text-navy">{lineage.value}</span>
          </span>
          {lineage.formula && (
            <span className="mt-1 block font-mono text-[10px] text-cyan-700 dark:text-cyan-400">
              = {lineage.formula}
            </span>
          )}
          <span className="mt-2 block divide-y divide-line/40 border-t border-line/70 pt-1">
            {lineage.nodes.map((n, i) => (
              <NodeRow key={i} node={n} />
            ))}
          </span>
          {lineage.footnote && (
            <span className="mt-2 block border-t border-line/70 pt-1.5 text-[10px] leading-relaxed text-grey">
              {lineage.footnote}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
