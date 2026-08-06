/**
 * Reading the witnesses — the I/O half of the cross-examination.
 *
 * `packages/shared/src/intel/witnesses.ts` decides what a set of witness readings
 * MEANS (agree / disagree / absent, and whether a disagreement moves a decision).
 * This file decides only what each witness ACTUALLY SAYS, which is the part that
 * needs a database and is therefore the part where the four states collapse into one
 * another if nobody is watching. FIVE collapses were available here and all five are
 * refused explicitly. The count is stated because the first version of this comment said
 * "three collapses … and all three are refused" — a claim that was true of the list it
 * was written above and became false as soon as items 4 and 5 were found. If a sixth
 * turns up, the number moves with the list:
 *
 *   1. `SUM(volume_24h_usd)` over rows that ALL have a NULL volume returns NULL in
 *      Postgres. `COALESCE(SUM(...), 0)` — the obvious thing to write — turns "five
 *      venues, none of which reported a volume" into "$0 traded", which reads as a
 *      dead token and is a lie. Counted separately and refused.
 *   2. Zero rows in `exchange_listings` is a COVERAGE gap, not a volume of zero, and
 *      for a `catalog`-tier project it is a structural absence: the enrichment job
 *      only ever visits `tier = 'tracked'` (apps/api/src/enrich/exchanges.ts:83).
 *   3. A missing `fdv_usd` observation means DefiLlama never matched the ticker, not
 *      that the token has no size.
 *   4. A count that does not read as a number leaves the venue count UNKNOWN. `?? 0`
 *      on it asserted "no exchange_listings rows for this project" on no evidence.
 *   5. A CAPPED sweep of the flagged population is not the population. The cap, the
 *      total and a refusal travel with `crossExamineFlagged`'s result, because a
 *      truncated list read as the whole book is the same lie as an empty list read as
 *      "nothing happened".
 *
 * AND ONE THAT IS NOT A COLLAPSE BUT AN OVERCLAIM, refused the same way: `projects.tier`
 * is read on every path and handed to the engine, because `deception.ts:35` scans
 * `WHERE tier = 'tracked'` and the arithmetic without that predicate is not the
 * production verdict. It is read even when both project-row witnesses are withheld or
 * outside the read subset — a clearance boundary on one witness must not change what
 * production is reported to be doing, nor rewrite another witness's absence cause.
 *
 * WHAT THIS FILE DOES NOT DO. It does not write, flag, unflag or suppress anything.
 * `detectWashTrading` keeps its behaviour exactly; this reads the same numbers a
 * second way and reports where the two readings disagree enough to change a verdict.
 *
 * ══ WHY THE ENGINE IS INJECTED RATHER THAN IMPORTED ══
 * `packages/shared/package.json` publishes exactly ONE entry point (`"." → src/index.ts`)
 * and `src/index.ts` does not yet republish `intel/witnesses.ts`. A deep specifier
 * (`@lcx/shared/intel/witnesses.js`) is therefore a TS2307, and a relative one out of
 * `apps/api/src` type-checks and then fails the EMIT build with TS6059 in Docker order
 * — the failure `packages/shared/src/barrelReachability.test.ts` exists to describe.
 * Adding that barrel line is one line in a file this lane does not own, so until it
 * lands the engine arrives as an argument. The four constructors and `crossExamine`
 * are the whole contract, `WITNESS_KEYS` is pinned against the engine's own
 * `WITNESS_IDS` in the test beside this file, and the call site changes to a default
 * parameter the moment the barrel exports it.
 */

import type pg from 'pg';

