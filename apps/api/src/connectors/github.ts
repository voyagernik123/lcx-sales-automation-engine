import type pg from 'pg';
import { insertObservations, type ObservationRow } from '../intel/observations.js';
import { dueTargets, markOk, markError } from '../intel/collect.js';

/**
 * GitHub connector (free). Bounded per run — the unauthenticated limit is 60/hr,
 * so we take the highest-priority stale/missing projects that have a resolved
 * github_repo. Set GITHUB_TOKEN to raise the limit to 5000/hr. Yields stars,
 * forks, open issues, last-push and a 30-day commit count — the dev-velocity
 * signal (real team vs. abandonware).
 */

interface Repo {
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  pushed_at?: string;
  subscribers_count?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function collectGithub(
  pool: pg.Pool,
  limit = 40,
): Promise<{ attempted: number; ok: number; observations: number; rateLimited: boolean }> {
  const targets = await dueTargets(pool, 'github', limit, 'github_repo');
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = { accept: 'application/vnd.github+json' };
  if (token) headers.authorization = `Bearer ${token}`;

  let ok = 0;
  let observations = 0;
  let attempted = 0;
  let rateLimited = false;
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

  for (const t of targets) {
    if (!t.identifier) continue;
    // Only ever fetch a well-formed "owner/repo" — never interpolate arbitrary
    // strings into the API path (defends against path traversal / query smuggling).
    if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(t.identifier)) {
      await markError(pool, 'project', t.id, 'github', 'invalid repo identifier');
      continue;
    }
    attempted++;
    try {
      const repoRes = await fetch(`https://api.github.com/repos/${t.identifier}`, { headers });
      if (repoRes.status === 403 || repoRes.status === 429) {
        rateLimited = true;
        await markError(pool, 'project', t.id, 'github', `rate limited (${repoRes.status})`);
        break;
      }
      if (repoRes.status === 404) {
        await markError(pool, 'project', t.id, 'github', 'repo not found');
        continue;
      }
      if (!repoRes.ok) {
        await markError(pool, 'project', t.id, 'github', `http ${repoRes.status}`);
        continue;
      }
      const repo = (await repoRes.json()) as Repo;

      // 30-day commit count (capped at 100 for a single cheap page).
      let commits30d: number | null = null;
      const commitsRes = await fetch(
        `https://api.github.com/repos/${t.identifier}/commits?since=${since}&per_page=100`,
        { headers },
      );
      if (commitsRes.ok) {
        const arr = (await commitsRes.json()) as unknown[];
        commits30d = Array.isArray(arr) ? arr.length : null;
      } else if (commitsRes.status === 403) {
        rateLimited = true;
      }

      const now = new Date();
      const url = `https://github.com/${t.identifier}`;
      const obsRows: ObservationRow[] = [];
      const add = (predicate: string, value: unknown, valueNum: number | null, unit: string | null) => {
        if (value === null || value === undefined) return;
        obsRows.push({
          subjectType: 'project', subjectId: t.id, predicate, value, valueNum, unit,
          source: 'github', sourceUrl: url, reliability: 'A', credibility: 2, observedAt: now,
        });
      };
      add('github_stars', repo.stargazers_count ?? null, repo.stargazers_count ?? null, null);
      add('github_forks', repo.forks_count ?? null, repo.forks_count ?? null, null);
      add('github_open_issues', repo.open_issues_count ?? null, repo.open_issues_count ?? null, null);
      if (repo.pushed_at) add('github_last_push', repo.pushed_at, null, null);
      add('github_commits_30d', commits30d, commits30d, null);

      observations += await insertObservations(pool, obsRows);
      await markOk(pool, 'project', t.id, 'github');
      ok++;
      await sleep(120);
    } catch (err) {
      await markError(pool, 'project', t.id, 'github', err instanceof Error ? err.message : 'error');
    }
  }

  return { attempted, ok, observations, rateLimited };
}
