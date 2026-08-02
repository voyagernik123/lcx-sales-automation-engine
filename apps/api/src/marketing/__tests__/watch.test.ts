import { readFileSync } from 'node:fs';
import type pg from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_SOURCE_BYTES,
  REGULATOR_FEEDS_NOT_WIRED,
  REGULATOR_SPINE_SOURCES,
  WATCH_SOURCES,
  _resetNewsSpineProbe,
  classifySpineWindow,
  classifyXmlResponse,
  fetchWarningSitemap,
  newsSpineExists,
  parseFmaWarningLoc,
  parseSitemapUrlset,
  readCompetitorNarrative,
  readRegulatorWatch,
  runWarningWatch,
  scanWarningEntries,
  watchRefusal,
  watchRefusalCodes,
  withinOneEdit,
  type WatchTerm,
} from '../watch.js';

/**
 * M6 THE WATCH. Every test below is written against a specific way the watch
 * could lie: by reporting a bot wall as silence, by dating a warning from a CMS
 * timestamp, by calling a de/en URL pair two warnings, by reporting a clean scan
 * when nothing was being watched for, or by rendering an empty register as good
 * news.
 *
 * The FMA fixture is real. It is a trimmed excerpt of
 * https://www.fma-li.li/sitemap.warning_entry.xml as served on 2026-08-02
 * (HTTP 200, text/xml, 21,513 bytes, 110 <loc> entries), including the entry
 * that makes this whole lane worth building: 205, warning-lcxairdrop-dot-com.
 */
const FMA_WARNING_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" >`
  + `<url><loc>https://www.fma-li.li/de/warning/warnung-mexc-dot-com-61</loc><lastmod>2024-09-02T08:30:14+00:00</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`
  + `<url><loc>https://www.fma-li.li/en/warning/warning-mexc-dot-com-61</loc><lastmod>2024-09-02T08:30:14+00:00</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`
  + `<url><loc>https://www.fma-li.li/de/warning/warnung-lcxairdrop-dot-com-205</loc><lastmod>2024-09-02T08:29:31+00:00</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`
  + `<url><loc>https://www.fma-li.li/en/warning/warning-lcxairdrop-dot-com-205</loc><lastmod>2024-09-02T08:29:31+00:00</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`
  + `<url><loc>https://www.fma-li.li/en/warning/warning-identity-misuse-to-the-detriment-of-sigma-kreditbank-ag-1654</loc><lastmod>2026-06-11T09:12:00+00:00</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`
  + `<url><loc>https://www.fma-li.li/en/warning/note-investments-in-physical-precious-metals-1610</loc><lastmod>2026-01-20T07:00:00+00:00</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`
  + `<url><loc>https://www.fma-li.li/en/warning/warning-www-dot-swissforexgroup-dot-com-1585</loc><lastmod>2025-11-03T10:00:00+00:00</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`
  + `<url><loc>https://www.fma-li.li/en/warning/warning-https-wydencapitalbg-dot-com-1665</loc><lastmod>2026-07-29T14:38:54+00:00</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`
  + `</urlset>`;

const LCX_TERM: WatchTerm = { term: 'lcx', kind: 'own_brand', label: 'LCX AG' };

/* ── §1 the registry, and its ratchet ───────────────────────────────────── */

