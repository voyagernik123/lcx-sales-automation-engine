/**
 * 5-9 Competitive deal intelligence — deterministic "deal coach".
 * Given our position and the tracked competitor offer(s), produce positioning
 * tips. Pure/deterministic (no randomness, no external calls) so the same inputs
 * always yield the same coaching.
 */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';

export interface DealCompetitor {
  id: string;
  dealId: string;
  competitorName: string;
  theirOfferCents: number | null;
  notes: string | null;
  createdAt: string;
}

export interface CoachTip {
  severity: 'info' | 'warn' | 'critical';
  title: string;
  detail: string;
}

function mapCompetitor(r: Record<string, unknown>): DealCompetitor {
  return {
    id: String(r.id),
    dealId: String(r.deal_id),
    competitorName: String(r.competitor_name),
    theirOfferCents: r.their_offer_cents != null ? Number(r.their_offer_cents) : null,
    notes: r.notes != null ? String(r.notes) : null,
    createdAt: String(r.created_at),
  };
}

export async function listCompetitors(dealId: string): Promise<DealCompetitor[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT * FROM deal_competitors WHERE deal_id = ${dealId} ORDER BY created_at DESC
  `);
  return (rows.rows ?? []).map((r) => mapCompetitor(r as Record<string, unknown>));
}

export interface AddCompetitorInput {
  dealId: string;
  competitorName: string;
  theirOfferCents?: number | null;
  notes?: string | null;
}

export async function addCompetitor(input: AddCompetitorInput): Promise<DealCompetitor> {
  const db = getDb();
  const rows = await db.execute(sql`
    INSERT INTO deal_competitors (id, deal_id, competitor_name, their_offer_cents, notes)
    VALUES (${randomUUID()}, ${input.dealId}, ${input.competitorName}, ${input.theirOfferCents ?? null}, ${input.notes ?? null})
    RETURNING *
  `);
  return mapCompetitor(rows.rows?.[0] as Record<string, unknown>);
}

export interface CoachInput {
  ourValueCents: number | null;
  competitors: DealCompetitor[];
}

/**
 * Deterministic positioning tips vs the tracked competitor offer(s). The lowest
 * competitor offer is treated as the primary threat and drives the price-gap
 * coaching; other tips are stable regardless of numbers.
 */
export function generateCoachTips(input: CoachInput): CoachTip[] {
  const tips: CoachTip[] = [];
  const priced = input.competitors.filter((c) => c.theirOfferCents != null) as (DealCompetitor & { theirOfferCents: number })[];

  if (input.competitors.length === 0) {
    tips.push({
      severity: 'info',
      title: 'No competitor logged',
      detail: 'No competing offer is tracked for this deal. Ask the prospect who else they are evaluating and log it to sharpen positioning.',
    });
    return tips;
  }

  if (priced.length > 0 && input.ourValueCents != null) {
    const lowest = priced.reduce((a, b) => (b.theirOfferCents < a.theirOfferCents ? b : a));
    const gap = input.ourValueCents - lowest.theirOfferCents;
    const pct = lowest.theirOfferCents > 0 ? Math.round((gap / lowest.theirOfferCents) * 100) : 0;

    if (gap > 0) {
      tips.push({
        severity: pct >= 25 ? 'critical' : 'warn',
        title: `Priced ${pct}% above ${lowest.competitorName}`,
        detail: `Our value is $${(input.ourValueCents / 100).toLocaleString()} vs ${lowest.competitorName}'s $${(lowest.theirOfferCents / 100).toLocaleString()}. Lead with LCX regulatory standing, EU reach and compliance depth to justify the premium rather than discounting to match.`,
      });
    } else if (gap < 0) {
      tips.push({
        severity: 'info',
        title: `Priced below ${lowest.competitorName}`,
        detail: `We are already under ${lowest.competitorName}'s $${(lowest.theirOfferCents / 100).toLocaleString()}. Do not discount further — anchor on value and close on speed.`,
      });
    } else {
      tips.push({
        severity: 'info',
        title: `Matched to ${lowest.competitorName}`,
        detail: 'Price is even with the competitor. Win on differentiation: differentiate on liquidity, listing speed, and post-listing support.',
      });
    }
  } else if (input.ourValueCents == null) {
    tips.push({
      severity: 'warn',
      title: 'Our package value not set',
      detail: 'Set the deal package value so the coach can quantify the gap against competitor offers.',
    });
  }

  tips.push({
    severity: 'info',
    title: 'Differentiate, do not just discount',
    detail: 'For every concession, trade for term length, faster signature, or an added stream (market making, marketing). Log the competitor terms in the BATNA tracker.',
  });

  if (priced.length < input.competitors.length) {
    tips.push({
      severity: 'info',
      title: 'Missing competitor pricing',
      detail: 'Some tracked competitors have no offer figure. Get their number to let the coach quantify the gap.',
    });
  }

  return tips;
}

/** Load competitors + deal value and return coaching in one call. */
export async function coachDeal(dealId: string): Promise<{ competitors: DealCompetitor[]; tips: CoachTip[] }> {
  const db = getDb();
  const competitors = await listCompetitors(dealId);
  const dealRows = await db.execute(sql`SELECT package_value FROM deals WHERE id = ${dealId} LIMIT 1`);
  const dealRow = dealRows.rows?.[0] as Record<string, unknown> | undefined;
  const ourValueCents = dealRow?.package_value != null ? Number(dealRow.package_value) : null;
  return { competitors, tips: generateCoachTips({ ourValueCents, competitors }) };
}
