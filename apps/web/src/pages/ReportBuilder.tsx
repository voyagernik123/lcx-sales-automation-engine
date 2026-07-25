import { useCallback, useEffect, useMemo, useState } from 'react';
import { Table2, Play, ChevronRight, X, BarChartHorizontal, PieChart } from 'lucide-react';
import { clsx } from 'clsx';
import { request } from '@/lib/apiClient';
import { DonutChart } from '@/components/charts';
import { EmptyState } from '@/components/shared';
import { PageTitle, Button } from '@/components/ui';

interface SchemaEntity {
  entity: string;
  columns: { name: string; numeric: boolean }[];
  numericColumns: string[];
  operators: string[];
}

/** Drill filters are always equality — one level per clicked bucket. */
interface ReportFilter {
  column: string;
  op: 'eq';
  value: string;
}

interface ReportResult {
  entity: string;
  groupBy: string | null;
  metric: string;
  rows: { group: string | null; value: number }[];
  total: number;
}

type Viz = 'bars' | 'donut';

const MAX_DONUT_SLICES = 8;

export function ReportBuilder() {
  const [schema, setSchema] = useState<SchemaEntity[]>([]);
  const [entity, setEntity] = useState('');
  const [groupBy, setGroupBy] = useState('');
  const [metric, setMetric] = useState('count');
  const [filters, setFilters] = useState<ReportFilter[]>([]);
  const [viz, setViz] = useState<Viz>('bars');
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);

  useEffect(() => {
    request<{ data: SchemaEntity[] }>('/v1/analytics/reports/schema', { auth: true })
      .then((r) => {
        setSchema(r.data);
        if (r.data[0]) setEntity(r.data[0].entity);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load schema'));
  }, []);

  const current = useMemo(() => schema.find((s) => s.entity === entity), [schema, entity]);

  const run = useCallback(
    async (overrides?: { groupBy?: string; filters?: ReportFilter[] }) => {
      const gb = overrides?.groupBy ?? groupBy;
      const fs = overrides?.filters ?? filters;
      setRunning(true);
      setError('');
      try {
        const res = await request<{ data: ReportResult }>('/v1/analytics/reports/run', {
          auth: true,
          method: 'POST',
          body: { entity, groupBy: gb || null, metric, filters: fs },
        });
        setResult(res.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Report failed');
        setResult(null);
      } finally {
        setRunning(false);
      }
    },
    [entity, groupBy, metric, filters],
  );

  /** Click a bucket → pin it as an equality filter and drill one level down. */
  const drillInto = (group: string) => {
    if (!result?.groupBy) return;
    const next = [...filters, { column: result.groupBy, op: 'eq' as const, value: group }];
    setFilters(next);
    setGroupBy('');
    void run({ groupBy: '', filters: next });
  };

  const removeFilter = (idx: number) => {
    const next = filters.filter((_, i) => i !== idx);
    setFilters(next);
    void run({ filters: next });
  };

  const resetEntity = (next: string) => {
    setEntity(next);
    setGroupBy('');
    setFilters([]);
    setResult(null);
    setMetric('count');
  };

  const maxValue = result ? Math.max(1, ...result.rows.map((r) => r.value)) : 1;
  const drillable = Boolean(result?.groupBy);

  const donutData = useMemo(() => {
    if (!result) return [];
    const named = result.rows.map((r) => ({ label: r.group ?? '(none)', value: r.value })).filter((r) => r.value > 0);
    if (named.length <= MAX_DONUT_SLICES) return named;
    const head = named.slice(0, MAX_DONUT_SLICES - 1);
    const tail = named.slice(MAX_DONUT_SLICES - 1).reduce((s, r) => s + r.value, 0);
    return [...head, { label: 'Other', value: tail }];
  }, [result]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-5">
      <PageTitle
        icon={<Table2 size={20} />}
        subtitle="Ad-hoc aggregations over an allowlisted set of entities and columns — pick what to count/sum and how to group. Click a bucket to drill one level."
      >
        Report Builder
      </PageTitle>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line/70 bg-card p-4 shadow-card">
        <label className="text-label">
          <div className="mb-1 text-micro font-medium uppercase tracking-wide text-grey">Entity</div>
          <select value={entity} onChange={(e) => resetEntity(e.target.value)} className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-label text-navy">
            {schema.map((s) => <option key={s.entity} value={s.entity}>{s.entity}</option>)}
          </select>
        </label>
        <label className="text-label">
          <div className="mb-1 text-micro font-medium uppercase tracking-wide text-grey">Group by</div>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-label text-navy">
            <option value="">(none)</option>
            {current?.columns.map((col) => <option key={col.name} value={col.name}>{col.name}</option>)}
          </select>
        </label>
        <label className="text-label">
          <div className="mb-1 text-micro font-medium uppercase tracking-wide text-grey">Metric</div>
          <select value={metric} onChange={(e) => setMetric(e.target.value)} className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-label text-navy">
            <option value="count">count</option>
            {current?.numericColumns.flatMap((col) => [
              <option key={`sum:${col}`} value={`sum:${col}`}>sum:{col}</option>,
              <option key={`avg:${col}`} value={`avg:${col}`}>avg:{col}</option>,
            ])}
          </select>
        </label>
        <Button variant="primary" size="sm" onClick={() => void run()} disabled={running || !entity}>
          <Play size={12} /> {running ? 'Running…' : 'Run'}
        </Button>
      </div>

      {/* drill breadcrumb — each pinned bucket is removable */}
      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-label" aria-label="Drill path">
          <span className="font-semibold text-grey">{entity}</span>
          {filters.map((f, i) => (
            <span key={`${f.column}-${i}`} className="flex items-center gap-1.5">
              <ChevronRight size={12} className="text-grey" aria-hidden="true" />
              <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 font-mono text-micro font-semibold text-cyan-700 dark:text-cyan-400">
                {f.column} = {f.value}
                <button
                  type="button"
                  onClick={() => removeFilter(i)}
                  className="rounded hover:bg-cyan-500/15"
                  aria-label={`Remove filter ${f.column} = ${f.value}`}
                >
                  <X size={10} />
                </button>
              </span>
            </span>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-label text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {!result && !error && (
        <div className="rounded-xl border border-line/70 bg-card shadow-card">
          <EmptyState
            variant="search"
            title="No report yet"
            description="Pick an entity, grouping, and metric, then hit Run — results land here with click-to-drill buckets."
          />
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-line/70 bg-card p-5 shadow-card">
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-semibold tracking-[-0.01em] text-navy">
              {result.metric} of {result.entity}
              {result.groupBy ? ` by ${result.groupBy}` : ''}
              {filters.length > 0 ? ` (${filters.length} filter${filters.length === 1 ? '' : 's'})` : ''}
            </span>
            <span className="flex items-center gap-2 text-label">
              <span className="num-tabular text-grey">total {result.total.toLocaleString()}</span>
              {result.groupBy && result.rows.length > 0 && (
                <span className="flex overflow-hidden rounded-md border border-line" role="group" aria-label="Chart type">
                  {([
                    { key: 'bars' as Viz, icon: BarChartHorizontal, label: 'Bars' },
                    { key: 'donut' as Viz, icon: PieChart, label: 'Donut' },
                  ]).map(({ key, icon: Icon, label }) => (
                    <button
                      key={key}
                      onClick={() => setViz(key)}
                      aria-pressed={viz === key}
                      title={label}
                      className={clsx(
                        'px-2 py-1',
                        viz === key ? 'bg-navy text-white dark:bg-ice dark:text-navy' : 'text-grey hover:text-navy',
                      )}
                    >
                      <Icon size={12} />
                    </button>
                  ))}
                </span>
              )}
            </span>
          </div>

          {viz === 'donut' && result.groupBy && donutData.length > 0 ? (
            <div className="py-2">
              <DonutChart data={donutData} legend="right" formatValue={(v) => v.toLocaleString()} />
              <p className="mt-2 text-micro text-grey">Switch to bars to drill into a bucket.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {result.rows.map((row, i) => {
                const canDrill = drillable && row.group != null;
                const body = (
                  <>
                    <span className="w-40 truncate text-left">{row.group ?? '(all)'}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded bg-ice-soft dark:bg-ice-soft/10">
                      <div className="h-full bg-navy" style={{ width: `${(row.value / maxValue) * 100}%` }} />
                    </div>
                    <span className="num-tabular w-24 text-right font-mono">{row.value.toLocaleString()}</span>
                  </>
                );
                return canDrill ? (
                  <button
                    key={i}
                    type="button"
                    onClick={() => drillInto(row.group as string)}
                    title={`Drill into ${result.groupBy} = ${row.group}`}
                    className="flex w-full cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-label transition-colors hover:bg-ice-soft/50 dark:hover:bg-ice-soft/10"
                  >
                    {body}
                    <ChevronRight size={12} className="shrink-0 text-grey" aria-hidden="true" />
                  </button>
                ) : (
                  <div key={i} className="flex items-center gap-2 px-1 py-0.5 text-label">
                    {body}
                  </div>
                );
              })}
              {result.rows.length === 0 && <p className="text-label text-grey">No rows.</p>}
              {drillable && result.rows.some((r) => r.group == null) && (
                <p className="pt-1 text-micro text-grey">Buckets with a null key can't be pinned as an equality filter.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
