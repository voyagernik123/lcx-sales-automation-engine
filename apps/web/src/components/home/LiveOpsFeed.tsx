import { Terminal } from 'lucide-react';
import { clsx } from 'clsx';
import { useInspect } from '@/stores';
import type { OpsFeedLine } from '@/lib/api/loop';

export interface LiveOpsFeedProps {
  lines: OpsFeedLine[];
  loading?: boolean;
}

function ts(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  return d.toTimeString().slice(0, 8);
}

/**
 * The Morning Brief live ops terminal — same instrument aesthetic as the
 * regulatory Dashboard's Live Operation Feed (dark slate, mono, timestamps),
 * but streaming the REAL audit/notification record. Lines that resolve to an
 * entity open the inspector in place.
 */
export function LiveOpsFeed({ lines, loading = false }: LiveOpsFeedProps) {
  const inspect = useInspect();

  return (
    <div className="flex h-[340px] flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-950 font-mono text-micro text-slate-100 shadow-md">
      <div className="flex shrink-0 select-none items-center justify-between border-b border-slate-800 bg-slate-900 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-500" />
          <span className="text-[9px] font-bold uppercase text-cyan-400">Live Ops Feed</span>
        </div>
        <Terminal size={12} className="text-slate-500" />
      </div>

      <div className="flex flex-1 flex-col-reverse justify-end space-y-1.5 overflow-y-auto p-3 leading-relaxed">
        <div className="mb-1 flex shrink-0 items-center gap-1.5 font-bold text-cyan-400">
          <span>&gt; SYSTEM ACTIVE</span>
          <span className="block h-3 w-1.5 shrink-0 animate-pulse bg-cyan-400" />
        </div>

        {loading && lines.length === 0 && (
          <div className="text-[9px] text-slate-500">&gt; connecting to event stream…</div>
        )}
        {!loading && lines.length === 0 && (
          <div className="text-[9px] text-slate-500">&gt; no events recorded yet — actions land here as you work</div>
        )}

        {lines.map(line => {
          const catCls =
            line.category === 'audit'
              ? 'text-teal-400 border-teal-500/30'
              : 'text-amber-400 border-amber-500/30';
          const row = (
            <>
              <span className="shrink-0 select-none text-slate-600">[{ts(line.ts)}]</span>
              <span
                className={clsx(
                  'shrink-0 rounded border bg-slate-900 px-1 py-0.5 text-[7px] font-bold uppercase leading-none',
                  catCls,
                )}
              >
                {line.category}
              </span>
              <span className={clsx('break-words', line.entity ? 'text-slate-100' : 'text-slate-400')}>
                {line.message}
              </span>
            </>
          );
          return line.entity ? (
            <button
              key={line.id}
              type="button"
              onClick={() => inspect(line.entity!.type, line.entity!.id)}
              className="flex items-start gap-1.5 text-left text-[9px] hover:bg-slate-900/70 rounded px-0.5 -mx-0.5 transition-colors"
              title={`Inspect ${line.entity.type}`}
            >
              {row}
            </button>
          ) : (
            <div key={line.id} className="flex items-start gap-1.5 px-0.5 -mx-0.5 text-[9px]">
              {row}
            </div>
          );
        })}
      </div>
    </div>
  );
}
