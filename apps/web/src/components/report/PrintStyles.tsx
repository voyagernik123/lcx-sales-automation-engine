/**
 * The shared print stylesheet for every printable artefact.
 *
 * Mounted by BoardReport, Wbr and CommandDeck: hides app chrome, unlocks the app's
 * scroll containers so a report flows across pages, and formats for A4.
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
    /* Deliberately whiter than the light theme's own --page-bg (244 246 251): paper
       is white, and printing a page tint wastes toner for no information. This is the
       one value here that is NOT a copy of tokens.css, and the test below exempts it
       by name so the exemption is visible rather than a silent mismatch. */
    --page-bg: 255 255 255;
  }

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
