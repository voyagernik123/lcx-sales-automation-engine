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
 *
 * Two rankings come out, and they are NOT the same question:
 *   criticality — the FREQUENCY with which a task sat on the critical path.
 *   compression — the MAGNITUDE: days of completion bought per day of
 *                 compression, with a standard error, plus each task's float in
 *                 days and the dependency edge that binds it.
 * A task can be critical in every run and buy nothing, because a parallel
 * branch takes over the moment it is shortened. Ranking by frequency and
 * calling it "what drives the date" is the error this limb exists to correct.
 *
 * IMPORTANT: the seed only binds if the caller's task order is stable. Feeding
 * the same rows in a different order draws different samples per task and moves
 * the percentiles by days at an identical seed — every SQL source must ORDER BY.
 *
 * INPUT HYGIENE, all of it reported in `warnings` and never silent:
 *   - duplicate ids collapse to one row (the graph is keyed by id, so a repeated
 *     row was simulated once and REPORTED twice in both rankings);
 *   - a duration override that is not a finite number of days inside the
 *     planning domain is ignored in favour of the status default, never read as
 *     0 — which used to turn garbage into a task certain to take no time;
 *   - an empty task list warns instead of quietly reporting "the launch is
 *     today" as three 0-day percentiles.
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

/**
 * The planning domain for a single task duration, in days (100 years). An
 * override outside it is not a long task, it is bad data: values near
 * Number.MAX_VALUE make the graph arithmetic overflow to ±Infinity, which then
 * serialises to `null` over the wire and is indistinguishable from a refusal.
 * Out-of-domain and non-finite overrides are IGNORED with a warning, never
 * coerced to 0 — `Number(NaN) || 0` used to turn garbage into a task that is
 * CERTAIN to take no time at all.
 */
export const MAX_DURATION_DAYS = 36_500;

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

/**
 * Why the slope is null. Stable codes — the UI keys off these, never off the
 * absence of a number.
 *
 * REACHABILITY, stated because a refusal vocabulary that cannot fire teaches a
 * reader that the surface checks something it does not:
 *  - ZERO_VARIANCE       fires on any task whose resolved triple has max <= min
 *                        (every terminal status default, and any override that
 *                        collapses one). Live.
 *  - NO_COMPRESSIBLE_RUN needs EVERY run to sample a duration of exactly 0 from
 *                        a non-degenerate triple, i.e. min = 0 and rng() = 0
 *                        exactly. Effectively unreachable; kept so a zero-length
 *                        sample can never be averaged into a measured 0.
 *  - SE_EXCEEDS_MAGNITUDE unreachable FOR THIS ESTIMATOR and deliberately kept
 *                        as an invariant tripwire — see the algebra at the guard
 *                        site. The same rule is NOT vacuous in the forecast
 *                        limb, where it fires, and is applied there.
 * (A fourth code, NOT_IN_GRAPH_ORDER, was removed: it could not fire on any
 * input. Duplicate ids resolved to the same index and were emitted TWICE
 * instead; they are now de-duplicated with a warning.)
 */
export type CompressionRefusal = 'ZERO_VARIANCE' | 'SE_EXCEEDS_MAGNITUDE' | 'NO_COMPRESSIBLE_RUN';

/**
 * The MAGNITUDE limb. `criticality` above is a FREQUENCY — the share of runs a
 * task sat on the critical path. It says nothing about what compressing the
 * task would buy: two tasks can both be critical in every run while shortening
 * one moves the date a full day and the other not at all, because a parallel
 * branch takes over the moment it is shortened.
 */
export interface TaskCompression {
  id: string;
  title: string;
  status: string;
  /**
   * Mean total float in DAYS — how long this task can slip before the
   * completion date moves. 0 means it was binding in every run. Always a finite
   * number: every task in the input reaches the graph order (duplicates are
   * de-duplicated up front) and durations are screened to a finite planning
   * domain, so there is no path on which this is Infinity or NaN. It is NOT
   * nullable, precisely so a null can never arrive here without a code.
   */
  meanSlackDays: number;
  /** Standard error of meanSlackDays across the runs. */
  slackStdErr: number;
  /**
   * Days of completion bought per day of compression, in [0,1], averaged over
   * `slopeRuns`. A measured 0 means "compressing this buys nothing"; null means
   * "the question does not apply" and always carries a `code`. The two are
   * never collapsed.
   */
  daysBoughtPerDay: number | null;
  /** Standard error of daysBoughtPerDay. null whenever the slope is null. */
  slopeStdErr: number | null;
  /** Runs the slope was averaged over (a run with a zero sampled duration has nothing to compress). */
  slopeRuns: number;
  /** Set iff daysBoughtPerDay is null. */
  code: CompressionRefusal | null;
  /**
   * The predecessor that set this task's start in the most runs — the
   * dependency edge that actually binds it — and how many runs that was.
   * null means the task started at t=0 in every run (no binding edge).
   */
  bindingPredecessor: string | null;
  bindingPredecessorRuns: number;
}

