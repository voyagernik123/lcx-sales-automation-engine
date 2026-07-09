/**
 * Connector runner: stage → detect changes → normalize → resolve identity →
 * batched canonical upsert → map staged rows to projects.
 *
 * Every step is idempotent: staging upserts on (source, external_id) with a
 * content hash, and re-running an unchanged source touches nothing but
 * last_seen_at.
 */
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { deriveRegion } from '../lib/region.js';
import { resolveIncoming, keyProject, type KeyedProject } from '../import/resolve.js';
import type { Connector, ConnectorRunReport, StagedRecord } from './types.js';

const STAGE_CHUNK = 500;

export async function runConnector(pool: pg.Pool, connector: Connector): Promise<ConnectorRunReport> {
  const report: ConnectorRunReport = {
    connector: connector.name,
    fetched: 0,
    staged: 0,
    changed: 0,
    ignored: 0,
    attached: 0,
    inserted: 0,
    errors: [],
    projectIdByExternalId: new Map(),
  };

  const ctx = {
    cursor: null,
    log: (m: string) => console.log(`[${connector.name}] ${m}`),
  };

  // ── 1. Stage all fetched records ──
  const changedIds: string[] = [];
  for await (const batch of connector.fetch(ctx)) {
    report.fetched += batch.length;
    for (let i = 0; i < batch.length; i += STAGE_CHUNK) {
      const chunk = batch.slice(i, i + STAGE_CHUNK);
      const changed = await stageChunk(pool, connector.name, chunk);
      report.staged += chunk.length;
      changedIds.push(...changed);
    }
  }
  report.changed = changedIds.length;

  if (changedIds.length === 0) return report;

  // ── 2. Load changed staged rows, normalize ──
  const { rows: stagedRows } = await pool.query(
    `SELECT id, external_id, payload FROM project_sources
     WHERE source = $1 AND external_id = ANY($2)`,
    [connector.name, changedIds],
  );

  const normalized: { stagedId: string; externalId: string; project: KeyedProject | null }[] = [];
  for (const row of stagedRows) {
    try {
      const raw = connector.normalize({
        externalId: row.external_id as string,
        payload: row.payload as Record<string, unknown>,
        contentHash: '',
      });
      normalized.push({
        stagedId: row.id as string,
        externalId: row.external_id as string,
        project: raw ? keyProject(raw) : null,
      });
    } catch (err) {
      report.errors.push(`${row.external_id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Quality-gated rows → ignored
  const ignoredIds = normalized.filter((n) => n.project === null).map((n) => n.stagedId);
  if (ignoredIds.length > 0) {
    await pool.query(`UPDATE project_sources SET status = 'ignored' WHERE id = ANY($1)`, [ignoredIds]);
    report.ignored = ignoredIds.length;
  }

  const toResolve = normalized.filter((n) => n.project !== null) as {
    stagedId: string;
    externalId: string;
    project: KeyedProject;
  }[];
  if (toResolve.length === 0) return report;

  // ── 3. Identity resolution (indexed candidate lookups) ──
  const { attach, insert } = await resolveIncoming(
    { query: (t, p) => pool.query(t, p as unknown[]) },
    toResolve.map((n) => n.project),
  );
  report.attached = attach.length;
  report.inserted = insert.length;

  // ── 4. Batched canonical writes ──
  const idByProjectRef = new Map<KeyedProject, string>();

  for (let i = 0; i < insert.length; i += STAGE_CHUNK) {
    const chunk = insert.slice(i, i + STAGE_CHUNK);
    const insertedIds = await insertProjects(pool, chunk);
    chunk.forEach((p, idx) => {
      const id = insertedIds[idx];
      if (id) idByProjectRef.set(p, id);
    });
  }

  for (let i = 0; i < attach.length; i += STAGE_CHUNK) {
    const chunk = attach.slice(i, i + STAGE_CHUNK);
    await attachProjects(pool, chunk);
    chunk.forEach((a) => idByProjectRef.set(a.incoming, a.projectId));
  }

  // ── 5. Map staged rows → projects ──
  // Within-batch merges leave some rows without a direct ref; map through the
  // canonical that absorbed them via key equality.
  const byKey = new Map<string, string>();
  for (const [proj, id] of idByProjectRef) {
    if (proj.esmaTokenId) byKey.set(`esma:${proj.esmaTokenId}`, id);
    if (proj.domain) byKey.set(`dom:${proj.domain}`, id);
    byKey.set(`name:${proj.nameKey}`, id);
  }

  const mappings: { stagedId: string; externalId: string; projectId: string }[] = [];
  for (const n of toResolve) {
    const p = n.project;
    const id =
      idByProjectRef.get(p) ??
      (p.esmaTokenId && byKey.get(`esma:${p.esmaTokenId}`)) ??
      (p.domain && byKey.get(`dom:${p.domain}`)) ??
      byKey.get(`name:${p.nameKey}`);
    if (id) mappings.push({ stagedId: n.stagedId, externalId: n.externalId, projectId: id });
  }

  for (let i = 0; i < mappings.length; i += STAGE_CHUNK) {
    const chunk = mappings.slice(i, i + STAGE_CHUNK);
    const values: unknown[] = [];
    const tuples = chunk
      .map((m, idx) => {
        values.push(m.stagedId, m.projectId);
        return `($${idx * 2 + 1}::uuid, $${idx * 2 + 2}::uuid)`;
      })
      .join(', ');
    await pool.query(
      `UPDATE project_sources ps SET project_id = v.project_id, status = 'mapped'
       FROM (VALUES ${tuples}) AS v(id, project_id) WHERE ps.id = v.id`,
      values,
    );
  }
  for (const m of mappings) report.projectIdByExternalId.set(m.externalId, m.projectId);

  return report;
}

/* ────────────────────────────────────────────── */

/** Upsert a chunk into staging; returns externalIds whose content changed (or are new). */
async function stageChunk(pool: pg.Pool, source: string, records: StagedRecord[]): Promise<string[]> {
  if (records.length === 0) return [];
  const values: unknown[] = [];
  const tuples = records
    .map((r, i) => {
      const base = i * 3;
      values.push(r.externalId, JSON.stringify(r.payload), r.contentHash);
      return `($${base + 1}, $${base + 2}::jsonb, $${base + 3})`;
    })
    .join(', ');

  const { rows } = await pool.query(
    `INSERT INTO project_sources (id, source, external_id, payload, content_hash, status)
     SELECT gen_random_uuid(), '${source.replace(/'/g, "''")}', v.external_id, v.payload, v.content_hash, 'new'
     FROM (VALUES ${tuples}) AS v(external_id, payload, content_hash)
     ON CONFLICT (source, external_id) DO UPDATE SET
       last_seen_at = NOW(),
       payload = CASE WHEN project_sources.content_hash IS DISTINCT FROM EXCLUDED.content_hash THEN EXCLUDED.payload ELSE project_sources.payload END,
       last_changed_at = CASE WHEN project_sources.content_hash IS DISTINCT FROM EXCLUDED.content_hash THEN NOW() ELSE project_sources.last_changed_at END,
       status = CASE WHEN project_sources.content_hash IS DISTINCT FROM EXCLUDED.content_hash AND project_sources.status != 'new' THEN 'new' ELSE project_sources.status END,
       content_hash = EXCLUDED.content_hash
     RETURNING external_id, (xmax = 0) AS was_insert, (status = 'new') AS is_new`,
    values,
  );

  return rows.filter((r) => r.was_insert === true || r.is_new === true).map((r) => r.external_id as string);
}

/**
 * Insert a chunk of new canonical projects. Returns an array aligned with
 * `chunk`: the new project id, or undefined if the row was skipped (esma
 * conflict — should not happen after resolution, but never breaks the run).
 */
async function insertProjects(pool: pg.Pool, chunk: KeyedProject[]): Promise<(string | undefined)[]> {
  const ids: string[] = [];
  const values: unknown[] = [];
  const tuples = chunk
    .map((p, i) => {
      const id = randomUUID();
      ids.push(id);
      const base = i * 18;
      values.push(
        id, p.name, p.website ?? null, p.ticker ?? null, p.chain ?? null, p.source,
        p.esmaTokenId ?? null, p.dti ?? null, p.jurisdiction ?? null, p.whitepaperUrl ?? null,
        p.category ?? null, p.marketCap ?? null, p.listedOnLcx,
        p.nameKey, p.domain, p.tickerNorm, deriveRegion(p.jurisdiction),
        JSON.stringify(p.rawPayload ?? {}),
      );
      return `($${base + 1}::uuid, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}::boolean, $${base + 14}, $${base + 15}, $${base + 16}, $${base + 17}, $${base + 18}::jsonb)`;
    })
    .join(', ');

  const { rows } = await pool.query(
    `INSERT INTO projects (id, name, website, ticker, chain, source, esma_token_id, dti,
       jurisdiction, whitepaper_url, category, market_cap, listed_on_lcx, name_key, domain, ticker_norm, region, raw)
     SELECT v.id, v.name, v.website, v.ticker, v.chain, v.source, v.esma_token_id, v.dti,
       v.jurisdiction, v.whitepaper_url, v.category, v.market_cap, v.listed_on_lcx, v.name_key, v.domain, v.ticker_norm, v.region, v.raw
     FROM (VALUES ${tuples}) AS v(id, name, website, ticker, chain, source, esma_token_id, dti,
       jurisdiction, whitepaper_url, category, market_cap, listed_on_lcx, name_key, domain, ticker_norm, region, raw)
     ON CONFLICT (esma_token_id) DO NOTHING
     RETURNING id`,
    values,
  );

  const insertedIds = new Set(rows.map((r) => r.id as string));
  return ids.map((id) => (insertedIds.has(id) ? id : undefined));
}

/** Backfill-style attach: fill missing fields on the existing project, OR listed flag. */
async function attachProjects(
  pool: pg.Pool,
  chunk: { projectId: string; incoming: KeyedProject }[],
): Promise<void> {
  const values: unknown[] = [];
  const tuples = chunk
    .map((a, i) => {
      const p = a.incoming;
      const base = i * 12;
      values.push(
        a.projectId, p.website ?? null, p.ticker ?? null, p.chain ?? null,
        p.esmaTokenId ?? null, p.dti ?? null, p.jurisdiction ?? null,
        p.whitepaperUrl ?? null, p.category ?? null, p.marketCap ?? null,
        p.listedOnLcx, p.tickerNorm,
      );
      return `($${base + 1}::uuid, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}::boolean, $${base + 12})`;
    })
    .join(', ');

  await pool.query(
    `UPDATE projects p SET
       website = COALESCE(p.website, v.website),
       ticker = COALESCE(p.ticker, v.ticker),
       ticker_norm = COALESCE(p.ticker_norm, v.ticker_norm),
       domain = COALESCE(p.domain, CASE WHEN v.website IS NOT NULL THEN split_part(regexp_replace(v.website, '^https?://(www\\.)?', ''), '/', 1) END),
       chain = COALESCE(p.chain, v.chain),
       esma_token_id = COALESCE(p.esma_token_id, v.esma_token_id),
       dti = COALESCE(p.dti, v.dti),
       jurisdiction = COALESCE(p.jurisdiction, v.jurisdiction),
       whitepaper_url = COALESCE(p.whitepaper_url, v.whitepaper_url),
       category = COALESCE(p.category, v.category),
       market_cap = COALESCE(p.market_cap, v.market_cap),
       listed_on_lcx = p.listed_on_lcx OR v.listed_on_lcx,
       updated_at = NOW()
     FROM (VALUES ${tuples}) AS v(id, website, ticker, chain, esma_token_id, dti,
       jurisdiction, whitepaper_url, category, market_cap, listed_on_lcx, ticker_norm)
     WHERE p.id = v.id`,
    values,
  );
}
