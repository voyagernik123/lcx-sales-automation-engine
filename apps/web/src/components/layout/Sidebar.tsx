import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Briefcase, Gauge, TrendingUp, FileBarChart, Newspaper, Table2, Bot, Radar, ScatterChart, ListChecks, KanbanSquare, Layers, Send, LayoutDashboard, GitBranch, Map, Grid3X3, Sliders, Settings, ChevronLeft, ChevronRight, ChevronDown, Scale, ToggleLeft, ListTodo, FileText, DollarSign, Calendar, AlertTriangle, Swords, Target, Crosshair, ScrollText, MessageSquare, BarChart3, Shield, Activity, Share2, Siren, CalendarClock, GitPullRequestArrow, Command, Landmark, KeyRound, Rocket, Megaphone, Compass, Keyboard } from 'lucide-react';
import { useUIStore, useAuditStore } from '@/stores';
import { useAccessStore, useMyWorkspaces } from '@/stores/useAccessStore';
import type { WorkspaceId } from '@lcx/shared';
import { redFlags } from '@/data';
import { SidebarFieldNotes } from './SidebarFieldNotes';
import { clsx } from 'clsx';
import { DESTINATIONS } from '@/lib/destinations';
import { markShown, nudgeFor, recordUse } from '@/lib/nudge';
import { toast } from '@/components/shared/Toast';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

interface NavSection {
  title: string;
  items: NavItem[];
  /** Defaults to true if omitted — nearly every section is user-collapsible. */
  defaultOpen?: boolean;
}

/**
 * LCX OS (Phase 1): one nav tree per workspace — the sidebar renders ONLY the
 * active workspace's deck plus the always-yours desk group. Groupings mirror
 * the compiled workspace constitution (@lcx/shared/workspaces.ts); a page
 * listed here but not entitled server-side would still 403 — the shell just
 * never shows it.
 */
