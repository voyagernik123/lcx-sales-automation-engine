/**
 * Ops health — the observability surface for the intelligence apparatus.
 *
 * Answers the four governance questions a desk lead asks about an autonomous
 * collection system: Are the jobs running? Is the data fresh enough to trust?
 * Where are the blind spots? And are we within the terms of every source we
 * pull from? All of it is derived from what the system already records
 * (job_runs + collection_state) plus the static connector/source registries —
 * no new writes, no new dependencies.
 */
import { getDb } from '../db/index.js';
import { sql } from 'drizzle-orm';
import { CONNECTORS, getSource } from '@lcx/shared';

export interface JobHealth {
  jobName: string;
  status: string; // running | ok | failed
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  error: string | null;
  stats: Record<string, unknown>;
  /** Success rate across the job's runs in the trailing window. */
  successRate: number | null;
  runsWindow: number;
}

export interface SourceFreshness {
  source: string;
  label: string;
  slaDays: number;
  yields: string;
  tracked: number;
  fresh: number;
  stale: number;
  errored: number;
  neverCollected: number;
  oldestOkAt: string | null;
  lastActivityAt: string | null;
  /** ok · degraded · stale · down — the rolled-up verdict for the source. */
  health: 'ok' | 'degraded' | 'stale' | 'down' | 'idle';
}

export interface GapEntry {
  source: string;
  subjectType: string;
  subjectId: string;
  subjectLabel: string | null;
  status: string;
  lastError: string | null;
  lastAttemptAt: string | null;
}

export interface SourceCompliance {
  source: string;
  label: string;
  homepage: string | null;
  tier: 'free' | 'free-rate-limited' | 'paid';
  auth: string;
  rateLimit: string;
  attribution: string;
  termsUrl: string | null;
  note: string | null;
}

export interface OpsHealth {
  generatedAt: string;
  summary: {
    jobsTracked: number;
    jobsFailing: number;
    lastCollectionAt: string | null;
    sourcesWithinSla: number;
    sourcesTotal: number;
    openGaps: number;
  };
  jobs: JobHealth[];
  freshness: SourceFreshness[];
  gaps: GapEntry[];
  compliance: SourceCompliance[];
}

/**
 * Source-compliance ledger — the terms we operate under for each free-data
 * connector. Grounded in what we verified while wiring the sensors (Wave 1):
 * DefiLlama's core endpoints are free and keyless, but /emissions is paid (402),
 * so that unlock stays deferred rather than silently broken.
 */
const COMPLIANCE: Record<string, Omit<SourceCompliance, 'source' | 'label' | 'homepage'>> = {
  defillama: {
    tier: 'free',
    auth: 'None (keyless)',
    rateLimit: 'Fair-use, unmetered on /protocols',
    attribution: 'Attribution appreciated, not required',
    termsUrl: 'https://defillama.com/docs/api',
    note: '/emissions (unlock schedules) is a PAID endpoint (402) — that signal is deferred, not collected.',
  },
  coinpaprika: {
    tier: 'free-rate-limited',
    auth: 'None on free tier',
    rateLimit: '~25k calls/mo, ~10 req/s free tier',
    attribution: 'Attribution required on free tier',
    termsUrl: 'https://api.coinpaprika.com',
    note: 'Detail pulls are throttled to respect the free-tier ceiling.',
  },
  github: {
    tier: 'free-rate-limited',
    auth: 'Optional GITHUB_TOKEN (personal access token)',
    rateLimit: '60 req/hr unauthenticated · 5,000 req/hr with a token',
    attribution: 'Not required',
    termsUrl: 'https://docs.github.com/en/rest',
    note: 'Set GITHUB_TOKEN to lift the 60/hr ceiling for repo-velocity scans.',
  },
};

const WINDOW_DAYS = 7;

/** Roll a per-source freshness picture up to a single verdict. */
function verdictFor(f: Omit<SourceFreshness, 'health' | 'label' | 'yields'>): SourceFreshness['health'] {
  if (f.tracked === 0) return 'idle';
  if (f.fresh === 0 && (f.errored > 0 || f.stale > 0)) return 'down';
  const bad = f.stale + f.errored;
  if (bad === 0) return 'ok';
  if (bad > f.tracked / 2) return 'stale';
  return 'degraded';
}

