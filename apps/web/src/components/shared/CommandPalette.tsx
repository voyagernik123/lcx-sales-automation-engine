import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { clsx } from 'clsx';
import { states, products, redFlags } from '@/data';
import { request } from '@/lib/apiClient';

interface CommandItem {
  id: string;
  label: string;
  sublabel: string;
  to: string;
  type: 'state' | 'product' | 'flag' | 'page' | 'lead';
}

const PAGE_COMMANDS: CommandItem[] = [
  { id: 'bd-pipeline', label: 'BD Engine', sublabel: 'Priority lead queue', to: '/bd-pipeline', type: 'page' },
  { id: 'exchange-gaps', label: 'Exchange Gaps', sublabel: 'Listed elsewhere, not on LCX', to: '/exchange-gaps', type: 'page' },
  { id: 'deal-board', label: 'Deal Board', sublabel: 'Kanban pipeline', to: '/deal-board', type: 'page' },
  { id: 'deal-desk', label: 'Deal Desk', sublabel: 'Proposals, approvals, invoices', to: '/deal-desk', type: 'page' },
  { id: 'outreach-ops', label: 'Outreach Ops', sublabel: 'Sequences, A/B tests, mailbox health', to: '/outreach-ops', type: 'page' },
  { id: 'send-queue', label: 'Send Queue', sublabel: 'Assisted LinkedIn / Telegram touches', to: '/send-queue', type: 'page' },
  { id: 'handoffs', label: 'Handoff Queue', sublabel: 'Replies awaiting a human', to: '/outreach', type: 'page' },
  { id: 'ai-tools', label: 'AI Console', sublabel: 'Sentiment, objections, reply drafts', to: '/ai-tools', type: 'page' },
  { id: 'win-loss', label: 'Win / Loss', sublabel: 'What closes and why', to: '/win-loss', type: 'page' },
  { id: 'market-news', label: 'Market News', sublabel: 'Relevance-scored headlines', to: '/market-news', type: 'page' },
  { id: 'market-map', label: 'Market Map', sublabel: 'Universe scatter', to: '/market-map', type: 'page' },
  { id: 'bd-kpis', label: 'KPI Dashboard', sublabel: 'Funnel, forecast, reply rates', to: '/bd-kpis', type: 'page' },
  { id: 'board-report', label: 'Board Report', sublabel: 'Exec summary', to: '/board-report', type: 'page' },
  { id: 'report-builder', label: 'Report Builder', sublabel: 'Ad-hoc reports', to: '/report-builder', type: 'page' },
  { id: 'tasks', label: 'My Tasks', sublabel: 'Open follow-ups', to: '/tasks', type: 'page' },
  { id: 'notes', label: 'Notes & Docs', sublabel: 'Project notes and documents', to: '/notes', type: 'page' },
  { id: 'integrations', label: 'Integrations', sublabel: 'Connected services', to: '/integrations', type: 'page' },
  { id: 'claim-library', label: 'Claim Library', sublabel: 'Approved outreach claims', to: '/claim-library', type: 'page' },
  { id: 'audit-log', label: 'Audit Log', sublabel: 'Every state change', to: '/audit-log', type: 'page' },
  { id: 'dashboard', label: 'Dashboard', sublabel: 'Launch Control Cockpit', to: '/', type: 'page' },
  { id: 'ontology', label: 'Ontology Explorer', sublabel: 'Regulatory Relationship Graph', to: '/ontology', type: 'page' },
  { id: 'states', label: 'State Map', sublabel: 'Jurisdictional Operations Room', to: '/states', type: 'page' },
  { id: 'products', label: 'Product Matrix', sublabel: 'Asset Registry Ledger', to: '/products', type: 'page' },
  { id: 'simulator', label: 'Simulator', sublabel: 'Rollout Architecture Modeler', to: '/simulator', type: 'page' },
  { id: 'howey', label: 'Howey Calculator', sublabel: 'Securities Forensic Analyzer', to: '/howey', type: 'page' },
  { id: 'scenario', label: 'Scenario Planner', sublabel: 'Legislative Policy Sandbox', to: '/scenario', type: 'page' },
  { id: 'readiness', label: 'Readiness Stack', sublabel: 'Compliance Operations Kanban', to: '/readiness', type: 'page' },
  { id: 'brief', label: 'Brief Generator', sublabel: 'Executive Memo Publisher', to: '/brief-generator', type: 'page' },
  { id: 'capital', label: 'Capital Estimator', sublabel: 'Launch Budget Calculator', to: '/capital-estimator', type: 'page' },
  { id: 'roadmap', label: 'Launch Roadmap', sublabel: 'Chronos Gantt Timeline', to: '/roadmap', type: 'page' },
  { id: 'redflags', label: 'Red Flags & Audit', sublabel: 'Risk Mitigation Center', to: '/red-flags', type: 'page' },
  { id: 'settings', label: 'Settings', sublabel: 'Apollo Systems Console', to: '/settings', type: 'page' },
];

