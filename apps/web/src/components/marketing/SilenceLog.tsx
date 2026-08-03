import { useState } from 'react';
import { Button, SectionLabel } from '@/components/ui';
import { CardSkeleton } from '@/components/shared';
import { fetchSilenceLog, recordSilenceDecision } from '@/lib/api/marketing';
import type { MarketingReply } from '@/lib/api/marketing';
import {
  Absent, NotPermitted, Nothing, ObservationFrameNote, Refused, Th, Td, apiReadRefusal,
} from './DeskAtoms';
import { useDeskRead } from './useDeskRead';
import { ownRecordsFrame, type SilenceLog as SilenceLogRows, type SilenceLogEntry } from './vocabulary';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE SILENCE LOG — the half of the desk's judgement nothing else records
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A desk that only shows what it said is hiding half of what it decided. Today the
 * three completely different judgements "not about us", "deliberately not engaging"
 * and "this is a scam account" all end up as `status = 'ignored'`, which means the
 * question that actually gets asked six months later — *why didn't we say anything?* —
 * has no answer at all.
 *
 * `would_amplify` is the reason this panel earns its place. Staying quiet because a
 * reply would hand a manipulator an audience is a correct decision, and it is
 * indistinguishable from an oversight unless somebody wrote it down: "just by showing
 * up for work and doing their jobs as assigned", journalists covering the far-right
 * fringe added "rocket fuel to an already-smoldering fire" (Whitney Phillips, *The
 * Oxygen of Amplification*, Data & Society, 2018).
 *
 * ── WHAT CHANGED IN THIS WAVE, AND IT IS NOT COSMETIC ─────────────────────────
 * TWO THINGS. First, this panel READ a route mounted by nobody, through a runtime
 * narrower in `deskApi.ts`, so it was `absent` on every environment. It now reads the
 * contracted `SilenceLog` — declared once in `contracts/gates.ts` §3 and imported by the
 * route handler from the same symbol — so a server-side rename breaks this file at compile
 * time rather than silently blanking a column.
 *
 * Second, and larger: THERE WAS NO WRITE SURFACE ANYWHERE. `POST /:id/silence` existed in
 * the client and no component called it, so an operator's only way to record "we decided not
 * to answer" was `POST /:id/status` with `'ignored'`, which stores no reason. The panel that
 * exists to prove a silence was a decision could not record one. The form below is that
 * write, and its rationale is not optional in either direction: this screen refuses to send
 * an empty one, the route's validator rejects a whitespace-only one at the door, and
 * `recordSilence` refuses `IGNORE_WITHOUT_RATIONALE` with its citation. Three gates, and the
 * engine's refusal is the one an operator reads because it carries the rule.
 *
 * TWO REFUSALS THIS PANEL KEEPS:
 *  · It never auto-closes a silence. One past its revisit date stays open and visible;
 *    a system that quietly retires them has recreated the problem it was built for.
 *  · It never claims a silence worked. There is no counterfactual, and there never will
 *    be one.
 */

/** A revisit date in the past is a live obligation, not history. */
export function overdue(entry: SilenceLogEntry, now: number): boolean {
  if (entry.revisitBy === null) return false;
  const t = Date.parse(entry.revisitBy);
  return !Number.isNaN(t) && t < now;
}

/**
 * RECORD WHY NOTHING WAS SAID. The write this compartment did not have.
 *
 * `reason` and `rationale` are both required and they are different things: the reason is the
 * category an operator would file it under, the rationale is the sentence they would defend in
 * a review. Collapsing them is how "not about us" becomes the answer to every question.
 *
 * `linesPrepared` is optional and is RESIST 2's own definition of its lowest tier — "lines
 * prepared, no response made". Leaving it blank is a real answer: it says nothing was drafted,
 * which on a high-reach item is itself a finding.
 *
 * WHAT THIS FORM DOES NOT OFFER: a way to set the queue status. The route sets it itself, so
 * no surface has to remember to make two calls in the right order — which is the sequence that
 * leaves a row marked `ignored` with no ledger entry behind it.
 */
