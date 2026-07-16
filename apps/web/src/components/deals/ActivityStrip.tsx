import type { DealEvent } from '@/types/bd';

/**
 * Two-tone 21-day activity micro-timeline for a deal card.
 *
 * Our activity (notes, proposals, objections…) renders navy; stage-change
 * days render in the advance accent (status green); empty days stay an
 * ambient hairline tick. Pure SVG, ~14px tall, no chart lib.
 */

export interface DayBucket {
  /** Non-stage-change events that day (our touches). */
  ours: number;
  /** Stage-change events that day. */
  stage: number;
}

export const STRIP_DAYS = 21;
const DAY_MS = 86_400_000;

/**
 * Bucket events into per-day counts over the trailing `days` window.
 * Index 0 = oldest day, index days-1 = today. Future timestamps clamp to
 * today; events older than the window (and unparsable dates) are dropped.
 */
export function bucketEventsByDay(events: DealEvent[], days = STRIP_DAYS, now = Date.now()): DayBucket[] {
  const buckets: DayBucket[] = Array.from({ length: days }, () => ({ ours: 0, stage: 0 }));
  for (const ev of events) {
    const t = Date.parse(ev.createdAt);
    if (!Number.isFinite(t)) continue;
    const age = Math.floor(Math.max(0, now - t) / DAY_MS); // future → today
    if (age >= days) continue;
    const idx = days - 1 - age;
    if (ev.eventType === 'stage_change') buckets[idx].stage += 1;
    else buckets[idx].ours += 1;
  }
  return buckets;
}

const SLOT_W = 4;
const H = 14;
const MAX_PER_DAY = 4; // visual cap; busier days saturate

export interface ActivityStripProps {
  events: DealEvent[];
  days?: number;
  now?: number;
  className?: string;
}

export function ActivityStrip({ events, days = STRIP_DAYS, now, className }: ActivityStripProps) {
  const anchor = now ?? Date.now();
  const buckets = bucketEventsByDay(events, days, anchor);
  const usable = H - 2;

  return (
    <svg
      viewBox={`0 0 ${days * SLOT_W} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Deal activity, last ${days} days`}
      className={className}
      data-testid="activity-strip"
    >
      {buckets.map((b, i) => {
        const x = i * SLOT_W + 0.5;
        const total = b.ours + b.stage;
        const dayLabel = new Date(anchor - (days - 1 - i) * DAY_MS).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        });
        if (total === 0) {
          return (
            <rect key={i} x={x} y={H - 1.5} width={SLOT_W - 1} height={1} rx={0.5} style={{ fill: 'rgb(var(--line))' }}>
              <title>{`${dayLabel} — quiet`}</title>
            </rect>
          );
        }
        // Split the (capped) bar between the two tones, stage accent on top.
        const capped = Math.min(total, MAX_PER_DAY);
        const stageShare = b.stage > 0 ? Math.max(1, Math.round((capped * b.stage) / total)) : 0;
        const oursShare = capped - stageShare;
        const unit = usable / MAX_PER_DAY;
        const oursH = oursShare * unit;
        const stageH = stageShare * unit;
        const title = `${dayLabel} — ${b.ours} ${b.ours === 1 ? 'touch' : 'touches'}${b.stage ? `, ${b.stage} stage ${b.stage === 1 ? 'change' : 'changes'}` : ''}`;
        return (
          <g key={i}>
            {oursH > 0 && (
              <rect x={x} y={H - oursH} width={SLOT_W - 1} height={oursH} rx={0.5} style={{ fill: 'rgb(var(--navy))' }}>
                <title>{title}</title>
              </rect>
            )}
            {stageH > 0 && (
              <rect
                x={x}
                y={H - oursH - stageH}
                width={SLOT_W - 1}
                height={stageH}
                rx={0.5}
                style={{ fill: 'rgb(var(--green))' }}
              >
                <title>{title}</title>
              </rect>
            )}
          </g>
        );
      })}
    </svg>
  );
}
