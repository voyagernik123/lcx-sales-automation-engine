/**
 * GLOBAL SERVICES (GPS) — ORIGINATION. The face of the targeting engine.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────────
 * `targeting.ts` is 1,152 lines with 70 tests and it has never been rendered.
 * Nothing here rewrites it: `rankTargets` (`targeting.ts:1132`) stays the single
 * source of both the ranking and the exclusions, and this module composes ONE
 * payload on top of it — the finite queue, the refusal ledger, per-fact
 * provenance, and the research brief. Every scoring decision is still made
 * there; every decision made here is about what a human is allowed to SEE and
 * what the system REFUSES to render without evidence.
 *
 * ── THE THREE PROPERTIES THIS FILE ADDS, AND WHY EACH IS STRUCTURAL ──────────
 *
 *  1. REFUSALS ARE CARRIED, NOT DROPPED (D2). `rankTargets` already returns
 *     `excluded` with every `GateHit` and its `reason`/`recoverable`/`remedy`
 *     (`targeting.ts:410`). A surface that maps only `ranked` silently loses all
 *     of it, which is the exact failure mode the engine was written to prevent.
 *     `RefusalLedger` makes the refusals part of the same object as the queue,
 *     so dropping them is a visible deletion rather than an omission. It also
 *     separates a WALL (sanctioned entity — walk away) from a TASK (perform the
 *     conflict check), because a worklist that cannot tell them apart gets
 *     ignored wholesale.
 *
 *     The capacity cut is treated as a refusal too. Truncating a ranked list at
 *     twelve rows IS an exclusion, and an exclusion without a reason is the
 *     defect under a different name — hence `deferred`, with a count, a reason
 *     and the boundary scores.
 *
 *  2. CONFIDENCE STAYS BESIDE THE SCORE (D3). `QueueRow` keeps `score` and
 *     `confidence` as SIBLING fields, and `drivers` is copied verbatim from the
 *     assessment. Nothing in this file multiplies, weights, or blends the two.
 *     The test asserts this structurally — two rows differing ONLY in evidence
 *     grade have identical `score`/`rawScore`/`drivers` — rather than by reading
 *     the arithmetic, because arithmetic can be re-edited and a passing
 *     structural test cannot be edited without going red.
 *
 *  3. NO CLAIM WITHOUT A MECHANISM (D8). `ResearchBrief` has NO free-prose
 *     field. Not one. A `headline: string` or a `summary: string` on this type
 *     would be a hole wide enough to drive the whole failure mode through: prose
 *     asserts, and prose cannot be checked. Every claim is a `BriefAssertion`
 *     carrying either a `FactProvenance` (grade + date + source) or the explicit
 *     status `UNVERIFIED`, and the only constructor for a sealed brief
 *     (`sealBrief`) runs `briefIntegrity` on the way through. The type therefore
 *     cannot exist without its verdict attached.
 *
 * ── THE FAILURE THIS IS DESIGNED AGAINST ─────────────────────────────────────
 * A brief that reads well and is wrong, walking him into a paid conversation on
 * a false premise. That failure is not caught by better prose; it is caught by
 * refusing to render an assertion whose provenance is absent, and by refusing to
 * let a proposed opening lean on an UNVERIFIED assertion. Both are blocking
 * violations below, and `unknowns` is a first-class field so that what we do NOT
 * know is printed rather than left as whitespace the reader fills in optimistically.
 *
 * ── DELIBERATELY ABSENT ──────────────────────────────────────────────────────
 * No I/O, no DB, no LLM, no network, no mutation of inputs. No send path: the
 * strongest form of that is `ProposedOpening.approvedForSend: false` as a LITERAL
 * type, so this module is structurally incapable of producing an approved
 * outreach. No discovery: `OriginationInput[]` is a curated watchlist the caller
 * supplies (plan §4 — "explicitly not built: the global discovery engine").
 * No prices: `catalogue.ts` bands are placeholders and nothing here quotes.
 */
import type { Driver } from '../alpha.js';
import type { ConfidenceInput, ConfidenceLevel } from '../estimative.js';
import { estimativeConfidence, likelihood, type LikelihoodTerm } from '../estimative.js';
import type { Credibility, Reliability } from '../provenance.js';
import { admiraltyCode, confidenceFrom, getSource } from '../provenance.js';
import type {
  AssessOptions,
  ConfidenceBand,
  GateHit,
  GateKey,
  GpsTarget,
  TargetAssessment,
  TargetConfidence,
  TargetFactorKey,
  TargetingWeights,
} from './targeting.js';
import {
  FACTOR_LABELS,
  GATE_KEYS,
  TARGET_FACTOR_KEYS,
  WEIGHTS_V1_BASIS,
  rankTargets,
} from './targeting.js';

/* ── Clock resolution ──────────────────────────────────────────────────────────
 * Re-declared rather than exported from `targeting.ts`: `resolveAsOfMs` is that
 * file's private helper (`targeting.ts:995`) and widening its surface to share
 * five lines is a worse trade than five lines. Same contract, including the
 * throw — a surface that passes a malformed date must fail loudly, because the
 * alternative is a queue silently measured against the wrong day.
 */
function resolveAsOfMs(asOf: AssessOptions['asOf']): number {
  if (asOf == null) return Date.now();
  if (typeof asOf === 'number') return asOf;
  if (asOf instanceof Date) return asOf.getTime();
  const ms = Date.parse(asOf);
  if (!Number.isFinite(ms)) throw new Error(`asOf is not a parseable date: ${asOf}`);
  return ms;
}

const DAY_MS = 86_400_000;

/** Whole days from an ISO instant to `asOfMs`; null when the ISO is unparseable. */
function ageDaysFrom(iso: string | null | undefined, asOfMs: number): number | null {
  if (iso == null) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return Math.floor((asOfMs - ms) / DAY_MS);
}

/* ── FactProvenance — slice 8.3 ────────────────────────────────────────────── */

/**
 * The staleness boundary, 0–100 provenance confidence.
 *
 * 40 is not a new number: it is `confidenceBand`'s medium/low boundary
 * (`targeting.ts:873`). Reusing it means "stale fact" and "low confidence
 * target" mean the same thing on the same scale, so a reviewer never has to hold
 * two thresholds in their head. Inventing a second cutoff here would be the
 * beginning of two vocabularies for one idea.
 */
export const FACT_STALE_CONFIDENCE = 40;

