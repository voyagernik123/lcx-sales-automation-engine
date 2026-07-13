import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Gavel, FileText, BookOpen, Briefcase, Check, X, RefreshCw, AlertTriangle } from 'lucide-react';
import { request } from '@/lib/apiClient';
import { fetchProjectDeal } from '@/lib/api/bd';

/* ── Types (mirror the API camelCase envelope) ── */
interface PlaybookStep { order?: number; title?: string; detail?: string }
interface Playbook { id: string; name: string; steps: PlaybookStep[] }
interface ApprovalStep { id: string; role: string; status: string; decidedBy: string | null }
interface Approval {
  id: string; dealId: string; status: string; reason: string | null;
  discountPct: number | null; dealValueCents: number | null;
  projectName?: string | null; steps?: ApprovalStep[];
}
interface Invoice {
  id: string; dealId: string; amountCents: number; currency: string; status: string;
  dueDate: string | null; projectName?: string | null;
}
interface Partner { id: string; name: string; type: string; commissionPct: number; contact: string | null }
interface Referral { id: string; partnerId: string; partnerName?: string | null; status: string; commissionCents: number }

const money = (cents: number, ccy = 'USD') =>
  `${ccy} ${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-sky-100 text-sky-700',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
};

function Pill({ status }: { status: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${STATUS_TONE[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}

function Section({ title, icon, children, onRefresh }: { title: string; icon: React.ReactNode; children: React.ReactNode; onRefresh?: () => void }) {
  return (
    <section className="rounded-lg border border-line bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold">{icon}{title}</h2>
        {onRefresh && (
          <button onClick={onRefresh} className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[10px] font-semibold hover:bg-ice-soft dark:hover:bg-ice-soft/10">
            <RefreshCw size={10} /> Refresh
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

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
    setApprovals(res.data);
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

  const loadAll = useCallback(async () => {
    setError('');
    try {
      const pb = await request<{ data: Playbook[] }>('/v1/dealdesk/playbooks');
      setPlaybooks(pb.data);
      await Promise.all([loadApprovals(), loadInvoices(), loadPartners()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load deal desk');
    }
  }, [loadApprovals, loadInvoices, loadPartners]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    try {
      await request(`/v1/dealdesk/approvals/${id}/decide`, { body: { decision } });
      await loadApprovals();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  const setInvoiceStatus = async (id: string, status: string) => {
    try {
      await request(`/v1/dealdesk/invoices/${id}/status`, { method: 'PATCH', body: { status } });
      await loadInvoices();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  const addPartner = async () => {
    if (!newPartner.name.trim()) return;
    try {
      await request('/v1/dealdesk/partners', {
        body: { name: newPartner.name.trim(), commissionPct: Number(newPartner.commissionPct) || 0 },
      });
      setNewPartner({ name: '', commissionPct: '' });
      await loadPartners();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  const filtering = Boolean(projectIdParam);
  const visibleApprovals = filtering ? approvals.filter((a) => a.dealId === focusDealId) : approvals;
  const visibleInvoices = filtering ? invoices.filter((i) => i.dealId === focusDealId) : invoices;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-bold"><Gavel size={18} /> Deal Desk</h1>
        <button onClick={() => void loadAll()} className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] font-semibold hover:bg-ice-soft dark:hover:bg-ice-soft/10">
          <RefreshCw size={11} /> Refresh all
        </button>
      </div>
      <p className="text-[11px] text-grey">Billing is status tracking only — nothing here moves money or executes payments.</p>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">{error}</div>}

      {filtering && (
        <div className="flex items-center justify-between gap-2 rounded border border-cyan-200 bg-cyan-50 px-3 py-2 text-[11px] text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/20 dark:text-cyan-300">
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

      {/* Approvals queue */}
      <Section title="Approvals queue" icon={<AlertTriangle size={15} className="text-amber-600" />} onRefresh={() => void loadApprovals()}>
        {visibleApprovals.length === 0 ? (
          <p className="text-[12px] text-grey">No pending approvals.</p>
        ) : (
          <div className="space-y-2">
            {visibleApprovals.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-2 rounded border border-line p-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold">{a.projectName ?? a.dealId}</span>
                    <Pill status={a.status} />
                  </div>
                  <p className="mt-0.5 text-[10px] text-grey">
                    {a.dealValueCents != null && <>value {money(a.dealValueCents)} · </>}
                    {a.discountPct != null && <>discount {a.discountPct}% · </>}
                    chain {(a.steps ?? []).map((s) => s.role).join(' → ') || 'n/a'}
                  </p>
                  {a.reason && <p className="mt-0.5 text-[10px] text-grey italic">“{a.reason}”</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => void decide(a.id, 'approved')} className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-700"><Check size={10} /> Approve</button>
                  <button onClick={() => void decide(a.id, 'rejected')} className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[10px] font-bold hover:bg-red-50"><X size={10} /> Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Invoices */}
      <Section title="Invoices" icon={<FileText size={15} className="text-sky-600" />} onRefresh={() => void loadInvoices()}>
        {visibleInvoices.length === 0 ? (
          <p className="text-[12px] text-grey">No invoices tracked yet.</p>
        ) : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-[9px] uppercase text-grey">
                <th className="pb-1">Project</th><th className="pb-1">Amount</th><th className="pb-1">Due</th><th className="pb-1">Status</th><th className="pb-1">Mark</th>
              </tr>
            </thead>
            <tbody>
              {visibleInvoices.map((i) => (
                <tr key={i.id} className="border-t border-line">
                  <td className="py-1.5 font-semibold">{i.projectName ?? i.dealId}</td>
                  <td className="py-1.5">{money(i.amountCents, i.currency)}</td>
                  <td className="py-1.5 text-grey">{i.dueDate ? new Date(i.dueDate).toLocaleDateString() : '—'}</td>
                  <td className="py-1.5"><Pill status={i.status} /></td>
                  <td className="py-1.5">
                    <select
                      value={i.status}
                      onChange={(e) => void setInvoiceStatus(i.id, e.target.value)}
                      className="rounded border border-line bg-card px-1 py-0.5 text-[10px]"
                    >
                      {['draft', 'sent', 'paid', 'overdue'].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Playbooks + BATNA note */}
      <Section title="Negotiation playbooks" icon={<BookOpen size={15} className="text-indigo-600" />}>
        {playbooks.length === 0 ? (
          <p className="text-[12px] text-grey">No playbooks seeded.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {playbooks.map((pb) => (
              <div key={pb.id} className="rounded border border-line p-2.5">
                <h3 className="text-[12px] font-bold">{pb.name}</h3>
                <ol className="mt-1 space-y-1">
                  {pb.steps.map((s, idx) => (
                    <li key={idx} className="text-[10px] text-grey">
                      <span className="font-semibold text-grey">{s.order ?? idx + 1}. {s.title}</span>
                      {s.detail && <span className="block pl-3">{s.detail}</span>}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-[10px] text-grey">BATNA figures are tracked per deal via <code>/v1/dealdesk/deals/:dealId/batna</code>.</p>
      </Section>

      {/* Partners */}
      <Section title="Partners & referrals" icon={<Briefcase size={15} className="text-emerald-600" />} onRefresh={() => void loadPartners()}>
        <div className="mb-3 flex gap-2">
          <input
            value={newPartner.name}
            onChange={(e) => setNewPartner((p) => ({ ...p, name: e.target.value }))}
            placeholder="Partner name…"
            className="flex-1 rounded border border-line bg-card px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <input
            value={newPartner.commissionPct}
            onChange={(e) => setNewPartner((p) => ({ ...p, commissionPct: e.target.value }))}
            placeholder="%"
            className="w-16 rounded border border-line bg-card px-2 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <button onClick={() => void addPartner()} className="rounded bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700">Add</button>
        </div>
        {partners.length === 0 ? (
          <p className="text-[12px] text-grey">No partners yet.</p>
        ) : (
          <div className="space-y-1.5">
            {partners.map((p) => {
              const count = referrals.filter((r) => r.partnerId === p.id).length;
              return (
                <div key={p.id} className="flex items-center justify-between rounded border border-line p-2 text-[11px]">
                  <div>
                    <span className="font-semibold">{p.name}</span>
                    <span className="ml-2 text-[9px] uppercase text-grey">{p.type}</span>
                  </div>
                  <div className="text-[10px] text-grey">{p.commissionPct}% · {count} referral{count === 1 ? '' : 's'}</div>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
