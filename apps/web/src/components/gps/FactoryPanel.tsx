import { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Badge, Button, Card, CardBody, CardHeader, Input } from '@/components/ui';
import { ApiError, request } from '@/lib/apiClient';

/**
 * G5, ON THE DESK — the waterfall's three stages on one panel, refusals first.
 *
 * The slot board is the panel's centre of gravity: every required input with its
 * filled/missing state, because THE GAP LIST IS THE CHASE LIST — an operator who
 * opens this panel should leave knowing exactly which sentences to put in front
 * of the client, and the generate button repeats that list when it refuses (D10).
 * Drafts render as stored, [FACT REQUIRED: …] markers and all; QA acceptance says
 * out loud whether the linked deliverable advanced through the review gate, and a
 * gate refusal is printed beside the acceptance rather than swallowed. Rework
 * demands its note. The handover packet is a read — printing it and carrying it
 * to a partner is the human's act, and there is no send button here either.
 */

interface SlotView { key: string; label: string; source: string; required: boolean; filled: boolean }

interface DraftView {
  id: number; deliverableId: string | null; version: number;
  status: 'draft' | 'accepted' | 'rework' | 'superseded';
  draftText: string; model: string; slotsFilled: number;
  generatedBy: string; generatedAt: string;
  decidedBy: string | null; decidedAt: string | null; decisionNote: string | null;
}

interface ActualView { id: number; stage: string; hours: number; costCents: number; note: string | null; recordedBy: string; recordedAt: string }

interface HandoverView {
  engagement: { clientName: string; offerKey: string; status: string; deadlineIso: string | null };
  facts: Array<{ label: string; value: string }>;
  latestAcceptedDraft: { version: number; decidedBy: string; decidedAt: string; draftText: string } | null;
  rateCardNote: string;
}

interface FactoryData {
  registerPresent: boolean | null;
  slotState: { gaps: SlotView[]; slots: SlotView[]; draftTitle: string; sections: string[] } | null;
  drafts: DraftView[];
  actuals: ActualView[];
  handover: HandoverView | null;
}

const DRAFT_TONE = { draft: 'conditional', accepted: 'ready', rework: 'blocked', superseded: 'deferred' } as const;

