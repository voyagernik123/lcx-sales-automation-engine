import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { render } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE SVG / GL THRESHOLD, AS A RATCHET.
 *
 * `PLATFORM_VFX_100X.md` §7.2 asked for "a size/complexity threshold below which SVG is
 * simply correct" and said it "has to be measured, not guessed". It was guessed instead, and
 * two charts shipped GL-backed that the measured threshold — `docs/3d/w2/SVG_GL_THRESHOLD.md`
 * — rejects. This file is what stops that recurring.
 *
 * ── WHAT WENT WRONG, WITH THE NUMBERS THAT WERE MEASURED ────────────────────────────────
 * `Sparkline` was GL-backed at `halfWidth: 1.15` against the `strokeWidth={2}` polyline it
 * replaced. `createStrokeBatch.polyline` emits with `uSoft = 1`, so its coverage is
 * `edge = smoothstep(1.0, 0.0, |vAcross|)` across the WHOLE ribbon — there is no opaque core
 * — and `∫₋₁¹ smoothstep(1,0,|x|) dx = 1.0` in `across` units makes the effective ink width
 * exactly `halfWidth`. Rasterised, both arms, on an M1: the GL ribbon carried **56.8 %** of
 * the SVG polyline's ink (2.314 device px of cross-section against 4.000). The GL layer made
 * the most numerous chart surface in the product LIGHTER than the SVG it replaced.
 *
 * `ControlBand` was GL-backed with a 2.6-unit ribbon — L = 5.2 device px — and reproduced its
 * `strokeDasharray="5 3"` as geometry, one draw call per painted dash. Counted off a live
 * render: **55 draw calls, for a series of 2 points and for a series of 90 points alike**,
 * because the count is set by the plot's arc length over an 8-unit period and not by the
 * data. 0.744-0.996 ms/frame against 0.024-0.035 for a bars chart at the same frame size.
 *
 * ── WHY THIS IS A SOURCE + WIRING TEST AND NOT A PIXEL TEST ─────────────────────────────
 * The defect is invisible to every renderer this suite can run. jsdom has no WebGL2, so
 * `useFlatChart` refuses, `refused` stays true, and every chart renders its SVG — which is
 * the arm that was already CORRECT. The defect lives where no rendering assertion reaches: a
 * shader constant, a `halfWidth` literal, and an import edge.
 *
 * ── HOW EACH ASSERTION IS PROVED ABLE TO FAIL ──────────────────────────────────────────
 * After the fix no chart is GL-backed through a polyline, so a live scan ALONE would be a
 * test that cannot fail — documentation with a green tick beside it. Every gate has two arms:
 *
 *   LIVE      scans the shipped tree. A ratchet: it fires the moment a chart below the floor
 *             is wired to the GL path. The 8 charts that legitimately pass keep it honest.
 *   MUTATION  runs the same checker over the code that ACTUALLY SHIPPED at 38c01b1, quoted
 *             verbatim, and requires it to fail. That is the proof the checker works.
 *
 * Run against the tree BEFORE the removal, the live arms failed with exactly:
 *   completeness   Sparkline, ControlBand — GL-wired with no lit-axis extent declared
 *   gate A         Sparkline L = 4.6 device px < 20;  ControlBand L = 5.2 < 20
 *   gate A · ink   Sparkline halfWidth 1.15 < strokeWidth 2 (57.5 %);  ControlBand 1.3 (65.0 %)
 *   gate B         ControlBand builds GL geometry from a dash splitter
 *   gate B · count ControlBand handed the layer 55 primitives
 */

const CHARTS = join(__dirname, '..');

/** Comments stripped, so an assertion fires on CODE and never on the prose explaining it. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const srcOf = (file: string) => code(readFileSync(join(CHARTS, file), 'utf8'));

/** Every chart file wired to the GL path, mapped to the hook it calls. */
function glWired(): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of readdirSync(CHARTS).filter((n) => n.endsWith('.tsx'))) {
    const m = /\buse(FlatBars|FlatTrack|FlatDial|FlatLine|FlatBand)\s*\(/.exec(srcOf(f));
    if (m) out.set(f.replace(/\.tsx$/, ''), `use${m[1]}`);
  }
  return out;
}

