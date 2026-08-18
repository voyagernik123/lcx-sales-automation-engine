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
 * So the table is written BEFORE the stage is created, unconditionally, and is taken off the screen only
 * once a frame has actually been presented. The failure mode of this design is a visible table under a
 * working canvas, which is loud and self-announcing — the right direction for a fallback to fail in.
 *
 * ── AND IT IS CLIPPED, NOT `display: none` ───────────────────────────────────────────
 * This comment used to read "hidden by CSS, not removed: it stays in the accessibility tree and in the
 * print path", and the rule underneath it said `display: none`. `display: none` PRUNES the subtree from
 * the accessibility tree, so reason 3 above — the whole justification for building the table
 * unconditionally — was being cancelled by the one rule meant to implement it.
 *
 * Measured with Chrome's `Accessibility.getFullAXTree` on all nine environments: on the SUCCESS path
 * every one reported zero table, row, cell and columnheader nodes, the subtree carrying
 * `ignoredReasons: [{ name: 'notRendered' }]`. On E0, E2 and E8 the entire accessible content of a
 * WORKING page was one unnamed Canvas node plus the JSON diagnostic. The same trees on `?refuse=1`
 * carried 21–262 table nodes, so the only difference was this rule.
 *
 * Success therefore clips the table to a 1×1 box instead of removing it. That keeps it RENDERED, which
 * is what puts it in the accessibility tree and in the print snapshot, and it still occupies no visual
 * space because it is out of flow. The print block below has to undo every one of those properties, not
 * just `display` — see the specificity note there.
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
   * Call once a frame has actually been presented. Clips the table out of the visual layout while
   * leaving it rendered — so it stays in the print path and the accessibility tree. Never called if the
   * renderer refused, which is the point.
   */
  markRendered(): void;
  /** Put the refusal in front of the reader, above the data, rather than in place of it. */
  showRefusal(code: string, reason: string): void;
}

/*
 * THE RULES IN THIS SHEET THAT ARE SCARS ARE NUMBERED HERE, and they are documented here rather than
 * inside the literal because a comment inside a template literal is shipped bytes a minifier cannot reach
 * — and because most of them need to quote a CSS property name, which cannot be done in backticks inside
 * backticks. (This sentence used to say THREE and then stood over four notes; a count in a heading is one
 * more thing to go stale, so there is no longer a number in it.)
 *
 * 1 · `#lcx-fallback[data-rendered="1"]` CLIPS, it does not `display: none`. See the measurement at the
 *     top of this file: `display: none` pruned the table out of the accessibility tree on every success
 *     path, which cancelled the reason it is built unconditionally.
 * 2 · THE PRINT BLOCK MUST UNDO EVERY PROPERTY OF THAT CLIP, each with `!important`, because
 *     `#lcx-fallback[data-rendered="1"]` (specificity 1-1-0) outranks `#lcx-fallback` (1-0-0). Resetting
 *     `display` alone was sufficient only while the clip WAS `display: none`; the moment it became
 *     position/size/overflow, four more properties came with it.
 * 3 · `.refusal` IS RE-COLOURED FOR PAPER, and was not. It sets #E9F0FF for the dark screen; the print
 *     block re-coloured h2, th, .reads, .absent and .notice and forgot it, and `#lcx-fallback .refusal`
 *     (1-0-1) also beats the `#lcx-fallback { color: #000 }` in that block (1-0-0). Measured at 1.14:1
 *     against white in all nine environments while every other cell in the same table measured 7:1 or
 *     better, and confirmed in a real PDF rather than from a computed style: the bordered refusal box
 *     printed EMPTY. A printed refusal therefore showed a fully legible 28-row data table and gave the
 *     reader no indication that the render had refused, which is the failure this file exists to end.
 * 4 · THE HOST TAKES NO FOCUS RING, and that was found by capturing it rather than by reasoning about it.
 *     `showRefusal` moves focus to the host so an assistive-technology user is taken to the data; the host
 *     is `tabindex="-1"`, so it is NOT keyboard-reachable and that focus is never something a reader
 *     initiated. Measured on a refusal: it matched `:focus-visible` and picked up the app stylesheet's
 *     2 px rgb(8,145,178) outline, which drew a teal rectangle around the whole 1200 px flat block — in the
 *     print PDF as well. A ring nobody asked for, around an entire section, is decoration in nine tracked
 *     captures rather than an indicator. The refusal notice itself is the visible signal, and it is now
 *     legible in both media.
 * 5 · `[data-lcx-released]` RELEASES A HOST'S RESERVED HEIGHT ON A REFUSAL, and the `="clipped"` variant
 *     also stops overlay content painting across the data. `showRefusal` stamps the attribute; the rules
 *     live here, in the sheet, so those properties are `!important` in one place, so a capture or an audit
 *     can SEE which hosts were released by reading the DOM, and so this note can quote them. The
 *     measurements, the reason it is `height: auto` and not `0`, and the reason the clip is conditional are
 *     at the call site: this is one rule, and it only means anything beside the walk that stamps it.
 */
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
/* The table's name for anyone browsing it as a table. Clipped in every medium: the h2 above it already
   carries the same words to the eye. */
