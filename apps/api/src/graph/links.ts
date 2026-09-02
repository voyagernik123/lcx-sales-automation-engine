/**
 * Search-around (Palantir-grade Phase 1.1) — the "graph is the navigation" engine.
 *
 * For any object, resolve the TYPED, COUNTED groups of objects it links to, each
 * with a small sample the UI can render as pivot chips and push into the next
 * inspector. The links already exist as foreign keys; this makes them navigable.
 *
 * Each resolver is one (or a few) indexed SQL queries — count + top-N sample via
 * COUNT(*) OVER(), no N+1. Every group names the inspector type to push into, so
 * the frontend needs zero per-type wiring.
 *
 * Contract: resolvers never throw for a single bad group — a failing group is
 * omitted, the rest still return (a dead pivot must never blank the drawer).
 *
 * ── S5 OF INSTRUMENT_100X_PLAN (2026-09-02): THE JOIN REACHES THE WHOLE PLATFORM ─────
 * Eleven types, none newer than 2025, and all of them sales — the two compartments that carry the
 * money and the liability (gps, marketing) were unreachable from the search-around whose purpose is
 * joining. Seven types are added: `engagement` `target` `partner` `client` `draft` (gps) and
 * `holding` `asset` (marketing). `jurisdiction`, which had a payload but no resolver, gets one.
 *
 * ENTITLEMENT IS A GROUP'S PROPERTY, NOT THE ROUTE'S. `/v1/graph` is deliberately outside the
 * workspace gates (it spans compartments), so every resolver receives the reader's entitlements
 * and files each group under a compartment. A group the reader does not hold is not omitted — it is
 * returned WITHHELD: `{ count: 0, items: [], withheld: 'gps' }`, so the drawer can say "3 more
 * groups in a room you do not hold" instead of rendering a smaller world as if it were the whole
 * one. Silence is never the answer to need-to-know; the locked line is. Before S5 the sales groups
 * were returned to every operator regardless of compartment; that is closed here too.
 */
import type pg from 'pg';
import type { WorkspaceId } from '@lcx/shared';

/** Inspector payload type to push when a related item is clicked. Mirrors the
    frontend's InspectorEntityType — kept as a string union here (no shared dep);
    `apps/web/src/lib/__tests__/oneFloor.test.ts` pins the two unions identical. */
export type InspectorType =
  | 'project' | 'deal' | 'handoff' | 'contact' | 'claim' | 'task'
  | 'signal' | 'listing' | 'decision' | 'jurisdiction' | 'document'
  | 'engagement' | 'target' | 'partner' | 'client' | 'draft'
  | 'holding' | 'asset';

export interface RelatedItem {
  /** The id to push into the inspector (contact uses `${projectId}:${personId}`). */
  id: string;
  label: string;
  sublabel?: string;
  /** Optional seed so seed-rendered inspectors (signal/document) show instantly. */
  seed?: Record<string, unknown>;
}

export interface RelatedGroup {
  key: string;              // stable machine key: 'contacts' | 'deal' | 'news' | ...
  label: string;            // display: 'Contacts'
  inspector: InspectorType; // push target for items in this group
  count: number;            // TOTAL linked (may exceed items.length)
  items: RelatedItem[];     // top-N sample
  /**
   * Present when the group lives in a compartment the reader does not hold. `count` is 0 and
   * `items` is empty BY CONSTRUCTION — nothing about the withheld rows leaks, not even how many —
   * and the drawer renders a locked line naming the compartment.
   */
  withheld?: WorkspaceId;
}

/** What a resolver knows about the reader. Built by the route from `loadEntitlements`. */
export interface ResolveContext {
  holds: (ws: WorkspaceId) => boolean;
}

export type RelatedResolver = (pool: pg.Pool, id: string, ctx: ResolveContext) => Promise<RelatedGroup[]>;

const SAMPLE = 6;
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const safeId = (s: string) => s.length > 0 && s.length <= 128;