export async function buildOpsHealth(): Promise<OpsHealth> {
  const db = getDb();

  // 1) Jobs — latest run per job_name + a trailing-window success rate.
  const latestRes = await db.execute(sql`
    SELECT DISTINCT ON (job_name)
      job_name, status, started_at, finished_at, error, stats
    FROM job_runs
    ORDER BY job_name, started_at DESC
  `);
  const rateRes = await db.execute(sql`
    SELECT job_name,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'ok') AS ok
    FROM job_runs
    WHERE started_at >= now() - make_interval(days => ${WINDOW_DAYS})
    GROUP BY job_name
  `);
  const rateBy = new Map<string, { total: number; ok: number }>();
  for (const r of (rateRes.rows ?? []) as Record<string, unknown>[]) {
    rateBy.set(r.job_name as string, { total: Number(r.total), ok: Number(r.ok) });
  }
  const jobs: JobHealth[] = ((latestRes.rows ?? []) as Record<string, unknown>[]).map((r) => {
    const startedAt = (r.started_at as string | null) ?? null;
    const finishedAt = (r.finished_at as string | null) ?? null;
    const rate = rateBy.get(r.job_name as string);
    return {
      jobName: r.job_name as string,
      status: r.status as string,
      startedAt,
      finishedAt,
      durationMs:
        startedAt && finishedAt ? new Date(finishedAt).getTime() - new Date(startedAt).getTime() : null,
      error: (r.error as string | null) ?? null,
      stats: (r.stats as Record<string, unknown>) ?? {},
      successRate: rate && rate.total > 0 ? Math.round((rate.ok / rate.total) * 100) : null,
      runsWindow: rate?.total ?? 0,
    };
  });
  jobs.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));

  // 2) Freshness per connector — one parameterized aggregate per source so the
  //    SLA interval is applied correctly (avoids the drizzle ANY() array trap).
  //    NB: collection_state.source stores the connector *id* (e.g.
  //    'coinpaprika_detail'), not the provider source, so we key on c.id.
  const freshness: SourceFreshness[] = await Promise.all(
    CONNECTORS.map(async (c) => {
      const res = await db.execute(sql`
        SELECT
          COUNT(*) AS tracked,
          COUNT(*) FILTER (WHERE last_ok_at IS NOT NULL AND last_ok_at >= now() - make_interval(days => ${c.freshnessDays})) AS fresh,
          COUNT(*) FILTER (WHERE last_ok_at IS NOT NULL AND last_ok_at <  now() - make_interval(days => ${c.freshnessDays})) AS stale,
          COUNT(*) FILTER (WHERE status = 'error') AS errored,
          COUNT(*) FILTER (WHERE last_ok_at IS NULL) AS never_collected,
          MIN(last_ok_at) AS oldest_ok,
          MAX(updated_at) AS last_activity
        FROM collection_state
        WHERE source = ${c.id}
      `);
      const row = ((res.rows ?? [])[0] ?? {}) as Record<string, unknown>;
      const base = {
        source: c.id,
        slaDays: c.freshnessDays,
        tracked: Number(row.tracked ?? 0),
        fresh: Number(row.fresh ?? 0),
        stale: Number(row.stale ?? 0),
        errored: Number(row.errored ?? 0),
        neverCollected: Number(row.never_collected ?? 0),
        oldestOkAt: (row.oldest_ok as string | null) ?? null,
        lastActivityAt: (row.last_activity as string | null) ?? null,
      };
      return { ...base, label: c.label, yields: c.yields, health: verdictFor(base) };
    }),
  );

  // 3) Intelligence-gap ledger — subjects we've failed to collect or never
  //    reached. Project subjects get a human label via a safe text-cast join.
  const gapRes = await db.execute(sql`
    SELECT cs.source, cs.subject_type, cs.subject_id, cs.status, cs.last_error, cs.last_attempt_at,
           p.name AS project_name, p.ticker AS project_ticker
    FROM collection_state cs
    LEFT JOIN projects p ON cs.subject_type = 'project' AND p.id::text = cs.subject_id
    WHERE cs.status = 'error' OR cs.last_ok_at IS NULL
    ORDER BY cs.last_attempt_at DESC NULLS LAST
    LIMIT 25
  `);
  const gaps: GapEntry[] = ((gapRes.rows ?? []) as Record<string, unknown>[]).map((r) => {
    const ticker = r.project_ticker as string | null;
    const name = r.project_name as string | null;
    return {
      source: r.source as string,
      subjectType: r.subject_type as string,
      subjectId: r.subject_id as string,
      subjectLabel: name ? (ticker ? `${name} (${ticker})` : name) : null,
      status: r.status as string,
      lastError: (r.last_error as string | null) ?? null,
      lastAttemptAt: (r.last_attempt_at as string | null) ?? null,
    };
  });
  const gapCountRes = await db.execute(sql`
    SELECT COUNT(*) AS n FROM collection_state WHERE status = 'error' OR last_ok_at IS NULL
  `);
  const openGaps = Number(((gapCountRes.rows ?? [])[0] as Record<string, unknown>)?.n ?? 0);

  // 4) Compliance ledger — connector registry × terms we operate under.
  const compliance: SourceCompliance[] = CONNECTORS.map((c) => {
    const src = getSource(c.source);
    const terms = COMPLIANCE[c.source];
    return {
      source: c.source,
      label: c.label,
      homepage: src.homepage ?? null,
      tier: terms?.tier ?? 'free',
      auth: terms?.auth ?? 'Unknown',
      rateLimit: terms?.rateLimit ?? 'Unknown',
      attribution: terms?.attribution ?? 'Unknown',
      termsUrl: terms?.termsUrl ?? null,
      note: terms?.note ?? null,
    };
  });

  const lastCollectionAt = freshness
    .map((f) => f.lastActivityAt)
    .filter((v): v is string => !!v)
    .sort()
    .pop() ?? null;

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      jobsTracked: jobs.length,
      jobsFailing: jobs.filter((j) => j.status === 'failed').length,
      lastCollectionAt,
      sourcesWithinSla: freshness.filter((f) => f.health === 'ok').length,
      sourcesTotal: freshness.length,
      openGaps,
    },
    jobs,
    freshness,
    gaps,
    compliance,
  };
}
