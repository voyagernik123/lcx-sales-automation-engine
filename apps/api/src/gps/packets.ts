/**
 * G0 — THE FOUNDER-PACKET SERVICE: read decisions, apply approvals, never invent either.
 *
 * The packets themselves are BUILT, not stored: `buildFounderPackets` is deterministic, so the
 * proposal the owner sees is reconstructed per request and the only thing the database holds is
 * what he DECIDED — `gps_packet_decision`, append-only, newest row per kind standing. That split
 * is deliberate: a stored proposal can drift from the code that explains it; a stored decision
 * cannot drift from itself.
 *
 * APPLY IS PER-KIND AND HONEST ABOUT ITS THREE OUTCOMES:
 *   `applied`        rows written (price bands, effort triples, perimeter positions).
 *   `recorded_only`  BY DESIGN, not failure: rate_cards await a named partner (D5 — the bench
 *                    is empty and inventing a counsel name here would be the worst line in the
 *                    file); dpo_memo is a DECISION G4 reads, not rows anything writes today.
 *   `apply_failed`   the decision stands (append-only), the apply must be retried. A decision
 *                    that evaporates because its side-effect hiccuped would teach the owner
 *                    that approving is unsafe.
 *
 * PERIMETER ROWS GO THROUGH `enterPosition` — the SAME path manual entry takes, never a second
 * INSERT that could drift from it. `supersede` is FALSE: a packet must not silently overwrite a
 * position a human entered by hand; conflicts are counted and named in `apply_detail` instead.
 * Expiry is computed HERE from the decision instant (`reviewMonthsAhead` months ahead), because
 * a packet built in August and approved in October must not arrive pre-expired.
 */

import type pg from 'pg';
import {
  OFFER_KEYS,
  packetProposalDefects,
  type OfferKey,
  type PacketKind,
  type PacketProposal,
} from '@lcx/shared';
import { enterPosition } from './conflict.js';

export interface PacketDecisionRow {
  packetKind: PacketKind;
  decision: 'approved' | 'approved_with_edits' | 'rejected';
  applyState: 'applied' | 'recorded_only' | 'apply_failed';
  applyDetail: string;
  decidedBy: string;
  decidedAt: string;
  notes: string | null;
}

/** Does the decision register exist? Fail closed per-call; never cache a negative. */
export async function isPacketRegisterPresent(pool: pg.Pool): Promise<boolean | null> {
  try {
    const r = await pool.query(`SELECT to_regclass('gps_packet_decision') AS rel`);
    return r.rows[0]?.rel !== null;
  } catch (err) {
    console.error('[gps] packet register probe failed; not caching:', err);
    return null;
  }
}

/** Newest decision per kind — the standing one. Older rows are history, not state. */
export async function loadStandingDecisions(pool: pg.Pool): Promise<PacketDecisionRow[]> {
  const r = await pool.query(
    `SELECT DISTINCT ON (packet_kind)
            packet_kind, decision, apply_state, apply_detail, decided_by,
            decided_at, notes
       FROM gps_packet_decision
      ORDER BY packet_kind, decided_at DESC, id DESC`,
  );
  return r.rows.map((row: Record<string, unknown>) => ({
    packetKind: row.packet_kind as PacketKind,
    decision: row.decision as PacketDecisionRow['decision'],
    applyState: row.apply_state as PacketDecisionRow['applyState'],
    applyDetail: String(row.apply_detail),
    decidedBy: String(row.decided_by),
    decidedAt: new Date(row.decided_at as string).toISOString(),
    notes: row.notes === null || row.notes === undefined ? null : String(row.notes),
  }));
}

/**
 * Months ahead in UTC, with JS Date's natural end-of-month rollover. A perimeter expiry does
 * not need calendar pedantry — it needs to be deterministic, in the future, and derived from
 * the decision instant rather than the build instant.
 */
