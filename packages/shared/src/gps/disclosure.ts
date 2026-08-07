import type { ContractingEntity, ConflictDecision, OfferKey } from './types.js';
import { getOffer } from './catalogue.js';

/**
 * GPS PHASE 9.2/9.4 — DISCLOSURE TEXT AS VERSIONED POLICY.
 *
 * WHY THIS IS CODE AND A TABLE WOULD BE WORSE. Same argument as
 * `perimeter.ts:6` and `catalogue.ts:5`, with one addition specific to
 * disclosures: the value of a disclosure is entirely in being able to say, later
 * and in front of someone, *exactly* what the client was told. A `disclosures`
 * table with an `UPDATE` path silently rewrites history — the row that produced
 * the sentence a client read in March is gone by June, and the record now shows
 * a different sentence under the same id. Text in reviewed code with a version
 * number cannot do that: changing a word requires a diff, a reviewer and a
 * version bump, and the old text is recoverable from git forever.
 *
 * TWO THINGS ARE RECORDED PER ENGAGEMENT, NOT ONE.
 *  1. `GpsConflictCheck.disclosureTextUsed` (`types.ts:362`) — the text VERBATIM,
 *     because "the defensible record is what the client was actually told on the
 *     day".
 *  2. The template id AND VERSION that produced it — because verbatim text with
 *     no provenance cannot be checked against policy, and policy with no record
 *     of which version applied cannot be audited. `disclosureRecord()` below
 *     emits exactly that pair, and it is the thing a caller persists.
 *
 * A disclosure you cannot reproduce is not a disclosure. Hence: no template is
 * ever edited in place without a version bump (asserted by a test on the
 * library's own integrity), and `renderDisclosure` REFUSES an unknown id rather
 * than returning empty string — an empty disclosure is the failure mode that
 * looks like success all the way to the printer.
 */

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THESE TEXTS ARE NOT COUNSEL-REVIEWED. THEY ARE DRAFTS WITH A VERSION NUMBER.
 * ══════════════════════════════════════════════════════════════════════════════
 *  `CATALOGUE_TODOS` already carries this as an open item owned by
 *  `founder+counsel`: "Standard disclosure text for the conflict check, per
 *  contracting entity" (`catalogue.ts:518`). Until that lands, every surface
 *  rendering a disclosure must badge it, exactly as prices are badged
 *  (`PRICE_BANDS_ARE_PLACEHOLDERS`, `catalogue.ts:58`). They were written to be
 *  protective and are legally unreviewed; that is a fact about them, so it is
 *  data, not a comment nobody reads.
 */
export const DISCLOSURES_ARE_NOT_COUNSEL_REVIEWED = true;

export const DISCLOSURES_UNREVIEWED_REASON =
  'This disclosure wording is a versioned draft, not counsel-reviewed text. It is protective by intent and legally unverified. Counsel must review it before it is relied on, and the version used is recorded per engagement so the review can be applied retrospectively.';

/* ── The four things GPS never promises ────────────────────────────────────── */

/**
 * The four prohibited promises, as a closed union rather than prose.
 *
 * WHY AS DATA. The standing statement's text is COMPOSED from these sentences
 * (see `STANDING_STATEMENT_TEXT`), so their presence in the statement is a
 * structural guarantee instead of something a future editor could delete by
 * rewording a paragraph. A test asserts every sentence appears in the rendered
 * statement; if someone removes one from this record the test fails, and if
 * someone rewrites the paragraph the sentences are still interpolated.
 *
 * These mirror the four universal exclusions every offer already carries
 * (`catalogue.ts:107-112`) — same four prohibitions, stated as a standing
 * position of the person rather than as scope limits of a deliverable. The offer
 * exclusions protect the engagement; this protects the fact that the seller is
 * an employee of a regulated exchange.
 */
export type ProhibitedPromise =
  | 'listing_influence'
  | 'regulator_approval'
  | 'venue_admission'
  | 'market_making_outcome';

export const PROHIBITED_PROMISES: readonly ProhibitedPromise[] = [
  'listing_influence',
  'regulator_approval',
  'venue_admission',
  'market_making_outcome',
] as const;

export const PROHIBITED_PROMISE_LABEL: Record<ProhibitedPromise, string> = {
  listing_influence: 'No listing influence',
  regulator_approval: 'No regulator approval',
  venue_admission: 'No venue admission',
  market_making_outcome: 'No market-making outcome',
};

/** One sentence each. These are the sentences that appear in the standing statement. */
export const PROHIBITED_PROMISE_SENTENCE: Record<ProhibitedPromise, string> = {
  listing_influence:
    'No influence over any listing decision is offered, held out or exercised. Listing decisions at LCX and at every other venue are made under those venues\' own independent processes, and no fee paid for these services affects, accelerates or improves any such decision.',
  regulator_approval:
    'No regulatory approval, registration, authorisation, notification acceptance or supervisory outcome is promised, predicted or warranted, and no representation is made about how any competent authority will act.',
  venue_admission:
    'No admission to trading on any venue is included or implied, whether on LCX or elsewhere, and no application is made or supported on the client\'s behalf as part of these services.',
  market_making_outcome:
    'No market-making, liquidity provision, trading volume, token price, market capitalisation, exchange ranking or listing-timeline outcome is included, promised or forecast. Any introduction to a market maker is an introduction only, on that firm\'s own terms.',
};

/* ── Context and fields ───────────────────────────────────────────────────── */

/** A placeholder a template may reference. Closed, so a typo is a compile error. */
export type DisclosureField =
  | 'clientName'
  | 'asOf'
  | 'contractingEntity'
  | 'offerName'
  | 'jurisdiction';

/**
 * Everything a disclosure may be rendered from. Nothing else is reachable: a
 * template cannot interpolate an arbitrary caller-supplied string, which is what
 * keeps the compiled text compiled.
 */