/** The locked line: a group the reader may not see, said rather than skipped. */
export function withheldGroup(key: string, label: string, inspector: InspectorType, ws: WorkspaceId): RelatedGroup {
  return { key, label, inspector, count: 0, items: [], withheld: ws };
}

/** Run one group query; returns null (omitted) on any failure or zero rows. */
async function group(
  pool: pg.Pool,
  key: string,
  label: string,
  inspector: InspectorType,
  sql: string,
  params: unknown[],
  map: (r: Record<string, unknown>) => RelatedItem,
): Promise<RelatedGroup | null> {
  try {
    const { rows } = await pool.query(sql, params);
    if (rows.length === 0) return null;
    const count = Number((rows[0] as Record<string, unknown>).total ?? rows.length);
    if (count === 0) return null;
    return { key, label, inspector, count, items: rows.map(map) };
  } catch {
    return null;
  }
}

const present = (groups: readonly (RelatedGroup | null)[]): RelatedGroup[] =>
  groups.filter((g): g is RelatedGroup => g !== null);

/* ────────────────────────────────────────────── project (the sales hub) */

async function projectRelated(pool: pg.Pool, id: string, ctx: ResolveContext): Promise<RelatedGroup[]> {
  if (!ctx.holds('sales')) return [withheldGroup('project-neighbourhood', 'Sales neighbourhood', 'project', 'sales')];
  const groups = await Promise.all([
    // Contacts — verified/contactable first.
    group(pool, 'contacts', 'Contacts', 'contact',
      `SELECT id, name, title, email, COUNT(*) OVER() AS total
       FROM people WHERE project_id = $1
       ORDER BY verified DESC, contactability_score DESC NULLS LAST LIMIT ${SAMPLE}`,
      [id],
      (r) => ({ id: `${id}:${String(r.id)}`, label: String(r.name ?? 'Contact'),
        sublabel: (r.title as string) || (r.email as string) || undefined })),
    // Deal — at most one (0033 unique index).
    group(pool, 'deal', 'Deal', 'deal',
      `SELECT id, stage, package_value, COUNT(*) OVER() AS total
       FROM deals WHERE project_id = $1 LIMIT 1`,
      [id],
      (r) => ({ id: String(r.id), label: `Deal · ${String(r.stage ?? 'open')}`,
        sublabel: r.package_value != null ? `$${Number(r.package_value).toLocaleString()}` : undefined })),
    // Interactions (handoffs).
    group(pool, 'interactions', 'Interactions', 'handoff',
      `SELECT id, status, trigger_reason, COUNT(*) OVER() AS total
       FROM handoffs WHERE project_id = $1 ORDER BY created_at DESC LIMIT ${SAMPLE}`,
      [id],
      (r) => ({ id: String(r.id), label: `Handoff · ${String(r.status ?? '')}`,
        sublabel: (r.trigger_reason as string) || undefined })),
    // Tasks.
    group(pool, 'tasks', 'Tasks', 'task',
      `SELECT id, action, channel, status, subject, COUNT(*) OVER() AS total
       FROM outreach_tasks WHERE project_id = $1 ORDER BY due_at DESC LIMIT ${SAMPLE}`,
      [id],
      (r) => ({ id: String(r.id), label: (r.subject as string) || `${String(r.action ?? 'task')} · ${String(r.channel ?? '')}`,
        sublabel: String(r.status ?? '') })),
    // Notes.
    group(pool, 'notes', 'Notes', 'document',
      `SELECT id, title, body, COUNT(*) OVER() AS total
       FROM project_notes WHERE project_id = $1 ORDER BY updated_at DESC LIMIT ${SAMPLE}`,
      [id],
      (r) => ({ id: String(r.id), label: (r.title as string) || 'Note',
        seed: { title: r.title, body: r.body, kind: 'note' } })),
    // Signals (intel).
    group(pool, 'signals', 'Signals', 'signal',
      `SELECT id, kind, payload, COUNT(*) OVER() AS total
       FROM signals WHERE project_id = $1 ORDER BY observed_at DESC LIMIT ${SAMPLE}`,
      [id],
      (r) => ({ id: String(r.id), label: String((r.payload as Record<string, unknown>)?.title ?? r.kind ?? 'Signal'),
        sublabel: String(r.kind ?? ''), seed: { kind: r.kind, ...(r.payload as object) } })),
    // News mentions — this project appears in the matched set.
    group(pool, 'news', 'News mentions', 'signal',
      `SELECT id, title, url, source, COUNT(*) OVER() AS total
       FROM market_news WHERE $1 = ANY(matched_project_ids)
       ORDER BY published_at DESC NULLS LAST LIMIT ${SAMPLE}`,
      [id],
      (r) => ({ id: String(r.id), label: String(r.title ?? 'Headline'),
        sublabel: (r.source as string) || undefined,
        seed: { kind: 'news', title: r.title, url: r.url, detail: `via ${String(r.source ?? '')}` } })),
    // Peers — same-category tracked tokens (the competitive set).
    group(pool, 'peers', 'Peers (same category)', 'project',
      `SELECT p2.id, p2.name, p2.ticker, s.band, COUNT(*) OVER() AS total
       FROM projects p2 LEFT JOIN scores s ON s.project_id = p2.id
       WHERE p2.tier = 'tracked' AND p2.id <> $1
         AND p2.category IS NOT NULL
         AND p2.category = (SELECT category FROM projects WHERE id = $1)
       ORDER BY s.priority_score DESC NULLS LAST LIMIT ${SAMPLE}`,
      [id],
      (r) => ({ id: String(r.id), label: String(r.name ?? 'Project'),
        sublabel: (r.ticker as string) || (r.band as string) || undefined })),
    // THE JOIN, from the sales side: engagements this project became. gps-held only.
    ctx.holds('gps')
      ? group(pool, 'engagements', 'GPS engagements', 'engagement',
        `SELECT id, offer_key, status, COUNT(*) OVER() AS total
         FROM gps_engagement WHERE project_id = $1 ORDER BY updated_at DESC LIMIT ${SAMPLE}`,
        [id],
        (r) => ({ id: String(r.id), label: `Engagement · ${String(r.status ?? '')}`, sublabel: String(r.offer_key ?? '') }))
      : Promise.resolve(withheldGroup('engagements', 'GPS engagements', 'engagement', 'gps')),
  ]);
  return present(groups);
}