/**
 * Evidence half-life for a target FACT, in days. Matches
 * `EVIDENCE_HALF_LIFE_DAYS` in `targeting.ts` (45 — half a quarter, because a
 * target's funding, sponsor and deadline turn over on roughly a quarterly
 * cadence). Stated again here as a constant rather than imported because that
 * one is file-private; the two must be reviewed together and this comment is the
 * link between them.
 */
export const FACT_HALF_LIFE_DAYS = 45;

/**
 * What a caller supplies about ONE fact feeding the score.
 *
 * `credibility` defaults to 6 — Admiralty "cannot be judged" — and never to
 * something flattering. A caller who did not think about credibility gets an
 * honest F-grade-adjacent read rather than a silent 2. `reliability` defaults
 * from the source registry (`provenance.ts:47`), which is the one place outlet
 * quality is already written down.
 */
export interface FactInput {
  /** The `GpsTarget` field this describes, e.g. `'statedBudgetCents'`. */
  field: string;
  /** Human label. Defaults to `field` — never to a prettier invention. */
  label?: string | null;
  /** Source registry id (`provenance.ts:47`); unknown ids degrade to F. */
  sourceId: string;
  sourceUrl?: string | null;
  reliability?: Reliability | null;
  credibility?: Credibility | null;
  /** ISO instant the fact was observed to be true. */
  observedIso?: string | null;
}

/**
 * Provenance for one fact, resolved against a clock.
 *
 * D8 in one type: a stale B2 and a fresh A1 cannot be rendered identically
 * because they differ in `admiralty`, `ageDays`, `confidence` AND `stale`, and
 * the only display helper this module offers (`provenanceLabel`) prints the age
 * beside the grade unconditionally. Rendering the grade alone requires reaching
 * past the helper into the raw field, which is a visible choice in a diff.
 */
export interface FactProvenance {
  field: string;
  label: string;
  sourceId: string;
  sourceLabel: string;
  sourceUrl: string | null;
  reliability: Reliability;
  credibility: Credibility;
  /** Admiralty code, e.g. `'B2'` (`provenance.ts:75`). */
  admiralty: string;
  /** ISO observation instant, or null when the caller had none. */
  observedIso: string | null;
  /** Whole days old at `asOf`; null when undated. Negative means future-dated. */
  ageDays: number | null;
  /** 0–100, grade decayed by age (`provenance.ts:100`). */
  confidence: number;
  /** True when `confidence` is under `FACT_STALE_CONFIDENCE`, or the fact is undated. */
  stale: boolean;
  /** True when no observation date was supplied. An undated fact is never fresh. */
  undated: boolean;
}

/**
 * Resolve one fact's provenance. Pure; deterministic given `asOfMs`.
 *
 * An UNDATED fact is graded as if it were exactly one half-life old rather than
 * as if it were new. That asymmetry is deliberate: "we did not record when we
 * learned this" is evidence about our process, not evidence about the fact, and
 * the cheapest way to fake freshness in any provenance system is to omit the
 * date. Charging it a half-life removes the incentive.
 */
export function factProvenance(input: FactInput, asOfMs: number): FactProvenance {
  const src = getSource(input.sourceId);
  const reliability: Reliability = input.reliability ?? src.defaultReliability;
  const credibility: Credibility = input.credibility ?? 6;
  const ageDays = ageDaysFrom(input.observedIso, asOfMs);
  const undated = ageDays == null;
  const effectiveAge = undated ? FACT_HALF_LIFE_DAYS : Math.max(0, ageDays);
  const confidence = confidenceFrom(reliability, credibility, effectiveAge, FACT_HALF_LIFE_DAYS);
  return {
    field: input.field,
    label: input.label ?? input.field,
    sourceId: src.id,
    sourceLabel: src.label,
    sourceUrl: input.sourceUrl ?? src.homepage ?? null,
    reliability,
    credibility,
    admiralty: admiraltyCode(reliability, credibility),
    observedIso: input.observedIso ?? null,
    ageDays,
    confidence,
    stale: undated || confidence < FACT_STALE_CONFIDENCE,
    undated,
  };
}

/**
 * The only grade renderer this module offers, and it always prints the age.
 * `"B2 · 12d · CoinGecko"`, `"F6 · undated · Operator"`. There is no
 * grade-only variant on purpose (D8): the whole point of slice 8.3 is that
 * staleness is not separable from the grade at the point of reading.
 */
export function provenanceLabel(p: FactProvenance): string {
  const age = p.undated ? 'undated' : `${p.ageDays}d`;
  return `${p.admiralty} · ${age} · ${p.sourceLabel}`;
}

/* ── The why-now trigger — slice 8.1 ───────────────────────────────────────── */

/**
 * What kinds of event constitute a reason to call TODAY.
 *
 * A closed union so a surface can be exhaustive and so "why now" can never be
 * free text. Free text here would decay into restating the score, which is the
 * commonest way a pipeline tool ends up with a why-now column that says "good
 * fit".
 */
export type TriggerKind =
  | 'regulatory_deadline'
  | 'funding_event'
  | 'personnel_change'
  | 'market_event'
  | 'public_commitment'
  | 'inbound_request';

export const TRIGGER_KIND_LABELS: Record<TriggerKind, string> = {
  regulatory_deadline: 'Regulatory deadline',
  funding_event: 'Funding event',
  personnel_change: 'Personnel change',
  market_event: 'Market or listing event',
  public_commitment: 'Public commitment',
  inbound_request: 'Inbound request',
};

/**
 * How long a trigger of each kind remains a REASON TO CALL, in days.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  THESE ARE STATED PRIORS. THEY ARE NOT MEASURED AND CANNOT BE YET.
 * ══════════════════════════════════════════════════════════════════════════════
 * Same discipline as `WEIGHTS_V1_BASIS` (`targeting.ts:184`) and for the same
 * reason: ~29 engagements a year cannot support fitted decay curves. Written
 * down where they can be argued with, with the argument attached:
 *
 *   inbound_request 21    — the shortest by a wide margin. An inbound that has
 *                           sat three weeks has been answered by someone else.
 *   market_event 60       — a listing or a price event moves attention for about
 *                           a cycle; after two months it is history, not news.
 *   personnel_change 90   — a new head of comms or counsel has roughly a quarter
 *                           of budget discretion and appetite to change vendors.
 *   public_commitment 90  — a roadmap promise stays quotable for about a quarter
 *                           before it is either delivered or quietly dropped.
 *   funding_event 120     — a closed raise is spendable for a couple of quarters.
 *   regulatory_deadline 180 — the longest, because a deadline gets MORE urgent
 *                           with age rather than less. The shelf life exists only
 *                           to catch a deadline nobody re-checked, and 180 days
 *                           is "we recorded this two quarters ago and never
 *                           looked again", which is genuinely stale intelligence
 *                           even about a real deadline.
 *
 * NOTE the semantics: this decays the RECORD, not the underlying urgency. Urgency
 * itself is scored in `deriveUrgency` (`targeting.ts:693`) from `deadlineIso`.
 * This is deliberately not a second urgency term — it never touches the score.
 */
