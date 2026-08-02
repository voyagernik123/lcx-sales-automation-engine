import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { Button } from '@/components/ui';
import { PrintStyles } from '@/components/report/PrintStyles';
import { isMigrated } from '@/lib/api/meta';
import {
  fetchDrafts, fetchMarketingQueue, fetchMarketingSummary,
  type MarketingDraft, type MarketingReply, type MarketingSummary, type ReplyStatus,
} from '@/lib/api/marketing';
/**
 * THE MARKETING VOCABULARY IS IMPORTED BY RELATIVE PATH, and deliberately.
 *
 * `packages/shared/package.json` exposes exactly one entry point (`"."` →
 * `src/index.ts`). There is now a `src/marketing/index.ts` sub-barrel that
 * re-exports `./types.js`, but `src/index.ts` does not re-export it, and the package
 * declares no `./marketing` subpath — so `@lcx/shared/marketing` resolves for
 * neither `tsc` nor Vite. The agents that wrote these modules were forbidden to
 * touch `src/index.ts`, and so am I: a human wiring pass owns every barrel and route
 * file.
 *
 * The alternative was to restate these constants locally, which is exactly the
 * duplication that lets a record page and an engine disagree about how many years
 * Art 68(9) means. Reaching into the source of truth is the smaller sin: this
 * module is types and constants with no I/O, so it needs no server and cannot
 * drift. Precedent and the same reasoning: `pages/GpsConflict.tsx:23-46`.
 */
import {
  MICA_RECORD_RETENTION_MAX_YEARS, MICA_RECORD_RETENTION_YEARS,
  RETENTION_RULING_OUTSTANDING, RETENTION_RULING_QUESTION,
  type AuthorshipProvenance,
} from '../../../../packages/shared/src/marketing/types';

/**
 * THE RECORD — LCX MARKETING M7. The produce-on-demand bundle.
 *
 * WHAT THIS SCREEN IS FOR. MiCA Art 8(2) is a PRODUCE-ON-DEMAND duty, not a
 * filing duty: marketing communications "shall, upon request, be notified to the
 * competent authority of the home Member State AND to the competent authority of
 * the host Member State, when addressing prospective holders ... in those Member
 * States". Art 8(3) confirms competent authorities "shall not require prior
 * approval" — which is exactly why the retrospective record is the binding
 * obligation and not a nice-to-have. Art 68(9) sets what the record must be
 * sufficient for: "to ascertain whether crypto-asset service providers have
 * complied with all obligations including those with respect to clients or
 * prospective clients and to the integrity of the market", kept "for a period of
 * five years and, where requested by the competent authority before five years
 * have elapsed, for a period of up to seven years".
 *
 * So the request that this screen answers is not "show me your tweets". It is
 * *reproduce this communication, with who wrote it, who cleared it, which claims
 * at which version, what the desk knew at the time, and every refusal that
 * fired* — and it can arrive from ANY EEA host authority, not only the FMA.
 *
 * WHY THE FIRST THING ON THE PAGE IS A LIST OF WHAT IS MISSING. Because it is,
 * and the alternative is worse. A bundle that quietly omits the fields it cannot
 * reconstruct is an assertion of completeness, and handing an assertion of
 * completeness to a supervisor is a materially worse act than handing over an
 * incomplete bundle that names its own gaps. §1 is therefore the face of the
 * artefact: the sixteen evidentiary fields, each marked present, partial or
 * absent, each absence carrying the reason and the file and line where the
 * absence lives. Every one of those readings was checked against the source in
 * this repository, not assumed.
 *
 * THE RETENTION CONTRADICTION IS REAL AND IS NOT RESOLVED HERE (§2). Art 68(9)
 * wants five years, extensible to seven. This compartment deletes at ninety
 * days: `MARKETING_RETENTION_DAYS` defaults to 90
 * (`apps/api/src/marketing/service.ts:15`), `retention_expires_at` is written per
 * row at insert, and `sweepExpired` is `DELETE FROM marketing_x_reply WHERE
 * retention_expires_at < now()` (`apps/api/src/marketing/service.ts:289`) — a
 * hard delete with no tombstone, no reason and no count retained. Those two
 * numbers cannot both be right. This screen does not pick a winner; it shows the
 * operator which of their material is inside which regime and states that the
 * ruling is outstanding and whose it is. A DPO ruling is not an engineering
 * decision.
 *
 * WHAT THIS SCREEN DELIBERATELY DOES NOT DO:
 *  · It does not publish, post, send, schedule or hold a credential. There is no
 *    such affordance in this compartment and none may be added here. `Export` on
 *    this page means "print the bundle"; the browser's print pipeline is the only
 *    egress.
 *  · It shows no impressions, reach, follower delta, engagement rate,
 *    click-through, share of voice or audience sentiment. Every one of those needs
 *    a denominator that does not exist without an X credential, and there is no X
 *    credential and never will be. The only counts here are counts of the desk's
 *    OWN corpus — items this compartment holds — which is a population we do have
 *    in full, and they are labelled as that and nothing wider.
 *  · It does not recompute anything as at today and present it as at then. Where
 *    a fact would have to be recomputed to be shown — an embargo state, a claim
 *    version, a regime classification — the field is reported ABSENT rather than
 *    filled with today's answer to a question that was asked months ago. A
 *    recomputed compliance fact has close to zero evidential value under Art 68(9)
 *    and putting one on this page would be the exact defect this wave exists to
 *    remove.
 *
 * HOUSE PATTERN NOTES, so the next edit does not undo them:
 *  · ONE CLOCK. `useAsOf` reads the wall clock exactly once on mount. Two
 *    numbers on one printed page must not have been computed against two
 *    different instants.
 *  · NO `<header>` AND NO `<footer>` ELEMENT ANYWHERE. `PrintStyles` hides
 *    `header, aside, footer` in print (`components/report/PrintStyles.tsx`), so
 *    wrapping the as-of stamp in a `<header>` or the completeness caveats in a
 *    `<footer>` would silently delete them from the printed artefact — the two
 *    parts a supervisor most needs. They are `<section>`s. `marketingRecord.test.tsx`
 *    fails if either element appears.
 *  · Third-party text is rendered as text, in `<pre>`, never through a
 *    prose formatter. React escapes it, so hostile markup is inert; and a record
 *    must reproduce bytes rather than a prettified reading of them.
 */

/* ════════ Time, read once ════════ */

/**
 * The single instant this artefact was generated at.
 *
 * Read once, on mount, and threaded everywhere. Retention arithmetic, window
 * bounds and the printed stamp all resolve against the same moment, so the top of
 * a printed page cannot disagree with the bottom of it.
 */
function useAsOf(): string {
  const [asOf] = useState(() => new Date().toISOString());
  return asOf;
}

/** ISO → `2026-08-02 14:22Z`. Never renders "Invalid Date" onto a compliance artefact. */
function stamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return `UNPARSEABLE (${iso})`;
  const d = new Date(t).toISOString();
  return `${d.slice(0, 10)} ${d.slice(11, 16)}Z`;
}

/** Whole days from `from` to `to`. `null` when either instant is unusable. */
function daysBetween(from: string | null | undefined, to: string | null | undefined): number | null {
  const a = from ? Date.parse(from) : NaN;
  const b = to ? Date.parse(to) : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.floor((b - a) / 86_400_000);
}

/* ════════ The two retention regimes, as constants with their sources ════════ */

/**
 * The Art 68(9) horizon comes from the shared vocabulary and is NOT restated here.
 *
 * `MICA_RECORD_RETENTION_YEARS` (5) and `MICA_RECORD_RETENTION_MAX_YEARS` (7) are
 * declared once, in `packages/shared/src/marketing/types.ts`, together with the
 * reasoning for why five is an inference from adjacent provisions rather than a
 * quotation of a marketing retention rule. A local copy here would be the way a
 * screen and an engine end up disagreeing about the number they both print.
 */
const ART_68_9_YEARS = MICA_RECORD_RETENTION_YEARS;

/**
 * What this compartment actually does today.
 *
 * `const RETENTION_DAYS = Number(process.env.MARKETING_RETENTION_DAYS ?? '90')`
 * — `apps/api/src/marketing/service.ts:15`. The value is baked into each row's
 * `retention_expires_at` at insert, so changing the environment variable does not
 * rescue rows already written. That is the reason this screen reads the per-row
 * column instead of recomputing from a constant: the constant is what the NEXT row
 * will get, and the column is what THIS row is actually subject to.
 */
export const DESK_SWEEP_DEFAULT_DAYS = 90;

/**
 * The sentence that states the conflict, in one place, so §1, §2 and the closing
 * statement cannot drift into three different versions of it.
 */
export const RETENTION_CONFLICT_SENTENCE =
  'Two retention regimes apply to the same rows and they disagree. MiCA Art 68(9) requires records sufficient to establish compliance to be kept five years, extensible to seven on a competent authority\'s request. This compartment deletes rows at MARKETING_RETENTION_DAYS, which defaults to 90 days (apps/api/src/marketing/service.ts:15), and the sweep is a hard DELETE with no tombstone, no reason and no retained count (apps/api/src/marketing/service.ts:289). After the sweep runs, an Art 8(2) request cannot be answered AND there is no record that anything was ever there to answer it with. The reconciliation is a DPO ruling, not an engineering decision, and it is outstanding.';

/* ════════ §1's data — the sixteen evidentiary fields ════════ */

/**
 * Whether the RECORD holds a field at all. A property of the schema, not of a row.
 *
 * Three values, and the middle one is the important one. `partial` means the
 * column exists and answers a weaker question than the one the authority asks —
 * which is a different finding from `absent`, and collapsing the two would let a
 * supervisor believe either that we have nothing (when we have something worth
 * producing) or that we have the answer (when we have an adjacent one).
 */
