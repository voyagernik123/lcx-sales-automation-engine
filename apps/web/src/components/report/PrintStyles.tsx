/**
 * The shared print stylesheet for every printable artefact.
 *
 * Mounted by twelve surfaces — BoardReport, Wbr, CommandDeck, CheatCard, MarketingCrisis,
 * MarketingRecord, GpsPrint and the five GPS pages: hides app chrome, unlocks the app's
 * scroll containers so a report flows across pages, and formats for A4. (The header used to
 * name three, which is how a change measured on one printable page gets assumed to be the
 * whole print surface — grep `<PrintStyles` before believing any count here, including this
 * one.)
 *
 * Three fixes below came out of the Phase 6 cheat card, which was the first artefact
 * whose print output was MEASURED rather than eyeballed. All three affected the two
 * existing print surfaces too, silently:
 *
 * `min-height` — the rule cleared `height` and not `min-height`, and `body` carries
 * `min-h-screen`. In print a `vh` resolves to the page box, so the body filled the
 * sheet to the pixel and sat one rounding error away from emitting a trailing blank
 * page. That is the classic "why does my report always print two pages" bug and it is
 * invisible in a print PREVIEW, which shows the content, not the empty overflow.
 *
 * `[role="status"]` — the chrome rules hide `header, aside, footer`, but the offline
 * banner is a `<div role="status">` in the main flow. So printing during an API blip
 * put half a page of apology on top of a board report going to a wall or an inbox.
 *
 * THE DARK-MODE TOKENS, which is the subtle one. The rules above force the paper
 * white, but `.dark` stays on `<html>`, so every text token stays its dark-theme
 * value: near-white text on white paper. Wbr worked around this by stripping `.dark`
 * behind a 60ms `setTimeout` around its own print button — which cannot help a plain
 * ⌘P, and restores the class under the print job if `window.print()` blocks for
 * longer. Pinning the tokens inside the media query needs no timing and covers both
 * paths. Worth knowing that pinning tokens alone is NOT sufficient: a `dark:` VARIANT
 * still matches while the class is present, so any `dark:bg-*` on printed content has
 * to be neutralised separately — the cheat card hit exactly that with its key chips at
 * 1.3:1.
 *
 * ── `[data-relief-live]` AND `[data-relief-print-flat]`: A RELIEF OPEN AT ⌘P ─────────
 * §6 rule 1 says print resolves to the EXISTING surface and rule 4 says DOM text is the
 * print path. A canvas satisfies neither: it is a bitmap with no text in it, at whatever
 * size and theme the screen happened to have.
 *
 * All seven relief wrappers SWAPPED rather than layered, so with a relief open the flat
 * figure was not in the document at all, and no `@media print` rule anywhere in `apps/web`
 * put it back — this file had zero occurrences of `canvas`. Three surfaces actually reach
 * paper, and all three mount this sheet: `DeckRelief`, `SurfaceRelief` (via
 * `CockpitPanels`) on `CommandDeck`, and `StormRelief` on `MarketingCrisis` — which is a
 * COMPLIANCE RECORD somebody keeps. A canvas printed where the risk figures should be is
 * the serious one of the three.
 *
 * THE WHOLE LIVE BLOCK GOES, NOT JUST ITS CANVAS. `DeckReliefGl` projects real DOM text
 * over its canvas — panel titles, headlines, and a HUD on an `rgba(4,6,11,.82)` plate.
 * Hiding only the canvas would print that text onto white paper with its dark plate
 * removed, floating over the flat deck it is a copy of. Hiding a canvas and printing
 * nothing in its place is the same defect with fewer pixels, so the flat form is REVEALED
 * in the same breath.
 *
 * WHY THE SECOND RULE NEEDS `!important` — it is not a specificity shortcut. The flat
 * print copy carries `display: none` as an INLINE style, so that it stays hidden on screen
 * on any page that does not mount this sheet. That is the fail-safe direction: such a page
 * prints exactly what it printed before rather than showing a reader two figures at once.
 * An inline declaration outranks every selector, so nothing but `!important` can undo it.
 *
 * Both rules are scoped to attributes the wrappers set only while a relief is OPEN. In the
 * default state — off, on all seven, which is the state every print job in this app's life
 * so far has been in — neither attribute exists and neither rule matches anything.
 *
 * ── `canvas:not(main canvas)`: A PLAIN ⌘P IN THE DARK THEME PRINTED A BLACK GROUND ────
 * `AppLayout.tsx:265` mounts `SignatureBackdrop` on EVERY shell route — an `absolute inset-0
 * -z-10` canvas that spans the whole shell. Every printable artefact in this app is a shell
 * route, so it sits behind all thirteen of them. It matched NONE of the chrome selectors below,
 * because all of them name a tag, a role or a class and it is an unclassed `<canvas>` inside an
 * unclassed `<div>`. The rules above force the PAPER white and re-pin the dark TOKENS, and
 * neither reaches a bitmap: the canvas was already painted from the dark palette, nothing in the
 * app listens for `beforeprint` to repaint it, and `#root .h-screen { height: auto }` below then
 * lets `inset-0` grow to the full document — measured at 1440x5369, near-black, on every page.
 *
 * The two documents this affects are a CEO board pack and the crisis COMPLIANCE RECORD. Their
 * in-page print buttons strip `.dark` first and were therefore fine; a browser-initiated ⌘P is
 * not, and no in-page button can make it so.
 *
 * ── WHY IT IS ONE DERIVED RULE AND NOT AN EIGHTH SELECTOR ─────────────────────────────
 * A list is what let this through: seven names, and the eighth thing nobody thought of. The rule
 * is stated instead as the boundary this sheet ALREADY works in — `main` is the printed document
 * (see the `main { … }` rule below, and `layout/MainContent.tsx`), and everything outside it is
 * chrome. Any canvas mounted in the shell is therefore removed the day it is added, named or not,
 * which is the property an ambient backdrop has BY CONSTRUCTION: to span the shell it must be
 * mounted in the shell. A full-bleed canvas mounted INSIDE a page would not be covered, and that
 * is stated rather than papered over.
 *
 * ── WHY IT IS NOT `canvas { display: none }`, WHICH WAS CHECKED AND WOULD DELETE DATA ──
 * Eight chart primitives in `components/charts` draw their bars, arcs and dials in a GL canvas
 * UNDER the host SVG, and the SVG re-draws them itself only when the renderer refuses:
 * `BarChartH.tsx:97`, `ColumnChart.tsx:128`, `CompareBars.tsx:148`, `StackedBarH.tsx:111`,
 * `DonutChart.tsx:118`, `GaugeChart.tsx:119`, `Histogram.tsx:168` all gate the fallback on
 * `glRefused`. `BarChartH.tsx:96` calls that fallback "server render, print, no WebGL2, or first
 * paint" — and PRINT IS NOT ONE OF THEM: grepping `components/charts` for `beforeprint` returns
 * nothing, so in any WebGL2 browser `glRefused` is false at ⌘P and the canvas IS the figure. A
 * blanket rule would have printed a board pack of labelled axes with no bars on them. Those
 * canvases are inside `main`, so this rule does not match them; the test alongside it asserts
 * exactly that, on a DOM built to the shape of the real shell.
 */
