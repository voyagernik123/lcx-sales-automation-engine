import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { capAtLeast } from '@lcx/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getDb, getPool } from '../db/index.js';
import { loadEntitlements } from '../access/entitlements.js';
import * as schema from '../db/schema.js';
import { env } from '../lib/env.js';

export const auditRoutes = new Hono<{ Variables: AuthVariables }>();

/**
 * THE AUDIT LOG WAS A SECOND DOOR INTO THE GPS COMPARTMENT.
 *
 * `/v1/audit` is mounted under `governance`, which is `machineAccess: true`. GPS is
 * `machineAccess: false` specifically so that the shared key and the monitors cannot
 * read a third party's confidential commercial terms. But `invokeAction` writes every
 * GPS action's params into `audit_log.meta` verbatim (`actions/registry.ts`), and
 * those params include `checkPerformed` — the narrative of the conflict check on a
 * named client — and `disclosureTextUsed`, which is the exact text a client was
 * given. `redactSecrets` matches none of those keys, because they are not secrets;
 * they are somebody else's confidential material.
 *
 * So a `GET /v1/audit?entity=gps_engagement&limit=200` with the shared machine key
 * returned the compartment's most sensitive strings through a compartment the key
 * legitimately holds. The boundary was drawn on `/v1/gps/*` and the data walked out
 * of a different door.
 *
 * The fix is per-row and capability-based, not a filter: the ROW still appears — who
 * did what, to which engagement, when — because that is the audit trail and hiding
 * it would be its own defect. `meta` is replaced with a stated refusal unless the
 * caller holds `gps` at `view`. A reader who cannot see the payload can still see
 * that the act happened and ask for access.
 */
const GPS_ENTITY_RE = /^gps_/;
const GPS_META_WITHHELD = {
  withheld: true,
  reason:
    'This audit row belongs to GLOBAL SERVICES, which holds a third party\'s confidential commercial terms. '
    + 'The action parameters (which can include the conflict-check narrative and the verbatim disclosure text given to a client) '
    + 'are shown only to principals holding the gps compartment at view or above. The row itself is not hidden: '
    + 'the actor, the action, the engagement id and the timestamp are above.',
} as const;

auditRoutes.get('/', requireOperator, async (c) => {
  const db = getDb();

  try {
    const page = Math.max(1, Number(c.req.query('page') ?? 1));
    const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? 50)));
    const offset = (page - 1) * limit;
    const entity = c.req.query('entity');
    const action = c.req.query('action');
    const actor = c.req.query('actor');

    // NB: the queries below alias audit_log as `al`, so conditions must use
    // the alias — qualified column refs like "audit_log"."entity" are invalid
    // once the table is aliased and made every filtered query fail.
    const conditions: ReturnType<typeof sql>[] = [];
    if (entity) conditions.push(sql`al.entity = ${entity}`);
    if (action) conditions.push(sql`al.action = ${action}`);
    if (actor) conditions.push(sql`al.actor = ${actor}`);

    const whereClause = conditions.length > 0
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    const [rowsResult, countResult] = await Promise.all([
      db.execute(sql`
        SELECT al.*, p.name AS project_name
        FROM ${schema.auditLog} al
        LEFT JOIN projects p ON al.entity = 'projects' AND al.entity_id = p.id::text
        ${whereClause}
        ORDER BY al.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
      db.execute(sql`
        SELECT COUNT(*) AS count FROM ${schema.auditLog} al ${whereClause}
      `),
    ]);

    const total = Number((countResult.rows?.[0] as Record<string, unknown> | undefined)?.count ?? 0);

    // Loaded once per request, not per row. See GPS_META_WITHHELD above.
    const operator = c.get('operator');
    const ents = operator ? await loadEntitlements(getPool(), operator.id) : {};
    const mayReadGps = capAtLeast(ents.gps, 'view');

    return c.json({
      data: (rowsResult.rows ?? []).map((r: Record<string, unknown>) => {
        const gpsRow = typeof r.entity === 'string' && GPS_ENTITY_RE.test(r.entity);
        return {
          id: r.id,
          actor: r.actor,
          action: r.action,
          entity: r.entity,
          entityId: r.entity_id,
          meta: gpsRow && !mayReadGps ? GPS_META_WITHHELD : r.meta,
          projectName: r.project_name ?? null,
          createdAt: r.created_at,
        };
      }),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        timestamp: new Date().toISOString(),
        version: env.version,
        gpsMetaVisible: mayReadGps,
      },
    });
  } catch (err) {
    console.error('[audit] list error:', err);
    return c.json({ error: 'Failed to load audit log', code: 'QUERY_ERROR' }, 500);
  }
});
