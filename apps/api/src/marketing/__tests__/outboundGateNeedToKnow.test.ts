import type pg from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetAbuseRegisterMigrated } from '../abuseRegister.js';
import {
  GATE_REFERENCE_PREFIX_LEN,
  MAX_SYMBOLS_LOOKED_UP,
  MAX_SYMBOLS_PER_GATE_CALL,
  _resetGateLedgerMigrated,
  gateOutboundText,
  gateReferenceFrom,
  recordGateDecision,
  type OutboundGateVerdict,
} from '../outboundGate.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE EMBARGO REFUSAL, SPLIT BY NEED TO KNOW — AND THE ORACLE IT USED TO BE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The refusal `checkEmbargo` produces names the asset, quotes the basis, names whoever
 * recorded the row and gives the date, and it was handed to WHOEVER ASKED — a social media
 * drafter at `operate` tier. An embargo row is inside information: it says a listing, or an
 * intermediate step under Art 87(2)-(3), exists and is not public. Art 90(1) forbids
 * disclosing inside information "to any other person". So the gate written to prevent an
 * Art 90 disclosure was committing one on every single block, and the drafter who read it
 * became an insider — subject to Art 89(2) — without being asked or told.
 *
 * The defect is not that the sentence was too detailed. It is that THREE OUTCOMES WERE
 * DISTINGUISHABLE:
 *
 *   ART_90_ASSET_UNDER_EMBARGO   the desk holds a live embargo on this symbol   ← the secret
 *   EMBARGO_REGISTER_ABSENT      the desk holds no register at all              ← benign
 *   ASSET_STATE_UNKNOWN          rows exist, this symbol is not among them      ← benign
 *
 * Any observable difference between them identifies the secret, because two of the three
 * are benign. That is why the first `describe` below does not check that the sentence was
 * shortened: it checks that the ENTIRE verdict a non-cleared reader receives is deep-equal
 * across all three, over one unchanged draft. Every other assertion in this file is
 * secondary to that one.
 *
 * WHAT IS NOT CLAIMED. A drafter can still submit one symbol at a time and watch
 * refused-versus-released, which separates "not cleared" from "cleared" — it does NOT
 * separate the three above, and each probe writes its own 0062 row under the prober's name.
 * The symbol bound asserted at the end is what forces a sweep to be many recorded requests
 * rather than one. Detectable, not closed.
 *
 * DATABASE-FREE, like the rest of the api suite: the stub answers the statements the gate
 * issues, so these prove the composition and the projection, not Postgres.
 */

interface Row { [k: string]: unknown }

function stub(opts: {
  migrated?: boolean;
  ledger?: boolean;
  embargoRows?: Row[];
  /** Does the embargo table hold ANY row, independent of the symbol-scoped slice above? */
  embargoAnyRows?: boolean;
  holdingsRows?: Row[];
} = {}) {
  const inserts: { sql: string; params: unknown[] }[] = [];
  const seen: string[] = [];
  /** Every symbol list the embargo loader was actually handed, for the bound assertions. */
  const embargoLookups: string[][] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      seen.push(sql);
      if (/SELECT asset_symbol, state, embargoed_from/.test(sql)) {
        embargoLookups.push([...((params[0] as string[] | undefined) ?? [])]);
      }
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
  return { pool: pool as unknown as pg.Pool, inserts, seen, embargoLookups };
}

const NOW = '2026-08-03T12:00:00.000Z';
const DRAFTER = 'drafter-a';
/** Whoever entered the row in the fixture. A fixture identity, not a real person. */
const RECORDER = 'recorder-b';

const declaredNone = (symbol: string, member = DRAFTER): Row => ({
  member_id: member,
  asset_symbol: symbol,
  holds: false,
  declared_at: '2026-07-01T00:00:00.000Z',
  renew_by: '2026-12-01T00:00:00.000Z',
});

const embargo = (symbol: string, state: string): Row => ({
  asset_symbol: symbol,
  state,
  embargoed_from: '2026-08-01T00:00:00.000Z',
  review_by: '2026-12-01T00:00:00.000Z',
  entered_by: RECORDER,
  entered_at: '2026-08-01T00:00:00.000Z',
});

