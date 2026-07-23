/**
 * Launch-schedule Monte Carlo (LCX COMMAND Wave 2).
 *
 * Simulates the US-launch completion date from the program task DEPENDENCY
 * GRAPH. The strategy contains no confirmed task durations (see DATA_GAPS), so
 * durations are PLANNING ASSUMPTIONS: a triangular (min/mode/max, in days)
 * distribution per task, defaulted by status and overridable per task. Every
 * output is labeled a planning simulation — never a confirmed schedule.
 *
 * Pure module: seeded RNG (mulberry32), no Date/now access — results are day
 * offsets from "today"; the API layer converts to calendar dates. Cycle-safe:
 * back-edges are dropped with a warning rather than hanging the sort.
 */

export interface SimTaskInput {
  id: string;
  title?: string;
  status: string;
  dependsOn: string[];
}

export interface DurationTriple {
  min: number;
  mode: number;
  max: number;
}

/** Default duration assumptions (days) by task status — PLANNING ASSUMPTIONS. */
export const DEFAULT_DURATIONS: Record<string, DurationTriple> = {
  done: { min: 0, mode: 0, max: 0 },
  complete: { min: 0, mode: 0, max: 0 },
  completed: { min: 0, mode: 0, max: 0 },
  live: { min: 0, mode: 0, max: 0 },
  in_progress: { min: 2, mode: 7, max: 21 },
  open: { min: 3, mode: 10, max: 30 },
  pending: { min: 3, mode: 10, max: 30 },
  tentative: { min: 3, mode: 10, max: 30 },
  not_started: { min: 5, mode: 14, max: 45 },
  blocked: { min: 10, mode: 30, max: 90 },
  future: { min: 30, mode: 90, max: 180 },
};
const FALLBACK_DURATION: DurationTriple = { min: 5, mode: 14, max: 45 };

export interface LaunchSimOptions {
  runs?: number;
  seed?: number;
  /** Per-task overrides (merge over the status default). */
  durations?: Record<string, Partial<DurationTriple>>;
}

export interface TaskCriticality {
  id: string;
  title: string;
  status: string;
  /** Fraction of runs (0–1) in which this task sat on the critical path. */
  criticality: number;
  /** Mean sampled duration (days) under the assumptions. */
  meanDuration: number;
}

export interface LaunchSimResult {
  runs: number;
  seed: number;
  /** Day offsets from today for the full-graph completion. */
  p10Days: number;
  p50Days: number;
  p90Days: number;
  meanDays: number;
  /** Tasks ranked by how often they were on the critical path. */
  criticality: TaskCriticality[];
  /** Graph problems found (cycles broken, unknown dependencies dropped). */
  warnings: string[];
  /** The duration table actually used, for full transparency in the UI. */
  assumptions: Array<{ id: string; title: string; status: string; min: number; mode: number; max: number }>;
}

/** Deterministic 32-bit RNG (same family the forecaster uses). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sample a triangular(min, mode, max) distribution. */
export function sampleTriangular(rng: () => number, d: DurationTriple): number {
  const { min, mode, max } = d;
  if (max <= min) return min;
  const u = rng();
  const fc = (mode - min) / (max - min);
  if (u < fc) return min + Math.sqrt(u * (max - min) * (mode - min));
  return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

interface PreparedGraph {
  order: string[]; // topological order
  deps: Map<string, string[]>; // sanitized dependency lists
  warnings: string[];
}

/**
 * Kahn topological sort with explicit cycle handling: when no zero-in-degree
 * node remains but tasks do, the remaining tasks form (or depend on) a cycle —
 * we break it by dropping their unmet edges and continuing, with a warning.
 */
export function prepareGraph(tasks: SimTaskInput[]): PreparedGraph {
  const warnings: string[] = [];
  const ids = new Set(tasks.map((t) => t.id));
  const deps = new Map<string, string[]>();
  for (const t of tasks) {
    const clean = (t.dependsOn ?? []).filter((d) => {
      if (!ids.has(d)) { warnings.push(`Task ${t.id}: unknown dependency '${d}' dropped`); return false; }
      if (d === t.id) { warnings.push(`Task ${t.id}: self-dependency dropped`); return false; }
      return true;
    });
    deps.set(t.id, clean);
  }

  const indeg = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const t of tasks) indeg.set(t.id, 0);
  for (const [id, ds] of deps) {
    indeg.set(id, ds.length);
    for (const d of ds) {
      const arr = dependents.get(d) ?? [];
      arr.push(id);
      dependents.set(d, arr);
    }
  }

  const order: string[] = [];
  const queue = tasks.filter((t) => (indeg.get(t.id) ?? 0) === 0).map((t) => t.id);
  const remaining = new Set(ids);
  while (order.length < tasks.length) {
    if (queue.length === 0) {
      // Cycle: force-release the remaining task with the fewest unmet deps.
      const stuck = [...remaining].sort((a, b) => (indeg.get(a)! - indeg.get(b)!))[0];
      if (stuck === undefined) break;
      warnings.push(`Dependency cycle detected involving '${stuck}' — cycle edges ignored`);
      deps.set(stuck, (deps.get(stuck) ?? []).filter((d) => !remaining.has(d)));
      queue.push(stuck);
      indeg.set(stuck, 0);
    }
    const id = queue.shift()!;
    if (!remaining.has(id)) continue;
    remaining.delete(id);
    order.push(id);
    for (const dep of dependents.get(id) ?? []) {
      indeg.set(dep, (indeg.get(dep) ?? 1) - 1);
      if ((indeg.get(dep) ?? 0) === 0 && remaining.has(dep)) queue.push(dep);
    }
  }
  return { order, deps, warnings };
}

