import { test, expect, type Page } from '@playwright/test';

/**
 * The Phase 2 gate — NOT YET TRUSTWORTHY. Marked fixme deliberately; see below.
 *
 * STATUS: the mechanics work (navigation is driven, both paint and settle are
 * timed, cold and warm are compared, and the numbers looked good: warm paints
 * 13-31ms against a 200ms injected latency, with 0 API calls on the warm pass).
 * But the app CRASHES partway through under these generic stubs — the footer is
 * gone by the end of the run and the router's error screen has replaced the tree.
 * That makes the headline result unusable: a crashed tree also issues zero
 * requests, so "0 API calls on the warm pass" is exactly as consistent with "the
 * cache worked" as with "the app stopped working". Reporting it as proof would be
 * the precise self-deception this instrument exists to prevent.
 *
 * WHAT IT NEEDS: real response fixtures per endpoint, not shape-guesses. Each
 * surface fans out to many reads and a body of the wrong shape crashes the page
 * (MY DESK called .filter on an undefined block with `{ data: [] }`). Once
 * fixtures exist, remove the fixme and add an assertion that the footer is still
 * present after BOTH passes, so a crash fails loudly instead of reporting a
 * flattering number.
 *
 * WHAT IS ALREADY PROVEN WITHOUT THIS: the cache is covered end-to-end through
 * the real request() by src/lib/__tests__/requestCache.integration.test.ts (12
 * cases, fetch stubbed so network activity is directly observable), and the
 * /v1/projects improvement is measured against production directly (p50 334→292ms,
 * max 1923→447ms, stdev 464→79).
 *
 * ── original intent ──
 *
 * The claim being tested is specific: a surface the operator has ALREADY VISITED
 * must repaint in under 100ms, because it is served from local state rather than
 * from the network. That is only meaningful if the network is genuinely slow, so
 * every API call here is delayed by the latency we actually measured against
 * production — ~200ms, of which ~165-195ms is fixed infrastructure cost that
 * arrives before any query runs (an OPTIONS preflight that touches nothing costs
 * 193ms; the origin is GCP us-west1 behind Cloudflare). Without that delay the
 * test would pass on a fast stub and prove nothing.
 *
 * Cold is measured and REPORTED, not hidden behind a warm cache: a harness that
 * only reports the warm number is the same self-deception as measuring to a
 * skeleton instead of to the result.
 */

/** The measured production floor. Injected so "cached" has to actually mean it. */
const SERVER_LATENCY_MS = 200;

const BUDGET_PAINT_MS = 100;

/**
 * Surfaces that actually round-trip.
 *
 * Two deliberate exclusions, stated so this is not mistaken for full coverage:
 * - The REGULATORY workspace declares `apiPrefixes: []`, so its 14 pages already
 *   make zero API calls. Counting them would inflate the result with pages the
 *   cache never touched.
 * - `/` (MY DESK) fans out to ~15 endpoints on mount. Stubbing it faithfully
 *   needs a full fixture set; with generic stubs it renders a router error screen
 *   and the harness would silently be timing an error page. Better excluded and
 *   named than included and wrong.
 */
const SURFACES = ['/command-deck', '/bd-pipeline', '/distribution'];

/**
 * Stub every API call with a realistic delay, and count them so a "cache hit"
 * claim is checked against actual network activity rather than trusted.
 */
async function stubApi(page: Page): Promise<() => number> {
  let calls = 0;
  // Match on the API's own path shape, not on a host or an `/api` prefix. Two
  // traps this avoids: `**/api/**` also matches the app's OWN source modules
  // under src/lib/api/ in dev (stubbing those returns JSON for a module script
  // and the page renders nothing, which looks like a broken app rather than a
  // broken test); and .env.local points dev straight at http://localhost:8791,
  // so requests never carry an `/api` prefix at all.
  await page.route(/\/(v1|health)\b/, async (route) => {
    calls += 1;
    await new Promise((r) => setTimeout(r, SERVER_LATENCY_MS));
    const url = route.request().url();
    // Shapes matter more than they look like they should: this measures paint
    // latency, not content, but a body of the WRONG shape crashes the page and
    // the harness then measures an error screen. `{ data: [] }` for everything
    // made MY DESK call .filter on an undefined block.
    const meta = { timestamp: new Date().toISOString(), version: '0.1.0' };
    let body: unknown = { data: [], meta };
    if (url.includes('/health')) {
      body = { ok: true, service: 'stub', db: 'up' };
    } else if (url.includes('/me/desk')) {
      body = { data: { owner: 'nik', deals: [], monitorFires: [], commitments: [], decisions: [] }, meta };
    } else if (/\/v1\/(me|access\/me)\b/.test(url)) {
      const ws = ['command', 'sales', 'intel', 'regulatory', 'distribution', 'governance'];
      body = {
        data: {
          id: 'nik',
          role: 'approver',
          canApprove: true,
          member: { id: 'nik', name: 'Nik', email: 'nik@lcx.com', role: 'approver' },
          entitlements: Object.fromEntries(ws.map((w) => [w, 'approve'])),
        },
        meta,
      };
    } else if (/(deep|overview|cockpit)\b/.test(url)) {
      body = { data: {}, meta };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  return () => calls;
}

/**
 * Count in-flight requests inside the page, so the harness can wait for a
 * surface's data to actually ARRIVE rather than stopping the clock at whatever
 * painted first. Measuring to a skeleton would report a flattering number for a
 * surface that still feels slow — the exact failure this phase exists to remove.
 */
async function trackInFlight(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __inflight: number };
    w.__inflight = 0;
    const orig = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      w.__inflight += 1;
      try {
        return await orig(...args);
      } finally {
        w.__inflight -= 1;
      }
    };
  });
}