/* ────────────────────────────────────────────── reverse: reach the parent project */

/** Resolve the parent project (id + name) for a child row, as a pushable group. */
async function parentProjectGroup(pool: pg.Pool, projectId: string | null | undefined): Promise<RelatedGroup | null> {
  if (!projectId || !isUuid(projectId)) return null;
  return group(pool, 'project', 'Project', 'project',
    `SELECT id, name, ticker, 1::bigint AS total FROM projects WHERE id = $1 LIMIT 1`,
    [projectId],
    (r) => ({ id: String(r.id), label: String(r.name ?? 'Project'), sublabel: (r.ticker as string) || undefined }));
}

async function viaProjectId(pool: pg.Pool, table: string, id: string, ctx: ResolveContext): Promise<RelatedGroup[]> {
  if (!ctx.holds('sales')) return [withheldGroup('project', 'Project', 'project', 'sales')];
  if (!isUuid(id)) return [];
  let projectId: string | null = null;
  try {
    const { rows } = await pool.query(`SELECT project_id FROM ${table} WHERE id = $1 LIMIT 1`, [id]);
    projectId = (rows[0]?.project_id as string) ?? null;
  } catch {
    return [];
  }
  const parent = await parentProjectGroup(pool, projectId);
  if (!parent) return [];
  // Bring the project's own related groups so one hop reaches the whole neighborhood.
  const siblings = await projectRelated(pool, projectId!, ctx);
  return [parent, ...siblings];
}

