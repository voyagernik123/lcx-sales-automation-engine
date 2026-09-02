/**
 * The forward risk calendar, with an OPT-IN volumetric reading. A drop-in replacement for `RiskCalendar`.
 *
 * ── E7 IS BUILT AND GATED ON DATA, WHICH IS NOT THE SAME AS "SHIPPING" ───────────────
 * On the only route that mounts this component the storm cannot be turned on — not by anybody, on any
 * machine, today. That is the rule working, not a defect, and it is written down here because "all eight
 * environments ship" is true of the CODE and false of what a reader can OPEN: seven reliefs draw on some
 * route of the app, and this one draws only in its harness (`docs/3d/e7/live.html`, whose data is synthetic
 * and declared in amber — 39 flagged items, `docs/3d/e7/README.md:247`).
 *
 * The chain, so it is re-checkable rather than believed:
 *   `router.tsx:276` routes `marketing/crisis` → `MarketingCrisis.tsx:1241` mounts this with
 *   `field={FORWARD_RISK}` → `MarketingCrisis.tsx:89` builds that constant from `riskFieldUnavailable(...)`,
 *   module-level, code `NO_FORWARD_RISK_FEED` → `isRiskField` (`riskField.ts:136`) is false for EVERY
 *   refusal → `drawable` is false, `blocked` is true, and the button below is permanently `aria-disabled`.
 * That call site is the only one in `apps/web/src` outside tests, so there is no second route where the
 * field is a live one.
 *
 * AND NOTHING IN THIS SYSTEM CAN PRODUCE THE FIELD. `buildRiskField` needs a day axis whose every day
 * states what the monitor did, a channel axis and severity bands. `apps/api/src/marketing` and
 * `packages/shared/src/marketing` produce clocks, gates, statements and backward-looking records; the only
 * table of planned marketing activity, `dist_campaigns`, carries no future date at all — `created_at` and
 * `updated_at` and nothing else (`apps/api/src/db/migrations/0043_distribution.sql:34-48`). There is no day
 * axis anywhere in the system to hang a forward risk field on.
 *
 * SO DO NOT LIGHT THIS TOGGLE WITH A FIXTURE. §6 rule 6 is that absent data refuses; a volume marched over
 * invented numbers, on a page that mounts `PrintStyles` and whose sheets get filed, would put a synthetic
 * forward view of marketing risk onto a compliance record — the exact reading the field's three day states
 * (`observed` / `not_measured` / `withheld`) exist to make impossible. A greyed-out control is the cheaper
 * failure by a wide margin.
 *
 * WHAT WOULD MAKE IT REACHABLE, so this is a data item and not a mystery: one feed reporting risk by day ×
 * channel × severity band, each day carrying its coverage state explicitly rather than inferred, with a
 * `source` and an `observedAt`. `buildRiskField` takes it and both views work with no change to this file
 * or to the page. Whether that monitor exists and what it reports is an owner decision. Until it lands, the
 * honest status of E7 is BUILT AND GATED ON DATA — not "shipping".
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
import { ReliefWatchLine } from '@/components/shared/ReliefWatchLine';
import { RiskCalendar, type RiskCalendarProps } from './RiskCalendar';
import {
  RISK_READING_TEXT, isRiskField,
  type RiskDayState, type RiskField, type RiskReading,
} from './riskField';
import { RAMP_SATURATION_RISK, calibrationSentence } from './stormCalibration';
import { useReliefPreference } from '@/lib/reliefPreference';

const StormReliefGl = lazy(() => import('./StormReliefGl'));

/**
 * ── THE FIGURES SURVIVE THE STORM, WHICH THEY DID NOT ────────────────────────────────
 *
 * `[data-relief-print-flat]` below carries BOTH `display: none` and `aria-hidden="true"`, and
 * `StormReliefGl` renders a bare `aria-hidden` canvas with no text of its own
 * (`StormReliefGl.tsx:774-780`). So while the storm was open the calendar's every figure — every
 * channel name, every channel-day risk value, the whole day axis, the cumulative strip and its
 * refusals, the ramp scale, the source line and the NOT-MEASURED warning — was in the document and
 * reachable by nothing: not a screen reader (`aria-hidden` prunes the subtree), not text extraction
 * or copy-paste (`display: none` generates no boxes and no selection range).
 *
 * MEASURED with the walker in `__tests__/stormReliefOnState.test.tsx`, which applies exactly those
 * two platform exclusions: on that file's 3-channel × 8-day fixture the readable text fell from
 * 1,699 characters with the storm off to 641 with it on, and the 641 were the toggle, its opt-in
 * sentence and the calibration paragraph. Not one number from the field survived. With the block
 * below it is 2,339 — the calendar's figures plus the band names and the day states the calendar
 * draws in pixels. The OFF state is untouched at 1,699. The test re-derives every one of those
 * counts on each run rather than trusting this paragraph, and prints them in its own failure
 * message.
 *
 * That is §6 rule 4 — "DOM text is the accessibility tree AND the print path" — delivered on the
 * print half and destroyed on the other, and §6 rule 1's "the fallback is not an information
 * downgrade" failed in the ON state. Each half was individually correct and individually tested,
 * which is exactly why nothing caught it. It is the same defect closed on E5 in `SurfaceRelief.tsx`,
 * and it is worse here: this page mounts `PrintStyles` and its own source calls what it produces a
 * COMPLIANCE RECORD SOMEBODY KEEPS. Deleting the figures from the accessibility tree and the
 * clipboard of the record is the most consequential version of it in the product.
 *
 * ── WHY THIS IS A SECOND, DERIVED SURFACE RATHER THAN AN UNHIDING ────────────────────
 * The print copy cannot simply be un-hidden. `display: none` is INLINE on purpose — it is what keeps
 * a page that never mounts `PrintStyles` from showing two calendars at once, `PrintStyles`'
 * `[data-relief-print-flat]` rule carries the `!important` that beats it on paper, and
 * `reliefPrintPath.test.tsx:509` pins that inline declaration on all three printable wrappers.
 * Un-hiding it would also put a whole second `RiskCalendar` in the reading order, so a screen reader
 * would announce every figure twice, and would break the single-`risk-calendar` invariant this
 * file's header depends on.
 *
 * So the figures come back as WORDS in their own block, marked `data-relief-live` so the SAME print
 * rule that deletes the canvas deletes this too — on paper the full calendar returns and already
 * carries every one of them. (The calibration sentence below already uses exactly this pairing.)
 *
 * NOTHING BELOW IS A HAND-WRITTEN LIST. The channels, days and cells are walked, the day-state and
 * reading tallies are counted by walking `field.days` rather than by naming the members of either
 * union, the reading sentences are printed from the exported `RISK_READING_TEXT` record, and the
 * frame is walked with `Object.entries`. A fourth day state, a sixth reading or a new frame field
 * appears here without anyone remembering this file. A hand-list cannot fail on the item nobody
 * thought of.
 */