/** Sign in without the API: seed exactly what the app persists itself. */
async function signIn(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const email = 'nik@lcx.com';
    localStorage.setItem('lcx_operator_email', email);
    localStorage.setItem('lcx_desk_passcode', 'test#1234');
    // Operator identity is persisted operator-scoped (lib/persistence).
    localStorage.setItem(
      `lcx-os:${email}:operator:v1`,
      JSON.stringify({
        state: {
          operator: { id: 'nik', name: 'Nik', email, initials: 'N', role: 'approver', colorVar: 'var(--chart-1)' },
        },
        version: 3,
      }),
    );
  });
}

/**
 * Time a client-side navigation to the paint that shows the destination, using
 * the app's OWN instrument rather than a wall-clock guess — so the test measures
 * the same quantity the HUD and the SLO report do.
 */
interface NavTiming {
  /** Route commit → first paint. What "instant" feels like. */
  paint: number;
  /** Route commit → every read resolved and painted. What "correct" costs. */
  settle: number;
}

async function navigateAndMeasure(page: Page, to: string): Promise<NavTiming> {
  // Driven through the router rather than by clicking a sidebar link: link
  // presence varies with viewport and collapse state, and a missing selector
  // stalls for the whole action timeout. This measures the same transition a
  // click would — route commit through paint — without that coupling.
  return page.evaluate(
    (path) =>
      new Promise<NavTiming>((resolve) => {
        const w = window as unknown as { __inflight: number };
        const t0 = performance.now();
        let paint = 0;

        window.history.pushState({}, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));

        // Two frames is the same definition of "painted" the instrument uses
        // (lib/perf afterPaint): the first fires before the coming paint, the
        // second after it.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            paint = performance.now() - t0;
          }),
        );

        // Settle = no requests in flight, held quiet briefly so a chained
        // second fetch cannot be mistaken for quiescence. Capped so a hung
        // request fails the test loudly instead of hanging it.
        const started = performance.now();
        let quietSince: number | null = null;
        const poll = () => {
          const now = performance.now();
          if (w.__inflight === 0) {
            if (quietSince === null) quietSince = now;
            if (now - quietSince >= 120) {
              requestAnimationFrame(() =>
                requestAnimationFrame(() =>
                  resolve({ paint, settle: performance.now() - t0 }),
                ),
              );
              return;
            }
          } else {
            quietSince = null;
          }
          if (now - started > 15_000) {
            resolve({ paint, settle: performance.now() - t0 });
            return;
          }
          setTimeout(poll, 16);
        };
        poll();
      }),
    to,
  );
}

test.describe('speed floor', () => {
  // A cold pass pays the injected 200ms on every read across four surfaces.
  test.setTimeout(90_000);

  // Unskip once real fixtures exist — see the file header.
  test.fixme('a revisited surface repaints under budget, and cold is reported not hidden', async ({
    page,
  }) => {
    const callCount = await stubApi(page);
    await trackInFlight(page);
    await signIn(page);

    await page.goto('/');
    await expect(page.locator('footer')).toBeVisible();

    // ── cold pass: every read must cross the (slow) network ──────────────────
    const cold: Record<string, NavTiming> = {};
    for (const s of SURFACES) cold[s] = await navigateAndMeasure(page, s);
    const coldCalls = callCount();

    // ── warm pass: the same surfaces, now cached ─────────────────────────────
    const warm: Record<string, NavTiming> = {};
    for (const s of SURFACES) warm[s] = await navigateAndMeasure(page, s);
    const warmCalls = callCount() - coldCalls;

    // Reported unconditionally so a regression is visible in CI output even when
    // the assertion still passes.
    const fmt = (m: Record<string, NavTiming>) =>
      Object.entries(m)
        .map(([k, v]) => `${k} paint=${v.paint.toFixed(0)} settle=${v.settle.toFixed(0)}`)
        .join('  ');
    console.log(`[speed floor] injected server latency: ${SERVER_LATENCY_MS}ms`);
    console.log(`[speed floor] COLD  ${fmt(cold)}   (${coldCalls} API calls)`);
    console.log(`[speed floor] WARM  ${fmt(warm)}   (${warmCalls} API calls)`);

    // The gate: every revisited surface PAINTS inside the budget.
    for (const s of SURFACES) {
      expect(warm[s].paint, `${s} warm paint`).toBeLessThan(BUDGET_PAINT_MS);
    }

    // If these surfaces made no requests at all then the harness proved nothing
    // about the cache — fail loudly rather than report a flattering number.
    expect(coldCalls, 'cold pass must actually hit the network').toBeGreaterThan(0);

    // And it is genuinely local state doing the work: the warm pass must resolve
    // with strictly less network traffic than the cold one.
    expect(warmCalls, 'warm pass should reuse local state').toBeLessThan(coldCalls);

    // The HUD must publish BOTH numbers. Asserted here, where the footer is
    // already known present, rather than in a separate test with its own setup.
    // The paired shape is the anti-gaming guard: if `settle` were ever dropped,
    // the headline p95 would improve every time a read was moved to network-only
    // for governance reasons — rewarding the opposite of the goal.
    // A crash takes the footer with it, so this doubles as the health check that
    // stops a flattering number being reported from an error screen.
    await expect(page.locator('footer'), 'app must still be alive after both passes').toBeVisible();
    const hud = page.locator('footer span', { hasText: /^UI \d+/ });
    await expect(hud).toBeVisible();
    const hudText = (await hud.textContent()) ?? '';
    console.log(`[speed floor] HUD reads: ${hudText}`);
    expect(hudText).toMatch(/^UI \d+\/\d+MS$/);
  });

});
