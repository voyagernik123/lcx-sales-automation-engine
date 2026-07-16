import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Gavel, FileText, BookOpen, Briefcase, Check, X, RefreshCw, AlertTriangle, ShieldAlert } from 'lucide-react';
import { request } from '@/lib/apiClient';
import { fetchDealBoard, fetchProjectDeal, type BoardDeal } from '@/lib/api/bd';
import { loadDealContexts, type LoadedDealContext } from '@/lib/api/deals100x';
import { fetchForecast } from '@/lib/api/kpi';
import { computeDealHealthSet } from '@/lib/salesIntel';
import { toast } from '@/components/shared/Toast';
import { PageTitle, Button, Select } from '@/components/ui';
import { ApprovalChain, type ApprovalChainStep } from '@/components/deals/ApprovalChain';
import { BatnaPanel } from '@/components/deals/BatnaPanel';
import { DealReviewMemo } from '@/components/deals/DealReviewMemo';
import { ScenarioCard, ScenarioValue, SimPill } from '@/components/deals/ScenarioControls';
import { WarningStageMatrix } from '@/components/deals/WarningStageMatrix';

/* ── Types (mirror the API camelCase envelope) ── */
interface PlaybookStep { order?: number; title?: string; detail?: string }
interface Playbook { id: string; name: string; steps: PlaybookStep[] }
interface Approval {
  id: string; dealId: string; status: string; reason: string | null;
  discountPct: number | null; dealValueCents: number | null;
  projectName?: string | null; steps?: ApprovalChainStep[];
}
interface Invoice {
  id: string; dealId: string; amountCents: number; currency: string; status: string;
  dueDate: string | null; projectName?: string | null;
}
interface Partner { id: string; name: string; type: string; commissionPct: number; contact: string | null }
interface Referral { id: string; partnerId: string; partnerName?: string | null; status: string; commissionCents: number }

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-status-conditional-bg text-status-conditional',
  approved: 'bg-status-ready-bg text-status-ready',
  rejected: 'bg-status-blocked-bg text-status-blocked',
  draft: 'bg-ice-soft text-grey dark:bg-ice-soft/10',
  sent: 'bg-ice-soft text-navy dark:bg-ice-soft/10',
  paid: 'bg-status-ready-bg text-status-ready',
  overdue: 'bg-status-blocked-bg text-status-blocked',
};