const gate = (text: string, over: Partial<Parameters<typeof gateOutboundText>[1]> = {}) => ({
  text,
  verb: 'reply' as const,
  channel: 'x_public' as const,
  actor: DRAFTER,
  phase: 'draft' as const,
  now: NOW,
  ...over,
});

/**
 * ONE draft, held constant across every scenario. The oracle is about the REGISTER, so the
 * text has to be identical or the comparison proves nothing.
 */
const DRAFT = 'SOL deposits are open.';

/**
 * What the caller is actually shown. `ledgerOnly` is stripped because it is the field that
 * MUST differ — it is the desk's own record — and a route that serialises it reopens the
 * hole. Everything else here is response-bound.
 */
const shownToCaller = (v: OutboundGateVerdict) => {
  const { ledgerOnly: _record, ...rest } = v;
  return rest;
};

/** The three register states that must be indistinguishable. Same holdings in all three. */
const SCENARIOS = {
  /** The secret: a live embargo on the symbol this draft names. */
  embargoed: {
    embargoRows: [embargo('SOL', 'mnpi_pending')],
    holdingsRows: [declaredNone('SOL')],
  },
  /** Benign: the desk holds no register at all. */
  registerEmpty: {
    embargoRows: [],
    embargoAnyRows: false,
    holdingsRows: [declaredNone('SOL')],
  },
  /** Benign: the register holds rows, none of them for this symbol, nobody attested it. */
  symbolAbsent: {
    embargoRows: [],
    embargoAnyRows: true,
    holdingsRows: [declaredNone('SOL')],
  },
} as const;

const run = async (
  scenario: keyof typeof SCENARIOS,
  over: Partial<Parameters<typeof gateOutboundText>[1]> = {},
) => gateOutboundText(stub(SCENARIOS[scenario]).pool, gate(DRAFT, over));

beforeEach(() => {
  _resetAbuseRegisterMigrated();
  _resetGateLedgerMigrated();
});