type FieldAvailability = 'present' | 'partial' | 'absent';

const AVAILABILITY_LABEL: Record<FieldAvailability, string> = {
  present: 'HELD',
  partial: 'PARTIAL',
  absent: 'NOT HELD',
};

/**
 * One of the sixteen things a defensible record has to answer, and whether this
 * one does.
 *
 * `holds` is the honest verdict; `basis` is what the record actually contains and
 * where, file and line, so the verdict is checkable rather than asserted; `costOf
 * Absence` is what a supervisor cannot be told, phrased as the consequence rather
 * than as a missing column, because "no `named_assets` column" means nothing to a
 * reader and "cannot answer: show me everything you ever said about TOKEN" means
 * everything.
 */
interface EvidentiaryField {
  readonly n: number;
  readonly field: string;
  /** The provision or doctrine that requires it. */
  readonly authority: string;
  readonly holds: FieldAvailability;
  readonly basis: string;
  readonly costOfAbsence: string;
}

/**
 * THE SIXTEEN FIELDS. Every `holds` value below was read off this repository, not
 * assumed, and the file:line references are the evidence for the reading. If one
 * becomes wrong because someone added a column, this table is wrong and
 * `marketingRecord.test.tsx` will not catch it — a schema change has to change
 * this table by hand. That is a real maintenance cost and it is accepted, because
 * the alternative is deriving completeness from the payload, which would report a
 * field as HELD the moment a column existed and was never populated.
 */
export const EVIDENTIARY_FIELDS: readonly EvidentiaryField[] = [
  {
    n: 1,
    field: 'Published text, exact bytes, with a content hash',
    authority: 'MiCA Art 68(9) — records "sufficient ... to ascertain whether [the CASP] complied"',
    holds: 'absent',
    basis:
      'Nothing in this compartment publishes, and there is no close-out step where a human pastes back what was actually posted. `marketing_reply_draft` holds what was APPROVED; no table holds what was PUBLISHED. Approval also flips the reply to `answered` (apps/api/src/marketing/service.ts:283) whether or not anything was ever sent, so `answered` is not evidence of publication either.',
    costOfAbsence:
      'The bundle can prove what the desk intended to say. It cannot prove what LCX actually said, which is the only text a supervisor is asking about.',
  },
  {
    n: 2,
    field: 'Draft text and the full edit chain, each version hashed',
    authority: 'MiCA Art 68(4)-(6) — effective policies and review',
    holds: 'partial',
    basis:
      'Every draft row is retained and `listDrafts` returns them newest-first (apps/api/src/marketing/service.ts:258), so successive re-drafts form a chain. But no version is hashed, and the desk has no edit box — `Marketing.tsx` renders draft text read-only and offers Approve or Re-draft — so the chain records the model being asked again, never a human revising a sentence.',
    costOfAbsence:
      'Cannot show that the approved version is the published version, because there is no hash to bind them and no published version to bind to.',
  },
  {
    n: 3,
    field: 'Parent-post snapshot: text, author handle, author id, timestamp',
    authority: 'MiCA Art 66(2) — "fair, clear and not misleading" is contextual',
    holds: 'partial',
    basis:
      'The INBOUND item is snapshotted (handle, display name, body, `posted_at`). The LCX post being replied to is not: `x_post_id` is stored as an id with no text, and it is nullable. Author IDs are never stored anywhere, only handles — and a handle is renameable, so it is not an identifier.',
    costOfAbsence:
      'If the parent post is edited or deleted, our reply reads as unprompted advice with no provocation on the record. And a renamed handle silently detaches the item from the person.',
  },
  {
    n: 4,
    field: 'Publication timestamp from the platform, and who pressed send',
    authority: 'MiCA Art 7(2) / Art 29(6) timing; Art 68(9)',
    holds: 'absent',
    basis:
      'No publication happens here, so neither field can exist. Note what `posted_at` is NOT: it is the third party\'s reply time, taken from the notification email\'s `Date` header (apps/api/src/marketing/xNotificationParse.ts:154), so it measures mail-forwarding latency rather than anything X asserted.',
    costOfAbsence:
      'Cannot prove a reply post-dated a white paper or an announcement — the Art 7(2) question — because there is no trusted publication instant on the record at all.',
  },
  {
    n: 5,
    field: 'Named assets, extracted and stored as a list',
    authority: 'MiCA Art 86(1) scope; Art 4(4); Art 7(2)',
    holds: 'absent',
    basis: 'No column, no extraction step, and no index. Assets are only ever present as free text inside a body.',
    costOfAbsence:
      'Cannot answer "show me everything you ever said about TOKEN", which is the shape of most market-abuse enquiries, and cannot scope a Title VI question to the assets it concerns.',
  },
  {
    n: 6,
    field: 'Per-asset embargo / inside-information state, as at approval',
    authority: 'MiCA Arts 87-90 — unlawful disclosure of inside information',
    holds: 'absent',
    basis:
      'There is no embargo register in this compartment and therefore nothing to snapshot. Recomputing it later would show today\'s state, which is worthless as evidence of what was known then.',
    costOfAbsence:
      'The highest-consequence question — was this asset under embargo when we posted about it — has no answer on the record, in either direction.',
  },
  {
    n: 7,
    field: 'Regime classification decided at approval time',
    authority: 'MiCA Art 7 / Art 66 / Title VI — which duties even applied',
    holds: 'absent',
    basis: 'No classification is performed and no field records one.',
    costOfAbsence: 'Cannot show which mandatory elements were required, so cannot show they were satisfied.',
  },
  {
    n: 8,
    field: 'Mandatory-element checklist result, stored as data',
    authority: 'MiCA Art 7(1); Art 66(3) risk warning and white-paper hyperlink',
    holds: 'absent',
    basis: 'No checklist exists in the record. `flagged` / `flag_reason` on a draft are the output sanitiser, which is a different question.',
    costOfAbsence: 'Compliance is asserted with no artefact behind the assertion.',
  },
  {
    n: 9,
    field: 'Approver identity, reason and timestamp, distinct from the drafter',
    authority: 'MiCA Art 68(4)-(6); Art 111(4) management liability; FINRA 2210(b)(4)(A)(iii)',
    holds: 'partial',
    basis:
      '`approved_by` and `approved_at` are written from the authenticated principal, never from the request body (apps/api/src/routes/marketing.ts:229) — which is right. Three gaps: there is no approval REASON field; the DRAFTER is not recorded at all, so approver-≠-drafter cannot be evidenced; and where no operator is resolved the code stores the literal string `unknown` (same line), which is a row that looks approved and names nobody.',
    costOfAbsence:
      '"The system approved it" is not a control, and neither is an approval attributed to `unknown`. Four-eyes cannot be evidenced without a recorded first pair of eyes.',
  },
  {
    n: 10,
    field: "Drafter's and approver's declared position in the named assets, as at approval",
    authority: 'MiCA Art 91(3)(c) — personal liability, fines from EUR 700 000 (Art 111(2)(d))',
    holds: 'absent',
    basis: 'There is no holdings declaration in this compartment, so there is nothing to snapshot and no field to snapshot it into.',
    costOfAbsence:
      'The single field that decides a market-manipulation question about a named individual is missing. A record that says "approved by nik@lcx.com" cannot answer "did nik hold it".',
  },
  {
    n: 11,
    field: 'Any link or CTA present, and its target',
    authority: 'ESMA35-1872330276-1899 GL 1 para 17 — education becomes promotion once the audience is directed to the firm',
    holds: 'partial',
    basis:
      'The output sanitiser strips links from model text and records `flagged` with a `flag_reason`, so a link having been present leaves a trace on the draft. It records that something was removed, not what the target was, and it says nothing about links in the inbound item.',
    costOfAbsence: 'Cannot show why an item was treated as non-promotional, because the thing that would have flipped it is not on the record.',
  },
  {
    n: 12,
    field: 'Partner / consideration status of the account replied to or amplified',
    authority: 'UCPD 2005/29/EC Annex I pt 11; Commission Guidance 2021/C 526/01 §4.2.6',
    holds: 'absent',
    basis: 'No partner register, no consideration field. Consideration of any kind — a comped ticket, an airdrop, a fee waiver — is invisible to this record.',
    costOfAbsence: 'Cannot show that amplifying a partner was not an undisclosed paid promotion.',
  },
  {
    n: 13,
    field: 'Disclosure text actually present, and whether it was above the truncation fold',
    authority: 'Commission Guidance 2021/C 526/01 §4.2.6(d) — prominence, not mere presence',
    holds: 'absent',
    basis: 'Neither the disclosure text nor its position is recorded, and since no published text is captured (field 1) there is nothing to measure a fold against.',
    costOfAbsence: '"We had a disclaimer" is not "the disclosure was prominent", and only the second one is the duty.',
  },
  {
    n: 14,
    field: 'Deletion or withdrawal event, with reason and timestamp, record retained',
    authority: 'MiCA Art 68(9) — the retention duty survives the takedown',
    holds: 'absent',
    basis:
      'No deletion event is modelled. Worse in this compartment than in most: the retention sweep is `DELETE FROM marketing_x_reply WHERE retention_expires_at < now()` (apps/api/src/marketing/service.ts:289), so the ROW is what gets deleted, leaving no tombstone that anything was ever held.',
    costOfAbsence:
      'Deleting a post destroys the only evidence the desk behaved well — and here the sweep destroys the evidence that there was ever anything to evidence.',
  },
  {
    n: 15,
    field: 'Escalation state where a market-abuse suspicion was raised',
    authority: 'MiCA Art 92(1) — report "without delay"',
    holds: 'absent',
    basis: 'No escalation field and no escalation path in this compartment.',
    costOfAbsence: 'No audit trail that a suspicion was handled rather than edited away.',
  },
  {
    n: 16,
    field: 'Retention clock, five years from publication, with a legal hold to seven',
    authority: 'MiCA Art 68(9) second subparagraph',
    holds: 'partial',
    basis:
      '`retention_expires_at` is a real per-row column, set at insert, and the sweep is driven by it — so a retention clock genuinely exists. It encodes the wrong horizon (90 days by default) and there is no legal-hold flag of any kind, so a competent authority\'s request cannot be recorded against the rows it protects.',
    costOfAbsence: 'Records expire mid-investigation, and there is no mechanism to stop them.',
  },
] as const;

