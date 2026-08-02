import { useState } from 'react';
import { Scale } from 'lucide-react';
import { Button } from '@/components/ui';
import { toast } from '@/components/shared/Toast';
import {
  MARKETING_INBOUND_RETENTION_DAYS,
  type ErasureOutcome,
  type MarketingRecordRow,
  type SubjectAccessResponse,
} from './vocabulary';
import { recordOwnStatement, requestErasure, requestSubjectAccess } from '@/lib/api/marketing';
import { Absent, NotPermitted, Nothing, Refused, Th, Td, apiReadRefusal } from './DeskAtoms';
import { errorSentence, notPermitted, routeAbsent } from './narrow';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE THREE STATUTORY PATHS THAT HAD NO CALLER — Art 15, Art 17, Art 68(9)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `apps/api/src/marketing/record.ts` is 84KB and NOTHING IMPORTED IT. `subjectAccess`,
 * `eraseByHandle` and `writeRecord` were written, tested and dead — so:
 *
 *  · A GDPR Art 15 access request could not be answered from this product. Art 12(3) gives
 *    one month, and the clock runs from the subject's request, not from a deployment.
 *  · An Art 17 erasure could not be performed or PROVEN — `marketing_erasure_log` was
 *    permanently empty, so even an erasure done by hand in the database was unprovable.
 *  · NOTHING WAS EVER PLACED ON THE FIVE-YEAR CLOCK. The {@link MARKETING_INBOUND_RETENTION_DAYS}-day
 *    inbound sweep IS wired (`routes/marketing.ts:180`), so the retention SPLIT migration
 *    0061 designs was inoperative in one direction only: on day 91 the compartment retained
 *    nothing at all, including the statements MiCA Art 68(9) requires LCX to keep for years.
 *    That is the DPO ruling in §7 of the plan arriving as a default rather than a decision.
 *
 * This panel is the first caller of all three.
 *
 * ── FULLY TYPED, AND WHAT THAT CHANGED ────────────────────────────────────────
 * `SubjectAccessResponse`, `ErasureOutcome` and `MarketingRecordRow` are declared in
 * `packages/shared/src/marketing/contracts/record.ts` and imported here through
 * `vocabulary.ts` — the same symbols the route handler imports. The first draft of this
 * file narrowed guessed payloads at runtime (`categories[]`, `kept[]`, `logId`) and every
 * guess was wrong: the real access response is four named row collections, and the real
 * erasure receipt reports `recordsRetained` with the Art 17(3) exemption relied on. Both
 * guesses would have compiled and rendered an empty answer to a statutory request.
 *
 * ONE PLACE `unknown` SURVIVES AND IS CORRECT. `SubjectAccessResponse.replies|drafts|
 * transfers` are `Record<string, unknown>[]` deliberately: an Art 15 response must contain
 * EVERYTHING held about the subject, so pinning a column list would make the response
 * incomplete by construction the next time a migration adds a column. This panel therefore
 * renders those rows generically — every key, every value — rather than picking fields.
 *
 * ── WHY THERE IS NO ERASURE CONFIRM-AND-FORGET ────────────────────────────────
 * Erasure destroys evidence, so it is typed out in full — the handle AND the lawful basis,
 * both required, neither defaulted — and the response is rendered as a RECEIPT with both
 * halves. What was KEPT is the half that matters: keeping LCX's own cleared statements
 * silently would be the actual violation, and keeping them while telling the subject is the
 * lawful answer.
 *
 * NOTHING HERE PUBLISHES, and the long-clock form is the closest thing in this compartment
 * to one — which is why it is worded as a WITNESS statement. It records what a human already
 * published, by hand, outside this system. It transmits nothing anywhere.
 */

const FIELD = 'w-full rounded border border-line bg-card px-2 py-1 font-mono text-micro text-navy focus-ring';
const H4 = 'text-micro font-bold uppercase tracking-wider text-navy';

/** The sentence printed when one of these three routes is not mounted here. */
function StatutoryAbsence({ route, consequence }: { route: string; consequence: string }) {
  return (
    <Absent title={`${route} is not on this environment.`}>
      {consequence}{' '}
      The engine is written (<span className="font-mono">apps/api/src/marketing/record.ts</span>); if it has no
      route here, this is a wiring gap rather than a missing feature — and a wiring gap with a statutory clock on
      it. Escalate rather than retrying.
    </Absent>
  );
}

