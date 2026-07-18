import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { getAssessment } from './alpha.js';

/**
 * Coverage Report — the analyst "initiation of coverage" per token, assembled
 * deterministically from the intelligence spine (observations + alpha + rivals
 * + contacts). One artifact that is the BD dossier, the outreach ammunition and
 * the board memo. Every number traces to a source; the narrative is generated
 * from the structured facts (no LLM, free-tier).
 */

const num = (v: unknown): number | null => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);

function momentumWord(pct: number | null): string {
  if (pct == null) return 'flat';
  if (pct >= 25) return 'surging';
  if (pct >= 8) return 'climbing';
  if (pct > -8) return 'holding';
  if (pct > -25) return 'cooling';
  return 'falling';
}
function moneyWord(v: number | null): string {
  if (v == null) return 'unknown-size';
  if (v >= 1e9) return 'large-cap';
  if (v >= 1e8) return 'mid-cap';
  if (v >= 1e7) return 'small-cap';
  return 'micro-cap';
}
const VERDICT_PHRASE: Record<string, string> = {
  list_soon: 'reads as an imminent listing candidate',
  list_later: 'reads as a credible but not-yet-imminent candidate',
  no_list: 'reads as unlikely to list near-term',
};
const MARKET_PHRASE: Record<string, string> = {
  eu: 'the EU (MiCA) path plays to LCX’s regulatory edge',
  eu_first: 'the EU (MiCA) path plays to LCX’s regulatory edge',
  us: 'a US-first path fits best',
  us_first: 'a US-first path fits best',
  dual: 'a dual EU+US path is viable',
  none: 'the venue path is still unclear',
};
const isEuPath = (m: string): boolean => m === 'eu' || m === 'eu_first' || m === 'dual';

export interface CoverageReport {
  id: string;
  name: string;
  ticker: string | null;
  website: string | null;
  band: string | null;
  listedOnLcx: boolean;
  generatedAt: string;
  thesis: string;
  approach: string;
  risks: string[];
  headline: {
    conviction: number | null;
    timingWindow: string | null;
    dealValueUsd: number | null;
    achVerdict: string | null;
    recommendedMarket: string | null;
  };
  snapshot: Record<string, number | string | null>;
  traction: Record<string, number | string | null>;
  regulatory: { euScore: number | null; usPostScore: number | null; recommendedMarket: string | null };
  competitive: { competitorCount: number; topVenues: string[]; gap: string };
  assessment: unknown;
  contacts: { name: string; title: string | null; verified: boolean }[];
  sources: { source: string; count: number; freshest: string | null }[];
}