/**
 * GATE A · the lit-axis extent, in device pixels.
 *
 * `L` is the mark's extent along the axis the shading varies on — column HEIGHT for a
 * vertical bar, bar LENGTH (not thickness) for a horizontal one, `rOuter − rInner` for an
 * arc, `2 · halfWidth` across a ribbon. The lit edge is `smoothstep(0.10, 0.0, t)`
 * (`packages/gl/src/flat/bars.ts:133`) — the first 10 % of L — so two device pixels of
 * gradient, enough to read as an edge rather than one lighter pixel row, needs `L ≥ 20`.
 *
 * The floor is the SHADER's constant, not a psychophysical one. It says what can exist on
 * screen, not what a person notices, and `SVG_GL_THRESHOLD.md` §7.3 says so too.
 */
const FLOOR_DEVICE_PX = 20;

/**
 * dpr 2 — the value `useFlatChart` clamps to (`gl/useFlatChart.ts:106`) — times the CSS
 * pixels one viewBox unit occupies. Declared per chart because the fluid charts scale with
 * their card and the two fixed-size ones do not. This is also the default applied to a chart
 * that is GL-wired without being registered: 1 CSS px per unit is what the fixed-size charts
 * use, and an unregistered chart has supplied nothing better.
 */
const DEFAULT_DEVICE_PX_PER_UNIT = 2;

interface Entry {
  readonly hook: string;
  /** How L is derived, so a reader can check it rather than trust it. */
  readonly litAxis: string;
  /** L in VIEWBOX units. */
  readonly unitsL: number;
  readonly devicePxPerUnit: number;
}

/**
 * The eight primitives the threshold says should be GL-backed, with L from
 * `docs/3d/w2/SVG_GL_THRESHOLD.md` §5. `Sparkline` and `ControlBand` are absent ON PURPOSE:
 * their GL paths were removed. The completeness check is what notices if either returns.
 */
const REGISTRY: Record<string, Entry> = {
  BarChartH: { hook: 'useFlatBars', litAxis: 'bar length', unitsL: 288, devicePxPerUnit: 2 },
  ColumnChart: { hook: 'useFlatBars', litAxis: 'column height at 60 % of plotH', unitsL: 110.4, devicePxPerUnit: 2 },
  CompareBars: { hook: 'useFlatBars', litAxis: 'column height — same FlatBars path and plot geometry as ColumnChart', unitsL: 110.4, devicePxPerUnit: 2 },
  Histogram: { hook: 'useFlatBars', litAxis: 'modal bin height; a 2 % tail bin is below the floor and is named in §5', unitsL: 110.4, devicePxPerUnit: 2 },
  StackedBarH: { hook: 'useFlatTrack', litAxis: 'segment width', unitsL: 288, devicePxPerUnit: 2 },
  FunnelChart: { hook: 'useFlatBars', litAxis: 'bar length', unitsL: 288, devicePxPerUnit: 2 },
  // GroupedColumnChart (P5): VH 180, MT 16, MB 20 → plotH 144; L at 60 % of plotH = 86.4 units; fluid like ColumnChart.
  GroupedColumnChart: { hook: 'useFlatBars', litAxis: 'column height at 60 % of plotH — the same FlatBars path as ColumnChart, grouped by series', unitsL: 86.4, devicePxPerUnit: 2 },
  /* GaugeChart is FLUID (`className="block w-full"`), so `devicePxPerUnit` is the CONSERVATIVE
     assumption — a card exactly as wide as its 160-unit viewBox — not §5's 320 px card. It
     clears the floor at 26 rather than 52. Breakeven is a card of about 123 CSS px; a gauge
     rendered narrower than that would drop below 20 and this entry would stop being true. */
  GaugeChart: { hook: 'useFlatDial', litAxis: 'band thickness, THICKNESS = 13 over a 160-unit viewBox in a 160 px card', unitsL: 13, devicePxPerUnit: 2 },
  // DonutChart sets width/height = size (default 160) alongside its viewBox, so one unit is one
  // CSS px at every size and `thickness` (default 22) is the whole of L.
  DonutChart: { hook: 'useFlatLine', litAxis: 'band thickness, rOuter − rInner = thickness = 22', unitsL: 22, devicePxPerUnit: 2 },
};