function Pill({ status }: { status: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${STATUS_TONE[status] ?? 'bg-ice-soft text-grey dark:bg-ice-soft/10'}`}>
      {status}
    </span>
  );
}

function Section({ title, icon, children, onRefresh }: { title: string; icon: React.ReactNode; children: React.ReactNode; onRefresh?: () => void }) {
  return (
    <section className="rounded-xl border border-line/70 bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight text-navy">{icon}{title}</h2>
        {onRefresh && (
          <Button variant="secondary" size="xs" onClick={onRefresh}>
            <RefreshCw size={10} /> Refresh
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}

const OPEN_STAGES = new Set(['contacted', 'discovery', 'proposal', 'negotiating']);

export function DealDesk() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectIdParam = searchParams.get('projectId');
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [error, setError] = useState('');
  const [newPartner, setNewPartner] = useState({ name: '', commissionPct: '' });
  const [focusDealId, setFocusDealId] = useState<string | null>(null);
  const [focusChecked, setFocusChecked] = useState(false);

  // Pipeline context: board + per-deal events/playbook → health (warnings
  // heatmap, review memos) — same derivation layer the board uses.
  const [boardDeals, setBoardDeals] = useState<BoardDeal[]>([]);
  const [contexts, setContexts] = useState<Record<string, LoadedDealContext>>({});
  const [winProbs, setWinProbs] = useState<Record<string, number>>({});
  const [memoDealId, setMemoDealId] = useState<string | null>(null);

  // BATNA focus: ?projectId deal when present, else operator-picked open deal.
  const [batnaDealId, setBatnaDealId] = useState<string>('');

  // ?projectId= → resolve the project's deal and filter approvals/invoices to it.
  useEffect(() => {
    if (!projectIdParam) {
      setFocusDealId(null);
      setFocusChecked(false);
      return;
    }
    let alive = true;
    fetchProjectDeal(projectIdParam)
      .then((res) => { if (alive) setFocusDealId(res.data?.id ?? null); })
      .catch(() => { if (alive) setFocusDealId(null); })
      .finally(() => { if (alive) setFocusChecked(true); });
    return () => { alive = false; };
  }, [projectIdParam]);

  const loadApprovals = useCallback(async () => {
    const res = await request<{ data: Approval[] }>('/v1/dealdesk/approvals?status=pending');
    // The list endpoint carries no steps — keep any chains we learned from
    // earlier decide responses instead of wiping them.
    setApprovals((prev) => {
      const known = new Map(prev.filter((a) => a.steps?.length).map((a) => [a.id, a.steps]));
      return res.data.map((a) => (a.steps?.length ? a : { ...a, steps: known.get(a.id) }));
    });
  }, []);
  const loadInvoices = useCallback(async () => {
    const res = await request<{ data: Invoice[] }>('/v1/dealdesk/invoices');
    setInvoices(res.data);
  }, []);
  const loadPartners = useCallback(async () => {
    const [p, r] = await Promise.all([
      request<{ data: Partner[] }>('/v1/dealdesk/partners'),
      request<{ data: Referral[] }>('/v1/dealdesk/referrals'),
    ]);
    setPartners(p.data);
    setReferrals(r.data);
  }, []);

  const loadPipeline = useCallback(async () => {
    // Best-effort: the desk still works (approvals/invoices) without the board.
    try {
      const deals = await fetchDealBoard();
      setBoardDeals(deals);
      const ctx = await loadDealContexts(deals);
      setContexts(ctx);
    } catch {
      setBoardDeals([]);
    }
    fetchForecast()
      .then((f) => setWinProbs(Object.fromEntries(f.deals.map((d) => [d.id, d.winProbability]))))
      .catch(() => undefined);
  }, []);

  const loadAll = useCallback(async () => {
    setError('');
    void loadPipeline();
    try {
      const pb = await request<{ data: Playbook[] }>('/v1/dealdesk/playbooks');
      setPlaybooks(pb.data);
      await Promise.all([loadApprovals(), loadInvoices(), loadPartners()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load deal desk');
    }
  }, [loadApprovals, loadInvoices, loadPartners, loadPipeline]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const health = useMemo(() => computeDealHealthSet(boardDeals, contexts), [boardDeals, contexts]);
  const dealById = useMemo(() => new Map(boardDeals.map((d) => [d.id, d])), [boardDeals]);
  const openDeals = useMemo(() => boardDeals.filter((d) => OPEN_STAGES.has(d.stage)), [boardDeals]);

  // Resolve the BATNA deal: explicit pick > project focus > first open deal.
  const batnaDeal = useMemo(() => {
    const picked = batnaDealId ? dealById.get(batnaDealId) : undefined;
    if (picked) return picked;
    const focused = focusDealId ? dealById.get(focusDealId) : undefined;
    if (focused) return focused;
    return openDeals[0];
  }, [batnaDealId, dealById, focusDealId, openDeals]);

  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    try {
      // The decide response embeds the full step chain — merge it back so the
      // visual chain hydrates/advances without a page reload.
      const res = await request<{ data: Approval }>(`/v1/dealdesk/approvals/${id}/decide`, { body: { decision } });
      setApprovals((prev) =>
        prev
          .map((a) => (a.id === id ? { ...a, ...res.data, projectName: a.projectName } : a))
          .filter((a) => a.status === 'pending'),
      );
      toast('success', `Step ${decision} — ${res.data.status === 'pending' ? 'chain advances to the next role' : `request ${res.data.status}`}`);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Decision failed');
    }
  };

  const setInvoiceStatus = async (id: string, status: string) => {
    try {
      await request(`/v1/dealdesk/invoices/${id}/status`, { method: 'PATCH', body: { status } });
      toast('success', `Invoice marked ${status}`);
      await loadInvoices();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to update invoice');
    }
  };

  const addPartner = async () => {
    if (!newPartner.name.trim()) return;
    try {
      await request('/v1/dealdesk/partners', {
        body: { name: newPartner.name.trim(), commissionPct: Number(newPartner.commissionPct) || 0 },
      });
      toast('success', `Partner added — ${newPartner.name.trim()}`);
      setNewPartner({ name: '', commissionPct: '' });
      await loadPartners();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to add partner');
    }
  };

  const filtering = Boolean(projectIdParam);
  const visibleApprovals = filtering ? approvals.filter((a) => a.dealId === focusDealId) : approvals;
  const visibleInvoices = filtering ? invoices.filter((i) => i.dealId === focusDealId) : invoices;

  const memoDeal = memoDealId ? dealById.get(memoDealId) : undefined;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <PageTitle
        icon={<Gavel size={20} />}
        subtitle="Billing is status tracking only — nothing here moves money or executes payments."
        actions={
          <div className="flex items-center gap-2">
            <SimPill />
            <Button variant="secondary" size="xs" onClick={() => void loadAll()}>
              <RefreshCw size={11} /> Refresh all
            </Button>
          </div>
        }
      >
        Deal Desk
      </PageTitle>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-label text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {filtering && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-label text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/20 dark:text-cyan-300">
          <span>
            {focusChecked && !focusDealId
              ? 'No deal exists for this project yet.'
              : `Filtered to the selected project's deal — ${visibleApprovals.length} approval(s), ${visibleInvoices.length} invoice(s).`}
          </span>
          <button
            onClick={() => setSearchParams({}, { replace: true })}
            className="shrink-0 font-bold hover:underline"
          >
            Show all
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── Main column ── */}
        <div className="min-w-0 space-y-4">
          {/* Approvals queue */}
          <Section title="Approvals queue" icon={<AlertTriangle size={15} className="text-amber-600" />} onRefresh={() => void loadApprovals()}>
            {visibleApprovals.length === 0 ? (
              <p className="text-label text-grey">No pending approvals.</p>
            ) : (
              <div className="space-y-2">
                {visibleApprovals.map((a) => (
                  <div key={a.id} className="flex items-start justify-between gap-3 rounded-lg border border-line/70 p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-label font-semibold text-navy">{a.projectName ?? a.dealId}</span>
                        <Pill status={a.status} />
                        {a.dealValueCents != null && (
                          <ScenarioValue cents={a.dealValueCents} className="num-tabular font-mono text-micro text-grey" />
                        )}
                        {a.discountPct != null && <span className="num-tabular text-micro text-grey">−{a.discountPct}%</span>}
                      </div>
                      <ApprovalChain steps={a.steps} requestStatus={a.status} className="mt-1.5" />
                      {a.reason && <p className="mt-1 text-xs italic text-grey">“{a.reason}”</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="flex gap-1">
                        <button onClick={() => void decide(a.id, 'approved')} className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-micro font-bold text-white hover:bg-emerald-700"><Check size={10} /> Approve</button>
                        <button onClick={() => void decide(a.id, 'rejected')} className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-micro font-bold text-navy hover:bg-status-blocked-bg"><X size={10} /> Reject</button>
                      </div>
                      {dealById.has(a.dealId) && (
                        <button
                          onClick={() => setMemoDealId(a.dealId)}
                          className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-micro font-bold text-grey transition-colors hover:border-grey-light hover:text-navy"
                          title="Open the print-ready deal review memo"
                        >
                          <FileText size={10} /> Review memo
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-micro text-grey">
              Approving decides the current pending step; the request completes when the last role signs off. One
              rejection rejects the whole chain.
            </p>
          </Section>

          {/* Pipeline warnings heatmap */}
          <Section title="Pipeline warnings — coach view" icon={<ShieldAlert size={15} className="text-orange-500" />} onRefresh={() => void loadPipeline()}>
            <WarningStageMatrix deals={boardDeals} health={health} />
          </Section>

          {/* Invoices */}
          <Section title="Invoices" icon={<FileText size={15} className="text-sky-600" />} onRefresh={() => void loadInvoices()}>
            {visibleInvoices.length === 0 ? (
              <p className="text-label text-grey">No invoices tracked yet.</p>
            ) : (
              <table className="w-full text-label">
                <thead>
                  <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-grey">
                    <th className="pb-2 font-bold">Project</th>
                    <th className="pb-2 text-right font-bold">Amount</th>
                    <th className="pb-2 pl-4 font-bold">Due</th>
                    <th className="pb-2 font-bold">Status</th>
                    <th className="pb-2 font-bold">Mark</th>
                    <th className="pb-2" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/50">
                  {visibleInvoices.map((i) => (
                    <tr key={i.id} className="transition-colors hover:bg-grey/[0.04]">
                      <td className="py-2.5 font-semibold text-navy">{i.projectName ?? i.dealId}</td>
                      <td className="num-tabular py-2.5 text-right">
                        {i.currency === 'USD' ? (
                          <ScenarioValue cents={i.amountCents} className="font-mono text-navy" />
                        ) : (
                          <span className="font-mono text-navy">{i.currency} {(i.amountCents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        )}
                      </td>
                      <td className="num-tabular py-2.5 pl-4 text-grey">{i.dueDate ? new Date(i.dueDate).toLocaleDateString() : '—'}</td>
                      <td className="py-2.5"><Pill status={i.status} /></td>
                      <td className="py-2.5">
                        <select
                          value={i.status}
                          onChange={(e) => void setInvoiceStatus(i.id, e.target.value)}
                          className="cursor-pointer rounded border border-line bg-card px-1 py-0.5 text-micro text-navy"
                          aria-label={`Invoice status for ${i.projectName ?? i.dealId}`}
                        >
                          {['draft', 'sent', 'paid', 'overdue'].map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="py-2.5 text-right">
                        {dealById.has(i.dealId) && (
                          <button
                            onClick={() => setMemoDealId(i.dealId)}
                            className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-micro font-bold text-grey transition-colors hover:border-grey-light hover:text-navy"
                            title="Open the print-ready deal review memo"
                          >
                            <FileText size={9} /> Memo
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* Playbooks */}
          <Section title="Negotiation playbooks" icon={<BookOpen size={15} className="text-indigo-600" />}>
            {playbooks.length === 0 ? (
              <p className="text-label text-grey">No playbooks seeded.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {playbooks.map((pb) => (
                  <div key={pb.id} className="rounded-lg border border-line/70 p-3">
                    <h3 className="text-label font-bold text-navy">{pb.name}</h3>
                    <ol className="mt-1.5 space-y-1">
                      {pb.steps.map((s, idx) => (
                        <li key={idx} className="text-xs text-grey">
                          <span className="font-semibold text-grey">{s.order ?? idx + 1}. {s.title}</span>
                          {s.detail && <span className="block pl-3">{s.detail}</span>}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Partners */}
          <Section title="Partners & referrals" icon={<Briefcase size={15} className="text-emerald-600" />} onRefresh={() => void loadPartners()}>
            <div className="mb-3 flex gap-2">
              <input
                value={newPartner.name}
                onChange={(e) => setNewPartner((p) => ({ ...p, name: e.target.value }))}
                placeholder="Partner name…"
                className="flex-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-navy focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <input
                value={newPartner.commissionPct}
                onChange={(e) => setNewPartner((p) => ({ ...p, commissionPct: e.target.value }))}
                placeholder="%"
                className="w-16 rounded-lg border border-line bg-card px-2 py-1.5 text-xs text-navy focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <Button variant="primary" size="sm" onClick={() => void addPartner()}>Add</Button>
            </div>
            {partners.length === 0 ? (
              <p className="text-label text-grey">No partners yet.</p>
            ) : (
              <div className="space-y-1.5">
                {partners.map((p) => {
                  const mine = referrals.filter((r) => r.partnerId === p.id);
                  const commission = mine.reduce((s, r) => s + (r.commissionCents ?? 0), 0);
                  return (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border border-line/70 px-3 py-2.5 text-label">
                      <div>
                        <span className="font-semibold text-navy">{p.name}</span>
                        <span className="ml-2 text-[9px] uppercase tracking-wide text-grey">{p.type}</span>
                      </div>
                      <div className="num-tabular flex items-baseline gap-2 text-xs text-grey">
                        <span>{p.commissionPct}% · {mine.length} referral{mine.length === 1 ? '' : 's'}</span>
                        {commission > 0 && <ScenarioValue cents={commission} className="font-mono text-navy" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </div>

        {/* ── Right rail: scenario dials + BATNA ── */}
        <div className="space-y-4">
          <ScenarioCard />

          {openDeals.length === 0 ? (
            <section className="rounded-xl border border-line/70 bg-card p-5 shadow-card">
              <h2 className="text-sm font-bold tracking-tight text-navy">BATNA</h2>
              <p className="mt-1 text-micro text-grey">No open deals on the board — negotiation figures attach to a live deal.</p>
            </section>
          ) : (
            batnaDeal && (
              <div className="space-y-2">
                <Select
                  label="BATNA deal"
                  value={batnaDeal.id}
                  onChange={(e) => setBatnaDealId(e.target.value)}
                  options={openDeals.map((d) => ({
                    value: d.id,
                    label: `${d.projectName}${d.projectTicker ? ` (${d.projectTicker})` : ''} — ${d.stage.replace(/_/g, ' ')}`,
                  }))}
                />
                <BatnaPanel
                  dealId={batnaDeal.id}
                  dealName={batnaDeal.projectName}
                  packageValue={batnaDeal.packageValue}
                />
              </div>
            )
          )}
        </div>
      </div>

      {memoDeal && (
        <DealReviewMemo
          deal={memoDeal}
          health={health.get(memoDeal.id) ?? null}
          events={contexts[memoDeal.id]?.events ?? []}
          winProbability={winProbs[memoDeal.id] ?? null}
          onClose={() => setMemoDealId(null)}
        />
      )}
    </div>
  );
}
