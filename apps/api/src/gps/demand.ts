/**
 * G1 — THE DEMAND SERVICE: four channels in, one queue, promotion through the front door.
 *
 * Promotion calls `saveTarget` — the SAME function the curated watchlist's own POST uses —
 * with the candidate's provenance folded into the target's Admiralty evidence fields. There
 * is no second insert path into origination and never will be: the day demand writes its
 * own target SQL is the day the two drift, and the queue's whole legitimacy is that a
 * promoted candidate is indistinguishable from a hand-entered target.
 *
 * Everything here is idempotent by construction: candidates land ON CONFLICT DO NOTHING on
 * `(source, source_ref)`, so a re-run crossfeed or a re-posted Telegram export reports
 * duplicates instead of creating them. Absence of the register is a 503 with the migration
 * named, never a silent success — same discipline as every other GPS write.
 */

import type pg from 'pg';
import {
  crossfeedSignals,
  demandCandidateDefects,
  type CrossfeedProjectInput,
  type DemandCandidate,
  type OfferKey,
} from '@lcx/shared';
import { saveTarget } from './origination.js';

export async function isDemandMigrated(pool: pg.Pool): Promise<boolean | null> {
  try {
    const r = await pool.query(`SELECT to_regclass('gps_demand_candidate') AS rel`);
    return r.rows[0]?.rel !== null;
  } catch (err) {
    console.error('[gps] demand register probe failed; not caching:', err);
    return null;
  }
}

export interface DemandRow extends DemandCandidate {
  id: number;
  status: 'proposed' | 'promoted' | 'refused';
  refusalReason: string | null;
  promotedTargetId: string | null;
  createdBy: string;
  createdAt: string;
  decidedAt: string | null;
}

function mapRow(r: Record<string, unknown>): DemandRow {
  return {
    id: Number(r.id),
    source: r.source as DemandRow['source'],
    sourceRef: String(r.source_ref),
    projectName: String(r.project_name),
    url: r.url === null ? null : String(r.url),
    chain: r.chain === null ? null : String(r.chain),
    jurisdiction: r.jurisdiction === null ? null : String(r.jurisdiction),
    offerHypothesis: r.offer_hypothesis as DemandRow['offerHypothesis'],
    reason: String(r.reason),
    snippet: r.snippet === null ? null : String(r.snippet),
    provenanceGrade: r.provenance_grade as DemandRow['provenanceGrade'],
    contactEmail: r.contact_email === null ? null : String(r.contact_email),
    observedAt: new Date(r.observed_at as string).toISOString(),
    status: r.status as DemandRow['status'],
    refusalReason: r.refusal_reason === null ? null : String(r.refusal_reason),
    promotedTargetId: r.promoted_target_id === null ? null : String(r.promoted_target_id),
    createdBy: String(r.created_by),
    createdAt: new Date(r.created_at as string).toISOString(),
    decidedAt: r.decided_at === null || r.decided_at === undefined ? null : new Date(r.decided_at as string).toISOString(),
  };
}

export async function listCandidates(pool: pg.Pool, status?: string): Promise<DemandRow[]> {
  const r = status
    ? await pool.query(
        `SELECT * FROM gps_demand_candidate WHERE status = $1 ORDER BY created_at DESC LIMIT 500`,
        [status],
      )
    : await pool.query(`SELECT * FROM gps_demand_candidate ORDER BY created_at DESC LIMIT 500`);
  return r.rows.map(mapRow);
}

export interface InsertOutcome {
  inserted: number;
  duplicates: number;
  refusedByValidator: number;
  validatorDefects: string[];
}

/** Every candidate faces the shared validator; a defective one is refused and NAMED, not skipped. */
export async function insertCandidates(
  pool: pg.Pool,
  candidates: readonly DemandCandidate[],
  createdBy: string,
): Promise<InsertOutcome> {
  let inserted = 0;
  let duplicates = 0;
  let refusedByValidator = 0;
  const validatorDefects: string[] = [];
  for (const c of candidates) {
    const defects = demandCandidateDefects(c);
    if (defects.length > 0) {
      refusedByValidator += 1;
      validatorDefects.push(`${c.source}/${c.sourceRef}: ${defects.join(' ')}`);
      continue;
    }
    const r = await pool.query(
      `INSERT INTO gps_demand_candidate
         (source, source_ref, project_name, url, chain, jurisdiction, offer_hypothesis,
          reason, snippet, provenance_grade, contact_email, observed_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (source, source_ref) DO NOTHING`,
      [c.source, c.sourceRef, c.projectName, c.url, c.chain, c.jurisdiction, c.offerHypothesis,
       c.reason, c.snippet, c.provenanceGrade, c.contactEmail, c.observedAt, createdBy],
    );
    if ((r.rowCount ?? 0) > 0) inserted += 1; else duplicates += 1;
  }
  return { inserted, duplicates, refusedByValidator, validatorDefects };
}