/** Every `halfWidth: <literal>` handed to the GL layer, one-level consts resolved. */
function ribbonHalfWidths(src: string): number[] {
  const consts = new Map<string, number>();
  for (const m of src.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(-?\d+(?:\.\d+)?)\s*;/g)) {
    consts.set(m[1]!, Number(m[2]));
  }
  const out: number[] = [];
  for (const m of src.matchAll(/\bhalfWidth\s*:\s*([A-Za-z_$][\w$]*|-?\d+(?:\.\d+)?)/g)) {
    const raw = m[1]!;
    const v = /^-?\d/.test(raw) ? Number(raw) : consts.get(raw);
    if (v !== undefined) out.push(v);
  }
  return out;
}

/** The `strokeWidth={N}` of every `<polyline>` — the mark a ribbon stands in for. */
function polylineStrokeWidths(src: string): number[] {
  const out: number[] = [];
  for (const m of src.matchAll(/<polyline\b[\s\S]*?\/>/g)) {
    const w = /strokeWidth=\{(-?\d+(?:\.\d+)?)\}/.exec(m[0]);
    if (w) out.push(Number(w[1]));
  }
  return out;
}

/**
 * The two rules a RIBBON has to satisfy, as one function so the live and mutation arms run
 * identical code. Returns the reasons it fails; empty means it passes.
 */
function ribbonFailures(src: string, devicePxPerUnit: number): string[] {
  const bad: string[] = [];
  for (const hw of ribbonHalfWidths(src)) {
    const L = 2 * hw * devicePxPerUnit;
    if (L < FLOOR_DEVICE_PX) {
      bad.push(`L = 2 × ${hw} × ${devicePxPerUnit} = ${L} device px < ${FLOOR_DEVICE_PX}`);
    }
    for (const sw of polylineStrokeWidths(src)) {
      if (hw < sw) {
        bad.push(
          `halfWidth ${hw} < the SVG's strokeWidth ${sw}: integrated ribbon coverage IS ` +
            `halfWidth, so this ribbon carries ${((hw / sw) * 100).toFixed(1)} % of the ` +
            "polyline's ink — the GL layer would make the chart LIGHTER",
        );
      }
    }
  }
  return bad;
}