/**
 * The finite step the slope is measured at. It is a ONE-DAY compression, not a
 * derivative: the infinitesimal derivative of the makespan is 1 exactly when
 * slack is 0, so its mean would be P(slack=0) — the same frequency
 * `criticality` already reports. The one-day step is what diverges from it.
 */
const COMPRESSION_STEP_DAYS = 1;

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
  /** Tasks ranked by days-of-completion bought per day of compression (MAGNITUDE). */
  compression: TaskCompression[];
  /** The compression step the slope was measured at, in days. */
  compressionStepDays: number;
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

/** True iff an override component is usable as a duration in days. */
function usableOverride(v: number | undefined): boolean {
  if (v === undefined || v === null) return false;
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= MAX_DURATION_DAYS;
}

/**
 * Resolve the duration triple for a task (override → status default →
 * fallback), clamped sane.
 *
 * An override component that is not a finite number inside the planning domain
 * is IGNORED and the status default is used — it is never read as 0. The old
 * `Number(o?.min ?? base.min) || 0` turned an unparseable override into a
 * 0/0/0 triple, i.e. laundered garbage into ZERO_VARIANCE: a claim that the
 * task's duration is CERTAIN. `runLaunchSim` reports each ignored override in
 * `warnings`, and `assumptions` always shows the triple actually used.
 */
export function resolveDuration(t: SimTaskInput, overrides?: Record<string, Partial<DurationTriple>>): DurationTriple {
  const base = DEFAULT_DURATIONS[t.status] ?? FALLBACK_DURATION;
  const o = overrides?.[t.id];
  const pick = (v: number | undefined, fallback: number) => Math.max(0, usableOverride(v) ? Number(v) : fallback);
  const min = pick(o?.min, base.min);
  let mode = Math.max(min, pick(o?.mode, base.mode));
  let max = Math.max(mode, pick(o?.max, base.max));
  if (max < min) max = min;
  if (mode < min) mode = min;
  return { min, mode, max };
}

/** One warning per ignored override component, so a dropped input is never silent. */
function overrideWarnings(tasks: SimTaskInput[], overrides?: Record<string, Partial<DurationTriple>>): string[] {
  if (!overrides) return [];
  const out: string[] = [];
  for (const t of tasks) {
    const o = overrides[t.id];
    if (!o) continue;
    for (const k of ['min', 'mode', 'max'] as const) {
      const v = o[k];
      if (v === undefined || v === null || usableOverride(v)) continue;
      out.push(
        `Task ${t.id}: duration override '${k}' (${String(v)}) is not a finite number of days within ${MAX_DURATION_DAYS} — ignored, '${t.status}' default used`,
      );
    }
  }
  return out;
}

/**
 * Collapse duplicate ids to one row each, first occurrence winning, and say so.
 * The graph order is keyed by id, so a duplicated row used to be SIMULATED once
 * and REPORTED twice in both rankings.
 */
function dedupeTasks(tasks: SimTaskInput[]): { unique: SimTaskInput[]; warnings: string[] } {
  const seen = new Set<string>();
  const unique: SimTaskInput[] = [];
  const warnings: string[] = [];
  for (const t of tasks) {
    if (seen.has(t.id)) {
      warnings.push(`Task ${t.id}: duplicate row dropped — one row per id, the first is used`);
      continue;
    }
    seen.add(t.id);
    unique.push(t);
  }
  return { unique, warnings };
}

