import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import { takeSeat } from './seat';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/**
 * The breakpoint and the reference width, READ OUT OF THE SOURCE rather than retyped —
 * following `e2e/hints.spec.ts`, which reads `HINT_CHIP_H` the same way and for the same
 * reason.
 *
 * This is a correction. The measurement below first hardcoded 1424, and when I lowered the
 * breakpoint to check the assertion bit, it stayed GREEN — because the spec was measuring a
 * width the source no longer used. A test that pins a constant it does not read is a test of
 * its own literal.
 */
function splitWidths(): { min: number; reference: number } {
  const src = readFileSync(join(SRC, 'lib', 'split.ts'), 'utf8');
  const ref = src.match(/REFERENCE_SURFACE_WIDTH = (\d+)/);
  const pane = src.match(/EVIDENCE_PANE_WIDTH = (\d+)/);
  expect(ref, 'REFERENCE_SURFACE_WIDTH is no longer a plain numeric literal in lib/split.ts').toBeTruthy();
  expect(pane, 'EVIDENCE_PANE_WIDTH is no longer a plain numeric literal in lib/split.ts').toBeTruthy();
  const reference = Number(ref![1]);
  const min = reference + Number(pane![1]);
  expect(
    /SPLIT_MIN_WIDTH = REFERENCE_SURFACE_WIDTH \+ EVIDENCE_PANE_WIDTH/.test(src),
    'SPLIT_MIN_WIDTH is no longer derived from the pane width, so this spec is measuring the wrong widths',
  ).toBe(true);
  return { min, reference };
}

/**
 * `⌘\` — the docked evidence pane, in a real browser (T1 #12).
 *
 * ── WHY THIS SPEC EXISTS AND THE UNIT TESTS ARE NOT ENOUGH ────────────────────
 *
 * Four of the claims below are UNTESTABLE in jsdom, and every one has a precedent in this
 * programme for shipping false:
 *
 *  1. THAT THE CHORD ARRIVES AT ALL. `lib/navGrammar.ts` records the measurement that killed
 *     ⌘1-9 in the webview: a real ⌘2 produces ZERO keydown events in Chrome, because the
 *     browser eats it for tab switching. A jsdom test dispatches its own KeyboardEvent and
 *     therefore proves nothing about whether a browser would ever deliver one. If ⌘\ is
 *     reserved too, this whole item is a dead binding that reads like a feature.
 *  2. THE BREAKPOINT. Whatever can be said about `SPLIT_MIN_WIDTH` has to be said against a
 *     real render — jsdom has no layout and every rect there is zero. Read the long note on
 *     the breakpoint test below before trusting it: it establishes less than its first two
 *     versions claimed, and says so.
 *  3. THAT THE PANE SITS BESIDE THE SURFACE RATHER THAN OVER IT. jsdom will happily assert the
 *     DOM order of a flex row it is not laying out. Whether the surface actually reflowed is a
 *     `boundingBox` question and only a browser answers it.
 *  4. THAT `f` STILL TAGS ANYTHING. The hint layer measures rects and z-indexes.
 *
 * THE API IS STUBBED, following `populated.spec.ts` for the same reason it does: the queue has
 * no rows without one, and the peek that fills this pane starts from a row. Only the network
 * is replaced — the client, the cache, the read policy and every keyboard path are the real
 * ones. Nothing here asserts a value from the fixture.
 */

const ROWS = 12;

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

