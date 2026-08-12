/**
 * THE RISK CALENDAR — the flat reading of a forward risk field, and the thing E7's relief has to beat.
 *
 * `3D_VFX_1000X.md` §2 lists E7 THE STORM as replacing a "`MarketingCrisis` heatmap". There is no heatmap
 * on `pages/MarketingCrisis.tsx` — it is a crisis desk of clocks, statements, clearance lanes and gates,
 * with no day axis anywhere on it (grepped: no `<svg>`, no day grid, no per-day series). So this file is
 * the flat counterpart §2 assumed already existed, written so the two views can be compared on the same
 * object rather than admired separately.
 *
 * ── WHAT IT DRAWS, AND WHAT IT REFUSES TO DRAW ───────────────────────────────────────
 * Days across, channels down, one cell per channel-day carrying that day's total risk in that channel.
 * A day nobody measured is a GAP with a fence and a label — never a pale cell, because a pale cell is a
 * quiet day. A withheld day keeps its tiles and takes a steel lid, which is the same distinction E5 and
 * E7 both draw, mirrored rather than reinvented.
 *
 * The cumulative strip underneath is where the flat view WINS: it prints the running total as a figure,
 * which no volumetric can do. Where the running total does not exist — past a gap — it prints NO INTEGRAL
 * rather than continuing the scale, because a ruler that reads the same on both sides of a hole is a
 * ruler claiming the hole is not there.
 *
 * ── NO SVG STRING IS ASSEMBLED ───────────────────────────────────────────────────────
 * Every label is a JSX text child and every rectangle a real element. There is no
 * `dangerouslySetInnerHTML` in `apps/web` and this file does not introduce the first one: E7's harness
 * shipped its channel and date labels through `innerHTML` and E6's identical line silently ate an `a<b>c`
 * while every assertion passed.
 *
 * Text stays in the DOM — §6 rule 4 — so this figure prints, and a screen reader reads the table of
 * figures rather than a picture of one.
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

/* Presentational only. The ramp's ends are the same two brand hexes the volume marches between, so the
   flat cell and the volumetric slab through it are the same colour by construction. */
const RAMP_LOW = '#2C6BFF';
const RAMP_HIGH = '#FF8A3D';
const RULE = '#26355A';
const INK = 'rgba(196,212,240,.82)';
const INK_DIM = 'rgba(196,212,240,.55)';
const STEEL = '#6B7A99';

/** 0..1 → a stop on the two-hex ramp. Cheap channel-wise mix; the exactness lives in the field. */
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
    <figure style={{ margin: 0 }} data-testid="risk-calendar-refused">
      <figcaption style={{ font: '600 11px/1.4 ui-monospace, monospace', color: INK, letterSpacing: '.04em' }}>
        {title}
      </figcaption>
      <div
        role="alert"
        style={{
          marginTop: 8, border: `1px solid ${RULE}`, borderLeft: '3px solid #E0A94A',
          padding: '10px 12px', font: '400 11px/1.55 ui-monospace, monospace', color: 'rgba(224,169,74,.92)',
        }}
      >
        <div style={{ fontWeight: 700, letterSpacing: '.08em' }}>
          NO CALENDAR — <code>{code}</code>
        </div>
        <p style={{ margin: '4px 0 0' }}>{reason}</p>
      </div>
    </figure>
  );
}

const CELL_W = 22;
const CELL_H = 15;
const GAP = 2;
const LANE_LABEL_W = 96;
const TOP_PAD = 18;
const STRIP_H = 30;

