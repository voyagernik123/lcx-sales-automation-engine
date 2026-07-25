/**
 * The command line's body — LAZY. Never in the initial bundle.
 *
 * Split out of components/shared/CommandPalette.tsx in TERMINAL Phase 3 so the
 * eager shell is only the keydown listener and a Suspense boundary. This file may
 * grow freely (noun resolution, generated verbs, typed param prompts, gate
 * remedies) without touching the initial bundle, which had 12KB of headroom
 * against a hard 850KB budget enforced by scripts/check-bundle.mjs.
 *
 * Note for anyone measuring: moving this out does NOT recover the `@/data`
 * bytes. components/layout/Sidebar.tsx imports the same modules eagerly, so
 * states/products/redFlags stay resident regardless.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { clsx } from 'clsx';
import { states, products, redFlags } from '@/data';
import { fetchObjectSearch } from '@/lib/api/graph';
import { useInspectorStore, type InspectorEntityType } from '@/stores/useInspectorStore';
import { searchTypeLabel, type SearchGroup } from '@/lib/objectRegistry';
import { useAccessStore } from '@/stores/useAccessStore';
import { useOperatorStore } from '@/stores';
import { VerbPanel } from './VerbPanel';
import { nounFromSearchResult, type Noun, type Principal } from './grammar';

interface CommandItem {
  id: string;
  label: string;
  sublabel: string;
  to: string;
  type: 'state' | 'product' | 'flag' | 'page' | 'object';
  /**
   * For type 'object': open this inspector instead of navigating. ABSENT for the
   * objects that have no reader (program tasks, blockers, listings, members) —
   * they are actionable only, and Shift-Enter must not pretend otherwise.
   */
  inspector?: InspectorEntityType;
  entityId?: string;
  seed?: Record<string, unknown>;
  /** For type 'object': the noun the verb stage will act on. */
  noun?: Noun;
  /** For type 'object': the type chip. */
  typeLabel?: string;
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
  { id: 'graph', label: 'Sales Graph', sublabel: 'Object relationship graph', to: '/graph', type: 'page' },
  { id: 'monitors', label: 'Object Monitors', sublabel: 'Standing watches that act', to: '/monitors', type: 'page' },
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

export const OBJECT_ROWS = 10;

/**
 * Flatten search groups into rows: ONE from every group that matched, in group
 * order, then the rest in group order until full.
 *
 * Not cosmetic. /v1/search now answers with up to fourteen groups, and a plain
 * `for group { take 5 }` fill meant a query matching both a project and a
 * program partner could spend all ten slots on projects — the partner, and
 * therefore every partner verb, unreachable for that query. Taking one from each
 * group first makes every match that exists visible, and keeping group order for
 * the fill keeps the common navigational case (the top project first) intact.
 *
 * THE CAP IS APPLIED ON EVERY PATH, which it was not: the first pass takes one row
 * per matched group with no bound, and fourteen groups CAN match — so on a query
 * that matched eleven or more, the early return in the fill loop handed back the
 * unbounded array and ⌘K rendered more object rows than the cap allows, pushing the
 * page and state commands out of the list entirely. Exported for the test that
 * pins it; this database cannot produce eleven simultaneous groups (market_news is
 * empty and there is one note), which is exactly why it needed a unit test rather
 * than a browser.
 */
export function flattenGroups(groups: SearchGroup[]): CommandItem[] {
  const row = (g: SearchGroup, it: SearchGroup['items'][number]): CommandItem => ({
    id: `obj-${g.key}-${it.id}`,
    label: it.label,
    sublabel: [searchTypeLabel(g), it.sublabel].filter(Boolean).join(' · '),
    to: '',
    type: 'object',
    inspector: g.inspector,
    entityId: it.id,
    seed: it.seed,
    noun: nounFromSearchResult(g, it) ?? undefined,
    typeLabel: searchTypeLabel(g),
  });

  const rows: CommandItem[] = [];
  for (const g of groups) {
    if (g.items[0]) rows.push(row(g, g.items[0]));
  }
  for (const g of groups) {
    for (const it of g.items.slice(1, 5)) {
      if (rows.length >= OBJECT_ROWS) return rows.slice(0, OBJECT_ROWS);
      rows.push(row(g, it));
    }
  }
  return rows.slice(0, OBJECT_ROWS);
}

/**
 * Debounced unified object search — every object type over /v1/search (Phase
 * 1.4). Each result carries the REGISTRY's subject type, so the verb stage
 * addresses it in the same language `invokeAction` validates against; results
 * with an inspector can also be read in place with Shift.
 */
function useObjectSearch(query: string, enabled: boolean): CommandItem[] {
  const [items, setItems] = useState<CommandItem[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!enabled || query.trim().length < 2) {
      setItems([]);
      return;
    }
    clearTimeout(timer.current);
    const ctrl = new AbortController();
    timer.current = setTimeout(async () => {
      try {
        const groups = await fetchObjectSearch(query, ctrl.signal);
        if (ctrl.signal.aborted) return;
        // `RelatedGroup` (lib/api/graph.ts) declares `inspector` as always
        // present because search-around's groups always have one. Search's do
        // not — an actionable-only object has no drawer — so the shape is
        // restated here. Widening RelatedGroup itself is the tidier fix and
        // belongs to whoever owns that module.
        setItems(flattenGroups(groups as unknown as SearchGroup[]));
      } catch {
        if (!ctrl.signal.aborted) setItems([]);
      }
    }, 200);
    return () => {
      ctrl.abort();
      clearTimeout(timer.current);
    };
  }, [query, enabled]);

  return items;
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


