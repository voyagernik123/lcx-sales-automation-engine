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
 * ── IT IS THEMED, AND THE REASON THIS COMMENT USED TO GIVE WAS WRONG ─────────────────
 * This said `SurfaceRelief`'s `var(--rule, #26355A)` and `#7FB2FF` were "correct where it is mounted — the
 * command deck", and that only this pair needed tokens because `MarketingCrisis` is light. Both halves were
 * false. Neither `--brand` nor `--rule` is defined anywhere in `apps/web/src/styles/*.css`, so those `var()`
 * calls always took the dark-deck literal; and the command deck is not dark either — it follows the theme,
 * and the app DEFAULTS TO LIGHT (`index.html` adds `.dark` only when localStorage says so, and
 * `CommandDeck`'s print handler strips it). So the four wrappers on "the dark deck" were rendering
 * #7FB2FF at 2.16:1 and their opt-in note at 1.30:1 on the default theme. All seven now use tokens.
 *
 * This file's own control was still short of two floors, both measured: `border-line` is 1.72:1 on the light
 * card and 1.30:1 on the dark one, under the 3:1 WCAG 1.4.11 minimum for a control boundary — so
 * `border-grey` (6.13 / 6.71). And `text-navy` on `hover:bg-ice-soft` is fine for contrast but made the
 * ONLY difference between available and unavailable a text colour; `border-dashed` now says it in shape.
 *
 * ── AND THE CLAIM IS BOUNDED ON THE PAGE ─────────────────────────────────────────────
 * The sentence the volume earns is *the depth of colour here is the total risk between you and that day*.
 * It is exactly true down the day axis and a MIXTURE along a perspective ray, so the calibration and the
 * integration limit are printed next to the view rather than left to be discovered. A picture that
 * over-claims by one clause is worse than a table.
 */
import { lazy, Suspense, useCallback, useId, useMemo, useState } from 'react';
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
  /* The reason lives in a sibling <span>, which a screen reader reaches only in browse mode and only if it
     goes looking. `aria-describedby` puts it on the control it explains. */
  const noteId = useId();

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
          {/*
            THE CALENDAR IS WHAT PRINTS, EVEN WITH THE STORM OPEN — and this page is why the fix started
            here. `MarketingCrisis` mounts `PrintStyles` and is a COMPLIANCE RECORD somebody keeps: a ⌘P
            taken while the storm was open used to put a CANVAS on that record where the risk figures
            belong. §6 rule 1 says print resolves to the existing surface; rule 4 says the DOM text is the
            print path. Both name the calendar.

            IT IS RENDERED, NOT DUPLICATED. This copy and the fallback above are two arms of ONE Suspense
            boundary, so exactly one of them is ever mounted: while the chunk loads the reader keeps the
            visible calendar, and once the storm is drawn the calendar stays in the document as the print
            form. That is what keeps `getByTestId('risk-calendar-…')` unambiguous, which a hidden sibling
            copy alongside a visible one would not.

            `display: none` INLINE, not a class: it must be hidden on screen even where `PrintStyles` is
            not mounted. `PrintStyles`' `[data-relief-print-flat]` rule carries the `!important` that
            beats it on paper, and explains why.
          */}
          <div data-relief-print-flat="" style={{ display: 'none' }} aria-hidden="true">
            <RiskCalendar heightPx={heightPx} {...rest} />
          </div>
          {/* Removed from the printed sheet whole — see `PrintStyles`: hiding the canvas alone would leave
              a relief's projected DOM text floating on white paper over the flat figure. */}
          <div data-relief-live="">
            <StormReliefGl field={field} heightPx={heightPx} onRefused={onRefused} />
          </div>
        </Suspense>
      ) : (
        <RiskCalendar heightPx={heightPx} {...rest} />
      )}

      {/* THE CONTROL AND ITS REASON WEAR THE APP'S TOKENS, NOT E7's FRAME COLOURS — see the header for the
          measured ratios, and for why "SurfaceRelief gets away with it on the dark deck" was false. */}
      <div className="br-no-print mt-1.5 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          /* Unavailable once refused, and while the field itself refuses: offering a toggle that cannot work
             is worse than not offering one. */
          onClick={() => { if (blocked) return; setWantStorm((v) => !v); }}
          /*
           * `aria-disabled` RATHER THAN `disabled`, AND IT IS A FOCUS BUG, NOT A PREFERENCE.
           *
           * `onRefused` fires from the renderer's mount effect — moments after the reader pressed Enter on
           * THIS button, while it still holds focus. Setting `disabled` on the focused element makes the
           * browser blur it, so `document.activeElement` becomes `<body>` and the next Tab restarts from the
           * top of the document. It also drops the control out of the tab ring, the only route from the
           * control to the reason beside it.
           */
          aria-disabled={blocked || undefined}
          aria-pressed={showStorm}
          aria-describedby={noteId}
          /*
           * `border-grey`, not `border-line`: as a control boundary WCAG 1.4.11 wants 3:1, and `--line`
           * measures 1.72 on the light card and 1.30 on the dark one — this control's only boundary was
           * below the non-text floor in both themes. `--grey` is 6.13 / 6.71. `text-micro` (11px) rather
           * than `text-[10px]`: 11px is the app's declared minimum in `tailwind.config.js`.
           * `border-dashed` when unavailable states that state in SHAPE, not only in text colour.
           */
          className={
            'border px-2.5 py-1.5 font-mono text-micro font-bold uppercase tracking-wider '
            + (blocked
              ? 'cursor-not-allowed border-dashed border-grey text-grey'
              : 'cursor-pointer border-grey text-cyan-700 hover:bg-ice-soft dark:text-cyan-400')
          }
        >
          {/*
            THE NAME AGREES WITH `aria-pressed`, WHICH IT DID NOT. This read `Flat calendar` while the storm
            was on, so a screen reader announced "Flat calendar, toggle button, PRESSED" — the label names one
            surface and the state bit asserts the other. Naming the surface once and stating on/off keeps them
            consistent and keeps the accessible name equal to the visible text (WCAG 2.5.3).
          */}
          Storm view: {showStorm ? 'on' : 'off'}
        </button>

        {refusal !== null ? (
          <span id={noteId} role="alert" className="font-mono text-micro leading-relaxed text-status-conditional">
            Storm unavailable — <code>{refusal}</code>. The calendar above is unaffected.
          </span>
        ) : !drawable ? (
          /* `role="alert"`, WHICH IT DID NOT HAVE. Only the renderer's refusal was announced; a field that goes
             from readable to refused — a feed dropping out under a rebuilt calendar — silently greyed the control
             and put its reason in a sibling nobody was told about. `aria-describedby` is the on-demand route to
             the same node; the alert is the interruption. (Present-at-mount live regions are not announced by
             real screen readers, so this costs nothing on first paint.) */
          <span id={noteId} role="alert" className="font-mono text-micro leading-relaxed text-grey-dark">
            No field to march: the calendar refused, so the volumetric reading refuses with it.
          </span>
        ) : (
          /*
           * THE REASON IS BESIDE THE BUTTON, not in a tooltip and not in a commit message. A reader
           * deciding whether to trust a volumetric reading is entitled to know nobody has timed it
           * against the table.
           */
          <span id={noteId} className="font-mono text-micro leading-relaxed text-grey-dark">
            Storm view is opt-in: nobody has yet timed whether it answers faster than this calendar.
          </span>
        )}
      </div>

      {/*
        THE CALIBRATION SENTENCE IS THE VOLUME'S CAPTION, SO IT LEAVES WITH THE VOLUME.
        On paper the storm is now replaced by the calendar, and this sentence's first clause — "depth of
        colour is the total risk BETWEEN YOU AND that day" — is a claim about accumulation along a ray
        that the calendar does not make: a calendar cell is one day's own risk. A caption for a figure
        that is not on the sheet is how E1's harness came to print E0's frame time under a claim that
        every row was checkable.

        `data-relief-live` rather than `br-no-print`, and the difference is not the print result — both
        are deleted by the same sheet. It is that this attribute names the BLOCK the sentence describes,
        so the caption cannot drift away from the figure: anything that changes how the live relief
        prints changes its caption in the same edit. It stays fully visible on screen either way.
      */}
      {showStorm && (
        <p
          data-relief-live=""
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
