import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Briefcase, Gauge, TrendingUp, FileBarChart, Newspaper, Table2, Bot, Radar, ScatterChart, ListChecks, KanbanSquare, Layers, Send, LayoutDashboard, GitBranch, Map, Grid3X3, Sliders, Settings, ChevronLeft, ChevronRight, ChevronDown, Scale, ToggleLeft, ListTodo, FileText, DollarSign, Calendar, AlertTriangle, Swords, Target, ScrollText, MessageSquare, BarChart3, Shield } from 'lucide-react';
import { useUIStore, useAuditStore } from '@/stores';
import { redFlags } from '@/data';
import { SidebarFieldNotes } from './SidebarFieldNotes';
import { clsx } from 'clsx';

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

const sections: NavSection[] = [
  {
    title: 'BD Operations',
    items: [
      { to: '/bd-pipeline', label: 'BD Engine', icon: Target },
      { to: '/exchange-gaps', label: 'Exchange Gaps', icon: Layers },
      { to: '/deal-board', label: 'Deal Board', icon: KanbanSquare },
      { to: '/deal-desk', label: 'Deal Desk', icon: Briefcase },
      { to: '/outreach-ops', label: 'Outreach Ops', icon: Gauge },
      { to: '/send-queue', label: 'Send Queue', icon: Send },
      { to: '/outreach', label: 'Handoff Queue', icon: MessageSquare },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { to: '/ai-tools', label: 'AI Console', icon: Bot },
      { to: '/win-loss', label: 'Win / Loss', icon: TrendingUp },
      { to: '/market-news', label: 'Market News', icon: Newspaper },
      { to: '/market-map', label: 'Market Map', icon: ScatterChart },
      { to: '/bd-kpis', label: 'KPI Dashboard', icon: BarChart3 },
      { to: '/board-report', label: 'Board Report', icon: FileBarChart },
      { to: '/report-builder', label: 'Report Builder', icon: Table2 },
    ],
  },
  {
    title: 'CRM',
    items: [
      { to: '/tasks', label: 'My Tasks', icon: ListChecks },
      { to: '/notes', label: 'Notes & Docs', icon: FileText },
      { to: '/integrations', label: 'Integrations', icon: Radar },
    ],
  },
  {
    title: 'Compliance',
    items: [
      { to: '/claim-library', label: 'Claim Library', icon: ScrollText },
      { to: '/audit-log', label: 'Audit Log', icon: Shield },
    ],
  },
  {
    title: 'Regulatory Toolkit',
    defaultOpen: false,
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
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { resolvedRemediations } = useAuditStore();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(sections.map(s => [s.title, s.defaultOpen ?? true])),
  );

  const unresolvedCount = redFlags.filter(rf => {
    if (rf.risk !== 'Critical' && rf.risk !== 'High') return false;
    return rf.remediations.some(r => !resolvedRemediations.includes(r.id));
  }).length;

  const renderItem = ({ to, label, icon: Icon }: NavItem) => {
    const isRedFlags = to === '/red-flags';
    return (
      <NavLink
        key={to}
        to={to}
        end={to === '/'}
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
    <aside className={clsx('flex flex-col overflow-y-auto border-r border-line bg-card transition-all duration-300', sidebarCollapsed ? 'w-14' : 'w-56')}>
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
              {(sidebarCollapsed || isOpen) && <div className="space-y-px">{section.items.map(renderItem)}</div>}
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
