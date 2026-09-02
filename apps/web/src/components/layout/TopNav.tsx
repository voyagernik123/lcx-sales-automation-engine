import { GLASS_CHROME_CLASS } from '@/lib/glass';
import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, Sun, Moon, LogOut, ChevronDown } from 'lucide-react';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { useUIStore, useOperatorStore, ROLE_LABEL } from '@/stores';
import { clearOperatorEmail } from '@/lib/apiClient';
import { storage } from '@/lib/persistence';
import { useAccessStore } from '@/stores/useAccessStore';
import { NotificationBell } from './NotificationBell';
import { WatchStrip } from './WatchStrip';
import { LcxMark } from '@/components/brand/LcxMark';
import { isTerminal } from '@/lib/container';

/**
 * How far the header's content is pushed in so nothing sits under macOS's own
 * close/minimise/zoom buttons.
 *
 * THIS NUMBER IS ONLY CORRECT WHILE `tauri.conf.json` SAYS `titleBarStyle: "Overlay"`,
 * and that config line was changed with this one — pinned by
 * `__tests__/topNavChrome.test.tsx` so the pair cannot drift.
 *
 * The window used to say `"Transparent"`, and the widely-repeated reading of that value
 * ("it removes the title bar and hands you the full window") is WRONG. Measured, not
 * assumed:
 *
 *   Transparent  windowH=932 contentH=900 contentTop=32  close y 9..23  zoom maxX=69
 *   Overlay      windowH=900 contentH=900 contentTop=0   close y 9..23  zoom maxX=69
 *
 * Under `Transparent` the webview starts 32pt DOWN, below a real (if transparent) title
 * strip — the traffic lights never touched the wordmark, and the strip dragged the window
 * natively. Upstream says so too: `TitleBarStyle::Transparent` sets
 * `titlebarAppearsTransparent(true)` with `fullsize_content_view(FALSE)`
 * (tauri-runtime-wry-2.11.4/src/lib.rs:1207-1210), and only `FullSizeContentView` pulls
 * the content view up (tao-0.35.3/src/platform_impl/macos/window.rs:242-243). So an inset
 * added under `Transparent` would have been a 78px hole below a stock grey band — the
 * browser regression this file guards against, shipped on the desk instead.
 *
 * `Overlay` is the state worth having: the app's own header IS the title bar, which is
 * what makes the two consequences real and this inset necessary — the buttons now sit on
 * the header, and the window can only be moved by a declared drag region.
 *
 * The inset itself is MEASURED on this machine (macOS 26 / Darwin 27), because the button
 * metrics moved in Big Sur and every "known" value in circulation is one of the older ones.
 * An NSWindow built with the mask `Overlay` produces —
 * `.titled|.closable|.miniaturizable|.resizable|.fullSizeContentView`,
 * `titlebarAppearsTransparent`, `titleVisibility = .hidden` — reports:
 *
 *     close  x=9   w=14      min  x=32  w=14      zoom  x=55  w=14
 *
 * so the buttons occupy the leading 69pt. The inset is 69 + 9 = 78pt: the strip they
 * cover, plus a gutter equal to the leading margin macOS itself gave the first button.
 * Only the HORIZONTAL axis needs it — the buttons occupy y 9..23, inside the header's 48px.
 *
 * In a browser this must be 0. A 78px hole in the web build's header is a regression for
 * every operator who never installs the app.
 */
export const TRAFFIC_LIGHT_INSET_PX = 78;

const routeLabels: Record<string, string> = {
  'capital-estimator': 'Capital Estimator',
  'brief-generator': 'Brief Generator',
  'red-flags': 'Red Flags & Audit',
  'howey': 'Howey Calculator',
  'scenario': 'Scenario Planner',
  'states': 'State Map',
  'products': 'Product Matrix',
  'simulator': 'Simulator',
  'readiness': 'Readiness Stack',
  'roadmap': 'Launch Roadmap',
  'settings': 'Settings',
  'ontology': 'Ontology Explorer',
  'bd-pipeline': 'BD Engine',
  'bd-kpis': 'KPI Dashboard',
  'deal-board': 'Deal Board',
  'deal-desk': 'Deal Desk',
  'exchange-gaps': 'Exchange Gaps',
  'outreach-ops': 'Outreach Ops',
  'send-queue': 'Send Queue',
  'outreach': 'Handoff Queue',
  'ai-tools': 'AI Console',
  'win-loss': 'Win / Loss',
  'market-news': 'Market News',
  'market-map': 'Market Map',
  'targets': 'Targets',
  'brief': 'Daily Brief',
  'command': 'Command Center',
  'forecast': 'Forecast',
  'scorecard': 'Scorecard',
  'coverage': 'Coverage Report',
  'board-report': 'Board Report',
  'report-builder': 'Report Builder',
  'claim-library': 'Claim Library',
  'audit-log': 'Audit Log',
  'ops': 'Ops Health',
};

