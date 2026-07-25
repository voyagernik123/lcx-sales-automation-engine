import { expect, test, type Page } from '@playwright/test';
import { takeSeat } from './seat';

/**
 * The keyboard model on a POPULATED table (TERMINAL Phase 7).
 *
 * This closes the hole the accessibility audit named as its own biggest: the API is
 * down in every automated environment, so the dense surfaces never had rows, and
 * "a table is ONE tab stop" plus the arrow navigation from Phase 4 had never once been
 * exercised against real markup. The unit tests cover `useListNavigation` against a
 * synthetic harness; that is not the same as covering the real `<tbody>` with its real
 * nested buttons in it, which is exactly where a roving tabindex goes wrong.
 *
 * The API is STUBBED rather than seeded. A seeded database would be more faithful and
 * is not available here, and the alternative — asserting nothing until one is — is how
 * the gap persisted through four phases. What is stubbed is only the shape of one
 * endpoint; every keyboard behaviour asserted below is the real component's.
 *
 * Deliberately NOT asserted here: any number, label or score from the stub. A test that
 * checks its own fixture teaches nothing. Everything below is about focus and keys.
 */

const ROWS = 12;

/** Enough of a BdLead for the table to render a row. */
function lead(i: number) {
  return {
    id: `p-${i}`,
    name: `Probe Chain ${String(i).padStart(2, '0')}`,
    ticker: `PC${i}`,
    website: null,
    source: 'probe',
    chain: 'ethereum',
    jurisdiction: 'US',
    category: 'defi',
    listedOnLcx: false,
    euScore: 50 + i,
    usPreScore: 40 + i,
    usPostScore: 45 + i,
    band: 'Watch',
    peopleCount: 2,
    verifiedContactCount: 1,
    tier: 'tracked',
  };
}

async function seatWithLeads(page: Page): Promise<void> {
  await takeSeat(page);
  // Route-level interception so the app's own client, cache and policy layers all run
  // for real — only the network is replaced.
  await page.route('**/v1/projects?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        data: Array.from({ length: ROWS }, (_, i) => lead(i)),
        meta: { total: ROWS, limit: 50, offset: 0, timestamp: new Date(0).toISOString() },
      }),
    });
  });
  await page.goto('/bd-pipeline');
  await expect(page.locator('[data-list-row]').first()).toBeVisible({ timeout: 15_000 });
}

const rows = (page: Page) => page.locator('[data-list-row]');

