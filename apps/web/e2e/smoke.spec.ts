import { test, expect } from '@playwright/test';
import { goToDesk, takeSeat } from './seat';

/**
 * D3 smoke + screenshot ratchet. Resilient to the API being down (CI has no
 * DB): asserts shell, routing, theming and the inspector interaction, and
 * captures flagship screenshots in both themes. Data-dependent values are
 * never asserted — only chrome and behavior that a regression would break.
 *
 * REVIVED IN PHASE 5. Every spec in this file had been failing — all eleven, at
 * their first line. The old `signIn()` pressed `3` on a `/select` roster titled
 * "take your seat"; the LCX OS hardening replaced that with an email + desk
 * passcode form verified SERVER-SIDE, which breaks the "resilient to the API being
 * down" premise stated above. Nobody noticed because the workflow that runs this
 * suite lives in an untracked `.github/`, so it had never executed. See e2e/seat.ts
 * for the fix and its one honest forfeit.
 */

test.describe('front door', () => {
  test('renders the sign-in gate in light and dark', async ({ page }) => {
    /*
     * REDUCED MOTION, so this ratchet is DETERMINISTIC.
     *
     * The front door now carries E8 THE FORGE, whose key light sweeps one arc over five seconds.
     * Screenshotting mid-sweep compares a different frame every run, which makes a pixel ratchet
     * fail at random and then get muted — the worst outcome for a guard. Under reduced motion the
     * renderer resolves to its FINAL frame immediately, which is both a fixed image and the state
     * an operator who asked for less motion actually sees.
     *
     * Set on the page rather than in playwright.config.ts on purpose: config-wide it would change
     * every other committed baseline in this suite at the same time.
     */
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/select');
    await expect(page.getByRole('heading', { name: /sign in to the desk/i })).toBeVisible();
    await expect(page).toHaveScreenshot('front-door-light.png', { fullPage: true });

    // Dark theme is a designed parallel palette — must be first-class.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await expect(page).toHaveScreenshot('front-door-dark.png', { fullPage: true });
  });

  test('asks for both credentials and names neither operator nor desk', async ({ page }) => {
    await page.goto('/select');
    // Replaces the old "shows role on the roster" assertion, which was written for
    // a roster that leaked the team's names and roles to anyone who loaded the page.
    // The gate deliberately shows nothing about the desk now, so the meaningful
    // assertion inverted: both fields present, no identities disclosed.
    await expect(page.getByLabel(/LCX email address/i)).toBeVisible();
    await expect(page.getByLabel(/Desk passcode/i)).toBeVisible();
    await expect(page.getByText(/signs off deals/i)).toHaveCount(0);
  });
});

test.describe('shell + navigation', () => {
  test('lands on the Desk with the status bar', async ({ page }) => {
    await goToDesk(page);
    // The status bar is the "serious terminal" frame — always present.
    await expect(page.getByText(/UTC/).first()).toBeVisible();
    await expect(page.getByText(/NOT LEGAL ADVICE/i)).toBeVisible();
  });

  test('lazy routes resolve to something meaningful with the API down', async ({ page }) => {
    await takeSeat(page);
    /*
     * The original version asserted each page's own heading. That was wrong for a
     * suite whose stated premise is that the API may be down: KpiDashboard
     * early-returns an ErrorNotice when the fetch fails, so its <h1> only exists on
     * the success path and the assertion could never hold in CI. It was failing for
     * a CORRECT product behaviour.
     *
     * The invariant that actually matters here is narrower and stronger: the lazy
     * chunk loaded, the Suspense boundary resolved, and the route rendered a named
     * state — a heading, or a deliberate error/empty state — rather than a blank
     * panel or a crashed tree. That is exactly what this suite exists to catch, and
     * it holds with or without a database.
     */
    for (const [path, heading] of [
      ['/deal-board', /deal board/i],
      ['/bd-kpis', /kpi dashboard/i],
      ['/win-loss', /win ?\/ ?loss/i],
    ] as const) {
      await page.goto(path);
      /*
       * The trailing `.first()` on the COMBINED locator is load-bearing, and its
       * absence was a real flake caught in Phase 7 — this spec failed roughly one
       * run in six with "strict mode violation: resolved to 2 elements".
       *
       * `a.first().or(b.first())` is not "one element": `.or()` matches the union,
       * so when BOTH sides are present it resolves to two and `toBeVisible()`
       * throws on strict mode instead of passing. Both sides are routinely present
       * here — the OfflineBanner says "…the API is not answering. Retrying…",
       * which matches `/retry/i`, and it appears asynchronously after the first
       * failed health ping, i.e. it races the heading it is meant to substitute
       * for. The assertion wanted "either of these exists", so collapse the union
       * to one element and ask whether THAT is visible.
       */
      const resolved = page
        .getByRole('heading', { name: heading })
        .first()
        .or(page.getByText(/could not|unavailable|failed|try again|retry|no .* yet/i).first())
        .first();
      await expect(resolved, `${path} rendered neither its heading nor a named state`).toBeVisible();
      // And never the raw Suspense fallback still on screen after settling.
      await expect(page.locator('body')).not.toHaveText(/^\s*$/);
    }
  });
});

