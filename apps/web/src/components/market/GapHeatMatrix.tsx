import { useCallback, useEffect, useRef, useState } from 'react';
import { Star, ClipboardList, SearchCode } from 'lucide-react';
import type { GapRow } from '@/lib/api/bd';
import { fmtUsd, type GapMatrixModel } from './gapMatrix';

/**
 * The Exchange-Gap Heat Matrix: projects (rows, priority-sorted) ×
 * exchanges (columns, most common venues first) with a pinned LCX column.
 * Every LCX cell is by definition a gap — the actionable amber cell.
 * Click it → outreach popover; hover any cell → project × venue tooltip.
 */

const LABEL_W = 232;
const CELL = 'mx-[2px] my-[2px] h-7 w-9 shrink-0 rounded border';

interface TooltipState {
  x: number;
  y: number;
  title: string;
  lines: string[];
  accent?: boolean;
}

interface PopoverState {
  project: GapRow;
  x: number;
  y: number;
}

export interface GapHeatMatrixProps {
  model: GapMatrixModel;
  watched: Set<string>;
  newIds: Set<string>;
  onToggleWatch: (id: string) => void;
  onInspect: (id: string) => void;
  /** Create the pre-filled outreach task; resolves when saved. */
  onCreateTask: (project: GapRow) => Promise<void>;
}