describe('gate A · nothing below the resolution floor is wired to the GL path', () => {
  it('every GL-wired chart has a declared lit-axis extent', () => {
    /*
     * THE COMPLETENESS CHECK, and it is the one that would have caught this first. GL-backing
     * a new primitive was free: nothing had to be filled in, so nothing had to be derived.
     */
    const wired = glWired();
    const missing = [...wired.keys()].filter((c) => !(c in REGISTRY));
    expect(
      missing,
      `GL-wired with no lit-axis extent declared in REGISTRY: ${missing.join(', ')}. ` +
        'Derive L for it against the floor above, or do not GL-back it.',
    ).toEqual([]);
    const stale = Object.keys(REGISTRY).filter((c) => !wired.has(c));
    expect(stale, `declared in REGISTRY but no longer GL-wired: ${stale.join(', ')}`).toEqual([]);
    for (const [chart, hook] of wired) expect(hook, chart).toBe(REGISTRY[chart]!.hook);
  });

  it.each(Object.entries(REGISTRY))('%s clears the 20 device px floor', (chart, e) => {
    const L = e.unitsL * e.devicePxPerUnit;
    expect(
      L,
      `${chart} lit axis (${e.litAxis}) is ${L} device px. Below ${FLOOR_DEVICE_PX} the lit ` +
        'edge smoothstep(0.10, 0.0, t) puts under two pixels of gradient on screen, and what ' +
        'is left of the GL layer is a feather the SVG rasteriser already supplies free.',
    ).toBeGreaterThanOrEqual(FLOOR_DEVICE_PX);
  });

  it('LIVE · no GL-wired chart hands the layer a sub-floor or ink-losing ribbon', () => {
    /*
     * Scans every GL-WIRED chart, not only the registered ones, so a chart cannot escape the
     * ribbon rules by being absent from the registry — it would then fail both checks.
     */
    const bad: string[] = [];
    for (const chart of glWired().keys()) {
      const px = REGISTRY[chart]?.devicePxPerUnit ?? DEFAULT_DEVICE_PX_PER_UNIT;
      for (const r of ribbonFailures(srcOf(`${chart}.tsx`), px)) bad.push(`${chart}: ${r}`);
    }
    expect(bad, `\n${bad.join('\n')}`).toEqual([]);
  });

  it('MUTATION · the checker fails on the Sparkline that actually shipped', () => {
    /*
     * Verbatim from Sparkline.tsx at 38c01b1: the halfWidth it passed and the polyline it
     * gated off. If the checker cannot see this, it could not have seen the defect.
     */
    const asShipped = `
      const out = [{ points: xy(0, last), colour: base, halfWidth: 1.15 }];
      if (good !== undefined) out.push({ points: xy(n - 2, n - 1), colour: tail, halfWidth: 1.15 });
      <polyline points={points} fill="none" stroke={stroke} strokeWidth={2}
        strokeLinejoin="round" strokeLinecap="round" />
    `;
    const bad = ribbonFailures(asShipped, 2).join(' | ');
    expect(bad).toContain('4.6 device px');
    expect(bad).toContain("57.5 % of the polyline's ink");
  });

  it('MUTATION · the checker fails on the ControlBand that actually shipped', () => {
    // Verbatim from ControlBand.tsx at 38c01b1, INCLUDING the `const HALF` indirection —
    // which is exactly the form a literal-only checker would have walked past.
    const asShipped = `
      const HALF = 1.3;
      out.push({ points: f, colour: mid, halfWidth: HALF });
      <polyline key={\`m-\${ri}\`} points={pts} fill="none" stroke={seriesVar(1)} strokeWidth={2}
        strokeLinejoin="round" strokeLinecap="round" />
    `;
    const bad = ribbonFailures(asShipped, 2).join(' | ');
    expect(bad).toContain('5.2 device px');
    expect(bad).toContain("65.0 % of the polyline's ink");
  });

  it('MUTATION · a ribbon that satisfies both rules is NOT flagged', () => {
    // The other direction. A checker that flags everything is as useless as one that flags
    // nothing, and this file would then be a permanent red light nobody reads.
    expect(ribbonFailures('halfWidth: 6 <polyline strokeWidth={2} />', 2)).toEqual([]);
  });
});

/**
 * GATE B · draw-call order, COUNTED rather than read.
 *
 * The rule is O(1) draw calls, or O(n) with n bounded by LEGIBILITY rather than by a
 * rendering detail. `DonutChart` issues one call per slice — O(n) — and passes, because a
 * donut past about eight slices is unreadable, so n is bounded by the reader. `ControlBand`
 * issued one call per DASH, and a dash period is not a property of the data.
 *
 * `SVG_GL_THRESHOLD.md` §7.4 listed its 55 as "estimated from the pattern, not read off a
 * live chart", and guessed that "a short series produces fewer". The count below is read off
 * a live render, and it refuted the guess: the figure was 55 at 2 points and 55 at 90.
 */
const captured = vi.hoisted(() => [] as { hook: string; count: number }[]);

/* Only `FlatLine` is mocked, because after the removal it is the only stroke hook any chart
   still calls. `importOriginal` is spread back so `LinePath`/`RingArc` consumers still
   resolve; only the hook is replaced. */
vi.mock('../gl/FlatLine', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useFlatLine: (p: { arcs?: unknown[] }) => {
    captured.push({ hook: 'useFlatLine', count: p.arcs?.length ?? 0 });
    return { canvas: null, refused: true };
  },
}));