/* ════════ Reading the corpus ════════ */

/**
 * Every status, fetched EXPLICITLY.
 *
 * Not an optimisation — a correctness requirement. `listReplies` with no status
 * filters to `WHERE status IN ('new','triaged','drafted')`
 * (apps/api/src/marketing/service.ts:205-209), so the unfiltered read silently
 * excludes exactly the two statuses a record request is most likely to be about:
 * the items that were answered and the items the desk decided to ignore. A bundle
 * built from the default read would omit them and look complete.
 */
export const RECORD_STATUSES: readonly ReplyStatus[] = ['new', 'triaged', 'drafted', 'answered', 'ignored'];

/**
 * How many rows one status read can return.
 *
 * The server clamps `limit` into [1, 200] and defaults it to 50
 * (apps/api/src/routes/marketing.ts:59, apps/api/src/marketing/service.ts:198),
 * and `fetchMarketingQueue` accepts no limit argument at all
 * (`lib/api/marketing.ts`, and that file belongs to the wiring pass, not to this
 * screen). So this bundle sees at most fifty rows per status and there is no way to
 * ask for more from here.
 *
 * That is a real ceiling on a produce-on-demand artefact, so it is not hidden: §1
 * compares each status's fetched count against the server's own SQL `GROUP BY`
 * count from `/summary` and states the shortfall in rows. A truncated bundle that
 * says it is truncated is producible; one that does not is a misrepresentation.
 */
export const PER_STATUS_ROW_CEILING = 50;

/**
 * How many per-item clearance chains this screen will read in one pass.
 *
 * `GET /:id/drafts` is one request per item. Sixty is well past the volume this
 * desk runs at, and a stated cap is better than an unbounded fan-out that
 * eventually times out and renders a SHORT bundle — because a bundle missing items
 * reads as a bundle with nothing to report.
 */
export const DRAFT_FETCH_CAP = 60;

/**
 * What happened when this screen tried to read one item's clearance chain.
 *
 * `failed` and an empty chain are different facts and must never collapse. An
 * empty chain means nobody ever drafted a reply to this item, which is a
 * legitimate and common state. A failed read means this screen does not know, and
 * saying "no drafts" there would fabricate a silence log entry.
 */
type ChainState = 'loaded' | 'failed' | 'over_cap' | 'not_migrated';

const CHAIN_STATE_SENTENCE: Record<ChainState, string> = {
  loaded: 'Clearance chain read.',
  failed:
    'CHAIN NOT READ — the request for this item\'s drafts failed. Any absence of clearance below is an absence of knowledge, not an absence of clearance.',
  over_cap: `NOT READ — beyond this screen's per-pass cap of ${DRAFT_FETCH_CAP} clearance chains. The item is listed; its drafts were not requested.`,
  not_migrated:
    'NOT MIGRATED — migration 0046 is not applied on this environment, so there is no marketing_reply_draft table to read.',
};

/**
 * Who wrote the words.
 *
 * FINRA 2210(b)(4)(A)(iii) requires the PREPARER to be named where there was no
 * approver, which is the rule assuming preparer and approver are different people
 * and forcing the record to say which one it had. The transferable distinction is
 * three-valued: authored by a human, authored by a model and then edited by a
 * human, authored by a model and left as-is. The third value should be
 * un-approvable by policy, because an unedited model artefact has no human
 * preparer to put on the record.
 *
 * THERE IS NO `human` VALUE HERE AND THAT IS THE FINDING, not an omission. This
 * compartment has no compose box and no edit box: `Marketing.tsx` renders draft
 * text read-only and offers Approve, Copy or Re-draft. So no path exists by which
 * a human's own sentence becomes an approved draft, and every approved draft in
 * the record is an unedited machine artefact — the class the doctrine says must
 * not be approvable.
 */
type Authorship = AuthorshipProvenance | 'deterministic_template' | 'not_recorded';

/**
 * Built ON the shared `AuthorshipProvenance` rather than beside it, so the three
 * values the vocabulary owns keep their meaning here, and only the two states that
 * are properties of THIS RECORD are added: `deterministic_template` (the
 * no-AI-key draft path, which is code and not a person either) and `not_recorded`
 * (no draft row at all).
 *
 * `human` and `model_edited_by_human` are in the union and are UNREACHABLE from
 * this data. They are kept rather than excluded so the label table below names them
 * — a reader can then see that the two honest outcomes are missing, instead of
 * seeing a two-value enum and assuming that is all there is.
 */
const AUTHORSHIP_LABEL: Record<Authorship, string> = {
  human: 'HUMAN (unreachable — no compose box exists)',
  model_edited_by_human: 'MODEL, HUMAN-EDITED (unreachable — no edit box exists)',
  model_unedited: 'MODEL, UNEDITED',
  deterministic_template: 'TEMPLATE, UNEDITED',
  not_recorded: 'NO DRAFT RECORDED',
};

export const HUMAN_AUTHORSHIP_IS_UNREACHABLE = true;

export const HUMAN_AUTHORSHIP_UNREACHABLE_REASON =
  'No item in this record can be authored by a human. The desk surface renders draft text read-only and offers Approve, Copy or Re-draft; there is no compose box and no edit box anywhere in the compartment. So every approved draft is an unedited machine artefact with no human preparer to name — the class FINRA 2210(b)(4)(A)(iii) forces you to record and which should not be approvable at all. The approvals below are real; the authorship behind them is not a person.';

/**
 * Whether four-eyes is evidenced on one item.
 *
 * Two variants, and there is deliberately no `achieved` one. Four-eyes is not
 * "two names appeared": it is a differently-qualified second person, evidenced.
 * This record stores an approver and does not store a drafter, so the first pair
 * of eyes is missing from every row by construction and no data in this schema
 * could produce an `achieved` verdict. Adding that variant would invite someone to
 * make it reachable by inference, which is the failure the doctrine names — four
 * eyes degrading into four eyes on an earlier draft, or on nobody.
 */
type FourEyesVerdict =
  | { readonly kind: 'no_clearance_to_assess'; readonly sentence: string }
  | { readonly kind: 'not_evidenced'; readonly sentence: string };

/** One item of the bundle: the communication, its chain, and the verdicts on it. */
interface BundleItem {
  readonly reply: MarketingReply;
  readonly drafts: readonly MarketingDraft[];
  readonly chain: ChainState;
  /** The approved draft, where there is exactly one. */
  readonly approved: MarketingDraft | null;
  /** More than one approved draft on the same item — a contradiction worth naming. */
  readonly multipleApprovals: boolean;
  readonly authorship: Authorship;
  readonly fourEyes: FourEyesVerdict;
  /** `retention_expires_at`, read defensively — see `readRetentionExpiry`. */
  readonly sweepAt: string | null;
  /** `received_at` plus the Art 68(9) five-year horizon. */
  readonly artHorizonAt: string | null;
  /** True where the sweep would destroy the row before Art 68(9)'s horizon. */
  readonly retentionConflict: boolean;
  /** Whole days from the as-of instant to the sweep. Negative means already due. */
  readonly daysToSweep: number | null;
}

/**
 * `retention_expires_at` IS in the payload and is NOT in the declared type.
 *
 * The queue route returns the rows straight from `SELECT *`
 * (apps/api/src/routes/marketing.ts:60), so every column arrives — including
 * `retention_expires_at`, which `MarketingReply` in `lib/api/marketing.ts` does not
 * declare — the wiring pass declared `raw_email` for exactly this reason and did not
 * declare this column, so the omission is an oversight rather than a policy. This screen needs it: it is the only per-row statement of which
 * retention regime a row is actually subject to, and recomputing it from the
 * environment default would describe the row the NEXT insert will create rather
 * than this one.
 *
 * Read defensively rather than by widening the shared type, because that file is
 * the wiring pass's. The narrow read is safe in both directions: a missing field
 * yields `null`, which §2 renders as "not recorded" and never as "not expiring".
 */
function readRetentionExpiry(row: MarketingReply): string | null {
  const v = (row as unknown as Record<string, unknown>).retention_expires_at;
  if (typeof v !== 'string' || v.trim() === '') return null;
  return Number.isFinite(Date.parse(v)) ? v : null;
}

/** `received_at` + five years, as an instant. `null` when `received_at` is unusable. */
function artHorizon(receivedAt: string): string | null {
  const t = Date.parse(receivedAt);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  d.setUTCFullYear(d.getUTCFullYear() + ART_68_9_YEARS);
  return d.toISOString();
}

/** The approver string the API writes when no operator could be resolved. */
export const UNRESOLVED_APPROVER = 'unknown';

