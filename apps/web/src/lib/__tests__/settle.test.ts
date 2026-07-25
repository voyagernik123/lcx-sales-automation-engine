/**
 * `ui_settle_p95` must not be a second copy of `ui_interaction_p95` (T1 #23).
 *
 * WHY THIS FILE EXISTS — the previous guard was a decoration, and it is worth
 * being exact about how.
 *
 * perf.test.ts has a block called "the anti-gaming invariant (why settle exists)".
 * It hand-writes both samples with `recordInteraction({ phase: 'paint' … })` and
 * `recordInteraction({ phase: 'settle' … })`, then asserts that paint improved and
 * settle did not. Every assertion in it passed on a tree where the shell registered
 * settle as a SECOND `afterPaint` callback back-to-back with paint — same frame,
 * same instant, two names for one number. The test could not fail, because it never
 * touched the code that decides WHEN settle stops. It pinned the arithmetic of the
 * report and called it the invariant.
 *
 * So this file tests the thing that was broken: the rule that produces a settle
 * timestamp. The ratchet below drives the real `settleWhenQuiet` against the real
 * `readCache` in-flight bookkeeping and asserts the property the two-metric SLO
 * exists for — move a read off the cache and PAINT GETS FASTER while SETTLE GETS
 * SLOWER. A settle wired to a second `afterPaint` fails it by ~200ms, and that is
 * demonstrated, not assumed: see "a second afterPaint cannot see the read at all".
 *
 * WHAT THESE TESTS CANNOT SEE, stated so nobody over-trusts them:
 * - No browser and no React. `afterPaint`'s two-rAF hop is elided; in a real
 *   browser it adds ~16-32ms to paint and to settle EQUALLY, so it moves both
 *   numbers and changes no difference asserted here.
 * - The shell's wiring is checked by reading AppLayout.tsx as text (last block).
 *   Corrected by the adversarial pass: this used to say "a watcher fed a probe that
 *   is always zero would read as correct", and that is not true — swapping the
 *   probe for `() => 0` fails `drives settle from the read layer going quiet`.
 *   The real residual gap is narrower and worth naming precisely: the block now
 *   pins the probe, the call site, the captured handle and the absence of window
 *   overrides, all as TEXT. A future surface that calls `beginInteraction` itself
 *   and settles it with a bad timestamp is outside every check here, and closing
 *   that needs AppLayout rendered under a router, which nothing in this repo does.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  afterPaint,
  beginInteraction,
  settleWhenQuiet,
  interactionStats,
  settleStats,
  bySurface,
  _resetPerf,
  SETTLE_QUIET_MS,
  SETTLE_TICK_MS,
} from '@/lib/perf';
import { coalesce, inFlightCount, _resetReadCache } from '@/lib/readCache';
import { isCacheable } from '@/lib/readPolicy';

/**
 * Short windows so the state machine can be driven in milliseconds. Real timers,
 * not fake ones: the whole subject is the relationship between a `performance.now()`
 * reading and a `setTimeout` schedule, and mocking one of the two would test the
 * mock. The tolerances below are therefore slack on the upper side (a loaded CI box
 * delays a timer) and TIGHT on the side where a bug would live.
 */
const QUIET = 40;
const TICK = 8;
const opts = { quietMs: QUIET, tickMs: TICK };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Wait for the settle sample to land, or fail loudly rather than hang. */
async function awaitSettle(): Promise<number> {
  await vi.waitFor(() => expect(settleStats().samples).toBe(1), { timeout: 5_000, interval: 5 });
  return settleStats().p95!;
}