describe('the source registry is keyless by construction', () => {
  it('every source is declared credential-free', () => {
    for (const def of Object.values(WATCH_SOURCES)) {
      // Typed as literal `false`, so a keyed source cannot be added without a
      // typecheck failure. Asserted at runtime too, for the reader.
      expect(def.credentialRequired, `${def.id} claims to need a credential`).toBe(false);
    }
  });

  it('every source states what it cannot see', () => {
    for (const def of Object.values(WATCH_SOURCES)) {
      expect(def.couldNotSee.length, `${def.id} declares no blind spot`).toBeGreaterThan(0);
      expect(def.couldSee.length, `${def.id} declares nothing it can see`).toBeGreaterThan(0);
    }
  });

  it('points at the FMA warning sitemap that was actually verified', () => {
    expect(WATCH_SOURCES.fma_warning_sitemap.locator).toBe(
      'https://www.fma-li.li/sitemap.warning_entry.xml',
    );
    expect(WATCH_SOURCES.fma_warning_sitemap.verifiedHttpStatus).toBe(200);
    expect(WATCH_SOURCES.fma_warning_sitemap.verifiedBytes).toBe(21_513);
  });

  it('every refusal code cites a rule, so no refusal can be a bare warning', () => {
    const codes = watchRefusalCodes();
    expect(codes.length).toBeGreaterThan(15);
    for (const code of codes) {
      const r = watchRefusal(code, 'probe sentence');
      expect(r.rule, `${code} cites no rule`).toBeTruthy();
      expect(r.rule.length, `${code} cites a rule too short to be one`).toBeGreaterThan(40);
    }
  });

  it('a refusal produced by the fetch layer carries both a sentence and a rule', () => {
    const outcome = classifyXmlResponse({
      sourceId: 'fma_warning_sitemap',
      httpStatus: 503,
      body: '',
      hadPriorSnapshot: false,
      fetchedAt: '2026-08-02T00:00:00Z',
    });
    expect(outcome.state).toBe('unknown');
    if (outcome.state === 'unknown') {
      expect(outcome.refusal.rule.length).toBeGreaterThan(40);
      expect(outcome.refusal.sentence.length).toBeGreaterThan(20);
    }
  });
});

describe('the regulator source names track the ingest this module reads', () => {
  const newsSource = readFileSync(new URL('../../connectors/news.ts', import.meta.url), 'utf8');

  it('every regulator source name exists in connectors/news.ts', () => {
    for (const s of REGULATOR_SPINE_SOURCES) {
      expect(newsSource, `source '${s}' is not produced by connectors/news.ts`).toContain(
        `source: '${s}'`,
      );
    }
  });

  it('FMA really is absent from the ingest, which is why the sitemap watch exists', () => {
    expect(newsSource).not.toContain('fma-li');
    const fma = REGULATOR_FEEDS_NOT_WIRED.find((r) => r.authority.startsWith('FMA'));
    expect(fma?.feed).toBeNull();
  });

  it('the EBA is named as unwired rather than quietly missing', () => {
    const eba = REGULATOR_FEEDS_NOT_WIRED.find((r) => r.authority.includes('Banking'));
    expect(eba?.feed).toBe('https://www.eba.europa.eu/rss.xml');
    expect(newsSource).not.toContain('eba.europa.eu');
  });
});

/* ── §2 the tri-state, tested against the failure modes that were observed ── */

describe('a success status with no content is unknown, never silence', () => {
  const base = { sourceId: 'fma_warning_sitemap' as const, hadPriorSnapshot: false, fetchedAt: '2026-08-02T00:00:00Z' };

  it('HTTP 202 with zero bytes — the Binance bot-wall shape', () => {
    const out = classifyXmlResponse({ ...base, httpStatus: 202, body: '' });
    expect(out.state).toBe('unknown');
    if (out.state === 'unknown') expect(out.refusal.code).toBe('WATCH_SOURCE_EMPTY_BODY');
  });

  it('HTTP 200 with an HTML body — the ESMA /press-news/esma-news/rss shape', () => {
    const out = classifyXmlResponse({ ...base, httpStatus: 200, body: '<!doctype html><html><body>news</body></html>' });
    expect(out.state).toBe('unknown');
    if (out.state === 'unknown') expect(out.refusal.code).toBe('WATCH_SOURCE_NOT_XML');
  });

  it('a non-2xx is unreachable, not empty', () => {
    const out = classifyXmlResponse({ ...base, httpStatus: 404, body: '<urlset/>' });
    expect(out.state).toBe('unknown');
    if (out.state === 'unknown') expect(out.refusal.code).toBe('WATCH_SOURCE_UNREACHABLE');
  });

  it('an oversize body is refused rather than parsed', () => {
    const out = classifyXmlResponse({ ...base, httpStatus: 200, body: `<urlset>${'x'.repeat(MAX_SOURCE_BYTES)}</urlset>` });
    expect(out.state).toBe('unknown');
    if (out.state === 'unknown') expect(out.refusal.code).toBe('WATCH_SOURCE_OVERSIZE');
  });

  it('"unchanged" means nothing when no previous copy is held', () => {
    const cold = classifyXmlResponse({ ...base, httpStatus: 304, body: '' });
    expect(cold.state).toBe('unknown');
    if (cold.state === 'unknown') expect(cold.refusal.code).toBe('WATCH_UNCHANGED_WITHOUT_PRIOR');

    const warm = classifyXmlResponse({ ...base, hadPriorSnapshot: true, httpStatus: 304, body: '' });
    expect(warm.state).toBe('no_data_confirmed');
  });

  it('a real sitemap body is data', () => {
    const out = classifyXmlResponse({ ...base, httpStatus: 200, body: FMA_WARNING_FIXTURE });
    expect(out.state).toBe('data');
  });
});

