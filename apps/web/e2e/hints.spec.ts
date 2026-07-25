import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { goToDesk, takeSeat } from './seat';

/**
 * `f` — the hint layer (TERMINAL Phase 7).
 *
 * WHY THIS SPEC IS THE LOAD-BEARING TEST FOR THIS FEATURE. The unit tests cover
 * arithmetic and the component test covers lifecycle, and neither can see the thing the
 * whole mechanic rests on: that a DOM query, run against the REAL shell, finds real
 * controls at real coordinates. jsdom has no layout, so every `getBoundingClientRect`
 * there is 0×0 and a test that ran the actual walk would find nothing and pass. That is
 * precisely how "a table is ONE tab stop" survived three phases as a false claim (see
 * e2e/populated.spec.ts) — the assertion existed, against a harness, and the real
 * markup was never looked at.
 *
 * Two of the tests below are MEASUREMENTS rather than assertions, annotated rather than
 * gated, and they are labelled as such: the in-viewport target density (which is what
 * decides whether a 12-letter alphabet is big enough) and the first-press latency of the
 * lazy chunk (which is the window in which a typed character can still reach the page).
 * Turning a first measurement straight into a threshold is how a number nobody
 * understands ends up being loosened later.
 */

// `import.meta.url`, not `__dirname`: apps/web is `"type": "module"`, so Playwright loads
// these specs as real ESM and `__dirname` is simply undefined there. Vitest papers over
// the difference in its own transform, which is why the unit tests next door can use it.
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');
const chips = '[data-hint-tag]';

/** The alphabet, read from the source so this spec cannot assert a stale value. */
function alphabet(): string {
  const src = readFileSync(join(SRC, 'lib', 'hints.ts'), 'utf8');
  const m = src.match(/HINT_ALPHABET = '([a-z]+)'/);
  expect(m, 'HINT_ALPHABET is no longer a plain string literal in lib/hints.ts').toBeTruthy();
  return m![1]!;
}

/** The chip-height constant, read the same way, so it can be pinned to the real chip. */
function chipHeight(): number {
  const src = readFileSync(join(SRC, 'lib', 'hints.ts'), 'utf8');
  const m = src.match(/HINT_CHIP_H = (\d+)/);
  expect(m, 'HINT_CHIP_H is no longer a plain numeric literal in lib/hints.ts').toBeTruthy();
  return Number(m![1]);
}

/**
 * Drop a button into the page whose activation we can count, and return the tag the
 * layer gave it.
 *
 * Identified BY POSITION, not by assuming it is last in document order. Document order
 * would work today — it is appended after `#root` — but it is an assumption about the
 * shell's markup rather than about this feature, and it would fail silently (some other
 * control's tag would be typed and something else would activate).
 */
async function probeTag(page: Page, at: { top: number; left: number }): Promise<string> {
  await page.evaluate((pos) => {
    const b = document.createElement('button');
    b.id = 'hint-probe';
    b.textContent = 'PROBE';
    b.style.cssText = `position:fixed;top:${pos.top}px;left:${pos.left}px;width:80px;height:24px;`;
    b.addEventListener('click', () => {
      const w = window as unknown as { __probeClicks?: number };
      w.__probeClicks = (w.__probeClicks ?? 0) + 1;
    });
    document.body.appendChild(b);
  }, at);

  await page.keyboard.press('f');
  await expect(page.locator(chips).first()).toBeVisible();

  const found = await page.evaluate((pos) => {
    const out: string[] = [];
    for (const chip of Array.from(document.querySelectorAll('[data-hint-tag]'))) {
      const r = chip.getBoundingClientRect();
      // Overlap resolution only ever pushes a chip DOWN, never sideways, so the left
      // edge is exact and the top is a small window.
      if (Math.abs(r.left - pos.left) < 1.5 && r.top >= pos.top - 1.5 && r.top < pos.top + 80) {
        out.push(chip.getAttribute('data-hint-tag')!);
      }
    }
    return out;
  }, at);

  expect(found, `expected exactly one chip at the probe, got ${found.length}`).toHaveLength(1);
  return found[0]!;
}

const probeClicks = (page: Page) =>
  page.evaluate(() => (window as unknown as { __probeClicks?: number }).__probeClicks ?? 0);

