import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, ShieldCheck, AlertTriangle, Users, Crosshair } from 'lucide-react';
import { fetchReport, type CoverageReport as Report } from '@/lib/api/intel';
import { safeHref } from '@/lib/safeHref';
import { EmptyState, CardSkeleton } from '@/components/shared';
import { Button } from '@/components/ui';
import { formatMoney, formatPct } from '@/lib/format';

/**
 * Coverage Report — the analyst initiation-of-coverage per token. Dossier,
 * outreach ammunition and board memo in one printable document, assembled from
 * the intelligence spine. Every figure is sourced (see the provenance footer).
 */

const VERDICT_LABEL: Record<string, string> = {
  list_soon: 'Imminent candidate', list_later: 'Credible candidate', no_list: 'Unlikely near-term',
};
const MARKET_LABEL: Record<string, string> = {
  eu: 'EU first', eu_first: 'EU first', us: 'US first', us_first: 'US first', dual: 'Dual', none: 'Unclear',
};
const WINDOW_STYLE: Record<string, string> = {
  hot: 'text-amber-600 dark:text-amber-400', warming: 'text-cyan-700 dark:text-cyan-400', quiet: 'text-grey',
};

function money(v: number | string | null | undefined): string {
  const n = typeof v === 'string' ? Number(v) : v;
  return n != null && Number.isFinite(n) ? formatMoney(n) : '—';
}