/* ── §3 the sitemap, and the date it refuses to invent ──────────────────── */

describe('sitemap parsing keeps lastmod as lastmod', () => {
  it('reads every entry and never names a publication date', () => {
    const entries = parseSitemapUrlset(FMA_WARNING_FIXTURE);
    expect(entries).not.toBeNull();
    expect(entries).toHaveLength(8);
    expect(entries?.[0].sitemapLastmod).toBe('2024-09-02T08:30:14+00:00');
    expect(entries?.[0].priority).toBe(1.0);
    for (const e of entries ?? []) {
      expect(Object.keys(e)).not.toContain('publishedAt');
      expect(Object.keys(e)).not.toContain('published_at');
    }
  });

  it('returns null — not an empty list — when the body is not a urlset', () => {
    expect(parseSitemapUrlset('<html><body>404</body></html>')).toBeNull();
    expect(parseSitemapUrlset('<sitemapindex><sitemap><loc>x</loc></sitemap></sitemapindex>')).toBeNull();
  });

  it('decodes the -dot- obfuscation FMA writes domains with', () => {
    const e = parseFmaWarningLoc('https://www.fma-li.li/en/warning/warning-lcxairdrop-dot-com-205');
    expect(e?.entryId).toBe('205');
    expect(e?.lang).toBe('en');
    expect(e?.kind).toBe('warning');
    expect(e?.tokens).toEqual(['lcxairdrop.com']);
  });

  it('reads the German prefix as the same kind', () => {
    const e = parseFmaWarningLoc('https://www.fma-li.li/de/warning/warnung-lcxairdrop-dot-com-205');
    expect(e?.kind).toBe('warning');
    expect(e?.entryId).toBe('205');
  });

  it('refuses a loc it cannot decompose instead of guessing', () => {
    expect(parseFmaWarningLoc('https://www.fma-li.li/en/news/some-news-1662')).toBeNull();
    expect(parseFmaWarningLoc('https://www.fma-li.li/en/warning/warning-no-trailing-id')).toBeNull();
  });
});

/* ── §4 the match ───────────────────────────────────────────────────────── */