export function FactoryPanel({ engagementId }: { engagementId: string }) {
  const [data, setData] = useState<FactoryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [gaps, setGaps] = useState<Array<{ label: string }> | null>(null);
  const [reworkFor, setReworkFor] = useState<number | null>(null);
  const [reworkNote, setReworkNote] = useState('');
  const [actual, setActual] = useState({ stage: 'ai_draft', hours: '', note: '' });
  const [showHandover, setShowHandover] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await request<{ data: FactoryData }>(`/v1/gps/factory/engagements/${engagementId}`);
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code ?? 'ERROR'}: ${err.message}` : String(err));
    }
  }, [engagementId]);

  useEffect(() => { void load(); }, [load]);

  const act = useCallback(async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setActionError(null);
    setGaps(null);
    try {
      await fn();
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SLOTS_MISSING') {
        const d = (err.data ?? {}) as { gaps?: Array<{ label: string }> };
        setGaps(d.gaps ?? []);
      } else {
        setActionError(err instanceof ApiError ? `${err.code ?? 'ERROR'}: ${err.message}` : String(err));
      }
    } finally {
      setBusy(null);
    }
  }, [load]);

  const generate = () => act('generate', async () => {
    await request(`/v1/gps/factory/engagements/${engagementId}/draft`, { method: 'POST', body: {} });
  });

  const qa = (id: number, decision: 'accepted' | 'rework') => act(`qa-${id}`, async () => {
    await request(`/v1/gps/factory/drafts/${id}/qa`, {
      method: 'POST',
      body: decision === 'rework' ? { decision, note: reworkNote } : { decision },
    });
    setReworkFor(null);
    setReworkNote('');
  });

  const recordActual = () => act('actual', async () => {
    const hours = Number(actual.hours);
    await request(`/v1/gps/factory/engagements/${engagementId}/actuals`, {
      method: 'POST',
      body: { stage: actual.stage, hours, note: actual.note.trim() || undefined },
    });
    setActual({ stage: actual.stage, hours: '', note: '' });
  });

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <span>Delivery factory — AI drafts, one QA gate, honest gaps</span>
        <Button onClick={generate} disabled={busy !== null || data?.registerPresent !== true}>
          {busy === 'generate' ? 'Drafting…' : 'Generate draft'}
        </Button>
      </CardHeader>
      <CardBody className="space-y-3 text-xs">
        {error !== null && <p className="text-status-blocked" data-testid="factory-load-error">{error}</p>}
        {data !== null && (
          <>
            {data.registerPresent === false && (
              <p className="font-mono text-grey-dark" data-testid="factory-register-absent">
                The factory register does not exist on this environment yet — apply 0081_gps_factory.sql.
                The slot board below still reads; drafting refuses with the same sentence until then.
              </p>
            )}

            {data.slotState !== null && (
              <div data-testid="factory-slots">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-grey">
                  {data.slotState.draftTitle} — inputs {data.slotState.slots.filter((s) => s.filled).length}/{data.slotState.slots.length}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {data.slotState.slots.map((s) => (
                    <li key={s.key} className={clsx('flex items-start gap-1.5', !s.filled && s.required && 'text-status-blocked')} data-testid={`slot-${s.filled ? 'filled' : 'missing'}`}>
                      <span className="font-mono">{s.filled ? '●' : '○'}</span>
                      <span className={clsx(s.filled && 'text-grey-dark')}>
                        {s.label}
                        {!s.required && <span className="text-grey"> (optional)</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                {data.slotState.gaps.length > 0 && (
                  <p className="mt-1 text-status-blocked" data-testid="factory-chase-list">
                    {data.slotState.gaps.length} required input(s) unanswered — this list IS the chase list;
                    the portal form asks the client these exact sentences.
                  </p>
                )}
              </div>
            )}

            {gaps !== null && (
              <div className="border border-status-blocked/40 p-2" data-testid="factory-refusal">
                <p className="font-mono font-bold text-status-blocked">
                  The draft refused to run ahead of the client (D10). Missing:
                </p>
                <ul className="mt-1 space-y-0.5 text-grey-dark">
                  {gaps.map((g, i) => <li key={i}>· {g.label}</li>)}
                </ul>
              </div>
            )}
            {actionError !== null && (
              <p role="alert" className="font-mono text-status-blocked" data-testid="factory-action-error">{actionError}</p>
            )}

            {data.drafts.map((d) => (
              <div key={d.id} className={clsx('border border-line p-2', d.status === 'superseded' && 'opacity-50')} data-testid={`draft-${d.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-grey">
                    v{d.version} · via {d.model} · {d.slotsFilled} input(s) · by {d.generatedBy} {d.generatedAt.slice(0, 10)}
                  </span>
                  <Badge status={DRAFT_TONE[d.status]}>{d.status}</Badge>
                </div>
                {d.decidedBy !== null && (
                  <p className="mt-0.5 font-mono text-[11px] text-grey-dark">
                    {d.status} by {d.decidedBy}{d.decisionNote !== null ? ` — ${d.decisionNote}` : ''}
                  </p>
                )}
                <details className="mt-1">
                  <summary className="cursor-pointer font-mono text-[11px] text-grey">The draft, as stored</summary>
                  <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-navy" data-testid={`draft-text-${d.id}`}>
                    {d.draftText}
                  </pre>
                </details>
                {d.status === 'draft' && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Button onClick={() => void qa(d.id, 'accepted')} disabled={busy !== null}>
                      QA accept — marks the deliverable reviewed
                    </Button>
                    <Button variant="secondary" onClick={() => { setReworkFor(d.id); setReworkNote(''); }} disabled={busy !== null}>
                      Rework…
                    </Button>
                    {reworkFor === d.id && (
                      <span className="flex gap-1">
                        <Input
                          aria-label={`rework note ${d.id}`}
                          placeholder="what the next version must fix (required)"
                          value={reworkNote}
                          onChange={(e) => setReworkNote(e.target.value)}
                        />
                        <Button onClick={() => void qa(d.id, 'rework')} disabled={busy !== null || reworkNote.trim() === ''}>
                          Record rework
                        </Button>
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}

            <div className="flex flex-wrap items-end gap-2 border-t border-line pt-2">
              <label className="flex flex-col gap-0.5">
                <span className="font-mono text-[10px] uppercase tracking-wider text-grey">stage</span>
                <select
                  aria-label="actual stage"
                  className="border border-control bg-transparent px-1.5 py-1 font-mono text-[11px]"
                  value={actual.stage}
                  onChange={(e) => setActual((a) => ({ ...a, stage: e.target.value }))}
                >
                  <option value="ai_draft">ai_draft</option>
                  <option value="internal_qa">internal_qa</option>
                  <option value="partner">partner</option>
                </select>
              </label>
              <Input
                aria-label="actual hours"
                label="hours"
                inputMode="decimal"
                value={actual.hours}
                onChange={(e) => setActual((a) => ({ ...a, hours: e.target.value }))}
              />
              <Input
                aria-label="actual note"
                label="note (optional)"
                value={actual.note}
                onChange={(e) => setActual((a) => ({ ...a, note: e.target.value }))}
              />
              <Button
                variant="secondary"
                onClick={recordActual}
                disabled={busy !== null || actual.hours.trim() === '' || !Number.isFinite(Number(actual.hours))}
              >
                Record actual
              </Button>
              <p className="min-w-[12rem] flex-1 text-[10px] leading-snug text-grey">
                Hours per stage are the calibration loop's ground truth — the day rows exist here,
                G0's effort triples stop being estimates.
              </p>
            </div>
            {data.actuals.length > 0 && (
              <p className="font-mono text-[11px] text-grey-dark" data-testid="factory-actuals">
                {data.actuals.map((a) => `${a.stage}: ${a.hours}h`).join(' · ')}
              </p>
            )}

            {data.handover !== null && (
              <div className="border-t border-line pt-2">
                <button
                  onClick={() => setShowHandover((v) => !v)}
                  className="font-mono text-[10px] uppercase tracking-[0.18em] text-grey hover:text-navy"
                  data-testid="handover-toggle"
                >
                  Partner handover packet — composed from the register, carried by a human
                </button>
                {showHandover && (
                  <div className="mt-2 space-y-1.5 text-[11px]" data-testid="handover-packet">
                    <p className="text-navy">
                      {data.handover.engagement.clientName} · {data.handover.engagement.offerKey} ·
                      status {data.handover.engagement.status}
                      {data.handover.engagement.deadlineIso !== null && <> · next deadline {data.handover.engagement.deadlineIso.slice(0, 10)}</>}
                    </p>
                    {data.handover.facts.map((f) => (
                      <p key={f.label} className="text-grey-dark"><span className="font-semibold">{f.label}</span> — {f.value}</p>
                    ))}
                    {data.handover.latestAcceptedDraft !== null ? (
                      <p className="text-grey-dark">
                        Includes accepted draft v{data.handover.latestAcceptedDraft.version} (QA:
                        {' '}{data.handover.latestAcceptedDraft.decidedBy}, {data.handover.latestAcceptedDraft.decidedAt.slice(0, 10)}).
                      </p>
                    ) : (
                      <p className="text-status-conditional">No QA-accepted draft yet — a handover without one is a scope, not a package.</p>
                    )}
                    <p className="text-grey">{data.handover.rateCardNote}</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
