import { useCallback, useEffect, useState } from 'react';
import { BarChart3, RefreshCw, Sparkles } from 'lucide-react';
import { request } from '@/lib/apiClient';

interface Bucket {
  key: string;
  won: number;
  lost: number;
  total: number;
  winRate: number;
  wonValueUsd: number;
}

interface WinLossData {
  overall: Bucket;
  byJurisdiction: Bucket[];
  byPackage: Bucket[];
  bySource: Bucket[];
  topLossReasons: Array<{ reason: string; count: number }>;
  narrative: string;
  usedLlm: boolean;
}

type Pool = 'all' | 'eu' | 'us';

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
function fmtUsd(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${Math.round(n)}`;
}

function BucketTable({ title, rows }: { title: string; rows: Bucket[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-line p-4">
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-grey">{title}</h3>
        <p className="text-[11px] text-grey">No data.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-line p-4">
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-grey">{title}</h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-grey">
            <th className="pb-1">Segment</th>
            <th className="pb-1 text-right">Won</th>
            <th className="pb-1 text-right">Lost</th>
            <th className="pb-1 text-right">Win rate</th>
            <th className="pb-1 text-right">Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/50">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="py-1.5 font-semibold">{r.key}</td>
              <td className="py-1.5 text-right font-mono text-green-600 dark:text-green-400">{r.won}</td>
              <td className="py-1.5 text-right font-mono text-red-600 dark:text-red-400">{r.lost}</td>
              <td className="py-1.5 text-right font-mono font-bold">{pct(r.winRate)}</td>
              <td className="py-1.5 text-right font-mono">{fmtUsd(r.wonValueUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WinLoss() {
  const [data, setData] = useState<WinLossData | null>(null);
  const [pool, setPool] = useState<Pool>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await request<{ data: WinLossData }>(`/v1/ai/win-loss?pool=${pool}`);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load win/loss');
    } finally {
      setLoading(false);
    }
  }, [pool]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <BarChart3 size={18} /> Win / Loss Analysis
        </h1>
        <div className="flex items-center gap-2 text-[11px]">
          <select
            value={pool}
            onChange={(e) => setPool(e.target.value as Pool)}
            className="rounded border border-line px-2 py-1 bg-card"
          >
            <option value="all">All regions</option>
            <option value="eu">EU</option>
            <option value="us">US</option>
          </select>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 font-semibold hover:bg-ice-soft dark:hover:bg-ice-soft/10"
          >
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
      </div>

      {loading && <p className="py-8 text-center text-[12px] text-grey">Loading…</p>}
      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">{error}</div>}

      {!loading && !error && data && (
        <>
          <div className="rounded-lg border border-line bg-card p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-grey">Narrative</span>
              {data.usedLlm && (
                <span className="inline-flex items-center gap-1 rounded bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700 dark:text-indigo-300">
                  <Sparkles size={9} /> LLM
                </span>
              )}
            </div>
            <p className="text-[13px] leading-relaxed">{data.narrative}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
              <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 font-mono">
                Overall {pct(data.overall.winRate)} · {data.overall.won}W / {data.overall.lost}L
              </span>
              <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 font-mono">
                Won value {fmtUsd(data.overall.wonValueUsd)}
              </span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <BucketTable title="By package" rows={data.byPackage} />
            <BucketTable title="By source" rows={data.bySource} />
            <BucketTable title="By jurisdiction" rows={data.byJurisdiction} />
            <div className="rounded-lg border border-line p-4">
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-grey">Top loss reasons</h3>
              {data.topLossReasons.length === 0 ? (
                <p className="text-[11px] text-grey">No losses recorded.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {data.topLossReasons.map((l) => (
                    <li key={l.reason} className="flex justify-between">
                      <span>{l.reason}</span>
                      <span className="font-mono font-bold text-grey">{l.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
