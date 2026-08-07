import type { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GPS_LISTING_VERDICTS, listingPerimeterFinding } from '@lcx/shared';
import type { EntitlementMap } from '@lcx/shared';
import { GPS_LISTING_VERDICT_ENV, verdictFromRegisterCounts } from '../../access/otherLedger.js';
import { VERDICT_BROKER_CODES } from '../../access/verdictBroker.js';
import {
  GPS_LISTING_CODES,
  GPS_LISTING_CODE_RULE,
  GPS_LISTING_READ_ACTION,
  _resetListingJoinDetector,
  listingPerimeterForEngagement,
} from '../conflict.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  GPS ASKS THE OTHER LEDGER — verdict only, logged without exception, and never
 *  a clean answer about a compartment it did not read.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * THE LIABILITY. GPS sells MiCA whitepapers and legal-opinion coordination to token
 * issuers who may simultaneously be candidates in LCX's listing pipeline. That is
 * the conflict the wall exists to catch, and until this path existed the wall could
 * not see it: `askListingPipeline` and `askListingPipelineForProject` were built,
 * tested, merged — and called by nothing outside their own test file. MiCA Art
 * 91(3)(c) attaches PERSONAL liability, from roughly EUR 700,000, on the named
 * human. A control nobody can reach does not reduce it.
 *
 * ── WHAT EACH GROUP DEFENDS ──────────────────────────────────────────────────
 *  1. THE GATES RUN IN ORDER AND NOTHING IS QUERIED BEFORE THEM. With the flag off,
 *     or the asker unentitled, the register is not read, `projects` is not read, and
 *     — the part that is easy to get wrong — `gps_engagement` is not read either. An
 *     unentitled caller must not be able to use the refusal shape as an oracle on
 *     whether an engagement exists or is linked to a project.
 *  2. EVERY READ IS LOGGED, INCLUDING EVERY REFUSAL. A register of successful reads
 *     cannot answer "was this control switched off, and for how long?" — the first
 *     question anyone asks about a default-deny flag.
 *  3. AN UNLOGGED ANSWER IS NOT RETURNED. If the audit row does not write, the
 *     verdict is discarded and the caller gets a refusal. This is the difference
 *     between an audited control and a control whose trail has holes in it exactly
 *     where the log was failing.
 *  4. THE ASSET SYMBOL NEVER CROSSES INTO THIS COMPARTMENT — not into the answer and
 *     not into the audit row. `routes/audit.ts` already found that the SYMBOL IN
 *     `entity_id` WAS ITSELF THE DISCLOSURE (MiCA Art 90(1)); writing it into a row
 *     a GPS reader can read reopens that hole from the other side.
 *  5. THE THREE STATES SURVIVE THE WHOLE PATH. Not-loaded is never a clearance, an
 *     unlinked engagement is never a clearance, and only an observed absence in a
 *     POPULATED register is.
 *  6. THE FIVE VERDICTS THE API CAN EMIT ARE EXACTLY THE FIVE THE SHARED ENGINE
 *     RECOGNISES. The engine mirrors a union it cannot import; this is the test that
 *     makes the mirror checkable.
 *
 * ── WHAT THESE TESTS CANNOT SEE ──────────────────────────────────────────────
 * The pool is a fake dispatching on SQL text. They prove which statements are issued
 * with which parameters, in which order, and all of the interpretation — and NOTHING
 * about whether Postgres agrees with the SQL. In particular nothing here observes
 * that `to_regclass('public.idx_projects_ticker_norm_unjoinable')` returns null on
 * the production database. IT DOES, because `0072_verdict_broker.sql` IS NOT APPLIED
 * THERE, which means the live behaviour of this path today is the
 * `GPS_LISTING_JOIN_DETECTOR_ABSENT` refusal exercised below and nothing else.
 *
 * ── RUNNING THIS BEFORE THE BARREL IS WIRED ──────────────────────────────────
 * `listingPerimeterFinding`, `listingContradiction`, `GPS_LISTING_VERDICTS` and the
 * listing types are new in `packages/shared/src/gps/disclosure.ts` and are NOT yet
 * re-exported from `packages/shared/src/gps/index.ts` — a barrel this pass may not
 * edit, because four other lanes are in it. Until those export lines land this file
 * fails at IMPORT time, exactly as `conflict.test.ts` documents for the same reason.
 * That failure is the wiring reminder, not a defect in the code below.
 */

