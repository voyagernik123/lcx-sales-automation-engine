import { expect, test } from '@playwright/test';
import { goToDesk } from './seat';

/**
 * The practice range, in a real browser (TERMINAL Phase 8, T1 #20).
 *
 * Three things live here because jsdom cannot see them, and NOT the things the two
 * unit suites already cover — a spec that re-asserts what a component test proved
 * is slower coverage of the same claim.
 *
 * 1. `g 7` actually navigates. `navGrammar.test.ts` proves the reducer returns the
 *    destination and `destinations.test.ts` proves the table agrees with the native
 *    menu, but neither presses a key in a browser, and the whole reason the `g`
 *    prefix exists is that ⌘1-9 are NEVER DELIVERED to a page — a fact that was
 *    only discovered by measuring in Chrome. A grammar that resolves correctly and
 *    is never invoked is the same defect wearing a different hat.
 *
 * 2. The hazard band renders. "Unmistakably not production inside one second" is a
 *    claim about pixels, and jsdom has no layout and no computed backgrounds. If
 *    Tailwind ever purges the surrounding classes or the inline gradient is
 *    dropped, the banner degrades to plain text and the one-second test quietly
 *    stops being met.
 *
 * 3. THE ISOLATION, OBSERVED AT THE NETWORK LAYER. The strongest form of the proof
 *    in this repo: Chromium's own request log, over a full drill including a
 *    refusal, an override and a completed write. The vitest suites stub the
 *    transports and walk the imports; this watches the socket. If any of the three
 *    were the only guard, the other two failure modes would be open.
 *
 *    WATCHED FAILING. `PracticeRange.run()` was given a real
 *    `void fetch(`/v1/actions/${action.id}/invoke`, { method: 'POST' })` and this
 *    spec went RED with the URLs named:
 *      "the practice range made governed writes: POST
 *       http://localhost:5173/v1/actions/command_decide/invoke, …" ×3
 *    Note that it fired even though the `beforeEach` route ABORTS those requests —
 *    `page.on('request')` sees the attempt, not the outcome, which is the correct
 *    thing to assert: the defect is that the sandbox tried.
 */

const API_WRITE = '/v1/actions/';

test.describe('the practice range', () => {
  /**
   * EVERY API CALL IS ABORTED AT THE NETWORK LAYER, for two reasons.
   *
   * The first is that it makes the isolation assertion stronger rather than
   * weaker: a sandbox that completes a full governed drill while the desk has no
   * API at all is a sandbox that demonstrably does not depend on one.
   *
   * The second is a PRE-EXISTING HAZARD IN `e2e/seat.ts` that this spec ran into
   * and that the suite's own comment gets wrong. `takeSeat` seeds
   * `lcx_desk_passcode = 'e2e-no-api'` on the stated assumption that "with no API
   * the requests fail either way". When an API IS reachable — as one is on this
   * machine, and as one would be in any CI job that starts it — that placeholder
   * is REJECTED: `GET /v1/access/me` returns 401, `apiClient.forceFrontDoor` fires
   * on any 401 that carried a credential, and the seat is cleared mid-test. I
   * watched it: two of these three specs failed with `<h1>Sign in to the desk</h1>
   * at /select`, and the third passed only by winning the race. That is reported as
   * a finding against `e2e/seat.ts` rather than fixed here — it is not this
   * phase's file, and it affects every spec in the suite, not this one.
   */
  test.beforeEach(async ({ page }) => {
    /*
     * MATCHED ON THE PATHNAME, and both of the obvious globs are wrong — each cost
     * a run to find, so both are recorded:
     *
     *  - `**​/api/**` also matches the dev server's own module URLs for
     *    `src/lib/api/*.ts`, so it aborted the app's SOURCE. React never mounted,
     *    there was no console error, and the blank page looked exactly like a
     *    broken feature.
     *  - `**​/api/v1/**` misses the API entirely whenever `VITE_API_URL` is set —
     *    which it is in `apps/web/.env.local` (`http://localhost:8791`), so the
     *    client builds absolute URLs and never goes through the `/api` proxy at
     *    all. The 401 kept arriving and the seat kept being cleared.
     *
     * `/v1/` in the pathname is true of both shapes and of neither module path.
     */
    await page.route(
      (url) => url.pathname.includes('/v1/'),
      (route) => route.abort(),
    );
  });

  test('g 7 goes there, and it says it is not production', async ({ page }) => {
    await goToDesk(page, '/bd-pipeline');

    await page.keyboard.press('g');
    await page.keyboard.press('7');

    await expect(page).toHaveURL(/\/practice$/);
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toHaveText(/PRACTICE RANGE — nothing here is real/);

    // The hazard band: a real computed background-image, not a class name that
    // happened to survive. `repeating-linear-gradient` is what makes it read as a
    // warning before anybody has read a word.
    const band = page.locator('[role="note"] [aria-hidden="true"]').first();
    await expect(band).toBeVisible();
    const image = await band.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(image).toContain('repeating-linear-gradient');
  });

  test('a full drill — refused, overridden, written — makes no governed write', async ({ page }) => {
    const writes: string[] = [];
    // Every request the tab makes, not just the ones we expect: the point is to
    // catch a door nobody thought of.
    page.on('request', (r) => {
      if (r.url().includes(API_WRITE)) writes.push(`${r.method()} ${r.url()}`);
    });

    await goToDesk(page, '/practice');

    // The gate this feature exists for. Sam and Monty will meet this one on a real
    // decision, and the refusal sentence is the useful part.
    await page.getByRole('button', { name: /Decide a gated decision/ }).click();
    await page.getByLabel(/^Chosen/).fill('Broker-dealer partnership');
    await page.getByRole('button', { name: 'Run it' }).click();
    await expect(page.getByText(/^\s*Refused —/)).toContainText('SAT_REQUIRED');
    await expect(page.getByText(/File the missing tradecraft, or override with a recorded reason\./)).toBeVisible();

    // The override alone is refused again — the lesson that a reason is not
    // paperwork.
    await page.getByRole('checkbox', { name: /Override sat/ }).check();
    await page.getByRole('button', { name: 'Run it' }).click();
    await expect(page.getByText(/^\s*Refused —/)).toContainText('OVERRIDE_REASON_REQUIRED');

    await page.getByLabel(/^Override reason/).fill('Board deadline; premortem booked for Thursday.');
    await page.getByRole('button', { name: 'Run it' }).click();
    await expect(page.getByText(/^\s*Written\./)).toBeVisible();

    // And the audit row it would have produced, attributed to the seat.
    await expect(page.getByText(/action:command_decide → command_decision\/practice-decision-1/)).toBeVisible();
    await expect(page.getByText(/by nik@lcx\.com/)).toBeVisible();

    expect(writes, `the practice range made governed writes: ${writes.join(', ')}`).toEqual([]);
  });

  test('Escape still belongs to the shell — the sandbox opens no overlay of its own', async ({ page }) => {
    // The page deliberately has no dialog, so `?` must still be the manual and
    // Escape must still close it. A teaching surface that broke the one Escape
    // owner would be teaching the wrong reflex.
    await goToDesk(page, '/practice');
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);

    await page.keyboard.press('?');
    const manual = page.locator('[role="dialog"][aria-label="Manual"]');
    await expect(manual).toBeVisible();
    // The manual is generated from DESTINATIONS, so the sandbox documents itself.
    await expect(manual.getByText('PRACTICE RANGE', { exact: false }).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(manual).toBeHidden();
  });
});
