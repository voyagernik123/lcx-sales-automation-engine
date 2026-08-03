import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';
import { dismissStack } from '@/lib/dismiss';
import { isTypingTarget } from '@/lib/keyboard';
import { GO_IDLE, GO_WINDOW_MS, stepGoGrammar, type GoState } from '@/lib/navGrammar';
import { EVIDENCE_PANE_WIDTH } from '@/lib/split';
import { useEvidenceDock } from '@/hooks/useSplitView';
import { INSPECTOR_DRAWER_PANEL_SELECTOR } from '@/components/ui/InspectorDrawer';
import {
  GpsInspector,
  GPS_INSPECTOR_ATTR,
  GPS_SPLIT_TOGGLE_ATTR,
  GpsInspectorBody,
  type GpsLens,
} from './GpsInspector';
/**
 * The pane attribute is declared in `gpsPaneFocus.ts` and RE-EXPORTED here, not the other
 * way round: the two desks that must stand their keys down do not mount this component, and
 * importing it to reach a predicate would pull the inspector and its icons into two page
 * chunks that never render them. Re-exported because every existing caller and test reaches
 * for it here.
 */
import { GPS_INSPECTOR_PANE_ATTR } from './gpsPaneFocus';

export { GPS_INSPECTOR_PANE_ATTR };

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE SPLIT — the list and the object at once, on one key
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A modal drawer costs the operator the surface behind it. `lib/split.ts` measures that
 * cost on the BD queue and the arithmetic is the same on a GPS desk: every read of an
 * object is paid for with an Escape, and the Escape throws away the panel you are about
 * to ask for again. Down a list of twelve engagements that is twelve presses spent
 * closing something you wanted open.
 *
 * So this owns a mode — the same object over the list, or beside it — and one key.
 *
 * ── WHY IT IS NOT `⌘\`, WHICH WAS THE FIRST THING I TRIED ─────────────────────
 *
 * `⌘\` is taken and cannot be shared, for two independent reasons that are both stated in
 * the files themselves. It has EXACTLY ONE call site by construction —
 * `useSplitViewChord` installs it from `AppLayout` and `lib/__tests__/split.test.ts` fails
 * if a second file calls that hook, because two listeners on one chord toggled the state
 * twice per press and produced no visible effect (`hooks/useSplitView.ts`, "WHY THIS IS
 * TWO HOOKS"). And it moves the UNIVERSAL inspector, whose content is
 * `useInspectorStore` rendered by `EvidencePane`; GPS rows are in neither, so the chord
 * has nothing to do with this even if it could be shared.
 *
 * `i` is free, MEASURED by grep across `apps/web/src`: the global letter listeners are
 * `f` (hints), `g` (the go grammar) and `?`/`⌘/` (the manual); the GPS desks bind digits
 * plus `d` and `p` (`GpsLoop.tsx:1391`, `GpsDelivery.tsx:1328`); and no `g`-chord
 * destination uses it (`lib/destinations.ts` — `b o u c d l` under `/gps`). It is a bare
 * letter and not a chord because that is what this compartment's own surfaces already
 * use, and because a bare letter is the only kind of key a browser cannot take away —
 * ⌘1-9 never reaches the page at all (`lib/navGrammar.ts`).
 *
 * ── WHERE THIS IS MOUNTED, AND WHAT IT COST ──────────────────────────────────
 *
 * `pages/Gps.tsx` — the engagement list, which is the one GPS desk with a row list of the
 * noun that carries all five governed verbs. It is the desk the inspector was built for:
 * the card already shows price, cost and margin, and what it cannot show without becoming
 * a wall of caveats is which of those three are evidence.
 *
 * This header said "nothing imports this yet, and that is the perf story" until Phase 11's
 * wiring pass. It cost nothing measurable, and the reason is unchanged: everything these two
 * components pull in was already in the GPS page chunks — `clsx`, three lucide icons the app
 * already uses, `InspectorDrawer`, and `CATALOGUE_TODOS` from `@lcx/shared`, which every GPS
 * page already imports from. GPS routes are lazy (`router.tsx:38`), so none of it reaches the
 * initial bundle either way. A desk that mounts it and pulls in something NEW should
 * re-measure rather than cite this paragraph.
 *
 * ── NO SECOND ESCAPE OWNER, AND NO ESCAPE ON THE PANE ────────────────────────
 *
 * The drawer half registers with the dismiss stack through `InspectorDrawer`, which is the
 * app's single owner of Escape and Tab. This file adds nothing to that: it binds `i`, and
 * `i` only.
 *
 * The DOCKED half deliberately registers nothing, and that is a decision rather than an
 * omission. One entry on that stack makes `isOverlayOpen()` true, and `isOverlayOpen()` is
 * exactly what stands the desks' own grammar down — put the pane on the stack and docking
 * it silently kills the digit jumps on `GpsDelivery` and `d`/`p` on `GpsLoop`, which is
 * the thing docking exists to preserve. `lib/split.ts` argues this at length for the
 * evidence pane and rejects the "dismissible but not keyboard-owning" third state, with a
 * measurement of the five inline editors that would break. The same answer applies here
 * for the same reason. So: Escape does nothing to the pane, `i` puts the object back over
 * the list where Escape does close it, and the pane carries a real close button that Tab
 * reaches — which is what keeps "closable without a mouse" true.
 *
 * ── WHAT THIS COULD NOT FIX, AND WHO DID ─────────────────────────────────────
 *
 * `DESK_KEYS_NOT_STOOD_DOWN` recorded that the desks' bare-letter keys kept firing while
 * focus was inside a pane, because the listeners are in page files this lane did not own.
 * Phase 11's wiring pass owned them: the query lives in `gpsPaneFocus.ts` and both desks
 * call it. The constant is empty and the assertion is now the positive one.
 */

/** The key. One constant, so the listener and the button's label cannot disagree. */
export const GPS_SPLIT_KEY = 'i';

/**
 * FIXED, AND THIS IS WHAT IT USED TO SAY.
 *
 * `lib/split.ts` states the rule for the evidence pane: the surface owns its bare-letter
 * keys and its row arrows ONLY while focus is outside the pane, enforced by
 * `keysBelongToSurface()` called from the surface's own listener. Two GPS desks had such
 * listeners and neither called it, so with a pane docked and focus inside it, those keys
 * still fired on the desk behind — and this constant listed both, because the fix was a
 * guard inside two page files the split's lane did not own.
 *
 * THE WIRING PASS OWNED THEM. `gpsPaneFocus.ts` now holds the query for BOTH docked panes
 * (this one and the universal evidence pane, which `⌘\` can dock over any desk — so the
 * defect was never limited to the GPS split), and `GpsLoop` and `GpsDelivery` call it.
 *
 * The list is empty rather than deleted for the same reason `PALETTE_PAGE_GAP_NOT_OURS` is:
 * the next desk to bind a bare letter will not think about docked panes either, and
 * `__tests__/gpsSplit.test.tsx` asserts the two named files DO call the guard, so the fix
 * cannot quietly come back out.
 */
export const DESK_KEYS_NOT_STOOD_DOWN: readonly string[] = [] as const;

/**
 * Is the operator's focus inside the inspector, whichever container is showing?
 *
 * Asked at press time about `document.activeElement`, which is a DOM fact — the same
 * argument `lib/split.ts` makes for `keysBelongToSurface` being a query rather than a
 * React context: a context value is a second copy of that fact, updated a tick later, and
 * two cursors disagreeing about where the operator is is the family of bug here.
 *
 * THE SECOND HALF IS NOT DEFENSIVE, IT IS THE COMMON CASE. `GPS_INSPECTOR_ATTR` marks the
 * BODY, and in the drawer the focused node on open is the drawer's own panel — the body's
 * CONTAINER, an ancestor, which `contains` on the body can never see. Checking only the
 * body meant that pressing the key at the one moment it is most natural (object open in
 * the drawer, nothing else touched) reported "focus is elsewhere", so focus was dropped to
 * `<body>` when the drawer unmounted and Tab restarted from the top of the document —
 * which is the precise failure this phase calls out as making a drawer feel broken.
 */
function focusHeldByInspector(): boolean {
  const active = document.activeElement;
  if (!active || active === document.body) return false;
  const body = document.querySelector(`[${GPS_INSPECTOR_ATTR}]`);
  if (!body) return false;
  if (body.contains(active)) return true;
  // The drawer's own selector comes FROM the drawer. It was a `[role="dialog"]` literal
  // here, which is a duplicated selector — and one that reads, to the overlay enumeration
  // in `lib/__tests__/dismissRegistration.test.ts`, as this file declaring a dialog it never
  // registers. This component deliberately declares no dialog role at all (see the `<aside>`
  // below); asking the drawer where its panel is says that accurately.
  const container = body.closest(`${INSPECTOR_DRAWER_PANEL_SELECTOR}, [${GPS_INSPECTOR_PANE_ATTR}]`);
  return !!container?.contains(active);
}

export interface GpsSplitProps<T> {
  /**
   * The desk's list. Rendered as the left half in both modes, inside a wrapper that is
   * never conditionally swapped — toggling the mode must not remount the caller's list,
   * or every toggle throws away its scroll position and its own keyboard cursor.
   */
  list: ReactNode;
  /** The row the operator opened, or null. Null renders the list and nothing else. */
  subject: T | null;
  lens: GpsLens<T>;
  onClose: () => void;
  /** What the list is, for the pane's accessible name: "engagements", "delivery gaps". */
  label: string;
  className?: string;
}

/**
 * A GPS list with its inspector, over it or beside it.
 *
 * Generic over the row shape for the reason `GpsInspector` is: the desk supplies a lens,
 * this file never looks inside `T`.
 */
export function GpsSplit<T>({ list, subject, lens, onClose, label, className }: GpsSplitProps<T>) {
  const [mode, setMode] = useState<'drawer' | 'split'>('drawer');
  // `canDock` is the MEASURED breakpoint from `lib/split.ts` (1024 + the pane's width),
  // reached through the read-only hook its own docstring says is safe to call from
  // anywhere — reimplementing the media query here would be a second number to keep in
  // step, and it is the number `e2e/split.spec.ts` asserts against a real render.
  //
  // `universalDocked` is why this is not just `canDock`: the evidence pane already holds
  // that half of the screen, and two panes at 1424 leaves the desk a strip. When it is
  // docked, the split stands down and says so, rather than fighting it for the width.
  const { canDock, docked: universalDocked } = useEvidenceDock();
  const available = canDock && !universalDocked;
  const showSplit = mode === 'split' && available;

  const paneRef = useRef<HTMLElement | null>(null);
  /** Where focus was when the object was opened, so the pane can give it back. */
  const openerRef = useRef<Element | null>(null);
  /** Set at press time: did the operator's focus travel with the mode change? */
  const carryFocusRef = useRef(false);
  /** The `g` prefix, mirrored through the grammar's own reducer. See the listener. */
  const goRef = useRef<GoState>(GO_IDLE);
  /** Read inside the key listener, which must not re-subscribe per render. */
  const stateRef = useRef({ mode, open: subject != null, available });
  stateRef.current = { mode, open: subject != null, available };

  const titleId = useId();

  /* Capture the opener on the null → open transition only. Not on every subject change:
   * moving from row to row inside the pane must not overwrite the element the operator
   * came from with a control inside the panel they are about to close. */
  useEffect(() => {
    if (subject == null) {
      openerRef.current = null;
      return;
    }
    if (openerRef.current) return;
    const active = document.activeElement;
    // `<body>` is not a place focus meaningfully was — same rule as `lib/dismiss.ts:299`,
    // where treating it as an origin makes restoration a no-op that looks like it worked.
    openerRef.current = active && active !== document.body ? active : null;
  }, [subject]);

  const toggle = useCallback(() => {
    carryFocusRef.current = focusHeldByInspector();
    setMode((m) => (m === 'split' ? 'drawer' : 'split'));
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // ── THE `g` TAIL, WHICH IS A REAL COLLISION AND NOT A THEORETICAL ONE ──────
      //
      // `lib/navGrammar.ts` says of an unrecognised second key: "a mistyped sequence
      // would run whatever `x` happens to be bound to — the one outcome an operator
      // cannot predict." It then returns `claim: false` for that key, so it neither
      // preventDefaults nor stops propagation — which means `g i` reaches this listener
      // and the desk reshapes itself in answer to a mistyped navigation. The GPS desks
      // already have this with `d` (`g d` is the delivery desk AND `d` toggles the
      // drivers on the loop), in files this lane does not own.
      //
      // ONLY REACHABLE IN THE DOCKED DIRECTION, and the test says so: behind the drawer
      // the grammar cannot arm at all, because `stepGoGrammar` disarms on
      // `isOverlayOpen()`. The guard is unconditional anyway — narrowing it to one mode
      // would be a second premise to keep true.
      //
      // Closed here by running the grammar's OWN reducer on a local `GoState`, rather
      // than by re-deriving "was g just pressed" from a timestamp. `useGoGrammar` keeps
      // its state in a ref it does not export, so this is a mirror either way; using the
      // same pure function with the same inputs and the same clock is the only kind of
      // mirror that cannot drift — including its precedence rules, so a `g` pressed while
      // an overlay owned the keyboard does not arm here either, because it did not arm
      // there.
      const now = Date.now();
      const wasArmed = goRef.current.armed && now - goRef.current.armedAt <= GO_WINDOW_MS;
      goRef.current = stepGoGrammar(goRef.current, e, now).state;

      if (e.key !== GPS_SPLIT_KEY) return;
      // Any modifier and this is somebody else's shortcut — ⌘I is the browser's, ⌥i is a
      // dead key that composes `ˆ` on a US layout, and neither should reshape the desk.
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (isTypingTarget(e.target)) return;
      if (wasArmed) return;
      const { mode: m, open, available: ok } = stateRef.current;
      if (!open || !ok) return;
      // THE OVERLAY EXCEPTION, and it is the shape `useSplitView.ts` arrived at after
      // shipping it wrong twice. A flat `isOverlayOpen()` guard refuses at the single most
      // natural moment to press this — object already open in the drawer, "put it beside
      // the list" — because the drawer it would move IS the overlay it stood down for.
      // So the drawer's own one entry is forgiven and everything else still refuses,
      // counted rather than matched on a label that is built from a title.
      //
      // FORGIVEN ONLY IN THE DRAWER DIRECTION. Docked, this component contributes ZERO
      // entries to the stack, so allowing one there would forgive an entry belonging to
      // something else — the `?` manual, the command line — and reshape the desk behind a
      // scrim. That is the exact regression `useSplitView.ts` records having measured.
      const fromMine = m === 'drawer' ? 1 : 0;
      if (dismissStack().length > fromMine) return;
      e.preventDefault();
      toggle();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  /* Focus follows the operator across the mode change, and ONLY then.
   *
   * The pane must not take focus when it merely appears — that is the property that makes
   * peeking free, and `lib/split.ts` is explicit that stealing it would hand the keyboard
   * to the pane on every peek. This is the other case: the container that HELD focus is
   * being unmounted, so not moving it drops focus to <body> and restarts Tab from the top
   * of the document. Catching focus, not stealing it. The reverse direction needs nothing —
   * `InspectorDrawer` focuses its own panel on mount. */
  useEffect(() => {
    if (!carryFocusRef.current) return;
    carryFocusRef.current = false;
    if (!showSplit) return;
    const toggleEl = paneRef.current?.querySelector<HTMLElement>(`[${GPS_SPLIT_TOGGLE_ATTR}]`);
    toggleEl?.focus();
  }, [showSplit]);

  const closeFromPane = useCallback(() => {
    const opener = openerRef.current;
    openerRef.current = null;
    onClose();
    // Deferred a frame for the reason `lib/dismiss.ts:311` defers: at call time the pane
    // still holds focus, so "was focus orphaned?" cannot be answered yet.
    const schedule = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (fn: () => void) => setTimeout(fn, 0);
    schedule(() => {
      if (!opener?.isConnected) return;
      const current = document.activeElement;
      // Only step in if focus was actually orphaned. If the operator tabbed somewhere
      // deliberately, yanking it back is worse than the bug being fixed.
      if (current && current !== document.body && current.isConnected) return;
      if (typeof (opener as HTMLElement).focus === 'function') (opener as HTMLElement).focus();
    });
  }, [onClose]);

  const splitToggle = available
    ? { to: showSplit ? ('drawer' as const) : ('split' as const), key: GPS_SPLIT_KEY, onToggle: toggle }
    : undefined;

  return (
    <div className={clsx('flex items-start gap-4', className)}>
      <div className="min-w-0 flex-1">{list}</div>

      {subject != null && showSplit && (
        /* An <aside> with a name and NO dialog role, for the three reasons `EvidencePane`
         * lists: `dismissRegistration.test.ts` enumerates overlays by the ARIA they
         * declare and would require this to register with the stack; `resolveHintScope`
         * refuses to draw hint tags when it counts more than one displayed
         * `[role=dialog]`, so a role here would kill `f` on any drawer opened beside it;
         * and `aria-modal` would tell a screen reader the desk beside it no longer
         * exists, which is the opposite of the thing being built. */
        <aside
          ref={paneRef}
          {...{ [GPS_INSPECTOR_PANE_ATTR]: '' }}
          aria-labelledby={titleId}
          style={{ width: EVIDENCE_PANE_WIDTH }}
          className="shrink-0 self-stretch rounded border border-line bg-card text-navy"
        >
          <div className="flex items-center justify-between border-b border-line bg-ice-soft px-3 py-2 dark:bg-ice-soft/10">
            <h2 id={titleId} className="font-mono text-[10px] font-bold uppercase tracking-wide text-navy">
              {label} · inspector
            </h2>
            <button
              type="button"
              onClick={closeFromPane}
              aria-label={`Close the ${label} inspector`}
              /* Said in the title because Escape does NOT reach this pane, and an operator
               * who has learned Escape everywhere else needs telling once rather than
               * discovering it by pressing it. `lib/split.ts` makes the same statement on
               * the evidence pane's own close button. */
              title={`Close (Escape does not close this pane — ${GPS_SPLIT_KEY} puts it back over the list)`}
              className="rounded p-1 text-grey transition-colors hover:bg-ice-soft hover:text-navy dark:hover:bg-ice-soft/20"
            >
              <X size={15} />
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-3 py-3">
            <GpsInspectorBody subject={subject} lens={lens} splitToggle={splitToggle} />
          </div>
        </aside>
      )}

      {subject != null && !showSplit && (
        <GpsInspector subject={subject} lens={lens} onClose={onClose} splitToggle={splitToggle} />
      )}
    </div>
  );
}