/** The narrowest thing `pg.Pool` satisfies, so the tests need no Postgres. */
export interface Queryable {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Identity at runtime; a compile-time proof that a real pool IS a `Queryable`.
 *
 * The narrow interface is only worth having if the production object satisfies it —
 * otherwise the tests exercise a shape nothing in production has, which is the
 * failure mode a mock is famous for. `pg.Pool.query` is heavily overloaded, so this
 * assignability is asserted by the compiler here rather than assumed. It lives in
 * this file, not the test, because `apps/api/tsconfig.json` excludes tests from
 * `type-check` and the emit build — a proof in there would never run.
 */
export const asQueryable = (p: pg.Pool): Queryable => p;

/**
 * PINNED, not merely mirrored: `crossExamine.test.ts` asserts this equals the engine's
 * `WITNESS_IDS` in the same order, so a rename on either side fails there rather than
 * silently producing a `readings` object with a key the engine ignores.
 */
export const WITNESS_KEYS = [
  'volume_projects_row',
  'volume_venue_sum',
  'size_projects_row',
  'size_defillama',
] as const;
export type WitnessKey = (typeof WITNESS_KEYS)[number];

/** Mirrors the engine's `AbsenceCause`; pinned in the same test, for the same reason. */
export type AbsenceCauseKey =
  | 'column_null'
  | 'no_rows'
  | 'no_observation'
  | 'not_collected_for_this_tier';

export interface ObservedWitnessMeta {
  readonly observedAt: string | null;
  readonly source: string | null;
  readonly reliability?: string | null;
  readonly caveats?: readonly string[];
}

/** The engine's four reading constructors. `R` is the engine's `WitnessReading`. */
export interface WitnessConstructors<R> {
  notLoaded(): R;
  withheld(compartment: string): R;
  absent(because: AbsenceCauseKey, note?: string | null): R;
  observed(value: number, meta: ObservedWitnessMeta): R;
}

export interface WitnessBundle<R> {
  readonly subjectId: string;
  readonly environment: string | null;
  readonly examinedAt: string;
  /**
   * `projects.tier`, read for the engine's population gate — the detector scans
   * `WHERE tier = 'tracked'` (`deception.ts:35`) and the arithmetic alone is not the
   * verdict. `null` where the projects row is not there to read it from; the engine
   * refuses on it rather than assuming either way.
   *
   * IT IS NOT A WITNESS, so it is read whatever the caller withheld or declined to
   * read: a clearance boundary on a witness must not silently change what production
   * is reported to be doing.
   */
  readonly subjectTier: string | null;
  readonly readings: Record<WitnessKey, R>;
}

/** The constructors plus the examination itself. `X` is the engine's `CrossExamination`. */
export interface WitnessEngine<R, X> extends WitnessConstructors<R> {
  crossExamine(input: WitnessBundle<R>): X;
}

export interface ReadWitnessOptions {
  /**
   * Which database these figures came from, for the ObservationFrame.
   *
   * REQUIRED IN SPIRIT, OPTIONAL IN TYPE, AND NEVER DEFAULTED. `environmentLabelFromDatabaseUrl`
   * (packages/shared/src/marks/mark.ts:752) is the function that strips credentials
   * out of a DATABASE_URL, but it is not reachable through `@lcx/shared`'s single
   * entry point, and copying a credential-stripping routine to work around that is a
   * worse idea than making the caller name its own database. Omitting it produces the
   * engine's XWIT_ENVIRONMENT_UNLABELLED refusal, which is the correct outcome: an
   * unlabelled figure must not read as a production one.
   */
  readonly environment?: string | null;
  /** Supplied so an examination is reproducible. Defaults to now — this layer may read a clock. */
  readonly examinedAt?: string;
  /**
   * Witnesses this reader is not cleared to see. They come back present-but-withheld
   * and must never arrive as `absent`.
   *
   * NOT A DATA-ACCESS CONTROL, and the difference is worth stating: the two project-row
   * witnesses share one SELECT, so withholding one of them still reads the other's
   * column. It suppresses the VALUE from the examination, it does not narrow the query.
   * A real compartment boundary belongs in the route, not here.
   */
  readonly withhold?: readonly WitnessKey[];
  readonly withholdCompartment?: string;
  /**
   * Read only these witnesses. Omitted means all four.
   *
   * THIS IS THE ONLY WAY `not_loaded` IS REACHABLE FROM I/O, and it exists because the
   * fourth state was otherwise a claim about the engine that no reader could make: the
   * query for a witness outside this subset is NEVER ISSUED, so the reading is
   * not-loaded — not absent, and not withheld. The distinction is the operator's:
   * absent means go and look at the enrichment, withheld means go and get cleared,
   * not-loaded means ask this reader for more.
   *
   * The `projects` row is still selected when both project-row witnesses are outside
   * the subset, because `tier` is not a witness and the population gate must not
   * depend on a caller's read subset — but only `id` and `tier` are selected in that
   * case, so the two witness columns are genuinely not loaded.
   */
  readonly read?: readonly WitnessKey[];
}

/* ── column coercions ─────────────────────────────────────────────────────────
 * `numeric` arrives from pg as a STRING, and `Number()` manufactures a zero out of an
 * absence for MORE INPUTS THAN THE OBVIOUS ONE: `Number(null)` is 0, and so are
 * `Number('')`, `Number('  ')`, `Number('\t\n')`, `Number(false)` and `Number([])`.
 * Guarding only `''` left the whitespace case producing a PRESENT reading of 0 — a
 * genuine zero market cap — in the module written to refuse exactly that.
 *
 * So this is an ALLOW-LIST, not a filter: only a number, a bigint, or a string that
 * parses to a finite number gets through. Everything else, including anything blank
 * after trimming, is an absence and the caller must say which kind.
 */
const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'bigint') {
    const b = Number(v);
    return Number.isFinite(b) ? b : null;
  }
  if (typeof v !== 'string' || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/*
 * THERE IS NO `int()` HERE ANY MORE, DELIBERATELY. It was `num(v) ?? 0`, applied to the
 * venue COUNT — the discriminator that decides between "no venue rows at all" and "rows
 * that record no volume". A NULL count coerced to 0 asserted "no exchange_listings rows
 * for this project" as a fact the query never established. Every count below is read
 * with `num` and a null count is its own refusal.
 */

const iso = (v: unknown): string | null => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === 'string' && v.trim() !== '') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
};

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/* ══════════════════════════════════════════════════════════════════════════════ */
/* THE THREE READS                                                                 */
/* ══════════════════════════════════════════════════════════════════════════════ */

