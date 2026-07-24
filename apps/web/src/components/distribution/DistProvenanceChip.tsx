import { useState } from 'react';
import { BookMarked } from 'lucide-react';
import { clsx } from 'clsx';
import type { DistSource } from '@/lib/api/distribution';

/**
 * Provenance chip for DISTRIBUTION (LCX ONE Phase 3). The research dossier's
 * grades: A = primary (the company's own site/docs), B = reputable secondary
 * (PR, protocol docs, TechCrunch), C = blog/aggregator synthesis. Every fact
 * on a surface traces here.
 */
const TONE: Record<string, string> = {
  A: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  B: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  C: 'border-line bg-ice-soft/60 text-grey-dark dark:bg-ice-soft/10',
};

export function DistProvenanceChip({ refs, sources }: { refs: readonly string[]; sources: DistSource[] }) {
  const [open, setOpen] = useState(false);
  const resolved = refs.map((r) => sources.find((s) => s.id === r)).filter(Boolean) as DistSource[];
  if (refs.length === 0) return null;
  // Best (lowest) grade present drives the chip tone: A beats B beats C.
  const best = resolved.reduce((g, s) => (s.grade < g ? s.grade : g), 'C');
  return (
    <span className="relative inline-flex">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={clsx('inline-flex items-center gap-0.5 rounded border px-1 py-px font-mono text-[10px] font-bold', TONE[best] ?? TONE.C)}
        title={`Provenance ${best} · ${refs.length} source${refs.length === 1 ? '' : 's'}`}
      >
        <BookMarked size={9} /> {best}
      </button>
      {open && (
        <span className="absolute left-0 top-5 z-30 w-72 rounded-lg border border-line bg-card p-2 shadow-card">
          {resolved.length === 0 ? (
            <span className="text-micro text-grey">Source ids: {refs.join(', ')}</span>
          ) : resolved.map((s) => (
            <span key={s.id} className="block py-0.5 text-micro">
              <span className={clsx('mr-1 rounded px-1 font-mono text-[9px] font-bold', TONE[s.grade])}>{s.grade}</span>
              {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="text-cyan-700 hover:underline dark:text-cyan-300">{s.label}</a> : <span className="text-grey-dark">{s.label}</span>}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