/**
 * Bloomberg-style command codes: type the code, hit enter, you're there.
 * Codes surface as the top result when the query exactly matches or
 * prefixes one.
 */
const COMMAND_CODES: { code: string; to: string; label: string }[] = [
  { code: 'q', to: '/bd-pipeline', label: 'BD Engine (queue)' },
  { code: 'db', to: '/deal-board', label: 'Deal Board' },
  { code: 'dd', to: '/deal-desk', label: 'Deal Desk' },
  { code: 'fx', to: '/bd-kpis', label: 'KPI / Forecast' },
  { code: 'gap', to: '/exchange-gaps', label: 'Exchange Gaps' },
  { code: 'hq', to: '/outreach', label: 'Handoff Queue' },
  { code: 'sq', to: '/send-queue', label: 'Send Queue' },
  { code: 'wl', to: '/win-loss', label: 'Win / Loss' },
  { code: 'map', to: '/market-map', label: 'Market Map' },
  { code: 'news', to: '/market-news', label: 'Market News' },
  { code: 'br', to: '/board-report', label: 'Board Report' },
  { code: 'ai', to: '/ai-tools', label: 'AI Console' },
  { code: 'home', to: '/', label: 'Morning Brief' },
];

interface LeadSearchRow {
  id: string;
  name: string;
  ticker: string | null;
  priorityScore: number | null;
  band: string | null;
}

/** Debounced live search of the projects API for the palette. */
function useLeadSearch(query: string, enabled: boolean): CommandItem[] {
  const [leads, setLeads] = useState<CommandItem[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!enabled || query.trim().length < 2) {
      setLeads([]);
      return;
    }
    clearTimeout(timer.current);
    let cancelled = false;
    timer.current = setTimeout(async () => {
      try {
        const res = await request<{ data: LeadSearchRow[] }>(
          `/v1/projects?search=${encodeURIComponent(query.trim())}&limit=6`,
        );
        if (cancelled) return;
        setLeads(
          (res.data ?? []).map(p => ({
            id: `lead-${p.id}`,
            label: p.ticker ? `${p.name} (${p.ticker.toUpperCase()})` : p.name,
            sublabel: `Lead · ${p.band ?? 'unscored'}${p.priorityScore != null ? ` · priority ${p.priorityScore}` : ''}`,
            to: `/bd-pipeline/${p.id}`,
            type: 'lead' as const,
          })),
        );
      } catch {
        if (!cancelled) setLeads([]);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer.current);
    };
  }, [query, enabled]);

  return leads;
}

