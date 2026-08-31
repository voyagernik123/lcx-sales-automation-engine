import { useCallback, useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Badge, Button, Card, CardBody, CardHeader, Input } from '@/components/ui';
import { ApiError, request } from '@/lib/apiClient';
import { attachMeta } from '@/lib/api/meta';
import { GpsMetaBanner } from '@/pages/GpsMetaBanner';
import type { DemandSource, TelegramParseReport } from '@lcx/shared';

/**
 * THE DEMAND QUEUE — G1's four channels, rendered above the curated watchlist they feed.
 *
 * Candidates are not targets. Every row here says where it came from, why it exists (the
 * reason cites its fields or its matched signal), and what grade its source earns — and
 * nothing leaves this queue except by a human's PROMOTE (through the same saveTarget the
 * watchlist uses) or REFUSE (reason required; the register's CHECK refuses a reasonless
 * refusal too). The queue automates supply; it never automates judgment.
 *
 * The Telegram import runs CLIENT-READS-FILE → POST JSON: the file never leaves as a file,
 * the server parses with the shared sieve, and the DROP-REPORT is rendered right here —
 * how many messages were seen, how many senders were dropped, how many snippets survived.
 * A minimisation the operator cannot inspect is a claim; this one is a table row.
 */

interface DemandRowView {
  id: number;
  source: DemandSource;
  projectName: string;
  url: string | null;
  jurisdiction: string | null;
  offerHypothesis: string;
  reason: string;
  snippet: string | null;
  provenanceGrade: 'B2' | 'B3' | 'C3';
  status: 'proposed' | 'promoted' | 'refused';
  refusalReason: string | null;
  promotedTargetId: string | null;
  createdAt: string;
}

interface QueueEnvelope {
  data: { candidates: DemandRowView[]; registerPresent: boolean | null };
  meta?: Record<string, unknown> | null;
}

const SOURCE_LABEL: Record<DemandSource, string> = {
  bd_crossfeed: 'BD crossfeed',
  inbound_intake: 'inbound',
  telegram_import: 'telegram',
  partner_referral: 'referral',
};

const GRADE_STATUS = { B2: 'ready', B3: 'conditional', C3: 'unverified' } as const;

