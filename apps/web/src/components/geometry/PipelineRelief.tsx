/**
 * The BD lead queue, with an OPT-IN three-dimensional reading. A drop-in replacement for `LeadTable`.
 *
 * ── WHY IT DEFAULTS TO THE TABLE, AND WILL UNTIL SOMEBODY TIMES IT ───────────────────
 * §7 of `3D_VFX_1000X.md` gates every environment on two clauses together: *(a) a stranger stops scrolling*
 * and *(b) an operator still gets their answer at least as fast as the flat version*. It then says exactly
 * what to do when (b) is not established: *"it ships behind a toggle that defaults off, and I tell you rather
 * than quietly shipping it."*
 *
 * (b) is not established. It is not FAILED either — it is UNMEASURED on the seven environments the clause
 * reaches, and NOT APPLICABLE on the eighth. `3D_VFX_1000X.md` §11.4 settles that split: E8 THE FORGE carries
 * no dataset and answers no question, so recording it as unmeasured "would imply outstanding work that does
 * not exist", and E1's deferral was lifted when its flat table gained a front-to-back ordinal column. All
 * seven are instrumented in `docs/3d/e9/task.html`, which states its own coverage (counterbalanced, matched
 * question pairs, a clock that starts when the surface appears, refusing to report a time when accuracy
 * differs) — and no operator has run it, because it cannot be run by whoever built the surfaces: the file is
 * its own answer key.
 *
 * This paragraph read "UNMEASURED, on all nine environments" until it was checked against that record. Nine is
 * the count of e0–e8 HARNESSES the E9 sweep loads, not of shipping environments: the app ships eight, E1–E8,
 * and clause (b) reaches seven of them.
 *
 * So the table is what loads, the channel is one click away, and the button says why. An unmeasured claim
 * shipped as a default is the same defect as a number published without an instrument.
 *
 * ── AND ON THIS SURFACE THE TABLE IS NOT A CONSOLATION PRIZE ─────────────────────────
 * E3 replaces a lead table, which makes this an unusually honest fallback: the flat view is the incumbent, with
 * every field the environment uses and — unlike the channel — the triage grammar. `s`, `d`, `e`, `j`/`k` and
 * Space act on table rows; a canvas has no rows. What the table cannot do is the JOINT reading: market cap,
 * stage and movement are three columns you sort one at a time, and the quantity an operator wants is the
 * product of all three. That is the trade, and it is stated beside the button rather than discovered.
 *
 * ── THE GL IS LAZY, AND THAT IS A BUDGET FACT NOT A PREFERENCE ───────────────────────
 * `PipelineReliefGl` and all of `@lcx/gl`'s environment layer arrive in a separate chunk. The perf budget
 * measures RAW pre-gzip initial JS against 850 KB with roughly 11 KB of headroom for the entire application,
 * and the env layer alone is 35.7 KB. An eager import would blow the budget on a view most readers never open.
 *
 * ── EVERY REFUSAL LANDS BACK ON THE TABLE ────────────────────────────────────────────
 * §6 rule 1. No WebGL2, a failed shader, a refused float target, a missing extension, a brand-fidelity
 * failure, a dataset the derivation would not accept, or a lost context all resolve here — to the same rows,
 * with the refusal named to the reader rather than swallowed. The derivation runs EAGERLY and cheaply, so a
 * refused dataset never pays for the chunk that would have told it so.
 */
import { lazy, Suspense, useCallback, useId, useMemo, useState } from 'react';
import { ReliefWatchLine } from '@/components/shared/ReliefWatchLine';
import { LeadTable, type LeadTableProps } from '@/components/bd/LeadTable';
import { useReliefPreference } from '@/lib/reliefPreference';
import {
  buildChannel, formatUsd, DEEP_GATE_LABEL, GATE_LABELS, MAX_PER_GATE, STALL_DAYS, STALL_ONSET,
} from '@/components/geometry/pipelineChannel';

const PipelineReliefGl = lazy(() => import('@/components/geometry/PipelineReliefGl'));

export interface PipelineReliefProps extends LeadTableProps {
  /** Canvas height when the relief is showing. The table's own height is unaffected. */
  readonly reliefHeightPx?: number;
}

