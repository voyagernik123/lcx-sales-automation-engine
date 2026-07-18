import type pg from 'pg';

/** External handles that let the free connectors target a project. */
export type IdentifierKind =
  | 'coinpaprika_id' | 'defillama_slug' | 'gecko_id' | 'cmc_id' | 'github_repo' | 'twitter' | 'reddit';

export async function setIdentifier(
  pool: pg.Pool,
  projectId: string,
  kind: IdentifierKind,
  value: string,
  source = 'internal',
  confidence = 60,
): Promise<void> {
  if (!value) return;
  await pool.query(
    `INSERT INTO project_identifiers (project_id, kind, value, source, confidence)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (project_id, kind)
     DO UPDATE SET value=EXCLUDED.value, source=EXCLUDED.source, confidence=EXCLUDED.confidence, updated_at=NOW()`,
    [projectId, kind, value, source, confidence],
  );
}

export async function getIdentifiers(pool: pg.Pool, projectId: string): Promise<Record<string, string>> {
  const { rows } = await pool.query(`SELECT kind, value FROM project_identifiers WHERE project_id=$1`, [projectId]);
  return Object.fromEntries((rows as { kind: string; value: string }[]).map((r) => [r.kind, r.value]));
}

/**
 * Seed coinpaprika_id from projects.raw.id (the enrichment payload is CoinPaprika
 * shaped). Bulk + idempotent — the anchor identifier the detail connector needs.
 */
export async function resolveCoinpaprikaIds(pool: pg.Pool): Promise<{ resolved: number }> {
  const res = await pool.query(
    `INSERT INTO project_identifiers (project_id, kind, value, source, confidence)
     SELECT id, 'coinpaprika_id', raw->>'id', 'coinpaprika', 90
     FROM projects
     WHERE raw ? 'id' AND coalesce(raw->>'id','') <> ''
     ON CONFLICT (project_id, kind) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,
  );
  return { resolved: res.rowCount ?? 0 };
}

/** Normalize a GitHub URL/handle to `owner/name`, or null if not a repo URL. */
export function normalizeGithubRepo(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/github\.com\/([^/\s]+\/[^/\s?#]+)/i);
  if (!m) return null;
  return m[1].replace(/\.git$/, '');
}

/** Normalize a Twitter/X handle from a URL or @handle. */
export function normalizeTwitter(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})/i);
  if (m) return m[1];
  const at = url.match(/^@?([A-Za-z0-9_]{1,15})$/);
  return at ? at[1] : null;
}