export function PrintStyles() {
  const css = `
@media print {
  @page { size: A4; margin: 12mm; }

  /* The dark theme's tokens, overridden with the light values for paper. Keep in
     step with the \`:root\` block in styles/tokens.css. */
  :root, :root.dark {
    --card: 255 255 255;
    --navy: 30 39 97;
    --grey: 90 98 114;
    --grey-dark: 51 57 72;
    --line: 185 198 224;
    /* Added 2026-08-13 with the token itself. --line measured 1.30:1 against a dark card as a
       CONTROL BOUNDARY, where WCAG 1.4.11 wants 3.0, so bordered controls moved to their own role.
       A new token that the dark theme overrides and no print sheet pins prints the DARK value on
       white paper — the same class of defect as the refusal box that printed empty. (No backticks
       in here: this whole block is inside a template literal and one would terminate it.) */
    --control-border: 119 128 147;
    /* Deliberately whiter than the light theme's own --page-bg (244 247 252, the GL rig's
       page since INSTRUMENT S2): paper is white, and printing a page tint wastes toner for
       no information. This is the one value here that is NOT a copy of tokens.css, and the
       test below exempts it by name so the exemption is visible rather than a silent
       mismatch. */
    --page-bg: 255 255 255;
    /* The rig's other scenery roles, generated into tokens.css by INSTRUMENT S2 and
       overridden by the dark theme, pinned at their LIGHT values for paper. Nothing prints
       them yet (their consumers are S5/S6), but a dark-overridden token with no print pin
       prints the DARK value on white the day a consumer arrives — the class of defect the
       print ratchets exist to refuse, so they are pinned with the token, not with the use.
       Keep in step with the generated block (npm run gen:tokens -w apps/web). */
    --ground: 232 237 246;
    --structure: 195 206 224;
    --sky-horizon: 220 229 243;
    --sky-zenith: 244 247 252;
  }

  /* THE RELIEF PRINT PATH. Both selectors and both reasons are in the file header. */
  [data-relief-live] { display: none !important; }
  [data-relief-print-flat] { display: block !important; }

  /* THE SHELL'S AMBIENT CANVAS, AND EVERY ONE AFTER IT. See the file header for the measurement,
     for why this is one derived rule instead of an eighth name in the list below, and for the
     charts it deliberately does not touch. */
  canvas:not(main canvas) { display: none !important; }

  header, aside, footer { display: none !important; }
  /* The offline banner is in the main flow, not the chrome. */
  [role="status"] { display: none !important; }
  .br-no-print { display: none !important; }

  html, body, #root {
    height: auto !important;
    /* NOT just \`height\`: body has min-h-screen, and a vh in print is the page box. */
    min-height: 0 !important;
    overflow: visible !important;
    background: #fff !important;
  }
  #root .h-screen { height: auto !important; }
  #root .overflow-hidden { overflow: visible !important; }
  main { height: auto !important; min-height: 0 !important; overflow: visible !important; padding: 0 !important; }
  .br-page { max-width: none !important; padding: 0 !important; }
  .br-deck { border: none !important; box-shadow: none !important; background: #fff !important; }
  .br-section { break-inside: avoid; }
}
`;
  return <style>{css}</style>;
}
