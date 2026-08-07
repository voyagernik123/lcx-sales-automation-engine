import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Gauge, SlidersHorizontal, TrendingUp, Lock } from 'lucide-react';
import {
  fetchReadiness, lpRescore, runWaitlistSim, fetchCommandDeep,
  type Readiness, type LpRescoreResult, type WaitlistSimOut, type CommandDeep,
} from '@/lib/api/command';
import { buildSurfaceMesh, WITHHELD, type GridCellValue, type SurfaceOutcome } from '@lcx/shared';
import { SurfacePlot } from '@/components/geometry/SurfacePlot';
import { apiConfig } from '@/lib/apiClient';
import { ErrorNotice } from '@/components/shared';
import { clsx } from 'clsx';

/**
 * Cockpit panels (100X Phase 3) — the Phase-2 engines as live instruments:
 * the program-readiness dial, the LP optimizer with weight sliders + rank-flip
 * sensitivity, and the funnel simulator with budget sliders. Every what-if is
 * an overlay — stored truth never changes from here.
 */

/**
 * All three panels gate on `if (!payload) return null`, which is right while
 * loading — an instrument should not reserve space for a number it may not get —
 * but was also what a FAILED read rendered, because each one caught into the
 * same null. The panel then silently ceased to exist: no skeleton, no message,
 * no gap. An instrument that quietly removes itself is worse than one reading
 * zero, because the operator draws conclusions from the panels that are left.
 *
 * So: failure gets its own state and one compact line. Loading still renders
 * nothing, deliberately, so the cockpit's layout while it settles is unchanged.
 */
function PanelError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <section className="br-section rounded-lg border border-line bg-card p-4 shadow-card">
      <ErrorNotice error={error} onRetry={onRetry} compact />
    </section>
  );
}