/* ── The fake pool ────────────────────────────────────────────────────────────── */

interface Call {
  sql: string;
  params: readonly unknown[];
}

const ENGAGEMENT = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const ASKED_BY = 'nikhil@lcx.com';
const AS_OF = '2026-08-07T09:00:00.000Z';

const GPS_READER: EntitlementMap = { gps: 'view' };

interface WorldOptions {
  detectorPresent?: boolean;
  detectorThrows?: boolean;
  engagement?: 'linked' | 'unlinked' | 'missing' | 'throws';
  tickerNorm?: string | null;
  registerPopulated?: boolean;
  counts?: Partial<{
    total: number;
    live: number;
    live_fresh: number;
    live_fresh_mnpi: number;
    live_fresh_conditional: number;
    live_fresh_clear: number;
  }>;
  auditWriteFails?: boolean;
}

function world(o: WorldOptions = {}) {
  const calls: Call[] = [];
  const audits: Call[] = [];
  const pool = {
    query: async (sql: unknown, params?: readonly unknown[]) => {
      const text = String(sql);
      calls.push({ sql: text, params: params ?? [] });

      if (text.includes('INSERT INTO audit_log')) {
        audits.push({ sql: text, params: params ?? [] });
        if (o.auditWriteFails) throw new Error('audit_log unavailable');
        return { rows: [] };
      }
      if (text.includes('idx_projects_ticker_norm_unjoinable')) {
        if (o.detectorThrows) throw new Error('connection reset');
        return { rows: [{ ok: o.detectorPresent !== false }] };
      }
      if (text.includes('FROM gps_engagement')) {
        const mode = o.engagement ?? 'linked';
        if (mode === 'throws') throw new Error('gps_engagement unreadable');
        if (mode === 'missing') return { rows: [] };
        return { rows: [{ project_id: mode === 'linked' ? PROJECT : null }] };
      }
      if (text.includes('FROM projects')) {
        return { rows: [{ ticker_norm: o.tickerNorm === undefined ? 'SOL' : o.tickerNorm }] };
      }
      if (text.includes('register_populated')) {
        return {
          rows: [
            {
              register_populated: o.registerPopulated !== false,
              total: 0,
              live: 0,
              live_fresh: 0,
              live_fresh_mnpi: 0,
              live_fresh_conditional: 0,
              live_fresh_clear: 0,
              ...(o.counts ?? {}),
            },
          ],
        };
      }
      throw new Error(`unexpected statement: ${text.slice(0, 80)}`);
    },
  } as unknown as Pool;
  return { pool, calls, audits };
}

const ask = (pool: Pool, entitlements: EntitlementMap = GPS_READER) =>
  listingPerimeterForEngagement(
    pool,
    { engagementId: ENGAGEMENT, askedBy: ASKED_BY, entitlements, asOf: AS_OF },
    'cleared',
  );

/** Every statement that is not the audit insert. The "did we look" evidence. */
const reads = (calls: readonly Call[]) => calls.filter((c) => !c.sql.includes('INSERT INTO audit_log'));

function auditMeta(audits: readonly Call[], i = 0): Record<string, unknown> {
  return JSON.parse(String(audits[i].params[4])) as Record<string, unknown>;
}

beforeEach(() => {
  _resetListingJoinDetector();
  process.env[GPS_LISTING_VERDICT_ENV] = '1';
});

afterEach(() => {
  delete process.env[GPS_LISTING_VERDICT_ENV];
  _resetListingJoinDetector();
});

/* ── 1. The gates, and what does NOT get read ─────────────────────────────────── */