describe('gate B · a GL-backed chart does not turn one series into a draw call per dash', () => {
  beforeEach(() => { captured.length = 0; });

  it('LIVE · no GL-wired chart builds its GL geometry from a dash splitter', () => {
    /*
     * A dash pattern is the only subdivision this kit has produced that is bounded by a
     * rendering detail instead of by the reader: `@lcx/gl` has no dash, so reproducing one
     * means one draw call per painted interval. This looks for the SPLITTER being called, not
     * for `strokeDasharray` — the SVG attribute is fine, and is precisely what a chart keeps
     * when it declines the GL path.
     */
    const offenders = [...glWired().keys()].filter((c) => /\bdash[A-Za-z]*\s*\(/.test(srcOf(`${c}.tsx`)));
    expect(
      offenders,
      `GL-wired and splitting a series on a dash period: ${offenders.join(', ')}. That is ` +
        'O(dashes), not O(series) — measured at 55 draw calls for a TWO-point series when ' +
        'this last shipped, 0.744-0.996 ms/frame against 0.024-0.035 for a bars chart.',
    ).toEqual([]);
  });

  it('LIVE · the GL-wired stroke chart issues one call per legibility-bounded slice', async () => {
    /*
     * The arm that is not a grep. `DonutChart` is the one chart still GL-backed through the
     * stroke batch, and its draw-call count must track SLICES — a quantity a reader bounds —
     * and nothing else.
     */
    const { DonutChart } = await import('../DonutChart');
    const slices = [
      { label: 'a', value: 4 }, { label: 'b', value: 3 },
      { label: 'c', value: 2 }, { label: 'd', value: 1 },
    ];
    render(createElement(DonutChart, { data: slices }));
    const total = Math.max(...captured.map((c) => c.count));
    expect(total, 'DonutChart draw calls no longer track its slice count').toBe(slices.length);
    expect(
      total,
      'more than 8 arcs is past the point a donut is readable, so n has stopped being ' +
        'bounded by the reader and gate B no longer holds for this chart',
    ).toBeLessThanOrEqual(8);
  });

  it('LIVE · ControlBand hands the GL layer nothing, because it is no longer GL-backed', async () => {
    /*
     * Rendered with 90 readable days and an `actual` overlay — the shape that produced 55
     * draw calls. Nothing may reach the GL layer now, and the `captured` array being non-empty
     * for DonutChart in the test above is what proves this zero is real and not a dead mock.
     */
    const { ControlBand } = await import('../ControlBand');
    const data = Array.from({ length: 90 }, (_, i) => ({
      x: `2026-05-${String((i % 28) + 1).padStart(2, '0')}`,
      lo: 100 + i, hi: 300 + i, mid: 200 + i, actual: 190 + i,
    }));
    const { container } = render(createElement(ControlBand, { data }));
    expect(captured, 'ControlBand is calling a GL hook again').toEqual([]);
    /* And the import edge is gone, not merely unused. A retained `./gl/` import is what keeps
       the adapter in this chart's chunk whether it draws or not — the GL adapters ride
       EAGERLY, so an unused import still costs bytes on every route that renders the chart. */
    expect(srcOf('ControlBand.tsx'), 'ControlBand still imports the GL layer')
      .not.toMatch(/from\s+'\.\/gl\//);
    // And the SVG it must fall back to is actually there, at full weight.
    const widths = [...container.querySelectorAll('polyline')].map((p) => p.getAttribute('stroke-width'));
    expect(widths.length, 'the centre line and the actual overlay both draw as SVG').toBe(2);
    expect(widths, 'a stroke width was thinned — the GL layer is gone and cannot compensate')
      .toEqual(['2', '2']);
  });

  it('LIVE · Sparkline hands the GL layer nothing either, and its polyline is back at 2', async () => {
    const { Sparkline } = await import('../Sparkline');
    const { container } = render(createElement(Sparkline, { data: [1, 3, 2, 5, 4] }));
    expect(captured, 'Sparkline is calling a GL hook again').toEqual([]);
    expect(srcOf('Sparkline.tsx'), 'Sparkline still imports the GL layer')
      .not.toMatch(/from\s+'\.\/gl\//);
    const line = container.querySelector('polyline');
    expect(line, 'the SVG polyline is not being rendered at all').not.toBeNull();
    expect(
      line!.getAttribute('stroke-width'),
      'the authored weight is 2. The GL ribbon that replaced it measured 56.8 % of this, so ' +
        'any value below 2 here means the regression survived the removal.',
    ).toBe('2');
  });
});