test.describe('the hint layer', () => {
  test('f tags the viewport, and typing a tag activates that exact element', async ({ page }) => {
    await goToDesk(page, '/bd-pipeline');

    // Placed low and to the right, where the desk chrome is not, so overlap resolution
    // has nothing to fight.
    const tag = await probeTag(page, { top: 520, left: 900 });
    expect(tag).toHaveLength(2);
    expect([...tag].every((c) => alphabet().includes(c))).toBe(true);

    expect(await probeClicks(page)).toBe(0);
    for (const ch of tag) await page.keyboard.press(ch);

    // The whole feature, in one assertion: a real `f`, a tag read off the screen, two
    // real keypresses, and the element the tag was drawn beside is the one that fired.
    await expect.poll(() => probeClicks(page)).toBe(1);
    // And the layer got out of the way.
    await expect(page.locator(chips)).toHaveCount(0);
  });

  test('a prefix filters, and the survivor still activates', async ({ page }) => {
    await goToDesk(page, '/bd-pipeline');
    const tag = await probeTag(page, { top: 520, left: 900 });

    const before = await page.locator(chips).count();
    await page.keyboard.press(tag[0]!);
    const after = await page.locator(chips).count();
    // A first keystroke that eliminates nothing means the tag scheme puts all its
    // discrimination in the second character — see the "first character varies fastest"
    // note in lib/hints.ts.
    expect(after, `prefix "${tag[0]}" narrowed ${before} chips to ${after}`).toBeLessThan(before);
    expect(after).toBeGreaterThan(0);

    await page.keyboard.press(tag[1]!);
    await expect.poll(() => probeClicks(page)).toBe(1);
  });

  test('Escape and a second f both cancel, and neither activates anything', async ({ page }) => {
    await goToDesk(page, '/bd-pipeline');

    await page.keyboard.press('f');
    await expect(page.locator(chips).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(chips)).toHaveCount(0);

    await page.keyboard.press('f');
    await expect(page.locator(chips).first()).toBeVisible();
    await page.keyboard.press('f');
    await expect(page.locator(chips)).toHaveCount(0);
  });

  test('a scroll cancels it, rather than leaving chips beside the wrong controls', async ({ page }) => {
    await goToDesk(page, '/bd-pipeline');
    await page.keyboard.press('f');
    await expect(page.locator(chips).first()).toBeVisible();

    // The chips are positioned from a viewport snapshot. Repositioning them while new
    // untagged controls slide into view would draw a screen that lies about what is
    // reachable; reassigning tags mid-type would change the label the operator is
    // halfway through. Cancelling is the only option that never shows a false tag.
    //
    // Scrolled by driving the app's OWN scroller rather than with `mouse.wheel`. The
    // shell is `h-screen` with `overflow-hidden`, so the window never scrolls at all and
    // a wheel event at the default cursor position (0,0) lands on the top bar and does
    // nothing — which is how this test first passed the layer and failed itself.
    const scrolled = await page.evaluate(() => {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
        if (el.scrollHeight > el.clientHeight + 40 && getComputedStyle(el).overflowY !== 'visible') {
          el.scrollTop += 200;
          return true;
        }
      }
      return false;
    });
    expect(scrolled, 'no scrollable region on this surface, so the test proves nothing').toBe(true);
    await expect(page.locator(chips)).toHaveCount(0);
  });

  test('f yields to typing, and is a literal f in the field', async ({ page }) => {
    await goToDesk(page, '/bd-pipeline');

    /*
     * `4` switches to the "working" split, which is the ONLY split that renders the
     * filter token bar and therefore the only place on this surface with a text field
     * (src/pages/BdPipeline.tsx:524, src/components/bd/FilterTokenBar.tsx:139).
     *
     * Worth recording why the obvious version of this test was wrong. It began as
     * `locator('input').first()` plus a `test.skip` when nothing matched — copied from
     * manual.spec.ts — and it skipped. Measured: with the API down there are ZERO
     * `input` or `textarea` elements rendered on /, /bd-pipeline, /deal-board,
     * /command-deck or /settings. So the skip was permanent, and a permanently skipped
     * test reads as coverage in the report while asserting nothing at all.
     */
    await page.keyboard.press('4');
    const field = page.locator('input[type="text"], input:not([type])').first();
    await expect(field).toBeVisible();

    await field.click();
    await field.fill('');
    await page.keyboard.press('f');
    // Stealing `f` from a search box would make the box unusable, and `f` is a far
    // commoner letter than the `?` that taught this lesson in Phase 6.
    await expect(page.locator(chips)).toHaveCount(0);
    await expect(field).toHaveValue('f');
  });

  test('f stands down while the command line owns the keyboard', async ({ page }) => {
    await goToDesk(page, '/bd-pipeline');
    await page.keyboard.press('Meta+k');
    await expect(page.locator('[role="dialog"][aria-label="Command line"]')).toBeVisible();

    // Two guards agree here and it is worth knowing both hold: the command line
    // autofocuses its search field (so `isTypingTarget` is true) AND it is on the
    // dismiss stack (so `isOverlayOpen()` is true). Tagging the page behind the backdrop
    // would offer controls Tab is trapped away from.
    await page.keyboard.press('f');
    await expect(page.locator(chips)).toHaveCount(0);

    await page.keyboard.press('Escape');
    await page.keyboard.press('f');
    await expect(page.locator(chips).first()).toBeVisible();
  });

  test('the manual names f, and does NOT pretend to report hint mode', async ({ page }) => {
    /*
     * A correction, written as a test so it cannot quietly revert. HintTags.tsx used to
     * claim that registering on the dismiss stack "also puts hint tags into the manual's
     * live esc-closes report". This assertion is what falsified it, and both reasons are
     * asserted below rather than described:
     *
     *  - `?` is an off-alphabet character, so the layer swallows it and closes. The
     *    manual therefore opens with hint mode already gone.
     *  - hint mode is never stacked UNDER anything, so the manual's report — which is about
     *    what sits BENEATH the manual — could not name it even in principle. Note this
     *    reason changed and the old wording is kept as a warning: it used to be "`f` will
     *    not arm while `isOverlayOpen()`", which was true until the hint layer was scoped to
     *    the topmost dismiss container and started arming inside overlays. The conclusion
     *    survived the premise, which is exactly the kind of stale comment that outlives its
     *    fact — see the same mistake in the quickstart's "warning toast every launch".
     *
     * So the manual documents the KEY, which is what an operator needs, and the stack
     * registration earns its place by owning Escape rather than by being reportable.
     */
    await goToDesk(page, '/bd-pipeline');
    await page.keyboard.press('f');
    await expect(page.locator(chips).first()).toBeVisible();

    await page.keyboard.press('?');
    const manual = page.locator('[role="dialog"][aria-label="Manual"]');
    await expect(manual).toBeVisible();
    await expect(page.locator(chips)).toHaveCount(0);
    await expect(manual.getByText(/Nothing else is open/i)).toBeVisible();

    // The part that does matter: a shortcut the manual does not name is a shortcut
    // nobody finds.
    //
    // Pinned to the NARROWED wording. This assertion read `/Tag every control in view/`
    // and passed, which is the failure mode this whole spec exists to catch: it proved
    // the line was on screen, not that the line was true. `f` refuses to arm while an
    // overlay is up, coordinate-decoded chart surfaces cannot be driven by a tag, and
    // visibility is judged against the viewport rather than against clipping ancestors —
    // so "every control" was a universal claim the code does not keep. The reasons are
    // recorded at the entry in src/lib/manual.ts.
    await expect(manual.getByText(/Tag the controls in view/i)).toBeVisible();
    // And the second limit is stated, not just the typing one.
    // The note the manual actually carries now. It changed when `f` gained the ability to
    // arm inside an overlay (scoped to the topmost dismiss container), so the old
    // "not while a dialog is open" is no longer true and asserting it here would pin a
    // sentence the app has correctly stopped saying.
    await expect(manual.getByText(/inside most dialogs/i)).toBeVisible();
    await expect(manual.getByText(/not while you are typing/i)).toBeVisible();
  });

  test('the chip height constant matches the chip that actually renders', async ({ page }) => {
    await goToDesk(page, '/bd-pipeline');
    await page.keyboard.press('f');
    await expect(page.locator(chips).first()).toBeVisible();

    // `layoutTags` has to resolve overlaps before anything is rendered, so it cannot
    // measure — it uses a constant. This is the only thing keeping that constant honest.
    const measured = await page.locator(chips).first().evaluate((el) => (el as HTMLElement).offsetHeight);
    expect(measured, `HINT_CHIP_H is ${chipHeight()} but a chip renders at ${measured}px`).toBe(chipHeight());
  });

  test('co-located chips do not stack on top of each other', async ({ page }) => {
    await goToDesk(page, '/bd-pipeline');
    await page.keyboard.press('f');
    await expect(page.locator(chips).first()).toBeVisible();

    // The nesting that makes this necessary is real: a lead row is a target AND contains
    // an EntityChip and two role="button" derived values, so several chips want one
    // corner. Unresolved they smear into something unreadable.
    const overlaps = await page.evaluate(() => {
      const boxes = Array.from(document.querySelectorAll('[data-hint-tag]')).map((el) => {
        const r = el.getBoundingClientRect();
        return { tag: el.getAttribute('data-hint-tag')!, ...{ top: r.top, left: r.left, w: r.width, h: r.height } };
      });
      const bad: string[] = [];
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          // Full containment is the failure that matters: a chip entirely under another
          // is unreadable. A few px of edge overlap is cosmetic.
          const overlapX = Math.min(a.left + a.w, b.left + b.w) - Math.max(a.left, b.left);
          const overlapY = Math.min(a.top + a.h, b.top + b.h) - Math.max(a.top, b.top);
          if (overlapX > Math.min(a.w, b.w) * 0.8 && overlapY > Math.min(a.h, b.h) * 0.8) {
            bad.push(`${a.tag} and ${b.tag}`);
          }
        }
      }
      return bad;
    });
    expect(overlaps, `chips almost entirely covering each other: ${overlaps.join(', ')}`).toEqual([]);
  });
});

