import { useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Badge, Button, Card, CardBody, CardHeader, Input, Select } from '@/components/ui';
import { ApiError, request } from '@/lib/apiClient';
import { attachMeta } from '@/lib/api/meta';
import { GpsMetaBanner } from '@/pages/GpsMetaBanner';
import type {
  FounderPacket,
  PacketKind,
  PacketProposal,
  PerimeterSeedRow,
} from '@lcx/shared';

/**
 * THE FOUNDER PACKETS — the G0 approval inbox, at the top of the input desk.
 *
 * Five proposals, each carrying its evidence and its consequence, each approvable or
 * editable in place. The section exists because eleven months of blank forms produced no
 * numbers; a proposal with an approve button produced five decisions in one sitting — or
 * that is the bet, and this screen is the bet made concrete.
 *
 * ── WHAT THIS SECTION NEVER DOES ─────────────────────────────────────────────
 * It renders no judgement of its own. Whether an edit is legal is the SERVER's call
 * (`packetProposalDefects`, the same predicate the builder's tests pass), and a refusal is
 * rendered verbatim with its defects. Whether the caller may decide at all is the server's
 * call too — a non-approver pressing Approve sees FORBIDDEN_REQUIRES_APPROVER exactly as
 * the server said it, not a greyed-out button that hides the rule.
 *
 * The ONE piece of client-side arithmetic is the dirty flag: an untouched packet posts
 * `approved`, a touched one posts `approved_with_edits`. That is not validation — it is
 * telling the truth about which of the two decisions the owner is making, and the server
 * re-derives it anyway (PACKET_EDITS_UNDECLARED) so a lying client changes nothing.
 *
 * ── EVIDENCE IS RENDERED WITH ITS GRADES, ALWAYS ─────────────────────────────
 * B2 (measured from this repo), C3 (assistant knowledge, unverified), N/A (a design
 * decision). Nothing in these packets grades above B2, and the caveats travel beside the
 * claims (D3) — an owner approving a C3 number should be looking at the sentence that says
 * why it might be wrong while his cursor is on the button.
 */

interface PacketDecisionView {
  packetKind: PacketKind;
  decision: 'approved' | 'approved_with_edits' | 'rejected';
  applyState: 'applied' | 'recorded_only' | 'apply_failed';
  applyDetail: string;
  decidedBy: string;
  decidedAt: string;
  notes: string | null;
}

interface PacketsEnvelope {
  data: {
    packets: FounderPacket[];
    decisions: PacketDecisionView[];
    registerPresent: boolean | null;
    registerNotice: string | null;
  };
  meta?: Record<string, unknown> | null;
}

interface DecideEnvelope {
  data: {
    kind: PacketKind;
    decision: string;
    applyState: string;
    applyDetail: string;
    decisions: PacketDecisionView[];
  };
}

interface ShownDefects { code: string; message: string; defects: string[] }

/* Badge's five statuses, mapped honestly: a repo measurement is 'ready', assistant
   knowledge is exactly what 'unverified' exists for, a design decision is 'deferred'
   judgement — argued, not evidenced. */
const GRADE_STATUS: Record<string, 'ready' | 'unverified' | 'deferred'> = {
  B2: 'ready',
  C3: 'unverified',
  'N/A': 'deferred',
};

const cents = (v: number) => `$${(v / 100).toLocaleString('en-US')}`;

