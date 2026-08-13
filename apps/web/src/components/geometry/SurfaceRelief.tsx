/**
 * The score surface, with an OPT-IN three-dimensional reading. A drop-in replacement for `SurfacePlot`.
 *
 * ── WHY IT DEFAULTS TO FLAT, AND WILL UNTIL SOMEBODY TIMES IT ────────────────────────
 * §7 of `3D_VFX_1000X.md` gates every environment on two clauses together: *(a) a stranger stops scrolling*
 * and *(b) an operator still gets their answer at least as fast as the flat version*. It then says exactly
 * what to do when (b) is not established: *"it ships behind a toggle that defaults off, and I tell you rather
 * than quietly shipping it."*
 *
 * (b) is not established. It is not FAILED either — it is UNMEASURED, on all nine environments. The instrument
 * exists (`docs/3d/e9/task.html`: counterbalanced, matched question pairs, a clock that starts when the surface
 * appears, refusing to report a time when accuracy differs) and no operator has run it, because it cannot be
 * run by whoever built the surfaces — the file is its own answer key.
 *
 * So the flat figure is what loads, the relief is one click away, and the button says why. An unmeasured claim
 * shipped as a default is the same defect as a number published without an instrument, and this programme has
 * already published two of those.
 *
 * ── THE GL IS LAZY, AND THAT IS A BUDGET FACT NOT A PREFERENCE ───────────────────────
 * `SurfaceReliefGl` and all of `@lcx/gl`'s environment layer arrive in a separate chunk. The perf budget
 * measures RAW pre-gzip initial JS at 839/850 KB — 11 KB of headroom for the entire application — and the env
 * layer alone is 35.7 KB. An eager import would blow the budget on a view most readers never open.
 *
 * ── EVERY REFUSAL LANDS BACK ON THE FLAT SURFACE ─────────────────────────────────────
 * §6 rule 1. No WebGL2, a failed shader, a refused float target, a lost context, a brand-fidelity failure, or
 * a grid with no observed cell all resolve here — to the same figure, carrying the same measurements, with the
 * refusal named to the reader rather than swallowed.
 */
import { lazy, Suspense, useCallback, useId, useState } from 'react';
import { SurfacePlot, type SurfacePlotProps } from '@/components/geometry/SurfacePlot';

/**
 * ── THE CONTROL WEARS THE APP'S TOKENS, AND THE COMMENT THAT SAID OTHERWISE WAS WRONG ──
 *
 * `StormRelief`'s header says this file "gets away with `var(--rule, #26355A)` and `#7FB2FF`
 * because it is mounted on the dark command deck". It does not get away with it, on two counts:
 * neither `--brand` nor `--rule` is defined anywhere in `apps/web/src/styles/*.css`, so both
 * `var()` calls always took the dark-deck literal; and the command deck is not dark — it follows
 * the theme, and the app DEFAULTS TO LIGHT (`index.html` adds `.dark` only from localStorage).
 *
 * Measured on card #FFFFFF / canvas #F4F6FB light, #10182B / #090E1B dark:
 *   #7FB2FF label            2.16 / 2.00 light   (8.18 / 8.91 dark)   needs 4.5
 *   rgba(196,212,240,.66)    1.30 / 1.23 light   (5.79 / 6.04 dark)   needs 4.5
 *   #E0A94A refusal alert    2.11 / 1.95 light   (8.37 / 9.12 dark)   needs 4.5
 *   #6B7A99 disabled label   4.31 / 3.99 light    4.10 / 4.47 dark    needs 4.5 — FAILS EVERYWHERE
 *
 * On the default theme the refusal §6 rule 1 exists to deliver measured 2.11:1, and printing forces
 * light, so it printed too. Tokens below, measured card / canvas per theme:
 *   text-cyan-700 / dark:text-cyan-400   5.36 / 4.96  ·  9.78 / 10.66
 *   text-grey (unavailable)              6.13 / 5.67  ·  6.71 / 7.30
 *   text-grey-dark (note)               11.54 / 10.67 · 11.39 / 12.40
 *   text-status-conditional (refusal)    5.65 / 5.22  ·  7.94 / 8.64
 * `border-grey` rather than `border-line`: a control boundary wants 3:1 under WCAG 1.4.11 and
 * `--line` measures 1.72 / 1.59 light, 1.30 / 1.42 dark.
 */
const CONTROL = 'border px-2.5 py-1.5 font-mono text-micro font-bold uppercase tracking-wider';
const CONTROL_ON = 'cursor-pointer border-grey text-cyan-700 hover:bg-ice-soft dark:text-cyan-400';
/** `border-dashed` states unavailable in SHAPE. It was text colour alone, plus a mouse-only cursor. */
const CONTROL_OFF = 'cursor-not-allowed border-dashed border-grey text-grey';
const NOTE = 'font-mono text-micro leading-snug text-grey-dark';
const ALERT = 'font-mono text-micro leading-snug text-status-conditional';

