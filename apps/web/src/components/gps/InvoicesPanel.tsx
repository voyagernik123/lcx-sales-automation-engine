import { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Badge, Button, Card, CardBody, CardHeader, Input } from '@/components/ui';
import { ApiError, request } from '@/lib/apiClient';

/**
 * G6, ON THE BOOK — every invoice the desk raised, aged, and the chase behind glass.
 *
 * The panel's honesty rules:
 *  · Aging mirrors the deposit brackets, and if open invoices span more than one
 *    currency it says so and does NOT print a single total — dollars are never
 *    summed into euros.
 *  · The lifecycle actions are the governed ones: pay records a rail reference
 *    (there is no "paid" without it), dispute and void carry reasons. A dispute is
 *    a state on screen, never a row that vanishes.
 *  · The chase opens a DRAFT with the gate's verdict beside it. No send button:
 *    a cleared chase is copied and carried by a human, same as every outreach.
 */

interface InvoiceRow {
  id: number; number: string; engagementId: string; deliverableId: string;
  amountCents: number; currency: string;
  status: 'issued' | 'paid' | 'disputed' | 'void';
  issuedBy: string; issuedAt: string;
  paidReference: string | null; disputedReason: string | null; voidedReason: string | null;
}

interface AgingBracket { key: string; label: string; count: number; amountCents: number }
interface Aging { brackets: AgingBracket[]; openCount: number; openAmountCents: number; unagedCount: number; currenciesPresent: string[] }

interface InvoicesData { invoices: InvoiceRow[]; aging: Aging | null; registerPresent: boolean | null }

interface ChaseResult {
  invoiceId: number; draft: string;
  verdict: { allowed: boolean; disposition: string; refusals: Array<{ code: string }>; reference: string };
}

const STATUS_TONE = { issued: 'conditional', paid: 'ready', disputed: 'blocked', void: 'deferred' } as const;

const money = (cents: number, ccy: string) =>
  `${ccy === 'USD' ? '$' : `${ccy} `}${Math.round(cents / 100).toLocaleString('en-US')}`;

