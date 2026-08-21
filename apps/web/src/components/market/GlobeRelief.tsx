/**
 * The market map, with an OPT-IN globe reading — E2 THE GLOBE.
 *
 * ── WHAT THIS WRAPS, AND WHY IT WRAPS IT THIS WAY ────────────────────────────────────
 * `MarketScatter` takes seven props and owns its own hover, brush and selection. Rather than thread all of
 * that through a second component, the flat view is passed straight through as `children` and rendered
 * UNCHANGED — the smallest honest unit, and the same shape `VaultRelief` uses on the audit log. What the
 * page renders today is exactly what a reader who does nothing still gets.
 *
 * ── WHY IT DEFAULTS TO THE SCATTER, AND WILL UNTIL SOMEBODY TIMES IT ─────────────────
 * §7 of `3D_VFX_1000X.md` gates every environment on two clauses TOGETHER: *(a) a stranger stops scrolling*
 * and *(b) an operator still gets their answer at least as fast as the flat version*. It then says exactly
 * what to do when (b) is not established: *"it ships behind a toggle that defaults off, and I tell you
 * rather than quietly shipping it."*
 *
 * (b) is not established. It is not FAILED either — it is UNMEASURED on the seven environments the clause
 * reaches, and NOT APPLICABLE on the eighth. `3D_VFX_1000X.md` §11.4 settles that split: E8 THE FORGE
 * carries no dataset and answers no question, so recording it as unmeasured "would imply outstanding work
 * that does not exist", and E1's deferral was lifted when its flat table gained a front-to-back ordinal
 * column. All seven are instrumented in `docs/3d/e9/task.html`, which states its own coverage
 * (counterbalanced, matched question pairs, a clock that starts when the surface appears, refusing to report
 * a time when accuracy differs) — and no operator has run it, because it cannot be run by whoever built the
 * surfaces: the file is its own answer key.
 *
 * This paragraph read "UNMEASURED, on all nine environments" until it was checked against that record. Nine
 * is the count of e0–e8 HARNESSES the E9 sweep loads, not of shipping environments: the app ships eight,
 * E1–E8, and clause (b) reaches seven of them.
 *
 * ── AND THE SECOND REASON, WHICH IS SPECIFIC TO THIS ENVIRONMENT ─────────────────────
 * The reader is told, before they click, that the globe places REGIONS and not organisations. E2 is the one
 * environment whose subject is geography while its dataset has none: `MapPoint` carries a coarse `region`
 * string and no coordinates. A globe that a reader mistakes for a map of where partners are would be worse
 * than no globe, so the caveat sits beside the button rather than only on the frame.
 *
 * ── THE GL IS LAZY, AND THAT IS A BUDGET FACT NOT A PREFERENCE ───────────────────────
 * `GlobeReliefGl`, `globeSites` and all of `@lcx/gl`'s environment layer arrive in a separate chunk. The
 * perf budget measures RAW pre-gzip initial JS at 839/850 KB — 11 KB of headroom for the entire
 * application — and the env layer alone is 35.7 KB. An eager import would blow the budget on a view most
 * readers never open.
 *
 * ── EVERY REFUSAL LANDS BACK ON THE SCATTER ──────────────────────────────────────────
 * §6 rule 1. No WebGL2, a failed shader, a refused float target, a refused mesh upload, a brand-fidelity
 * failure, an empty universe, a universe with no placeable region, and a LOST CONTEXT all resolve here — to
 * the same scatter, carrying the same projects, with the refusal named to the reader rather than swallowed.
 */
import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { MapPoint } from '@/lib/api/bd';
import { useReliefPreference } from '@/lib/reliefPreference';

