/**
 * SURFACE PLOT — the renderer half of data geometry. It computes no coordinates.
 *
 * Every vertex, every tick position, every paint index and the whole viewBox arrive
 * precomputed from `packages/shared/src/geometry/index.ts`. This file maps them to SVG
 * elements and decides colours. That is the entire division of labour, and it is the plan's
 * §6.1 boundary made structural: because the numbers live in a pure module, an auditor
 * holding the inputs can recompute this picture, which is the one thing a baked bitmap of a
 * margin surface can never offer.
 *
 * THE ONLY ARITHMETIC IN THIS FILE IS PRESENTATIONAL: `shade` (already normalised into the
 * vertical domain by the engine) becomes a fill opacity. No projection, no scaling, no
 * domain, no tick placement, no ordering. If a future change needs a number that is not
 * already on `SurfaceGeometry`, the number belongs in the engine — putting it here is how
 * the two halves start disagreeing about what the surface says.
 *
 * NO SVG STRING IS ASSEMBLED AND INJECTED. There is no `dangerouslySetInnerHTML` anywhere in
 * `apps/web` and an attack pass confirmed it; a markup string built from data is an injection
 * sink, so points go through the `points` attribute of a real `<polygon>` element and labels
 * go through JSX text children.
 *
 * NO DEPENDENCY. Not three.js, not d3, not a charting library — inline JSX and the app's own
 * colour tokens. A 3-D library would spend a large fraction of the initial JS budget on
 * decoration; the budget itself is measured by `apps/web/scripts/check-bundle.mjs` and quoting
 * a headroom figure here would be repeating a number this file cannot verify (the first attempt
 * quoted "835KB of 850", which is the exact figure that script's own header records as the one
 * that lied about a 1.38MB first load). Mount this on an ALREADY-LAZY route and it costs zero
 * initial bytes; nothing in the app's shell imports it.
 *
 * WHAT THE REFUSED BRANCH IS FOR. A surface that cannot be drawn honestly does not render an
 * empty box with axes on it — an empty box reads as a measured flat surface. It renders the
 * refusals, their stable codes and the rule each one cites, because the operator's next
 * action depends on WHICH absence stopped the drawing.
 */
import { useId } from 'react';
import { CHART_GRID, seriesVar } from '@/components/charts/palette';
/*
 * IMPORTED BY RELATIVE PATH, and deliberately — the same decision as
 * `pages/MarketingCrisis.tsx:6-21`, whose import at line 44 still reads
 * `'../../../../packages/shared/src/marketing/crisis'`. (`pages/GpsConflict.tsx` was cited here
 * too and should not have been: its comment records that the relative import was REMOVED in the
 * P13 wiring pass and its import now reads `from '@lcx/shared'`. A citation to the opposite of
 * the decision it is cited for is worse than no citation.)
 *
 * `packages/shared/package.json` exposes exactly one entry point (`"."` → `src/index.ts`),
 * and `src/index.ts` does not re-export `./geometry` — the agent who wrote the engine was
 * forbidden to touch the barrel (a human wiring pass owns every barrel and route file), so
 * `@lcx/shared/geometry` resolves for neither `tsc` nor Vite. The alternative was to restate
 * the projection maths in this file, which is precisely the duplication that lets a picture
 * and its engine disagree about where a vertex is. The engine is pure and has no I/O, so
 * reaching into it needs no server and cannot drift.
 */
import {
  type GeometryRefusal,
  type ProjectedPoint,
  type ProjectedTick,
  type SurfaceGeometry,
  type SurfaceHole,
  type SurfaceOutcome,
  type SurfaceQuad,
} from '../../../../../packages/shared/src/geometry/index';