export function CoverageReport() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [r, setR] = useState<Report | null | 'loading' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setR('loading');
    fetchReport(id)
      .then((d) => !cancelled && setR(d ?? 'error'))
      .catch(() => !cancelled && setR('error'));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (r === 'loading') return <div className="p-5"><CardSkeleton count={4} /></div>;
  if (r === 'error' || !r) {
    return <div className="p-5"><EmptyState variant="error" title="Report unavailable" description="Could not assemble a coverage report for this project." /></div>;
  }

  return (
    <div className="mx-auto max-w-3xl p-5">
      {/* Chrome (hidden on print) */}
      <div className="mb-4 flex items-center justify-between print:hidden">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-label text-grey hover:text-navy">
          <ArrowLeft size={14} /> Back
        </button>
        <Button size="sm" variant="secondary" onClick={() => window.print()}>
          <Printer size={13} /> Print
        </Button>
      </div>

      {/* Masthead */}
      <div className="border-b-2 border-navy pb-3">
        <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-400">
          <ShieldCheck size={12} /> LCX Coverage · Initiation
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-navy">{r.name}</h1>
          {r.ticker && <span className="font-mono text-sm text-grey">{r.ticker}</span>}
          {r.band && <span className="rounded bg-ice-soft px-1.5 py-0.5 font-mono text-micro uppercase text-grey dark:bg-ice-soft/10">{r.band}</span>}
          {r.listedOnLcx && <span className="text-micro font-bold text-emerald-600 dark:text-emerald-400">ON LCX</span>}
        </div>
        {r.website && (
          <a href={safeHref(r.website)} target="_blank" rel="noreferrer" className="text-label text-cyan-700 hover:underline">
            {r.website.replace(/^https?:\/\//, '')}
          </a>
        )}
      </div>

      {/* Headline strip */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Conviction" value={r.headline.conviction != null ? String(r.headline.conviction) : '—'} accent />
        <Stat label="Window" value={r.headline.timingWindow ?? '—'} className={r.headline.timingWindow ? WINDOW_STYLE[r.headline.timingWindow] : ''} />
        <Stat label="Worth" value={money(r.headline.dealValueUsd)} />
        <Stat label="Read" value={r.headline.achVerdict ? (VERDICT_LABEL[r.headline.achVerdict] ?? r.headline.achVerdict) : '—'} />
        <Stat label="Market" value={r.headline.recommendedMarket ? (MARKET_LABEL[r.headline.recommendedMarket] ?? r.headline.recommendedMarket) : '—'} />
      </div>

      {/* Thesis */}
      <Section title="Thesis">
        <p className="text-body leading-relaxed text-navy">{r.thesis}</p>
      </Section>

      {/* Snapshot + Traction */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="Market snapshot">
          <Row label="Market cap" value={money(r.snapshot.marketCapUsd)} />
          <Row label="24h volume" value={money(r.snapshot.volume24hUsd)} />
          <Row label="30d change" value={r.snapshot.priceChange30d != null ? formatPct(Number(r.snapshot.priceChange30d)) : '—'} />
          <Row label="TVL" value={money(r.snapshot.tvlUsd)} />
          <Row label="Category" value={(r.snapshot.category as string) ?? '—'} />
          <Row label="Chains" value={r.snapshot.chainCount != null ? String(r.snapshot.chainCount) : '—'} />
          <Row label="Token age" value={r.snapshot.tokenAgeDays != null ? `${r.snapshot.tokenAgeDays}d` : '—'} />
        </Section>
        <Section title="Team & traction">
          <Row label="Dev commits (30d)" value={r.traction.githubCommits30d != null ? String(r.traction.githubCommits30d) : '—'} />
          <Row label="GitHub stars" value={r.traction.githubStars != null ? String(r.traction.githubStars) : '—'} />
          <Row label="Team size" value={r.traction.teamSize != null ? String(r.traction.teamSize) : '—'} />
          <Row label="Dev status" value={(r.traction.devStatus as string) ?? '—'} />
          <Row label="EU readiness" value={r.regulatory.euScore != null ? String(r.regulatory.euScore) : '—'} />
          <Row label="US readiness" value={r.regulatory.usPostScore != null ? String(r.regulatory.usPostScore) : '—'} />
        </Section>
      </div>

      {/* Competitive */}
      <Section title="Competitive landscape">
        <p className="text-label text-navy">{r.competitive.gap}</p>
        {r.competitive.topVenues.length > 0 && (
          <p className="mt-1 text-label text-grey">Top venues: {r.competitive.topVenues.join(', ')}</p>
        )}
      </Section>

      {/* Assessment */}
      {r.assessment?.conviction && (
        <Section title="Assessment" icon={<Crosshair size={12} />}>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            <Stat label="Propensity" value={String(r.assessment.propensity?.score ?? '—')} />
            <Stat label="Timing" value={String(r.assessment.timing?.score ?? '—')} />
            <Stat label="Value" value={String(r.assessment.value?.score ?? '—')} />
            <Stat label="Winnability" value={String(r.assessment.winnability?.score ?? '—')} />
            <Stat label="Conviction" value={String(r.assessment.conviction?.score ?? '—')} accent />
          </div>
          {r.assessment.ach?.evidence && r.assessment.ach.evidence.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {r.assessment.ach.evidence.map((e) => (
                <li key={e.label} className="flex items-center gap-1.5 text-label text-grey">
                  <span className={`h-1 w-1 shrink-0 rounded-full ${e.leans === 'list_soon' ? 'bg-emerald-500' : e.leans === 'no_list' ? 'bg-red-500' : 'bg-grey/50'}`} />
                  {e.label}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* Risks */}
      <Section title="Risks & red flags" icon={<AlertTriangle size={12} className="text-amber-500" />}>
        <ul className="space-y-1">
          {r.risks.map((risk) => (
            <li key={risk} className="flex items-start gap-2 text-label text-navy">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
              {risk}
            </li>
          ))}
        </ul>
      </Section>

      {/* Recommended approach */}
      <Section title="Recommended approach">
        <p className="text-body leading-relaxed text-navy">{r.approach}</p>
      </Section>

      {/* Contacts */}
      {r.contacts.length > 0 && (
        <Section title="Contacts" icon={<Users size={12} />}>
          <div className="space-y-1">
            {r.contacts.map((ct) => (
              <div key={ct.name} className="flex items-center gap-2 text-label">
                <span className="font-semibold text-navy">{ct.name}</span>
                {ct.title && <span className="text-grey">{ct.title}</span>}
                {ct.verified && <span className="ml-auto text-[9px] font-bold text-emerald-600 dark:text-emerald-400">verified</span>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Provenance footer */}
      <div className="mt-6 border-t border-line pt-3">
        <div className="mb-1 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-grey">Sources</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-grey">
          {r.sources.map((s) => (
            <span key={s.source}>
              {s.source} <span className="text-navy">×{s.count}</span>
            </span>
          ))}
          <span className="ml-auto">Generated {new Date(r.generatedAt).toISOString().slice(0, 10)}</span>
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <div className="mb-1.5 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, accent, className }: { label: string; value: string; accent?: boolean; className?: string }) {
  return (
    <div className="rounded-lg border border-line p-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-grey">{label}</div>
      <div className={`num-tabular text-sm font-bold ${accent ? 'text-cyan-700 dark:text-cyan-300' : 'text-navy'} ${className ?? ''}`}>{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-line/50 py-1 last:border-b-0 text-label">
      <span className="text-grey">{label}</span>
      <span className="num-tabular font-semibold text-navy">{value}</span>
    </div>
  );
}

export default CoverageReport;
