/**
 * G5 — THE FACTORY SERVICE: slots collected, gaps refused, drafts versioned, QA
 * through the desk's own review gate.
 *
 * The three invariants this file carries:
 *
 *  · A DRAFT NEVER RUNS AHEAD OF THE FACTS. `collectSlotState` assembles slot
 *    values from the engagement row, the client's own portal answers (G4) and the
 *    accepted dossier's angle (G2); `generateDraft` refuses over any required gap
 *    with the full list — which is, verbatim, what to chase the client for.
 *  · NOTHING DEFECTIVE IS STORED — same as dossiers: a model response that fails
 *    the shape validator returns with its defect bill and touches no table.
 *  · QA ACCEPTANCE IS THE REVIEW. Accepting a draft linked to a deliverable calls
 *    `recordDeliverableReview` — the delivery desk's own function — so 0049's
 *    "accepted before reviewed is unstorable" constraint now guards the whole
 *    waterfall: the client (portal) cannot accept what QA has not passed.
 */

import type pg from 'pg';
import {
  composeDraftPrompt,
  draftDefects,
  factoryTemplate,
  slotGaps,
  type DraftDefect,
  type FactorySlot,
  type FactoryStage,
  type EngagementStatus,
  type OfferKey,
  type StageActualInput,
  type StatedTriple,
  type WaterfallShape,
} from '@lcx/shared';
import { FACTORY_STAGES, waterfallShape } from '@lcx/shared';
import { llm } from '../ai/llm.js';
import { angleFrom } from './dossier.js';
import { recordDeliverableReview } from './deliveryDesk.js';

export async function isFactoryMigrated(pool: pg.Pool): Promise<boolean | null> {
  try {
    const r = await pool.query(`SELECT to_regclass('gps_draft') AS rel`);
    return r.rows[0]?.rel !== null;
  } catch (err) {
    console.error('[gps] factory register probe failed; not caching:', err);
    return null;
  }
}

/* ── Slot collection ────────────────────────────────────────────────────────── */

export interface SlotState {
  offerKey: OfferKey;
  clientName: string;
  slots: Array<FactorySlot & { filled: boolean }>;
  gaps: readonly FactorySlot[];
  values: Record<string, string>;
  sections: readonly string[];
  draftTitle: string;
}

export async function collectSlotState(
  pool: pg.Pool,
  engagementId: string,
): Promise<SlotState | null> {
  const eng = await pool.query(
    `SELECT e.id, e.offer_key, c.name AS client_name
       FROM gps_engagement e JOIN gps_client c ON c.id = e.client_id
      WHERE e.id = $1`,
    [engagementId],
  );
  if (eng.rows.length === 0) return null;
  const offerKey = String(eng.rows[0].offer_key) as OfferKey;
  const clientName = String(eng.rows[0].client_name);
  const template = factoryTemplate(offerKey);

  const values: Record<string, string> = {
    'engagement.clientName': clientName,
    'engagement.offerName': template.draftTitle,
  };

  /* The client's own answers, latest per key — the portal (G4) writes them under
     the SAME catalogue sentences the template's slots carry, so the join is exact. */
  let portalFactsReadable = true;
  try {
    const facts = await pool.query(
      `SELECT DISTINCT ON (fact_key) fact_key, fact_value
         FROM gps_portal_fact WHERE engagement_id = $1
        ORDER BY fact_key, submitted_at DESC`,
      [engagementId],
    );
    for (const f of facts.rows as Array<{ fact_key: string; fact_value: string }>) {
      values[`client:${f.fact_key}`] = f.fact_value;
    }
  } catch {
    // 0080 unapplied: the client has had no way to answer. Not an error — the
    // gaps below say exactly what is missing, and the desk can type answers into
    // the portal on the client's behalf once it exists.
    portalFactsReadable = false;
  }
  void portalFactsReadable;

  try {
    const dossier = await pool.query(
      `SELECT d.dossier_md
         FROM gps_dossier d
        WHERE d.status = 'accepted'
          AND d.target_id IN (SELECT id FROM gps_target WHERE name = $1)
        ORDER BY d.generated_at DESC LIMIT 1`,
      [clientName],
    );
    if (dossier.rows.length > 0) {
      const angle = angleFrom(String(dossier.rows[0].dossier_md));
      if (angle !== null) values['dossier:angle'] = angle;
    }
  } catch { /* 0078 unapplied — the optional slot simply stays empty. */ }

  const gaps = slotGaps(template, values);
  return {
    offerKey,
    clientName,
    slots: template.slots.map((s) => ({ ...s, filled: typeof values[s.key] === 'string' && values[s.key].trim() !== '' })),
    gaps,
    values,
    sections: template.sections,
    draftTitle: template.draftTitle,
  };
}

