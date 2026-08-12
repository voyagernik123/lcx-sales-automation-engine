import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StormRelief } from '@/components/risk/StormRelief';
import { buildRiskField, isRiskField, type RiskFieldInput } from '@/components/risk/riskField';

/*
 * §7's disposition for an environment whose clause (b) is not established: "it ships behind a toggle that
 * defaults off, and I tell you rather than quietly shipping it."
 *
 * These tests are about the DEFAULT, the FALLBACK and the three day states — not about the render. The
 * render is verified by `docs/3d/e7`'s captures against a real rasteriser; jsdom has no WebGL2 and
 * pretending otherwise would be a test that passes for the wrong reason.
 */
const LANES = ['PAID_SEARCH', 'INFLUENCER', 'COMMUNITY'] as const;
const BANDS = ['ADVISORY', 'ELEVATED', 'SEVERE'] as const;

/** 8 days: one unmeasured (day 4) and one withheld (day 6), so every reading state is exercised. */
function input(overrides: Partial<RiskFieldInput> = {}): RiskFieldInput {
  const days = Array.from({ length: 8 }, (_, d) => ({
    label: `D${d}`,
    state: d === 4 ? ('not_measured' as const) : d === 6 ? ('withheld' as const) : ('observed' as const),
  }));
  const cells = LANES.map((_l, l) => days.map((day, d) => (
    day.state === 'observed'
      ? BANDS.map((_b, b) => Number((0.05 + 0.1 * l + 0.08 * d + 0.06 * b).toFixed(3)))
      : BANDS.map(() => null)
  )));
  return {
    lanes: [...LANES], bands: [...BANDS], days, cells,
    reviewThreshold: 2.0,
    itemsLostToUnmeasuredDays: 3,
    frame: {
      source: 'stormRelief.test.tsx', observedAt: '2026-08-13T00:00:00.000Z',
      valuesArePlaceholders: true,
    },
    ...overrides,
  };
}

const props = {
  title: 'Marketing risk, next 8 days',
  readsAs: 'Colour is a day-channel total; the accumulation is what a per-cell table cannot show.',
  heightPx: 240,
};

describe('buildRiskField — absence refuses, and never renders as zero', () => {
  it('keeps the three day states apart and refuses the cumulative past a gap', () => {
    const f = buildRiskField(input());
    if (!isRiskField(f)) throw new Error(`expected a field, got ${f.code}`);
    expect(f.observedDays).toBe(6);
    expect(f.unmeasuredDays).toBe(1);
    expect(f.withheldDays).toBe(1);
    expect(f.days[3]!.reading).toBe('integrable');
    expect(f.days[4]!.reading).toBe('day_not_measured');
    expect(f.days[4]!.total, 'an unmeasured day has no total, and 0 is not one').toBeNull();
    /* THE LOAD-BEARING ASSERTION. Day 5 IS measured, and still carries no cumulative figure, because an
       unmeasured day lies between it and day 0. A running total that stepped over the hole would be the
       most convincing lie on the page. */
    expect(f.days[5]!.reading).toBe('integral_crosses_unmeasured_day');
    expect(f.days[5]!.cumulative).toBeNull();
    expect(f.days[5]!.total).not.toBeNull();
    expect(f.integrableToDay).toBe(3);
  });

  it('refuses a day declared observed that carries no value', () => {
    const bad = input();
    const cells = bad.cells.map((lane, l) => lane.map((day, d) => (
      l === 0 && d === 0 ? day.map(() => null) : day
    )));
    const f = buildRiskField({ ...bad, cells });
    expect(f.kind).toBe('refused');
    if (f.kind === 'refused') expect(f.code).toBe('OBSERVED_DAY_MISSING_VALUES');
  });

  it('refuses a day nobody measured that carries a number — including zero', () => {
    const bad = input();
    const cells = bad.cells.map((lane, l) => lane.map((day, d) => (
      l === 1 && d === 4 ? day.map(() => 0) : day
    )));
    const f = buildRiskField({ ...bad, cells });
    expect(f.kind).toBe('refused');
    if (f.kind === 'refused') expect(f.code).toBe('NON_OBSERVED_DAY_CARRIES_VALUES');
  });

  it('refuses a window in which nothing was measured, rather than drawing a quiet calendar', () => {
    const all = input();
    const days = all.days.map((d) => ({ ...d, state: 'not_measured' as const }));
    const cells = all.cells.map((lane) => lane.map((day) => day.map(() => null)));
    const f = buildRiskField({ ...all, days, cells });
    expect(f.kind).toBe('refused');
    if (f.kind === 'refused') expect(f.code).toBe('NO_OBSERVED_DAY');
  });
});

