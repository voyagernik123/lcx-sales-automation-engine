import type pg from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetAbuseRegisterMigrated } from '../abuseRegister.js';
import {
  _resetGateLedgerMigrated,
  extractNamedAssets,
  gateOutboundText,
  recordGateDecision,
} from '../outboundGate.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE OUTBOUND GATE, EXECUTED — not grepped.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `outboundGateCoverage.test.ts` beside this file reads the gate's SOURCE TEXT and the
 * route registrations. That is the right test for "does a write path consult the gate at
 * all", and it is the wrong test for everything else: it passed while
 *
 *   · the market-abuse call passed `{ actorId, role: 'staff' }` where the shape is
 *     `{ actor, role: 'author' | 'approver' | 'named_spokesperson' }`, so
 *     `resolveHoldings(undefined, …)` returned `not_declared` forever and EVERY draft
 *     naming any symbol refused with "…by undefined (staff)…" whatever the register said;
 *   · `intents: ['marketing']` was not a member of `ArtefactIntent`, so the Art 88(1)
 *     gate returned on its first line for every call ever made;
 *   · `surface: 'x_reply'` was not a member of `ContentSurface`;
 *   · error-severity VIOLATIONS were computed and discarded, so a draft the engine called
 *     `flagged` was cleared, saved, and written to the ledger as `allowed: true`.
 *
 * Every one of those was inside an `as never` cast, so tsc was silent too. A test that
 * greps a file cannot see any of it. These execute the function against a stub pool.
 *
 * DATABASE-FREE, like the rest of the api suite: the stub answers the four statements the
 * gate issues. So these prove the composition of the two engines and the branch on their
 * verdicts, NOT that Postgres holds the register constraints — those are asserted as text
 * in `abuseRegisterMigration.test.ts`, and nothing here claims otherwise.
 */

interface Row { [k: string]: unknown }

function stub(opts: {
  migrated?: boolean;
  ledger?: boolean;
  embargoRows?: Row[];
  /** Does the embargo table hold ANY row? Defaults to "yes if this stub returns one". */
  embargoAnyRows?: boolean;
  holdingsRows?: Row[];
} = {}) {
  const inserts: { sql: string; params: unknown[] }[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      if (/to_regclass\('public\.marketing_outbound_gate_decision'\)/.test(sql)) {
        return { rows: [{ ok: opts.ledger ?? true }], rowCount: 1 };
      }
      if (/to_regclass/.test(sql)) return { rows: [{ ok: opts.migrated ?? true }], rowCount: 1 };
      if (/EXISTS \(SELECT 1 FROM marketing_asset_embargo/.test(sql)) {
        return {
          rows: [{ any_rows: opts.embargoAnyRows ?? (opts.embargoRows ?? []).length > 0 }],
          rowCount: 1,
        };
      }
      if (/SELECT asset_symbol, state, embargoed_from/.test(sql)) {
        return { rows: opts.embargoRows ?? [], rowCount: (opts.embargoRows ?? []).length };
      }
      if (/SELECT d\.member_id, d\.asset_symbol, d\.holds/.test(sql)) {
        return { rows: opts.holdingsRows ?? [], rowCount: (opts.holdingsRows ?? []).length };
      }
      if (/INSERT INTO marketing_outbound_gate_decision/.test(sql)) {
        inserts.push({ sql, params });
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`stub pool: unexpected statement\n${sql}`);
    },
  };
  return { pool: pool as unknown as pg.Pool, inserts };
}

const NOW = '2026-08-03T12:00:00.000Z';
const AUTHOR = 'nik';

/** A `declared_none` for one symbol, in date — the remedy the desk is told to supply. */
const declaredNone = (symbol: string): Row => ({
  member_id: AUTHOR,
  asset_symbol: symbol,
  holds: false,
  declared_at: '2026-07-01T00:00:00.000Z',
  renew_by: '2026-12-01T00:00:00.000Z',
});

