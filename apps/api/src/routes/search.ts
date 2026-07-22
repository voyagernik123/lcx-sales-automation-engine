/**
 * Unified object search (Palantir-grade Phase 1.4).
 *   GET /v1/search?q=  — one query, every object type, ranked, pushable.
 *
 * Backed by pg_trgm indexes (migration 0035) so ILIKE over the 54k-row projects
 * table is fast. Returns the SAME group shape as search-around (RelatedGroup),
 * so the frontend renders it with the existing component. Powers Cmd-K.
 */
import { Hono } from 'hono';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });
const PER_GROUP = 8;

export const searchRoutes = new Hono<{ Variables: AuthVariables }>();

interface Item { id: string; label: string; sublabel?: string; seed?: Record<string, unknown> }
interface Group { key: string; label: string; inspector: string; count: number; items: Item[] }

async function grp(
  key: string, label: string, inspector: string,
  sql: string, params: unknown[], map: (r: Record<string, unknown>) => Item,
): Promise<Group | null> {
  try {
    const { rows } = await getPool().query(sql, params);
    if (rows.length === 0) return null;
    const count = Number((rows[0] as Record<string, unknown>).total ?? rows.length);
    return { key, label, inspector, count, items: rows.map(map) };
  } catch {
    return null;
  }
}

searchRoutes.get('/', requireOperator, async (c) => {
  const raw = (c.req.query('q') ?? '').trim();
  if (raw.length < 2) {
    return c.json({ data: { q: raw, groups: [] }, meta: meta() });
  }
  if (raw.length > 64) {
    return c.json({ error: 'Query too long', code: 'VALIDATION' }, 400);
  }
  // Escape ILIKE wildcards so they match literally; default escape char is '\'.
  const like = `%${raw.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;

  const groups = (await Promise.all([
    // Projects — tracked first, then by priority. Trigram-accelerated.
    grp('projects', 'Projects', 'project',
      `SELECT p.id, p.name, p.ticker, p.tier, s.band, COUNT(*) OVER() AS total
       FROM projects p LEFT JOIN scores s ON s.project_id = p.id
       WHERE p.name ILIKE $1 OR p.ticker ILIKE $1
       ORDER BY (p.tier = 'tracked') DESC, s.priority_score DESC NULLS LAST
       LIMIT ${PER_GROUP}`,
      [like],
      (r) => ({ id: String(r.id), label: String(r.name ?? 'Project'),
        sublabel: [r.ticker, r.tier === 'catalog' ? 'catalog' : (r.band as string)].filter(Boolean).join(' · ') || undefined })),
    // People.
    grp('contacts', 'Contacts', 'contact',
      `SELECT id, project_id, name, title, email, COUNT(*) OVER() AS total
       FROM people WHERE name ILIKE $1 OR email ILIKE $1
       ORDER BY verified DESC, contactability_score DESC NULLS LAST LIMIT ${PER_GROUP}`,
      [like],
      (r) => ({ id: `${String(r.project_id)}:${String(r.id)}`, label: String(r.name ?? 'Contact'),
        sublabel: (r.title as string) || (r.email as string) || undefined })),
    // Deals (by project name).
    grp('deals', 'Deals', 'deal',
      `SELECT d.id, d.stage, p.name, COUNT(*) OVER() AS total
       FROM deals d JOIN projects p ON p.id = d.project_id
       WHERE p.name ILIKE $1 ORDER BY d.updated_at DESC LIMIT ${PER_GROUP}`,
      [like],
      (r) => ({ id: String(r.id), label: String(r.name ?? 'Deal'), sublabel: `deal · ${String(r.stage ?? '')}` })),
    // Notes.
    grp('notes', 'Notes', 'document',
      `SELECT id, title, body, COUNT(*) OVER() AS total
       FROM project_notes WHERE title ILIKE $1 ORDER BY updated_at DESC LIMIT ${PER_GROUP}`,
      [like],
      (r) => ({ id: String(r.id), label: (r.title as string) || 'Note', seed: { title: r.title, body: r.body, kind: 'note' } })),
    // News.
    grp('news', 'News', 'signal',
      `SELECT id, title, url, source, COUNT(*) OVER() AS total
       FROM market_news WHERE title ILIKE $1 ORDER BY published_at DESC NULLS LAST LIMIT ${PER_GROUP}`,
      [like],
      (r) => ({ id: String(r.id), label: String(r.title ?? 'Headline'), sublabel: (r.source as string) || undefined,
        seed: { kind: 'news', title: r.title, url: r.url, detail: `via ${String(r.source ?? '')}` } })),
  ])).filter((g): g is Group => g !== null);

  return c.json({ data: { q: raw, groups }, meta: meta() });
});