function buildDataCommands(): CommandItem[] {
  const results: CommandItem[] = [];

  for (const s of states) {
    results.push({
      id: `state-${s.id}`,
      label: s.name,
      sublabel: `${s.abbreviation} · ${s.status} · ${s.tier}`,
      to: '/states',
      type: 'state',
    });
  }

  for (const p of products) {
    results.push({
      id: `product-${p.id}`,
      label: p.name,
      sublabel: `${p.category} · Howey: ${p.howeyScore ?? '—'}%`,
      to: `/ontology?focus=${p.id}`,
      type: 'product',
    });
  }

  for (const rf of redFlags) {
    results.push({
      id: `flag-${rf.id}`,
      label: rf.title,
      sublabel: `Risk: ${rf.risk} · Prob: ${rf.prob}/Sev: ${rf.sev}`,
      to: '/red-flags',
      type: 'flag',
    });
  }

  return results;
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { open, setOpen };
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const leadResults = useLeadSearch(query, open);

  const allCommands = useMemo(() => {
    return [...PAGE_COMMANDS, ...buildDataCommands()];
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return PAGE_COMMANDS.slice(0, 8);
    const q = query.toLowerCase();
    // Command codes rank first: exact match beats prefix match.
    const codeMatches: CommandItem[] = COMMAND_CODES.filter(
      c => c.code === q || c.code.startsWith(q),
    )
      .sort((a, b) => Number(b.code === q) - Number(a.code === q))
      .map(c => ({
        id: `code-${c.code}`,
        label: c.label,
        sublabel: `code: ${c.code}`,
        to: c.to,
        type: 'page' as const,
      }));
    const staticMatches = allCommands.filter(c =>
      c.label.toLowerCase().includes(q) || c.sublabel.toLowerCase().includes(q)
    );
    return [...codeMatches, ...leadResults, ...staticMatches].slice(0, 12);
  }, [query, allCommands, leadResults]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = useCallback((item: CommandItem) => {
    navigate(item.to);
    onClose();
    setQuery('');
  }, [navigate, onClose]);

  useEffect(() => {
    if (!open) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        handleSelect(filtered[selectedIndex]);
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, filtered, selectedIndex, handleSelect]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[20vh]" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-card border border-line rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
          <Search size={16} className="text-grey shrink-0" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search leads, pages, states, products..."
            className="flex-1 bg-transparent text-sm text-navy placeholder-grey focus:outline-none font-mono"
            autoFocus
          />
          <kbd className="text-[10px] font-mono text-grey bg-ice-soft dark:bg-navy-deep px-1.5 py-0.5 rounded border border-line">
            esc
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <div className="py-8 text-center text-xs text-grey">No results found</div>
          )}

          {filtered.map((item, idx) => {
            const typeLabel = { state: 'State', product: 'Asset', flag: 'Risk', page: 'Page', lead: 'Lead' }[item.type];
            const typeColor = {
              state: 'text-indigo-500',
              product: 'text-cyan-500',
              flag: 'text-red-500',
              page: 'text-grey',
              lead: 'text-emerald-600',
            }[item.type];

            return (
              <button
                key={item.id}
                onClick={() => handleSelect(item)}
                className={clsx(
                  'flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg transition-colors',
                  idx === selectedIndex
                    ? 'bg-navy dark:bg-ice text-white dark:text-navy'
                    : 'hover:bg-ice-soft dark:hover:bg-ice-soft/10 text-navy'
                )}
              >
                <span className={clsx('text-[9px] font-bold uppercase w-12 shrink-0', typeColor)}>
                  {typeLabel}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">{item.label}</div>
                  <div className={clsx(
                    'text-[10px] truncate',
                    idx === selectedIndex ? 'opacity-70' : 'text-grey'
                  )}>
                    {item.sublabel}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-4 py-2 border-t border-line text-[10px] text-grey flex justify-between">
          <span><kbd className="font-mono bg-ice-soft dark:bg-navy-deep px-1 rounded">↑↓</kbd> Navigate</span>
          <span><kbd className="font-mono bg-ice-soft dark:bg-navy-deep px-1 rounded">↵</kbd> Select</span>
          <span><kbd className="font-mono bg-ice-soft dark:bg-navy-deep px-1 rounded">esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
