import { expect, test, type Page } from '@playwright/test';
import { takeSeat } from './seat';

/**
 * THE PER-PERSONA FIRST RUN, DRIVEN BY REAL KEYS (T1 #19).
 *
 * WHY THIS SPEC IS THE LOAD-BEARING TEST FOR THIS FEATURE. The unit tests prove the
 * engine advances on the right observation, and the component test proves ⌘K produces
 * one. Neither can see the two things the feature actually rests on:
 *
 *  1. That `?` and `f` — whose listeners live in `AppLayout`, not in the tour — really
 *     do move the tour on. In jsdom that would mean mounting the whole shell, which
 *     tests the shell.
 *  2. That the panel does not silence the grammar it teaches. `g <digit>` and `f` both
 *     bail out on `isOverlayOpen()`, so a tour registered on the dismiss stack would
 *     be dead weight — and the ONLY way to see that is to press `g 2` with the panel up
 *     and watch whether the route changes. That is this spec's first test.
 *
 * The entitlements are intercepted at the route level rather than seeded into a store:
 * the tour is generated from `/v1/access/me`, so serving a restricted principal is how
 * the "Sam is taught his compartments" claim gets checked against the real generation
 * path with the real store, the real gate and the real chunk load. CI has no API, which
 * is exactly why this interception is the whole fixture.
 */

const panel = '[aria-label="First run"]';
const manual = '[role="dialog"][aria-label="Manual"]';

/** A principal, served to the app's own access endpoint. */
async function seatWith(page: Page, entitlements: Record<string, string>, path = '/'): Promise<void> {
  await takeSeat(page);
  await page.route('**/v1/access/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        data: {
          memberId: 'e2e',
          role: 'approver',
          entitlements,
          profile: null,
          // The switcher's metadata. Only `id` matters to the tour — the steps are
          // generated from DESTINATIONS + the entitlement map, never from this list.
          workspaces: Object.keys(entitlements).map((id) => ({
            id,
            name: id,
            mission: '',
            icon: 'Command',
            defaultLanding: '/',
            sensitivity: 'standard',
          })),
          dbLive: false,
        },
      }),
    });
  });
  await page.goto(path);
  await expect(page.locator(panel)).toBeVisible({ timeout: 15_000 });
}

/**
 * Fetch the manual's chunk, then reload, before any walk begins.
 *
 * NOT PADDING, and worth recording because it cost a debugging round. The first run
 * that pressed `?` mid-walk got as far as "Done — Esc to come back" and then the panel
 * jumped back to step one; the trace shows a full-page navigation to `/` in between.
 * Vite's dev server pre-bundles a dependency the first time a lazily-imported module
 * asks for it and then forces a page reload, which resets the tour's progress — that is
 * component state, by design, because a first run is not a thing to resume. It is a
 * DEV-SERVER artefact and not app behaviour (the built bundle has no optimiser step),
 * but this suite runs against the dev server by design, so the walk has to start from a
 * warmed page. Reloading afterwards rather than continuing makes the starting state
 * deterministic instead of "wherever the reload left us".
 */
async function warmLazyChunks(page: Page): Promise<void> {
  await page.keyboard.press('?');
  await expect(page.locator(manual)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator(manual)).toBeHidden();
  await page.reload();
  await expect(page.locator(panel)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(panel)).toContainText(/find anything/i);
}

const ALL = {
  command: 'approve',
  sales: 'approve',
  intel: 'approve',
  regulatory: 'approve',
  distribution: 'approve',
  governance: 'approve',
};