/* ── Rows ───────────────────────────────────────────────────────────────────── */

export interface DraftRow {
  id: number;
  engagementId: string;
  deliverableId: string | null;
  offerKey: string;
  version: number;
  status: 'draft' | 'accepted' | 'rework' | 'superseded';
  draftText: string;
  model: string;
  slotsFilled: number;
  generatedBy: string;
  generatedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

function mapDraft(r: Record<string, unknown>): DraftRow {
  return {
    id: Number(r.id),
    engagementId: String(r.engagement_id),
    deliverableId: r.deliverable_id === null || r.deliverable_id === undefined ? null : String(r.deliverable_id),
    offerKey: String(r.offer_key),
    version: Number(r.version),
    status: r.status as DraftRow['status'],
    draftText: String(r.draft_text),
    model: String(r.model),
    slotsFilled: Number(r.slots_filled),
    generatedBy: String(r.generated_by),
    generatedAt: new Date(r.generated_at as string).toISOString(),
    decidedBy: r.decided_by === null || r.decided_by === undefined ? null : String(r.decided_by),
    decidedAt: r.decided_at === null || r.decided_at === undefined ? null : new Date(r.decided_at as string).toISOString(),
    decisionNote: r.decision_note === null || r.decision_note === undefined ? null : String(r.decision_note),
  };
}

export async function listDrafts(pool: pg.Pool, engagementId: string): Promise<DraftRow[]> {
  const r = await pool.query(
    `SELECT * FROM gps_draft WHERE engagement_id = $1 ORDER BY version DESC LIMIT 50`,
    [engagementId],
  );
  return r.rows.map(mapDraft);
}

/* ── Generation ─────────────────────────────────────────────────────────────── */

export type GenerateDraftOutcome =
  | { ok: true; draft: DraftRow }
  | { ok: false; code: 'NOT_FOUND'; detail: string }
  /** D10: the refusal that is also the chase list. */
  | { ok: false; code: 'SLOTS_MISSING'; detail: string; gaps: ReadonlyArray<{ key: string; label: string }> }
  | { ok: false; code: 'AI_NO_PROVIDER' | 'AI_PROVIDER_ERROR' | 'AI_MODEL_REFUSED'; detail: string; rule: string }
  | { ok: false; code: 'DRAFT_INVALID'; detail: string; defects: readonly DraftDefect[]; rejectedText: string };

export async function generateDraft(
  pool: pg.Pool,
  engagementId: string,
  deliverableId: string | null,
  requestedBy: string,
): Promise<GenerateDraftOutcome> {
  const state = await collectSlotState(pool, engagementId);
  if (state === null) return { ok: false, code: 'NOT_FOUND', detail: `no engagement ${engagementId}` };
  if (state.gaps.length > 0) {
    return {
      ok: false,
      code: 'SLOTS_MISSING',
      detail: `${state.gaps.length} required input(s) have no answer — the draft refuses to run ahead of the client (D10). This list is the chase list.`,
      gaps: state.gaps.map((g) => ({ key: g.key, label: g.label })),
    };
  }

  const template = factoryTemplate(state.offerKey);
  const prompt = composeDraftPrompt(template, state.values);
  const out = await llm.complete(prompt.task, {
    feature: 'gps-factory-draft',
    system: prompt.system,
    maxTokens: 8000,
  });
  if (!out.usedLlm) {
    return { ok: false, code: out.code ?? 'AI_PROVIDER_ERROR', detail: out.detail, rule: out.rule };
  }
  const defects = draftDefects(out.text, template);
  if (defects.length > 0) {
    return {
      ok: false,
      code: 'DRAFT_INVALID',
      detail: `the model response failed the shape contract with ${defects.length} defect(s); nothing was stored`,
      defects,
      rejectedText: out.text,
    };
  }

  // A new version supersedes any UNDECIDED predecessor; decided ones keep their record.
  await pool.query(
    `UPDATE gps_draft SET status = 'superseded' WHERE engagement_id = $1 AND status = 'draft'`,
    [engagementId],
  );
  const filled = state.slots.filter((s) => s.filled).length;
  const inserted = await pool.query(
    `INSERT INTO gps_draft
       (engagement_id, deliverable_id, offer_key, version, status, draft_text, model, slots_filled, generated_by)
     SELECT $1, $2, $3, COALESCE(MAX(version), 0) + 1, 'draft', $4, $5, $6, $7
       FROM gps_draft WHERE engagement_id = $1
     RETURNING *`,
    [engagementId, deliverableId, state.offerKey, out.text, out.provider ?? 'unknown', filled, requestedBy],
  );
  return { ok: true, draft: mapDraft(inserted.rows[0]) };
}

/* ── Stage 2 — QA, through the one review gate ──────────────────────────────── */

export type QaOutcome =
  | { ok: true; draft: DraftRow; reviewRecorded: boolean; reviewDetail: string | null }
  | { ok: false; code: 'NOT_FOUND' | 'ALREADY_DECIDED'; detail: string };

export async function qaDecide(
  pool: pg.Pool,
  draftId: number,
  decision: 'accepted' | 'rework',
  decidedBy: string,
  note: string | null,
): Promise<QaOutcome> {
  const updated = await pool.query(
    `UPDATE gps_draft
        SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4
      WHERE id = $1 AND status = 'draft'
      RETURNING *`,
    [draftId, decision, decidedBy, note],
  );
  if ((updated.rowCount ?? 0) === 0) {
    const existing = await pool.query(`SELECT status FROM gps_draft WHERE id = $1`, [draftId]);
    if (existing.rows.length === 0) return { ok: false, code: 'NOT_FOUND', detail: `no draft ${draftId}` };
    return {
      ok: false,
      code: 'ALREADY_DECIDED',
      detail: `draft ${draftId} is already ${String(existing.rows[0].status)} — generate a new version instead of re-deciding this one`,
    };
  }
  const draft = mapDraft(updated.rows[0]);

  let reviewRecorded = false;
  let reviewDetail: string | null = null;
  if (decision === 'accepted' && draft.deliverableId !== null) {
    /*
     * THE ONE GATE. This is what stops the portal's client acceptance until QA
     * has run: recordDeliverableReview sets reviewed_by/reviewed_at through the
     * desk's own path, and 0049's constraint refuses acceptance before review.
     * A refusal here (conflict gate, missing deliverable) is REPORTED, not
     * swallowed — the QA acceptance stands, and the reviewer sees exactly why
     * the deliverable did not advance with it.
     */
    const review = await recordDeliverableReview(pool, { deliverableId: draft.deliverableId, operator: decidedBy });
    reviewRecorded = review.ok;
    reviewDetail = review.ok ? null : review.message;
  }
  return { ok: true, draft, reviewRecorded, reviewDetail };
}

/* ── Effort truth ───────────────────────────────────────────────────────────── */

export interface StageActualRow {
  id: number;
  engagementId: string;
  stage: FactoryStage;
  hours: number;
  costCents: number;
  note: string | null;
  recordedBy: string;
  recordedAt: string;
}

export function isFactoryStage(x: unknown): x is FactoryStage {
  return typeof x === 'string' && (FACTORY_STAGES as readonly string[]).includes(x);
}

export async function recordStageActual(
  pool: pg.Pool,
  args: { engagementId: string; stage: FactoryStage; hours: number; costCents: number; note: string | null; recordedBy: string },
): Promise<StageActualRow> {
  const r = await pool.query(
    `INSERT INTO gps_stage_actual (engagement_id, stage, hours, cost_cents, note, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [args.engagementId, args.stage, args.hours, args.costCents, args.note, args.recordedBy],
  );
  const row = r.rows[0] as Record<string, unknown>;
  return {
    id: Number(row.id),
    engagementId: String(row.engagement_id),
    stage: row.stage as FactoryStage,
    hours: Number(row.hours),
    costCents: Number(row.cost_cents),
    note: row.note === null || row.note === undefined ? null : String(row.note),
    recordedBy: String(row.recorded_by),
    recordedAt: new Date(row.recorded_at as string).toISOString(),
  };
}

export async function listStageActuals(pool: pg.Pool, engagementId: string): Promise<StageActualRow[]> {
  const r = await pool.query(
    `SELECT * FROM gps_stage_actual WHERE engagement_id = $1 ORDER BY recorded_at DESC LIMIT 100`,
    [engagementId],
  );
  return r.rows.map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    engagementId: String(row.engagement_id),
    stage: row.stage as FactoryStage,
    hours: Number(row.hours),
    costCents: Number(row.cost_cents),
    note: row.note === null || row.note === undefined ? null : String(row.note),
    recordedBy: String(row.recorded_by),
    recordedAt: new Date(row.recorded_at as string).toISOString(),
  }));
}

/* ── Stage 3 — the handover packet, composed on read ────────────────────────── */

export interface HandoverPacket {
  engagement: { id: string; clientName: string; offerKey: string; status: string; deadlineIso: string | null };
  scope: { exclusions: readonly string[]; requiredClientInputs: readonly string[] };
  facts: Array<{ label: string; value: string }>;
  latestAcceptedDraft: { version: number; decidedBy: string; decidedAt: string; draftText: string } | null;
  /** Honest about the bench: a named card when one exists, the absence stated when not. */
  rateCardNote: string;
}

export async function composeHandoverPacket(pool: pg.Pool, engagementId: string): Promise<HandoverPacket | null> {
  const eng = await pool.query(
    `SELECT e.id, e.offer_key, e.status, e.scope_snapshot, c.name AS client_name
       FROM gps_engagement e JOIN gps_client c ON c.id = e.client_id
      WHERE e.id = $1`,
    [engagementId],
  );
  if (eng.rows.length === 0) return null;
  const e = eng.rows[0] as Record<string, unknown>;
  const snap = (e.scope_snapshot ?? {}) as Record<string, unknown>;
  const strList = (v: unknown): readonly string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 50) : [];

  const deadline = await pool.query(
    `SELECT MIN(due_by) AS next_due FROM gps_milestone
      WHERE engagement_id = $1 AND status NOT IN ('done', 'cancelled') AND due_by IS NOT NULL`,
    [engagementId],
  );

  const state = await collectSlotState(pool, engagementId);
  const facts = state
    ? state.slots
        .filter((s) => s.source === 'client_fact' && s.filled)
        .map((s) => ({ label: s.label, value: state.values[s.key] }))
    : [];

  const accepted = await pool.query(
    `SELECT version, decided_by, decided_at, draft_text FROM gps_draft
      WHERE engagement_id = $1 AND status = 'accepted'
      ORDER BY version DESC LIMIT 1`,
    [engagementId],
  );

  return {
    engagement: {
      id: String(e.id),
      clientName: String(e.client_name),
      offerKey: String(e.offer_key),
      status: String(e.status),
      deadlineIso: deadline.rows[0]?.next_due ? new Date(deadline.rows[0].next_due as string).toISOString() : null,
    },
    scope: { exclusions: strList(snap.exclusions), requiredClientInputs: strList(snap.requiredClientInputs) },
    facts,
    latestAcceptedDraft: accepted.rows.length > 0
      ? {
          version: Number(accepted.rows[0].version),
          decidedBy: String(accepted.rows[0].decided_by),
          decidedAt: new Date(accepted.rows[0].decided_at as string).toISOString(),
          draftText: String(accepted.rows[0].draft_text),
        }
      : null,
    rateCardNote:
      'No live partner rate card is attached: the bench is empty by decision D5. The approved rate-card packet (G0) records the values the desk would pay per partner CLASS; name a partner in the registry and a card is one prefilled write away.',
  };
}

/* ── G5's closing leg: the measurement the loop and the packets read ────────── */

/**
 * MEASURE THE WATERFALL from what the registers hold.
 *
 * Both reads are absence-tolerant on purpose. 0081 (`gps_stage_actual`) and 0052
 * (`gps_effort_triple`) are applied by the owner, not by us, and an absent register
 * means "nothing has been measured" — which `waterfallShape` renders as named blind
 * spots. Throwing here would take down the whole loop snapshot over a migration that
 * was always going to be pending, and defaulting to a fabricated shape would be
 * worse than either.
 */
export async function waterfallMeasurement(pool: pg.Pool): Promise<WaterfallShape> {
  const readRows = async <T>(sql: string): Promise<T[]> => {
    try {
      const r = await pool.query(sql);
      return r.rows as T[];
    } catch {
      return [];
    }
  };

  const actualRows = await readRows<Record<string, unknown>>(
    `SELECT sa.engagement_id, sa.stage, sa.hours, sa.cost_cents, sa.recorded_at,
            e.offer_key, e.status
       FROM gps_stage_actual sa
       JOIN gps_engagement e ON e.id = sa.engagement_id
      LIMIT 5000`,
  );
  const tripleRows = await readRows<Record<string, unknown>>(
    `SELECT offer_key, optimistic_days, likely_days, pessimistic_days FROM gps_effort_triple`,
  );
  /*
   * THE DIVISOR COMES FROM THE RATE CARD OR IT DOES NOT COME AT ALL.
   *
   * `hours_per_day` is nullable on the card because it is a fact about how a partner
   * bills, and underwriting already refuses to price an hourly card without one. So it
   * is read here rather than assumed, and — the part that matters — a value is used
   * ONLY when every card for that offer that states one AGREES. Two partners billing a
   * 7-hour and an 8-hour day is a real disagreement, and picking one would invent a
   * consensus; the shape then reports hours and declines to express days.
   */
  const cardRows = await readRows<Record<string, unknown>>(
    `SELECT offer_key, hours_per_day FROM gps_rate_card WHERE hours_per_day IS NOT NULL`,
  );
  const distinctByOffer = new Map<string, Set<number>>();
  for (const r of cardRows) {
    const v = Number(r.hours_per_day);
    if (!Number.isFinite(v) || v <= 0) continue;
    const key = String(r.offer_key);
    const set = distinctByOffer.get(key) ?? new Set<number>();
    set.add(v);
    distinctByOffer.set(key, set);
  }
  const hoursPerDayByOffer: Partial<Record<OfferKey, number>> = {};
  for (const [offerKey, values] of distinctByOffer) {
    if (values.size === 1) hoursPerDayByOffer[offerKey as OfferKey] = [...values][0];
  }

  const actuals: StageActualInput[] = actualRows.map((r) => ({
    engagementId: String(r.engagement_id),
    offerKey: String(r.offer_key) as OfferKey,
    stage: r.stage as FactoryStage,
    hours: Number(r.hours),
    costCents: Number(r.cost_cents),
    engagementStatus: String(r.status) as EngagementStatus,
    recordedAt: new Date(r.recorded_at as string).toISOString(),
  }));
  const triples: StatedTriple[] = tripleRows.map((r) => ({
    offerKey: String(r.offer_key) as OfferKey,
    optimisticDays: Number(r.optimistic_days),
    likelyDays: Number(r.likely_days),
    pessimisticDays: Number(r.pessimistic_days),
  }));

  return waterfallShape(actuals, triples, { hoursPerDayByOffer });
}

/* ── Stage 3's return leg: a partner's work comes back through the SAME gate ── */

export type PartnerDraftOutcome =
  | { ok: true; draft: DraftRow }
  | { ok: false; code: 'NOT_FOUND' | 'VALIDATION'; detail: string };

export const PARTNER_DRAFT_MAX_CHARS = 60_000;

/**
 * RECORD A PARTNER DELIVERABLE AS THE NEXT DRAFT VERSION.
 *
 * The plan's Stage 3 says "partner deliverables come back through the same QA gate",
 * and the only way to mean that literally is for a partner's work to become a
 * `gps_draft` row — because `qaDecide` is the gate, and a gate with two entrances is
 * two gates. So this inserts a version exactly as `generateDraft` does, supersedes any
 * undecided predecessor exactly as it does, and from that moment the partner's text is
 * indistinguishable from ours as far as review is concerned: same accept, same rework,
 * same `recordDeliverableReview` on acceptance, same 0049 constraint standing between
 * it and a client acceptance.
 *
 * ── WHAT IS DELIBERATELY *NOT* APPLIED: `draftDefects` ──────────────────────
 * Our own Stage-1 output is validated against the template's section headings, because
 * we asked a model to produce exactly that shape. A partner's legal opinion or signed
 * memo is THEIR work product in THEIR structure; refusing it for not carrying our
 * headings would be a template asserting authority over counsel. It is a human's job
 * to judge, which is precisely what the QA gate is. `model` records `partner:<label>`
 * so the provenance of every stored version says which it was, and no reader has to
 * guess whether a version came from a model or a person.
 *
 * ── D2 ──────────────────────────────────────────────────────────────────────
 * This is text an operator pastes, describing work LCX commissioned and owns — the
 * same category as our own draft, not third-party confidential material. There is no
 * byte path here and no field that could carry one: the intake lockout scans this file.
 */
export async function recordPartnerDraft(
  pool: pg.Pool,
  args: {
    engagementId: string;
    deliverableId: string | null;
    draftText: string;
    partnerLabel: string;
    recordedBy: string;
  },
): Promise<PartnerDraftOutcome> {
  const text = args.draftText.trim();
  const label = args.partnerLabel.trim();
  if (text === '') {
    return { ok: false, code: 'VALIDATION', detail: 'the partner deliverable is empty — there is nothing to review' };
  }
  if (text.length > PARTNER_DRAFT_MAX_CHARS) {
    return {
      ok: false,
      code: 'VALIDATION',
      detail: `the text exceeds ${PARTNER_DRAFT_MAX_CHARS} characters. Record the substance and keep the full document where the partner and the client already hold it — this register stores work product, not an archive.`,
    };
  }
  if (label === '') {
    return {
      ok: false,
      code: 'VALIDATION',
      detail: 'partnerLabel is required — a stored version whose provenance is unattributed is worse than one that was never recorded.',
    };
  }

  const state = await collectSlotState(pool, args.engagementId);
  if (state === null) return { ok: false, code: 'NOT_FOUND', detail: `no engagement ${args.engagementId}` };

  await pool.query(
    `UPDATE gps_draft SET status = 'superseded' WHERE engagement_id = $1 AND status = 'draft'`,
    [args.engagementId],
  );
  /* `slots_filled` is the TRUE count for this engagement at the moment of recording,
     not a placeholder to satisfy the CHECK: it is what the partner was working from. */
  const filled = state.slots.filter((s) => s.filled).length;
  const inserted = await pool.query(
    `INSERT INTO gps_draft
       (engagement_id, deliverable_id, offer_key, version, status, draft_text, model, slots_filled, generated_by)
     SELECT $1, $2, $3, COALESCE(MAX(version), 0) + 1, 'draft', $4, $5, $6, $7
       FROM gps_draft WHERE engagement_id = $1
     RETURNING *`,
    [
      args.engagementId,
      args.deliverableId,
      state.offerKey,
      text,
      `partner:${label}`.slice(0, 120),
      Math.max(1, filled),
      args.recordedBy,
    ],
  );
  return { ok: true, draft: mapDraft(inserted.rows[0]) };
}