describe('scanning FMA warnings for LCX', () => {
  const entries = parseSitemapUrlset(FMA_WARNING_FIXTURE) ?? [];

  it('finds the real LCX impersonation warning FMA has already published', () => {
    const scan = scanWarningEntries(entries, [LCX_TERM]);
    expect(scan.usable).toBe(true);
    expect(scan.matches).toHaveLength(1);
    const m = scan.matches[0];
    expect(m.entryId).toBe('205');
    expect(m.matchedToken).toBe('lcxairdrop.com');
    expect(m.reason).toBe('substring');
    expect(m.severity).toBe('act_now');
    expect(m.url).toContain('/en/warning/');
  });

  it('collapses the de/en pair into one warning, not two', () => {
    const scan = scanWarningEntries(entries, [LCX_TERM]);
    expect(scan.locsRead).toBe(8);
    expect(scan.entriesScanned).toBe(6);
    expect(scan.matches[0].urls).toHaveLength(2);
    expect(scan.matches[0].urls.some((u) => u.includes('/de/'))).toBe(true);
  });

  it('admits it never read the warning, and that lastmod is not a publication date', () => {
    const codes = scanWarningEntries(entries, [LCX_TERM]).matches[0].refusals.map((r) => r.code);
    expect(codes).toContain('WATCH_WARNING_BODY_NOT_READ');
    expect(codes).toContain('WATCH_SITEMAP_LASTMOD_IS_NOT_PUBLICATION');
  });

  it('says the register it scanned is not the whole register', () => {
    const scan = scanWarningEntries(entries, [LCX_TERM]);
    expect(scan.refusals.map((r) => r.code)).toContain('WATCH_WARNING_REGISTER_NOT_EXHAUSTIVE');
  });

  it('cannot see a name that appears only in a warning body, and does not pretend to', () => {
    // Entry 1654 is FMA's identity-misuse warning for Sigma Kreditbank. Nothing
    // in its slug says "bank fraud in Liechtenstein", and if a future warning
    // named LCX only in its text, this scan would miss it.
    const scan = scanWarningEntries(entries, [{ term: 'liechtenstein', kind: 'partner', label: 'LI entities' }]);
    expect(scan.matches).toHaveLength(0);
    expect(WATCH_SOURCES.fma_warning_sitemap.couldNotSee.join(' ')).toContain('body');
  });

  it('refuses a clean result when nothing was being watched for', () => {
    const scan = scanWarningEntries(entries, []);
    expect(scan.usable).toBe(false);
    expect(scan.matches).toHaveLength(0);
    expect(scan.refusals.map((r) => r.code)).toContain('WATCH_WATCH_TERMS_EMPTY');
  });

  it('catches a confusable lookalike, and grades it as a reason to look', () => {
    const lookalike = parseSitemapUrlset(
      `<urlset><url><loc>https://www.fma-li.li/en/warning/warning-1cx-exchange-dot-net-1700</loc><lastmod>2026-07-30T00:00:00+00:00</lastmod></url></urlset>`,
    ) ?? [];
    const scan = scanWarningEntries(lookalike, [LCX_TERM]);
    expect(scan.matches).toHaveLength(1);
    expect(scan.matches[0].reason).toBe('lookalike_token');
  });

  it('grades a partner or asset hit as assess, not act now', () => {
    const scan = scanWarningEntries(entries, [{ term: 'mexc', kind: 'listed_asset', label: 'MEXC' }]);
    expect(scan.matches).toHaveLength(1);
    expect(scan.matches[0].severity).toBe('assess');
    expect(scan.matches[0].reason).toBe('exact_token');
  });

  it('puts own-brand hits above everything else', () => {
    const scan = scanWarningEntries(entries, [
      { term: 'mexc', kind: 'listed_asset', label: 'MEXC' },
      LCX_TERM,
    ]);
    expect(scan.matches[0].matchedTermKind).toBe('own_brand');
  });

  it('reports locs it could not decompose rather than dropping them', () => {
    const mixed = parseSitemapUrlset(
      `<urlset><url><loc>https://www.fma-li.li/en/news/fma-note-1</loc></url></urlset>`,
    ) ?? [];
    const scan = scanWarningEntries(mixed, [LCX_TERM]);
    expect(scan.locsUnparsed).toEqual(['https://www.fma-li.li/en/news/fma-note-1']);
  });
});

describe('withinOneEdit', () => {
  it('accepts one substitution, insertion or deletion and rejects two', () => {
    expect(withinOneEdit('lcx', 'lcx')).toBe(true);
    expect(withinOneEdit('lcx', 'lex')).toBe(true);
    expect(withinOneEdit('lcx', 'lcxx')).toBe(true);
    expect(withinOneEdit('lcx', 'cx')).toBe(true);
    expect(withinOneEdit('lcx', 'abc')).toBe(false);
    expect(withinOneEdit('lcx', 'lcxyz')).toBe(false);
  });
});

/* ── §5 the fetch, without a network ────────────────────────────────────── */

describe('the warning watch degrades honestly', () => {
  it('a transport failure is unknown with no scan at all', async () => {
    const report = await runWarningWatch([LCX_TERM], {
      fetcher: async () => {
        throw new Error('ENOTFOUND www.fma-li.li');
      },
    });
    expect(report.window.state).toBe('unknown');
    expect(report.scan).toBeNull();
    expect(report.window.refusals[0].code).toBe('WATCH_SOURCE_UNREACHABLE');
  });

  it('an empty urlset is confirmed-empty, which is not the same as unknown', async () => {
    const out = await fetchWarningSitemap({
      fetcher: async () => ({ httpStatus: 200, body: '<urlset></urlset>' }),
    });
    expect(out.state).toBe('no_data_confirmed');
  });

  it('a good fetch carries the grade and the lower-bound flag', async () => {
    const report = await runWarningWatch([LCX_TERM], {
      fetcher: async () => ({ httpStatus: 200, body: FMA_WARNING_FIXTURE }),
    });
    expect(report.window.state).toBe('data');
    expect(report.window.grade).toBe('A3');
    expect(report.window.countsAreLowerBound).toBe(true);
    expect(report.scan?.matches).toHaveLength(1);
  });
});