/**
 * The BD crossfeed's read: projects joined to their open deals, projected to EXACTLY the
 * fields the rules cite. The projection is the privacy boundary too — the rules cannot
 * cite what the query never selects.
 */
export async function crossfeedRun(pool: pg.Pool, asOf: string, createdBy: string): Promise<InsertOutcome & { projectsScanned: number; signals: number }> {
  const r = await pool.query(
    `SELECT p.id, p.name, p.chain, p.jurisdiction, p.eu_score, p.band, p.listed_on_lcx,
            d.id IS NOT NULL AS has_open_deal,
            EXTRACT(EPOCH FROM (now() - COALESCE(d.updated_at, p.updated_at))) / 86400 AS days_since
       FROM projects p
       LEFT JOIN deals d ON d.project_id = p.id AND d.stage NOT IN ('won', 'lost', 'closed')
      LIMIT 2000`,
  );
  const inputs: CrossfeedProjectInput[] = r.rows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    name: String(row.name ?? ''),
    chain: row.chain === null ? null : String(row.chain),
    jurisdiction: row.jurisdiction === null ? null : String(row.jurisdiction),
    euScore: row.eu_score === null ? null : Number(row.eu_score),
    band: row.band === null || row.band === undefined ? null : String(row.band),
    listedOnLcx: row.listed_on_lcx === null ? null : Boolean(row.listed_on_lcx),
    hasOpenDeal: Boolean(row.has_open_deal),
    daysSinceUpdate: row.days_since === null ? null : Math.floor(Number(row.days_since)),
  }));
  const signals = crossfeedSignals(inputs, asOf);
  const outcome = await insertCandidates(pool, signals, createdBy);
  return { ...outcome, projectsScanned: inputs.length, signals: signals.length };
}

const GRADE_TO_EVIDENCE: Record<DemandRow['provenanceGrade'], { reliability: 'B' | 'C'; credibility: 2 | 3 }> = {
  B2: { reliability: 'B', credibility: 2 },
  B3: { reliability: 'B', credibility: 3 },
  C3: { reliability: 'C', credibility: 3 },
};

export type PromoteOutcome =
  | { ok: true; targetId: string; row: DemandRow }
  | { ok: false; code: 'NOT_FOUND' | 'ALREADY_DECIDED'; detail: string };

/** Promote through the front door: `saveTarget`, the curated path, with provenance carried. */
export async function promoteCandidate(pool: pg.Pool, id: number, promotedBy: string, asOfMs: number): Promise<PromoteOutcome> {
  const found = await pool.query(`SELECT * FROM gps_demand_candidate WHERE id = $1`, [id]);
  if (found.rows.length === 0) return { ok: false, code: 'NOT_FOUND', detail: `no candidate ${id}.` };
  const row = mapRow(found.rows[0]);
  if (row.status !== 'proposed') {
    return { ok: false, code: 'ALREADY_DECIDED', detail: `candidate ${id} is already ${row.status} — a decision is not re-decided by promoting over it.` };
  }
  const ev = GRADE_TO_EVIDENCE[row.provenanceGrade];
  const offer: OfferKey | null = row.offerHypothesis === 'unsure' ? null : row.offerHypothesis;
  const target = await saveTarget(pool, {
    name: row.projectName,
    jurisdiction: row.jurisdiction,
    offerKey: offer,
    identifiedNeeds: offer === null ? null : [offer],
    introPath: row.source === 'partner_referral' ? 'warm_referral' : 'cold',
    evidenceReliability: ev.reliability,
    evidenceCredibility: ev.credibility,
    evidenceObservedIso: row.observedAt,
    createdBy: promotedBy,
  }, asOfMs);
  await pool.query(
    `UPDATE gps_demand_candidate
        SET status = 'promoted', promoted_target_id = $2, decided_at = now()
      WHERE id = $1`,
    [id, target.target.id],
  );
  return { ok: true, targetId: target.target.id, row: { ...row, status: 'promoted', promotedTargetId: target.target.id } };
}

export async function refuseCandidate(pool: pg.Pool, id: number, reason: string): Promise<'refused' | 'NOT_FOUND' | 'ALREADY_DECIDED'> {
  const found = await pool.query(`SELECT status FROM gps_demand_candidate WHERE id = $1`, [id]);
  if (found.rows.length === 0) return 'NOT_FOUND';
  if (found.rows[0].status !== 'proposed') return 'ALREADY_DECIDED';
  await pool.query(
    `UPDATE gps_demand_candidate SET status = 'refused', refusal_reason = $2, decided_at = now() WHERE id = $1`,
    [id, reason],
  );
  return 'refused';
}
