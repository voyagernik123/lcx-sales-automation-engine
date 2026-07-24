/**
 * SLOs & error budgets (Palantir-grade Phase 4.3) — formalizes what Ops Health
 * half-showed into named service-level objectives, each with a target, a current
 * value, and how much of its 30-day error budget is burned. Management by
 * exception: a red budget becomes a banner on the Command Center.
 *
 * Four objectives, all derived from what the system already records:
 *   data_freshness — share of collection sources inside their freshness SLA
 *   job_success    — intel-job success rate over the trailing 30 days (job_runs)
 *   api_latency    — request p95 over the recent in-memory window (lib/latency)
 *   news_lag       — age of the freshest market-news item vs a 24h target
 *
 * Error budget: for a target T the budget is the allowed shortfall; burn% is how
 * much of it the current value consumes. Burn ≥ 100% ⇒ breach.
 */
import { getDb } from '../db/index.js';
import { sql } from 'drizzle-orm';
import { buildOpsHealth } from './ops.js';
import { latencySnapshot, uiInteractionRing, uiSettleRing, uiFrameRing } from '../lib/latency.js';

export type SloUnit = 'pct' | 'ms' | 'hours';
export type SloStatus = 'ok' | 'warn' | 'breach' | 'no_data';

export interface Slo {
  key: string;
  label: string;
  description: string;
  unit: SloUnit;
  target: number;
  current: number | null;
  higherIsBetter: boolean;
  status: SloStatus;
  /** % of the 30-day error budget consumed (null when not measurable). */
  budgetBurnPct: number | null;
  window: string;
  detail: string;
}

export interface SloReport {
  generatedAt: string;
  slos: Slo[];
  anyBreach: boolean;
  anyWarn: boolean;
}

/** Burn% + status for a "higher is better" availability/success SLO. */
function availabilityVerdict(current: number, target: number): { status: SloStatus; burn: number } {
  const budget = Math.max(100 - target, 0.0001); // allowed shortfall (pct points)
  const shortfall = Math.max(target - current, 0);
  const burn = Math.round((shortfall / budget) * 100);
  const status: SloStatus = current >= target ? 'ok' : burn >= 100 ? 'breach' : 'warn';
  return { status, burn };
}

/** Burn% + status for a "lower is better" latency/lag SLO (target is the ceiling). */
function latencyVerdict(current: number, target: number): { status: SloStatus; burn: number } {
  const burn = Math.round((current / Math.max(target, 0.0001)) * 100);
  const status: SloStatus = current <= target ? 'ok' : current <= target * 1.5 ? 'warn' : 'breach';
  return { status, burn };
}