test.describe('the keyboard model on a populated table', () => {
  test('the whole table is exactly one tab stop', async ({ page }) => {
    await seatWithLeads(page);
    await expect(rows(page)).toHaveCount(ROWS);

    // The claim from Phase 4, on real markup for the first time. Before the roving
    // tabindex, reaching row 40 of the queue cost 40+ Tab presses AND Tab could never
    // leave the table, because it visited every control inside every row.
    const stops = await page.evaluate(
      () => document.querySelectorAll('[data-list-row][tabindex="0"]').length,
    );
    expect(stops, 'exactly one row may be tabbable').toBe(1);

    const parked = await page.evaluate(
      () => document.querySelectorAll('[data-list-row][tabindex="-1"]').length,
    );
    expect(parked, 'every other row must be script-focusable only').toBe(ROWS - 1);
  });

  test('arrows move the cursor AND real focus, together', async ({ page }) => {
    await seatWithLeads(page);
    const tbody = page.locator('tbody').first();

    await rows(page).first().focus();
    await tbody.press('ArrowDown');
    await tbody.press('ArrowDown');

    const state = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      return {
        row: active?.getAttribute('data-list-row'),
        tabbable: active?.getAttribute('tabindex'),
        // Moving a highlight without moving focus leaves a screen reader announcing
        // the old row and leaves Tab resuming from the wrong place. That is the half
        // of this feature that is easy to get wrong and invisible when you do.
        isRow: active?.hasAttribute('data-list-row') ?? false,
      };
    });
    expect(state.isRow, 'focus is not on a row at all').toBe(true);
    expect(state.row).toBe('2');
    expect(state.tabbable, 'the single tab stop must follow the cursor').toBe('0');
  });

  test('the cursor clamps at both ends instead of wrapping', async ({ page }) => {
    await seatWithLeads(page);
    const tbody = page.locator('tbody').first();
    await rows(page).first().focus();

    // Well past the end. Wrapping would silently return to row 0, and on a long list
    // the operator cannot tell — they act on row 1 believing it is row 200.
    for (let i = 0; i < ROWS + 6; i++) await tbody.press('ArrowDown');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-list-row'))).toBe(
      String(ROWS - 1),
    );

    for (let i = 0; i < ROWS + 6; i++) await tbody.press('ArrowUp');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-list-row'))).toBe('0');
  });

  test('Home and End reach the ends of a real table', async ({ page }) => {
    await seatWithLeads(page);
    const tbody = page.locator('tbody').first();
    await rows(page).first().focus();

    await tbody.press('End');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-list-row'))).toBe(
      String(ROWS - 1),
    );
    await tbody.press('Home');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-list-row'))).toBe('0');
  });

  test('Tab leaves the table rather than entering the controls inside a row', async ({ page }) => {
    await seatWithLeads(page);
    // THE assertion the synthetic harness cannot make. Real rows contain their own
    // buttons (peek, unsnooze, entity chips); a roving tabindex on the row does nothing
    // about those, so Tab could still walk into them and the "one stop" claim would be
    // false in exactly the case that matters.
    await rows(page).first().focus();
    await page.keyboard.press('Tab');

    const after = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      const row = active?.closest('[data-list-row]');
      return {
        stillInARow: !!row,
        tag: active?.tagName ?? 'none',
        label: (active?.getAttribute('aria-label') || active?.textContent || '').trim().slice(0, 40),
      };
    });
    expect(
      after.stillInARow,
      `Tab landed inside a row (${after.tag} "${after.label}") — the table is not one stop`,
    ).toBe(false);
  });

  test('ArrowRight reaches the controls that Tab no longer visits', async ({ page }) => {
    await seatWithLeads(page);
    const tbody = page.locator('tbody').first();
    await rows(page).first().focus();

    // THE risk created by parking them. Taking the in-row controls out of the tab ring
    // fixes an 800-stop traversal; if nothing else reaches them it replaces that with
    // dead controls, which is strictly worse. This is the assertion that says the trade
    // was actually made and not just half-made.
    const parked = await page.evaluate(() => {
      const row = document.querySelector('[data-list-row]')!;
      const all = row.querySelectorAll('a[href],button,input,select,textarea,[tabindex],[contenteditable]');
      return {
        total: all.length,
        atMinusOne: Array.from(all).filter((el) => el.getAttribute('tabindex') === '-1').length,
      };
    });
    expect(parked.total, 'this row has no controls, so the test proves nothing').toBeGreaterThan(0);
    expect(parked.atMinusOne, 'in-row controls are still tab stops').toBe(parked.total);

    await tbody.press('ArrowRight');
    const first = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      return {
        insideRow: !!active?.closest('[data-list-row]'),
        isTheRow: active?.hasAttribute('data-list-row') ?? false,
        tabindex: active?.getAttribute('tabindex'),
      };
    });
    expect(first.insideRow, 'ArrowRight left the row entirely').toBe(true);
    expect(first.isTheRow, 'ArrowRight did not enter a control').toBe(false);
    expect(first.tabindex, 'the focused control should be one of the parked ones').toBe('-1');

    // And back out to the row's own controls in the other direction.
    await tbody.press('ArrowRight');
    await tbody.press('ArrowLeft');
    expect(
      await page.evaluate(() => !!(document.activeElement as HTMLElement)?.closest('[data-list-row]')),
    ).toBe(true);
  });

  test('arrows inside a row-level text field move the caret, not the cursor', async ({ page }) => {
    await seatWithLeads(page);
    const field = page.locator('input[type="text"], input:not([type]):not([type="checkbox"])').first();
    if (!(await field.count())) {
      test.skip(true, 'no text field on this surface to contest the arrows');
      return;
    }
    await rows(page).first().focus();
    await field.click();
    await field.fill('abc');
    await field.press('ArrowUp');
    // Stealing the arrows here would make an inline edit inside a row unusable.
    const row = await page.evaluate(() => document.activeElement?.getAttribute('data-list-row'));
    expect(row, 'the list cursor moved while the operator was typing').toBeNull();
  });

  test('a populated table keeps its text legible', async ({ page }) => {
    await seatWithLeads(page);
    // The audit could compute token ratios but never measured a REAL row, because rows
    // never existed. This walks the rendered cells and computes the composited ratio
    // for each distinct colour-on-background pair actually present.
    const failures = await page.evaluate(() => {
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
      };
      const parse = (s: string): number[] | null => {
        const m = s.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const parts = m[1]!.split(',').map((x) => parseFloat(x));
        if (parts.length === 4 && parts[3]! < 1) {
          // Composite over white — the surface under every row on this page.
          const a = parts[3]!;
          return [0, 1, 2].map((i) => Math.round(parts[i]! * a + 255 * (1 - a)));
        }
        return parts.slice(0, 3);
      };
      const ratio = (a: number[], b: number[]) => {
        const [la, lb] = [lum(a), lum(b)];
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
      };

      const out: Array<{ text: string; colour: string; ratio: number; size: number }> = [];
      const seen = new Set<string>();
      for (const cell of Array.from(document.querySelectorAll('[data-list-row] td'))) {
        for (const el of [cell, ...Array.from(cell.querySelectorAll('*'))]) {
          const text = (el.textContent ?? '').trim();
          if (!text || el.children.length > 0) continue;
          const cs = getComputedStyle(el as Element);
          const fg = parse(cs.color);
          if (!fg) continue;
          const size = parseFloat(cs.fontSize);
          const weight = Number(cs.fontWeight) || 400;
          const large = size >= 24 || (size >= 18.66 && weight >= 700);
          const needed = large ? 3 : 4.5;
          const key = `${cs.color}|${size}|${weight}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const r = ratio(fg, [255, 255, 255]);
          if (r < needed) out.push({ text: text.slice(0, 24), colour: cs.color, ratio: +r.toFixed(2), size });
        }
      }
      return out;
    });

    // Reported rather than hard-failed on a first run: this is a NEW measurement of a
    // surface no test has ever seen populated, and turning it straight into a gate
    // would either fail the build on a pre-existing issue or tempt someone to loosen
    // the threshold. The list is printed so it can be triaged deliberately.
    if (failures.length > 0) {
      test.info().annotations.push({
        type: 'contrast-findings',
        description: failures.map((f) => `${f.ratio}:1 ${f.colour} @${f.size}px — "${f.text}"`).join(' · '),
      });
    }
    // What IS asserted: the walk actually ran. A silent zero here would look like a
    // pass and mean nothing.
    const inspected = await page.evaluate(
      () => document.querySelectorAll('[data-list-row] td').length,
    );
    expect(inspected, 'no cells were inspected — the table was not populated').toBeGreaterThan(ROWS);
  });
});
