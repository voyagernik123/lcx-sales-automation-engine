import { Suspense, useEffect } from 'react';
import { Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { workspaceForPath, capAtLeast } from '@lcx/shared';
import { TopNav } from './TopNav';
import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { Footer } from './Footer';
import { RequestAccess } from './RequestAccess';
import { ErrorBoundary, ToastContainer, CommandPalette, PageSkeleton, useCommandPalette } from '@/components/shared';
import { InspectorHost } from '@/components/inspect/InspectorHost';
import { useUIStore, useOperatorStore } from '@/stores';
import { isTerminal } from '@/lib/container';
import { beginInteraction, afterPaint } from '@/lib/perf';
import { useAccessStore } from '@/stores/useAccessStore';

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
    // Stop on the paint AFTER this route's first render, not on the effect —
    // effects run before the browser paints, so ending here would report a time
    // the operator never experienced.
    afterPaint(() => i.paint());
    // Route data still arriving is measured by the cache layer's settle marks;
    // a route with no async reads settles when it paints.
    afterPaint(() => i.settle());
  }, [location.pathname]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // LCX TERMINAL (Phase 1): wire the native macOS menu + self-updater to the
  // app. The menu exists as much for DISCOVERABILITY as for use — every
  // shortcut we add in later phases appears there with its key. No-op in a
  // browser, so the web build is unaffected.
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
      });
    })();
    return () => detach?.();
  }, [navigate, setOpen]);

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
      <TopNav onOpenSearch={() => setOpen(true)} />
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
    </div>
  );
}