export interface DisclosureContext {
  clientName: string;
  offerKey: OfferKey;
  contractingEntity: ContractingEntity;
  /** ISO instant. Every client-facing artifact is dated (D7). */
  asOf: string;
  /** Free text as the human typed it (`GpsClient.jurisdiction`, `types.ts:310`). */
  jurisdiction?: string | null;
  /** `'unresolved'` when no conflict check exists — never conflated with cleared. */
  conflictDecision: ConflictDecision | 'unresolved';
  /**
   * True when the counterparty is, or may become, an LCX listing applicant or
   * counterparty. Stated by a human; nothing infers it.
   */
  lcxAdjacent: boolean;
  /**
   * True when `perimeter.gateService` did not find a reviewed, current position
   * for this jurisdiction × offer. Drives the perimeter disclosure, so a client
   * is told the jurisdictional position is unestablished rather than being left
   * to assume it was checked.
   */
  perimeterUnreviewed: boolean;
}

/**
 * How the contracting entity is NAMED in client-facing text.
 *
 * Deliberately does not invent a legal entity name for `external`: decision D1
 * is unanswered (`types.ts:33-44`), and putting a made-up company name in a
 * disclosure would be the single worst possible place to invent a fact.
 */
export const CONTRACTING_ENTITY_DISCLOSURE_NAME: Record<ContractingEntity, string> = {
  lcx: 'LCX',
  external: 'a separate contracting entity, named in the engagement letter',
};

/* ── Templates ─────────────────────────────────────────────────────────────── */

export type DisclosureId =
  | 'gps-standing-employee-conflict'
  | 'gps-conflict-cleared-with-disclosure'
  | 'gps-legal-opinion-coordination'
  | 'gps-perimeter-unestablished';

export interface DisclosureTemplate {
  id: DisclosureId;
  /**
   * Bumped on ANY text change, however small. The version travels into the
   * engagement record, so an unbumped edit makes two different sentences share
   * one version number — the exact failure this file exists to prevent.
   */
  version: number;
  /** Internal name for the wall. Not client-facing. */
  title: string;
  /** Human-readable statement of when it is required. Rendered beside the text. */
  appliesWhenLabel: string;
  /** The predicate. Pure, total, no I/O. */
  appliesWhen: (ctx: DisclosureContext) => boolean;
  /**
   * Every placeholder the text uses. Declared rather than discovered so that a
   * template referencing an undeclared field is caught by
   * `unresolvedPlaceholders` at render time instead of shipping `{{foo}}` to a
   * client.
   */
  requires: readonly DisclosureField[];
  text: string;
}

const STANDING_STATEMENT_TEXT = [
  'GLOBAL SERVICES — STANDING STATEMENT OF WHAT IS NOT PROMISED',
  '',
  'This statement is given as of {{asOf}} in respect of {{offerName}} for {{clientName}}. The contracting party for these services is {{contractingEntity}}.',
  '',
  'The individual coordinating these services is an employee of LCX, a regulated exchange operator. That employment is disclosed here rather than left to be discovered, and the following four limits apply without exception and regardless of any statement made in conversation, in a proposal, or by anyone else:',
  '',
  ...PROHIBITED_PROMISES.map((p, i) => `${i + 1}. ${PROHIBITED_PROMISE_SENTENCE[p]}`),
  '',
  'These services are commercial and documentary work product delivered by named partners and specialists, coordinated by the individual named in the engagement letter. Nothing in them is legal, tax, accounting or investment advice, and nothing in them is a substitute for advice from your own qualified advisers.',
  '',
  'If anything said to you in the course of this engagement appears to conflict with the four limits above, the four limits above govern.',
].join('\n');

/** Every template. Order is display order on the conflict wall. */
export const DISCLOSURE_TEMPLATES: readonly DisclosureTemplate[] = [
  {
    id: 'gps-standing-employee-conflict',
    version: 1,
    title: 'Standing employee-conflict statement',
    appliesWhenLabel: 'Always. Every engagement, every offer, every jurisdiction.',
    // Compiled once, cited everywhere (plan §5, 9.4). There is no context in
    // which an exchange employee selling adjacent services may omit it, so the
    // predicate is a constant and not a condition somebody can fail to meet.
    appliesWhen: () => true,
    requires: ['asOf', 'offerName', 'clientName', 'contractingEntity'],
    text: STANDING_STATEMENT_TEXT,
  },
  {
    id: 'gps-conflict-cleared-with-disclosure',
    version: 1,
    title: 'Conflict cleared with disclosure — client wording',
    appliesWhenLabel: 'The recorded conflict decision is cleared_with_disclosure, or the client is LCX-adjacent.',
    appliesWhen: (ctx) => ctx.conflictDecision === 'cleared_with_disclosure' || ctx.lcxAdjacent,
    requires: ['clientName', 'asOf', 'contractingEntity'],
    text: [
      'CONFLICT DISCLOSURE',
      '',
      'As of {{asOf}}: the individual coordinating these services for {{clientName}} is employed by LCX, a regulated exchange operator, and these services are contracted through {{contractingEntity}}.',
      '',
      'A conflict check was performed and recorded before this engagement proceeded, and the outcome was to proceed WITH this disclosure. You are told this so that you can weigh it. It does not change any of the four limits in the standing statement accompanying this document, and in particular it confers no advantage of any kind in any listing or admission process at LCX or anywhere else.',
      '',
      'You may ask, at any time, for the recorded conflict position on this engagement, who decided it, and on what date.',
    ].join('\n'),
  },
  {
    id: 'gps-legal-opinion-coordination',
    version: 1,
    title: 'Legal-opinion coordination — role limit',
    appliesWhenLabel: 'The offer is legal_opinion_coordination.',
    appliesWhen: (ctx) => ctx.offerKey === 'legal_opinion_coordination',
    requires: ['asOf', 'clientName'],
    text: [
      'ROLE LIMIT — LEGAL-OPINION COORDINATION',
      '',
      'As of {{asOf}}, in respect of {{clientName}}: the opinion is the opinion of the instructed law firm, given to you on that firm\'s terms and subject to that firm\'s own limitations of liability. Our role is coordination — scoping the instruction, assembling the factual record, and managing timelines.',
      '',
      'We do not give the opinion, we do not review its conclusions, we do not endorse them, and we do not warrant that any authority, exchange or counterparty will accept them. Selection of counsel is yours; where we suggest firms, that is an introduction and not a recommendation.',
    ].join('\n'),
  },
  {
    id: 'gps-perimeter-unestablished',
    version: 1,
    title: 'Jurisdictional position not established',
    appliesWhenLabel: 'perimeter.gateService found no reviewed, current position for this jurisdiction and offer.',
    appliesWhen: (ctx) => ctx.perimeterUnreviewed,
    requires: ['asOf', 'jurisdiction', 'offerName'],
    text: [
      'JURISDICTIONAL POSITION NOT ESTABLISHED',
      '',
      'As of {{asOf}}, no reviewed jurisdictional position is on record for {{offerName}} in respect of {{jurisdiction}}.',
      '',
      'This is the absence of a determination, not a determination. It means only that no qualified person has yet recorded, sourced and signed a position on whether and how this work may be delivered there — it is neither a statement that the work is permissible nor a statement that it is not. Nothing in this engagement should be read as advice on that question, and if the answer matters to you, obtain it from your own qualified advisers in that jurisdiction.',
    ].join('\n'),
  },
];