/** Witnesses A and the incumbent denominator — the two columns the detector reads. */
const PROJECT_ROW_SQL = `
  SELECT id, tier, market_cap_usd, volume_24h_usd, last_enriched_at, exchanges_synced_at
  FROM projects
  WHERE id = $1`;

/**
 * The population predicate ALONE, for the case where neither project-row witness was
 * asked for. `tier` is not a witness: the engine needs it to know whether production's
 * detector scans this subject at all, and that must not become unknowable because a
 * caller narrowed its read subset.
 */
const PROJECT_TIER_SQL = `
  SELECT id, tier
  FROM projects
  WHERE id = $1`;

/**
 * Witness B. `count(volume_24h_usd)` is the load-bearing column: it counts NON-NULL
 * values, so it is what separates "no venue reported a volume" from "the venues
 * reported volumes that sum to zero". `sum()` is left un-coalesced deliberately.
 */
const VENUE_SUM_SQL = `
  SELECT count(*)::int                       AS venues,
         count(volume_24h_usd)::int          AS venues_with_volume,
         sum(volume_24h_usd)                 AS volume_sum,
         max(last_seen_at)                   AS last_seen_at,
         count(DISTINCT source)::int         AS source_count,
         min(source)                         AS first_source
  FROM exchange_listings
  WHERE project_id = $1`;

/** Witness C — free evidence on disk since 0015-era enrichment, read by no engine before this. */
const FDV_SQL = `
  SELECT value_num, observed_at, source, reliability, credibility
  FROM observations
  WHERE subject_type = 'project' AND subject_id = $1 AND predicate = 'fdv_usd'
  ORDER BY observed_at DESC
  LIMIT 1`;

/** The projects the production detector is suppressing right now. Read-only. */
const FLAGGED_SQL = `
  SELECT DISTINCT subject_id
  FROM observations
  WHERE predicate = 'wash_trading_flag' AND subject_type = 'project'
  ORDER BY subject_id
  LIMIT $1`;

/**
 * The SIZE of that population, so a capped sweep cannot be read as the whole book.
 * Counted in its own statement, so the two are a snapshot rather than a transaction —
 * `detectWashTrading` deletes and rewrites every flag on each run, so a count taken
 * either side of a run can differ from the page. `flaggedTotal` is therefore reported
 * as what the count said, and never reconciled by arithmetic.
 */
const FLAGGED_COUNT_SQL = `
  SELECT count(DISTINCT subject_id) AS flagged_total
  FROM observations
  WHERE predicate = 'wash_trading_flag' AND subject_type = 'project'`;

