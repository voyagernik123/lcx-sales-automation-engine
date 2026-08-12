import { useEffect, useCallback, useRef, useState } from 'react';
import { Shield, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { fetchAuditLog } from '@/lib/api/audit';
import type { AuditEntry } from '@/lib/api/audit';
import { Button } from '@/components/ui';
import { EmptyState, TableSkeleton } from '@/components/shared';
import { EntityChip } from '@/components/entity';
import { VaultRelief } from '@/components/geometry/VaultRelief';
import type { ObjectType } from '@/lib/objectRegistry';
import { useInspect } from '@/stores';
import type { InspectorEntityType } from '@/stores';

const ENTITY_OPTIONS = [
  { value: '', label: 'All Entities' },
  { value: 'projects', label: 'Projects' },
  { value: 'deals', label: 'Deals' },
  { value: 'handoffs', label: 'Handoffs' },
  { value: 'scores', label: 'Scores' },
  { value: 'outreach_sequences', label: 'Sequences' },
  { value: 'suppression', label: 'Suppression' },
];

/** Audit entity values that resolve to a universal-inspector payload. */
const INSPECTABLE_ENTITY: Record<string, InspectorEntityType> = {
  projects: 'project',
  deals: 'deal',
  handoffs: 'handoff',
};

/** Audit entity values → ontology object types (EntityChip mentions). */
const CHIP_ENTITY: Record<string, ObjectType> = {
  projects: 'project',
  deals: 'deal',
  handoffs: 'interaction',
};

/** Neutral chip + colored dot per action family (chip restraint). */
const ACTION_DOTS: Record<string, string> = {
  project_created: 'bg-emerald-500',
  project_merged: 'bg-blue-500',
  score_computed: 'bg-purple-500',
  deal_stage_change: 'bg-cyan-500',
  handoff_created: 'bg-amber-500',
  outreach_paused: 'bg-orange-500',
  outreach_enrolled: 'bg-sky-500',
  suppression_created: 'bg-red-500',
};

function ActionBadge({ action }: { action: string }) {
  return (
    <span className="inline-flex h-[18px] items-center gap-1.5 rounded-full border border-line/70 bg-ice-soft/50 dark:bg-navy-deep/50 px-2 text-micro font-semibold text-grey-dark whitespace-nowrap">
      <span className={clsx('h-1.5 w-1.5 rounded-full shrink-0', ACTION_DOTS[action] ?? 'bg-slate-400')} />
      {action.replace(/_/g, ' ')}
    </span>
  );
}

/** Compact scalar rendering for a meta value chip. */
function fmtMetaValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const json = JSON.stringify(v);
  return json.length > 48 ? `${json.slice(0, 48)}…` : json;
}

/** Structured meta renderer — key/value chips instead of sliced JSON. */
function MetaChips({ meta }: { meta: Record<string, unknown> }) {
  const entries = Object.entries(meta);
  const shown = entries.slice(0, 5);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map(([k, v]) => (
        <span
          key={k}
          className="inline-flex max-w-[240px] items-center gap-1 rounded bg-ice-soft dark:bg-ice-soft/10 px-1.5 py-0.5 text-micro leading-none"
          title={`${k}: ${fmtMetaValue(v)}`}
        >
          <span className="font-medium text-grey">{k}</span>
          <span className="truncate font-mono text-navy">{fmtMetaValue(v)}</span>
        </span>
      ))}
      {entries.length > shown.length && (
        <span className="text-micro text-grey">+{entries.length - shown.length}</span>
      )}
    </div>
  );
}

