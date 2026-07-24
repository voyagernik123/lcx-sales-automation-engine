import { Hono } from 'hono';
import {
  referralViralitySim, emissionBudget, questCacSim, channelMix, presenceScore,
  type QuestChannelInput, type EngineDim, type EngineRow, type PresenceInput,
} from '@lcx/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { DISTRIBUTION_DEEP_SEED } from '../seed/distribution/data.js';
import { seedDistribution } from '../distribution/seed.js';

/**
 * DISTRIBUTION COMMAND API (LCX ONE Phase 3). Mounted under /v1/distribution,
 * which the LCX OS fabric already guards at requireWorkspace('distribution',
 * 'view') in app.ts — so every route here is inside the compartment.
 *
 * GET /deep       — the full compiled ontology, merged with live desk state
 *                   (listings) when 0043 is applied; degrades to reference-only.
 * GET /listings   — the surface pipeline (live state).
 * GET /campaigns  — the campaign registry (live state).
 * POST /seed      — (re)ensure a listing row per surface; non-clobbering.
 */
export const distributionRoutes = new Hono<{ Variables: AuthVariables }>();

function isMissingTable(err: unknown): boolean {
  return (err as { code?: string }).code === '42P01';
}

distributionRoutes.get('/deep', requireOperator, async (c) => {
  const pool = getPool();
  let listings: Array<Record<string, unknown>> = [];
  let dbLive = true;
  try {
    listings = (await pool.query(`SELECT * FROM dist_listings ORDER BY surface_id`)).rows;
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    dbLive = false;
  }
  return c.json({ data: { reference: DISTRIBUTION_DEEP_SEED, listings, live: { listings: dbLive } } });
});

distributionRoutes.get('/listings', requireOperator, async (c) => {
  try {
    const { rows } = await getPool().query(`SELECT * FROM dist_listings ORDER BY surface_id`);
    return c.json({ data: rows, meta: { dbLive: true } });
  } catch (err) {
    if (isMissingTable(err)) return c.json({ data: [], meta: { dbLive: false } });
    throw err;
  }
});

distributionRoutes.get('/campaigns', requireOperator, async (c) => {
  try {
    const { rows } = await getPool().query(`SELECT * FROM dist_campaigns ORDER BY created_at DESC LIMIT 200`);
    return c.json({ data: rows, meta: { dbLive: true } });
  } catch (err) {
    if (isMissingTable(err)) return c.json({ data: [], meta: { dbLive: false } });
    throw err;
  }
});

distributionRoutes.post('/seed', requireOperator, async (c) => {
  const result = await seedDistribution(getPool());
  if (result === null) {
    return c.json({ error: 'Distribution tables pending migration 0043', code: 'DB_NOT_READY' }, 503);
  }
  return c.json({ data: result });
});

/* ── Phase 4 — the growth engines over the ontology ── */

const D = DISTRIBUTION_DEEP_SEED.funnel.params;

distributionRoutes.post('/engines/referral-sim', requireOperator, async (c) => {
  const b = await c.req.json<Record<string, number>>().catch(() => ({}) as Record<string, number>);
  const r = referralViralitySim({
    seedCreators: b.seedCreators ?? 100,
    paidLinkConversion: b.paidLinkConversion ?? D.assumedPaidLinkConversion,
    linksPerCreator: b.linksPerCreator ?? 4,
    agentReferralRate: b.agentReferralRate ?? D.assumedAgentReferralRate,
    creatorRewardLcx: b.creatorRewardLcx ?? D.standardCreatorRewardLcx,
    periods: b.periods ?? 6,
  });
  return c.json({ data: r });
});

distributionRoutes.post('/engines/emission', requireOperator, async (c) => {
  const b = await c.req.json<Record<string, number>>().catch(() => ({}) as Record<string, number>);
  const r = emissionBudget({
    projectedPaidLinks: b.projectedPaidLinks ?? 10000,
    creatorRewardLcx: b.creatorRewardLcx ?? D.standardCreatorRewardLcx,
    serviceFeeLcx: b.serviceFeeLcx ?? (D.standardFeeLcx - D.standardCreatorRewardLcx),
    treasuryBudgetLcx: b.treasuryBudgetLcx ?? 25000,
  });
  return c.json({ data: r });
});

distributionRoutes.post('/engines/quest-cac', requireOperator, async (c) => {
  const b = await c.req.json<{ channels?: QuestChannelInput[] }>().catch(() => ({}) as { channels?: QuestChannelInput[] });
  const channels: QuestChannelInput[] = b.channels ?? [
    { channelId: 'galxe', label: 'Galxe', budgetUsd: 10000, cacUsd: 45 },
    { channelId: 'layer3', label: 'Layer3', budgetUsd: 6000, cacUsd: 38 },
  ];
  return c.json({ data: questCacSim(channels) });
});