export async function readWitnesses<R>(
  q: Queryable,
  projectId: string,
  mk: WitnessConstructors<R>,
  opts: ReadWitnessOptions = {},
): Promise<WitnessBundle<R>> {
  const hidden = new Set<WitnessKey>(opts.withhold ?? []);
  const compartment = opts.withholdCompartment ?? 'undeclared';
  const hide = (): R => mk.withheld(compartment);
  const asked = opts.read === undefined ? null : new Set<WitnessKey>(opts.read);
  /** In the caller's read subset. Outside it, the query is not issued at all. */
  const wanted = (k: WitnessKey): boolean => asked === null || asked.has(k);

  const readings: Partial<Record<WitnessKey, R>> = {};

  /*
   * ── the project row: witness A, the incumbent size, and the tier ──
   *
   * THE SELECT IS UNCONDITIONAL. Two reasons, and the first is a defect this shape
   * fixes: `tier` decides whether the engine may report a production verdict at all,
   * and it also decides whether witness B's absence is STRUCTURAL
   * (`not_collected_for_this_tier`) or CONTINGENT (`no_rows`). Skipping this query
   * when both project-row witnesses were withheld made a need-to-know boundary on ONE
   * witness silently rewrite ANOTHER witness's absence cause — telling an operator to
   * wait for enrichment that is never coming for a catalog-tier project. Second,
   * withholding is documented above as suppressing the VALUE, not narrowing the query.
   */
  const wantsProjectRowWitnesses = wanted('volume_projects_row') || wanted('size_projects_row');
  let tier: string | null = null;
  {
    const { rows } = await q.query(
      wantsProjectRowWitnesses ? PROJECT_ROW_SQL : PROJECT_TIER_SQL,
      [projectId],
    );
    const row = rows[0];
    if (!wantsProjectRowWitnesses) {
      // The two columns were never selected, so neither witness was read. That is
      // not-loaded, and it is not the same as the row having nothing in them.
      tier = row ? str(row.tier) : null;
      readings.volume_projects_row = mk.notLoaded();
      readings.size_projects_row = mk.notLoaded();
    } else if (!row) {
      // The subject itself is not there. Both readings are absent for one reason,
      // and neither is zero.
      const note = 'no projects row with this id';
      readings.volume_projects_row = mk.absent('no_rows', note);
      readings.size_projects_row = mk.absent('no_rows', note);
    } else {
      tier = str(row.tier);
      const at = iso(row.last_enriched_at);
      const vol = num(row.volume_24h_usd);
      const cap = num(row.market_cap_usd);
      readings.volume_projects_row = vol === null
        ? mk.absent('column_null', 'projects.volume_24h_usd is NULL or non-numeric')
        : mk.observed(vol, {
          observedAt: at,
          source: 'projects_row',
          caveats: at === null ? ['The row records no last_enriched_at, so this figure has no age.'] : [],
        });
      readings.size_projects_row = cap === null
        ? mk.absent('column_null', 'projects.market_cap_usd is NULL or non-numeric')
        : mk.observed(cap, {
          observedAt: at,
          source: 'projects_row',
          caveats: cap <= 0
            ? ['Market cap is not positive, so no turnover ratio exists against it.']
            : [],
        });
    }
  }
  /*
   * A witness the caller never asked to read cannot also be "withheld from" it — one
   * is a fact about this read, the other about this reader's clearance, and the states
   * do not stack. Not-loaded wins because it is the earlier of the two.
   */
  if (wanted('volume_projects_row') && hidden.has('volume_projects_row')) readings.volume_projects_row = hide();
  if (wanted('size_projects_row') && hidden.has('size_projects_row')) readings.size_projects_row = hide();

  /* ── witness B: the per-venue sum ── */
  if (!wanted('volume_venue_sum')) {
    readings.volume_venue_sum = mk.notLoaded();
  } else if (hidden.has('volume_venue_sum')) {
    readings.volume_venue_sum = hide();
  } else {
    const { rows } = await q.query(VENUE_SUM_SQL, [projectId]);
    const agg = rows[0] ?? {};
    /*
     * `count(*)` cannot be NULL in Postgres — but this reader does not get to assume
     * the shape of a row it was handed. A count that does not read as a number leaves
     * the number of venue rows UNKNOWN, and unknown is not zero: `?? 0` here would
     * assert "no exchange_listings rows for this project" on no evidence.
     */
    const venues = num(agg.venues);
    const withVolume = num(agg.venues_with_volume);
    const sum = num(agg.volume_sum);
    if (venues === null || withVolume === null) {
      readings.volume_venue_sum = mk.absent(
        'column_null',
        'the venue-count aggregate did not come back as a number, so how many exchange_listings rows '
        + 'exist for this project is unknown — this is not a count of zero and not a volume of zero',
      );
    } else if (venues === 0) {
      // A catalog-tier project is never visited by the exchange sync at all, so its
      // second witness is structurally absent rather than contingently missing —
      // a distinction that decides whether anyone should go looking for the data.
      readings.volume_venue_sum = tier !== null && tier !== 'tracked'
        ? mk.absent('not_collected_for_this_tier', `tier '${tier}' is never visited by the exchange sync`)
        : mk.absent('no_rows', 'no exchange_listings rows for this project');
    } else if (withVolume === 0 || sum === null) {
      // THE COLLAPSE THIS BRANCH EXISTS TO REFUSE. SUM over all-NULL is NULL.
      readings.volume_venue_sum = mk.absent(
        'column_null',
        `${venues} venue row(s), none of which records a volume — the sum is NULL, not zero`,
      );
    } else {
      const sources = num(agg.source_count);
      const caveats = [
        `Summed over ${withVolume} of ${venues} venue row(s); the rest record no volume and were `
        + 'not treated as zero.',
      ];
      if (sources === null) {
        // Unknown, and said so: `?? 0` or `?? 1` here would either invent a mixed
        // derivation or invent the single-provider claim below.
        caveats.push(
          'How many distinct providers these rows came from could not be read, so whether this sum '
          + 'mixes derivations — or shares a provider with the project-row aggregate — is unknown.',
        );
      } else if (sources > 1) {
        caveats.push(`Rows come from ${sources} different providers, so the sum mixes derivations.`);
      } else if (str(agg.first_source) === 'coingecko') {
        // Honesty about how independent this witness really is: when the per-venue
        // rows came from CoinGecko, so did witness A. Differently DERIVED, same
        // provider — weaker corroboration than two providers agreeing.
        caveats.push(
          'These venue rows came from CoinGecko, the same provider behind the project-row '
          + 'aggregate. Differently derived, not independently sourced.',
        );
      }
      readings.volume_venue_sum = mk.observed(sum, {
        observedAt: iso(agg.last_seen_at),
        source: str(agg.first_source) ?? 'exchange_listings',
        caveats,
      });
    }
  }

  /* ── witness C: DefiLlama's size reading ── */
  if (!wanted('size_defillama')) {
    readings.size_defillama = mk.notLoaded();
  } else if (hidden.has('size_defillama')) {
    readings.size_defillama = hide();
  } else {
    const { rows } = await q.query(FDV_SQL, [projectId]);
    const row = rows[0];
    const value = row ? num(row.value_num) : null;
    if (!row) {
      readings.size_defillama = mk.absent('no_observation', 'DefiLlama never matched this ticker');
    } else if (value === null) {
      readings.size_defillama = mk.absent('column_null', 'the fdv_usd observation carries no value_num');
    } else {
      const reliability = str(row.reliability);
      const caveats = [
        'Written from DefiLlama\'s `mcap` field under the predicate name fdv_usd, so it is not '
        + 'verified to be a fully diluted valuation.',
      ];
      if (reliability !== 'A') {
        caveats.push(
          `Admiralty reliability ${reliability ?? 'unrecorded'}: the token was matched by ticker `
          + 'symbol without a name confirmation, so a symbol collision is possible.',
        );
      }
      readings.size_defillama = mk.observed(value, {
        observedAt: iso(row.observed_at),
        source: str(row.source) ?? 'defillama',
        reliability,
        caveats,
      });
    }
  }

  return {
    subjectId: projectId,
    environment: opts.environment ?? null,
    examinedAt: opts.examinedAt ?? new Date().toISOString(),
    subjectTier: tier,
    // Every key is assigned on every path above; the cast is the price of building
    // the record incrementally rather than repeating the four branches.
    readings: readings as Record<WitnessKey, R>,
  };
}

