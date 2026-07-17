import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { OBJECT_TYPES, type ObjectType } from '@/lib/objectRegistry';
import { useInspectorStore } from '@/stores/useInspectorStore';

/**
 * L1 mention + L2 peek — the ontology's atom (FINAL_MASTER_PLAN 3.2).
 *
 * Renders an entity name as an interactive mention: hover ≥300ms shows the
 * peek card (identity, vitals passed in from the row — no extra fetch),
 * click opens the type's inspector in place, or navigates to its workspace
 * when no drawer payload exists. Renders as a <span role="button"> so it can
 * legally sit inside row-level <button> elements; clicks never bubble to the
 * row.
 */

export interface PeekVital {
  label: string;
  value: string;
}

export interface EntityChipProps {
  type: ObjectType;
  id: string;
  name: string;
  /** Small mono annotation: ticker, role, channel… */
  meta?: string | null;
  /** Vitals for the peek card — pass what the row already knows. */
  vitals?: PeekVital[];
  /** Optional state line for the peek ("negotiating · 3d in stage"). */
  stateLine?: string;
  /** Preloaded context forwarded to the inspector payload. */
  seed?: Record<string, unknown>;
  /** Extra classes for the mention text. */
  className?: string;
  children?: ReactNode;
}

export function EntityChip({
  type, id, name, meta, vitals, stateLine, seed, className, children,
}: EntityChipProps) {
  const def = OBJECT_TYPES[type];
  const open = useInspectorStore(s => s.open);
  const navigate = useNavigate();
  const [peek, setPeek] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const activate = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setPeek(false);
    if (def.inspector) open(def.inspector, id, seed);
    else navigate(def.route(id));
  };

  const Icon = def.icon;

  return (
    <span
      className="relative inline-flex min-w-0"
      onMouseEnter={() => {
        timer.current = setTimeout(() => setPeek(true), 300);
      }}
      onMouseLeave={() => {
        clearTimeout(timer.current);
        setPeek(false);
      }}
    >
      <span
        role="button"
        tabIndex={0}
        onClick={activate}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') activate(e);
        }}
        className={`-mx-0.5 inline-flex min-w-0 cursor-pointer items-center gap-1 rounded px-0.5 text-navy transition-colors hover:bg-ice-soft dark:hover:bg-ice-soft/10 ${className ?? ''}`}
      >
        <span className="truncate">{children ?? name}</span>
        {meta && <span className="shrink-0 font-mono text-[10px] font-medium text-grey">{meta}</span>}
      </span>

      {peek && (
        <span className="absolute left-0 top-full z-50 mt-1.5 block w-60 cursor-default rounded-lg border border-line bg-card p-3 text-left shadow-overlay">
          <span className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${def.dotCls}`} />
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-grey">
              {def.label}
            </span>
            <Icon size={11} className="ml-auto shrink-0 text-grey" />
          </span>
          <span className="mt-1 block truncate text-body font-semibold text-navy">{name}</span>
          {stateLine && <span className="mt-0.5 block text-micro text-grey">{stateLine}</span>}
          {vitals && vitals.length > 0 && (
            <span className="mt-2 block space-y-1 border-t border-line/70 pt-2">
              {vitals.map(v => (
                <span key={v.label} className="flex items-baseline justify-between gap-2">
                  <span className="text-micro text-grey">{v.label}</span>
                  <span className="num-tabular truncate text-micro font-semibold text-navy">{v.value}</span>
                </span>
              ))}
            </span>
          )}
          <span className="mt-2 block border-t border-line/70 pt-1.5 text-[10px] text-grey">
            Click to {def.inspector ? 'inspect' : 'open'} →
          </span>
        </span>
      )}
    </span>
  );
}
