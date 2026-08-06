import { Hono } from 'hono';
import type { Context } from 'hono';
import { getClaims } from '@lcx/shared';
import type {
  ClaimExpiryLedger,
  ErasureOutcome,
  ExportBundle,
  MarketingErasureBasis,
  MarketingRecordRow,
  MarketingWireRefusal,
  PostTimeCoverageReport,
  RetentionPosture,
  RetentionSweepReport,
  SubjectAccessResponse,
  WatchDigest,
  WatchSourceObservation,
} from '@lcx/shared';
import { frameFor } from '@lcx/shared';
import type { AuthVariables } from '../middleware/auth.js';
import { requireOperator } from '../middleware/auth.js';
import { requireApprover } from '../middleware/permissions.js';
import { getPool } from '../db/index.js';
import { env } from '../lib/env.js';
import {
  REGULATOR_FEEDS_NOT_WIRED,
  WATCH_SOURCES,
  buildClaimExpiryLedger,
  readCompetitorNarrative,
  readRegulatorWatch,
  runWarningWatch,
  type WatchTerm,
  type WatchWindow,
} from '../marketing/watch.js';
import {
  RETENTION_DPO_RULING_OUTSTANDING,
  RETENTION_INFERENCE_CAVEAT,
  RETENTION_YEARS_BASE,
  composeExportBundle,
  eraseByHandle,
  readBundleSource,
  renderBundleText,
  bundleDigest,
  retentionExpiry,
  subjectAccess,
  writeRecord,
  type BundleRequest,
  type BundleSource,
  type ClearanceReconciliation,
} from '../marketing/record.js';
import { resolveGateReference } from '../marketing/outboundGate.js';
import {
  retentionPosture,
  runRetentionClock,
} from '../marketing/retention.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  LCX MARKETING — THE WATCH, THE RECORD, AND THE CLOCK. The callers that did not
 *  exist.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *    GET  /watch                  FMA warnings, regulator spine, press narrative
 *    GET  /watch/claim-expiry     the claim-freshness ledger
 *    GET  /export/:itemId         one record, produced on demand (Art 8(2))
 *    GET  /export                 a WINDOW of records, jurisdiction-filtered
 *    GET  /gate-reference/:ref    resolve the `gate:<16 hex>` a scoped refusal hands out
 *    POST /record                 put one LCX statement on the five-year clock
 *    POST /subject-access         GDPR Art 15
 *    POST /erasure                GDPR Art 17
 *    GET  /retention              what the two clocks are doing
 *    POST /retention/run          run them, and record that it happened
 *    GET  /post-time              what fraction of the queue carries X's post date
 *
 *  WHY THIS FILE IS THE WHOLE POINT OF THE WAVE. `apps/api/src/marketing/watch.ts`
 *  is 1,811 lines and `record.ts` is 2,022, both heavily tested, and NOTHING IN
 *  `apps/api/src` IMPORTED EITHER OF THEM. `routes/marketing.ts` imports `service`,
 *  `xMail`, `outboundGate` and `abuseRegister` and stops there. So `subjectAccess`,
 *  `eraseByHandle` and `writeRecord` were dead code, `marketing_record` and both
 *  GDPR logs were permanently empty, a data subject's Art 15 request could not be
 *  answered by this product at all (Art 12(3) allows one month), and no LCX
 *  statement was ever placed on the long clock — so at day 91 the compartment
 *  retained nothing. An engine nothing calls is decoration. This is the caller.
 *
 *  `export const marketingRecordRoutes` follows the split
 *  `gpsBook`/`gpsConflict`/`gpsDelivery` uses: a separate router, nested at `'/'` inside
 *  `marketingRoutes` by `routes/marketing.ts` so every path below resolves under
 *  `/v1/marketing`, behind the compartment gate and inside the outbound-classification
 *  ratchet. `__tests__/marketingMount.test.ts` verifies that per path and per method
 *  rather than trusting this sentence.
 *
 *  ══ THERE IS NO PUBLISH PATH IN THIS FILE, AND THERE IS NOWHERE TO ADD ONE. ══
 *  There is no X API key and there never will be. Nothing here posts, stores a
 *  credential, or acts as the LCX account: a human sends by hand, outside this
 *  system, and `published_text` is what they pasted back afterwards. Every route
 *  below either READS, or WRITES A RECORD OF SOMETHING A HUMAN ALREADY DID.
 *
 *  EVERY RESPONSE TYPE IS IMPORTED FROM `@lcx/shared`, never declared here. The
 *  handler assigns its output to the shared type before returning, so an engine
 *  renaming a field fails THIS file's compile rather than the browser's render —
 *  which is the defect that broke GPS on 2026-08-01 and the reason
 *  `MARKETING_CONTRACTS_OWED` exists.
 *
 *  ATTRIBUTION IS ALWAYS `c.get('operator')`, NEVER A BODY FIELD. That is not role
 *  theatre: `access/entitlements.ts:39` grants the SHARED MACHINE KEY `operate` on
 *  every workspace, so `operate` alone would let a cron job author a compliance
 *  record or answer a subject-access request. The four acts that touch personal data
 *  or the regulatory record are `requireApprover`, and second-tier sign-in is capped
 *  at `operator` (`middleware/auth.ts:94`), so a colleague on the shared passcode can
 *  read the watch and change nothing.
 *
 *  MIGRATION-PENDING DISCIPLINE. Three migrations are relevant and they land
 *  separately: 0046 (applied), 0061 (pending — the record register and both GDPR
 *  logs), 0064 (pending — the retention run ledger). Reads degrade and say which file
 *  is missing; writes answer 503 naming it. Validation always runs BEFORE the probe,
 *  because a malformed request is malformed in every environment.
 */

const meta = () => ({ timestamp: new Date().toISOString(), version: env.version });

const VALIDATION = 'VALIDATION';

const bad = (c: Context<{ Variables: AuthVariables }>, error: string) =>
  c.json({ error, code: VALIDATION }, 400);

