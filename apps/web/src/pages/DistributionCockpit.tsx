import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Rocket, Gauge, Compass, ListChecks, Megaphone, Search, ArrowRight } from 'lucide-react';
import { clsx } from 'clsx';
import { PageTitle } from '@/components/ui';
import { CardSkeleton } from '@/components/shared';
import {
  fetchDistributionDeep, fetchPresence, fetchDistCampaigns, runEmission,
  type DistributionDeep, type Presence, type DistCampaign, type Emission,
} from '@/lib/api/distribution';

/**
 * DISTRIBUTION COCKPIT (LCX ONE Phase 5) — the workspace flagship. The
 * presence dial (how present PayAgent is across the machine economy), the
 * funnel the reward loop drives, the gap-register progress, and campaign heat.
 * Honest zero-state until listings go live — the instruments are wired now.
 */
export function DistributionCockpit() {
  const [deep, setDeep] = useState<DistributionDeep | null>(null);
  const [presence, setPresence] = useState<Presence | null>(null);
  const [campaigns, setCampaigns] = useState<DistCampaign[] | null>(null);
  const [emit, setEmit] = useState<Emission | null>(null);

  useEffect(() => {
    fetchDistributionDeep().then(setDeep).catch(() => setDeep(null));
    fetchPresence().then(setPresence).catch(() => setPresence(null));
    fetchDistCampaigns().then(setCampaigns).catch(() => setCampaigns([]));
    runEmission().then(setEmit).catch(() => setEmit(null));
  }, []);

  const liveListings = deep?.listings.filter((l) => l.status === 'live' || l.status === 'ranked').length ?? 0;
  const totalListings = deep?.listings.length ?? 0;
  const liveCampaigns = campaigns?.filter((c) => c.status === 'live').length ?? 0;

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

      {!deep || !presence ? (
        <div className="mt-4"><CardSkeleton /></div>
      ) : (
        <>
          {/* Presence dial + funnel tiles */}
          <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-line bg-card p-4 shadow-card">
              <div className="mb-2 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey"><Gauge size={12} /> Machine-economy presence</div>
              <PresenceDial score={presence.presenceScore} />
              <p className="mt-1 text-center text-micro text-grey">{liveListings}/{totalListings} surfaces live · {liveCampaigns} campaigns running</p>
            </div>

            <div className="lg:col-span-2">
              <div className="mb-2 text-micro font-bold uppercase tracking-wider text-grey">The reward loop funnel</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {deep.reference.funnel.stages.map((s, i) => (
                  <div key={s} className="rounded-lg border border-line bg-card p-2.5 shadow-card">
                    <div className="font-mono text-[10px] text-grey">STAGE {i + 1}</div>
                    <div className="text-label font-semibold text-navy">{s}</div>
                  </div>
                ))}
              </div>
              {emit && (
                <div className="mt-2 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-2.5">
                  <p className="text-micro text-grey-dark">
                    Emission model @ 10k paid links: <span className="font-mono font-bold text-navy">{emit.emittedLcx.toLocaleString()} LCX</span> emitted ·
                    net treasury <span className="font-mono font-bold text-navy">{emit.netTreasuryLcx.toLocaleString()} LCX</span> ·
                    <span className={clsx('ml-1 font-semibold', emit.status === 'healthy' ? 'text-emerald-600 dark:text-emerald-400' : emit.status === 'watch' ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}>{emit.status}</span>
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Gap-register progress */}
          <section className="mt-4 rounded-lg border border-line bg-card p-4 shadow-card">
            <div className="mb-2 text-micro font-bold uppercase tracking-wider text-grey">Gap register — the 1000x openings</div>
            <div className="flex flex-wrap gap-1.5">
              {deep.reference.gaps.map((g) => (
                <span key={g.id} title={g.title} className="rounded border border-line bg-page px-1.5 py-0.5 font-mono text-[10px] text-grey-dark">
                  <span className="font-bold text-navy">{g.id}</span> {g.title.length > 28 ? g.title.slice(0, 27) + '…' : g.title}
                </span>
              ))}
            </div>
            <p className="mt-2 text-micro text-grey">The engines + surfaces below turn these from analysis into pipeline.</p>
          </section>

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
        </>
      )}
    </div>
  );
}

/** Semicircle gauge (mirrors the COMMAND readiness dial). */
function PresenceDial({ score }: { score: number }) {
  const tone = score >= 70 ? 'text-emerald-500' : score >= 40 ? 'text-amber-500' : 'text-grey';
  return (
    <div className="relative mx-auto h-28 w-28">
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <path d="M 15 78 A 40 40 0 1 1 85 78" fill="none" strokeWidth="8" className="stroke-line" strokeLinecap="round" />
        <path d="M 15 78 A 40 40 0 1 1 85 78" fill="none" strokeWidth="8" strokeLinecap="round"
          className={clsx('transition-all', tone.replace('text-', 'stroke-'))}
          strokeDasharray={`${(score / 100) * 188.5} 300`} />
      </svg>
      <div className="absolute inset-x-0 bottom-2 text-center">
        <span className={clsx('font-mono text-h2 font-bold', tone)}>{score}</span>
        <span className="block text-[10px] text-grey">/ 100</span>
      </div>
    </div>
  );
}