describe('what settle measures', () => {
  beforeEach(() => {
    _resetPerf();
    _resetReadCache();
  });

  it('settles immediately when the read layer is already quiet — and does NOT charge the guard window', async () => {
    const i = beginInteraction('nav', '/cached');
    await sleep(20);
    const paint = i.paint({ cached: true });
    settleWhenQuiet(i, () => 0, opts);

    const settle = await awaitSettle();

    // A surface served entirely from local state waited for nothing, so settle is
    // paint. The number that matters here is the upper bound: the watcher must
    // confirm quiet for QUIET ms before recording, and if it recorded the moment
    // of CONFIRMATION rather than the moment quiet BEGAN, every settle in the app
    // would carry a permanent +QUIET surcharge. It records `quietSince`, so it
    // does not.
    expect(settle).toBeGreaterThanOrEqual(paint - 1);
    expect(settle).toBeLessThan(paint + QUIET);
  });

  it('waits for an outstanding read, so the number includes what the operator waited for', async () => {
    const READ_MS = 150;
    const i = beginInteraction('nav', '/network-only');

    // A real coalesced read, through the real in-flight map the app uses.
    void coalesce('/v1/access/matrix', () => sleep(READ_MS));

    const paint = i.paint({ cached: false }); // skeleton: the read has not returned
    settleWhenQuiet(i, inFlightCount, opts);

    const settle = await awaitSettle();

    // The operator waited for the read. Settle says so; paint did not.
    expect(settle).toBeGreaterThanOrEqual(READ_MS - TICK);
    expect(paint).toBeLessThan(READ_MS / 2);
  });

  it('records the instant quiet BEGAN, not the instant it was confirmed', async () => {
    // A deliberately huge guard window, so the two candidate answers are ~100ms
    // apart from ~500ms and no amount of timer slop can blur them. If the watcher
    // stopped the clock when it finished CONFIRMING quiet rather than when quiet
    // started, every settle in the app would carry a permanent +SETTLE_QUIET_MS
    // surcharge — a 120ms lie on a 600ms budget, applied to every surface.
    const BIG_QUIET = 400;
    const READ_MS = 100;

    const t0 = performance.now();
    const i = beginInteraction('nav', '/quiet-window');
    let resolvedAt = 0;
    void coalesce('slow', () => sleep(READ_MS)).then(() => {
      resolvedAt = performance.now();
    });
    i.paint();
    settleWhenQuiet(i, inFlightCount, { quietMs: BIG_QUIET, tickMs: TICK });

    const settle = await awaitSettle();
    const resolveElapsed = resolvedAt - t0;

    // Measured against the OBSERVED resolve instant, so a slow `sleep` cancels out
    // and only the poll granularity is left.
    expect(settle).toBeGreaterThanOrEqual(resolveElapsed - TICK - 2);
    expect(settle).toBeLessThan(resolveElapsed + BIG_QUIET / 2);
  });

  it('a chained read resets quiet, so one sample lands and it lands at the END', async () => {
    const i = beginInteraction('nav', '/chained');
    i.paint();
    settleWhenQuiet(i, inFlightCount, opts);

    // First read resolves at ~60ms; the surface then issues a dependent read that
    // resolves at ~140ms. A watcher that stopped at the first zero would report
    // ~60ms and call a half-loaded screen settled.
    void coalesce('a', () => sleep(60)).then(() => void coalesce('b', () => sleep(60)));

    const settle = await awaitSettle();
    expect(settle).toBeGreaterThanOrEqual(110);
    expect(settleStats().samples).toBe(1);
  });

  it('abandons rather than fabricates when a surface never goes quiet', async () => {
    const i = beginInteraction('nav', '/polling');
    i.paint();
    // A surface that polls: something is always in flight.
    settleWhenQuiet(i, () => 1, { ...opts, ceilingMs: 60 });

    await sleep(200);

    // No sample at all. Recording the ceiling would put a fabricated 10s reading
    // into the p95 of a surface that may be perfectly fast.
    expect(settleStats().samples).toBe(0);
    expect(interactionStats().samples).toBe(1);
  });

  it('records nothing when cancelled — we did not observe that surface settling', async () => {
    // The first version of this test cancelled a watcher whose probe was
    // permanently busy, then asserted no sample landed. It PASSED against a `stop()`
    // mutated to `stopped = false`, because a live watcher on a permanently-busy
    // probe also records nothing until the 10s ceiling. It proved nothing about
    // cancellation. So: the read goes quiet AFTER the cancel, which a live watcher
    // would happily record.
    const i = beginInteraction('nav', '/left-early');
    i.paint();

    let busy = 1;
    let probeCalls = 0;
    const probe = () => {
      probeCalls += 1;
      return busy;
    };
    const stop = settleWhenQuiet(i, probe, opts);
    const callsAtCancel = probeCalls;

    stop(); // the operator navigated away
    busy = 0; // …and only then did the surface's read return

    await sleep(QUIET * 4);

    // Nothing recorded: we cannot claim a settle for a surface nobody was looking at.
    expect(settleStats().samples).toBe(0);
    // And the loop is genuinely dead, not merely quiet — a cancelled watcher that
    // keeps polling leaks a timer per navigation for the life of the session.
    expect(probeCalls).toBe(callsAtCancel);
  });

  it('is floored at the paint, so a settle timestamp from before the paint is impossible', async () => {
    const i = beginInteraction('nav', '/floored');
    const before = performance.now();
    await sleep(40);
    const paint = i.paint();
    // A watcher observed quiet BEFORE the screen painted (all reads resolved during
    // the lazy-chunk fetch). A negative wait is not a thing an operator experiences.
    i.settle({ at: before });

    expect(settleStats().p95!).toBeGreaterThanOrEqual(paint - 1);
  });

  /**
   * The premise behind AppLayout's `cancelled` flag. `afterPaint` is two frames out,
   * so a fast navigation runs the effect's cleanup FIRST — at which point there is no
   * watcher yet to stop, and the callback would go on to start one for the route the
   * operator already left. This pins that the ordering is really that way; it does not
   * pin AppLayout's use of it, which would need the shell rendered under a router.
   * Stated in the comment there too, so the gap is visible from both ends.
   */
  it('afterPaint lands AFTER a synchronous cleanup, which is why the shell needs a cancelled flag', async () => {
    const order: string[] = [];
    afterPaint(() => order.push('paint-callback'));
    order.push('cleanup');
    await vi.waitFor(() => expect(order).toHaveLength(2), { timeout: 2_000, interval: 5 });
    expect(order).toEqual(['cleanup', 'paint-callback']);
  });

  it('is still idempotent — a watcher racing an explicit settle cannot double-count', async () => {
    const i = beginInteraction('nav', '/double');
    i.paint();
    settleWhenQuiet(i, () => 0, opts);
    i.settle();
    await sleep(QUIET * 3);
    expect(settleStats().samples).toBe(1);
  });

  /**
   * ADDED BY THE ADVERSARIAL PASS. Two mutations survived the whole file:
   *
   *   const quietMs = opts.quietMs ?? SETTLE_QUIET_MS;   →   ?? 800
   *   const tickMs  = opts.tickMs  ?? SETTLE_TICK_MS;    →   ?? 2000
   *
   * `Tests 40 passed (40)` both times. The drift guard below asserts
   * `SETTLE_QUIET_MS === 120`, which pins an exported number and says nothing
   * about whether the state machine uses it; and every behavioural case in this
   * file passes an explicit `quietMs`/`tickMs` so the defaults are never
   * exercised. That is the same defect class this file was written to replace —
   * pinning a value and calling it the wiring.
   *
   * The consequence is not cosmetic: with `?? 2000` the poll resolution becomes two
   * seconds, so every settle sample the SLO publishes is up to 2s late, and the
   * `ui_settle_p95` row goes red for a desk that is fine.
   */
  it('the machine actually USES the pinned defaults — not merely exports them', async () => {
    // The only externally visible evidence of which defaults are in force: on an
    // already-quiet probe the sample is recorded at ~0, but it cannot LAND until
    // quiet has been held for SETTLE_QUIET_MS, checked every SETTLE_TICK_MS. So
    // time the confirmation, with NO overrides — that omission is the whole test.
    const i = beginInteraction('nav', '/defaults');
    i.paint();
    const t0 = performance.now();
    settleWhenQuiet(i, () => 0);
    await awaitSettle();
    const confirmMs = performance.now() - t0;

    // Slack upward for a loaded box (a delayed timer only ever adds), tight enough
    // that a default several times the pinned one cannot hide inside it.
    expect(confirmMs).toBeGreaterThanOrEqual(SETTLE_QUIET_MS - SETTLE_TICK_MS);
    expect(confirmMs).toBeLessThan(SETTLE_QUIET_MS * 3);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * THE RATCHET.
 * ──────────────────────────────────────────────────────────────────────────── */

describe('THE INVARIANT: settle must get worse when a read moves off the cache', () => {
  beforeEach(() => {
    _resetPerf();
    _resetReadCache();
  });

  /** The measured production floor: a 204 preflight that touches nothing costs this. */
  const ROUND_TRIP_MS = 193;

  /**
   * One surface, two governance postures, measured the same way.
   *
   * BEFORE: the authoritative read is served from local state, so it is on the
   * paint path — the screen shows the real value and paint pays the cost.
   * AFTER: the same read is network-only (what gate inputs, entitlements and audit
   * surfaces require), so the surface paints a skeleton and the value arrives later.
   *
   * This is the distortion the two-metric SLO was built to catch, and the only
   * scenario that distinguishes a real settle from a copy of paint.
   */
  it('paint improves and settle worsens — the two numbers must disagree', async () => {
    // ── BEFORE: cached, so the value is on screen at first paint ───────────────
    const before = beginInteraction('nav', '/x');
    void coalesce('before', () => sleep(ROUND_TRIP_MS));
    await sleep(ROUND_TRIP_MS + 20); // the read is what the paint is waiting for
    const paintBefore = before.paint({ cached: true });
    settleWhenQuiet(before, inFlightCount, opts);
    const settleBefore = await awaitSettle();

    _resetPerf();
    _resetReadCache();

    // ── AFTER: network-only, so the surface paints a skeleton immediately ─────
    const after = beginInteraction('nav', '/x');
    void coalesce('after', () => sleep(ROUND_TRIP_MS));
    const paintAfter = after.paint({ cached: false });
    settleWhenQuiet(after, inFlightCount, opts);
    const settleAfter = await awaitSettle();

    // Reported unconditionally so the numbers are visible in CI output even when
    // the assertions pass.
    // eslint-disable-next-line no-console
    console.log(
      `[T1 #23] read on paint path: paint=${paintBefore.toFixed(0)}ms settle=${settleBefore}ms` +
        `  |  read moved network-only: paint=${paintAfter.toFixed(0)}ms settle=${settleAfter}ms`,
    );

    // Paint "improved" by the whole round trip — the dishonesty, reproduced.
    expect(paintAfter).toBeLessThan(paintBefore - ROUND_TRIP_MS / 2);

    // Settle did not, and THIS is the assertion that a second `afterPaint` fails.
    // A copy of paint would report ~paintAfter here, i.e. near zero.
    expect(settleAfter).toBeGreaterThanOrEqual(ROUND_TRIP_MS - TICK);
    expect(settleAfter - paintAfter).toBeGreaterThanOrEqual(ROUND_TRIP_MS * 0.8);
  });

  /**
   * The mutation, kept as a test rather than described in prose: this is exactly
   * what AppLayout did until T1 #23. It documents the failure so the ratchet above
   * cannot be quietly weakened into something the old wiring would also satisfy.
   */
  it('a second afterPaint cannot see the read at all — which is why it was a lie', async () => {
    const i = beginInteraction('nav', '/second-copy');
    void coalesce('slow', () => sleep(ROUND_TRIP_MS));

    // The old wiring: two callbacks in the same frame.
    const paint = i.paint({ cached: false });
    const settle = i.settle({ cached: false });

    expect(inFlightCount()).toBe(1); // a read is outstanding RIGHT NOW…
    expect(Math.abs(settle - paint)).toBeLessThan(5); // …and settle did not notice.

    const row = bySurface()[0];
    // Two metrics, one number: the SLO published a pair that could not disagree.
    expect(row.settleP95).toBe(row.paintP95);

    await sleep(ROUND_TRIP_MS + 20);
  });

  it('the published defaults are the ones the e2e harness uses, so they cannot drift', () => {
    // e2e/speedfloor.spec.ts made the same judgement with the same constants.
    expect(SETTLE_QUIET_MS).toBe(120);
    expect(SETTLE_TICK_MS).toBe(16);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Measured, end-to-end through the real request().
 * ──────────────────────────────────────────────────────────────────────────── */

describe('measured through the real request(), three surfaces, cold and warm', () => {
  const ROUND_TRIP_MS = 193;

  /**
   * Three surfaces whose read policies genuinely differ, so the table shows the
   * distortion rather than three copies of one case. Paths are real and their
   * cacheability is decided by the real lib/readPolicy — NOT by an assumption
   * here. The first draft of this test assumed /v1/deals/board was cacheable; it
   * is absent from the allowlist and readPolicy is deny-by-default, so the
   * assertion was wrong and the measurement was right. Deriving the expectation
   * from `isCacheable` is what stops that happening again when the policy moves.
   */
  const SURFACES: Array<{ name: string; reads: string[] }> = [
    // Mixed by DENY-BY-DEFAULT: /v1/projects is on the allowlist, /v1/deals/board
    // is not, so it is `never` and this surface round-trips on every visit.
    { name: '/bd-pipeline', reads: ['/v1/projects', '/v1/deals/board'] },
    // Mixed by GOVERNANCE: /v1/access/* is on the never-cache list because a stale
    // entitlement matrix causes a wrong grant. The case the two-metric design
    // exists for.
    { name: '/command-deck', reads: ['/v1/command/overview', '/v1/access/matrix'] },
    // Fan-out, every read cacheable — warm should cost nothing.
    { name: '/distribution', reads: ['/v1/distribution/deep', '/v1/kpis', '/v1/projects?scope=us'] },
  ];

  let fetchCalls = 0;

  beforeEach(() => {
    fetchCalls = 0;
    localStorage.clear();
    localStorage.setItem('lcx_operator_email', 'nik@lcx.com');
    localStorage.setItem('lcx_desk_passcode', 'test#1234');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        fetchCalls += 1;
        // Every request pays the latency we actually measured against production.
        // Without it the harness would pass on a fast stub and prove nothing.
        await sleep(ROUND_TRIP_MS);
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
          text: async () => JSON.stringify({ data: [], meta: {} }),
        } as unknown as Response;
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('reports paint and settle per surface, cold then warm', async () => {
    vi.resetModules();
    const api = await import('@/lib/apiClient');
    const cache = await import('@/lib/readCache');
    const perf = await import('@/lib/perf');
    cache._resetReadCache();
    perf._resetPerf();

    /** One navigation, instrumented the way the shell instruments one. */
    async function visit(surface: { name: string; reads: string[] }) {
      const i = perf.beginInteraction('nav', surface.name);
      const tally = perf.readTally();
      for (const p of surface.reads) void api.request(p).catch(() => {});
      // Stand in for the first paint: microtasks have run, so a read served from
      // local state is already on screen and a network read is not.
      await sleep(0);
      const paint = i.paint({ cached: perf.readTally().misses === tally.misses });
      perf.settleWhenQuiet(i, cache.inFlightCount, {
        cached: () => perf.readTally().misses === tally.misses,
        ...opts,
      });
      await vi.waitFor(
        () => expect(perf.settleStats().samples).toBeGreaterThan(0),
        { timeout: 8_000, interval: 5 },
      );
      const settle = perf.settleStats().p95!;
      perf._resetPerf();
      return { paint: Math.round(paint), settle };
    }

    const cold: Record<string, { paint: number; settle: number }> = {};
    for (const s of SURFACES) cold[s.name] = await visit(s);
    const coldCalls = fetchCalls;

    const warm: Record<string, { paint: number; settle: number }> = {};
    for (const s of SURFACES) warm[s.name] = await visit(s);
    const warmCalls = fetchCalls - coldCalls;

    /** Decided by the real policy, not by this file's opinion of it. */
    const networkOnly = (s: { reads: string[] }) => s.reads.filter((p) => !isCacheable(p));

    const fmt = (m: typeof cold) =>
      SURFACES.map((s) => `${s.name} paint=${m[s.name].paint} settle=${m[s.name].settle}`).join('  ');
    // eslint-disable-next-line no-console
    console.log(`[T1 #23] injected round trip: ${ROUND_TRIP_MS}ms (measured prod preflight)`);
    // eslint-disable-next-line no-console
    console.log(`[T1 #23] COLD  ${fmt(cold)}   (${coldCalls} fetches)`);
    // eslint-disable-next-line no-console
    console.log(`[T1 #23] WARM  ${fmt(warm)}   (${warmCalls} fetches)`);
    for (const s of SURFACES) {
      // eslint-disable-next-line no-console
      console.log(`[T1 #23] ${s.name} never-cacheable reads: ${JSON.stringify(networkOnly(s))}`);
    }

    // The harness has to actually have hit the network, or it proved nothing.
    expect(coldCalls).toBeGreaterThan(0);
    // And the three surfaces have to actually span both policies, or the warm
    // branch below is only ever one case wearing two hats.
    expect(SURFACES.filter((s) => networkOnly(s).length === 0).length).toBeGreaterThan(0);
    expect(SURFACES.filter((s) => networkOnly(s).length > 0).length).toBeGreaterThan(0);

    // Cold: every surface paints a skeleton fast and settles a round trip later.
    for (const s of SURFACES) {
      expect(cold[s.name].settle, `${s.name} cold settle`).toBeGreaterThanOrEqual(
        ROUND_TRIP_MS - TICK,
      );
      expect(
        cold[s.name].settle - cold[s.name].paint,
        `${s.name} cold settle must exceed paint`,
      ).toBeGreaterThanOrEqual(ROUND_TRIP_MS * 0.7);
    }

    // Warm is where the two metrics separate, and the rule is derived from policy:
    //  - every read cacheable  → settle collapses onto paint, nothing was waited for;
    //  - any read never-cacheable → the round trip is paid on EVERY visit, and
    //    settle is the only one of the two numbers that can see it. Paint stays
    //    flatteringly fast precisely because the read left the paint path.
    for (const s of SURFACES) {
      const gap = warm[s.name].settle - warm[s.name].paint;
      if (networkOnly(s).length === 0) {
        expect(gap, `${s.name} warm gap (all reads cacheable)`).toBeLessThan(QUIET);
      } else {
        expect(warm[s.name].settle, `${s.name} warm settle (has network-only read)`).toBeGreaterThanOrEqual(
          ROUND_TRIP_MS - TICK,
        );
        expect(gap, `${s.name} warm gap (has network-only read)`).toBeGreaterThanOrEqual(
          ROUND_TRIP_MS * 0.7,
        );
        // Paint on the warm pass is inside the 100ms budget while the operator
        // waited ~200ms. That gap IS the dishonesty a single-metric SLO publishes.
        expect(warm[s.name].paint, `${s.name} warm paint looks instant`).toBeLessThan(100);
      }
    }
    expect(warmCalls).toBeLessThan(coldCalls);
  }, 30_000);
});

/* ────────────────────────────────────────────────────────────────────────────
 * The shell is actually wired this way.
 * ──────────────────────────────────────────────────────────────────────────── */

describe('the shell measures settle with the watcher, not with a second afterPaint', () => {
  const APP_LAYOUT = join(__dirname, '..', '..', 'components', 'layout', 'AppLayout.tsx');
  const src = readFileSync(APP_LAYOUT, 'utf8');

  it('reads the real file', () => {
    expect(src).toContain('beginInteraction');
  });

  it('drives settle from the read layer going quiet', () => {
    expect(src).toContain('settleWhenQuiet(');
    // Fed the REAL probe. A watcher handed `() => 0` would settle at the paint and
    // reintroduce the defect while looking correct.
    expect(src).toMatch(/settleWhenQuiet\(\s*i,\s*inFlightCount\b/);
    expect(src).toContain("from '@/lib/readCache'");
  });

  it('never stops the settle clock on a paint', () => {
    // The exact defect: `afterPaint(() => i.settle(...))`.
    //
    // This assertion was written as /afterPaint\([^)]*\bsettle\b/ and it was
    // USELESS — `afterPaint(() =>` contains a `)` in the arrow's empty parameter
    // list, so `[^)]*` can never reach the `settle` two characters later. It
    // passed against the exact defect it names. Found by running the mutation,
    // which is the only reason it is not still in the tree looking correct.
    expect(src).not.toMatch(/afterPaint\([\s\S]{0,160}?\.settle\(/);
    // And more broadly, the shell must not call settle itself at all — the watcher
    // owns the timestamp, because only the watcher knows when quiet began.
    expect(src).not.toMatch(/\bi\.settle\(/);
  });

  it('registers exactly one paint callback, so there is no second clock', () => {
    // Two `afterPaint` calls in this effect IS the bug, in its original form.
    expect(src.match(/afterPaint\(/g) ?? []).toHaveLength(1);
  });

  it('stops the watcher when the operator navigates away', () => {
    // A watcher left running polls forever and attributes a settle to the surface
    // the operator already left.
    expect(src).toMatch(/stopSettleWatch\?\.\(\)/);
    // …and the handle is actually CAPTURED. Deleting just the `stopSettleWatch =`
    // left all five original checks in this block green — the call is still there,
    // the probe still matches, the cleanup still calls `stopSettleWatch?.()` — on
    // an `undefined` that stops nothing. Found by the adversarial pass, which is
    // the only reason the assertion above is not still standing alone looking
    // sufficient.
    expect(src).toMatch(/stopSettleWatch\s*=\s*settleWhenQuiet\(/);
  });

  /**
   * ADDED BY THE ADVERSARIAL PASS. Both mutations below kept every original check
   * in this block green (`Tests 18 passed (18)`), and both reintroduce the defect
   * the file is named after while holding the correct probe.
   */
  it('starts the watcher from INSIDE the paint callback, not from the effect body', () => {
    // Moving the call up into the effect body is not a cosmetic difference, and
    // perf.ts says why: on a route whose lazy chunk has not loaded, the effect body
    // runs while the Suspense fallback is on screen. No child has mounted, so no
    // read has been issued, so the probe reads zero and the watcher settles on a
    // skeleton — settle collapses back onto paint, with `inFlightCount` wired up
    // and everything looking right.
    const start = src.indexOf('afterPaint(');
    expect(start).toBeGreaterThan(-1);
    // End of the effect-level callback: the first close at the effect's indent.
    const end = src.indexOf('\n    });', start);
    expect(end).toBeGreaterThan(start);
    expect(src.slice(start, end)).toContain('settleWhenQuiet(');
  });

  it('does not restate the watcher timing windows in the shell', () => {
    // `ceilingMs: 0` smuggled into this options object makes the instrument record
    // NO settle sample ever, in production, while this file reports green — the
    // metric silently becomes absent rather than wrong, which is harder to notice
    // than the bug it replaced. `quietMs` and `tickMs` are as bad more quietly.
    // The windows are pinned constants in perf.ts; the shell has no business
    // having an opinion about them, and a surface that genuinely needs its own
    // window should arrive with a test that says so.
    expect(src).not.toMatch(/\b(quietMs|tickMs|ceilingMs)\s*:/);
  });
});