/* ── Readiness dial header ── */
export function ReadinessDial() {
  const [r, setR] = useState<Readiness | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const load = useCallback(() => { setErr(null); fetchReadiness().then(setR).catch(setErr); }, []);
  useEffect(() => { load(); }, [load]);
  if (err) return <PanelError error={err} onRetry={load} />;
  if (!r) return null;
  const angle = (r.score / 100) * 270 - 135;
  const tone = r.score >= 70 ? 'text-emerald-500' : r.score >= 40 ? 'text-amber-500' : 'text-red-500';
  return (
    <section className="br-section rounded-lg border border-line bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-6">
        <div className="relative h-28 w-28 shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full">
            <path d="M 15 78 A 40 40 0 1 1 85 78" fill="none" strokeWidth="8" className="stroke-line" strokeLinecap="round" />
            <path d="M 15 78 A 40 40 0 1 1 85 78" fill="none" strokeWidth="8" strokeLinecap="round"
              className={clsx('t-metric', tone.replace('text-', 'stroke-'))}
              strokeDasharray={`${(r.score / 100) * 188.5} 300`} />
            <line x1="50" y1="50" x2="50" y2="18" strokeWidth="2.5" strokeLinecap="round"
              className={tone.replace('text-', 'stroke-')} transform={`rotate(${angle} 50 50)`} />
            <circle cx="50" cy="50" r="3.5" className={tone.replace('text-', 'fill-')} />
          </svg>
          <div className="absolute inset-x-0 bottom-0 text-center">
            <span className={clsx('font-mono text-h2 font-bold', tone)}>{r.score}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
            <Gauge size={12} /> Launch readiness — composite of five weighted dials
          </div>
          <div className="grid gap-2 sm:grid-cols-5">
            {r.dials.map((d) => (
              <div key={d.key} className="rounded border border-line/70 p-2">
                <div className="flex items-baseline justify-between">
                  <span className="truncate text-micro text-grey">{d.label}</span>
                  <span className="font-mono text-micro text-grey/70">×{d.weight}</span>
                </div>
                <div className="font-mono text-label font-bold text-navy">{d.score}</div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-ice-soft dark:bg-ice-soft/10">
                  <div className={clsx('h-full rounded-full', d.score >= 70 ? 'bg-emerald-500' : d.score >= 40 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: `${d.score}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════════ */
/* THE SCORECARD SURFACE — the grid the ranked list throws away                        */
/* ══════════════════════════════════════════════════════════════════════════════════ */

/**
 * A `Scorecard` IS A MATRIX and every surface in this platform rendered it as a column.
 *
 * `{ dimensions: ScorecardDim[]; rows: ScorecardRow[] }` with `scores: Record<string, number>`
 * on every row is literally subjects × dimensions → score. The LP panel below reduced all 90
 * of those cells to one `weighted.toFixed(2)` and a bar, and a weighted average is a LOSSY
 * projection by construction: two partners land on 3.4 for opposite reasons and draw the
 * identical bar. WHERE a partner wins and where it loses — the only thing a procurement
 * decision is actually made on — was not on the screen at all.
 *
 * ── WHY THIS IS THE THIRD DIMENSION EARNING ITS PLACE, NOT DECORATION ──────────────
 * The two facts the ranked list is structurally incapable of stating:
 *
 *  · A RIDGE along one dimension is the dimension carrying the ranking. The list shows the
 *    order; it cannot show what produced it.
 *  · A TRENCH across every partner is a capability the WHOLE BENCH lacks. That is not a fact
 *    about any partner, so no ordering of partners can express it — and it is the one that
 *    changes what you do next, because the answer is "go and find a partner for it" rather
 *    than "pick the top of this list".
 *
 * The heights are also INVARIANT under the weight sliders while the row order is not, which
 * is the property that makes the pair readable: slide a weight, watch the rows swap while
 * every height stays put, and the dimension responsible is the one under the swap. A weight
 * is an opinion about the scores; it is not a score.
 *
 * ── AND HERE IS THE CASE AGAINST IT, MEASURED, BECAUSE THE PARAGRAPH ABOVE IS AN ARGUMENT ──
 * A figure that only ever states its own case is marketing. Three facts an owner deciding
 * whether to keep this should have, none of which the section above admits:
 *
 *  1. BOTH PLAN AXES ARE CATEGORICAL. x is authored dimension order — this file's own axis unit
 *     calls it "authored order", i.e. arbitrary — and y is an ordinal rank. The sheet therefore
 *     draws a SLOPE between D3 and D4 that is the rate of nothing, and re-ordering the workbook's
 *     columns redraws the whole landscape. A ridge or a trench is column-local and survives that;
 *     the rest of the shape does not, and the shape is most of what a reader sees.
 *  2. THERE IS NO RIDGE AND NO TRENCH IN TODAY'S DATA. Counted off `seed/command/data2.ts`: the
 *     ten column means run 3.44 (Off-Exch Settlement) to 4.67 (OTC Block Desk) and every cell is
 *     3–5 bar one 2. Rendered against the forced 0–5 axis that is a 1.2-point undulation, and the
 *     PNG reads as noise. The two facts this figure exists to state are both TRUE STATEMENTS
 *     ABOUT WHAT IT WOULD SHOW and neither is visible on the bench it ships over.
 *  3. THE SAME 90 CELLS ARE ALREADY ON THIS PAGE AS NUMBERS. `DeepOntologyPanel` renders the `lp`
 *     scorecard in full — every value, in its own column — and it is open by default on the `lp`
 *     tab, a few hundred pixels below this panel on `/command-deck`. That panel's own docblock
 *     argues a surface over a table showing every cell would be "better SHAPE PERCEPTION, no
 *     additional information … the definition of decoration". The argument does not stop at the
 *     panel boundary: the ranked list loses the cells, the PAGE does not.
 *
 * What survives all three is narrow and real: this is the only place the cells appear ORDERED BY
 * LIVE RANK, next to the sliders that move it, so the invariance read above is available here and
 * nowhere else. Whether that is worth a 400px figure whose values cannot be recovered by eye is
 * an owner's call, not this file's — but a 10 × 9 heatmap of the same matrix, live-rank-sorted,
 * would carry every one of the reads above with no occlusion and no invented continuity, and that
 * comparison is recorded here rather than left for the next reader to rediscover.
 *
 * ── NOTHING HERE IS COMPUTED ───────────────────────────────────────────────────────
 * Every height is a cell the strategy workbook authored, read straight off
 * `rows[].scores[dim.key]`. No average, no normalisation, no fill. The one piece of arithmetic
 * is the three-state read below, and it is the ENGINE's read, term for term
 * (`commandEngines.ts:184`), so the surface cannot disagree with the ranking about which
 * cells exist.
 */

/**
 * WHAT ONE CELL ACTUALLY IS, and the four answers that were being collapsed into one.
 *
 * `ScorecardRow.scores` is typed `Record<string, number>`, but it is JSON off a wire and out
 * of a database, so at runtime `scores[key]` is one of four things. `commandEngines.ts:38`
 * documents the same four for the ranking side and this is deliberately the same predicate:
 *
 *   key absent          → `absent`    nobody assessed this dimension.
 *   key present, null   → `withheld`  somebody recorded that there is no value.
 *   key present, junk   → `malformed` a string, NaN, Infinity. Not a measurement.
 *   key present, finite → `scored`, and that INCLUDES a genuine 0.
 *
 * The whole point is the last line and the first: `?? 0` reads absence as the worst possible
 * score, and `v >= 3` on `undefined` reads it as a failing one. That exact confusion is the
 * defect the ranking engine had fixed out of it this week (`commandEngines.ts:105`), and it
 * was still live in `DeepOntologyPanel`'s table, which tinted an unscored cell RED.
 */
export type ScorecardCellState = 'scored' | 'absent' | 'withheld' | 'malformed';

export function scorecardCellState(
  scores: Readonly<Record<string, unknown>> | null | undefined,
  key: string,
): ScorecardCellState {
  if (scores == null) return 'absent';
  if (!Object.prototype.hasOwnProperty.call(scores, key)) return 'absent';
  const v = scores[key];
  if (v === null || v === undefined) return 'withheld';
  if (typeof v !== 'number' || !Number.isFinite(v)) return 'malformed';
  return 'scored';
}

/**
 * A cell state → what the mesh is handed.
 *
 * `absent` is `null`, which the engine draws as a HOLE at the base of the box. Not a zero,
 * not the row's average, not its neighbours smoothed over it — `INTERPOLATION_POLICY` is
 * printed under every figure and it is enforced by the engine requiring four observed corners.
 *
 * `malformed` ALSO GOES IN AS A HOLE, AND THAT IS A KNOWN, STATED IMPRECISION. The engine's
 * cell vocabulary is number | null | WITHHELD — it has no state for "present and broken" — so
 * a malformed cell lands in the frame's `pointsAbsent` count, which says "never measured"
 * about a cell that was measured badly. It is the least-bad of the three available answers
 * (`WITHHELD` would claim it was measured and classified; a number would invent one), and the
 * panel prints its own malformed count beside the figure rather than letting the frame's
 * count stand as the whole story. Named in the lane's `needsWiring`.
 */
export function scorecardCell(
  scores: Readonly<Record<string, unknown>> | null | undefined,
  key: string,
): GridCellValue {
  const state = scorecardCellState(scores, key);
  if (state === 'withheld') return WITHHELD;
  if (state !== 'scored') return null;
  return (scores as Record<string, number>)[key];
}

/**
 * THE AUTHORED SCALE, and it is not invented here.
 *
 * The ranked list forty lines below draws its bar as `(r.weighted / 5) * 100` and
 * `DeepOntologyPanel`'s table buckets at `>= 5 / >= 4 / >= 3`. 0–5 is already this panel's
 * asserted scale; the surface holds the same one so the two cannot disagree, and so the
 * figure's shape does not breathe when a slider moves the ranking. The engine still reports
 * `observedDomain` separately and raises `Z_DOMAIN_OVERRIDDEN`, so the override is on the
 * figure rather than in this comment.
 */
export const SCORECARD_SCALE_MAX = 5;

/**
 * Exactly what the surface reads. Narrow on purpose, the same decision as
 * `GpsUnderwriting.buildMarginSurface`: the test drives THIS function with an honest fixture
 * instead of casting a half-built `LpRescoreResult`, and a cast is how a renamed field passes
 * a suite. The real call site satisfies it structurally, so nothing is adapted at the boundary.
 */
export interface ScorecardSurfaceInput {
  readonly dimensions: readonly { readonly key: string; readonly label: string }[];
  /**
   * Rows in the order they should stack. `ordinal` is the y COORDINATE, so it must be strictly
   * ascending and unique — for the LP panel it is the live rank, which makes the surface and
   * the ranked list agree by construction rather than by care. A duplicated ordinal folds the
   * mesh over itself and the engine refuses it (`GEOMETRY_AXIS_DEGENERATE`) rather than drawing
   * overlapping polygons in a meaningless order.
   */
  readonly rows: readonly {
    readonly subjectLabel: string;
    readonly ordinal: number;
    readonly scores: Readonly<Record<string, unknown>> | null | undefined;
  }[];
  /** ISO instant. Empty refuses (`GEOMETRY_OBSERVATION_NOT_DATED`). */
  readonly observedAt: string;
  /** The route and engine field the cells came from. Printed on the frame verbatim. */
  readonly source: string;
  readonly yLabel: string;
  readonly yUnit: string;
}

/** Grid-point counts by state, for the caption. Counted, never estimated. */
export function scorecardCoverage(input: ScorecardSurfaceInput): Record<ScorecardCellState, number> {
  const out: Record<ScorecardCellState, number> = { scored: 0, absent: 0, withheld: 0, malformed: 0 };
  for (const r of input.rows) for (const d of input.dimensions) out[scorecardCellState(r.scores, d.key)]++;
  return out;
}

/**
 * TICK TOKENS, AND WHY THE TICKS ARE NOT THE FULL LABELS.
 *
 * The honest first attempt put `subjectLabel` and `dim.label` straight onto the axes, and the
 * failure mode is NOT the one you would guess. The engine reserves viewBox room for each label's
 * own text box, so long labels do not collide — they push the viewBox outward and CRUSH the
 * figure inside it. Measured on the shipped 10 × 9 bench by
 * `__tests__/lpScoreSurface.test.ts`, from the engine's own `LABEL_FONT_SIZE` /
 * `LABEL_ADVANCE_EM` / `LABEL_GAP` and its projected anchors:
 *
 *   D1…D10 + #1…#9 on the ticks   sheet occupies 88.7% of the viewBox width
 *   the full authored labels      sheet occupies 57.98%  ← the surface renders at 65% of its
 *                                                          size, the rest is a fan of text
 *
 * A DOM test cannot see any of this (`textContent` is the full string whatever the geometry
 * does), which is exactly the class of defect this repo's rule about legibility was written for.
 *
 * So the tick carries a short STABLE token and the full name is printed in a legend beside the
 * figure — no truncation, no abbreviation, nothing renamed. `#3` is the rank, which is the same
 * token the ranked list prints, so a reader crosses between the two without a lookup at all.
 */
export const dimToken = (i: number) => `D${i + 1}`;
export const subjectToken = (ordinal: number) => `#${ordinal}`;

/**
 * A bigger box than the default 100×100×62, for ONE measured reason: tick separation.
 *
 * Adjacent tick anchors have to stay further apart than a line of text is tall, or the label
 * boxes intersect. Measured on this bench: at the default 100-deep box the worst adjacent gap
 * is 0.58 units of a 4-unit line; at 132 it is 3.10. Both clear, and the second one clears with
 * enough headroom that adding a partner to the bench does not silently spend it all.
 *
 * The box is a drawing choice and carries no data: heights are normalised into it either way,
 * and `observedDomain` is reported from the values regardless.
 */
const SCORECARD_BOX = { width: 132, depth: 132, height: 74 } as const;

/**
 * THE VERTICAL AXIS DOES NOT LABEL ITS FLOOR, AND THAT IS A WORKAROUND, NOT A DESIGN.
 *
 * FOUND BY RENDERING THE FIGURE AND LOOKING AT THE PNG, which is the only thing that finds
 * this class: the z tick at the bottom of the domain and the FIRST plan tick on the y axis are
 * projected to the SAME POINT, and both are drawn right-aligned a couple of units to the left
 * of it. On the shipped bench they came out at (-93.34, 53.89) each, label boxes intersecting
 * by 2.00 units of a 4-unit line, and the figure printed the literal mash `0#01` where `0.0`
 * and `#1` should have been. Two labels destroyed, one of them the TOP-RANKED PARTNER — the
 * single most-read token on the whole picture.
 *
 * WHY THE CALLER CANNOT FIX IT PROPERLY. `buildSurfaceMesh` anchors the vertical axis at the
 * LEFTMOST floor corner and anchors the y ticks along a whole floor edge; the leftmost corner
 * is an endpoint of that edge at every legal view, so the two anchors coincide by construction.
 * Swept every legal whole azimuth on this bench (1…359 less the three right angles the engine
 * refuses): the floor z label intersects a plan label at ALL of them, worst +3.96 units and best
 * exactly 0.00 — the two boxes touch, never separate — and only WHICH plan label it destroys
 * changes (`#1` at 45°, `D10`, `#9`, `D1` at the four azimuths where the overlap bottoms out).
 * `zDomain` does not help either: `valueAxisTicks` always emits a tick at the low end, so the
 * floor carries a label whatever the domain is.
 *
 * WHAT THIS DOES INSTEAD. The floor tick keeps its mark and loses its TEXT, and the tick count
 * rises so the axis still states a scale: `1.0 … 5.0` on evenly spaced marks with an unlabelled
 * one at the base. Nothing is hidden — the floor value is printed twice in words under every
 * figure, by the frame ("Vertical domain: 0 … 5") and by the engine's own
 * `Z_DOMAIN_EXCLUDES_ZERO` notice ("The vertical axis starts exactly at zero"). Before this the
 * axis carried three labels (`0.0`, `2.0`, `4.0`) and never named the top of its own box.
 *
 * THE REAL FIX IS IN THE RENDERER — one line-height of vertical offset between the z tick run
 * and the plan tick run, exactly as `SurfacePlot` already does to separate the x run from the y
 * run at the near corner ("+50%00,000"). This lane may not edit it. Named in `needsWiring`, and
 * it fixes the shipped GPS margin surface at the same time: the collision is the engine's
 * geometry, not this bench's.
 */
const Z_TICK_COUNT = SCORECARD_SCALE_MAX;
const zTickLabel = (v: number) => (v === 0 ? '' : v.toFixed(1));

export function buildScorecardSurface(input: ScorecardSurfaceInput): SurfaceOutcome {
  const dims = input.dimensions;
  const rows = [...input.rows].sort((a, b) => a.ordinal - b.ordinal);

  return buildSurfaceMesh({
    /*
     * Row-major, `rows[j][i]` = the score of subject j on dimension i — the engine's own order.
     * `rows: []` when there is nothing ranked, which the engine reports as GEOMETRY_GRID_EMPTY
     * ("read and holds no cells"), distinct from the GEOMETRY_GRID_NOT_LOADED it would report
     * for `null`. The panel never gets here un-loaded — it returns before mounting the figure —
     * so `null` is not reachable from this call site and is not faked to look reachable.
     */
    rows: rows.map((r) => dims.map((d) => scorecardCell(r.scores, d.key))),
    xAxis: {
      label: 'Scorecard dimension',
      unit: 'authored order, weight-independent',
      ticks: dims.map((_, i) => ({ value: i, label: dimToken(i) })),
    },
    yAxis: {
      label: input.yLabel,
      unit: input.yUnit,
      ticks: rows.map((r) => ({ value: r.ordinal, label: subjectToken(r.ordinal) })),
    },
    zAxis: {
      label: 'Authored score',
      unit: `points on the workbook's 0–${SCORECARD_SCALE_MAX} scale`,
      tickCount: Z_TICK_COUNT,
      formatTick: zTickLabel,
    },
    frame: {
      /*
       * THE API HOST, NAMED AS THE API HOST — the same decision as the GPS margin surface. The
       * response carries no database identity and inventing one ('production') would be exactly
       * the laundering the frame exists to prevent. What this panel knows is which service answered.
       */
      environment: `API ${apiConfig.base}`,
      observedAt: input.observedAt,
      /* A snapshot at one instant, not a window over one. Both endpoints null, never `observedAt`. */
      windowFrom: null,
      windowTo: null,
      source: input.source,
      /*
       * `valuesArePlaceholders` IS DELIBERATELY NOT PASSED, and the absence is the honest answer
       * rather than an oversight. These cells are authored analyst judgements graded C3 (public
       * research) in the workbook — recorded values, not `TODO_` stand-ins — and no server flag
       * exists that says otherwise. Hard-coding `false` would be this panel asserting a grade it
       * cannot observe. The GPS surface passes the flag because a server field carries it; there
       * is no equivalent field on this route, and that gap is named in the lane's `needsWiring`.
       */
    },
    box: SCORECARD_BOX,
    zDomain: [0, SCORECARD_SCALE_MAX],
  });
}

const LP_SURFACE_READS_AS =
  'Height is ONE partner’s authored score on ONE dimension, on the workbook’s 0–5 scale — not a '
  + 'total. The ranked list beside this shows each partner’s weighted average, a single scalar in '
  + 'which two partners reading 3.4 for completely opposite reasons draw the identical bar; this '
  + 'surface is what that average was computed from. A ridge along one dimension is the dimension '
  + 'carrying the ranking. A trench across every partner is a capability the whole bench lacks — a '
  + 'procurement fact, and one no ordering of partners can state, because it is not a fact about '
  + 'any partner. A HOLE is a dimension nobody scored for that partner: it is not a zero and the '
  + 'ranking did not average it in. Moving the weight sliders re-orders the rows and changes no '
  + 'height, because a weight is an opinion about these scores and is not one of them.';

/**
 * THE LP SCORE SURFACE, beside the ranked list rather than instead of it.
 *
 * The list answers WHO WINS and the surface answers ON WHAT; deleting either leaves a question
 * the panel can no longer answer, which is the test for whether two figures of the same data
 * are both earning their space.
 *
 * FULL WIDTH, BELOW the two-column row rather than inside one of its columns: ten dimensions and
 * nine partners is 90 cells and half a panel is not enough width to separate the axis ticks —
 * the same legibility constraint the token scheme above is about.
 *
 * IT SHOWS EVERY RANKED PARTNER while the list beside it stops at six. That is not a mismatch to
 * be tidied away: a TRENCH is a claim about the whole bench and a figure drawn over two thirds of
 * the bench cannot make it. The order is the same in both, because both are the live rank.
 */
function LpScoreSurface({ res, observedAt }: { res: LpRescoreResult; observedAt: string }) {
  const input = useMemo<ScorecardSurfaceInput>(() => ({
    dimensions: res.dimensions,
    rows: res.rows.map((r) => ({ subjectLabel: r.subjectLabel, ordinal: r.rank, scores: r.scores })),
    observedAt,
    source:
      'POST /v1/command/engines/lp-rescore → rescoreDetailed().ranked[].scores — the authored '
      + 'scorecard cells the weighted average is computed FROM, never the average itself. '
      + 'observedAt is when this browser received the response: the route stamps its own asOf into '
      + 'meta and the web fetch layer returns only data, so no server instant reaches this figure.',
    yLabel: 'Partner, by live rank',
    yUnit: 'rank under the weights set above, #1 best',
  }), [res.dimensions, res.rows, observedAt]);

  const surface = useMemo(() => buildScorecardSurface(input), [input]);
  const coverage = useMemo(() => scorecardCoverage(input), [input]);

  return (
    <div className="mt-4 border-t border-line/60 pt-3" data-testid="lp-score-surface">
      <SurfacePlot
        surface={surface}
        title={`LP bench · authored score, ${res.dimensions.length} dimensions × ${res.rows.length} ranked partners`}
        readsAs={LP_SURFACE_READS_AS}
        heightPx={400}
      />
      {/*
        THE LEGEND IS PART OF THE FIGURE, not a nicety: the axes carry tokens precisely so that
        nothing is truncated, and a token with no key is worse than a collided label. Full labels,
        exactly as authored — nothing shortened here either.
      */}
      <div className="mt-2 grid gap-x-6 gap-y-1 text-[10px] leading-snug text-grey sm:grid-cols-2" data-testid="lp-surface-legend">
        <div>
          <span className="font-bold uppercase tracking-wider">Dimensions (x)</span>
          <ul className="mt-0.5 space-y-0.5">
            {res.dimensions.map((d, i) => (
              <li key={d.key}><span className="font-mono font-bold text-navy">{dimToken(i)}</span> {d.label}</li>
            ))}
          </ul>
        </div>
        <div>
          <span className="font-bold uppercase tracking-wider">Partners (y), by live rank</span>
          <ul className="mt-0.5 space-y-0.5">
            {res.rows.map((r) => (
              <li key={r.subjectId}><span className="font-mono font-bold text-navy">{subjectToken(r.rank)}</span> {r.subjectLabel}</li>
            ))}
          </ul>
        </div>
      </div>
      {/*
        THE COUNT THE FRAME CANNOT STATE. A malformed cell goes into the mesh as a hole and lands
        in the frame's `pointsAbsent`, which says nobody measured it. It was measured; the value is
        junk. The count is printed here so the two are not collapsed on the screen even though the
        engine's vocabulary collapses them in the mesh. Rendered only when there are any — a
        permanent "0 malformed" line is decoration.
      */}
      {coverage.malformed > 0 && (
        <p className="mt-1.5 text-[10px] leading-snug text-amber-600 dark:text-amber-400" data-testid="lp-surface-malformed">
          {coverage.malformed} cell(s) hold a value that is not a finite number. They are drawn as
          holes and counted in the figure&rsquo;s ABSENT total, which is not quite right — they were
          measured, and what was recorded is not a measurement. The geometry engine has no cell
          state for that.
        </p>
      )}
    </div>
  );
}

/* ── LP optimizer — weight sliders → live re-rank + sensitivity ── */
export function LpOptimizerPanel() {
  const [res, setRes] = useState<LpRescoreResult | null>(null);
  /**
   * WHEN THIS BROWSER RECEIVED THE RANKING, and it is set in the SAME callback as the payload
   * so the two can never drift apart — a figure dated to a response it is not drawn from is
   * the failure the frame exists to prevent.
   *
   * It is the read instant, not a server instant, and the surface's `source` says so in those
   * words. `meta()` on the route does stamp one; `lpRescore` returns `.data` and drops `meta`
   * in a file this lane may not edit, so the honest label is the only one this panel can
   * observe. Named in `needsWiring`.
   */
  const [readAt, setReadAt] = useState<string | null>(null);
  const [weights, setWeights] = useState<Record<string, number> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [err, setErr] = useState<unknown>(null);

  const run = useCallback((w?: Record<string, number>) => {
    setErr(null);
    lpRescore(w).then((r) => { setRes(r); setReadAt(new Date().toISOString()); }).catch(setErr);
  }, []);
  useEffect(() => { run(); }, [run]);

  const onSlide = (key: string, v: number) => {
    const next = { ...(weights ?? Object.fromEntries((res?.dimensions ?? []).map((d) => [d.key, d.weight]))), [key]: v };
    setWeights(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => run(next), 250);
  };

  if (err) return <PanelError error={err} onRetry={() => run(weights ?? undefined)} />;
  if (!res) return null;
  const current = weights ?? Object.fromEntries(res.dimensions.map((d) => [d.key, d.weight]));
  return (
    <section className="br-section rounded-lg border border-line bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
        <SlidersHorizontal size={12} /> LP optimizer — live weights, live rank
        {weights && (
          <button onClick={() => { setWeights(null); run(); }} className="ml-auto text-micro font-semibold text-cyan-700 hover:underline dark:text-cyan-400">
            Reset to strategy weights
          </button>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          {res.dimensions.map((d) => (
            <div key={d.key} className="flex items-center gap-2">
              <span className="w-40 shrink-0 truncate text-micro text-grey-dark" title={d.label}>{d.label}</span>
              <input
                type="range" min={0} max={0.4} step={0.01}
                value={current[d.key] ?? d.weight}
                onChange={(e) => onSlide(d.key, Number(e.target.value))}
                className="min-w-0 flex-1 accent-cyan-500"
                aria-label={`Weight of ${d.label}`}
              />
              <span className="w-10 shrink-0 text-right font-mono text-micro text-navy">{(current[d.key] ?? d.weight).toFixed(2)}</span>
            </div>
          ))}
          <p className="pt-1 text-[10px] text-grey">Weights renormalize to 1.0 — a pure what-if; the strategy's authored weights stay stored truth.</p>
        </div>
        <div>
          <div className="space-y-1">
            {res.rows.slice(0, 6).map((r) => (
              <div key={r.subjectId} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center font-mono text-micro font-bold text-grey">{r.rank}</span>
                <span className="min-w-0 flex-1 truncate text-label font-medium text-navy">{r.subjectLabel}</span>
                <div className="h-2.5 w-28 shrink-0 overflow-hidden rounded-full bg-ice-soft dark:bg-ice-soft/10">
                  <div className="h-full rounded-full bg-cyan-500" style={{ width: `${(r.weighted / 5) * 100}%` }} />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-label font-bold text-navy">{r.weighted.toFixed(2)}</span>
              </div>
            ))}
          </div>
          {/*
            PARTNERS THE WEIGHTING COULD NOT SCORE. Same reason as the channel mix: `rescore`
            returns the ranked rows only, so an unscored partner was dropped from the panel
            entirely and read as "not on the bench". It carries the engine's own code and
            reason rather than a UI-invented sentence.
          */}
          {res.unrankable && res.unrankable.length > 0 && (
            <div className="mt-2 border-t border-line/60 pt-2 text-[10px] text-grey" data-testid="lp-unrankable">
              <span className="font-bold">{res.unrankable.length} not ranked under this weighting</span>
              {': '}
              {res.unrankable.map((u) => u.subjectLabel).join(', ')}
              {'. '}
              {res.unrankable[0]!.reason}
            </div>
          )}
          <div className="mt-3 border-t border-line/60 pt-2">
            <div className="mb-1 text-micro font-bold uppercase tracking-wider text-grey">Rank-flip sensitivity (authored weights)</div>
            {res.sensitivity.filter((s) => s.flipWeight !== null).length === 0 ? (
              <p className="text-micro text-emerald-600 dark:text-emerald-400">Robust: no single dimension weight in [0, 0.6] flips #1 — the pick survives perturbation.</p>
            ) : (
              res.sensitivity.filter((s) => s.flipWeight !== null).slice(0, 3).map((s) => (
                <p key={s.dimKey} className="text-micro text-grey-dark">{s.dimLabel}: #1/#2 tie at weight {s.flipWeight}</p>
              ))
            )}
            <p className="mt-1 text-micro text-grey">
              3-LP set: {res.setAnalysis.gaps.length === 0
                ? <span className="text-emerald-600 dark:text-emerald-400">covers all {res.dimensions.length} dimensions ≥4</span>
                : <span className="text-amber-600 dark:text-amber-400">gaps in {res.setAnalysis.gaps.map((g) => g.dimLabel).join(', ')}</span>}
              {' '}· balance {res.setAnalysis.concentration}
            </p>
          </div>
        </div>
      </div>

      {/*
        THE SURFACE MOUNTS ON THE PANEL ITSELF, not behind a control and not after a submission.
        `LpOptimizerPanel` fetches on mount from `CommandDeck`, so this is on screen for anyone
        who opens the deck — which is the whole complaint the lane was opened for: a capability
        nobody can reach is not a capability, and the one shipped surface before this was behind
        a form submission on a page nobody browses to.

        `readAt` gates it rather than defaulting: an undated figure is refused by the engine, and
        substituting `new Date()` at render time would re-date the figure on every keystroke of
        every slider and make it look freshly observed when it is not.
      */}
      {readAt != null && <LpScoreSurface res={res} observedAt={readAt} />}
    </section>
  );
}

/* ── Funnel simulator — budget sliders → P10/50/90 + marginal ranking ── */
export function FunnelSimPanel() {
  const [deep, setDeep] = useState<CommandDeep | null>(null);
  const [sim, setSim] = useState<WaitlistSimOut | null>(null);
  const [budgets, setBudgets] = useState<Record<string, number> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [err, setErr] = useState<unknown>(null);

  const run = useCallback((b?: Record<string, number>) => {
    setErr(null);
    runWaitlistSim(b).then(setSim).catch(setErr);
  }, []);
  const load = useCallback(() => {
    setErr(null);
    fetchCommandDeep().then(setDeep).catch(setErr);
    run();
  }, [run]);
  useEffect(() => { load(); }, [load]);

  if (err) return <PanelError error={err} onRetry={load} />;
  if (!deep || !sim) return null;
  const paid = deep.reference.funnel.channels.filter((ch) => ch.type === 'Paid');
  const cur = budgets ?? Object.fromEntries(paid.map((ch) => [ch.channelId, ch.budget]));

  const onSlide = (id: string, v: number) => {
    const next = { ...cur, [id]: v };
    setBudgets(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => run(next), 300);
  };

  return (
    <section className="br-section rounded-lg border border-line bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-grey">
        <TrendingUp size={12} /> Waitlist funnel simulator — budget what-ifs
        {budgets && (
          <button onClick={() => { setBudgets(null); run(); }} className="ml-auto text-micro font-semibold text-cyan-700 hover:underline dark:text-cyan-400">
            Reset to plan
          </button>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          {paid.map((ch) => {
            const locked = sim.lockedChannels.includes(ch.label);
            return (
              <div key={ch.channelId} className="flex items-center gap-2">
                <span className="w-44 shrink-0 truncate text-micro text-grey-dark" title={ch.label}>
                  {locked && <Lock size={9} className="mr-0.5 inline text-amber-500" />}{ch.label}
                </span>
                <input
                  type="range" min={0} max={150000} step={5000}
                  value={cur[ch.channelId] ?? ch.budget}
                  onChange={(e) => onSlide(ch.channelId, Number(e.target.value))}
                  disabled={locked}
                  className="min-w-0 flex-1 accent-cyan-500 disabled:opacity-40"
                  aria-label={`Budget for ${ch.label}`}
                />
                <span className="w-14 shrink-0 text-right font-mono text-micro text-navy">${((cur[ch.channelId] ?? ch.budget) / 1000).toFixed(0)}k</span>
              </div>
            );
          })}
          <p className="pt-1 text-[10px] text-grey">
            {sim.adsUnlocked ? 'Mainstream paid unlocked.' : 'Mainstream paid LOCKED until the MSB + MTL tasks complete (live check).'} CAC ±30% uncertainty, funnel-rate uncertainty ±0.10 — planning simulation.
          </p>
        </div>
        <div>
          <div className="grid grid-cols-3 gap-2">
            {([['Waitlist', sim.waitlist], ['Verified', sim.verified], ['Funded', sim.funded]] as const).map(([label, v]) => (
              <div key={label} className="rounded border border-line/70 p-2 text-center">
                <div className="text-micro font-bold uppercase tracking-wider text-grey">{label}</div>
                <div className="font-mono text-label font-bold text-navy">{v.p50.toLocaleString()}</div>
                <div className="text-[10px] text-grey">P10 {v.p10.toLocaleString()} · P90 {v.p90.toLocaleString()}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between text-micro">
            <span className="text-grey">Paid budget ${(sim.totalPaidBudget / 1000).toFixed(0)}k</span>
            <span className="text-grey">Blended CAC/funded: <span className="font-mono font-bold text-navy">{sim.blendedCacPerFundedP50 != null ? `$${sim.blendedCacPerFundedP50}` : '—'}</span></span>
          </div>
          <div className="mt-2 border-t border-line/60 pt-2">
            <div className="mb-1 text-micro font-bold uppercase tracking-wider text-grey">Next $1k goes furthest in…</div>
            {sim.marginal.slice(0, 3).map((m, i) => (
              <div key={m.channelId} className="flex items-center gap-2 text-micro">
                <span className="w-4 text-center font-mono font-bold text-grey">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-grey-dark">{m.label}</span>
                <span className="shrink-0 font-mono font-bold text-navy">+{m.fundedPerExtra1k} funded</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
