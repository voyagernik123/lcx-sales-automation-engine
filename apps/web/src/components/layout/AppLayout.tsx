import { Suspense, useEffect } from 'react';
import { Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { workspaceForPath, capAtLeast } from '@lcx/shared';
import { TopNav, TRAFFIC_LIGHT_INSET_PX } from './TopNav';
import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { Footer } from './Footer';
import { RequestAccess } from './RequestAccess';
import { ErrorBoundary, ToastContainer, CommandPalette, PageSkeleton, useCommandPalette, toast } from '@/components/shared';
import { InspectorHost } from '@/components/inspect/InspectorHost';
import { EvidencePane } from '@/components/inspect/EvidencePane';
import { useUIStore, useOperatorStore } from '@/stores';
import { isTerminal } from '@/lib/container';
import { beginInteraction, afterPaint, readTally, settleWhenQuiet } from '@/lib/perf';
import { inFlightCount } from '@/lib/readCache';
import { OfflineBanner } from './OfflineBanner';
import { AccessUnverifiedBanner } from './AccessUnverifiedBanner';
import { startConnectivityWatch } from '@/lib/online';
import { useAccessStore } from '@/stores/useAccessStore';
import { useGoGrammar } from '@/hooks/useGoGrammar';
import { useManual } from '@/hooks/useManual';
import { ManualHost } from '@/components/help/ManualHost';
import { useHints } from '@/hooks/useHints';
import { useSplitViewChord } from '@/hooks/useSplitView';
import { HintLayer } from '@/components/help/HintLayer';
import { TourHost } from '@/components/teach/TourHost';
import { SignatureBackdrop } from '@/components/command/SignatureBackdrop';

export function AppLayout() {
  const sidebarCollapsed = useUIStore(s => s.sidebarCollapsed);
  const darkMode = useUIStore(s => s.darkMode);
  const operator = useOperatorStore(s => s.operator);
  const { open, setOpen } = useCommandPalette();
  const location = useLocation();
  const navigate = useNavigate();
  const accessMe = useAccessStore(s => s.me);
  const accessLoaded = useAccessStore(s => s.loaded);
  const loadAccess = useAccessStore(s => s.load);
  const syncFromPath = useAccessStore(s => s.syncFromPath);

  // LCX OS (Phase 1): boot the entitlement picture once per sign-in; the
  // server stays the enforcer — this only shapes the shell.
  useEffect(() => {
    if (operator) void loadAccess();
  }, [operator, loadAccess]);

  // Deep links front the workspace they belong to.
  useEffect(() => {
    syncFromPath(location.pathname);
  }, [location.pathname, syncFromPath]);

  // ── Speed floor: measure every route change (TERMINAL Phase 2) ────────────
  // Scope, stated honestly: this clock starts when the route COMMITS, so it
  // covers the lazy chunk fetch, the page's own mount work, and the paint — but
  // not the few ms between the operator's click and the router committing. It is
  // the dominant part of a navigation, not all of it. Per-surface p95 lands in
  // the status-bar HUD and, after a flush, in the Ops Health SLO panel.
  useEffect(() => {
    const i = beginInteraction('nav', location.pathname);
    // Snapshot the read tally so the sample can say whether this navigation was
    // actually served locally. Without it, `cached` would be a guess — and the
    // cache-hit rate next to the p95 is what makes the p95 believable.
    const before = readTally();
    // Why `cancelled` as well as the cleanup: `afterPaint` is two frames out, so a
    // navigation inside ~32ms runs this effect's cleanup BEFORE the callback fires.
    // At that moment `stopSettleWatch` is still undefined, so the cleanup has
    // nothing to stop, and the callback would then start a watcher for the route the
    // operator already left — polling until it settles and filing the sample under
    // the wrong surface.
    //
    // Honestly scoped: the PREMISE is pinned by a test ("afterPaint lands after a
    // synchronous cleanup" in lib/__tests__/settle.test.ts). This specific effect's
    // use of it is NOT — that needs AppLayout rendered under a router with a
    // sub-32ms double navigation, which nothing here does. Reasoned, not measured.
    let cancelled = false;
    let stopSettleWatch: (() => void) | undefined;

    // Stop on the paint AFTER this route's first render, not on the effect —
    // effects run before the browser paints, so ending here would report a time
    // the operator never experienced.
    afterPaint(() => {
      const after = readTally();
      i.paint({ cached: after.misses === before.misses });
      if (cancelled) return;

      // SETTLE — and this is deliberately NOT a second `afterPaint` (T1 #23).
      //
      // It used to be exactly that: two `afterPaint` callbacks registered
      // back-to-back, firing in the same frame, producing two samples of the same
      // instant. So `ui_settle_p95` was a second copy of `ui_interaction_p95`, and
      // the two-metric SLO — whose entire justification is that a single paint
      // metric IMPROVES when a read is moved to network-only for governance
      // reasons — was published on a pair of numbers that could not possibly
      // disagree. Zero exposure, because paint happens to be equally
      // read-independent, and a false claim regardless.
      //
      // Settle is now the read layer going quiet: zero requests in flight, held
      // quiet briefly so a chained read is not mistaken for the end. A read moved
      // off the cache leaves the paint path and lands here, which is the whole
      // point. Started from INSIDE the paint callback on purpose — before the
      // paint the route's lazy chunk may not have loaded, so no child has issued a
      // read yet and the probe would read a misleading zero.
      stopSettleWatch = settleWhenQuiet(i, inFlightCount, {
        // For settle, `cached` means the stronger thing it should always have
        // meant: this navigation completed without touching the network at all.
        // Evaluated at settle time, by which point every read has been counted.
        cached: () => readTally().misses === before.misses,
      });
    });

    return () => {
      cancelled = true;
      stopSettleWatch?.();
    };
  }, [location.pathname]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // Offline is read-only, and the operator has to be told so — governed writes
  // stay online because gates read their inputs at write time and three of them
  // fail open on error, so a queued write would be judged against stale truth.
  useEffect(() => startConnectivityWatch(), []);

  // LCXOS (Phase 6): `?` answers "what can I do here", generated from the
  // action registry rather than written down, so it cannot describe a shortcut this
  // build does not have.
  const manual = useManual();

  // LCXOS (Phase 7): `f` tags every actionable element in the viewport so a
  // tag can be typed to activate it. This is the mechanism LCX_TERMINAL_PLAN.md §C
  // promised for the 198 controls that arrow keys and a roving tabindex cannot
  // reach — targets are discovered by querying the DOM at press time, so no page
  // opts in and pages written later are covered on the day they render. Only the
  // key listener is eager; the layer itself is a lazy chunk.
  const hints = useHints();

  // LCXOS (T1 #12): `⌘\` docks the universal inspector BESIDE the surface
  // instead of over it. The point is not the layout, it is the keyboard: an
  // InspectorDrawer makes `isOverlayOpen()` true, which silences the row arrows and —
  // on the BD queue — `s` snooze, `d` disqualify, `e` enroll and the split digits. So
  // reading a lead's evidence and acting on it were mutually exclusive. Docked, the
  // pane owns no keys and steals no focus, so the surface keeps all of them. The rule
  // for which pane a keystroke lands in, and why Escape does nothing to the pane, are
  // both argued in lib/split.ts.
  const split = useSplitViewChord();

  // LCXOS (Phase 4): `g` then a digit reaches any workspace from the
  // keyboard. This is NOT a port of the native ⌘1-6 accelerators — those cannot be
  // ported, because Chrome reserves ⌘1-⌘9 for tab switching and never delivers
  // them to the page (measured: zero keydowns from a capture-phase listener). Both
  // triggers resolve through lib/destinations, so they cannot drift apart.
  useGoGrammar((to) => navigate(to));

  // LCXOS (Phase 1): wire the native macOS menu + self-updater to the
  // app. The menu exists as much for DISCOVERABILITY as for use — every
  // shortcut we add in later phases appears there with its key. No-op in a
  // browser, so the web build is unaffected.
  // Depend on `manual.setOpen`, NEVER on `manual` (TERMINAL Phase 7). `useManual()`
  // returns a fresh `{ open, setOpen }` literal on every render, so listing the
  // object here re-ran this effect on every re-render of the shell — every route
  // change, sidebar toggle, palette open, theme flip. That silently turned the
  // once-per-launch update check into a check per render, and with an update
  // actually available, into concurrent `downloadAndInstall()` calls over the same
  // `.app` bundle. `setOpen` is a `useState` setter and is stable, as are
  // `navigate` and the palette's `setOpen`.
  const setManualOpen = manual.setOpen;
  useEffect(() => {
    if (!isTerminal()) return; // browser: never fetch the Tauri chunk at all
    let detach: (() => void) | undefined;
    void (async () => {
      const { attachTerminalBridge } = await import('@/lib/terminal');
      detach = await attachTerminalBridge({
        onNavigate: (to) => navigate(to),
        onCommandPalette: () => setOpen(true),
        onBack: () => navigate(-1),
        onForward: () => navigate(1),
        // The menu item is literally "LCXOS Manual" at ⌘/ and it used to open
        // Settings. A menu that promises one thing and does another is worse than a
        // missing menu item, because it teaches the operator the menu lies.
        onManual: () => setManualOpen(true),
        // The shell owns the only surface that can actually be seen: `alert()` is a
        // silent no-op in the Tauri webview (wry implements no JS alert panel), so
        // the updater has to speak through the toast layer or not at all.
        onNotice: (kind, message) => toast(kind, message, kind === 'warning' ? 9000 : 6000),
      });
    })();
    return () => detach?.();
  }, [navigate, setOpen, setManualOpen]);

  useEffect(() => {
    // App mounted cleanly — clear the chunk-reload guard so a later stale
    // deploy can also self-recover (see ErrorBoundary).
    try {
      sessionStorage.removeItem('lcx-os:chunk-reload');
    } catch {
      /* ignore */
    }
  }, []);

  /* THE FRONT DOOR, and which door depends on where you arrived.
   *
   * This used to be one line — every signed-out visitor to any URL was bounced to
   * `/select`, a passcode form that explains nothing. That is right for someone
   * following a deep link into a lead, and wrong for the person opening the link
   * we hand a colleague: they land on a credential prompt for a product they have
   * never heard of, with no way to get the Mac app.
   *
   * So bare `/` on the WEB goes to the public LCXOS page, and everything else
   * still goes straight to the door. Deep links keep their old behaviour on
   * purpose: a shared link to a specific record should ask you to sign in, not
   * silently show marketing and lose the thing you were sent.
   *
   * In the desktop app there is no landing page at all — you already downloaded
   * it, so showing you a download page would be absurd. `isTerminal()` is the
   * same check the rest of the shell uses for app-only behaviour.
   *
   * Note this deliberately keeps the desk at `/`. Moving it to `/desk` would have
   * been the tidier URL and would have churned every route, the `g`+digit chords,
   * ⌘K's page list, the tour and the e2e suite — a lot of risk bought with nothing
   * the operator can see.
   */
  if (!operator) {
    const toLanding = !isTerminal() && location.pathname === '/';
    return <Navigate to={toLanding ? '/lcxos' : '/select'} replace />;
  }

  // LCX OS compartment guard: a route inside a workspace you don't hold
  // renders the request-access surface in place of the page. Optimistic until
  // the first entitlement load resolves — the API 403s anything real.
  const routeWorkspace = workspaceForPath(location.pathname);
  const guarded =
    routeWorkspace !== null &&
    accessLoaded &&
    accessMe !== null &&
    /* GRANTS UNKNOWN IS NOT "NOT ENTITLED". Without this clause an unreachable grants table
       renders the request-access surface on every compartment route — the operator is told
       they lack access to their own desk, which is a worse lie than the empty launcher this
       replaced. `AccessUnverifiedBanner` names the state instead; the server still enforces. */
    accessMe.entitlementsUnavailable == null &&
    !capAtLeast(accessMe.entitlements[routeWorkspace], 'view');

  return (
    /* `relative isolate` exists for the backdrop below and for nothing else, and without it the
     * backdrop is INVISIBLE rather than wrong — which is the failure mode worth naming. The
     * layer positions itself `absolute inset-0 -z-10`. Painting order puts a negative-z child
     * above its stacking context's own background and below the in-flow content, which is
     * exactly the slot wanted; but this div creates no stacking context on its own (no
     * position, no z-index, no transform), so the child would search up to the ROOT element and
     * paint behind `bg-page` here. Nothing throws and nothing looks broken. `isolate` is what
     * makes this div the context. `pages/CommandDeck.tsx:89` already carries the same pair for
     * the same reason. */
    <div className="relative isolate flex h-screen flex-col bg-page text-navy">
      {/* X1 · AMBIENT. The one 3-D surface that is not opt-in — see the component for the
        * measurement that decides its amplitude, and for why it renders NOTHING in the light
        * theme. It costs no new GL context (it goes through `flat/shared.ts`, the same single
        * offscreen context every chart uses), draws no dataset, and takes no pointer events.
        *
        * It is mounted HERE rather than per page because this div is the only element that
        * spans the shell: `MainContent` has no background of its own, so `bg-page` above is
        * what a reader currently sees behind every route's cards, and this layer is what
        * replaces it. `/select` and `/lcxos` are siblings of this layout and are deliberately
        * not covered — the sign-in screen has E8's ForgeBackdrop already. */}
      <SignatureBackdrop />
      {/* Bypass Blocks (WCAG 2.4.1), and the most expensive focus defect measured
       * in this shell. Tabbing from the top of any route walked 24 chrome stops
       * before reaching the page content — 6 in the top bar, 17 sidebar
       * destinations, then the collapse toggle — and the shell re-renders on every
       * navigation, so the operator pays it again on each route. Counted on /,
       * /bd-pipeline, /deal-board and /command-deck; identical on all four.
       *
       * Parked off-screen with a transform rather than `sr-only` +
       * `focus:not-sr-only`: `not-sr-only` sets `position: static`, which then
       * races Tailwind's own `absolute` utility in the emitted cascade. A
       * transform has no such conflict, keeps the link in the tab order and the
       * a11y tree, and under `prefers-reduced-motion` the transition collapses to
       * 0.01ms so it simply appears — still correct, just not animated. */}
      {/* …and in LCXOS it has to move out from under the traffic lights. `left-2 top-2`
       * puts it at (8,8); the close button's measured frame is x 9..23, y 9..23 (see
       * TRAFFIC_LIGHT_INSET_PX), and macOS draws its buttons OVER the webview — so the
       * first tab stop of the whole app was appearing underneath them. Same inset as the
       * header, same one definition, and `undefined` in a browser so the web build keeps
       * `left-2` exactly. */}
      <a
        href="#main-content"
        style={isTerminal() ? { left: TRAFFIC_LIGHT_INSET_PX } : undefined}
        className="focus-ring fixed left-2 top-2 z-[300] -translate-y-16 rounded border border-line bg-card px-3 py-1.5 text-label font-semibold text-navy shadow-overlay transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>
      <TopNav onOpenSearch={() => setOpen(true)} />
      <OfflineBanner />
      <AccessUnverifiedBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        {/* `resetKey` is what stops one page's crash from following the operator
          * around the app. Without it, a lead with a malformed website URL took out
          * every subsequent route until a full reload — see ErrorBoundary's own
          * docstring for the measurement. */}
        <ErrorBoundary resetKey={location.pathname}>
          <MainContent collapsed={sidebarCollapsed}>
            {/* Each route is code-split; the skeleton covers its first fetch. */}
            <Suspense fallback={<div className="p-5"><PageSkeleton /></div>}>
              {guarded && routeWorkspace ? <RequestAccess workspace={routeWorkspace} /> : <Outlet />}
            </Suspense>
          </MainContent>
        </ErrorBoundary>
        {/* A flex SIBLING of the content, not an overlay over it: the surface has to
          * actually reflow to a narrower width, or the pane covers the columns the
          * operator is triaging on and we have rebuilt the drawer. Rendered only when
          * docked AND wide enough — see `canSplitAt`. */}
        {split.docked && <EvidencePane />}
      </div>
      <Footer />
      <ToastContainer />
      <InspectorHost docked={split.docked} />
      <CommandPalette open={open} onClose={() => setOpen(false)} />
      {/* Below the manual's z-[120] on purpose: `f` stands down while any overlay owns
        * the keyboard, so the two are never up together by the front door — but `?`
        * deliberately does NOT stand down, so pressing it from hint mode must put the
        * manual on top rather than behind the tags. */}
      <HintLayer open={hints.on} onClose={() => hints.setOn(false)} />
      <ManualHost open={manual.open} onClose={() => manual.setOpen(false)} />
      {/* The per-persona first run (T1 #19). Generated from THIS operator's
        * entitlements, so it never walks anyone through a compartment they cannot
        * open; skipped or finished, it never returns. The gate is eager and tiny, the
        * tour itself is a lazy chunk that a settled operator never fetches — and it
        * deliberately does NOT register on the dismiss stack, because one entry there
        * silences `g` and `f`, which are most of what it exists to teach. */}
      <TourHost />
    </div>
  );
}
