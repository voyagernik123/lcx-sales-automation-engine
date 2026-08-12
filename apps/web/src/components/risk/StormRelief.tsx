/**
 * The forward risk calendar, with an OPT-IN volumetric reading. A drop-in replacement for `RiskCalendar`.
 *
 * ── WHY IT DEFAULTS TO FLAT, AND WILL UNTIL SOMEBODY TIMES IT ────────────────────────
 * §7 of `3D_VFX_1000X.md` gates every environment on two clauses together: *(a) a stranger stops scrolling*
 * and *(b) an operator still gets their answer at least as fast as the flat version*. It then says exactly
 * what to do when (b) is not established: *"it ships behind a toggle that defaults off, and I tell you
 * rather than quietly shipping it."*
 *
 * (b) is not established for E7. It is not FAILED — it is UNMEASURED, as it is on all nine environments.
 * `docs/3d/e7/README.md` says so in its own words: *"No operator has been put in front of the storm and
 * the heatmap with a task and a stopwatch."* The instrument exists (`docs/3d/e9/task.html`) and cannot be
 * run by whoever built the scene, because the file is its own answer key.
 *
 * So the calendar is what loads, the storm is one click away, and the button says why.
 *
 * ── THE GL IS LAZY, AND THAT IS A BUDGET FACT NOT A PREFERENCE ───────────────────────
 * `StormReliefGl` and all of `@lcx/gl`'s environment layer arrive in a separate chunk. The perf budget
 * measures RAW pre-gzip initial JS against 850 KB with single-digit KB of headroom for the whole
 * application, and the env layer alone is 35.7 KB. An eager import would blow it on a view most readers
 * never open.
 *
 * ── EVERY REFUSAL LANDS BACK ON THE CALENDAR ─────────────────────────────────────────
 * §6 rule 1. No WebGL2, a failed shader, a refused float target, a MISSING OES_texture_float_linear
 * (which `createVolumeField` refuses on rather than falling back to NEAREST and shipping a voxel
 * aesthetic), a brand-fidelity failure, a field with no observed day, and a lost context all resolve
 * here — to the same figure, carrying the same measurements, with the refusal named to the reader.
 *
 * ── IT IS THEMED, BECAUSE IT DOES NOT SHIP ON THE DARK DECK ──────────────────────────
 * `SurfaceRelief` styles its control with `var(--rule, #26355A)` and `#7FB2FF`, which is correct where it
 * is mounted — the command deck. This pair mounts on `MarketingCrisis`, a LIGHT surface, and the first
 * draft of both files inherited E7's frame colours: a pale blue control and near-white body text on white.
 * Every interface colour here now goes through the app's tokens and re-themes with the page.
 *
 * ── AND THE CLAIM IS BOUNDED ON THE PAGE ─────────────────────────────────────────────
 * The sentence the volume earns is *the depth of colour here is the total risk between you and that day*.
 * It is exactly true down the day axis and a MIXTURE along a perspective ray, so the calibration and the
 * integration limit are printed next to the view rather than left to be discovered. A picture that
 * over-claims by one clause is worse than a table.
 */
import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { RiskCalendar, type RiskCalendarProps } from './RiskCalendar';
import { isRiskField } from './riskField';
import { RAMP_SATURATION_RISK, calibrationSentence } from './stormCalibration';

const StormReliefGl = lazy(() => import('./StormReliefGl'));

/**
 * `field` should be STABLE across renders — module-level, or from `useMemo`. The GL component lists it in
 * an effect's dependencies, so a field rebuilt every render rebuilds the GL context every render.
 */
export type StormReliefProps = RiskCalendarProps;