describe('the gates run before anything is queried', () => {
  it('with the owner flag off, NOTHING is read — not even gps_engagement', async () => {
    // `= '0'`, not `delete`: since 2026-08-07 an UNSET variable means the declaration
    // governs (authorised). Off is now an explicit act, which is what a kill switch is.
    process.env[GPS_LISTING_VERDICT_ENV] = '0';
    const { pool, calls } = world();
    const out = await ask(pool);

    expect(reads(calls)).toEqual([]);
    expect(out.finding.kind).toBe('not_loaded');
    expect(out.finding.clearsListingConflict).toBe(false);
    if (out.finding.kind === 'not_loaded') {
      expect(out.finding.upstreamCode).toBe(VERDICT_BROKER_CODES.CROSS_READ_NOT_AUTHORISED);
    }
  });

  it('an unentitled asker is refused without a query, and cannot learn the flag state', async () => {
    const { pool, calls } = world();
    const out = await ask(pool, {});

    expect(reads(calls)).toEqual([]);
    expect(out.finding.kind).toBe('not_loaded');
    if (out.finding.kind === 'not_loaded') {
      expect(out.finding.upstreamCode).toBe(VERDICT_BROKER_CODES.ASKER_NOT_ENTITLED);
      /* The refusal names the asker's own grant and NOT the owner's flag, which is
       * why gate 1 runs before gate 2 rather than the other way round. */
      expect(out.finding.upstreamCode).not.toBe(VERDICT_BROKER_CODES.CROSS_READ_NOT_AUTHORISED);
    }
  });

  it('holding `marketing` is not a substitute for holding `gps`', async () => {
    const { pool, calls } = world();
    const out = await ask(pool, { marketing: 'approve' });
    expect(reads(calls)).toEqual([]);
    expect(out.finding.clearsListingConflict).toBe(false);
  });
});

/* ── 2. 0072 is not applied, so the check refuses ─────────────────────────────── */

describe('the join detector 0072 creates', () => {
  it('is absent on a database without 0072, and the check REFUSES rather than passing', async () => {
    const { pool, calls } = world({ detectorPresent: false });
    const out = await ask(pool);

    expect(out.finding.kind).toBe('not_loaded');
    if (out.finding.kind === 'not_loaded') {
      expect(out.finding.upstreamCode).toBe(GPS_LISTING_CODES.JOIN_DETECTOR_ABSENT);
    }
    expect(out.finding.clearsListingConflict).toBe(false);
    // Neither the engagement nor the register was read once the detector said no.
    expect(reads(calls).map((c) => c.sql).join(' ')).not.toContain('gps_engagement');
    expect(reads(calls).map((c) => c.sql).join(' ')).not.toContain('register_populated');
  });

  it('a probe that throws is its own state, not "absent"', async () => {
    const { pool } = world({ detectorThrows: true });
    const out = await ask(pool);
    if (out.finding.kind === 'not_loaded') {
      expect(out.finding.upstreamCode).toBe(GPS_LISTING_CODES.JOIN_DETECTOR_UNKNOWN);
    }
  });

  /**
   * The negative is not cached, so a database that comes back healthy — or a
   * migration applied by hand on a Sunday — is picked up on the next call rather
   * than at the next restart. `db/migrate.ts` states migrations are deliberately
   * NOT part of the deploy, so a cached false would never self-heal.
   */
  it('does not cache the negative', async () => {
    const w = world({ detectorPresent: false });
    await ask(w.pool);
    await ask(w.pool);
    expect(w.calls.filter((c) => c.sql.includes('idx_projects_ticker_norm_unjoinable'))).toHaveLength(2);
  });

  it('every refusal code carries the rule it applies', () => {
    for (const code of Object.values(GPS_LISTING_CODES)) {
      expect(GPS_LISTING_CODE_RULE[code].length).toBeGreaterThan(80);
    }
  });
});

/* ── 3. The three states, all the way to the caller ───────────────────────────── */

