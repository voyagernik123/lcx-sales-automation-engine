/**
 * THE RISK CALENDAR — the flat reading of a forward risk field, and the thing E7's relief has to beat.
 *
 * `3D_VFX_1000X.md` §2 lists E7 THE STORM as replacing a "`MarketingCrisis` heatmap". There is no heatmap
 * on `pages/MarketingCrisis.tsx` — it is a crisis desk of clocks, statements, clearance lanes and gates,
 * with no day axis anywhere on it (grepped: no `<svg>`, no day grid, no per-day series in 2,126 lines). So
 * this file is the flat counterpart §2 assumed already existed, written so the two views can be compared
 * on the same object rather than admired separately.
 *
 * ── WHAT IT DRAWS, AND WHAT IT REFUSES TO DRAW ───────────────────────────────────────
 * Days across, channels down, one cell per channel-day carrying that day's total risk in that channel.
 * A day nobody measured is a GAP with a fence and a label — never a pale cell, because a pale cell is a
 * quiet day. A withheld day keeps its tiles and takes a steel lid, which is the same distinction E5 and
 * E7 both draw, mirrored rather than reinvented.
 *
 * The cumulative strip underneath is where the flat view WINS: it prints the running total as a figure,
 * which no volumetric can do. Where the running total does not exist — past a gap — it prints a refusal
 * rather than continuing the scale, because a ruler that reads the same on both sides of a hole is a ruler
 * claiming the hole is not there.
 *
 * ── IT IS THEMED, WHICH THE FIRST DRAFT WAS NOT ──────────────────────────────────────
 * The first version of this file wore E7's frame colours as inline hex — ink at
 * `rgba(196,212,240,.82)` on a transparent background. That is legible on the dark command deck where E5's
 * relief lives and very nearly invisible on `MarketingCrisis`, which is a LIGHT surface. So every colour
 * that is interface goes through the app's own tokens (`text-navy`, `text-grey-dark`, `border-line`,
 * `status-conditional`) and re-themes with the page. The only raw hexes left are the two ends of the RISK
 * RAMP, which are brand and data rather than interface, and are the same two the volume marches between —
 * so a cell here and the slab through it in the 3-D view cannot disagree about colour.
 *
 * ── NO SVG STRING IS ASSEMBLED ───────────────────────────────────────────────────────
 * Every label is a JSX text child and every rectangle a real element. There is no
 * `dangerouslySetInnerHTML` in `apps/web` and this file does not introduce the first one: E7's harness
 * shipped its channel and date labels through `innerHTML`, and E6's identical line silently ate an `a<b>c`
 * while every assertion in that harness passed.
 *
 * Text stays in the DOM — §6 rule 4 — so this figure prints, and a reader gets the figures rather than a
 * picture of them.
 */
import { useId } from 'react';
import {
  RISK_READING_TEXT, isRiskField,
  type RiskDay, type RiskField, type RiskFieldOutcome,
} from './riskField';

export interface RiskCalendarProps {
  readonly field: RiskFieldOutcome;
  readonly title: string;
  /**
   * WHAT THE ACCUMULATION CARRIES that a per-cell table does not. Required, and in the caller's own
   * words: a caller who cannot finish this sentence does not need this figure.
   */
  readonly readsAs: string;
  readonly heightPx?: number;
}

/* The two ends of the risk ramp. Brand, and shared with `StormReliefGl` by value on purpose. */
const RAMP_LOW = '#2C6BFF';
const RAMP_HIGH = '#FF8A3D';
/* Interface colours, as tokens, so both themes work. */
const GREY = 'rgb(var(--grey))';
const GREY_LIGHT = 'rgb(var(--grey-light))';
const ICE = 'rgb(var(--ice))';
const AMBER = 'rgb(var(--amber))';