/** Resolve the duration triple for a task (override → status default → fallback), clamped sane. */
export function resolveDuration(t: SimTaskInput, overrides?: Record<string, Partial<DurationTriple>>): DurationTriple {
  const base = DEFAULT_DURATIONS[t.status] ?? FALLBACK_DURATION;
  const o = overrides?.[t.id];
  const min = Math.max(0, Number(o?.min ?? base.min) || 0);
  let mode = Math.max(min, Number(o?.mode ?? base.mode) || 0);
  let max = Math.max(mode, Number(o?.max ?? base.max) || 0);
  if (max < min) max = min;
  if (mode < min) mode = min;
  return { min, mode, max };
}

export function runLaunchSim(tasks: SimTaskInput[], opts: LaunchSimOptions = {}): LaunchSimResult {
  const runs = Math.min(Math.max(Math.round(opts.runs ?? 2000), 100), 20000);
  const seed = (opts.seed ?? 42) >>> 0;
  const { order, deps, warnings } = prepareGraph(tasks);
  const durTable = new Map(tasks.map((t) => [t.id, resolveDuration(t, opts.durations)]));

  const rng = mulberry32(seed);
  const makespans: number[] = new Array(runs);
  const critCount = new Map<string, number>(tasks.map((t) => [t.id, 0]));
  const durSum = new Map<string, number>(tasks.map((t) => [t.id, 0]));

  for (let r = 0; r < runs; r++) {
    const finish = new Map<string, number>();
    const critPred = new Map<string, string | null>();
    let sinkMax = 0;
    let sinkId: string | null = null;
    for (const id of order) {
      const d = sampleTriangular(rng, durTable.get(id)!);
      durSum.set(id, (durSum.get(id) ?? 0) + d);
      let start = 0;
      let pred: string | null = null;
      for (const dep of deps.get(id) ?? []) {
        const f = finish.get(dep) ?? 0;
        if (f > start) { start = f; pred = dep; }
      }
      const f = start + d;
      finish.set(id, f);
      critPred.set(id, pred);
      if (f > sinkMax) { sinkMax = f; sinkId = id; }
    }
    makespans[r] = sinkMax;
    // Walk the critical chain back from the sink.
    let cur: string | null = sinkId;
    let hops = 0;
    while (cur && hops < tasks.length + 1) {
      critCount.set(cur, (critCount.get(cur) ?? 0) + 1);
      cur = critPred.get(cur) ?? null;
      hops++;
    }
  }

  makespans.sort((a, b) => a - b);
  const pct = (p: number) => makespans[Math.min(makespans.length - 1, Math.max(0, Math.ceil((p / 100) * makespans.length) - 1))] ?? 0;
  const mean = makespans.reduce((s, v) => s + v, 0) / (makespans.length || 1);

  const criticality: TaskCriticality[] = tasks
    .map((t) => ({
      id: t.id,
      title: t.title ?? t.id,
      status: t.status,
      criticality: Math.round(((critCount.get(t.id) ?? 0) / runs) * 1000) / 1000,
      meanDuration: Math.round(((durSum.get(t.id) ?? 0) / runs) * 10) / 10,
    }))
    .sort((a, b) => b.criticality - a.criticality);

  return {
    runs,
    seed,
    p10Days: Math.round(pct(10)),
    p50Days: Math.round(pct(50)),
    p90Days: Math.round(pct(90)),
    meanDays: Math.round(mean),
    criticality,
    warnings,
    assumptions: tasks.map((t) => {
      const d = durTable.get(t.id)!;
      return { id: t.id, title: t.title ?? t.id, status: t.status, min: d.min, mode: d.mode, max: d.max };
    }),
  };
}
