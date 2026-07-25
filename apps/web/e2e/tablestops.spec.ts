import { expect, test, type Page } from '@playwright/test';
import { takeSeat } from './seat';

/**
 * The three tables that were NOT one tab stop (T1 #11), in a real browser.
 *
 * `useListNavigation` shipped in Phase 4 with one consumer. Product intelligence,
 * competition and the registry ledger each hard-coded `tabIndex={0}` on every row, which
 * is two defects rather than an inconsistency: reaching row 40 costs 40+ Tab presses, and
 * Tab can never leave the table because every row ahead of you is a stop.
 *
 * WHY THIS SPEC EXISTS ALONGSIDE THE UNIT TEST. The unit test
 * (`src/components/__tests__/listNavAdoption.test.tsx`) carries the load: all three
 * surfaces read STATIC data from `@/data`, so a rendered component test sees 52 / 26 / 8
 * real rows with no API, which is the populated condition the original claim was false
 * in. It counts the tab stops the browser would build its ring from. What it CANNOT do is
 * press Tab — jsdom does not move focus for it. So exactly one thing is asserted here and
 * it is the thing only a browser can say: pressing Tab on the cursor row LEAVES the
 * table. That was the trap, and it is not observable anywhere else.
 *
 * No data, label or number is asserted. Populating these tables needs no API, so unlike
 * populated.spec.ts nothing here is stubbed.
 */

const SURFACES = [
  { name: 'product intelligence', path: '/product-intel' },
  { name: 'competition', path: '/competition' },
  { name: 'registry ledger', path: '/products' },
];

async function open(page: Page, path: string): Promise<void> {
  await takeSeat(page);
  await page.goto(path);
  await expect(page.locator('[data-list-row]').first()).toBeVisible();
}

for (const surface of SURFACES) {
  test(`${surface.name}: Tab leaves the table instead of walking its rows`, async ({ page }) => {
    await open(page, surface.path);

    const rows = page.locator('[data-list-row]');
    const count = await rows.count();
    // Guard against a green run that proves nothing: with one row, "one stop" is true
    // by accident and the trap could not show up.
    expect(count, 'not enough rows for the traversal to have been a problem').toBeGreaterThan(3);

    // The Tab press first, and the tab-stop count after it. Ordered that way on purpose:
    // if the rows go back to hard-coded tabIndex={0}, the failure an operator would
    // recognise is "Tab landed on another row", and a count assertion in front of it
    // would shadow that message with an arithmetic one.
    await rows.first().focus();
    await page.keyboard.press('Tab');

    const landed = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      return {
        insideTheTable: !!active?.closest('tbody'),
        tag: active?.tagName ?? 'none',
        label: (active?.getAttribute('aria-label') || active?.textContent || '').trim().slice(0, 40),
      };
    });
    expect(
      landed.insideTheTable,
      `Tab stayed in the table (${landed.tag} "${landed.label}") — the operator is trapped in it`,
    ).toBe(false);

    const stops = await page.locator('[data-list-row][tabindex="0"]').count();
    expect(stops, 'more than one row is a tab stop — the roving tabindex is not roving').toBe(1);
  });

  test(`${surface.name}: the arrows move the cursor inside it`, async ({ page }) => {
    await open(page, surface.path);
    const rows = page.locator('[data-list-row]');
    await rows.first().focus();

    await page.keyboard.press('ArrowDown');
    await expect(rows.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(rows.last()).toBeFocused();
    await page.keyboard.press('Home');
    await expect(rows.first()).toBeFocused();
    // Still one stop after all that movement.
    expect(await page.locator('[data-list-row][tabindex="0"]').count()).toBe(1);
  });
}

test('registry ledger: ⏎ on a drawer button activates the BUTTON, not the row', async ({ page }) => {
  // The registry ledger is the one of the three that is not a flat list: an expanded row
  // adds a SIBLING <tr> holding two real buttons, whose keystrokes bubble to the <tbody>
  // the hook listens on. This has to be a browser test, not a jsdom one: the failure is
  // that the hook's `preventDefault()` on ⏎ cancels the BUTTON's activation click, and
  // jsdom never dispatches that click in the first place, so it cannot see the bug.
  // Measured with the guard in ProductMatrix removed: the row toggle fired twice and this
  // navigation never happened at all.
  await open(page, '/products');
  const row = page.locator('[data-list-row]').first();
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(row).toHaveAttribute('aria-expanded', 'true');

  const drawerButton = page.locator('button', { hasText: 'Inspect Registry connections' }).first();
  await drawerButton.focus();
  await page.keyboard.press('Enter');
  await expect(page, 'the drawer button is dead to the keyboard').toHaveURL(/\/ontology\?focus=/);
});
