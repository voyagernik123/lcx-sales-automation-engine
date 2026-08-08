/**
 * Shared forecast computation — win probability per open deal plus the
 * Monte Carlo quarterly distribution. Used by GET /v1/kpis/forecast and by
 * the daily kpi_snapshot job (which persists {p10,p50,p90,expected} into
 * kpi_daily_snapshots.forecast for trend history).
 */
import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { monteCarloForecast, dealWinProbability } from '@lcx/shared';

export interface ForecastDealSummary {
  id: string;
  projectName: string;
  stage: string;
  /**
   * NULL when no price was ever marked. It used to be `packageValueCents ?? 0`,
   * four lines after the query had correctly preserved null — so an unmarked deal
   * rendered as $0.00 beside a real win percentage, which reads as a deal somebody
   * agreed to do for nothing. Null is the only honest value here.
   */
  value: number | null;
  winProbability: number;
  daysSinceUpdate: number;
}

/** An exclusion the simulation made, named rather than silently absorbed. */
export interface ForecastExclusionSummary {
  code: string;
  rule: string;
  count: number;
  ids: string[];
}

export interface ForecastSummary {
  runs: number;
  /**
   * NULL together with `distributionRefusal` set, when the simulation had nothing
   * it could price. Never 0 — a $0 quarter is a claim, and "we could not price
   * anything" is a different claim. An EMPTY open pipeline is a third state: that
   * genuinely forecasts 0 and reports 0 with no refusal.
   */
  p10: number | null;
  p50: number | null;
  p90: number | null;
  expected: number | null;
  /** Set iff the four figures above are null. Carries the rule it applies. */
  distributionRefusal: { code: string; rule: string } | null;
  /** Open deals with no marked price. EXCLUDED from the simulation and named here. */
  unpriced: ForecastExclusionSummary;
  /** Open deals whose stage has no calibrated base rate. Excluded rather than given an invented 5%. */
  unrateable: ForecastExclusionSummary;
  /**
   * How many deals the distribution actually covers. `deals.length` is the INPUT
   * list and is larger whenever anything was excluded; a surface that prints
   * `deals.length` as the simulated set overstates the coverage.
   */
  simulatedDealCount: number;
  deals: ForecastDealSummary[];
  /**
   * WHICH DEAL ACTUALLY DECIDES THE QUARTER, most decisive first.
   *
   * `monteCarloForecast` computes this on every call — it recovers, from the 10,000 paths
   * it already walks, how much each deal moves P(book clears its own median). It returns it
   * at `forecast/index.ts:393`. This interface omitted it, so the whole thing was computed
   * and dropped at the boundary on every request, and the dashboard's "See the math" table
   * shows probability, value and expectation — never which deal the quarter turns on.
   *
   * It is a `p·value` ranking's answer to a different question: a deal can be large and
   * near-certain (it barely moves the odds, because it is already priced in) or mid-sized
   * and genuinely 50/50 (it decides everything). Those two are adjacent in an expected-value
   * list and opposite in this one.
   *
   * Rows whose figure is WITHHELD keep their refusal code and are APPENDED rather than
   * ranked — the engine is explicit that mapping a refusal onto a sentinel would sort it
   * above a measured row.
   */
  decisiveness: ForecastDecisiveness[];
}

/** One deal's contribution to whether the book clears its own median. */
export interface ForecastDecisiveness {
  id: string;
  projectName: string | null;
  /**
   * Percentage points added to P(book ≥ its own p50) when this deal lands, or NULL when the
   * estimate is inside its own noise. Never 0 for a withheld row: 0 is a measurement.
   */
  p50SwingPct: number | null;
  p50SwingStdErr: number | null;
  /** `INSUFFICIENT_ARM` (too few paths either way) or `SE_EXCEEDS_MAGNITUDE`. */
  p50SwingCode: string | null;
  /** Dollars the book moves on average when this deal lands, or null under the same guard. */
  swing: number | null;
  swingCode: string | null;
  wonRuns: number;
  lostRuns: number;
}

export async function computeForecast(): Promise<ForecastSummary> {
  const db = getDb();
  const result = await db.execute(sql`
    SELECT d.id, d.stage, d.package_value, p.name AS project_name,
           COALESCE(s.priority_score, 0) AS priority_score,
           FLOOR(EXTRACT(EPOCH FROM (NOW() - d.updated_at)) / 86400) AS days_since_update
    FROM deals d
    JOIN projects p ON p.id = d.project_id
    LEFT JOIN scores s ON s.project_id = d.project_id
    WHERE d.stage NOT IN ('won', 'lost')
  `);

  const inputs = (result.rows ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    stage: String(r.stage),
    packageValueCents: r.package_value != null ? Number(r.package_value) : null,
    priorityScore: Number(r.priority_score ?? 0),
    daysSinceUpdate: Number(r.days_since_update ?? 0),
    projectName: String(r.project_name),
  }));

  const mc = monteCarloForecast(inputs, { runs: 10_000 });
  // The engine is deliberately UI-free and carries ids, not names. The label lives here.
  const nameById = new Map(inputs.map((d) => [d.id, d.projectName]));
  const dollars = (cents: number | null) => (cents === null ? null : cents / 100);
  const exclusion = (e: { code: string; rule: string; count: number; ids: string[] }) => ({
    code: e.code, rule: e.rule, count: e.count, ids: e.ids,
  });

  return {
    runs: mc.runs,
    // Null passes THROUGH. Dividing null by 100 in JS yields 0, which is exactly
    // how a refusal would have become a $0 quarter on the dashboard.
    p10: dollars(mc.p10Cents),
    p50: dollars(mc.p50Cents),
    p90: dollars(mc.p90Cents),
    expected: dollars(mc.expectedCents),
    distributionRefusal: mc.distributionRefusal,
    unpriced: exclusion(mc.unpriced),
    unrateable: exclusion(mc.unrateable),
    simulatedDealCount: mc.deals.length,
    // Order preserved from the engine — it ranks by threshold swing and appends the
    // withheld rows. Re-sorting here would undo that on the way out.
    decisiveness: mc.decisiveness.map((d) => ({
      id: d.id,
      projectName: nameById.get(d.id) ?? null,
      p50SwingPct: d.p50SwingPct,
      p50SwingStdErr: d.p50SwingStdErr,
      p50SwingCode: d.p50SwingCode,
      // Cents → dollars, and NULL stays null. `d.swingCents / 100` on a null yields 0 in
      // JS, which is the exact mechanism that turned a refusal into a $0 band elsewhere in
      // this file's neighbourhood.
      swing: d.swingCents === null ? null : d.swingCents / 100,
      swingCode: d.swingCode,
      wonRuns: d.wonRuns,
      lostRuns: d.lostRuns,
    })),
    deals: inputs
      .map((d) => ({
        id: d.id,
        projectName: d.projectName,
        stage: d.stage,
        value: d.packageValueCents === null ? null : d.packageValueCents / 100,
        winProbability: Math.round(dealWinProbability(d) * 100),
        daysSinceUpdate: d.daysSinceUpdate,
      }))
      // Unmarked deals have no expected value to sort BY, so they sort last rather
      // than ranking as if they were worth zero.
      .sort((a, b) => {
        const ev = (x: typeof a) => (x.value === null ? -1 : x.winProbability * x.value);
        return ev(b) - ev(a);
      }),
  };
}
