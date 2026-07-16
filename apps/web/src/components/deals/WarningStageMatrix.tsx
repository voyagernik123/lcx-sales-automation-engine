import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { STAGE_LABELS, type DealStage } from '@lcx/shared';
import type { BoardDeal } from '@/lib/api/bd';
import type { DealHealth, WarningCode } from '@/lib/salesIntel';
import { WARNING_SHORT_LABEL } from './warningDisplay';

/**
 * Warnings × stage heatmap over the OPEN pipeline (Gong Deal Drivers pattern).
 *
 * Owner attribution is stubbed platform-wide (deals.owner = 'operator'), so
 * stage is the honest second axis. Each cell counts open deals in that stage
 * carrying that warning; clicking a non-empty cell jumps to the Deal Board
 * pre-filtered to exactly those deals.
 */

export const MATRIX_STAGES: DealStage[] = ['contacted', 'discovery', 'proposal', 'negotiating'];

export interface WarningStageMatrixData {
  stages: DealStage[];
  /** Only warning codes that occur at least once, in stable order. */
  codes: WarningCode[];
  /** cells[code][stage] = count of open deals in `stage` carrying `code`. */
  cells: Record<WarningCode, Record<string, number>>;
  maxCount: number;
}

const CODE_ORDER: WarningCode[] = [
  'ghosted',
  'stalled',
  'overdue_close',
  'single_threaded',
  'no_next_step',
  'telegram_silent',
];

/** Pure builder — unit-tested. */
export function buildWarningStageMatrix(
  deals: BoardDeal[],
  health: Map<string, DealHealth>,
): WarningStageMatrixData {
  const cells = {} as Record<WarningCode, Record<string, number>>;
  for (const code of CODE_ORDER) {
    cells[code] = {};
    for (const s of MATRIX_STAGES) cells[code][s] = 0;
  }
  let maxCount = 0;
  for (const d of deals) {
    if (!MATRIX_STAGES.includes(d.stage as DealStage)) continue;
    const h = health.get(d.id);
    if (!h) continue;
    const seen = new Set<WarningCode>();
    for (const w of h.warnings) {
      if (seen.has(w.code)) continue; // one deal counts once per code
      seen.add(w.code);
      const next = (cells[w.code][d.stage] ?? 0) + 1;
      cells[w.code][d.stage] = next;
      if (next > maxCount) maxCount = next;
    }
  }
  const codes = CODE_ORDER.filter(code => MATRIX_STAGES.some(s => cells[code][s] > 0));
  return { stages: MATRIX_STAGES, codes, cells, maxCount };
}

function cellHeat(count: number, max: number): string {
  if (count === 0) return 'bg-transparent text-grey/50';
  const r = max > 0 ? count / max : 0;
  if (r >= 0.75) return 'bg-status-blocked-bg text-status-blocked';
  if (r >= 0.4) return 'bg-status-conditional-bg text-status-conditional';
  return 'bg-ice-soft text-navy dark:bg-ice-soft/10';
}

export interface WarningStageMatrixProps {
  deals: BoardDeal[];
  health: Map<string, DealHealth>;
  className?: string;
}

export function WarningStageMatrix({ deals, health, className }: WarningStageMatrixProps) {
  const matrix = buildWarningStageMatrix(deals, health);

  if (matrix.codes.length === 0) {
    return (
      <p className={clsx('text-label text-grey', className)}>
        No warnings across the open pipeline — nothing to coach on right now.
      </p>
    );
  }

  return (
    <div className={className}>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0.5 text-label">
          <thead>
            <tr>
              <th className="p-1 text-left text-micro font-bold uppercase tracking-wider text-grey">Warning</th>
              {matrix.stages.map(s => (
                <th key={s} className="p-1 text-center text-micro font-bold uppercase tracking-wider text-grey">
                  {STAGE_LABELS[s]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.codes.map(code => (
              <tr key={code}>
                <td className="whitespace-nowrap p-1 pr-2 font-semibold text-navy">{WARNING_SHORT_LABEL[code]}</td>
                {matrix.stages.map(stage => {
                  const count = matrix.cells[code][stage] ?? 0;
                  const heat = cellHeat(count, matrix.maxCount);
                  if (count === 0) {
                    return (
                      <td key={stage} className={clsx('rounded p-0 text-center', heat)}>
                        <span className="block px-2 py-1.5 font-mono text-micro">·</span>
                      </td>
                    );
                  }
                  return (
                    <td key={stage} className="p-0 text-center">
                      <Link
                        to={`/deal-board?warning=${code}&stage=${stage}`}
                        title={`${count} ${STAGE_LABELS[stage]} deal${count === 1 ? '' : 's'} warned "${WARNING_SHORT_LABEL[code]}" — open on the board`}
                        className={clsx('block rounded px-2 py-1.5 font-mono font-bold transition-opacity hover:opacity-75', heat)}
                      >
                        {count}
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-micro text-grey">
        Stage is the second axis because owner attribution is stubbed platform-wide (every deal is owned by
        “operator”). Click a cell to open the board filtered to those deals.
      </p>
    </div>
  );
}
