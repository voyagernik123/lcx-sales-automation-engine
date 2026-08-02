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

/**
 * THE SAME DOOR, ONE DEGREE WORSE: MARKETING'S SUBJECT *IS* THE SECRET.
 *
 * `marketing/abuseRegister.ts` writes three governed actions — `marketing_embargo_enter`,
 * `marketing_embargo_lift`, `marketing_holdings_declare` — on subject type
 * `marketing_asset`, so `invokeAction` lands `entity='marketing_asset'` with
 * `entity_id=<asset symbol>`. `marketing` is `machineAccess: true`, so the shared
 * operator key holds the compartment; `/v1/audit` sits under `governance` and was gated
 * at `requireOperator` only. The exposure was recorded at `abuseRegister.ts:1060` by the
 * phase that could not reach this file, and it is not the same shape as GPS's:
 *
 *   - An embargo row IS INSIDE INFORMATION. `action:marketing_embargo_enter` on
 *     `entity_id:SOL` tells any operator on any workspace that LCX holds unpublished
 *     price-significant information about SOL. MiCA Art 90(1) prohibits onward
 *     disclosure; the audit reader was the disclosure.
 *   - A holdings row IS PERSONAL FINANCIAL DATA about a named colleague, with Art
 *     91(3)(c) personal fines from EUR 700,000 attached to the position it describes.
 *
 * SO THE REDACTION GOES ONE FIELD FURTHER THAN GPS'S. For GPS the engagement id is an
 * opaque internal key and only `meta` carries the confidential material, so the row is
 * shown whole minus `meta`. Here the symbol in `entity_id` is the disclosure all by
 * itself, and withholding `meta` while printing `SOL` would close nothing. Both fields
 * are withheld together.
 *
 * WHAT IS DELIBERATELY STILL VISIBLE: actor, action, timestamp. That is the same
 * judgement `abuseRegister.ts:1060` reached from the other side — "an unattributable
 * embargo decision is worse than a widely-readable one". A reader without the
 * compartment still sees THAT a named human entered an embargo at a given minute, and
 * can ask for access; they cannot learn which asset it was about.
 */
const MARKETING_ENTITY_RE = /^marketing_/;
const MARKETING_WITHHELD_REASON =
  'This audit row belongs to LCX MARKETING\'s market-abuse perimeter. The subject is an asset symbol, and '
  + 'on an embargo row that symbol is itself inside information (MiCA Art 90(1)); on a holdings row it is a '
  + 'named colleague\'s financial position (Art 91(3)(c)). Both the subject and the action parameters are shown '
  + 'only to principals holding the marketing compartment at view or above. The row itself is not hidden: the '
  + 'actor, the action and the timestamp are above, so the decision stays attributable.';
const MARKETING_META_WITHHELD = {
  withheld: true,
  reason: MARKETING_WITHHELD_REASON,
} as const;
/** Replaces the asset symbol. A constant, not a hash: a stable digest would still let a
 * reader without the compartment correlate rows and count embargoes per asset. */
const MARKETING_ENTITY_ID_WITHHELD = '[withheld:marketing]';

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
    const mayReadMarketing = capAtLeast(ents.marketing, 'view');

    return c.json({
      data: (rowsResult.rows ?? []).map((r: Record<string, unknown>) => {
        const gpsRow = typeof r.entity === 'string' && GPS_ENTITY_RE.test(r.entity);
        const marketingRow = typeof r.entity === 'string' && MARKETING_ENTITY_RE.test(r.entity);
        // Marketing is checked first and withholds BOTH fields; the two regexes are
        // disjoint, so the order is documentation rather than precedence.
        const hideMarketing = marketingRow && !mayReadMarketing;
        return {
          id: r.id,
          actor: r.actor,
          action: r.action,
          entity: r.entity,
          entityId: hideMarketing ? MARKETING_ENTITY_ID_WITHHELD : r.entity_id,
          meta: hideMarketing
            ? MARKETING_META_WITHHELD
            : gpsRow && !mayReadGps ? GPS_META_WITHHELD : r.meta,
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
        marketingSubjectVisible: mayReadMarketing,
      },
    });
  } catch (err) {
    console.error('[audit] list error:', err);
    return c.json({ error: 'Failed to load audit log', code: 'QUERY_ERROR' }, 500);
  }
});
