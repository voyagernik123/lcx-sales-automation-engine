/**
 * THE `meta` THE BROWSER USED TO THROW AWAY.
 *
 * Every GPS read answers `{ data, meta }`, and every GPS module in this directory
 * declared the same one-liner:
 *
 *     const unwrap = <T>(p: Promise<{ data: T }>): Promise<T> => p.then((r) => r.data);
 *
 * So `meta` reached the fetch layer and died there — in eight modules. What travels
 * in `meta` and not in `data` is not decoration:
 *
 *  · `migrated: false`, which is the difference between "this client has no
 *    engagements" and "the table does not exist on this environment". A page that
 *    cannot tell those apart renders an empty list as a fact.
 *  · `provenance`, the D1 trail: which rows, which formula, which source grade.
 *  · `DELIVERY_SCHEMA_GAPS` — the ledger explaining that `reviewBasis`,
 *    `acceptedBy` and `milestoneKey` are SUBSTITUTED nulls rather than recorded
 *    ones. The acceptance table was rendering the substitutions and discarding the
 *    explanation, which is how a null becomes "not required".
 *
 * ── WHY A SYMBOL AND NOT A FIELD ─────────────────────────────────────────────
 * `meta` is attached to the returned value under a well-known SYMBOL, non-enumerable.
 * The alternatives were both worse: changing `unwrap` to return `{ data, meta }`
 * rewrites every call site and every `useQuery` generic in the app for a value most
 * of them do not read, and merging a plain `meta` key into `data` collides the first
 * time a payload has its own `meta`. A non-enumerable symbol changes nothing that
 * spreads, iterates, serialises or diffs the data, and `responseMeta(x)` is the only
 * way to see it — so a reader cannot mistake it for part of the payload.
 *
 * Arrays work too (an array is an object). Primitives and null are returned
 * untouched, and `responseMeta` then answers `undefined` rather than throwing.
 *
 * ── THE CARRIER'S ONE WEAKNESS, AND THE ANSWER TO IT ─────────────────────────
 * A symbol does not survive a STRUCTURAL CLONE: `structuredClone`, a `JSON` round
 * trip, or React Query's `structuralSharing` all rebuild the payload from its
 * enumerable string keys and the envelope is gone. Nothing in GPS clones a payload
 * today (every page holds the fetched object in `useState`, and `lib/readCache`
 * serialises the WHOLE envelope so `unwrapWithMeta` re-attaches on the way out) —
 * but "today" is not a guarantee, and a lost envelope would make a screen look
 * warning-free rather than look broken.
 *
 * Making it survive would mean an enumerable key on the payload, which is the
 * collision this design exists to avoid. So the loss is made LOUD instead:
 * `metaNotices()` treats a MISSING envelope on an object as a refusal-grade finding
 * and says so on the screen. A clone therefore degrades to "this screen cannot tell
 * you what it is missing", never to silence.
 */

export interface ApiMeta {
  timestamp?: string;
  version?: string;
  /**
   * False = the migration behind this read has not been applied on this
   * environment. NOT the same as "no rows", and the distinction is the whole
   * reason this object had to reach the browser.
   */
  migrated?: boolean;
  /** Anything else the route chose to state: provenance, notices, schema gaps. */
  [key: string]: unknown;
}

/** Well-known so a hot reload cannot mint a second, invisible key. */
const META = Symbol.for('lcx.api.responseMeta');

/**
 * Attach the envelope's `meta` to the payload without changing the payload.
 *
 * Non-enumerable and non-writable: nothing enumerates it, and a second attach on the
 * same object (a cached React Query result handed back twice) is a no-op rather than
 * a `TypeError`.
 */
export function attachMeta<T>(data: T, meta: unknown): T {
  if (data === null || (typeof data !== 'object' && typeof data !== 'function')) return data;
  if (meta === null || typeof meta !== 'object') return data;
  try {
    Object.defineProperty(data as object, META, {
      value: meta as ApiMeta,
      enumerable: false,
      configurable: true,
      writable: false,
    });
  } catch {
    // A frozen payload cannot carry it. Dropping the meta is the old behaviour, so
    // this is never worse than what it replaced — and it never throws at a caller.
  }
  return data;
}

/** The `meta` for a value `attachMeta` produced, or undefined. Never throws. */
export function responseMeta(value: unknown): ApiMeta | undefined {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return undefined;
  return (value as Record<symbol, ApiMeta | undefined>)[META];
}

/**
 * TRUE ONLY WHEN THE SERVER SAID SO.
 *
 * `undefined` means the read carried no `migrated` flag at all, which is a different
 * thing from `false` and must not render as "not migrated". Callers that need to
 * distinguish the three cases read `responseMeta(x)?.migrated` directly; this helper
 * exists for the common "should I show the migration banner" question, and it answers
 * it in the direction that does not invent a fact.
 */
