/**
 * The ontology, with an OPT-IN orbital reading. The node-link diagram is what loads.
 *
 * ── WHY IT DEFAULTS TO THE DIAGRAM, AND WILL UNTIL SOMEBODY TIMES IT ─────────────────
 * §7 of `3D_VFX_1000X.md` gates every environment on two clauses together: *(a) a stranger stops scrolling*
 * and *(b) an operator still gets their answer at least as fast as the flat version*. It then says exactly what
 * to do when (b) is not established: *"it ships behind a toggle that defaults off, and I tell you rather than
 * quietly shipping it."*
 *
 * (b) is not established. It is not FAILED either — it is UNMEASURED, on all nine environments. The instrument
 * exists (`docs/3d/e9/task.html`: counterbalanced, matched question pairs, a clock that starts when the surface
 * appears, refusing to report a time when accuracy differs) and no operator has run it, because it cannot be
 * run by whoever built the surfaces — the file is its own answer key.
 *
 * So the diagram is what loads, the orrery is one click away, and the button says why. An unmeasured claim
 * shipped as a default is the same defect as a number published without an instrument.
 *
 * ── WHAT THE ORRERY IS ENTITLED TO CLAIM, AND IT IS A NUMBER ─────────────────────────
 * E4 is the strongest argument in the programme for clause (b), and the argument is a count rather than a
 * picture: a drawing in a plane must spend both its axes on layout, so once it also encodes relationship
 * distance it has nothing left with which to keep edges apart, and edges cross. Every crossing in a plane is
 * one a reader cannot resolve, because both edges occupy the same pixels at the same depth.
 *
 * The HUD therefore prints the crossing count for BOTH readings, measured on the graph in front of the reader
 * rather than carried over from the harness — including the shipping diagram's own count, computed from the
 * force layout's own coordinates. If the orbital layout ever fails to beat the plane on that number, it
 * refuses with `THIRD_AXIS_BUYS_NOTHING` and the reader keeps the diagram.
 *
 * ── THE GL IS LAZY, AND THAT IS A BUDGET FACT NOT A PREFERENCE ───────────────────────
 * `OntologyOrreryGl`, the layout module and all of `@lcx/gl` arrive in a separate chunk. The perf budget
 * measures RAW pre-gzip initial JS with about 11 KB of headroom for the entire application, and the
 * environment layer alone is 35.7 KB.
 *
 * ── EVERY REFUSAL LANDS BACK ON THE DIAGRAM ──────────────────────────────────────────
 * §6 rule 1. No WebGL2, a failed shader, a refused float target, a lost context, a brand-fidelity failure, a
 * kind with no orbital plane, a system that merges two entities into one silhouette at every viewpoint, or a
 * body under the nine-pixel floor — all of them resolve here, to the same diagram, with the refusal named to
 * the reader rather than swallowed.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { OrreryReading } from '@/components/geometry/OntologyOrreryGl';
import type { OrreryCouplingInput, OrreryEntityInput, FlatNodeCentre } from '@/components/geometry/orrery/orreryLayout';

const OntologyOrreryGl = lazy(() => import('@/components/geometry/OntologyOrreryGl'));

export interface OntologyOrreryProps {
  /** The entities the diagram is currently drawing. */
  readonly entities: readonly OrreryEntityInput[];
  /** The couplings it is currently drawing. */
  readonly couplings: readonly OrreryCouplingInput[];
  /** Every coupling in the ontology, so the size scale does not shrink an entity because of a layer toggle. */
  readonly allCouplings: readonly { readonly source: string; readonly target: string }[];
  /** The diagram's own node centres, for the flat crossing count. */
  readonly flatCentres?: readonly FlatNodeCentre[];
  readonly flatHalfWidth?: number;
  readonly selectedId?: string | null;
  /** THE FLAT DIAGRAM. Rendered by default, and again as the Suspense fallback. */
  readonly children: ReactNode;
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export function OntologyOrrery({
  entities, couplings, allCouplings, flatCentres, flatHalfWidth, selectedId = null, children,
}: OntologyOrreryProps) {
  const [wantOrrery, setWantOrrery] = useState(false);
  const [refusal, setRefusal] = useState<{ code: string; reason: string } | null>(null);
  const [reading, setReading] = useState<OrreryReading | null>(null);

  /*
   * STABLE, because `OntologyOrreryGl` lists both in an effect's dependencies. A fresh function each render
   * would tear the renderer down and rebuild it on every parent render — a new GL context per keystroke
   * elsewhere on the page, which is exactly what §6 rule 7 exists to prevent.
   */
  const onRefused = useCallback((code: string, reason: string) => {
    setRefusal({ code, reason });
    /* Back to the diagram immediately. A canvas that failed keeps its last frame — or nothing — on screen, and
       a stale picture presented as live data is worse than no picture. */
    setWantOrrery(false);
    setReading(null);
  }, []);
  const onReading = useCallback((r: OrreryReading) => setReading(r), []);

  /*
   * MEMOISED, AND IT IS NOT A MICRO-OPTIMISATION — WITHOUT IT THIS LOOPS FOREVER.
   *
   * The renderer lists `input` in an effect's dependencies, and the effect calls `onReading`, which sets state
   * here. A fresh object literal each render would therefore be: render, build a GL context, report a reading,
   * re-render, build ANOTHER GL context. Not a slow page — an unbounded one, and each iteration allocates a
   * WebGL2 context that §6 rule 7 says an 8 GB machine has sixty of.
   */
  const input = useMemo(
    () => ({ entities, couplings, allCouplings, selectedId, flatCentres, flatHalfWidth }),
    [entities, couplings, allCouplings, selectedId, flatCentres, flatHalfWidth],
  );

  /*
   * A REFUSAL IS ABOUT THE GRAPH THAT WAS ON SCREEN WHEN IT HAPPENED, so changing the graph clears it.
   *
   * The refusal for seventy-four entities says "turn off a layer", and it would be absurd for that sentence to
   * still be sitting there after the reader did. It does NOT re-enter the view — a refusal that retried itself
   * on every filter change would run the viewpoint search on a graph nobody asked to see in three dimensions.
   * Keyed on `input`, which is the memoised identity of the graph rather than a count of it, so two different
   * graphs of the same size are still two different graphs.
   */
  useEffect(() => { setRefusal(null); }, [input]);

  const showOrrery = wantOrrery && refusal === null;

  const L = reading?.layout;

  return (
    <div className="absolute inset-0">
      {showOrrery ? (
        <Suspense fallback={<div className="absolute inset-0">{children}</div>}>
          <OntologyOrreryGl input={input} onRefused={onRefused} onReading={onReading} />
          {/*
            * TEXT STAYS IN THE DOM — §6 rule 4. These labels are projected from the same matrix the frame used
            * and positioned in per-cent, so they survive the device pixel ratio and they print. Only the core
            * and the reader's selection are labelled; naming any entity is what the diagram is for, and that
            * cost is stated below rather than discovered.
            */}
          {reading?.labels.map((lb) => (
            <div
              key={lb.id}
              style={{
                position: 'absolute', left: `${lb.xPct}%`, top: `${lb.yPct}%`,
                transform: 'translate(14px, -50%)', pointerEvents: 'none',
                font: `600 10px/1.2 ${MONO}`, letterSpacing: '.07em', textTransform: 'uppercase',
                color: lb.role === 'core' ? '#BFD6FF' : '#7FE3C0',
                textShadow: '0 1px 3px rgba(0,0,0,.9)', maxWidth: 180,
              }}
            >
              {lb.role === 'core' ? 'CORE · ' : 'SELECTED · '}{lb.label}
            </div>
          ))}
        </Suspense>
      ) : (
        <div className="absolute inset-0">{children}</div>
      )}

      {/* THE CONTROL, and the reason, in the reader's words and on the page. */}
      <div
        className="absolute left-2 top-2 z-10 max-w-[22rem] rounded border border-line bg-card/95 p-2 shadow-sm backdrop-blur"
        style={{ font: `400 10.5px/1.45 ${MONO}` }}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setRefusal(null); setWantOrrery((v) => !v); }}
            aria-pressed={showOrrery}
            style={{
              font: `600 10.5px/1 ${MONO}`, letterSpacing: '.1em', textTransform: 'uppercase',
              background: 'transparent', border: '1px solid var(--line, #26355A)',
              color: 'var(--brand, #2C6BFF)', padding: '6px 10px', cursor: 'pointer',
            }}
          >
            {showOrrery ? 'Diagram' : 'Orrery view'}
          </button>
          <span className="text-grey">
            {showOrrery ? 'Radius = hops · size = couplings · plane = kind' : `${entities.length}N ${couplings.length}E`}
          </span>
        </div>

        {refusal !== null ? (
          <p role="alert" className="mt-2" style={{ color: '#E0A94A' }}>
            Orrery unavailable — <code>{refusal.code}</code>. {refusal.reason} The diagram above is unaffected.
          </p>
        ) : !showOrrery ? (
          /*
           * THE REASON IS NEXT TO THE BUTTON, not in a tooltip and not in a commit message. A reader deciding
           * whether to trust a 3-D reading is entitled to know that nobody has timed it against this diagram.
           */
          <p className="mt-2 text-grey">
            The orbital view is opt-in: nobody has yet timed whether it answers a question faster than this
            diagram. It also carries no entity labels except the core and your selection.
          </p>
        ) : L !== undefined ? (
          <div className="mt-2 space-y-1">
            {/*
              * THE NUMBER THE ENVIRONMENT LIVES ON, measured on this graph at this camera — not carried over
              * from the harness. Every crossing in a plane is ambiguous by construction, which is why the flat
              * figures are printed as "n of n".
              */}
            <p style={{ color: '#BFD6FF' }}>
              {L.crossings.onScreen} CROSSINGS ON SCREEN · {L.crossings.ambiguous} AMBIGUOUS
            </p>
            <p className="text-grey">
              Flattened, this layout: {L.crossings.flatControlInPlane} of {L.crossings.flatControlInPlane}
              {L.crossings.shippingDiagram !== null
                ? ` · the diagram itself: ${L.crossings.shippingDiagram} of ${L.crossings.shippingDiagram}`
                : ' · the diagram itself: not measured, no coordinates supplied'}
            </p>
            {/*
              * THE CAMERA-INDEPENDENT PART, WORDED TO MATCH THE MEASUREMENT RATHER THAN THE AMBITION.
              *
              * Two tubes can only fuse into an unreadable X if they pass within their own combined thickness in
              * 3-D, and that does not depend on where the camera is — so a zero here is a statement about EVERY
              * viewpoint. It is not always zero on this ontology (the fifty-state view measures eleven such
              * pairs), and printing the sentence that assumes it is would be the exact defect §7 exists to stop.
              */}
            <p className="text-grey">
              {L.crossings.grazingPairs3D === 0
                ? `No viewpoint can make any of them ambiguous: no two tubes pass within their own thickness in 3-D (closest ${L.crossings.minSeparation3DM} m).`
                : `${L.crossings.grazingPairs3D} pair(s) of tubes pass within their own thickness in 3-D (closest ${L.crossings.minSeparation3DM} m) — those are the ones a viewpoint can fuse, and the count above is this camera's share of them.`}
            </p>
            <p className="text-grey">
              Core {L.core.label} · {L.counts.observed} measured · {L.counts.absent} absent (amber ring, no
              size) · {L.counts.withheld} withheld (steel drum) · {L.counts.offSystem} off-system, on no orbit
            </p>
            <p className="text-grey">
              Coupling strength is not measured in this ontology, so every tube is one thickness. Bodies
              {' '}{L.px.smallestBody}–{L.px.largestBody} px · rings {L.px.ring} px · one of{' '}
              {L.search.clean} clean viewpoints of {L.search.tried} tried, at {L.view.elevationDeg}° elevation.
            </p>
            {L.crossings.piercedBodies3D > 0 && (
              /* A cost, published rather than gated on: the spacing ladder tried three widths and this is what
                 it could not separate. An entity behind a tube through its middle is hidden, and the reader is
                 owed the number rather than left to notice. */
              <p style={{ color: '#E0A94A' }}>
                {L.crossings.piercedBodies3D} link(s) run through an entity they are not attached to
                {L.crossings.piercedBodiesFlat > 0 ? ` (flattened: ${L.crossings.piercedBodiesFlat})` : ''} —
                that entity is behind a tube here. Click it in the diagram to read it.
              </p>
            )}
            <p className="text-grey">
              The orbits are one frozen phase: this does not turn, and nothing here animates.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-grey">Measuring the layout…</p>
        )}
      </div>
    </div>
  );
}

export default OntologyOrrery;
