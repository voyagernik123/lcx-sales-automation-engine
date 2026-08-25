import { useCallback, useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Badge, Button, Input, InspectorDrawer } from '@/components/ui';
import { ApiError, request } from '@/lib/apiClient';
import { attachMeta } from '@/lib/api/meta';
import { GpsMetaBanner } from '@/pages/GpsMetaBanner';
import { OUTREACH_CHANNELS, type OutreachChannel } from '@lcx/shared';
import { DossierSheet } from '@/components/gps/GpsPrintSheets';

/**
 * G2 — THE DOSSIER DRAWER: the model's research, wearing its provenance on every line.
 *
 * What this surface promises its reader:
 *
 *  · A dossier renders AS STORED — the [F#] citations visible, the C3 caveat section
 *    visible, the citation count printed. The whole point of the cite-or-refuse
 *    contract is that the reader can check a claim; hiding the refs would re-launder
 *    the essay the validator exists to refuse.
 *  · A failed generation shows the DEFECT LIST and the rejected text. "It failed"
 *    with no evidence teaches the operator nothing; the bill of defects is what
 *    makes regenerate a decision rather than a slot machine.
 *  · Acceptance is a button with a name behind it; rejection demands a typed reason
 *    before it arms — the same shape the demand queue's refusal uses.
 *  · Outreach drafts render WITH the outbound gate's verdict, and there is no send
 *    button. Not "disabled": absent. The sentence under the draft says sending is a
 *    human act outside this system, which is the one-mouth rule said out loud.
 */

interface DossierView {
  id: number;
  targetId: string;
  offerKey: string;
  status: 'draft' | 'accepted' | 'rejected';
  dossierMd: string;
  model: string;
  factRefsCited: number;
  generatedBy: string;
  generatedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

interface OutreachDraftView {
  id: number;
  targetId: string;
  dossierId: number | null;
  channel: OutreachChannel;
  draftText: string;
  model: string;
  gateAllowed: boolean;
  gateDisposition: string;
  gateRefusalCodes: string;
  gateReference: string;
  createdBy: string;
  createdAt: string;
}

interface DossierEnvelope {
  data: { dossiers: DossierView[]; outreachDrafts: OutreachDraftView[]; registerPresent: boolean | null };
  meta?: Record<string, unknown> | null;
}

interface RejectedGeneration {
  what: 'dossier' | 'outreach';
  code: string;
  message: string;
  defects: Array<{ code: string; detail: string }>;
  rejectedText: string | null;
}

const STATUS_TONE = { draft: 'conditional', accepted: 'ready', rejected: 'blocked' } as const;

export function GpsTargetDossierDrawer({ targetId, onClose }: { targetId: string | null; onClose: () => void }) {
  const [queue, setQueue] = useState<DossierEnvelope['data'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<RejectedGeneration | null>(null);
  const [rejectFor, setRejectFor] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [channel, setChannel] = useState<OutreachChannel>('email');
  /* Which dossier is open as a printable sheet. One at a time: an artefact is a
     document, and two on screen is neither. */
  const [sheetFor, setSheetFor] = useState<number | null>(null);
  const readAt = useRef<string>();
  readAt.current ??= new Date().toISOString();

  const load = useCallback(async (id: string) => {
    try {
      const res = await request<DossierEnvelope>(`/v1/gps/dossiers?targetId=${encodeURIComponent(id)}`);
      setQueue(attachMeta(res.data, res.meta ?? null));
      setError(null);
    } catch (err) {
      setQueue(null);
      setError(err instanceof ApiError ? `${err.code ?? 'ERROR'}: ${err.message}` : String(err));
    }
  }, []);

  useEffect(() => {
    setQueue(null); setError(null); setActionError(null); setRejected(null);
    setRejectFor(null); setRejectNote('');
    if (targetId !== null) void load(targetId);
  }, [targetId, load]);

  const act = useCallback(async (label: string, fn: () => Promise<void>) => {
    if (targetId === null) return;
    setBusy(label);
    setActionError(null);
    setRejected(null);
    try {
      await fn();
      await load(targetId);
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'DOSSIER_INVALID' || err.code === 'OUTREACH_INVALID')) {
        const d = (err.data ?? {}) as { defects?: Array<{ code: string; detail: string }>; rejectedText?: string };
        setRejected({
          what: err.code === 'DOSSIER_INVALID' ? 'dossier' : 'outreach',
          code: err.code,
          message: err.message,
          defects: d.defects ?? [],
          rejectedText: typeof d.rejectedText === 'string' ? d.rejectedText : null,
        });
      } else {
        setActionError(err instanceof ApiError ? `${err.code ?? 'ERROR'}: ${err.message}` : String(err));
      }
    } finally {
      setBusy(null);
    }
  }, [targetId, load]);