#lcx-fallback caption { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); text-align: left; }
/* No focus ring on the host. Note 4 above the literal — this is not a keyboard-reachable element. */
#lcx-fallback:focus, #lcx-fallback:focus-visible { outline: none; }
/* A host whose reserved height a refusal has released, and one whose overlay is clipped with it. Note 5
   above the literal — and no backticks in here, for the reason that note gives. */
[data-lcx-released] { height: auto !important; min-height: 0 !important; }
[data-lcx-released="clipped"] { overflow: hidden !important; }
/* Taken off the screen once a frame exists — clipped, never removed. Note 1 above the literal. */
#lcx-fallback[data-rendered="1"] {
  position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%);
  white-space: nowrap; margin: 0; padding: 0; border: 0;
}
@media print {
  /* The JSON diagnostic block is for a machine and wastes pages. The canvas prints because the stage
     is created with preserveDrawingBuffer. */
  #log { display: none !important; }
  /* Every property of the screen clip, undone. Note 2 above the literal. */
  #lcx-fallback, #lcx-fallback[data-rendered="1"] {
    display: block !important; position: static !important; width: auto !important; height: auto !important;
    overflow: visible !important; clip-path: none !important; margin: 18px 0 0 !important; color: #000;
  }
  #lcx-fallback h2, #lcx-fallback th { color: #000; }
  #lcx-fallback .reads, #lcx-fallback .absent { color: #444; }
  #lcx-fallback th, #lcx-fallback td { border-bottom: 1px solid #999; }
  #lcx-fallback .notice { color: #7a4f00; }
  /* The refusal notice was 1.14:1 on paper — invisible. Note 3 above the literal. */
  #lcx-fallback .refusal { color: #7a0d1e !important; border-color: #7a0d1e !important; border-width: 2px !important; }
  body { background: #fff !important; }
}
`;

/**
 * Escape for a TEXT context — between tags — and for nothing else.
 *
 * The name carries the context because the previous version was an unnamed three-replacement chain
 * inside a closure, and the next person to need escaping in this programme will copy whatever they find.
 * These three replacements are correct between tags and WRONG inside an attribute: a value containing a
 * quote closes the attribute early and everything after it is markup. There is deliberately no `escAttr`
 * companion — nothing here interpolates into an attribute, and the right fix when something needs to is
 * `setAttribute`, which does not parse its argument at all.
 */
export function escText(v: string | number): string {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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
  /*
   * A <section> WITH NO ACCESSIBLE NAME IS NOT EXPOSED AS A REGION, so on the refusal path the table was
   * floating under a bare heading with nothing telling a screen-reader user what it belonged to. Measured
   * on all nine: `{ role: null, live: null, label: null, tabindex: null }` and no `region` node anywhere
   * in the refusal tree. `tabindex="-1"` is here so `showRefusal` has somewhere to put focus — the
   * harnesses contain zero focusable elements, so without it there is nowhere for a keyboard user to land.
   */
  host.setAttribute('aria-label', `${spec.title} — flat view`);
  host.setAttribute('tabindex', '-1');

  /*
   * The JSON report is a diagnostic for the capture scripts and for `globalThis.E<N>`; neither reads the
   * accessibility tree. Unhidden it DOMINATES that tree — 602 of E1's 698 nodes were InlineTextBox
   * fragments of a 5,002-character blob, and on E0, E2 and E8 it was the only named content on a working
   * page. The print block already hides it for exactly this reason ("for a machine and wastes pages"); a
   * screen reader is the same argument with the same answer.
   */
  document.getElementById('log')?.setAttribute('aria-hidden', 'true');

  const cell = (v: string | number | null, numeric: boolean): string => {
    /*
     * ABSENT IS NAMED, NEVER BLANK AND NEVER ZERO. A blank cell and a zero are the two things a
     * reader cannot tell apart from a measurement, and §6 rule 6 is the whole reason this codebase
     * separates the three states. The flat fallback has to keep that distinction or it IS an
     * information downgrade, which is the one thing rule 1 forbids.
     */
    if (v === null) return `<td class="absent${numeric ? ' n' : ''}">absent</td>`;
    return `<td class="${numeric ? 'n' : ''}">${escText(v)}</td>`;
  };

  /* `spec.html` is the ONE field that is markup by contract (E5 supplies a real rendered SurfacePlot) and
     is therefore the one field not escaped. Everything else is prose from a caller and goes through
     escText — refusal reasons in particular arrive from a thrown Error's message, which is the one string
     here nobody controls. */
  host.innerHTML =
    `<h2>${escText(spec.title)} — flat view</h2>`
    + `<p class="reads">${escText(spec.readsAs)}</p>`
    + (spec.notices ?? []).map((n) => `<p class="notice">${escText(n)}</p>`).join('')
    /* role="alert" on the EMPTY container, not on the paragraph: a live region has to be in the DOM
       before its content arrives to be announced. `showRefusal` injects 234 accessibility nodes into a
       page whose reader was just told to look at a picture, and measured across all nine there was no
       alert, no status and no live region anywhere in the tree — nothing was announced. */
    + `<div id="lcx-refusal" role="alert"></div>`
    + (spec.html
      ? `<div class="surface">${spec.html}</div>`
      : `<table><caption>${escText(spec.title)} — flat view</caption><thead><tr>`
        + spec.columns.map((c) => `<th scope="col" class="${c.numeric ? 'n' : ''}">${escText(c.label)}</th>`).join('')
        + `</tr></thead><tbody>`
        + spec.rows.map((r) => `<tr>` + spec.columns.map((c) => cell(r[c.key] ?? null, !!c.numeric)).join('') + `</tr>`).join('')
        + `</tbody></table>`);

  /* Appended to the BODY rather than after the canvas: on a refusal the canvas may be the only element
     that exists, and on a shader failure the harness's own layout code has not run. */
  document.body.appendChild(host);

  function showRefusal(code: string, reason: string): void {
    const slot = document.getElementById('lcx-refusal');
    if (slot) {
      slot.innerHTML = `<p class="refusal"><strong>${escText(code)}</strong> — ${escText(reason)}`
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
    const dead = Array.from(document.querySelectorAll('canvas'));
    for (const c of dead) {
      (c as HTMLElement).style.display = 'none';
    }
    /*
     * AND SO DOES THE BOX THAT WAS RESERVED FOR IT — WHICH THE CANVAS SWEEP ABOVE COULD NOT SEE.
     *
     * The rule above hides `canvas` elements and nothing else, so a HOST with a height of its own keeps
     * the hole open and the fallback stays exactly where it was: below the fold, with the reader timed
     * while they look at an empty box. Same defect as the one the comment above describes, one level up
     * the tree, and invisible to the check written for it — `scripts/3d-audit.mjs:425` counts canvases
     * that are still `display:block` and reports zero.
     *
     * MEASURED, in Chromium at the §7(b) trial's own 1194×758 frame, on `live.html?refuse=1` — the top of
     * `#lcx-fallback`, and the first ink and the visible-text-node count the trial's instrument check uses,
     * before this block existed and after:
     *
     *   e2  fallback 799 → 79, first ink 758 → 38, above the fold 0 of 38 → 38 of 38
     *       blocker: the `<div id="stage" style="…height:720px">` in e2/build.mjs's page shell — cited
     *       by name and not by line, because adding the comment that explains it moved the line
     *   e8  fallback 799 → 79, first ink 758 → 38, above the fold 0 of 27 → 27 of 27
     *       the same host in e8/build.mjs, with the LCX mark inside it
     *   e0, e1, e3, e4, e5, e6, e7  UNMOVED, and not "within noise": the full 1194×758 frame is
     *       byte-identical before and after (sha256 of the PNG equal on all seven), because on this path
     *       their canvas is a child of BODY and the walk below touches nothing at all.
     *
     * And on the path this file's own listener exists for — a real `WEBGL_lose_context` after READY, with
     * the JSON diagnostic hidden the way the trial's `hideDiagnostic` hides it — the same measurement found
     * EIGHT of the nine below the fold, because by then every environment except E0 has built itself a
     * `position:relative;overflow:hidden;width:1200px;height:720px` wrapper to clip its projected labels
     * (the `wrap` element in e2/entry.ts, and E1, E4 and E7 carry the same one for the same reason):
     *
     *   e1, e3, e4, e5, e6, e7  766 → 46    e2  923 → 203 (its own prose block sits above the table, and
     *   e8  766 → 46                        is itself above the fold)    e0  46 → 46, it has no wrapper
     *
     * So this is not E2's bug. E2 is the one environment where the reserved box is written into the page
     * shell, and therefore the only one that shows the defect on the refusal path a capture takes.
     *
     * ── WHY `height: auto` AND NOT `display: none`, AND NOT ZERO ─────────────────────────
     * The reserved height is not a mistake: a host that collapses to nothing before the canvas mounts makes
     * the page jump under the reader, so the non-refusing path has to keep it. `auto` RELEASES the
     * reservation instead of overriding it with a second number — the box then sizes to whatever is left
     * inside it, which after the canvas is hidden is usually nothing, and is real content when there is
     * any. `height: 0` and `display: none` would both hide that content, and this file exists to stop a
     * refusal costing the reader information.
     *
     * ── THE WALK RUNS CHILD → PARENT, AND THE MEASUREMENT DEPENDS ON IT ─────────────────
     * `wrap` is inside `#stage` in E2. Reading `#stage` before its own child has been released reports 720
     * px of in-flow content and the clip below would not fire; going upwards from the canvas means every
     * descendant has already collapsed by the time an element is measured. `document.body` is the stop:
     * collapsing it would take the page's padding with it, and nothing reserves space there.
     *
     * `!important` because this is overriding a page author's own declaration on a path where their
     * assumption — that a canvas is about to fill this box — is known to be false, and an inline
     * `height:720px` on the host is only the mildest way that declaration can arrive.
     *
     * ── AND THE CLIP IS CONDITIONAL ON A MEASUREMENT, NOT ON A GUESS ────────────────────
     * `overflow: hidden` is set only when the released box actually collapsed. That is the case where
     * nothing remains IN FLOW, so the clip cannot cost the reader any content — all it can reach is
     * absolutely-positioned overlay content, which on a refusal is positioned against a view that is not
     * being drawn: E1/E2/E4/E7's projected city and node labels (E1 left 18 of them painting over a blank
     * box on the context-loss path, measured above), and E8's mark. Those stay in the DOM, so rule 4's
     * accessibility tree and select-all paths are untouched; what changes is that they no longer paint
     * across the data. A box that still has in-flow content keeps its overflow visible, because there the
     * clip WOULD hide something a reader is entitled to.
     *
     * That the clip does not prune the tree is measured, not argued: on E8's refusal,
     * `Accessibility.getFullAXTree` reports the same one un-ignored node named `LCX` and the same 25 table
     * nodes before and after, and the mark is still `display:block`, `visibility:visible` with its four
     * paths and a 132 px box. What changed in E8's refusal frame is that a quarter of a logo bleeding off
     * the top-left corner is no longer painted, and its three-row material table is, at y79 instead of y799.
     */
    for (const c of dead) {
      for (let el = c.parentElement; el && el !== document.body; el = el.parentElement) {
        el.dataset.lcxReleased = '1';
        /* Reading the box is what applies the rule above, and it is read AFTER this element's own
           descendants have been released — hence the direction of the walk. */
        if (el.getBoundingClientRect().height < 2) el.dataset.lcxReleased = 'clipped';
      }
    }
    /* `preventScroll` because this must not move the viewport: `refused.png` is a tracked capture and
       focus is being moved for the reader who cannot see it, not for the one who can. */
    host.focus({ preventScroll: true });
  }

  /*
   * CONTEXT LOSS IS THE RUNTIME FAILURE RULE 1 EXISTS FOR, AND NOTHING WAS LISTENING.
   *
   * `showRefusal` has always deleted `data-rendered` under a comment saying "a context loss mid-session is
   * exactly the case where the reader needs the data back" — and a grep of docs/3d and packages/gl for
   * `webglcontextlost` returned zero hits, so that branch was unreachable on the only failure it named.
   * Measured on a built E0 after `WEBGL_lose_context.loseContext()`: `gl.isContextLost()` true,
   * `document.title` still READY, the fallback still hidden, and the canvas element a blank white
   * rectangle (its screenshot fell from 101,420 to 5,140 bytes) on a #04060b page. The data was in the
   * document and the reader could not reach any of it.
   *
   * Registered HERE rather than in nine harnesses for the same reason the table is built here: a harness
   * can forget, and this file cannot. CAPTURE phase on the document, because the event is dispatched at a
   * canvas that may not exist yet when this runs — a capture listener on the document reaches a target
   * added later, and reaches it whether or not the event bubbles. `preventDefault()` is required by the
   * WebGL spec, or the context can never be restored.
   *
   * THE CODE IS THE CANONICAL ONE AND THE WORDING IS NOT, deliberately. `CONTEXT_LOST` is already a
   * `StageRefusalCode`, so the code matches what the rest of the programme calls this. Its canonical reason
   * in `packages/gl/src/stage.ts` ends "the view will redraw on the next interaction" — which is true of a
   * product surface and FALSE of these harnesses: they render N frames and stop, nothing redraws them, and a
   * refusal that tells the reader to wait for a repaint that will never come is a false claim in a rendered
   * frame. So the reason is written for what actually happens here.
   */
  document.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    showRefusal('CONTEXT_LOST', 'The GPU dropped the WebGL context for this page mid-session.');
  }, true);

  return {
    markRendered() { host.dataset.rendered = '1'; },
    showRefusal,
  };
}
