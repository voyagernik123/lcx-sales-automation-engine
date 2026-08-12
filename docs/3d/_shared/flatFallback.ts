/*
 * §6 RULE 1 — "Every environment has a flat fallback that is not a downgrade in INFORMATION. SSR,
 * print, no-WebGL and reduced-motion all resolve to the existing surface."
 *
 * An audit found all six environments failing this. Every one resolved a refusal to
 * `document.title = 'REFUSED'` plus a single log line, and none had a print rule — so no-WebGL, print
 * and a shader that failed to compile all produced a blank page with a code on it. A refusal that
 * names itself is honest; a refusal that shows the reader nothing is still a total loss of the data.
 *
 * ── WHY THE TABLE IS ALWAYS IN THE DOM, NOT BUILT ON FAILURE ─────────────────────────
 * The obvious design is to render the table in a catch block. That is worse in three ways, and each
 * one is a way the fallback silently stops existing:
 *
 *   1 · A SHADER COMPILE FAILURE HAPPENS DURING MODULE EVALUATION. Anything that builds the fallback
 *       after the renderer is constructed is code that never runs on the failure it exists for.
 *   2 · PRINT IS NOT AN ERROR. There is no exception to catch when someone hits Cmd-P, and a
 *       print-only DOM tree built by JavaScript at print time does not exist in the print snapshot.
 *   3 · THE ACCESSIBILITY TREE IS NOT AN ERROR EITHER. A canvas is opaque to a screen reader whether
 *       or not it drew successfully, so a fallback that only appears on failure leaves the successful
 *       case unreadable — which is the case a reader is actually in.
 *
 * So the table is written BEFORE the stage is created, unconditionally, and is hidden on screen only
 * once a frame has actually been presented. Hidden by CSS, not removed: it stays in the accessibility
 * tree and in the print path. The failure mode of this design is a visible table under a working
 * canvas, which is loud and self-announcing — the right direction for a fallback to fail in.
 */

export interface FallbackColumn {
  readonly key: string;
  readonly label: string;
  /** Right-aligned. Numbers read as a column only when their digits line up. */
  readonly numeric?: boolean;
}

export interface FallbackSpec {
  readonly title: string;
  /** One sentence naming what the 3-D view adds. The reader is entitled to know what they are missing. */
  readonly readsAs: string;
  readonly columns: readonly FallbackColumn[];
  readonly rows: readonly Record<string, string | number | null>[];
  /**
   * Rendered in amber above the table. Use it for the synthetic-data declaration and for anything the
   * flat view cannot carry.
   */
  readonly notices?: readonly string[];
  /**
   * Pre-rendered markup to show INSTEAD of the table.
   *
   * This exists for the one case rule 1 describes literally — "resolve to the existing surface". Where
   * an environment promotes a surface that already ships, the honest fallback is not a table that
   * carries the same fields; it is THAT SURFACE, rendered. E5 supplies the real `SurfacePlot` here via
   * `renderToStaticMarkup`, so a refusal resolves to the component the app actually uses rather than to
   * a second implementation of it that could drift.
   *
   * `columns`/`rows` are still required, and still rendered when this is absent, because most
   * environments have no flat counterpart to fall back TO.
   */
  readonly html?: string;
}

export interface FlatFallback {
  /**
   * Call once a frame has actually been presented. Hides the table on screen and leaves it in the
   * print path and the accessibility tree. Never called if the renderer refused, which is the point.
   */
  markRendered(): void;
  /** Put the refusal in front of the reader, above the data, rather than in place of it. */
  showRefusal(code: string, reason: string): void;
}