export const TRIGGER_SHELF_LIFE_DAYS: Record<TriggerKind, number> = {
  inbound_request: 21,
  market_event: 60,
  personnel_change: 90,
  public_commitment: 90,
  funding_event: 120,
  regulatory_deadline: 180,
};

/** The provenance of the shelf lives, as data rather than a comment nobody reads. */
export const TRIGGER_SHELF_LIFE_BASIS = {
  version: 'v1' as const,
  statedOn: '2026-08-01',
  /** Field name matches `WEIGHTS_V1_BASIS` (`targeting.ts:184`) so one surface reads both. */
  learnedFromOutcomes: false,
  reviewCadence: 'quarterly' as const,
  note: 'Decays the RECORD of a trigger, never the score. Urgency is scored in deriveUrgency.',
} as const;

/**
 * Trigger freshness.
 *
 * `'absent'` is a state rather than a null check because a target with NO why-now
 * is the single most common thing in a lead list and the surface must say so out
 * loud. A row with no trigger is a list entry, not a reason to call today, and
 * that sentence is the difference between an instrument and a CRM.
 */
export type TriggerState = 'fresh' | 'ageing' | 'expired' | 'undated' | 'absent';

/** What a caller records about a trigger. `source` is mandatory — see `WhyNowTrigger`. */
export interface TriggerInput {
  kind: TriggerKind;
  /** One sentence describing the EVENT. Not an argument, not a score restatement. */
  statement: string;
  /** ISO instant the event occurred. Undated is allowed and visibly penalised. */
  occurredIso?: string | null;
  /** Where it came from. Required: an unsourced why-now is a rumour with a date. */
  source: Omit<FactInput, 'field' | 'label'>;
}

/**
 * A why-now trigger with its date and its Admiralty grade — slice 8.1's exact
 * requirement. The grade is not optional and not nullable: `TriggerInput.source`
 * is required, so it is impossible to construct a trigger this module will carry
 * without saying where it came from.
 */
export interface WhyNowTrigger {
  kind: TriggerKind;
  kindLabel: string;
  statement: string;
  occurredIso: string | null;
  /** Whole days since the event at `asOf`. Negative when future-dated. */
  ageDays: number | null;
  /** The stated prior for this kind, echoed so a surface can print the basis. */
  shelfLifeDays: number;
  state: TriggerState;
  /** Grade + age + source for the trigger itself. */
  provenance: FactProvenance;
  /** True when the recorded event date is in the future — a data error, shown not fixed. */
  futureDated: boolean;
}

/**
 * Resolve a trigger against a clock.
 *
 * `ageing` starts at half the shelf life. A future-dated event keeps `fresh` and
 * raises `futureDated` rather than being silently corrected: a trigger dated
 * next month is a typo or a confusion between "the deadline" and "when we
 * learned of it", and both are things a human must see rather than have smoothed
 * over.
 */
export function resolveTrigger(input: TriggerInput, asOfMs: number): WhyNowTrigger {
  const shelfLifeDays = TRIGGER_SHELF_LIFE_DAYS[input.kind];
  const provenance = factProvenance(
    { ...input.source, field: 'whyNow', label: TRIGGER_KIND_LABELS[input.kind], observedIso: input.source.observedIso ?? input.occurredIso },
    asOfMs,
  );
  const ageDays = ageDaysFrom(input.occurredIso, asOfMs);
  let state: TriggerState;
  if (ageDays == null) state = 'undated';
  else if (ageDays > shelfLifeDays) state = 'expired';
  else if (ageDays > shelfLifeDays / 2) state = 'ageing';
  else state = 'fresh';
  return {
    kind: input.kind,
    kindLabel: TRIGGER_KIND_LABELS[input.kind],
    statement: input.statement,
    occurredIso: input.occurredIso ?? null,
    ageDays,
    shelfLifeDays,
    state,
    provenance,
    futureDated: ageDays != null && ageDays < 0,
  };
}

/* ── The refusal ledger — slice 8.2, the D2 centrepiece ────────────────────── */

/**
 * What kind of refusal this is.
 *
 * `'wall'` = at least one fired gate is unrecoverable; no amount of work by us
 * changes the answer and the correct action is to stop. `'task'` = every fired
 * gate is curable, so the entry belongs on a worklist with a named next action.
 *
 * `GateHit.recoverable` (`targeting.ts:410`) already carries this per gate; the
 * derivation that matters is the ROLL-UP, and it is pessimistic on purpose: ONE
 * wall makes the whole entry a wall, however many tasks sit beside it. The
 * opposite roll-up — "mostly curable" — is how a sanctioned entity ends up in a
 * to-do list because four of its five gates had remedies.
 */
export type RefusalDisposition = 'wall' | 'task';

/**
 * One refused target, carrying the gates that fired and their reasons.
 *
 * `confidence` is present for a refused target and that is not an oversight:
 * `computeConfidence` runs for gated targets too (`targeting.ts:~880` note), and
 * "we excluded this on 200-day-old D5 evidence" is a materially different claim
 * from "we excluded it on a confirmed regulator filing". A refusal ledger that
 * cannot show the quality of its own refusals is unauditable.
 */
export interface RefusalEntry {
  targetId: string;
  name: string;
  /** Free text as a human typed it (`targeting.ts:~380`), for display beside the gate. */
  jurisdiction: string | null;
  /** ALL gates that fired, in `GATE_KEYS` order. Never just the first. */
  gates: GateHit[];
  /** The gate that determines the disposition: the first wall, else the first task. */
  primary: GateHit;
  disposition: RefusalDisposition;
  /** Remedies for the curable gates, in gate order. Present even on a wall entry. */
  remedies: string[];
  recoverableCount: number;
  wallCount: number;
  /** The confidence we refused AT. Beside, never inside. */
  confidence: TargetConfidence;
  /** One line for a dense list row. */
  summary: string;
}

