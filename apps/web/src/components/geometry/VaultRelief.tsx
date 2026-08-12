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
 * (b) is not established. It is not FAILED either — it is UNMEASURED, on all nine environments. The instrument
 * exists (`docs/3d/e9/task.html`: counterbalanced, matched question pairs, a clock that starts when the surface
 * appears, refusing to report a time when accuracy differs) and no operator has run it, because it cannot be run
 * by whoever built the surfaces — the file is its own answer key.
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
import { lazy, Suspense, useCallback, useState, type ReactNode } from 'react';
import type { AuditEntry } from '@/lib/api/audit';

const VaultReliefGl = lazy(() => import('@/components/geometry/VaultReliefGl'));

export interface VaultReliefProps {
  /** The page of the spine the table beside this is drawing. One dataset, two drawings. */
  readonly entries: readonly AuditEntry[];
  /** The flat view, exactly as the page renders it. Rendered unchanged, and it is the default. */
  readonly children: ReactNode;
  readonly heightPx?: number;
}

export function VaultRelief({ entries, children, heightPx = 460 }: VaultReliefProps) {
  const [wantRelief, setWantRelief] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  /*
   * STABLE, because `VaultReliefGl` lists it in an effect's dependencies. A fresh function each render would tear
   * the renderer down and rebuild it on every parent render — a new GL context per keystroke in the actor filter,
   * which is exactly what §6 rule 7 exists to prevent.
   */
  const onRefused = useCallback((code: string) => {
    setRefusal(code);
    /* Back to the table immediately. A canvas that failed keeps its last frame — or nothing — on screen, and on
       an audit log a stale picture presented as live data is the worst available outcome. */
    setWantRelief(false);
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
          {showRelief ? 'Table view' : 'Vault view'}
        </button>

        {refusal === null ? (
          /*
           * THE REASON IS NEXT TO THE BUTTON. A reader deciding whether to trust a 3-D reading of a governed-action
           * log is entitled to know that nobody has timed it against the table.
           */
          <span style={{ font: '400 10.5px/1.4 ui-monospace, monospace', color: 'rgba(196,212,240,.66)' }}>
            The vault is opt-in: depth is time and fog is the reading limit, but nobody has yet timed whether it
            answers faster than this table.
          </span>
        ) : (
          <span role="alert" style={{ font: '500 10.5px/1.4 ui-monospace, monospace', color: '#E0A94A' }}>
            Vault view unavailable — <code>{refusal}</code>. Every record below is unaffected.
          </span>
        )}
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