export default function CommandBody({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  // The noun stage: once an object is chosen, the command line stops being a
  // navigator and becomes a language — noun → verb → params → Enter.
  const [noun, setNoun] = useState<Noun | null>(null);
  const navigate = useNavigate();
  const openInspector = useInspectorStore(s => s.open);
  const objectResults = useObjectSearch(query, open);

  // Legality is filtered against the operator's REAL role and entitlements, so
  // the menu never offers something that cannot work. The server re-checks all of
  // it — this is honesty, not security.
  const operator = useOperatorStore(s => s.operator);
  const accessMe = useAccessStore(s => s.me);
  const principal: Principal = useMemo(
    () => ({
      role: operator?.role === 'approver' ? 'approver' : 'operator',
      entitlements: (accessMe?.entitlements ?? {}) as Principal['entitlements'],
    }),
    [operator, accessMe],
  );

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
    return [...codeMatches, ...objectResults, ...staticMatches].slice(0, 14);
  }, [query, allCommands, objectResults]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = useCallback((item: CommandItem, opts: { read?: boolean } = {}) => {
    // An OBJECT is a noun: advance to the verb stage rather than just looking at
    // it. Shift keeps the previous behaviour — open the inspector — because
    // READING an object is a frequent, legitimate need and quietly removing it
    // would be a regression dressed up as a feature.
    if (item.type === 'object' && item.entityId) {
      // Shift asks to READ. Only possible where an inspector exists: a program
      // task or a launch blocker has no drawer, and silently doing something else
      // on Shift would be worse than doing nothing, so it falls through to the
      // verb stage — which is what the row is for.
      if (opts.read && item.inspector) {
        openInspector(item.inspector, item.entityId, item.seed);
        onClose();
        setQuery('');
        return;
      }
      // The noun already speaks the registry's language: /v1/search stated the
      // subject type on the group and nothing here translates it. When it could
      // not be resolved at all (a pre-`subjectType` API with an inspector this
      // build does not know) the row stays READABLE rather than becoming a dead
      // click — offering an unaddressable verb stage would be the worse failure.
      if (item.noun) {
        setNoun(item.noun);
        return;
      }
      if (item.inspector) {
        openInspector(item.inspector, item.entityId, item.seed);
        onClose();
        setQuery('');
      }
      return;
    }
    navigate(item.to);
    onClose();
    setQuery('');
  }, [navigate, onClose, openInspector]);

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
        handleSelect(filtered[selectedIndex], { read: e.shiftKey });
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, filtered, selectedIndex, handleSelect]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[20vh]" onClick={onClose}>
      <div
        // The command line is a modal overlay and had NEITHER a dialog role nor an
        // accessible name, so a screen reader announced nothing at all when ⌘K opened
        // it — the operator's most-used surface was invisible to assistive tech.
        // Found while writing the Phase 6 manual spec, whose selector had nothing to
        // match. `aria-modal` because everything behind it is inert while it is up.
        role="dialog"
        aria-modal="true"
        aria-label="Command line"
        className="w-full max-w-lg bg-card border border-line rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Once a noun is chosen the command line has moved from finding to
            acting, so the search field gives way to the verb stage entirely —
            showing both would blur which stage the operator is in. */}
        {noun ? (
          <VerbPanel
            noun={noun}
            principal={principal}
            onBack={() => setNoun(null)}
            onFinished={() => {
              setNoun(null);
              setQuery('');
              onClose();
            }}
          />
        ) : (
        <>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
          <Search size={16} className="text-grey shrink-0" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search an object to act on, or a page to open…"
            className="flex-1 bg-transparent text-sm text-navy placeholder-grey focus-ring font-mono"
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
            const typeLabel = item.type === 'object'
              ? item.typeLabel ?? 'Object'
              : { state: 'State', product: 'Asset', flag: 'Risk', page: 'Page', object: 'Object' }[item.type];
            const typeColor = {
              state: 'text-indigo-500',
              product: 'text-cyan-500',
              flag: 'text-red-500',
              page: 'text-grey',
              object: 'text-emerald-600',
            }[item.type];

            return (
              <button
                key={item.id}
                onClick={(e) => handleSelect(item, { read: e.shiftKey })}
                className={clsx(
                  'flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg transition-colors',
                  idx === selectedIndex
                    ? 'bg-navy dark:bg-ice text-white dark:text-navy'
                    : 'hover:bg-ice-soft dark:hover:bg-ice-soft/10 text-navy'
                )}
              >
                {/* w-16, not w-12: the actionable-only object types have names
                    ("Listing requirement", "Distribution surface") that a 3rem
                    column breaks mid-word. Wrapping at the space is legible;
                    truncating a type name is not. */}
                <span className={clsx('text-[9px] font-bold uppercase w-16 shrink-0 leading-[1.15]', typeColor)}>
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
        </>
        )}
      </div>
    </div>
  );
}