test.describe('the things that are not buttons', () => {
  const ROWS = 12;

  /** Same stub as populated.spec.ts: only the network is replaced. */
  async function seatWithLeads(page: Page): Promise<void> {
    await takeSeat(page);
    await page.route('**/v1/projects?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          data: Array.from({ length: ROWS }, (_, i) => ({
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
          })),
          meta: { total: ROWS, limit: 50, offset: 0, timestamp: new Date(0).toISOString() },
        }),
      });
    });
    await page.goto('/bd-pipeline');
    await expect(page.locator('[data-list-row]').first()).toBeVisible({ timeout: 15_000 });
  }

  test('a table row gets a tag, and typing it selects that row', async ({ page }) => {
    await seatWithLeads(page);
    await page.keyboard.press('f');
    await expect(page.locator(chips).first()).toBeVisible();

    // A row is `<tr>`, not a button, and 11 of 12 sit at `tabindex="-1"` under the
    // roving tabindex — so the generic focusable clause misses them and
    // `[data-list-row]` is why they are reachable at all.
    const target = await page.evaluate(() => {
      const row = document.querySelectorAll('[data-list-row]')[3] as HTMLElement;
      const r = row.getBoundingClientRect();
      for (const chip of Array.from(document.querySelectorAll('[data-hint-tag]'))) {
        const c = chip.getBoundingClientRect();
        if (Math.abs(c.left - Math.max(0, r.left)) < 1.5 && c.top >= r.top - 1.5 && c.top < r.top + 60) {
          return { tag: chip.getAttribute('data-hint-tag')!, id: row.getAttribute('data-lead-id') };
        }
      }
      return null;
    });
    expect(target, 'no chip was drawn at row 3 — rows are not being tagged').not.toBeNull();

    for (const ch of target!.tag) await page.keyboard.press(ch);
    // The observable outcome is the URL, not `aria-selected`. The row's own `onClick`
    // runs `handleSelect` (src/components/bd/LeadTable.tsx:159), which NAVIGATES to the
    // lead's dossier (src/pages/BdPipeline.tsx:358-361) — `aria-selected` tracks a local
    // `selectedId` that this path never touches. Asserting the attribute is what this
    // test did first, and it failed while the feature worked, which is its own lesson
    // about picking an observable that is actually downstream of the behaviour.
    await expect(page).toHaveURL(new RegExp(`/bd-pipeline/${target!.id}$`));
  });

  test('React commits a frame after the dispatched click, not inside it', async ({ page }) => {
    await seatWithLeads(page);

    /*
     * THE measurement that corrected `activateTarget`. It decides whether to also send
     * Enter by asking a MutationObserver whether the click changed anything. The first
     * version read the answer synchronously, on the stated grounds that React 18 flushes
     * discrete events synchronously. It does not: React schedules the flush in a
     * microtask, so `takeRecords()` inside the dispatch sees NOTHING.
     *
     * The consequence was not theoretical. Every lead-row tag fired its click and then a
     * spurious Enter, and the Enter ran `onActivate` as well — which tore the table down.
     * These two numbers, side by side, are the whole justification for waiting a frame.
     */
    const { sync, deferred } = await page.evaluate(async () => {
      const row = document.querySelectorAll('[data-list-row]')[2] as HTMLElement;
      // Accumulated in the callback. `takeRecords()` alone returns only UNDELIVERED
      // records, and delivery happens at the next microtask checkpoint — so reading it
      // after a frame reports zero for a click that did mutate the DOM. That was the
      // second bug in this code path, and this shape is what the fix looks like.
      let delivered = 0;
      const observer = new MutationObserver((records) => {
        delivered += records.length;
      });
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
      row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      // Queued during the dispatch itself — non-zero only if React committed inline.
      const sync = observer.takeRecords().length;
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const deferred = delivered + observer.takeRecords().length;
      observer.disconnect();
      return { sync, deferred };
    });

    expect(sync, 'React committed synchronously after all — the deferral could be removed').toBe(0);
    expect(deferred, 'the click produced no mutation even a frame later').toBeGreaterThan(0);
  });

  test('a tag on a row does NOT fire twice, which is what the deferral buys', async ({ page }) => {
    await seatWithLeads(page);
    const historyBefore = await page.evaluate(() => history.length);

    await page.evaluate(() => {
      const w = window as unknown as { __enters?: number };
      w.__enters = 0;
      document.addEventListener(
        'keydown',
        (e) => {
          if (e.key === 'Enter') w.__enters = (w.__enters ?? 0) + 1;
        },
        true,
      );
    });

    await page.keyboard.press('f');
    await expect(page.locator(chips).first()).toBeVisible();
    const tag = await page.evaluate(() => {
      const row = document.querySelectorAll('[data-list-row]')[3] as HTMLElement;
      const r = row.getBoundingClientRect();
      for (const chip of Array.from(document.querySelectorAll('[data-hint-tag]'))) {
        const c = chip.getBoundingClientRect();
        if (Math.abs(c.left - Math.max(0, r.left)) < 1.5 && c.top >= r.top - 1.5 && c.top < r.top + 20) {
          return chip.getAttribute('data-hint-tag');
        }
      }
      return null;
    });
    expect(tag, 'no chip at row 3').not.toBeNull();
    for (const ch of tag!) await page.keyboard.press(ch);

    // Give the deferred branch its frame, and then some.
    await page.waitForTimeout(400);
    expect(
      await page.evaluate(() => (window as unknown as { __enters?: number }).__enters ?? 0),
      'a synthetic Enter reached the row on top of the click',
    ).toBe(0);

    // And the visible consequence. Both the row's `onClick` and the container's Enter
    // handler run the same `handleSelect`, which NAVIGATES — so a double activation
    // pushes two history entries for one keystroke and the operator's ⌘[ then appears
    // not to work. One tag, one entry.
    const pushed = (await page.evaluate(() => history.length)) - historyBefore;
    expect(pushed, `one tag pushed ${pushed} history entries`).toBe(1);
  });

  test('the detector is not so trigger-happy that it never sends Enter', async ({ page }) => {
    await seatWithLeads(page);

    /*
     * The other half of the trade, and the risk of deferring: unrelated background
     * mutations inside that frame suppress an Enter that WAS wanted, leaving the tag
     * inert. Measured here with a custom target that has no click handler at all, on a
     * live surface with real data behind it — if the app mutates enough on its own to
     * mask a dead click, this is where it shows up.
     */
    await page.evaluate(() => {
      const w = window as unknown as { __keyOnly?: number };
      w.__keyOnly = 0;
      const d = document.createElement('div');
      d.id = 'key-only';
      d.setAttribute('role', 'button');
      d.tabIndex = 0;
      d.textContent = 'keys only';
      d.style.cssText = 'position:fixed;top:480px;left:900px;width:90px;height:22px;';
      // Deliberately NO click handler: this is the "responds to keydown, not click" case.
      d.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') w.__keyOnly = (w.__keyOnly ?? 0) + 1;
      });
      document.body.appendChild(d);
    });

    await page.keyboard.press('f');
    await expect(page.locator(chips).first()).toBeVisible();
    const tag = await page.evaluate(() => {
      const r = document.getElementById('key-only')!.getBoundingClientRect();
      for (const chip of Array.from(document.querySelectorAll('[data-hint-tag]'))) {
        const c = chip.getBoundingClientRect();
        if (Math.abs(c.left - r.left) < 1.5 && c.top >= r.top - 1.5 && c.top < r.top + 60) {
          return chip.getAttribute('data-hint-tag');
        }
      }
      return null;
    });
    expect(tag, 'the keydown-only target got no chip').not.toBeNull();
    for (const ch of tag!) await page.keyboard.press(ch);

    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __keyOnly?: number }).__keyOnly ?? 0), { timeout: 3000 })
      .toBe(1);
  });
});