distributionRoutes.post('/engines/channel-mix', requireOperator, async (c) => {
  const b = await c.req.json<{ dims?: EngineDim[]; rows?: EngineRow[]; weights?: Record<string, number> }>().catch(() => ({}) as { dims?: EngineDim[]; rows?: EngineRow[]; weights?: Record<string, number> });
  // Default channel scorecard derived from the ontology surfaces.
  const dims: EngineDim[] = b.dims ?? [
    { key: 'reach', label: 'Reach', weight: 0.30 },
    { key: 'agentDensity', label: 'Agent density', weight: 0.30 },
    { key: 'cost', label: 'Cost efficiency', weight: 0.15 },
    { key: 'complianceRisk', label: 'Compliance safety', weight: 0.15 },
    { key: 'effort', label: 'Low effort', weight: 0.10 },
  ];
  const rows: EngineRow[] = b.rows ?? DISTRIBUTION_DEEP_SEED.surfaces.slice(0, 8).map((s, i) => ({
    subjectId: s.id, subjectLabel: s.name,
    scores: { reach: 3 + ((i * 2) % 3), agentDensity: 3 + ((i + 1) % 3), cost: 3 + (i % 3), complianceRisk: s.constraint ? 2 : 5, effort: 4 - (i % 3) },
  }));
  return c.json({ data: channelMix(dims, rows, b.weights) });
});

/**
 * GET /v1/distribution/campaigns/:id/export?target=galxe|layer3 — the keyless
 * platform adapter (LCX ONE Phase 6). Emits a campaign spec a human pastes
 * into the platform today; the API posts it directly the day keys arrive.
 * Never blocked on procurement.
 */
distributionRoutes.get('/campaigns/:id/export', requireOperator, async (c) => {
  const id = c.req.param('id');
  const target = (c.req.query('target') ?? 'galxe').toLowerCase();
  try {
    const { rows } = await getPool().query<{ name: string; kind: string; budget_lcx: string | null; detail: string | null; token_incentivized: boolean; status: string }>(
      `SELECT name, kind, budget_lcx, detail, token_incentivized, status FROM dist_campaigns WHERE id=$1`, [id],
    );
    const camp = rows[0];
    if (!camp) return c.json({ error: 'Campaign not found', code: 'NOT_FOUND' }, 404);
    // Neutral spec shape (Galxe/Layer3-compatible fields); the human maps the
    // final rewards in-platform. Deliberately does NOT include secrets.
    const spec = {
      target,
      title: camp.name,
      type: camp.kind,
      description: camp.detail ?? `PayAgent distribution campaign — ${camp.name}`,
      rewards: camp.token_incentivized ? { asset: 'LCX', budget: camp.budget_lcx != null ? Number(camp.budget_lcx) : null } : null,
      tasks: [
        { kind: 'create_payagent_link', label: 'Create a PayAgent payment link' },
        { kind: 'onchain_action', label: 'Get one link paid (verifiable on-chain)' },
        { kind: 'hold', label: 'Hold ≥ required LCX' },
      ],
      note: `Exported keyless from LCX ONE — paste into ${target}. Auto-posted once platform keys are configured.`,
    };
    return c.json({ data: { spec, mode: 'keyless-export' } });
  } catch (err) {
    if (isMissingTable(err)) return c.json({ error: 'Distribution tables pending migration 0043', code: 'DB_NOT_READY' }, 503);
    throw err;
  }
});

/* ── Phase 7 — the distribution AI operator (cited, deterministic-fallback) ── */

distributionRoutes.post('/ask', requireOperator, async (c) => {
  const body = await c.req.json<{ question?: string }>().catch(() => ({} as { question?: string }));
  const q = (body.question ?? '').trim();
  if (q.length < 3) return c.json({ error: 'question required', code: 'VALIDATION' }, 400);
  const { askDistribution } = await import('../ai/distributionOperator.js');
  return c.json({ data: await askDistribution(q) });
});

distributionRoutes.post('/geo-draft', requireOperator, async (c) => {
  const body = await c.req.json<{ query?: string }>().catch(() => ({} as { query?: string }));
  const query = (body.query ?? '').trim();
  if (query.length < 3) return c.json({ error: 'query required', code: 'VALIDATION' }, 400);
  const { draftGeoContent } = await import('../ai/distributionOperator.js');
  return c.json({ data: await draftGeoContent(query) });
});

distributionRoutes.post('/listing-packet', requireOperator, async (c) => {
  const body = await c.req.json<{ surfaceId?: string }>().catch(() => ({} as { surfaceId?: string }));
  const { draftListingPacket } = await import('../ai/distributionOperator.js');
  const r = await draftListingPacket((body.surfaceId ?? '').trim());
  if (!r.packet && !r.usedLlm) return c.json({ error: 'unknown surface', code: 'NOT_FOUND' }, 404);
  return c.json({ data: r });
});

distributionRoutes.post('/campaign-suggest', requireOperator, async (c) => {
  const body = await c.req.json<{ surfaceId?: string }>().catch(() => ({} as { surfaceId?: string }));
  const { suggestCampaign } = await import('../ai/distributionOperator.js');
  return c.json({ data: await suggestCampaign((body.surfaceId ?? '').trim()) });
});

distributionRoutes.get('/engines/presence', requireOperator, async (c) => {
  const pool = getPool();
  let listings: Array<{ surface_id: string; status: string }> = [];
  try {
    listings = (await pool.query(`SELECT surface_id, status FROM dist_listings`)).rows;
  } catch { /* pre-0043 → compiled defaults (all not_started) */ }
  const byId = new Map(listings.map((l) => [l.surface_id, l.status]));
  const inputs: PresenceInput[] = DISTRIBUTION_DEEP_SEED.surfaces.map((s) => ({
    surfaceId: s.id, label: s.name,
    status: (byId.get(s.id) as PresenceInput['status']) ?? 'not_started',
  }));
  return c.json({ data: presenceScore(inputs) });
});