function RecordSilence({ queue, onRecorded }: {
  queue: readonly MarketingReply[];
  onRecorded: () => void;
}) {
  const [replyId, setReplyId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [rationale, setRationale] = useState('');
  const [lines, setLines] = useState('');
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<ReturnType<typeof apiReadRefusal> | null>(null);
  const [wrote, setWrote] = useState<SilenceLogEntry | null>(null);
  const cls = 'mt-0.5 w-full rounded border border-line bg-card px-2 py-1 text-micro text-navy focus-ring';

  const submit = async () => {
    setRefusal(null);
    setWrote(null);
    if (replyId === null || reason.trim() === '' || rationale.trim() === '') return;
    setBusy(true);
    try {
      const row = await recordSilenceDecision(replyId, {
        reason: reason.trim(),
        rationale: rationale.trim(),
        linesPrepared: lines.trim() === '' ? null : lines.trim(),
      });
      setWrote(row);
      setReason(''); setRationale(''); setLines(''); setReplyId(null);
      onRecorded();
    } catch (e) {
      /* The API's own sentence, verbatim. It holds the engine's refusal — which rule was
         breached and what would clear it — and a sentence written here in advance cannot. */
      setRefusal(apiReadRefusal(e,
        'Nothing was recorded. The route refuses first and writes second, so there is no half-written silence: this item still has no decision against it, and it is not now marked ignored.'));
    } finally { setBusy(false); }
  };

  const incomplete = replyId === null || reason.trim() === '' || rationale.trim() === '';

  return (
    <div className="space-y-1.5 border border-line bg-card p-2" data-testid="mkt-silence-form">
      <div>
        <SectionLabel as="h3">Record a decision not to answer</SectionLabel>
        <p className="mt-0.5 text-[10px] leading-snug text-grey">
          This is the only path that writes a reason. Marking an item <span className="font-mono">ignored</span> on
          the triage board stores no rationale, and a silence with no rationale is indistinguishable from an
          oversight six months later — which is the one question this log exists to answer.
        </p>
      </div>

      <label className="block text-micro">
        <span className="font-semibold text-navy">Which item</span>
        <select
          className={cls}
          aria-label="Item to record a silence against"
          value={replyId ?? ''}
          onChange={(e) => setReplyId(e.target.value === '' ? null : Number(e.target.value))}
        >
          <option value="">— choose an item —</option>
          {queue.map((r) => (
            <option key={r.id} value={r.id}>@{r.author_handle} · {r.body.slice(0, 60)}</option>
          ))}
        </select>
      </label>

      <label className="block text-micro">
        <span className="font-semibold text-navy">Reason</span>
        <input
          className={cls}
          aria-label="Reason"
          placeholder="not about us · would amplify · scam account · already answered"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <span className="mt-0.5 block text-[10px] leading-snug text-grey">
          Free text, and deliberately not a dropdown: the route stores the reason as given, and a fixed list
          would push a real judgement into whichever of five words was closest.
        </span>
      </label>

      <label className="block text-micro">
        <span className="font-semibold text-navy">Rationale</span>
        <textarea
          className={`${cls} min-h-[60px]`}
          aria-label="Rationale"
          placeholder="The sentence you would defend in a review."
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
        />
        <span className="mt-0.5 block text-[10px] leading-snug text-grey">
          Required. Not by this form&apos;s preference — <span className="font-mono">recordSilence</span> refuses
          <span className="font-mono"> IGNORE_WITHOUT_RATIONALE</span> and nothing is written, including the
          status change.
        </span>
      </label>

      <label className="block text-micro">
        <span className="font-semibold text-navy">Lines prepared, if any</span>
        <textarea
          className={`${cls} min-h-[40px]`}
          aria-label="Lines prepared"
          value={lines}
          onChange={(e) => setLines(e.target.value)}
        />
        <span className="mt-0.5 block text-[10px] leading-snug text-grey">
          Blank is a real answer: it records that nothing was drafted, which on a high-reach item is a finding
          rather than a tidy outcome.
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="xs" onClick={() => void submit()} disabled={busy || incomplete}>
          Record the silence
        </Button>
        {incomplete && (
          <span className="text-[10px] leading-snug text-grey">
            An item, a reason and a rationale are all required before this can be sent.
          </span>
        )}
      </div>

      {refusal && <Refused r={refusal} />}
      {wrote && (
        <p
          role="note"
          data-testid="mkt-silence-recorded"
          className="border-l-2 border-status-ready/40 bg-status-ready-bg px-2 py-1.5 text-micro leading-snug text-status-ready"
        >
          Recorded against @{wrote.authorHandle} by {wrote.decidedBy} at {wrote.decidedAt.slice(0, 16)} · ledger
          row <span className="font-mono">{wrote.id}</span>
          {wrote.queueStatusSet !== null && ` · the queue row was moved to ${wrote.queueStatusSet} by the same call`}
          <span className="mt-1 block text-[10px] text-grey">
            The priority, reach and verifiability stored beside it are the ones from this item&apos;s last recorded
            triage decision — read from the ledger, never from what this form sent. A decision that states its own
            basis is not evidence of one.
          </span>
        </p>
      )}
    </div>
  );
}

export function SilenceLog({ now, queue }: { now: number; queue: readonly MarketingReply[] }) {
  const read = useDeskRead<SilenceLogRows>('marketing:silence', () => fetchSilenceLog());

  return (
    <section aria-label="Silence log" className="space-y-2">
      <div>
        <SectionLabel as="h3">Every decision not to answer</SectionLabel>
        <p className="mt-0.5 text-[10px] leading-snug text-grey">
          Each row is a named human&apos;s reason for saying nothing, with the date they decided and the date
          they undertook to look again. This panel makes no claim that any of these decisions was right —
          there is no counterfactual for a silence.
        </p>
      </div>

      <RecordSilence queue={queue} onRecorded={read.reload} />

      {read.result.state === 'loading' && <CardSkeleton />}

      {read.result.state === 'absent' && (
        <Absent title="There is no silence log on this environment.">
          The route that would hold these decisions is not deployed here, so this is not an empty log — it is
          no log. Every decision not to answer taken on this environment is recorded nowhere, and the queue&apos;s
          <span className="font-mono"> ignored </span> status cannot tell &ldquo;not about us&rdquo; from
          &ldquo;a reply would amplify this&rdquo;.
        </Absent>
      )}

      {read.result.state === 'forbidden' && (
        <NotPermitted what="Reading the silence log" sentence={read.result.sentence} />
      )}

      {read.result.state === 'failed' && (
        <Refused r={apiReadRefusal(new Error(read.result.sentence),
          'A failed read is not an absence of decisions. Nothing below is the record, and a blank panel here must not be read as a desk that answered everything.')} />
      )}

      {read.result.state === 'ok' && (read.result.value.length === 0 ? (
        <Nothing>
          No decision not to answer has been recorded. On a desk that is answering everything that is a
          finding, not a clean sheet: most inbound items should terminate in a recorded silence, and an empty
          log usually means the decisions are being taken and not written down.
        </Nothing>
      ) : (
        <table className="w-full border-collapse">
          <caption className="sr-only">Recorded decisions not to respond.</caption>
          <thead>
            <tr>
              <Th>Subject</Th>
              <Th className="w-32">Reason / where from</Th>
              <Th>Rationale</Th>
              <Th className="w-32">Standing then</Th>
              <Th className="w-36">Decided by / when</Th>
              <Th className="w-28">Revisit</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {read.result.value.map((s) => (
              <tr key={s.id} data-testid={`mkt-silence-${s.id}`}>
                <Td className="font-mono text-[10px] text-navy">@{s.authorHandle}</Td>
                <Td>
                  <span className="font-mono text-[10px] text-navy">{s.reasonCode}</span>
                  {/* WHICH SURFACE THE DECISION CAME FROM. Two entry points append to one
                      ledger — the triage board's `ignore` action and the form above — and a
                      reviewer asking "was this a considered call or a queue tidy-up" is asking
                      exactly this. It is not the two-write-paths defect: both go through
                      `recordSilence`. */}
                  <span className="block font-mono text-[10px] text-grey">
                    via {s.source.replace(/_/g, ' ')}
                  </span>
                </Td>
                <Td className="text-grey">
                  {/* A rationale is REQUIRED by the record. A row without one is a defect in
                      the row, and it is named as such rather than shown as a blank cell an eye
                      slides over. */}
                  {s.rationale === '' ? (
                    <span className="font-semibold text-status-blocked">
                      no rationale was recorded — this row does not answer why, which is the only question it
                      exists to answer
                    </span>
                  ) : s.rationale}
                  {s.linesPrepared !== null && (
                    <span className="mt-1 block border-l-2 border-line px-1.5 text-[10px] leading-snug">
                      lines prepared and not used: {s.linesPrepared}
                    </span>
                  )}
                </Td>
                {/* THE STANDING AS IT WAS, not as it is. These three come from the item's last
                    recorded triage decision at the moment silence was chosen, so a reviewer can
                    see that a high-reach item was knowingly left alone rather than inferring it
                    from today's numbers. */}
                <Td className="font-mono text-[10px] text-grey">
                  <span className="block text-navy">{s.priorityAtDecision}</span>
                  <span className="block">reach {s.reachAtDecision.replace(/_/g, ' ')}</span>
                  <span className="block">{s.verifiabilityAtDecision.replace(/_/g, ' ')}</span>
                </Td>
                <Td className="text-grey">
                  <span className="block font-mono text-[10px] text-navy">{s.decidedBy}</span>
                  <span className="block font-mono text-[10px]">{s.decidedAt.slice(0, 16)}</span>
                </Td>
                <Td>
                  {s.revisitBy === null ? (
                    <span className="text-[10px] leading-snug text-grey">none set — this silence is permanent unless somebody reopens it</span>
                  ) : overdue(s, now) ? (
                    <span className="text-[10px] font-semibold leading-snug text-status-conditional">
                      OVERDUE since {s.revisitBy.slice(0, 10)} — still open. Nothing closes it automatically.
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-grey">{s.revisitBy.slice(0, 10)}</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}

      {/* The frame this panel can state on its own. `GET /silence` also carries a
          `SilenceLogMeta.frame` and a `truncated` flag in the envelope's `meta`, which is
          strictly better because it knows the real window and whether a `limit` cut the list;
          reading it needs `responseMeta` over the array and is left for the pass that can test
          a truncated log against a real one, rather than guessed at here. */}
      <ObservationFrameNote frame={ownRecordsFrame(
        new Date(now - 90 * 86_400_000).toISOString(), new Date(now).toISOString(), { truncatedByRetention: true },
      )} />
    </section>
  );
}