const WS_SECTIONS: Record<WorkspaceId, NavSection[]> = {
  command: [
    {
      title: 'US Launch Command',
      items: [
        { to: '/command-deck', label: 'US Launch Deck', icon: Command },
        { to: '/command-partners', label: 'Partner Pipeline', icon: Briefcase },
        { to: '/command-ops', label: 'Command Ops', icon: Landmark },
      ],
    },
  ],
  sales: [
    {
      title: 'Pipeline',
      items: [
        { to: '/bd-pipeline', label: 'BD Engine', icon: Target },
        { to: '/exchange-gaps', label: 'Exchange Gaps', icon: Layers },
        { to: '/deal-board', label: 'Deal Board', icon: KanbanSquare },
        { to: '/deal-desk', label: 'Deal Desk', icon: Briefcase },
        { to: '/targets', label: 'Targets', icon: Crosshair },
      ],
    },
    {
      title: 'Outreach',
      items: [
        { to: '/outreach-ops', label: 'Outreach Ops', icon: Gauge },
        { to: '/send-queue', label: 'Send Queue', icon: Send },
        { to: '/outreach', label: 'Handoff Queue', icon: MessageSquare },
        { to: '/claim-library', label: 'Claim Library', icon: ScrollText },
      ],
    },
  ],
  intel: [
    {
      title: 'Intelligence',
      items: [
        { to: '/command', label: 'Command Center', icon: Radar },
        { to: '/brief', label: 'Daily Brief', icon: ScrollText },
        { to: '/ai-tools', label: 'AI Console', icon: Bot },
        { to: '/win-loss', label: 'Win / Loss', icon: TrendingUp },
        { to: '/forecast', label: 'Forecast', icon: Gauge },
        { to: '/scorecard', label: 'Scorecard', icon: Gauge },
        { to: '/market-news', label: 'Market News', icon: Newspaper },
        { to: '/market-map', label: 'Market Map', icon: ScatterChart },
        { to: '/graph', label: 'Sales Graph', icon: Share2 },
        { to: '/monitors', label: 'Monitors', icon: Siren },
      ],
    },
    {
      title: 'Reporting',
      items: [
        { to: '/bd-kpis', label: 'KPI Dashboard', icon: BarChart3 },
        { to: '/board-report', label: 'Board Report', icon: FileBarChart },
        { to: '/report-builder', label: 'Report Builder', icon: Table2 },
      ],
    },
  ],
  regulatory: [
    {
      title: 'Regulatory Toolkit',
      items: [
        { to: '/regulatory-dashboard', label: 'Regulatory Dashboard', icon: LayoutDashboard },
        { to: '/ontology', label: 'Ontology Explorer', icon: GitBranch },
        { to: '/states', label: 'State Map', icon: Map },
        { to: '/products', label: 'Product Matrix', icon: Grid3X3 },
        { to: '/simulator', label: 'Simulator', icon: Sliders },
        { to: '/howey', label: 'Howey Calculator', icon: Scale },
        { to: '/scenario', label: 'Scenario Planner', icon: ToggleLeft },
        { to: '/readiness', label: 'Readiness Stack', icon: ListTodo },
        { to: '/brief-generator', label: 'Brief Generator', icon: FileText },
        { to: '/capital-estimator', label: 'Capital Estimator', icon: DollarSign },
        { to: '/roadmap', label: 'Launch Roadmap', icon: Calendar },
        { to: '/red-flags', label: 'Red Flags & Audit', icon: AlertTriangle },
        { to: '/competition', label: 'Competition Analysis', icon: Swords },
        { to: '/product-intel', label: 'Product Intelligence', icon: Target },
      ],
    },
  ],
  distribution: [
    {
      title: 'Distribution Command',
      items: [
        { to: '/distribution', label: 'Cockpit', icon: Rocket },
        { to: '/distribution/listings', label: 'Listing Ops', icon: ListTodo },
        { to: '/distribution/campaigns', label: 'Campaign Ops', icon: Megaphone },
        { to: '/distribution/geo', label: 'GEO & Personas', icon: Radar },
        { to: '/distribution/atlas', label: 'Channel Atlas', icon: Compass },
      ],
    },
  ],
  marketing: [
    {
      title: 'LCX Marketing',
      items: [
        { to: '/marketing', label: 'Reply Desk', icon: Megaphone },
      ],
    },
  ],
  governance: [
    {
      title: 'Governance',
      items: [
        { to: '/wbr', label: 'Weekly Review', icon: CalendarClock },
        { to: '/decisions', label: 'Decision Log', icon: GitPullRequestArrow },
        { to: '/audit-log', label: 'Audit Log', icon: Shield },
        { to: '/ops', label: 'Ops Health', icon: Activity },
        { to: '/access', label: 'Access Control', icon: KeyRound },
      ],
    },
  ],
};

/**
 * Always-yours desk group — personal surfaces outside every compartment.
 *
 * The keyboard card lives here rather than under a workspace because the grammar it
 * prints is workspace-independent (the `g` digits cross every compartment), and
 * because it is the one page an operator visits to take something AWAY from the
 * screen. Governance would have been the other candidate; it is not a governed
 * artefact, it is a personal one.
 */
const DESK_SECTION: NavSection = {
  title: 'My Desk',
  items: [
    { to: '/tasks', label: 'My Tasks', icon: ListChecks },
    { to: '/notes', label: 'Notes & Docs', icon: FileText },
    { to: '/cheat-card', label: 'Keyboard Card', icon: Keyboard },
    { to: '/integrations', label: 'Integrations', icon: Radar },
    { to: '/settings', label: 'Settings', icon: Settings },
  ],
};