/* ── §6 the news spine: quiet versus broken ─────────────────────────────── */

describe('an empty window is only silence when the ingest is provably alive', () => {
  const now = new Date('2026-08-02T12:00:00Z');
  const base = { sourceId: 'news_spine_regulator' as const, livenessHours: 24, now };

  it('rows present is data', () => {
    const v = classifySpineWindow({ ...base, rowCount: 3, spineMaxCreatedAt: null, sourceRowsEver: 0 });
    expect(v.state).toBe('data');
  });

  it('no rows, a fresh ingest and prior history is genuinely quiet', () => {
    const v = classifySpineWindow({
      ...base,
      rowCount: 0,
      spineMaxCreatedAt: '2026-08-02T11:00:00Z',
      sourceRowsEver: 412,
    });
    expect(v.state).toBe('no_data_confirmed');
    expect(v.refusal).toBeNull();
  });

  it('no rows and a stale ingest is a broken pipeline, not a quiet regulator', () => {
    const v = classifySpineWindow({
      ...base,
      rowCount: 0,
      spineMaxCreatedAt: '2026-07-01T00:00:00Z',
      sourceRowsEver: 412,
    });
    expect(v.state).toBe('unknown');
    expect(v.refusal?.code).toBe('WATCH_NEWS_SPINE_SILENT');
  });

  it('no rows and no history from these sources is unknown even when the ingest is alive', () => {
    const v = classifySpineWindow({
      ...base,
      rowCount: 0,
      spineMaxCreatedAt: '2026-08-02T11:59:00Z',
      sourceRowsEver: 0,
    });
    expect(v.state).toBe('unknown');
    expect(v.refusal?.code).toBe('WATCH_NEWS_SPINE_SILENT');
  });
});

function fakePool(handler: (sql: string, params?: unknown[]) => unknown): pg.Pool {
  return {
    query: async (sql: string, params?: unknown[]) => handler(sql, params),
  } as unknown as pg.Pool;
}

describe('reading the spine', () => {
  beforeEach(() => {
    _resetNewsSpineProbe();
  });

  it('refuses when migration 0025 has not been applied', async () => {
    const report = await readRegulatorWatch(fakePool(() => ({ rows: [{ ok: false }] })));
    expect(report.window.state).toBe('unknown');
    expect(report.window.refusals.map((r) => r.code)).toContain('WATCH_NEWS_SPINE_ABSENT');
    expect(report.itemsObservedInWindow).toBe(0);
  });

  it('does not permanently cache a failed existence probe', async () => {
    let calls = 0;
    const pool = fakePool(() => {
      calls++;
      if (calls === 1) throw new Error('connection reset');
      return { rows: [{ ok: true }] };
    });
    expect(await newsSpineExists(pool)).toBeNull();
    expect(await newsSpineExists(pool)).toBe(true);
  });

  it('turns an unreadable spine into a refusal, not an empty list', async () => {
    const pool = fakePool((sql) => {
      if (sql.includes('to_regclass')) return { rows: [{ ok: true }] };
      throw new Error('relation dropped mid-query');
    });
    const report = await readRegulatorWatch(pool);
    expect(report.window.state).toBe('unknown');
    expect(report.window.refusals.map((r) => r.code)).toContain('WATCH_NEWS_SPINE_UNREADABLE');
  });

  it('reads regulator items and never calls the count a total', async () => {
    const pool = fakePool((sql) => {
      if (sql.includes('to_regclass')) return { rows: [{ ok: true }] };
      return {
        rows: [
          {
            rows: [
              { source: 'esma', title: 'ESMA calls on firms to finalise preparations', url: 'https://esma/x', at: '2026-08-01T09:00:00Z', tickers: [] },
              { source: 'sec', title: 'SEC charges an unregistered platform', url: null, at: '2026-07-31T09:00:00Z', tickers: ['BTC'] },
            ],
            spine_max_created_at: '2026-08-02T11:00:00Z',
            source_rows_ever: 900,
          },
        ],
      };
    });
    const report = await readRegulatorWatch(pool, { now: new Date('2026-08-02T12:00:00Z') });
    expect(report.window.state).toBe('data');
    expect(report.items).toHaveLength(2);
    expect(report.itemsObservedInWindow).toBe(2);
    expect(report.window.countsAreLowerBound).toBe(true);
    const codes = report.window.refusals.map((r) => r.code);
    expect(codes).toContain('WATCH_FEED_ITEM_CAP');
    expect(codes).toContain('WATCH_REGULATOR_FEED_NOT_WIRED');
    expect(report.notWired.map((n) => n.authority)).toContain('FMA Liechtenstein');
  });
});

