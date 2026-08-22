/**
 * G2 — THE DOSSIER SERVICE: the model drafts, the validator refuses or admits, a
 * named human decides, and outreach leaves ONLY through marketing's outbound gate.
 *
 * Two invariants carried from the shared engine and enforced again here:
 *
 *  · NOTHING DEFECTIVE IS STORED. A model response that fails `dossierDefects` or
 *    `outreachDefects` is returned to the operator WITH its defect list and never
 *    touches the database. There is no "store it anyway and flag it" path — a
 *    flagged essay in the register is an essay in the register.
 *  · THE PROMPT CARRIES NO PERSON. `toDossierView` maps the target record onto the
 *    shared view type, which has a field for the decision-maker's ROLE and none for
 *    their name. The mapping cannot leak what it cannot express.
 *
 * The LLM call goes through `ai/llm.ts` — the ONE provider client, with its
 * per-model request shaping and its honest no-provider/provider-error/refused
 * outcomes. This file never talks to a provider itself; the intake lockout scans
 * this compartment for exactly that kind of door.
 */

import type pg from 'pg';
import {
  DOSSIER_HEADINGS,
  OUTREACH_CHANNELS,
  buildDossierPrompt,
  buildOutreachPrompt,
  dossierDefects,
  outreachDefects,
  type DossierDefect,
  type DossierTargetView,
  type OutreachChannel,
  type OutreachDefect,
} from '@lcx/shared';
import { llm } from '../ai/llm.js';
import { gateOutboundText, recordGateDecision, type OutboundGateVerdict } from '../marketing/outboundGate.js';
import { listTargetRecords, type TargetRecord } from './origination.js';

export async function isDossierMigrated(pool: pg.Pool): Promise<boolean | null> {
  try {
    const r = await pool.query(`SELECT to_regclass('gps_dossier') AS rel`);
    return r.rows[0]?.rel !== null;
  } catch (err) {
    console.error('[gps] dossier register probe failed; not caching:', err);
    return null;
  }
}

/* ── Target record → the minimised view the prompt is built from ───────────── */

export function toDossierView(rec: TargetRecord): DossierTargetView {
  const t = rec.target;
  return {
    id: t.id,
    name: t.name,
    jurisdiction: t.jurisdiction ?? null,
    offerKey: t.offerKey ?? null,
    identifiedNeeds: t.identifiedNeeds ?? null,
    introPath: t.introPath ?? null,
    statedBudgetCents: t.statedBudgetCents ?? null,
    evidenceGrade: t.evidence ? `${t.evidence.reliability}${t.evidence.credibility}` : null,
    evidenceAgeDays: t.evidence ? t.evidence.ageDays ?? null : null,
    screening: typeof t.screening === 'string' ? t.screening : null,
    perimeter: typeof t.perimeter === 'string' ? t.perimeter : null,
    conflict: typeof t.conflict === 'string' ? t.conflict : null,
    deadlineIso: t.deadlineIso ?? null,
    deadlineKind: t.deadlineKind ?? null,
    decisionMakerRole: t.decisionMaker ? t.decisionMaker.role || null : null,
    decisionMakerIsBudgetHolder: t.decisionMaker ? t.decisionMaker.isBudgetHolder ?? null : null,
  };
}

async function loadView(
  pool: pg.Pool,
  targetId: string,
): Promise<{ ok: true; view: DossierTargetView } | { ok: false; code: 'NOT_FOUND'; detail: string }> {
  const recs = await listTargetRecords(pool, { targetId, asOfMs: Date.now() });
  if (recs.length === 0) {
    return { ok: false, code: 'NOT_FOUND', detail: `no origination target ${targetId}` };
  }
  return { ok: true, view: toDossierView(recs[0]) };
}

/* ── Rows ───────────────────────────────────────────────────────────────────── */

