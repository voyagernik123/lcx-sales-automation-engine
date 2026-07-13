import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, RefreshCw } from 'lucide-react';
import { fetchExchangeGaps, type GapRow } from '@/lib/api/bd';
import { TableSkeleton } from '@/components/shared';

function fmtUsd(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

export function ExchangeGaps() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<GapRow[]>([]);
  const [total, setTotal] = useState(0);
  const [minExchanges, setMinExchanges] = useState(2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchExchangeGaps(minExchanges);
      setRows(res.rows);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load gaps');
    } finally {
      setLoading(false);
    }
  }, [minExchanges]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <Layers size={18} /> Exchange Gaps
        </h1>
        <div className="flex items-center gap-2 text-[11px]">
          <label className="text-grey">Min exchanges:</label>
          <select
            value={minExchanges}
            onChange={(e) => setMinExchanges(Number(e.target.value))}
            className="rounded border border-line px-2 py-1"
          >
            {[1, 2, 3, 5, 10].map((n) => (
              <option key={n} value={n}>{n}+</option>
            ))}
          </select>
          <button onClick={() => void load()} className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 font-semibold hover:bg-ice-soft dark:hover:bg-ice-soft/10">
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
      </div>

      <p className="text-[11px] text-grey">
        Projects already listed on {minExchanges}+ exchanges but <span className="font-bold">not on LCX</span> — proven
        listing budgets, ranked by likelihood to pay. {total > 0 && <span className="font-semibold">{total} gaps found.</span>}
      </p>

      {loading && <TableSkeleton rows={6} cols={4} />}
      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">{error}</div>}
      {!loading && !error && rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-line p-8 text-center text-[12px] text-grey">
          No gap data yet — the exchange_sync job populates this (daily, top-priority projects first).
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-wider text-grey">
                <th className="py-2 px-3">Project</th>
                <th className="py-2 px-3">Priority</th>
                <th className="py-2 px-3">Mcap</th>
                <th className="py-2 px-3"># Exch.</th>
                <th className="py-2 px-3">Listed on</th>
                <th className="py-2 px-3">Contact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {rows.map((r) => (
                <tr key={r.id} onClick={() => navigate(`/bd-pipeline/${r.id}`)} className="cursor-pointer hover:bg-ice-soft dark:hover:bg-ice-soft/5">
                  <td className="py-2 px-3">
                    <span className="font-semibold">{r.name}</span>
                    {r.ticker && <span className="ml-1.5 text-[10px] text-grey font-mono">{r.ticker}</span>}
                  </td>
                  <td className="py-2 px-3">
                    <span className="rounded bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 font-mono">{r.priorityScore}</span>
                  </td>
                  <td className="py-2 px-3 font-mono">{fmtUsd(r.marketCapUsd)}</td>
                  <td className="py-2 px-3 font-mono font-bold">{r.exchangeCount}</td>
                  <td className="py-2 px-3">
                    <div className="flex flex-wrap gap-1">
                      {r.topExchanges.slice(0, 5).map((e) => (
                        <span key={e.id} className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold">{e.name}</span>
                      ))}
                      {r.exchangeCount > 5 && <span className="text-[9px] text-grey">+{r.exchangeCount - 5}</span>}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-[10px]">{r.verifiedContactCount > 0 ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