/** Look up a template by id. Null for an unknown id — callers must handle it. */
export function getDisclosureTemplate(id: string): DisclosureTemplate | null {
  return DISCLOSURE_TEMPLATES.find((t) => t.id === id) ?? null;
}

/* ── Rendering, which refuses ──────────────────────────────────────────────── */

export type DisclosureErrorCode =
  | 'unknown_template'
  | 'version_mismatch'
  | 'unknown_offer'
  | 'missing_field'
  | 'unresolved_placeholder';

/**
 * A refusal to render, typed.
 *
 * WHY THIS THROWS instead of returning `{ version, text: '' }` or a null.
 * Disclosure rendering sits on the path to a printed client artifact and to
 * `gps_conflict_check.disclosure_text_used`. An empty string satisfies every
 * type, passes every truthiness check a careless caller writes, prints as blank
 * space, and persists as a record that a disclosure was made when none was. A
 * throw is the only outcome that cannot be ignored by omission. `deriveMilestones`
 * (`delivery.ts`) throws on scope drift for the same reason.
 */
export class DisclosureError extends Error {
  readonly code: DisclosureErrorCode;
  /** The id that was asked for, so a log line is useful without the stack. */
  readonly templateId: string;
  constructor(code: DisclosureErrorCode, templateId: string, message: string) {
    super(message);
    this.name = 'DisclosureError';
    this.code = code;
    this.templateId = templateId;
  }
}

const PLACEHOLDER_SOURCE = '\\{\\{([a-zA-Z]+)\\}\\}';

/**
 * A FRESH regex per call. A module-level `/g` RegExp shared between `replace`
 * and `matchAll` carries `lastIndex` state between calls, and a placeholder
 * scan that silently starts halfway through the text is the kind of bug that
 * only shows up on the second render.
 */
function placeholderRe(): RegExp {
  return new RegExp(PLACEHOLDER_SOURCE, 'g');
}

/** Placeholders present in the text. Used to catch undeclared ones. */
function placeholdersIn(text: string): readonly string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(placeholderRe())) out.add(m[1]);
  return [...out];
}

export interface RenderOptions {
  /**
   * Pin the version. When supplied it must equal the compiled version EXACTLY,
   * or rendering refuses.
   *
   * WHY EXACT AND NOT ">= pinned". Reproducing a historical disclosure means
   * producing the words the client actually read. This file only holds the
   * CURRENT text; the historical text lives in
   * `gps_conflict_check.disclosure_text_used` (verbatim, `types.ts:362`) and in
   * git. So when a caller asks for v1 and the library is at v2, the only honest
   * answers are "here is v2, which is different" or a refusal — and quietly
   * returning v2's words labelled v1 is the one answer that destroys the record.
   * Callers reproducing an old disclosure read the stored text; callers issuing a
   * new one omit `version` and record what they got.
   */
  version?: number;
}

/**
 * What a render produced. `version` is the field that must reach the database.
 */
export interface RenderedDisclosure {
  templateId: DisclosureId;
  version: number;
  text: string;
  /**
   * Whether the template's own `appliesWhen` says it was required for this
   * context. Rendering a non-applicable disclosure is permitted — a human may
   * add one — but it is reported, because a wall that cannot distinguish
   * "required and given" from "given anyway" cannot show a gap.
   */
  applies: boolean;
  /** Echoed for the printed artifact (D7). */
  renderedFor: { clientName: string; offerKey: OfferKey; asOf: string };
  /** True while `DISCLOSURES_ARE_NOT_COUNSEL_REVIEWED` — surfaces must badge it. */
  unreviewed: boolean;
}

/**
 * Render a template deterministically. Same id + same context ⇒ byte-identical
 * text, always: no clock, no randomness, no locale-dependent formatting.
 *
 * REFUSES (throws `DisclosureError`) on:
 *  - an unknown template id — never an empty string;
 *  - a pinned version that is not the compiled version;
 *  - an unknown offer key (the offer name is client-facing text);
 *  - a required field that is missing or blank;
 *  - any placeholder left unresolved, including one the template forgot to
 *    declare in `requires` — that last check is what stops `{{clientName}}`
 *    reaching a client on a page that says it is a disclosure.
 */
