import { useCallback, useEffect, useState } from 'react';
import { Rocket, Route, Compass, Swords, Target, Gauge } from 'lucide-react';
import { PageTitle } from '@/components/ui';
import { CardSkeleton, ErrorNotice } from '@/components/shared';
import { fetchDistributionDeep, type DistributionDeep } from '@/lib/api/distribution';
import { RailsMap, ChannelAtlas, CompetitorRoom, GapRegister } from '@/components/distribution/DistributionPanels';
import { GrowthEngines } from '@/components/distribution/GrowthEngines';

type Tab = 'atlas' | 'rails' | 'competitors' | 'gaps' | 'engines';
const TABS: Array<{ id: Tab; label: string; icon: typeof Rocket }> = [
  { id: 'atlas', label: 'Channel Atlas', icon: Compass },
  { id: 'rails', label: 'Rails Map', icon: Route },
  { id: 'competitors', label: 'Competitor Room', icon: Swords },
  { id: 'gaps', label: 'Gap Register', icon: Target },
  { id: 'engines', label: 'Growth Engines', icon: Gauge },
];

/**
 * DISTRIBUTION COMMAND deck (LCX ONE Phase 3) — the deep ontology made
 * explorable: the discovery surfaces (with live listing status), the rails
 * war, the competitor dossiers, and the G1–G8 gap register. Every fact carries
 * a provenance chip resolving to the graded source registry.
 */
export function DistributionHome() {
  const [deep, setDeep] = useState<DistributionDeep | null>(null);
  // The error itself, not a boolean: ErrorNotice classifies it (unreachable API vs
  // 403 vs 500) and says something different for each, which a `true` cannot.
  const [err, setErr] = useState<unknown>(null);
  const [tab, setTab] = useState<Tab>('atlas');

  const load = useCallback(() => {
    setErr(null);
    fetchDistributionDeep()
      .then(setDeep)
      .catch((e: unknown) => setErr(e));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-5">
      <PageTitle
        icon={<Rocket size={20} />}
        subtitle="The distribution ontology — rails, surfaces, competitors, gaps, engines (source-graded)"
      >
        Channel Atlas
      </PageTitle>

      {err ? (
        // Was a bespoke red <p> with no retry, so the only recovery was a page
        // reload. Its four sibling Distribution pages all share ErrorNotice; a
        // fifth dialect of "it broke" teaches the operator nothing and costs them
        // the retry.
        <div className="mt-4">
          <ErrorNotice error={err} onRetry={load} />
        </div>
      ) : !deep ? (
        <div className="mt-4"><CardSkeleton /></div>
      ) : (
        <>
          {/* PayAgent thesis + reward loop */}
          <section className="mt-4 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4">
            <p className="text-label font-semibold text-navy">{deep.reference.payAgent.tagline}</p>
            <p className="mt-1 text-micro text-grey-dark">{deep.reference.payAgent.rewardLoop}</p>
            <p className="mt-2 text-micro text-grey"><span className="font-semibold text-navy">Thesis:</span> {deep.reference.meta.thesis}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {deep.reference.payAgent.fees.map((f) => (
                <span key={f.mode} className="rounded border border-line bg-card px-1.5 py-0.5 font-mono text-[10px] text-navy">{f.mode}: {f.fee} · {f.creatorReward} back · {f.assets}</span>
              ))}
              {!deep.live.listings && <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-700 dark:text-amber-400">listing state pending migration 0043</span>}
            </div>
          </section>

          {/* Tabs */}
          <div className="mt-4 flex flex-wrap gap-1 border-b border-line">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 rounded-t px-3 py-1.5 text-label font-medium ${tab === t.id ? 'border-b-2 border-cyan-500 text-navy' : 'text-grey hover:text-navy'}`}
                >
                  <Icon size={13} /> {t.label}
                </button>
              );
            })}
          </div>

          <div className="mt-3">
            {tab === 'atlas' && <ChannelAtlas surfaces={deep.reference.surfaces} sources={deep.reference.sources} listings={deep.listings} />}
            {tab === 'rails' && <RailsMap rails={deep.reference.rails} sources={deep.reference.sources} />}
            {tab === 'competitors' && <CompetitorRoom competitors={deep.reference.competitors} sources={deep.reference.sources} />}
            {tab === 'gaps' && <GapRegister gaps={deep.reference.gaps} />}
            {tab === 'engines' && <GrowthEngines />}
          </div>
        </>
      )}
    </div>
  );
}