export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { resolvedRemediations } = useAuditStore();
  const activeWorkspace = useAccessStore(s => s.activeWorkspace);
  const myWorkspaces = useMyWorkspaces();
  // The deck you're flying: the active workspace's tree + the desk group.
  // Falls back to the first entitled workspace pre-selection so the sidebar
  // is never blank.
  const wsId = activeWorkspace ?? myWorkspaces[0]?.id ?? 'sales';
  const sections = [...(WS_SECTIONS[wsId] ?? []), DESK_SECTION];
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const unresolvedCount = redFlags.filter(rf => {
    if (rf.risk !== 'Critical' && rf.risk !== 'High') return false;
    return rf.remediations.some(r => !resolvedRemediations.includes(r.id));
  }).length;

  /**
   * Record a mouse-driven navigation and, rarely, teach the keyboard equivalent.
   *
   * `nudgeFor` returns null far more often than not — never on the first two clicks,
   * never once the operator has used `g` even once, never within ten minutes of the
   * last suggestion, and never again after three. That silence is the feature: the
   * failure mode of a shortcut coach is not a wrong tip, it is being told the same
   * thing eleven times until you stop reading anything the app says.
   */
  const teachFasterNavigation = (to: string) => {
    const destination = DESTINATIONS.find((d) => d.path === to);
    if (!destination) return; // not a workspace root — nothing faster to teach
    recordUse(destination.id, 'pointer');
    const hint = nudgeFor(destination.id);
    if (!hint) return;
    markShown(destination.id);
    toast('info', `Faster: press ${hint.keys.join(' then ')} — ${hint.what}`, 7000);
  };

  const renderItem = ({ to, label, icon: Icon }: NavItem) => {
    const isRedFlags = to === '/red-flags';
    return (
      <NavLink
        key={to}
        to={to}
        end={to === '/'}
        // The nudge engine's only pointer call site. Clicking a workspace in the
        // sidebar IS the slow way; `g` then a digit is the fast one. Recorded after
        // the navigation, never before — the operator's task always wins, and a
        // suggestion that delays what they asked for is not a suggestion.
        onClick={() => teachFasterNavigation(to)}
        className={({ isActive }) =>
          clsx(
            'relative flex items-center gap-2.5 rounded-md px-2 py-[5px] text-body',
            isActive
              ? 'bg-ice-soft/70 font-medium text-navy dark:bg-ice-soft/10'
              : 'text-grey-dark hover:bg-ice-soft/50 hover:text-navy dark:hover:bg-ice-soft/10'
          )
        }
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-cyan-600 dark:bg-cyan-400" />
            )}
            <Icon size={15} className="shrink-0" />
            {!sidebarCollapsed && <span className="flex-1 truncate">{label}</span>}
            {!sidebarCollapsed && isRedFlags && unresolvedCount > 0 && (
              <span
                className="shrink-0 rounded border border-red-500/30 bg-red-500/10 px-1 font-mono text-[10px] font-bold text-red-600 dark:text-red-400"
                aria-label={`${unresolvedCount} unresolved critical risks`}
              >
                {unresolvedCount}
              </span>
            )}
            {sidebarCollapsed && isRedFlags && unresolvedCount > 0 && (
              <span className="absolute right-1 top-1 h-2 w-2 animate-pulse-beacon rounded-full bg-red-500" />
            )}
          </>
        )}
      </NavLink>
    );
  };

  return (
    <aside className={clsx('flex flex-col overflow-y-auto border-r border-line bg-card t-panel', sidebarCollapsed ? 'w-14' : 'w-56')}>
      <nav className="flex-1 p-2">
        {sections.map(section => {
          const isOpen = openSections[section.title] ?? true;
          return (
            <div key={section.title} className="pb-1">
              {!sidebarCollapsed && (
                <button
                  onClick={() => setOpenSections(s => ({ ...s, [section.title]: !isOpen }))}
                  className="flex w-full items-center justify-between px-2 pb-1 pt-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-grey hover:text-navy"
                  aria-expanded={isOpen}
                >
                  {section.title}
                  <ChevronDown size={12} className={clsx('transition-transform', !isOpen && '-rotate-90')} />
                </button>
              )}
              {sidebarCollapsed && <div className="mx-2 my-2 border-t border-line" />}
              {(sidebarCollapsed || isOpen) && (
                section.items.length > 0 ? (
                  <div className="space-y-px">{section.items.map(renderItem)}</div>
                ) : (
                  !sidebarCollapsed && (
                    <p className="px-2 py-1 text-[10px] italic text-grey">
                      Surfaces arrive in LCX ONE Phase 3.
                    </p>
                  )
                )
              )}
            </div>
          );
        })}
      </nav>
      {!sidebarCollapsed && (
        <div className="border-t border-line p-3">
          <SidebarFieldNotes />
        </div>
      )}
      <div className="flex border-t border-line p-1.5">
        <button
          onClick={toggleSidebar}
          className={clsx(
            'rounded-md p-1 text-grey transition-colors hover:bg-ice-soft hover:text-navy dark:hover:bg-ice-soft/10',
            sidebarCollapsed ? 'mx-auto' : 'ml-auto'
          )}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>
    </aside>
  );
}
