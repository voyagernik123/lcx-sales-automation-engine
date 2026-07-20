/**
 * Paged batch scorer — replaces whole-table in-memory scoring. Each page is
 * one query joining projects + aggregated contacts + recent signals; scores
 * (regulatory + propensity + priority) are bulk-upserted per page.
 *
 * 30k projects ≈ 60 read queries + 60 upserts.
 */
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import {
  scoreProject, scorePropensity, combinePriority,
  PROPENSITY_WEIGHTS_V1, MODEL_VERSION, squashEntity,
  type ScoreInputContact, type ScoreInputSignal, type PropensityInput,
} from '@lcx/shared';

const PAGE = 500;

export interface BatchScoreReport {
  scored: number;
  errors: number;
  pages: number;
  bands: Record<string, number>;
  modelVersion: string;
}

interface RaiseInfo {
  monthsAgo: number;
  amountM: number | null;
}

export async function scoreAllPaged(pool: pg.Pool): Promise<BatchScoreReport> {
  const report: BatchScoreReport = { scored: 0, errors: 0, pages: 0, bands: {}, modelVersion: MODEL_VERSION };

  const raisesByNameKey = await loadRaises(pool);

  let offset = 0;
  for (;;) {
    const { rows } = await pool.query(
      `SELECT
         p.id, p.name, p.website, p.ticker, p.chain, p.jurisdiction, p.whitepaper_url,
         p.category, p.market_cap, p.source, p.esma_token_id, p.dti, p.listed_on_lcx,
         p.market_cap_usd, p.market_cap_rank, p.volume_24h_usd, p.token_age_days, p.exchange_count,
         p.region, p.name_key, p.verified_contact_count,
         contacts.list AS contacts,
         sigs.list AS signals
       FROM projects p
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object(
           'name', pl.name, 'email', pl.email, 'linkedin', pl.linkedin, 'telegram', pl.telegram
         )) AS list
         FROM people pl WHERE pl.project_id = p.id
       ) contacts ON TRUE
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object('kind', s.kind, 'payload', s.payload)) AS list
         FROM (
           SELECT kind, payload FROM signals
           WHERE project_id = p.id AND observed_at > NOW() - INTERVAL '90 days'
           ORDER BY observed_at DESC LIMIT 20
         ) s
       ) sigs ON TRUE
       WHERE p.tier = 'tracked'
       ORDER BY p.id
       LIMIT $1 OFFSET $2`,
      [PAGE, offset],
    );
    if (rows.length === 0) break;
    report.pages++;

    const upserts: {
      projectId: string; euScore: number; usPreScore: number; usPostScore: number;
      band: string; reasons: unknown; recommendedMarket: string; usIntelSignals: unknown;
      propensityScore: number; propensityReasons: unknown; priorityScore: number;
    }[] = [];

    for (const r of rows) {
      try {
        const contacts: ScoreInputContact[] = ((r.contacts as ScoreInputContact[] | null) ?? []).map((c) => ({
          name: c.name ?? undefined,
          email: c.email ?? undefined,
          linkedin: c.linkedin ?? undefined,
          telegram: c.telegram ?? undefined,
        }));
        const signals: ScoreInputSignal[] = ((r.signals as { kind: string; payload: Record<string, unknown> }[] | null) ?? []).map((s) => ({
          kind: s.kind,
          payload: s.payload ?? {},
        }));

        // Live market columns are authoritative; the CSV string is the fallback
        const mcapUsd = r.market_cap_usd != null ? Number(r.market_cap_usd) : null;
        const result = scoreProject(
          {
            name: r.name as string,
            website: (r.website as string) || undefined,
            ticker: (r.ticker as string) || undefined,
            chain: (r.chain as string) || undefined,
            jurisdiction: (r.jurisdiction as string) || undefined,
            whitepaperUrl: (r.whitepaper_url as string) || undefined,
            category: (r.category as string) || undefined,
            marketCap: mcapUsd != null ? String(mcapUsd) : (r.market_cap as string) || undefined,
            source: r.source as string,
            esmaTokenId: (r.esma_token_id as string) || undefined,
            dti: (r.dti as string) || undefined,
            listedOnLcx: r.listed_on_lcx === true,
          },
          contacts,
          signals,
        );

        const raise = raisesByNameKey.get((r.name_key as string) ?? '') ?? null;
        const propensityInput: PropensityInput = {
          marketCapUsd: mcapUsd,
          volume24hUsd: r.volume_24h_usd != null ? Number(r.volume_24h_usd) : null,
          tokenAgeDays: r.token_age_days != null ? Number(r.token_age_days) : null,
          fundingMonthsAgo: raise?.monthsAgo ?? null,
          fundingAmountM: raise?.amountM ?? null,
          exchangeCount: r.exchange_count != null ? Number(r.exchange_count) : null,
          category: (r.category as string) || null,
          chain: (r.chain as string) || null,
          region: (r.region as 'eu' | 'us' | 'other') || null,
          isMicaRegistry: r.esma_token_id != null || String(r.source).startsWith('esma'),
          hasVerifiedContact: Number(r.verified_contact_count) > 0,
          isPreTge: r.source === 'pre_tge',
          listedOnLcx: r.listed_on_lcx === true,
        };
        const propensity = scorePropensity(propensityInput, PROPENSITY_WEIGHTS_V1);
        const eligibility = Math.max(result.euScore, result.usPostScore);
        const priority = combinePriority(propensity.score, eligibility);

        upserts.push({
          projectId: r.id as string,
          euScore: result.euScore,
          usPreScore: result.usPreScore,
          usPostScore: result.usPostScore,
          band: result.band,
          reasons: result.reasons,
          recommendedMarket: result.recommendedMarket,
          usIntelSignals: result.usIntelSignals ?? {},
          propensityScore: propensity.score,
          propensityReasons: propensity.reasons,
          priorityScore: priority,
        });
        report.bands[result.band] = (report.bands[result.band] || 0) + 1;
      } catch (err) {
        report.errors++;
        console.error(`  score error for ${r.name}:`, err instanceof Error ? err.message : err);
      }
    }

    // Bulk upsert the page
    if (upserts.length > 0) {
      const values: unknown[] = [];
      const tuples = upserts
        .map((u, i) => {
          const base = i * 12;
          values.push(
            randomUUID(), u.projectId, u.euScore, u.usPreScore, u.usPostScore, u.band,
            JSON.stringify(u.reasons), u.recommendedMarket, JSON.stringify(u.usIntelSignals),
            u.propensityScore, JSON.stringify(u.propensityReasons), u.priorityScore,
          );
          return `($${base + 1}::uuid, $${base + 2}::uuid, $${base + 3}::int, $${base + 4}::int, $${base + 5}::int, $${base + 6}, $${base + 7}::jsonb, $${base + 8}, $${base + 9}::jsonb, $${base + 10}::int, $${base + 11}::jsonb, $${base + 12}::int)`;
        })
        .join(', ');

      await pool.query(
        `INSERT INTO scores (id, project_id, eu_score, us_pre_score, us_post_score, band,
           reasons, recommended_market, us_intel_signals,
           propensity_score, propensity_reasons, priority_score, model_version, computed_at)
         SELECT v.id, v.project_id, v.eu, v.us_pre, v.us_post, v.band, v.reasons, v.market, v.intel,
           v.prop, v.prop_reasons, v.priority, '${MODEL_VERSION}', NOW()
         FROM (VALUES ${tuples}) AS v(id, project_id, eu, us_pre, us_post, band, reasons, market, intel, prop, prop_reasons, priority)
         ON CONFLICT (project_id) DO UPDATE SET
           eu_score = EXCLUDED.eu_score,
           us_pre_score = EXCLUDED.us_pre_score,
           us_post_score = EXCLUDED.us_post_score,
           band = EXCLUDED.band,
           reasons = EXCLUDED.reasons,
           recommended_market = EXCLUDED.recommended_market,
           us_intel_signals = EXCLUDED.us_intel_signals,
           propensity_score = EXCLUDED.propensity_score,
           propensity_reasons = EXCLUDED.propensity_reasons,
           priority_score = EXCLUDED.priority_score,
           model_version = EXCLUDED.model_version,
           computed_at = NOW()`,
        values,
      );
      report.scored += upserts.length;
    }

    offset += rows.length;
  }

  return report;
}

/** nameKey → most recent staged funding round. */
async function loadRaises(pool: pg.Pool): Promise<Map<string, RaiseInfo>> {
  const map = new Map<string, RaiseInfo>();
  const { rows } = await pool.query(
    `SELECT payload FROM project_sources WHERE source = 'defillama_raises'`,
  ).catch(() => ({ rows: [] as { payload: Record<string, unknown> }[] }));

  const now = Date.now();
  for (const r of rows) {
    const p = r.payload as Record<string, unknown>;
    const nameKey = (p.nameKey as string) ?? squashEntity((p.name as string) ?? '');
    const dateSec = Number(p.date);
    if (!nameKey || !Number.isFinite(dateSec)) continue;
    const monthsAgo = (now - dateSec * 1000) / (30.44 * 86_400_000);
    const existing = map.get(nameKey);
    if (!existing || monthsAgo < existing.monthsAgo) {
      map.set(nameKey, { monthsAgo, amountM: p.amountM != null ? Number(p.amountM) : null });
    }
  }
  return map;
}
