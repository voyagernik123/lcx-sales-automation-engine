import { describe, expect, it } from 'vitest';
import {
  runLaunchSim, prepareGraph, sampleTriangular, resolveDuration, mulberry32,
  type SimTaskInput,
} from './launchSim.js';

const T = (id: string, status: string, dependsOn: string[] = []): SimTaskInput => ({ id, status, dependsOn, title: id });

describe('launch Monte Carlo — graph preparation', () => {
  it('topologically orders a chain', () => {
    const g = prepareGraph([T('c', 'open', ['b']), T('a', 'open'), T('b', 'open', ['a'])]);
    expect(g.order.indexOf('a')).toBeLessThan(g.order.indexOf('b'));
    expect(g.order.indexOf('b')).toBeLessThan(g.order.indexOf('c'));
    expect(g.warnings).toEqual([]);
  });

  it('drops unknown and self dependencies with warnings', () => {
    const g = prepareGraph([T('a', 'open', ['ghost', 'a'])]);
    expect(g.order).toEqual(['a']);
    expect(g.warnings.some((w) => w.includes('ghost'))).toBe(true);
    expect(g.warnings.some((w) => w.includes('self-dependency'))).toBe(true);
  });

  it('survives a dependency cycle (breaks it, warns, still orders every task)', () => {
    const g = prepareGraph([T('a', 'open', ['b']), T('b', 'open', ['a']), T('c', 'open', ['a'])]);
    expect(g.order).toHaveLength(3);
    expect(g.warnings.some((w) => w.includes('cycle'))).toBe(true);
  });
});

describe('launch Monte Carlo — sampling', () => {
  it('is deterministic for a fixed seed', () => {
    const tasks = [T('a', 'open'), T('b', 'not_started', ['a'])];
    const r1 = runLaunchSim(tasks, { runs: 500, seed: 7 });
    const r2 = runLaunchSim(tasks, { runs: 500, seed: 7 });
    expect(r1.p50Days).toBe(r2.p50Days);
    expect(r1.p90Days).toBe(r2.p90Days);
  });

  it('done tasks contribute zero duration', () => {
    const r = runLaunchSim([T('a', 'done'), T('b', 'done', ['a'])], { runs: 200 });
    expect(r.p90Days).toBe(0);
  });

  it('a chain takes longer than its longest single task; parallel takes the max branch', () => {
    const chain = runLaunchSim([T('a', 'open'), T('b', 'open', ['a'])], { runs: 1000, seed: 1 });
    const parallel = runLaunchSim([T('a', 'open'), T('b', 'open')], { runs: 1000, seed: 1 });
    expect(chain.p50Days).toBeGreaterThan(parallel.p50Days);
  });

  it('triangular sampling stays within [min,max] and respects degenerate ranges', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 500; i++) {
      const v = sampleTriangular(rng, { min: 2, mode: 5, max: 9 });
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(9);
    }
    expect(sampleTriangular(rng, { min: 4, mode: 4, max: 4 })).toBe(4);
  });

  it('per-task overrides beat status defaults and are sanitized', () => {
    const d = resolveDuration(T('a', 'open'), { a: { min: -5, mode: 2, max: 1 } });
    expect(d.min).toBe(0);
    expect(d.mode).toBe(2);
    expect(d.max).toBe(2); // max clamped up to mode
  });

  it('criticality: the only chain is always critical', () => {
    const r = runLaunchSim([T('a', 'open'), T('b', 'open', ['a'])], { runs: 300, seed: 5 });
    const a = r.criticality.find((c) => c.id === 'a')!;
    const b = r.criticality.find((c) => c.id === 'b')!;
    expect(a.criticality).toBe(1);
    expect(b.criticality).toBe(1);
  });

  it('clamps runs into a sane band', () => {
    const r = runLaunchSim([T('a', 'open')], { runs: 5 });
    expect(r.runs).toBe(100);
  });
});

/**
 * The compression limb (P1e). `criticality` is a FREQUENCY — the fraction of
 * runs a task sat on the critical path. These tests pin the MAGNITUDE: how
 * many days of completion one day of compression actually buys, and how much
 * float each task carries. The two are not the same number and the tests below
 * construct the cases where they diverge.
 */
