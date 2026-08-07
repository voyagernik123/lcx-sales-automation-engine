import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { invalidateEntitlements } from '../../access/entitlements.js';
import { ENGINE_BOUND_RULE, ENGINE_INPUT_LIMITS } from '../distribution.js';

/**
 * THE TWO ENGINE ROUTES THAT TAKE A CALLER-SUPPLIED COLLECTION HAD NO BOUND AT ALL.
 *
 * `POST /v1/distribution/engines/channel-mix` read `dims` and `rows` straight off the body
 * with no length check and no type check, and handed them to `channelMix` →
 * `sensitivity` (packages/shared/src/commandEngines.ts:61), which scans
 * `wk = 0.005 … 0.6001` at 0.005 resolution — ~123 rescores PER DIMENSION — each rescore
 * being O(rows × dims). Total O(123 × dims² × rows), QUADRATIC IN dims. Measured on the
 * compiled artifact (node v22.23.1, darwin arm64, developer laptop, median of 7 after
 * warm-up, rows carrying `scores: {}`):
 *
 *     dims=5,   rows=8   →   1.3 ms   ← what apps/web actually sends
 *     dims=16,  rows=64  →  48.4 ms   ← the cap this file pins
 *     dims=64,  rows=64  → 641.3 ms
 *     dims=100, rows=100 →   2.6 s
 *
 * `apps/api/src/index.ts` is a bare `serve()` — one thread, no cluster, no worker threads
 * — so that time is not "one slow request", it is EVERY route in all eight compartments
 * blocked, `/health` included, which flaps the platform health check. The credential that
 * reaches these routes is `distribution:operate`, which the SHARED `OPERATOR_API_KEY`
 * grants.
 *
 * `POST /v1/distribution/engines/quest-cac` was the same defect at a smaller constant
 * (`questCacSim` fixes runs = 2000 and loops every unlocked channel per run), plus a
 * second one: `channels: 5` reached `.filter` on a number and threw a TypeError into a
 * 500 — reporting a malformed request as a server fault.
 *
 * ── WHY THERE IS NOT A SINGLE WALL-CLOCK ASSERTION IN THIS FILE ──────────────────
 * A test that asserts "the over-cap request returned in under N ms" measures the CI box,
 * not the fix, and will flake under load — this repo already has a note about a 20ms query
 * becoming a 2s query on a saturated machine (apps/api/vitest.config.ts). Every assertion
 * here is structural instead: the refusal happens, it carries a stable code, the engine's
 * output is ABSENT from the refusal body (so the scan provably did not run), the process
 * still answers afterwards, and the cap itself is pinned below the measured cost cliff so
 * that raising it later fails this suite rather than production.
 */

const KEY = 'dev-operator-key-change-me';
const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const CHANNEL_MIX = '/v1/distribution/engines/channel-mix';
const QUEST_CAC = '/v1/distribution/engines/quest-cac';

interface Refusal {
  error: string;
  code: string;
  data: { rule: string; field: string; observed: number | string; permitted: number | string; frame: string; environment: string };
}

const dimsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `d${i}`, label: `D${i}`, weight: 1 / n }));
const rowsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ subjectId: `s${i}`, subjectLabel: `S${i}`, scores: {} }));