export function GpsOriginationDemand({ onPromoted }: { onPromoted?: () => void }) {
  const [queue, setQueue] = useState<QueueEnvelope['data'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refuseFor, setRefuseFor] = useState<number | null>(null);
  const [refuseReason, setRefuseReason] = useState('');
  /**
   * The import report, AGGREGATED. One Telegram Desktop file can now be either a
   * single chat export or the full-account export ({ chats: { list: [...] } }) —
   * the browser splits the latter into per-group POSTs, so the server's 2MB gate
   * stays a real per-request ceiling and its single-chat contract never changed.
   * `personalChatsWithheld` counts chats filtered CLIENT-SIDE by type: a personal
   * chat that slipped into the export is dropped in the browser and never sent.
   */
  const [lastReport, setLastReport] = useState<(TelegramParseReport & {
    inserted: number; duplicates: number;
    groupsSent: number; personalChatsWithheld: number; failedGroups: string[];
  }) | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await request<QueueEnvelope>('/v1/gps/demand');
      setQueue(attachMeta(res.data, res.meta ?? null));
      setError(null);
    } catch (err) {
      setQueue(null);
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

  const runCrossfeed = () => act('crossfeed', async () => {
    await request('/v1/gps/demand/crossfeed/run', { method: 'POST', body: {} });
  });

  const importTelegram = (file: File) => act('telegram', async () => {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ApiError('This file is not JSON — export from Telegram Desktop (Settings → Advanced → Export) and choose JSON format.', 400, 'VALIDATION');
    }

    /* ── ONE FILE, ANY SHAPE ─────────────────────────────────────────────────
       Single-chat export: { name, messages }. Full-account export ("Export
       Telegram Data"): { chats: { list: [{ name, type, messages }] } }. The
       full shape is split HERE, in the browser: groups and channels go to the
       server one POST each; personal chats and saved messages are withheld
       client-side by their own `type` and never leave this machine. */
    const root = (parsed ?? {}) as Record<string, unknown>;
    const chatList = (root.chats as { list?: unknown } | undefined)?.list;
    let personalChatsWithheld = 0;
    let chats: Array<{ name: string; messages: unknown[] }>;
    if (Array.isArray(chatList)) {
      chats = [];
      for (const c of chatList) {
        const chat = (c ?? {}) as Record<string, unknown>;
        const kind = typeof chat.type === 'string' ? chat.type : '';
        if (!/group|channel/i.test(kind)) { personalChatsWithheld += 1; continue; }
        chats.push({
          name: typeof chat.name === 'string' ? chat.name : '(unnamed group)',
          messages: Array.isArray(chat.messages) ? chat.messages : [],
        });
      }
      if (chats.length === 0 && personalChatsWithheld === 0) {
        throw new ApiError('This export contains no chats. Re-export from Telegram Desktop with groups/channels ticked and JSON format.', 400, 'VALIDATION');
      }
    } else if (Array.isArray(root.messages)) {
      chats = [{ name: typeof root.name === 'string' ? root.name : '(unnamed group)', messages: root.messages }];
    } else {
      throw new ApiError('This JSON is not a Telegram export — expected { name, messages } (one chat) or { chats: { list } } (full export).', 400, 'VALIDATION');
    }

    /* The server refuses requests over 2MB by declared size, and that ceiling is
       right — so a large group is split into batches that each stay under it.
       Replays are safe: the candidate key is (source, source_ref), so a message
       that lands twice is a reported duplicate, never a doubled queue. */
    const CHUNK_BYTES = 1_800_000;
    const totals = {
      chatName: null as string | null, messagesSeen: 0, messagesMatched: 0,
      sendersSeenAndDropped: 0, snippetsKept: 0, unparseableEntries: 0,
      partnerRoomsMatched: 0,
      inserted: 0, duplicates: 0,
    };
    let groupsSent = 0;
    const failedGroups: string[] = [];
    for (const chat of chats) {
      const batches: unknown[][] = [];
      let batch: unknown[] = [];
      let size = 200 + chat.name.length;
      for (const m of chat.messages) {
        const mSize = JSON.stringify(m ?? null).length + 1;
        if (size + mSize > CHUNK_BYTES && batch.length > 0) { batches.push(batch); batch = []; size = 200 + chat.name.length; }
        batch.push(m);
        size += mSize;
      }
      batches.push(batch); // an empty group still reports itself: 0 seen is a fact
      try {
        for (const msgs of batches) {
          const res = await request<{ data: { inserted: number; duplicates: number; report: TelegramParseReport } }>(
            '/v1/gps/demand/telegram',
            { method: 'POST', body: { name: chat.name, messages: msgs } },
          );
          const d = res.data;
          totals.inserted += d.inserted;
          totals.duplicates += d.duplicates;
          totals.messagesSeen += d.report.messagesSeen;
          totals.messagesMatched += d.report.messagesMatched;
          totals.sendersSeenAndDropped += d.report.sendersSeenAndDropped;
          totals.snippetsKept += d.report.snippetsKept;
          totals.unparseableEntries += d.report.unparseableEntries;
          // ?? 0 survives a deploy skew where the API predates the partner-room rule.
          totals.partnerRoomsMatched += d.report.partnerRoomsMatched ?? 0;
        }
        groupsSent += 1;
      } catch {
        /* One group failing must not eat the rest of the import: the failure is
           NAMED in the report, the loop continues, and re-importing the same
           file later dedupes everything that already landed. */
        failedGroups.push(chat.name);
      }
    }
    totals.chatName = chats.length === 1 ? chats[0].name : `${groupsSent} group(s)`;
    setLastReport({ ...totals, groupsSent, personalChatsWithheld, failedGroups });
  });

  const promote = (id: number) => act(`promote-${id}`, async () => {
    await request(`/v1/gps/demand/${id}/promote`, { method: 'POST', body: {} });
    onPromoted?.();
  });

  const refuse = (id: number) => act(`refuse-${id}`, async () => {
    await request(`/v1/gps/demand/${id}/refuse`, { method: 'POST', body: { reason: refuseReason } });
    setRefuseFor(null);
    setRefuseReason('');
  });

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <span>Demand queue — candidates await judgment, never skip it</span>
        <span className="flex gap-2">
          <Button variant="secondary" onClick={runCrossfeed} disabled={busy !== null}>
            {busy === 'crossfeed' ? 'Scanning…' : 'Run BD crossfeed'}
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
            {busy === 'telegram' ? 'Importing…' : 'Import Telegram export'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="telegram export file"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void importTelegram(f); e.target.value = ''; }}
          />
        </span>
      </CardHeader>
      <CardBody className="space-y-3">
        {error !== null && <p className="text-sm text-status-blocked" data-testid="demand-load-error">{error}</p>}
        {queue !== null && (
          <>
            <GpsMetaBanner of={[queue]} className="mt-0" />
            {queue.registerPresent === false && (
              <p className="font-mono text-xs text-grey-dark" data-testid="demand-register-absent">
                The demand register does not exist on this environment yet — apply 0077_gps_demand.sql.
                Every channel below will refuse writes until then, with the same sentence.
              </p>
            )}
            {queue.registerPresent === null && (
              <p className="font-mono text-xs text-status-blocked">
                The register could not be probed — candidates may exist that are not shown. Retry.
              </p>
            )}

            {lastReport !== null && (
              <div className="border border-line p-2 font-mono text-xs" data-testid="telegram-report">
                <p className="font-bold uppercase tracking-wider text-grey">Telegram import — the sieve’s account of itself</p>
                <p className="mt-1 text-navy">
                  {lastReport.messagesSeen} message(s) seen · {lastReport.messagesMatched} matched ·{' '}
                  {lastReport.inserted} new candidate(s) · {lastReport.duplicates} duplicate(s) skipped
                </p>
                <p className="text-grey-dark">
                  Dropped, by design: {lastReport.sendersSeenAndDropped} sender identit(ies) — none stored —
                  and every unmatched message in full. {lastReport.snippetsKept} snippet(s) of ≤200 chars kept.
                  {lastReport.unparseableEntries > 0 ? ` ${lastReport.unparseableEntries} entr(ies) were unparseable.` : ''}
                </p>
                {lastReport.groupsSent > 1 && (
                  <p className="text-grey-dark" data-testid="telegram-groups-line">
                    Across {lastReport.groupsSent} group(s)/channel(s) from one export file.
                  </p>
                )}
                {lastReport.partnerRoomsMatched > 0 && (
                  <p className="text-grey-dark" data-testid="telegram-partner-rooms">
                    {lastReport.partnerRoomsMatched} partner room(s) matched by their OWN NAME — rooms whose
                    messages never put a ticker beside a signal word, kept as one candidate per room.
                  </p>
                )}
                {lastReport.personalChatsWithheld > 0 && (
                  <p className="text-grey-dark" data-testid="telegram-personal-withheld">
                    {lastReport.personalChatsWithheld} personal chat(s) were withheld IN THIS BROWSER by their
                    own type — never sent to the server at all.
                  </p>
                )}
                {lastReport.failedGroups.length > 0 && (
                  <p className="text-status-blocked" data-testid="telegram-failed-groups">
                    {lastReport.failedGroups.length} group(s) FAILED and were skipped: {lastReport.failedGroups.join(', ')}.
                    Re-import the same file after fixing — everything already landed dedupes.
                  </p>
                )}
              </div>
            )}

            {actionError !== null && (
              <p role="alert" className="font-mono text-xs text-status-blocked" data-testid="demand-action-error">{actionError}</p>
            )}

            {queue.candidates.length === 0 ? (
              <p className="text-xs text-grey" data-testid="demand-empty">
                The queue is empty. That is a statement about the queue, not about demand:
                run the crossfeed, import an export, or wait on the public intake.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-line text-left font-mono uppercase tracking-wider text-grey">
                      <th className="py-1 pr-2">source</th>
                      <th className="pr-2">project</th>
                      <th className="pr-2">hypothesis</th>
                      <th className="pr-2">why it is here</th>
                      <th className="pr-2">grade</th>
                      <th className="pr-2">status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {queue.candidates.map((c) => (
                      <tr key={c.id} className={clsx('border-b border-line/50 align-top', c.status !== 'proposed' && 'opacity-60')}>
                        <td className="py-1.5 pr-2 font-mono">{SOURCE_LABEL[c.source]}</td>
                        <td className="pr-2">
                          <span className="font-bold text-navy">{c.projectName}</span>
                          {c.url !== null && <span className="block text-grey">{c.url}</span>}
                          {c.jurisdiction !== null && <span className="block text-grey">{c.jurisdiction}</span>}
                        </td>
                        <td className="pr-2 font-mono">{c.offerHypothesis}</td>
                        <td className="max-w-[24rem] pr-2 text-grey-dark">
                          {c.reason}
                          {c.snippet !== null && <span className="mt-0.5 block border-l-2 border-line pl-1 text-grey">“{c.snippet}”</span>}
                          {c.status === 'refused' && c.refusalReason !== null && (
                            <span className="mt-0.5 block text-status-blocked">refused: {c.refusalReason}</span>
                          )}
                          {c.status === 'promoted' && c.promotedTargetId !== null && (
                            <span className="mt-0.5 block text-grey">→ target {c.promotedTargetId.slice(0, 8)}…</span>
                          )}
                        </td>
                        <td className="pr-2"><Badge status={GRADE_STATUS[c.provenanceGrade]}>{c.provenanceGrade}</Badge></td>
                        <td className="pr-2 font-mono">{c.status}</td>
                        <td className="whitespace-nowrap">
                          {c.status === 'proposed' && (
                            <span className="flex gap-1">
                              <Button onClick={() => void promote(c.id)} disabled={busy !== null}>Promote</Button>
                              <Button variant="secondary" onClick={() => { setRefuseFor(c.id); setRefuseReason(''); }} disabled={busy !== null}>
                                Refuse…
                              </Button>
                            </span>
                          )}
                          {refuseFor === c.id && (
                            <span className="mt-1 flex gap-1">
                              <Input
                                aria-label={`refusal reason ${c.id}`}
                                placeholder="why (required, recorded)"
                                value={refuseReason}
                                onChange={(e) => setRefuseReason(e.target.value)}
                              />
                              <Button onClick={() => void refuse(c.id)} disabled={busy !== null || refuseReason.trim() === ''}>
                                Record refusal
                              </Button>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