/**
 * Command bar — single-tone chrome. Breadcrumb on the left, omnisearch in the
 * center (opens the Cmd+K palette), environment/notifications/theme/identity
 * on the right. The chrome shares the card surface with the sidebar; hairlines
 * do the separating, typography does the hierarchy.
 */
export function TopNav({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { darkMode, toggleDarkMode } = useUIStore();
  const operator = useOperatorStore(s => s.operator);
  const clearOperator = useOperatorStore(s => s.clearOperator);
  const { pathname } = useLocation();
  const crumbs = pathname
    .split('/')
    .filter(Boolean)
    // Raw ids (uuids / composite keys) don't belong in a breadcrumb — the
    // page header names the entity.
    .filter(p => !/[0-9a-f]{8}-[0-9a-f]{4}/i.test(p))
    .map(p => routeLabels[p] || p.charAt(0).toUpperCase() + p.slice(1));

  const [showOperatorMenu, setShowOperatorMenu] = useState(false);
  const operatorMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (operatorMenuRef.current && !operatorMenuRef.current.contains(e.target as Node)) {
        setShowOperatorMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  /* Which container is this? Read at render, through the shell's ONE definition
   * (`lib/container.ts`), so the drag region and the inset cannot disagree with the rest
   * of the app about whether we are in LCXOS. Everything below is `undefined` in a
   * browser, which makes React omit the attribute entirely — not render it empty. */
  const terminal = isTerminal();
  /* `false`, not absent, on the three subtrees that open panels. Tauri's walk
   * (tauri-2.11.5/src/window/scripts/drag.js:51-69) climbs from the click target: a
   * BUTTON stops it, but a panel's own divs and text do not, so reading an open dropdown
   * would drag the window. `display: contents` keeps these guards out of the layout —
   * the attribute is found via the DOM path, which does not care that the box is gone. */
  const noDrag = terminal ? 'false' : undefined;

  return (
    <header
      /* `deep` rather than a bare attribute: bare drags only on a DIRECT hit on the
       * element (drag.js:66), which in a flex header is the gaps between children. `deep`
       * (drag.js:64) makes the breadcrumb and the empty middle draggable too, while
       * clickable tags still block it (drag.js:58) — so no control is sacrificed. */
      data-tauri-drag-region={terminal ? 'deep' : undefined}
      style={terminal ? { paddingLeft: TRAFFIC_LIGHT_INSET_PX } : undefined}
      className={`flex h-12 shrink-0 items-center gap-4 border-b border-line px-4 ${GLASS_CHROME_CLASS}`}
    >
      {/* The product signature. The mark inherits `text-navy` via currentColor, so it
        * is legible in both themes without a second asset — and cannot become the
        * low-contrast lockup the brand book forbids. */}
      <Link
        to="/"
        className="flex shrink-0 items-center gap-1.5 text-[13px] font-bold tracking-tight text-navy"
        aria-label="LCXOS — home"
      >
        <LcxMark size={16} />
        LCXOS
      </Link>

      <span className="contents" data-tauri-drag-region={noDrag}>
        <WorkspaceSwitcher />
      </span>

      <nav className="flex min-w-0 items-center gap-1.5 text-body text-grey" aria-label="Breadcrumb">
        {crumbs.length === 0 ? (
          <span className="font-medium text-navy">Home</span>
        ) : (
          crumbs.map((c, i) => (
            <span key={c} className="flex min-w-0 items-center gap-1.5">
              <span className="text-grey/50">/</span>
              <span className={i === crumbs.length - 1 ? 'truncate font-medium text-navy' : 'truncate'}>
                {c}
              </span>
            </span>
          ))
        )}
      </nav>

      <div className="flex min-w-0 flex-1 justify-center px-2">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-8 w-full max-w-md items-center gap-2 rounded-md border border-line bg-page px-3 text-label text-grey transition-colors hover:border-grey-light dark:hover:border-grey"
        >
          <Search size={13} className="shrink-0" />
          <span className="flex-1 truncate text-left">Search or type a command…</span>
          <kbd className="rounded border border-line bg-card px-1.5 py-px font-mono text-[10px] text-grey">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span
          className="flex items-center gap-1.5 rounded border border-line px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider text-grey"
          title={import.meta.env.PROD ? 'Production environment' : 'Local development environment'}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${import.meta.env.PROD ? 'bg-emerald-500' : 'bg-amber-500'}`}
          />
          {import.meta.env.PROD ? 'LIVE' : 'LOCAL'}
        </span>

        {/* THE WATCH (S4): the arriving officer's board — the one mount of the arrival driver. */}
        <div className="hidden min-w-0 max-w-[40vw] lg:block" data-tauri-drag-region={noDrag}>
          <WatchStrip />
        </div>
        <span className="contents" data-tauri-drag-region={noDrag}>
          <NotificationBell />
        </span>

        <button
          onClick={toggleDarkMode}
          className="rounded-md p-1.5 text-grey transition-colors hover:bg-ice-soft hover:text-navy dark:hover:bg-ice-soft/10"
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <div className="relative" ref={operatorMenuRef} data-tauri-drag-region={noDrag}>
          <button
            onClick={() => setShowOperatorMenu(o => !o)}
            className="flex items-center gap-2 rounded-md border border-line py-1 pl-1 pr-2 transition-colors hover:bg-ice-soft dark:hover:bg-ice-soft/10"
          >
            {operator ? (
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: operator.colorVar }}
              >
                {operator.initials}
              </span>
            ) : (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-grey/40 text-[10px] font-bold text-white">
                ?
              </span>
            )}
            <span className="text-label font-semibold text-navy">{operator?.name ?? 'Sign in'}</span>
            <ChevronDown size={12} className="text-grey" />
          </button>
          {showOperatorMenu && (
            <div className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-lg border border-line bg-card shadow-overlay">
              {operator && (
                <div className="border-b border-line px-3 py-2">
                  <div className="text-label font-semibold text-navy">{operator.name}</div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-grey">
                    {ROLE_LABEL[operator.role]}
                    {operator.role === 'approver' && ' · can sign off deals'}
                  </div>
                </div>
              )}
              <button
                onClick={() => {
                  setShowOperatorMenu(false);
                  const forgotten = clearOperatorEmail(); // memory + localStorage now, Keychain async
                  clearOperator(); // identity → the guard sends us to /select
                  useAccessStore.getState().reset(); // entitlements + active workspace
                  storage.clearAll(); // every locally persisted key, for every operator
                  // The read cache is NOT cleared here. `clearOperatorEmail()` above owns
                  // it now (T1 #9) and returns the promise this handler waits on, because
                  // the clear has to be awaited to its IndexedDB `complete` event — the
                  // durability point, not the request's `success` — or the hard navigation
                  // below tears down the transaction mid-flight and the bodies survive.
                  // A second `clearReadCache()` call on this line would be harmless and
                  // idempotent, and that is exactly why it was worth deleting: it read as
                  // the thing making sign-out safe while the awaited `forgotten` promise
                  // above was doing the work, so the next person to touch this handler
                  // would have reordered around the wrong line.

                  // Hard navigation, not a client-side route change. Sign-out has to
                  // leave no residue: a SPA navigation keeps every zustand store alive
                  // in memory, so the next person to sign in on this Mac would still
                  // be looking at the previous operator's filters, notes and desk
                  // state. A fresh document guarantees a clean process.
                  //
                  // But it has to come AFTER the Keychain forget lands (TERMINAL
                  // Phase 7). In LCXOS that delete is an IPC round-trip into
                  // the Rust shell, and this navigation tears down the JS context
                  // that owns it — so firing both in the same tick made "sign-out
                  // actually forgets" a race, with the previous operator's desk
                  // passcode left in the login keychain when it lost. The catch is
                  // deliberate, and so is the bound: a Keychain that refuses — or that
                  // sits behind an unanswered access prompt — must not trap the
                  // operator on a desk they asked to leave, so the failure is ignored
                  // rather than surfaced. Everything reachable from the webview has
                  // ALREADY been cleared by the lines above; what a failure here loses
                  // is only the Keychain copy, which the next sign-in overwrites.
                  // Wait for the forget, but not forever.
                  const bounded = new Promise<void>(r => setTimeout(r, 2000));
                  void Promise.race([forgotten.catch(() => {}), bounded]).then(() =>
                    window.location.assign('/select'),
                  );
                }}
                className="focus-ring-inset flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-navy transition-colors hover:bg-ice-soft dark:hover:bg-ice-soft/10"
              >
                <LogOut size={12} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