/* ────────────────────────────────────────────── gps: engagement (the hub), client, target, partner, draft */

const OFFER = (r: Record<string, unknown>) => String(r.offer_key ?? '');
const money = (cents: unknown, currency: unknown) =>
  cents == null ? undefined : `${(Number(cents) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })} ${String(currency ?? '')}`.trim();

async function clientGroup(pool: pg.Pool, clientId: string | null): Promise<RelatedGroup | null> {
  if (!clientId || !safeId(clientId)) return null;
  return group(pool, 'client', 'Client', 'client',
    `SELECT id, name, jurisdiction, status, 1::bigint AS total FROM gps_client WHERE id = $1 LIMIT 1`, [clientId],
    (r) => ({ id: String(r.id), label: String(r.name ?? 'Client'), sublabel: [r.jurisdiction, r.status].filter(Boolean).map(String).join(' · ') || undefined }));
}
async function partnerGroup(pool: pg.Pool, partnerId: string | null): Promise<RelatedGroup | null> {
  if (!partnerId || !safeId(partnerId)) return null;
  return group(pool, 'partner', 'Partner', 'partner',
    `SELECT partner_id, partner_name, active, 1::bigint AS total FROM gps_partner_registry WHERE partner_id = $1 LIMIT 1`, [partnerId],
    (r) => ({ id: String(r.partner_id), label: String(r.partner_name ?? r.partner_id), sublabel: r.active === false ? 'inactive' : undefined }));
}
async function engagementsOf(pool: pg.Pool, where: string, param: string, key = 'engagements', label = 'Engagements'): Promise<RelatedGroup | null> {
  return group(pool, key, label, 'engagement',
    `SELECT id, offer_key, status, price_cents, currency, COUNT(*) OVER() AS total
     FROM gps_engagement WHERE ${where} ORDER BY updated_at DESC LIMIT ${SAMPLE}`, [param],
    (r) => ({ id: String(r.id), label: `${OFFER(r)} · ${String(r.status ?? '')}`, sublabel: money(r.price_cents, r.currency) }));
}
async function targetsOf(pool: pg.Pool, where: string, param: string, key = 'targets', label = 'Targets'): Promise<RelatedGroup | null> {
  return group(pool, key, label, 'target',
    `SELECT id, name, status, jurisdiction, offer_key, COUNT(*) OVER() AS total
     FROM gps_target WHERE ${where} ORDER BY updated_at DESC LIMIT ${SAMPLE}`, [param],
    (r) => ({ id: String(r.id), label: String(r.name ?? 'Target'), sublabel: [r.status, r.jurisdiction].filter(Boolean).map(String).join(' · ') || undefined }));
}

