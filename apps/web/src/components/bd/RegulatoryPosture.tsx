import { Landmark, ShieldCheck, AlertTriangle } from 'lucide-react';
import type { RegulatoryPosture as Posture } from '@/types/bd';

/**
 * Regulatory posture (Palantir-grade Phase 1.5) — LCX's moat as a first-class
 * facet on every dossier. Server-derived (one source of truth); this just
 * renders it. MiCA/ESMA registration reads as the edge it is.
 */
const TONE: Record<Posture['tone'], { cls: string; Icon: typeof Landmark }> = {
  strong: { cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', Icon: ShieldCheck },
  neutral: { cls: 'border-line bg-ice-soft text-grey-dark dark:bg-ice-soft/10', Icon: Landmark },
  watch: { cls: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300', Icon: AlertTriangle },
};

export function RegulatoryPosture({ posture, compact }: { posture: Posture; compact?: boolean }) {
  const { cls, Icon } = TONE[posture.tone];
  return (
    <div className={`rounded-lg border p-2.5 ${cls}`}>
      <div className="flex items-center gap-1.5">
        <Icon size={14} />
        <span className="text-label font-bold">{posture.label}</span>
        {posture.isMicaRegistry && (
          <span className="ml-auto rounded bg-emerald-600/15 px-1.5 py-0.5 text-micro font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            LCX edge
          </span>
        )}
      </div>
      {!compact && posture.facets.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-micro">
          {posture.facets.map((f) => (
            <div key={f.label} className="contents">
              <dt className="text-grey">{f.label}</dt>
              <dd className={`truncate font-mono font-semibold ${f.tone === 'strong' ? 'text-emerald-700 dark:text-emerald-300' : 'text-navy'}`}>
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