/**
 * One collection of rows from an Art 15 response, rendered by KEY rather than by a chosen
 * field list.
 *
 * The generic rendering is the point: the contract types these rows `Record<string,
 * unknown>` so that a column added by a later migration appears in the answer without
 * anyone remembering to add it here. A hand-picked field list would quietly under-answer,
 * and under-answering an Art 15 request is the failure mode.
 *
 * An EMPTY collection says which collection is empty. "We hold no drafts about you" is a
 * real answer to a subject; a blank region is not.
 */
function AccessRows({ label, rows }: { label: string; rows: readonly Record<string, unknown>[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-[10px] leading-snug text-grey">
        <span className="font-semibold">{label}.</span> None held.
      </p>
    );
  }
  return (
    <details className="text-[10px] leading-snug text-grey">
      <summary className="cursor-pointer font-mono uppercase tracking-wider">
        {label} · {rows.length} held
      </summary>
      <ul className="mt-1 space-y-1">
        {rows.map((r, i) => (
          <li key={i} className="border-l-2 border-line pl-2">
            {Object.entries(r).map(([k, v]) => (
              <div key={k} className="break-words font-mono">
                <span className="font-semibold">{k}</span>{' · '}
                {/* Values are printed as text and never parsed into a nicer shape: this is
                    the payload as held, which is what Art 15 asks for. `null` prints as
                    `null` rather than as an empty cell, because a null column is a fact. */}
                {v === null ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v)}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Art15() {
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [absent, setAbsent] = useState(false);
  /* All three of these routes are `requireApprover`. A 403 is the control working, and it is
     held apart from `failed` so it cannot be rendered as a fault an operator should retry. */
  const [forbidden, setForbidden] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [view, setView] = useState<SubjectAccessResponse | null>(null);

  const run = async () => {
    const h = handle.replace(/^@/, '').trim();
    if (h === '') {
      toast('error', 'A handle is required. There is no "everything" mode: an access response is about one named subject.');
      return;
    }
    setBusy(true); setAbsent(false); setForbidden(null); setFailed(null); setView(null);
    try {
      /* `requestedBy` is sent because the route's body requires it, and the SERVER
         overrides it from the session — `fulfilledBy` on the response is the authenticated
         principal, never this field. An Art 15 answer attributed to a client-supplied name
         is attribution the record cannot support, so the response's value is what is
         displayed and this one is never shown back. */
      setView(await requestSubjectAccess({ handle: h, requestedBy: 'session' }));
    } catch (e) {
      if (routeAbsent(e)) setAbsent(true);
      else if (notPermitted(e)) setForbidden(errorSentence(e));
      else setFailed(errorSentence(e));
    } finally { setBusy(false); }
  };

  return (
    <section className="space-y-1.5">
      <h4 className={H4}>Art 15 — what we hold about one person</h4>
      <p className="text-[10px] leading-snug text-grey">
        The handle travels in a POST body and never in a URL: it is personal data, and a query string ends up in
        access logs, referrers and browser history. There is no download button — the response is produced on this
        screen so that whoever answers the request reads it before it leaves.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <input className={`${FIELD} sm:max-w-xs`} placeholder="@handle" value={handle}
          onChange={(e) => setHandle(e.target.value)} aria-label="Handle the request is about" />
        <Button size="xs" variant="secondary" disabled={busy} onClick={() => void run()}>
          Produce the Art 15 response
        </Button>
      </div>

      {absent && (
        <StatutoryAbsence
          route="POST /v1/marketing/subject-access"
          consequence="No Art 15 access request can be answered from this product on this environment, and Art 12(3) allows one month from the date the subject asked."
        />
      )}
      {forbidden !== null && <NotPermitted what="Producing an Art 15 response" sentence={forbidden} />}
      {failed !== null && (
        <Refused r={apiReadRefusal(new Error(failed),
          'A failed access read is not an empty file. Do not tell a data subject that nothing is held about them on the strength of this screen.')} />
      )}

      {view && (
        <div className="space-y-1.5 border-l-2 border-line px-2 py-1.5">
          <p className="text-micro text-navy">
            <span className="font-mono font-bold">@{view.handleQueried}</span>
            <span className="ml-2 font-mono text-[10px] text-grey">
              {/* FROM THE SESSION. Art 15 is answered by a named human, and the name comes
                  from the authenticated principal rather than from a form field. */}
              answered by {view.fulfilledBy} at {view.fulfilledAt.slice(0, 16)}
            </span>
          </p>
          <AccessRows label="Queue rows (their messages)" rows={view.replies} />
          <AccessRows label="Drafts written in reply to them" rows={view.drafts} />
          <AccessRows label="Transfers to processors" rows={view.transfers} />
          <p className="text-[10px] leading-snug text-grey">
            <span className="font-semibold">Our own statements that reference them.</span>{' '}
            {view.recordsReferencing.length === 0
              ? 'None.'
              : `${view.recordsReferencing.length} — pointers only. LCX's own cleared statements are not the subject's personal data, so the record ids are listed and the statements are not: `}
            {view.recordsReferencing.length > 0 && (
              <span className="font-mono">
                {view.recordsReferencing.map((r) => `${r.record_uid} (${r.drafted_at.slice(0, 10)})`).join(', ')}
              </span>
            )}
          </p>
          {view.notes.length === 0 ? (
            <Nothing>
              The response carried no notes. An Art 15 answer with nothing to say about scope, exemptions or
              retention is probably incomplete — check it before it is sent.
            </Nothing>
          ) : (
            <ul className="space-y-0.5 text-[10px] leading-snug text-grey">
              {view.notes.map((n) => <li key={n}>· {n}</li>)}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/* ════════ ART 17 — ERASURE, WITH A RECEIPT ════════ */

/**
 * The five lawful bases, from the contract's own union.
 *
 * A SELECT AND NOT A FREE-TEXT BOX, unlike almost everything else on this desk, and for the
 * opposite reason: the basis is a legal classification that the engine branches on, so a
 * sentence in somebody's own words would be unenforceable at the point where it matters.
 * The operator's own words go in the note the engine returns to the subject.
 */
const BASES: readonly { readonly id: ErasureBasis; readonly label: string }[] = [
  { id: 'data_subject_request', label: 'The subject asked us to erase it' },
  { id: 'art_17_1_a_purpose_fulfilled', label: 'Art 17(1)(a) — the purpose it was collected for is fulfilled' },
  { id: 'art_17_1_b_consent_withdrawn', label: 'Art 17(1)(b) — consent withdrawn' },
  { id: 'art_17_1_c_objection', label: 'Art 17(1)(c) — the subject objected' },
  { id: 'retention_expiry', label: 'Retention expiry — the clock ran out' },
];

/** The basis union, named locally for readability. Declared in the contract, not here. */
type ErasureBasis = ErasureOutcome['basis'];

function Art17() {
  const [handle, setHandle] = useState('');
  const [basis, setBasis] = useState<ErasureBasis>('data_subject_request');
  const [busy, setBusy] = useState(false);
  const [absent, setAbsent] = useState(false);
  /* All three of these routes are `requireApprover`. A 403 is the control working, and it is
     held apart from `failed` so it cannot be rendered as a fault an operator should retry. */
  const [forbidden, setForbidden] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [view, setView] = useState<ErasureOutcome | null>(null);

  const ready = handle.replace(/^@/, '').trim() !== '';

  const run = async () => {
    setBusy(true); setAbsent(false); setForbidden(null); setFailed(null); setView(null);
    try {
      setView(await requestErasure({
        handle: handle.replace(/^@/, '').trim(),
        /* Overridden server-side from the session, exactly as Art 15's is. `decidedBy` on
           the receipt is the authenticated principal. */
        requestedBy: 'session',
        basis,
      }));
      toast('success', 'Erasure recorded. Read the receipt — what was kept is the half that matters.');
    } catch (e) {
      if (routeAbsent(e)) setAbsent(true);
      else if (notPermitted(e)) setForbidden(errorSentence(e));
      else setFailed(errorSentence(e));
    } finally { setBusy(false); }
  };

  return (
    <section className="space-y-1.5">
      <h4 className={H4}>Art 17 — erasure, and what is deliberately kept</h4>
      <p className="text-[10px] leading-snug text-grey">
        This is not a delete button. The stranger&apos;s words go — their queue rows, the drafts that cascade from
        them, and any excerpt of their message carried inside one of our records, which is NULLed and stamped. Our
        own cleared statements stay, under Art 17(3)(b), and the receipt reports that to the subject: keeping them
        silently would be the violation, keeping them and saying so is the lawful answer. What still links the two
        is a hash, not text.
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        <input className={FIELD} placeholder="@handle" value={handle}
          onChange={(e) => setHandle(e.target.value)} aria-label="Handle to erase" />
        <select className={FIELD} value={basis} aria-label="Lawful basis for the erasure"
          onChange={(e) => setBasis(e.target.value as ErasureBasis)}
        >
          {BASES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="xs" variant="secondary" disabled={busy || !ready} onClick={() => void run()}>
          Erase and produce the receipt
        </Button>
        {!ready && (
          <span className="text-[10px] leading-snug text-status-conditional">
            A handle is required. This control stays disabled rather than accepting a blank field, because an
            erasure aimed at nobody in particular is not a thing this desk can perform.
          </span>
        )}
      </div>

      {absent && (
        <StatutoryAbsence
          route="POST /v1/marketing/erasure"
          consequence="No Art 17 erasure can be performed or proven from this product on this environment, and the erasure log is empty here — so an erasure done by hand in the database would also be unprovable."
        />
      )}
      {forbidden !== null && <NotPermitted what="Performing an Art 17 erasure" sentence={forbidden} />}
      {failed !== null && (
        <Refused r={apiReadRefusal(new Error(failed),
          'A failed erasure is an erasure that did NOT happen. Do not report completion to the data subject on the strength of this screen.')} />
      )}

      {view && (
        <div className="space-y-1.5 border-l-2 border-status-ready/60 px-2 py-1.5" data-testid="mkt-erasure-receipt">
          <p className="font-mono text-[10px] text-grey">
            @{view.handleQueried} · decided by {view.decidedBy} · {view.erasedAt.slice(0, 16)} · basis {view.basis}
          </p>
          <table className="w-full border-collapse">
            <caption className="sr-only">Erasure receipt</caption>
            <thead><tr><Th>What</Th><Th align="right">Rows</Th></tr></thead>
            <tbody>
              <tr className="border-b border-line/70">
                <Td>Their queue rows, erased</Td>
                <Td align="right"><span className="font-mono tabular-nums">{view.repliesErased}</span></Td>
              </tr>
              <tr className="border-b border-line/70">
                <Td>Drafts written in reply, erased</Td>
                <Td align="right"><span className="font-mono tabular-nums">{view.draftsErased}</span></Td>
              </tr>
              <tr className="border-b border-line/70">
                <Td>Excerpts of their message minimised inside our records</Td>
                <Td align="right"><span className="font-mono tabular-nums">{view.excerptsMinimised}</span></Td>
              </tr>
              <tr className="border-b border-line/70">
                <Td>
                  <span className="font-semibold text-navy">Our own statements KEPT</span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-grey">
                    {/* THE HALF THAT MATTERS, AND IT NEEDS ITS EXEMPTION BESIDE IT. A count of
                        retained rows with no stated basis is a retention nobody can defend. */}
                    {view.retainedBasis
                      ?? (view.recordsRetained > 0
                        ? 'NO EXEMPTION WAS STATED for these retained records. Do not send this receipt: retention with no cited basis is the violation, not the erasure.'
                        : 'Nothing was retained, so no exemption was relied on.')}
                  </span>
                </Td>
                <Td align="right">
                  <span className={view.recordsRetained > 0 && view.retainedBasis === null
                    ? 'font-mono font-bold tabular-nums text-status-blocked'
                    : 'font-mono tabular-nums'}
                  >
                    {view.recordsRetained}
                  </span>
                </Td>
              </tr>
            </tbody>
          </table>
          {/* THE SENTENCE SENT TO THE SUBJECT, verbatim from the engine. It is not a log line
              and it is not paraphrased on the way to the screen. */}
          <p className="border-l-2 border-line px-2 py-1 text-micro leading-snug text-navy">{view.explanation}</p>
        </div>
      )}
    </section>
  );
}

/* ════════ ART 68(9) — THE FIVE-YEAR CLOCK NOBODY STARTS ════════ */

function LongClock() {
  const [itemId, setItemId] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [absent, setAbsent] = useState(false);
  /* All three of these routes are `requireApprover`. A 403 is the control working, and it is
     held apart from `failed` so it cannot be rendered as a fault an operator should retry. */
  const [forbidden, setForbidden] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [view, setView] = useState<MarketingRecordRow | null>(null);

  const run = async () => {
    if (itemId.trim() === '' || text.trim() === '') {
      toast('error', 'The item id and the text as published are both required.');
      return;
    }
    setBusy(true); setAbsent(false); setForbidden(null); setFailed(null); setView(null);
    try {
      const row = await recordOwnStatement({
        itemId: itemId.trim(),
        text: text.trim(),
        /* From the session server-side, as everywhere else on this desk. */
        recordedBy: 'session',
      });
      setView(row);
      /* `created: false` IS NOT A FAILURE. The route is idempotent on a content-derived
         uid, so a retry of the same statement is harmless and says so — which matters
         because the alternative reading ("it didn't work") invites a second paste with a
         changed character, and then there are two records of one statement. */
      toast('success', row.created
        ? 'On the long clock. This row now survives the inbound sweep.'
        : 'Already on the long clock — this exact statement was recorded before. Nothing changed.');
    } catch (e) {
      if (routeAbsent(e)) setAbsent(true);
      else if (notPermitted(e)) setForbidden(errorSentence(e));
      else setFailed(errorSentence(e));
    } finally { setBusy(false); }
  };

  return (
    <section className="space-y-1.5">
      <h4 className={H4}>Art 68(9) — put one of our own statements on the long clock</h4>
      <p role="note" className="border-l-2 border-status-blocked/50 bg-status-blocked-bg px-2 py-1.5 text-micro leading-snug text-status-blocked">
        <strong>The retention split is wired in one direction only.</strong>
        <span className="mt-1 block text-[10px] leading-snug text-grey">
          The {MARKETING_INBOUND_RETENTION_DAYS}-day inbound sweep runs. Until this form is used, nothing places a
          statement on the long clock — so on day {MARKETING_INBOUND_RETENTION_DAYS + 1} this compartment retains
          nothing at all: not the third-party content it is right to delete, and not the statements LCX itself made.
          Every statement not recorded here is one this desk will be unable to produce.
        </span>
      </p>
      <p className="text-[10px] leading-snug text-grey">
        This records what a human ALREADY published, by hand, outside this system. It transmits nothing anywhere
        and there is no send behind it.
      </p>
      <input className={`${FIELD} sm:max-w-md`} placeholder="Item id — the draft or statement this records"
        value={itemId} onChange={(e) => setItemId(e.target.value)} aria-label="Item id" />
      <textarea className={`${FIELD} min-h-[64px]`} value={text} onChange={(e) => setText(e.target.value)}
        aria-label="The text as published"
        placeholder="The text exactly as it was published — not the approved draft" />
      <p className="text-[10px] leading-snug text-grey">
        Paste what was actually published, character for character. It is not defaulted from the approved draft,
        because the difference between the two is precisely the evidence a supervisor asks for and a default would
        assert they were equal.
      </p>
      <Button size="xs" variant="secondary" disabled={busy} onClick={() => void run()}>
        Record on the long clock
      </Button>

      {absent && (
        <StatutoryAbsence
          route="POST /v1/marketing/record"
          consequence="Nothing on this environment can place a statement on the long clock, so every statement made here will be swept with the inbound content."
        />
      )}
      {forbidden !== null && <NotPermitted what="Recording on the long clock" sentence={forbidden} />}
      {failed !== null && (
        <Refused r={apiReadRefusal(new Error(failed),
          'A failed write is not a stored record. This statement is still on the short clock and will be swept.')} />
      )}
      {view && (
        <div className="space-y-1 border-l-2 border-status-ready/60 px-2 py-1.5" data-testid="mkt-long-clock-receipt">
          <p className="font-mono text-[10px] text-grey">
            {view.recordUid} · {view.created ? 'newly recorded' : 'already recorded — unchanged'} ·{' '}
            {view.retention.cls} · {view.retention.years} years · expires {view.retention.expiresAt.slice(0, 10)}
          </p>
          <p className="text-[10px] leading-snug text-grey">basis · {view.retention.basis}</p>
          {/* THE CAVEAT TRAVELS WITH THE NUMBER. Five-to-seven years is INFERRED from Art
              68(9) with Art 88(1); MiCA states no express period for marketing
              communications. A reader has to learn it is inferred at the moment they learn
              the number, which is why the payload carries the sentence and this prints it. */}
          <p className="text-[10px] leading-snug text-status-conditional">{view.inferenceCaveat}</p>
          <p className="text-[10px] leading-snug text-status-conditional">{view.dpoRulingOutstanding}</p>
        </div>
      )}
    </section>
  );
}

/**
 * The three together, because they are three faces of one question: what does this desk
 * still hold, what must it delete, and what must it keep.
 */
export function SubjectRights() {
  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-navy">
        <Scale size={12} aria-hidden="true" /> Data subject rights and the retention clock
      </h3>
      <Art15 />
      <Art17 />
      <LongClock />
    </div>
  );
}