export function isMigrated(value: unknown): boolean | undefined {
  const m = responseMeta(value)?.migrated;
  return typeof m === 'boolean' ? m : undefined;
}

/**
 * The read-side envelope, carrying its `meta` through. One implementation, imported
 * by every module in this directory that used to declare its own copy.
 */
export const unwrapWithMeta = <T>(p: Promise<{ data: T; meta?: unknown }>): Promise<T> =>
  p.then((r) => attachMeta(r.data, r.meta));

/* ── WHAT A CARRIED ENVELOPE OBLIGES A SURFACE TO PRINT ─────────────────────── */

/**
 * `refusal` = do not act on what is below. `warning` = act, but not on the basis you
 * assumed. The two tones exist because "no table here" and "measured against a
 * catalogue the client never saw" are different sizes of wrong.
 */
export type MetaNoticeTone = 'refusal' | 'warning';

export interface MetaNotice {
  /** Stable, so a surface reading several endpoints prints one notice per fact. */
  id: string;
  tone: MetaNoticeTone;
  /** What the operator must not believe. */
  headline: string;
  /** Why it is not true, and what would make it true. */
  detail: string;
}

/**
 * THE LOUD ONE. See `metaNotices`.
 *
 * A value that reached a surface with no envelope on it is not "a read with nothing
 * to declare" — every GPS read declares something (at minimum a timestamp and a
 * version), so the only ways to get here are a structural clone, a `JSON` round
 * trip, or a fetcher that stopped using `unwrapWithMeta`. All three degrade the
 * screen to "looks fine", which is the one outcome this module exists to prevent.
 */
export const ENVELOPE_NOT_CARRIED = 'envelope-not-carried';

const asRecord = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined;

const nonEmptyString = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v : undefined;

/**
 * EVERY OPERATOR-VISIBLE CLAIM THAT TRAVELS IN `meta` AND NOWHERE ELSE.
 *
 * Pass the value a GPS fetcher resolved. What comes back is the list of sentences the
 * surface is obliged to print, because each one is the difference between a figure an
 * operator may quote and a figure they may not:
 *
 *  · `migrated: false` — the tables do not exist here. An empty list is then a
 *    property of the environment, not of the client's business.
 *  · `pendingMigration` / `outcomeStoreMigrated` — part of the read works and part
 *    does not, so a rate computed over what IS stored is computed over a subset.
 *  · `perimeter.source: 'compiled_placeholder'` — no human has entered a position;
 *    the compiled placeholders are expired on arrival and authorise nothing.
 *  · `scopeBasis.criteriaFrom: 'live_catalogue'` — the drift verdict was measured
 *    against today's catalogue rather than the offer as sold.
 *  · `issueDecisionIsAdvisory` — the block verdict on screen is a preview; the guard
 *    at issue decides, and it can disagree.
 *
 * EVERY RULE HERE HAS A LIVE PRODUCER, named beside it. A branch matching a `meta`
 * shape no route emits is a rule that means nothing — the same defect as an exported
 * symbol with no consumer — so `rateCardsArePlaceholders` and
 * `effortTriplesArePlaceholders` are NOT read here: they travel in `data`, not `meta`
 * (`routes/gpsUnderwrite.ts:341`), and `pages/GpsUnderwriting.tsx` already badges every
 * placeholder row from them. Nor is `stored: false`, which only ever rides a 422 body
 * (`routes/gpsLoop.ts:466`) that `apiClient` raises as an `ApiError` — no payload with
 * it on can reach a surface.
 *
 * NOT HERE EITHER: `schemaGaps`. `pages/GpsDelivery.tsx` renders that ledger field by
 * field beside the substituted values themselves, which is more use than a summary
 * line, and printing both would say it twice.
 *
 * ABSENCE IS A FINDING, NOT SILENCE — pass only values that came off a fetcher.
 */
