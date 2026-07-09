/**
 * Offline propensity calibration — prints weight-of-evidence per feature
 * bucket (won-rate vs universe base rate, Laplace-smoothed) and a
 * leave-one-out rank check for the current checked-in weights. Writes
 * NOTHING: a human reads the advice and edits
 * packages/shared/src/scoring/propensity/weights.ts.
 *
 * With n=36 positives this is deliberately not a model fit — pipeline
 * stage-progression rows (reached Meeting/Negotiation) count as half-weight
 * soft positives to stretch the signal.
 *
 * Usage: DATABASE_URL=... npx tsx src/labels/calibrate.ts
 */
import pg from 'pg';
import {
  scorePropensity, PROPENSITY_WEIGHTS_V1, MODEL_VERSION,
  mcapBand, volMcapBand, categoryFits, chainFits,
  type PropensityInput,
} from '@lcx/shared';

interface FeatureRow {
  id: string;
  name: string;
  input: PropensityInput;
  labelWeight: number; // 1 = won, 0.5 = progressed, 0 = universe
}

async function loadRows(pool: pg.Pool): Promise<FeatureRow[]> {
  const { rows } = await pool.query(`
    SELECT p.id, p.name, p.market_cap_usd, p.volume_24h_usd, p.token_age_days,
           p.category, p.chain, p.region, p.esma_token_id, p.source,
           p.verified_contact_count, p.listed_on_lcx,
           l.outcome, l.stage_trail
    FROM projects p
    LEFT JOIN listing_labels l ON l.project_id = p.id
  `);

  return rows.map((r) => {
    const trail = JSON.stringify(r.stage_trail ?? '').toLowerCase();
    const progressed = trail.includes('meeting') || trail.includes('negotiation') || trail.includes('proposal');
    const labelWeight = r.outcome === 'won' ? 1 : r.outcome && progressed ? 0.5 : 0;
    return {
      id: r.id as string,
      name: r.name as string,
      labelWeight,
      input: {
        marketCapUsd: r.market_cap_usd != null ? Number(r.market_cap_usd) : null,
        volume24hUsd: r.volume_24h_usd != null ? Number(r.volume_24h_usd) : null,
        tokenAgeDays: r.token_age_days != null ? Number(r.token_age_days) : null,
        fundingMonthsAgo: null,
        fundingAmountM: null,
        exchangeCount: null,
        category: (r.category as string) || null,
        chain: (r.chain as string) || null,
        region: (r.region as 'eu' | 'us' | 'other') || null,
        isMicaRegistry: r.esma_token_id != null || String(r.source).startsWith('esma'),
        hasVerifiedContact: Number(r.verified_contact_count) > 0,
        isPreTge: r.source === 'pre_tge',
        listedOnLcx: false, // ignore for calibration: won deals ARE listed
      },
    };
  });
}

function woe(bucketName: string, inBucket: FeatureRow[], all: FeatureRow[]): string {
  const posAll = all.reduce((s, r) => s + r.labelWeight, 0);
  const nAll = all.length;
  const pos = inBucket.reduce((s, r) => s + r.labelWeight, 0);
  const n = inBucket.length;
  // Laplace smoothing
  const rate = (pos + 0.5) / (n + 1);
  const base = (posAll + 0.5) / (nAll + 1);
  const lift = rate / base;
  return `  ${bucketName.padEnd(28)} n=${String(n).padStart(5)}  pos=${pos.toFixed(1).padStart(6)}  lift=${lift.toFixed(2)}x`;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? 'postgresql://lcx:lcx_dev_password@localhost:5432/lcx_sales';
  const pool = new pg.Pool({ connectionString: dbUrl, max: 2 });
  const rows = await loadRows(pool);
  const won = rows.filter((r) => r.labelWeight === 1);
  const soft = rows.filter((r) => r.labelWeight === 0.5);

  console.log(`\nCalibration corpus: ${rows.length} projects, ${won.length} won, ${soft.length} soft positives\n`);

  console.log('── Weight-of-evidence by bucket (lift > 1 = over-represented among payers)');
  for (const band of ['micro', 'small', 'mid', 'large'] as const) {
    console.log(woe(`mcap:${band}`, rows.filter((r) => mcapBand(r.input.marketCapUsd) === band), rows));
  }
  for (const band of ['illiquid', 'normal', 'hot'] as const) {
    console.log(woe(`vol:${band}`, rows.filter((r) => volMcapBand(r.input.volume24hUsd, r.input.marketCapUsd) === band), rows));
  }
  console.log(woe('categoryFit', rows.filter((r) => categoryFits(r.input.category)), rows));
  console.log(woe('chainFit', rows.filter((r) => chainFits(r.input.chain)), rows));
  console.log(woe('eu/mica', rows.filter((r) => r.input.region === 'eu' || r.input.isMicaRegistry), rows));
  console.log(woe('verifiedContact', rows.filter((r) => r.input.hasVerifiedContact), rows));
  console.log(woe('preTge', rows.filter((r) => r.input.isPreTge), rows));

  console.log(`\n── Rank check for ${MODEL_VERSION} (would current weights surface the payers?)`);
  const scored = rows
    .map((r) => ({ r, score: scorePropensity(r.input, PROPENSITY_WEIGHTS_V1).score }))
    .sort((a, b) => b.score - a.score);
  const decile = Math.ceil(scored.length / 10);
  const quintile = Math.ceil(scored.length / 5);
  const topDecile = new Set(scored.slice(0, decile).map((s) => s.r.id));
  const topQuintile = new Set(scored.slice(0, quintile).map((s) => s.r.id));
  const wonInDecile = won.filter((w) => topDecile.has(w.id)).length;
  const wonInQuintile = won.filter((w) => topQuintile.has(w.id)).length;
  console.log(`  won deals in top decile:   ${wonInDecile}/${won.length}`);
  console.log(`  won deals in top quintile: ${wonInQuintile}/${won.length}`);
  console.log(`  (base rate would be ${(won.length / 10).toFixed(1)} and ${(won.length / 5).toFixed(1)})\n`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