function assessFourEyes(approved: MarketingDraft | null): FourEyesVerdict {
  if (approved === null) {
    return {
      kind: 'no_clearance_to_assess',
      sentence:
        'No approved draft on this item, so there is no clearance to assess. This is not a failure — an ignored or still-open item is correctly unapproved.',
    };
  }
  const named = (approved.approved_by ?? '').trim();
  if (named === '' || named === UNRESOLVED_APPROVER) {
    return {
      kind: 'not_evidenced',
      sentence:
        `FOUR-EYES NOT ACHIEVED, AND THE APPROVER IS NOT NAMED. This draft is marked approved with approved_by = "${named === '' ? '' : named}", which is what the API writes when no operator could be resolved (apps/api/src/routes/marketing.ts:229). A row that looks approved and names nobody is not a control. The drafter is not recorded either, so neither pair of eyes exists on this record.`,
    };
  }
  return {
    kind: 'not_evidenced',
    sentence:
      `FOUR-EYES NOT ACHIEVED. One name is on this record — ${named}, as approver — and the drafter is not recorded anywhere in the schema, so approver-is-not-drafter cannot be evidenced. Separately, sign-in is a shared passcode and a second shared passcode admits any @lcx.com address, so that name identifies a session and not a person. The clearance is real; the second pair of eyes is not on the record.`,
  };
}

function buildItem(reply: MarketingReply, drafts: readonly MarketingDraft[], chain: ChainState, asOf: string): BundleItem {
  const approvedAll = drafts.filter((d) => d.status === 'approved');
  const approved = approvedAll[0] ?? null;
  const authorship: Authorship = approved === null
    ? (drafts.length === 0 ? 'not_recorded' : (drafts[0]!.used_llm ? 'model_unedited' : 'deterministic_template'))
    : (approved.used_llm ? 'model_unedited' : 'deterministic_template');
  const sweepAt = readRetentionExpiry(reply);
  const artHorizonAt = artHorizon(reply.received_at);
  const conflict = sweepAt !== null && artHorizonAt !== null && Date.parse(sweepAt) < Date.parse(artHorizonAt);
  return {
    reply,
    drafts,
    chain,
    approved,
    multipleApprovals: approvedAll.length > 1,
    authorship,
    fourEyes: assessFourEyes(approved),
    sweepAt,
    artHorizonAt,
    retentionConflict: conflict,
    daysToSweep: daysBetween(asOf, sweepAt),
  };
}

/** What one status read returned, against what the server says it holds. */
interface StatusCoverage {
  readonly status: ReplyStatus;
  readonly fetched: number;
  /** The server's own SQL `GROUP BY status` count, or `null` if the summary read failed. */
  readonly reported: number | null;
  /** True where the read hit the row ceiling, so the shortfall is a truncation. */
  readonly truncated: boolean;
}

function errText(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return typeof e === 'string' && e ? e : 'unknown error';
}

/* ════════ The screen ════════ */

export function MarketingRecord() {
  const asOf = useAsOf();
  const [summary, setSummary] = useState<MarketingSummary | null>(null);
  const [items, setItems] = useState<BundleItem[] | null>(null);
  const [coverage, setCoverage] = useState<readonly StatusCoverage[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notMigrated, setNotMigrated] = useState(false);
  const [overCap, setOverCap] = useState(0);
  /** Ids that came back under two different statuses in one pass. See the note in `load`. */
  const [statusRace, setStatusRace] = useState<readonly number[]>([]);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      /*
       * THE SUMMARY READ IS ALLOWED TO FAIL, and its failure is rendered.
       *
       * It supplies one thing: the server's own SQL `GROUP BY status` count, which
       * is the denominator §1 compares this pass against. Losing it must not take
       * the bundle down — an incomplete bundle is producible and a blank page is
       * not — so the error is deliberately absent from state here and its
       * consequence is stated instead: `coverage-no-denominator` says the bundle
       * cannot establish its own completeness in either direction and must be
       * treated as incomplete. That is the honest degradation, not a quiet one.
       */
      const sum = await fetchMarketingSummary().catch(() => null);
      setSummary(sum);

      /*
       * FIVE READS, ONE PER STATUS, run in parallel. See RECORD_STATUSES for why
       * the unfiltered read cannot be used.
       */
      const reads = await Promise.all(
        RECORD_STATUSES.map(async (status) => ({
          status,
          rows: await fetchMarketingQueue(status),
        })),
      );

      const unmigrated = (sum?.migrated === false)
        || reads.some((r) => isMigrated(r.rows) === false);
      setNotMigrated(unmigrated);

      setCoverage(reads.map(({ status, rows }) => ({
        status,
        fetched: rows.length,
        reported: sum ? (sum.counts[status] ?? 0) : null,
        truncated: rows.length >= PER_STATUS_ROW_CEILING,
      })));

      /*
       * DEDUPE, AND REPORT THE RACE RATHER THAN HIDE IT.
       *
       * The five reads are five statements about a table that other people are
       * using. An item approved between read three and read four appears under
       * both `drafted` and `answered`; an item approved between read four and read
       * five appears under neither. The first is visible here and is reported; the
       * second is not detectable from this side at all, which is why §1 compares
       * every status against the server's own count instead of trusting the sum of
       * these five reads.
       */
      const byId = new Map<number, MarketingReply>();
      const doubled: number[] = [];
      for (const { rows } of reads) {
        for (const row of rows) {
          if (byId.has(row.id)) doubled.push(row.id);
          else byId.set(row.id, row);
        }
      }
      setStatusRace([...new Set(doubled)]);

      // Chronological, oldest first, id as the tiebreak — so two rows received in
      // the same millisecond cannot swap places between two printings of the same
      // bundle.
      const ordered = [...byId.values()].sort(
        (a, b) => a.received_at.localeCompare(b.received_at) || a.id - b.id,
      );

      const within = ordered.slice(0, DRAFT_FETCH_CAP);
      setOverCap(Math.max(0, ordered.length - within.length));

      const chains = new Map<number, MarketingDraft[]>();
      const states = new Map<number, ChainState>();
      // Small serial batches. This is a print-once artefact, not a hot path, and
      // sixty parallel requests to render a page nobody reloads is the wrong trade.
      // No lint suppression here: `no-await-in-loop` is not enabled in this
      // workspace (`apps/web/.eslintrc.cjs` extends `eslint:recommended` only), so
      // the disable comment this pattern usually carries would be a no-op that
      // reads as a rule being silenced.
      for (let i = 0; i < within.length; i += 6) {
        const batch = within.slice(i, i + 6);
        await Promise.all(batch.map(async (row) => {
          try {
            const rows = await fetchDrafts(row.id);
            if (isMigrated(rows) === false) { states.set(row.id, 'not_migrated'); return; }
            chains.set(row.id, rows);
            states.set(row.id, 'loaded');
          } catch (e) {
            states.set(row.id, 'failed');
            // Kept rather than swallowed: the row will say CHAIN NOT READ, and the
            // console line is what tells a developer which id and why.
            console.error('[marketing-record] drafts read failed', row.id, e);
          }
        }));
      }

      setItems(ordered.map((row) => buildItem(
        row,
        chains.get(row.id) ?? [],
        states.get(row.id) ?? 'over_cap',
        asOf,
      )));
    } catch (e) {
      setLoadError(errText(e));
      setItems(null);
    }
  }, [asOf]);

  useEffect(() => { void load(); }, [load]);

  /**
   * The window, applied to `received_at`.
   *
   * Art 8(2) is per-authority and per-audience, so the honest unit of production
   * is "what was visible to prospective holders in Member State X during period
   * Y". This screen can do Y and cannot do X: no column records audience,
   * targeting or the jurisdictions a communication was addressed to, so the bundle
   * cannot be narrowed to a host Member State. §4 says that in those words rather
   * than offering a filter that would silently mean something else.
   */
  const windowed = useMemo(() => {
    if (items === null) return null;
    const fromT = from ? Date.parse(`${from}T00:00:00.000Z`) : null;
    const toT = to ? Date.parse(`${to}T23:59:59.999Z`) : null;
    return items.filter((it) => {
      const t = Date.parse(it.reply.received_at);
      if (!Number.isFinite(t)) return true; // never drop a row for an unreadable date
      if (fromT !== null && Number.isFinite(fromT) && t < fromT) return false;
      if (toT !== null && Number.isFinite(toT) && t > toT) return false;
      return true;
    });
  }, [items, from, to]);

  const excluded = items && windowed ? items.length - windowed.length : 0;

  const tallies = useMemo(() => {
    const t = {
      total: 0, approved: 0, modelUnedited: 0, unnamedApprover: 0,
      retentionConflict: 0, sweepDue: 0, chainUnread: 0, multipleApprovals: 0,
    };
    for (const it of windowed ?? []) {
      t.total += 1;
      if (it.approved) t.approved += 1;
      if (it.approved && it.authorship === 'model_unedited') t.modelUnedited += 1;
      if (it.approved && ((it.approved.approved_by ?? '').trim() === '' || it.approved.approved_by === UNRESOLVED_APPROVER)) t.unnamedApprover += 1;
      if (it.retentionConflict) t.retentionConflict += 1;
      if (it.daysToSweep !== null && it.daysToSweep <= 0) t.sweepDue += 1;
      if (it.chain !== 'loaded') t.chainUnread += 1;
      if (it.multipleApprovals) t.multipleApprovals += 1;
    }
    return t;
  }, [windowed]);

  const allOpen = !!windowed && windowed.length > 0 && windowed.every((it) => open[it.reply.id]);
  const toggle = useCallback((id: number) => { setOpen((o) => ({ ...o, [id]: !o[id] })); }, []);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 text-navy">
      <PrintStyles />
      <RecordPrintStyles />

      {/*
        A DIV, NOT A <header>. `PrintStyles` hides `header, aside, footer` in print,
        so the as-of stamp would vanish from the printed bundle — the one line that
        makes it an artefact rather than a screenshot. Same reason the closing
        statement at the bottom is a <section>.
      */}
      <div className="border-b-2 border-navy pb-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-mono text-[17px] font-bold uppercase tracking-wider">The record</h1>
          <span className="font-mono text-micro uppercase tracking-wider text-grey">
            LCX Marketing · MiCA Art 8(2) produce-on-demand bundle · Art 68(9) retention
          </span>
          <span className="ml-auto font-mono text-micro tabular-nums text-grey" data-testid="record-asof">
            AS OF {stamp(asOf)}
          </span>
          <span className="br-no-print flex gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setOpen(allOpen ? {} : Object.fromEntries((windowed ?? []).map((it) => [it.reply.id, true])))}
            >
              {allOpen ? 'Collapse all' : 'Expand all'}
            </Button>
            {/* Print needs no preparation: every item's evidence prints whether or
                not it is open on screen (see `ItemEvidence`). */}
            <Button size="sm" variant="secondary" onClick={() => window.print()}>Print the bundle</Button>
          </span>
        </div>
        <div className="mt-1 font-mono text-micro tabular-nums text-grey" data-testid="record-tallies">
          ITEMS IN BUNDLE {tallies.total}
          {' · '}APPROVED {tallies.approved}
          {' · '}
          <span className={clsx(tallies.modelUnedited > 0 && 'font-bold text-status-blocked')}>
            APPROVED MACHINE TEXT, UNEDITED {tallies.modelUnedited}
          </span>
          {' · '}
          <span className={clsx(tallies.unnamedApprover > 0 && 'font-bold text-status-blocked')}>
            APPROVER NOT NAMED {tallies.unnamedApprover}
          </span>
          {' · '}
          <span className={clsx(tallies.retentionConflict > 0 && 'font-bold text-status-blocked')}>
            INSIDE THE 90-DAY SWEEP, OWED FIVE YEARS {tallies.retentionConflict}
          </span>
          {' · '}
          <span className={clsx(tallies.sweepDue > 0 && 'font-bold text-status-blocked')}>
            SWEEP ALREADY DUE {tallies.sweepDue}
          </span>
          {tallies.chainUnread > 0 && <>{' · '}CLEARANCE CHAIN NOT READ {tallies.chainUnread}</>}
        </div>
      </div>

      {notMigrated && (
        <Notice tone="blocked" testid="record-not-migrated" title="This compartment is INERT here — 0046_marketing.sql is not applied">
          The API reports LCX Marketing as not migrated on this environment, so there is no
          marketing_x_reply table and no marketing_reply_draft table to read. An empty bundle
          below is therefore evidence of NOTHING — not of a clean record, and not of a desk with
          nothing to produce. It must not be handed to anyone as either. §1 and §2 describe the
          schema and the retention conflict and are unaffected: they are statements about the
          code, and need no database.
        </Notice>
      )}

      {loadError && (
        <Notice tone="blocked" testid="record-load-error" title="The bundle could not be assembled">
          {loadError}
          {' — nothing below is a complete record of anything. '}
          <button type="button" className="br-no-print underline focus-ring" onClick={() => void load()}>retry</button>
        </Notice>
      )}

      {statusRace.length > 0 && (
        <Notice tone="conditional" testid="record-status-race" title={`${statusRace.length} item(s) came back under two statuses in one pass`}>
          {`Item id(s) ${statusRace.join(', ')} appeared in more than one status read. The five reads are five `}
          statements about a table other people are using, and an item whose status changed between
          two of them can appear twice — or, undetectably from this side, not at all. The bundle
          keeps the first copy it saw. Do not read the per-status counts in §1 as a snapshot of one
          instant.
        </Notice>
      )}

      {overCap > 0 && (
        <Notice tone="conditional" testid="record-over-cap" title={`${overCap} item(s) beyond the clearance-chain cap`}>
          {`This screen reads at most ${DRAFT_FETCH_CAP} clearance chains in one pass. ${overCap} item(s) `}
          are listed WITHOUT their drafts and approvals, marked NOT READ. They are not items without
          clearance; this screen has not looked.
        </Notice>
      )}

      <CompletenessSection coverage={coverage} summaryRead={summary !== null} />
      <RetentionSection items={windowed} asOf={asOf} conflictCount={tallies.retentionConflict} />
      <BundleSection
        items={windowed}
        open={open}
        toggle={toggle}
        migrated={!notMigrated}
        from={from}
        to={to}
        onFrom={setFrom}
        onTo={setTo}
        excluded={excluded}
      />
      <WindowSection asOf={asOf} from={from} to={to} held={items?.length ?? null} />
      <ClosingStatement asOf={asOf} tallies={tallies} />
    </div>
  );
}

