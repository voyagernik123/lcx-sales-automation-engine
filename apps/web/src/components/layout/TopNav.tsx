import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, Sun, Moon, LogOut, ChevronDown } from 'lucide-react';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { useUIStore, useOperatorStore, ROLE_LABEL } from '@/stores';
import { clearOperatorEmail } from '@/lib/apiClient';
import { storage } from '@/lib/persistence';
import { useAccessStore } from '@/stores/useAccessStore';
import { NotificationBell } from './NotificationBell';
import { LcxMark } from '@/components/brand/LcxMark';

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

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-line bg-card px-4">
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

      <WorkspaceSwitcher />

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

        <NotificationBell />

        <button
          onClick={toggleDarkMode}
          className="rounded-md p-1.5 text-grey transition-colors hover:bg-ice-soft hover:text-navy dark:hover:bg-ice-soft/10"
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <div className="relative" ref={operatorMenuRef}>
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