describe('a non-approver cannot tell an embargo from an empty register', () => {
  /*
   * THE ASSERTION THE WHOLE CHANGE RESTS ON. Not "the sentence is shorter" — that would
   * still pass while the code, the resolution array, the matched span or the refusal COUNT
   * gave the answer away. Deep equality over everything a caller can see is the only form
   * of this test that cannot be satisfied by a partial redaction.
   */
  it('returns a byte-identical verdict for embargoed, empty-register and symbol-absent', async () => {
    const embargoed = await run('embargoed');
    const empty = await run('registerEmpty');
    const absent = await run('symbolAbsent');

    expect(shownToCaller(embargoed)).toEqual(shownToCaller(empty));
    expect(shownToCaller(embargoed)).toEqual(shownToCaller(absent));
    // And all three are refused. Scoping the explanation must not soften the refusal.
    for (const v of [embargoed, empty, absent]) {
      expect(v.allowed).toBe(false);
      expect(v.usableText).toBeNull();
      expect(v.disposition).toBe('refused');
    }
  });

  it('emits exactly one refusal however many symbols are restricted', async () => {
    /*
     * THREE named symbols: SOL is embargoed, ETH is absent from an unattested register, BTC
     * is clear. Unscoped that is TWO refusals with two different codes, and passing them
     * through one-for-one would tell the drafter that two of their three symbols are not
     * cleared — a count is an oracle with fewer steps. One refusal, always.
     */
    const { pool } = stub({
      embargoRows: [embargo('SOL', 'mnpi_pending'), embargo('BTC', 'clear')],
      holdingsRows: [declaredNone('SOL'), declaredNone('BTC'), declaredNone('ETH')],
    });
    const v = await gateOutboundText(pool, gate('SOL, ETH and BTC deposits are open.'));
    expect(v.ledgerOnly.refusalCodes)
      .toEqual(expect.arrayContaining(['ART_90_ASSET_UNDER_EMBARGO', 'ASSET_STATE_UNKNOWN']));
    expect(v.refusals.map((r) => r.code)).toEqual(['ASSET_STATE_UNKNOWN']);
    expect(v.refusals[0]?.matched).toBeNull();
  });

  it('never names the asset, the basis, the recorder or the date anywhere in the payload', async () => {
    const v = await run('embargoed');
    const payload = JSON.stringify(shownToCaller(v));
    /*
     * `assetsExtracted` legitimately contains SOL — it is the drafter's own word — so the
     * asset symbol alone is not the leak. These four are: the state, the register's own
     * wording, the recorder, and the row's date.
     */
    expect(payload).not.toContain('mnpi_pending');
    expect(payload).not.toContain('under embargo');
    expect(payload).not.toContain(RECORDER);
    expect(payload).not.toContain('2026-08-01');
  });

  it('empties the per-asset resolutions rather than showing clears beside a gap', async () => {
    // Three named symbols, one restricted. An array of two clears and no third entry names
    // the third; so a non-cleared reader gets no per-asset array at all.
    const { pool } = stub({
      embargoRows: [embargo('SOL', 'mnpi_pending'), embargo('BTC', 'clear'), embargo('ETH', 'clear')],
      holdingsRows: [declaredNone('SOL'), declaredNone('BTC'), declaredNone('ETH')],
    });
    const v = await gateOutboundText(pool, gate('SOL, BTC and ETH deposits are open.'));
    expect(v.marketAbuse?.embargo).toEqual([]);
  });

  it('gives the drafter a ring and a reference instead of the secret', async () => {
    const v = await run('embargoed');
    const r = v.refusals[0];
    expect(r?.recovery.kind).toBe('supply_data');
    // Who to ask — a role, never a name. Naming the recorder would confirm the row exists.
    expect(v.embargoScope.ring).toContain('approver');
    expect(v.embargoScope.ring).not.toContain(RECORDER);
    // And the reference is quoted in the sentence the drafter reads, not just on a field
    // a client might not render.
    expect(v.embargoScope.reference).toMatch(/^gate:[0-9a-f]{16}$/);
    expect(r?.sentence).toContain(v.embargoScope.reference);
    expect(v.embargoScope.explanationWithheld).toBe(true);
  });

  it('says that the sentence is uniform, so it cannot be over-read as confirmation', async () => {
    // A redaction that hides the fact of redaction invites the inference it was hiding.
    const v = await run('registerEmpty');
    expect(v.refusals[0]?.sentence).toContain('the same sentence is returned');
  });
});

describe('an approver, and the person who entered the row, see the whole verdict', () => {
  it('gives an approver the code, the asset, the basis, the recorder and the date', async () => {
    const v = await run('embargoed', { viewerIsEmbargoApprover: true });
    expect(v.refusals.map((r) => r.code)).toContain('ART_90_ASSET_UNDER_EMBARGO');
    expect(v.embargoScope.clearance).toBe('cleared');
    expect(v.embargoScope.explanationWithheld).toBe(false);
    const payload = JSON.stringify(v);
    expect(payload).toContain('mnpi_pending');
    expect(payload).toContain(RECORDER);
    // The resolution the non-approver could not see, so the approver can act on it.
    expect(v.marketAbuse?.embargo.map((e) => e.asset)).toContain('SOL');
  });

  it('gives the recorder the full verdict without making them an approver', async () => {
    // "Or the person who entered the embargo": telling them what they themselves wrote
    // discloses nothing. The register row's `entered_by` is the only thing that clears them.
    const v = await gateOutboundText(
      stub(SCENARIOS.embargoed).pool,
      gate(DRAFT, { actor: RECORDER }),
    );
    expect(v.embargoScope.clearance).toBe('cleared');
    expect(v.refusals.map((r) => r.code)).toContain('ART_90_ASSET_UNDER_EMBARGO');
  });

  it('puts a recorder back outside the ring the moment someone else\'s row is in play', async () => {
    /*
     * PER-ASSET CLEARANCE WOULD LEAK BY OMISSION. If the recorder of SOL saw SOL's
     * resolution and not BTC's, the missing entry would name BTC. So the clearance is
     * all-or-nothing across the withheld set.
     */
    const { pool } = stub({
      embargoRows: [
        embargo('SOL', 'mnpi_pending'),
        { ...embargo('BTC', 'mnpi_pending'), entered_by: 'someone-else' },
      ],
      holdingsRows: [declaredNone('SOL', RECORDER), declaredNone('BTC', RECORDER)],
    });
    const v = await gateOutboundText(pool, gate('SOL and BTC deposits are open.', { actor: RECORDER }));
    expect(v.embargoScope.clearance).toBe('not_cleared');
    expect(v.refusals.map((r) => r.code)).toEqual(['ASSET_STATE_UNKNOWN']);
  });

  it('treats an absent approver flag as NOT cleared', async () => {
    // The default is the safety property: every route that has not been wired yet gets the
    // scoped view, so forgetting the wiring fails toward silence rather than disclosure.
    const bare = await run('embargoed');
    const explicitFalse = await run('embargoed', { viewerIsEmbargoApprover: false });
    expect(bare.embargoScope.clearance).toBe('not_cleared');
    expect(shownToCaller(bare)).toEqual(shownToCaller(explicitFalse));
  });
});