describe('distribution engine input bounds', () => {
  const app = createApp();
  beforeAll(() => {
    process.env.ALLOW_DB_SKIP = 'true';
    process.env.OPERATOR_API_KEY = KEY;
    invalidateEntitlements();
  });

  const post = (path: string, body: unknown) =>
    app.request(path, { method: 'POST', headers, body: JSON.stringify(body) });

  /* ══ 1. THE CAP ITSELF ══════════════════════════════════════════════════════ */

  it('keeps the cap under the measured cost cliff — dims² × rows is the actual work term', () => {
    const { channelMixDims: d, channelMixRows: r } = ENGINE_INPUT_LIMITS;
    /*
     * `sensitivity` costs ~123 × dims × (dims × rows). `dims² × rows` is therefore the
     * single number that governs the block, and 16² × 64 = 16,384 is the point measured
     * at 48.4 ms. This is the guard on the NEXT person to touch the constants: raising
     * dims to 32 (32² × 96 = 98,304, measured at 286 ms) fails here instead of on Render.
     */
    expect(d * d * r).toBeLessThanOrEqual(16_384);
    expect(ENGINE_INPUT_LIMITS.questCacChannels).toBeLessThanOrEqual(256);
  });

  it('leaves headroom above every shape the shipped web app sends — derived from the route, not hardcoded', async () => {
    // apps/web/src/components/distribution/GrowthEngines.tsx:27-28 calls both engines with
    // NO BODY, so what the route answers with here IS what a real user's request produces.
    const mix = (await (await post(CHANNEL_MIX, {})).json()) as { data: { dimensions: unknown[]; rows: unknown[] } };
    const cac = (await (await post(QUEST_CAC, {})).json()) as { data: { marginal: unknown[] } };
    expect(ENGINE_INPUT_LIMITS.channelMixDims).toBeGreaterThanOrEqual(mix.data.dimensions.length);
    expect(ENGINE_INPUT_LIMITS.channelMixRows).toBeGreaterThanOrEqual(mix.data.rows.length);
    // DistributionCampaigns.tsx:104 sends one channel; the default path builds two.
    expect(ENGINE_INPUT_LIMITS.questCacChannels).toBeGreaterThanOrEqual(cac.data.marginal.length);
  });

  it('serves a request sitting exactly ON the cap — the bound refuses excess, not use', async () => {
    const res = await post(CHANNEL_MIX, {
      dims: dimsOf(ENGINE_INPUT_LIMITS.channelMixDims),
      rows: rowsOf(ENGINE_INPUT_LIMITS.channelMixRows),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { rows: unknown[] } };
    expect(body.data.rows).toHaveLength(ENGINE_INPUT_LIMITS.channelMixRows);
  });

  /* ══ 2. OVER-CAP REFUSES, WITH A CODE, AND THE ENGINE NEVER RUNS ════════════ */

  it('refuses an over-cap dims array with ENGINE_INPUT_OVER_CAP citing observed vs permitted', async () => {
    const over = ENGINE_INPUT_LIMITS.channelMixDims + 1;
    const res = await post(CHANNEL_MIX, { dims: dimsOf(over), rows: rowsOf(4) });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Refusal;
    expect(body.code).toBe('ENGINE_INPUT_OVER_CAP');
    expect(body.data.rule).toBe(ENGINE_BOUND_RULE);
    expect(body.data.field).toBe('dims');
    expect(body.data.observed).toBe(over);
    expect(body.data.permitted).toBe(ENGINE_INPUT_LIMITS.channelMixDims);
    // Frame + environment, so the two figures are never read as platform constants.
    expect(body.data.frame).toBe('request_body_at_admission');
    expect(typeof body.data.environment).toBe('string');
  });

  it('refuses an over-cap rows array separately from dims — the two caps are not one cap', async () => {
    const over = ENGINE_INPUT_LIMITS.channelMixRows + 1;
    const res = await post(CHANNEL_MIX, { dims: dimsOf(3), rows: rowsOf(over) });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Refusal;
    expect(body.code).toBe('ENGINE_INPUT_OVER_CAP');
    expect(body.data.field).toBe('rows');
    expect(body.data.observed).toBe(over);
    expect(body.data.permitted).toBe(ENGINE_INPUT_LIMITS.channelMixRows);
  });

  it('THE ENGINE PROVABLY DID NOT RUN: the refusal body carries no scorecard', async () => {
    // The structural stand-in for "it was fast". A 200 from this route always carries
    // `data.dimensions`, `data.rows` and `data.sensitivity` — the sensitivity scan IS the
    // expensive part, so its absence is the evidence the scan was never entered.
    const res = await post(CHANNEL_MIX, { dims: dimsOf(200), rows: rowsOf(200) });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Refusal & { data: Record<string, unknown> };
    expect(Object.keys(body.data).sort()).toEqual(
      ['environment', 'field', 'frame', 'observed', 'permitted', 'rule'].sort(),
    );
    expect(body.data.sensitivity).toBeUndefined();
    expect(body.data.dimensions).toBeUndefined();
  });

  it('stays responsive: the process answers /health and a normal engine call right after the refusal', async () => {
    // 200 dims × 200 rows is the body the finding measured at 80-102 s of blocked thread.
    // No clock is read here — the point is that the next two requests are SERVED, which a
    // blocked single-threaded process could not do while the scan was running.
    const refused = await post(CHANNEL_MIX, { dims: dimsOf(200), rows: rowsOf(200) });
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as Refusal).code).toBe('ENGINE_INPUT_OVER_CAP');

    expect((await app.request('/health')).status).toBe(200);
    const normal = await post(CHANNEL_MIX, {});
    expect(normal.status).toBe(200);
  });

  it('refuses an over-cap quest-cac channels array with the same stable code', async () => {
    const over = ENGINE_INPUT_LIMITS.questCacChannels + 1;
    const channels = Array.from({ length: over }, (_, i) => ({ channelId: `c${i}`, label: `C${i}`, budgetUsd: 1000, cacUsd: 40 }));
    const res = await post(QUEST_CAC, { channels });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Refusal;
    expect(body.code).toBe('ENGINE_INPUT_OVER_CAP');
    expect(body.data.field).toBe('channels');
    expect(body.data.observed).toBe(over);
  });

  /* ══ 3. MALFORMED IS A 400, NOT A 500 ══════════════════════════════════════ */

  it('a non-array `channels` is 400 ENGINE_INPUT_NOT_ARRAY, not the TypeError-500 it used to be', async () => {
    const res = await post(QUEST_CAC, { channels: 5 });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Refusal;
    expect(body.code).toBe('ENGINE_INPUT_NOT_ARRAY');
    expect(body.data.observed).toBe('number');
    expect(body.data.permitted).toBe('array');
  });

  it('a non-object ELEMENT is 400, on every one of the three collections', async () => {
    const cases: Array<[string, unknown, string]> = [
      [QUEST_CAC, { channels: [5] }, 'channels[0]'],
      [CHANNEL_MIX, { rows: [5] }, 'rows[0]'],
      [CHANNEL_MIX, { dims: [5] }, 'dims[0]'],
    ];
    for (const [path, body, field] of cases) {
      const res = await post(path, body);
      expect(res.status, field).toBe(400);
      const j = (await res.json()) as Refusal;
      expect(j.code, field).toBe('ENGINE_INPUT_ELEMENT_MALFORMED');
      expect(j.data.field, field).toBe(field);
    }
  });

  it('a row with no `scores` object is 400, not the unguarded `r.scores[d.key]` TypeError', async () => {
    const res = await post(CHANNEL_MIX, { rows: [{ subjectId: 'a', subjectLabel: 'A' }] });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Refusal;
    expect(body.code).toBe('ENGINE_INPUT_ELEMENT_MALFORMED');
    expect(body.data.field).toBe('rows[0].scores');
    expect(body.data.observed).toBe('absent');
  });

  it('refuses `locked: "false"` rather than coercing a string into a compliance lock', async () => {
    // `questCacSim` filters on `!c.locked`, so the STRING "false" is truthy and would drop
    // the channel out of the simulation — a smaller funded book, silently, with no reason
    // given. An inference is never laundered into a certainty.
    const res = await post(QUEST_CAC, {
      channels: [{ channelId: 'g', label: 'G', budgetUsd: 100, cacUsd: 40, locked: 'false' }],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Refusal;
    expect(body.code).toBe('ENGINE_INPUT_ELEMENT_MALFORMED');
    expect(body.data.field).toBe('channels[0].locked');
    expect(body.data.permitted).toBe('a boolean');
  });

  it('a NaN score is refused rather than silently becoming a number the matrix ranks on', async () => {
    const res = await post(CHANNEL_MIX, {
      rows: [{ subjectId: 'a', subjectLabel: 'A', scores: { reach: 'lots' } }],
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as Refusal).data.field).toBe('rows[0].scores.reach');
  });

  /* ══ 4. THREE STATES, NEVER COLLAPSED ══════════════════════════════════════ */

  it('distinguishes NOT SUPPLIED (compiled default) from GENUINELY EMPTY (refused)', async () => {
    // Absent → the route's stated default, echoed back so the frame is visible.
    const absent = await post(CHANNEL_MIX, {});
    expect(absent.status).toBe(200);
    const served = (await absent.json()) as { data: { dimensions: unknown[] } };
    expect(served.data.dimensions.length).toBeGreaterThan(0);

    // Supplied-and-empty → a caller asserting "there are no dimensions". That is a
    // different sentence from "I did not send any", and it must not be quietly upgraded
    // into the platform's own numbers.
    const empty = await post(CHANNEL_MIX, { dims: [] });
    expect(empty.status).toBe(400);
    const body = (await empty.json()) as Refusal;
    expect(body.code).toBe('ENGINE_INPUT_EMPTY');
    expect(body.data.observed).toBe(0);
  });

  it('refuses an all-zero weight set instead of throwing `weights sum to zero` into a 500', async () => {
    const res = await post(CHANNEL_MIX, { weights: { reach: 0, agentDensity: 0, cost: 0, complianceRisk: 0, effort: 0 } });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Refusal;
    expect(body.code).toBe('ENGINE_INPUT_WEIGHTS_UNUSABLE');
    expect(body.data.permitted).toBe('> 0');
  });

  it('a literal `null` body is served from defaults, not a 500', async () => {
    // `c.req.json()` resolves to `null` for the body `null`; the old `.catch(() => ({}))`
    // covered only a PARSE failure, so `b.channels` was a TypeError on a valid JSON body.
    for (const path of [CHANNEL_MIX, QUEST_CAC]) {
      const res = await app.request(path, { method: 'POST', headers, body: 'null' });
      expect(res.status, path).toBe(200);
    }
  });

  /* ══ 5. THE BOUND IS INSIDE THE COMPARTMENT, NOT IN FRONT OF IT ════════════ */

  it('an unauthenticated over-cap body is refused by the gate, never by the bound', async () => {
    // Order matters: if the bound answered first it would be a pre-auth oracle for the
    // engine's shape. The compartment gate must still win.
    const res = await app.request(CHANNEL_MIX, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dims: dimsOf(200), rows: rowsOf(200) }),
    });
    expect(res.status).toBe(401);
  });
});