export interface DossierRow {
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

function mapDossier(r: Record<string, unknown>): DossierRow {
  return {
    id: Number(r.id),
    targetId: String(r.target_id),
    offerKey: String(r.offer_key),
    status: r.status as DossierRow['status'],
    dossierMd: String(r.dossier_md),
    model: String(r.model),
    factRefsCited: Number(r.fact_refs_cited),
    generatedBy: String(r.generated_by),
    generatedAt: new Date(r.generated_at as string).toISOString(),
    decidedBy: r.decided_by === null || r.decided_by === undefined ? null : String(r.decided_by),
    decidedAt: r.decided_at === null || r.decided_at === undefined ? null : new Date(r.decided_at as string).toISOString(),
    decisionNote: r.decision_note === null || r.decision_note === undefined ? null : String(r.decision_note),
  };
}

export interface OutreachDraftRow {
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

function mapDraft(r: Record<string, unknown>): OutreachDraftRow {
  return {
    id: Number(r.id),
    targetId: String(r.target_id),
    dossierId: r.dossier_id === null || r.dossier_id === undefined ? null : Number(r.dossier_id),
    channel: r.channel as OutreachChannel,
    draftText: String(r.draft_text),
    model: String(r.model),
    gateAllowed: Boolean(r.gate_allowed),
    gateDisposition: String(r.gate_disposition),
    gateRefusalCodes: String(r.gate_refusal_codes ?? ''),
    gateReference: String(r.gate_reference ?? ''),
    createdBy: String(r.created_by),
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

export async function listDossiers(pool: pg.Pool, targetId: string): Promise<DossierRow[]> {
  const r = await pool.query(
    `SELECT * FROM gps_dossier WHERE target_id = $1 ORDER BY generated_at DESC LIMIT 50`,
    [targetId],
  );
  return r.rows.map(mapDossier);
}

export async function listOutreachDrafts(pool: pg.Pool, targetId: string): Promise<OutreachDraftRow[]> {
  const r = await pool.query(
    `SELECT * FROM gps_outreach_draft WHERE target_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [targetId],
  );
  return r.rows.map(mapDraft);
}

/* ── Generation ─────────────────────────────────────────────────────────────── */

export type GenerateOutcome =
  | { ok: true; dossier: DossierRow }
  | { ok: false; code: 'NOT_FOUND'; detail: string }
  /** The provider was absent, erroring or refusing — `ai/llm.ts`'s honest outcome, passed through. */
  | { ok: false; code: 'AI_NO_PROVIDER' | 'AI_PROVIDER_ERROR' | 'AI_MODEL_REFUSED'; detail: string; rule: string }
  /**
   * The model answered and the answer broke the citation contract. The rejected
   * text travels back so the operator can SEE the refusal was earned, but it is
   * not stored — regenerating is the remedy, not keeping the essay.
   */
  | { ok: false; code: 'DOSSIER_INVALID'; detail: string; defects: readonly DossierDefect[]; rejectedText: string };

export async function generateDossier(
  pool: pg.Pool,
  targetId: string,
  requestedBy: string,
): Promise<GenerateOutcome> {
  const loaded = await loadView(pool, targetId);
  if (!loaded.ok) return loaded;
  const view = loaded.view;

  const prompt = buildDossierPrompt(view);
  const out = await llm.complete(prompt.task, {
    feature: 'gps-dossier',
    system: prompt.system,
    maxTokens: 2500,
  });
  if (!out.usedLlm) {
    return { ok: false, code: out.code ?? 'AI_PROVIDER_ERROR', detail: out.detail, rule: out.rule };
  }

  const defects = dossierDefects(out.text, prompt.refs);
  if (defects.length > 0) {
    return {
      ok: false,
      code: 'DOSSIER_INVALID',
      detail: `the model response failed the citation contract with ${defects.length} defect(s); nothing was stored`,
      defects,
      rejectedText: out.text,
    };
  }

  // Every ref in the text is known (the validator just said so); count the distinct ones.
  const cited = new Set<string>();
  for (const bracket of out.text.matchAll(/\[([^\]]*)\]/g)) {
    for (const ref of bracket[1].match(/F\d+/g) ?? []) cited.add(ref);
  }

  const inserted = await pool.query(
    `INSERT INTO gps_dossier (target_id, offer_key, status, dossier_md, model, fact_refs_cited, generated_by)
     VALUES ($1, $2, 'draft', $3, $4, $5, $6)
     RETURNING *`,
    [
      targetId,
      view.offerKey ?? 'unsure',
      out.text,
      // `ai/llm.ts` exposes the provider attempted, not the provider's model id; the
      // honest value we HAVE is the honest value we store.
      out.provider ?? 'unknown',
      cited.size,
      requestedBy,
    ],
  );
  return { ok: true, dossier: mapDossier(inserted.rows[0]) };
}

/* ── Decision — a named human, once ─────────────────────────────────────────── */

export type DecideOutcome =
  | { ok: true; dossier: DossierRow }
  | { ok: false; code: 'NOT_FOUND' | 'ALREADY_DECIDED'; detail: string };

export async function decideDossier(
  pool: pg.Pool,
  id: number,
  decision: 'accepted' | 'rejected',
  decidedBy: string,
  note: string | null,
): Promise<DecideOutcome> {
  const updated = await pool.query(
    `UPDATE gps_dossier
        SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4
      WHERE id = $1 AND status = 'draft'
      RETURNING *`,
    [id, decision, decidedBy, note],
  );
  if ((updated.rowCount ?? 0) > 0) return { ok: true, dossier: mapDossier(updated.rows[0]) };
  const existing = await pool.query(`SELECT status FROM gps_dossier WHERE id = $1`, [id]);
  if (existing.rows.length === 0) return { ok: false, code: 'NOT_FOUND', detail: `no dossier ${id}` };
  return {
    ok: false,
    code: 'ALREADY_DECIDED',
    detail: `dossier ${id} is already ${String(existing.rows[0].status)} — a decision is not re-decided`,
  };
}

/* ── Outreach — drafted, judged, stored with the verdict. Never sent. ───────── */

/**
 * The verdict fields a CALLER may see, copied field by field. `ledgerOnly` is the
 * gate's unscoped record and stays out by construction — a spread here would be
 * the oracle-reopening mistake the gate's own docblock warns about.
 */
export interface SafeGateVerdict {
  allowed: boolean;
  disposition: OutboundGateVerdict['disposition'];
  refusals: OutboundGateVerdict['refusals'];
  violations: OutboundGateVerdict['violations'];
  blockingViolations: OutboundGateVerdict['blockingViolations'];
  assetsExtracted: OutboundGateVerdict['assetsExtracted'];
  extractionCaveat: string;
  embargoScope: OutboundGateVerdict['embargoScope'];
  gateError: string | null;
}

function safeVerdict(v: OutboundGateVerdict): SafeGateVerdict {
  return {
    allowed: v.allowed,
    disposition: v.disposition,
    refusals: v.refusals,
    violations: v.violations,
    blockingViolations: v.blockingViolations,
    assetsExtracted: v.assetsExtracted,
    extractionCaveat: v.extractionCaveat,
    embargoScope: v.embargoScope,
    gateError: v.gateError,
  };
}

export type OutreachOutcome =
  | { ok: true; draft: OutreachDraftRow; verdict: SafeGateVerdict; ledgerRecorded: boolean }
  | { ok: false; code: 'NOT_FOUND'; detail: string }
  | { ok: false; code: 'AI_NO_PROVIDER' | 'AI_PROVIDER_ERROR' | 'AI_MODEL_REFUSED'; detail: string; rule: string }
  | { ok: false; code: 'OUTREACH_INVALID'; detail: string; defects: readonly OutreachDefect[]; rejectedText: string };

export function isOutreachChannel(x: unknown): x is OutreachChannel {
  return typeof x === 'string' && (OUTREACH_CHANNELS as readonly string[]).includes(x);
}

/** The accepted dossier's ANGLE section, verbatim — outreach (G2) and factory drafts (G5) build on it. */
export function angleFrom(dossierMd: string): string | null {
  const start = dossierMd.indexOf(DOSSIER_HEADINGS[2]);
  if (start === -1) return null;
  const rest = dossierMd.slice(start + DOSSIER_HEADINGS[2].length);
  const end = rest.indexOf(DOSSIER_HEADINGS[3]);
  const angle = (end === -1 ? rest : rest.slice(0, end)).trim();
  return angle === '' ? null : angle;
}

export async function draftOutreach(
  pool: pg.Pool,
  targetId: string,
  channel: OutreachChannel,
  requestedBy: string,
): Promise<OutreachOutcome> {
  const loaded = await loadView(pool, targetId);
  if (!loaded.ok) return loaded;
  const view = loaded.view;

  const accepted = await pool.query(
    `SELECT id, dossier_md FROM gps_dossier
      WHERE target_id = $1 AND status = 'accepted'
      ORDER BY generated_at DESC LIMIT 1`,
    [targetId],
  );
  const dossierId: number | null = accepted.rows.length > 0 ? Number(accepted.rows[0].id) : null;
  const angle: string | null =
    accepted.rows.length > 0 ? angleFrom(String(accepted.rows[0].dossier_md)) : null;

  const prompt = buildOutreachPrompt(view, channel, angle);
  const out = await llm.complete(prompt.task, {
    feature: 'gps-outreach',
    system: prompt.system,
    maxTokens: 600,
  });
  if (!out.usedLlm) {
    return { ok: false, code: out.code ?? 'AI_PROVIDER_ERROR', detail: out.detail, rule: out.rule };
  }

  const draftText = out.text.trim();
  const defects = outreachDefects(draftText);
  if (defects.length > 0) {
    return {
      ok: false,
      code: 'OUTREACH_INVALID',
      detail: `the draft failed pre-flight with ${defects.length} defect(s); nothing was stored and nothing reached the gate`,
      defects,
      rejectedText: draftText,
    };
  }

  /*
   * THE ONE MOUTH. The same gate every marketing surface answers to, in draft phase,
   * attributed to the requesting operator. Its verdict is stored beside the draft AND
   * recorded in marketing's own decision ledger by the same `recordGateDecision` the
   * reply desk uses — one digest scheme, one place an approver looks things up.
   */
  const verdict = await gateOutboundText(pool, {
    text: draftText,
    verb: 'original',
    channel,
    actor: requestedBy,
    phase: 'draft',
  });
  const ledgerRecorded = await recordGateDecision(pool, {
    replyId: null,
    verdict,
    actor: requestedBy,
    phase: 'draft',
    text: draftText,
  });

  const inserted = await pool.query(
    `INSERT INTO gps_outreach_draft
       (target_id, dossier_id, channel, draft_text, model,
        gate_allowed, gate_disposition, gate_refusal_codes, gate_reference, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      targetId,
      dossierId,
      channel,
      draftText,
      out.provider ?? 'unknown',
      verdict.allowed,
      String(verdict.disposition).slice(0, 40),
      verdict.refusals.map((r) => r.code).join(',').slice(0, 2000),
      verdict.embargoScope.reference.slice(0, 64),
      requestedBy,
    ],
  );
  return { ok: true, draft: mapDraft(inserted.rows[0]), verdict: safeVerdict(verdict), ledgerRecorded };
}