export async function crossExamineProject<R, X>(
  q: Queryable,
  projectId: string,
  engine: WitnessEngine<R, X>,
  opts: ReadWitnessOptions = {},
): Promise<X> {
  return engine.crossExamine(await readWitnesses(q, projectId, engine, opts));
}

export interface FlaggedExamination<X> {
  readonly subjectId: string;
  readonly examination: X;
}

/**
 * A refusal about the SWEEP rather than about a witness.
 *
 * The citation shape is declared here rather than imported for the reason given at the
 * top of this file — the engine is not reachable through `@lcx/shared`'s single entry
 * point yet — and the codes are `XWIT_*` like the engine's so one register covers both.
 */
export type SweepRefusalCode =
  | 'XWIT_FLAGGED_POPULATION_TRUNCATED'
  | 'XWIT_FLAGGED_POPULATION_UNCOUNTED';

export const SWEEP_REFUSAL_CODES: readonly SweepRefusalCode[] = [
  'XWIT_FLAGGED_POPULATION_TRUNCATED',
  'XWIT_FLAGGED_POPULATION_UNCOUNTED',
];

export interface SweepRefusal {
  readonly code: SweepRefusalCode;
  readonly sentence: string;
  readonly rule: {
    readonly instrument: 'LCX_HOUSE_DOCTRINE';
    readonly provision: string;
    readonly text: string;
  };
}

