import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Briefcase, Gauge, TrendingUp, FileBarChart, Newspaper, Table2, Bot, Radar, ScatterChart, ListChecks, KanbanSquare, Layers, Send, LayoutDashboard, GitBranch, Map, Grid3X3, Sliders, Settings, ChevronLeft, ChevronRight, ChevronDown, Scale, ToggleLeft, ListTodo, FileText, DollarSign, Calendar, AlertTriangle, RotateCcw, Swords, Target, ScrollText, MessageSquare, BarChart3, Shield } from 'lucide-react';
import { useUIStore, useFilterStore, useAuditStore } from '@/stores';
import { redFlags } from '@/data';
import { domains } from '@/data/domains';
import { StatusLegend } from '@/components/shared';
import { Status, Phase } from '@/types/ontology';
import { clsx } from 'clsx';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

interface NavSection {
  title: string;
  items: NavItem[];
  collapsible?: boolean;
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
    collapsible: true,
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
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

const statuses: Status[] = ['Ready', 'Conditional', 'Blocked', 'Deferred', 'Needs verification'];
const phases: Phase[] = ['Pre-launch', 'Phase 1', 'Phase 2', 'Phase 3', 'Post-CLARITY'];

const domainShortLabels: Record<string, string> = {
  'Surveillance, travel-rule, sanctions, and reporting': 'Surveillance & Sanctions',
  'Anti-fraud and unfair-practices enforcement': 'Anti-Fraud Enforcement',
  'Custody, reserves, and insurance requirements': 'Custody & Reserves',
  'Digital commodity classification and listing': 'Commodity Classification',
  'Consumer-protection disclosures and advertising': 'Consumer Protection',
  'Corporate governance and CCO obligations': 'Governance & CCO',
};

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { selectedStatuses, selectedPhases, selectedDomains, toggleArrayFilter, resetFilters } = useFilterStore();
  const { resolvedRemediations } = useAuditStore();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const unresolvedCount = redFlags.filter(rf => {
    if (rf.risk !== 'Critical' && rf.risk !== 'High') return false;
    return rf.remediations.some(r => !resolvedRemediations.includes(r.id));
  }).length;

  const hasActiveFilters = selectedStatuses.length > 0 || selectedPhases.length > 0 || selectedDomains.length > 0;

  const renderItem = ({ to, label, icon: Icon }: NavItem) => {
    const isRedFlags = to === '/red-flags';
    return (
      <NavLink
        key={to}
        to={to}
        end={to === '/'}
        className={({ isActive }) =>
          clsx(
            'flex items-center gap-3 rounded-md px-2 py-1.5 text-sm relative',
            isActive ? 'bg-navy text-card' : 'text-navy hover:bg-ice-soft dark:hover:bg-ice-soft/10'
          )
        }
      >
        <Icon size={17} className="shrink-0" />
        {!sidebarCollapsed && <span className="flex-1 truncate">{label}</span>}
        {!sidebarCollapsed && isRedFlags && unresolvedCount > 0 && (
          <span className="bg-red-500 text-white font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" aria-label={`${unresolvedCount} unresolved critical risks`}>
            {unresolvedCount}
          </span>
        )}
        {sidebarCollapsed && isRedFlags && unresolvedCount > 0 && (
          <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full animate-pulse-beacon" />
        )}
      </NavLink>
    );
  };

  return (
    <aside className={clsx('flex flex-col border-r border-line bg-card transition-all duration-300 overflow-y-auto', sidebarCollapsed ? 'w-14' : 'w-64')}>
      <div className="flex items-center justify-between p-3 border-b border-line">
        {!sidebarCollapsed && <span className="font-semibold text-sm">Navigation</span>}
        <button onClick={toggleSidebar} className="ml-auto rounded p-1 hover:bg-ice-soft" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {sections.map(section => {
          const isOpen = section.collapsible ? (openSections[section.title] ?? false) : true;
          return (
            <div key={section.title} className="pb-1">
              {!sidebarCollapsed &&
                (section.collapsible ? (
                  <button
                    onClick={() => setOpenSections(s => ({ ...s, [section.title]: !isOpen }))}
                    className="flex w-full items-center justify-between px-2 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-grey hover:text-navy"
                  >
                    {section.title}
                    <ChevronDown size={12} className={clsx('transition-transform', !isOpen && '-rotate-90')} />
                  </button>
                ) : (
                  <h3 className="px-2 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-grey">{section.title}</h3>
                ))}
              {sidebarCollapsed && <div className="mx-2 my-2 border-t border-line" />}
              {(sidebarCollapsed || isOpen) && <div className="space-y-0.5">{section.items.map(renderItem)}</div>}
            </div>
          );
        })}
      </nav>
      {!sidebarCollapsed && (
        <div className="p-3 space-y-2 border-t border-line">
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-red-500 hover:text-red-600 transition-colors mb-1"
            >
              <RotateCcw size={10} />
              Clear All Filters
            </button>
          )}
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-grey mt-3 mb-1">Status</h3>
          <div className="flex flex-wrap gap-1">
            {statuses.map(s => (
              <button
                key={s}
                onClick={() => toggleArrayFilter('selectedStatuses', s)}
                className={clsx('text-xs border rounded-full px-2 transition-all', selectedStatuses.includes(s) ? 'bg-navy text-card' : '')}
              >
                {s}
              </button>
            ))}
          </div>
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-grey mt-3 mb-1">Phase</h3>
          <div className="flex flex-wrap gap-1">
            {phases.map(p => (
              <button
                key={p}
                onClick={() => toggleArrayFilter('selectedPhases', p)}
                className={clsx('text-xs border rounded-full px-2 transition-all', selectedPhases.includes(p) ? 'bg-navy text-card' : '')}
              >
                {p}
              </button>
            ))}
          </div>
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-grey mt-3 mb-1">Domain</h3>
          <div className="flex flex-wrap gap-1">
            {domains.map(d => (
              <button
                key={d.id}
                onClick={() => toggleArrayFilter('selectedDomains', d.id)}
                className={clsx('text-xs border rounded-full px-2 truncate max-w-[200px] transition-all', selectedDomains.includes(d.id) ? 'bg-navy text-card' : '')}
              >
                {domainShortLabels[d.name] || d.name}
              </button>
            ))}
          </div>
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-grey mt-3 mb-1">Legend</h3>
          <StatusLegend />
        </div>
      )}
    </aside>
  );
}