/* ── §7 competitors: publishing, never performance ──────────────────────── */

describe('competitor narrative', () => {
  beforeEach(() => {
    _resetNewsSpineProbe();
  });

  it('refuses an empty register instead of showing a clean board', async () => {
    const report = await readCompetitorNarrative(fakePool(() => ({ rows: [{ ok: true }] })), []);
    expect(report.usable).toBe(false);
    expect(report.rows).toHaveLength(0);
    expect(report.refusals.map((r) => r.code)).toContain('WATCH_COMPETITOR_REGISTER_EMPTY');
  });

  it('states on every window that this is coverage, not performance', async () => {
    const pool = fakePool((sql) => {
      if (sql.includes('to_regclass')) return { rows: [{ ok: true }] };
      return { rows: [{ rows: [], spine_max_created_at: '2026-08-02T11:00:00Z', source_rows_ever: 5000 }] };
    });
    const report = await readCompetitorNarrative(pool, [{ name: 'Kraken', aliases: [] }], {
      now: new Date('2026-08-02T12:00:00Z'),
    });
    const codes = report.refusals.map((r) => r.code);
    expect(codes).toContain('WATCH_COMPETITOR_NEWSROOMS_UNFETCHABLE');
    expect(codes).toContain('WATCH_COMPETITOR_PERFORMANCE_UNKNOWABLE');
    expect(report.window.state).toBe('no_data_confirmed');
  });

  it('counts mentions as a lower bound and names no share of voice', async () => {
    const pool = fakePool((sql) => {
      if (sql.includes('to_regclass')) return { rows: [{ ok: true }] };
      return {
        rows: [
          {
            rows: [
              { source: 'coindesk', title: 'Kraken expands in Europe', url: 'https://cd/1', at: '2026-08-01T00:00:00Z', tickers: [] },
              { source: 'theblock', title: 'Kraken hires a compliance chief', url: 'https://tb/2', at: '2026-07-30T00:00:00Z', tickers: [] },
            ],
            spine_max_created_at: '2026-08-02T11:00:00Z',
            source_rows_ever: 5000,
          },
        ],
      };
    });
    const report = await readCompetitorNarrative(pool, [{ name: 'Kraken', aliases: ['Payward'] }], {
      now: new Date('2026-08-02T12:00:00Z'),
    });
    expect(report.rows[0].mentionsObservedInWindow).toBe(2);
    expect(report.rows[0].sourcesObserved).toEqual(['coindesk', 'theblock']);
    expect(report.window.countsAreLowerBound).toBe(true);
    const keys = Object.keys(report.rows[0]);
    for (const forbidden of ['shareOfVoice', 'sentiment', 'engagementRate', 'reach', 'impressions']) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('escapes LIKE metacharacters so a name cannot become a wildcard', async () => {
    const seen: unknown[][] = [];
    const pool = fakePool((sql, params) => {
      if (sql.includes('to_regclass')) return { rows: [{ ok: true }] };
      if (params) seen.push(params);
      return { rows: [{ rows: [], spine_max_created_at: '2026-08-02T11:00:00Z', source_rows_ever: 1 }] };
    });
    await readCompetitorNarrative(pool, [{ name: '100%_pure', aliases: [] }], {
      now: new Date('2026-08-02T12:00:00Z'),
    });
    expect(seen[0]?.[3]).toEqual(['%100\\%\\_pure%']);
  });

  it('says a term was never searched for rather than reporting zero mentions', async () => {
    const pool = fakePool((sql) => {
      if (sql.includes('to_regclass')) return { rows: [{ ok: true }] };
      return { rows: [{ rows: [], spine_max_created_at: '2026-08-02T11:00:00Z', source_rows_ever: 1 }] };
    });
    const report = await readCompetitorNarrative(pool, [{ name: 'ab', aliases: [] }], {
      now: new Date('2026-08-02T12:00:00Z'),
    });
    expect(report.rows[0].refusals.map((r) => r.code)).toContain('WATCH_COMPETITOR_REGISTER_EMPTY');
    expect(report.window.state).toBe('unknown');
  });
});
