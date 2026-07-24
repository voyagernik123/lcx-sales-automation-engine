import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { CardSkeleton } from '@/components/shared';
import {
  runReferralSim, runEmission, runQuestCac, runChannelMix, fetchPresence, fetchX402Catalog,
  type ReferralSim, type Emission, type QuestCac, type ChannelMix, type Presence, type X402Catalog,
} from '@/lib/api/distribution';

/**
 * Growth Engines readout (LCX ONE Phase 4). Read-only default runs of the six
 * models + the x402 seller catalog — proof the engines compute over the
 * ontology. Phase 5 makes these interactive (sliders, the presence dial).
 */
export function GrowthEngines() {
  const [ref, setRef] = useState<ReferralSim | null>(null);
  const [emit, setEmit] = useState<Emission | null>(null);
  const [cac, setCac] = useState<QuestCac | null>(null);
  const [mix, setMix] = useState<ChannelMix | null>(null);
  const [presence, setPresence] = useState<Presence | null>(null);
  const [x402, setX402] = useState<X402Catalog | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    Promise.all([
      runReferralSim().then(setRef),
      runEmission().then(setEmit),
      runQuestCac().then(setCac),
      runChannelMix().then(setMix),
      fetchPresence().then(setPresence),
      fetchX402Catalog().then(setX402),
    ]).catch(() => setErr(true));
  }, []);

  if (err) return <p className="text-label text-red-600 dark:text-red-400">Failed to run the growth engines.</p>;
  if (!ref || !emit || !cac || !mix || !presence || !x402) return <CardSkeleton />;

  const statusTone: Record<string, string> = {
    healthy: 'text-emerald-600 dark:text-emerald-400',
    watch: 'text-amber-600 dark:text-amber-400',
    breach: 'text-red-600 dark:text-red-400',
  };

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {/* Referral virality */}
      <div className="rounded-lg border border-line bg-card p-3 shadow-card">
        <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-wider text-grey">Referral virality (K-factor)</div>
        <p className="text-h3 font-bold text-navy">{ref.kFactor.toFixed(2)} <span className={clsx('text-label font-semibold', ref.viral ? 'text-emerald-600 dark:text-emerald-400' : 'text-grey')}>{ref.viral ? '· viral' : '· sub-viral'}</span></p>
        <p className="mt-0.5 text-micro text-grey-dark">Creators p50 <span className="font-mono font-bold text-navy">{ref.cumulativeCreators.p50.toLocaleString()}</span> · reward cost p50 <span className="font-mono font-bold text-navy">{ref.rewardCostLcx.p50.toLocaleString()} LCX</span></p>
      </div>

      {/* Emission budget */}
      <div className="rounded-lg border border-line bg-card p-3 shadow-card">
        <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-wider text-grey">Emission budget (default 10k links)</div>
        <p className="text-h3 font-bold text-navy">{emit.budgetUtilizationPct}% <span className={clsx('text-label font-semibold', statusTone[emit.status])}>· {emit.status}</span></p>
        <p className="mt-0.5 text-micro text-grey-dark">Emitted <span className="font-mono font-bold text-navy">{emit.emittedLcx.toLocaleString()} LCX</span> · net treasury <span className="font-mono font-bold text-navy">{emit.netTreasuryLcx.toLocaleString()} LCX</span></p>
      </div>

      {/* Quest CAC */}
      <div className="rounded-lg border border-line bg-card p-3 shadow-card">
        <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-wider text-grey">Quest CAC (Galxe + Layer3)</div>
        <p className="text-h3 font-bold text-navy">{cac.fundedAgents.p50.toLocaleString()} <span className="text-label font-normal text-grey">funded agents p50</span></p>
        <p className="mt-0.5 text-micro text-grey-dark">Blended CAC <span className="font-mono font-bold text-navy">${cac.blendedCacP50}</span> · best marginal <span className="font-semibold text-navy">{cac.marginal[0]?.label}</span></p>
      </div>

      {/* Presence score */}
      <div className="rounded-lg border border-line bg-card p-3 shadow-card">
        <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-wider text-grey">Machine-economy presence</div>
        <p className="text-h3 font-bold text-navy">{presence.presenceScore}<span className="text-label font-normal text-grey">/100</span></p>
        <p className="mt-0.5 text-micro text-grey-dark">Across {presence.surfaces.length} surfaces — honest zero-state until listings go live.</p>
      </div>

      {/* Channel mix */}
      <div className="rounded-lg border border-line bg-card p-3 shadow-card">
        <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-wider text-grey">Channel-mix optimizer (top 3)</div>
        <ol className="space-y-0.5 text-micro">
          {mix.rows.slice(0, 3).map((r) => (
            <li key={r.subjectId} className="flex justify-between"><span className="text-navy">{r.rank}. {r.subjectLabel}</span><span className="font-mono text-grey">{r.weighted.toFixed(2)}</span></li>
          ))}
        </ol>
      </div>

      {/* x402 seller catalog */}
      <div className="rounded-lg border border-line bg-card p-3 shadow-card">
        <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-grey">
          x402 seller catalog <span className={clsx('rounded px-1 py-px', x402.mode === 'sandbox' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400')}>{x402.mode}</span>
        </div>
        <ul className="space-y-0.5 text-micro">
          {x402.endpoints.map((e) => (
            <li key={e.id} className="flex justify-between"><span className="text-navy">{e.description.split(':')[0]}</span><span className="font-mono font-bold text-grey">${e.priceUsd} {e.asset}</span></li>
          ))}
        </ul>
        <p className="mt-1 text-[10px] text-grey">Payment is the auth — any agent pays over HTTP 402, no account. Live when CDP keys land.</p>
      </div>
    </div>
  );
}