const RULE_ABSENT_REFUSES = {
  instrument: 'LCX_HOUSE_DOCTRINE',
  provision: 'absent data refuses',
  text: 'Absent data refuses. It never renders 0, never an estimate, never an empty list that '
    + 'reads as "nothing happened". A refusal carries a stable code and cites the rule it applies.',
} as const;

export interface FlaggedSweep<X> {
  /**
   * How many flagged subjects were EXAMINED. Not the population — see `flaggedTotal`.
   *
   * The old field was called `scanned` and documented as "how many flagged subjects
   * the sweep looked at", which a caller reads as the flagged population. With a cap of
   * 200 over 250 flags it returned 200 and said nothing, so a panel built on it would
   * have reported "200 suppressed projects cross-examined" as the whole book.
   */
  readonly examined: number;
  /** What the count said the population is. `null` when the count could not be read. */
  readonly flaggedTotal: number | null;
  /** The cap this sweep applied. */
  readonly limit: number;
  /** True when flagged projects exist that this sweep did NOT examine. */
  readonly truncated: boolean;
  /** EVERY refusal about the sweep itself, never just the first. */
  readonly refusals: readonly SweepRefusal[];
  readonly examinations: readonly FlaggedExamination<X>[];
}

/**
 * Cross-examine the projects the detector is currently suppressing, up to `limit`.
 *
 * READ-ONLY BY CONSTRUCTION. `detectWashTrading` deletes and rewrites the same
 * observations on each run; this sweep only selects them. Deciding which
 * escalations are worth acting on is a human's job, and retuning the threshold on
 * the strength of this output would be the same mistake at one remove.
 *
 * A PARTIAL SWEEP SAYS SO. A truncated list presented as a population is the same
 * shape of lie as an empty list reading as "nothing happened", so the cap, the count
 * and a refusal all travel with the result.
 */
export async function crossExamineFlagged<R, X>(
  q: Queryable,
  engine: WitnessEngine<R, X>,
  opts: ReadWitnessOptions & { readonly limit?: number } = {},
): Promise<FlaggedSweep<X>> {
  const limit = Math.max(1, Math.min(500, opts.limit ?? 200));

  const { rows: countRows } = await q.query(FLAGGED_COUNT_SQL, []);
  // `count()` arrives from pg as a string, and an unreadable count is not a count of 0.
  const flaggedTotal = num((countRows[0] ?? {}).flagged_total);

  const { rows } = await q.query(FLAGGED_SQL, [limit]);
  const ids = rows.map((r) => str(r.subject_id)).filter((v): v is string => v !== null);

  const examinations: FlaggedExamination<X>[] = [];
  for (const subjectId of ids) {
    examinations.push({ subjectId, examination: await crossExamineProject(q, subjectId, engine, opts) });
  }

  const refusals: SweepRefusal[] = [];
  /*
   * Two independent grounds, and both are reported. The count is the better evidence
   * when it is readable; a full page is evidence on its own that there may be more,
   * which is what keeps `truncated` honest when the count could not be read.
   */
  const truncated = flaggedTotal === null
    ? ids.length >= limit
    : flaggedTotal > ids.length;

  if (flaggedTotal === null) {
    refusals.push({
      code: 'XWIT_FLAGGED_POPULATION_UNCOUNTED',
      sentence: `The number of projects the detector is currently suppressing could not be read, so `
        + `the ${examinations.length} examined below must not be read as all of them. This is an `
        + 'unknown population, not an empty one.',
      rule: RULE_ABSENT_REFUSES,
    });
  }
  if (truncated) {
    refusals.push({
      code: 'XWIT_FLAGGED_POPULATION_TRUNCATED',
      sentence: `This sweep examined ${examinations.length} suppressed project(s) of `
        + `${flaggedTotal === null ? 'an unknown number' : flaggedTotal} flagged, because it caps at `
        + `${limit}. The rest were never examined and nothing below is evidence about them — raise the `
        + 'limit or page, and do not present this as the whole book.',
      rule: RULE_ABSENT_REFUSES,
    });
  }

  return { examined: examinations.length, flaggedTotal, limit, truncated, refusals, examinations };
}