test.describe('the bundle', () => {
  /**
   * The claim: only the `f` listener is eager.
   *
   * Asserted against the BUILT output rather than the source, because the source cannot
   * tell you which chunk a module landed in — and the failure mode is exactly a
   * one-line import that quietly promotes the whole layer into the initial bundle. The
   * chunk prefixes are the same ones scripts/check-bundle.mjs counts as always-loaded.
   */
  const DIST = join(HERE, '..', 'dist', 'assets');
  const INITIAL = ['index-', 'vendor-', 'react-vendor-', 'icons-'];

  test('the hint layer is not in the always-loaded chunks', () => {
    let files: string[];
    try {
      files = readdirSync(DIST).filter((f) => f.endsWith('.js'));
    } catch {
      throw new Error(`no build found at ${DIST} — run \`npm run build -w @lcx/web\` first`);
    }

    const needle = alphabet();
    const eager = files.filter((f) => INITIAL.some((p) => f.startsWith(p)));
    expect(eager.length, 'no always-loaded chunks found — has the build output changed shape?').toBeGreaterThan(0);

    const leaked = eager.filter((f) => readFileSync(join(DIST, f), 'utf8').includes(needle));
    expect(
      leaked,
      `the hint alphabet is in the eager bundle (${leaked.join(', ')}) — something eager imports lib/hints.ts`,
    ).toEqual([]);

    // And it IS shipped somewhere, or this test proves only that the feature is absent.
    const lazy = files.filter((f) => !INITIAL.some((p) => f.startsWith(p)) && readFileSync(join(DIST, f), 'utf8').includes(needle));
    expect(lazy.length, 'the hint alphabet is in no chunk at all — the layer did not ship').toBeGreaterThan(0);
  });

  test('the eager side still owns the key, or nothing would open the lazy chunk', () => {
    const files = readdirSync(DIST).filter((f) => f.startsWith('index-') && f.endsWith('.js'));
    const entry = files.map((f) => readFileSync(join(DIST, f), 'utf8')).join('');
    // The listener's own guards, which have to be resident: `f` cannot arm while typing
    // or while an overlay owns the keyboard.
    expect(entry).toContain('isContentEditable');
  });
});

