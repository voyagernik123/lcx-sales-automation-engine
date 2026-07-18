import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';

/**
 * Portfolio view (Wave 5) — the hedge-fund lens on the desk. Treats the
 * targetable universe (conviction-scored, not yet on LCX) as a portfolio and
 * reports its expected value, how it's diversified (by band, region, category,
 * timing window), and its concentration risk (top-20 share). Answers "is our
 * pipeline balanced, and where is the value concentrated?"
 */

export interface DimensionSlice {
  key: string;
  count: number;
  evUsd: number;
  avgConviction: number;
}

export interface Portfolio {
  totalTargets: number;
  totalEvUsd: number;
  avgConviction: number;
  byBand: DimensionSlice[];
  byRegion: DimensionSlice[];
  byCategory: DimensionSlice[];
  byTiming: DimensionSlice[];
  concentration: { top20Share: number; top20EvUsd: number };
  pipeline: { openDeals: number; openValueUsd: number };
}

const REGION_LABEL: Record<string, string> = {
  eu: 'EU', eu_first: 'EU', us: 'US', us_first: 'US', dual: 'Dual', none: 'Unclassified',
};

function rollup(rows: { key: string | null; ev: number; conv: number }[]): DimensionSlice[] {
  const m = new Map<string, { count: number; evUsd: number; convSum: number }>();
  for (const r of rows) {
    const key = r.key && r.key.trim() ? r.key : 'Unclassified';
    const cur = m.get(key) ?? { count: 0, evUsd: 0, convSum: 0 };
    cur.count += 1;
    cur.evUsd += r.ev;
    cur.convSum += r.conv;
    m.set(key, cur);
  }
  return [...m.entries()]
    .map(([key, v]) => ({ key, count: v.count, evUsd: Math.round(v.evUsd), avgConviction: Math.round(v.convSum / v.count) }))
    .sort((a, b) => b.evUsd - a.evUsd);
}

export async function buildPortfolio(): Promise<Portfolio> {
  const db = getDb();

  const res = await db.execute(sql`
    WITH conv AS (
      SELECT DISTINCT ON (subject_id) subject_id, value_num AS c
      FROM observations WHERE predicate='conviction' ORDER BY subject_id, observed_at DESC),
    dv AS (
      SELECT DISTINCT ON (subject_id) subject_id, value_num AS v
      FROM observations WHERE predicate='deal_value_usd' ORDER BY subject_id, observed_at DESC),
    tw AS (
      SELECT DISTINCT ON (subject_id) subject_id, value_json->>'window' AS w
      FROM observations WHERE predicate='timing_window' ORDER BY subject_id, observed_at DESC),
    cat AS (
      SELECT DISTINCT ON (subject_id) subject_id, value_json#>>'{}' AS cat
      FROM observations WHERE predicate='defillama_category' ORDER BY subject_id, observed_at DESC)
    SELECT p.id, s.band, s.recommended_market AS region, cat.cat AS category, tw.w AS timing,
           COALESCE(conv.c,0) AS conviction, COALESCE(dv.v,0) AS deal_value
    FROM conv
    JOIN projects p ON p.id::text = conv.subject_id
    LEFT JOIN LATERAL (SELECT band, recommended_market FROM scores WHERE project_id=p.id ORDER BY computed_at DESC LIMIT 1) s ON true
    LEFT JOIN dv ON dv.subject_id = conv.subject_id
    LEFT JOIN tw ON tw.subject_id = conv.subject_id
    LEFT JOIN cat ON cat.subject_id = conv.subject_id
    WHERE p.listed_on_lcx = false
  `);

  const rows = (res.rows ?? []).map((r: Record<string, unknown>) => ({
    band: (r.band as string) ?? 'unscored',
    region: REGION_LABEL[(r.region as string) ?? 'none'] ?? 'Unclassified',
    category: (r.category as string | null) ?? null,
    timing: (r.timing as string | null) ?? 'quiet',
    conviction: Number(r.conviction ?? 0),
    ev: Number(r.deal_value ?? 0),
  }));

  const totalEvUsd = Math.round(rows.reduce((s, r) => s + r.ev, 0));
  const avgConviction = rows.length ? Math.round(rows.reduce((s, r) => s + r.conviction, 0) / rows.length) : 0;

  // Concentration — the top-20 by EV as a share of total.
  const top20Ev = [...rows].sort((a, b) => b.ev - a.ev).slice(0, 20).reduce((s, r) => s + r.ev, 0);
  const top20Share = totalEvUsd > 0 ? Math.round((top20Ev / totalEvUsd) * 100) : 0;

  const pipelineRes = await db.execute(sql`
    SELECT count(*) AS c, COALESCE(SUM(package_value),0) AS v
    FROM deals WHERE stage NOT IN ('won','lost','not_started')
  `);
  const pr = (pipelineRes.rows ?? [])[0] as Record<string, unknown>;

  return {
    totalTargets: rows.length,
    totalEvUsd,
    avgConviction,
    byBand: rollup(rows.map((r) => ({ key: r.band, ev: r.ev, conv: r.conviction }))),
    byRegion: rollup(rows.map((r) => ({ key: r.region, ev: r.ev, conv: r.conviction }))),
    byCategory: rollup(rows.map((r) => ({ key: r.category, ev: r.ev, conv: r.conviction }))).slice(0, 8),
    byTiming: rollup(rows.map((r) => ({ key: r.timing, ev: r.ev, conv: r.conviction }))),
    concentration: { top20Share, top20EvUsd: Math.round(top20Ev) },
    pipeline: { openDeals: Number(pr?.c ?? 0), openValueUsd: Math.round(Number(pr?.v ?? 0) / 100) },
  };
}
