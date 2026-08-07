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

/* ══════════════════════════════════════════════════════════════════════════
 * ENGINE INPUT BOUNDS — an AVAILABILITY control, not input hygiene.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * WHY ONLY TWO OF THESE FIVE ROUTES ARE BOUNDED. `referral-sim`, `emission` and
 * `presence` read SCALARS (or read the compiled ontology); their cost is fixed inside
 * the engine and no body can make them loop longer. The two bounded below take ARRAYS
 * straight from the caller into a nested scan:
 *
 *   channel-mix → channelMix() → sensitivity() (packages/shared/src/commandEngines.ts:61)
 *     scans wk = 0.005 … 0.6001 at 0.005 resolution — ~123 rescores PER DIMENSION — and
 *     each rescore is O(rows × dims). Total O(123 × dims² × rows). QUADRATIC IN dims,
 *     which is why dims is capped harder than rows.
 *   quest-cac → questCacSim() (packages/shared/src/distributionEngines.ts:151)
 *     fixes runs = 2000 and loops every unlocked channel per run: O(2000 × channels).
 *
 * `apps/api/src/index.ts` is a bare `serve()` — one Node thread, no cluster, no worker
 * threads — so one slow request blocks EVERY route in all eight compartments, including
 * `/health`, which flaps the platform health check. Both routes sit behind
 * `distribution:operate`, which the SHARED `OPERATOR_API_KEY` grants, so the caller who
 * can do this is not exotic.
 *
 * WHERE THE NUMBERS COME FROM.
 *   Observation frame: `channelMix` called DIRECTLY on the compiled artifact
 *   `packages/shared/dist/distributionEngines.js` (not through HTTP, so no server or JSON
 *   cost is included), median of 7 runs after warm-up, rows carrying `scores: {}` — the
 *   worst case, because an ABSENT score still costs the full inner loop: `rescore` does
 *   `r.scores[d.key] ?? 0` per dim per row.
 *   Environment: node v22.23.1, darwin arm64, developer laptop, measured 2026-08-07.
 *   NOT the Render production instance, which is smaller and will be slower.
 *
 *     dims=5,   rows=8   →    1.3 ms   ← what apps/web actually sends
 *     dims=12,  rows=64  →   30.1 ms
 *     dims=16,  rows=64  →   48.4 ms   ← THE CAP
 *     dims=16,  rows=96  →   72.2 ms
 *     dims=32,  rows=96  →  286.2 ms
 *     dims=64,  rows=64  →  641.3 ms
 *     dims=100, rows=100 →    2.6 s
 *   questCacSim: 1 channel 0.6 ms · 2 channels 0.8 ms · 64 channels 2.2 ms.
 *
 * WHAT THE WEB APP SENDS, so a real user is never refused. There are exactly three
 * callers in `apps/web` (`grep -rn "runChannelMix\|runQuestCac" apps/web/src`):
 *   · `components/distribution/GrowthEngines.tsx:27-28` — `runChannelMix()` and
 *     `runQuestCac()` with NO BODY, so both fall through to the compiled defaults
 *     (5 dims × 8 rows; 2 channels).
 *   · `pages/DistributionCampaigns.tsx:104` — `runQuestCac` with ONE channel.
 * The caps are 3.2× the observed dims, 8× the observed rows, 32× the observed channels.
 * No shipped surface can reach them.
 */
export const ENGINE_INPUT_LIMITS = {
  /** The quadratic term. Capped hardest. */
  channelMixDims: 16,
  channelMixRows: 64,
  questCacChannels: 64,
} as const;

/** The one rule every bound refusal cites. */
export const ENGINE_BOUND_RULE = 'distribution.engines.input_bounds';

/** Stable refusal codes. A caller can branch on these; they do not change with wording. */
export type EngineBoundCode =
  | 'ENGINE_INPUT_NOT_ARRAY'
  | 'ENGINE_INPUT_EMPTY'
  | 'ENGINE_INPUT_OVER_CAP'
  | 'ENGINE_INPUT_ELEMENT_MALFORMED'
  | 'ENGINE_INPUT_WEIGHTS_UNUSABLE';

interface EngineRefusal {
  code: EngineBoundCode;
  reason: string;
  field: string;
  observed: number | string;
  permitted: number | string;
}

/**
 * The wire body. Same envelope as `routes/gpsInputs.ts refusalBody` —
 * `{ error, code, data: { rule, field, … } }` — extended with the two figures a caller
 * needs in order to fix the request, each stamped with the frame it was read in and the
 * environment that read it, so neither is mistaken for a platform-wide constant.
 */