describe('StormRelief — §7 says an unproven environment defaults off and says so', () => {
  const field = buildRiskField(input());

  it('renders the FLAT calendar with no interaction, and no canvas', () => {
    const { container } = render(<StormRelief {...props} field={field} />);
    /* The flat figure is an SVG. A canvas appearing here would mean the volumetric had shipped as the
       default on a claim nobody has measured. */
    expect(container.querySelector('svg'), 'the calendar must be what loads').not.toBeNull();
    expect(container.querySelector('canvas'), 'the storm must NOT be the default').toBeNull();
  });

  it('tells the reader WHY the storm is opt-in, on the page', () => {
    render(<StormRelief {...props} field={field} />);
    expect(screen.getByText(/nobody has yet timed whether it answers faster/i)).toBeTruthy();
  });

  it('names the unmeasured days and the items that fell into them, above the figure', () => {
    /* A count of swallowed signal is the one thing the picture cannot carry, so the flat view must. */
    render(<StormRelief {...props} field={field} />);
    const note = screen.getByTestId('risk-calendar-unmeasured');
    expect(note.textContent).toMatch(/1 day\(s\) were NOT MEASURED/);
    expect(note.textContent).toMatch(/3 already-scheduled item\(s\)/);
  });

  it('declares placeholder values in the figure rather than in a comment', () => {
    render(<StormRelief {...props} field={field} />);
    expect(screen.getByTestId('risk-calendar-placeholders')).toBeTruthy();
  });

  it('offers the toggle, and reports its state to assistive technology', () => {
    render(<StormRelief {...props} field={field} />);
    const btn = screen.getByRole('button', { name: /storm view/i });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.hasAttribute('disabled')).toBe(false);
  });

  it('keeps the calendar while the lazy chunk is still loading', () => {
    /* The Suspense fallback IS the calendar rather than a spinner. A reader who clicked has not asked to
       lose the data for the length of a network round trip. */
    const { container } = render(<StormRelief {...props} field={field} />);
    fireEvent.click(screen.getByRole('button', { name: /storm view/i }));
    expect(container.querySelector('svg'), 'the calendar must survive the load').not.toBeNull();
  });

  it('does not offer the storm at all when the field itself refused', () => {
    const refused = buildRiskField({ ...input(), lanes: [], cells: [] });
    const { container } = render(<StormRelief {...props} field={refused} />);
    expect(container.querySelector('canvas')).toBeNull();
    expect(screen.getByTestId('risk-calendar-refused')).toBeTruthy();
    expect(screen.getByRole('button', { name: /storm view/i }).hasAttribute('disabled')).toBe(true);
  });

  it('does not import the GL layer until the reader asks', async () => {
    /*
     * THE BUDGET TEST. Initial JS is measured raw pre-gzip against 850 KB with single-digit KB of
     * headroom, and the environment layer alone is 35.7 KB — so an eager import would blow it on a view
     * most readers never open. Asserted structurally: the module graph reachable from this component must
     * not name the engine.
     */
    const fs = await import('node:fs');
    const path = await import('node:path');
    /* Resolved from the workspace root rather than `import.meta.url`: under jsdom that is not a file: URL.
       Existence is asserted FIRST so this test cannot pass by reading an empty string. */
    const wrapper = path.resolve(process.cwd(), 'src/components/risk/StormRelief.tsx');
    expect(fs.existsSync(wrapper), `cannot find ${wrapper} — this check would pass vacuously`).toBe(true);
    const src = fs.readFileSync(wrapper, 'utf8');
    expect(src.length).toBeGreaterThan(500);
    expect(src, 'the GL component must be behind lazy()').toMatch(/lazy\(\(\) => import\(/);
    expect(
      /^import[^;]*from '@lcx\/gl'/m.test(src),
      'StormRelief must not import @lcx/gl eagerly',
    ).toBe(false);
    /* The calibration module is imported eagerly BY DESIGN — it is what prints the claim's bounds beside
       the toggle — so it must not reach the engine either. */
    const calib = path.resolve(process.cwd(), 'src/components/risk/stormCalibration.ts');
    expect(fs.existsSync(calib)).toBe(true);
    /* An IMPORT, not a mention: the file's own header explains why it may not reach the engine, so a bare
       substring search would fail on the explanation. */
    expect(/\bfrom '@lcx\/gl'/.test(fs.readFileSync(calib, 'utf8'))).toBe(false);
  });

  it('renders one frame and never schedules another', async () => {
    /* §6 rule 2. Asserted structurally for the same reason the budget is: jsdom cannot run the frame, and
       a camera that drifts for ever is an idle animation with a budget. */
    const fs = await import('node:fs');
    const path = await import('node:path');
    const glFile = path.resolve(process.cwd(), 'src/components/risk/StormReliefGl.tsx');
    expect(fs.existsSync(glFile)).toBe(true);
    const src = fs.readFileSync(glFile, 'utf8');
    /* A CALL, not a mention — the file says in prose that it schedules nothing, and a bare substring
       search would be failed by that sentence. */
    expect(/(requestAnimationFrame|setInterval|setTimeout)\s*\(/.test(src)).toBe(false);
    /*
     * AND EVERY UPLOADED MESH IS REGISTERED FOR DISPOSAL. This file shipped with seven `uploadMesh` calls and
     * no disposer for any of them, which no test and no capture could see: `uploadMesh` creates a VAO and four
     * buffers and hands back the only thing that frees them, and `Stage` tracks programs and its own targets
     * and knows nothing about a mesh. Nothing errors, the frame is correct, and the context grows by
     * thirty-five objects every time a reader toggles back to the calendar — so the symptom finally arrives as
     * a lost context blaming the driver.
     */
    const calls = [...src.matchAll(/uploadMesh\(/g)];
    expect(calls.length, 'a file that uploads no mesh cannot pass this vacuously').toBeGreaterThan(0);
    for (const m of calls) {
      expect(
        /disposers\.push\(/.test(src.slice(m.index, m.index + 300)),
        'every uploadMesh must register its disposer in its own block, before the next upload is attempted',
      ).toBe(true);
    }
    /* Reverse, and the stage LAST — it owns the context, so releasing it first leaves every other delete*
       call operating on a dead one: silent rather than fatal, and it leaks on every remount. */
    expect(src).toMatch(/for \(const d of disposers\.reverse\(\)\) d\(\);\s*(\/\*[\s\S]*?\*\/\s*)?stage\.dispose\(\);/);
    /* And the two refusals that are easiest to forget and worst to omit. */
    expect(src).toMatch(/webglcontextlost/);
    expect(src).toMatch(/assertBrandFidelity/);
  });
});