export function runLaunchSim(inputTasks: SimTaskInput[], opts: LaunchSimOptions = {}): LaunchSimResult {
  const runs = Math.min(Math.max(Math.round(opts.runs ?? 2000), 100), 20000);
  const seed = (opts.seed ?? 42) >>> 0;
  // One row per id BEFORE anything else: the graph is keyed by id, so a
  // duplicated row was simulated once and reported twice.
  const { unique: tasks, warnings: dupWarnings } = dedupeTasks(inputTasks);
  const { order, deps, warnings: graphWarnings } = prepareGraph(tasks);
  const warnings = [...graphWarnings, ...dupWarnings, ...overrideWarnings(tasks, opts.durations)];
  if (tasks.length === 0) {
    // An empty task list is not "the launch is today". The day offsets below are
    // 0 because there is nothing to schedule; the caller must not read that as a
    // date. Callers that own a surface guard this before rendering.
    warnings.push('No tasks supplied — the day offsets are 0 because there is nothing to schedule, NOT because the launch is today');
  }
  const durTable = new Map(tasks.map((t) => [t.id, resolveDuration(t, opts.durations)]));

  // Index the graph once. The reverse (slack) pass and the per-task recompute
  // below both walk it on every run; string-keyed Maps in that inner loop are
  // the wrong shape for 20k × N × N node visits.
  const N = order.length;
  const idx = new Map<string, number>(order.map((id, i) => [id, i]));
  // A dep that never made it into `order` is dropped, which matches the old
  // `finish.get(dep) ?? 0` — an unordered predecessor contributed nothing.
  const depIdx: number[][] = order.map((id) => (deps.get(id) ?? []).map((d) => idx.get(d) ?? -1).filter((i) => i >= 0));
  const dependentIdx: number[][] = order.map(() => []);
  for (let i = 0; i < N; i++) for (const p of depIdx[i]) dependentIdx[p].push(i);
  const durByIdx = order.map((id) => durTable.get(id)!);
  // Zero variance is read off the RESOLVED TRIPLE — `max <= min` is exactly
  // sampleTriangular's own early return — not off the status string. The four
  // terminal status keys are a table with no data behind them: only 'done' can
  // ever be populated, and an override can collapse any status to a certainty.
  const zeroVariance = durByIdx.map((d) => d.max <= d.min);

  const rng = mulberry32(seed);
  const makespans: number[] = new Array(runs);
  const critCount = new Map<string, number>(tasks.map((t) => [t.id, 0]));
  const durSum = new Map<string, number>(tasks.map((t) => [t.id, 0]));

  // Per-run graph state, allocated once and overwritten each run.
  const dur = new Float64Array(N);
  const ef = new Float64Array(N);       // earliest finish
  const prefixMax = new Float64Array(N); // max ef over [0, i) — for the suffix recompute
  const lf = new Float64Array(N);        // latest finish without moving the date
  const critPred = new Int32Array(N);
  const ef2 = new Float64Array(N);       // scratch for the compressed recompute
  // Accumulators (sum + sum of squares, so the SE needs no second pass).
  const slackSum = new Float64Array(N);
  const slackSqSum = new Float64Array(N);
  const slopeSum = new Float64Array(N);
  const slopeSqSum = new Float64Array(N);
  const slopeRuns = new Int32Array(N);
  const bindCount: Array<Map<number, number>> = order.map(() => new Map());

  for (let r = 0; r < runs; r++) {
    let sinkMax = 0;
    let sinkIdx = -1;
    for (let i = 0; i < N; i++) {
      // One rng draw per task in topological order — unchanged, so a given
      // seed still produces the same schedule it did before this limb existed.
      const d = sampleTriangular(rng, durByIdx[i]);
      dur[i] = d;
      const id = order[i];
      durSum.set(id, (durSum.get(id) ?? 0) + d);
      let start = 0;
      let pred = -1;
      for (const p of depIdx[i]) { const f = ef[p]; if (f > start) { start = f; pred = p; } }
      prefixMax[i] = sinkMax; // max finish over the strict prefix, before i lands
      const f = start + d;
      ef[i] = f;
      critPred[i] = pred;
      if (pred >= 0) bindCount[i].set(pred, (bindCount[i].get(pred) ?? 0) + 1);
      if (f > sinkMax) { sinkMax = f; sinkIdx = i; }
    }
    makespans[r] = sinkMax;
    // Walk the critical chain back from the sink. NOTE: this enumerates ONE
    // chain from ONE argmax-finish sink, so `criticality` under-counts tasks on
    // equally-long parallel chains. Left as-is deliberately — the compression
    // slope below is the measure that does not depend on this walk.
    let cur = sinkIdx;
    let hops = 0;
    while (cur >= 0 && hops < tasks.length + 1) {
      const id = order[cur];
      critCount.set(id, (critCount.get(id) ?? 0) + 1);
      cur = critPred[cur];
      hops++;
    }

    // ── Reverse pass: total float per task (classic CPM), in days. A task with
    // no dependents may finish as late as the makespan; otherwise it must
    // finish before the earliest latest-start among its dependents.
    for (let i = N - 1; i >= 0; i--) {
      let latest = sinkMax;
      for (const j of dependentIdx[i]) { const ls = lf[j] - dur[j]; if (ls < latest) latest = ls; }
      lf[i] = latest;
      const s = latest - ef[i] > 0 ? latest - ef[i] : 0; // clamp float dust, never negative
      slackSum[i] += s;
      slackSqSum[i] += s * s;
    }

    // ── One-day compression: the MAGNITUDE. Recompute the makespan with this
    // task shortened. Tasks earlier in topological order cannot depend on it,
    // so only the suffix needs redoing and their finishes are read from `ef`.
    for (let i = 0; i < N; i++) {
      if (zeroVariance[i]) continue; // undefined slope — reported as a refusal
      const applied = dur[i] - (dur[i] > COMPRESSION_STEP_DAYS ? dur[i] - COMPRESSION_STEP_DAYS : 0);
      if (applied <= 0) continue; // a zero-length sample has nothing to compress
      for (let k = i; k < N; k++) {
        const d = k === i ? dur[k] - applied : dur[k];
        let st = 0;
        for (const p of depIdx[k]) { const f = p < i ? ef[p] : ef2[p]; if (f > st) st = f; }
        ef2[k] = st + d;
      }
      let m2 = prefixMax[i];
      for (let k = i; k < N; k++) if (ef2[k] > m2) m2 = ef2[k];
      const bought = sinkMax - m2;
      // Normalise by the compression actually applied so a sub-day duration is
      // not scored as if a full day had been removed.
      const ratio = (bought > 0 ? Math.min(bought, applied) : 0) / applied;
      slopeSum[i] += ratio;
      slopeSqSum[i] += ratio * ratio;
      slopeRuns[i]++;
    }
  }

  /** Standard error of the mean from the running sums (sample variance, n−1). */
  const stdErr = (sum: number, sqSum: number, n: number): number => {
    if (n < 2) return 0;
    const m = sum / n;
    const v = (sqSum - n * m * m) / (n - 1);
    return Math.sqrt((v > 0 ? v : 0) / n);
  };
  const r3 = (v: number) => Math.round(v * 1000) / 1000;

  const compression: TaskCompression[] = tasks
    .map((t): TaskCompression => {
      const base = { id: t.id, title: t.title ?? t.id, status: t.status };
      // Every task reaches the order: ids are de-duplicated above and the Kahn
      // loop only stops once `remaining` is empty, so this is total by
      // construction. The old NOT_IN_GRAPH_ORDER branch here was dead code
      // documented as reachable on duplicate ids, which it was not.
      const i = idx.get(t.id)!;
      let bindingPredecessor: string | null = null;
      let bindingPredecessorRuns = 0;
      for (const [p, n] of bindCount[i]) if (n > bindingPredecessorRuns) { bindingPredecessorRuns = n; bindingPredecessor = order[p]; }

      const n = slopeRuns[i];
      const slopeMean = n > 0 ? slopeSum[i] / n : 0;
      const slopeSe = stdErr(slopeSum[i], slopeSqSum[i], n);
      let code: CompressionRefusal | null = null;
      if (zeroVariance[i]) code = 'ZERO_VARIANCE';
      else if (n === 0) code = 'NO_COMPRESSIBLE_RUN';
      // A slope the runs do not support must be withheld, not ranked at a
      // number. NOTE: for this estimator the guard is unreachable — per-run
      // days-bought is non-negative, so Σx² ≤ (Σx)² and hence SE ≤ mean for
      // every possible sample, with equality only when a single run is nonzero.
      // It is kept as a live invariant: if it ever fires the estimator has
      // changed shape (e.g. gone signed) and the ranking is no longer sound.
      else if (slopeSe > slopeMean) code = 'SE_EXCEEDS_MAGNITUDE';

      return {
        ...base,
        meanSlackDays: Math.round((slackSum[i] / runs) * 10) / 10,
        slackStdErr: r3(stdErr(slackSum[i], slackSqSum[i], runs)),
        daysBoughtPerDay: code === null ? r3(slopeMean) : null,
        slopeStdErr: code === null ? r3(slopeSe) : null,
        slopeRuns: n,
        code,
        bindingPredecessor,
        bindingPredecessorRuns,
      };
    });

  // Magnitude first, ties on the tighter float; withheld rows APPENDED in input
  // order. They are not mapped onto a sentinel: `?? -1` only happened to sort
  // correctly here because this slope is bounded in [0,1], and the identical
  // pattern in the forecast limb (where the value range includes −1) really did
  // rank refusals above measured rows.
  const rankedCompression = compression
    .filter((c) => c.daysBoughtPerDay !== null)
    .sort((a, b) => (b.daysBoughtPerDay! - a.daysBoughtPerDay!) || (a.meanSlackDays - b.meanSlackDays));
  const withheldCompression = compression.filter((c) => c.daysBoughtPerDay === null);

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
    compression: [...rankedCompression, ...withheldCompression],
    compressionStepDays: COMPRESSION_STEP_DAYS,
    warnings,
    assumptions: tasks.map((t) => {
      const d = durTable.get(t.id)!;
      return { id: t.id, title: t.title ?? t.id, status: t.status, min: d.min, mode: d.mode, max: d.max };
    }),
  };
}