async function engagementRelated(pool: pg.Pool, id: string, ctx: ResolveContext): Promise<RelatedGroup[]> {
  if (!ctx.holds('gps')) return [withheldGroup('engagement-neighbourhood', 'GPS neighbourhood', 'engagement', 'gps')];
  if (!isUuid(id)) return [];
  let row: Record<string, unknown> | null = null;
  try {
    const { rows } = await pool.query(`SELECT client_id, project_id, partner_id FROM gps_engagement WHERE id = $1 LIMIT 1`, [id]);
    row = (rows[0] as Record<string, unknown>) ?? null;
  } catch { return []; }
  if (!row) return [];
  const clientId = row.client_id ? String(row.client_id) : null;
  const projectId = row.project_id ? String(row.project_id) : null;
  const groups = await Promise.all([
    clientGroup(pool, clientId),
    partnerGroup(pool, row.partner_id ? String(row.partner_id) : null),
    // The sales object this engagement grew from — a different compartment, so it can be withheld.
    projectId ? (ctx.holds('sales') ? parentProjectGroup(pool, projectId) : Promise.resolve(withheldGroup('project', 'Project', 'project', 'sales'))) : Promise.resolve(null),
    group(pool, 'drafts', 'Deliverable drafts', 'draft',
      `SELECT id, offer_key, version, status, COUNT(*) OVER() AS total
       FROM gps_draft WHERE engagement_id = $1 ORDER BY generated_at DESC LIMIT ${SAMPLE}`, [id],
      // The draft payload reaches the factory by ENGAGEMENT (`/v1/gps/factory/engagements/:id`), so the
      // engagement id travels as the seed — a draft id alone has no endpoint of its own.
      (r) => ({ id: String(r.id), label: `${OFFER(r)} · v${String(r.version ?? '')}`, sublabel: String(r.status ?? ''), seed: { engagementId: id, offerKey: r.offer_key, version: r.version, status: r.status } })),
    clientId ? targetsOf(pool, 'client_id = $1', clientId, 'client-targets', 'Targets of this client') : Promise.resolve(null),
    clientId ? group(pool, 'sibling-engagements', 'Other engagements of this client', 'engagement',
      `SELECT id, offer_key, status, price_cents, currency, COUNT(*) OVER() AS total
       FROM gps_engagement WHERE client_id = $1 AND id <> $2 ORDER BY updated_at DESC LIMIT ${SAMPLE}`, [clientId, id],
      (r) => ({ id: String(r.id), label: `${OFFER(r)} · ${String(r.status ?? '')}`, sublabel: money(r.price_cents, r.currency) })) : Promise.resolve(null),
  ]);
  return present(groups);
}

async function clientRelated(pool: pg.Pool, id: string, ctx: ResolveContext): Promise<RelatedGroup[]> {
  if (!ctx.holds('gps')) return [withheldGroup('client-neighbourhood', 'GPS neighbourhood', 'client', 'gps')];
  if (!safeId(id)) return [];
  return present(await Promise.all([
    engagementsOf(pool, 'client_id = $1', id),
    targetsOf(pool, 'client_id = $1', id),
  ]));
}

async function targetRelated(pool: pg.Pool, id: string, ctx: ResolveContext): Promise<RelatedGroup[]> {
  if (!ctx.holds('gps')) return [withheldGroup('target-neighbourhood', 'GPS neighbourhood', 'target', 'gps')];
  if (!safeId(id)) return [];
  let row: Record<string, unknown> | null = null;
  try {
    const { rows } = await pool.query(`SELECT client_id, jurisdiction FROM gps_target WHERE id = $1 LIMIT 1`, [id]);
    row = (rows[0] as Record<string, unknown>) ?? null;
  } catch { return []; }
  if (!row) return [];
  const clientId = row.client_id ? String(row.client_id) : null;
  return present(await Promise.all([
    clientGroup(pool, clientId),
    clientId ? engagementsOf(pool, 'client_id = $1', clientId, 'client-engagements', 'Engagements of this client') : Promise.resolve(null),
    // The dossier is a document: the existing document inspector renders it from its seed.
    group(pool, 'dossier', 'Dossier', 'document',
      `SELECT id, offer_key, status, dossier_md, generated_at, COUNT(*) OVER() AS total
       FROM gps_dossier WHERE target_id = $1 ORDER BY generated_at DESC LIMIT ${SAMPLE}`, [id],
      (r) => ({ id: String(r.id), label: `Dossier · ${OFFER(r)}`, sublabel: String(r.status ?? ''),
        seed: { kind: 'dossier', title: `Dossier · ${OFFER(r)}`, body: r.dossier_md, generatedAt: r.generated_at } })),
    row.jurisdiction ? group(pool, 'jurisdiction', 'Jurisdiction', 'jurisdiction',
      `SELECT jurisdiction AS id, COUNT(*) OVER() AS total FROM gps_jurisdiction_profile WHERE jurisdiction = $1 LIMIT 1`, [String(row.jurisdiction)],
      (r) => ({ id: String(r.id), label: String(r.id) })) : Promise.resolve(null),
  ]));
}