export function StormRelief({ heightPx = 260, ...rest }: StormReliefProps) {
  const [wantStorm, setWantStorm] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  /*
   * STABLE, because `StormReliefGl` lists it in an effect's dependency array. A fresh function each
   * render would tear the renderer down and rebuild it on every parent render — a new GL context per
   * keystroke elsewhere on the page, which is what §6 rule 7 exists to prevent.
   */
  const onRefused = useCallback((code: string) => {
    setRefusal(code);
    /* Back to flat immediately. A canvas that failed keeps its last frame — or nothing — on screen, and
       a stale picture presented as live data is worse than no picture. */
    setWantStorm(false);
  }, []);

  const field = rest.field;

  /* Counted here rather than in the shader, because the shader cannot report and the sentence beside the
     view is where the over-claim would otherwise live. */
  const cellsAboveRampSaturation = useMemo(() => {
    if (!isRiskField(field)) return 0;
    let n = 0;
    for (let l = 0; l < field.lanes.length; l++) {
      for (let d = 0; d < field.days.length; d++) {
        for (let b = 0; b < field.bands.length; b++) {
          const v = field.cell(l, d, b);
          if (v !== null && v > RAMP_SATURATION_RISK) n++;
        }
      }
    }
    return n;
  }, [field]);

  /* A refused field never reaches the renderer: it would be handed a calendar the flat figure declined to
     draw, which is the worst possible direction for a disagreement to run. */
  const drawable = isRiskField(field);
  const showStorm = wantStorm && refusal === null && drawable;
  const blocked = refusal !== null || !drawable;

  return (
    <div>
      {showStorm ? (
        <Suspense fallback={<RiskCalendar heightPx={heightPx} {...rest} />}>
          <StormReliefGl field={field} heightPx={heightPx} onRefused={onRefused} />
        </Suspense>
      ) : (
        <RiskCalendar heightPx={heightPx} {...rest} />
      )}

      {/*
        THE CONTROL AND ITS REASON WEAR THE APP'S TOKENS, NOT E7's FRAME COLOURS. `SurfaceRelief` gets away
        with `var(--rule, #26355A)` and `#7FB2FF` because it is mounted on the dark command deck; this pair
        goes on a LIGHT page, and a hardcoded pale blue on white is a control nobody can find.
      */}
      <div className="br-no-print mt-1.5 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => { setWantStorm((v) => !v); }}
          /* Disabled once refused, and while the field itself refuses: offering a toggle that cannot work
             is worse than not offering one. */
          disabled={blocked}
          className={
            'border px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider '
            + (blocked
              ? 'cursor-not-allowed border-line text-grey'
              : 'cursor-pointer border-line text-navy hover:bg-ice-soft')
          }
          aria-pressed={showStorm}
        >
          {showStorm ? 'Flat calendar' : 'Storm view'}
        </button>

        {refusal !== null ? (
          <span role="alert" className="font-mono text-micro leading-relaxed text-status-conditional">
            Storm unavailable — <code>{refusal}</code>. The calendar above is unaffected.
          </span>
        ) : !drawable ? (
          <span className="font-mono text-micro leading-relaxed text-grey-dark">
            No field to march: the calendar refused, so the volumetric reading refuses with it.
          </span>
        ) : (
          /*
           * THE REASON IS BESIDE THE BUTTON, not in a tooltip and not in a commit message. A reader
           * deciding whether to trust a volumetric reading is entitled to know nobody has timed it
           * against the table.
           */
          <span className="font-mono text-micro leading-relaxed text-grey-dark">
            Storm view is opt-in: nobody has yet timed whether it answers faster than this calendar.
          </span>
        )}
      </div>

      {showStorm && (
        <p
          data-testid="storm-calibration"
          className="mt-1 font-mono text-[10px] leading-relaxed text-grey-dark"
        >
          {`Depth of colour is the total risk between you and that day. ${calibrationSentence(isRiskField(field) ? field.bands.length : 0, cellsAboveRampSaturation)} `}
          The exact instrument for one channel and one band is an orthographic camera down the day axis —
          which is this calendar.
        </p>
      )}
    </div>
  );
}