export function GapHeatMatrix({ model, watched, newIds, onToggleWatch, onInspect, onCreateTask }: GapHeatMatrixProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<TooltipState | null>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [taskPending, setTaskPending] = useState(false);

  const localPoint = useCallback((e: React.MouseEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const showTip = useCallback(
    (e: React.MouseEvent, title: string, lines: string[], accent?: boolean) => {
      const { x, y } = localPoint(e);
      setTip({ x, y, title, lines, accent });
    },
    [localPoint],
  );

  /* close the action popover on outside click / Escape */
  useEffect(() => {
    if (!popover) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setPopover(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopover(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [popover]);

  const createTask = useCallback(async () => {
    if (!popover || taskPending) return;
    setTaskPending(true);
    try {
      await onCreateTask(popover.project);
      setPopover(null);
    } finally {
      setTaskPending(false);
    }
  }, [popover, taskPending, onCreateTask]);

  const wrapWidth = wrapRef.current?.clientWidth ?? 720;
  const tipLeft = tip ? Math.max(4, Math.min(tip.x + 12, wrapWidth - 230)) : 0;
  const popLeft = popover ? Math.max(4, Math.min(popover.x - 40, wrapWidth - 250)) : 0;

  return (
    <div className="overflow-x-auto rounded-lg border border-line/70 bg-card shadow-card">
      <div ref={wrapRef} className="relative w-max min-w-full p-2">
        {/* column headers */}
        <div className="flex items-end">
          <div
            className="sticky left-0 z-10 shrink-0 self-stretch bg-card pr-2"
            style={{ width: LABEL_W }}
            aria-hidden="true"
          />
          <div className="flex h-24 w-9 shrink-0 items-end justify-center pb-1 mx-[2px]">
            <span
              className="text-micro font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              LCX
            </span>
          </div>
          <div className="mx-1 self-stretch w-px bg-line" aria-hidden="true" />
          {model.exchanges.map((ex) => (
            <div key={ex.id} className="flex h-24 w-9 shrink-0 items-end justify-center pb-1 mx-[2px]">
              <span
                className="text-micro font-semibold text-grey"
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                title={`${ex.name} — ${ex.coverage} of these gaps listed here`}
              >
                {ex.name.length > 14 ? `${ex.name.slice(0, 13)}…` : ex.name}
              </span>
            </div>
          ))}
        </div>

        {/* rows */}
        {model.rows.map(({ project, listed }) => {
          const isWatched = watched.has(project.id);
          const isNew = newIds.has(project.id);
          return (
            <div key={project.id} className="flex items-center">
              {/* sticky project label */}
              <div
                className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 bg-card py-[3px] pr-2"
                style={{ width: LABEL_W }}
              >
                <button
                  type="button"
                  onClick={() => onToggleWatch(project.id)}
                  title={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
                  aria-pressed={isWatched}
                  className={`shrink-0 rounded p-0.5 transition-colors ${
                    isWatched ? 'text-amber-500' : 'text-grey/40 hover:text-amber-500'
                  }`}
                >
                  <Star size={12} fill={isWatched ? 'currentColor' : 'none'} />
                </button>
                <button
                  type="button"
                  onClick={() => onInspect(project.id)}
                  className="min-w-0 truncate text-left text-label font-semibold text-navy hover:underline"
                  title={`Inspect ${project.name}`}
                >
                  {project.name}
                </button>
                {project.ticker && (
                  <span className="shrink-0 font-mono text-micro text-grey">{project.ticker}</span>
                )}
                {isNew && (
                  <span className="shrink-0 rounded bg-emerald-100 px-1 text-micro font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                    NEW
                  </span>
                )}
                <span
                  className="ml-auto shrink-0 font-mono text-micro font-semibold num-tabular text-navy"
                  title="Priority score"
                >
                  {project.priorityScore}
                </span>
              </div>

              {/* LCX gap cell — the action cell */}
              <button
                type="button"
                className={`${CELL} group flex cursor-pointer items-center justify-center border-amber-300 bg-amber-50 transition-all hover:border-amber-500 hover:bg-amber-100 hover:shadow-card dark:border-amber-800 dark:bg-amber-950/30 dark:hover:border-amber-500 dark:hover:bg-amber-900/40`}
                aria-label={`${project.name}: gap on LCX — open actions`}
                onClick={(e) => {
                  const { x, y } = localPoint(e);
                  setTip(null);
                  setPopover({ project, x, y });
                }}
                onMouseEnter={(e) =>
                  showTip(
                    e,
                    `${project.name} × LCX`,
                    [
                      `Gap — live on ${project.exchangeCount} exchanges, absent from LCX`,
                      `Mcap ${fmtUsd(project.marketCapUsd)} · propensity ${project.propensityScore}`,
                      'Click to act',
                    ],
                    true,
                  )
                }
                onMouseLeave={() => setTip(null)}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 transition-transform group-hover:scale-125" aria-hidden="true" />
              </button>
              <div className="mx-1 self-stretch w-px bg-line" aria-hidden="true" />

              {/* venue cells */}
              {model.exchanges.map((ex) => {
                const cell = listed[ex.id];
                return cell ? (
                  <div
                    key={ex.id}
                    className={`${CELL} border-slate-300 bg-slate-200/70 dark:border-slate-600 dark:bg-slate-700/40`}
                    onMouseEnter={(e) =>
                      showTip(e, `${project.name} × ${ex.name}`, [
                        cell.volume != null ? `Listed — ${fmtUsd(cell.volume)} 24h volume` : 'Listed',
                      ])
                    }
                    onMouseLeave={() => setTip(null)}
                  />
                ) : (
                  <div
                    key={ex.id}
                    className={`${CELL} border-line/40`}
                    onMouseEnter={(e) =>
                      showTip(e, `${project.name} × ${ex.name}`, [
                        `Not among its top ${project.topExchanges.length} venues by volume`,
                      ])
                    }
                    onMouseLeave={() => setTip(null)}
                  />
                );
              })}
            </div>
          );
        })}

        {/* hover tooltip */}
        {tip && !popover && (
          <div
            className="pointer-events-none absolute z-20 w-[220px] rounded-md border border-line bg-card p-2 shadow-overlay"
            style={{ left: tipLeft, top: tip.y + 12 }}
          >
            <div className={`text-label font-bold ${tip.accent ? 'text-amber-700 dark:text-amber-400' : 'text-navy'}`}>
              {tip.title}
            </div>
            {tip.lines.map((l, i) => (
              <div key={i} className="text-micro text-grey">
                {l}
              </div>
            ))}
          </div>
        )}

        {/* LCX-gap action popover */}
        {popover && (
          <div
            ref={popRef}
            className="absolute z-30 w-[248px] rounded-md border border-line bg-card p-2.5 shadow-overlay"
            style={{ left: popLeft, top: popover.y + 10 }}
            role="dialog"
            aria-label={`Actions for ${popover.project.name}`}
          >
            <div className="text-label font-bold text-navy">{popover.project.name}</div>
            <div className="mb-2 text-micro text-grey">
              Live on {popover.project.exchangeCount} exchanges · absent from LCX
            </div>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                disabled={taskPending}
                onClick={() => void createTask()}
                className="flex items-center gap-1.5 rounded border border-line px-2 py-1.5 text-left text-label font-semibold text-navy transition-colors hover:bg-ice-soft disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-ice-soft/10"
              >
                <ClipboardList size={12} className="shrink-0 text-amber-600 dark:text-amber-400" />
                {taskPending ? 'Creating task…' : 'Create outreach task'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPopover(null);
                  onInspect(popover.project.id);
                }}
                className="flex items-center gap-1.5 rounded border border-line px-2 py-1.5 text-left text-label font-semibold text-navy transition-colors hover:bg-ice-soft dark:hover:bg-ice-soft/10"
              >
                <SearchCode size={12} className="shrink-0 text-grey" />
                Inspect project
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