/** A body that is not JSON is a 400, not an unhandled throw. */
async function jsonBody(
  c: Context<{ Variables: AuthVariables }>,
): Promise<Record<string, unknown> | null> {
  try {
    const b = await c.req.json();
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function stringList(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim())
    .filter((x) => x !== '')
    .slice(0, max);
}

/** An ISO-8601 instant, or null. A bad date is null, never `new Date(NaN)`. */
function instant(v: unknown): Date | null {
  if (typeof v !== 'string' || v.trim() === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Widen an engine refusal to the wire shape.
 *
 * Structural, not a rewrite: `WatchRefusal` and `RecordRefusal` both already carry
 * `code`, `sentence` and `rule`, and the optional `ruleText`/`remedy`/`subject` are
 * copied when present. Deliberately NOT a cast — a cast would let a refusal missing
 * `rule` reach a surface that renders "the rule is undefined".
 */
function wireRefusal(r: {
  code: string; sentence: string; rule: string;
  subject?: string; ruleText?: string; remedy?: string;
}): MarketingWireRefusal {
  const out: {
    code: string; sentence: string; rule: string;
    subject?: string; ruleText?: string; remedy?: string;
  } = { code: r.code, sentence: r.sentence, rule: r.rule };
  if (r.subject !== undefined) out.subject = r.subject;
  if (r.ruleText !== undefined) out.ruleText = r.ruleText;
  if (r.remedy !== undefined) out.remedy = r.remedy;
  return out;
}

const wireRefusals = (
  rs: readonly { code: string; sentence: string; rule: string; subject?: string; ruleText?: string; remedy?: string }[],
): MarketingWireRefusal[] => rs.map(wireRefusal);

export const marketingRecordRoutes = new Hono<{ Variables: AuthVariables }>();

/* ══════════════════════════════════════════════════════════════════════════════
 *  §1 THE WATCH
 * ══════════════════════════════════════════════════════════════════════════════ */

/**
 * WHICH `InboundSourceKind` EACH WATCH SOURCE IS, so `frameFor` can build the real
 * `ObservationFrame` rather than the route inventing one.
 *
 * This mapping is the join `watch.ts` said it was waiting for: its `WatchWindow` is
 * "deliberately NOT an ObservationFrame ... when observation.ts lands, the frame is
 * constructed FROM this". observation.ts has landed. The FMA sitemap and the SEC/ESMA
 * spine items are `regulator_feed`; press items are `news_feed`, whose profile
 * already records that a 2xx with zero bytes reads as silence and that the feed list
 * is a choice made once.
 */
const WATCH_SOURCE_FRAME = {
  fma_warning_sitemap: 'regulator_feed',
  fma_news_sitemap: 'regulator_feed',
  news_spine_regulator: 'regulator_feed',
  news_spine_press: 'news_feed',
} as const;

/**
 * LCX'S OWN BRAND TERMS, AND WHY THE OTHER TWO KINDS ARE EMPTY.
 *
 * `own_brand` is a fact about LCX, so it is in code and cannot be forgotten. The
 * partner and listed-asset registers DO NOT EXIST — there is no table of partner
 * names and the embargo register is a list of assets under embargo, which is not the
 * same thing as the assets LCX lists. So those kinds are empty, `WatchTermCoverage`
 * says so on the response, and a reader learns that "no partner appears in an FMA
 * warning" means no partner was ever searched for.
 *
 * Inventing a partner list here would be worse than the gap: a scan over a guessed
 * register reports a clean result for terms nobody chose.
 *
 * The lookalike scan is why `lcx.com` and the airdrop domains matter — FMA warning
 * entry 205 is `warning-lcxairdrop-dot-com-205`, an LCX impersonation domain the
 * regulator has already warned the public about.
 */
const OWN_BRAND_TERMS: readonly WatchTerm[] = Object.freeze([
  { term: 'LCX', kind: 'own_brand', label: 'LCX AG' },
  { term: 'LCX AG', kind: 'own_brand', label: 'LCX AG' },
  { term: 'lcx.com', kind: 'own_brand', label: 'LCX AG (primary domain)' },
  { term: 'LCX Exchange', kind: 'own_brand', label: 'LCX AG (exchange)' },
]);

/**
 * The competitors the press panel looks for. Names only, and every one carries the
 * standing refusals `readCompetitorNarrative` attaches: this is press coverage ABOUT
 * these firms, not their own publishing, and it contains no engagement, reach,
 * follower or share-of-voice figure — none of which can be produced without a
 * credential that does not exist.
 */
const COMPETITOR_TERMS = Object.freeze([
  { name: 'Binance', aliases: Object.freeze(['binance']) },
  { name: 'Coinbase', aliases: Object.freeze(['coinbase']) },
  { name: 'Kraken', aliases: Object.freeze(['kraken']) },
  { name: 'Bitpanda', aliases: Object.freeze(['bitpanda']) },
  {
    name: 'Bitstamp',
    aliases: Object.freeze(['bitstamp']),
    ambiguityNote: 'short, common token — a headline match may be coincidence',
  },
]);

/** Build the wire observation for one watch source: the window plus its frame. */
function observation(w: WatchWindow): WatchSourceObservation {
  const def = WATCH_SOURCES[w.sourceId];
  return {
    sourceId: w.sourceId,
    label: def.label,
    locator: def.locator,
    state: w.state,
    fetchedAt: w.fetchedAt,
    windowFrom: w.windowFrom,
    windowTo: w.windowTo,
    httpStatus: w.httpStatus,
    bytes: w.bytes,
    grade: w.grade,
    confidence: w.confidence,
    couldSee: w.couldSee,
    couldNotSee: w.couldNotSee,
    countsAreLowerBound: w.countsAreLowerBound,
    refusals: wireRefusals(w.refusals),
    // The frame's window is the window that was actually asked for; `lastSuccessfulPollAt`
    // is this fetch only when this fetch SUCCEEDED. Passing `fetchedAt` on a failed fetch
    // would tell a panel the channel is healthy at the moment it went blind.
    frame: frameFor(
      WATCH_SOURCE_FRAME[w.sourceId],
      {
        from: w.windowFrom ?? w.fetchedAt,
        to: w.windowTo ?? w.fetchedAt,
        asOf: w.fetchedAt,
        lastSuccessfulPollAt: w.state === 'data' ? w.fetchedAt : null,
      },
      w.couldNotSee,
    ),
  };
}

/**
 * THE WATCH DIGEST.
 *
 * A DEAD FEED REPORTS THAT IT IS DEAD. Each panel's count is `number | null` and
 * `null` is emitted whenever the source's state is not `data` — so a network failure
 * renders as "could not see", never as zero warnings. `sourcesUnreadable` is the
 * one-line version of the same fact, for a header.
 *
 * The three sources are fetched CONCURRENTLY and independently: one dead source must
 * not blank the other two, which is what a sequential build with a single try/catch
 * would do.
 */
marketingRecordRoutes.get('/watch', requireOperator, async (c) => {
  const pool = getPool();
  const now = new Date();

  const [warn, reg, press] = await Promise.all([
    runWarningWatch(OWN_BRAND_TERMS, { now }),
    readRegulatorWatch(pool, { now }),
    readCompetitorNarrative(pool, COMPETITOR_TERMS, { now }),
  ]);

  const warnObs = observation(warn.window);
  const regObs = observation(reg.window);
  const pressObs = observation(press.window);

  const unreadable = [warnObs, regObs, pressObs]
    .filter((o) => o.state === 'unknown')
    .map((o) => o.sourceId);

  const termRefusals: MarketingWireRefusal[] = [
    {
      code: 'WATCH_PARTNER_REGISTER_ABSENT',
      sentence:
        'No partner names were scanned, because this product holds no register of partners. A '
        + 'partner absent from these results was never searched for.',
      rule: 'doctrine rule 3 (never claim a number you cannot observe)',
      remedy:
        'Keep a partner register the desk maintains, and pass it as watch terms. Until then treat '
        + 'the partner column as unscanned rather than clear.',
    },
    {
      code: 'WATCH_LISTED_ASSET_REGISTER_ABSENT',
      sentence:
        'No listed-asset symbols were scanned. The embargo register lists assets under embargo, '
        + 'which is not the set of assets LCX lists, so it cannot stand in for one.',
      rule: 'doctrine rule 3',
      remedy: 'Supply the listing register as watch terms.',
    },
  ];

  const data: WatchDigest = {
    asOf: now.toISOString(),
    warnings: {
      observation: warnObs,
      usable: warn.scan?.usable ?? false,
      matches: (warn.scan?.matches ?? []).map((m) => ({
        entryId: m.entryId,
        kind: m.kind,
        url: m.url,
        urls: m.urls,
        slug: m.slug,
        sitemapLastmod: m.sitemapLastmod,
        matchedTerm: m.matchedTerm,
        matchedTermKind: m.matchedTermKind,
        matchedTermLabel: m.matchedTermLabel,
        matchedToken: m.matchedToken,
        reason: m.reason,
        severity: m.severity,
        sentence: m.sentence,
        refusals: wireRefusals(m.refusals),
      })),
      // NULL, NOT 0, when the sitemap could not be read. This is the assertion the
      // whole panel turns on: `0` here says FMA published no warning naming LCX.
      matchesObserved: warn.scan === null ? null : warn.scan.matches.length,
      entriesScanned: warn.scan === null ? null : warn.scan.entriesScanned,
      locsRead: warn.scan === null ? null : warn.scan.locsRead,
      locsUnparsed: warn.scan?.locsUnparsed ?? [],
    },
    regulator: {
      observation: regObs,
      items: reg.items.map((i) => ({
        source: i.source, title: i.title, url: i.url, at: i.at, tickers: i.tickers,
      })),
      itemsObservedInWindow: reg.window.state === 'data' ? reg.itemsObservedInWindow : null,
      notWired: REGULATOR_FEEDS_NOT_WIRED,
    },
    press: {
      observation: pressObs,
      usable: press.usable,
      rows: press.rows.map((r) => ({
        name: r.name,
        mentionsObservedInWindow: r.mentionsObservedInWindow,
        sourcesObserved: r.sourcesObserved,
        latest: r.latest.map((i) => ({
          source: i.source, title: i.title, url: i.url, at: i.at, tickers: i.tickers,
        })),
        refusals: wireRefusals(r.refusals),
      })),
      refusals: wireRefusals(press.refusals),
    },
    terms: {
      ownBrand: OWN_BRAND_TERMS.map((t) => t.term),
      partners: [],
      listedAssets: [],
      refusals: termRefusals,
    },
    sourcesUnreadable: unreadable,
    refusals: unreadable.length === 0 ? [] : [{
      code: 'WATCH_SOURCE_UNREACHABLE',
      sentence:
        `${unreadable.length} of 3 watch sources could not be read this window, so the panels below `
        + 'are reporting what was seen and not what exists.',
      rule: 'doctrine rule 3 (never claim a number you cannot observe)',
      remedy: 'Check the named sources by hand before treating a quiet panel as good news.',
    }],
  };
  return c.json({ data, meta: meta() });
});

/**
 * THE CLAIM EXPIRY LEDGER.
 *
 * IT REFUSES TODAY, AND THAT IS THE CORRECT OUTPUT rather than a stub. `Claim`
 * (`packages/shared/src/claims/types.ts`) carries no review date, and the register a
 * desk would keep review dates in does not exist — no table, no route, nothing. So
 * `reviews` is empty, the ledger comes back `usable: false` with `counts: null` and
 * the register refusal attached, and it does NOT report "0 claims past due".
 *
 * That distinction is load-bearing right now: Liechtenstein's Art 143(3) transition
 * ended on 1 July 2026 and TVTG registrations expired on 2 July, so any line
 * asserting a TVTG registration is stale TODAY. A panel reading "0 past due" would be
 * actively misleading in the month it matters most.
 */
marketingRecordRoutes.get('/watch/claim-expiry', requireOperator, async (c) => {
  const now = new Date();
  const ledger = buildClaimExpiryLedger({
    claims: getClaims(),
    // The two registers this ledger needs and this product does not have. Passed
    // empty rather than faked: the engine's own refusal is the honest answer.
    reviews: [],
    liveCopy: [],
    asOf: now,
  });

  const data: ClaimExpiryLedger = {
    usable: ledger.usable,
    asOf: ledger.asOf,
    dueSoonDays: ledger.dueSoonDays,
    rows: ledger.rows.map((r) => ({
      claimId: r.claimId,
      claimText: r.claimText,
      category: r.category,
      riskLevel: r.riskLevel,
      requiresHumanReview: r.requiresHumanReview,
      claimVersion: r.claimVersion,
      bucket: r.bucket,
      reviewedAt: r.reviewedAt,
      reviewDueAt: r.reviewDueAt,
      daysUntilDue: r.daysUntilDue,
      pastDue: r.pastDue,
      versionDrift: r.versionDrift,
      dependentCopy: r.dependentCopy,
      refusals: wireRefusals(r.refusals),
    })),
    counts: ledger.counts,
    dependencyMethodNote: ledger.dependencyMethodNote,
    refusals: wireRefusals(ledger.refusals),
    // The claim library is the desk's own corpus, so the frame is a census of it —
    // and the window is a point in time because a claim's staleness is evaluated now,
    // not over an interval.
    frame: frameFor('own_record', {
      from: ledger.asOf,
      to: ledger.asOf,
      asOf: ledger.asOf,
      lastSuccessfulPollAt: ledger.asOf,
    }, [
      'review dates: `Claim` carries none, and no review register exists in this product',
      'where a claim is live: no register of published copy exists, so dependent copy cannot be derived',
    ]),
  };
  return c.json({ data, meta: meta() });
});

/* ══════════════════════════════════════════════════════════════════════════════
 *  §2 THE ART 8(2) PRODUCTION
 * ══════════════════════════════════════════════════════════════════════════════ */

const NOT_MIGRATED_0061 = {
  error: 'The marketing record register is awaiting migration 0061 on this environment',
  code: 'MIGRATION_PENDING_RECORD',
};

/**
 * Turn a record refusal into a status and a code, WITH THE ENGINE'S OWN SENTENCE.
 *
 * The sentence is the product: "the register is present and holds no record for this
 * window — that is a different claim from 'we published nothing'" is what a person
 * needs, and replacing it with "Bad Request" throws away the only useful part.
 *
 * `RECORD_REGISTER_ABSENT` is 503 — the request was valid and the environment is not
 * ready. Everything else is 422: the request was well formed and the state refuses it.
 */
function recordRefusalResponse(
  c: Context<{ Variables: AuthVariables }>,
  r: {
    code: string; sentence: string; rule: string; ruleText?: string; remedy?: string;
    clearanceReconciliation?: ClearanceReconciliation;
  },
) {
  const status = r.code === 'RECORD_REGISTER_ABSENT' ? 503 : 422;
  return c.json({
    error: r.sentence,
    code: r.code,
    data: {
      refusal: wireRefusal(r),
      /*
       * THE FINDING TRAVELS ON THE REFUSAL. `composeExportBundle` attaches this to
       * `RECORD_REGISTER_EMPTY` (422) and to `RECORD_REGISTER_ABSENT` (503), which are the
       * two states in which it would otherwise be lost: the empty register is the day-one
       * state, and the absent register is the state in which 100% of what the desk cleared is
       * UNRECORDABLE rather than merely unrecorded. `wireRefusal` is deliberately narrow and
       * drops unknown fields, which is why it is added here rather than passed through it.
       */
      ...(r.clearanceReconciliation === undefined
        ? {}
        : { clearanceReconciliation: r.clearanceReconciliation }),
    },
  }, status);
}

/** Parse the window and the asking authority off the query string. */
function bundleRequestFrom(
  c: Context<{ Variables: AuthVariables }>,
  requestedBy: string,
  generatedAt: Date,
): { ok: true; value: BundleRequest } | { ok: false; error: string } {
  const authority = text(c.req.query('authority'), 200);
  if (!authority) {
    return {
      ok: false,
      error:
        'authority is required: Art 7(3) means the competent authority that asked need not be the '
        + 'FMA, and a production with no named asker cannot be filed against the request it answers.',
    };
  }
  const from = instant(c.req.query('from'));
  const to = instant(c.req.query('to'));
  if (!from || !to) {
    return { ok: false, error: 'from and to are required ISO-8601 instants: Art 8(2) asks about a period.' };
  }
  if (from.getTime() > to.getTime()) {
    return { ok: false, error: 'from is after to, so the window is empty by construction.' };
  }
  return {
    ok: true,
    value: {
      requestedBy,
      authority,
      windowFrom: from,
      windowTo: to,
      jurisdiction: text(c.req.query('jurisdiction'), 8),
      generatedAt,
    },
  };
}

/** Compose, render, digest — the three things a production is. */
function produce(
  c: Context<{ Variables: AuthVariables }>,
  req: BundleRequest,
  source: BundleSource,
) {
  const composed = composeExportBundle(req, source);
  if (!composed.ok) return recordRefusalResponse(c, composed);
  const data: ExportBundle = {
    bundle: composed.value,
    renderedText: renderBundleText(composed.value),
    digest: bundleDigest(composed.value),
  };
  return c.json({ data, meta: meta() });
}

/**
 * A WINDOW OF RECORDS — the Art 8(2) question as it is actually asked.
 *
 * `GET /export?authority=FMA&from=...&to=...&jurisdiction=LI`. The filter is
 * `jurisdiction = ANY(jurisdictions)` inside `readBundleSource`, because Art 8(2) is
 * about communications addressing prospective holders IN A MEMBER STATE and one
 * communication can address several.
 *
 * `requireApprover`: producing the regulatory record is not a read an integration key
 * should be able to perform, and `requestedBy` on the bundle is the session principal.
 */
marketingRecordRoutes.get('/export', requireOperator, requireApprover, async (c) => {
  const requestedBy = c.get('operator')?.id ?? '';
  const generatedAt = new Date();
  const parsed = bundleRequestFrom(c, requestedBy, generatedAt);
  if (!parsed.ok) return bad(c, parsed.error);
  const source = await readBundleSource(getPool(), parsed.value);
  return produce(c, parsed.value, source);
});

/**
 * ONE RECORD, BY ITS `record_uid`.
 *
 * WHY THIS FILTERS IN THE ROUTE RATHER THAN IN SQL. `readBundleSource` is windowed —
 * there is no by-uid read in `record.ts` and that file is not this wave's to change —
 * so this looks the record's `drafted_at` up, reads the one-instant window, and keeps
 * only the requested uid and the refusals, claims and transfers belonging to it.
 * Filtering AFTER the read is safe because `composeExportBundle` is pure and derives
 * every count from the rows it is handed; filtering with a join inside the read is
 * what would have been dangerous, since a join silently drops records whose queue row
 * is gone.
 *
 * A uid that is not in the register produces the engine's EMPTY-BUNDLE refusal rather
 * than a 404 with no explanation: "the register holds no record with that id" and "we
 * published nothing" are different claims and the refusal says which one this is.
 */
marketingRecordRoutes.get('/export/:itemId', requireOperator, requireApprover, async (c) => {
  const uid = text(c.req.param('itemId'), 200);
  if (!uid) return bad(c, 'itemId is required.');
  const requestedBy = c.get('operator')?.id ?? '';
  const authority = text(c.req.query('authority'), 200);
  if (!authority) {
    return bad(
      c,
      'authority is required: a production is filed against the authority that asked for it, and '
      + 'Art 7(3) means that need not be the FMA.',
    );
  }
  const pool = getPool();
  const generatedAt = new Date();

  // One parameterised lookup, in the route, because the by-uid read does not exist in
  // the engine. No identifier is interpolated.
  let draftedAt: Date | null = null;
  try {
    const res = await pool.query(
      `SELECT drafted_at FROM marketing_record WHERE record_uid = $1`,
      [uid],
    );
    const row = res.rows[0] as { drafted_at?: string | Date } | undefined;
    if (row?.drafted_at) {
      draftedAt = row.drafted_at instanceof Date ? row.drafted_at : new Date(String(row.drafted_at));
    }
  } catch {
    // The register is absent (0061 pending) or unreadable. Fall through: the engine's
    // own gate answers with the migration's name, which is more useful than a 500.
    return c.json(NOT_MIGRATED_0061, 503);
  }

  const req: BundleRequest = {
    requestedBy,
    authority,
    // An empty window when the uid is unknown. The engine then refuses with its
    // empty-register sentence, which is the honest answer to "produce record X".
    windowFrom: draftedAt ?? generatedAt,
    windowTo: draftedAt ?? generatedAt,
    jurisdiction: null,
    generatedAt,
  };
  const source = await readBundleSource(pool, req);
  const kept = source.records.filter((r) => r.record_uid === uid);
  const uids = new Set(kept.map((r) => r.record_uid));
  return produce(c, req, {
    registerPresent: source.registerPresent,
    records: kept,
    refusals: source.refusals.filter((r) => uids.has(r.record_uid)),
    claims: source.claims.filter((r) => uids.has(r.record_uid)),
    // `record_uid` is nullable on a transfer row — a processor call can be recorded
    // before any record exists to attach it to. A null uid belongs to no record, so it
    // is excluded here rather than coerced to '' and silently matched.
    transfers: source.transfers.filter((r) => r.record_uid !== null && uids.has(r.record_uid)),
    ...(source.presentCommentIds ? { presentCommentIds: source.presentCommentIds } : {}),
    /*
     * FORWARDED, AND IT WAS NOT.
     *
     * This route re-assembles a filtered `BundleSource` and every field it forgets becomes an
     * absence the engine then reports. `clearance` was omitted, so the produce-or-admit
     * section on THE ONLY EXPORT ROUTE A BROWSER SURFACE REACHES was permanently
     * `RECORD_CLEARANCE_LEDGER_UNREAD` — and that refusal's remedy says "produce the bundle
     * through a caller that reads the clearance ledger", which this route did, one line above.
     * A refusal blaming the caller for something the caller did is worse than no refusal.
     *
     * IT IS FORWARDED CONDITIONALLY on purpose: if `readBundleSource` did not supply it, the
     * honest answer is still UNREAD, and inventing an empty ledger here would turn "we did
     * not look" into "we looked and found nothing".
     *
     * THE WINDOW BELOW IS A ZERO-WIDTH INSTANT (`windowFrom = windowTo = drafted_at`), so the
     * ledger read can only match clearances stamped at exactly that instant and any figure in
     * that section is an artefact of the window. Widening it here would silently change what
     * "this production" covers, so instead `ClearanceScope.instantaneousWindow` carries the
     * fact and both the structured completeness list and the rendered block say it outright.
     */
    ...(source.clearance ? { clearance: source.clearance } : {}),
  });
});

/**
 * RESOLVE `gate:<16 hex>` — the reader that reference never had.
 *
 * `GET /v1/marketing/gate-reference/gate:abcdef0123456789`.
 *
 * WHY IT LIVES ON THIS ROUTER. The scoped Art 90 refusal that a drafter receives tells
 * them to quote a reference "to an approver ... so they can read the full verdict".
 * Nothing could read `text_sha256` back, so that remedy was a dead end — the same class
 * of defect as `watch.ts` and `record.ts` having no importer. This router is where the
 * approver-only regulatory reads already live, and the produce-or-admit section of the
 * export bundle now prints one of these references beside every unrecorded statement,
 * so the two surfaces answer each other.
 *
 * `requireApprover`, NOT `requireOperator` ALONE. What comes back includes the UNSCOPED
 * refusal codes from the 0062 `refusal_codes` column — the Art 90 embargo limb the
 * drafter's own copy of the refusal had replaced. Serving that to the drafter would
 * reopen the oracle the scoping exists to close, and `viewerIsEmbargoApprover` on the
 * gate already reads the role rather than assuming it.
 *
 * THE REFERENCE IS IN THE PATH, AND THAT IS SAFE HERE. It is a digest of LCX's own draft
 * text, not personal data, and it leaks nothing — the file that mints it says so. The
 * subject-access route next door is POST for the opposite reason: a handle is personal
 * data and must not appear in a URL or an access log.
 */
marketingRecordRoutes.get('/gate-reference/:reference', requireOperator, requireApprover, async (c) => {
  const raw = text(c.req.param('reference'), 40);
  if (!raw) return bad(c, 'A gate reference is required, in the form gate:<16 hex characters>.');
  const got = await resolveGateReference(getPool(), raw);
  if (!got.ok) {
    // MALFORMED is the caller's fault (400). ABSENT is the environment's (503). NOT_FOUND is
    // a genuine, readable absence in a ledger that answered (404) — and the sentence says
    // which of the two reasons it is, because "mistyped" and "never recorded" are different
    // findings and only the second one is about this desk's controls.
    const status = got.code === 'GATE_REFERENCE_MALFORMED'
      ? 400
      : got.code === 'GATE_LEDGER_ABSENT' ? 503 : 404;
    return c.json({ error: got.sentence, code: got.code, data: { refusal: wireRefusal(got) } }, status);
  }
  return c.json({ data: got, meta: meta() });
});

/* ══════════════════════════════════════════════════════════════════════════════
 *  §3 THE FIVE-YEAR CLOCK — the write that puts a statement on it
 * ══════════════════════════════════════════════════════════════════════════════ */

/**
 * PUT ONE OF LCX'S OWN STATEMENTS ON THE LONG CLOCK.
 *
 * This is the route whose absence made the retention split inoperative in one
 * direction: the 90-day sweep ran and nothing was ever written to the five-year
 * register, so at day 91 the compartment retained nothing at all.
 *
 * WHAT IT REFUSES TO GUESS, because a guessed record is worse than no record:
 *   · `regime` — the body of law that governed the artefact, DECIDED AT CLEARANCE.
 *     Recomputing it at export time applies today's rules to yesterday's text and has
 *     close to zero evidential value under Art 68(9). Required.
 *   · `draftedBy` and `draftedAt` — facts about the past, so they come from the body
 *     rather than from the session: the person recording need not be the drafter.
 *     Both required; a record with no drafter is not a four-eyes control.
 *   · `clearedBy` — optional, because `cleared_by IS NULL` is the honest state of a
 *     drafted-but-uncleared statement. When present it may not equal `draftedBy`;
 *     0061's CHECK rejects the pair outright, and this refuses first so the caller
 *     gets the rule instead of a constraint-violation 500.
 *
 * `text` and `itemId` keep the field names `apps/web/src/lib/api/marketing.ts`
 * already sends. `recordedBy` in that body is deliberately NOT read: attribution for
 * the ACT comes from the session, and `drafted_by` is a different fact.
 */
marketingRecordRoutes.post('/record', requireOperator, requireApprover, async (c) => {
  const body = await jsonBody(c);
  if (!body) return bad(c, 'A JSON object body is required.');

  // The principal who is performing the write. `requireApprover` has already run, so
  // this is present in practice — the check is here because an unnamed actor writing a
  // regulatory record is the one case that must fail loudly rather than default.
  const recordedBy = c.get('operator')?.id ?? '';
  if (recordedBy === '') {
    return c.json({
      error: 'The record will not be written unattributed: no principal is attached to this request.',
      code: 'RECORD_ACTOR_UNNAMED',
    }, 422);
  }

  const statement = typeof body.text === 'string' ? body.text : '';
  if (statement.trim() === '') {
    return bad(c, 'text is required: it is the exact bytes as cleared, and it is the record.');
  }
  const regime = text(body.regime, 40);
  if (!regime) {
    return bad(
      c,
      'regime is required. It is the body of law that governed this artefact AS DECIDED AT '
      + 'CLEARANCE — recomputing it later applies today\'s rules to yesterday\'s text.',
    );
  }
  const draftedBy = text(body.draftedBy, 120);
  if (!draftedBy) {
    return bad(c, 'draftedBy is required: the named human who wrote it. "The system wrote it" is not a control.');
  }
  const draftedAt = instant(body.draftedAt);
  if (!draftedAt) {
    return bad(c, 'draftedAt is required and must be an ISO-8601 instant: a retention clock with no start is not a clock.');
  }
  const clearedBy = text(body.clearedBy, 120);
  const clearedAt = instant(body.clearedAt);
  if (clearedBy && clearedBy === draftedBy) {
    return c.json({
      error:
        'The drafter and the approver are the same human, so this is not four-eyes and it will not '
        + 'be recorded as though it were. 0061 enforces the same rule as a CHECK constraint.',
      code: 'SELF_APPROVAL_FORBIDDEN',
    }, 422);
  }
  if ((clearedBy === null) !== (clearedAt === null)) {
    return bad(
      c,
      'clearedBy and clearedAt travel together: a clearance with no instant, or an instant with no '
      + 'human, is half a record.',
    );
  }

  const expiry = retentionExpiry(draftedAt, 'lcx_statement');
  if (!expiry.ok) return recordRefusalResponse(c, expiry);

  const written = await writeRecord(getPool(), {
    xCommentId: text(body.itemId, 200),
    draftId: typeof body.draftId === 'number' && Number.isInteger(body.draftId) ? body.draftId : null,
    regime,
    draftedBy,
    draftedAt,
    clearedBy,
    clearedAt,
    clearanceReason: text(body.clearanceReason, 2000),
    statementText: statement,
    inboundContextText: text(body.inboundContextText, 20_000),
    considerationKind: text(body.considerationKind, 40) ?? 'unknown',
    namedAssets: stringList(body.namedAssets, 50),
    jurisdictions: stringList(body.jurisdictions, 40),
    snapshotGaps: stringList(body.snapshotGaps, 50),
  });
  if (!written.ok) return recordRefusalResponse(c, written);

  const data: MarketingRecordRow = {
    recordUid: written.value.recordUid,
    created: written.value.created,
    retention: {
      cls: 'lcx_statement',
      years: RETENTION_YEARS_BASE,
      basis: expiry.value.basis,
      expiresAt: expiry.value.expiresAt.toISOString(),
    },
    recordedBy,
    // NOT a reassurance. `marketing_record` has drafted_by, cleared_by and
    // close_out_by and no column for who entered the row, so this attribution exists
    // in the response and in the platform's own audit trail and NOT in the register a
    // regulator would read. Naming the gap is the only honest option available without
    // a migration that owns 0061's table.
    attributionNote:
      'recordedBy is the session principal who performed this write. It is NOT persisted: '
      + 'marketing_record (migration 0061) has no column for who entered a row, only for who '
      + 'drafted, cleared and closed out the statement. Adding one requires a migration that '
      + 'owns that table.',
    inferenceCaveat: RETENTION_INFERENCE_CAVEAT,
    dpoRulingOutstanding: RETENTION_DPO_RULING_OUTSTANDING,
  };
  return c.json({ data, meta: meta() }, written.value.created ? 201 : 200);
});

/* ══════════════════════════════════════════════════════════════════════════════
 *  §4 GDPR ART 15 AND ART 17
 * ══════════════════════════════════════════════════════════════════════════════ */

/**
 * SUBJECT ACCESS — GDPR Art 15. Unreachable before this route existed; Art 12(3)
 * allows one month.
 *
 * POST, not GET, and the handle never appears in the path: it is personal data and a
 * URL travels into referrers, proxy logs and browser history.
 *
 * `requireApprover` because the response IS a stranger's personal data, assembled in
 * one payload. The shared machine key holds `operate` on every workspace, so an
 * operator-tier gate would let an integration pull it.
 *
 * `fulfilledBy` is the session principal. An access request is answered by a named
 * human who is accountable for the answer, and 0061 logs that it was answered —
 * without which a fulfilled request is indistinguishable from one that was dropped.
 */
marketingRecordRoutes.post('/subject-access', requireOperator, requireApprover, async (c) => {
  const body = await jsonBody(c);
  if (!body) return bad(c, 'A JSON object body is required.');
  const handle = text(body.handle, 200);
  if (!handle) {
    return bad(c, 'handle is required: it is the only thing this compartment holds that identifies a person.');
  }
  const fulfilledBy = c.get('operator')?.id ?? '';
  const at = new Date();
  const res = await subjectAccess(getPool(), { handle, fulfilledBy, requestedAt: at });
  if (!res.ok) return recordRefusalResponse(c, res);

  const data: SubjectAccessResponse = {
    handleQueried: res.value.handleQueried,
    replies: res.value.replies,
    drafts: res.value.drafts,
    transfers: res.value.transfers,
    recordsReferencing: res.value.recordsReferencing,
    notes: res.value.notes,
    fulfilledBy,
    fulfilledAt: at.toISOString(),
  };
  return c.json({ data, meta: meta() });
});

const ERASURE_BASES: readonly MarketingErasureBasis[] = [
  'art_17_1_a_purpose_fulfilled',
  'art_17_1_b_consent_withdrawn',
  'art_17_1_c_objection',
  'data_subject_request',
  'retention_expiry',
];

/**
 * ERASURE — GDPR Art 17, AND IT IS NOT A DELETE BUTTON.
 *
 * `eraseByHandle` deletes the inbound rows (drafts cascade on 0046), NULLs any
 * third-party excerpt carried inside an LCX record and stamps `context_minimised_at`,
 * RETAINS LCX's own cleared statements under Art 17(3)(b) — compliance with a legal
 * obligation, here the retention inferred from Art 68(9) — and REPORTS the retained
 * count with the exemption. Silently keeping them would be the actual violation.
 *
 * `basis` is required and validated against the enum. "Somebody asked" is a basis;
 * a blank field is not, and the erasure log's own CHECK will not accept one.
 */
marketingRecordRoutes.post('/erasure', requireOperator, requireApprover, async (c) => {
  const body = await jsonBody(c);
  if (!body) return bad(c, 'A JSON object body is required.');
  const handle = text(body.handle, 200);
  if (!handle) return bad(c, 'handle is required: a blanket erasure with no subject will not be run.');
  const basisRaw = text(body.basis, 60);
  if (!basisRaw || !ERASURE_BASES.includes(basisRaw as MarketingErasureBasis)) {
    return bad(c, `basis must be one of: ${ERASURE_BASES.join(', ')}.`);
  }
  const basis = basisRaw as MarketingErasureBasis;
  const decidedBy = c.get('operator')?.id ?? '';
  const at = new Date();
  const res = await eraseByHandle(getPool(), {
    handle,
    decidedBy,
    basis,
    requestedAt: at,
    notes: text(body.notes, 2000),
  });
  if (!res.ok) return recordRefusalResponse(c, res);

  const data: ErasureOutcome = {
    handleQueried: handle.replace(/^@+/, '').toLowerCase(),
    repliesErased: res.value.repliesErased,
    draftsErased: res.value.draftsErased,
    recordsRetained: res.value.recordsRetained,
    excerptsMinimised: res.value.excerptsMinimised,
    retainedBasis: res.value.retainedBasis,
    explanation: res.value.explanation,
    decidedBy,
    basis,
    erasedAt: at.toISOString(),
  };
  return c.json({ data, meta: meta() });
});

/* ══════════════════════════════════════════════════════════════════════════════
 *  §5 THE CLOCK ITSELF
 * ══════════════════════════════════════════════════════════════════════════════ */

/**
 * WHAT THE TWO CLOCKS ARE DOING, AND WHAT IS PROVABLE ABOUT THEM.
 *
 * ALWAYS 200, on every environment, including one with no migrations applied. An
 * operator asking "is retention running?" needs the answer "no, and here is exactly
 * why" — a 503 would make the honest answer look like an outage. The refusals ride
 * inside the payload, and every count that could not be observed is `null` rather
 * than `0`.
 *
 * The two standing refusals it always carries are the two facts a reader must not
 * miss: a second jeopardy-blind sweep still runs on the mail tick, and the split is a
 * stated default rather than a DPO ruling.
 */
marketingRecordRoutes.get('/retention', requireOperator, async (c) => {
  const posture = await retentionPosture(getPool(), { now: new Date() });
  const data: RetentionPosture = {
    asOf: posture.asOf,
    shortClock: { ...posture.shortClock, refusals: wireRefusals(posture.shortClock.refusals) },
    longClock: { ...posture.longClock, refusals: wireRefusals(posture.longClock.refusals) },
    lastRunAt: posture.lastRunAt,
    lastRunBy: posture.lastRunBy,
    runsRecorded: posture.runsRecorded,
    jeopardy: posture.jeopardy,
    jeopardyHorizonDays: posture.jeopardyHorizonDays,
    erasureReconciliation: posture.erasureReconciliation,
    inferenceCaveat: posture.inferenceCaveat,
    dpoRulingOutstanding: posture.dpoRulingOutstanding,
    refusals: wireRefusals(posture.refusals),
  };
  return c.json({ data, meta: meta() });
});

/**
 * RUN THE CLOCK.
 *
 * `mode` defaults to `dry_run`, which is the deliberate default for a destructive
 * operation: an operator's first call should tell them what would happen. `enforce`
 * must be asked for by name.
 *
 * `requireApprover` because this deletes rows from a regulatory register. Attribution
 * is the session principal, never a body field — the shared machine key holds
 * `operate` everywhere, and a cron job silently authoring a deletion is precisely
 * what the ledger exists to make visible.
 */
marketingRecordRoutes.post('/retention/run', requireOperator, requireApprover, async (c) => {
  const body = (await jsonBody(c)) ?? {};
  const modeRaw = text(body.mode, 20) ?? 'dry_run';
  if (modeRaw !== 'dry_run' && modeRaw !== 'enforce') {
    return bad(c, 'mode must be "dry_run" or "enforce".');
  }
  const ranBy = c.get('operator')?.id ?? '';
  const res = await runRetentionClock(getPool(), { ranBy, mode: modeRaw, now: new Date() });
  if (!res.ok) {
    const status = res.code === 'RETENTION_LEDGER_ABSENT'
      || res.code === 'RETENTION_QUEUE_ABSENT'
      || res.code === 'RETENTION_RECORD_REGISTER_ABSENT'
      ? 503 : 422;
    return c.json({ error: res.sentence, code: res.code, data: { refusal: wireRefusal(res) } }, status);
  }
  const data: RetentionSweepReport = {
    ranAt: res.value.ranAt,
    ranBy: res.value.ranBy,
    mode: res.value.mode,
    thirdPartyRowsDeleted: res.value.thirdPartyRowsDeleted,
    thirdPartyRowsMinimised: res.value.thirdPartyRowsMinimised,
    recordRowsExpired: res.value.recordRowsExpired,
    jeopardy: res.value.jeopardy,
    recorded: res.value.recorded,
    refusals: wireRefusals(res.value.refusals),
  };
  return c.json({ data, meta: meta() });
});

/* ══════════════════════════════════════════════════════════════════════════════
 *  §8 POST-TIME COVERAGE — the fraction, and what raises it
 * ══════════════════════════════════════════════════════════════════════════════ */

/**
 * GET /post-time — how much of the queue carries X's own post date.
 *
 * ══ WHY THIS READ EXISTS AT ALL ══
 * `marketing/postTime.ts` measures this and had no caller, so the fraction was 0 on every
 * live environment by construction AND unreported. The sweep is now scheduled on
 * `POST /v1/marketing/tick`; this is the read that lets a human see the result of it
 * without triggering one.
 *
 * ══ IT PERFORMS NO LOOKUP, AND THAT IS A DESIGN CONSTRAINT NOT A LIMITATION ══
 * `measurePostTimeCoverage` is SQL only. A read that quietly did outbound HTTP would make
 * refreshing a panel a rate-limit event against X, and the oEmbed breaker's state would
 * then depend on who happened to be looking at the screen. `readPerformsNoLookup: false`
 * is on the payload so a surface can say so.
 *
 * ══ THE TWO MIGRATION FACTS ARE KEPT APART ══
 * 0046 absent means there is no queue to measure — `coverage: null` with the reason. 0062
 * absent means the corpus can be measured but the SWEEP cannot write its evidence, so the
 * fraction is real and frozen. Reporting either as `0 of 0` would be indistinguishable from
 * full coverage, which is why `Figure` refuses instead.
 *
 * ══ IT IS NOT THE SAME FRACTION THE DESK ALREADY SHOWS, AND THAT IS STATED ══
 * `GET /summary` carries `postTimeCoverage` over OPEN rows and `DeskMeasurement.tsx` renders
 * it. This is over EVERY non-quarantined row still held, and it adds `lookupEligible`. Two
 * populations, two numbers, and they will differ — which is why `ofWhat` and the frame's
 * `captures` travel with this one. Nothing here recomputes the desk's figure.
 *
 * ══ WHAT DOES NOT CALL IT YET, said rather than left to be discovered ══
 * No browser surface fetches this route. The compartment's post-time defect was that
 * NOTHING ran the sweep, so coverage was 0 forever and unreported; that is fixed by the
 * schedule on `POST /tick` and reported here with its frame. A panel over this payload is
 * not built, and a client fetcher with no component would be the same decoration this wave
 * exists to remove, so there is none.
 *
 * Gated at `view` by `app.ts:requiresOperate` — it is a GET and it changes nothing.
 */
marketingRecordRoutes.get('/post-time', requireOperator, async (c) => {
  const pool = getPool();
  const { corroborationTablePresent, measurePostTimeCoverage } = await import('../marketing/postTime.js');
  const { isMigrated } = await import('../marketing/service.js');
  const { oembedHealth } = await import('../marketing/oembed.js');

  const asOf = new Date().toISOString();
  const migrated = await isMigrated(pool);
  const evidenceTablePresent = migrated ? await corroborationTablePresent(pool) : false;
  const refusals: MarketingWireRefusal[] = [];

  if (!migrated) {
    refusals.push({
      code: 'MIGRATION_PENDING',
      sentence:
        'Migration 0046 has not been applied on this environment, so there is no reply queue to '
        + 'measure. This is an absent population, not zero coverage.',
      rule: 'doctrine rule 3 — absent data produces a refusal, never a zero',
      remedy: 'Apply 0046_marketing.sql.',
    });
  } else if (!evidenceTablePresent) {
    refusals.push({
      code: 'MKT_POSTTIME_NOT_MIGRATED',
      sentence:
        'The fraction below is real, and it cannot move: migration 0062 has not been applied, so '
        + 'the sweep has nowhere to record what it observed and refuses before performing a single '
        + 'lookup. A sweep that cannot write its evidence must not do the lookups.',
      rule: 'doctrine rule 5 — nothing leaves without a record',
      remedy: 'Apply 0062_marketing_gate_decisions.sql, which carries marketing_reply_corroboration.',
    });
  }

  /*
   * ASSIGNED to `Figure<PostTimeCoverageCounts>` through the contract type, not cast. The
   * engine's `PostTimeCoverage` and the shared `PostTimeCoverageCounts` are two
   * declarations of one shape — unavoidable, because `packages/shared` cannot import from
   * `apps/api` — and this assignment is what makes tsc reject a contract field the engine
   * does not return. That is the exact drift class that rendered GPS panels empty.
   */
  const coverage: PostTimeCoverageReport['coverage'] = migrated
    ? await measurePostTimeCoverage(pool, asOf, oembedHealth(Date.parse(asOf)).lastSuccessAt)
    : null;

  if (coverage?.kind === 'absent') {
    refusals.push({
      code: coverage.refusal.code,
      sentence: coverage.refusal.sentence,
      rule: coverage.refusal.rule.provision,
      ruleText: coverage.refusal.rule.text,
    });
  }

  const data: PostTimeCoverageReport = {
    migrated,
    evidenceTablePresent,
    coverage,
    channel: 'oembed',
    // Named, so a reader seeing 0 knows what to run rather than filing a bug on the panel.
    raisedBy: 'POST /v1/marketing/tick — runPostTimeSweep, one GET per row to publish.twitter.com/oembed',
    refusals,
    readPerformsNoLookup: false,
  };
  return c.json({ data, meta: meta() });
});
