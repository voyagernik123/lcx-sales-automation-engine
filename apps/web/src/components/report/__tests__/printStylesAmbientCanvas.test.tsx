import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrintStyles } from '@/components/report/PrintStyles';

/**
 * WHAT A PLAIN ⌘P PUTS BEHIND A BOARD PACK AND A COMPLIANCE RECORD.
 *
 * `AppLayout.tsx:265` mounts `SignatureBackdrop` on every shell route: an `absolute inset-0 -z-10`
 * canvas spanning the whole shell, painted from whichever palette the theme had. All thirteen
 * printable artefacts in this app are shell routes, so it is behind every one of them. The house
 * print sheet hid seven things and the backdrop matched none of them — every one of the seven
 * names a tag, a role or a class, and this is an unclassed `<canvas>` inside an unclassed `<div>`.
 * Forcing the paper white does not reach a bitmap, re-pinning the dark tokens does not reach a
 * bitmap, and nothing in the app repaints on `beforeprint`. Measured: a 1440x5369 near-black
 * canvas behind the printed page for any dark-theme operator pressing ⌘P.
 *
 * ── WHY THIS FILE TESTS A SELECTOR AND NOT A LIST ────────────────────────────────────
 * The defect is the LIST. So the assertions below are about a BOUNDARY: no canvas outside the
 * printed document survives, whatever it is called and whoever adds it next. `whatPrintDoesTo`
 * takes an arbitrary element, runs every parsed `@media print` rule's real `selectorText` against
 * it with `Element.matches`, and reports what the winning declaration does — so a canvas invented
 * inside this test, with no class, no id and no attribute anyone has ever written a rule for, is
 * still covered. That is the property a hand-list cannot have.
 *
 * ── AND THE OTHER HALF, WHICH IS WHERE A BLANKET RULE WOULD HAVE DONE REAL DAMAGE ────
 * `canvas { display: none }` in print was checked and rejected. Eight primitives in
 * `components/charts` draw their bars, arcs and dials in a GL canvas under the host SVG and let
 * the SVG re-draw them ONLY when the renderer refuses (`BarChartH.tsx:97` and six siblings gate on
 * `glRefused`). Nothing in `components/charts` listens for `beforeprint`, so at ⌘P in a WebGL2
 * browser `glRefused` is false and the canvas carries the data. A blanket rule prints a board pack
 * of labelled, gridded, empty axes. The last test in this file pins that gate in the source, so
 * the day a chart gains a real print fallback this file says the constraint has lifted.
 *
 * ── WHAT IS NOT MEASURED HERE ───────────────────────────────────────────────────────
 * jsdom evaluates no `@media print` and rasterises nothing, so this is not ink. It is the real
 * stylesheet, parsed by the real CSSOM, matched against real elements — a typo'd selector, a
 * dropped `!important` or a rule the browser would never apply to the backdrop fails here.
 */

afterEach(() => { cleanup(); document.body.innerHTML = ''; });

/** Every `@media print` style rule the house sheet declares, out of the real CSSOM. */
function printRules(): readonly CSSStyleRule[] {
  const { container } = render(<PrintStyles />);
  const style = container.querySelector('style');
  expect(style, 'PrintStyles rendered no <style> element').not.toBeNull();
  const sheet = style!.sheet;
  expect(sheet, 'jsdom attached no CSSStyleSheet — nothing below could be read').not.toBeNull();
  const out: CSSStyleRule[] = [];
  for (const rule of Array.from(sheet!.cssRules)) {
    if (!(rule instanceof CSSMediaRule) || rule.conditionText !== 'print') continue;
    for (const inner of Array.from(rule.cssRules)) if (inner instanceof CSSStyleRule) out.push(inner);
  }
  expect(out.length, 'no rules parsed out of the @media print block').toBeGreaterThan(5);
  return out;
}

/**
 * What the printed sheet does to one element: the matching rules, and whether any of them removes
 * it outright at `!important` (which is the only weight that beats the inline `display` these
 * canvases set for themselves).
 */