export interface SurfacePlotProps {
  /**
   * The engine's output — built by the CALLER with `buildSurfaceMesh`, so the data assembly
   * and the drawing stay separable and this component can be handed a refusal in a test.
   */
  readonly surface: SurfaceOutcome;
  readonly title: string;
  /**
   * WHAT THE THIRD AXIS CARRIES, and what a 2-D slice of this data would lose. Required, and
   * required in the caller's own words, because the plan's one test for this whole track is
   * that the surface is not decoration. A caller who cannot finish this sentence is drawing a
   * 3-D chart for the look of it and should use `components/charts` instead.
   */
  readonly readsAs: string;
  /** CSS height of the figure. The viewBox comes from the engine and is never overridden. */
  readonly heightPx?: number;
}

/* Presentational only: the engine's normalised `shade` → an ink weight. */
function fillOpacityFor(shade: number): number {
  return 0.22 + shade * 0.62;
}

function pointsAttr(pts: readonly ProjectedPoint[]): string {
  return pts.map((p) => `${p.sx},${p.sy}`).join(' ');
}

/** A drawable cell. Fill weight rises with height so a ridge reads without a colour ramp. */
function Quad({ q, dashed }: { q: SurfaceQuad; dashed: boolean }) {
  return (
    <polygon
      data-cell={`${q.col},${q.row}`}
      data-kind="quad"
      points={pointsAttr(q.corners)}
      fill={seriesVar(1)}
      fillOpacity={fillOpacityFor(q.shade)}
      stroke={seriesVar(1)}
      strokeOpacity={0.85}
      strokeWidth={0.5}
      strokeDasharray={dashed ? '2 1.5' : undefined}
    />
  );
}

/**
 * A HOLE, drawn as a hole — and a WITHHELD hole drawn as a different hole.
 *
 * An outline on the base plane with no fill, so the reader sees straight through the sheet and
 * cannot mistake the gap for a low cell. The two kinds of gap are told apart on the drawing
 * itself, because they are different facts and the reader's question differs: a cell nobody
 * measured gets a sparse dash with a CROSS through it (nothing is known here), and a cell whose
 * corner is present-but-withheld gets a tight dash and no cross (something is known here and is
 * not shown). Collapsing them into one glyph would be the same collapse as writing `null` for a
 * withheld height. The cross is drawn between corners the engine supplied — this component
 * invents no midpoint, because a midpoint would be a height and no height is known here.
 */
function Hole({ h }: { h: SurfaceHole }) {
  const [a, b, c, d] = h.footprint;
  const withheld = h.withheldCorners.length > 0;
  return (
    <g
      data-cell={`${h.col},${h.row}`}
      data-kind="hole"
      data-hole="true"
      data-withheld={withheld ? 'true' : undefined}
    >
      <polygon
        points={pointsAttr(h.footprint)}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.55}
        strokeWidth={0.5}
        strokeDasharray={withheld ? '0.8 1.2' : '2 2'}
      />
      {!withheld && (
        <>
          <line x1={a.sx} y1={a.sy} x2={c.sx} y2={c.sy} stroke="currentColor" strokeOpacity={0.35} strokeWidth={0.4} />
          <line x1={b.sx} y1={b.sy} x2={d.sx} y2={d.sy} stroke="currentColor" strokeOpacity={0.35} strokeWidth={0.4} />
        </>
      )}
    </g>
  );
}

function TickLabel({
  tick,
  anchor,
  dx = 0,
  dy = 0,
}: {
  tick: ProjectedTick;
  anchor: 'start' | 'middle' | 'end';
  dx?: number;
  dy?: number;
}) {
  return (
    <text
      x={tick.at.sx + dx}
      y={tick.at.sy + dy}
      textAnchor={anchor}
      fontSize={4}
      fill="currentColor"
      className="text-grey"
    >
      {tick.label}
    </text>
  );
}