/* ════════ Presentation atoms — dense, mono, no cards on evidence ════════ */

const TH = 'whitespace-nowrap border-b border-navy px-1.5 py-1 text-left align-bottom font-mono text-[10px] font-bold uppercase tracking-wider text-grey';
const TD = 'border-b border-line/70 px-1.5 py-1 align-top font-mono text-micro';

type Tone = 'blocked' | 'conditional' | 'ready' | 'deferred';

const TONE_BORDER: Record<Tone, string> = {
  blocked: 'border-status-blocked bg-status-blocked-bg',
  conditional: 'border-status-conditional bg-status-conditional-bg',
  ready: 'border-status-ready bg-status-ready-bg',
  deferred: 'border-line bg-status-deferred-bg',
};

const TONE_TEXT: Record<Tone, string> = {
  blocked: 'text-status-blocked',
  conditional: 'text-status-conditional',
  ready: 'text-status-ready',
  deferred: 'text-grey',
};

/**
 * A held field is `ready`; a partial one is `conditional`; an absent one is
 * `blocked`. Absence is the loudest state on this page on purpose — it is the
 * thing a supervisor is entitled to be told without reading a table twice.
 */
const AVAILABILITY_TONE: Record<FieldAvailability, Tone> = {
  present: 'ready',
  partial: 'conditional',
  absent: 'blocked',
};

function Notice(props: { tone: Tone; title: string; testid?: string; children: ReactNode }) {
  return (
    <div data-testid={props.testid} className={clsx('mt-2 border-l-4 px-2 py-1.5', TONE_BORDER[props.tone])}>
      <div className={clsx('font-mono text-[10px] font-bold uppercase tracking-wider', TONE_TEXT[props.tone])}>
        {props.title}
      </div>
      <div className="mt-0.5 font-mono text-micro leading-relaxed text-grey-dark">{props.children}</div>
    </div>
  );
}

function SectionHead(props: { n: string; title: string; note?: ReactNode }) {
  return (
    <div className="mt-6 border-b-2 border-navy pb-1">
      <h2 className="font-mono text-label font-bold uppercase tracking-wider">
        <span className="text-grey">{props.n}</span> {props.title}
      </h2>
      {props.note && <div className="mt-0.5 font-mono text-micro leading-relaxed text-grey">{props.note}</div>}
    </div>
  );
}

/**
 * Text reproduced as stored. `<pre>` and nothing else: React escapes the content,
 * so hostile markup in a stranger's reply is inert, and a record has to reproduce
 * bytes rather than a prettified reading of them. Never truncated, never elided —
 * an elided record is not a record.
 */
function Verbatim(props: { label: string; text: string; testid?: string }) {
  return (
    <div className="mt-1.5">
      <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-grey">
        {props.label} — VERBATIM, AS STORED
      </div>
      <pre
        data-testid={props.testid}
        className="mt-0.5 whitespace-pre-wrap break-words border-l-2 border-line bg-ice-soft/50 px-2 py-1 font-mono text-micro leading-relaxed text-navy dark:bg-ice-soft/10"
      >{props.text}</pre>
    </div>
  );
}

function Pair(props: { k: string; v: ReactNode }) {
  return (
    <div className="flex gap-1.5">
      <span className="w-[188px] shrink-0 font-mono text-[10px] uppercase tracking-wider text-grey">{props.k}</span>
      <span className="font-mono text-micro text-navy">{props.v}</span>
    </div>
  );
}

/* ════════ §1 — WHAT THIS BUNDLE CAN AND CANNOT RECONSTRUCT ════════ */

/**
 * The completeness declaration, and it is FIRST for the reason in the file header:
 * an incomplete bundle that names its gaps is producible, and one that does not is
 * a misrepresentation.
 *
 * Two independent things are declared here, and they answer different questions.
 * The field table answers "which of the sixteen evidentiary fields does the schema
 * hold at all", which is a statement about the code. The coverage table answers
 * "did this screen actually read every row the server says exists", which is a
 * statement about this pass — and it is checked against the server's own SQL
 * `GROUP BY status` count rather than against the sum of the reads, because a read
 * that hit its ceiling would otherwise agree with itself.
 */