/**
 * ── THE CONTROL WEARS THE APP'S TOKENS, BECAUSE `--brand` AND `--rule` DO NOT EXIST ──
 *
 * The first draft used `var(--brand, #7FB2FF)` and `var(--rule, #26355A)`. Neither token is defined
 * anywhere in `apps/web/src/styles/*.css`, so both always took their dark-deck literal, and the app
 * DEFAULTS TO LIGHT (`index.html` adds `.dark` only when localStorage says so). Measured on card
 * #FFFFFF / canvas #F4F6FB light, #10182B / #090E1B dark:
 *   #7FB2FF label            2.16 / 2.00 light   (8.18 / 8.91 dark)   needs 4.5
 *   rgba(196,212,240,.66)    1.30 / 1.23 light   (5.79 / 6.04 dark)   needs 4.5
 *   #E0A94A refusal alert    2.11 / 1.95 light   (8.37 / 9.12 dark)   needs 4.5
 *   #6B7A99 disabled label   4.31 / 3.99 light    4.10 / 4.47 dark    needs 4.5 — FAILS EVERYWHERE
 *
 * That 1.30:1 note is the one carrying this environment's OWN caveat — that the globe places regions
 * and never organisations. The whole argument for putting it before the click rather than only on the
 * frame was that a misled reader has already been misled by the time they read the caption; at 1.30:1
 * on the default theme they never read either.
 *
 * Tokens below, measured card / canvas per theme:
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

const GlobeReliefGl = lazy(() => import('@/components/market/GlobeReliefGl'));

export interface GlobeReliefProps {
  /** The same visible universe the scatter is drawing. One dataset, two drawings. */
  readonly points: readonly MapPoint[];
  /** The flat view, exactly as the page renders it. Rendered unchanged, and it is the default. */
  readonly children: ReactNode;
}

/**
 * The canvas needs a pixel height and the pane is a flex child, so it has to be measured.
 *
 * QUANTISED TO 24 px, and the reason is `stage.dispose()`. The renderer's effect lists `heightPx` in its
 * dependencies, so every distinct value tears the GL context down and builds a new one; an unquantised
 * `ResizeObserver` feeding a window drag would build a context per animation frame, which is exactly the
 * exhaustion §6 rule 7 exists to prevent. A step means a drag costs a handful of rebuilds instead of
 * hundreds, and 24 px of framing error on a globe is invisible.
 */
const HEIGHT_STEP = 24;
const MIN_HEIGHT = 260;
/**
 * ROOM UNDER THE FRAME FOR THE THINGS THE FIGURE COULD NOT PLACE.
 *
 * The globe is not the whole view: beneath it sit the corridor list, the regions with no listings, anything
 * behind the limb, and every project this figure has no defensible point for. Sizing the canvas to the whole
 * pane would push all of that out of an `overflow: hidden` ancestor — and the one thing that must never be the
 * clipped part of this component is the list of what it left out. The renderer lets the remainder scroll if a
 * long unplaced list needs more than this.
 */
const NOTES_RESERVE_PX = 96;