test.describe('measurements, not gates', () => {
  test('how many controls are actually in a viewport', async ({ page }) => {
    /*
     * The number the alphabet size depends on. A 12-letter alphabet gives 144
     * two-character tags; past that every tag on the screen becomes three characters,
     * which is a worse experience for everyone. Annotated rather than asserted because
     * this is the first time it has been counted, and a threshold invented on a first
     * measurement is a threshold somebody loosens later.
     */
    const counts: string[] = [];
    for (const path of ['/', '/bd-pipeline', '/deal-board', '/command-deck']) {
      await goToDesk(page, path);
      await page.keyboard.press('f');
      await expect(page.locator(chips).first()).toBeVisible();
      const n = await page.locator(chips).count();
      const len = await page.locator(chips).first().getAttribute('data-hint-tag');
      counts.push(`${path}: ${n} targets, ${len!.length}-char tags`);
      await page.keyboard.press('Escape');
    }
    test.info().annotations.push({ type: 'hint-density', description: counts.join(' · ') });

    // What IS asserted: the walk found something on every surface. A silent zero would
    // look like a pass and mean the feature is dead.
    expect(counts.every((c) => !c.includes(': 0 targets'))).toBe(true);
  });

  test('how long the first f takes, which is the window a stray key can reach the page', async ({ page }) => {
    await goToDesk(page, '/bd-pipeline');
    const ms = await page.evaluate(async () => {
      const t0 = performance.now();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true }));
      // Poll rather than wait a fixed time: the chunk is local, so this is dominated by
      // parse and commit, not by the network.
      for (let i = 0; i < 400; i++) {
        if (document.querySelector('[data-hint-tag],[data-hint-status]')) break;
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
      return performance.now() - t0;
    });
    test.info().annotations.push({ type: 'hint-first-press-ms', description: `${ms.toFixed(0)}ms (dev server, unminified)` });
    // Only the sanity bound is a gate — this is a dev-server measurement and a
    // production number would be smaller, so a tight threshold here would be a lie
    // about the shipped app in either direction.
    expect(ms, 'the layer never appeared at all').toBeLessThan(10_000);
  });
});