export function renderDisclosure(
  templateId: string,
  ctx: DisclosureContext,
  opts: RenderOptions = {},
): RenderedDisclosure {
  const t = getDisclosureTemplate(templateId);
  if (!t) {
    throw new DisclosureError(
      'unknown_template',
      templateId,
      `Unknown disclosure template "${templateId}". Known ids: ${DISCLOSURE_TEMPLATES.map((x) => x.id).join(', ')}. Refusing to render: an empty disclosure is indistinguishable from a disclosure that was made.`,
    );
  }

  if (opts.version !== undefined && opts.version !== t.version) {
    throw new DisclosureError(
      'version_mismatch',
      templateId,
      `Disclosure "${templateId}" is compiled at version ${t.version}; version ${opts.version} was requested. This library holds only the current text. Reproduce a historical disclosure from the verbatim text stored on the engagement, not from here.`,
    );
  }

  // Resolve every declared field. Blank is missing: a disclosure naming an empty
  // client is not a disclosure.
  const values: Partial<Record<DisclosureField, string>> = {};
  const missing: DisclosureField[] = [];

  for (const field of t.requires) {
    let v: string | null = null;
    switch (field) {
      case 'clientName':
        v = ctx.clientName?.trim() || null;
        break;
      case 'asOf': {
        // Date only, not the instant: a client-facing artifact is dated to the
        // day, and rendering a full ISO timestamp implies a precision the
        // decision does not have.
        const ms = Date.parse(ctx.asOf);
        v = Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
        break;
      }
      case 'contractingEntity':
        v = CONTRACTING_ENTITY_DISCLOSURE_NAME[ctx.contractingEntity] ?? null;
        break;
      case 'offerName':
        try {
          v = getOffer(ctx.offerKey).name;
        } catch {
          throw new DisclosureError(
            'unknown_offer',
            templateId,
            `Disclosure "${templateId}" needs the client-facing offer name, and "${String(ctx.offerKey)}" is not in the catalogue.`,
          );
        }
        break;
      case 'jurisdiction':
        v = ctx.jurisdiction?.trim() || null;
        break;
    }
    if (v === null) missing.push(field);
    else values[field] = v;
  }

  if (missing.length > 0) {
    throw new DisclosureError(
      'missing_field',
      templateId,
      `Disclosure "${templateId}" v${t.version} requires ${missing.join(', ')}, and the context supplied none of them (blank counts as missing).`,
    );
  }

  const text = t.text.replace(placeholderRe(), (whole: string, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name)
      ? (values[name as DisclosureField] as string)
      : whole,
  );

  const leftover = placeholdersIn(text);
  if (leftover.length > 0) {
    throw new DisclosureError(
      'unresolved_placeholder',
      templateId,
      `Disclosure "${templateId}" v${t.version} left ${leftover.map((p) => `{{${p}}}`).join(', ')} unresolved — the template references fields it does not declare in \`requires\`. Refusing to emit template syntax into client-facing text.`,
    );
  }

  return {
    templateId: t.id,
    version: t.version,
    text,
    applies: t.appliesWhen(ctx),
    renderedFor: { clientName: ctx.clientName, offerKey: ctx.offerKey, asOf: ctx.asOf },
    unreviewed: DISCLOSURES_ARE_NOT_COUNSEL_REVIEWED,
  };
}

/* ── What must be used, and what was ───────────────────────────────────────── */

/** Every template whose `appliesWhen` fires for this context, in display order. */
export function requiredDisclosures(ctx: DisclosureContext): readonly DisclosureTemplate[] {
  return DISCLOSURE_TEMPLATES.filter((t) => t.appliesWhen(ctx));
}

/**
 * Which required disclosures are NOT among the ones recorded as used.
 *
 * The conflict wall's completeness check (plan §5, 9.1): an engagement missing a
 * required disclosure must be visible as a gap rather than discovered later.
 * Ids not in the library are ignored here on purpose — an unknown id is a
 * different defect, reported by `renderDisclosure`.
 */
export function missingDisclosures(
  ctx: DisclosureContext,
  usedTemplateIds: readonly string[],
): readonly DisclosureTemplate[] {
  const used = new Set(usedTemplateIds);
  return requiredDisclosures(ctx).filter((t) => !used.has(t.id));
}

/**
 * Sum of every template version. Mirrors `getClaimLibrarySnapshot`
 * (`claims/claims.ts:236`), which versions the claim library as a whole so a
 * snapshot can be identified. Derived, so it cannot drift from the templates.
 */
export const DISCLOSURE_LIBRARY_VERSION: number = DISCLOSURE_TEMPLATES.reduce(
  (n, t) => n + t.version,
  0,
);

/**
 * THE THING A CALLER PERSISTS PER ENGAGEMENT.
 *
 * `text` goes to `gps_conflict_check.disclosure_text_used` (verbatim, because the
 * defensible record is what the client was told); `templateId` + `version` go
 * beside it so the verbatim text can be checked against the policy that produced
 * it. Storing either alone is a broken record: text without a version cannot be
 * audited against policy, and a version without text cannot be reproduced once
 * the text is edited.
 *
 * `libraryVersion` is the sum of template versions — a single integer that
 * changes whenever ANY template changes, so a stored record can be compared
 * against the library it came from in one comparison.
 */
export interface DisclosureUseRecord {
  templateId: DisclosureId;
  version: number;
  text: string;
  libraryVersion: number;
  /** The instant the disclosure was produced, ISO. Echoed from the context. */
  renderedAt: string;
  /** True while the wording is not counsel-reviewed. Stored, not inferred later. */
  unreviewed: boolean;
}