function whatPrintDoesTo(el: Element, rules: readonly CSSStyleRule[]) {
  const matched = rules.filter((r) => el.matches(r.selectorText));
  return {
    selectors: matched.map((r) => r.selectorText),
    removed: matched.some((r) => r.style.display === 'none' && r.style.getPropertyPriority('display') === 'important'),
  };
}

/**
 * THE REAL SHELL'S SHAPE, and every structural fact below is quoted from a file.
 *
 * `AppLayout.tsx:264` — `<div className="relative isolate flex h-screen flex-col bg-page text-navy">`
 * `AppLayout.tsx:265` — `<SignatureBackdrop />`, which renders
 *   `<div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"><canvas/></div>`
 *   (`SignatureBackdrop.tsx:449-455`)
 * `AppLayout.tsx:302` — `<MainContent>`, which renders `<main id="main-content">` (`MainContent.tsx:5`)
 * and every routed printable page (`router.tsx:254-311`) renders inside that `<main>`.
 *
 * The chart canvas is `BarChartH.tsx:79-80`: `{glCanvas}` then the host `<svg>`, inside
 * `<div className="relative w-full">`, with the canvas itself carrying `aria-hidden` and an inline
 * `display: block` (`gl/FlatBars.tsx:154-161`).
 */
function mountShell(): { ambient: HTMLElement; chart: HTMLElement; report: HTMLElement; strayInShell: HTMLElement } {
  const host = document.createElement('div');
  host.id = 'root';
  host.innerHTML = `
    <div class="relative isolate flex h-screen flex-col bg-page text-navy">
      <div aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <canvas data-probe="ambient" style="display: block"></canvas>
      </div>
      <header></header>
      <div class="flex flex-1 overflow-hidden">
        <aside></aside>
        <main id="main-content">
          <div class="br-page">
            <section class="br-deck" data-probe="report">
              <div class="relative w-full">
                <canvas data-probe="chart" aria-hidden="true" class="pointer-events-none absolute inset-0 -z-0 h-full w-full" style="display: block"></canvas>
                <svg viewBox="0 0 100 100"></svg>
              </div>
            </section>
          </div>
        </main>
      </div>
      <div><canvas data-probe="stray"></canvas></div>
    </div>`;
  document.body.appendChild(host);
  /* `data-probe` rather than `id`: two mounts in one file would give the document duplicate ids, and
     an id lookup then resolves to the OTHER shell and returns null here — which reads as "the rule
     failed" when it means "the fixture collided". */
  const probe = (name: string) => {
    const el = host.querySelector(`[data-probe="${name}"]`);
    expect(el, `the fixture shell has no ${name} — every assertion about it would pass vacuously`).not.toBeNull();
    return el as HTMLElement;
  };
  return { ambient: probe('ambient'), chart: probe('chart'), report: probe('report'), strayInShell: probe('stray') };
}

function read(rel: string): string {
  const src = readFileSync(resolve(process.cwd(), rel), 'utf8');
  expect(src.length, `${rel} is empty, so nothing below could fail`).toBeGreaterThan(500);
  return src;
}