test.describe('the first run', () => {
  test('the panel does not silence the grammar it teaches', async ({ page }) => {
    /*
     * THE ONE THAT COULD ONLY BE CAUGHT HERE. If this panel registered with
     * `useDismissible` — the house rule for anything that takes over the screen — then
     * `isOverlayOpen()` would be true for as long as it was up, and `g 2` would do
     * nothing. Seven of the ten steps a fully entitled operator is shown are `g`
     * steps, so the tour would be teaching a shortcut it had itself disabled.
     */
    await seatWith(page, ALL);
    await warmLazyChunks(page);

    /*
     * The press is RETRIED, and the retry cannot hide the defect this test exists for.
     * If the panel were on the dismiss stack, `g 2` would never navigate no matter how
     * many times it was pressed — `stepGoGrammar` returns `GO_IDLE` on every key while
     * `isOverlayOpen()`. What the retry absorbs is the dev server dropping a keypress:
     * Vite reloads the page the first time it discovers a dependency, and a `g` lost in
     * that window would fail this test for a reason that has nothing to do with the app.
     */
    await expect
      .poll(
        async () => {
          await page.keyboard.press('g');
          await page.keyboard.press('2');
          await page.waitForTimeout(250);
          return new URL(page.url()).pathname;
        },
        { timeout: 20_000 },
      )
      .toBe('/bd-pipeline');

    // …and `f` is not silenced either: the hint layer arms with the panel on screen.
    await page.keyboard.press('f');
    await expect(page.locator('[data-hint-tag]').first()).toBeVisible();
  });

  test('⌘K, then ?, advance it — and nothing is clicked', async ({ page }) => {
    await seatWith(page, ALL, '/bd-pipeline');
    await warmLazyChunks(page);

    await page.keyboard.press('Meta+k');
    // Latched, and the panel now says how to get back rather than offering a Next.
    await expect(page.locator(panel)).toContainText(/done —/i);
    await expect(page.locator(panel)).toContainText(/find anything/i);

    await page.keyboard.press('Escape');
    await expect(page.locator(panel)).toContainText(/ask the app what you can do/i);

    // `?` — the manual's own key, owned by AppLayout, which is why this can only be
    // verified in a browser.
    await page.keyboard.press('?');
    await expect(page.locator(manual)).toBeVisible();
    await expect(page.locator(panel)).toContainText(/done —/i);
    // The panel stays legible above the manual, because this is the moment it is
    // telling the operator how to come back out.
    await expect(page.locator(panel)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator(panel)).toContainText(/go to us command/i);
  });

  test('a restricted principal is never shown a compartment they cannot open', async ({ page }) => {
    // Sam's shape: the BD desk only. Four steps — ⌘K, ?, SALES ENGINE, f, home — and
    // no mention anywhere of the five compartments he does not hold.
    await seatWith(page, { sales: 'operate' });
    await warmLazyChunks(page);

    await page.keyboard.press('Meta+k');
    await expect(page.locator(panel)).toContainText(/done —/i);
    await page.keyboard.press('Escape');
    await expect(page.locator(panel)).toContainText(/ask the app/i);

    /*
     * WAIT FOR THE MANUAL TO MOUNT BEFORE PRESSING ESCAPE, and this is a property of the
     * APP rather than of the test. The command line registers on the dismiss stack from
     * its EAGER shell (`useCommandPalette`), so ⌘K-then-Escape is safe at any speed. The
     * manual registers from inside its LAZY body (`Manual.tsx`), so an Escape pressed in
     * the load window finds an empty stack, is dropped, and the manual then mounts and
     * stays open. Without this wait the walk stalls here — which is exactly what the
     * first version of this spec did, and it cost a debugging round before I noticed the
     * stall was in the manual and not in the tour. `e2e/hints.spec.ts` measures the same
     * window for typed characters; this is the Escape-shaped version of it.
     */
    await page.keyboard.press('?');
    await expect(page.locator(manual)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(manual)).toBeHidden();

    await expect(page.locator(panel)).toContainText(/go to sales engine/i);
    for (const forbidden of ['DISTRIBUTION', 'GOVERNANCE', 'US COMMAND', 'REGULATORY', 'INTELLIGENCE']) {
      await expect(page.locator(panel)).not.toContainText(forbidden);
    }
  });

  test('skipping it is final — it does not come back on reload', async ({ page }) => {
    await seatWith(page, ALL);
    await page.getByRole('button', { name: /skip/i }).click();
    await expect(page.locator(panel)).toBeHidden();

    await page.reload();
    // A generous wait on purpose: the failure this guards is a panel that appears
    // LATE, after the entitlement fetch resolves, which a fast negative assertion
    // would miss entirely.
    await page.waitForTimeout(2_000);
    await expect(page.locator(panel)).toBeHidden();
  });

  test('an operator whose entitlements never arrive gets no tour, and keeps their first run', async ({ page }) => {
    // The API is down (CI's normal state) — so `me` stays null. A tour generated from
    // nothing would teach a restricted operator's app to whoever is sitting there.
    await takeSeat(page);
    await page.goto('/');
    await expect(page.getByText(/NOT LEGAL ADVICE/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(panel)).toBeHidden();

    // Nothing was recorded as settled, so the first run survives the outage.
    const settled = await page.evaluate(() =>
      localStorage.getItem('lcx-os:nik@lcx.com:teach:tour:v1'),
    );
    expect(settled, 'a failed entitlement load burned the operator’s first run').toBeNull();
  });
});
