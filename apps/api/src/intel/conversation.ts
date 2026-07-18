import { sql } from 'drizzle-orm';
import { analyzeConversation, type ConversationInsights } from '@lcx/shared';
import { getDb } from '../db/index.js';

/**
 * Assemble a project's conversation text from every thread surface we have —
 * handoff summaries + events, sent messages, and notes — then run the
 * deterministic extractor. Returns the insights plus how much text backed them
 * (honesty about thin threads).
 */

export interface ConversationResult extends ConversationInsights {
  sources: { handoffs: number; messages: number; notes: number };
}

export async function analyzeProjectConversation(subjectId: string): Promise<ConversationResult> {
  const db = getDb();
  const parts: string[] = [];
  let handoffs = 0;
  let messages = 0;
  let notes = 0;

  const hRes = await db.execute(sql`
    SELECT h.summary,
           COALESCE(string_agg(he.content, ' ' ORDER BY he.created_at), '') AS events
    FROM handoffs h
    LEFT JOIN handoff_events he ON he.handoff_id = h.id AND he.content IS NOT NULL
    WHERE h.project_id = ${subjectId}
    GROUP BY h.id, h.summary
  `);
  for (const r of (hRes.rows ?? []) as Record<string, unknown>[]) {
    handoffs++;
    if (r.summary) parts.push(String(r.summary));
    if (r.events) parts.push(String(r.events));
  }

  const mRes = await db.execute(sql`
    SELECT body FROM messages WHERE project_id = ${subjectId} AND body IS NOT NULL
    ORDER BY created_at DESC LIMIT 40
  `);
  for (const r of (mRes.rows ?? []) as Record<string, unknown>[]) {
    messages++;
    if (r.body) parts.push(String(r.body));
  }

  // project_notes may not exist in every environment — degrade gracefully.
  try {
    const nRes = await db.execute(sql`
      SELECT body FROM project_notes WHERE project_id = ${subjectId} AND body IS NOT NULL
      ORDER BY updated_at DESC LIMIT 20
    `);
    for (const r of (nRes.rows ?? []) as Record<string, unknown>[]) {
      notes++;
      if (r.body) parts.push(String(r.body));
    }
  } catch {
    /* notes table absent — skip */
  }

  const insights = analyzeConversation(parts.join('\n'), handoffs + messages + notes);
  return { ...insights, sources: { handoffs, messages, notes } };
}