/**
 * The ledger. `byGate` carries EVERY `GateKey` including zeros so a header strip
 * has a stable set of columns and a gate that never fires is visibly zero rather
 * than absent — an absent key reads as "not checked", which is the same class of
 * lie the three-state `ScreeningResult` exists to prevent (`targeting.ts:203`).
 */
export interface RefusalLedger {
  entries: RefusalEntry[];
  byGate: Record<GateKey, number>;
  /** Entries whose disposition is `'wall'`. */
  walls: number;
  /** Entries whose disposition is `'task'` — i.e. every fired gate is curable. */
  tasks: number;
}

/** Build one ledger entry from an excluded assessment. Pure. */
function refusalEntry(a: TargetAssessment, jurisdiction: string | null): RefusalEntry {
  const gates = a.gates;
  const wallCount = gates.filter((g) => !g.recoverable).length;
  const recoverableCount = gates.length - wallCount;
  const disposition: RefusalDisposition = wallCount > 0 ? 'wall' : 'task';
  const primary = gates.find((g) => !g.recoverable) ?? gates[0];
  const remedies = gates
    .map((g) => g.remedy)
    .filter((r): r is string => typeof r === 'string' && r.length > 0);
  const tail = gates.length > 1 ? ` (+${gates.length - 1} more)` : '';
  return {
    targetId: a.targetId,
    name: a.name,
    jurisdiction,
    gates,
    primary,
    disposition,
    remedies,
    recoverableCount,
    wallCount,
    confidence: a.confidence,
    summary: `${a.name}: ${disposition === 'wall' ? 'WALL' : 'TASK'} — ${primary?.reason ?? 'gated'}${tail}`,
  };
}

/** Zeroed gate tally. Every key present — see `RefusalLedger.byGate`. */
function emptyGateTally(): Record<GateKey, number> {
  return GATE_KEYS.reduce(
    (acc, k) => {
      acc[k] = 0;
      return acc;
    },
    {} as Record<GateKey, number>,
  );
}

/**
 * Compose the ledger from `rankTargets().excluded`.
 *
 * Exported so a caller can build a standalone conflict/refusal surface without
 * building a queue — the refusals are not a subordinate part of the queue, they
 * are half the product.
 */
export function refusalLedger(
  excluded: readonly TargetAssessment[],
  jurisdictionById: Readonly<Record<string, string | null>> = {},
): RefusalLedger {
  const entries = excluded.map((a) => refusalEntry(a, jurisdictionById[a.targetId] ?? null));
  const byGate = emptyGateTally();
  for (const e of entries) for (const g of e.gates) byGate[g.key] += 1;
  return {
    entries,
    byGate,
    walls: entries.filter((e) => e.disposition === 'wall').length,
    tasks: entries.filter((e) => e.disposition === 'task').length,
  };
}

/* ── Which target fields feed which factor ─────────────────────────────────── */

/**
 * The scoring inputs of `GpsTarget`, paired with the factor each one feeds.
 *
 * This exists to answer a question no other part of the system can: which facts
 * are ALREADY MOVING THE SCORE while carrying no provenance at all? A field with
 * a value and no source is a number nobody can trace, which is D1's definition of
 * decoration and D8's definition of a claim without a mechanism. Listing the
 * fields explicitly (rather than reflecting over keys) keeps the pairing reviewable
 * and means adding a seventh scoring input to `targeting.ts` shows up here as a
 * missing entry rather than as silent under-reporting.
 */
export const SCORING_FIELDS: readonly { field: keyof GpsTarget; factor: TargetFactorKey }[] = [
  { field: 'identifiedNeeds', factor: 'need' },
  { field: 'statedBudgetCents', factor: 'abilityToPay' },
  { field: 'capitalProxyCents', factor: 'abilityToPay' },
  { field: 'market', factor: 'abilityToPay' },
  { field: 'quotedPriceCents', factor: 'expectedMargin' },
  { field: 'expectedVendorCostCents', factor: 'expectedMargin' },
  { field: 'decisionMaker', factor: 'access' },
  { field: 'introPath', factor: 'access' },
  { field: 'deadlineIso', factor: 'urgency' },
  { field: 'complexity', factor: 'deliveryComplexity' },
] as const;

/** Fields with a value on the target but no supplied provenance. */
function unprovenancedFields(t: GpsTarget, facts: readonly FactProvenance[]): string[] {
  const sourced = new Set(facts.map((f) => f.field));
  return SCORING_FIELDS.filter(({ field }) => t[field] != null && !sourced.has(String(field))).map(
    ({ field }) => String(field),
  );
}

/* ── The queue — slice 8.1 ─────────────────────────────────────────────────── */

/**
 * Default queue capacity: a day's work, not a lead list.
 *
 * Twelve because the constraint is his, not the data's: he sells and coordinates
 * around a full-time job (`delivery.ts:~1173`, coordination hours are the real
 * ceiling), and a queue longer than a morning of real calls is a backlog wearing
 * a ranking. The number is a stated prior like every other in this programme, and
 * the cut it produces is REPORTED (`OriginationQueue.deferred`) rather than
 * applied silently — a truncation without a reason is the same defect as a gate
 * without a reason.
 */
export const QUEUE_CAPACITY_DEFAULT = 12;

/** One target plus the origination context that `GpsTarget` deliberately has no room for. */
export interface OriginationInput {
  target: GpsTarget;
  /** The why-now, if one has been recorded. Absent is a legitimate, visible state. */
  trigger?: TriggerInput | null;
  /** Provenance for the facts feeding the score. Missing entries are reported, not assumed. */
  facts?: readonly FactInput[] | null;
}

/**
 * One row of the queue.
 *
 * `score` is `number` rather than `number | null` because a gated target cannot
 * reach this type — it is in the ledger. That narrowing is the type-level
 * statement of "a firing gate never appears in the ranked list", and it means a
 * renderer of this row never has to handle a null score and therefore never
 * invents a fallback for one.
 *
 * `confidence`, `band` and `admiralty` sit BESIDE `score` as sibling fields
 * (D3). There is no combined field, and adding one would be a visible change to
 * this interface rather than an edit to an expression.
 */