describe('the full verdict is still recorded, or the remedy is a dead end', () => {
  it('writes the UNSCOPED code to the ledger while the caller sees the scoped one', async () => {
    const { pool, inserts } = stub(SCENARIOS.embargoed);
    const v = await gateOutboundText(pool, gate(DRAFT));
    expect(v.refusals.map((r) => r.code)).toEqual(['ASSET_STATE_UNKNOWN']);
    await recordGateDecision(pool, {
      replyId: null, verdict: v, actor: DRAFTER, phase: 'draft', text: DRAFT,
    });
    const codes = inserts[0]?.params[7] as string[];
    expect(codes).toContain('ART_90_ASSET_UNDER_EMBARGO');
    expect(codes).not.toContain('ASSET_STATE_UNKNOWN');
  });

  it('makes the quoted reference a prefix of the row the approver has to find', async () => {
    /*
     * The remedy tells the drafter to quote a reference to an approver. If the reference and
     * the ledger's `text_sha256` were computed by two expressions, they would drift and the
     * approver's lookup would return nothing — a broken remedy that no other test can see.
     */
    const { pool, inserts } = stub(SCENARIOS.embargoed);
    const v = await gateOutboundText(pool, gate(DRAFT));
    await recordGateDecision(pool, {
      replyId: null, verdict: v, actor: DRAFTER, phase: 'draft', text: DRAFT,
    });
    const storedHash = inserts[0]?.params[5] as string;
    expect(storedHash).toHaveLength(64);
    expect(gateReferenceFrom(storedHash)).toBe(v.embargoScope.reference);
    expect(storedHash.startsWith(v.embargoScope.reference.replace('gate:', ''))).toBe(true);
    expect(v.embargoScope.reference).toHaveLength('gate:'.length + GATE_REFERENCE_PREFIX_LEN);
  });

  it('records the same codes for an approver and a non-approver on the same draft', async () => {
    // The ledger is the desk's record of what the GATE decided, not of who was reading. If
    // these diverged, the record would depend on who happened to run the check.
    const a = stub(SCENARIOS.embargoed);
    const b = stub(SCENARIOS.embargoed);
    const scopedV = await gateOutboundText(a.pool, gate(DRAFT));
    const fullV = await gateOutboundText(b.pool, gate(DRAFT, { viewerIsEmbargoApprover: true }));
    expect(scopedV.ledgerOnly.refusalCodes).toEqual(fullV.ledgerOnly.refusalCodes);
  });
});

