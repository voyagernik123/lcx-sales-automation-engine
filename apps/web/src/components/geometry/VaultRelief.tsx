/**
 * The audit log, with an OPT-IN three-dimensional reading — E6 THE VAULT.
 *
 * ── WHAT THIS WRAPS, AND WHY IT WRAPS IT THIS WAY ────────────────────────────────────
 * `AuditLog.tsx` has no flat component to swap: the table is inline JSX inside the page. Rather than restructure
 * somebody else's page to make this job tidier, the flat view is passed straight through as `children` and
 * rendered UNCHANGED — the smallest honest unit. What the page renders today is exactly what a reader who does
 * nothing still gets, byte for byte.
 *
 * ── WHY IT DEFAULTS TO THE TABLE, AND WILL UNTIL SOMEBODY TIMES IT ───────────────────
 * §7 of `3D_VFX_1000X.md` gates every environment on two clauses TOGETHER: *(a) a stranger stops scrolling* and
 * *(b) an operator still gets their answer at least as fast as the flat version*. It then says exactly what to do
 * when (b) is not established: *"it ships behind a toggle that defaults off, and I tell you rather than quietly
 * shipping it."*
 *
 * (b) is not established. It is not FAILED either — it is UNMEASURED on the seven environments the clause reaches,
 * and NOT APPLICABLE on the eighth. `3D_VFX_1000X.md` §11.4 settles that split: E8 THE FORGE carries no dataset
 * and answers no question, so recording it as unmeasured "would imply outstanding work that does not exist", and
 * E1's deferral was lifted when its flat table gained a front-to-back ordinal column. All seven are instrumented
 * in `docs/3d/e9/task.html`, which states its own coverage (counterbalanced, matched question pairs, a clock that
 * starts when the surface appears, refusing to report a time when accuracy differs) — and no operator has run it,
 * because it cannot be run by whoever built the surfaces: the file is its own answer key.
 *
 * This paragraph read "UNMEASURED, on all nine environments" until it was checked against that record. Nine is the
 * count of e0–e8 HARNESSES the E9 sweep loads, not of shipping environments: the app ships eight, E1–E8, and
 * clause (b) reaches seven of them.
 *
 * So the table is what loads, the corridor is one click away, and the button says why in the reader's own words
 * rather than in a tooltip or a commit message.
 *
 * ── THE GL IS LAZY, AND THAT IS A BUDGET FACT NOT A PREFERENCE ───────────────────────
 * `VaultReliefGl`, `vaultRecords` and all of `@lcx/gl`'s environment layer arrive in a separate chunk. The perf
 * budget measures RAW pre-gzip initial JS at 839/850 KB — 11 KB of headroom for the entire application — and the
 * env layer alone is 35.7 KB. An eager import would blow the budget on a view most readers never open.
 *
 * ── EVERY REFUSAL LANDS BACK ON THE TABLE ────────────────────────────────────────────
 * §6 rule 1. No WebGL2, a failed shader, a refused float target, a refused occlusion buffer, a brand-fidelity
 * failure, a page with no records, a page whose records carry no usable timestamp, and a LOST CONTEXT all resolve
 * here — to the same table, carrying the same records, with the refusal named to the reader rather than swallowed.
 */
import { lazy, Suspense, useCallback, useId, useState, type ReactNode } from 'react';
import { ReliefWatchLine } from '@/components/shared/ReliefWatchLine';
import type { AuditEntry } from '@/lib/api/audit';
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
 * On an audit log this is the worst of the seven places to hide a refusal: the reader is being told
 * the corridor is not drawing the records, at 2.11:1 on the default theme.
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

const VaultReliefGl = lazy(() => import('@/components/geometry/VaultReliefGl'));

export interface VaultReliefProps {
  /** The page of the spine the table beside this is drawing. One dataset, two drawings. */
  readonly entries: readonly AuditEntry[];
  /** The flat view, exactly as the page renders it. Rendered unchanged, and it is the default. */
  readonly children: ReactNode;
  readonly heightPx?: number;
}

export function VaultRelief({ entries, children, heightPx = 460 }: VaultReliefProps) {
  // Owner decision 2026-08-20: the default lives in ONE module, and the operator's choice
  // is remembered. `revoke` exists so a GL refusal is never recorded as a preference.
  const { on: wantRelief, choose: chooseRelief, revoke: revokeRelief } = useReliefPreference('vault');
  const [refusal, setRefusal] = useState<string | null>(null);
  /* The reason lives in a sibling <span>, which a screen reader reaches only in browse mode and only if it goes
     looking. `aria-describedby` puts it on the control it explains. */
  const noteId = useId();

  /*
   * STABLE, because `VaultReliefGl` lists it in an effect's dependencies. A fresh function each render would tear
   * the renderer down and rebuild it on every parent render — a new GL context per keystroke in the actor filter,
   * which is exactly what §6 rule 7 exists to prevent.
   */
  const onRefused = useCallback((code: string) => {
    setRefusal(code);
    /* Back to the table immediately. A canvas that failed keeps its last frame — or nothing — on screen, and on
       an audit log a stale picture presented as live data is the worst available outcome. */
    revokeRelief();
  }, []);

  const showRelief = wantRelief && refusal === null;

  return (
    <div>
      {/* THE TOGGLE SITS ABOVE THE VIEW, not below it: the table lives in a scrolling pane, and a button that
          scrolls away with the rows is a button a reader has to hunt for. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '8px 12px',
      }}>
        <button
          type="button"
          /* Unavailable once refused: offering a toggle that cannot work is worse than not offering one. */
          onClick={() => { if (refusal !== null) return; chooseRelief(!wantRelief); }}
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
            THE NAME AGREES WITH `aria-pressed`, WHICH IT DID NOT. This read `Table view` while the vault was on,
            so a screen reader announced "Table view, toggle button, PRESSED" — the label names one surface and the
            state bit asserts the other. Naming the surface once and stating on/off keeps them consistent and keeps
            the accessible name equal to the visible text (WCAG 2.5.3).
          */}
          Vault view: {showRelief ? 'on' : 'off'}
        </button>

        {refusal === null ? (
          /*
           * THE REASON IS NEXT TO THE BUTTON, and now on it via `aria-describedby`. A reader deciding whether to
           * trust a 3-D reading of a governed-action log is entitled to know that nobody has timed it against the
           * table.
           */
          <span id={noteId} className={NOTE}>
            The vault is the default by owner decision, not by measurement — depth is time, fog is the
            reading limit, and timing it against the table proved unmeasurable. The table is one press away
            and your choice is remembered.
          </span>
        ) : (
          <span id={noteId} role="alert" className={ALERT}>
            Vault view unavailable — <code>{refusal}</code>. Every record below is unaffected.
          </span>
        )}
        {/* S5 · the watch's mark on this room — still, DOM, from the one arrival store. */}
        <ReliefWatchLine />
      </div>

      {showRelief ? (
        /* The Suspense fallback IS the table rather than a spinner: a reader who clicked has not asked to lose
           the records for the length of a network round trip. */
        <Suspense fallback={children}>
          <VaultReliefGl entries={entries} heightPx={heightPx} onRefused={onRefused} />
        </Suspense>
      ) : (
        children
      )}
    </div>
  );
}