describe('a browser-initiated ⌘P does not print the shell backdrop', () => {
  it('removes the ambient canvas that sits behind every printable route', () => {
    const rules = printRules();
    const { ambient } = mountShell();
    const got = whatPrintDoesTo(ambient, rules);
    expect(
      got.removed,
      'the shell\'s ambient canvas still prints — this is the near-black 1440x5369 ground behind the '
      + `board pack and the crisis compliance record. Rules that matched it: ${JSON.stringify(got.selectors)}`,
    ).toBe(true);
  });

  it('removes a canvas nobody has named yet, anywhere in the shell', () => {
    /*
     * THE WHOLE POINT, AND THE THING A LIST CANNOT DO. `#stray` is an unclassed canvas dropped into
     * the shell by this test — no component owns it, no selector was written for it, and it did not
     * exist when the rule was written. If the sheet ever goes back to naming backdrops one at a
     * time, this is the assertion that notices.
     */
    const rules = printRules();
    const { strayInShell } = mountShell();
    const got = whatPrintDoesTo(strayInShell, rules);
    expect(
      got.removed,
      'the print sheet is naming canvases individually again, so the NEXT one somebody mounts will '
      + `print. Rules that matched it: ${JSON.stringify(got.selectors)}`,
    ).toBe(true);
  });

  it('leaves the chart canvas inside the printed document completely alone', () => {
    /*
     * THE HALF THAT MATTERS MOST, because getting it wrong deletes DATA rather than decoration.
     * `BarChartH` and six siblings render their SVG bars only when the GL layer has refused, and
     * nothing in `components/charts` listens for `beforeprint` — so at ⌘P the canvas is the only
     * place the bars exist. Not merely "not removed": NO print rule may match it at all, because a
     * rule that matched and then had to be undone is the shape this defect keeps coming back in.
     */
    const rules = printRules();
    const { chart } = mountShell();
    const got = whatPrintDoesTo(chart, rules);
    expect(
      got.selectors,
      'a print rule now matches the GL chart canvas — a board pack would print labelled, gridded, '
      + 'empty axes, because the bars only exist in that canvas at print time',
    ).toEqual([]);
  });

  it('leaves the printed document itself alone', () => {
    /* A guard on the boundary rather than on the canvas: if `main` ever stops being the thing the
       sheet treats as the document, this rule starts hiding the report. */
    const rules = printRules();
    const { report } = mountShell();
    expect(whatPrintDoesTo(report, rules).removed, 'the print sheet now removes the report itself').toBe(false);
  });

  it('the sheet still treats `main` as the printed document, which is what the rule is scoped to', () => {
    /* The rule reads `canvas:not(main canvas)`. It is only correct while `main` is the document —
       the same assumption the `main { height: auto … }` rule below it already makes. Pinned so the
       two cannot drift apart silently. */
    const rules = printRules();
    const scoped = rules.filter((r) => r.selectorText.includes('canvas'));
    expect(scoped.length, 'no canvas rule in the print sheet at all').toBeGreaterThan(0);
    expect(
      rules.some((r) => r.selectorText.split(',').map((s) => s.trim()).includes('main')),
      'the sheet stopped treating `main` as the printed document, so the canvas rule is scoped to nothing',
    ).toBe(true);
  });
});

describe('the constraint that forced a scoped rule instead of a blanket one', () => {
  it('every GL chart still draws its data marks ONLY when the renderer refused', () => {
    /*
     * DERIVED FROM THE DIRECTORY, NOT FROM A LIST OF SEVEN FILENAMES: every chart that takes a GL
     * canvas is found by reading `components/charts`, so a chart added tomorrow is checked too.
     *
     * While this holds, `canvas { display: none }` in print deletes the bars. The day a chart gains
     * a real print fallback — a `beforeprint` refusal, or SVG marks drawn unconditionally — this
     * fails, and the failure is the notice that the blanket rule has become available.
     */
    const { readdirSync } = require('node:fs') as typeof import('node:fs');
    const dir = resolve(process.cwd(), 'src/components/charts');
    const files = readdirSync(dir).filter((f) => f.endsWith('.tsx'));
    expect(files.length, 'read no chart files, so this check would pass vacuously').toBeGreaterThan(5);

    const glCharts = files.filter((f) => /useFlat(Bars|Line|Dial|Track)\(/.test(read(`src/components/charts/${f}`)));
    expect(glCharts.length, 'found no GL-backed charts, so the constraint below is untested').toBeGreaterThan(4);

    const unconditional = glCharts.filter((f) => !read(`src/components/charts/${f}`).includes('glRefused'));
    expect(
      unconditional,
      'a GL chart no longer gates its SVG marks on `glRefused` — check whether its canvas is still the '
      + 'only place its data exists at print time before trusting the scoped canvas rule',
    ).toEqual([]);

    const listensForPrint = glCharts.filter((f) => read(`src/components/charts/${f}`).includes('beforeprint'));
    expect(
      listensForPrint,
      'a GL chart now repaints or refuses on `beforeprint`, so print is finally a real fallback state '
      + 'for it — the header of PrintStyles.tsx says the opposite and needs correcting',
    ).toEqual([]);
  });
});