/** An in-date embargo row. `clear` is the only state that lets a draft through. */
const embargo = (symbol: string, state: string): Row => ({
  asset_symbol: symbol,
  state,
  embargoed_from: '2026-08-01T00:00:00.000Z',
  review_by: '2026-12-01T00:00:00.000Z',
  entered_by: 'monty',
  entered_at: '2026-08-01T00:00:00.000Z',
});

/**
 * The whole perimeter answering YES for one symbol: an in-date `clear` embargo row and an
 * in-date `declared_none`. Anything less refuses, which is the point of the perimeter —
 * so every "this is allowed" assertion below has to supply both facts first.
 */
const cleared = (symbol: string) => ({
  embargoRows: [embargo(symbol, 'clear')],
  holdingsRows: [declaredNone(symbol)],
});

const gate = (text: string, over: Partial<Parameters<typeof gateOutboundText>[1]> = {}) => ({
  text,
  verb: 'reply' as const,
  channel: 'x_public' as const,
  actor: AUTHOR,
  phase: 'draft' as const,
  now: NOW,
  ...over,
});

beforeEach(() => {
  _resetAbuseRegisterMigrated();
  _resetGateLedgerMigrated();
});

describe('the holdings join resolves the real author', () => {
  it('does not refuse a plain factual reply when the author has declared none', async () => {
    // THE REGRESSION THIS FILE EXISTS FOR. With the phantom `{actorId, role:'staff'}`
    // entry this refused HOLDINGS_DECLARATION_MISSING naming "undefined (staff)", so the
    // desk's remedy path — declare, then draft — could never be reached and the
    // Art 91(3)(c) join was unfalsifiable.
    const { pool } = stub(cleared('BTC'));
    const v = await gateOutboundText(pool, gate('BTC deposits are processing normally again.'));
    expect(v.assetsExtracted).toContain('BTC');
    expect(v.refusals.map((r) => r.code)).not.toContain('HOLDINGS_DECLARATION_MISSING');
    expect(v.allowed).toBe(true);
  });

  it('names no actor as undefined in any refusal it emits', async () => {
    const { pool } = stub({ embargoRows: [embargo('BTC', 'clear')], holdingsRows: [] });
    const v = await gateOutboundText(pool, gate('We are very bullish on BTC right now.'));
    expect(v.allowed).toBe(false);
    for (const r of v.refusals) expect(r.sentence).not.toContain('undefined');
    // And the refusal that DOES fire is the real one, against the real author.
    expect(v.refusals.map((r) => r.code)).toContain('HOLDINGS_DECLARATION_MISSING');
    expect(v.refusals.some((r) => r.sentence.includes(AUTHOR))).toBe(true);
  });

  it('still refuses when the author holds the asset and voices an opinion about it', async () => {
    const { pool } = stub({
      embargoRows: [embargo('BTC', 'clear')],
      holdingsRows: [{ ...declaredNone('BTC'), holds: true }],
    });
    const v = await gateOutboundText(pool, gate('We are very bullish on BTC right now.'));
    expect(v.refusals.map((r) => r.code)).toContain('ART_91_3_C_UNDISCLOSED_HOLDING');
    expect(v.allowed).toBe(false);
  });
});

describe('Art 88(1) is reachable from the gate', () => {
  it('refuses a disclosure artefact that also carries a first-party link', async () => {
    // `intents: ['marketing']` was not an ArtefactIntent, so this limb never fired from
    // any route. The engine was correct the whole time and had no caller.
    const { pool } = stub(cleared('BTC'));
    const v = await gateOutboundText(pool, gate(
      'BTC trading opens on LCX at 14:00 CET today. See https://www.lcx.com for details.',
      { intents: ['inside_information_disclosure', 'promotional'] },
    ));
    expect(v.refusals.map((r) => r.code)).toContain('ART_88_1_DISCLOSURE_MIXED_WITH_MARKETING');
    expect(v.allowed).toBe(false);
  });

  it('defaults a queue answer to community_reply rather than inventing a disclosure', async () => {
    // The conservative default is the one that never ASSERTS a disclosure: whether the
    // desk is the vehicle for an Art 88(1) publication is not inferable from text.
    const { pool } = stub(cleared('BTC'));
    const v = await gateOutboundText(pool, gate('BTC deposits are processing normally again.'));
    expect(v.refusals.map((r) => r.code)).not.toContain('ART_88_1_DISCLOSURE_MIXED_WITH_MARKETING');
    expect(v.allowed).toBe(true);
  });
});

