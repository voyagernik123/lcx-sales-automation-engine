import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Share2 } from 'lucide-react';
import { fetchRelated, type RelatedGroup } from '@/lib/api/graph';
import { useInspectorStore, type InspectorEntityType } from '@/stores/useInspectorStore';
import { OBJECT_TYPES, INSPECTOR_TO_OBJECT } from '@/lib/objectRegistry';

/**
 * Related panel (Palantir-grade Phase 1.2) — the complete, server-computed
 * search-around for the inspected object. Renders every linked group as a
 * titled row of pivot chips; clicking a chip pushes that object's inspector
 * onto the stack (drill-through without losing context). The graph is the
 * navigation, and it's the same on every object view.
 *
 * Mounted once in InspectorHost, so every inspector gets it for free. Renders
 * nothing when the object has no navigable links (or the type has no resolver).
 */
export function RelatedPanel({ type, id, label }: { type: InspectorEntityType; id: string; label?: string }) {
  const push = useInspectorStore((s) => s.push);
  const close = useInspectorStore((s) => s.close);
  const navigate = useNavigate();
  const [groups, setGroups] = useState<RelatedGroup[] | null>(null);
  const [loading, setLoading] = useState(true);

  const openInGraph = () => {
    const q = new URLSearchParams({ type, id, ...(label ? { label } : {}) });
    close();
    navigate(`/graph?${q.toString()}`);
  };

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setGroups(null);
    fetchRelated(type, id, ctrl.signal)
      .then((r) => { if (!ctrl.signal.aborted) setGroups(r.groups); })
      .catch(() => { if (!ctrl.signal.aborted) setGroups([]); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [type, id]);

  if (loading || !groups || groups.length === 0) return null;

  return (
    <section className="mt-4 border-t border-line pt-3" aria-label="Related objects">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-micro font-bold uppercase tracking-wider text-grey">Related</h3>
        <button
          type="button"
          onClick={openInGraph}
          className="inline-flex items-center gap-1 text-micro font-semibold text-grey transition-colors hover:text-cyan-700 dark:hover:text-cyan-400"
          title="Explore this object's neighborhood in the Sales Graph"
        >
          <Share2 size={11} /> Open in graph
        </button>
      </div>
      <div className="space-y-2.5">
        {groups.map((g) => {
          const def = OBJECT_TYPES[INSPECTOR_TO_OBJECT[g.inspector]];
          const Icon = def.icon;
          const extra = g.count - g.items.length;
          return (
            <div key={g.key}>
              <div className="mb-1 flex items-center gap-1.5 text-label text-grey-dark">
                <span className={`h-1.5 w-1.5 rounded-full ${def.dotCls}`} />
                <Icon size={11} className="text-grey" />
                <span className="font-semibold">{g.label}</span>
                <span className="num-tabular text-grey">· {g.count}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {g.items.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => push(g.inspector, it.id, it.seed)}
                    title={it.sublabel ? `${it.label} — ${it.sublabel}` : it.label}
                    className="group inline-flex max-w-[220px] items-center gap-1 rounded-md border border-line px-2 py-1 text-micro font-semibold text-grey-dark transition-colors hover:border-cyan-500/50 hover:bg-ice-soft hover:text-navy dark:hover:bg-ice-soft/10"
                  >
                    <span className="truncate">{it.label}</span>
                    {it.sublabel && (
                      <span className="shrink-0 truncate font-normal text-grey opacity-70 group-hover:opacity-100">
                        {it.sublabel}
                      </span>
                    )}
                  </button>
                ))}
                {extra > 0 && (
                  <span className="inline-flex items-center rounded-md px-2 py-1 text-micro font-medium text-grey">
                    +{extra} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
