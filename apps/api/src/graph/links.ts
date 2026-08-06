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
 */
import type pg from 'pg';

/** Inspector payload type to push when a related item is clicked. Mirrors the
    frontend's InspectorEntityType — kept as a string union here (no shared dep). */
export type InspectorType =
  | 'project' | 'deal' | 'handoff' | 'contact' | 'claim' | 'task'
  | 'signal' | 'listing' | 'decision' | 'jurisdiction' | 'document';

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
}

const SAMPLE = 6;
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

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

/* ────────────────────────────────────────────── project (the hub) */

async function projectRelated(pool: pg.Pool, id: string): Promise<RelatedGroup[]> {
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
  ]);
  return groups.filter((g): g is RelatedGroup => g !== null);
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

async function viaProjectId(pool: pg.Pool, table: string, id: string): Promise<RelatedGroup[]> {
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
  const siblings = await projectRelated(pool, projectId!);
  return [parent, ...siblings];
}

/* ────────────────────────────────────────────── registry */

export const RELATED_RESOLVERS: Partial<Record<InspectorType, (pool: pg.Pool, id: string) => Promise<RelatedGroup[]>>> = {
  project: projectRelated,
  deal: (pool, id) => viaProjectId(pool, 'deals', id),
  handoff: (pool, id) => viaProjectId(pool, 'handoffs', id),
  task: (pool, id) => viaProjectId(pool, 'outreach_tasks', id),
  signal: (pool, id) => viaProjectId(pool, 'signals', id),
  // listing/decision inspectors key off a won deal id → resolve via deals.
  listing: (pool, id) => viaProjectId(pool, 'deals', id),
  decision: (pool, id) => viaProjectId(pool, 'deals', id),
  // note inspectors → reach the parent project + its neighborhood.
  document: (pool, id) => viaProjectId(pool, 'project_notes', id),
  // contact id is `${projectId}:${personId}` — reach the parent project directly.
  contact: async (pool, id) => {
    const projectId = id.includes(':') ? id.split(':')[0] : id;
    const parent = await parentProjectGroup(pool, projectId);
    return parent ? [parent, ...(await projectRelated(pool, projectId))] : [];
  },
};

export function isResolvableType(t: string): t is InspectorType {
  // hasOwnProperty.call, not `in`: `in` walks the prototype chain, so 'constructor',
  // 'toString', 'valueOf' and '__proto__' all answer TRUE and this type guard would
  // narrow a non-type to InspectorType. Same defect as intel/monitors.ts:44, where it
  // made a monitor pass validation and then never fire.
  return Object.prototype.hasOwnProperty.call(RELATED_RESOLVERS, t);
}
