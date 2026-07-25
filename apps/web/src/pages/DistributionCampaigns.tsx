import { useCallback, useEffect, useState } from 'react';
import { Megaphone, Plus } from 'lucide-react';
import { clsx } from 'clsx';
import { PageTitle, Button } from '@/components/ui';
import { CardSkeleton, ErrorNotice } from '@/components/shared';
import { toast } from '@/components/shared/Toast';
import {
  fetchDistCampaigns, createCampaign, setCampaignStatus, runEmission, runQuestCac,
  fetchDistributionDeep, fetchCampaignReviews, fileCampaignReview, exportCampaign,
  type DistCampaign, type Emission, type QuestCac, type DistributionDeep, type CampaignReview,
} from '@/lib/api/distribution';
import { X, ShieldCheck, Download } from 'lucide-react';

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
  const [deep, setDeep] = useState<DistributionDeep | null>(null);
  const [drawer, setDrawer] = useState<DistCampaign | null>(null);
  const [reviews, setReviews] = useState<CampaignReview[]>([]);
  // Failing into setCampaigns([]) rendered "No campaigns yet — draft one above",
  // which is a lie the operator acts on: they draft a duplicate of a campaign
  // that is already there but unreachable. The list carries its own error.
  const [listErr, setListErr] = useState<unknown>(null);

  const refresh = useCallback(() => {
    setListErr(null);
    fetchDistCampaigns().then(setCampaigns).catch(setListErr);
  }, []);
  // `deep` is a garnish only — the MiCA checklist inside the compliance drawer,
  // read through optional chaining. Absent is a legitimate rendering, so this
  // one is deliberately allowed to fail quiet.
  useEffect(() => { refresh(); fetchDistributionDeep().then(setDeep).catch(() => setDeep(null)); }, [refresh]);

  const openDrawer = async (c: DistCampaign) => {
    setDrawer(c);
    setReviews(await fetchCampaignReviews(c.id).catch(() => []));
  };
  const fileReview = async (kind: 'premortem' | 'legal_check') => {
    if (!drawer) return;
    const note = window.prompt(kind === 'premortem' ? 'Premortem — what could make this campaign fail?' : 'Legal check — confirm MiCA/TVTG marketing compliance:');
    if (!note || note.trim().length < 4) return;
    try {
      await fileCampaignReview(drawer.id, kind, kind === 'premortem' ? 'Campaign premortem' : 'Compliance / legal check', note.trim());
      toast('success', `${kind.replace('_', ' ')} filed`);
      setReviews(await fetchCampaignReviews(drawer.id).catch(() => []));
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Failed'); }
  };
  const exportSpec = async (target: string) => {
    if (!drawer) return;
    try {
      const r = await exportCampaign(drawer.id, target);
      // Swallowing the clipboard rejection here still ran the success toast, so
      // the operator was told the spec was copied and then pasted whatever was
      // on the clipboard before. Clipboard writes DO get denied — no document
      // focus, or no permission — so the failure needs its own words.
      await navigator.clipboard.writeText(JSON.stringify(r.spec, null, 2));
      toast('success', `${target} spec copied to clipboard (keyless export)`);
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Export failed'); }
  };

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
      const msg = e instanceof Error ? e.message : 'Update failed';
      // The compliance gate soft-blocks token-campaign launch — offer the
      // audited override (approver-only on the server) rather than dead-end.
      if (/compliance|approver|reward spend/i.test(msg)) {
        const reason = window.prompt(`Blocked by the compliance gate:\n\n${msg}\n\nFile the reviews (open Compliance), or enter an override reason to launch anyway (audited):`);
        if (reason && reason.trim().length > 3) {
          try {
            await setCampaignStatus(c.id, status, { overrideGate: true, overrideReason: reason.trim() });
            toast('success', `${c.name} → ${status.replace('_', ' ')} (overridden, audited)`);
            refresh();
          } catch (e2) { toast('error', e2 instanceof Error ? e2.message : 'Override failed'); }
        }
      } else {
        toast('error', msg);
      }
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
          {tokenIncentivized && <p className="mt-1.5 text-[10px] text-amber-600 dark:text-amber-400">Token-incentivized — launch requires a compliance review (premortem + legal check) and an approver.</p>}
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
        {listErr ? (
          <ErrorNotice error={listErr} onRetry={refresh} />
        ) : campaigns === null ? <CardSkeleton /> : campaigns.length === 0 ? (
          <p className="text-label text-grey">No campaigns yet — draft one above.</p>
        ) : (
          <div className="space-y-2">
            {campaigns.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-card p-2.5 shadow-card">
                <span className="min-w-0 flex-1">
                  <span className="text-label font-semibold text-navy">{c.name}</span>
                  <span className="ml-2 font-mono text-[10px] text-grey">{c.kind}{c.token_incentivized ? ' · token' : ''}{c.budget_lcx ? ` · ${Number(c.budget_lcx).toLocaleString()} LCX` : ''}</span>
                </span>
                {c.token_incentivized && (
                  <button onClick={() => void openDrawer(c)} className="flex items-center gap-1 text-micro text-cyan-600 hover:underline dark:text-cyan-400"><ShieldCheck size={12} /> Compliance</button>
                )}
                <select value={c.status} onChange={(e) => void advance(c, e.target.value)} className={clsx('rounded border border-line bg-card px-1.5 py-0.5 font-mono text-micro font-semibold', STATUS_TONE[c.status])}>
                  {LIFECYCLE.map((v) => <option key={v} value={v}>{v.replace('_', ' ')}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Compliance drawer — SAT reviews + the MiCA checklist the gate cites */}
      {drawer && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={() => setDrawer(null)}>
          <div
            role="dialog"
            aria-label={`Compliance detail: ${drawer.name}`}
            className="h-full w-full max-w-lg overflow-y-auto border-l border-line bg-card p-4 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2">
              <h2 className="min-w-0 flex-1 truncate text-h3 font-bold text-navy">{drawer.name}</h2>
              <button onClick={() => setDrawer(null)} className="text-grey hover:text-navy" aria-label="Close"><X size={16} /></button>
            </div>
            <p className="mb-3 text-micro text-grey">Token-incentivized — launch is gated on a premortem + legal check and the emission budget.</p>

            <div className="mb-4">
              <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-grey"><ShieldCheck size={12} /> Compliance reviews</div>
              {(['premortem', 'legal_check'] as const).map((k) => {
                const has = reviews.some((r) => r.kind === k && r.status === 'active');
                return (
                  <div key={k} className="mb-1 flex items-center gap-2">
                    <span className={clsx('h-2 w-2 rounded-full', has ? 'bg-emerald-500' : 'bg-line')} />
                    <span className="flex-1 text-label text-navy">{k === 'premortem' ? 'Premortem' : 'Legal / compliance check'}</span>
                    {has ? <span className="text-micro text-emerald-600 dark:text-emerald-400">on file</span>
                         : <Button size="xs" variant="secondary" onClick={() => void fileReview(k)}>File</Button>}
                  </div>
                );
              })}
            </div>

            <div className="mb-4">
              <div className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-grey">MiCA / policy checklist</div>
              <ul className="space-y-1">
                {(deep?.reference as unknown as { complianceChecklist?: Array<{ id: string; rule: string; check: string }> })?.complianceChecklist?.map((c) => (
                  <li key={c.id} className="text-micro"><span className="font-semibold text-navy">{c.rule}</span> — <span className="text-grey-dark">{c.check}</span></li>
                ))}
              </ul>
            </div>

            <div>
              <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-grey"><Download size={12} /> Keyless platform export</div>
              <div className="flex gap-2">
                <Button size="xs" variant="secondary" onClick={() => void exportSpec('galxe')}>Export → Galxe</Button>
                <Button size="xs" variant="secondary" onClick={() => void exportSpec('layer3')}>Export → Layer3</Button>
              </div>
              <p className="mt-1 text-[10px] text-grey">Copies a platform-ready spec to your clipboard — auto-posted once platform keys are configured.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