export interface QueueRow {
  /** 1-based position in the queue as shown. */
  rank: number;
  targetId: string;
  name: string;
  jurisdiction: string | null;
  /** 0–100. Never null here. */
  score: number;
  /** Unclamped driver sum, kept for audit (`targeting.ts:~965`). */
  rawScore: number;
  /** Signed contributions; they sum exactly to `rawScore`. All six, always (D1). */
  drivers: Driver[];
  /** 0–100, computed separately. Never multiplied into `score`. */
  confidence: number;
  band: ConfidenceBand;
  /** e.g. `'B2'`; null when no evidence grade was supplied at all. */
  admiralty: string | null;
  /** Which factors are unknown — what to go and get. */
  missingFactors: TargetFactorKey[];
  /** Signed confidence adjustments, same `Driver` shape as the score trail. */
  confidencePenalties: Driver[];
  /** Why now, with its date and grade. Null when nobody recorded one. */
  trigger: WhyNowTrigger | null;
  /** `'absent'` when `trigger` is null — a state, not a null check. */
  triggerState: TriggerState;
  /** Per-fact Admiralty grade + age + source for the facts feeding the score (8.3). */
  provenance: FactProvenance[];
  /** Fields already moving the score with no source attached (D8). */
  unprovenanced: string[];
  /** Non-gating notes from the assessment, plus origination-level ones. */
  advisories: string[];
  /** The assessment in one sentence (`targeting.ts:~1091`). */
  summary: string;
}

/**
 * The capacity cut, reported. `reason` is a sentence for the same reason a
 * `GateHit` carries one: the rows below the line were excluded from today's work
 * by a rule, and a rule that does not explain itself is indistinguishable from
 * data loss.
 */
export interface DeferredCut {
  count: number;
  reason: string;
  /** Lowest score that made the cut; null when the queue is empty. */
  lowestQueuedScore: number | null;
  /** Highest score that did not; null when nothing was deferred. */
  highestDeferredScore: number | null;
  /** Ids of the deferred targets, in rank order. Nothing disappears without a name. */
  targetIds: string[];
}

export interface OriginationQueue {
  /** The finite queue, best first. Length ≤ `capacity`. */
  rows: QueueRow[];
  /** The rows the capacity rule removed. Never silently dropped. */
  deferred: DeferredCut;
  capacity: number;
  /** Every gated target with the gate that fired and its reason (D2). */
  refusals: RefusalLedger;
  /** The instant deadlines were measured against (`AssessOptions.asOf`). */
  asOf: string;
  weights: TargetingWeights;
  weightsVersion: 'v1';
  /** "stated prior, reviewed quarterly" — printable beside a ranking. */
  weightsBasis: typeof WEIGHTS_V1_BASIS;
  triggerBasis: typeof TRIGGER_SHELF_LIFE_BASIS;
}

export interface OriginationOptions extends AssessOptions {
  /** Rows to show. Defaults to `QUEUE_CAPACITY_DEFAULT`; the cut is always reported. */
  capacity?: number;
}

/**
 * Origination-level advisories — the notes that only exist once a target has
 * context around it. The assessment's own advisories are about the SCORE; these
 * are about whether the row is fit to act on today, which is a different question
 * and the one the queue is for.
 */
function originationAdvisories(
  trigger: WhyNowTrigger | null,
  facts: readonly FactProvenance[],
  unprovenanced: readonly string[],
): string[] {
  const out: string[] = [];
  if (trigger == null) {
    out.push('No why-now trigger recorded — this is a list entry, not a reason to call today.');
  } else {
    if (trigger.state === 'expired') {
      out.push(
        `Why-now is ${trigger.ageDays}d old, past the ${trigger.shelfLifeDays}d shelf life for a ${trigger.kindLabel.toLowerCase()} — re-check before calling.`,
      );
    }
    if (trigger.state === 'undated') {
      out.push('Why-now has no date, so it cannot be aged — treat it as unverified timing.');
    }
    if (trigger.futureDated) {
      out.push('Why-now is dated in the future; the event date and the date we learned of it may have been confused.');
    }
  }
  if (unprovenanced.length > 0) {
    out.push(
      `${unprovenanced.length} scoring field${unprovenanced.length === 1 ? '' : 's'} carry no source: ${unprovenanced.join(', ')}.`,
    );
  }
  const stale = facts.filter((f) => f.stale).length;
  if (stale > 0) {
    out.push(`${stale} of ${facts.length} sourced facts are stale or undated (under ${FACT_STALE_CONFIDENCE}/100).`);
  }
  return out;
}

/** Validate the capacity. Loud, because a silent 0 would render an empty instrument. */
function normaliseCapacity(capacity: number | undefined): number {
  if (capacity == null) return QUEUE_CAPACITY_DEFAULT;
  if (!Number.isFinite(capacity) || capacity < 1) {
    throw new Error(`capacity must be a finite number ≥ 1, received: ${capacity}`);
  }
  return Math.floor(capacity);
}

/**
 * Index the inputs by target id, refusing duplicates.
 *
 * A duplicate id would attach one target's trigger and provenance to another's
 * row while both appear in the ranking — a queue that quietly disagrees with
 * itself. Throwing is the cheap fix; de-duplicating silently would pick a winner
 * on behalf of a human who does not know there was a contest.
 */
function indexInputs(inputs: readonly OriginationInput[]): Map<string, OriginationInput> {
  const byId = new Map<string, OriginationInput>();
  for (const i of inputs) {
    if (byId.has(i.target.id)) throw new Error(`duplicate target id in origination input: ${i.target.id}`);
    byId.set(i.target.id, i);
  }
  return byId;
}

/**
 * Compose the queue.
 *
 * The whole scoring decision is `rankTargets`'; this function adds no arithmetic
 * to it and deliberately reads only `score`, `rawScore`, `drivers`, `confidence`
 * and `gates` off each assessment. Anything that looked like re-deriving a score
 * here would be a second, divergent implementation of the ranking — the failure
 * that the contract rule in this programme exists to prevent.
 */
