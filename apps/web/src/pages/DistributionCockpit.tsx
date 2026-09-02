import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Rocket, Gauge, Compass, ListChecks, Megaphone, Search, ArrowRight } from 'lucide-react';
import { clsx } from 'clsx';
import { PageTitle, SectionLabel } from '@/components/ui';
import { CardSkeleton, ErrorNotice } from '@/components/shared';
import { AskDistribution } from '@/components/distribution/AskDistribution';
import { Fig, FigGrid } from '@/components/fig/Fig';
import { chordFor, figAnchor } from '@/components/fig/figAddress';
import { now } from '@/lib/clock';
import {
  fetchDistributionDeep, fetchPresence, fetchDistCampaigns, runEmission,
  type DistributionDeep, type Presence, type DistCampaign, type Emission,
} from '@/lib/api/distribution';

/**
 * DISTRIBUTION COCKPIT (LCX ONE Phase 5) — the workspace flagship, re-laid as a TERMINAL in S6 of
 * INSTRUMENT_100X_PLAN. The presence dial (how present PayAgent is across the machine economy), the
 * funnel the reward loop drives, the emission model, the gap register and campaign heat — every one
 * now a `<Fig>`: dated by the record's own instant (listings by their newest `updated_at`, campaigns by
 * their newest `created_at`, the ontology by its `asOf`), or by the instant an engine computed it
 * (presence and emission are derivations of the moment they were asked, and say so), with the delta
 * since the operator's last arrival and the `g5` chord that lands here. Honest zero-state until
 * listings go live — a figure with no record renders "—", never a zero.
 *
 * MEASURED, before this re-layout, with the instrument's desk fixtures and reliefs off: 8 numeric
 * figures in the first viewport. The same data carries about twenty real readings; the cards-inside-
 * cards layout was showing eight of them.
 */
export function DistributionCockpit() {
  const [deep, setDeep] = useState<DistributionDeep | null>(null);
  const [presence, setPresence] = useState<{ value: Presence; at: string } | null>(null);
  const [campaigns, setCampaigns] = useState<DistCampaign[] | null>(null);
  const [emit, setEmit] = useState<{ value: Emission; at: string } | null>(null);
  // The page gates its whole body on `!deep || !presence`, which is also the
  // LOADING state — so resetting either to null on failure pulsed the skeleton
  // forever. The two lead reads carry the error; the two garnish reads
  // (campaigns, emission) are allowed to stay absent, and each is rendered
  // conditionally rather than counted as data.
  const [err, setErr] = useState<unknown>(null);

  const load = useCallback(() => {
    setErr(null);
    fetchDistributionDeep().then(setDeep).catch(setErr);
    // Presence and emission are computed when asked: the honest instant of each is the moment it arrived.
    fetchPresence().then((v) => setPresence({ value: v, at: new Date(now()).toISOString() })).catch(setErr);
    fetchDistCampaigns().then(setCampaigns).catch(() => setCampaigns([]));
    runEmission().then((v) => setEmit({ value: v, at: new Date(now()).toISOString() })).catch(() => setEmit(null));
  }, []);
  useEffect(() => { load(); }, [load]);

  const links = [
    { to: '/distribution/atlas', label: 'Channel Atlas', icon: Compass, sub: 'The ontology: rails, surfaces, competitors, gaps' },
    { to: '/distribution/listings', label: 'Listing Ops', icon: ListChecks, sub: 'Get PayAgent listed across every surface' },
    { to: '/distribution/campaigns', label: 'Campaign Ops', icon: Megaphone, sub: 'Design & price quests/incentives live' },
    { to: '/distribution/geo', label: 'GEO & Personas', icon: Search, sub: 'Win the AI-answer queries; the KOL fleet' },
  ];

  return (
    <div className="p-5">
      <PageTitle icon={<Rocket size={20} />} subtitle="PayAgent by LCX AI Labs — the growth cockpit">
        Distribution Cockpit
      </PageTitle>

      {err ? (
        <ErrorNotice error={err} onRetry={load} />
      ) : !deep || !presence ? (
        <div className="mt-4"><CardSkeleton /></div>
      ) : (
        <DistributionTerminal deep={deep} presence={presence} campaigns={campaigns} emit={emit} />
      )}

      {/* Ask the strategist */}
      <section className="mt-4"><AskDistribution /></section>

      {/* Working-surface launcher */}
      <section className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {links.map((l) => {
          const Icon = l.icon;
          return (
            <Link key={l.to} to={l.to} className="group flex items-center gap-3 rounded-lg border border-line bg-card p-3 shadow-card hover:border-cyan-500/50">
              <Icon size={18} className="shrink-0 text-cyan-600 dark:text-cyan-400" />
              <span className="min-w-0 flex-1">
                <span className="block text-label font-semibold text-navy">{l.label}</span>
                <span className="block truncate text-micro text-grey">{l.sub}</span>
              </span>
              <ArrowRight size={14} className="shrink-0 text-grey transition-transform group-hover:translate-x-0.5" />
            </Link>
          );
        })}
      </section>
    </div>
  );
}