export function disclosureRecord(r: RenderedDisclosure): DisclosureUseRecord {
  return {
    templateId: r.templateId,
    version: r.version,
    text: r.text,
    libraryVersion: DISCLOSURE_LIBRARY_VERSION,
    renderedAt: r.renderedFor.asOf,
    unreviewed: r.unreviewed,
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  THE LISTING PERIMETER — what GPS is allowed to LEARN about the other ledger,
 *  and what it must DO about it.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * THE CONFLICT THIS WALL EXISTS FOR IS THE ONE IT COULD NOT SEE. GPS sells a MiCA
 * whitepaper and legal-opinion coordination to token issuers. Some of those issuers
 * are simultaneously candidates in LCX's listing pipeline. A conflict check that
 * cannot see whether a client sits inside that pipeline is not a strict check — it
 * is a BLIND one, and it reports the single case it was built for as "no conflict
 * found". `types.ts:362` and the four prohibited promises above defend the
 * PERCEPTION; this defends the fact.
 *
 * THE OWNER'S DECISION, taken and recorded: GPS may read the listing pipeline
 * VERDICT ONLY, and every read is logged. Reading the verdict — and not the row,
 * the dossier, the stage history, the event, the window or the human who decided —
 * is the minimum disclosure that makes the control function at all. MiCA Art 90(1)
 * prohibits onward disclosure of inside information and Art 91(3)(c) attaches
 * PERSONAL liability to the breach, so anything finer than a verdict would be the
 * breach rather than the control.
 *
 * ══ WHY THE ENGINE LIVES HERE AND THE QUERY LIVES IN THE API ═════════════════
 * `conflict.ts:56` states the division and it is not decorative: "a rule that lives
 * [in the API] would be a rule that changed without a code review of the engine that
 * enforces it". WHAT A VERDICT MEANS FOR AN ENGAGEMENT IS A RULE. So the mapping
 * from a reading to a consequence is here — pure, total, no clock, no I/O — and the
 * API file owns only the read, the log and the refusals that come from the database.
 */

/**
 * THE FIVE VERDICTS, MIRRORED — and mirrored deliberately rather than imported.
 *
 * The producing union is `ListingPipelineVerdict` in
 * `apps/api/src/access/otherLedger.ts`. `packages/shared` CANNOT import from
 * `apps/api` (the dependency runs the other way and always has), so the choice is
 * between duplicating five strings and moving a database-shaped module into the
 * shared package. Duplication, with a CONFORMANCE TEST that fails the moment the
 * two lists differ: `apps/api/src/gps/__tests__/listingPerimeter.test.ts` asserts
 * set equality in both directions, so a sixth verdict added on the API side breaks
 * a test rather than falling through this engine.
 *
 * AND IT FALLS THROUGH TO A REFUSAL, NOT TO A CLEARANCE, IF THE TEST IS EVER
 * DELETED. `listingPerimeterFinding` takes the verdict as a `string`, not as this
 * union, precisely so an unrecognised value is REPRESENTABLE and REFUSES.
 * `otherLedger.ts` records the same lesson from the other side: a fifth embargo
 * state added to 0060 would otherwise "quietly read as clear_on_record".
 *
 * The meanings are not restated here; they are stated once, on the producing union.
 */
export const GPS_LISTING_VERDICTS = [
  'restricted',
  'conditional',
  'clear_on_record',
  'stale_unresolved',
  'history_only',
] as const;

export type GpsListingVerdict = (typeof GPS_LISTING_VERDICTS)[number];

/**
 * Stable codes. Values, not messages: an alert, a dashboard and a regulator's
 * report all key off them, and the whole point of this control is that a false
 * clean is greppable after the fact.
 */
export const LISTING_PERIMETER_CODES = {
  /** We did not establish anything. NEVER a clearance. Carries the upstream code. */
  NOT_LOADED: 'GPS_LISTING_PERIMETER_NOT_LOADED',
  /** A live, in-window entry records unpublished price-significant information. */
  RESTRICTED: 'GPS_LISTING_PERIMETER_RESTRICTED',
  /** Live and in-window, not MNPI. Not a block and NOT a free hand. */
  CONDITIONAL: 'GPS_LISTING_PERIMETER_CONDITIONAL',
  /** The desk looked at this asset and wrote `clear`, with a review date on it. */
  CLEAR_ON_RECORD: 'GPS_LISTING_PERIMETER_CLEAR_ON_RECORD',
  /** A live entry is past its review date. 0060: the calendar does not lift it. */
  STALE_UNRESOLVED: 'GPS_LISTING_PERIMETER_STALE_UNRESOLVED',
  /** Entries exist, none is live. Different from never having had any. */
  HISTORY_ONLY: 'GPS_LISTING_PERIMETER_HISTORY_ONLY',
  /** The one clearance: a populated register holds nothing about this asset. */
  NO_ENTRY: 'GPS_LISTING_PERIMETER_NO_ENTRY',
  /** A verdict string this engine has never heard of. Refuses; never clears. */
  VERDICT_UNRECOGNISED: 'GPS_LISTING_PERIMETER_VERDICT_UNRECOGNISED',
  /** `withheld` with a count that cannot be true of a non-empty holding. */
  COUNT_INCOHERENT: 'GPS_LISTING_PERIMETER_COUNT_INCOHERENT',
  /** A recorded conflict position that the listing perimeter contradicts. */
  DECISION_CONTRADICTED: 'GPS_LISTING_PERIMETER_DECISION_CONTRADICTED',
  /** Whether the position is contradicted CANNOT BE SAID. Not "it is not". */
  CONTRADICTION_UNESTABLISHED: 'GPS_LISTING_PERIMETER_CONTRADICTION_UNESTABLISHED',
} as const;

export type ListingPerimeterCode =
  (typeof LISTING_PERIMETER_CODES)[keyof typeof LISTING_PERIMETER_CODES];

const RULE_ONLY_ABSENCE_CLEARS =
  'House doctrine: three states are never collapsed — not-loaded / present-but-withheld / '
  + 'genuinely-empty — and only the third is a clearance. A listing perimeter that was not '
  + 'read, or that is withholding entries, is UNKNOWN, and unknown refuses. There is '
  + 'deliberately no flag anywhere on this path that lets an unloaded or unattested register '
  + 'read as clear: that flag is the false negative, and the false negative is the liability.';

const RULE_VERDICT_ONLY =
  'MiCA Art 90(1) prohibits onward disclosure of inside information and Art 91(3)(c) attaches '
  + 'personal liability. GPS learns the VERDICT and the number of entries withheld, and never '
  + 'the state, the event, the minute pointer, the window, the review date or the human who '
  + 'decided. The verdict is coarser than the register on purpose.';

const RULE_NO_LAUNDERING =
  'House doctrine: an inference is never laundered into a certainty. A verdict this engine '
  + 'does not recognise, or a count that contradicts the state it arrived with, is refused '
  + 'under a stable code — never rounded toward the answer that lets work proceed.';

/**
 * WHAT CROSSES THE COMPARTMENT BOUNDARY INTO THIS ENGINE. Three shapes and no
 * fourth, and none of them can carry a row.
 *
 * MINIMUM DISCLOSURE IS A PROPERTY OF THIS TYPE, NOT A PROMISE IN A COMMENT. There
 * is no field here that could hold an embargo row, an event slug, a source ref, a
 * window, a state string or a name, so no future edit to the API-side caller can
 * spread one into this engine's output by accident. A function that CAN return the
 * pipeline row will eventually be read for the pipeline row.
 *
 * `not_loaded` HAS NO `withheldCount` AND NO `verdict` — not `0`, not `null`. The
 * union makes reading one a compile error, which is the same mechanism
 * `access/verdictBroker.ts` uses on the answer it produces, for the same reason:
 * a caller cannot read a zero out of a state that never looked.
 */
export type ListingPerimeterReading =
  | {
      readonly state: 'not_loaded';
      /**
       * The producing code, verbatim — `VERDICT_BROKER_CROSS_READ_NOT_AUTHORISED`,
       * `VERDICT_BROKER_HOLDER_UNAVAILABLE`, `OTHER_LEDGER_TICKER_NOT_NORMALISED`
       * and so on. Carried so an operator can tell "the owner has not switched this
       * on" from "the register could not be read" from "this project's ticker is
       * denormalised" — three different jobs for three different people behind one
       * answer to the asker.
       */
      readonly reasonCode: string;
    }
  | { readonly state: 'withheld'; readonly verdict: string; readonly withheldCount: number }
  | { readonly state: 'empty' };

interface ListingFindingCommon {
  readonly code: ListingPerimeterCode;
  readonly rule: string;
  /** Plain language, for the wall and for a printed record. */
  readonly message: string;
  /**
   * TRUE ON EXACTLY ONE SHAPE: `no_entry`. This is the field a caller is tempted to
   * write `!blocked` for, so it is stated positively and derived from the state
   * rather than from the verdict — an unread compartment and a withheld holding
   * both leave it false, and neither can be turned true by adding a verdict.
   */
  readonly clearsListingConflict: boolean;
  /** The engagement may not proceed without the marketing desk being consulted. */
  readonly requiresMarketingDesk: boolean;
  /** The asset may not be NAMED in anything client-facing or public. */
  readonly namingBlocked: boolean;
  /** What this means for what the client is told. Rendered beside the wall row. */
  readonly disclosureConsequence: string;
}

export type ListingPerimeterFinding =
  | (ListingFindingCommon & {
      readonly kind: 'not_loaded';
      /* NO `withheldCount`, NO `verdict`. The absence is the mechanism. */
      readonly upstreamCode: string;
    })
  | (ListingFindingCommon & {
      readonly kind: 'withheld';
      readonly verdict: GpsListingVerdict;
      /** Always > 0. A count of records WITHHELD; it has no denominator. */
      readonly withheldCount: number;
    })
  | (ListingFindingCommon & { readonly kind: 'no_entry'; readonly withheldCount: 0 });

const NOT_LOADED_CONSEQUENCE =
  'Tell the client nothing about the listing perimeter, because nothing has been established. '
  + 'Do not record this engagement as cleared on the strength of it: the position is UNKNOWN and '
  + 'must be resolved by a named human at the marketing desk before client-facing work proceeds.';

function notLoadedFinding(upstreamCode: string, message: string): ListingPerimeterFinding {
  return {
    kind: 'not_loaded',
    code: LISTING_PERIMETER_CODES.NOT_LOADED,
    rule: RULE_ONLY_ABSENCE_CLEARS,
    message,
    clearsListingConflict: false,
    requiresMarketingDesk: true,
    namingBlocked: true,
    disclosureConsequence: NOT_LOADED_CONSEQUENCE,
    upstreamCode,
  };
}

/**
 * ONE VERDICT'S CONSEQUENCE, one row each, so the table is reviewable as a table.
 *
 * `namingBlocked` IS TRUE FOR EVERY VERDICT INCLUDING `clear_on_record`, and that is
 * the entry most likely to be argued with, so it is argued here. `clear_on_record`
 * means the marketing desk looked at this asset and recorded `clear`, WITH A REVIEW
 * DATE ON IT (0060). That is the desk's position, not a permission, and it is a
 * position about the MARKETING register — it says nothing about whether a GPS
 * engagement with the issuer of that asset creates a conflict. GPS naming the asset
 * off the back of another desk's record, without that desk being told a services
 * engagement exists, is exactly the coordination failure the wall is for. The verdict
 * routes to the desk; the desk clears the naming.
 */
const VERDICT_CONSEQUENCE: Record<
  GpsListingVerdict,
  {
    code: ListingPerimeterCode;
    namingBlocked: boolean;
    message: string;
    disclosureConsequence: string;
  }
> = {
  restricted: {
    code: LISTING_PERIMETER_CODES.RESTRICTED,
    namingBlocked: true,
    message:
      'LCX MARKETING holds a live, in-window entry for this engagement\'s asset recording '
      + 'unpublished price-significant information. THIS ENGAGEMENT IS INSIDE THE LISTING '
      + 'PERIMETER. The asset may not be named, and no engagement artifact, proposal or public '
      + 'reference may identify it, until the marketing desk says otherwise.',
    disclosureConsequence:
      'The engagement cannot proceed to anything client-facing without the marketing desk. What '
      + 'the client is told is the marketing desk\'s decision to make, not this compartment\'s: '
      + 'the fact that an embargo exists is itself inside information (MiCA Art 90(1)).',
  },
  conditional: {
    code: LISTING_PERIMETER_CODES.CONDITIONAL,
    namingBlocked: true,
    message:
      'LCX MARKETING holds a live, in-window entry for this asset that is not an MNPI hold. It is '
      + 'NOT A BLOCK AND IT IS NOT A FREE HAND: an announced asset still requires the marketing to '
      + 'be a separate artefact from the disclosure (MiCA Art 88(1)), and an exempt offer sits '
      + 'under an exemption one sentence in one post can destroy (Art 4(4)).',
    disclosureConsequence:
      'Route through the marketing desk before the asset is named anywhere client-facing. Do not '
      + 'read this as a clearance; it is a routing instruction with a named owner.',
  },
  clear_on_record: {
    code: LISTING_PERIMETER_CODES.CLEAR_ON_RECORD,
    namingBlocked: true,
    message:
      'LCX MARKETING holds a live, in-window entry for this asset and every such entry records '
      + '`clear` — the desk\'s recorded position, with a review date on it. THIS IS NOT THE SAME '
      + 'FACT AS "no entry exists": somebody looked at this asset and wrote something down, which '
      + 'means the asset is known to that desk and this engagement is not invisible to it.',
    disclosureConsequence:
      'Tell the marketing desk that a GPS engagement exists for this asset before naming it. Their '
      + 'recorded position was taken without that fact in front of them.',
  },
  stale_unresolved: {
    code: LISTING_PERIMETER_CODES.STALE_UNRESOLVED,
    namingBlocked: true,
    message:
      'A live entry exists for this asset and it is PAST its review date or its declared window. '
      + '0060 is explicit that an embargo is not lifted by the calendar; it is lifted by a named '
      + 'human. So the position is UNKNOWN, and unknown refuses — this is not a lapsed restriction, '
      + 'it is an unanswered one.',
    disclosureConsequence:
      'Chase the named human at the marketing desk. Until the entry is resolved or lifted, treat '
      + 'this engagement as inside the perimeter.',
  },
  history_only: {
    code: LISTING_PERIMETER_CODES.HISTORY_ONLY,
    namingBlocked: false,
    message:
      'LCX MARKETING holds entries about this asset and NONE of them is live. There is no '
      + 'restriction in force. This is deliberately not reported as an absence: the register has '
      + 'held inside information about this asset before, which is a fact about the relationship '
      + 'between this client and the listing pipeline, and an absence would erase it.',
    disclosureConsequence:
      'No restriction is in force. The prior history is a reason to record the conflict position '
      + 'explicitly with a disclosure rather than as a plain clearance.',
  },
};

/**
 * A reading → a finding. Pure, total, no clock.
 *
 * THE THREE STATES SURVIVE THE FUNCTION. There is no path from `not_loaded` or
 * `withheld` to `clearsListingConflict: true`, and the incoherent inputs — an
 * unrecognised verdict, a `withheld` with a count that cannot be true — become
 * NOT-LOADED rather than being rounded toward the answer that lets the work go
 * ahead. `verdictBroker.ts` refuses the same contradiction one layer up; it is
 * refused again here because this engine is reachable from tests and from any
 * future caller that assembles a reading by hand, and a rule enforced in exactly
 * one place is enforced until someone adds a second caller.
 */
export function listingPerimeterFinding(reading: ListingPerimeterReading): ListingPerimeterFinding {
  if (reading.state === 'not_loaded') {
    return notLoadedFinding(
      reading.reasonCode,
      'The listing perimeter was NOT READ for this engagement, so nothing has been established '
        + 'about whether its asset sits inside it. This is not a report that the asset is clear and '
        + 'it must never be shown as one. The upstream code says which of the several reasons '
        + 'applied — the owner has not authorised the read, the register could not be reached, the '
        + 'register is unpopulated, or this project\'s ticker cannot be joined.',
    );
  }

  if (reading.state === 'empty') {
    return {
      kind: 'no_entry',
      code: LISTING_PERIMETER_CODES.NO_ENTRY,
      rule: RULE_ONLY_ABSENCE_CLEARS,
      message:
        'We looked, in a register that has been populated, and LCX MARKETING holds no entry at all '
        + 'about this engagement\'s asset. This is a genuine observed absence and it is the only '
        + 'shape on this path that clears the listing conflict.',
      clearsListingConflict: true,
      requiresMarketingDesk: false,
      namingBlocked: false,
      disclosureConsequence:
        'No listing-perimeter disclosure arises from the register. Every other disclosure this '
        + 'engagement requires is unaffected — in particular the standing employee-conflict '
        + 'statement, which applies to every engagement without exception.',
      withheldCount: 0,
    };
  }

  const verdict = reading.verdict;
  if (!(GPS_LISTING_VERDICTS as readonly string[]).includes(verdict)) {
    return {
      ...notLoadedFinding(
        LISTING_PERIMETER_CODES.VERDICT_UNRECOGNISED,
        `The listing perimeter answered with a verdict this engine does not recognise. It is `
          + 'refused rather than interpreted: the recognised verdicts are '
          + `${GPS_LISTING_VERDICTS.join(', ')}, and silently bucketing an unknown one is how a `
          + 'verdict added on the producing side in a year\'s time reads as permission. The '
          + 'conformance test that is supposed to make this branch unreachable is named in the '
          + 'docblock on GPS_LISTING_VERDICTS; if you are seeing this code, it is not doing its job.',
      ),
      code: LISTING_PERIMETER_CODES.VERDICT_UNRECOGNISED,
      rule: RULE_NO_LAUNDERING,
    };
  }

  if (!Number.isInteger(reading.withheldCount) || reading.withheldCount <= 0) {
    return {
      ...notLoadedFinding(
        LISTING_PERIMETER_CODES.COUNT_INCOHERENT,
        'The listing perimeter reported that entries are being withheld and then gave a count that '
          + 'cannot be true of a non-empty holding. The two statements contradict each other, so '
          + 'neither is reported as fact and nothing has been established. Rounding this into an '
          + 'absence would manufacture the exact false clean this control exists to prevent.',
      ),
      code: LISTING_PERIMETER_CODES.COUNT_INCOHERENT,
      rule: RULE_NO_LAUNDERING,
    };
  }

  const c = VERDICT_CONSEQUENCE[verdict as GpsListingVerdict];
  return {
    kind: 'withheld',
    code: c.code,
    rule: RULE_VERDICT_ONLY,
    message: `${c.message} ${reading.withheldCount} register entr${reading.withheldCount === 1 ? 'y is' : 'ies are'} `
      + 'being withheld from this compartment; the count is published so that "withheld" can never be '
      + 'mistaken for "nothing", and it is the whole of what crosses the boundary besides the verdict.',
    clearsListingConflict: false,
    requiresMarketingDesk: true,
    namingBlocked: c.namingBlocked,
    disclosureConsequence: c.disclosureConsequence,
    verdict: verdict as GpsListingVerdict,
    withheldCount: reading.withheldCount,
  };
}

/**
 * DOES THE RECORDED CONFLICT POSITION SURVIVE THE LISTING PERIMETER?
 *
 * THIS IS THE FINDING THE WHOLE PATH WAS BUILT TO PRODUCE. An engagement recorded
 * `cleared` — plain, no disclosure — whose asset the other desk is holding inside
 * the listing perimeter is the case in `catalogue.ts`'s severe-risk paragraph: a
 * client paid an exchange employee for services while their token sat in that
 * exchange's pipeline, and the defensible record says "cleared" with nothing beside
 * it. Until this function existed, nothing in the codebase could produce that
 * sentence, because the check could not see the pipeline.
 *
 * THE THIRD RETURN IS THE HONEST ONE AND IT IS THE POINT. When the perimeter was
 * not read, the answer is `unestablished` — NOT `none`. "We found no contradiction"
 * and "we could not look for one" are different facts, and a wall that renders them
 * identically has quietly turned a sealed compartment back into a clean row.
 */
export type ListingContradiction =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'contradiction';
      readonly code: typeof LISTING_PERIMETER_CODES.DECISION_CONTRADICTED;
      readonly message: string;
      readonly rule: string;
    }
  | {
      readonly kind: 'unestablished';
      readonly code: typeof LISTING_PERIMETER_CODES.CONTRADICTION_UNESTABLISHED;
      readonly message: string;
      readonly rule: string;
    };

/**
 * @param decision the position as recorded, or `'unresolved'` when no check exists.
 *   Exactly the type `DisclosureContext.conflictDecision` carries, so a caller
 *   cannot accidentally pass a decision this engine has not been shown how to read.
 */
export function listingContradiction(
  decision: ConflictDecision | 'unresolved',
  finding: ListingPerimeterFinding,
): ListingContradiction {
  if (finding.kind === 'not_loaded') {
    return {
      kind: 'unestablished',
      code: LISTING_PERIMETER_CODES.CONTRADICTION_UNESTABLISHED,
      message:
        'Whether this engagement\'s recorded conflict position is contradicted by the listing '
        + 'perimeter CANNOT BE SAID, because the perimeter was not read. This is not "no '
        + 'contradiction found". A surface that renders it the same as a clean result has undone '
        + 'the control.',
      rule: RULE_ONLY_ABSENCE_CLEARS,
    };
  }

  if (finding.kind === 'no_entry') return { kind: 'none' };

  /*
   * A `declined` engagement is not contradicted by anything: the desk refused the
   * work, which is the strictest available position and cannot be made stricter by
   * a register entry. Listed rather than falling out of an `else`, because the
   * temptation on the next edit is to treat `declined` as "already handled" and
   * skip the rest — and the rest is where the two live states are decided.
   */
  if (decision === 'declined') return { kind: 'none' };

  /*
   * `history_only` is the one live-register verdict with NO restriction in force, so
   * a plain `cleared` is not contradicted by it — it is merely under-documented, and
   * `VERDICT_CONSEQUENCE.history_only` already says so in the finding's own
   * disclosure consequence. Reporting it as a contradiction would put a red row on
   * every engagement whose asset was ever mentioned, and a wall whose red rows are
   * mostly noise stops being read.
   */
  if (finding.verdict === 'history_only') return { kind: 'none' };

  if (decision === 'cleared_with_disclosure') return { kind: 'none' };

  return {
    kind: 'contradiction',
    code: LISTING_PERIMETER_CODES.DECISION_CONTRADICTED,
    message:
      decision === 'unresolved'
        ? 'This engagement\'s asset is inside the listing perimeter and NO conflict position has '
          + 'been recorded for it at all. This is the shape the conflict wall exists to make '
          + 'impossible to miss: an exchange employee\'s services engagement with an issuer whose '
          + 'token the exchange is handling, with nothing written down.'
        : 'This engagement is recorded as CLEARED with no disclosure, and its asset is inside the '
          + 'listing perimeter. The recorded position was taken without that fact in front of the '
          + 'human who took it. It must be re-taken — the available positions are cleared WITH '
          + 'disclosure, or declined.',
    rule: RULE_ONLY_ABSENCE_CLEARS,
  };
}

export interface DisclosureLibrarySnapshot {
  libraryVersion: number;
  unreviewed: boolean;
  unreviewedReason: string;
  templates: readonly { id: DisclosureId; version: number; title: string; appliesWhenLabel: string }[];
}

/** For the wall: what the library contains, without the full texts. */
export function getDisclosureLibrarySnapshot(): DisclosureLibrarySnapshot {
  return {
    libraryVersion: DISCLOSURE_LIBRARY_VERSION,
    unreviewed: DISCLOSURES_ARE_NOT_COUNSEL_REVIEWED,
    unreviewedReason: DISCLOSURES_UNREVIEWED_REASON,
    templates: DISCLOSURE_TEMPLATES.map((t) => ({
      id: t.id,
      version: t.version,
      title: t.title,
      appliesWhenLabel: t.appliesWhenLabel,
    })),
  };
}