export function buildOriginationQueue(
  inputs: readonly OriginationInput[],
  opts: OriginationOptions = {},
): OriginationQueue {
  const asOfMs = resolveAsOfMs(opts.asOf);
  const capacity = normaliseCapacity(opts.capacity);
  const byId = indexInputs(inputs);
  const ranking = rankTargets(
    inputs.map((i) => i.target),
    { asOf: asOfMs, weights: opts.weights },
  );

  const jurisdictionById: Record<string, string | null> = {};
  for (const [id, i] of byId) jurisdictionById[id] = i.target.jurisdiction ?? null;

  const toRow = (a: TargetAssessment, index: number): QueueRow => {
    const input = byId.get(a.targetId);
    const target = input?.target;
    const facts = (input?.facts ?? []).map((f) => factProvenance(f, asOfMs));
    const trigger = input?.trigger ? resolveTrigger(input.trigger, asOfMs) : null;
    const unprovenanced = target ? unprovenancedFields(target, facts) : [];
    return {
      rank: index + 1,
      targetId: a.targetId,
      name: a.name,
      jurisdiction: jurisdictionById[a.targetId] ?? null,
      // Non-null asserted by the eligibility filter in `rankTargets`, which sets
      // `score` on every eligible assessment and null on every gated one
      // (`targeting.ts:~965`). `?? 0` rather than `!` so a future change to that
      // invariant degrades to a visible zero instead of a runtime crash.
      score: a.score ?? 0,
      rawScore: a.rawScore ?? 0,
      drivers: a.drivers,
      confidence: a.confidence.confidence,
      band: a.confidence.band,
      admiralty: a.confidence.admiralty,
      missingFactors: a.confidence.missingFactors,
      confidencePenalties: a.confidence.penalties,
      trigger,
      triggerState: trigger?.state ?? 'absent',
      provenance: facts,
      unprovenanced,
      advisories: [...a.advisories, ...originationAdvisories(trigger, facts, unprovenanced)],
      summary: a.summary,
    };
  };

  const queued = ranking.ranked.slice(0, capacity).map(toRow);
  const cut = ranking.ranked.slice(capacity);
  const deferred: DeferredCut = {
    count: cut.length,
    reason:
      cut.length === 0
        ? `Nothing deferred: ${ranking.ranked.length} eligible target${ranking.ranked.length === 1 ? '' : 's'} fit inside the ${capacity}-row queue.`
        : `${cut.length} eligible target${cut.length === 1 ? '' : 's'} ranked below the ${capacity}-row capacity. Deferred by the capacity rule, not by a gate — nothing about them was disqualifying.`,
    lowestQueuedScore: queued.length > 0 ? queued[queued.length - 1].score : null,
    highestDeferredScore: cut.length > 0 ? (cut[0].score ?? 0) : null,
    targetIds: cut.map((a) => a.targetId),
  };

  return {
    rows: queued,
    deferred,
    capacity,
    refusals: refusalLedger(ranking.excluded, jurisdictionById),
    asOf: new Date(asOfMs).toISOString(),
    weights: ranking.weights,
    weightsVersion: ranking.weightsVersion,
    weightsBasis: WEIGHTS_V1_BASIS,
    triggerBasis: TRIGGER_SHELF_LIFE_BASIS,
  };
}

/* ── The research brief — slice 8.4 ────────────────────────────────────────── */

/**
 * Where an assertion belongs in the brief. Closed so a printed brief has a stable
 * running order and so "miscellaneous" cannot become the section where unsourced
 * colour accumulates.
 */
export type BriefSection =
  | 'situation'
  | 'need'
  | 'ability_to_pay'
  | 'timing'
  | 'access'
  | 'risk'
  | 'commercial';

export const BRIEF_SECTION_LABELS: Record<BriefSection, string> = {
  situation: 'Situation',
  need: 'Identified need',
  ability_to_pay: 'Ability to pay',
  timing: 'Timing',
  access: 'Access',
  risk: 'Risk and conflicts',
  commercial: 'Commercial shape',
};

/** The running order of a printed brief (D7). */
export const BRIEF_SECTION_ORDER: readonly BriefSection[] = [
  'situation',
  'need',
  'ability_to_pay',
  'timing',
  'access',
  'risk',
  'commercial',
] as const;

/**
 * Two states, and the second one is the point.
 *
 * `'UNVERIFIED'` is a LABEL the brief prints, not an absence. The failure being
 * designed against is a brief that reads well and is wrong; an unverified claim
 * that looks exactly like a sourced one is precisely how that happens, so the
 * status is a required field on every assertion and `briefIntegrity` refuses the
 * combinations that would let the two blur.
 */
export type AssertionStatus = 'SOURCED' | 'UNVERIFIED';

/** A judgement expressed in ICD-203 vocabulary (`estimative.ts`), never as a bare %. */
export interface BriefEstimate {
  /** Whole percent 0–100. */
  pct: number;
  term: LikelihoodTerm;
  /** Analytic confidence — orthogonal to the likelihood, never folded into it. */
  confidence: ConfidenceLevel;
}

/**
 * Build an estimate. Uses the platform's one probability vocabulary rather than a
 * local phrasing, so a GPS brief and an intel note say "likely" at the same
 * threshold.
 */
export function briefEstimate(p: number, conf: ConfidenceInput | ConfidenceLevel): BriefEstimate {
  const l = likelihood(p);
  return {
    pct: l.pct,
    term: l.term,
    confidence: typeof conf === 'string' ? conf : estimativeConfidence(conf),
  };
}

/**
 * One claim in the brief.
 *
 * Every sentence a reader can act on is one of these. There is no prose field on
 * `ResearchBrief` for a sentence to hide in, which is the mechanism behind D8
 * here: to say something in a brief you must create an assertion, and an
 * assertion without provenance is a violation with a code.
 */
export interface BriefAssertion {
  /** Stable within the brief; cited by `ProposedOpening.citedAssertionIds`. */
  id: string;
  section: BriefSection;
  /** The claim, one sentence. */
  text: string;
  status: AssertionStatus;
  /** Grade + date + source. MUST be null when `status === 'UNVERIFIED'`. */
  provenance: FactProvenance | null;
  /** Present when the claim is a judgement rather than a fact. */
  estimate?: BriefEstimate | null;
}

/**
 * A proposed opening (slice 8.5), as a DRAFT only.
 *
 * `approvedForSend: false` is a literal type, not a boolean. This module cannot
 * construct an approved opening, so no code path from origination reaches a send
 * — approval is a human act through the existing send-gate discipline, and the
 * type makes that non-negotiable rather than conventional.
 */