/** 0..1 → a stop on the ramp. Channel-wise mix; the exactness lives in the field, not in the paint. */
function rampAt(t: number): string {
  const c = Math.max(0, Math.min(1, t));
  const lo = [0x2c, 0x6b, 0xff];
  const hi = [0xff, 0x8a, 0x3d];
  const mix = lo.map((v, i) => Math.round(v + (hi[i]! - v) * c));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

function Refused({ title, code, reason }: { title: string; code: string; reason: string }) {
  /* AN EMPTY GRID IS NOT AN OPTION. A calendar with axes and no cells reads as a measured quiet window,
     which is the exact conflation this component exists to refuse. */
  return (
    <figure className="m-0" data-testid="risk-calendar-refused">
      <figcaption className="font-mono text-micro font-bold uppercase tracking-wider text-navy">
        {title}
      </figcaption>
      <div
        role="alert"
        className="mt-1.5 border-l-4 border-status-conditional bg-status-conditional-bg px-2 py-1.5"
      >
        <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-status-conditional">
          No calendar — <code>{code}</code>
        </div>
        <p className="mt-0.5 font-mono text-micro leading-relaxed text-grey-dark">{reason}</p>
      </div>
    </figure>
  );
}

const CELL_W = 22;
const CELL_H = 15;
const GAP = 2;
const LANE_LABEL_W = 96;
const TOP_PAD = 20;
const STRIP_H = 34;

function DayColumn({ day, x, lanes, field, laneH }: {
  day: RiskDay; x: number; lanes: readonly string[]; field: RiskField; laneH: number;
}) {
  if (day.state === 'not_measured') {
    /*
     * THE HOLE IS THE REFUSAL — full height, fenced at both edges, and drawn as the ABSENCE of tiles
     * rather than as a differently-coloured tile, because a coloured tile is a value.
     */
    return (
      <g data-day-state="not_measured">
        <rect x={x} y={TOP_PAD} width={CELL_W} height={laneH} fill="none" stroke={GREY} strokeWidth={1} strokeDasharray="2 2" />
        <line x1={x} y1={TOP_PAD} x2={x + CELL_W} y2={TOP_PAD + laneH} stroke={GREY} strokeWidth={0.75} opacity={0.55} />
      </g>
    );
  }
  if (day.state === 'withheld') {
    /* Tiles intact, a lid over them: measured, and not for this reader. Neither calm nor bad, so it takes
       no colour from the risk ramp — that would assert a finding nobody is entitled to. */
    return (
      <g data-day-state="withheld">
        <rect x={x} y={TOP_PAD} width={CELL_W} height={laneH} fill={GREY_LIGHT} />
        <rect x={x} y={TOP_PAD} width={CELL_W} height={5} fill={GREY} />
      </g>
    );
  }
  return (
    <g data-day-state="observed">
      {lanes.map((lane, l) => {
        let sum = 0;
        for (let b = 0; b < field.bands.length; b++) sum += field.cell(l, day.index, b) ?? 0;
        const t = field.maxCell > 0 ? sum / field.maxCell : 0;
        return (
          <rect
            key={lane}
            x={x}
            y={TOP_PAD + l * (CELL_H + GAP)}
            width={CELL_W}
            height={CELL_H}
            fill={t <= 0 ? ICE : rampAt(t)}
            opacity={t <= 0 ? 1 : 0.4 + 0.6 * Math.min(1, t)}
          >
            {/* The figure, in the DOM, on the cell. */}
            <title>{`${lane} · ${day.label} · ${sum.toFixed(3)} risk units`}</title>
          </rect>
        );
      })}
    </g>
  );
}

export function RiskCalendar({ field, title, readsAs, heightPx = 260 }: RiskCalendarProps) {
  const gradId = useId();
  if (!isRiskField(field)) return <Refused title={title} code={field.code} reason={field.reason} />;

  const laneH = field.lanes.length * (CELL_H + GAP) - GAP;
  const gridW = field.days.length * (CELL_W + GAP) - GAP;
  const W = LANE_LABEL_W + gridW + 8;
  const H = TOP_PAD + laneH + STRIP_H + 14;
  const xOf = (d: number): number => LANE_LABEL_W + d * (CELL_W + GAP);
  const stripY = TOP_PAD + laneH + 13;

  return (
    <figure className="m-0" data-testid="risk-calendar">
      <figcaption className="font-mono text-micro font-bold uppercase tracking-wider text-navy">
        {title}
      </figcaption>
      <p className="mt-0.5 font-mono text-micro leading-relaxed text-grey-dark">{readsAs}</p>

      {field.frame.valuesArePlaceholders === true && (
        <p
          data-testid="risk-calendar-placeholders"
          className="mt-1 font-mono text-[10px] font-bold uppercase tracking-wider text-status-conditional"
        >
          Placeholder values — the shape is deliberate, the numbers are not measurements.
        </p>
      )}

      {field.unmeasuredDays > 0 && (
        <p
          role="note"
          data-testid="risk-calendar-unmeasured"
          className="mt-1 font-mono text-micro leading-relaxed text-status-conditional"
        >
          {field.unmeasuredDays} day(s) were NOT MEASURED
          {field.itemsLostToUnmeasuredDays > 0
            ? `, and ${field.itemsLostToUnmeasuredDays} already-scheduled item(s) landed inside them: their weight is in no cell below and is not zero`
            : ''}
          . Every cumulative figure past that day is refused rather than continued.
        </p>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: `${heightPx}px` }}
        className="mt-1.5 block"
        role="img"
        aria-label={`${title}. ${readsAs}`}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={RAMP_LOW} />
            <stop offset="1" stopColor={RAMP_HIGH} />
          </linearGradient>
        </defs>

        {/* Channel names. `currentColor` so the axis re-themes with the page rather than with this file. */}
        <g className="text-grey" fill="currentColor">
          {field.lanes.map((lane, l) => (
            <text
              key={lane}
              x={LANE_LABEL_W - 6}
              y={TOP_PAD + l * (CELL_H + GAP) + CELL_H - 4}
              textAnchor="end"
              style={{ font: '600 8px "JetBrains Mono", monospace', letterSpacing: '.06em' }}
            >
              {lane}
            </text>
          ))}
        </g>

        {field.days.map((day) => (
          <DayColumn key={day.index} day={day} x={xOf(day.index)} lanes={field.lanes} field={field} laneH={laneH} />
        ))}

        {/* THE REVIEW GATE, where the accumulation crosses the stated trigger. A line in time. */}
        {field.frontDay !== null && (
          <line
            x1={xOf(field.frontDay) - GAP / 2}
            y1={TOP_PAD - 5}
            x2={xOf(field.frontDay) - GAP / 2}
            y2={TOP_PAD + laneH + 5}
            stroke={RAMP_LOW}
            strokeWidth={1.5}
            data-testid="risk-calendar-gate"
          />
        )}

        {/*
          EVERY DAY IS LABELLED, and that is not a stylistic choice: in the 3-D view only 9 of E7's 28
          date labels survived — 15 refused as TOO_FLAT past day 9, 3 for the hole and 1 as OCCLUDED —
          because the floor foreshortens. The flat view has no such problem and should not pretend to.
        */}
        <g className="text-grey" fill="currentColor">
          {field.days.map((day) => (
            <text
              key={day.index}
              x={xOf(day.index) + CELL_W / 2}
              y={TOP_PAD - 7}
              textAnchor="middle"
              style={{ font: '400 7px "JetBrains Mono", monospace' }}
            >
              {day.label}
            </text>
          ))}
        </g>

        {/* The cumulative strip: the figure the 3-D view cannot give, and its refusals. */}
        {field.days.map((day) => {
          const x = xOf(day.index) + CELL_W / 2;
          if (day.cumulative === null) {
            return (
              <text
                key={day.index}
                x={x} y={stripY + 8}
                textAnchor="middle"
                fill={day.state === 'withheld' ? GREY : AMBER}
                style={{ font: '700 7px "JetBrains Mono", monospace' }}
                data-testid={`risk-cumulative-refused-${day.index}`}
              >
                {'—'}
              </text>
            );
          }
          return (
            <text
              key={day.index}
              x={x} y={stripY + 8}
              textAnchor="middle"
              className="text-grey-dark"
              fill="currentColor"
              style={{ font: '400 7px "JetBrains Mono", monospace' }}
            >
              {day.cumulative.toFixed(1)}
            </text>
          );
        })}

        <g className="text-grey" fill="currentColor">
          <text
            x={LANE_LABEL_W - 6} y={stripY + 8} textAnchor="end"
            style={{ font: '600 7.5px "JetBrains Mono", monospace', letterSpacing: '.06em' }}
          >
            CUMULATIVE
          </text>
          <text
            x={LANE_LABEL_W + Math.min(120, gridW) + 6} y={9}
            style={{ font: '400 7px "JetBrains Mono", monospace' }}
          >
            {`0 → ${field.maxCell.toFixed(2)} risk units per channel-day`}
          </text>
        </g>
        <rect x={LANE_LABEL_W} y={4} width={Math.min(120, gridW)} height={5} fill={`url(#${gradId})`} />
      </svg>

      {/* The reading states, named and counted. Never summed: three of the five are refusals with
          different owners — an outage is a vendor problem, a compartment is a clearance problem. */}
      <dl
        data-testid="risk-calendar-readings"
        className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 font-mono text-[10px] leading-relaxed"
      >
        {(['integrable', 'day_not_measured', 'day_withheld', 'integral_crosses_unmeasured_day', 'integral_crosses_withheld_day'] as const)
          .filter((r) => field.days.some((d) => d.reading === r))
          .map((r) => (
            <div key={r} className="contents">
              <dt className={r === 'integrable' ? 'text-grey' : 'font-bold text-status-conditional'}>
                {`${field.days.filter((d) => d.reading === r).length}×`}
              </dt>
              <dd className="m-0 text-grey-dark">{RISK_READING_TEXT[r]}</dd>
            </div>
          ))}
      </dl>

      <p className="mt-1 font-mono text-[10px] leading-relaxed text-grey-dark">
        {field.integrableToDay === null
          ? 'No day in this window carries a cumulative total.'
          : `Integrable to ${field.days[field.integrableToDay]!.label}; the calendar continues to ${field.days[field.days.length - 1]!.label} and the accumulated reading does not.`}
        {field.frontRefusal !== null && ` Review gate: ${field.frontRefusal}.`}
      </p>
      <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-grey">
        {`Source: ${field.frame.source} · observed at ${field.frame.observedAt}`}
      </p>
    </figure>
  );
}
