import type pg from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetAbuseRegisterMigrated } from '../abuseRegister.js';
import {
  EXTRACTION_IS_LEXICAL,
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
      /*
       * The NOT_TICKERS promotion probe. Answered from the SAME rows the two register
       * loads are answered from, deliberately: a stub that could say "the desk has
       * recorded GMT" while the embargo load returns nothing would let a test assert a
       * promotion the real database could not produce.
       */
      if (/SELECT DISTINCT asset_symbol/.test(sql)) {
        const wanted = new Set((params[0] as string[] | undefined) ?? []);
        const symbols = [
          ...(opts.embargoRows ?? []).map((r) => r.asset_symbol as string),
          ...(opts.holdingsRows ?? []).map((r) => r.asset_symbol as string),
        ];
        const hit = [...new Set(symbols.filter((sym) => wanted.has(sym)))];
        return { rows: hit.map((asset_symbol) => ({ asset_symbol })), rowCount: hit.length };
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
 * The whole perimeter answering YES for EVERY named symbol: an in-date `clear` embargo row
 * and an in-date `declared_none` for each. Anything less refuses, which is the point of the
 * perimeter — so every "this is allowed" assertion below has to supply both facts first.
 *
 * IT TAKES A LIST so a fixture can supply the perimeter for a promoted symbol as well as a
 * lexically extracted one — `recordedSymbolsAmong` promotes a suppressed word only when the
 * embargo or holdings register names it, and a test asserting that has to put the row in both
 * places the loaders read.
 */
const cleared = (...symbols: readonly string[]) => ({
  embargoRows: symbols.map((s) => embargo(s, 'clear')),
  holdingsRows: symbols.map((s) => declaredNone(s)),
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

describe('the house token cannot hide behind the missing $ sigil', () => {
  /*
   * `NOT_TICKERS` contains `'LCX'`, and before the promotion that made the bare form a
   * complete bypass: `LCX deposits are open.` extracted NOTHING, so
   * `loadEmbargoRegister(pool, [])` returned nothing and Art 90 and Art 91(3)(c) never ran —
   * on the one symbol this desk is most likely to hold inside information about. `$LCX` was
   * caught, so the entire evasion was deleting one character.
   *
   * The entry stays, because extracting `LCX` unconditionally refuses every pre-cleared
   * holding statement in `crisis.ts` against a register that is `not_attested` by design. What
   * changed is that the desk's own record now overrides the word list.
   */
  it('promotes a bare LCX and refuses it when the desk has recorded an embargo', async () => {
    const { pool } = stub({
      embargoRows: [embargo('LCX', 'mnpi_pending')],
      holdingsRows: [declaredNone('LCX')],
    });
    const v = await gateOutboundText(pool, gate('LCX deposits are open.'));
    expect(v.assetsExtracted).toContain('LCX');
    /*
     * READ FROM `ledgerOnly`, NOT FROM `refusals`. The default caller is not cleared to read
     * the Art 90 basis, so the refusal a drafter SEES is the scoped one — see
     * `outboundGateNeedToKnow.test.ts`. What this test is about is whether the LIMB RAN on a
     * promoted bare symbol, and the desk's own record is where that is visible.
     */
    expect(v.ledgerOnly.refusalCodes).toContain('ART_90_ASSET_UNDER_EMBARGO');
    expect(v.allowed).toBe(false);
  });

  it('answers the bare form exactly as it answers the sigil form', async () => {
    // The two spellings differed by a whole gate. On a recorded symbol they must not differ
    // at all — that equality is the finding, restated as an assertion.
    const rows = { embargoRows: [embargo('LCX', 'mnpi_pending')], holdingsRows: [declaredNone('LCX')] };
    const bare = await gateOutboundText(stub(rows).pool, gate('LCX deposits are open.'));
    const sigil = await gateOutboundText(stub(rows).pool, gate('$LCX deposits are open.'));
    expect(bare.assetsExtracted).toEqual(sigil.assetsExtracted);
    expect(bare.refusals.map((r) => r.code)).toEqual(sigil.refusals.map((r) => r.code));
    expect(bare.allowed).toBe(sigil.allowed);
  });

  it('leaves the bare form unextracted when no row names it, and says so in the caveat', () => {
    // THE RESIDUAL LIMIT, asserted rather than described. An embargo the desk has not
    // recorded is not detected on a suppressed word. `EXTRACTION_IS_LEXICAL` states it, and
    // this pins that the statement and the behaviour agree.
    expect(extractNamedAssets('LCX is a regulated European exchange.')).toEqual([]);
    expect(extractNamedAssets('$LCX is a regulated European exchange.')).toEqual(['LCX']);
    expect(EXTRACTION_IS_LEXICAL).toContain('It can hide one the desk has not.');
  });

  it('still blocks a STANCE about the house token, which is the compensating control', async () => {
    // With no symbol extracted, `title_vi.directional_with_no_named_asset` fires at error
    // severity. So the suppression cannot be used to clear an opinion — only a factual line.
    const { pool } = stub(cleared('BTC'));
    const v = await gateOutboundText(pool, gate('We are very bullish on LCX right now.'));
    expect(v.assetsExtracted).toEqual([]);
    expect(v.blockingViolations.map((x) => x.rule))
      .toContain('title_vi.directional_with_no_named_asset');
    expect(v.allowed).toBe(false);
  });
});

describe('the not-a-ticker presumption is checked against the register, not trusted', () => {
  /*
   * The list is a presumption and a presumption can be wrong — it was wrong five times
   * (`LCX`, `GMT`, `ATH`, `NOW`, `CAN` are all live traded symbols). `recordedSymbolsAmong` is
   * what makes a wrong entry a delay instead of a hole.
   */
  it('promotes a suppressed word the desk HAS recorded, and refuses on it', async () => {
    // 'AMA' is on the presumption list as "ask me anything". If the desk has recorded it as
    // an embargoed symbol, the desk's own record wins over the word list.
    const { pool } = stub({
      embargoRows: [embargo('AMA', 'mnpi_pending')],
      holdingsRows: [declaredNone('AMA')],
    });
    const v = await gateOutboundText(pool, gate('Join our AMA later today.'));
    expect(v.assetsExtracted).toContain('AMA');
    // The record, not the response: the Art 90 explanation is scoped by need to know.
    expect(v.ledgerOnly.refusalCodes).toContain('ART_90_ASSET_UNDER_EMBARGO');
    expect(v.allowed).toBe(false);
  });

  it('leaves a suppressed word alone when no row anywhere names it', async () => {
    // The other half, and the reason this is not just "delete the list": a word with no row
    // is the case where the lookup has nothing to say, so promoting it would add a refusal
    // about the English language. `extractionCaveat` states the limit on every surface.
    const { pool } = stub(cleared('BTC'));
    const v = await gateOutboundText(pool, gate('BTC deposits are processing normally again. Our AMA is later.'));
    expect(v.assetsExtracted).toContain('BTC');
    expect(v.assetsExtracted).not.toContain('AMA');
    expect(v.assetsExtracted).not.toContain('OUR');
    expect(v.allowed).toBe(true);
  });

  it('refuses the text when the promotion probe itself fails', async () => {
    // An unavailable check is not a passed check. Without the probe inside the try, a
    // throwing query would be a 500 that a caller reads as "retry later".
    const pool = {
      query: async (sql: string) => {
        if (/to_regclass/.test(sql)) return { rows: [{ ok: true }], rowCount: 1 };
        if (/SELECT DISTINCT asset_symbol/.test(sql)) throw new Error('connection reset');
        return { rows: [], rowCount: 0 };
      },
    } as unknown as pg.Pool;
    const v = await gateOutboundText(pool, gate('Our AMA is later today.'));
    expect(v.gateError).toBe('connection reset');
    expect(v.disposition).toBe('refused');
    expect(v.allowed).toBe(false);
    // And it still reports what it believed the text named at the moment it broke.
    expect(v.assetsExtracted).toEqual([]);
  });

  it('states the one-character limit in the caveat every surface renders', () => {
    // The bare form needs two characters, because every standalone capital in prose would
    // otherwise be looked up. 0060 admits a one-character symbol, so this is a real limit
    // and it is disclosed rather than left for an operator to discover.
    expect(extractNamedAssets('We paused X deposits.')).toEqual([]);
    expect(extractNamedAssets('We paused $X deposits.')).toEqual(['X']);
    expect(EXTRACTION_IS_LEXICAL).toContain('one-character symbol');
    expect(EXTRACTION_IS_LEXICAL).toContain('$X');
  });
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
    /*
     * Asserted twice on purpose. The LIMB fired — visible in the desk's record — and the
     * DRAFTER was refused without being told which asset or why, because an embargo is
     * inside information and Art 90(1) does not carve out the person who happens to be
     * drafting the tweet. `outboundGateNeedToKnow.test.ts` proves the two are
     * indistinguishable from the benign cases.
     */
    expect(v.ledgerOnly.refusalCodes).toContain('ART_90_ASSET_UNDER_EMBARGO');
    expect(v.refusals.map((r) => r.code)).toEqual(['ASSET_STATE_UNKNOWN']);
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
    // The record: the join ran on the folded symbol rather than being walked past.
    expect(v.ledgerOnly.refusalCodes).toContain('ART_90_ASSET_UNDER_EMBARGO');
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
