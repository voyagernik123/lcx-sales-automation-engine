/**
 * `⌘\` — the evidence pane, docked beside the surface (T1 #12).
 *
 * ── WHAT AN OPERATOR CAN DO HERE THAT THEY COULD NOT BEFORE ──────────────────
 *
 * Every "evidence" surface in this app is `components/ui/InspectorDrawer.tsx`, and it is
 * MODAL in four independent ways at once: `fixed inset-0` with a scrim, `document.body`
 * `overflow: hidden`, Tab confined by the dismiss stack, and a backdrop click that closes
 * it. So while the evidence is up, the surface behind it is inert — and not merely
 * visually. On the BD queue, `isOverlayOpen()` is what silences the page's own grammar:
 * `s` snooze, `d` disqualify, `e` enroll, `j`/`k`, the `1`-`4` split digits
 * (src/pages/BdPipeline.tsx:527) AND the row arrows (src/hooks/useListNavigation.ts:197).
 * Peeking a lead therefore costs the operator every key they triage with.
 *
 * The consequence, in presses: read the evidence for a lead and disqualify it is
 * `Space` `Escape` `d`. Do it down a list of twelve and the Escape is paid twelve times,
 * and each one throws away the pane you are about to ask for again.
 *
 * Docked, the Escape is gone: `Space` `d`, `j`, `Space` `d`. The verbs never went away, which
 * is the whole item.
 *
 * ── WHAT THIS DOES *NOT* DO, WITHDRAWN AFTER MEASUREMENT ─────────────────────
 *
 * THE PANE DOES NOT FOLLOW THE CURSOR ROW. This file claimed it did — "`Space` then `j` `j`
 * `j`" — and that was false. `move()` in `pages/BdPipeline.tsx` calls `setSelectedId` and
 * nothing else; peeking is `handlePeek`, and only `Space`, `⏎` and a click reach it. MEASURED
 * in Chromium against the built app by recording the `/v1/projects/:id` requests the pane's
 * payload makes: peek row 0 asks for `p-0`, then `j` asks for NOTHING and the pane still shows
 * `Probe Chain 00` while the highlight sits on `Probe Chain 01`. Every row is still one
 * `Space`.
 *
 * WHICH LEAVES A REAL MISMATCH, and it is worth naming rather than filing under prose. After
 * `Space` `j`, the pane shows one lead's evidence and `d` opens the disqualify dialog for a
 * DIFFERENT one. The mutation itself is aimed correctly — at the record the focus ring and the
 * highlight agree on — and the dialog names that record, so this is not the wrong-record
 * mutation this page has fixed twice (`syncSelectionToFocus`, and the guard below). It is a
 * weaker but new hazard the drawer could not have: with the drawer up, `j` was dead, so the
 * evidence on screen was always the evidence for the row the verbs would hit. Docking is what
 * makes those two able to disagree, and nothing on screen currently says they have.
 *
 * ── WHERE THE PLAN'S OWN EXAMPLE DOES NOT APPLY, MEASURED ────────────────────
 *
 * The plan names "the decision register (left) + its evidence / premortem / RFI (right)".
 * That pair does not have this problem and a split would not improve it. On the command
 * deck the premortem and devil's-advocate reviews (`AnalyticReviews`) and the AI decision
 * memo already render INLINE inside the decision row, expanded in place
 * (src/pages/CommandDeck.tsx:544-552) — the operator reads the tradecraft and types the
 * chosen option in the same card, with nothing to close. `/decisions` is the same shape:
 * context, options, decision and rationale are all fields on the card
 * (src/pages/Decisions.tsx:157-163). Neither surface opens a drawer, so neither has a
 * drawer's cost. Inline expansion had already solved it.
 *
 * What DOES have the problem is every surface that peeks through the universal inspector
 * — `useInspect()`, 20 call sites, one drawer — which is why this is wired there and
 * nowhere else. Zero per-surface opt-in, the same doctrine as the hint layer.
 *
 * ── THE PANE IS CHROME, NOT AN OVERLAY, AND ESCAPE THEREFORE DOES NOTHING TO IT ─
 *
 * This is the decision the whole item turns on, so it is argued rather than asserted.
 *
 * The house rule is that anything on screen registers with `useDismissible` so Escape has
 * one owner. Registering the docked pane is impossible without making it worthless: one
 * entry on that stack and `isOverlayOpen()` is true, which is precisely what kills `s`,
 * `d`, `e` and the arrows on the surface beside it. `components/teach/Tour.tsx` hit the
 * same wall and made the same call for the same reason, and said so plainly.
 *
 * The alternative considered and REJECTED was to teach `lib/dismiss.ts` a third kind of
 * entry — dismissible but not keyboard-owning — so Escape could clear the pane while
 * `isOverlayOpen()` ignored it. That is a two-line change and it would introduce a live
 * instance of the exact defect Phase 4 existed to kill. MEASURED: five inline editors
 * handle Escape with neither `stopPropagation` nor `preventDefault` —
 * `components/ui/InlineEdit.tsx:51`, `components/queue/SavedScreens.tsx:117` and `:168`,
 * `pages/CommandDeck.tsx:509` and `:528`. `lib/dismiss.ts` claims in its own docstring
 * that "the innermost interested element ... calls stopPropagation"; for those five it
 * does not, and they are safe today only because `handleKeyDown` returns early on an
 * EMPTY stack, and the stack can only be non-empty behind a backdrop that stops those
 * fields holding focus. Put a non-modal entry on the stack and one Escape cancels the
 * rename AND closes the pane. The pane is not worth reopening that.
 *
 * So the pane behaves like the sidebar it sits opposite: it reserves layout width, steals
 * no focus, traps nothing, declares no dialog role, and owns exactly one key — the chord
 * that put it there. Escape does nothing to it, `⌘\` closes it, the pane header renders
 * `⌘\` next to its close button so nobody has to guess, and `lib/manual.ts` says it in
 * words. What the operator loses is Escape-to-close on this one surface. What they keep is
 * every triage key, which is the only reason to dock it at all.
 *
 * ── THE PANE-OWNERSHIP RULE ──────────────────────────────────────────────────
 *
 * Two panes make "which record does this land on?" a question, and on the BD queue the
 * answer is a mutation. The rule, stated once:
 *
 *   THE SURFACE OWNS THE BARE-LETTER VERBS AND THE ROW ARROWS ONLY WHILE FOCUS IS
 *   OUTSIDE THE EVIDENCE PANE. Focus inside the pane, and the surface's grammar stands
 *   down completely — the keys do nothing rather than acting on the highlighted row.
 *
 * Standing down, rather than "act on the row that is still highlighted", is the point.
 * The highlight is not where the operator's focus is, and this programme has already
 * fixed the defect where `d` disqualified a row the focus ring was not on
 * (src/pages/BdPipeline.tsx:447 `syncSelectionToFocus`). A docked pane that re-created it
 * would be a data-integrity defect wearing a layout change as a disguise.
 *
 * Two things make this cheap rather than crippling:
 *
 *  - THE PANE DOES NOT TAKE FOCUS WHEN IT OPENS. The drawer does (`InspectorDrawer`
 *    focuses its panel on mount) because it is modal and has to. The pane must not, and
 *    that is what makes the common case free: the operator peeks, focus stays on the row,
 *    the evidence is read with the eyes, and `j`/`d`/`s` never left the surface.
 *  - ONE GUARD COVERS THE VERBS AND THE ARROWS TOGETHER, because on the surface that
 *    matters they are the same listener. THIS BULLET USED TO CLAIM THE ARROWS NEEDED NO
 *    GUARD AT ALL, on the grounds that `useListNavigation` binds through `containerProps`
 *    on the list element so a press from the pane is never in its bubble path. That is true
 *    OF THAT HOOK and irrelevant here: `pages/BdPipeline.tsx` does not use it. `LeadTable`
 *    does, while the PAGE also handles `ArrowDown`/`ArrowUp` — next to `j`/`k` — in its own
 *    `window` listener (src/pages/BdPipeline.tsx:596). MEASURED: delete
 *    `keysBelongToSurface()` and `bdPipelineSplitOwnership.test.tsx` reports "an arrow
 *    pressed in the evidence pane moved the queue cursor: expected [ 'p-1' ] to deeply equal
 *    [ 'p-0' ]". So the arrows are pane-scoped by the guard, not by structure. That is
 *    cheaper than the claim it replaces — one guard, not two — but it means the guard covers
 *    strictly more than the `case '[sde]'` labels and must never be narrowed to the letters.
 *
 * The only ambiguous surface in the app is a `window`-level letter listener, and there is
 * exactly one: `pages/BdPipeline.tsx`. `keysBelongToSurface()` is the guard, and
 * `bdPipelineSplitOwnership.test.tsx` breaks it and watches `d` disqualify the wrong
 * record.
 */

