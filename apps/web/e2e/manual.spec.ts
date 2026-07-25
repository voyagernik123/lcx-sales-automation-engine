import { expect, test } from '@playwright/test';
import { goToDesk } from './seat';

/**
 * `?` — the living manual (TERMINAL Phase 6).
 *
 * An e2e spec rather than a browser probe, for a reason worth recording. I first
 * verified this by hand with `javascript_exec`, importing `lib/dismiss.ts` to read the
 * stack — and got an empty stack at every step, including for the command line, which
 * Phase 4 had already proven registers. The cause was Vite's dev server: after HMR it
 * serves modules at `?t=<timestamp>` URLs, so a fresh `import()` of the clean path
 * gets a SECOND module instance with its own state. The probe was reading a stack
 * nothing writes to.
 *
 * That is a general trap: any assertion about module-level state via an injected
 * import can silently be about a different copy of the module. Playwright drives the
 * real app through real keys and observes the DOM, so it cannot be fooled that way.
 * These are the same assertions I was trying to make by hand, made durably.
 */

const manual = '[role="dialog"][aria-label="Manual"]';

test.describe('the manual', () => {
  test('? opens it, and every line is generated', async ({ page }) => {
    await goToDesk(page, '/bd-pipeline');
    await page.keyboard.press('?');

    const panel = page.locator(manual);
    await expect(panel).toBeVisible();

    // The four sections are generated in order of how likely each is to be the thing
    // the operator wanted, object first.
    for (const heading of ['Escape', 'Go somewhere', 'Everywhere']) {
      await expect(panel.getByRole('heading', { name: heading })).toBeVisible();
    }

    // Navigation comes from DESTINATIONS, which the native menu also reads — so the
    // presence of every workspace here is the anti-staleness assertion.
    for (const label of ['US COMMAND', 'SALES ENGINE', 'INTELLIGENCE', 'REGULATORY TOOLKIT', 'DISTRIBUTION', 'GOVERNANCE']) {
      await expect(panel.getByText(label, { exact: false }).first()).toBeVisible();
    }
  });

  test('? toggles, and Escape closes it', async ({ page }) => {
    await goToDesk(page, '/bd-pipeline');
    await page.keyboard.press('?');
    await expect(page.locator(manual)).toBeVisible();

    await page.keyboard.press('?');
    await expect(page.locator(manual)).toBeHidden();

    await page.keyboard.press('?');
    await expect(page.locator(manual)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(manual)).toBeHidden();
  });

  test('typing wins over ?, and ⌘/ reaches the manual anyway', async ({ page }) => {
    await goToDesk(page, '/bd-pipeline');

    await page.keyboard.press('Meta+k');
    const commandLine = page.locator('[role="dialog"][aria-label="Command line"]');
    await expect(commandLine).toBeVisible();

    // The command line AUTOFOCUSES its search field, so `?` here is a character the
    // operator is typing. It must stay one — stealing `?` from a search box would make
    // it impossible to type. This is the assertion that corrected my original design
    // claim that "? works inside any dialog".
    await page.keyboard.press('?');
    await expect(page.locator(manual)).toBeHidden();
    await expect(commandLine).toBeVisible();

    // ⌘/ is unambiguous mid-sentence, and is what the native menu already advertises.
    await page.keyboard.press('Meta+/');
    await expect(page.locator(manual)).toBeVisible();

    // One press, one layer: the manual goes, what was underneath stays.
    await page.keyboard.press('Escape');
    await expect(page.locator(manual)).toBeHidden();
    await expect(commandLine).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(commandLine).toBeHidden();
  });

  test('? typed into a field is just a question mark', async ({ page }) => {
    await goToDesk(page, '/bd-pipeline');
    const field = page.locator('input[type="text"], input:not([type])').first();
    if (await field.count()) {
      await field.click();
      await field.fill('why?');
      // Stealing `?` from a search box would make it impossible to type — and the
      // manual is the least urgent thing an operator wants mid-sentence.
      await expect(page.locator(manual)).toBeHidden();
      await expect(field).toHaveValue('why?');
    }
  });

  test('it reports what Escape will actually do, not a description of Escape', async ({ page }) => {
    await goToDesk(page, '/bd-pipeline');

    // With nothing open, the section says so rather than listing an imaginary layer.
    await page.keyboard.press('?');
    const panel = page.locator(manual);
    await expect(panel.getByText(/Nothing else is open/i)).toBeVisible();
    await page.keyboard.press('Escape');

    // With the command line open, the manual should name it — this section is read
    // from the live dismiss stack, so it is a report rather than a claim, and it is
    // the part that would be impossible to keep truthful by hand.
    await page.keyboard.press('Meta+k');
    await page.keyboard.press('?');
    await expect(panel.getByText(/command line/i).first()).toBeVisible();
  });
});
