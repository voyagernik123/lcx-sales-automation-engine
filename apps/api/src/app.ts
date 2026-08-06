import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { env } from './lib/env.js';
import { resolveCorsOrigin } from './lib/cors.js';
import { recordLatency } from './lib/latency.js';
import { rateLimit } from './middleware/rateLimit.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';
import perfRoutes from './routes/perf.js';
import { projectsRoutes } from './routes/projects.js';
import { outreachRoutes } from './routes/outreach.js';
import { queueRoutes } from './routes/queue.js';
import { discoveryRoutes } from './routes/discovery.js';
import { analyticsRoutes } from './routes/analytics.js';
import { taskRoutes } from './routes/tasks.js';
import { notificationRoutes } from './routes/notifications.js';
import { readoutRoutes } from './routes/readout.js';
import { userRoutes, projectAssignmentRoutes } from './routes/users.js';
import { customer360Routes } from './routes/customer360.js';
import { noteRoutes } from './routes/notes.js';
import { aiRoutes } from './routes/ai.js';
import { outreachOpsRoutes } from './routes/outreachOps.js';
import { dealDeskRoutes } from './routes/dealdesk.js';
import { analytics2Routes } from './routes/analytics2.js';
import { integrationRoutes } from './routes/integrations.js';
import { templateRoutes } from './routes/templates.js';
import { handoffRoutes } from './routes/handoffs.js';
import { dealRoutes } from './routes/deals.js';
import { kpiRoutes } from './routes/kpis.js';
import { auditRoutes } from './routes/audit.js';
import { intelRoutes } from './routes/intel.js';
import { graphRoutes } from './routes/graph.js';
import { searchRoutes } from './routes/search.js';
import { reviewRoutes } from './routes/reviews.js';
import { actionRoutes } from './routes/actions.js';
import { monitorRoutes } from './routes/monitors.js';
import { marketingRoutes } from './routes/marketing.js';
import { MARKETING_READ_SHAPED_POSTS } from './routes/marketingDesk.js';
import { MARKETING_GATES_READ_SHAPED_POSTS } from './routes/marketingGates.js';
import { scenarioRoutes, pirRoutes } from './routes/planning.js';
import { wbrRoutes } from './routes/wbr.js';
import { decisionRoutes } from './routes/decisions.js';
import { aiOperatorRoutes } from './routes/aiOperator.js';
import { commandRoutes } from './routes/command.js';
import { distributionRoutes } from './routes/distribution.js';
import { x402Routes } from './routes/x402.js';
import { accessRoutes } from './routes/access.js';
import { gpsRoutes } from './routes/gps.js';
import { requireWorkspace } from './middleware/workspace.js';
import { NO_STORE_HEADER, noStore } from './middleware/noStore.js';
import { WORKSPACES } from '@lcx/shared';

/** Methods that cannot change state, so they gate at 'view'. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * READ-SHAPED POSTS — endpoints that are POSTs only because a question does not
 * fit in a query string, and that write NOTHING.
 *
 * The reads-at-view/writes-at-operate split was aimed at GPS writes, but "not a
 * GET" is not the same as "mutates". Applied by method alone it silently took
 * cited Q&A and ad-hoc reporting away from every `view`-granted member — a policy
 * change nobody asked for. So the requirement is scoped to actual state mutation
 * via an explicit, verified allowlist. Default stays 'operate': an endpoint that
 * is not on this list requires the write tier, so a new route is deny-by-default
 * and adding an exemption is a code review.
 *
 * Each entry was read before it was added:
 *   /v1/command/ask            → ai/commandOperator.askProgram, SELECT-only
 *   /v1/distribution/ask       → ai/distributionOperator.askDistribution, no pool
 *   /v1/analytics/reports/run  → runReport(config), explicitly "not persisted"
 *   /v1/analytics/reports/:id/run → loads the saved config, then the same runReport
 *
 * DELIBERATELY ABSENT: `/v1/projects/score`. It reads like a query and is not one
 * — score/batch.ts:165 does INSERT INTO scores … ON CONFLICT DO UPDATE, i.e. it
 * rewrites every project's band. It stays at 'operate'.
 *
 * ALSO DELIBERATELY ABSENT: everything under /v1/gps. No exemption may ever match
 * a GPS path; `__tests__/workspaceWriteGate.test.ts` fails if one does.
 *
 * ── THE FOUR MARKETING ENTRIES ARE DECLARED IN THEIR OWN ROUTERS ─────────────
 * `MARKETING_READ_SHAPED_POSTS` (`routes/marketingDesk.ts`) carries `/regime`,
 * `/triage/assess` and `/adoption`; `MARKETING_GATES_READ_SHAPED_POSTS`
 * (`routes/marketingGates.ts`) carries `/review`. They are spread rather than
 * restated because the reading that justifies an exemption — "this handler calls
 * `to_regclass` and one SELECT and nothing else" — belongs beside the handler,
 * where a later edit to it is in the same diff as the claim. Restated here, the
 * exemption survives the handler growing an INSERT.
 *
 * THE ANCHORED-PATTERN RULE STILL APPLIES TO THEM: both constants are
 * `/^\/v1\/marketing\/…$/`, `app.ts` matches `c.req.path`, and
 * `routes/__tests__/marketingCapabilityTier.test.ts` asserts that no marketing
 * handler on either list contains a write marker. Four exemptions, each of which
 * was read; the default for the other thirty-one marketing routes is unchanged.
 */
