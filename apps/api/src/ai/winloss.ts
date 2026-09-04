/**
 * 3-10 Win/loss analysis.
 *
 * SQL aggregation over deals (joined to projects for jurisdiction/source) split
 * by jurisdiction, package type, and lead source. Produces win-rate breakdowns
 * plus a deterministic narrative of what's working. When a key is set the LLM
 * polishes the narrative prose — the numbers and structure are unchanged.
 *
 * NOTE: there is no listing_labels table in this schema, so lead source is
 * taken from projects.source (the dominant-origin tag) which is the closest
 * available proxy.
 */
import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { llm } from './llm.js';

export interface WinLossBucket {
  key: string;
  won: number;
  lost: number;
  total: number;
  winRate: number; // 0..1
  wonValueUsd: number;
}

export interface WinLossAnalysis {
  overall: WinLossBucket;
  byJurisdiction: WinLossBucket[];
  byPackage: WinLossBucket[];
  bySource: WinLossBucket[];
  topLossReasons: Array<{ reason: string; count: number }>;
  narrative: string;
  usedLlm: boolean;
}

const WON = 'won';
const LOST = 'lost';

function toBucket(key: string, won: number, lost: number, wonValueUsd: number): WinLossBucket {
  const total = won + lost;
  return { key, won, lost, total, winRate: total > 0 ? won / total : 0, wonValueUsd };
}


/** Package value is stored in cents (whole dollars * 100). */
function centsToUsd(n: unknown): number {
  return n != null ? Number(n) / 100 : 0;
}

async function aggregate(pool: 'all' | 'eu' | 'us'): Promise<WinLossAnalysis> {
  const db = getDb();

  const regionFilter =
    pool === 'all' ? sql`TRUE` : sql`(p.region = ${pool} OR p.jurisdiction = ${pool})`;

  const groupQuery = (dim: ReturnType<typeof sql>) => sql`
    SELECT ${dim} AS key,
           COUNT(*) FILTER (WHERE d.stage = ${WON}) AS won,
           COUNT(*) FILTER (WHERE d.stage = ${LOST}) AS lost,
           COALESCE(SUM(d.package_value) FILTER (WHERE d.stage = ${WON}), 0) AS won_value
    FROM deals d
    JOIN projects p ON p.id = d.project_id
    WHERE d.stage IN (${WON}, ${LOST}) AND ${regionFilter}
    GROUP BY ${dim}
    ORDER BY won DESC, lost DESC
  `;

  const [jur, pkg, src, loss, overallRes] = await Promise.all([
    db.execute(groupQuery(sql`COALESCE(p.jurisdiction, p.region, 'unknown')`)),
    db.execute(groupQuery(sql`COALESCE(d.package_type, 'unknown')`)),
    db.execute(groupQuery(sql`COALESCE(p.source, 'unknown')`)),
    db.execute(sql`
      SELECT COALESCE(NULLIF(d.loss_category, ''), NULLIF(d.loss_reason, ''), 'unspecified') AS reason,
             COUNT(*) AS count
      FROM deals d JOIN projects p ON p.id = d.project_id
      WHERE d.stage = ${LOST} AND ${regionFilter}
      GROUP BY reason ORDER BY count DESC LIMIT 10
    `),
    db.execute(sql`
      SELECT COUNT(*) FILTER (WHERE d.stage = ${WON}) AS won,
             COUNT(*) FILTER (WHERE d.stage = ${LOST}) AS lost,
             COALESCE(SUM(d.package_value) FILTER (WHERE d.stage = ${WON}), 0) AS won_value
      FROM deals d JOIN projects p ON p.id = d.project_id
      WHERE d.stage IN (${WON}, ${LOST}) AND ${regionFilter}
    `),
  ]);

  const mapRows = (rows: Record<string, unknown>[]): WinLossBucket[] =>
    rows.map((r) =>
      toBucket(String(r.key ?? 'unknown'), Number(r.won ?? 0), Number(r.lost ?? 0), centsToUsd(r.won_value)),
    );

  const o = (overallRes.rows ?? [])[0] as Record<string, unknown> | undefined;
  const overall = toBucket('overall', Number(o?.won ?? 0), Number(o?.lost ?? 0), centsToUsd(o?.won_value));

  const byJurisdiction = mapRows((jur.rows ?? []) as Record<string, unknown>[]);
  const byPackage = mapRows((pkg.rows ?? []) as Record<string, unknown>[]);
  const bySource = mapRows((src.rows ?? []) as Record<string, unknown>[]);
  const topLossReasons = ((loss.rows ?? []) as Record<string, unknown>[]).map((r) => ({
    reason: String(r.reason ?? 'unspecified'),
    count: Number(r.count ?? 0),
  }));

  return {
    overall,
    byJurisdiction,
    byPackage,
    bySource,
    topLossReasons,
    narrative: buildNarrative(overall, byJurisdiction, byPackage, bySource, topLossReasons),
    usedLlm: false,
  };
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function buildNarrative(
  overall: WinLossBucket,
  byJur: WinLossBucket[],
  byPkg: WinLossBucket[],
  bySrc: WinLossBucket[],
  loss: Array<{ reason: string; count: number }>,
): string {
  if (overall.total === 0) {
    return 'No closed deals yet — win/loss analysis will populate as deals reach won or lost.';
  }
  const bestPkg = [...byPkg].filter((b) => b.total >= 1).sort((a, b) => b.winRate - a.winRate)[0];
  const bestSrc = [...bySrc].filter((b) => b.total >= 1).sort((a, b) => b.winRate - a.winRate)[0];
  const bestJur = [...byJur].filter((b) => b.total >= 1).sort((a, b) => b.winRate - a.winRate)[0];

  const parts: string[] = [];
  parts.push(
    `Overall win rate is ${pct(overall.winRate)} (${overall.won} won / ${overall.lost} lost), ` +
      `with $${Math.round(overall.wonValueUsd).toLocaleString()} in won value.`,
  );
  if (bestPkg) parts.push(`Best-converting package: ${bestPkg.key} at ${pct(bestPkg.winRate)}.`);
  if (bestSrc) parts.push(`Strongest lead source: ${bestSrc.key} at ${pct(bestSrc.winRate)}.`);
  if (bestJur) parts.push(`Top jurisdiction: ${bestJur.key} at ${pct(bestJur.winRate)}.`);
  if (loss.length) parts.push(`Most common loss reason: "${loss[0].reason}" (${loss[0].count}).`);
  return parts.join(' ');
}

/**
 * @param pool 'all' | 'eu' | 'us' — filters deals by project region/jurisdiction.
 */
export async function analyzeWinLoss(pool: 'all' | 'eu' | 'us' = 'all'): Promise<WinLossAnalysis> {
  const base = await aggregate(pool);
  if (!llm.available || base.overall.total === 0) return base;

  const { text, usedLlm } = await llm.complete(
    `Rewrite this win/loss summary as a crisp 2-3 sentence insight for a sales lead. ` +
      `Keep every number exactly as given; do not invent data. Return only the prose.\n\n${base.narrative}\n\n` +
      `Data: ${JSON.stringify({ byPackage: base.byPackage, bySource: base.bySource, byJurisdiction: base.byJurisdiction, topLossReasons: base.topLossReasons })}`,
    { feature: 'win-loss', maxTokens: 400, temperature: 0.4, timeoutMs: 6_000 },
  );

  if (usedLlm && text) {
    return { ...base, narrative: text, usedLlm: true };
  }
  return base;
}
