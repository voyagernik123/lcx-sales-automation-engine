import { useState } from 'react';
import { BookMarked } from 'lucide-react';
import type { CommandSource } from '@/lib/api/command';
import { clsx } from 'clsx';

/**
 * Provenance chip (100X Phase 1) — the CIA rule made visible: every figure in
 * the command platform traces to a graded source. C3 = public research (the
 * compile-time baseline), B2 = RFI-returned, A1 = signed terms.
 */
export const GRADE_TONE: Record<string, string> = {
  A1: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  B2: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  C3: 'border-line bg-ice-soft/60 text-grey-dark dark:bg-ice-soft/10',
};

export function SourceChip({ refs, sources, grade = 'C3' }: {
  refs: string[];
  sources: CommandSource[];
  grade?: string;
}) {
  const [open, setOpen] = useState(false);
  const resolved = refs.map((r) => sources.find((s) => s.id === r)).filter(Boolean) as CommandSource[];
  if (refs.length === 0) return null;
  return (
    <span className="relative inline-flex">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={clsx('inline-flex items-center gap-0.5 rounded border px-1 py-px font-mono text-[10px] font-bold', GRADE_TONE[grade] ?? GRADE_TONE.C3)}
        title={`Provenance grade ${grade} · ${refs.length} source${refs.length === 1 ? '' : 's'}`}
      >
        <BookMarked size={9} /> {grade}
      </button>
      {open && (
        <span className="absolute left-0 top-5 z-30 w-72 rounded-lg border border-line bg-card p-2 shadow-card">
          {resolved.length === 0 ? (
            <span className="text-micro text-grey">Source ids: {refs.join(', ')}</span>
          ) : resolved.map((s) => (
            <span key={s.id} className="block py-0.5 text-micro">
              <span className="font-mono font-bold text-grey">{s.id}</span>{' '}
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer" className="text-cyan-700 hover:underline dark:text-cyan-400">{s.label}</a>
              ) : (
                <span className="text-grey-dark">{s.label}</span>
              )}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