async function partnerRelated(pool: pg.Pool, id: string, ctx: ResolveContext): Promise<RelatedGroup[]> {
  if (!ctx.holds('gps')) return [withheldGroup('partner-neighbourhood', 'GPS neighbourhood', 'partner', 'gps')];
  if (!safeId(id)) return [];
  return present(await Promise.all([
    engagementsOf(pool, 'partner_id = $1', id, 'engagements', 'Engagements on this seat'),
  ]));
}

async function draftRelated(pool: pg.Pool, id: string, ctx: ResolveContext): Promise<RelatedGroup[]> {
  if (!ctx.holds('gps')) return [withheldGroup('draft-neighbourhood', 'GPS neighbourhood', 'draft', 'gps')];
  if (!safeId(id)) return [];
  let engagementId: string | null = null;
  try {
    const { rows } = await pool.query(`SELECT engagement_id FROM gps_draft WHERE id = $1 LIMIT 1`, [id]);
    engagementId = rows[0]?.engagement_id ? String(rows[0].engagement_id) : null;
  } catch { return []; }
  if (!engagementId) return [];
  const parent = await group(pool, 'engagement', 'Engagement', 'engagement',
    `SELECT id, offer_key, status, price_cents, currency, 1::bigint AS total FROM gps_engagement WHERE id = $1 LIMIT 1`, [engagementId],
    (r) => ({ id: String(r.id), label: `${OFFER(r)} · ${String(r.status ?? '')}`, sublabel: money(r.price_cents, r.currency) }));
  return parent ? [parent, ...(await engagementRelated(pool, engagementId, ctx))] : [];
}

async function jurisdictionRelated(pool: pg.Pool, id: string, ctx: ResolveContext): Promise<RelatedGroup[]> {
  if (!ctx.holds('gps')) return [withheldGroup('jurisdiction-neighbourhood', 'GPS neighbourhood', 'jurisdiction', 'gps')];
  if (!safeId(id)) return [];
  return present(await Promise.all([
    targetsOf(pool, 'jurisdiction = $1', id),
    group(pool, 'clients', 'Clients', 'client',
      `SELECT id, name, status, COUNT(*) OVER() AS total FROM gps_client WHERE jurisdiction = $1 ORDER BY updated_at DESC LIMIT ${SAMPLE}`, [id],
      (r) => ({ id: String(r.id), label: String(r.name ?? 'Client'), sublabel: String(r.status ?? '') || undefined })),
  ]));
}

/* ────────────────────────────────────────────── marketing: holding, asset */

async function embargoesOf(pool: pg.Pool, symbol: string): Promise<RelatedGroup | null> {
  return group(pool, 'embargoes', 'Asset embargoes', 'asset',
    `SELECT asset_symbol, state, embargoed_from, embargoed_until, COUNT(*) OVER() AS total
     FROM marketing_asset_embargo WHERE asset_symbol = $1 ORDER BY updated_at DESC LIMIT ${SAMPLE}`, [symbol],
    (r) => ({ id: String(r.asset_symbol), label: `${String(r.asset_symbol)} · ${String(r.state ?? '')}`,
      sublabel: r.embargoed_until ? `until ${String(r.embargoed_until).slice(0, 10)}` : undefined }));
}
async function holdingsOf(pool: pg.Pool, where: string, param: string, key = 'holdings', label = 'Holdings declarations'): Promise<RelatedGroup | null> {
  return group(pool, key, label, 'holding',
    `SELECT id, member_id, asset_symbol, holds, declared_at, renew_by, COUNT(*) OVER() AS total
     FROM marketing_holdings_declaration WHERE ${where} ORDER BY declared_at DESC LIMIT ${SAMPLE}`, [param],
    // The perimeter view the payload reads carries no row ids: the pair is the key, so it travels as seed.
    (r) => ({ id: String(r.id), label: `${String(r.member_id)} · ${String(r.asset_symbol)}`,
      sublabel: `${r.holds ? 'holds' : 'does not hold'} · renew by ${String(r.renew_by ?? '').slice(0, 10)}`,
      seed: { memberId: r.member_id, assetSymbol: r.asset_symbol, holds: r.holds, declaredAt: r.declared_at, renewBy: r.renew_by } }));
}