/*
 * `text-micro`, NOT the `text-[10px]` the flat calendar's own small print still uses. This is the state
 * where these figures are the ONLY reading — `tailwind.config.js:84` declares 11px "the new minimum,
 * reserved for dense data-table cells", which is exactly what the table below is, and this file's own
 * header already moved its control off `text-[10px]` for that reason. Colours are the app's tokens with
 * no `dark:` variant anywhere in this block: `text-grey-dark` measures 11.54 light / 11.39 dark and
 * `text-status-conditional` 5.65 / 7.94 on the card, per the measured table in `SurfaceRelief.tsx`.
 */
const TEXT_FORM = 'mt-2 font-mono text-micro leading-relaxed text-grey-dark';

/** `not_measured` → `NOT MEASURED`. Mechanical, so a new day state needs no edit here. */
const shout = (key: string): string => key.replace(/_/g, ' ').toUpperCase();

/** `valuesArePlaceholders` → `Values are placeholders`. Mechanical, for the same reason. */
function humanise(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Every frame value is shown. `null` and `false` are facts too and are never dropped. */
function showValue(v: unknown): string {
  if (v === null || v === undefined) return 'none';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return String(v);
}

/** Counted by walking, never by naming the members of the union. */
function tally<K>(items: readonly K[]): ReadonlyMap<K, number> {
  const m = new Map<K, number>();
  for (const k of items) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}

/**
 * THE CALENDAR, IN WORDS ONLY — the same figures the flat view draws, for the state where the figure
 * is a canvas. Visible on screen (so it is selectable and copyable), in the accessibility tree (no
 * `aria-hidden` anywhere on this subtree), and removed from paper with the rest of the live block.
 *
 * It takes a `RiskField` rather than a `RiskFieldOutcome` because a refused field can never reach
 * this state: `blocked` covers `!drawable`, so the toggle on a refused calendar is permanently
 * `aria-disabled` and the refusal presentation stays on screen in the flat figure. E5 needs a
 * refusal arm here; E7 does not, and a dead one would be untested code claiming to be a safety net.
 *
 * The per-channel-day figure is summed in the SAME ORDER `RiskCalendar` sums it — bands ascending,
 * `?? 0` — so the two `toFixed(3)` strings are bit-identical rather than nearly equal. A different
 * order changes the last digit on some fixtures, and a table that disagrees with the figure above it
 * in the third decimal is worse than no table.
 */
function StormTextForm({ field, title, readsAs }: { field: RiskField; title: string; readsAs: string }) {
  const states = tally<RiskDayState>(field.days.map((d) => d.state));
  const readings = tally<RiskReading>(field.days.map((d) => d.reading));
  const laneTotal = (lane: number, day: number): number => {
    let sum = 0;
    for (let b = 0; b < field.bands.length; b++) sum += field.cell(lane, day, b) ?? 0;
    return sum;
  };

  return (
    <section className={TEXT_FORM} data-testid="storm-text-form">
      {/* The caption the canvas cannot carry. `figcaption` is not used: this is not a <figure>, and a
          caption element outside one is a lie about the structure. */}
      <p>
        <span className="font-bold uppercase tracking-wider text-navy">{title}</span>
        {field.frame.valuesArePlaceholders === true && (
          <span className="font-bold text-status-conditional" data-testid="storm-placeholder-tag">
            {' · Placeholder values — the shape is deliberate, the numbers are not measurements'}
          </span>
        )}
      </p>
      <p className="mt-1">{readsAs}</p>

      {/* THE THREE DAY STATES, COUNTED. Never summed into a single "days" figure: an unmeasured day is
          a vendor problem and a withheld day is a clearance problem, and the volume draws neither as a
          value. */}
      <p className="mt-1" data-testid="storm-day-states">
        {[...states].map(([state, n]) => `${n}× ${shout(state)}`).join(' · ')}
        {field.itemsLostToUnmeasuredDays > 0
          ? ` · ${field.itemsLostToUnmeasuredDays} already-scheduled item(s) landed on days nobody `
            + 'measured: their weight is in no figure below and is not zero.'
          : ''}
      </p>

      {/* THE AXES AND THE RAMP. The bands are named here and nowhere in the flat calendar — the volume
          has a severity axis the heatmap does not, and a reader of the storm is owed its labels. */}
      <p className="mt-1">
        {`Channels: ${field.lanes.join(', ')} · Severity bands, low to high: ${field.bands.join(', ')} · `}
        {`Colour ramp 0 → ${field.maxCell.toFixed(2)} risk units per channel-day.`}
      </p>

      {/*
        THE FIGURES. Days down rather than across: the calendar is 28 columns wide in the field this
        page is built for, and a table that wide is a horizontal scroll bar for a screen reader as
        much as for a mouse. Channels across, which is the axis that stays small.
      */}
      <div className="mt-1.5 overflow-x-auto">
        <table className="border-collapse text-left" data-testid="storm-text-table">
          {/* The title is NOT repeated here: it is two elements above, and a caption that restates it
              makes a screen reader announce the figure's name twice on the way into the table. */}
          <caption className="sr-only">
            Every channel-day risk figure, the accumulated total where one exists, and the reason where one does not.
          </caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="pr-2 font-bold uppercase tracking-wider text-navy">Day</th>
              <th scope="col" className="pr-2 font-bold uppercase tracking-wider text-navy">State</th>
              {field.lanes.map((lane) => (
                <th key={lane} scope="col" className="pr-2 text-right font-bold uppercase tracking-wider text-navy">
                  {lane}
                </th>
              ))}
              <th scope="col" className="pr-2 text-right font-bold uppercase tracking-wider text-navy">Cumulative</th>
              <th scope="col" className="font-bold uppercase tracking-wider text-navy">Reading</th>
            </tr>
          </thead>
          {/* `data-day-index` and NOT also `data-day-state`: `RiskCalendar` puts that attribute on its
              SVG day groups, and in this state a whole hidden calendar is in the document — a count of
              `[data-day-state="withheld"]` would silently double. The state is in the row as text,
              which is where a reader needs it anyway. */}
          <tbody>
            {field.days.map((day) => (
              <tr key={day.index} data-day-index={day.index}>
                {/* `whitespace-nowrap` on the two label cells: at a card width where the table does not
                    fit, the scroll container is what handles it — wrapping `NOT MEASURED` onto two lines
                    inside a row of single-line numbers is how a table stops being scannable. */}
                <th scope="row" className="whitespace-nowrap pr-2 font-normal text-navy">{day.label}</th>
                <td className="whitespace-nowrap pr-2">{shout(day.state)}</td>
                {day.state === 'observed'
                  ? field.lanes.map((lane, l) => (
                    <td key={lane} className="pr-2 text-right tabular-nums">{laneTotal(l, day.index).toFixed(3)}</td>
                  ))
                  : (
                    /* NOT a row of dashes or of zeroes across the channels: the whole point of the
                       three day states is that no channel figure exists here at all, and a column of
                       repeated blanks reads as a measured quiet day. One cell, saying so. */
                    <td className="pr-2 text-status-conditional" colSpan={field.lanes.length}>
                      no channel-day figure exists
                    </td>
                  )}
                <td className="pr-2 text-right tabular-nums">
                  {day.cumulative === null ? 'refused' : day.cumulative.toFixed(1)}
                </td>
                <td>{day.reading}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* WHAT EACH READING MEANS, printed verbatim from the exported record and counted from the days
          themselves — the same pairing the flat calendar puts under its figure. */}
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5" data-testid="storm-text-readings">
        {[...readings].map(([reading, n]) => (
          <div key={reading} className="contents">
            <dt className={reading === 'integrable' ? 'text-grey' : 'font-bold text-status-conditional'}>
              {`${n}× ${reading}`}
            </dt>
            <dd className="m-0">{RISK_READING_TEXT[reading]}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-1">
        {field.integrableToDay === null
          ? 'No day in this window carries a cumulative total.'
          : `Accumulated reading runs to ${field.days[field.integrableToDay]!.label}; the field continues `
            + `to ${field.days[field.days.length - 1]!.label} and the accumulation does not.`}
        {field.frontDay !== null && ` Review gate reached at ${field.days[field.frontDay]!.label}.`}
        {field.frontRefusal !== null && ` Review gate: ${field.frontRefusal}.`}
      </p>

      {/* THE FRAME, WALKED. Not a list of the fields somebody remembered. */}
      <dl className="mt-1.5 grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2" data-testid="storm-text-frame">
        {Object.entries(field.frame).map(([k, v]) => (
          <div key={k}>
            <dt className="inline">{`${humanise(k)}: `}</dt>
            <dd className="inline text-navy" data-frame-key={k}>{showValue(v)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * `field` should be STABLE across renders — module-level, or from `useMemo`. The GL component lists it in
 * an effect's dependencies, so a field rebuilt every render rebuilds the GL context every render.
 */
export type StormReliefProps = RiskCalendarProps;

export function StormRelief({ heightPx = 260, ...rest }: StormReliefProps) {
  // Owner decision 2026-08-20: the default lives in ONE module, and the operator's choice
  // is remembered. `revoke` exists so a GL refusal is never recorded as a preference.
  const { on: wantStorm, choose: chooseRelief, revoke: revokeRelief } = useReliefPreference('storm');
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
    revokeRelief();
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

            THIS COPY IS FOR PAPER AND FOR NOTHING ELSE. `display: none` plus `aria-hidden` means it is
            reachable by no reader and no clipboard on screen — see `StormTextForm` above, which is where
            the calendar's figures go while the canvas is up, and the header block that measures what was
            lost while they went nowhere.
          */}
          <div data-relief-print-flat="" style={{ display: 'none' }} aria-hidden="true">
            <RiskCalendar heightPx={heightPx} {...rest} />
          </div>
          {/* Removed from the printed sheet whole — see `PrintStyles`: hiding the canvas alone would leave
              a relief's projected DOM text floating on white paper over the flat figure. The text form is
              INSIDE this block on purpose: on paper the calendar returns and already carries every one of
              these figures, so leaving it outside would print each of them twice. */}
          <div data-relief-live="">
            <StormReliefGl field={field} heightPx={heightPx} onRefused={onRefused} />
            {/* The guard is a TYPE narrowing, not a second gate: `showStorm` already requires `drawable`,
                which is this same predicate. A refused field cannot be in this branch. */}
            {isRiskField(field) && (
              <StormTextForm field={field} title={rest.title} readsAs={rest.readsAs} />
            )}
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
          onClick={() => { if (blocked) return; chooseRelief(!wantStorm); }}
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
            Storm view stays opt-in — not a rendering verdict: the forward-risk feed it would draw is
            produced nowhere yet, and an empty storm shown by default would present an absence as a reading.
          </span>
        )}
        {/* S5 · the watch's mark on this room — still, DOM, from the one arrival store. */}
        <ReliefWatchLine />
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