const newest = (isos: readonly (string | null | undefined)[]): string | null => {
  const ts = isos.map((s) => (s ? Date.parse(s) : NaN)).filter((n) => Number.isFinite(n));
  return ts.length ? new Date(Math.max(...ts)).toISOString() : null;
};
const pct = (num: number, den: number): number | null => (den > 0 ? (num / den) * 100 : null);

function DistributionTerminal({ deep, presence, campaigns, emit }: {
  deep: DistributionDeep;
  presence: { value: Presence; at: string };
  campaigns: DistCampaign[] | null;
  emit: { value: Emission; at: string } | null;
}) {
  const chord = chordFor('distribution');
  const ref = deep.reference;
  const asOf = ref.meta.asOf || null;
  const listingsAt = newest(deep.listings.map((l) => l.updated_at));
  const campaignsAt = newest((campaigns ?? []).map((c) => c.created_at));
  const liveListings = deep.listings.filter((l) => l.status === 'live' || l.status === 'ranked').length;
  const liveCampaigns = campaigns ? campaigns.filter((c) => c.status === 'live').length : null;
  const tokenCampaigns = campaigns ? campaigns.filter((c) => c.token_incentivized).length : null;
  const stages = ref.funnel.stages;
  const params = ref.funnel.params;
  const stageValue = (i: number): number | null => {
    const key = stages[i];
    return key !== undefined && typeof params[key] === 'number' ? params[key] : null;
  };
  const f = [0, 1, 2, 3].map(stageValue);
  const conv = (a: number | null, b: number | null) => (a !== null && b !== null ? pct(b, a) : null);
  const D = (id: string) => ({ id: `distribution.${id}`, address: chord });
  const rec = (at: string | null) => ({ at, kind: 'record' as const });
  const der = (at: string | null) => ({ at, kind: 'derived' as const });

  return (
    <>
      <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-line bg-card p-3 shadow-card" id={figAnchor('distribution.presence')}>
          <div className="mb-1 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey"><Gauge size={12} /> Machine-economy presence</div>
          <PresenceDial score={presence.value.presenceScore} />
          <Fig {...D('presence')} label="presence score / 100" value={presence.value.presenceScore} kind="int" source={der(presence.at)} className="border-t-0 px-0" />
        </div>
        <div className="lg:col-span-3">
          <SectionLabel className="mb-1 block">Listings · campaigns · the reward loop</SectionLabel>
          <FigGrid cols={6}>
            <Fig {...D('listings-live')} label="listings live" value={liveListings} kind="int" source={rec(listingsAt)} />
            <Fig {...D('listings-total')} label="listings tracked" value={deep.listings.length} kind="int" source={rec(listingsAt)} />
            <Fig {...D('campaigns-live')} label="campaigns live" value={liveCampaigns} kind="int" source={rec(campaignsAt)} />
            <Fig {...D('campaigns-token')} label="token-incentivised" value={tokenCampaigns} kind="int" source={rec(campaignsAt)} />
            <Fig {...D('gaps')} label="gap register" value={ref.gaps.length} kind="int" source={rec(asOf)} goodIsUp={false} />
            <Fig {...D('rails')} label="rails mapped" value={ref.rails.length} kind="int" source={rec(asOf)} />
          </FigGrid>
          <FigGrid cols={6} className="mt-1">
            {stages.slice(0, 4).map((s, i) => (
              <Fig key={s} {...D(`funnel-${['aware', 'listed', 'active', 'paying'][i] ?? i}`)} label={`funnel · ${s}`} value={f[i]} kind="int" source={rec(asOf)} />
            ))}
            <Fig {...D('surfaces')} label="surfaces mapped" value={ref.surfaces.length} kind="int" source={rec(asOf)} />
            <Fig {...D('competitors')} label="competitors tracked" value={ref.competitors.length} kind="int" source={rec(asOf)} goodIsUp={false} />
          </FigGrid>
          <FigGrid cols={6} className="mt-1">
            <Fig {...D('conv-listed')} label={`${stages[0] ?? 'stage 1'} → ${stages[1] ?? 'stage 2'}`} value={conv(f[0], f[1])} kind="pct" source={der(asOf)} />
            <Fig {...D('conv-active')} label={`${stages[1] ?? 'stage 2'} → ${stages[2] ?? 'stage 3'}`} value={conv(f[1], f[2])} kind="pct" source={der(asOf)} />
            <Fig {...D('conv-paying')} label={`${stages[2] ?? 'stage 3'} → ${stages[3] ?? 'stage 4'}`} value={conv(f[2], f[3])} kind="pct" source={der(asOf)} />
            <Fig {...D('emitted')} label="LCX emitted @ 10k paid links" value={emit?.value.emittedLcx ?? null} kind="int" source={der(emit?.at ?? null)} goodIsUp={false} />
            <Fig {...D('net-treasury')} label="net treasury (LCX)" value={emit?.value.netTreasuryLcx ?? null} kind="int" source={der(emit?.at ?? null)} />
            <Fig {...D('budget-utilisation')} label="emission budget used" value={emit?.value.budgetUtilizationPct ?? null} kind="pct" source={der(emit?.at ?? null)} goodIsUp={false} />
          </FigGrid>
          {emit && (
            <p className="mt-1 font-mono text-micro text-grey-dark">
              Emission model status: <span className={clsx('font-semibold', emit.value.status === 'healthy' ? 'text-status-ready' : emit.value.status === 'watch' ? 'text-status-conditional' : 'text-status-blocked')}>{emit.value.status}</span>
              {' '}· fee revenue {emit.value.feeRevenueLcx.toLocaleString()} LCX · {emit.value.withinBudget ? 'within budget' : 'OVER budget'}
            </p>
          )}
        </div>
      </section>

      {/* Gap register — the 1000x openings, as the register's own rows */}
      <section className="mt-4 rounded-lg border border-line bg-card p-3 shadow-card">
        <SectionLabel className="mb-2 block">Gap register — the 1000x openings</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {ref.gaps.map((g) => (
            <span key={g.id} title={g.title} className="rounded border border-line bg-page px-1.5 py-0.5 font-mono text-micro text-grey-dark">
              <span className="font-bold text-navy">{g.id}</span> {g.title.length > 28 ? g.title.slice(0, 27) + '…' : g.title}
            </span>
          ))}
        </div>
        <p className="mt-2 text-micro text-grey">The engines + surfaces below turn these from analysis into pipeline.</p>
      </section>
    </>
  );
}

/** Semicircle gauge (mirrors the COMMAND readiness dial). */
function PresenceDial({ score }: { score: number }) {
  const tone = score >= 70 ? 'text-status-ready' : score >= 40 ? 'text-status-conditional' : 'text-grey';
  return (
    <div className="relative mx-auto h-24 w-24">
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <path d="M 15 78 A 40 40 0 1 1 85 78" fill="none" strokeWidth="8" className="stroke-line" strokeLinecap="round" />
        <path d="M 15 78 A 40 40 0 1 1 85 78" fill="none" strokeWidth="8" strokeLinecap="round"
          className={clsx('t-metric', tone.replace('text-', 'stroke-'))}
          strokeDasharray={`${(score / 100) * 188.5} 300`} />
      </svg>
      <div className="absolute inset-x-0 bottom-2 text-center">
        <span className={clsx('num-tabular font-mono text-h2 font-bold', tone)}>{score}</span>
      </div>
    </div>
  );
}
