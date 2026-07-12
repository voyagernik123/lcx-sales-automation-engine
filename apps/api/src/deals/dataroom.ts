/**
 * 5-10 Virtual data room.
 * Metadata + capped inline blobs only — NO real object storage. Document content
 * (text or base64) is capped at 200KB per doc; anything larger is rejected.
 * Every read/write is recorded in the access log.
 */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';

export const MAX_DOC_BYTES = 200 * 1024; // 200KB cap — this is not a storage service

export interface DataRoomDoc {
  id: string;
  dataRoomId: string;
  name: string;
  mime: string;
  accessLevel: string;
  sizeBytes: number;
  createdAt: string;
  content?: string | null;
}

export interface DataRoom {
  id: string;
  dealId: string;
  createdAt: string;
  docs: DataRoomDoc[];
}

function mapDoc(r: Record<string, unknown>, includeContent = false): DataRoomDoc {
  const doc: DataRoomDoc = {
    id: String(r.id),
    dataRoomId: String(r.data_room_id),
    name: String(r.name),
    mime: String(r.mime),
    accessLevel: String(r.access_level),
    sizeBytes: Number(r.size_bytes ?? 0),
    createdAt: String(r.created_at),
  };
  if (includeContent) doc.content = r.content != null ? String(r.content) : null;
  return doc;
}

/** Fetch or lazily create the data room for a deal. */
export async function getOrCreateRoom(dealId: string): Promise<{ id: string; createdAt: string }> {
  const db = getDb();
  const existing = await db.execute(sql`SELECT id, created_at FROM data_rooms WHERE deal_id = ${dealId} LIMIT 1`);
  const row = existing.rows?.[0] as Record<string, unknown> | undefined;
  if (row) return { id: String(row.id), createdAt: String(row.created_at) };

  const created = await db.execute(sql`
    INSERT INTO data_rooms (id, deal_id) VALUES (${randomUUID()}, ${dealId})
    ON CONFLICT (deal_id) DO UPDATE SET deal_id = EXCLUDED.deal_id
    RETURNING id, created_at
  `);
  const c = created.rows?.[0] as Record<string, unknown>;
  return { id: String(c.id), createdAt: String(c.created_at) };
}

/** List the room + its docs (metadata only), logging a view. */
export async function getDataRoom(dealId: string, actor: string): Promise<DataRoom> {
  const db = getDb();
  const room = await getOrCreateRoom(dealId);
  const docRows = await db.execute(sql`
    SELECT id, data_room_id, name, mime, access_level, size_bytes, created_at
    FROM data_room_docs WHERE data_room_id = ${room.id} ORDER BY created_at DESC
  `);
  await db.execute(sql`
    INSERT INTO data_room_access (id, data_room_id, actor, action) VALUES (${randomUUID()}, ${room.id}, ${actor}, 'view')
  `);
  return {
    id: room.id,
    dealId,
    createdAt: room.createdAt,
    docs: (docRows.rows ?? []).map((r) => mapDoc(r as Record<string, unknown>)),
  };
}

export interface AddDocInput {
  name: string;
  mime?: string;
  accessLevel?: string;
  content?: string;
}

export class DocTooLargeError extends Error {
  constructor(public sizeBytes: number) {
    super(`Document exceeds ${MAX_DOC_BYTES} byte cap (${sizeBytes} bytes)`);
    this.name = 'DocTooLargeError';
  }
}

/** Add a metadata-only doc with a capped inline blob. Logs an upload. */
export async function addDoc(dealId: string, actor: string, input: AddDocInput): Promise<DataRoomDoc> {
  const db = getDb();
  const content = input.content ?? '';
  const sizeBytes = Buffer.byteLength(content, 'utf8');
  if (sizeBytes > MAX_DOC_BYTES) throw new DocTooLargeError(sizeBytes);

  const room = await getOrCreateRoom(dealId);
  const rows = await db.execute(sql`
    INSERT INTO data_room_docs (id, data_room_id, name, mime, access_level, content, size_bytes)
    VALUES (${randomUUID()}, ${room.id}, ${input.name}, ${input.mime ?? 'text/plain'},
            ${input.accessLevel ?? 'internal'}, ${content}, ${sizeBytes})
    RETURNING id, data_room_id, name, mime, access_level, size_bytes, created_at
  `);
  const doc = mapDoc(rows.rows?.[0] as Record<string, unknown>);
  await db.execute(sql`
    INSERT INTO data_room_access (id, data_room_id, doc_id, actor, action)
    VALUES (${randomUUID()}, ${room.id}, ${doc.id}, ${actor}, 'upload')
  `);
  return doc;
}
