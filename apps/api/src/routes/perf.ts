/**
 * POST /v1/perf — client-measured UI latency ingest (TERMINAL Phase 2).
 *
 * The speed floor's number cannot be measured on the server: what matters is the
 * gap between an operator's intent and pixels on their screen. The client owns
 * that measurement and flushes batches here so the existing SLO machinery
 * (GET /v1/intel/slo → Ops Health panel + Command Center breach banner) can show
 * it alongside every other objective.
 *
 * Three deliberate constraints, each learned from the surrounding code:
 *
 * 1. **Mounted at /v1/perf, NOT /v1/intel.** `/v1/intel` is workspace-gated at
 *    'view' for the INTELLIGENCE compartment (app.ts), so an ingest route there
 *    would 403 for every operator without that entitlement and the speed floor
 *    would end up measured only on analysts.
 * 2. **Excluded from the latency middleware** (app.ts), or the act of reporting
 *    UI latency would be recorded as API latency and pollute the api_latency SLO.
 * 3. **Best-effort, never throws** — modelled on logAiUsage in ai/llm.ts:
 *    "telemetry must not break a feature". A failed metric write returns ok.
 */

import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { requireOperator } from '../middleware/auth.js';
import { uiInteractionRing, uiSettleRing, uiFrameRing } from '../lib/latency.js';
import { getDb } from '../db/index.js';
import { env } from '../lib/env.js';

const perf = new Hono();

perf.use('*', requireOperator);

const meta = () => ({ timestamp: new Date().toISOString(), version: '0.1.0' });

/** Hard caps so a buggy or hostile client cannot flood the ring or the table. */
const MAX_SAMPLES = 500;
const MAX_FRAMES = 500;
/** Anything slower than this is a suspended tab, not an interaction. */
const MAX_PLAUSIBLE_MS = 60_000;

interface InSample {
  kind?: unknown;
  surface?: unknown;
  /** 'paint' (intent → local state on screen) or 'settle' (all regions resolved). */
  phase?: unknown;
  ms?: unknown;
  cached?: unknown;
}

const KINDS = new Set(['nav', 'palette', 'inspector', 'filter', 'keynav']);

function sane(ms: unknown): number | null {
  const n = typeof ms === 'number' ? ms : Number.NaN;
  if (!Number.isFinite(n) || n < 0 || n > MAX_PLAUSIBLE_MS) return null;
  return n;
}

perf.post('/', async (c) => {
  let body: { samples?: InSample[]; frames?: unknown[] };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: 'Body must be JSON', code: 'VALIDATION' }, 400);
  }

  const samples = Array.isArray(body.samples) ? body.samples.slice(0, MAX_SAMPLES) : [];
  const frames = Array.isArray(body.frames) ? body.frames.slice(0, MAX_FRAMES) : [];

  // Per-surface rollup, so the gate ("p95 < 100ms across the ten most-used
  // surfaces") can be evaluated per surface rather than as one global average
  // that a fast page could hide a slow page behind.
  const bySurface = new Map<string, number[]>();
  const bySettleSurface = new Map<string, number[]>();
  let accepted = 0;

  for (const s of samples) {
    const ms = sane(s.ms);
    if (ms == null) continue;
    if (typeof s.kind !== 'string' || !KINDS.has(s.kind)) continue;
    const surface = typeof s.surface === 'string' && s.surface ? s.surface.slice(0, 120) : '/';
    // Unknown/absent phase is treated as 'paint' so an older client still reports
    // something, but it can never be silently counted as the settle number.
    const settle = s.phase === 'settle';
    (settle ? uiSettleRing : uiInteractionRing).record(ms);
    accepted += 1;
    if (!settle) {
      const arr = bySurface.get(surface);
      if (arr) arr.push(ms);
      else bySurface.set(surface, [ms]);
    } else {
      const arr = bySettleSurface.get(surface);
      if (arr) arr.push(ms);
      else bySettleSurface.set(surface, [ms]);
    }
  }

  let framesAccepted = 0;
  for (const f of frames) {
    const ms = sane(f);
    if (ms == null || ms <= 0) continue;
    uiFrameRing.record(ms);
    framesAccepted += 1;
  }

  // Persist a per-surface rollup so regressions are visible over time rather
  // than only in this process's memory. `observations` is the existing
  // provenance spine and already carries (subject, predicate, numeric value,
  // unit, source, observedAt) — so this needs NO migration, which also means it
  // cannot be blocked waiting on a production SQL paste.
  //
  // Rollups only, never raw samples: one row per surface per flush.
  void persistRollup(bySurface, 'ui_interaction_p95');
  void persistRollup(bySettleSurface, 'ui_settle_p95');

  return c.json({ data: { accepted, framesAccepted }, meta: meta() });
});

function p95(values: number[]): number {
  const arr = [...values].sort((a, b) => a - b);
  const idx = Math.min(arr.length - 1, Math.max(0, Math.ceil(0.95 * arr.length) - 1));
  return Math.round(arr[idx]);
}

/**
 * Fire-and-forget. Swallows everything: a perf metric must never surface to an
 * operator as a failure, and must never fail the request that reported it.
 */
async function persistRollup(bySurface: Map<string, number[]>, predicate: string): Promise<void> {
  if (bySurface.size === 0) return;
  if (!env.databaseUrl) return; // dev without Postgres — the ring still works
  try {
    const db = getDb();
    for (const [surface, values] of bySurface) {
      if (values.length === 0) continue;
      await db.execute(sql`
        INSERT INTO observations
          (subject_type, subject_id, predicate, value_num, unit, source, observed_at)
        VALUES ('surface', ${surface}, ${predicate}, ${p95(values)}, 'ms', 'client_hud', NOW())
      `);
    }
  } catch (err) {
    // Telemetry is non-critical — log and move on.
    console.warn('[perf] rollup persist failed:', err instanceof Error ? err.message : err);
  }
}

export default perf;