function Figure({ g, title, readsAs, heightPx }: { g: SurfaceGeometry; title: string; readsAs: string; heightPx: number }) {
  const labelId = useId();
  const ph = g.frame.valuesArePlaceholders;
  const { minX, minY, width, height } = g.viewBox;

  return (
    <figure className="w-full" data-testid="surface-plot">
      <figcaption className="mb-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-navy">{title}</span>
          {/* ENVIRONMENT LABEL. A picture needs it more than a table does. */}
          <span
            className="rounded-sm border border-current px-1 text-[10px] uppercase tracking-wide text-grey"
            data-testid="surface-environment"
          >
            {g.frame.environment}
          </span>
          {ph && (
            <span
              className="rounded-sm bg-status-conditional-bg px-1 text-[10px] font-semibold uppercase tracking-wide text-status-conditional"
              data-testid="surface-placeholder-tag"
            >
              Placeholder heights
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-grey" data-testid="surface-reads-as">{readsAs}</p>
      </figcaption>

      <svg
        viewBox={`${minX} ${minY} ${width} ${height}`}
        style={{ height: heightPx }}
        className="block w-full text-grey"
        role="img"
        aria-labelledby={labelId}
      >
        <title id={labelId}>
          {`${g.frame.zLabel} (${g.frame.zUnit}) over ${g.frame.xLabel} and ${g.frame.yLabel}. `}
          {`${g.frame.cellsDrawn} of ${g.frame.cellsTotal} cells observed; ${g.frame.cellsHoles} left open. `}
          {g.projectionLabel}
        </title>

        {/* The base plane, so the reader can see the plan the surface sits over. */}
        <polygon points={pointsAttr(g.floor)} fill="none" stroke={CHART_GRID} strokeWidth={0.5} />

        {/* z = 0, where the domain straddles it. On a margin surface this is the first thing
            anybody looks for, and the engine returns null rather than drawing a fake one. */}
        {g.zeroPlane && (
          <polygon
            data-testid="surface-zero-plane"
            points={pointsAttr(g.zeroPlane)}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.5}
            strokeWidth={0.5}
            strokeDasharray="3 2"
          />
        )}

        {/* THE SHEET, IN THE ENGINE'S ORDER. `g.cells` is already back-to-front; this maps it
            and must not sort, reverse or filter it. Reordering here is how a surface paints
            itself inside-out while every unit test on the engine still passes. */}
        {g.cells.map((c) =>
          c.kind === 'quad'
            ? <Quad key={`${c.col},${c.row}`} q={c} dashed={ph} />
            : <Hole key={`${c.col},${c.row}`} h={c} />
        )}

        {/* Vertical axis and its ticks. */}
        <line
          x1={g.zAxis[0].sx}
          y1={g.zAxis[0].sy}
          x2={g.zAxis[1].sx}
          y2={g.zAxis[1].sy}
          stroke={CHART_GRID}
          strokeWidth={0.5}
        />
        {g.zTicks.map((t) => (
          <g key={`z-${t.value}`} data-testid="surface-z-tick">
            <line x1={t.at.sx - 1.5} y1={t.at.sy} x2={t.at.sx + 1.5} y2={t.at.sy} stroke={CHART_GRID} strokeWidth={0.5} />
            <TickLabel tick={t} anchor="end" dx={-2.5} dy={1.4} />
          </g>
        ))}

        {/* Plan axes. The engine chose which floor edge is NEAR for this view and placed the
            ticks there; the only thing added here is the outward text offset, and the tests
            ray-cast every rendered label position against every drawn quad to prove no label
            lands on the sheet. Positions are otherwise not adjusted. */}
        {g.xTicks.map((t) => (
          <TickLabel key={`x-${t.value}`} tick={t} anchor="middle" dy={5} />
        ))}
        {g.yTicks.map((t) => (
          <TickLabel key={`y-${t.value}`} tick={t} anchor="end" dx={-2} dy={3} />
        ))}
      </svg>

      {/* THE FRAME, IN WORDS. Not optional and not collapsible: a picture reads as
          authoritative, so what it could and could not see travels underneath it. */}
      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2" data-testid="surface-frame">
        <div>
          <dt className="inline text-grey">Axes: </dt>
          <dd className="inline text-navy">
            {`${g.frame.xLabel} (${g.frame.xUnit}) × ${g.frame.yLabel} (${g.frame.yUnit}) → ${g.frame.zLabel} (${g.frame.zUnit})`}
          </dd>
        </div>
        <div>
          <dt className="inline text-grey">Observed: </dt>
          <dd className="inline text-navy">
            {`${g.frame.cellsDrawn} of ${g.frame.cellsTotal} cells `}
            {/* THREE COUNTS, NEVER SUMMED. Never-measured and withheld are different facts. */}
            {`(${g.frame.pointsObserved} grid points observed, ${g.frame.pointsAbsent} never measured, `}
            {`${g.frame.pointsWithheld} present but withheld)`}
          </dd>
        </div>
        <div>
          <dt className="inline text-grey">As of: </dt>
          <dd className="inline text-navy">
            {g.frame.observedAt}
            {g.frame.windowFrom && g.frame.windowTo ? ` · window ${g.frame.windowFrom} → ${g.frame.windowTo}` : ' · snapshot, not a window'}
          </dd>
        </div>
        <div>
          <dt className="inline text-grey">Source: </dt>
          <dd className="inline text-navy">{g.frame.source}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="inline text-grey">Vertical domain: </dt>
          <dd className="inline text-navy">{`${g.zDomain[0]} … ${g.zDomain[1]} ${g.frame.zUnit}`}</dd>
        </div>
        <div className="sm:col-span-2">
          {/* A PROJECTION IS A CHOICE, NOT A FACT — printed verbatim from the engine. */}
          <dt className="inline text-grey">View: </dt>
          <dd className="inline text-grey" data-testid="surface-projection">{g.projectionLabel}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="inline text-grey">Interpolation: </dt>
          <dd className="inline text-grey" data-testid="surface-interpolation">{g.frame.interpolation}</dd>
        </div>
      </dl>

      {g.notices.length > 0 && (
        <ul className="mt-2 space-y-1" data-testid="surface-notices">
          {g.notices.map((n) => (
            <li key={n.code} className="text-xs text-grey" data-notice={n.code}>
              <span className="font-mono text-[10px] uppercase">{n.code}</span>
              {' — '}
              {n.sentence}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

/** No box, no axes, no zero. The codes and the rules they cite, which is the useful part. */
function Refused({ refusals, title }: { refusals: readonly GeometryRefusal[]; title: string }) {
  return (
    <section
      className="w-full rounded border border-dashed border-current p-3 text-grey"
      role="note"
      data-testid="surface-refused"
    >
      <h3 className="text-sm font-medium text-navy">{title} — not drawn</h3>
      <p className="mt-1 text-xs">
        This figure refuses rather than rendering a box with axes on it. An empty box reads as a
        measured flat surface, which is the fabrication the refusal exists to prevent.
      </p>
      <ul className="mt-2 space-y-2">
        {refusals.map((r, i) => (
          <li key={`${r.code}-${i}`} data-refusal={r.code} className="text-xs">
            <span className="font-mono text-[10px] uppercase text-navy">{r.code}</span>
            {r.cell && <span className="font-mono text-[10px]">{` [cell ${r.cell[0]},${r.cell[1]}]`}</span>}
            {r.environment && <span className="font-mono text-[10px]">{` [${r.environment}]`}</span>}
            <p className="mt-0.5">{r.sentence}</p>
            <p className="mt-0.5 italic opacity-80">{`${r.rule.instrument} · ${r.rule.provision}: ${r.rule.text}`}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A quantity over TWO independent variables, drawn as a surface. See the module docblock for
 * why that subject and no other, and `readsAs` for the sentence a caller has to be able to
 * finish before using this at all.
 */
export function SurfacePlot({ surface, title, readsAs, heightPx = 320 }: SurfacePlotProps) {
  if (surface.kind === 'refused') return <Refused refusals={surface.refusals} title={title} />;
  return <Figure g={surface} title={title} readsAs={readsAs} heightPx={heightPx} />;
}
