import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { renderPlay, type PlayFacts, type PlayResult } from '@lcx/shared';
import { getDb } from '../db/index.js';
import { getAssessment } from './alpha.js';
import { DEFAULT_ORG_ID } from './observations.js';

/**
 * Play engine (Wave 4) — assemble a target's facts from the intelligence spine,
 * pick the strongest play, and render an evidence-backed draft. Saving records
 * it in the drafts table AND the action ledger + audit (attribution), so a
 * briefed touch is one click from the ripe target.
 */

async function buildPlayFacts(subjectId: string): Promise<PlayFacts | null> {
  const db = getDb();
  const res = await db.execute(sql`
    SELECT p.name, p.ticker, p.listed_on_lcx, p.price_change_30d,
           s.eu_score, s.recommended_market,
           (SELECT count(*) FROM exchange_listings el WHERE el.project_id = p.id) AS competitor_count,
           (SELECT exchange_name FROM exchange_listings el WHERE el.project_id = p.id ORDER BY volume_24h_usd DESC NULLS LAST LIMIT 1) AS top_venue,
           (SELECT name FROM people pe WHERE pe.project_id = p.id ORDER BY verified DESC, contactability_score DESC LIMIT 1) AS contact_name
    FROM projects p
    LEFT JOIN LATERAL (SELECT eu_score, recommended_market FROM scores WHERE project_id = p.id ORDER BY computed_at DESC LIMIT 1) s ON true
    WHERE p.id = ${subjectId}
  `);
  const p = (res.rows ?? [])[0] as Record<string, unknown> | undefined;
  if (!p) return null;

  const obs = await db.execute(sql`
    SELECT DISTINCT ON (predicate) predicate, value_num
    FROM observations WHERE subject_type='project' AND subject_id=${subjectId} AND predicate IN ('tvl_usd','github_commits_30d')
    ORDER BY predicate, observed_at DESC
  `);
  const o: Record<string, number | null> = {};
  for (const r of (obs.rows ?? []) as Record<string, unknown>[]) o[r.predicate as string] = r.value_num != null ? Number(r.value_num) : null;

  const a = (await getAssessment(subjectId)) as Record<string, unknown> | null;
  const timing = (a?.timing as { window?: PlayFacts['timingWindow'] } | null)?.window ?? null;
  const ach = (a?.ach as { verdict?: string } | null)?.verdict ?? null;
  const dealValueUsd = (a?.value as { usd?: number } | null)?.usd ?? null;

  return {
    name: p.name as string,
    ticker: (p.ticker as string | null) ?? null,
    listedOnLcx: !!p.listed_on_lcx,
    timingWindow: timing,
    achVerdict: ach,
    priceChange30d: p.price_change_30d != null ? Number(p.price_change_30d) : null,
    competitorCount: p.competitor_count != null ? Number(p.competitor_count) : 0,
    topVenue: (p.top_venue as string | null) ?? null,
    euScore: p.eu_score != null ? Number(p.eu_score) : null,
    recommendedMarket: (p.recommended_market as string) ?? null,
    tvlUsd: o.tvl_usd ?? null,
    githubCommits30d: o.github_commits_30d ?? null,
    dealValueUsd,
    contactName: (p.contact_name as string | null) ?? null,
  };
}

export async function getPlayDraft(subjectId: string): Promise<(PlayResult & { facts: PlayFacts }) | null> {
  const facts = await buildPlayFacts(subjectId);
  if (!facts) return null;
  return { ...renderPlay(facts), facts };
}

/** Persist the draft to the drafts table + record the action (attribution). */
export async function savePlayDraft(subjectId: string, actor: string): Promise<{ draftId: string; play: PlayResult } | null> {
  const facts = await buildPlayFacts(subjectId);
  if (!facts) return null;
  const play = renderPlay(facts);
  const db = getDb();
  const draftId = randomUUID();

  await db.execute(sql`
    INSERT INTO drafts (id, project_id, contact_name, subject, body, channel, touch_index, claims_used, requires_human_review)
    VALUES (${draftId}, ${subjectId}, ${facts.contactName ?? 'there'}, ${play.draft.subject}, ${play.draft.body},
            'email', 1, ${JSON.stringify(play.evidence)}::jsonb, true)
  `);
  await db.execute(sql`
    INSERT INTO object_actions (org_id, subject_type, subject_id, action, params, result, actor)
    VALUES (${DEFAULT_ORG_ID}, 'project', ${subjectId}, 'draft_outreach',
            ${JSON.stringify({ play: play.playId })}::jsonb, ${JSON.stringify({ draftId })}::jsonb, ${actor})
  `);
  await db.execute(sql`
    INSERT INTO audit_log (actor, action, entity, entity_id, meta)
    VALUES (${actor}, 'action:draft_outreach', 'project', ${subjectId}, ${JSON.stringify({ play: play.playId, draftId })}::jsonb)
  `);
  return { draftId, play };
}
