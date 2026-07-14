import { useCallback, useEffect, useMemo, useState } from 'react';
import { Table2, Play } from 'lucide-react';
import { request } from '@/lib/apiClient';
import { PageTitle, Button } from '@/components/ui';

interface SchemaEntity {
  entity: string;
  columns: { name: string; numeric: boolean }[];
  numericColumns: string[];
  operators: string[];
}

interface ReportResult {
  entity: string;
  groupBy: string | null;
  metric: string;
  rows: { group: string | null; value: number }[];
  total: number;
}

export function ReportBuilder() {
  const [schema, setSchema] = useState<SchemaEntity[]>([]);
  const [entity, setEntity] = useState('');
  const [groupBy, setGroupBy] = useState('');
  const [metric, setMetric] = useState('count');
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

  const run = useCallback(async () => {
    setRunning(true);
    setError('');
    try {
      const res = await request<{ data: ReportResult }>('/v1/analytics/reports/run', {
        auth: true,
        method: 'POST',
        body: { entity, groupBy: groupBy || null, metric },
      });
      setResult(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report failed');
      setResult(null);
    } finally {
      setRunning(false);
    }
  }, [entity, groupBy, metric]);

  const maxValue = result ? Math.max(1, ...result.rows.map((r) => r.value)) : 1;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <PageTitle
        icon={<Table2 size={20} />}
        subtitle="Ad-hoc aggregations over an allowlisted set of entities and columns — pick what to count/sum and how to group."
      >
        Report Builder
      </PageTitle>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-card p-3">
        <label className="text-label">
          <div className="mb-1 font-bold text-grey">Entity</div>
          <select value={entity} onChange={(e) => { setEntity(e.target.value); setGroupBy(''); }} className="rounded-lg border border-line px-2 py-1">
            {schema.map((s) => <option key={s.entity} value={s.entity}>{s.entity}</option>)}
          </select>
        </label>
        <label className="text-label">
          <div className="mb-1 font-bold text-grey">Group by</div>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="rounded-lg border border-line px-2 py-1">
            <option value="">(none)</option>
            {current?.columns.map((col) => <option key={col.name} value={col.name}>{col.name}</option>)}
          </select>
        </label>
        <label className="text-label">
          <div className="mb-1 font-bold text-grey">Metric</div>
          <select value={metric} onChange={(e) => setMetric(e.target.value)} className="rounded-lg border border-line px-2 py-1">
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

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-label text-red-700">{error}</div>}

      {result && (
        <div className="rounded-lg border border-line bg-card p-3">
          <div className="mb-2 flex items-baseline justify-between text-label">
            <span className="font-bold">{result.metric} of {result.entity}{result.groupBy ? ` by ${result.groupBy}` : ''}</span>
            <span className="text-grey">total {result.total.toLocaleString()}</span>
          </div>
          <div className="space-y-1">
            {result.rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2 text-label">
                <span className="w-40 truncate">{row.group ?? '(all)'}</span>
                <div className="h-3 flex-1 rounded bg-ice-soft dark:bg-ice-soft/10 overflow-hidden">
                  <div className="h-full bg-navy" style={{ width: `${(row.value / maxValue) * 100}%` }} />
                </div>
                <span className="w-24 text-right font-mono">{row.value.toLocaleString()}</span>
              </div>
            ))}
            {result.rows.length === 0 && <p className="text-label text-grey">No rows.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