const STYLE = `
:root { color-scheme: dark; }
#lcx-fallback { margin: 18px 0 0; max-width: 1200px; font: 400 12px/1.5 ui-monospace, monospace; color: #C4D4F0; }
#lcx-fallback h2 { font: 600 12px/1.2 ui-monospace, monospace; letter-spacing: .14em; text-transform: uppercase; color: #8FB7FF; margin: 0 0 4px; }
#lcx-fallback .reads { color: rgba(196,212,240,.72); margin: 0 0 10px; max-width: 78ch; }
#lcx-fallback .notice { color: #E0A94A; margin: 0 0 4px; }
#lcx-fallback .refusal { border: 1px solid #6B7A99; padding: 9px 11px; margin: 0 0 12px; color: #E9F0FF; }
#lcx-fallback table { border-collapse: collapse; width: 100%; }
#lcx-fallback th, #lcx-fallback td { text-align: left; padding: 4px 10px 4px 0; border-bottom: 1px solid #26355A; white-space: nowrap; }
#lcx-fallback th { color: #8FB7FF; font-weight: 600; }
#lcx-fallback td.n, #lcx-fallback th.n { text-align: right; }
#lcx-fallback .surface { max-width: 760px; }
#lcx-fallback .absent { color: #6B7A99; font-style: italic; }
/* Hidden on screen ONLY once a frame exists. Display, not removal, so it stays in the accessibility
   tree and in the print snapshot. */
#lcx-fallback[data-rendered="1"] { display: none; }
@media print {
  /* The JSON diagnostic block is for a machine and wastes pages. The canvas prints because the stage
     is created with preserveDrawingBuffer. */
  #log { display: none !important; }
  #lcx-fallback, #lcx-fallback[data-rendered="1"] { display: block !important; color: #000; }
  #lcx-fallback h2, #lcx-fallback th { color: #000; }
  #lcx-fallback .reads, #lcx-fallback .absent { color: #444; }
  #lcx-fallback th, #lcx-fallback td { border-bottom: 1px solid #999; }
  #lcx-fallback .notice { color: #7a4f00; }
  body { background: #fff !important; }
}
`;

/**
 * Install the flat fallback. Call this BEFORE creating the stage — see the note above about shader
 * compilation failing during module evaluation.
 */
export function installFlatFallback(spec: FallbackSpec): FlatFallback {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const host = document.createElement('section');
  host.id = 'lcx-fallback';

  const cell = (v: string | number | null, numeric: boolean): string => {
    /*
     * ABSENT IS NAMED, NEVER BLANK AND NEVER ZERO. A blank cell and a zero are the two things a
     * reader cannot tell apart from a measurement, and §6 rule 6 is the whole reason this codebase
     * separates the three states. The flat fallback has to keep that distinction or it IS an
     * information downgrade, which is the one thing rule 1 forbids.
     */
    if (v === null) return `<td class="absent${numeric ? ' n' : ''}">absent</td>`;
    const text = String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<td class="${numeric ? 'n' : ''}">${text}</td>`;
  };

  host.innerHTML =
    `<h2>${spec.title} — flat view</h2>`
    + `<p class="reads">${spec.readsAs}</p>`
    + (spec.notices ?? []).map((n) => `<p class="notice">${n}</p>`).join('')
    + `<div id="lcx-refusal"></div>`
    + (spec.html
      ? `<div class="surface">${spec.html}</div>`
      : `<table><thead><tr>`
        + spec.columns.map((c) => `<th class="${c.numeric ? 'n' : ''}">${c.label}</th>`).join('')
        + `</tr></thead><tbody>`
        + spec.rows.map((r) => `<tr>` + spec.columns.map((c) => cell(r[c.key] ?? null, !!c.numeric)).join('') + `</tr>`).join('')
        + `</tbody></table>`);

  /* Appended to the BODY rather than after the canvas: on a refusal the canvas may be the only element
     that exists, and on a shader failure the harness's own layout code has not run. */
  document.body.appendChild(host);

  return {
    markRendered() { host.dataset.rendered = '1'; },
    showRefusal(code, reason) {
      const slot = document.getElementById('lcx-refusal');
      if (slot) {
        slot.innerHTML = `<p class="refusal"><strong>${code}</strong> — ${reason}`
          + ` The measurements below are unaffected.</p>`;
      }
      /* A refusal un-hides the table even if a frame had previously been presented — a context loss
         mid-session is exactly the case where the reader needs the data back. */
      delete host.dataset.rendered;
      /*
       * AND THE EMPTY CANVAS GOES. Found by looking at the capture rather than at the code: the table
       * was correctly present and correctly visible, and the reader still saw 720 px of blank canvas
       * filling the viewport with the data below the fold. A canvas that will never be drawn into is
       * not a placeholder, it is an obstruction — the reader has to scroll past nothing to reach
       * everything.
       */
      for (const c of Array.from(document.querySelectorAll('canvas'))) {
        (c as HTMLElement).style.display = 'none';
      }
    },
  };
}