describe('three states, and only one of them clears', () => {
  it('an engagement with no project link is NOT-LOADED, not clear', async () => {
    const { pool, calls } = world({ engagement: 'unlinked' });
    const out = await ask(pool);

    expect(out.projectId).toBeNull();
    expect(out.finding.kind).toBe('not_loaded');
    expect(out.finding.clearsListingConflict).toBe(false);
    if (out.finding.kind === 'not_loaded') {
      expect(out.finding.upstreamCode).toBe(GPS_LISTING_CODES.NO_PROJECT_LINK);
    }
    expect(reads(calls).map((c) => c.sql).join(' ')).not.toContain('register_populated');
  });

  it('an unknown engagement and an unreadable one are different codes', async () => {
    const missing = await ask(world({ engagement: 'missing' }).pool);
    const broken = await ask(world({ engagement: 'throws' }).pool);
    if (missing.finding.kind === 'not_loaded' && broken.finding.kind === 'not_loaded') {
      expect(missing.finding.upstreamCode).toBe(GPS_LISTING_CODES.ENGAGEMENT_UNKNOWN);
      expect(broken.finding.upstreamCode).toBe(GPS_LISTING_CODES.ENGAGEMENT_UNREADABLE);
    } else {
      throw new Error('both should be not_loaded');
    }
  });

  it('a populated register holding nothing about this asset is the clearance', async () => {
    const { pool } = world({ registerPopulated: true, counts: { total: 0 } });
    const out = await ask(pool);

    expect(out.finding.kind).toBe('no_entry');
    expect(out.finding.clearsListingConflict).toBe(true);
    expect(out.contradiction.kind).toBe('none');
  });

  /**
   * AN UNPOPULATED REGISTER IS THE PRODUCTION DEFAULT — 0060 seeds nothing — so this
   * is the case that would otherwise answer "clear" for every asset on the platform.
   */
  it('an EMPTY register is not-loaded, never the clearance', async () => {
    const { pool } = world({ registerPopulated: false, counts: { total: 0 } });
    const out = await ask(pool);

    expect(out.finding.kind).toBe('not_loaded');
    expect(out.finding.clearsListingConflict).toBe(false);
    if (out.finding.kind === 'not_loaded') {
      expect(out.finding.upstreamCode).toBe(VERDICT_BROKER_CODES.HOLDER_UNAVAILABLE);
    }
  });

  it('a live MNPI entry comes back as a withheld `restricted` verdict with a count', async () => {
    const { pool } = world({
      counts: { total: 3, live: 2, live_fresh: 2, live_fresh_mnpi: 2 },
    });
    const out = await ask(pool);

    expect(out.finding.kind).toBe('withheld');
    if (out.finding.kind === 'withheld') {
      expect(out.finding.verdict).toBe('restricted');
      expect(out.finding.withheldCount).toBe(3);
    }
    expect(out.finding.clearsListingConflict).toBe(false);
    expect(out.finding.namingBlocked).toBe(true);
    // The recorded position was `cleared`, plain. That is the finding.
    expect(out.contradiction.kind).toBe('contradiction');
  });

  it('a denormalised projects.ticker_norm REFUSES instead of joining on nothing', async () => {
    const { pool, calls } = world({ tickerNorm: 'sol' });
    const out = await ask(pool);

    expect(out.finding.kind).toBe('not_loaded');
    if (out.finding.kind === 'not_loaded') {
      expect(out.finding.upstreamCode).toBe('OTHER_LEDGER_TICKER_NOT_NORMALISED');
    }
    // The register was never queried with a value that could not match.
    expect(reads(calls).map((c) => c.sql).join(' ')).not.toContain('register_populated');
  });

  it('a project with no ticker at all is an absence that refuses', async () => {
    const { pool } = world({ tickerNorm: null });
    const out = await ask(pool);
    expect(out.finding.kind).toBe('not_loaded');
    if (out.finding.kind === 'not_loaded') {
      expect(out.finding.upstreamCode).toBe('OTHER_LEDGER_TICKER_ABSENT');
    }
  });
});