function boundRefusalBody(r: EngineRefusal) {
  return {
    error: r.reason,
    code: r.code,
    data: {
      rule: ENGINE_BOUND_RULE,
      field: r.field,
      observed: r.observed,
      permitted: r.permitted,
      frame: 'request_body_at_admission',
      environment: process.env.NODE_ENV ?? 'development',
    },
  };
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** What the caller actually sent, named so the refusal is diagnosable without a guess. */
function describeValue(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'absent';
  if (Array.isArray(v)) return 'array';
  if (v === '') return 'empty string';
  if (typeof v === 'number' && !Number.isFinite(v)) return Number.isNaN(v) ? 'NaN' : 'non-finite number';
  return typeof v;
}

/**
 * THREE STATES, NEVER COLLAPSED. `undefined`/`null` means NOT SUPPLIED and hands the
 * route to its compiled default — a stated default, echoed back in the response body.
 * Anything else is SUPPLIED, and a supplied collection must be a well-formed, non-empty,
 * within-cap array. `[]` is GENUINELY EMPTY: a caller asserting "these are the rows",
 * which must not be silently upgraded into the platform's own numbers.
 */
function boundArray(value: unknown, field: string, cap: number): EngineRefusal | null {
  if (!Array.isArray(value)) {
    return {
      code: 'ENGINE_INPUT_NOT_ARRAY',
      reason: `${field} must be an array`,
      field,
      observed: describeValue(value),
      permitted: 'array',
    };
  }
  if (value.length === 0) {
    return {
      code: 'ENGINE_INPUT_EMPTY',
      reason: `${field} was supplied but empty — omit the field to use the compiled default, or send at least one element; an empty set is not the same as no set`,
      field,
      observed: 0,
      permitted: `1..${cap}`,
    };
  }
  if (value.length > cap) {
    return {
      code: 'ENGINE_INPUT_OVER_CAP',
      reason: `${field} carries ${value.length} elements; ${cap} is the permitted maximum`,
      field,
      observed: value.length,
      permitted: cap,
    };
  }
  return null;
}

const malformed = (field: string, permitted: string, observed: unknown): EngineRefusal => ({
  code: 'ENGINE_INPUT_ELEMENT_MALFORMED',
  reason: `${field} must be ${permitted}`,
  field,
  observed: describeValue(observed),
  permitted,
});

function checkDims(value: unknown): EngineRefusal | null {
  const bound = boundArray(value, 'dims', ENGINE_INPUT_LIMITS.channelMixDims);
  if (bound) return bound;
  const arr = value as unknown[];
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i];
    if (!isPlainObject(d)) return malformed(`dims[${i}]`, 'an object', d);
    if (typeof d.key !== 'string' || d.key.length === 0) return malformed(`dims[${i}].key`, 'a non-empty string', d.key);
    if (typeof d.label !== 'string') return malformed(`dims[${i}].label`, 'a string', d.label);
    if (!isFiniteNumber(d.weight)) return malformed(`dims[${i}].weight`, 'a finite number', d.weight);
  }
  return null;
}

function checkRows(value: unknown): EngineRefusal | null {
  const bound = boundArray(value, 'rows', ENGINE_INPUT_LIMITS.channelMixRows);
  if (bound) return bound;
  const arr = value as unknown[];
  for (let i = 0; i < arr.length; i++) {
    const r = arr[i];
    if (!isPlainObject(r)) return malformed(`rows[${i}]`, 'an object', r);
    if (typeof r.subjectId !== 'string' || r.subjectId.length === 0) return malformed(`rows[${i}].subjectId`, 'a non-empty string', r.subjectId);
    if (typeof r.subjectLabel !== 'string') return malformed(`rows[${i}].subjectLabel`, 'a string', r.subjectLabel);
    // `rescore` reads `r.scores[d.key]` unguarded, so a missing or non-object `scores`
    // is a TypeError INSIDE the engine — reported as a 500, i.e. as our fault, when the
    // truth is that the request was malformed.
    if (!isPlainObject(r.scores)) return malformed(`rows[${i}].scores`, 'an object', r.scores);
    for (const [k, sv] of Object.entries(r.scores)) {
      if (!isFiniteNumber(sv)) return malformed(`rows[${i}].scores.${k}`, 'a finite number', sv);
    }
  }
  return null;
}

function checkWeights(value: unknown): EngineRefusal | null {
  if (value === undefined || value === null) return null;
  if (!isPlainObject(value)) return malformed('weights', 'an object', value);
  for (const [k, wv] of Object.entries(value)) {
    if (!isFiniteNumber(wv)) return malformed(`weights.${k}`, 'a finite number', wv);
  }
  return null;
}

/**
 * `rescore` THROWS `Error('weights sum to zero')` (commandEngines.ts:34) when every
 * EFFECTIVE weight is ≤ 0 — reachable today with `{"dims":[]}` or all-zero weights, and
 * answered with a 500. It is a caller error and refuses as one, citing the engine
 * precondition it would have violated.
 */
function checkWeightSum(dims: EngineDim[], overrides?: Record<string, number>): EngineRefusal | null {
  let sum = 0;
  for (const d of dims) sum += Math.max(0, overrides?.[d.key] ?? d.weight);
  if (sum > 0) return null;
  return {
    code: 'ENGINE_INPUT_WEIGHTS_UNUSABLE',
    reason: 'every effective dimension weight is zero or negative, so the scorecard cannot be normalized',
    field: 'dims[].weight',
    observed: sum,
    permitted: '> 0',
  };
}

