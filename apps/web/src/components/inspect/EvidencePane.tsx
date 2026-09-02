import { useCallback, useEffect, useId, useState } from 'react';
import { X, PanelRightClose } from 'lucide-react';
import { clsx } from 'clsx';
import { useInspectorStore } from '@/stores/useInspectorStore';
import { useUIStore } from '@/stores';
import { EVIDENCE_PANE_ATTR, EVIDENCE_PANE_WIDTH, keysBelongToSurface } from '@/lib/split';
import { InspectorBody, inspectorTitle } from './InspectorBody';

/**
 * The evidence, docked beside the surface (T1 #12).
 *
 * The argument for this existing at all, the reason Escape does nothing to it, and the
 * pane-ownership rule are all in `lib/split.ts`. This file is the chrome and the three
 * decisions that live in the markup.
 *
 * ── IT IS AN `<aside>` AND DECLARES NO DIALOG ROLE, ON PURPOSE ────────────────
 * Not a technicality — three separate mechanisms read that ARIA and would be made to lie
 * by it:
 *  - `lib/__tests__/dismissRegistration.test.ts` enumerates overlays BY the ARIA they
 *    declare and requires each to register with the dismiss stack. A dialog role here
 *    would put this pane on that list and the exemption would have to claim a registering
 *    parent that does not exist.
 *  - `resolveHintScope` (lib/hints.ts:245) counts displayed `[role=dialog]` nodes to
 *    decide what `f` may tag, and refuses outright when it finds more than one. A dialog
 *    role here would kill hint tags on every drawer opened while the pane is docked —
 *    two candidates, `kind: 'unscoped'`, nothing drawn.
 *  - `aria-modal` would tell a screen reader the surface beside it no longer exists,
 *    which is the precise opposite of the thing being built.
 * It is a complementary region with a name, which is what it is.
 *
 * ── IT DOES NOT TAKE FOCUS WHEN IT OPENS ─────────────────────────────────────
 * `InspectorDrawer` focuses its panel on mount and must, because it is modal and Tab has
 * to start somewhere inside it. This pane must not, and the absence is load-bearing
 * rather than an omission: the operator peeks with Space, focus stays on the row, and
 * `j`/`k`/`s`/`d`/`e` keep working — see the pane-ownership rule. Stealing focus here
 * would hand the keyboard to the pane on every peek and make the docked mode strictly
 * worse than the drawer it replaces. There is no `autoFocus` and no `focus()` call in this
 * file, and `splitFocus.test.tsx` fails if one appears.
 *
 * ── THE OWNERSHIP READOUT ────────────────────────────────────────────────────
 * Two panes on screen means the operator has to be able to see which one their keys land
 * in, and it must not be inferred from a caret they may not have. The header states it in
 * words, and the border states it in colour. Both are derived from the SAME predicate the
 * guard uses (`keysBelongToSurface`) read on `focusin`/`focusout`, not from a parallel
 * piece of state — two cursors that can disagree is the whole family of bug this item is
 * at risk of introducing.
 *
 * ── NO TRANSITION ────────────────────────────────────────────────────────────
 * Docking changes the layout: the surface reflows to a narrower width. Animating that
 * means reflowing a table for the duration, which is jank rather than motion, and the
 * motion vocabulary's `.t-panel` exists for a drawer sliding over a static page — a
 * different thing. So there is nothing to reduce here, and therefore no reduced-motion
 * branch claimed. (The sidebar carries `t-panel` for its rail because it animates a
 * `w-56`→`w-14` change the operator triggers deliberately and rarely; a pane that appears
 * on every peek is not that.)
 */