export interface ProposedOpening {
  text: string;
  /** Assertion ids this text leans on. */
  citedAssertionIds: string[];
  /**
   * An explicit statement by the author that the text makes NO factual claim
   * about the target (a pure question or an introduction). Required to be true
   * when there are no citations — the forced choice removes the third option,
   * which is an uncited sentence that quietly asserts something.
   */
  assertsNothing?: boolean;
  approvedForSend: false;
}

/** What `briefIntegrity` can find. Each code names a specific way a brief lies. */
export type BriefViolationCode =
  | 'assertion_without_provenance'
  | 'unverified_carries_provenance'
  | 'provenance_undated'
  | 'provenance_stale'
  | 'duplicate_assertion_id'
  | 'opening_cites_unknown_assertion'
  | 'opening_cites_unverified'
  | 'opening_without_citations'
  | 'empty_brief';

export interface BriefViolation {
  code: BriefViolationCode;
  /** The offending assertion, or null for a whole-brief violation. */
  assertionId: string | null;
  detail: string;
  /**
   * True when the brief must not be carried into a client conversation.
   * Non-blocking violations are quality findings — a stale source is a reason to
   * re-check, not a reason the brief is a lie.
   */
  blocking: boolean;
}

export interface BriefIntegrity {
  /** No BLOCKING violations. Non-blocking findings can be present and `ok` true. */
  ok: boolean;
  violations: BriefViolation[];
  assertions: number;
  sourced: number;
  unverified: number;
  /** Mean 0–100 provenance confidence across sourced assertions; null when none. */
  meanProvenanceConfidence: number | null;
  /**
   * True when the brief asserts NOTHING and lists what we do not know. This is a
   * VALID brief and the most honest possible output for a target we have not
   * researched — the alternative, an empty page, reads as "nothing to worry about".
   */
  onlyUnknowns: boolean;
}

/**
 * A brief before it has been checked.
 *
 * The split exists so that `ResearchBrief` — the only shape that reaches a
 * surface or a printer — cannot be constructed without an integrity verdict.
 * `sealBrief` is the single door, and it runs the predicate on the way through.
 * A caller who assembles a `BriefDraft` and hands it to a renderer gets a type
 * error, which is the strongest available form of "no claim without a mechanism".
 */
export interface BriefDraft {
  targetId: string;
  name: string;
  /** The instant the underlying assessment was measured against. */
  asOf: string;
  /** 0–100, or null when the target is gated. A brief for a refused target is legal. */
  score: number | null;
  /** Beside the score, never inside it. */
  confidence: number;
  band: ConfidenceBand;
  /** Gates that fired, if any. Empty for an eligible target. */
  gates: GateHit[];
  /** Every claim. There is no free-prose field on this type, on purpose. */
  assertions: BriefAssertion[];
  /** What we do NOT know. Part of the brief, not an omission. */
  unknowns: string[];
  /** Why now, with its date and grade. */
  trigger: WhyNowTrigger | null;
  /** A draft opening, never approved by this module. */
  proposedOpening: ProposedOpening | null;
}

/** A sealed brief: a draft plus the verdict on it. The only printable shape (D7). */
export interface ResearchBrief extends BriefDraft {
  /** ISO instant this brief was sealed. Dated, because it is printable. */
  generatedIso: string;
  integrity: BriefIntegrity;
}

/**
 * Does every assertion carry provenance? Returns the violations.
 *
 * The mechanism behind D8 for the brief. Deliberately a PREDICATE OVER DATA
 * rather than a set of constructor guards: guards are bypassed by the next code
 * path that builds the object a different way, whereas a checkable predicate can
 * be re-run over a stored brief, in a test, or in CI, and answers the same way
 * every time.
 *
 * The blocking/non-blocking split is the difference between "this brief lies" and
 * "this brief is thin". A stale source is thin; an unsourced assertion presented
 * as sourced is a lie, and only lies block.
 */
export function briefIntegrity(brief: BriefDraft): BriefIntegrity {
  const violations: BriefViolation[] = [];
  const seen = new Set<string>();

  for (const a of brief.assertions) {
    if (seen.has(a.id)) {
      violations.push({
        code: 'duplicate_assertion_id',
        assertionId: a.id,
        detail: `Assertion id "${a.id}" appears more than once, so a citation to it is ambiguous.`,
        blocking: true,
      });
    }
    seen.add(a.id);

    if (a.status === 'SOURCED' && a.provenance == null) {
      violations.push({
        code: 'assertion_without_provenance',
        assertionId: a.id,
        detail: `"${a.text}" is presented as sourced but carries no provenance. Attach a source and grade, or mark it UNVERIFIED.`,
        blocking: true,
      });
    }
    if (a.status === 'UNVERIFIED' && a.provenance != null) {
      // Mislabelling in the safe-looking direction is still mislabelling: a reader
      // who sees a grade beside "UNVERIFIED" cannot tell which of the two to believe.
      violations.push({
        code: 'unverified_carries_provenance',
        assertionId: a.id,
        detail: `"${a.text}" is labelled UNVERIFIED but carries provenance (${provenanceLabel(a.provenance)}). One of the two is wrong.`,
        blocking: true,
      });
    }
    if (a.provenance != null && a.provenance.undated) {
      violations.push({
        code: 'provenance_undated',
        assertionId: a.id,
        detail: `Source for "${a.text}" has no observation date, so its age cannot be shown (${provenanceLabel(a.provenance)}).`,
        blocking: false,
      });
    } else if (a.provenance != null && a.provenance.stale) {
      violations.push({
        code: 'provenance_stale',
        assertionId: a.id,
        detail: `Source for "${a.text}" is stale at ${a.provenance.confidence}/100 (${provenanceLabel(a.provenance)}) — re-check before quoting it.`,
        blocking: false,
      });
    }
  }

  const opening = brief.proposedOpening;
  if (opening != null) {
    const cited = opening.citedAssertionIds;
    if (cited.length === 0 && opening.assertsNothing !== true) {
      violations.push({
        code: 'opening_without_citations',
        assertionId: null,
        detail:
          'The proposed opening cites no assertion and is not declared as asserting nothing. An uncited opening is an unsourced claim in front of a client.',
        blocking: true,
      });
    }
    for (const id of cited) {
      const a = brief.assertions.find((x) => x.id === id);
      if (a == null) {
        violations.push({
          code: 'opening_cites_unknown_assertion',
          assertionId: id,
          detail: `The proposed opening cites "${id}", which is not in this brief.`,
          blocking: true,
        });
        continue;
      }
      if (a.status === 'UNVERIFIED') {
        // The worst failure in the system, caught at its narrowest point: this is
        // the exact path by which an unverified claim is spoken out loud to a
        // paying client as though it were established.
        violations.push({
          code: 'opening_cites_unverified',
          assertionId: id,
          detail: `The proposed opening leans on UNVERIFIED assertion "${id}" ("${a.text}"). Verify it or rewrite the opening.`,
          blocking: true,
        });
      }
    }
  }

  const sourcedList = brief.assertions.filter((a) => a.status === 'SOURCED' && a.provenance != null);
  const meanProvenanceConfidence =
    sourcedList.length === 0
      ? null
      : Math.round(sourcedList.reduce((s, a) => s + (a.provenance?.confidence ?? 0), 0) / sourcedList.length);

  const onlyUnknowns = brief.assertions.length === 0 && brief.unknowns.length > 0;

  if (brief.assertions.length === 0 && brief.unknowns.length === 0) {
    // A brief that says nothing AND does not admit it says nothing. The empty page
    // is the version of this failure that reads as "no concerns".
    violations.push({
      code: 'empty_brief',
      assertionId: null,
      detail: 'The brief contains no assertions and no unknowns. A brief with nothing in it must at least state what is not known.',
      blocking: true,
    });
  }

  return {
    ok: violations.every((v) => !v.blocking),
    violations,
    assertions: brief.assertions.length,
    sourced: brief.assertions.filter((a) => a.status === 'SOURCED').length,
    unverified: brief.assertions.filter((a) => a.status === 'UNVERIFIED').length,
    meanProvenanceConfidence,
    onlyUnknowns,
  };
}