export function addMonthsIso(fromIso: string, months: number): string {
  const d = new Date(fromIso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
}

export interface ApplyOutcome {
  state: 'applied' | 'recorded_only' | 'apply_failed';
  detail: string;
}

/**
 * Apply an approved proposal. The caller has already validated it with
 * `packetProposalDefects` — the same predicate the builder's tests run — and confirmed the
 * approver. This function only performs; it re-checks nothing it was not built to check.
 */
export async function applyProposal(
  pool: pg.Pool,
  proposal: PacketProposal,
  decidedBy: string,
  decidedAtIso: string,
): Promise<ApplyOutcome> {
  switch (proposal.kind) {
    case 'price_bands': {
      const present = await pool.query(`SELECT to_regclass('gps_price_band') AS rel`);
      if (present.rows[0]?.rel === null) {
        return {
          state: 'apply_failed',
          detail: 'gps_price_band does not exist on this environment — apply 0076_gps_packets.sql, then re-approve.',
        };
      }
      for (const r of proposal.rows) {
        await pool.query(
          `INSERT INTO gps_price_band
             (offer_key, low_cents, mid_cents, high_cents, currency, stated_by, stated_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, now(), now())
           ON CONFLICT (offer_key) DO UPDATE
             SET low_cents = EXCLUDED.low_cents,
                 mid_cents = EXCLUDED.mid_cents,
                 high_cents = EXCLUDED.high_cents,
                 currency = EXCLUDED.currency,
                 stated_by = EXCLUDED.stated_by,
                 stated_at = now(),
                 updated_at = now()`,
          [r.offerKey, r.lowCents, r.midCents, r.highCents, r.currency, decidedBy],
        );
      }
      return { state: 'applied', detail: `${proposal.rows.length} price band(s) written; every quote now opens on these numbers, attributed to ${decidedBy}.` };
    }

    case 'effort_triples': {
      const present = await pool.query(`SELECT to_regclass('gps_effort_triple') AS rel`);
      if (present.rows[0]?.rel === null) {
        return {
          state: 'apply_failed',
          detail: 'gps_effort_triple does not exist on this environment — apply 0052_gps_underwriting.sql, then re-approve.',
        };
      }
      for (const r of proposal.rows) {
        await pool.query(
          `INSERT INTO gps_effort_triple
             (offer_key, optimistic_days, likely_days, pessimistic_days, stated_by, stated_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, now(), now())
           ON CONFLICT (offer_key) DO UPDATE
             SET optimistic_days = EXCLUDED.optimistic_days,
                 likely_days = EXCLUDED.likely_days,
                 pessimistic_days = EXCLUDED.pessimistic_days,
                 stated_by = EXCLUDED.stated_by,
                 stated_at = now(),
                 updated_at = now()`,
          [r.offerKey, r.optimisticDays, r.likelyDays, r.pessimisticDays, decidedBy],
        );
      }
      return { state: 'applied', detail: `${proposal.rows.length} effort triple(s) written; underwriting moves off basis:prior for new quotes.` };
    }

    case 'perimeter_seed': {
      let entered = 0;
      const conflicts: string[] = [];
      const failures: string[] = [];
      for (const row of proposal.rows) {
        try {
          const result = await enterPosition(pool, {
            jurisdiction: row.jurisdiction,
            offerKey: row.offerKey as OfferKey,
            serviceClass: row.serviceClass,
            source: row.source,
            sourceUrl: null,
            note: row.note,
            reviewBy: addMonthsIso(decidedAtIso, row.reviewMonthsAhead),
            enteredBy: decidedBy,
            supersede: false,
          });
          if (result.ok) entered += 1;
          else conflicts.push(`${row.jurisdiction}/${row.offerKey}`);
        } catch (err) {
          console.error('[gps] packet perimeter row failed:', row.jurisdiction, row.offerKey, err);
          failures.push(`${row.jurisdiction}/${row.offerKey}`);
        }
      }
      const detailParts = [
        `${entered} position(s) entered by ${decidedBy}.`,
        'Prohibitions block immediately; every other row authorises nothing until a SECOND human reviews it (self-review is refused).',
      ];
      if (conflicts.length > 0) {
        detailParts.push(`${conflicts.length} pair(s) already had a hand-entered position and were left untouched: ${conflicts.join(', ')}.`);
      }
      if (failures.length > 0) {
        detailParts.push(`${failures.length} row(s) FAILED and must be retried: ${failures.join(', ')}.`);
      }
      return { state: failures.length > 0 ? 'apply_failed' : 'applied', detail: detailParts.join(' ') };
    }

    case 'rate_cards':
      return {
        state: 'recorded_only',
        detail:
          'Values recorded, nothing written to gps_rate_card: a card needs a NAMED partner and the bench is '
          + 'empty by decision D5. Name a partner in the registry and these values are one prefilled write away.',
      };

    case 'dpo_memo': {
      const chosen = proposal.memo.recommendedOptionId;
      return {
        state: 'recorded_only',
        detail:
          `DPO decision recorded (option as approved: see final_proposal.memo.recommendedOptionId = ${chosen}). `
          + 'No surface changes today: G4 reads this decision and ships exactly what it permits.',
      };
    }
  }
}

/** Shared validation entry for the route: kind match + the one defect predicate. */
export function proposalDefectsFor(kind: PacketKind, proposal: PacketProposal): string[] {
  if (proposal.kind !== kind) {
    return [`proposal.kind "${proposal.kind}" does not match the packet being decided ("${kind}").`];
  }
  return packetProposalDefects(proposal);
}

/** The five offers, re-exported for the route's own guards without re-importing shared. */
export { OFFER_KEYS };