function CompletenessSection(props: { coverage: readonly StatusCoverage[]; summaryRead: boolean }) {
  const held = EVIDENTIARY_FIELDS.filter((f) => f.holds === 'present').length;
  const partial = EVIDENTIARY_FIELDS.filter((f) => f.holds === 'partial').length;
  const absent = EVIDENTIARY_FIELDS.filter((f) => f.holds === 'absent').length;
  const shortfall = props.coverage.reduce(
    (n, c) => n + (c.reported === null ? 0 : Math.max(0, c.reported - c.fetched)),
    0,
  );

  return (
    <>
      <SectionHead
        n="§1"
        title="Completeness, stated on the face of the bundle"
        note={
          <>
            MiCA Art 68(9) requires records "sufficient to enable competent authorities ... to
            ascertain whether crypto-asset service providers have complied with all obligations".
            Sixteen fields make one communication reconstructable. This record holds{' '}
            <strong>{held} in full, {partial} in part, and {absent} not at all</strong>. Every
            verdict below was read off this repository at the file and line given; a schema change
            makes this table wrong and no test can detect that, so it is maintained by hand.
          </>
        }
      />

      <Notice tone="blocked" testid="completeness-headline" title="What a supervisor must be told before reading anything below">
        This bundle cannot reproduce any communication AS PUBLISHED. Nothing in this compartment
        publishes and no step records what a human actually posted, so field 1 is absent for every
        item without exception. What the bundle does hold is what arrived, what was drafted, and
        who approved it. That is worth producing and it is not what Art 8(2) asks for, and those
        two sentences belong together.
      </Notice>

      {HUMAN_AUTHORSHIP_IS_UNREACHABLE && (
        <Notice tone="blocked" testid="authorship-unreachable" title="No item in this record was written by a human">
          {HUMAN_AUTHORSHIP_UNREACHABLE_REASON}
        </Notice>
      )}

      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={TH}>#</th>
              <th className={TH}>Field</th>
              <th className={TH}>Held</th>
              <th className={TH}>Required by</th>
              <th className={TH}>What the record actually contains</th>
              <th className={TH}>What cannot be answered</th>
            </tr>
          </thead>
          <tbody data-testid="completeness-fields">
            {EVIDENTIARY_FIELDS.map((f) => (
              <tr key={f.n} data-field-n={f.n} data-holds={f.holds}>
                <td className={clsx(TD, 'tabular-nums text-grey')}>{f.n}</td>
                <td className={clsx(TD, 'font-bold')}>{f.field}</td>
                <td className={clsx(TD, 'whitespace-nowrap font-bold', TONE_TEXT[AVAILABILITY_TONE[f.holds]])}>
                  {AVAILABILITY_LABEL[f.holds]}
                </td>
                <td className={clsx(TD, 'text-grey')}>{f.authority}</td>
                <td className={clsx(TD, 'text-grey-dark')}>{f.basis}</td>
                <td className={clsx(TD, 'text-grey-dark')}>{f.costOfAbsence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 font-mono text-[10px] font-bold uppercase tracking-wider text-grey">
        Did this pass read everything the server holds?
      </div>
      {!props.summaryRead && (
        <Notice tone="blocked" testid="coverage-no-denominator" title="No denominator — the summary read failed">
          The per-status counts below are what this screen fetched. Without the server's own SQL
          count there is nothing to compare them against, so this bundle cannot state whether it is
          complete in either direction. Treat it as incomplete.
        </Notice>
      )}
      <div className="mt-1.5 overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={TH}>Status</th>
              <th className={TH}>Rows in this bundle</th>
              <th className={TH}>Rows the server counts</th>
              <th className={TH}>Reading</th>
            </tr>
          </thead>
          <tbody data-testid="coverage-rows">
            {props.coverage.map((c) => {
              const miss = c.reported === null ? null : Math.max(0, c.reported - c.fetched);
              return (
                <tr key={c.status} data-coverage-status={c.status}>
                  <td className={clsx(TD, 'font-bold')}>{c.status}</td>
                  <td className={clsx(TD, 'tabular-nums')}>{c.fetched}</td>
                  <td className={clsx(TD, 'tabular-nums')}>{c.reported === null ? 'NOT READ' : c.reported}</td>
                  <td className={clsx(TD, miss !== null && miss > 0 ? 'font-bold text-status-blocked' : 'text-grey')}>
                    {miss === null
                      ? 'Cannot tell — no server count to compare against.'
                      : miss === 0
                        ? 'Complete for this status.'
                        : `${miss} row(s) NOT IN THIS BUNDLE.${c.truncated ? ` The read returned ${c.fetched}, which is this screen's ceiling — the bundle is truncated, not empty.` : ' The read did not hit its ceiling, so the gap is a change in the table between the two reads, not truncation.'}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {shortfall > 0 && (
        <Notice tone="blocked" testid="coverage-shortfall" title={`${shortfall} row(s) the server holds are not in this bundle`}>
          {`This screen reads at most ${PER_STATUS_ROW_CEILING} rows per status and cannot ask for more: `}
          <span className="font-mono">fetchMarketingQueue</span> takes no limit argument
          (lib/api/marketing.ts) and that file belongs to the wiring pass. The bundle is
          therefore a TRUNCATED production and must be described as one. Producing it to an
          authority without this sentence attached would misrepresent it.
        </Notice>
      )}
    </>
  );
}

/* ════════ §2 — THE TWO RETENTION REGIMES, AND WHICH ONE EACH ROW IS UNDER ════════ */

/**
 * Which regime a row is actually living under.
 *
 * `swept_before_horizon` is the interesting one and it is the default outcome, not
 * an edge case: with the ninety-day default every row is scheduled for deletion
 * roughly four and three-quarter years before the horizon Art 68(9) implies. So
 * this is not a warning about a few unlucky rows; it is a statement that the two
 * regimes are incompatible across the whole corpus.
 */
type RetentionVerdict = 'swept_before_horizon' | 'sweep_due' | 'not_recorded' | 'horizon_unreadable';

const RETENTION_VERDICT_LABEL: Record<RetentionVerdict, string> = {
  sweep_due: 'SWEEP ALREADY DUE',
  swept_before_horizon: 'DELETED BEFORE THE FIVE-YEAR HORIZON',
  not_recorded: 'REGIME NOT RECORDED',
  horizon_unreadable: 'HORIZON NOT COMPUTABLE',
};

const RETENTION_VERDICT_TONE: Record<RetentionVerdict, Tone> = {
  sweep_due: 'blocked',
  swept_before_horizon: 'blocked',
  not_recorded: 'conditional',
  horizon_unreadable: 'conditional',
};

function retentionVerdict(it: BundleItem): RetentionVerdict {
  if (it.sweepAt === null) return 'not_recorded';
  if (it.artHorizonAt === null) return 'horizon_unreadable';
  if (it.daysToSweep !== null && it.daysToSweep <= 0) return 'sweep_due';
  return it.retentionConflict ? 'swept_before_horizon' : 'horizon_unreadable';
}

function RetentionSection(props: { items: readonly BundleItem[] | null; asOf: string; conflictCount: number }) {
  return (
    <>
      <SectionHead
        n="§2"
        title="Retention — five years against ninety days"
        note={
          <>
            Art 68(9) second subparagraph: records "shall be kept for a period of{' '}
            <strong>five years</strong> and, where requested by the competent authority before five
            years have elapsed, for a period of up to <strong>seven years</strong>". This
            compartment deletes at ninety days. Both statements are true of the same rows, which is
            why this section exists rather than a single number somewhere.
          </>
        }
      />

      <Notice tone="blocked" testid="retention-conflict" title="The two regimes are incompatible and the ruling is outstanding">
        {RETENTION_CONFLICT_SENTENCE}
      </Notice>

      <Notice tone="conditional" testid="retention-gap-honest" title="Five years is a reading, not a quotation">
        MiCA sets no express retention period for a CASP&apos;s MARKETING communications. Art 68(9)
        is the only five-year figure it gives for CASP records, and Art 88(1) independently requires
        inside information to be maintained "for a period of at least five years". Five, extensible
        to seven, is therefore the defensible horizon and it is an inference from adjacent
        provisions — stated here as one so that nobody later cites this screen as if it quoted a
        marketing retention rule.
      </Notice>

      <Notice tone="blocked" testid="retention-invisible-loss" title="What has already been deleted cannot appear here at all">
        The sweep is a row DELETE, so a swept item leaves nothing behind — no tombstone, no id, no
        reason, no date. The one number that would say how much has gone is
        <span className="font-mono"> swept</span>, returned in the cron tick&apos;s HTTP response
        (apps/api/src/routes/marketing.ts:155) and persisted nowhere. So this bundle cannot tell an
        authority how much material once existed for the period it is being asked about, and neither
        can anything else in this system. That is the sharpest consequence of the conflict above.
      </Notice>

      {props.items === null ? (
        <p className="mt-2 font-mono text-micro text-grey">Reading the corpus…</p>
      ) : props.items.length === 0 ? (
        <Notice tone="conditional" testid="retention-empty" title="No rows in the window — which is not the same as no material">
          There is nothing in the current window to place in a regime. That is a statement about the
          window and about what this desk holds today; it is not a statement that no communication
          was made in the period, because a swept row is indistinguishable from a row that never
          existed.
        </Notice>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>Item</th>
                <th className={TH}>Received</th>
                <th className={TH}>Deleted by this desk on</th>
                <th className={TH}>Days left</th>
                <th className={TH}>Art 68(9) horizon (received + 5y)</th>
                <th className={TH}>Regime</th>
              </tr>
            </thead>
            <tbody data-testid="retention-rows">
              {props.items.map((it) => {
                const v = retentionVerdict(it);
                return (
                  <tr key={it.reply.id} data-retention-verdict={v}>
                    <td className={clsx(TD, 'tabular-nums text-grey')}>#{it.reply.id}</td>
                    <td className={clsx(TD, 'whitespace-nowrap tabular-nums')}>{stamp(it.reply.received_at)}</td>
                    <td className={clsx(TD, 'whitespace-nowrap tabular-nums')}>
                      {it.sweepAt === null ? 'NOT RECORDED' : stamp(it.sweepAt)}
                    </td>
                    <td className={clsx(TD, 'tabular-nums', it.daysToSweep !== null && it.daysToSweep <= 0 && 'font-bold text-status-blocked')}>
                      {it.daysToSweep === null ? '—' : it.daysToSweep}
                    </td>
                    <td className={clsx(TD, 'whitespace-nowrap tabular-nums text-grey')}>
                      {it.artHorizonAt === null ? 'NOT COMPUTABLE' : stamp(it.artHorizonAt)}
                    </td>
                    <td className={clsx(TD, 'font-bold', TONE_TEXT[RETENTION_VERDICT_TONE[v]])}>
                      {RETENTION_VERDICT_LABEL[v]}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-1.5 font-mono text-micro leading-relaxed text-grey" data-testid="retention-owner">
        {props.conflictCount > 0
          ? `${props.conflictCount} of the item(s) above are scheduled for deletion before the horizon Art 68(9) implies. `
          : ''}
        {RETENTION_RULING_OUTSTANDING
          ? `The outstanding question is a single ruling and it belongs to the DPO, not to this screen: ${RETENTION_RULING_QUESTION} `
          : 'The retention ruling is recorded as settled in the shared vocabulary; this screen has not been updated to reflect it, which is itself a defect. '}
        Until it is answered the working assumption is to retain LCX&apos;s own statements for the
        full period — up to {MICA_RECORD_RETENTION_MAX_YEARS} years on a competent authority&apos;s
        request — and to minimise third-party content. That assumption is not implemented anywhere
        in this code, which is why every row above still reads as it does.
      </p>
    </>
  );
}

/* ════════ §3 — THE BUNDLE ════════ */

const DATE_INPUT = 'rounded border border-line bg-card px-2 py-1 font-mono text-micro text-navy focus-ring';

function BundleSection(props: {
  items: readonly BundleItem[] | null;
  open: Record<number, boolean>;
  toggle: (id: number) => void;
  migrated: boolean;
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  excluded: number;
}) {
  return (
    <>
      <SectionHead
        n="§3"
        title="The bundle — one entry per communication held"
        note={
          <>
            Each entry reproduces what arrived, what was drafted from it, and who approved which
            version. Every entry prints in full whether or not it is expanded on screen. What no
            entry contains is the text as published — see §1 field 1.
          </>
        }
      />

      <div className="br-no-print mt-2 flex flex-wrap items-center gap-2">
        <label className="font-mono text-[10px] uppercase tracking-wider text-grey" htmlFor="record-from">
          Window from
        </label>
        <input id="record-from" type="date" className={DATE_INPUT} value={props.from} onChange={(e) => props.onFrom(e.target.value)} />
        <label className="font-mono text-[10px] uppercase tracking-wider text-grey" htmlFor="record-to">to</label>
        <input id="record-to" type="date" className={DATE_INPUT} value={props.to} onChange={(e) => props.onTo(e.target.value)} />
        <span className="font-mono text-micro text-grey">
          on <span className="font-mono">received_at</span> — the instant this desk learned of the item
        </span>
      </div>
      {props.excluded > 0 && (
        <p className="mt-1 font-mono text-micro text-grey" data-testid="window-excluded">
          {props.excluded} held item(s) fall outside this window and are excluded from every count on
          this page. Clear the dates to produce the whole held corpus.
        </p>
      )}

      {props.items === null ? (
        <p className="mt-2 font-mono text-micro text-grey">Assembling…</p>
      ) : props.items.length === 0 ? (
        <Notice
          tone="conditional"
          testid="bundle-empty"
          title={props.migrated ? 'Nothing to produce for this window' : 'Nothing readable — the compartment is not migrated here'}
        >
          {props.migrated
            ? 'This desk holds no item matching the current window. That is a statement about what this desk holds, not a statement that LCX published nothing in the period: this compartment only ever saw replies that reached its notification mailbox, and rows past their ninety-day expiry have been deleted without trace.'
            : 'The tables do not exist on this environment, so this screen has read nothing at all. An empty bundle here is a failure to read, not a finding.'}
        </Notice>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>Item</th>
                <th className={TH}>Received</th>
                <th className={TH}>From</th>
                <th className={TH}>Status</th>
                <th className={TH}>Inbound grade</th>
                <th className={TH}>Authorship</th>
                <th className={TH}>Approved by</th>
                <th className={TH}>Four eyes</th>
                <th className={TH}>Chain</th>
              </tr>
            </thead>
            <tbody data-testid="bundle-rows">
              {props.items.map((it) => (
                <ItemRows key={it.reply.id} item={it} open={!!props.open[it.reply.id]} toggle={props.toggle} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/**
 * One item: a summary row, then its evidence row.
 *
 * The evidence row is ALWAYS in the DOM and is hidden on screen with a class that
 * the print stylesheet unsets, rather than being conditionally rendered. That is
 * the difference between an artefact you can print and one you have to remember to
 * prepare: ⌘P from a collapsed table would otherwise produce a bundle of headings
 * with no evidence under them.
 */
function ItemRows(props: { item: BundleItem; open: boolean; toggle: (id: number) => void }) {
  const it = props.item;
  const approver = (it.approved?.approved_by ?? '').trim();
  const approverUnnamed = it.approved !== null && (approver === '' || approver === UNRESOLVED_APPROVER);
  return (
    <>
      <tr data-bundle-item={it.reply.id}>
        <td className={clsx(TD, 'tabular-nums')}>
          <button
            type="button"
            className="br-no-print underline focus-ring"
            aria-expanded={props.open}
            onClick={() => props.toggle(it.reply.id)}
          >
            #{it.reply.id}
          </button>
          <span className="hidden print:inline">#{it.reply.id}</span>
        </td>
        <td className={clsx(TD, 'whitespace-nowrap tabular-nums')}>{stamp(it.reply.received_at)}</td>
        <td className={TD}>@{it.reply.author_handle}</td>
        <td className={TD}>{it.reply.status}</td>
        <td className={clsx(TD, 'whitespace-nowrap text-grey')}>
          {it.reply.source_grade} · {it.reply.source_kind}
          {it.reply.parse_failed && <span className="ml-1 font-bold text-status-conditional">UNPARSED</span>}
        </td>
        <td className={clsx(TD, 'whitespace-nowrap font-bold', it.authorship === 'model_unedited' ? 'text-status-blocked' : 'text-grey-dark')}>
          {AUTHORSHIP_LABEL[it.authorship]}
        </td>
        <td className={clsx(TD, approverUnnamed && 'font-bold text-status-blocked')}>
          {it.approved === null ? '—' : (approver === '' ? '(blank)' : approver)}
          {it.approved?.approved_at ? ` · ${stamp(it.approved.approved_at)}` : ''}
        </td>
        <td className={clsx(TD, 'font-bold text-status-blocked')}>
          {it.fourEyes.kind === 'no_clearance_to_assess' ? 'N/A' : 'NOT ACHIEVED'}
        </td>
        <td className={clsx(TD, it.chain === 'loaded' ? 'text-grey' : 'font-bold text-status-conditional')}>
          {it.chain === 'loaded' ? `${it.drafts.length} draft(s)` : 'NOT READ'}
        </td>
      </tr>
      <tr className={clsx('record-evidence', !props.open && 'record-evidence-closed')}>
        <td className={clsx(TD, 'bg-ice-soft/30 dark:bg-ice-soft/5')} colSpan={9}>
          <ItemEvidence item={it} />
        </td>
      </tr>
    </>
  );
}

function ItemEvidence(props: { item: BundleItem }) {
  const it = props.item;
  return (
    <div className="space-y-1.5 py-1">
      <Pair k="Inbound permalink" v={
        it.reply.x_comment_id.startsWith('manual:') || it.reply.x_comment_id.startsWith('unparsed:')
          ? `${it.reply.x_comment_id} — NOT A PLATFORM ID. This item was entered by hand or could not be parsed, so there is no permalink to re-read it at.`
          : `x.com/${it.reply.author_handle}/status/${it.reply.x_comment_id} — STORED ID, RECONSTRUCTED URL. The path is built from the handle, and a renamed handle makes this link point at the wrong profile.`
      } />
      <Pair k="Parent LCX post" v={it.reply.x_post_id ?? 'NOT RECORDED — the notification did not identify the parent, or the parser could not read it. §1 field 3.'} />
      <Pair k="Posted at (claimed)" v={
        it.reply.posted_at === null
          ? 'NOT RECORDED. The queue falls back to received_at, which flatters the desk by exactly the mail-forwarding delay.'
          : `${stamp(it.reply.posted_at)} — taken from the notification email's Date header, not from X. This is when the mail was stamped, not when the reply was posted.`
      } />
      <Pair k="Sentiment" v={
        it.reply.sentiment === null
          ? 'NOT RECORDED. The column is declared in 0046_marketing.sql and nothing in the compartment ever writes it, so its emptiness carries no information.'
          : it.reply.sentiment
      } />
      <Pair k="Retention" v={
        it.sweepAt === null
          ? 'NOT RECORDED in this payload.'
          : `deleted by this desk on ${stamp(it.sweepAt)}; Art 68(9) horizon ${it.artHorizonAt ? stamp(it.artHorizonAt) : 'NOT COMPUTABLE'}. §2.`
      } />
      <Pair k="Four eyes" v={<span className="text-status-blocked">{it.fourEyes.sentence}</span>} />
      {it.multipleApprovals && (
        <Pair k="Contradiction" v={
          <span className="font-bold text-status-blocked">
            MORE THAN ONE APPROVED DRAFT on this item. The schema permits it and nothing reconciles
            them, so the record does not say which approved text was the operative one.
          </span>
        } />
      )}

      <Verbatim
        label={`Inbound item as received from @${it.reply.author_handle}`}
        text={it.reply.body}
        testid={`inbound-${it.reply.id}`}
      />

      {it.chain !== 'loaded' ? (
        <p className="mt-1 font-mono text-micro font-bold text-status-conditional">
          {CHAIN_STATE_SENTENCE[it.chain]}
        </p>
      ) : it.drafts.length === 0 ? (
        <p className="mt-1 font-mono text-micro text-grey">
          No draft was ever recorded for this item. Where the item is <span className="font-mono">ignored</span>{' '}
          that is the silence itself — and the record holds no rationale for it, because no field
          exists to hold one. A decision not to answer is a decision, and this schema does not
          capture it.
        </p>
      ) : (
        it.drafts.map((d, i) => (
          <div key={d.id} className="mt-1.5 border-l-2 border-line pl-2">
            <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-grey">
              Draft {it.drafts.length - i} of {it.drafts.length} · id {d.id} · {d.status}
              {' · '}{d.used_llm ? 'model-generated' : 'deterministic template'}
              {' · created '}{stamp(d.created_at)}
              {d.status === 'approved' && ` · approved ${stamp(d.approved_at)} by ${(d.approved_by ?? '').trim() || '(blank)'}`}
            </div>
            {d.flagged && (
              <p className="mt-0.5 font-mono text-micro text-status-conditional">
                Output sanitiser: {d.flag_reason ?? '(no reason recorded)'} — a strip-and-flag on this
                draft&apos;s own text. It is not a refusal record and it is not a mandatory-element
                check; §1 fields 8 and 11.
              </p>
            )}
            <Verbatim label="Draft text" text={d.body} testid={`draft-${d.id}`} />
          </div>
        ))
      )}

      <p className="mt-1 font-mono text-micro leading-relaxed text-status-blocked">
        NOT RECONSTRUCTABLE FOR THIS ITEM: the text as published; the publication instant and who
        published it; the assets it named; their embargo state at approval; the regime that applied;
        the mandatory-element result; the drafter; the drafter&apos;s and approver&apos;s declared
        positions in those assets; any partner consideration; the disclosure text and its position;
        and every refusal that fired. Reasons and sources are in §1.
      </p>
    </div>
  );
}

/* ════════ §4 — THE WINDOW, AND WHAT IT COULD NOT SEE ════════ */

/**
 * Art 8(2) is per-authority AND per-audience: the unit of production is "what was
 * visible to prospective holders in Member State X during period Y". This screen
 * can narrow Y and cannot narrow X, and the reason is a missing column rather than
 * a missing feature — so the limitation is stated rather than papered over with a
 * jurisdiction selector that would quietly mean something else.
 */
function WindowSection(props: { asOf: string; from: string; to: string; held: number | null }) {
  return (
    <>
      <SectionHead
        n="§4"
        title="The window, and what this window could not see"
        note="Every figure on this page is a count of the desk's own corpus. None of them is a count of anything that happened on X."
      />
      <div className="mt-1.5 space-y-1">
        <Pair k="Window" v={
          props.from || props.to
            ? `${props.from || 'the earliest row held'} → ${props.to || 'now'}, on received_at`
            : 'the whole held corpus — no date bounds applied'
        } />
        <Pair k="Assembled at" v={stamp(props.asOf)} />
        <Pair k="Items held and read" v={props.held === null ? 'not yet read' : String(props.held)} />
        <Pair k="Population this is complete for" v="the desk's own queue and drafts — a census of our own corpus, in full, for the rows that still exist" />
      </div>

      <Notice tone="conditional" testid="window-cannot-see" title="What this window could not capture">
        <ul className="list-disc space-y-0.5 pl-4">
          <li>
            <strong>Any communication as published.</strong> No publication is recorded anywhere, so
            the bundle is a record of intent and clearance, not of speech.
          </li>
          <li>
            <strong>Which Member State an item was addressed to.</strong> Nothing records audience,
            targeting or addressed-to jurisdictions, so this bundle cannot be narrowed to a host
            authority&apos;s territory even though Art 8(2) contemplates exactly that request.
          </li>
          <li>
            <strong>Anything said about LCX that did not tag LCX.</strong> The only inbound channel
            is X&apos;s own notification mail, so the corpus is items that mentioned, replied to or
            quoted us AND triggered a notification AND survived the forwarding rule. It is a census
            of one edge type in a graph centred on ourselves, not a sample of any discourse.
          </li>
          <li>
            <strong>Anything already swept.</strong> Rows past their expiry are gone with no
            tombstone, so the earlier the window, the more silently incomplete it is. A window
            beginning more than ninety days ago is close to guaranteed to be missing material and
            this screen cannot say how much.
          </li>
          <li>
            <strong>How many people saw any of it.</strong> Impressions, reach, follower change,
            engagement rate, click-through, share of voice and aggregate audience sentiment all need
            a denominator that no keyless channel provides. They are absent here by design, not by
            omission, and no proxy stands in for them.
          </li>
        </ul>
      </Notice>
    </>
  );
}

/* ════════ The closing statement — what the bundle does not prove ════════ */

/**
 * A `<section>`, deliberately NOT a `<footer>`.
 *
 * `PrintStyles` hides `footer` in print. These are the paragraphs a supervisor most
 * needs to read on the paper copy, so putting them in a `<footer>` would delete
 * exactly the honesty from exactly the artefact that has to carry it.
 */
function ClosingStatement(props: {
  asOf: string;
  tallies: { total: number; approved: number; modelUnedited: number; unnamedApprover: number };
}) {
  return (
    <section className="mt-6 border-t-2 border-navy pt-2 font-mono text-micro leading-relaxed text-grey">
      <div data-testid="record-closing-asof">
        THE RECORD · LCX MARKETING · assembled {stamp(props.asOf)} · one observation, one clock ·{' '}
        {props.tallies.total} item(s), {props.tallies.approved} with an approval.
      </div>
      <div className="mt-1 font-bold uppercase tracking-wider text-status-blocked">
        What this bundle does not prove
      </div>
      <ol className="mt-0.5 list-decimal space-y-0.5 pl-4" data-testid="record-does-not-prove">
        <li>
          THAT ANYTHING WAS PUBLISHED. No publication path exists and no publication is recorded.
          An item marked <span className="font-mono">answered</span> was marked so by the approval
          itself (apps/api/src/marketing/service.ts:283), not by anything being sent.
        </li>
        <li>
          THAT ANYTHING PUBLISHED MATCHED WHAT WAS APPROVED. Approved text is not bound to a hash
          and the published text is not captured, so the two cannot be compared even in principle.
        </li>
        <li>
          WHO APPROVED. Sign-in is a shared passcode, and a second shared passcode admits any
          @lcx.com address. Every approver name is a dated record of a session, not evidence of which
          human acted.{props.tallies.unnamedApprover > 0
            ? ` ${props.tallies.unnamedApprover} approval(s) in this bundle name nobody at all.`
            : ''}
        </li>
        <li>
          THAT FOUR EYES WERE ON ANYTHING. The drafter is not recorded in this schema, so
          approver-is-not-drafter is unevidenceable for every row. This is stated as a failure rather
          than performed as a ceremony.
        </li>
        <li>
          THAT A HUMAN WROTE ANY OF IT. {props.tallies.modelUnedited > 0
            ? `${props.tallies.modelUnedited} approved item(s) here are unedited machine text.`
            : 'No approved item here could have been human-written; the desk has no edit box.'}
        </li>
        <li>
          THAT THE CORPUS IS COMPLETE. Reads are capped at {PER_STATUS_ROW_CEILING} rows per status,
          the ninety-day sweep deletes without trace, and the only inbound channel is a notification
          mailbox with no sender authentication. Absence here is never evidence of absence.
        </li>
        <li>
          THAT THIS SCREEN IS A LEGAL OPINION. Every provision cited was read from primary text by an
          engineer. Nothing here has been reviewed by counsel, and the five-year horizon in §2 is an
          inference from adjacent articles rather than a marketing retention rule MiCA states.
        </li>
      </ol>
    </section>
  );
}

/* ════════ Print ════════ */

/**
 * Bundle-specific print rules, on top of the shared chrome reset in `PrintStyles`.
 *
 * Three things, each of which was a defect in some other printable surface first:
 *
 *  1. EVERY ITEM'S EVIDENCE PRINTS. Collapsed evidence rows are hidden with
 *     `.record-evidence-closed`, and this block unsets that in print. So ⌘P from a
 *     fully collapsed table still yields a complete bundle. The alternative — only
 *     rendering open rows — makes the printed artefact depend on how the operator
 *     happened to leave the screen.
 *  2. NO ROW SPLITS ACROSS A PAGE BREAK. An evidence block cut in half mid-quote
 *     reads as a truncated record.
 *  3. THE `dark:` VARIANTS ON EVIDENCE BACKGROUNDS ARE NEUTRALISED. `PrintStyles`
 *     pins the colour tokens to their light values, but `.dark` stays on `<html>`,
 *     so a `dark:bg-*` utility still MATCHES and still paints. Pinning tokens alone
 *     is not sufficient; the variant has to be overridden by name.
 */
function RecordPrintStyles() {
  const css = `
.record-evidence-closed { display: none; }

@media print {
  .record-evidence-closed { display: table-row !important; }
  tr, .record-evidence { break-inside: avoid; page-break-inside: avoid; }
  table { width: 100% !important; }
  pre { white-space: pre-wrap !important; word-break: break-word !important; }
  /* The dark-variant utilities on evidence surfaces: the class is still on <html>
     in print, so these still match. Force paper. */
  .dark\\:bg-ice-soft\\/5, .dark\\:bg-ice-soft\\/10 { background: #fff !important; }
}
`;
  return <style data-testid="record-print-styles">{css}</style>;
}

export default MarketingRecord;
