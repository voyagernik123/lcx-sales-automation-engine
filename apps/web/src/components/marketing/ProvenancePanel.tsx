import { useState } from 'react';
import { Fingerprint, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { CardSkeleton } from '@/components/shared';
import { corroborateReply, fetchReplyProvenance } from '@/lib/api/marketing';
import {
  Absent, NotPermitted, Nothing, ObservationFrameNote, Refused, apiReadRefusal,
} from './DeskAtoms';
import { useDeskRead } from './useDeskRead';
import type {
  CorroborationResult, CorroborationState, ProvenanceGrade, ReplyProvenanceRecord,
} from './vocabulary';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  PROVENANCE — how much this row is worth believing, and the one button that moves it
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * LOAD-BEARING BECAUSE THE INGEST IS FORGEABLE, and that is a live defect rather than a
 * hypothetical: `fetchNotificationEmails` searches `{seen:false}` with NO SENDER FILTER and
 * `RawEmail` has no `from` field at all (`xMail.ts:81`). Anyone who learns the polled mailbox
 * address can inject a fabricated reply — attacker-chosen handle, comment id, display name and
 * a 4,000-character body — and it arrives graded `C3`, "fairly reliable", identically to a
 * real one. Until a second channel speaks, the desk cannot tell them apart.
 *
 * So this panel sits in the drafting room, beside the text an operator is about to answer,
 * and not on an audit screen somebody visits afterwards.
 *
 * ── THE FIVE-STATE CORROBORATION, WHICH IS THE WHOLE POINT ────────────────────
 * A boolean `corroborated` collapses three unrelated facts into "no": an X outage, a deleted
 * post, and a lookup nobody ever ran. `CorroborationState` has no member meaning "not
 * corroborated" at all, and this panel renders each of the five differently:
 *
 *   agrees            a second channel spoke and matched.
 *   disagrees         a second channel spoke and did NOT match. Needs a named human.
 *   could_not_check   the channel was asked and did not answer. SAYS NOTHING ABOUT THE POST.
 *                     This is the member that stops an outage reading as a forgery signal.
 *   never_attempted   the table exists and holds no row. Nobody has looked.
 *   storage_absent    0062 is not applied, so no row could exist. Unknowable, not absent.
 *
 * ── AND WHY THE GRADE IS OFTEN `absent` HERE ──────────────────────────────────
 * The read performs no network call, so it cannot make the observation a grade would rest
 * on. Where a stored lookup exists, the ladder's unchecked rung — whose sentence reads
 * "Corroboration has not been attempted" — would be FALSE, and emitting a false sentence is
 * worse than emitting none. So the grade refuses, and its recovery is one button.
 *
 * NOTHING HERE POSTS. `POST /replies/:id/corroborate` is one unauthenticated GET to
 * `publish.twitter.com/oembed`, a documented keyless read of a public endpoint, and a POST only
 * because it WRITES the corroboration row. `attempted: false` is a real outcome and not a
 * failure of the button: the breaker may be open, and an outage must never mark a row
 * unconfirmed.
 */

/* ════════ THE GRADE ════════ */

function Grade({ g }: { g: ProvenanceGrade }) {
  return (
    <div
      data-testid="mkt-provenance-grade"
      className={g.needsHumanRead
        ? 'border-l-2 border-status-conditional/60 bg-status-conditional-bg px-2 py-1.5'
        : 'border-l-2 border-line px-2 py-1.5'}
    >
      <p className="flex flex-wrap items-baseline gap-1.5 text-micro">
        {/* The ladder's own rung, which is a real situation rather than a score bucket, and its
            Admiralty code beside it. The code is never the message. */}
        <span className="font-semibold text-navy">{g.rung.replace(/_/g, ' ')}</span>
        <span className="font-mono text-[10px] text-grey">
          {g.admiralty} · {g.reliability} / {g.credibility} · confidence {g.confidence}
        </span>
      </p>
      {/* THE LADDER'S SENTENCE, VERBATIM. A surface must never print a bare code, and
          summarising the engine's sentence would create a second wording of one finding. */}
      <p className="mt-0.5 text-[10px] leading-snug text-grey">{g.statement}</p>
      <p className="mt-0.5 text-[10px] leading-snug text-grey">
        <span className="font-semibold">Why this rung and not the one above it.</span> {g.rationale}
      </p>
      {g.needsHumanRead && (
        <p className="mt-1 text-[10px] font-semibold leading-snug text-status-conditional">
          A human has to read this row before anything is built on it. The grade is not a clearance.
        </p>
      )}
    </div>
  );
}

/* ════════ THE FIVE STATES ════════ */

const OUTCOME_CLASS: Record<'agrees' | 'disagrees' | 'could_not_check', string> = {
  agrees: 'text-status-ready',
  disagrees: 'text-status-blocked font-bold',
  could_not_check: 'text-status-conditional font-semibold',
};

function Corroboration({ c }: { c: CorroborationState }) {
  if (c.kind === 'storage_absent') {
    return (
      <Absent title="Corroboration is unknowable on this environment, not absent.">
        Migration 0062 has not been applied, so <span className="font-mono">marketing_reply_corroboration</span> does
        not exist and no observation could have been stored even if one had been made. Do not read this as an
        uncorroborated row: it is a row whose corroboration state cannot be held. {c.sentence} {c.refusal.sentence}
      </Absent>
    );
  }
  if (c.kind === 'never_attempted') {
    return (
      <Nothing>
        No corroboration has been attempted for this row. The table exists and holds nothing for it, so this is
        a statement about what the desk has done and not about whether the post is real — and it is the one
        state the button below can change. {c.sentence}
      </Nothing>
    );
  }
  return (
    <div className="space-y-1" data-testid={`mkt-corroboration-${c.kind}`}>
      <p className="text-micro">
        <span className={`font-semibold ${OUTCOME_CLASS[c.kind]}`}>
          {c.kind === 'agrees'
            ? 'A second channel agrees with this row.'
            : c.kind === 'disagrees'
              ? 'A second channel DISAGREES with this row.'
              : 'The second channel was asked and did not answer.'}
        </span>{' '}
        <span className="text-[10px] leading-snug text-grey">
          {c.kind === 'could_not_check'
            ? 'That says nothing about the post. An outage, a rate limit or an open breaker all land here, and none of them is evidence that the post does not exist.'
            : c.kind === 'disagrees'
              ? 'A named human has to read both texts. A disagreement is the signal the forgeable ingest exists to surface, and it is not resolved by re-running the lookup.'
              : 'The channel is independent of the mailbox that delivered it, so this row is known to exist outside our own inbox.'}
        </span>
      </p>
      {/* THE ENGINE'S OWN SENTENCE FOR THE STATE, verbatim and not paraphrased. It knows which
          field disagreed and when the channel was last consulted; this screen knows what the
          state MEANS. Both are printed, because dropping the first leaves an operator with a
          category and no particulars.

          `lastObservedAt` IS GUARDED RATHER THAN ASSERTED. The contract types it non-null on
          these three kinds, so `!` would compile — and a payload is not a type. This is the
          field that would otherwise render `Invalid Date`, which an operator reads as a
          rendering glitch instead of as bad data (`narrow.ts instant`). */}
      <p className="text-[10px] leading-snug text-grey">
        {c.sentence}
        {c.lastObservedAt !== null
          && ` Last consulted ${c.lastObservedAt.slice(0, 16)} — when WE looked, never when the post was written.`}
      </p>
      <ul className="space-y-0.5">
        {c.rows.map((r) => (
          <li key={`${r.field}-${r.channel}-${r.observedAt}`} className="font-mono text-[10px] leading-snug text-grey">
            <span className={OUTCOME_CLASS[r.outcome]}>{r.outcome}</span> · {r.field} via {r.channel}
            {r.undocumented && ' · UNDOCUMENTED CHANNEL — X publishes no contract for it'}
            {' · looked at '}{r.observedAt.slice(0, 16)}
            {r.observedValue !== null && ` · observed ${r.observedValue}`}
            <span className="block font-sans">{r.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ════════ WHAT ONE LOOKUP DID ════════ */

function Result({ r }: { r: CorroborationResult }) {
  if (!r.attempted) {
    return (
      <div data-testid="mkt-corroborate-not-attempted">
        {/* `attempted: false` IS NOT A FAILURE OF THE BUTTON, and the difference matters: an
            outage that marked a row unconfirmed would manufacture exactly the forgery signal
            this whole apparatus exists to make trustworthy. Nothing was asked and nothing was
            written. */}
        {r.refusal !== null
          ? <Refused r={r.refusal} />
          : (
            <Absent title="No lookup was attempted, and the route did not say why.">
              Nothing was asked and nothing was written, so this row&apos;s corroboration state is unchanged. A
              missing reason here is a defect in the response rather than a fact about the post.
            </Absent>
          )}
      </div>
    );
  }
  return (
    <div className="space-y-1 border-l-2 border-line px-2 py-1.5" data-testid="mkt-corroborate-result">
      <p className="text-micro font-semibold text-navy">
        {r.status === 'confirmed'
          ? 'X’s own endpoint confirmed this post.'
          : r.status === 'not_public'
            ? 'X answered and the post is not publicly readable.'
            : 'X answered and the result was inconclusive.'}
      </p>
      {/* The engine's sentence for the code. The code is printed last and small, never as the
          message — it is the thing a person quotes when they ask why. */}
      {r.message !== null && <p className="text-[10px] leading-snug text-grey">{r.message}</p>}
      <p className="font-mono text-[10px] leading-snug text-grey">
        {r.wrote.length} observation{r.wrote.length === 1 ? '' : 's'} written
        {r.postDateRecorded
          ? ' · the post date column was updated by this call'
          : ' · no post date was written by this call'}
        {r.postedOnDisplayed !== null && ` · X printed ${r.postedOnDisplayed}`}
        {r.code !== null && ` · ${r.code}`}
        {r.observedAt !== null && ` · we looked at ${r.observedAt.slice(0, 16)}`}
        {` · requested by ${r.requestedBy} at ${r.requestedAt.slice(0, 16)}`}
      </p>
      {r.disagreements > 0 && (
        <p data-testid="mkt-corroborate-disagreement" className="text-[10px] font-bold leading-snug text-status-blocked">
          {r.disagreements} observation{r.disagreements === 1 ? '' : 's'} DISAGREE with what this row claims. That is
          an attribution error, not a stale field: a named human has to read both texts, and re-running the lookup
          will not resolve it.
        </p>
      )}
      {r.quarantinedByLadder && (
        <p className="text-[10px] font-bold leading-snug text-status-blocked">
          This lookup moved the row into quarantine. It is out of the queue and out of every count — visible,
          because a forgery attempt the desk cannot see is worse than one it can, but never drafted from.
        </p>
      )}
      {r.degraded !== null && (
        <p className="text-[10px] leading-snug text-status-conditional">
          The channel was impaired while this ran: {r.degraded} Read the grade below as provisional.
        </p>
      )}
      {r.grade.kind === 'measured' ? <Grade g={r.grade.value} /> : <Refused r={r.grade.refusal} />}
    </div>
  );
}

/* ════════ THE PANEL ════════ */

export function ProvenancePanel({ replyId }: { replyId: number }) {
  const read = useDeskRead<ReplyProvenanceRecord>(
    `marketing:provenance:${replyId}`, () => fetchReplyProvenance(replyId),
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CorroborationResult | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const corroborate = async () => {
    setFailed(null);
    setResult(null);
    setBusy(true);
    try {
      setResult(await corroborateReply(replyId));
      /* The stored state changed, so the read above is stale. Reloaded rather than patched
         from the result: the grade the ladder gives AFTER an observation is the route's to
         compute, and merging two shapes in the browser is how a screen shows a grade the
         server would not have given. */
      read.reload();
    } catch (e) {
      setFailed(e instanceof Error && e.message !== '' ? e.message : 'The lookup failed and the API did not say why.');
    } finally { setBusy(false); }
  };

  return (
    <section aria-label="Provenance" className="space-y-1.5">
      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-navy">
        <Fingerprint size={12} aria-hidden="true" /> How much this row is worth believing
      </h3>
      <p className="text-[10px] leading-snug text-grey">
        The mailbox has no sender check, so a fabricated reply arrives graded the same as a real one. Everything
        below is about whether a channel independent of that mailbox has said this post exists.
      </p>

      {read.result.state === 'loading' && <CardSkeleton />}

      {read.result.state === 'absent' && (
        <Absent title="The provenance read is not on this environment.">
          <span className="font-mono">GET /v1/marketing/replies/{replyId}/provenance</span> answered 404. Nothing
          here has been graded and no corroboration state can be read, so treat this row as uncorroborated by
          default — which is what it is, and not what this panel proved.
        </Absent>
      )}

      {read.result.state === 'forbidden' && (
        <NotPermitted what="Reading this row’s provenance" sentence={read.result.sentence} />
      )}

      {read.result.state === 'failed' && (
        <Refused r={apiReadRefusal(new Error(read.result.sentence),
          'A failed provenance read is not a clean provenance. Nothing below distinguishes an authenticated row from a forged one, so neither may be assumed while answering it.')} />
      )}

      {read.result.state === 'ok' && (() => {
        const p = read.result.value;
        return (
          <div className="space-y-2">
            {/* QUARANTINE FIRST, AND IT HAS NO GRADE. A held row is out of the queue and out of
                every count; showing a grade beside it would invite it to be read as a
                borderline item rather than as one the ladder refused. The engine's own code,
                message and rule are printed untranslated — `QuarantineCode` and the shared
                `QuarantineReason` vocabulary are two enumerations with no mapping between them
                anywhere in the repo, and inventing one here would be a second classification of
                why a row is held, decided by a screen. */}
            {p.quarantined && (
              <Absent title="This row is quarantined. It is not in the queue and not in any count.">
                {p.quarantineMessage ?? 'The ladder held this row and stated no message.'}
                <span className="mt-1 block font-mono text-[10px]">
                  {p.quarantineCode ?? 'no code'} · {p.quarantineRule ?? 'no rule stated'}
                </span>
              </Absent>
            )}

            {/* WHO IT CLAIMS TO BE, said as a claim. `claimedAuthorDisplay` is attacker-chosen
                and is never rendered as the author — it is shown so an operator can see what a
                forgery would have chosen, in mono, labelled. */}
            <p className="font-mono text-[10px] leading-snug text-grey">
              claims to be @{p.claimedAuthorHandle}
              {p.claimedAuthorDisplay !== null && ` · display name as supplied: ${p.claimedAuthorDisplay}`}
              {' · comment '}{p.xCommentId}
              {p.xPostId !== null && ` · under post ${p.xPostId}`}
              {' · we received it '}{p.receivedAt.slice(0, 16)} (never the post time)
            </p>

            {/* HOW THE SENDER WAS ESTABLISHED, IF AT ALL. `sender_auth_evidence` — the
                provider's verbatim `Authentication-Results` header — is deliberately NOT read
                here: it is diagnostic, it names third-party infrastructure, and nothing may
                render it on a shared screen. What appears is the STATE and, when the sender
                could not be authenticated, the engine's refusal. */}
            {p.senderRefusal !== null && <Refused r={p.senderRefusal} />}
            {p.senderAuth !== null && (
              <p className="font-mono text-[10px] leading-snug text-grey" data-testid="mkt-sender-auth">
                {/* THE TWO PASSES, SEPARATELY, and never summed into one word. DKIM is the
                    signature that survived; ARC is a chain sealed by whoever forwarded it, and
                    the contract's own note is that an ARC sealer is trusted only if the
                    deployment names it. A single "authenticated" would hide which of the two
                    carried the row, and forwarding kills SPF — so the distinction is the whole
                    reason this evidence is kept per row. */}
                dkim {p.senderAuth.dkimPass ? 'pass' : 'no pass'}
                {p.senderAuth.dkimDomain !== null && ` d=${p.senderAuth.dkimDomain}`}
                {' · arc '}{p.senderAuth.arcPass ? 'pass' : 'no pass'}
                {p.senderAuth.arcSealerDomain !== null && ` sealed by ${p.senderAuth.arcSealerDomain}`}
                <span className="block font-sans">
                  This is not a trust score. It says what the mail carried, and a forged item that never reached
                  DKIM is exactly what &ldquo;no pass&rdquo; looks like. The provider&apos;s verbatim
                  <span className="font-mono"> Authentication-Results </span>
                  header is held for the audit trail and is deliberately not rendered here: it names third-party
                  infrastructure and this is a shared screen.
                </span>
              </p>
            )}

            {p.grade.kind === 'measured' ? <Grade g={p.grade.value} /> : <Refused r={p.grade.refusal} />}

            <Corroboration c={p.corroboration} />

            {/* THE POST DATE, AND THE REFUSAL WHERE THERE IS NONE. Mail latency is not a post
                time, and the refusal is what stops the two being substituted for each other. */}
            {p.postDateRefusal !== null
              ? <Refused r={p.postDateRefusal} />
              : (
                <p className="font-mono text-[10px] leading-snug text-grey">
                  X printed {p.postedOnDisplayed ?? 'no date'} · supplied by {p.postedAtSource ?? 'no channel'}
                </p>
              )}

            {/* THE ONE BUTTON, and it is a read of a public endpoint that writes a record. */}
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
              <Button size="xs" variant="secondary" onClick={() => void corroborate()} disabled={busy}>
                {busy
                  ? <><Loader2 size={12} className="animate-spin motion-essential" /> Asking oEmbed…</>
                  : 'Corroborate through X’s public oEmbed'}
              </Button>
              <span className="text-[10px] leading-snug text-grey">
                One unauthenticated GET to a documented, keyless endpoint. It sends nothing on LCX&apos;s behalf and
                touches no credential; it is a POST here only because it writes down what came back.
              </span>
            </div>

            {failed !== null && (
              <Refused r={apiReadRefusal(new Error(failed),
                'The lookup failed, so this row’s corroboration state is unchanged. A failed attempt is not a disagreement and must not be read as one.')} />
            )}
            {result !== null && <Result r={result} />}

            <ObservationFrameNote frame={p.frame} />
            <p className="font-mono text-[10px] text-grey">read at {p.readAt.slice(0, 16)}</p>
          </div>
        );
      })()}
    </section>
  );
}