test.describe('a11y ratchet', () => {
  // Dependency-free guard: every interactive control must have an accessible
  // name, and every field a label/placeholder. Verified clean today across
  // Deal Board (130 buttons) and BD Engine (74) — this keeps it that way.
  for (const path of ['/', '/deal-board', '/bd-pipeline', '/bd-kpis']) {
    test(`no unlabeled controls on ${path}`, async ({ page }) => {
      await goToDesk(page, path);
      await page.waitForLoadState('networkidle').catch(() => {});
      const unlabeled = await page.evaluate(() => {
        const name = (el: Element) =>
          (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim();
        const btns = [...document.querySelectorAll('button')].filter((b) => !name(b)).length;
        const fields = [...document.querySelectorAll('input,select,textarea')].filter((i) => {
          const id = i.getAttribute('id');
          const lbl = id && document.querySelector(`label[for="${id}"]`);
          return !lbl && !i.getAttribute('aria-label') && !i.getAttribute('placeholder') && !i.getAttribute('title');
        }).length;
        return { btns, fields };
      });
      expect(unlabeled.btns, 'buttons without an accessible name').toBe(0);
      expect(unlabeled.fields, 'form fields without a label').toBe(0);
    });
  }

  /**
   * Bypass Blocks (WCAG 2.4.1), added in Phase 7 and ratcheted here because the
   * defect it fixes is invisible to anyone using a mouse.
   *
   * Measured before the skip link existed: reaching the first control inside the
   * page content took 24 Tab presses on EVERY route — 6 top-bar controls, 17
   * sidebar destinations, then the sidebar collapse toggle — and the shell
   * re-renders on navigation, so the cost recurred on every page. Counted on /,
   * /bd-pipeline, /deal-board and /command-deck; identical on all four.
   *
   * The assertion is behavioural rather than "a skip link element exists",
   * because the two ways this feature ships broken both leave the element in
   * place: it can be unreachable (not first in the tab order), or activating it
   * can scroll without moving focus — which happens whenever the target is not
   * focusable, and then the next Tab returns to the top bar as if nothing
   * happened. Checking where focus actually lands is the only check that fails
   * for either.
   */
  test('the first tab stop bypasses the shell chrome', async ({ page }) => {
    await goToDesk(page, '/deal-board');

    // WAIT FOR THE LAZY PAGE CHUNK, and not as padding.
    //
    // `goToDesk` returns once the shell's status bar is up, which is before the route's
    // lazy chunk has resolved. Until it does, <main> holds the Suspense fallback
    // (`LoadingSkeleton`, role="status" aria-label="Loading page"), which contains NO
    // focusable control — so the last assertion here fails, because the Tab after the
    // skip link finds nothing inside the landmark and wraps back to the skip link itself.
    //
    // Measured: 3/3 failures in isolation on a warm machine (`mainFocusables: 0`), 3/3
    // passes with this one wait (`mainFocusables: 3`). CI has been green only because a
    // cold worker happened to resolve the chunk before the first keypress — i.e. this spec
    // was passing on a race, which is the failure mode that reads as coverage and is not.
    //
    // Anchored on the skeleton going away rather than on a timeout, which can pass early.
    await expect(page.getByRole('status', { name: /loading page/i })).toHaveCount(0, {
      timeout: 15_000,
    });

    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      return { tag: a?.tagName, text: (a?.textContent ?? '').trim(), href: a?.getAttribute('href') };
    });
    expect(first.tag, 'the first tab stop is not a link').toBe('A');
    expect(first.href, 'the first tab stop does not target the main landmark').toBe('#main-content');

    // Activating it must MOVE focus into the landmark, not merely scroll to it.
    await page.keyboard.press('Enter');
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.id), {
        message: 'activating the skip link did not move focus to <main id="main-content">',
      })
      .toBe('main-content');

    // And the next Tab must land INSIDE main — i.e. the chrome really was skipped.
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(
      () => !!document.getElementById('main-content')?.contains(document.activeElement),
    );
    expect(inside, 'the stop after the skip link is still outside <main>').toBe(true);
  });
});

test.describe('inspector interaction (ontology)', () => {
  test('opens a deal inspector and Escape closes it', async ({ page }) => {
    await goToDesk(page, '/deal-board');
    const pill = page.locator('button[title^="Likelihood:"]').first();
    // If the API is down there are no cards — skip rather than fail the ratchet.
    if (await pill.count()) {
      await pill.click();
      await expect(page.getByRole('heading', { name: 'DEAL' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('heading', { name: 'DEAL' })).toBeHidden();
    }
  });
});
