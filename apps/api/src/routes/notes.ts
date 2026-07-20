import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { getDb } from '../db/index.js';
import { env } from '../lib/env.js';

export const noteRoutes = new Hono<{ Variables: AuthVariables }>();
const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

// Inline document blob cap — metadata-only store, no real file backend.
const MAX_DOC_BYTES = 200 * 1024;

const mapNote = (r: Record<string, unknown>) => ({
  id: r.id,
  projectId: r.project_id,
  title: r.title,
  body: r.body,
  currentVersion: Number(r.current_version ?? 1),
  pinned: r.pinned,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/* ── notes ─────────────────────────────────────────── */

/** GET /v1/projects/:id/notes — list notes for a project. */
noteRoutes.get('/:id/notes', requireOperator, async (c) => {
  const db = getDb();
  try {
    const result = await db.execute(sql`
      SELECT id, project_id, title, body, current_version, pinned, created_by, created_at, updated_at
      FROM project_notes WHERE project_id = ${c.req.param('id')}
      ORDER BY pinned DESC, updated_at DESC
    `);
    return c.json({ data: (result.rows ?? []).map(mapNote), meta: meta() });
  } catch (err) {
    console.error('[notes] list error:', err);
    return c.json({ error: 'Failed to list notes', code: 'NOTES_ERROR' }, 500);
  }
});

/** POST /v1/projects/:id/notes — create a note (records version 1). */
noteRoutes.post('/:id/notes', requireOperator, async (c) => {
  const projectId = c.req.param('id');
  const body = await c.req.json<{ title?: string; body?: string; pinned?: boolean }>();
  const noteBody = (body.body ?? '').toString();
  const id = randomUUID();
  const db = getDb();
  try {
    // Note row + its v1 version commit together — no note without its history.
    const result = await db.transaction(async (tx) => {
      const rows = await tx.execute(sql`
        INSERT INTO project_notes (id, project_id, title, body, current_version, pinned, created_by)
        VALUES (${id}, ${projectId}, ${body.title ?? null}, ${noteBody}, 1, ${body.pinned ?? false}, ${c.get('operator').id})
        RETURNING id, project_id, title, body, current_version, pinned, created_by, created_at, updated_at
      `);
      await tx.execute(sql`
        INSERT INTO note_versions (id, note_id, version, title, body, created_by)
        VALUES (${randomUUID()}, ${id}, 1, ${body.title ?? null}, ${noteBody}, ${c.get('operator').id})
      `);
      return rows;
    });
    return c.json({ data: mapNote(result.rows![0] as Record<string, unknown>), meta: meta() }, 201);
  } catch (err) {
    console.error('[notes] create error:', err);
    return c.json({ error: 'Failed to create note', code: 'NOTES_ERROR' }, 500);
  }
});

/** PUT /v1/projects/:id/notes/:noteId — update a note, bumping the version. */
noteRoutes.put('/:id/notes/:noteId', requireOperator, async (c) => {
  const noteId = c.req.param('noteId');
  const body = await c.req.json<{ title?: string; body?: string; pinned?: boolean }>();
  const db = getDb();
  try {
    // Read the current row + compute the next version INSIDE the transaction,
    // locking it FOR UPDATE — so two concurrent edits serialize instead of both
    // reading version N and racing to write N+1 (duplicate version rows).
    const result = await db.transaction(async (tx) => {
      const existing = await tx.execute(sql`
        SELECT current_version, title, body, pinned FROM project_notes WHERE id = ${noteId} FOR UPDATE
      `);
      const prev = (existing.rows ?? [])[0] as Record<string, unknown> | undefined;
      if (!prev) return null;

      const nextVersion = Number(prev.current_version ?? 1) + 1;
      const newTitle = body.title !== undefined ? body.title : (prev.title as string | null);
      const newBody = body.body !== undefined ? body.body.toString() : (prev.body as string);
      const newPinned = body.pinned !== undefined ? body.pinned : (prev.pinned as boolean);

      const rows = await tx.execute(sql`
        UPDATE project_notes
        SET title = ${newTitle}, body = ${newBody}, pinned = ${newPinned},
            current_version = ${nextVersion}, updated_at = NOW()
        WHERE id = ${noteId}
        RETURNING id, project_id, title, body, current_version, pinned, created_by, created_at, updated_at
      `);
      await tx.execute(sql`
        INSERT INTO note_versions (id, note_id, version, title, body, created_by)
        VALUES (${randomUUID()}, ${noteId}, ${nextVersion}, ${newTitle}, ${newBody}, ${c.get('operator').id})
      `);
      return rows;
    });
    if (!result) return c.json({ error: 'Note not found', code: 'NOT_FOUND' }, 404);
    return c.json({ data: mapNote(result.rows![0] as Record<string, unknown>), meta: meta() });
  } catch (err) {
    console.error('[notes] update error:', err);
    return c.json({ error: 'Failed to update note', code: 'NOTES_ERROR' }, 500);
  }
});

/** GET /v1/projects/:id/notes/:noteId/versions — version history. */
noteRoutes.get('/:id/notes/:noteId/versions', requireOperator, async (c) => {
  const db = getDb();
  try {
    const result = await db.execute(sql`
      SELECT id, note_id, version, title, body, created_by, created_at
      FROM note_versions WHERE note_id = ${c.req.param('noteId')}
      ORDER BY version DESC
    `);
    return c.json({
      data: (result.rows ?? []).map((r: Record<string, unknown>) => ({
        id: r.id,
        noteId: r.note_id,
        version: Number(r.version),
        title: r.title,
        body: r.body,
        createdBy: r.created_by,
        createdAt: r.created_at,
      })),
      meta: meta(),
    });
  } catch (err) {
    console.error('[notes] versions error:', err);
    return c.json({ error: 'Failed to list versions', code: 'NOTES_ERROR' }, 500);
  }
});

/** DELETE /v1/projects/:id/notes/:noteId — delete a note (versions cascade). */
noteRoutes.delete('/:id/notes/:noteId', requireOperator, async (c) => {
  const db = getDb();
  try {
    const result = await db.execute(sql`
      DELETE FROM project_notes WHERE id = ${c.req.param('noteId')} AND project_id = ${c.req.param('id')}
      RETURNING id
    `);
    if (!result.rows?.length) return c.json({ error: 'Note not found', code: 'NOT_FOUND' }, 404);
    return c.json({ data: { id: result.rows[0].id }, meta: meta() });
  } catch (err) {
    console.error('[notes] delete error:', err);
    return c.json({ error: 'Failed to delete note', code: 'NOTES_ERROR' }, 500);
  }
});

/* ── documents (metadata + capped inline blob) ─────── */

/** GET /v1/projects/:id/documents — list document metadata (no content). */
noteRoutes.get('/:id/documents', requireOperator, async (c) => {
  const db = getDb();
  try {
    const result = await db.execute(sql`
      SELECT id, project_id, name, mime, size_bytes, url, created_by, created_at,
             (content IS NOT NULL) AS has_content
      FROM project_documents WHERE project_id = ${c.req.param('id')}
      ORDER BY created_at DESC
    `);
    return c.json({
      data: (result.rows ?? []).map((r: Record<string, unknown>) => ({
        id: r.id,
        projectId: r.project_id,
        name: r.name,
        mime: r.mime,
        sizeBytes: Number(r.size_bytes ?? 0),
        url: r.url,
        hasContent: r.has_content,
        createdBy: r.created_by,
        createdAt: r.created_at,
      })),
      meta: meta(),
    });
  } catch (err) {
    console.error('[documents] list error:', err);
    return c.json({ error: 'Failed to list documents', code: 'DOCS_ERROR' }, 500);
  }
});

/** GET /v1/projects/:id/documents/:docId — single document with inline content. */
noteRoutes.get('/:id/documents/:docId', requireOperator, async (c) => {
  const db = getDb();
  try {
    const result = await db.execute(sql`
      SELECT id, project_id, name, mime, size_bytes, url, content, created_by, created_at
      FROM project_documents WHERE id = ${c.req.param('docId')} AND project_id = ${c.req.param('id')}
    `);
    const r = (result.rows ?? [])[0] as Record<string, unknown> | undefined;
    if (!r) return c.json({ error: 'Document not found', code: 'NOT_FOUND' }, 404);
    return c.json({
      data: {
        id: r.id,
        projectId: r.project_id,
        name: r.name,
        mime: r.mime,
        sizeBytes: Number(r.size_bytes ?? 0),
        url: r.url,
        content: r.content,
        createdBy: r.created_by,
        createdAt: r.created_at,
      },
      meta: meta(),
    });
  } catch (err) {
    console.error('[documents] get error:', err);
    return c.json({ error: 'Failed to load document', code: 'DOCS_ERROR' }, 500);
  }
});

/** POST /v1/projects/:id/documents — add document metadata + optional inline blob. */
noteRoutes.post('/:id/documents', requireOperator, async (c) => {
  const projectId = c.req.param('id');
  const body = await c.req.json<{ name?: string; mime?: string; url?: string; content?: string }>();
  if (!body.name?.trim()) return c.json({ error: 'name required', code: 'VALIDATION' }, 400);
  if (!body.url?.trim() && !body.content) {
    return c.json({ error: 'url or content required', code: 'VALIDATION' }, 400);
  }
  const content = body.content ?? null;
  const sizeBytes = content ? Buffer.byteLength(content, 'utf8') : 0;
  if (sizeBytes > MAX_DOC_BYTES) {
    return c.json({ error: `Content exceeds ${MAX_DOC_BYTES} bytes`, code: 'TOO_LARGE' }, 413);
  }
  const id = randomUUID();
  const db = getDb();
  try {
    const result = await db.execute(sql`
      INSERT INTO project_documents (id, project_id, name, mime, size_bytes, url, content, created_by)
      VALUES (${id}, ${projectId}, ${body.name.trim()}, ${body.mime?.trim() || 'text/plain'},
              ${sizeBytes}, ${body.url?.trim() || null}, ${content}, ${c.get('operator').id})
      RETURNING id, project_id, name, mime, size_bytes, url, created_by, created_at
    `);
    const r = result.rows![0] as Record<string, unknown>;
    return c.json({
      data: {
        id: r.id,
        projectId: r.project_id,
        name: r.name,
        mime: r.mime,
        sizeBytes: Number(r.size_bytes ?? 0),
        url: r.url,
        createdBy: r.created_by,
        createdAt: r.created_at,
      },
      meta: meta(),
    }, 201);
  } catch (err) {
    console.error('[documents] create error:', err);
    return c.json({ error: 'Failed to add document', code: 'DOCS_ERROR' }, 500);
  }
});

/** DELETE /v1/projects/:id/documents/:docId — remove a document. */
noteRoutes.delete('/:id/documents/:docId', requireOperator, async (c) => {
  const db = getDb();
  try {
    const result = await db.execute(sql`
      DELETE FROM project_documents WHERE id = ${c.req.param('docId')} AND project_id = ${c.req.param('id')}
      RETURNING id
    `);
    if (!result.rows?.length) return c.json({ error: 'Document not found', code: 'NOT_FOUND' }, 404);
    return c.json({ data: { id: result.rows[0].id }, meta: meta() });
  } catch (err) {
    console.error('[documents] delete error:', err);
    return c.json({ error: 'Failed to delete document', code: 'DOCS_ERROR' }, 500);
  }
});
