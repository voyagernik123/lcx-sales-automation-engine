import { useCallback, useEffect, useState } from 'react';
import { Megaphone, Plus } from 'lucide-react';
import { clsx } from 'clsx';
import { PageTitle, Button } from '@/components/ui';
import { CardSkeleton } from '@/components/shared';
import { toast } from '@/components/shared/Toast';
import {
  fetchDistCampaigns, createCampaign, setCampaignStatus, runEmission, runQuestCac,
  type DistCampaign, type Emission, type QuestCac,
} from '@/lib/api/distribution';

const LIFECYCLE = ['draft', 'compliance_review', 'approved', 'live', 'measured'] as const;
const STATUS_TONE: Record<string, string> = {
  draft: 'text-grey',
  compliance_review: 'text-amber-600 dark:text-amber-400',
  approved: 'text-cyan-600 dark:text-cyan-400',
  live: 'text-emerald-600 dark:text-emerald-400',
  measured: 'text-navy',
};

/**
 * Campaign Ops (LCX ONE Phase 5) — design a campaign and price it live with
 * the CAC + emission engines as you set budget, then move it through the
 * lifecycle. Governed throughout (Phase 6 adds the compliance gate + budget
 * cap enforcement on the launch transitions).
 */
export function DistributionCampaigns() {
  const [campaigns, setCampaigns] = useState<DistCampaign[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'quest' | 'incentive' | 'content' | 'outreach'>('quest');
  const [tokenIncentivized, setTokenIncentivized] = useState(true);
  const [budgetLcx, setBudgetLcx] = useState(5000);
  const [emit, setEmit] = useState<Emission | null>(null);
  const [cac, setCac] = useState<QuestCac | null>(null);

  const refresh = useCallback(() => { fetchDistCampaigns().then(setCampaigns).catch(() => setCampaigns([])); }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // Live pricing: re-run the engines whenever the budget moves.
  useEffect(() => {
    const budgetUsd = Math.round(budgetLcx * 0.5); // illustrative LCX→USD for CAC sizing
    runEmission({ projectedPaidLinks: Math.round(budgetLcx / 1), treasuryBudgetLcx: budgetLcx * 2 }).then(setEmit).catch(() => setEmit(null));
    runQuestCac({ channels: [{ channelId: 'campaign', label: name || 'this campaign', budgetUsd, cacUsd: 45 }] }).then(setCac).catch(() => setCac(null));
  }, [budgetLcx, name]);

  const create = async () => {
    if (name.trim().length < 2) { toast('error', 'Name the campaign first'); return; }
    setBusy(true);
    try {
      await createCampaign({ name: name.trim(), kind, tokenIncentivized, budgetLcx });
      toast('success', `Campaign drafted: ${name}`);
      setName('');
      refresh();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const advance = async (c: DistCampaign, status: string) => {
    try {
      await setCampaignStatus(c.id, status);
      toast('success', `${c.name} → ${status.replace('_', ' ')}`);
      refresh();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Update failed');
    }
  };

  return (
    <div className="p-5">
      <PageTitle icon={<Megaphone size={20} />} subtitle="Design, price, and run growth campaigns — governed lifecycle">
        Campaign Ops
      </PageTitle>

      {/* Designer + live pricing */}
      <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-card p-4 shadow-card">
          <div className="mb-2 text-micro font-bold uppercase tracking-wider text-grey">Design a campaign</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name" className="mb-2 w-full rounded border border-line bg-page px-2.5 py-1.5 text-label text-navy outline-none focus:border-cyan-500" />
          <div className="mb-2 flex gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="rounded border border-line bg-card px-2 py-1 text-micro text-navy">
              <option value="quest">quest</option><option value="incentive">incentive</option>
              <option value="content">content</option><option value="outreach">outreach</option>
            </select>
            <label className="flex items-center gap-1.5 text-micro text-grey-dark">
              <input type="checkbox" checked={tokenIncentivized} onChange={(e) => setTokenIncentivized(e.target.checked)} /> token-incentivized
            </label>
          </div>
          <label className="block text-micro text-grey">Budget: <span className="font-mono font-bold text-navy">{budgetLcx.toLocaleString()} LCX</span></label>
          <input type="range" min={0} max={50000} step={1000} value={budgetLcx} onChange={(e) => setBudgetLcx(Number(e.target.value))} className="w-full accent-cyan-500" />
          <Button className="mt-2" size="xs" disabled={busy} onClick={() => void create()}><Plus size={12} /> {busy ? 'Drafting…' : 'Draft campaign'}</Button>
          {tokenIncentivized && <p className="mt-1.5 text-[10px] text-amber-600 dark:text-amber-400">Token-incentivized — Phase 6 will require a compliance review before launch.</p>}
        </div>

        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4">
          <div className="mb-2 text-micro font-bold uppercase tracking-wider text-grey">Live pricing (engines)</div>
          {emit && (
            <p className="text-label text-navy">Emission: <span className="font-mono font-bold">{emit.emittedLcx.toLocaleString()} LCX</span> · util <span className="font-mono font-bold">{emit.budgetUtilizationPct}%</span> <span className={clsx('font-semibold', emit.status === 'healthy' ? 'text-emerald-600 dark:text-emerald-400' : emit.status === 'watch' ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}>· {emit.status}</span></p>
          )}
          {cac && (
            <p className="mt-1 text-label text-navy">Est. funded agents (p50): <span className="font-mono font-bold">{cac.fundedAgents.p50.toLocaleString()}</span>{cac.blendedCacP50 != null && <> · blended CAC <span className="font-mono font-bold">${cac.blendedCacP50}</span></>}</p>
          )}
          <p className="mt-2 text-[10px] text-grey">Recomputed live from the Phase-4 Monte Carlo engines as you drag the budget.</p>
        </div>
      </section>

      {/* Lifecycle board */}
      <section className="mt-4">
        <div className="mb-2 text-micro font-bold uppercase tracking-wider text-grey">Campaigns</div>
        {campaigns === null ? <CardSkeleton /> : campaigns.length === 0 ? (
          <p className="text-label text-grey">No campaigns yet — draft one above.</p>
        ) : (
          <div className="space-y-2">
            {campaigns.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-card p-2.5 shadow-card">
                <span className="min-w-0 flex-1">
                  <span className="text-label font-semibold text-navy">{c.name}</span>
                  <span className="ml-2 font-mono text-[10px] text-grey">{c.kind}{c.token_incentivized ? ' · token' : ''}{c.budget_lcx ? ` · ${Number(c.budget_lcx).toLocaleString()} LCX` : ''}</span>
                </span>
                <select value={c.status} onChange={(e) => void advance(c, e.target.value)} className={clsx('rounded border border-line bg-card px-1.5 py-0.5 font-mono text-micro font-semibold', STATUS_TONE[c.status])}>
                  {LIFECYCLE.map((v) => <option key={v} value={v}>{v.replace('_', ' ')}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