export function PipelineRelief({ reliefHeightPx = 460, ...table }: PipelineReliefProps) {
  // Owner decision 2026-08-20: the default lives in ONE module, and the operator's choice
  // is remembered. `revoke` exists so a GL refusal is never recorded as a preference.
  const { on: wantRelief, choose: chooseRelief, revoke: revokeRelief } = useReliefPreference('pipeline');
  const [refusal, setRefusal] = useState<string | null>(null);
  /* The reason lives in a sibling <span>, which a screen reader reaches only in browse mode and only if it goes
     looking. `aria-describedby` puts it on the control it explains. */
  const noteId = useId();

  /*
   * ONE CLOCK READING FOR THE WHOLE MOUNT.
   *
   * Days-since-update is measured against a `now` that is captured once, not per render: a `Date.now()` inside
   * the derivation would make every re-render a new dataset, which would tear the GL context down and rebuild
   * it — a fresh WebGL context per keystroke elsewhere on the page, which is exactly what §6 rule 7 exists to
   * prevent. It also means the caption and the frame are measured from the same instant.
   */
  const [nowMs] = useState(() => Date.now());

  /*
   * CHEAP, EAGER, AND NOT BEHIND THE CHUNK. `buildChannel` imports no GL. Running it here means the toggle can
   * be honestly disabled on a dataset the channel would refuse, and the reason can be named without fetching
   * 35.7 KB to be told the same thing.
   */
  const channel = useMemo(() => buildChannel(table.leads, nowMs), [table.leads, nowMs]);

  /*
   * STABLE, because `PipelineReliefGl` lists it in an effect's dependencies. A fresh function each render would
   * tear the renderer down and rebuild it on every parent render — see the note on `nowMs` above.
   */
  const onRefused = useCallback((code: string) => {
    setRefusal(code);
    /* Back to the table immediately. A canvas that failed keeps its last frame — or nothing — on screen, and a
       stale picture presented as live data is worse than no picture. */
    revokeRelief();
  }, []);

  const offerable = channel.refusal === null && channel.deals.length > 0;
  const blocked = refusal !== null || !offerable;
  const showRelief = wantRelief && !blocked;

  const headline = ((): string => {
    if (channel.deepStalledUsd === null) {
      return `No readable market cap in this set — ${channel.valueAbsent} of ${channel.drawn} drawn leads `
        + 'carry none, so no share is computable.';
    }
    const share = channel.deepStalledShare === null
      ? 'share not computable'
      : `${(channel.deepStalledShare * 100).toFixed(0)}% of the readable book`;
    return `${formatUsd(channel.deepStalledUsd)} sits past the ${DEEP_GATE_LABEL} gate and has stopped `
      + `moving — ${share}. ${channel.stalledCount} of ${channel.drawn} drawn leads are stalled `
      + `(${STALL_ONSET} days or more since their last touch).`;
  })();

  return (
    <div data-hero="pipeline">
      {showRelief ? (
        <div className="px-3 py-2">
          <Suspense fallback={<LeadTable {...table} />}>
            <PipelineReliefGl channel={channel} heightPx={reliefHeightPx} onRefused={onRefused} />
          </Suspense>
          {/*
            THE CAPTION IS PART OF THE FIGURE, and it is the DOM half of §6 rule 4.
            The channel carries no per-object labels — the table one click away carries every name, cap and
            date — so what the frame needs in text is the axis, the gate order, and the one number the shape is
            there to show. Every figure here comes from the same `buildChannel` result the geometry is built
            from, so the picture and the print cannot drift.
          */}
          <div
            className="mt-2 space-y-1 text-micro leading-snug text-grey"
            data-testid="pipeline-relief-caption"
          >
            <p className="font-bold text-navy">{headline}</p>
            <p>
              Far end → near end: {GATE_LABELS.join(' · ')}. Size is market cap by VOLUME, so the edge is a
              cube root — the small end is honestly weak, and the table carries the number. Height is movement:
              at the top rail a lead was touched today, on the deck it has not been touched for{' '}
              {STALL_DAYS} days or more. The three marks on the near wall are 0, 20 and {STALL_DAYS}+ days.
            </p>
            {(channel.valueAbsent > 0 || channel.movementAbsent > 0) && (
              <p>
                {channel.valueAbsent > 0 && (
                  <>
                    {channel.valueAbsent} drawn lead{channel.valueAbsent === 1 ? ' records' : 's record'} no
                    market cap and {channel.valueAbsent === 1 ? 'is' : 'are'} drawn as an amber ring — a hole where
                    the mass should be, at a reference size that encodes nothing. Never a zero-mass object.{' '}
                  </>
                )}
                {channel.movementAbsent > 0 && (
                  <>
                    {channel.movementAbsent} {channel.movementAbsent === 1 ? 'floats' : 'float'} clear ABOVE
                    the top rail, off the movement axis, because a lead with no readable last touch has no
                    position on it and the rail would assert the freshest possible reading.{' '}
                  </>
                )}
                Both are excluded from the figure above rather than estimated.
              </p>
            )}
            <p>
              Drawn: {channel.drawn} of {channel.considered} leads in the channel
              {channel.undrawn > 0 && (
                <>
                  {' '}— the {MAX_PER_GATE} largest in each gate. {channel.undrawn} smaller
                  {channel.undrawnUsd !== null ? ` (${formatUsd(channel.undrawnUsd)} between them)` : ''} are
                  not drawn and are not in the figure above
                </>
              )}
              {channel.archived > 0 && (
                <>. {channel.archived} archived lead{channel.archived === 1 ? '' : 's'} excluded: an archived
                  lead has been declined, not stalled in a gate</>
              )}
              {channel.futureDated > 0 && (
                <>. {channel.futureDated} carry a last touch in the future and were clamped to today</>
              )}
              .
            </p>
          </div>
        </div>
      ) : (
        <LeadTable {...table} />
      )}

      <div className="flex flex-wrap items-center gap-2.5 border-t border-line/50 px-3 py-2">
        <button
          type="button"
          /* Unavailable once refused, or when the derivation would refuse: offering a toggle that cannot work is
             worse than not offering one. */
          onClick={() => { if (blocked) return; chooseRelief(!wantRelief); }}
          /*
           * `aria-disabled` RATHER THAN `disabled`, AND IT IS A FOCUS BUG, NOT A PREFERENCE.
           *
           * `onRefused` fires from the renderer's mount effect — moments after the reader pressed Enter on THIS
           * button, while it still holds focus. Setting `disabled` on the focused element makes the browser blur
           * it, so `document.activeElement` becomes `<body>` and the next Tab restarts from the top of the
           * document — which on this page also means leaving the lead table the triage keys act on. It also drops
           * the control out of the tab ring, the only route from the control to the reason beside it.
           */
          aria-disabled={blocked || undefined}
          aria-pressed={showRelief}
          aria-describedby={noteId}
          /*
           * `border-grey`, not `border-line`: as a control boundary WCAG 1.4.11 wants 3:1, and `--line` measures
           * 1.72 on the light card and 1.30 on the dark one. `--grey` is 6.13 / 6.71 and is an existing token.
           * `border-dashed` when unavailable states that state in SHAPE — it was `text-grey` alone plus a
           * mouse-only `cursor-not-allowed`.
           */
          className={
            'border px-2.5 py-1.5 font-mono text-micro font-bold uppercase tracking-wider '
            + (blocked
              ? 'cursor-not-allowed border-dashed border-grey text-grey'
              : 'cursor-pointer border-grey text-cyan-700 hover:bg-ice-soft dark:text-cyan-400')
          }
        >
          {/*
            THE NAME AGREES WITH `aria-pressed`, WHICH IT DID NOT. This read `Table view` while the channel was
            on, so a screen reader announced "Table view, toggle button, PRESSED" — the label names one surface and
            the state bit asserts the other. Naming the surface once and stating on/off keeps them consistent and
            keeps the accessible name equal to the visible text (WCAG 2.5.3).
          */}
          Channel view: {showRelief ? 'on' : 'off'}
        </button>

        {/*
          `text-status-conditional` rather than `text-amber-700 dark:text-amber-400`. The Tailwind-scale pair does
          pass — 5.02 on the light card but 4.64 on the page canvas, clearing 4.5 by 0.14 — and it is invisible to
          the ratchet in `lib/__tests__/contrast.test.ts`, which parses tokens.css and cannot see a utility class.
          `--amber` measures 5.65 / 5.22 / 4.98 on card / canvas / wash and is covered by that ratchet.
        */}
        {refusal !== null ? (
          <span id={noteId} role="alert" className="font-mono text-micro leading-snug text-status-conditional">
            Channel unavailable — <code>{refusal}</code>. Every row above is unaffected.
          </span>
        ) : !offerable ? (
          /* KEEPS `role="alert"`, and the reason is that this is not only a first-paint state: the reader filters
             this queue, so a set that WAS drawable can become undrawable in response to their own keystroke, and
             an explanation that appears silently beside a control that just went dead is a control that broke for
             no stated reason. `aria-describedby` is the on-demand route to the same node; the alert is the
             interruption. (Present-at-mount live regions are not announced by real screen readers anyway, so this
             costs nothing on page load.) */
          <span id={noteId} role="alert" className="font-mono text-micro leading-snug text-status-conditional">
            Channel unavailable —{' '}
            <code>{channel.refusal ?? 'NO_DRAWABLE_LEADS'}</code>
            {channel.faults.length > 0 && `: ${channel.faults[0]}`}. Every row above is unaffected.
          </span>
        ) : (
          /*
           * THE REASON IS ON THE BUTTON, not in a tooltip and not in a commit message — and now literally on it,
           * via `aria-describedby`. A reader deciding whether to trust a 3-D reading is entitled to know that
           * nobody has timed it against the table, and that the table is where the triage keys work.
           */
          <span id={noteId} className="text-micro leading-snug text-grey-dark">
            Channel view is the default by owner decision, not by measurement — timing it against the table
            proved unmeasurable. It is a reading, not a workspace: triage keys act on the rows, the table is
            one press away, and your choice is remembered.
          </span>
        )}
        {/* S5 · the watch's mark on this room — still, DOM, from the one arrival store. */}
        <ReliefWatchLine />
      </div>
    </div>
  );
}

export default PipelineRelief;