/* ── 4. Every read is logged. Including the refusals. ─────────────────────────── */

describe('every read is logged', () => {
  it('writes exactly one audit row per call, with who / what / when / which verdict', async () => {
    const { pool, audits } = world({
      counts: { total: 2, live: 1, live_fresh: 1, live_fresh_mnpi: 1 },
    });
    const out = await ask(pool);

    expect(audits).toHaveLength(1);
    const [actor, action, entity, entityId] = audits[0].params;
    expect(actor).toBe(ASKED_BY);
    expect(action).toBe(GPS_LISTING_READ_ACTION);
    expect(entity).toBe('gps_engagement');
    expect(entityId).toBe(ENGAGEMENT);

    const meta = auditMeta(audits);
    expect(meta.askedBy).toBe(ASKED_BY);
    expect(meta.projectId).toBe(PROJECT);
    expect(meta.asOf).toBe(AS_OF);
    expect(meta.verdict).toBe('restricted');
    expect(meta.withheldCount).toBe(2);
    expect(meta.findingKind).toBe('withheld');
    expect(out.logged).toBe(true);
  });

  it('logs the refusals too — including the one that means the flag is off', async () => {
    // `= '0'`, not `delete`: since 2026-08-07 an UNSET variable means the declaration
    // governs (authorised). Off is now an explicit act, which is what a kill switch is.
    process.env[GPS_LISTING_VERDICT_ENV] = '0';
    const { pool, audits } = world();
    await ask(pool);

    expect(audits).toHaveLength(1);
    const meta = auditMeta(audits);
    expect(meta.findingKind).toBe('not_loaded');
    expect(meta.upstreamCode).toBe(VERDICT_BROKER_CODES.CROSS_READ_NOT_AUTHORISED);
    expect(meta.verdict).toBeNull();
    /* NOT 0. The count is null because nothing was counted, and a 0 here would be a
     * register observation that never happened. */
    expect(meta.withheldCount).toBeNull();
  });

  it.each([
    ['unlinked engagement', { engagement: 'unlinked' as const }],
    ['detector absent', { detectorPresent: false }],
    ['empty register', { registerPopulated: false }],
    ['clearance', { counts: { total: 0 } }],
  ])('logs on the %s path as well', async (_label, opts) => {
    const { pool, audits } = world(opts as WorldOptions);
    await ask(pool);
    expect(audits).toHaveLength(1);
  });

  /**
   * FAIL CLOSED. Note what this cannot undo: the register was already read, and
   * nothing here un-reads it. What it does is refuse to hand the answer over, which
   * is the whole of what is still in this process's gift.
   */
  it('discards the verdict when the audit row cannot be written', async () => {
    const { pool } = world({
      auditWriteFails: true,
      counts: { total: 5, live: 5, live_fresh: 5, live_fresh_mnpi: 5 },
    });
    const out = await ask(pool);

    expect(out.logged).toBe(false);
    expect(out.finding.kind).toBe('not_loaded');
    expect(out.finding.clearsListingConflict).toBe(false);
    if (out.finding.kind === 'not_loaded') {
      expect(out.finding.upstreamCode).toBe(GPS_LISTING_CODES.READ_UNRECORDED);
    }
    // The verdict and the count are GONE from the answer, not flagged beside it.
    const blob = JSON.stringify(out);
    expect(blob).not.toContain('restricted');
    expect(blob).not.toContain('"withheldCount"');
    // And it says the true thing: the perimeter WAS read.
    expect(out.finding.message).toMatch(/WAS read/);
  });

  it('an unlogged answer is not a clean contradiction result either', async () => {
    const { pool } = world({ auditWriteFails: true, counts: { total: 0 } });
    const out = await ask(pool);
    expect(out.contradiction.kind).toBe('unestablished');
    expect(out.contradiction.kind).not.toBe('none');
  });
});

/* ── 5. The symbol never crosses ──────────────────────────────────────────────── */

