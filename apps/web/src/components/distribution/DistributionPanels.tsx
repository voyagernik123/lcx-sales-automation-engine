import { clsx } from 'clsx';
import { DistProvenanceChip } from './DistProvenanceChip';
import type { DistributionDeep, DistListing } from '@/lib/api/distribution';

type Ref = DistributionDeep['reference'];

/** Fit/threat pip bar (0–5). */
function Pips({ n, tone }: { n: number; tone: string }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${n} of 5`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={clsx('h-1.5 w-1.5 rounded-full', i < n ? tone : 'bg-line')} />
      ))}
    </span>
  );
}

/** Rails Map — the payment-standards war, fit-for-LCX ranked. */
export function RailsMap({ rails, sources }: { rails: Ref['rails']; sources: Ref['sources'] }) {
  const ranked = [...rails].sort((a, b) => b.fitForLcx - a.fitForLcx);
  return (
    <div className="space-y-2">
      {ranked.map((r) => (
        <div key={r.id} className="rounded-lg border border-line bg-card p-3 shadow-card">
          <div className="flex items-center gap-2">
            <h3 className="text-label font-bold text-navy">{r.name}</h3>
            <DistProvenanceChip refs={r.srcRefs} sources={sources} />
            <span className="ml-auto flex items-center gap-1.5 text-micro text-grey">fit <Pips n={r.fitForLcx} tone="bg-cyan-500" /></span>
          </div>
          <p className="mt-0.5 text-micro text-grey">{r.governance}</p>
          <p className="mt-1 text-micro text-grey-dark">{r.model}</p>
          <div className="mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
            <p className="text-micro"><span className="font-semibold text-navy">Traction:</span> <span className="text-grey-dark">{r.traction}</span></p>
            <p className="text-micro"><span className="font-semibold text-navy">Cost:</span> <span className="text-grey-dark">{r.cost}</span></p>
          </div>
          <p className="mt-1.5 rounded bg-ice-soft/50 px-2 py-1 text-micro text-navy dark:bg-ice-soft/10"><span className="font-semibold">LCX:</span> {r.lcxNote}</p>
        </div>
      ))}
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  not_started: 'border-line bg-page text-grey',
  submitted: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  live: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  ranked: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
};

/** Channel Atlas — every discovery surface, grouped by category, w/ live status. */
export function ChannelAtlas({ surfaces, sources, listings }: { surfaces: Ref['surfaces']; sources: Ref['sources']; listings: DistListing[] }) {
  const statusOf = (id: string) => listings.find((l) => l.surface_id === id)?.status ?? 'not_started';
  const cats = Array.from(new Set(surfaces.map((s) => s.category)));
  return (
    <div className="space-y-4">
      {cats.map((cat) => (
        <div key={cat}>
          <div className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-grey">{cat}</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {surfaces.filter((s) => s.category === cat).map((s) => {
              const st = statusOf(s.id);
              return (
                <div key={s.id} className="rounded-lg border border-line bg-card p-2.5 shadow-card">
                  <div className="flex items-center gap-2">
                    <h4 className="text-label font-bold text-navy">{s.name}</h4>
                    <DistProvenanceChip refs={s.srcRefs} sources={sources} />
                    <span className={clsx('ml-auto rounded border px-1.5 py-px font-mono text-[10px] font-semibold', STATUS_TONE[st])}>{st.replace('_', ' ')}</span>
                  </div>
                  <p className="mt-0.5 text-micro text-grey">{s.audience}</p>
                  <p className="mt-1 text-micro text-grey-dark"><span className="font-semibold text-navy">Get listed:</span> {s.submit}</p>
                  {s.constraint && <p className="mt-0.5 text-micro text-amber-600 dark:text-amber-400">⚠ {s.constraint}</p>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Competitor Room — dossiers with threat rating. */
export function CompetitorRoom({ competitors, sources }: { competitors: Ref['competitors']; sources: Ref['sources'] }) {
  const ranked = [...competitors].sort((a, b) => b.threat - a.threat);
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      {ranked.map((c) => (
        <div key={c.id} className="rounded-lg border border-line bg-card p-3 shadow-card">
          <div className="flex items-center gap-2">
            <h3 className="text-label font-bold text-navy">{c.name}</h3>
            <DistProvenanceChip refs={c.srcRefs} sources={sources} />
            <span className="ml-auto flex items-center gap-1.5 text-micro text-grey">threat <Pips n={c.threat} tone="bg-red-500" /></span>
          </div>
          <p className="mt-0.5 text-micro text-grey-dark">{c.focus}</p>
          <p className="mt-1 text-micro"><span className="font-semibold text-navy">Funding:</span> <span className="text-grey-dark">{c.funding}</span></p>
          <p className="mt-1 rounded bg-ice-soft/50 px-2 py-1 text-micro text-navy dark:bg-ice-soft/10"><span className="font-semibold">Playbook:</span> {c.playbook}</p>
        </div>
      ))}
    </div>
  );
}

/** Gap Register — the G1–G8 openings + LCX's unfair angle. */
export function GapRegister({ gaps }: { gaps: Ref['gaps'] }) {
  return (
    <div className="space-y-2">
      {gaps.map((g) => (
        <div key={g.id} className="rounded-lg border border-line bg-card p-3 shadow-card">
          <div className="flex items-baseline gap-2">
            <span className="rounded bg-navy px-1.5 py-px font-mono text-[10px] font-bold text-card">{g.id}</span>
            <h3 className="text-label font-bold text-navy">{g.title}</h3>
          </div>
          <p className="mt-1 text-micro text-grey-dark">{g.gap}</p>
          <p className="mt-1 rounded bg-cyan-500/10 px-2 py-1 text-micro text-cyan-800 dark:text-cyan-200"><span className="font-semibold">LCX angle:</span> {g.lcxAngle}</p>
        </div>
      ))}
    </div>
  );
}
