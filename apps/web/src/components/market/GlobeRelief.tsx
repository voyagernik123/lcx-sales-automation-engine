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
 * (b) is not established. It is not FAILED either — it is UNMEASURED, on all nine environments. The
 * instrument exists (`docs/3d/e9/task.html`: counterbalanced, matched question pairs, a clock that starts
 * when the surface appears, refusing to report a time when accuracy differs) and no operator has run it,
 * because it cannot be run by whoever built the surfaces — the file is its own answer key.
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
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { MapPoint } from '@/lib/api/bd';

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
  const [wantRelief, setWantRelief] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [heightPx, setHeightPx] = useState<number | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);

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
    setWantRelief(false);
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
          onClick={() => { setWantRelief((v) => !v); }}
          /* Disabled once refused: offering a toggle that cannot work is worse than not offering one. */
          disabled={refusal !== null}
          style={{
            font: '600 10.5px/1 ui-monospace, monospace', letterSpacing: '.1em', textTransform: 'uppercase',
            background: 'transparent', border: '1px solid var(--rule, #26355A)',
            color: refusal !== null ? '#6B7A99' : 'var(--brand, #7FB2FF)',
            padding: '7px 11px', cursor: refusal !== null ? 'not-allowed' : 'pointer',
          }}
          aria-pressed={showRelief}
        >
          {showRelief ? 'Scatter view' : 'Globe view'}
        </button>

        {refusal === null ? (
          /*
           * BOTH REASONS, NEXT TO THE BUTTON. The first is §7(b): nobody has timed this against the scatter.
           * The second is this environment's own limit, and it belongs BEFORE the click rather than only on
           * the frame — a reader who opens a globe expecting to see where partners are has already been
           * misled by the time they read the caption.
           */
          <span style={{ font: '400 10.5px/1.4 ui-monospace, monospace', color: 'rgba(196,212,240,.66)' }}>
            The globe is opt-in: it places REGIONS at published reference points, never organisations — this
            dataset has no per-project coordinates — and nobody has yet timed whether it answers faster than
            this scatter.
          </span>
        ) : (
          <span role="alert" style={{ font: '500 10.5px/1.4 ui-monospace, monospace', color: '#E0A94A' }}>
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