/**
 * Seal a draft. The only constructor for a `ResearchBrief`.
 *
 * `generatedIso` defaults to now — the one ambient clock dependency in this
 * module besides `AssessOptions.asOf`, and stated here rather than hidden. Pass
 * it explicitly anywhere the output is stored or compared.
 */
export function sealBrief(draft: BriefDraft, generatedIso?: string): ResearchBrief {
  return {
    ...draft,
    generatedIso: generatedIso ?? new Date().toISOString(),
    integrity: briefIntegrity(draft),
  };
}

/**
 * What we do not know, derived mechanically.
 *
 * `unknowns` is a required field on a brief, and a required field that a human
 * has to remember to fill is a field that ends up empty on the brief that
 * mattered. So the four things the system can already prove it does not know —
 * unanswered factors, the confidence penalties (`targeting.ts:~930`: unperformed
 * screen, unrecorded evidence age, unrecorded perimeter, suspected wash trading),
 * an absent why-now, and score inputs with no source — are generated rather than
 * authored. Anything beyond these is a human addition; nothing here invents a gap
 * it cannot point at.
 */
export interface UnknownsInput {
  missingFactors: readonly TargetFactorKey[];
  /** Confidence penalties from the assessment; their labels ARE known unknowns. */
  confidencePenalties?: readonly Driver[];
  triggerState?: TriggerState;
  /** Fields moving the score with no source (`QueueRow.unprovenanced`). */
  unprovenanced?: readonly string[];
}

export function deriveUnknowns(input: UnknownsInput): string[] {
  const out: string[] = [];
  // TARGET_FACTOR_KEYS order, not input order, so two briefs of the same target
  // list their gaps identically and a diff between them is meaningful.
  for (const k of TARGET_FACTOR_KEYS) {
    if (input.missingFactors.includes(k)) out.push(`${FACTOR_LABELS[k]} — not established.`);
  }
  for (const p of input.confidencePenalties ?? []) out.push(`${p.label}.`);
  if (input.triggerState === 'absent') out.push('No why-now trigger recorded.');
  if (input.triggerState === 'undated') out.push('Why-now trigger has no date.');
  for (const f of input.unprovenanced ?? []) out.push(`${f} is used in the score but carries no source.`);
  return out;
}

/* ── Wire types ────────────────────────────────────────────────────────────────
 * These are the `data` payloads of the GPS origination endpoints, and they live
 * HERE so the API and the web app import ONE declaration. A hand-copied web
 * interface declaring fields the API never returned is the bug this programme
 * already shipped once: `tsc` believed the copy and the mocked test agreed with
 * it, so it crashed only in production. Never re-declare these in
 * `apps/web/src/lib/api/*`.
 */

/**
 * `GET /gps/origination` — the queue, the refusals and the counts.
 *
 * `counts` is computed by `originationResponse` from the arrays it ships, in the
 * same expression, and asserted in the tests. That is deliberate history: GPS has
 * already shipped a surface whose `counts` never existed on the response at all
 * (plan §1, D8). A count that is not derived from the rows beside it is the
 * cheapest thing in this file to get wrong.
 */
export interface OriginationResponse {
  /** When this payload was built. The queue carries its own measurement instant. */
  generatedIso: string;
  queue: OriginationQueue;
  counts: {
    /** Every target supplied. Equals queued + deferred + refused. */
    considered: number;
    queued: number;
    deferred: number;
    refused: number;
    /** Refused entries with at least one unrecoverable gate — walk away. */
    walls: number;
    /** Refused entries where every fired gate is curable — a worklist. */
    tasks: number;
  };
}

/** Build the response. The only place `counts` is derived. */
export function originationResponse(queue: OriginationQueue, generatedIso?: string): OriginationResponse {
  const refused = queue.refusals.entries.length;
  return {
    generatedIso: generatedIso ?? new Date().toISOString(),
    queue,
    counts: {
      considered: queue.rows.length + queue.deferred.count + refused,
      queued: queue.rows.length,
      deferred: queue.deferred.count,
      refused,
      walls: queue.refusals.walls,
      tasks: queue.refusals.tasks,
    },
  };
}

/**
 * `GET /gps/origination/:targetId/brief` — one brief.
 *
 * `refusal` travels WITH the brief rather than instead of it. A brief for a
 * refused target is legitimate — you still need to know who they are before you
 * write the decline — but a surface that renders one without the gate beside it
 * has rebuilt the silent exclusion this programme removed. Null when the target
 * is eligible.
 */
export interface BriefResponse {
  generatedIso: string;
  brief: ResearchBrief;
  refusal: RefusalEntry | null;
}
