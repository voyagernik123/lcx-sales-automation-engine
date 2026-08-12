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
import { lazy, Suspense, useCallback, useState } from 'react';
import { SurfacePlot, type SurfacePlotProps } from '@/components/geometry/SurfacePlot';

const SurfaceReliefGl = lazy(() => import('@/components/geometry/SurfaceReliefGl'));

/** Iso-levels for the ribbons, in the data's own units. */
export interface SurfaceReliefProps extends SurfacePlotProps {
  readonly contourLevels?: readonly number[];
}

export function SurfaceRelief({ contourLevels = [], ...plot }: SurfaceReliefProps) {
  const [wantRelief, setWantRelief] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

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
          <SurfaceReliefGl
            surface={plot.surface}
            heightPx={plot.heightPx ?? 320}
            onRefused={onRefused}
            contourLevels={contourLevels}
          />
        </Suspense>
      ) : (
        <SurfacePlot {...plot} />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
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
          {showRelief ? 'Flat view' : 'Relief view'}
        </button>

        {refusal === null ? (
          /*
           * THE REASON IS ON THE BUTTON, not in a tooltip and not in a commit message. A reader deciding whether
           * to trust a 3-D reading is entitled to know that nobody has timed it against the flat one.
           */
          <span style={{ font: '400 10.5px/1.4 ui-monospace, monospace', color: 'rgba(196,212,240,.66)' }}>
            Relief is opt-in: nobody has yet timed whether it answers faster than this figure.
          </span>
        ) : (
          <span
            role="alert"
            style={{ font: '500 10.5px/1.4 ui-monospace, monospace', color: '#E0A94A' }}
          >
            Relief unavailable — <code>{refusal}</code>. The measurements above are unaffected.
          </span>
        )}
      </div>
    </div>
  );
}