const READ_SHAPED_POSTS: readonly RegExp[] = [
  /^\/v1\/command\/ask$/,
  /^\/v1\/distribution\/ask$/,
  /^\/v1\/analytics\/reports\/run$/,
  /^\/v1\/analytics\/reports\/[^/]+\/run$/,
  ...MARKETING_READ_SHAPED_POSTS,
  ...MARKETING_GATES_READ_SHAPED_POSTS,
];

/**
 * Does this request need the 'operate' tier, or only 'view'? Exported because
 * this is the boundary itself and it is tested directly, not by inspecting source.
 */
export function requiresOperate(method: string, path: string): boolean {
  if (READ_METHODS.has(method.toUpperCase())) return false;
  if (method.toUpperCase() !== 'POST') return true;
  return !READ_SHAPED_POSTS.some((re) => re.test(path));
}

export function createApp() {
  const app = new Hono();

  app.use('*', logger());
  // Record request latency into the in-memory ring buffer that backs the API
  // p95 SLO (Phase 4.3). Wraps the whole chain; excludes the health check so
  // uptime pings don't skew the desk-facing latency picture.
  app.use('*', async (c, next) => {
    const start = performance.now();
    await next();
    // /health is excluded so uptime pings don't skew the desk-facing number;
    // /v1/perf is excluded because it CARRIES the UI latency measurement —
    // timing it into the API ring would let measuring pollute the measured.
    if (c.req.path !== '/health' && c.req.path !== '/v1/perf') {
      recordLatency(performance.now() - start);
    }
  });
  app.use('*', rateLimit());
  app.use(
    '*',
    cors({
      // Exact allowlist + this Pages project's own deployment subdomains. See
      // lib/cors.ts: opening the desk on a per-commit preview URL used to fail
      // every fetch and report itself as API DOWN.
      origin: (origin) => resolveCorsOrigin(origin, env.corsOrigins),
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Purpose'],
      // The web shell is ALWAYS cross-origin (Cloudflare Pages and
      // tauri://localhost → onrender.com), and fetch() hides any response header
      // not listed here. X-LCX-No-Store must be exposed or the cache kill switch
      // is set by the server, dropped by the browser, and silently does nothing.
      exposeHeaders: ['Content-Type', NO_STORE_HEADER],
      maxAge: 86400,
      credentials: false,
    }),
  );

  // Server-authoritative, deny-only cache veto. Ahead of the compartment gates
  // so it also stamps their 401/403 envelopes.
  app.use('*', noStore());

  // ── LCX OS compartment gates (Phase 1) ─────────────────────────────────
  // The workspace constitution (@lcx/shared) declares which /v1 namespaces
  // each workspace owns; every one is guarded BEFORE the route mounts below.
  // Desk-level namespaces (me, tasks, notifications, integrations, search,
  // reviews, actions) stay ungated here — actions are gated per-action inside
  // the registry instead.
  /*
   * READS AT 'view', WRITES AT 'operate'.
   *
   * This loop used to mount `requireWorkspace(ws.id, 'view')` for every method, and
   * no GPS route re-checked the capability — `requireOperator` is authentication,
   * not authorisation. So a member granted `gps:view`, which is exactly what the
   * request-access flow hands out by default (`routes/access.ts`), could
   * `POST /v1/gps/clients`, `/quote`, `/engagements`, `/engagements/:id/status`,
   * `origination/targets`, `milestones/:key/state`, `deliverables`, `evidence` and
   * `loop/outcome`. "Can read the compartment" and "can write a third party's
   * commercial terms" were the same grant.
   *
   * `view` on anything that cannot change state, `operate` on everything that can —
   * see `requiresOperate` above, which is method PLUS a small audited allowlist of
   * POSTs that only ask questions. The approve-tier acts keep their own
   * `requireApprover` on top — this is the floor, not the ceiling. Applied to every
   * compartment, not just GPS: the capability ladder exists in `@lcx/shared` for
   * exactly this and no mount was using it.
   */
  for (const ws of WORKSPACES) {
    const readGate = requireWorkspace(ws.id, 'view');
    const writeGate = requireWorkspace(ws.id, 'operate');
    const gate: MiddlewareHandler = async (c, next) =>
      (requiresOperate(c.req.method, c.req.path) ? writeGate : readGate)(c, next);
    for (const prefix of ws.apiPrefixes) {
      app.use(`${prefix}/*`, gate);
      app.use(prefix, gate);
    }
  }

  app.route('/health', healthRoutes);
  app.route('/v1/me', meRoutes);
  app.route('/v1/perf', perfRoutes);
  app.route('/v1/access', accessRoutes);
  app.route('/v1/projects', projectsRoutes);
  // additional /v1/projects sub-routers (disjoint paths: /:id/360, /:id/assign, /:id/notes, /:id/documents)
  app.route('/v1/projects', projectAssignmentRoutes);
  app.route('/v1/projects', customer360Routes);
  app.route('/v1/projects', noteRoutes);
  app.route('/v1/users', userRoutes);
  app.route('/v1/outreach/queue', queueRoutes);
  app.route('/v1/outreach/templates', templateRoutes);
  app.route('/v1/outreach-ops', outreachOpsRoutes);
  app.route('/v1/outreach', outreachRoutes);
  app.route('/v1/handoffs', handoffRoutes);
  app.route('/v1/deals', dealRoutes);
  app.route('/v1/dealdesk', dealDeskRoutes);
  app.route('/v1/kpis', kpiRoutes);
  app.route('/v1/audit', auditRoutes);
  app.route('/v1/discovery', discoveryRoutes);
  app.route('/v1/analytics', analyticsRoutes);
  app.route('/v1/analytics', analytics2Routes);
  app.route('/v1/ai', aiRoutes);
  app.route('/v1/ai', aiOperatorRoutes);
  app.route('/v1/command', commandRoutes);
  app.route('/v1/distribution', distributionRoutes);
  // x402 seller layer — public by design (payment is the auth), not gated.
  app.route('/v1/x402', x402Routes);
  app.route('/v1/integrations', integrationRoutes);
  app.route('/v1/tasks', taskRoutes);
  app.route('/v1/notifications', notificationRoutes);
  /*
   * DESK-LEVEL ON PURPOSE, like notifications above it, and for the same reason.
   *
   * The 07:00 readout is ONE ranked brief PER READER spanning every compartment that
   * reader is entitled to. Putting it behind a single workspace gate would be wrong in
   * both directions: it would deny a reader entitled to two compartments, and it would
   * make "which compartment does this route belong to" a question with no answer.
   *
   * It is not ungated. `requireOperator` authenticates it at `routes/readout.ts:62`, and
   * the filtering that matters happens INSIDE, per reader, through `scopesFor()` /
   * `scopeList()` — the same parameterised scope filter that closed P0's live
   * notification leak. That is the only correct place for it, because the redaction is
   * part of the answer here: the readout reports how many items it withheld.
   */
  app.route('/v1/readout', readoutRoutes);
  app.route('/v1/intel', intelRoutes);
  app.route('/v1/graph', graphRoutes);
  app.route('/v1/search', searchRoutes);
  app.route('/v1/reviews', reviewRoutes);
  app.route('/v1/actions', actionRoutes);
  app.route('/v1/monitors', monitorRoutes);
  // Guarded at 'view' automatically: app.ts mounts requireWorkspace from the
  // registry's apiPrefixes, and '/v1/marketing' is declared there.
  app.route('/v1/marketing', marketingRoutes);
  // GLOBAL SERVICES (GPS Phase 1). Gated at 'view' automatically by the loop
  // above — '/v1/gps' is declared in the workspace constitution's apiPrefixes
  // (@lcx/shared workspaces.ts), which is the ONLY thing that makes the
  // compartment real on the server; mounting a route here without that entry
  // would publish it to the whole desk. See the plan's §1.5 for what this
  // boundary does and does not give you: it is routing, not tenancy. The rows
  // carry client_id (0047_gps.sql).
  //
  // ⌘K IS SCOPED, contrary to an earlier draft of this comment. `/v1/search` is
  // desk-level by design, but since 7eee9a6 every group declares its owning
  // compartment and `visibleGroups()` (routes/search.ts) filters the SPECS before
  // any query runs, so an unentitled compartment is never read. GPS contributes no
  // search group yet; when one is added it MUST carry `workspace: 'gps'`, and
  // `__tests__/searchCompartments.test.ts` fails if a new compartment-owned group
  // arrives untagged.
  //
  // What remains genuinely absent is TENANCY: no client/controller dimension is
  // enforced at the row level for non-GPS readers, and there is deliberately
  // nowhere to store a client document at all — Phase 3's artifact intake is
  // gated on the unanswered DPO question (GPS_IMPLEMENTATION_PLAN.md §4 S0.4).
  app.route('/v1/gps', gpsRoutes);
  app.route('/v1/scenarios', scenarioRoutes);
  app.route('/v1/pirs', pirRoutes);
  app.route('/v1/wbr', wbrRoutes);
  app.route('/v1/decisions', decisionRoutes);

  app.get('/', (c) =>
    c.json({
      service: 'lcx-sales-api',
      docs: [
        'GET /health',
        'GET /v1/me',
        'GET /v1/projects',
        'GET /v1/projects/:id',
        'POST /v1/projects',
        'POST /v1/projects/score',
        'POST /v1/projects/:id/score',
        'POST /v1/projects/:id/enrich',
        'POST /v1/projects/:id/approve',
        'POST /v1/projects/:id/suppress',
        'POST /v1/projects/:id/snooze',
        'DELETE /v1/projects/:id/snooze',
        'GET /v1/deals/:id/playbook',
        'PATCH /v1/deals/:id/playbook',
        'GET /v1/kpis/forecast-history',
        'POST /v1/projects/:id/people',
        'PATCH /v1/projects/:id/people/:personId',
        'GET /v1/projects/:id/gate',
        'GET /v1/kpis',
        'GET /v1/kpis/export',
        'GET /v1/kpis/triggers',
        'POST /v1/kpis/triggers',
        'PATCH /v1/kpis/triggers/:id',
        'GET /v1/audit',
      ],
    }),
  );

  app.notFound((c) => c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404));

  app.onError((err, c) => {
    // Dig out a Postgres error code (Drizzle wraps the pg error in .cause)
    const pgCode =
      (err as { code?: string }).code ??
      ((err as { cause?: { code?: string } }).cause?.code);

    // Map common data errors to 4xx instead of a blanket 500
    const CLIENT_ERRORS: Record<string, { status: 400 | 404 | 409; code: string; msg: string }> = {
      '22P02': { status: 400, code: 'INVALID_INPUT', msg: 'Invalid identifier or value' }, // bad UUID / cast
      '23502': { status: 400, code: 'MISSING_FIELD', msg: 'Required field missing' }, // not-null
      '23503': { status: 409, code: 'FK_VIOLATION', msg: 'Referenced record does not exist' }, // foreign key
      '23505': { status: 409, code: 'DUPLICATE', msg: 'Record already exists' }, // unique
    };
    const mapped = pgCode ? CLIENT_ERRORS[pgCode] : undefined;
    if (mapped) {
      return c.json({ error: mapped.msg, code: mapped.code }, mapped.status);
    }

    console.error('[api] unhandled', err);
    return c.json({ error: env.nodeEnv === 'production' ? 'Internal server error' : err.message, code: 'INTERNAL' }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