export function EvidencePane() {
  const stack = useInspectorStore((s) => s.stack);
  const close = useInspectorStore((s) => s.close);
  const setEvidenceDocked = useUIStore((s) => s.setEvidenceDocked);
  const titleId = useId();
  const [surfaceHasKeys, setSurfaceHasKeys] = useState(true);

  const syncOwnership = useCallback(() => setSurfaceHasKeys(keysBelongToSurface()), []);

  useEffect(() => {
    // `focusin`/`focusout` on the document rather than React's onFocus/onBlur on the pane,
    // because the question is about the WHOLE document's focus: focus leaving the pane for
    // the surface fires `focusout` here, and focus arriving from anywhere fires `focusin`.
    // A pane-local handler cannot see focus that never touches the pane, so the readout
    // would be right on the way in and stale on the way out.
    document.addEventListener('focusin', syncOwnership);
    document.addEventListener('focusout', syncOwnership);
    syncOwnership();
    return () => {
      document.removeEventListener('focusin', syncOwnership);
      document.removeEventListener('focusout', syncOwnership);
    };
  }, [syncOwnership]);

  const title = inspectorTitle(stack);
  const empty = stack.length === 0;
  // The cursor has moved off the record this pane describes. Same type, different id: the
  // verbs land on the highlighted row; the evidence is still the previous one. Space re-peeks.
  const cursor = useInspectorStore((s) => s.cursor);
  const top = stack[stack.length - 1];
  const cursorMoved = !!top && !!cursor && cursor.type === top.type && cursor.id !== top.id;

  return (
    <aside
      {...{ [EVIDENCE_PANE_ATTR]: '' }}
      aria-labelledby={titleId}
      style={{ width: EVIDENCE_PANE_WIDTH }}
      className={clsx(
        'flex shrink-0 flex-col overflow-hidden border-l bg-card text-navy',
        // The ownership accent. `t-hover` is the right member of the vocabulary because it
        // names colour properties ONLY — never `outline`, which is what the motion ratchet
        // exists to keep out of a transition. (Writing the name of the banned utility in
        // this comment failed that ratchet, correctly: Tailwind's content scan reads
        // comments, so the literal in a comment can emit the class.)
        't-hover',
        surfaceHasKeys ? 'border-line' : 'border-cyan-500',
      )}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-ice-soft px-3 py-2 dark:bg-ice-soft/10">
        <h2 id={titleId} className="min-w-0 flex-1 truncate font-mono text-micro font-bold uppercase tracking-tight">
          {empty ? 'Evidence' : title}
        </h2>
        {/* The chord is ON the surface, for the same reason the tour panel says "Skip":
          * Escape does not close this, so the key that does has to be visible rather than
          * only documented. */}
        <button
          onClick={() => setEvidenceDocked(false)}
          aria-label="Undock the evidence pane"
          title="Undock — the evidence goes back to a drawer (⌘\)"
          className="focus-ring flex items-center gap-1 rounded px-1 py-0.5 font-mono text-[10px] text-grey hover:text-navy"
        >
          <PanelRightClose size={13} />
          <span aria-hidden="true">⌘\</span>
        </button>
        {!empty && (
          <button
            onClick={close}
            aria-label="Clear the evidence pane"
            className="focus-ring rounded p-0.5 text-grey hover:text-navy"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/*
        * WHICH PANE OWNS THE KEYS, in words. Rendered in both states rather than only when
        * focus is in here: a readout that appears is a readout the operator has to notice
        * arriving, and the state it is silent about ("the surface has your keys") is the
        * one they spend all day in and most need to be able to confirm at a glance.
        */}
      <p
        className={clsx(
          'shrink-0 border-b border-line/60 px-3 py-1 font-mono text-[10px]',
          surfaceHasKeys ? 'text-grey' : 'text-cyan-700 dark:text-cyan-400',
        )}
      >
        {surfaceHasKeys ? 'keys → the surface' : 'keys → this pane · ⇧⇥ back to the surface'}
      </p>

      {cursorMoved && (
        <p
          data-evidence-stale=""
          className="shrink-0 border-b border-amber-500/40 bg-amber-500/10 px-3 py-1 font-mono text-[10px] text-amber-700 dark:text-amber-300"
        >
          cursor moved · this evidence is still the previous row · space re-peeks
        </p>
      )}
      <div className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {empty ? (
          <p className="text-label leading-relaxed text-grey">
            Peek a row with <kbd className="rounded border border-line px-1 font-mono">space</kbd>, or open any entity
            chip — the evidence lands here instead of over the surface, so the row keys keep working while you read it.
          </p>
        ) : (
          <InspectorBody />
        )}
      </div>
    </aside>
  );
}