export function metaNotices(value: unknown): MetaNotice[] {
  // Nothing to say about a value that could never have carried an envelope: `null`
  // (the shape every GPS route returns for "no such engagement") and primitives.
  // The API cannot attach meta to those, so their absence proves nothing.
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return [];

  const meta = responseMeta(value);
  if (meta === undefined) {
    return [{
      id: ENVELOPE_NOT_CARRIED,
      tone: 'refusal',
      headline: 'This read arrived without its provenance envelope, so this screen cannot tell you what it is missing.',
      detail:
        'Every GPS read answers { data, meta }, and the meta is what says whether the tables exist, '
        + 'whether a figure is measured or assumed, and where a perimeter came from. It did not reach '
        + 'here — a structural clone, a JSON round trip or a fetcher that bypassed unwrapWithMeta drops '
        + 'it. Treat nothing below as annotated: the absence of a warning on this screen is not evidence '
        + 'there is nothing to warn about.',
    }];
  }

  const out: MetaNotice[] = [];
  const pending = nonEmptyString(meta.pendingMigration);

  // Produced by every GPS list and detail read: routes/gps.ts:346 and :409,
  // gpsConflict.ts:209, gpsDelivery.ts:218, gpsLoop.ts:170, gpsOrigination.ts:230,
  // gpsUnderwrite.ts:351 (there it means "no rate-card registry").
  if (meta.migrated === false) {
    out.push({
      id: 'not-migrated',
      tone: 'refusal',
      headline: 'The tables behind this read do not exist on this environment.',
      detail:
        'What you see is an empty shape, not an empty book: nothing here distinguishes "this client has '
        + 'no engagements" from "there is nowhere to record one". Every write against it is declined.'
        + (pending ? ` Applying ${pending} is what changes the answer.` : ''),
    });
  } else if (pending) {
    // migrated, and still incomplete: the loop reads outcomes it cannot yet store.
    out.push({
      id: 'pending-migration',
      tone: 'warning',
      headline: `Part of this read depends on a migration that is still pending: ${pending}.`,
      detail:
        'The figures shown are computed over what IS stored. Anything the pending migration would '
        + 'record is absent from them, so a rate here is a rate over a subset.',
    });
  }

  // routes/gpsLoop.ts:311 and :321 — the loop read works, the outcome store does not.
  if (meta.outcomeStoreMigrated === false) {
    out.push({
      id: 'outcome-store-missing',
      tone: 'refusal',
      headline: 'Recorded outcomes cannot be stored or read on this environment.',
      detail:
        'The loop is answering from zero outcome records. That is not calibration evidence — a win rate '
        + 'or a factor verdict derived from it would be a statement about an empty table.',
    });
  }

  // `perimeter: { allowed, source }` — routes/gps.ts:331, the perimeter-gated quote.
  // Both spellings are read because `perimeterClearanceFor` publishes the flat
  // `perimeterSource` on its own views (api/src/gps/conflict.ts:474) and a route that
  // spreads one of those into `meta` must not silently stop being heard.
  const perimeterSource =
    nonEmptyString(asRecord(meta.perimeter)?.source) ?? nonEmptyString(meta.perimeterSource);
  if (perimeterSource === 'compiled_placeholder') {
    out.push({
      id: 'perimeter-placeholder',
      tone: 'refusal',
      headline: 'The jurisdiction perimeter behind this answer is a compiled placeholder.',
      detail:
        'No human has entered a position in gps_jurisdiction_profile. The compiled placeholders are '
        + 'expired on arrival and authorise nothing, so a clearance shown here is not a clearance '
        + 'anybody has given.',
    });
  }

  // routes/gpsDelivery.ts:255 — on the one read `pages/GpsDelivery.tsx` performs.
  const criteriaFrom = nonEmptyString(asRecord(meta.scopeBasis)?.criteriaFrom);
  if (criteriaFrom === 'live_catalogue') {
    out.push({
      id: 'scope-basis-live-catalogue',
      tone: 'warning',
      headline: 'Scope drift was measured against the CURRENT catalogue, not the offer as sold.',
      detail:
        'This engagement carries no usable scope snapshot, so the acceptance criteria come from the '
        + 'catalogue as it stands today. The catalogue is versioned code and has changed since; a drift '
        + 'verdict against criteria the client never saw is a different claim from a drift verdict.',
    });
  }

  // routes/gpsUnderwrite.ts:166, on every underwrite and sensitivity run.
  if (meta.issueDecisionIsAdvisory === true) {
    out.push({
      id: 'issue-decision-advisory',
      tone: 'warning',
      headline: 'The block decision on this screen is a preview, not the decision.',
      detail: 'The guard on POST /v1/gps/engagements/:id/proposal decides at issue, against the state at that moment, and it can refuse what this preview allows.',
    });
  }

  return out;
}

/**
 * The notices for several reads on one surface, in order, each fact once.
 *
 * A page that reads three endpoints and gets `migrated: false` from all three has ONE
 * thing to say. Deduping on `id` keeps the banner a statement rather than a list of
 * how many requests were made.
 */
export function mergedMetaNotices(values: readonly unknown[]): MetaNotice[] {
  const seen = new Set<string>();
  const out: MetaNotice[] = [];
  for (const v of values) {
    for (const n of metaNotices(v)) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      out.push(n);
    }
  }
  return out;
}