  const generate = () => act('generate', async () => {
    await request('/v1/gps/dossiers/generate', { method: 'POST', body: { targetId } });
  });

  const decide = (id: number, decision: 'accepted' | 'rejected') => act(`decide-${id}`, async () => {
    await request(`/v1/gps/dossiers/${id}/decide`, {
      method: 'POST',
      body: decision === 'rejected' ? { decision, note: rejectNote } : { decision },
    });
    setRejectFor(null);
    setRejectNote('');
  });

  const draftOutreach = () => act('outreach', async () => {
    await request('/v1/gps/dossiers/outreach', { method: 'POST', body: { targetId, channel } });
  });

  if (targetId === null) return null;

  return (
    <InspectorDrawer isOpen onClose={onClose} title="Dossier & outreach">
      <div className="space-y-4 text-sm" data-testid="dossier-drawer">
        {error !== null && <p className="text-sm text-status-blocked" data-testid="dossier-load-error">{error}</p>}
        {queue !== null && (
          <>
            <GpsMetaBanner of={[queue]} className="mt-0" />
            {queue.registerPresent === false && (
              <p className="font-mono text-xs text-grey-dark" data-testid="dossier-register-absent">
                The dossier register does not exist on this environment yet — apply 0078_gps_dossier.sql.
                Generation and outreach drafting will refuse with the same sentence until then.
              </p>
            )}
            {queue.registerPresent === null && (
              <p className="font-mono text-xs text-status-blocked">
                The register could not be probed — dossiers may exist that are not shown. Retry.
              </p>
            )}

            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-micro uppercase tracking-wider text-grey">
                Research dossiers — cited or refused, never in between
              </span>
              <Button onClick={generate} disabled={busy !== null || queue.registerPresent !== true}>
                {busy === 'generate' ? 'Generating…' : 'Generate dossier'}
              </Button>
            </div>

            {actionError !== null && (
              <p role="alert" className="font-mono text-xs text-status-blocked" data-testid="dossier-action-error">{actionError}</p>
            )}

            {rejected !== null && (
              <div className="border border-status-blocked/40 p-2" data-testid="generation-rejected">
                <p className="font-mono text-xs font-bold text-status-blocked">
                  {rejected.code}: the {rejected.what === 'dossier' ? 'model response failed the citation contract' : 'draft failed pre-flight'} — nothing was stored.
                </p>
                <ul className="mt-1 space-y-0.5 font-mono text-micro text-grey-dark">
                  {rejected.defects.map((d, i) => (
                    <li key={i} data-testid="generation-defect">
                      <span className="font-bold">{d.code}</span> — {d.detail}
                    </li>
                  ))}
                </ul>
                {rejected.rejectedText !== null && (
                  <details className="mt-1">
                    <summary className="cursor-pointer font-mono text-micro text-grey">The rejected text, as evidence</summary>
                    <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap border border-line p-2 text-micro text-grey-dark">{rejected.rejectedText}</pre>
                  </details>
                )}
              </div>
            )}

            {queue.dossiers.length === 0 ? (
              <p className="text-xs text-grey" data-testid="dossier-empty">
                No dossier yet. Generation hands the model the register's numbered facts and refuses any
                response whose claims do not cite them.
              </p>
            ) : (
              queue.dossiers.map((d) => (
                <div key={d.id} className={clsx('border border-line p-2', d.status === 'rejected' && 'opacity-60')} data-testid={`dossier-${d.id}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-micro text-grey">
                      #{d.id} · {d.offerKey} · via {d.model} · cites {d.factRefsCited} register fact(s) ·
                      by {d.generatedBy} {new Date(d.generatedAt).toISOString().slice(0, 10)}
                    </span>
                    <Badge status={STATUS_TONE[d.status]}>{d.status}</Badge>
                  </div>
                  {d.status !== 'draft' && (
                    <p className="mt-0.5 font-mono text-micro text-grey-dark">
                      {d.status} by {d.decidedBy}{d.decisionNote !== null ? ` — ${d.decisionNote}` : ''}
                    </p>
                  )}
                  <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-navy" data-testid={`dossier-text-${d.id}`}>
                    {d.dossierMd}
                  </pre>
                  <button
                    onClick={() => setSheetFor(sheetFor === d.id ? null : d.id)}
                    data-testid={`dossier-print-toggle-${d.id}`}
                    className="mt-1 font-mono text-micro text-grey underline hover:text-navy"
                  >
                    {sheetFor === d.id ? 'Close the sheet' : 'Open as a printable sheet'}
                  </button>
                  {sheetFor === d.id && (
                    <div className="mt-2 border-t border-line pt-2">
                      <DossierSheet
                        asOf={readAt.current!}
                        sources={[queue]}
                        dossier={{
                          id: d.id,
                          targetName: d.targetId,
                          offerKey: d.offerKey,
                          status: d.status,
                          dossierMd: d.dossierMd,
                          model: d.model,
                          factRefsCited: d.factRefsCited,
                          generatedBy: d.generatedBy,
                          generatedAt: d.generatedAt,
                          decidedBy: d.decidedBy,
                          decidedAt: d.decidedAt,
                          decisionNote: d.decisionNote,
                        }}
                      />
                    </div>
                  )}
                  {d.status === 'draft' && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Button onClick={() => void decide(d.id, 'accepted')} disabled={busy !== null}>
                        Accept — my name goes on it
                      </Button>
                      <Button variant="secondary" onClick={() => { setRejectFor(d.id); setRejectNote(''); }} disabled={busy !== null}>
                        Reject…
                      </Button>
                      {rejectFor === d.id && (
                        <span className="flex gap-1">
                          <Input
                            aria-label={`rejection note ${d.id}`}
                            placeholder="why (required, recorded)"
                            value={rejectNote}
                            onChange={(e) => setRejectNote(e.target.value)}
                          />
                          <Button onClick={() => void decide(d.id, 'rejected')} disabled={busy !== null || rejectNote.trim() === ''}>
                            Record rejection
                          </Button>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}

            <div className="border-t border-line pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-micro uppercase tracking-wider text-grey">
                  Outreach drafts — judged by the outbound gate, sent by nobody here
                </span>
                <span className="flex items-center gap-1.5">
                  <select
                    aria-label="outreach channel"
                    className="border border-control bg-transparent px-1.5 py-1 font-mono text-micro"
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as OutreachChannel)}
                  >
                    {OUTREACH_CHANNELS.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
                  </select>
                  <Button variant="secondary" onClick={draftOutreach} disabled={busy !== null || queue.registerPresent !== true}>
                    {busy === 'outreach' ? 'Drafting…' : 'Draft outreach'}
                  </Button>
                </span>
              </div>

              {queue.outreachDrafts.length === 0 ? (
                <p className="mt-2 text-xs text-grey" data-testid="outreach-empty">
                  No drafts. Each one is judged by the same marketing gate every public word answers to,
                  and its verdict is stored beside it.
                </p>
              ) : (
                queue.outreachDrafts.map((o) => (
                  <div key={o.id} className="mt-2 border border-line p-2" data-testid={`outreach-${o.id}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-micro text-grey">
                        #{o.id} · {o.channel} · via {o.model} · by {o.createdBy} {new Date(o.createdAt).toISOString().slice(0, 10)}
                      </span>
                      <Badge status={o.gateAllowed ? 'ready' : 'blocked'}>
                        {o.gateAllowed ? 'gate: cleared' : 'gate: refused'}
                      </Badge>
                    </div>
                    <pre className="mt-1.5 whitespace-pre-wrap font-sans text-xs leading-relaxed text-navy" data-testid={`outreach-text-${o.id}`}>
                      {o.draftText}
                    </pre>
                    <p className="mt-1 font-mono text-micro text-grey-dark" data-testid={`outreach-verdict-${o.id}`}>
                      disposition {o.gateDisposition || '—'}
                      {o.gateRefusalCodes !== '' && <> · refusals: {o.gateRefusalCodes}</>}
                      {o.gateReference !== '' && <> · ref {o.gateReference} (quote this to an approver)</>}
                    </p>
                  </div>
                ))
              )}

              <p className="mt-2 text-micro leading-relaxed text-grey" data-testid="one-mouth-note">
                There is no send button here, deliberately. A cleared draft is carried by a human, through
                the channel they own, under their name — this system drafts and judges; it does not speak.
              </p>
            </div>
          </>
        )}
      </div>
    </InspectorDrawer>
  );
}