export function GlobeRelief({ points, children }: GlobeReliefProps) {
  // Owner decision 2026-08-20: the default lives in ONE module, and the operator's choice
  // is remembered. `revoke` exists so a GL refusal is never recorded as a preference.
  const { on: wantRelief, choose: chooseRelief, revoke: revokeRelief } = useReliefPreference('globe');
  const [refusal, setRefusal] = useState<string | null>(null);
  const [heightPx, setHeightPx] = useState<number | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  /* The reason lives in a sibling <span>, which a screen reader reaches only in browse mode and only if it
     goes looking. `aria-describedby` puts it on the control it explains. */
  const noteId = useId();

  /*
   * STABLE, because `GlobeReliefGl` lists it in an effect's dependencies. A fresh function each render would
   * tear the renderer down and rebuild it on every parent render — a new GL context per hover on the
   * scatter, which is what §6 rule 7 exists to prevent.
   */
  const onRefused = useCallback((code: string) => {
    setRefusal(code);
    /* Back to the scatter immediately. A canvas that failed keeps its last frame — or nothing — on screen,
       and on a figure whose reading is "which desks are awake right now" a frozen terminator is a wrong
       answer rather than a stale one. */
    revokeRelief();
  }, []);

  /* Measured only while the relief is wanted: a reader who never opens it should not pay for an observer. */
  useEffect(() => {
    if (!wantRelief) return;
    const el = paneRef.current;
    if (!el) return;
    const measure = (): void => {
      const h = el.getBoundingClientRect().height - NOTES_RESERVE_PX;
      if (h > 0) setHeightPx(Math.max(MIN_HEIGHT, Math.floor(h / HEIGHT_STEP) * HEIGHT_STEP));
    };
    measure();
    /*
     * MEASURE FIRST, OBSERVE ONLY IF THE OBSERVER EXISTS. `ResizeObserver` is absent in jsdom and in older
     * engines, and constructing it unguarded throws INSIDE an effect — which React escalates to unmounting
     * the whole subtree, taking the scatter down with it. The consequence would be a reader losing their data
     * because a resize observer was missing, which inverts this component's entire contract. Without it the
     * globe simply keeps the height it was first measured at.
     */
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wantRelief]);

  const showRelief = wantRelief && refusal === null;

  return (
    <div className="flex h-full w-full min-h-0 flex-col">
      {/* THE TOGGLE SITS ABOVE THE VIEW. The scatter fills the pane and brushes on drag; a control below it
          would be a control a reader has to find past a full-height field. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '2px 4px 8px' }}>
        <button
          type="button"
          /* Unavailable once refused: offering a toggle that cannot work is worse than not offering one. */
          onClick={() => { if (refusal !== null) return; chooseRelief(!wantRelief); }}
          /*
           * `aria-disabled` RATHER THAN `disabled`, AND IT IS A FOCUS BUG, NOT A PREFERENCE.
           *
           * `onRefused` fires from the renderer's mount effect — moments after the reader pressed Enter on
           * THIS button, while it still holds focus. Setting `disabled` on the focused element makes the
           * browser blur it, so `document.activeElement` becomes `<body>` and the next Tab restarts from the
           * top of the document. It also drops the control out of the tab ring, which is the only route from
           * the control to the reason beside it, so a non-sighted operator got a refusal they could not reach.
           */
          aria-disabled={refusal !== null || undefined}
          aria-pressed={showRelief}
          aria-describedby={noteId}
          className={`${CONTROL} ${refusal !== null ? CONTROL_OFF : CONTROL_ON}`}
        >
          {/*
            THE NAME AGREES WITH `aria-pressed`, WHICH IT DID NOT. This read `Scatter view` while the globe was
            on, so a screen reader announced "Scatter view, toggle button, PRESSED" — the label names one surface
            and the state bit asserts the other. Naming the surface once and stating on/off keeps them consistent
            and keeps the accessible name equal to the visible text (WCAG 2.5.3).
          */}
          Globe view: {showRelief ? 'on' : 'off'}
        </button>

        {refusal === null ? (
          /*
           * BOTH FACTS, NEXT TO THE BUTTON — and on it, via `aria-describedby`. The first is this
           * environment's own limit, and it belongs BEFORE any click rather than only on the frame — a
           * reader who opens a globe expecting to see where partners are has already been misled by the
           * time they read the caption. The second is the provenance of the default: an owner decision
           * (2026-08-20), made after timing it against the scatter proved unmeasurable — see
           * lib/reliefPreference.ts for the whole story. An earlier edit left this caption saying
           * "opt-in" in one sentence and "the default" in the next; a caption that contradicts itself
           * teaches the reader to trust neither half.
           */
          <span id={noteId} className={NOTE}>
            The globe places REGIONS at published reference points, never organisations — this dataset has
            no per-project coordinates. It is the default by owner decision, not by measurement; the
            scatter is one press away and your choice is remembered.
          </span>
        ) : (
          <span id={noteId} role="alert" className={ALERT}>
            Globe view unavailable — <code>{refusal}</code>. Every project in the scatter is unaffected.
          </span>
        )}
      </div>

      <div ref={paneRef} className="min-h-0 flex-1">
        {showRelief && heightPx !== null ? (
          /* The Suspense fallback IS the scatter rather than a spinner: a reader who clicked has not asked to
             lose the universe they were reading for the length of a network round trip. */
          <Suspense fallback={children}>
            <GlobeReliefGl points={points} heightPx={heightPx} onRefused={onRefused} />
          </Suspense>
        ) : (
          /* Also the state BEFORE the first measurement lands, for the same reason: one frame of blank pane
             is one frame of a reader's data missing. */
          children
        )}
      </div>
    </div>
  );
}