export async function computeSlos(): Promise<SloReport> {
  const db = getDb();
  const slos: Slo[] = [];

  // 1) Data freshness — share of sources currently inside their SLA.
  try {
    const ops = await buildOpsHealth();
    const total = ops.freshness.filter((f) => f.health !== 'idle').length;
    const ok = ops.freshness.filter((f) => f.health === 'ok').length;
    if (total === 0) {
      slos.push(noData('data_freshness', 'Data freshness', 'Collection sources within their freshness SLA', 'pct', 90, true, 'point-in-time', 'No active collection sources yet.'));
    } else {
      const current = Math.round((ok / total) * 100);
      const { status, burn } = availabilityVerdict(current, 90);
      slos.push({
        key: 'data_freshness', label: 'Data freshness', description: 'Collection sources within their freshness SLA',
        unit: 'pct', target: 90, current, higherIsBetter: true, status, budgetBurnPct: burn,
        window: 'point-in-time', detail: `${ok}/${total} sources fresh`,
      });
    }
  } catch {
    slos.push(noData('data_freshness', 'Data freshness', 'Collection sources within their freshness SLA', 'pct', 90, true, 'point-in-time', 'Ops health unavailable.'));
  }

  // 2) Job success rate — trailing 30 days across all intel jobs.
  try {
    const res = await db.execute(sql`
      SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'ok') AS ok
      FROM job_runs WHERE started_at >= now() - INTERVAL '30 days' AND status <> 'running'
    `);
    const row = ((res.rows ?? [])[0] ?? {}) as Record<string, unknown>;
    const total = Number(row.total ?? 0), ok = Number(row.ok ?? 0);
    if (total === 0) {
      slos.push(noData('job_success', 'Job success rate', 'Intel jobs completing without error', 'pct', 95, true, '30d', 'No job runs in the window yet.'));
    } else {
      const current = Math.round((ok / total) * 100);
      const { status, burn } = availabilityVerdict(current, 95);
      slos.push({
        key: 'job_success', label: 'Job success rate', description: 'Intel jobs completing without error',
        unit: 'pct', target: 95, current, higherIsBetter: true, status, budgetBurnPct: burn,
        window: '30d', detail: `${ok}/${total} runs succeeded`,
      });
    }
  } catch {
    slos.push(noData('job_success', 'Job success rate', 'Intel jobs completing without error', 'pct', 95, true, '30d', 'job_runs unavailable.'));
  }

  // 3) API latency — recent request p95 (in-memory ring buffer).
  {
    const snap = latencySnapshot();
    if (snap.p95 == null || snap.samples < 20) {
      slos.push(noData('api_latency', 'API latency (p95)', 'Recent request p95 under target', 'ms', 800, false, 'recent', `Only ${snap.samples} samples so far — need ≥20.`));
    } else {
      const { status, burn } = latencyVerdict(snap.p95, 800);
      slos.push({
        key: 'api_latency', label: 'API latency (p95)', description: 'Recent request p95 under target',
        unit: 'ms', target: 800, current: snap.p95, higherIsBetter: false, status, budgetBurnPct: burn,
        window: 'recent', detail: `${snap.samples} samples · p50 ${snap.p50}ms · p99 ${snap.p99}ms`,
      });
    }
  }

  // 5) UI interaction latency — the speed floor (TERMINAL Phase 2).
  //
  // A DIFFERENT quantity from api_latency above: this is intent → pixels as
  // measured in the client and flushed to POST /v1/perf, not server request
  // time. It has to be client-measured, because production costs ~165–195ms of
  // fixed infrastructure latency before our code runs (a 204 preflight that
  // touches nothing costs the same as a real query — the origin is GCP us-west1
  // behind Cloudflare). A sub-100ms interaction is therefore only achievable by
  // NOT going to the network, which is what the local-first read layer is for.
  {
    const snap = uiInteractionRing.snapshot();
    if (snap.p95 == null || snap.samples < 20) {
      slos.push(
        noData(
          'ui_interaction_p95',
          'UI interaction (p95)',
          'Intent → pixels, as felt by the operator',
          'ms',
          100,
          false,
          'recent',
          `Only ${snap.samples} client samples so far — need ≥20.`,
        ),
      );
    } else {
      const { status, burn } = latencyVerdict(snap.p95, 100);
      slos.push({
        key: 'ui_interaction_p95',
        label: 'UI interaction (p95)',
        description: 'Intent → pixels, as felt by the operator',
        unit: 'ms',
        target: 100,
        current: snap.p95,
        higherIsBetter: false,
        status,
        budgetBurnPct: burn,
        window: 'recent',
        // Same honesty as api_latency: say how thin the evidence is. This is one
        // API process's view of whichever clients happened to flush to it, and it
        // resets on deploy.
        detail: `${snap.samples} client samples · p50 ${snap.p50}ms · p99 ${snap.p99}ms`,
      });
    }
  }

  // 5b) UI settle latency — the number that cannot be gamed.
  //
  // Published BESIDE ui_interaction_p95, never instead of it. Paint measures
  // intent → local state on screen; settle measures intent → every authoritative
  // region resolved. If only paint were tracked, moving a read to network-only
  // (which governance REQUIRES for gate inputs, entitlements and audit surfaces)
  // would remove a slow sample from the paint distribution and the headline p95
  // would improve while the desk got slower. Removing this row is a breaking
  // change to the Phase 2 gate.
  //
  // Its target is deliberately looser than 100ms: settle includes at least one
  // real round trip, and production costs ~165-195ms of fixed infrastructure
  // latency before our code runs. Holding settle to 100ms would be demanding
  // something physically impossible and would make the SLO permanently red.
  {
    const snap = uiSettleRing.snapshot();
    if (snap.p95 == null || snap.samples < 20) {
      slos.push(
        noData(
          'ui_settle_p95',
          'UI settle (p95)',
          'Intent → every authoritative region resolved',
          'ms',
          600,
          false,
          'recent',
          `Only ${snap.samples} client samples so far — need \u226520.`,
        ),
      );
    } else {
      const { status, burn } = latencyVerdict(snap.p95, 600);
      slos.push({
        key: 'ui_settle_p95',
        label: 'UI settle (p95)',
        description: 'Intent \u2192 every authoritative region resolved',
        unit: 'ms',
        target: 600,
        current: snap.p95,
        higherIsBetter: false,
        status,
        budgetBurnPct: burn,
        window: 'recent',
        detail: `${snap.samples} client samples \u00b7 p50 ${snap.p50}ms \u00b7 p99 ${snap.p99}ms`,
      });
    }
  }

  // 6) UI frame time — is the app dropping frames (60Hz budget)?
  {
    const snap = uiFrameRing.snapshot();
    if (snap.p95 == null || snap.samples < 20) {
      slos.push(
        noData(
          'ui_frame_time',
          'UI frame time (p95)',
          'Frame-to-frame time within the 60Hz budget',
          'ms',
          16,
          false,
          'recent',
          `Only ${snap.samples} client samples so far — need ≥20.`,
        ),
      );
    } else {
      const { status, burn } = latencyVerdict(snap.p95, 16);
      slos.push({
        key: 'ui_frame_time',
        label: 'UI frame time (p95)',
        description: 'Frame-to-frame time within the 60Hz budget',
        unit: 'ms',
        target: 16,
        current: snap.p95,
        higherIsBetter: false,
        status,
        budgetBurnPct: burn,
        window: 'recent',
        detail: `${snap.samples} client samples · p50 ${snap.p50}ms · p99 ${snap.p99}ms`,
      });
    }
  }

  // 4) News-pipeline lag — hours since the freshest market-news item.
  try {
    const res = await db.execute(sql`
      SELECT EXTRACT(EPOCH FROM (now() - MAX(published_at))) / 3600 AS hours, COUNT(*) AS n
      FROM market_news WHERE published_at IS NOT NULL AND published_at <= now()
    `);
    const row = ((res.rows ?? [])[0] ?? {}) as Record<string, unknown>;
    const n = Number(row.n ?? 0);
    if (n === 0 || row.hours == null) {
      slos.push(noData('news_lag', 'News pipeline lag', 'Freshest market-news item under 24h old', 'hours', 24, false, 'point-in-time', 'No market-news items yet.'));
    } else {
      const current = Math.round(Number(row.hours) * 10) / 10;
      const { status, burn } = latencyVerdict(current, 24);
      slos.push({
        key: 'news_lag', label: 'News pipeline lag', description: 'Freshest market-news item under 24h old',
        unit: 'hours', target: 24, current, higherIsBetter: false, status, budgetBurnPct: burn,
        window: 'point-in-time', detail: `${n.toLocaleString()} items · newest ${current}h ago`,
      });
    }
  } catch {
    slos.push(noData('news_lag', 'News pipeline lag', 'Freshest market-news item under 24h old', 'hours', 24, false, 'point-in-time', 'market_news unavailable.'));
  }

  return {
    generatedAt: new Date().toISOString(),
    slos,
    anyBreach: slos.some((s) => s.status === 'breach'),
    anyWarn: slos.some((s) => s.status === 'warn'),
  };
}

function noData(
  key: string, label: string, description: string, unit: SloUnit, target: number, higherIsBetter: boolean, window: string, detail: string,
): Slo {
  return { key, label, description, unit, target, current: null, higherIsBetter, status: 'no_data', budgetBurnPct: null, window, detail };
}