describe('launch Monte Carlo — slack magnitude and compression slope', () => {
  const row = (r: ReturnType<typeof runLaunchSim>, id: string) => r.compression.find((c) => c.id === id)!;

  it('a pure chain: every task buys a full day per day of compression, with zero SE', () => {
    const r = runLaunchSim([T('a', 'open'), T('b', 'open', ['a'])], { runs: 500, seed: 5 });
    for (const id of ['a', 'b']) {
      expect(row(r, id).daysBoughtPerDay).toBe(1);
      expect(row(r, id).slopeStdErr).toBe(0);
      expect(row(r, id).meanSlackDays).toBe(0);
      expect(row(r, id).slopeRuns).toBe(500);
    }
  });

  it('slack: the short branch of a diamond carries the gap in DAYS', () => {
    // Fixed durations make the float exact: long=10, short=4 ⇒ short has 6 days.
    const tasks = [T('a', 'open'), T('long', 'open', ['a']), T('short', 'open', ['a']), T('d', 'open', ['long', 'short'])];
    const r = runLaunchSim(tasks, {
      runs: 200,
      seed: 3,
      durations: { a: { min: 0, mode: 0, max: 0 }, long: { min: 10, mode: 10, max: 10 }, short: { min: 4, mode: 4, max: 4 }, d: { min: 0, mode: 0, max: 0 } },
    });
    expect(r.p50Days).toBe(10);
    expect(row(r, 'short').meanSlackDays).toBe(6);
    expect(row(r, 'long').meanSlackDays).toBe(0);
    expect(row(r, 'short').slackStdErr).toBe(0);
  });

  it('the binding edge is reported: d starts on the long branch in every run', () => {
    const tasks = [T('long', 'open'), T('short', 'open'), T('d', 'open', ['short', 'long'])];
    const r = runLaunchSim(tasks, {
      runs: 150,
      seed: 11,
      durations: { long: { min: 10, mode: 10, max: 10 }, short: { min: 1, mode: 1, max: 1 }, d: { min: 2, mode: 2, max: 2 } },
    });
    expect(row(r, 'd').bindingPredecessor).toBe('long');
    expect(row(r, 'd').bindingPredecessorRuns).toBe(150);
    expect(row(r, 'long').bindingPredecessor).toBeNull(); // starts at t=0
  });

  it('MAGNITUDE ≠ FREQUENCY: a task critical in most runs can buy far less than a day', () => {
    // `long` is triangular(2,7,21) against a fixed 10-day parallel branch, so
    // whenever it lands under 10 the parallel branch takes over and one day of
    // compression buys nothing at all.
    const tasks = [T('long', 'open'), T('fixed', 'open'), T('d', 'open', ['long', 'fixed'])];
    const r = runLaunchSim(tasks, {
      runs: 4000,
      seed: 9,
      durations: { long: { min: 2, mode: 7, max: 21 }, fixed: { min: 10, mode: 10, max: 10 }, d: { min: 0, mode: 0, max: 0 } },
    });
    const long = row(r, 'long');
    const crit = r.criticality.find((c) => c.id === 'long')!;
    expect(crit.criticality).toBeGreaterThan(0.3);
    expect(long.daysBoughtPerDay).toBeGreaterThan(0);
    expect(long.daysBoughtPerDay).toBeLessThan(crit.criticality); // the whole point
    expect(long.slopeStdErr).toBeGreaterThan(0);
  });

  it('a never-critical task returns a MEASURED 0, not null — "buys nothing" is an answer', () => {
    const tasks = [T('big', 'open'), T('tiny', 'open'), T('d', 'open', ['big', 'tiny'])];
    const r = runLaunchSim(tasks, {
      runs: 300,
      seed: 2,
      durations: { big: { min: 100, mode: 120, max: 200 }, tiny: { min: 1, mode: 1, max: 2 }, d: { min: 0, mode: 0, max: 0 } },
    });
    const tiny = row(r, 'tiny');
    expect(tiny.daysBoughtPerDay).toBe(0);
    expect(tiny.code).toBeNull();
    expect(tiny.meanSlackDays).toBeGreaterThan(0);
  });

  it('zero variance is read off the RESOLVED TRIPLE and refuses with ZERO_VARIANCE, never 0', () => {
    // 'open' is a variable status, but the override collapses the triple — the
    // refusal must follow the triple, not the status string.
    const r = runLaunchSim([T('a', 'open'), T('b', 'open', ['a'])], {
      runs: 200,
      seed: 4,
      durations: { a: { min: 8, mode: 8, max: 8 } },
    });
    const a = row(r, 'a');
    expect(a.code).toBe('ZERO_VARIANCE');
    expect(a.daysBoughtPerDay).toBeNull();
    expect(a.slopeStdErr).toBeNull();
    expect(a.daysBoughtPerDay).not.toBe(0);
    // Slack is still a well-defined graph property for a certain duration.
    expect(a.meanSlackDays).toBe(0);
    // …and 'b' is untouched by 'a' being certain.
    expect(row(r, 'b').daysBoughtPerDay).toBe(1);
  });

  it('a status-defaulted done task is ZERO_VARIANCE (status agrees here, the triple decides)', () => {
    const r = runLaunchSim([T('a', 'done'), T('b', 'open', ['a'])], { runs: 200, seed: 6 });
    expect(row(r, 'a').code).toBe('ZERO_VARIANCE');
    expect(row(r, 'a').daysBoughtPerDay).toBeNull();
  });

  it('the slope ranking is sorted by magnitude with refusals last', () => {
    const tasks = [T('big', 'open'), T('tiny', 'open'), T('certain', 'open'), T('d', 'open', ['big', 'tiny', 'certain'])];
    const r = runLaunchSim(tasks, {
      runs: 300,
      seed: 8,
      durations: { big: { min: 100, mode: 120, max: 200 }, tiny: { min: 1, mode: 1, max: 2 }, certain: { min: 3, mode: 3, max: 3 }, d: { min: 1, mode: 2, max: 3 } },
    });
    const ids = r.compression.map((c) => c.id);
    expect(ids.indexOf('big')).toBeLessThan(ids.indexOf('tiny'));
    expect(ids[ids.length - 1]).toBe('certain'); // the only refusal
  });

  it('SE never exceeds the slope magnitude — the guard must not fire on ANY row', () => {
    // Per-run days-bought is non-negative, so Σx² ≤ (Σx)² and therefore
    // SE ≤ mean always. The guard exists to catch a change in the estimator's
    // shape, not because the runs are expected to trip it.
    //
    // THE BARRIER IS OUTSIDE THE NULL FILTER, deliberately. A fired guard
    // produces a row whose slope IS null, so `if (slope === null) continue`
    // skips exactly the evidence — demonstrated: with a signed estimator the
    // guard fires, one row goes null, and the old loop checked 3 rows, skipped
    // the 4th and passed. The invariant is "no row carries this code".
    const tasks = [T('a', 'open'), T('b', 'in_progress', ['a']), T('c', 'blocked', ['a']), T('d', 'open', ['b', 'c'])];
    const r = runLaunchSim(tasks, { runs: 1000, seed: 13 });
    expect(r.compression.map((c) => c.code)).not.toContain('SE_EXCEEDS_MAGNITUDE');
    expect(r.compression.every((c) => c.code !== 'SE_EXCEEDS_MAGNITUDE')).toBe(true);
    // …and no row in this fixture is withheld for any other reason either, so
    // the sample the loop below walks is the whole list, not a survivor set.
    expect(r.compression.filter((c) => c.daysBoughtPerDay !== null)).toHaveLength(4);
    for (const c of r.compression) {
      if (c.daysBoughtPerDay === null) continue;
      expect(c.code).toBeNull();
      expect(c.slopeStdErr!).toBeLessThanOrEqual(c.daysBoughtPerDay);
    }
    expect(r.compressionStepDays).toBe(1);
  });

  it('the compression limb is reproducible for a fixed seed (determinism, NOT preservation)', () => {
    // WHAT THIS PROVES: two runs at one seed agree. That is determinism.
    // WHAT IT DOES NOT PROVE: that the reindexing left the pre-existing numbers
    // alone — it compares this build against itself. That claim was checked
    // OUT OF BAND against `git show HEAD:packages/shared/src/launchSim.ts` on a
    // 24-node parallel graph at seed 42 with 20k runs: p10/p50/p90/mean
    // 571/654/741/655 identical and the whole criticality array deep-equal.
    // A test cannot hold that evidence; do not read this one as if it did.
    const tasks = [T('a', 'open'), T('b', 'not_started', ['a']), T('c', 'open', ['a']), T('d', 'open', ['b', 'c'])];
    const r1 = runLaunchSim(tasks, { runs: 400, seed: 21 });
    const r2 = runLaunchSim(tasks, { runs: 400, seed: 21 });
    expect(r1.compression).toEqual(r2.compression);
    expect(r1.criticality).toEqual(r2.criticality);
    // The chain head is on every critical path and buys a full day.
    expect(row(r1, 'a').daysBoughtPerDay).toBe(1);
  });

  it('every task appears exactly once in the compression list', () => {
    const tasks = [T('a', 'open'), T('b', 'open', ['a']), T('c', 'done', ['b'])];
    const r = runLaunchSim(tasks, { runs: 100, seed: 1 });
    expect(r.compression.map((c) => c.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('a duplicated id is reported ONCE with a warning, not twice as two tasks', () => {
    // The graph is keyed by id, so the duplicate row was simulated once and
    // emitted twice in BOTH rankings — a reader saw two tasks where one exists,
    // and the refusal code documented for this case could never fire.
    const r = runLaunchSim([T('a', 'open'), T('a', 'open'), T('b', 'open', ['a'])], { runs: 200, seed: 1 });
    expect(r.compression.map((c) => c.id)).toHaveLength(2);
    expect(r.compression.filter((c) => c.id === 'a')).toHaveLength(1);
    expect(r.criticality.filter((c) => c.id === 'a')).toHaveLength(1);
    expect(r.assumptions.filter((a) => a.id === 'a')).toHaveLength(1);
    expect(r.warnings.some((w) => w.includes('duplicate row dropped'))).toBe(true);
  });

  it('a garbage duration override is IGNORED with a warning — never laundered into a certainty', () => {
    // `Number(NaN) || 0` used to resolve to the triple 0/0/0, which is
    // ZERO_VARIANCE: a claim that the task's duration is CERTAIN, and a 0-day
    // launch date. Unparseable input is absent data, so the status default
    // stands and the drop is named.
    const r = runLaunchSim([T('a', 'open')], { runs: 100, seed: 1, durations: { a: { min: NaN, mode: NaN, max: NaN } } });
    const a = r.assumptions.find((x) => x.id === 'a')!;
    expect(a).toEqual({ id: 'a', title: 'a', status: 'open', min: 3, mode: 10, max: 30 });
    expect(r.compression[0].code).toBeNull();
    expect(r.p50Days).toBeGreaterThan(0);
    expect(r.warnings.filter((w) => w.includes("override 'min'")).length).toBe(1);
    expect(r.warnings.length).toBe(3); // one per rejected component, none silent
  });

  it('a non-finite or astronomical override cannot produce a NaN slope or an Infinite float', () => {
    // Both of these used to escape every guard: max=Infinity gave
    // daysBoughtPerDay NaN with code null (a refusal with no code, and NaN
    // serialises to null over the wire), and min=1e308 gave meanSlackDays
    // Infinity, colliding with the documented meaning of null.
    for (const durations of [
      { a: { min: 0, mode: 1, max: Infinity } },
      { a: { min: 1e308, mode: 1e308, max: 1.7e308 } },
    ]) {
      const r = runLaunchSim([T('a', 'open'), T('b', 'open', ['a'])], { runs: 100, seed: 1, durations });
      for (const c of r.compression) {
        expect(Number.isFinite(c.meanSlackDays)).toBe(true);
        expect(Number.isFinite(c.slackStdErr)).toBe(true);
        // The three states stay apart: a number, or null WITH a code. Never
        // null with code null, which is what NaN produced.
        expect(c.daysBoughtPerDay === null).toBe(c.code !== null);
        if (c.daysBoughtPerDay !== null) expect(Number.isFinite(c.daysBoughtPerDay)).toBe(true);
      }
      expect(r.warnings.some((w) => w.includes('is not a finite number of days'))).toBe(true);
    }
  });

  it('an empty task list warns rather than implying the launch is today', () => {
    const r = runLaunchSim([], { runs: 100 });
    expect(r.p50Days).toBe(0);
    expect(r.warnings.some((w) => w.includes('NOT because the launch is today'))).toBe(true);
  });
});