async function holdingRelated(pool: pg.Pool, id: string, ctx: ResolveContext): Promise<RelatedGroup[]> {
  if (!ctx.holds('marketing')) return [withheldGroup('holding-neighbourhood', 'Marketing neighbourhood', 'holding', 'marketing')];
  if (!safeId(id)) return [];
  let row: Record<string, unknown> | null = null;
  try {
    const { rows } = await pool.query(`SELECT member_id, asset_symbol FROM marketing_holdings_declaration WHERE id = $1 LIMIT 1`, [id]);
    row = (rows[0] as Record<string, unknown>) ?? null;
  } catch { return []; }
  if (!row) return [];
  return present(await Promise.all([
    embargoesOf(pool, String(row.asset_symbol)),
    holdingsOf(pool, 'member_id = $1', String(row.member_id), 'member-holdings', 'Declarations by this member'),
  ]));
}

async function assetRelated(pool: pg.Pool, id: string, ctx: ResolveContext): Promise<RelatedGroup[]> {
  if (!ctx.holds('marketing')) return [withheldGroup('asset-neighbourhood', 'Marketing neighbourhood', 'asset', 'marketing')];
  if (!safeId(id)) return [];
  return present(await Promise.all([
    embargoesOf(pool, id),
    holdingsOf(pool, 'asset_symbol = $1', id),
  ]));
}

/* ────────────────────────────────────────────── registry */

export const RELATED_RESOLVERS: Partial<Record<InspectorType, RelatedResolver>> = {
  project: projectRelated,
  deal: (pool, id, ctx) => viaProjectId(pool, 'deals', id, ctx),
  handoff: (pool, id, ctx) => viaProjectId(pool, 'handoffs', id, ctx),
  task: (pool, id, ctx) => viaProjectId(pool, 'outreach_tasks', id, ctx),
  signal: (pool, id, ctx) => viaProjectId(pool, 'signals', id, ctx),
  // listing/decision inspectors key off a won deal id → resolve via deals.
  listing: (pool, id, ctx) => viaProjectId(pool, 'deals', id, ctx),
  decision: (pool, id, ctx) => viaProjectId(pool, 'deals', id, ctx),
  // note inspectors → reach the parent project + its neighborhood.
  document: (pool, id, ctx) => viaProjectId(pool, 'project_notes', id, ctx),
  // contact id is `${projectId}:${personId}` — reach the parent project directly.
  contact: async (pool, id, ctx) => {
    if (!ctx.holds('sales')) return [withheldGroup('project', 'Project', 'project', 'sales')];
    const projectId = id.includes(':') ? id.split(':')[0] : id;
    const parent = await parentProjectGroup(pool, projectId);
    return parent ? [parent, ...(await projectRelated(pool, projectId, ctx))] : [];
  },
  // S5 · the join.
  jurisdiction: jurisdictionRelated,
  engagement: engagementRelated,
  client: clientRelated,
  target: targetRelated,
  partner: partnerRelated,
  draft: draftRelated,
  holding: holdingRelated,
  asset: assetRelated,
};

export function isResolvableType(t: string): t is InspectorType {
  // hasOwnProperty.call, not `in`: `in` walks the prototype chain, so 'constructor',
  // 'toString', 'valueOf' and '__proto__' all answer TRUE and this type guard would
  // narrow a non-type to InspectorType. Same defect as intel/monitors.ts:44, where it
  // made a monitor pass validation and then never fire.
  return Object.prototype.hasOwnProperty.call(RELATED_RESOLVERS, t);
}