/** Deep clone via JSON — proposals are pure data by construction (validated shapes). */
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function GpsInputsPackets({ onApplied }: { onApplied?: () => void }) {
  const [data, setData] = useState<PacketsEnvelope['data'] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Partial<Record<PacketKind, PacketProposal>>>({});
  const [dirty, setDirty] = useState<Partial<Record<PacketKind, boolean>>>({});
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Partial<Record<PacketKind, string>>>({});
  const [busy, setBusy] = useState<PacketKind | null>(null);
  const [refusals, setRefusals] = useState<Partial<Record<PacketKind, ShownDefects>>>({});

  const load = useCallback(async () => {
    try {
      const res = await request<PacketsEnvelope>('/v1/gps/packets');
      /* The envelope travels with the data (gpsMetaNotices census): migrated:false is the
         difference between "no decisions yet" and "the register does not exist here", and
         this section renders that distinction rather than discarding it. */
      setData(attachMeta(res.data, res.meta ?? null));
      setLoadError(null);
    } catch (err) {
      setData(null);
      setLoadError(err instanceof ApiError ? `${err.code ?? 'ERROR'}: ${err.message}` : String(err));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const decisionFor = useCallback(
    (kind: PacketKind) => data?.decisions.find((d) => d.packetKind === kind) ?? null,
    [data],
  );

  const proposalFor = useCallback(
    (p: FounderPacket): PacketProposal => edits[p.kind] ?? p.proposal,
    [edits],
  );

  const touch = useCallback((p: FounderPacket, next: PacketProposal) => {
    setEdits((e) => ({ ...e, [p.kind]: next }));
    setDirty((d) => ({ ...d, [p.kind]: true }));
  }, []);

  const decide = useCallback(async (p: FounderPacket, decision: 'approve' | 'rejected') => {
    setBusy(p.kind);
    setRefusals((r) => ({ ...r, [p.kind]: undefined }));
    try {
      let proposal = proposalFor(p);
      if (p.kind === 'perimeter_seed' && proposal.kind === 'perimeter_seed') {
        const rows = proposal.rows.filter(
          (row) => !excluded[`${row.jurisdiction}|${row.offerKey}`],
        );
        if (rows.length !== proposal.rows.length) {
          proposal = { kind: 'perimeter_seed', rows };
        }
      }
      const wire =
        decision === 'rejected'
          ? { decision: 'rejected', notes: notes[p.kind] ?? null }
          : {
              decision:
                dirty[p.kind] || (p.kind === 'perimeter_seed' && (proposal as { rows: readonly unknown[] }).rows.length !== (p.proposal as { rows: readonly unknown[] }).rows.length)
                  ? 'approved_with_edits'
                  : 'approved',
              proposal,
              notes: notes[p.kind] ?? null,
            };
      /* `request` stringifies `body` itself — passing a pre-stringified body double-encodes
         and the server's jsonBody() sees a JSON *string*, not an object. Caught by reading
         apiClient, not by the tests, whose mock happily parsed the single layer: a mocked
         boundary agrees with whichever side wrote it. */
      const res = await request<DecideEnvelope>(`/v1/gps/packets/${p.kind}/decide`, {
        method: 'POST',
        body: wire,
      });
      setData((d) => (d ? { ...d, decisions: res.data.decisions } : d));
      onApplied?.();
    } catch (err) {
      if (err instanceof ApiError) {
        const defects = Array.isArray((err.data as { defects?: string[] } | undefined)?.defects)
          ? ((err.data as { defects: string[] }).defects)
          : [];
        setRefusals((r) => ({
          ...r,
          [p.kind]: { code: err.code ?? 'ERROR', message: err.message, defects },
        }));
      } else {
        setRefusals((r) => ({ ...r, [p.kind]: { code: 'ERROR', message: String(err), defects: [] } }));
      }
    } finally {
      setBusy(null);
    }
  }, [dirty, excluded, notes, onApplied, proposalFor]);

  const ordered = useMemo(() => data?.packets ?? [], [data]);

  if (loadError !== null) {
    return (
      <Card>
        <CardHeader>Founder packets</CardHeader>
        <CardBody>
          <p className="text-sm text-status-blocked" data-testid="packets-load-error">{loadError}</p>
        </CardBody>
      </Card>
    );
  }
  if (data === null) return <p className="text-sm text-grey">Loading the founder packets…</p>;

  return (
    <div className="space-y-4" data-testid="founder-packets">
      <GpsMetaBanner of={[data]} className="mt-0" />
      {data.registerNotice !== null && (
        <p
          className={clsx(
            'border px-3 py-2 font-mono text-xs',
            data.registerPresent === null ? 'border-status-blocked text-status-blocked' : 'border-line text-grey-dark',
          )}
          data-testid="packets-register-notice"
        >
          {data.registerNotice}
        </p>
      )}

      {ordered.map((p) => {
        const d = decisionFor(p.kind);
        const proposal = proposalFor(p);
        const refusal = refusals[p.kind];
        return (
          <Card key={p.id}>
            <CardHeader className="flex items-center justify-between gap-2">
              <span>{p.title}</span>
              {d !== null ? (
                <Badge status={d.applyState === 'apply_failed' ? 'blocked' : 'ready'}>
                  {d.decision} · {d.applyState}
                </Badge>
              ) : (
                <Badge status="deferred">undecided</Badge>
              )}
            </CardHeader>
            <CardBody className="space-y-3">
              <p className="text-xs text-grey-dark">{p.consequence}</p>
              {p.remainingDependency !== null && (
                <p className="text-xs text-status-conditional" data-testid={`dependency-${p.kind}`}>
                  Still yours after approval: {p.remainingDependency}
                </p>
              )}

              {/* The evidence, grades and caveats beside the claims — D3 on a form. */}
              <details className="text-xs" data-testid={`evidence-${p.kind}`}>
                <summary className="cursor-pointer font-mono uppercase tracking-wider text-grey">
                  Evidence · {p.evidence.length} item(s), graded
                </summary>
                <ul className="mt-2 space-y-2">
                  {p.evidence.map((e, i) => (
                    <li key={i} className="border-l-2 border-line pl-2">
                      <Badge status={GRADE_STATUS[e.grade] ?? 'unverified'}>{e.grade}</Badge>{' '}
                      <span className="text-navy">{e.claim}</span>
                      <div className="text-grey">{e.basis}</div>
                      {e.caveat !== null && <div className="text-status-conditional">{e.caveat}</div>}
                    </li>
                  ))}
                </ul>
              </details>

              {/* THE PROPOSAL, editable where editing is the point. */}
              {proposal.kind === 'price_bands' && (
                <table className="w-full text-xs" data-testid="packet-bands">
                  <thead><tr className="border-b border-line text-left text-grey">
                    <th className="py-1">offer</th><th>low (¢)</th><th>mid (¢)</th><th>high (¢)</th><th>as dollars</th>
                  </tr></thead>
                  <tbody>
                    {proposal.rows.map((r, i) => (
                      <tr key={r.offerKey} className="border-b border-line/50">
                        <td className="py-1 font-mono">{r.offerKey}</td>
                        {(['lowCents', 'midCents', 'highCents'] as const).map((f) => (
                          <td key={f}>
                            <input
                              className="w-24 border border-control bg-transparent px-1 py-0.5 font-mono"
                              inputMode="numeric"
                              aria-label={`${r.offerKey} ${f}`}
                              value={String(r[f])}
                              onChange={(ev) => {
                                const next = clone(proposal);
                                (next.rows as unknown as { [k: string]: unknown }[])[i][f] = Number(ev.target.value);
                                touch(p, next);
                              }}
                            />
                          </td>
                        ))}
                        <td className="text-grey">{cents(r.lowCents)} / {cents(r.midCents)} / {cents(r.highCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {proposal.kind === 'effort_triples' && (
                <table className="w-full text-xs" data-testid="packet-triples">
                  <thead><tr className="border-b border-line text-left text-grey">
                    <th className="py-1">offer</th><th>optimistic</th><th>likely</th><th>pessimistic</th><th>waterfall (ai / qa / partner)</th>
                  </tr></thead>
                  <tbody>
                    {proposal.rows.map((r, i) => (
                      <tr key={r.offerKey} className="border-b border-line/50">
                        <td className="py-1 font-mono">{r.offerKey}</td>
                        {(['optimisticDays', 'likelyDays', 'pessimisticDays'] as const).map((f) => (
                          <td key={f}>
                            <input
                              className="w-16 border border-control bg-transparent px-1 py-0.5 font-mono"
                              inputMode="decimal"
                              aria-label={`${r.offerKey} ${f}`}
                              value={String(r[f])}
                              onChange={(ev) => {
                                const next = clone(proposal);
                                const rows = next.rows as unknown as Array<{ likelyDays: number; waterfall: { aiDraftDays: number; internalQaDays: number; partnerDays: number } } & { [k: string]: unknown }>;
                                rows[i][f] = Number(ev.target.value);
                                if (f === 'likelyDays') {
                                  /* The decomposition must BE the likely case (the validator refuses
                                     decoration), so an edited likely re-scales the waterfall
                                     proportionally rather than silently invalidating the packet. */
                                  const w = rows[i].waterfall;
                                  const sum = w.aiDraftDays + w.internalQaDays + w.partnerDays;
                                  const k = sum > 0 ? Number(ev.target.value) / sum : 0;
                                  rows[i].waterfall = {
                                    aiDraftDays: Math.round(w.aiDraftDays * k * 100) / 100,
                                    internalQaDays: Math.round(w.internalQaDays * k * 100) / 100,
                                    partnerDays: Math.round((Number(ev.target.value) - Math.round(w.aiDraftDays * k * 100) / 100 - Math.round(w.internalQaDays * k * 100) / 100) * 100) / 100,
                                  };
                                }
                                touch(p, next);
                              }}
                            />
                          </td>
                        ))}
                        <td className="font-mono text-grey">
                          {r.waterfall.aiDraftDays} / {r.waterfall.internalQaDays} / {r.waterfall.partnerDays}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {proposal.kind === 'rate_cards' && (
                <div data-testid="packet-ratecards">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-line text-left text-grey">
                      <th className="py-1">offer</th><th>partner class</th><th>unit</th><th>rate</th><th>units</th>
                    </tr></thead>
                    <tbody>
                      {proposal.rows.map((r) => (
                        <tr key={`${r.offerKey}-${r.partnerClass}`} className="border-b border-line/50">
                          <td className="py-1 font-mono">{r.offerKey}</td>
                          <td>{r.partnerClass}</td>
                          <td>{r.unit}</td>
                          <td>{cents(r.proposedRateCents)}</td>
                          <td>{r.expectedUnits}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-grey">{proposal.applyDeferredReason}</p>
                </div>
              )}

              {proposal.kind === 'perimeter_seed' && (
                <div className="overflow-x-auto" data-testid="packet-perimeter">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-line text-left text-grey">
                      <th className="py-1">include</th><th>jurisdiction</th><th>offer</th><th>class</th><th>note</th>
                    </tr></thead>
                    <tbody>
                      {(proposal.rows as readonly PerimeterSeedRow[]).map((r, i) => {
                        const key = `${r.jurisdiction}|${r.offerKey}`;
                        return (
                          <tr key={key} className={clsx('border-b border-line/50', excluded[key] && 'opacity-40')}>
                            <td className="py-1">
                              <input
                                type="checkbox"
                                aria-label={`include ${key}`}
                                checked={!excluded[key]}
                                onChange={() => setExcluded((x) => ({ ...x, [key]: !x[key] }))}
                              />
                            </td>
                            <td>{r.jurisdiction}</td>
                            <td className="font-mono">{r.offerKey}</td>
                            <td>
                              <Select
                                aria-label={`class ${key}`}
                                value={r.serviceClass}
                                onChange={(ev) => {
                                  const next = clone(proposal);
                                  (next.rows as PerimeterSeedRow[])[i] = {
                                    ...(next.rows as PerimeterSeedRow[])[i],
                                    serviceClass: ev.target.value as PerimeterSeedRow['serviceClass'],
                                  };
                                  touch(p, next);
                                }}
                                options={[
                                  { value: 'permitted', label: 'permitted' },
                                  { value: 'counsel_required', label: 'counsel_required' },
                                  { value: 'partner_required', label: 'partner_required' },
                                  { value: 'prohibited', label: 'prohibited' },
                                ]}
                              />
                            </td>
                            <td className="max-w-[26rem] text-grey">{r.note}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {proposal.kind === 'dpo_memo' && (
                <div data-testid="packet-dpo" className="space-y-2">
                  <details className="text-xs">
                    <summary className="cursor-pointer font-mono uppercase tracking-wider text-grey">
                      The memo, in full
                    </summary>
                    {/* Plain paragraphs — a drafted memo, never HTML from anywhere. */}
                    <div className="mt-2 space-y-2">
                      {proposal.memo.memoMarkdown.split('\n').map((line, i) =>
                        line.trim() === '' ? null : (
                          <p key={i} className={clsx('text-navy', line.startsWith('##') && 'font-bold uppercase tracking-wide')}>
                            {line.replace(/^#+\s*/, '').replace(/\*\*/g, '')}
                          </p>
                        ),
                      )}
                    </div>
                  </details>
                  <fieldset className="space-y-1 text-xs">
                    <legend className="font-mono uppercase tracking-wider text-grey">The decision</legend>
                    {proposal.memo.options.map((o) => (
                      <label key={o.id} className="flex items-start gap-2">
                        <input
                          type="radio"
                          name="dpo-option"
                          checked={proposal.memo.recommendedOptionId === o.id}
                          onChange={() => {
                            const next = clone(proposal);
                            next.memo = { ...next.memo, recommendedOptionId: o.id };
                            touch(p, next);
                          }}
                        />
                        <span>
                          <span className="font-bold text-navy">{o.label}</span>
                          <span className="block text-grey">{o.consequence}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                </div>
              )}

              {proposal.kind === 'pricing_policy' && (
                <div data-testid="packet-pricing" className="space-y-2 text-xs">
                  <div className="flex flex-wrap items-end gap-4">
                    {([
                      ['targetMarginPct', 'target margin at the median (fraction, e.g. 0.45)'],
                      ['pLossCeiling', 'loss-probability ceiling (fraction, e.g. 0.10)'],
                    ] as const).map(([f, label]) => (
                      <label key={f} className="flex flex-col gap-1">
                        <span className="font-mono uppercase tracking-wider text-grey">{label}</span>
                        <input
                          className="w-32 border border-control bg-transparent px-1 py-0.5 font-mono"
                          inputMode="decimal"
                          aria-label={`pricing ${f}`}
                          value={String(proposal.policy[f])}
                          onChange={(ev) => {
                            const next = clone(proposal);
                            next.policy = { ...next.policy, [f]: Number(ev.target.value) };
                            touch(p, next);
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  {/* The dials as consequences, not decoration: what each one buys. */}
                  <p className="text-grey">
                    Margin dial: the median outcome keeps at least{' '}
                    <span className="font-mono text-navy">{Math.round(proposal.policy.targetMarginPct * 100)}%</span> of the price.
                    Loss dial: at most{' '}
                    <span className="font-mono text-navy">{Math.round(proposal.policy.pLossCeiling * 100)}%</span> of simulated
                    outcomes may lose money — the issue guard blocks at 20% regardless, so this ceiling lives inside the veto.
                  </p>
                  <p className="text-grey-dark">{proposal.rationale}</p>
                </div>
              )}

              {/* The decision controls. The server owns authority; a 403 renders verbatim. */}
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <Button onClick={() => void decide(p, 'approve')} disabled={busy !== null}>
                  {busy === p.kind
                    ? 'Recording…'
                    : dirty[p.kind]
                      ? 'Approve with these edits'
                      : 'Approve as proposed'}
                </Button>
                <Button variant="secondary" onClick={() => void decide(p, 'rejected')} disabled={busy !== null}>
                  Reject
                </Button>
                <Input
                  aria-label={`notes ${p.kind}`}
                  placeholder="notes (optional, recorded with the decision)"
                  value={notes[p.kind] ?? ''}
                  onChange={(ev) => setNotes((n) => ({ ...n, [p.kind]: ev.target.value }))}
                  className="min-w-[16rem] flex-1"
                />
              </div>

              {d !== null && (
                <p className="text-xs text-grey" data-testid={`decision-${p.kind}`}>
                  {d.decidedBy} · {d.decidedAt.slice(0, 16).replace('T', ' ')} UTC — {d.applyDetail}
                  {d.notes ? ` · notes: ${d.notes}` : ''}
                </p>
              )}

              {refusal !== undefined && refusal !== null && (
                <div className="border border-status-blocked p-2 text-xs" role="alert" data-testid={`refusal-${p.kind}`}>
                  <p className="font-mono font-bold text-status-blocked">{refusal.code}</p>
                  <p className="text-navy">{refusal.message}</p>
                  {refusal.defects.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-grey-dark">
                      {refusal.defects.map((x, i) => <li key={i}>{x}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