describe('minimum disclosure', () => {
  it('the asset symbol appears in NO audit row and in NO returned field', async () => {
    const { pool, audits } = world({
      tickerNorm: 'SOL',
      counts: { total: 1, live: 1, live_fresh: 1, live_fresh_mnpi: 1 },
    });
    const out = await ask(pool);

    expect(JSON.stringify(audits[0].params)).not.toContain('SOL');
    expect(JSON.stringify(out)).not.toContain('SOL');
    // The audit row names the engagement and the project, which is what an auditor
    // with the marketing compartment resolves the rest from.
    expect(auditMeta(audits).projectId).toBe(PROJECT);
  });

  it('the register\'s own columns never reach the answer', async () => {
    const { pool } = world({
      counts: { total: 2, live: 2, live_fresh: 2, live_fresh_conditional: 2 },
    });
    const blob = JSON.stringify(await ask(pool));
    for (const forbidden of ['event_ref', 'source_ref', 'entered_by', 'lifted_at', 'mnpi_pending']) {
      expect(blob).not.toContain(forbidden);
    }
  });

  it('the symbol is a bound parameter, never text in a statement', async () => {
    const { pool, calls } = world({ tickerNorm: 'SOL', counts: { total: 0 } });
    await ask(pool);
    const register = calls.find((c) => c.sql.includes('register_populated'));
    expect(register).toBeDefined();
    expect(register?.sql).not.toContain('SOL');
    expect(register?.params).toContain('SOL');
  });
});

/* ── 6. The mirrored union, made checkable ────────────────────────────────────── */

/**
 * `GPS_LISTING_VERDICTS` in `packages/shared/src/gps/disclosure.ts` MIRRORS
 * `ListingPipelineVerdict` in `apps/api/src/access/otherLedger.ts`, because shared
 * cannot import from the API. A mirror nobody checks is a mirror that drifts.
 *
 * This drives the PRODUCING FUNCTION rather than comparing two declarations, which
 * is the stronger test: it asserts the set of verdicts the API can actually EMIT.
 * Its limit, stated rather than implied: a sixth verdict added to `otherLedger.ts`
 * would need a count shape added here to be emitted, so this test catches a verdict
 * REMOVED or RENAMED immediately, and catches one ADDED only via the engine's
 * `VERDICT_UNRECOGNISED` refusal at runtime — which is why that refusal exists and
 * why it refuses instead of bucketing.
 */
describe('the five verdicts the API can emit are the five the engine recognises', () => {
  const shapes = [
    { total: 1, live: 1, liveFresh: 1, liveFreshMnpi: 1, liveFreshConditional: 0, liveFreshClear: 0 },
    { total: 1, live: 1, liveFresh: 1, liveFreshMnpi: 0, liveFreshConditional: 1, liveFreshClear: 0 },
    { total: 1, live: 1, liveFresh: 1, liveFreshMnpi: 0, liveFreshConditional: 0, liveFreshClear: 1 },
    { total: 1, live: 1, liveFresh: 0, liveFreshMnpi: 0, liveFreshConditional: 0, liveFreshClear: 0 },
    { total: 1, live: 0, liveFresh: 0, liveFreshMnpi: 0, liveFreshConditional: 0, liveFreshClear: 0 },
  ];

  const emitted = shapes.map((s) => {
    const out = verdictFromRegisterCounts({ registerPopulated: true, ...s });
    if (out.kind !== 'holding') throw new Error(`shape did not produce a verdict: ${JSON.stringify(s)}`);
    return out.verdict;
  });

  it('emits exactly the declared set', () => {
    expect([...emitted].sort()).toEqual([...GPS_LISTING_VERDICTS].sort());
  });

  it('every emitted verdict is recognised by the shared engine', () => {
    for (const verdict of emitted) {
      const f = listingPerimeterFinding({ state: 'withheld', verdict, withheldCount: 1 });
      expect(f.kind).toBe('withheld');
      expect(f.code).not.toBe('GPS_LISTING_PERIMETER_VERDICT_UNRECOGNISED');
    }
  });
});