export function AuditLog() {
  const inspect = useInspect();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [seenActions, setSeenActions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetchAuditLog({ page, entity: entity || undefined, action: action || undefined, actor: actor || undefined, signal: controller.signal });
      if (!controller.signal.aborted) {
        setEntries(res.data);
        setTotal(res.meta.total);
        setTotalPages(res.meta.totalPages);
        // Grow the action-chip row from whatever actions we've observed.
        setSeenActions(prev => {
          const next = new Set(prev);
          for (const e of res.data) next.add(e.action);
          return [...next].sort();
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load audit log');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [page, entity, action, actor]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col text-navy overflow-hidden">
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-line bg-card">
        <h1 className="text-lg font-bold flex items-center gap-1.5 text-navy">
          <Shield size={17} className="text-cyan-500" />
          Audit Log
        </h1>
        <span className="text-micro text-grey font-mono num-tabular">{total} events</span>
      </div>

      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-line bg-card flex-wrap">
        <select
          value={entity}
          onChange={(e) => { setEntity(e.target.value); setPage(1); }}
          className="rounded border border-line bg-ice-soft dark:bg-navy-deep px-2 py-1 text-xs outline-none focus:border-cyan-500 transition-colors"
        >
          {ENTITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-grey pointer-events-none" />
          <input
            type="text"
            value={actor}
            onChange={(e) => { setActor(e.target.value); setPage(1); }}
            placeholder="Filter by actor..."
            className="w-40 rounded border border-line bg-ice-soft dark:bg-navy-deep px-7 py-1 text-xs outline-none focus:border-cyan-500 transition-colors"
          />
        </div>
      </div>

      {/* Action-type filter chips */}
      {seenActions.length > 0 && (
        <div className="shrink-0 flex items-center gap-1 px-4 py-1.5 border-b border-line bg-card overflow-x-auto">
          <button
            onClick={() => { setAction(''); setPage(1); }}
            aria-pressed={!action}
            className={clsx(
              'whitespace-nowrap rounded-full border px-2 py-0.5 text-micro font-semibold transition-colors',
              !action
                ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400'
                : 'border-line text-grey hover:text-navy hover:bg-ice-soft/50 dark:hover:bg-ice-soft/10',
            )}
          >
            All actions
          </button>
          {seenActions.map((a) => (
            <button
              key={a}
              onClick={() => { setAction(action === a ? '' : a); setPage(1); }}
              aria-pressed={action === a}
              className={clsx(
                'whitespace-nowrap rounded-full border px-2 py-0.5 text-micro font-semibold transition-colors',
                action === a
                  ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400'
                  : 'border-line text-grey hover:text-navy hover:bg-ice-soft/50 dark:hover:bg-ice-soft/10',
              )}
            >
              {a.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="p-4">
            <TableSkeleton rows={10} cols={5} />
          </div>
        )}

        {error && !loading && (
          <EmptyState
            variant="error"
            title="Failed to load audit log"
            description={error}
            action={<Button variant="secondary" size="sm" onClick={load}>Retry</Button>}
          />
        )}

        {!loading && !error && entries.length === 0 && (
          <EmptyState variant="search" title="No audit events found" description="No events match the current filters." />
        )}

        {/*
          E6 THE VAULT, LIVE — and opt-in, which §7 of `3D_VFX_1000X.md` requires rather than permits.

          This page has no flat component to swap: the table below is inline JSX. So `VaultRelief` wraps it and
          renders it UNCHANGED as its default child rather than the page being restructured to suit the 3-D view.
          The corridor draws the SAME `entries` array the table draws — one page of the audit spine, two drawings.

          It defaults to the table because §7's clause (b) — "an operator still gets their answer at least as fast
          as the flat version" — is UNMEASURED on every environment in the programme. Not failed; unmeasured. The
          button carries the reason, next to the button, in the reader's words.
        */}
        {!loading && !error && entries.length > 0 && (
          <VaultRelief entries={entries}>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line sticky top-0 bg-card">
                <th className="text-left py-2.5 px-3 text-micro font-medium uppercase tracking-wider text-grey">Time</th>
                <th className="text-left py-2.5 px-3 text-micro font-medium uppercase tracking-wider text-grey">Actor</th>
                <th className="text-left py-2.5 px-3 text-micro font-medium uppercase tracking-wider text-grey">Action</th>
                <th className="text-left py-2.5 px-3 text-micro font-medium uppercase tracking-wider text-grey">Entity</th>
                <th className="text-left py-2.5 px-3 text-micro font-medium uppercase tracking-wider text-grey">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/30">
              {entries.map((entry) => {
                const inspectType = entry.entity ? INSPECTABLE_ENTITY[entry.entity] : undefined;
                return (
                  <tr key={entry.id} className="hover:bg-ice-soft/50 dark:hover:bg-ice-soft/10 transition-colors">
                    <td className="py-2 px-3 text-grey whitespace-nowrap font-mono num-tabular text-micro">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 px-3 font-medium">{entry.actor}</td>
                    <td className="py-2 px-3"><ActionBadge action={entry.action} /></td>
                    <td className="py-2 px-3 text-grey">
                      {inspectType && entry.entityId ? (
                        entry.projectName ? (
                          <EntityChip
                            type={CHIP_ENTITY[entry.entity!] ?? 'project'}
                            id={entry.entityId}
                            name={entry.projectName}
                            stateLine={entry.action.replace(/_/g, ' ')}
                            className="font-semibold"
                          />
                        ) : (
                          <button
                            onClick={() => inspect(inspectType, entry.entityId!)}
                            className="font-semibold text-cyan-700 dark:text-cyan-400 hover:underline"
                            title={`Inspect ${inspectType}`}
                          >
                            {`${entry.entity} · ${entry.entityId.slice(0, 8)}`}
                          </button>
                        )
                      ) : (
                        <>
                          {entry.entity}
                          {entry.projectName && <span className="ml-1">({entry.projectName})</span>}
                        </>
                      )}
                    </td>
                    <td className="py-2 px-3 text-grey max-w-[340px]">
                      {entry.meta && typeof entry.meta === 'object' && Object.keys(entry.meta).length > 0
                        ? <MetaChips meta={entry.meta} />
                        : entry.action.replace(/_/g, ' ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </VaultRelief>
        )}
      </div>

      {totalPages > 1 && (
        <div className="shrink-0 flex items-center justify-between px-4 py-2 border-t border-line bg-card">
          <span className="text-micro text-grey num-tabular">Page {page} of {totalPages}</span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="xs"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft size={12} />
            </Button>
            <Button
              variant="secondary"
              size="xs"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              aria-label="Next page"
            >
              <ChevronRight size={12} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AuditLog;