/**
 * The attribute that marks the pane's root, and the reason the guard is a DOM query
 * rather than a React context.
 *
 * The guard runs inside a `window` keydown listener, before React has re-rendered
 * anything, and it has to answer about `document.activeElement` — a DOM fact. A context
 * value would be a second copy of that fact, updated a tick later, and the whole class of
 * bug here is two cursors disagreeing about where the operator is. One fact, read at
 * press time.
 */
export const EVIDENCE_PANE_ATTR = 'data-evidence-pane';

/** The pane's width. Wide enough to read a premortem in; the breakpoint is derived from it. */
export const EVIDENCE_PANE_WIDTH = 400;

/**
 * The narrowest viewport this app already treats as a usable desk.
 *
 * 1024 is Tailwind's `lg` and the width the responsive layouts here are written against.
 * It is also the width at which the BD queue ALREADY side-scrolls: MEASURED in Chromium
 * against the built app with 12 stubbed rows, the lead table's natural width is 931px and
 * `MainContent`'s content box at a 1024 viewport is 768px — so the operator is already
 * dragging a horizontal scrollbar there, with no pane involved.
 */
const REFERENCE_SURFACE_WIDTH = 1024;

/**
 * Below this viewport width the pane is not offered at all.
 *
 * ── THE FIRST NUMBER I PICKED WAS WRONG, AND THE CHECK THAT BLESSED IT WAS A DECORATION ─
 *
 * This was 1280, justified by "the lead table still fits beside the pane", with an e2e
 * assertion that `#main-content` did not overflow. Both were false. The BD queue puts its
 * table inside its own `div.overflow-x-auto`, so `#main-content` can NEVER overflow no
 * matter how narrow it gets — the assertion could not fail and proved nothing. And the
 * measurement it should have made says the opposite: at 1280 with the sidebar expanded
 * (`w-56`, 224px) and the pane at 400px, the queue's scroller is left 624px for a 931px
 * table. It fits 67% of the columns.
 *
 * ── SO THE CLAIM IS COMPARATIVE, WHICH IS THE ONLY HONEST FORM IT HAS ─────────
 *
 * "The table fits" was never true on this surface at any width an operator uses, so it was
 * the wrong bar. The right one is that DOCKING MUST NOT LEAVE THE SURFACE WORSE OFF THAN
 * THE APP ALREADY ACCEPTS. The pane costs exactly its own width, so the threshold is the
 * reference width plus the pane — the sidebar appears on both sides of the comparison and
 * cancels:
 *
 *     1024 (already-accepted surface) + 400 (pane) = 1424
 *
 * At 1424 with the pane docked the queue's scroller gets the same 768px it gets at a 1024
 * viewport with no pane at all, so the operator trades nothing they had for every triage
 * key they did not. `e2e/split.spec.ts` asserts that equality against a real render — it
 * measures the queue's OWN scroll container at both widths and compares them, so it fails
 * if the pane is widened, if the breakpoint is lowered, or if the sidebar grows.
 *
 * What this admits and excludes, stated plainly: every current MacBook (14" is 1512
 * logical, 13" Air 1470, 16" 1728) and every external monitor; not a half-width window on
 * a 2560 display, and not a tablet.
 *
 * Note what this does NOT do: it does not un-persist the preference. An operator who docks
 * the pane on a desk monitor and later opens the same account in a narrow window gets the
 * drawer, and gets the pane back when the window is wide again. Forgetting the preference
 * because the window was briefly narrow would be a second, quieter surprise.
 */
export const SPLIT_MIN_WIDTH = REFERENCE_SURFACE_WIDTH + EVIDENCE_PANE_WIDTH;

/** Is this viewport wide enough for a split to be better than a drawer? */
export function canSplitAt(width: number): boolean {
  return width >= SPLIT_MIN_WIDTH;
}

/**
 * Does the surface own the keyboard right now?
 *
 * False exactly when focus is inside the docked evidence pane. Written to be safe when
 * called from a module that knows nothing about whether a pane exists: no pane on screen
 * means no containment, means the surface owns the keys, which is every surface in the
 * app on every day nobody presses `⌘\`.
 */
export function keysBelongToSurface(active: Element | null = typeof document === 'undefined' ? null : document.activeElement): boolean {
  if (!active) return true;
  // `closest` rather than a pane lookup + `contains`, so this is one traversal from the
  // focused node and needs no reference to the pane at all.
  return !active.closest(`[${EVIDENCE_PANE_ATTR}]`);
}
