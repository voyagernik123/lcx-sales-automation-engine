/**
 * Extract ground-truth listing labels from LCX's own CRM exports into
 * listing_labels, joined to universe projects via blocking keys.
 *
 *   closed CSV   → outcome 'won' with real fee columns
 *   pipeline CSV → outcome from the stage trail: won | lost | stalled | active
 *
 * Idempotent: upserts on (source, record_name).
 *
 * Usage: DATABASE_URL=... npx tsx src/labels/extract.ts [data-dir]
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { squashEntity } from '@lcx/shared';
import { readCsv, type CsvRow } from '../import/csv.js';
import { cleanTicker } from '../import/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = resolve(__dirname, '../../../../data/seeds');

function parseFee(raw?: string): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function outcomeFromTrail(stage: string | undefined, trail: string | undefined, changedAt: string | undefined): string {
  const s = (stage ?? '').toLowerCase();
  const t = (trail ?? '').toLowerCase();
  if (s.includes('won') || t.includes('won')) return 'won';
  if (s.includes('lost') || s.includes('reject') || t.includes('lost') || t.includes('reject')) return 'lost';
  if (changedAt) {
    const ts = Date.parse(changedAt);
    if (Number.isFinite(ts) && Date.now() - ts > 365 * 86_400_000) return 'stalled';
  }
  return 'active';
}

interface LabelRow {
  recordName: string;
  ticker: string | null;
  source: 'closed' | 'pipeline';
  outcome: string;
  listingFee: number | null;
  marketingFee: number | null;
  liquidityAmount: number | null;
  stage: string | null;
  stageTrail: string | null;
  stageChangedAt: string | null;
  raw: CsvRow;
}

function fromClosed(rows: CsvRow[]): LabelRow[] {
  return rows
    .filter((r) => (r['Record'] ?? '').trim() !== '')
    .map((r) => ({
      recordName: r['Record'].trim(),
      ticker: cleanTicker(r['Token']) ?? null,
      source: 'closed' as const,
      outcome: 'won',
      listingFee: parseFee(r['Listing Fee']),
      marketingFee: parseFee(r['Marketing Fee']),
      liquidityAmount: parseFee(r['Liquidity Amount']),
      stage: r['Stage']?.trim() || null,
      stageTrail: r['"Stage" Previous Values']?.trim() || r['Stage Previous Values']?.trim() || null,
      stageChangedAt: r['"Stage" Changed At']?.trim() || r['Stage Changed At']?.trim() || null,
      raw: r,
    }));
}

function fromPipeline(rows: CsvRow[]): LabelRow[] {
  return rows
    .filter((r) => (r['Record'] ?? '').trim() !== '')
    .map((r) => {
      const stage = r['Stage']?.trim() || null;
      const trail = r['"Stage" Previous Values']?.trim() || null;
      const changedAt = r['Stage Change Date']?.trim() || null;
      return {
        recordName: r['Record'].trim(),
        ticker: cleanTicker(r['Ticker'] || r['Symbol']) ?? null,
        source: 'pipeline' as const,
        outcome: outcomeFromTrail(stage ?? undefined, trail ?? undefined, changedAt ?? undefined),
        listingFee: parseFee(r['Listing Fee']),
        marketingFee: parseFee(r['Marketing Fee']),
        liquidityAmount: parseFee(r['Liquidity Amount']),
        stage,
        stageTrail: trail,
        stageChangedAt: changedAt,
        raw: r,
      };
    });
}

export async function extractLabels(pool: pg.Pool, dataDir: string): Promise<{ upserted: number; joined: number }> {
  const closedRows = await readCsv(`${dataDir}/LCX Listings - Closed Token Listings.csv`);
  const pipelineRows = await readCsv(`${dataDir}/LCX Listings - Pipeline.csv`);
  const labels = [...fromClosed(closedRows), ...fromPipeline(pipelineRows)];

  // Join to projects by name_key, then ticker_norm as fallback
  const nameKeys = [...new Set(labels.map((l) => squashEntity(l.recordName)).filter(Boolean))];
  const { rows: byName } = await pool.query(
    `SELECT id, name_key FROM projects WHERE name_key = ANY($1)`,
    [nameKeys],
  );
  const nameMap = new Map(byName.map((r) => [r.name_key as string, r.id as string]));

  const tickers = [...new Set(labels.map((l) => l.ticker).filter(Boolean))] as string[];
  const { rows: byTicker } = await pool.query(
    `SELECT ticker_norm, MIN(id::text) AS id, COUNT(*) AS n FROM projects
     WHERE ticker_norm = ANY($1) GROUP BY ticker_norm`,
    [tickers],
  );
  // Ticker fallback only when unambiguous
  const tickerMap = new Map(
    byTicker.filter((r) => Number(r.n) === 1).map((r) => [r.ticker_norm as string, r.id as string]),
  );

  let upserted = 0;
  let joined = 0;
  for (const l of labels) {
    const nameKey = squashEntity(l.recordName);
    const projectId = nameMap.get(nameKey) ?? (l.ticker ? tickerMap.get(l.ticker) ?? null : null);
    if (projectId) joined++;

    await pool.query(
      `INSERT INTO listing_labels (id, project_id, record_name, ticker, source, outcome,
         listing_fee_usd, marketing_fee_usd, liquidity_amount_usd, stage, stage_trail, stage_changed_at, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       /*
        * THREE COLUMNS, BECAUSE TWO OF THEM ARE NOT UNIQUE IN REALITY.
        *
        * 0013_propensity.sql:22 made (source, record_name) unique, and record_name is the
        * COUNTERPARTY'S name — so two contracts with the same counterparty were one row,
        * and 'Vulcan Forged' (twice in the closed book) lost one on every extract run.
        * 0068 replaces that index with (source, record_name, contract_discriminator).
        *
        * This clause HAD to move in the same change: Postgres cannot infer a
        * three-column unique index from a two-column conflict specification, so the
        * moment 0068 is applied the old clause fails with 42P10 and the extractor stops.
        * contract_discriminator is GENERATED ALWAYS AS (coalesce(ticker,'')) STORED, so
        * it is not in the INSERT column list above and must not be — Postgres rejects a
        * write to a generated column — but it is still a legal conflict target.
        */
       ON CONFLICT (source, record_name, contract_discriminator) DO UPDATE SET
         project_id = COALESCE(EXCLUDED.project_id, listing_labels.project_id),
         outcome = EXCLUDED.outcome,
         listing_fee_usd = EXCLUDED.listing_fee_usd,
         marketing_fee_usd = EXCLUDED.marketing_fee_usd,
         liquidity_amount_usd = EXCLUDED.liquidity_amount_usd,
         stage = EXCLUDED.stage,
         stage_trail = EXCLUDED.stage_trail,
         /*
          * stage_changed_at was written on INSERT only and never refreshed, so a contract
          * whose close date moved in the CRM kept its first-seen date here forever. The
          * mark engine derives its ObservationFrame WINDOW from this column, which means
          * the closed book was reporting stale close dates as current observations.
          *
          * COALESCE, not a bare EXCLUDED: the CSV leaves this blank for some rows, and
          * assigning EXCLUDED directly would overwrite a known date with NULL on the next
          * run. A missing value in the source is not a statement that the date is unknown.
          */
         stage_changed_at = COALESCE(EXCLUDED.stage_changed_at, listing_labels.stage_changed_at),
         raw = EXCLUDED.raw`,
      [
        randomUUID(), projectId, l.recordName, l.ticker, l.source, l.outcome,
        l.listingFee, l.marketingFee, l.liquidityAmount, l.stage,
        l.stageTrail ? JSON.stringify(l.stageTrail.split(',').map((s) => s.trim())) : null,
        l.stageChangedAt && Number.isFinite(Date.parse(l.stageChangedAt)) ? new Date(l.stageChangedAt) : null,
        JSON.stringify(l.raw),
      ],
    );
    upserted++;
  }

  return { upserted, joined };
}

const isMain = process.argv[1]?.endsWith('extract.ts') || process.argv[1]?.endsWith('extract.js');
if (isMain) {
  const dataDir = resolve(process.argv[2] ?? DEFAULT_DATA_DIR);
  const dbUrl = process.env.DATABASE_URL ?? 'postgresql://lcx:lcx_dev_password@localhost:5432/lcx_sales';
  const pool = new pg.Pool({ connectionString: dbUrl, max: 2 });
  extractLabels(pool, dataDir)
    .then((r) => {
      console.log(`Labels: ${r.upserted} upserted, ${r.joined} joined to projects.`);
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
