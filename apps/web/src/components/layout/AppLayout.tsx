import { Suspense, useEffect } from 'react';
import { Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { workspaceForPath, capAtLeast } from '@lcx/shared';
import { TopNav } from './TopNav';
import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { Footer } from './Footer';
import { RequestAccess } from './RequestAccess';
import { ErrorBoundary, ToastContainer, CommandPalette, PageSkeleton, useCommandPalette, toast } from '@/components/shared';
import { InspectorHost } from '@/components/inspect/InspectorHost';
import { useUIStore, useOperatorStore } from '@/stores';
import { isTerminal } from '@/lib/container';
import { beginInteraction, afterPaint, readTally } from '@/lib/perf';
import { OfflineBanner } from './OfflineBanner';
import { startConnectivityWatch } from '@/lib/online';
import { useAccessStore } from '@/stores/useAccessStore';
import { useGoGrammar } from '@/hooks/useGoGrammar';
import { useManual } from '@/hooks/useManual';
import { ManualHost } from '@/components/help/ManualHost';

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
    // Stop on the paint AFTER this route's first render, not on the effect —
    // effects run before the browser paints, so ending here would report a time
    // the operator never experienced.
    afterPaint(() => {
      const after = readTally();
      i.paint({ cached: after.misses === before.misses });
    });
    // A route with no async reads settles when it paints; surfaces with their own
    // async regions will mark settle explicitly as they adopt the instrument.
    afterPaint(() => i.settle({ cached: readTally().misses === before.misses }));
  }, [location.pathname]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // Offline is read-only, and the operator has to be told so — governed writes
  // stay online because gates read their inputs at write time and three of them
  // fail open on error, so a queued write would be judged against stale truth.
  useEffect(() => startConnectivityWatch(), []);

  // LCX TERMINAL (Phase 6): `?` answers "what can I do here", generated from the
  // action registry rather than written down, so it cannot describe a shortcut this
  // build does not have.
  const manual = useManual();

  // LCX TERMINAL (Phase 4): `g` then a digit reaches any workspace from the
  // keyboard. This is NOT a port of the native ⌘1-6 accelerators — those cannot be
  // ported, because Chrome reserves ⌘1-⌘9 for tab switching and never delivers
  // them to the page (measured: zero keydowns from a capture-phase listener). Both
  // triggers resolve through lib/destinations, so they cannot drift apart.
  useGoGrammar((to) => navigate(to));

  // LCX TERMINAL (Phase 1): wire the native macOS menu + self-updater to the
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
        // The menu item is literally "LCX TERMINAL Manual" at ⌘/ and it used to open
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

  if (!operator) return <Navigate to="/select" replace />;

  // LCX OS compartment guard: a route inside a workspace you don't hold
  // renders the request-access surface in place of the page. Optimistic until
  // the first entitlement load resolves — the API 403s anything real.
  const routeWorkspace = workspaceForPath(location.pathname);
  const guarded =
    routeWorkspace !== null &&
    accessLoaded &&
    accessMe !== null &&
    !capAtLeast(accessMe.entitlements[routeWorkspace], 'view');

  return (
    <div className="flex h-screen flex-col bg-page text-navy">
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
      <a
        href="#main-content"
        className="focus-ring fixed left-2 top-2 z-[300] -translate-y-16 rounded border border-line bg-card px-3 py-1.5 text-label font-semibold text-navy shadow-overlay transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>
      <TopNav onOpenSearch={() => setOpen(true)} />
      <OfflineBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <ErrorBoundary>
          <MainContent collapsed={sidebarCollapsed}>
            {/* Each route is code-split; the skeleton covers its first fetch. */}
            <Suspense fallback={<div className="p-5"><PageSkeleton /></div>}>
              {guarded && routeWorkspace ? <RequestAccess workspace={routeWorkspace} /> : <Outlet />}
            </Suspense>
          </MainContent>
        </ErrorBoundary>
      </div>
      <Footer />
      <ToastContainer />
      <InspectorHost />
      <CommandPalette open={open} onClose={() => setOpen(false)} />
      <ManualHost open={manual.open} onClose={() => manual.setOpen(false)} />
    </div>
  );
}