function checkChannels(value: unknown): EngineRefusal | null {
  const bound = boundArray(value, 'channels', ENGINE_INPUT_LIMITS.questCacChannels);
  if (bound) return bound;
  const arr = value as unknown[];
  for (let i = 0; i < arr.length; i++) {
    const ch = arr[i];
    if (!isPlainObject(ch)) return malformed(`channels[${i}]`, 'an object', ch);
    if (typeof ch.channelId !== 'string' || ch.channelId.length === 0) return malformed(`channels[${i}].channelId`, 'a non-empty string', ch.channelId);
    if (typeof ch.label !== 'string') return malformed(`channels[${i}].label`, 'a string', ch.label);
    if (!isFiniteNumber(ch.budgetUsd)) return malformed(`channels[${i}].budgetUsd`, 'a finite number', ch.budgetUsd);
    if (!isFiniteNumber(ch.cacUsd)) return malformed(`channels[${i}].cacUsd`, 'a finite number', ch.cacUsd);
    // `questCacSim` filters on `!c.locked`, so the STRING "false" is TRUTHY and would
    // silently drop the channel from the simulation — the result would report a smaller
    // book and never say why. A non-boolean is refused, never coerced.
    if (ch.locked !== undefined && typeof ch.locked !== 'boolean') return malformed(`channels[${i}].locked`, 'a boolean', ch.locked);
  }
  return null;
}

/**
 * `c.req.json()` returns `null` for the literal body `null` and a string for `"x"`, and
 * the `.catch(() => ({}))` these routes used covers only a PARSE failure — so `b.channels`
 * on a `null` body was a TypeError and a 500. Anything that is not a JSON object is read
 * as "no fields supplied", which is exactly what the no-body case (the only case the web
 * app produces) already means.
 */
async function readObjectBody(c: { req: { json: <T>() => Promise<T> } }): Promise<Record<string, unknown>> {
  const raw = await c.req.json<unknown>().catch(() => null);
  return isPlainObject(raw) ? raw : {};
}

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
  const b = await readObjectBody(c);
  if (b.channels !== undefined && b.channels !== null) {
    const bad = checkChannels(b.channels);
    if (bad) return c.json(boundRefusalBody(bad), 400);
  }
  const channels: QuestChannelInput[] = (b.channels as QuestChannelInput[] | undefined | null) ?? [
    { channelId: 'galxe', label: 'Galxe', budgetUsd: 10000, cacUsd: 45 },
    { channelId: 'layer3', label: 'Layer3', budgetUsd: 6000, cacUsd: 38 },
  ];
  return c.json({ data: questCacSim(channels) });
});

distributionRoutes.post('/engines/channel-mix', requireOperator, async (c) => {
  const b = await readObjectBody(c);
  // REFUSED BEFORE THE ENGINE RUNS. The scan is O(123 × dims² × rows) on one Node
  // thread; validating after the call would be validating after the outage.
  const supplied: Array<EngineRefusal | null> = [
    b.dims === undefined || b.dims === null ? null : checkDims(b.dims),
    b.rows === undefined || b.rows === null ? null : checkRows(b.rows),
    checkWeights(b.weights),
  ];
  for (const bad of supplied) if (bad) return c.json(boundRefusalBody(bad), 400);
  // Default channel scorecard derived from the ontology surfaces.
  const dims: EngineDim[] = (b.dims as EngineDim[] | undefined | null) ?? [
    { key: 'reach', label: 'Reach', weight: 0.30 },
    { key: 'agentDensity', label: 'Agent density', weight: 0.30 },
    { key: 'cost', label: 'Cost efficiency', weight: 0.15 },
    { key: 'complianceRisk', label: 'Compliance safety', weight: 0.15 },
    { key: 'effort', label: 'Low effort', weight: 0.10 },
  ];
  const rows: EngineRow[] = (b.rows as EngineRow[] | undefined | null) ?? DISTRIBUTION_DEEP_SEED.surfaces.slice(0, 8).map((s, i) => ({
    subjectId: s.id, subjectLabel: s.name,
    scores: { reach: 3 + ((i * 2) % 3), agentDensity: 3 + ((i + 1) % 3), cost: 3 + (i % 3), complianceRisk: s.constraint ? 2 : 5, effort: 4 - (i % 3) },
  }));
  const weights = (b.weights as Record<string, number> | undefined | null) ?? undefined;
  // Checked against the RESOLVED dims (caller's or the compiled default) because a
  // weights override alone can zero the whole scorecard.
  const unusable = checkWeightSum(dims, weights);
  if (unusable) return c.json(boundRefusalBody(unusable), 400);
  return c.json({ data: channelMix(dims, rows, weights) });
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
