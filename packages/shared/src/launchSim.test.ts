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