export async function buildCoverageReport(subjectId: string): Promise<CoverageReport | null> {
  const db = getDb();

  const projRes = await db.execute(sql`
    SELECT p.id, p.name, p.ticker, p.website, p.listed_on_lcx,
           p.market_cap_usd, p.volume_24h_usd, p.price_change_30d, p.token_age_days,
           s.eu_score, s.us_post_score, s.band, s.recommended_market
    FROM projects p
    LEFT JOIN LATERAL (
      SELECT eu_score, us_post_score, band, recommended_market
      FROM scores WHERE project_id = p.id ORDER BY computed_at DESC LIMIT 1
    ) s ON true
    WHERE p.id = ${subjectId}
  `);
  const p = (projRes.rows ?? [])[0] as Record<string, unknown> | undefined;
  if (!p) return null;

  // Latest observation per predicate.
  const obsRes = await db.execute(sql`
    SELECT DISTINCT ON (predicate) predicate, value_json, value_num
    FROM observations WHERE subject_type='project' AND subject_id=${subjectId}
    ORDER BY predicate, observed_at DESC
  `);
  const o: Record<string, { value: unknown; num: number | null }> = {};
  for (const r of (obsRes.rows ?? []) as Record<string, unknown>[]) {
    o[r.predicate as string] = { value: r.value_json, num: r.value_num != null ? Number(r.value_num) : null };
  }

  const rivalsRes = await db.execute(sql`
    SELECT exchange_name FROM exchange_listings WHERE project_id=${subjectId}
    ORDER BY volume_24h_usd DESC NULLS LAST LIMIT 6
  `);
  const topVenues = (rivalsRes.rows ?? []).map((r) => (r as Record<string, unknown>).exchange_name as string);
  const competitorCount = topVenues.length
    ? Number(((await db.execute(sql`SELECT count(*) AS c FROM exchange_listings WHERE project_id=${subjectId}`)).rows![0] as Record<string, unknown>).c)
    : 0;

  const contactsRes = await db.execute(sql`
    SELECT name, title, verified FROM people WHERE project_id=${subjectId} ORDER BY verified DESC, contactability_score DESC LIMIT 6
  `);
  const contacts = (contactsRes.rows ?? []).map((r: Record<string, unknown>) => ({
    name: r.name as string, title: (r.title as string | null) ?? null, verified: !!r.verified,
  }));

  const srcRes = await db.execute(sql`
    SELECT source, count(*) AS c, max(observed_at) AS freshest
    FROM observations WHERE subject_type='project' AND subject_id=${subjectId}
    GROUP BY source ORDER BY c DESC
  `);
  const sources = (srcRes.rows ?? []).map((r: Record<string, unknown>) => ({
    source: r.source as string, count: Number(r.c), freshest: (r.freshest as string | null) ?? null,
  }));

  const assessment = (await getAssessment(subjectId)) as Record<string, unknown> | null;
  const conv = (assessment?.conviction as { score?: number } | null)?.score ?? null;
  const timing = (assessment?.timing as { window?: string } | null)?.window ?? null;
  const dealValueUsd = (assessment?.value as { usd?: number } | null)?.usd ?? null;
  const ach = (assessment?.ach as { verdict?: string } | null)?.verdict ?? null;

  const mcap = num(p.market_cap_usd);
  const mom = num(p.price_change_30d);
  const tvl = o.tvl_usd?.num ?? null;
  const listed = !!p.listed_on_lcx;
  const recMarket = (p.recommended_market as string) ?? 'none';
  const name = p.name as string;

  // Narrative — generated from the structured facts.
  const thesisParts: string[] = [];
  thesisParts.push(`${name} is a ${moneyWord(mcap)} token, ${momentumWord(mom)}${mom != null ? ` (${mom > 0 ? '+' : ''}${Math.round(mom)}% 30d)` : ''}.`);
  if (competitorCount > 0 && !listed) {
    thesisParts.push(`It trades on ${competitorCount} competitor venue${competitorCount === 1 ? '' : 's'} but not LCX — a listing gap to close.`);
  } else if (listed) {
    thesisParts.push('Already listed on LCX.');
  }
  if (ach) thesisParts.push(`On the evidence it ${VERDICT_PHRASE[ach] ?? 'is under assessment'}.`);
  thesisParts.push(`On venue strategy, ${MARKET_PHRASE[recMarket] ?? MARKET_PHRASE.none}.`);
  const thesis = thesisParts.join(' ');

  // Risks — derived flags.
  const risks: string[] = [];
  if (listed) risks.push('Already listed on LCX — re-engagement only.');
  if ((o.github_commits_30d?.num ?? null) === 0) risks.push('No development activity in the last 30 days.');
  if (o.tvl_usd == null && (num(p.volume_24h_usd) ?? 0) < 100_000) risks.push('Thin liquidity / no on-chain TVL signal.');
  if (competitorCount >= 8) risks.push('Saturated across venues — differentiation is harder.');
  if (contacts.length === 0) risks.push('No known contacts yet — no warm path.');
  if (sources.length <= 2) risks.push('Shallow data coverage — confidence is limited until more sensors run.');
  if (risks.length === 0) risks.push('No material red flags surfaced.');

  // Approach — recommended play.
  const approachParts: string[] = [];
  if (!listed) {
    approachParts.push(timing === 'hot' ? 'Move now — the window is open.' : timing === 'warming' ? 'Prioritize this week — momentum is building.' : 'Nurture — no urgent trigger yet.');
    approachParts.push(isEuPath(recMarket) ? 'Lead with the EU/MiCA regulatory advantage.' : recMarket === 'us' || recMarket === 'us_first' ? 'Frame around the US path.' : 'Lead with LCX’s regulated-venue positioning.');
    approachParts.push(contacts.length > 0 ? `Warm path available (${contacts.length} contact${contacts.length === 1 ? '' : 's'}).` : 'No warm path — open with a signal-based cold approach.');
  } else {
    approachParts.push('Focus on post-listing performance and expansion.');
  }
  const approach = approachParts.join(' ');

  return {
    id: p.id as string,
    name,
    ticker: (p.ticker as string | null) ?? null,
    website: (p.website as string | null) ?? null,
    band: (p.band as string | null) ?? null,
    listedOnLcx: listed,
    generatedAt: new Date().toISOString(),
    thesis,
    approach,
    risks,
    headline: { conviction: conv, timingWindow: timing, dealValueUsd, achVerdict: ach, recommendedMarket: recMarket },
    snapshot: {
      marketCapUsd: mcap, volume24hUsd: num(p.volume_24h_usd), priceChange30d: mom,
      tokenAgeDays: num(p.token_age_days), tvlUsd: tvl,
      category: (o.defillama_category?.value as string) ?? null, chainCount: o.chain_count?.num ?? null,
    },
    traction: {
      githubCommits30d: o.github_commits_30d?.num ?? null, githubStars: o.github_stars?.num ?? null,
      teamSize: o.team_size?.num ?? null, devStatus: (o.dev_status?.value as string) ?? null,
    },
    regulatory: { euScore: num(p.eu_score), usPostScore: num(p.us_post_score), recommendedMarket: recMarket },
    competitive: {
      competitorCount, topVenues,
      gap: listed ? 'Listed on LCX.' : competitorCount > 0 ? `On ${competitorCount} rival venue${competitorCount === 1 ? '' : 's'}, not LCX.` : 'No venue presence yet.',
    },
    assessment,
    contacts,
    sources,
  };
}
