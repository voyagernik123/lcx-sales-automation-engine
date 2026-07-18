import type pg from 'pg';
import { insertObservations, type ObservationRow } from '../intel/observations.js';
import { setIdentifier, normalizeGithubRepo, normalizeTwitter } from '../intel/identifiers.js';
import { dueTargets, markOk, markError } from '../intel/collect.js';

/**
 * CoinPaprika /coins/{id} connector (free). Bounded per run to respect the free
 * tier — pulls the highest-priority stale/missing projects that already have a
 * coinpaprika_id. Yields team size, development status, tags and (crucially) the
 * GitHub repo + socials, which unlock the GitHub connector. Stops early on a
 * rate-limit / paywall response.
 */

interface LinkExt { type?: string; url?: string; stats?: Record<string, unknown> }
interface CoinDetail {
  team?: unknown[];
  tags?: { name?: string }[];
  development_status?: string;
  open_source?: boolean;
  whitepaper?: { link?: string };
  links_extended?: LinkExt[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function collectCoinpaprikaDetail(
  pool: pg.Pool,
  limit = 60,
): Promise<{ attempted: number; ok: number; observations: number; rateLimited: boolean }> {
  const targets = await dueTargets(pool, 'coinpaprika_detail', limit, 'coinpaprika_id');
  let ok = 0;
  let observations = 0;
  let attempted = 0;
  let rateLimited = false;

  for (const t of targets) {
    if (!t.identifier) continue;
    attempted++;
    try {
      const res = await fetch(`https://api.coinpaprika.com/v1/coins/${encodeURIComponent(t.identifier)}`, {
        headers: { accept: 'application/json' },
      });
      if (res.status === 402 || res.status === 429) {
        rateLimited = true;
        await markError(pool, 'project', t.id, 'coinpaprika_detail', `rate limited (${res.status})`);
        break;
      }
      if (!res.ok) {
        await markError(pool, 'project', t.id, 'coinpaprika_detail', `http ${res.status}`);
        continue;
      }
      const d = (await res.json()) as CoinDetail;
      const now = new Date();
      const url = `https://coinpaprika.com/coin/${t.identifier}/`;
      const obsRows: ObservationRow[] = [];
      const add = (predicate: string, value: unknown, valueNum: number | null, unit: string | null) => {
        if (value === null || value === undefined) return;
        obsRows.push({
          subjectType: 'project', subjectId: t.id, predicate, value, valueNum, unit,
          source: 'coinpaprika', sourceUrl: url, reliability: 'B', credibility: 2, observedAt: now,
        });
      };
      const teamSize = Array.isArray(d.team) ? d.team.length : null;
      add('team_size', teamSize, teamSize, null);
      if (d.development_status) add('dev_status', d.development_status, null, null);
      if (typeof d.open_source === 'boolean') add('open_source', d.open_source, d.open_source ? 1 : 0, null);
      add('has_whitepaper', !!d.whitepaper?.link, d.whitepaper?.link ? 1 : 0, null);
      const tags = (d.tags ?? []).map((x) => x.name).filter(Boolean) as string[];
      if (tags.length) {
        add('tag_count', tags.length, tags.length, null);
        add('tags', tags.slice(0, 12), null, null);
      }

      observations += await insertObservations(pool, obsRows);

      // Resolve external handles from links_extended.
      const links = d.links_extended ?? [];
      const github = normalizeGithubRepo(links.find((l) => l.type === 'source_code')?.url);
      const twitter = normalizeTwitter(links.find((l) => l.type === 'twitter')?.url);
      const reddit = links.find((l) => l.type === 'reddit')?.url;
      if (github) await setIdentifier(pool, t.id, 'github_repo', github, 'coinpaprika', 80);
      if (twitter) await setIdentifier(pool, t.id, 'twitter', twitter, 'coinpaprika', 80);
      if (reddit) await setIdentifier(pool, t.id, 'reddit', reddit, 'coinpaprika', 70);

      await markOk(pool, 'project', t.id, 'coinpaprika_detail');
      ok++;
      await sleep(280); // ~3.5 req/s — gentle on the free tier
    } catch (err) {
      await markError(pool, 'project', t.id, 'coinpaprika_detail', err instanceof Error ? err.message : 'error');
    }
  }

  return { attempted, ok, observations, rateLimited };
}
