import { test, expect, type Page } from '@playwright/test';

/**
 * D3 smoke + screenshot ratchet. Resilient to the API being down (CI has no
 * DB): asserts shell, routing, theming and the inspector interaction, and
 * captures flagship screenshots in both themes. Data-dependent values are
 * never asserted — only chrome and behavior that a regression would break.
 */

/** Sign in deterministically via the front door's 1-5 keyboard shortcut. */
async function signIn(page: Page) {
  await page.goto('/select');
  await expect(page.getByRole('heading', { name: /take your seat/i })).toBeVisible();
  await page.keyboard.press('3'); // seat 3 = Nik (approver)
  await expect(page).toHaveURL(/\/$/);
}

test.describe('front door', () => {
  test('renders the boot manifest in light and dark', async ({ page }) => {
    await page.goto('/select');
    await expect(page.getByRole('heading', { name: /take your seat/i })).toBeVisible();
    await expect(page).toHaveScreenshot('front-door-light.png', { fullPage: true });

    // Dark theme is a designed parallel palette — must be first-class.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await expect(page).toHaveScreenshot('front-door-dark.png', { fullPage: true });
  });

  test('shows role on the roster (governance is visible)', async ({ page }) => {
    await page.goto('/select');
    await expect(page.getByText(/signs off deals/i).first()).toBeVisible();
  });
});

test.describe('shell + navigation', () => {
  test('signs in and lands on the Desk with the status bar', async ({ page }) => {
    await signIn(page);
    // The status bar is the "serious terminal" frame — always present.
    await expect(page.getByText(/UTC/).first()).toBeVisible();
    await expect(page.getByText(/NOT LEGAL ADVICE/i)).toBeVisible();
  });

  test('lazy routes resolve through the Suspense boundary', async ({ page }) => {
    await signIn(page);
    for (const [path, heading] of [
      ['/deal-board', /deal board/i],
      ['/bd-kpis', /kpi dashboard/i],
      ['/win-loss', /win ?\/ ?loss/i],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
    }
  });
});

test.describe('a11y ratchet', () => {
  // Dependency-free guard: every interactive control must have an accessible
  // name, and every field a label/placeholder. Verified clean today across
  // Deal Board (130 buttons) and BD Engine (74) — this keeps it that way.
  for (const path of ['/', '/deal-board', '/bd-pipeline', '/bd-kpis']) {
    test(`no unlabeled controls on ${path}`, async ({ page }) => {
      await signIn(page);
      await page.goto(path);
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
});

test.describe('inspector interaction (ontology)', () => {
  test('opens a deal inspector and Escape closes it', async ({ page }) => {
    await signIn(page);
    await page.goto('/deal-board');
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