describe('an error-severity violation blocks, and travels', () => {
  it('blocks deal-closing language even though it raises no refusal', async () => {
    // claimSafety.ts:1269 makes this a VIOLATION on purpose ("route it to the Art 7
    // element check before it is cleared"). Nothing routed it, so as an advisory field it
    // meant the draft was cleared and stored.
    const { pool } = stub(cleared('BTC'));
    const v = await gateOutboundText(pool, gate('Open an account and start trading BTC today.'));
    expect(v.blockingViolations.map((x) => x.rule)).toContain('deal_closing.invitation_to_transact');
    expect(v.allowed).toBe(false);
    expect(v.usableText).toBeNull();
    expect(v.disposition).not.toBe('clear');
  });

  it('blocks a mixed-script token, which is the homoglyph ticker', async () => {
    const { pool } = stub(cleared('SOL'));
    // Cyrillic О (U+041E) inside SOL.
    const v = await gateOutboundText(pool, gate('SОL deposits are live now on LCX.'));
    expect(v.blockingViolations.map((x) => x.rule)).toContain('obfuscation.mixed_script');
    expect(v.allowed).toBe(false);
  });

  it('blocks a directional item that names no asset', async () => {
    // The prose case: "the solana listing" extracts nothing, both high-consequence limbs
    // no-op, and this is the only finding that says so.
    const { pool } = stub({});
    const v = await gateOutboundText(pool, gate('very bullish, and it only goes up from here'));
    expect(v.assetsExtracted).toEqual([]);
    expect(v.blockingViolations.map((x) => x.rule))
      .toContain('title_vi.directional_with_no_named_asset');
    expect(v.allowed).toBe(false);
  });

  it('does not block on a warning-severity finding', async () => {
    // `art_88_1.disclosure_artefact_must_stay_clean` fires when Art 88(1) is SATISFIED.
    // A gate that refused on it would be refusing compliance.
    const { pool } = stub(cleared('BTC'));
    // No figure and no link: `UNSOURCED_FIGURE` and the Art 88(1) link limb would both
    // refuse for reasons that have nothing to do with the severity split under test.
    const v = await gateOutboundText(pool, gate(
      'BTC trading is open on LCX from today.',
      { intents: ['inside_information_disclosure'] },
    ));
    expect(v.violations.map((x) => x.rule))
      .toContain('art_88_1.disclosure_artefact_must_stay_clean');
    expect(v.blockingViolations).toEqual([]);
    expect(v.allowed).toBe(true);
  });
});

describe('the embargo join runs against the symbols the text names', () => {
  it('refuses an asset the register holds as mnpi_pending', async () => {
    const { pool } = stub({
      embargoRows: [embargo('SOL', 'mnpi_pending')], holdingsRows: [declaredNone('SOL')],
    });
    const v = await gateOutboundText(pool, gate('SOL deposits are open.'));
    expect(v.refusals.map((r) => r.code)).toContain('ART_90_ASSET_UNDER_EMBARGO');
    expect(v.allowed).toBe(false);
  });

  it('finds a homoglyph ticker rather than skipping the join entirely', async () => {
    // Before the fold, `[A-Z][A-Z0-9]{1,19}` could not span U+041E, so this extracted []
    // and `loadEmbargoRegister(pool, [])` returned nothing: the Art 90 limb was walked
    // past on a string every reader sees as SOL.
    expect(extractNamedAssets('SОL is live')).toContain('SOL');
    const { pool } = stub({
      embargoRows: [embargo('SOL', 'mnpi_pending')], holdingsRows: [declaredNone('SOL')],
    });
    const v = await gateOutboundText(pool, gate('SОL deposits are open.'));
    expect(v.assetsExtracted).toContain('SOL');
    expect(v.refusals.map((r) => r.code)).toContain('ART_90_ASSET_UNDER_EMBARGO');
  });

  it('folds fullwidth forms too, without altering the text either engine reads', async () => {
    expect(extractNamedAssets('ＳＯＬ is live')).toContain('SOL');
  });
});