async function seatWithLeads(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await takeSeat(page);
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

const pane = (page: Page) => page.locator('[data-evidence-pane]');

/** Dock by pressing the real chord — the press is half of what is being tested. */
async function dock(page: Page): Promise<void> {
  await page.keyboard.press('Meta+\\');
  await expect(pane(page), 'Meta+\\ produced no pane — is the chord reaching the page at all?').toBeVisible();
}

test.describe('⌘\\ docks the evidence beside the surface', () => {
  test('the chord reaches the webview, and the surface reflows instead of being covered', async ({ page }) => {
    await seatWithLeads(page, 1440);
    await expect(pane(page), 'the pane must not be docked by default').toHaveCount(0);
    const wide = (await page.locator('#main-content').boundingBox())!;

    await dock(page);

    const paneBox = (await pane(page).boundingBox())!;
    const narrowed = (await page.locator('#main-content').boundingBox())!;
    expect(narrowed.width, 'the surface did not narrow — the pane is painting over it').toBeLessThan(wide.width);
    expect(
      paneBox.x,
      `the pane overlaps the surface (pane x=${paneBox.x}, surface right=${narrowed.x + narrowed.width})`,
    ).toBeGreaterThanOrEqual(narrowed.x + narrowed.width - 1);

    // Chrome, not a dialog: three separate mechanisms in this app read that ARIA.
    await expect(pane(page)).not.toHaveAttribute('role', 'dialog');
    await expect(pane(page)).not.toHaveAttribute('aria-modal', 'true');

    await page.keyboard.press('Meta+\\');
    await expect(pane(page)).toHaveCount(0);
    expect((await page.locator('#main-content').boundingBox())!.width, 'undocking did not give the width back').toBe(
      wide.width,
    );
  });

  test('peeking a lead fills the pane WITHOUT moving focus off the row', async ({ page }) => {
    /*
     * THE MECHANIC, end to end, and the thing that makes docking worth a keyboard mode. The
     * drawer focuses itself on open — it must, it is modal — and that is what silenced the
     * triage keys. Here the operator presses Space, the evidence appears beside the table, and
     * the focus ring has not moved, so `j`/`k`/`s`/`d`/`e` are still theirs.
     */
    await seatWithLeads(page, 1440);
    await dock(page);

    const row = page.locator('[data-list-row]').first();
    await row.focus();
    await page.keyboard.press('Space');

    // The pane now holds the project, and there is no scrim over the table.
    await expect(pane(page).getByRole('heading')).toContainText(/PROJECT/i);
    await expect(page.locator('.fixed.inset-0'), 'a backdrop appeared — this is the drawer, docked').toHaveCount(0);

    expect(
      await page.evaluate(() => document.activeElement?.getAttribute('data-list-row')),
      'the pane stole focus from the row it was asked about',
    ).toBe('0');

    // And the keys are demonstrably still on the surface: `j` moves the cursor.
    await page.keyboard.press('j');
    await expect(page.locator('tr[aria-selected="true"]')).toHaveCount(1);
  });

  test('Escape does not close the pane, and the key that does is visible on it', async ({ page }) => {
    await seatWithLeads(page, 1440);
    await dock(page);
    await page.keyboard.press('Escape');
    await expect(
      pane(page),
      'Escape closed a pane that is deliberately not on the dismiss stack — see lib/split.ts',
    ).toBeVisible();

    // The trade is only acceptable because the operator can SEE the key that works.
    const undock = page.getByRole('button', { name: /undock the evidence pane/i });
    await expect(undock).toBeVisible();
    await undock.click();
    await expect(pane(page)).toHaveCount(0);
  });

  test('`f` still tags controls with the pane docked, in both panes', async ({ page }) => {
    /*
     * The hint layer's scope question, answered by measurement. The pane declares no dialog
     * role, so `resolveHintScope` returns PAGE scope and tags everything in view — the honest
     * answer for a split, because both panes are on screen and both are Tab-reachable, so a
     * chip on either can be trusted. The failure mode the scope work exists to prevent is a
     * chip on a control behind a backdrop, and there is no backdrop here.
     */
    await seatWithLeads(page, 1440);
    await dock(page);
    await page.locator('[data-list-row]').first().focus();
    await page.keyboard.press('Space');
    await expect(pane(page).getByRole('heading')).toContainText(/PROJECT/i);

    await page.keyboard.press('f');
    await expect(page.locator('[data-hint-tag]').first()).toBeVisible();
    /*
     * COUNTED PER PANE, which this test's NAME always claimed and its assertion did not — the
     * Phase F verifier caught it asserting only `total > 0`, which a layer that tagged the
     * table and ignored the pane entirely would have passed. Attribution is geometric because
     * the chips are absolutely-positioned siblings of neither container: a chip belongs to
     * whichever box its centre falls inside.
     */
    const counts = await page.evaluate(() => {
      const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
      const paneBox = box('[data-evidence-pane]');
      const mainBox = box('#main-content');
      const inside = (r: DOMRect, cx: number, cy: number) =>
        cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
      let inPane = 0;
      let inMain = 0;
      for (const t of Array.from(document.querySelectorAll('[data-hint-tag]'))) {
        const r = t.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (inside(paneBox, cx, cy)) inPane++;
        else if (inside(mainBox, cx, cy)) inMain++;
      }
      return { total: document.querySelectorAll('[data-hint-tag]').length, inPane, inMain };
    });
    expect(counts.total, 'the hint layer drew nothing with the pane docked').toBeGreaterThan(0);
    expect(counts.inMain, `no chip landed on the surface (${JSON.stringify(counts)})`).toBeGreaterThan(0);
    expect(
      counts.inPane,
      `no chip landed on the EVIDENCE PANE (${JSON.stringify(counts)}) — "in both panes" is the ` +
        `whole claim: the pane declares no dialog role precisely so \`f\` keeps page scope, and a ` +
        `chip the operator cannot get to the pane's controls with would make the docked mode ` +
        `mouse-only on one half of the screen`,
    ).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
  });
});

/**
 * How much of the lead table the operator can actually see: the CLIENT width of the queue's
 * own horizontal scroller.
 *
 * Measuring this rather than `#main-content` is the whole correction. My first version
 * asserted `#main-content` did not overflow, which can never happen — the queue nests its
 * table inside a `div.overflow-x-auto`, so the surface absorbs any narrowing by scrolling
 * INSIDE itself and the outer element's `scrollWidth` always equals its `clientWidth`. The
 * check could not fail. Measured: the table's natural width is 931px, so the visible
 * fraction is what the operator experiences and the only number worth comparing.
 */
async function queueViewport(page: Page): Promise<{ visible: number; table: number }> {
  return page.evaluate(() => {
    const table = document.querySelector('#main-content table') as HTMLElement | null;
    if (!table) throw new Error('no lead table rendered — the fixture did not load');
    let el: HTMLElement | null = table.parentElement;
    while (el && el.scrollWidth <= el.clientWidth) el = el.parentElement;
    // `el` is the scroller that is actually clipping the table; if nothing clips it the
    // table fits and its own width is the visible width.
    return { visible: el ? el.clientWidth : table.getBoundingClientRect().width, table: table.scrollWidth };
  });
}

test.describe('the breakpoint is a measurement, not a taste', () => {
  test('the pane cannot be widened without the breakpoint following it', async ({ page }) => {
    /*
     * WHAT THIS PROVES, AND — SAID FIRST, BECAUSE I GOT IT WRONG TWICE — WHAT IT DOES NOT.
     *
     * The bar for this breakpoint cannot be "the lead table fits beside the pane": that was
     * never true on this surface at any width an operator uses. MEASURED in Chromium against
     * the built app, the table's natural width is 931px and at a 1024 viewport the queue
     * already shows 768px of it, with no pane involved. The queue side-scrolls today.
     *
     * So the claim is comparative — docking must not leave the operator worse off than the app
     * already accepts — and `SPLIT_MIN_WIDTH` is derived as `REFERENCE_SURFACE_WIDTH + pane` so
     * the two measurements below come out EQUAL.
     *
     * WHICH MAKES THE EQUALITY SELF-CONSISTENT BY CONSTRUCTION. Verified: dropping the
     * reference width from 1024 to 880, and again to 620, left this GREEN both times, because
     * lowering it lowers both widths being compared. It therefore does NOT defend the choice of
     * 1024 — that is a judgement about the app (its own `lg` responsive stop, the width its
     * layouts are written against), not something this or any measurement establishes. I then
     * tried to add an absolute floor — "the Project and Priority columns must both be visible"
     * — and that was a second decoration: they are the two LEFTMOST columns, so narrowing from
     * the right cannot clip them, and it passed at a 620 reference too. It is deleted rather
     * than kept as reassurance.
     *
     * WHAT IT DOES PROVE, and it is the failure mode most likely to actually happen: the pane
     * cannot grow without the gate growing with it. Verified RED — widening
     * `EVIDENCE_PANE_WIDTH` to 560 while pinning the breakpoint fails here with "shows 608px
     * where the reference shows 768px". That is a real regression a future change would
     * otherwise make silently, on a laptop nobody runs this suite on.
     */
    const { min, reference: referenceWidth } = splitWidths();

    await seatWithLeads(page, referenceWidth);
    const reference = await queueViewport(page);
    expect(reference.table, 'the lead table got narrow enough to fit — re-derive the breakpoint').toBeGreaterThan(
      reference.visible,
    );

    await seatWithLeads(page, min);
    await dock(page);
    const docked = await queueViewport(page);

    expect(
      docked.visible,
      `docking at the breakpoint (${min}px) shows ${docked.visible}px of the queue where the app's ` +
        `own reference width (${referenceWidth}px, undocked) shows ${reference.visible}px — the operator ` +
        `is paying columns for the pane, which is what the gate exists to prevent`,
    ).toBeGreaterThanOrEqual(reference.visible);

    // And the document itself must never scroll sideways, which is the visible symptom of a
    // pane that does not fit at all.
    const doc = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(doc.scroll, 'the page scrolls horizontally with the pane docked').toBeLessThanOrEqual(doc.client + 1);
  });

  test('one notch below it the pane is ABSENT, and the drawer is what you get', async ({ page }) => {
    /*
     * Absent, not squeezed. A chord that silently toggles a preference with no visible effect
     * teaches the operator it is broken, so nothing renders and `lib/manual.ts` drops the line
     * (checked in evidenceDock.test.tsx). What remains is the drawer — what they had before
     * this item existed.
     */
    await seatWithLeads(page, splitWidths().min - 1);
    await page.keyboard.press('Meta+\\');
    await expect(
      pane(page),
      'the pane rendered below the breakpoint, where it leaves the surface unusable',
    ).toHaveCount(0);

    await page.locator('[data-list-row]').first().focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('dialog', { name: /project/i }), 'the drawer fallback is gone too').toBeVisible();
  });
});
