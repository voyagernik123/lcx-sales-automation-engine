import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { FileUp, Trash2, Download, Lock, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '@/components/ui';
import { responseMeta } from '@/lib/api/meta';
/*
 * `artifactIntakeApi`, not `artifactIntake` — and the name is a bug fix, not taste.
 * macOS is case-INSENSITIVE, so a fetcher module called `artifactIntake.ts` beside a
 * component called `ArtifactIntake.tsx` makes `@/components/gps/ArtifactIntake`
 * resolve to whichever the resolver reaches first. It reached the fetcher, the named
 * export was `undefined`, and React rendered "Element type is invalid" from a page
 * whose import looked correct — a failure that would have appeared on macOS and
 * vanished on the Linux CI box, or the reverse.
 */
import {
  discard, listStored, retrieve, store,
  type ArtifactLimits, type GpsArtifact,
} from './artifactIntakeApi';
import {
  STORAGE_NOT_ON_THIS_ENVIRONMENT, bytes, refusalSentence, type RefusalSentence,
} from './artifactRefusal';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  CLIENT DOCUMENTS — the intake surface on the delivery desk
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * D2 is answered (yes, 2026-08-02), so this exists. It is built to the delivery desk's
 * own tone rather than as a widget dropped on top of it: tabular, monospace micro
 * type, hairline dividers, no cards, refusals as sentences with the mechanism beside
 * them. Nothing here is a drop zone with a cloud icon.
 *
 * FOUR THINGS IT REFUSES TO DO:
 *
 *  · IT NEVER RENDERS A DOCUMENT'S CONTENTS. No thumbnail, no preview pane, no
 *    `<iframe>`, no object URL held past the tick it is used in. Storing a client's
 *    confidential material is now permitted; rendering it inline in an authenticated
 *    session, next to other clients' names, was never the thing that was asked for.
 *  · IT NEVER CLAIMS A FILE IS STORED BECAUSE THE BYTES WERE SENT. The bar reports
 *    bytes handed to the socket. Between 100% and the server's answer sit the size,
 *    type and byte-sniff checks, and the surface says so — otherwise the operator
 *    closes the panel on a full bar and never reads the refusal.
 *  · IT NEVER SHOWS AN EMPTY LIST AS "NOTHING WAS RECEIVED". An empty list means no
 *    row is stored here, which is a different claim.
 *  · IT NEVER IMPLIES PER-PERSON ATTRIBUTION. `uploadedBy` is the desk, because the
 *    passcode is shared (`GPS_IMPLEMENTATION_PLAN.md` §1.5). The row is a real dated
 *    record of what arrived; it is not proof of who sent it.
 */

function Th({ children, align = 'left', className }: { children?: ReactNode; align?: 'left' | 'right'; className?: string }) {
  return (
    <th
      scope="col"
      className={clsx('border-b border-line px-2 py-1 text-micro font-bold uppercase tracking-wider text-grey',
        align === 'right' ? 'text-right' : 'text-left', className)}
    >
      {children}
    </th>
  );
}

function Td({ children, align = 'left', className }: { children?: ReactNode; align?: 'left' | 'right'; className?: string }) {
  return (
    <td className={clsx('px-2 py-1 align-top text-micro', align === 'right' ? 'text-right' : 'text-left', className)}>
      {children}
    </td>
  );
}

/** A refusal, as two sentences and a code. Tone matches `Statement tone="refusal"`. */
function Refused({ r }: { r: RefusalSentence }) {
  return (
    <div
      role="note"
      data-testid="gps-artifact-refusal"
      className="border-l-2 border-status-blocked/50 bg-status-blocked-bg px-2 py-1.5 text-status-blocked"
    >
      <p className="text-micro font-semibold leading-snug">{r.headline}</p>
      <p className="mt-1 text-micro leading-snug text-grey">{r.next}</p>
      {/* The API's own wording, kept verbatim beside the house sentence: it holds the
          specifics ("declared application/pdf but the leading bytes are not
          application/pdf") that no sentence written in advance could contain. */}
      {(r.apiSaid || r.code) && (
        <p className="mt-1 font-mono text-[10px] leading-snug text-grey">
          {r.apiSaid && <><span className="font-bold uppercase">API said · </span>{r.apiSaid}</>}
          {r.apiSaid && r.code && ' · '}
          {r.code}
        </p>
      )}
    </div>
  );
}

/**
 * A narrowing, not a cast. `meta` is `Record<string, unknown>` by construction, so
 * `meta.limits as ArtifactLimits` would be this screen ASSERTING the server's shape —
 * the exact move that shipped a page built on a payload nobody served
 * (`lib/api/gps.ts:88`). The two fields the surface actually renders are checked, and
 * anything else falls back to the sentence that says the limits are not known here.
 */
function isLimits(v: unknown): v is ArtifactLimits {
  if (typeof v !== 'object' || v === null) return false;
  const l = v as Partial<ArtifactLimits>;
  return typeof l.maxBytes === 'number' && Array.isArray(l.allowedMimeTypes);
}

interface Sending {
  file: File;
  sent: number;
  total: number;
  pct: number | null;
  /** True once every byte is out and the server has not answered. */
  awaitingVerdict: boolean;
}

export function ArtifactIntake({ engagementId }: { engagementId: string }) {
  const [rows, setRows] = useState<GpsArtifact[] | null>(null);
  /**
   * The ceiling, the allowlist and the retention period, as the SERVER states them on
   * every list read (`routes/gpsArtifact.ts:186`). Held rather than hardcoded: a second
   * copy of "25 MB" in this file is a number that will one day disagree with the
   * server's and be confidently wrong on a screen an operator is trusting.
   */
  const [limits, setLimits] = useState<ArtifactLimits | null>(null);
  const [listError, setListError] = useState<RefusalSentence | null>(null);
  const [sending, setSending] = useState<Sending | null>(null);
  const [refusal, setRefusal] = useState<RefusalSentence | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setListError(null);
    listStored(engagementId)
      .then((r) => {
        setRows(r);
        const meta = responseMeta(r);
        setLimits(isLimits(meta?.limits) ? meta.limits : null);
        /*
         * `migrated: false` DOES NOT THROW — the read answers `[]` and declares itself
         * in the envelope (`lib/api/meta.ts`). Read here rather than left to the page's
         * `GpsMetaBanner`, because the generic sentence ("the tables behind this read do
         * not exist") is about a different migration than the one the delivery read is
         * describing, and the operator's question at this moment is specifically "is my
         * document stored". Silence here would render an unmigrated environment as an
         * engagement nobody sent anything to.
         */
        setListError(responseMeta(r)?.migrated === false ? STORAGE_NOT_ON_THIS_ENVIRONMENT : null);
      })
      .catch((e: unknown) => { setRows(null); setListError(refusalSentence(e)); });
  }, [engagementId]);

  useEffect(() => { load(); }, [load]);

  const send = async (file: File) => {
    setRefusal(null);
    setNote(null);
    setSending({ file, sent: 0, total: file.size, pct: 0, awaitingVerdict: false });
    try {
      const saved = await store({
        engagementId,
        file,
        onProgress: (p) => setSending({
          file, sent: p.sent, total: p.total, pct: p.pct,
          awaitingVerdict: p.total > 0 && p.sent >= p.total,
        }),
      });
      /*
       * A DEDUPLICATED UPLOAD IS NOT A STORE, and saying "stored" for both is how a
       * desk comes to believe it holds two copies. 0057's (client_id, sha256) index
       * answers 200 with the row that already existed (routes/gpsArtifact.ts:158);
       * the honest sentence names the row it matched and when that one arrived.
       */
      setNote(saved.deduplicated
        ? `Nothing new was stored: these exact bytes are already on file for this client as ${saved.artifact.filename}, recorded ${saved.artifact.uploadedAt}. The list below is unchanged.`
        : `${saved.artifact.filename} stored — ${bytes(saved.artifact.byteSize)}, recorded against this engagement at ${saved.artifact.uploadedAt}. Retained until ${saved.artifact.retentionUntil.slice(0, 10)}.`);
      load();
    } catch (e) {
      setRefusal(refusalSentence(e, { name: file.name, size: file.size }));
    } finally {
      setSending(null);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async (a: GpsArtifact) => {
    setRefusal(null);
    setConfirming(null);
    try {
      const gone = await discard(a.id);
      /*
       * DELETED IS NOT ERASED, and the difference is the whole of a client's erasure
       * right. 0057 separates `deleted_at` ("the desk settled that we should not hold
       * this") from `purged_at` ("the bytes are gone"), and NOTHING in the API sets the
       * second (`gps/artifact.ts:450`). So the sentence states what happened and what
       * did not, and it reads `purgedAt` off the returned row rather than assuming.
       */
      setNote(gone && gone.purgedAt === null
        ? `${a.filename} is deleted from the desk's record — it will not appear on this list or in a dossier. The bytes are NOT yet purged: purging is a separate act, so this is not an answer to an erasure request on its own.`
        : `${a.filename} deleted.`);
      load();
    } catch (e) {
      setRefusal(refusalSentence(e));
    }
  };

  const download = async (a: GpsArtifact) => {
    setRefusal(null);
    try {
      await retrieve(a);
    } catch (e) {
      setRefusal(refusalSentence(e));
    }
  };

  return (
    <div className="space-y-1.5" data-testid="gps-artifact-intake">
      {/* ── THE CONTROL. A real <label> + <input type="file">: the OS picker is the
             thing every operator already knows, and a div with a click handler is
             not reachable by keyboard. Hidden visually, not with `hidden`, which
             would take it out of the tab order. */}
      <div className="br-no-print flex flex-wrap items-center gap-2">
        <label
          className={clsx(
            'inline-flex cursor-pointer items-center gap-1.5 rounded border border-line px-2 py-1 text-micro font-semibold text-navy',
            'hover:bg-ice-soft focus-within:ring-2 focus-within:ring-navy dark:hover:bg-ice-soft/10',
            sending && 'pointer-events-none opacity-50',
          )}
        >
          <FileUp size={12} />
          Choose a client document
          <input
            ref={input}
            type="file"
            className="sr-only"
            disabled={sending !== null}
            /* THE PICKER'S FILTER IS THE SERVER'S ALLOWLIST, carried on the list read's
               envelope (`meta.limits`) — never a second copy written here. `accept` is
               a convenience and not a control: it is trivially bypassed, which is why
               the server checks the declared type against the leading bytes anyway. */
            accept={limits?.allowedMimeTypes?.join(',')}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void send(f);
            }}
          />
        </label>
        <span className="text-micro text-grey">
          Stored against this engagement.{' '}
          {limits
            ? `Up to ${bytes(limits.maxBytes)}; ${limits.allowedMimeTypes.length} accepted types; retained ${limits.retentionDays} days.`
            : 'The ceiling, the accepted types and the retention period come from the API and are shown once it answers.'}{' '}
          Size, type and byte checks are the API&apos;s and run after the bytes arrive.
        </span>
      </div>

      {/* ── PROGRESS. A 12MB file on a hotel connection is a 30-second wait, and a
             silent wait reads as broken. Bytes sent, then the verdict wait, named. */}
      {sending && (
        <div data-testid="gps-artifact-progress" className="border-l-2 border-line px-2 py-1.5">
          <p className="flex items-center gap-1.5 text-micro font-semibold text-navy">
            <Loader2 size={11} className="animate-spin motion-essential" aria-hidden="true" />
            <span className="font-mono">{sending.file.name}</span>
            <span className="text-grey">
              {sending.pct == null
                ? `${bytes(sending.sent)} sent`
                : `${bytes(sending.sent)} of ${bytes(sending.total)} sent · ${sending.pct}%`}
            </span>
          </p>
          <div
            className="mt-1 h-1 w-full bg-ice-soft dark:bg-ice-soft/10"
            role="progressbar"
            aria-label={`Uploading ${sending.file.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={sending.pct ?? undefined}
          >
            <div className="h-1 bg-navy" style={{ width: `${sending.pct ?? 0}%` }} />
          </div>
          <p className="mt-1 text-micro leading-snug text-grey">
            {sending.awaitingVerdict
              ? 'All bytes sent. The API has NOT answered yet — it is checking the size, the type and whether the bytes match the type declared. Nothing is stored until it does.'
              : 'Bytes handed to the connection. This is not a storage confirmation.'}
          </p>
        </div>
      )}

      {refusal && <Refused r={refusal} />}
      {listError && <Refused r={listError} />}

      {note && (
        <p role="note" className="border-l-2 border-status-ready/40 bg-status-ready-bg px-2 py-1.5 text-micro leading-snug text-status-ready">
          {note}
        </p>
      )}

      {/* ── WHAT IS ATTACHED ────────────────────────────────────────────────── */}
      {rows == null ? (
        !listError && <p className="text-micro text-grey">Reading the attached documents…</p>
      ) : rows.length === 0 ? (
        <p className="border-l-2 border-line px-2 py-1.5 text-micro leading-snug text-grey">
          No document is stored against this engagement. That is a statement about this list and not
          about the client: material sent by email, or left in the client&apos;s own systems, does not
          appear here. Outstanding inputs are tracked in the evidence chase above.
        </p>
      ) : (
        <table className="w-full border-collapse">
          <caption className="sr-only">Client documents stored against this engagement.</caption>
          <thead>
            <tr>
              <Th>Document</Th>
              <Th className="w-28">Type</Th>
              <Th className="w-20" align="right">Size</Th>
              <Th className="w-40">Recorded by / when</Th>
              <Th className="w-32 br-no-print">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((a) => (
              <tr key={a.id}>
                <Td>
                  <span className="break-all font-mono text-[10px] text-navy">{a.filename}</span>
                  {a.sha256 && (
                    <p className="break-all font-mono text-[10px] text-grey" title="SHA-256 of the stored bytes">
                      sha256 {a.sha256.slice(0, 16)}…
                    </p>
                  )}
                  {/* RETENTION IS A DATE THE SERVER COMPUTED, and `retentionOverdue` is
                      the server's own verdict on it — reported, never acted on
                      (`gps/artifact.ts:443`). Overdue means the desk is holding a
                      client's document past the period it told them it would. */}
                  <p className={clsx('leading-snug', a.retentionOverdue ? 'text-status-conditional' : 'text-grey')}>
                    {a.retentionOverdue
                      ? `PAST RETENTION — due for deletion ${a.retentionUntil.slice(0, 10)} and still on file. Nothing deletes it automatically.`
                      : `retained until ${a.retentionUntil.slice(0, 10)}`}
                  </p>
                </Td>
                <Td className="font-mono text-[10px] text-grey">{a.mime}</Td>
                <Td align="right"><span className="font-mono tabular-nums text-grey">{bytes(a.byteSize)}</span></Td>
                <Td className="text-grey">
                  <span className="font-mono text-[10px] text-navy">{a.uploadedBy}</span>
                  <span className="block font-mono text-[10px]">{a.uploadedAt}</span>
                </Td>
                <Td className="br-no-print">
                  <div className="flex flex-wrap items-center gap-1">
                    <Button size="xs" variant="secondary" onClick={() => void download(a)}>
                      <Download size={11} /> Download
                    </Button>
                    {confirming === a.id ? (
                      <>
                        <Button size="xs" variant="danger" onClick={() => void remove(a)}>
                          Confirm delete
                        </Button>
                        <Button size="xs" variant="secondary" onClick={() => setConfirming(null)}>
                          Keep
                        </Button>
                      </>
                    ) : (
                      <Button size="xs" variant="secondary" onClick={() => setConfirming(a.id)}>
                        <Trash2 size={11} /> Delete
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── WHO CAN SEE THIS. Printed with the list, because a client asking "who at
             LCX can read what we sent" deserves the true answer and the true answer
             is uncomfortable: the desk credential is one shared passcode. */}
      <p className="text-[10px] leading-snug text-grey">
        <Lock size={9} className="mr-1 inline-block align-baseline" />
        Access is desk-level, not per-person: anyone holding the shared desk passcode can list,
        download and delete these documents, and every row above records the desk rather than a
        verified individual. Deletion is available on every row, and this screen never renders a
        document&apos;s contents — no preview, no thumbnail, no inline viewer.
      </p>
    </div>
  );
}