describe('fail closed is a fact about this function, not a comment in it', () => {
  it('refuses everything when the perimeter migration is absent', async () => {
    const { pool } = stub({ migrated: false, holdingsRows: [] });
    const v = await gateOutboundText(pool, gate('BTC deposits are processing normally.'));
    expect(v.allowed).toBe(false);
    expect(v.refusals.map((r) => r.code)).toContain('HOLDINGS_DECLARATION_MISSING');
  });

  it('refuses rather than rejecting when every query throws', async () => {
    /*
     * A dead pool refuses. NOT via `gateError`, and the difference is worth stating
     * because the docblock could be misread as promising it: `isAbuseRegisterMigrated`
     * catches its own probe failure first and reports the perimeter as unavailable, so the
     * fault arrives as `register_absent` and the refusal names the missing register rather
     * than the connection. `gateError` is reached only by a throw OUTSIDE those probes.
     * Both paths end in `allowed: false` with `usableText: null`, which is the property
     * that matters; the sentence the operator reads differs, and it is honest either way.
     */
    const pool = {
      query: async () => { throw new Error('connection reset'); },
    } as unknown as pg.Pool;
    const v = await gateOutboundText(pool, gate('BTC deposits are processing normally.'));
    expect(v.allowed).toBe(false);
    expect(v.disposition).toBe('refused');
    expect(v.usableText).toBeNull();
    expect(v.refusals.length).toBeGreaterThan(0);
  });
});

describe('the ledger records the reason a draft was blocked', () => {
  it('writes the blocking violation rules, not an empty refusal array', async () => {
    // `allowed=false, refusal_codes={}` and nothing else would be a blocked draft whose
    // reason is nowhere — which is what this table exists to prevent.
    const { pool, inserts } = stub(cleared('BTC'));
    const v = await gateOutboundText(pool, gate('Open an account and start trading BTC today.'));
    const wrote = await recordGateDecision(pool, {
      replyId: 7, verdict: v, actor: AUTHOR, phase: 'draft', text: 'Open an account.',
    });
    expect(wrote).toBe(true);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].sql).toContain('violation_codes');
    const params = inserts[0].params;
    expect(params[3]).toBe(false);                                  // allowed
    expect(params[4]).toBe('flagged');                              // disposition, not 'clear'
    expect(params[8]).toContain('deal_closing.invitation_to_transact');
  });

  it('records a cleared verdict too, so "cleared" and "never checked" differ', async () => {
    const { pool, inserts } = stub(cleared('BTC'));
    const v = await gateOutboundText(pool, gate('BTC deposits are processing normally again.'));
    await recordGateDecision(pool, {
      replyId: 7, verdict: v, actor: AUTHOR, phase: 'clearance', text: 'BTC deposits are fine.',
    });
    expect(inserts[0].params[3]).toBe(true);
    expect(inserts[0].params[8]).toEqual([]);
  });

  it('returns false rather than throwing when 0062 has not been applied', async () => {
    const { pool, inserts } = stub({ ledger: false, ...cleared('BTC') });
    const v = await gateOutboundText(pool, gate('BTC deposits are processing normally again.'));
    expect(await recordGateDecision(pool, {
      replyId: 7, verdict: v, actor: AUTHOR, phase: 'draft', text: 'x',
    })).toBe(false);
    expect(inserts).toHaveLength(0);
  });
});