export function InvoicesPanel() {
  const [data, setData] = useState<InvoicesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [form, setForm] = useState<{ id: number; kind: 'pay' | 'dispute' | 'void'; text: string } | null>(null);
  const [chase, setChase] = useState<ChaseResult | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await request<{ data: InvoicesData }>('/v1/gps/invoices');
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code ?? 'ERROR'}: ${err.message}` : String(err));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = useCallback(async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setActionError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? `${err.code ?? 'ERROR'}: ${err.message}` : String(err));
    } finally {
      setBusy(null);
    }
  }, [load]);

  const submitForm = () => {
    if (form === null) return;
    const { id, kind, text } = form;
    const body = kind === 'pay' ? { reference: text } : { reason: text };
    void act(`${kind}-${id}`, async () => {
      await request(`/v1/gps/invoices/${id}/${kind}`, { method: 'POST', body });
      setForm(null);
    });
  };

  const runChase = (id: number) => act(`chase-${id}`, async () => {
    const res = await request<{ data: { draft: string; verdict: ChaseResult['verdict'] } }>(
      `/v1/gps/invoices/${id}/chase`,
      { method: 'POST', body: {} },
    );
    setChase({ invoiceId: id, draft: res.data.draft, verdict: res.data.verdict });
  });

  return (
    <Card>
      <CardHeader>Invoices — raised against acceptances, aged, chased through the gate</CardHeader>
      <CardBody className="space-y-3 text-xs">
        {error !== null && <p className="text-status-blocked" data-testid="invoices-load-error">{error}</p>}
        {data !== null && (
          <>
            {data.registerPresent === false && (
              <p className="font-mono text-grey-dark" data-testid="invoices-register-absent">
                The invoice register does not exist on this environment yet — apply 0082_gps_invoice.sql.
                Every invoice action refuses with the same sentence until then.
              </p>
            )}

            {data.aging !== null && data.aging.openCount > 0 && (
              <div data-testid="invoices-aging">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-grey">
                  Open — {data.aging.openCount} invoice(s)
                  {data.aging.currenciesPresent.length <= 1
                    ? `, ${money(data.aging.openAmountCents, data.aging.currenciesPresent[0] ?? 'USD')}`
                    : ''}
                </p>
                {data.aging.currenciesPresent.length > 1 && (
                  <p className="text-status-conditional" data-testid="invoices-multi-currency">
                    Open invoices span {data.aging.currenciesPresent.join(', ')} — no single total is shown,
                    because summing across currencies would be a made-up number.
                  </p>
                )}
                <div className="mt-1 flex flex-wrap gap-3 font-mono text-grey-dark">
                  {data.aging.brackets.filter((b) => b.count > 0).map((b) => (
                    <span key={b.key} data-testid={`aging-${b.key}`}>{b.label}: {b.count}</span>
                  ))}
                  {data.aging.unagedCount > 0 && <span className="text-status-blocked">unaged: {data.aging.unagedCount}</span>}
                </div>
              </div>
            )}

            {actionError !== null && (
              <p role="alert" className="font-mono text-status-blocked" data-testid="invoices-action-error">{actionError}</p>
            )}

            {chase !== null && (
              <div className="border border-line p-2" data-testid="chase-draft">
                <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-grey">
                  Chase draft for GPS-{String(chase.invoiceId).padStart(6, '0')} —{' '}
                  <span className={chase.verdict.allowed ? 'text-status-ready' : 'text-status-blocked'}>
                    gate: {chase.verdict.allowed ? 'cleared' : 'refused'}
                  </span>
                </p>
                <pre className="mt-1 whitespace-pre-wrap font-sans text-xs leading-relaxed text-navy" data-testid="chase-text">{chase.draft}</pre>
                <p className="mt-1 text-[10px] text-grey">
                  {chase.verdict.refusals.length > 0 && <>refusals: {chase.verdict.refusals.map((r) => r.code).join(', ')} · </>}
                  ref {chase.verdict.reference}. Copy and send it yourself — this desk drafts and judges, it does not send.
                </p>
                <Button variant="secondary" onClick={() => setChase(null)}>Close</Button>
              </div>
            )}

            {data.invoices.length === 0 ? (
              <p className="text-grey" data-testid="invoices-empty">
                No invoices yet. An invoice is raised against an ACCEPTED deliverable, from the delivery desk —
                a bill that traces to no acceptance is inexpressible here.
              </p>
            ) : (
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-line text-left font-mono uppercase tracking-wider text-grey">
                    <th className="py-1 pr-2">number</th><th className="pr-2">amount</th>
                    <th className="pr-2">status</th><th className="pr-2">issued</th><th />
                  </tr>
                </thead>
                <tbody>
                  {data.invoices.map((inv) => (
                    <tr key={inv.id} className={clsx('border-b border-line/50 align-top', inv.status === 'void' && 'opacity-50')} data-testid={`invoice-${inv.id}`}>
                      <td className="py-1 pr-2 font-mono text-navy">{inv.number}</td>
                      <td className="pr-2 font-mono">{money(inv.amountCents, inv.currency)}</td>
                      <td className="pr-2">
                        <Badge status={STATUS_TONE[inv.status]}>{inv.status}</Badge>
                        {inv.status === 'paid' && inv.paidReference !== null && <span className="block text-grey">ref {inv.paidReference}</span>}
                        {inv.status === 'disputed' && inv.disputedReason !== null && <span className="block text-status-blocked">{inv.disputedReason}</span>}
                        {inv.status === 'void' && inv.voidedReason !== null && <span className="block text-grey">{inv.voidedReason}</span>}
                      </td>
                      <td className="pr-2 text-grey">{inv.issuedAt.slice(0, 10)} by {inv.issuedBy}</td>
                      <td className="whitespace-nowrap">
                        {(inv.status === 'issued' || inv.status === 'disputed') && (
                          <span className="flex flex-wrap gap-1">
                            <Button onClick={() => setForm({ id: inv.id, kind: 'pay', text: '' })} disabled={busy !== null}>Mark paid</Button>
                            {inv.status === 'issued' && (
                              <Button variant="secondary" onClick={() => setForm({ id: inv.id, kind: 'dispute', text: '' })} disabled={busy !== null}>Dispute…</Button>
                            )}
                            <Button variant="secondary" onClick={() => setForm({ id: inv.id, kind: 'void', text: '' })} disabled={busy !== null}>Void…</Button>
                            <Button variant="secondary" onClick={() => void runChase(inv.id)} disabled={busy !== null}>Chase</Button>
                          </span>
                        )}
                        {form !== null && form.id === inv.id && (
                          <span className="mt-1 flex gap-1">
                            <Input
                              aria-label={`${form.kind} input ${inv.id}`}
                              placeholder={form.kind === 'pay' ? 'rail reference (required)' : 'reason (required)'}
                              value={form.text}
                              onChange={(e) => setForm({ ...form, text: e.target.value })}
                            />
                            <Button onClick={submitForm} disabled={busy !== null || form.text.trim() === ''}>
                              {form.kind === 'pay' ? 'Record payment' : form.kind === 'dispute' ? 'Record dispute' : 'Record void'}
                            </Button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