function DayColumn({ day, x, lanes, field, laneH }: {
  day: RiskDay; x: number; lanes: readonly string[]; field: RiskField; laneH: number;
}) {
  if (day.state === 'not_measured') {
    /*
     * THE HOLE IS THE REFUSAL, full height, fenced at both edges and labelled. It is drawn as the
     * ABSENCE of tiles rather than as a differently-coloured tile, because a coloured tile is a value.
     */
    return (
      <g data-day-state="not_measured">
        <rect x={x} y={TOP_PAD} width={CELL_W} height={laneH} fill="none" stroke={STEEL} strokeWidth={1} strokeDasharray="2 2" />
        <line x1={x} y1={TOP_PAD} x2={x + CELL_W} y2={TOP_PAD + laneH} stroke={STEEL} strokeWidth={0.75} opacity={0.5} />
      </g>
    );
  }
  if (day.state === 'withheld') {
    /* Tiles intact, a steel lid over them: measured, and not for this reader. Neither calm nor bad. */
    return (
      <g data-day-state="withheld">
        <rect x={x} y={TOP_PAD} width={CELL_W} height={laneH} fill="#1B2540" />
        <rect x={x} y={TOP_PAD} width={CELL_W} height={laneH} fill={STEEL} opacity={0.28} />
        <rect x={x} y={TOP_PAD} width={CELL_W} height={5} fill={STEEL} opacity={0.85} />
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
            fill={t <= 0 ? '#101B2F' : rampAt(t)}
            opacity={t <= 0 ? 1 : 0.35 + 0.65 * Math.min(1, t)}
          >
            {/* The figure, in the DOM, on the cell. Not a tooltip: a tooltip is not in the print path. */}
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
  const H = TOP_PAD + laneH + STRIP_H + 16;

  const xOf = (d: number): number => LANE_LABEL_W + d * (CELL_W + GAP);

  return (
    <figure style={{ margin: 0 }} data-testid="risk-calendar">
      <figcaption style={{ font: '600 11px/1.4 ui-monospace, monospace', color: INK, letterSpacing: '.04em' }}>
        {title}
      </figcaption>
      <p style={{ margin: '3px 0 0', font: '400 10.5px/1.5 ui-monospace, monospace', color: INK_DIM }}>
        {readsAs}
      </p>

      {field.frame.valuesArePlaceholders === true && (
        <p
          data-testid="risk-calendar-placeholders"
          style={{ margin: '6px 0 0', font: '600 10px/1.5 ui-monospace, monospace', color: '#E0A94A', letterSpacing: '.06em' }}
        >
          PLACEHOLDER VALUES — the shape is deliberate, the numbers are not measurements.
        </p>
      )}

      {field.unmeasuredDays > 0 && (
        <p
          role="note"
          data-testid="risk-calendar-unmeasured"
          style={{ margin: '6px 0 0', font: '400 10.5px/1.5 ui-monospace, monospace', color: 'rgba(224,169,74,.92)' }}
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
        style={{ width: '100%', height: `${heightPx}px`, display: 'block', marginTop: 8 }}
        role="img"
        aria-label={`${title}. ${readsAs}`}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={RAMP_LOW} />
            <stop offset="1" stopColor={RAMP_HIGH} />
          </linearGradient>
        </defs>

        {field.lanes.map((lane, l) => (
          <text
            key={lane}
            x={LANE_LABEL_W - 6}
            y={TOP_PAD + l * (CELL_H + GAP) + CELL_H - 4}
            textAnchor="end"
            style={{ font: '600 8px ui-monospace, monospace', letterSpacing: '.06em' }}
            fill={INK_DIM}
          >
            {lane}
          </text>
        ))}

        {field.days.map((day) => (
          <DayColumn key={day.index} day={day} x={xOf(day.index)} lanes={field.lanes} field={field} laneH={laneH} />
        ))}

        {/* THE REVIEW GATE, where the accumulation crosses the stated trigger. A line in time. */}
        {field.frontDay !== null && (
          <line
            x1={xOf(field.frontDay) - GAP / 2}
            y1={TOP_PAD - 4}
            x2={xOf(field.frontDay) - GAP / 2}
            y2={TOP_PAD + laneH + 4}
            stroke={RAMP_LOW}
            strokeWidth={1.5}
          />
        )}

        {/* The cumulative strip: the figure the 3-D view cannot give, and its refusals. */}
        {field.days.map((day) => {
          const y = TOP_PAD + laneH + 12;
          const x = xOf(day.index);
          if (day.cumulative === null) {
            return (
              <text
                key={day.index}
                x={x + CELL_W / 2} y={y + 8}
                textAnchor="middle"
                style={{ font: '700 7px ui-monospace, monospace' }}
                fill={day.state === 'withheld' ? STEEL : '#E0A94A'}
                data-testid={`risk-cumulative-refused-${day.index}`}
              >
                ×
              </text>
            );
          }
          return (
            <text
              key={day.index}
              x={x + CELL_W / 2} y={y + 8}
              textAnchor="middle"
              style={{ font: '400 7px ui-monospace, monospace' }}
              fill={INK_DIM}
            >
              {day.cumulative.toFixed(1)}
            </text>
          );
        })}

        <text x={LANE_LABEL_W - 6} y={TOP_PAD + laneH + 20} textAnchor="end" style={{ font: '600 7.5px ui-monospace, monospace', letterSpacing: '.06em' }} fill={INK_DIM}>
          CUMULATIVE
        </text>
        <rect x={LANE_LABEL_W} y={2} width={Math.min(120, gridW)} height={5} fill={`url(#${gradId})`} />
        <text x={LANE_LABEL_W + Math.min(120, gridW) + 6} y={7} style={{ font: '400 7px ui-monospace, monospace' }} fill={INK_DIM}>
          {`0 → ${field.maxCell.toFixed(2)} risk units per channel-day`}
        </text>
      </svg>

      {/* The reading states, named. Never summed: three of the five are refusals with different owners. */}
      <dl
        data-testid="risk-calendar-readings"
        style={{ margin: '8px 0 0', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 10px', font: '400 10px/1.5 ui-monospace, monospace' }}
      >
        {(['integrable', 'day_not_measured', 'day_withheld', 'integral_crosses_unmeasured_day', 'integral_crosses_withheld_day'] as const)
          .filter((r) => field.days.some((d) => d.reading === r))
          .map((r) => (
            <div key={r} style={{ display: 'contents' }}>
              <dt style={{ color: r === 'integrable' ? INK_DIM : '#E0A94A', letterSpacing: '.05em' }}>
                {`${field.days.filter((d) => d.reading === r).length}×`}
              </dt>
              <dd style={{ margin: 0, color: INK_DIM }}>{RISK_READING_TEXT[r]}</dd>
            </div>
          ))}
      </dl>

      <p style={{ margin: '6px 0 0', font: '400 10px/1.5 ui-monospace, monospace', color: INK_DIM }}>
        {field.integrableToDay === null
          ? 'No day in this window carries a cumulative total.'
          : `Integrable to ${field.days[field.integrableToDay]!.label}; the calendar continues to ${field.days[field.days.length - 1]!.label} and the accumulated reading does not.`}
        {field.frontRefusal !== null && ` Review gate: ${field.frontRefusal}.`}
      </p>
      <p style={{ margin: '2px 0 0', font: '400 9.5px/1.5 ui-monospace, monospace', color: INK_DIM }}>
        {`Source: ${field.frame.source} · observed at ${field.frame.observedAt}`}
      </p>
    </figure>
  );
}