const SurfaceReliefGl = lazy(() => import('@/components/geometry/SurfaceReliefGl'));

/** Iso-levels for the ribbons, in the data's own units. */
export interface SurfaceReliefProps extends SurfacePlotProps {
  readonly contourLevels?: readonly number[];
}

export function SurfaceRelief({ contourLevels = [], ...plot }: SurfaceReliefProps) {
  const [wantRelief, setWantRelief] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  /* The reason lives in a sibling <span>, which a screen reader reaches only in browse mode and only if it
     goes looking. `aria-describedby` puts it on the control it explains. */
  const noteId = useId();

  /*
   * STABLE, because `SurfaceReliefGl` lists it in an effect's dependencies. A fresh function each render would
   * tear the renderer down and rebuild it on every parent render — a new GL context per keystroke elsewhere on
   * the page, which is exactly what §6 rule 7 exists to prevent.
   */
  const onRefused = useCallback((code: string) => {
    setRefusal(code);
    /* Back to flat immediately. A canvas that failed keeps its last frame — or nothing — on screen, and a stale
       picture presented as live data is worse than no picture. */
    setWantRelief(false);
  }, []);

  const showRelief = wantRelief && refusal === null;

  return (
    <div>
      {showRelief ? (
        <Suspense fallback={<SurfacePlot {...plot} />}>
          {/*
            THE FLAT FIGURE IS WHAT PRINTS, EVEN WITH THE RELIEF OPEN. E5 reaches paper through
            `CockpitPanels` on `CommandDeck`, which mounts `PrintStyles` and offers a board pack — and this
            figure's own value is the one thing a canvas cannot put on paper: the axis tokens, the tick
            labels and the withheld/absent cells as DOM text (§6 rule 4).

            Two arms of ONE Suspense boundary, so exactly one is mounted: the reader keeps the visible
            figure while the chunk loads, and it stays in the document as the print form once the relief is
            drawn. `display: none` is INLINE so the copy is hidden on screen even on a page with no print
            sheet; `PrintStyles`' `[data-relief-print-flat]` rule carries the `!important` that beats it.
          */}
          <div data-relief-print-flat="" style={{ display: 'none' }} aria-hidden="true">
            <SurfacePlot {...plot} />
          </div>
          {/* Removed from the printed sheet whole, not just its canvas — see `PrintStyles`. */}
          <div data-relief-live="">
            <SurfaceReliefGl
              surface={plot.surface}
              heightPx={plot.heightPx ?? 320}
              onRefused={onRefused}
              contourLevels={contourLevels}
            />
          </div>
        </Suspense>
      ) : (
        <SurfacePlot {...plot} />
      )}

      {/* `br-no-print`: on paper the figure above is the artefact, so the toggle and its "nobody has timed
          this" sentence are chrome on a board pack. Same rule `StormRelief` already carried. */}
      <div className="br-no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          /* Unavailable once refused: offering a toggle that cannot work is worse than not offering one. */
          onClick={() => { if (refusal !== null) return; setWantRelief((v) => !v); }}
          /*
           * `aria-disabled` RATHER THAN `disabled`, AND IT IS A FOCUS BUG, NOT A PREFERENCE.
           *
           * `onRefused` fires from the renderer's mount effect — moments after the reader pressed Enter on THIS
           * button, while it still holds focus. Setting `disabled` on the focused element makes the browser blur
           * it, so `document.activeElement` becomes `<body>` and the next Tab restarts from the top of the
           * document. It also drops the control out of the tab ring, which is the only route from the control to
           * the reason beside it, so a non-sighted operator got a refusal they could not reach.
           */
          aria-disabled={refusal !== null || undefined}
          aria-pressed={showRelief}
          aria-describedby={noteId}
          className={`${CONTROL} ${refusal !== null ? CONTROL_OFF : CONTROL_ON}`}
        >
          {/*
            THE NAME AGREES WITH `aria-pressed`, WHICH IT DID NOT. This read `Flat view` while relief was on, so
            a screen reader announced "Flat view, toggle button, PRESSED" — the label names one surface and the
            state bit asserts the other. Naming the surface once and stating on/off keeps them consistent and
            keeps the accessible name equal to the visible text (WCAG 2.5.3).
          */}
          Relief view: {showRelief ? 'on' : 'off'}
        </button>

        {refusal === null ? (
          /*
           * THE REASON IS ON THE BUTTON, not in a tooltip and not in a commit message — and now literally on it,
           * via `aria-describedby`. A reader deciding whether to trust a 3-D reading is entitled to know that
           * nobody has timed it against the flat one.
           */
          <span id={noteId} className={NOTE}>
            Relief is opt-in: nobody has yet timed whether it answers faster than this figure.
          </span>
        ) : (
          <span id={noteId} role="alert" className={ALERT}>
            Relief unavailable — <code>{refusal}</code>. The measurements above are unaffected.
          </span>
        )}
      </div>
    </div>
  );
}