describe('one request no longer classifies hundreds of tickers', () => {
  const manySymbols = (n: number) =>
    Array.from({ length: n }, (_, i) => `$SYM${i}`).join(' ');

  it('refuses over the per-request symbol bound', async () => {
    const { pool } = stub();
    const v = await gateOutboundText(pool, gate(manySymbols(MAX_SYMBOLS_PER_GATE_CALL + 1)));
    expect(v.refusals.map((r) => r.code)).toEqual(['LENGTH_BUDGET_EXCEEDED']);
    expect(v.allowed).toBe(false);
    expect(v.refusals[0]?.sentence).toContain(String(MAX_SYMBOLS_PER_GATE_CALL));
  });

  it('refuses rather than truncating, so no join silently ran on part of the draft', async () => {
    /*
     * Checking the first 25 and dropping the rest is the fail-open this file exists to
     * prevent: the verdict would say "checked" for a draft whose remaining symbols were
     * never joined against the embargo register. `marketAbuse` is null because no engine ran.
     */
    const { pool } = stub();
    const v = await gateOutboundText(pool, gate(manySymbols(MAX_SYMBOLS_PER_GATE_CALL + 1)));
    expect(v.marketAbuse).toBeNull();
    expect(v.claimSafety).toBeNull();
    expect(v.usableText).toBeNull();
  });

  it('reads no register at all when the request is over the bound', async () => {
    // The bound is checked before any query, so an over-budget request cannot be used to
    // make the database do the sweep either.
    const { pool, seen } = stub();
    await gateOutboundText(pool, gate(manySymbols(MAX_SYMBOLS_PER_GATE_CALL + 1)));
    expect(seen.filter((s) => /marketing_asset_embargo|d\.member_id/.test(s))).toEqual([]);
  });

  it('lets a plausible artefact through the bound', async () => {
    // A bound that refuses real work is its own failure: the desk stops using the gate and
    // the real risk goes up. Exactly at the ceiling is allowed through to the engines.
    const { pool } = stub();
    const v = await gateOutboundText(pool, gate(manySymbols(MAX_SYMBOLS_PER_GATE_CALL)));
    expect(v.refusals.map((r) => r.code)).not.toContain('LENGTH_BUDGET_EXCEEDED');
    expect(v.marketAbuse).not.toBeNull();
  });

  it('counts only the drafter\'s own lexical symbols, never the promoted ones', async () => {
    /*
     * A budget that counted the NOT_TICKERS promotions would report a number that depends on
     * register contents — "24 symbols, refused" versus "24 symbols, released" would tell the
     * drafter the desk holds a row for one of their suppressed words. That is the oracle this
     * pass closes, reintroduced by the bound meant to make it expensive. So the enforced
     * ceiling on symbols LOOKED UP is higher than the ceiling on symbols the drafter typed.
     */
    expect(MAX_SYMBOLS_LOOKED_UP).toBeGreaterThan(MAX_SYMBOLS_PER_GATE_CALL);
    const { pool } = stub({
      embargoRows: [embargo('AMA', 'mnpi_pending')],
      holdingsRows: [declaredNone('AMA')],
    });
    // 25 lexical symbols plus a suppressed word the desk HAS recorded: at the lexical
    // ceiling, so it is not refused on the budget, and the promotion still happens.
    const text = `${manySymbols(MAX_SYMBOLS_PER_GATE_CALL)} Join our AMA later.`;
    const v = await gateOutboundText(pool, gate(text));
    expect(v.refusals.map((r) => r.code)).not.toContain('LENGTH_BUDGET_EXCEEDED');
    expect(v.assetsExtracted).toContain('AMA');
  });

  it('keeps the derived lookup ceiling true rather than merely stated', async () => {
    /*
     * `MAX_SYMBOLS_LOOKED_UP` is arithmetic in the source — the lexical bound plus the whole
     * NOT_TICKERS population, since that is all the promotion can draw from. Arithmetic in a
     * comment is a claim; this measures what the loader is actually handed, so the stated
     * ceiling cannot become false while the docblock still asserts it.
     */
    const suppressedWords = ['AND', 'THE', 'FOR', 'ARE', 'NOT', 'YOU', 'ALL'];
    const { pool, embargoLookups } = stub({
      embargoRows: suppressedWords.map((s) => embargo(s, 'clear')),
      holdingsRows: suppressedWords.map((s) => declaredNone(s)),
    });
    const text = `${manySymbols(MAX_SYMBOLS_PER_GATE_CALL)} ${suppressedWords.join(' ')}`;
    const v = await gateOutboundText(pool, gate(text));
    // The promotion DID push past the lexical bound — otherwise this asserts nothing.
    expect(v.assetsExtracted.length).toBeGreaterThan(MAX_SYMBOLS_PER_GATE_CALL);
    expect(embargoLookups).toHaveLength(1);
    expect(embargoLookups[0]!.length).toBeLessThanOrEqual(MAX_SYMBOLS_LOOKED_UP);
  });
});
