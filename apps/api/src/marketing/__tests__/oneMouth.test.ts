import type pg from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetAbuseRegisterMigrated } from '../abuseRegister.js';
import { _resetGateLedgerMigrated } from '../outboundGate.js';
import {
  ONE_MOUTH_CONTRACT,
  ONE_MOUTH_MIGRATION,
  ONE_MOUTH_MODE,
  PERIMETER_CODES,
  SOURCE_COLUMNS,
  UNATTRIBUTED_ACTOR,
  _resetOneMouthLedgerMigrated,
  loadOneMouthShadowReport,
  observeOneMouth,
  recordOneMouthObservation,
  sweepOneMouth,
} from '../oneMouth.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  ONE MOUTH, SHADOW MODE — the engine reaches sales email and campaign copy, and
 *  it stops nothing while it does.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Written before the module, because this pass changes a NUMBER A HUMAN ACTS ON: the
 * shadow rate is the evidence that will be used to argue for or against switching
 * enforcement on over real outbound traffic. A test written after the fact would only
 * describe whatever the code happened to do.
 *
 * ── WHAT EACH GROUP DEFENDS ──────────────────────────────────────────────────
 *  1. THE ENGINE SEES SALES EMAIL AND CAMPAIGN TEXT AT ALL. Before this module it saw
 *     marketing drafts and nothing else, on both of its two call paths.
 *  2. SHADOW MEANS SHADOW. `blocked` is the literal `false`, there is no `allowed` and
 *     no `usableText` anywhere on the observation, and a text the engine refuses comes
 *     back as `wouldBlock` and not as a stop.
 *  3. A FINDING IS ACTIONABLE. Stable code, the provision it cites, and a locator good
 *     enough to go and read the text again.
 *  4. THE THREE STATES NEVER COLLAPSE. not_loaded / recording_nothing_observed /
 *     observed_no_findings are three different facts and each one says which it is.
 *  5. SYMBOLS ARE EXTRACTED SERVER-SIDE. Proven with a payload whose symbol list
 *     CONTRADICTS the text: the contradicting value reaches neither the extraction nor
 *     the observation. (The first version of that test asserted only that `$SOL` was
 *     still extracted while passing empty lists no interface declares — which no
 *     implementation could fail. It described the module instead of testing it.)
 *  6. A WOULD-BE REFUSAL HAS THREE CAUSES, NOT TWO. The register is unattested / the
 *     words are unlawful / THE CHECK NEVER RAN. The third used to be filed under the
 *     first, because `gateFailure` labels its own crash with a perimeter code — so a
 *     window of connection resets was reported as an unattested register.
 *  7. EVERY READ FAILURE REFUSES WITH A CODE. Not only 42P01. A statement timeout or a
 *     permission denial used to reject the whole report, so the surface 500ed and the two
 *     UNREADABLE codes the module declares were unreachable.
 *
 * ── WHAT THESE TESTS CANNOT SEE ──────────────────────────────────────────────
 * The pool is a fake dispatching on SQL text, so they prove the composition and all of
 * the interpretation, and NOTHING about whether Postgres agrees with the SQL or with
 * 0073's CHECK constraints. Those are asserted as text in the migration itself.
 */

interface Row { [k: string]: unknown }

const NOW = '2026-08-06T12:00:00.000Z';
const AUTHOR = 'nik@lcx.com';

const missingTable = (rel: string) =>
  Object.assign(new Error(`relation "${rel}" does not exist`), { code: '42P01' });

/**
 * The stub answers every statement the gate and this module issue. Anything unexpected
 * THROWS rather than returning an empty result: a stub that silently answers `{rows:[]}`
 * to a query nobody anticipated is how a test passes against code that is asking the
 * database the wrong question.
 */
/**
 * A read failure that is NOT a missing relation. 57014 (statement timeout), 42501
 * (permission denied) and a bare connection reset are the failures that actually happen
 * once the table exists — and they were the ones the report rethrew, so the two UNREADABLE
 * codes it declares could never fire and the surface 500ed instead of refusing.
 */
const readFails = (code: string, message: string) =>
  Object.assign(new Error(message), { code });

function stub(opts: {
  embargoRows?: Row[];
  holdingsRows?: Row[];
  shadowLedger?: boolean;
  gateLedger?: boolean;
  /** Tables that do not exist on this fake environment. */
  absent?: readonly string[];
  totals?: Row;
  /** Thrown by the totals read instead of answering. */
  totalsThrows?: Error;
  byCode?: Row[];
  /** Thrown by the `unnest(refusal_codes)` read instead of answering. */
  byCodeThrows?: Error;
  byViolation?: Row[];
  /** Thrown by the `unnest(violation_codes)` read instead of answering. */
  byViolationThrows?: Error;
  bySurface?: Row[];
  /** Thrown by the per-surface read instead of answering. */
  bySurfaceThrows?: Error;
  sources?: Partial<Record<'messages' | 'outreach_tasks' | 'dist_campaigns', Row[]>>;
} = {}) {
  const inserts: { sql: string; params: unknown[] }[] = [];
  const absent = new Set(opts.absent ?? []);
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      if (/to_regclass\('public\.marketing_one_mouth_shadow'\)/.test(sql)) {
        return { rows: [{ ok: opts.shadowLedger ?? true }], rowCount: 1 };
      }
      if (/to_regclass\('public\.marketing_outbound_gate_decision'\)/.test(sql)) {
        return { rows: [{ ok: opts.gateLedger ?? true }], rowCount: 1 };
      }
      if (/to_regclass/.test(sql)) return { rows: [{ ok: true }], rowCount: 1 };
      if (/EXISTS \(SELECT 1 FROM marketing_asset_embargo/.test(sql)) {
        return { rows: [{ any_rows: (opts.embargoRows ?? []).length > 0 }], rowCount: 1 };
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
        const hit = [...new Set(symbols.filter((s) => wanted.has(s)))];
        return { rows: hit.map((asset_symbol) => ({ asset_symbol })), rowCount: hit.length };
      }
      if (/INSERT INTO marketing_outbound_gate_decision/.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      if (/INSERT INTO marketing_one_mouth_shadow/.test(sql)) {
        if (absent.has('marketing_one_mouth_shadow')) throw missingTable('marketing_one_mouth_shadow');
        inserts.push({ sql, params });
        return { rows: [], rowCount: 1 };
      }
      /*
       * THE TWO HISTOGRAMS ARE DISPATCHED ON THE COLUMN, and they have to be. One branch
       * matching `unnest(` answered both, so a report that read `violation_codes` was handed
       * the `refusal_codes` fixture and every assertion about the second histogram passed
       * against a value it never produced.
       */
      if (/unnest\(refusal_codes\)/.test(sql)) {
        if (opts.byCodeThrows) throw opts.byCodeThrows;
        return { rows: opts.byCode ?? [], rowCount: (opts.byCode ?? []).length };
      }
      if (/unnest\(violation_codes\)/.test(sql)) {
        if (opts.byViolationThrows) throw opts.byViolationThrows;
        return { rows: opts.byViolation ?? [], rowCount: (opts.byViolation ?? []).length };
      }
      if (/GROUP BY surface/.test(sql)) {
        if (opts.bySurfaceThrows) throw opts.bySurfaceThrows;
        return { rows: opts.bySurface ?? [], rowCount: (opts.bySurface ?? []).length };
      }
      if (/FROM marketing_one_mouth_shadow/.test(sql)) {
        if (absent.has('marketing_one_mouth_shadow')) throw missingTable('marketing_one_mouth_shadow');
        if (opts.totalsThrows) throw opts.totalsThrows;
        return { rows: [opts.totals ?? {}], rowCount: 1 };
      }
      if (/FROM messages m/.test(sql)) {
        if (absent.has('messages')) throw missingTable('messages');
        return { rows: opts.sources?.messages ?? [], rowCount: 0 };
      }
      if (/FROM outreach_tasks t/.test(sql)) {
        if (absent.has('outreach_tasks')) throw missingTable('outreach_tasks');
        return { rows: opts.sources?.outreach_tasks ?? [], rowCount: 0 };
      }
      if (/FROM dist_campaigns c/.test(sql)) {
        if (absent.has('dist_campaigns')) throw missingTable('dist_campaigns');
        return { rows: opts.sources?.dist_campaigns ?? [], rowCount: 0 };
      }
      throw new Error(`stub pool: unexpected statement\n${sql}`);
    },
  };
  return { pool: pool as unknown as pg.Pool, inserts };
}

const embargo = (symbol: string, state: string): Row => ({
  asset_symbol: symbol,
  state,
  embargoed_from: '2026-08-01T00:00:00.000Z',
  review_by: '2026-12-01T00:00:00.000Z',
  entered_by: 'monty',
  entered_at: '2026-08-01T00:00:00.000Z',
});

const declaredNone = (symbol: string, member = AUTHOR): Row => ({
  member_id: member,
  asset_symbol: symbol,
  holds: false,
  declared_at: '2026-07-01T00:00:00.000Z',
  renew_by: '2026-12-01T00:00:00.000Z',
});

/** The whole perimeter answering YES for every named symbol. Anything less refuses. */
const cleared = (...symbols: readonly string[]) => ({
  embargoRows: symbols.map((s) => embargo(s, 'clear')),
  holdingsRows: symbols.map((s) => declaredNone(s)),
});

const subject = (over: Partial<Parameters<typeof observeOneMouth>[1]> = {}) => ({
  surface: 'sales_email' as const,
  locator: { table: 'messages', rowId: 'msg-1', columns: 'subject+body' },
  text: 'Following up on listing fees.',
  actor: AUTHOR,
  now: NOW,
  ...over,
});

beforeEach(() => {
  _resetAbuseRegisterMigrated();
  _resetGateLedgerMigrated();
  _resetOneMouthLedgerMigrated();
});

/* ════════ 1. THE ENGINE SEES THE OTHER MOUTHS ════════ */

describe('the Title VI engine runs over sales email and campaign text', () => {
  it('extracts a symbol from SALES EMAIL text and refuses it under Art 90', async () => {
    /*
     * Before this module the only text `gateOutboundText` ever saw was a marketing draft.
     * This is the whole claim of the lane, as an assertion: the same engine, over an
     * email body, reaching the same embargo limb.
     */
    const { pool } = stub({
      embargoRows: [embargo('SOL', 'mnpi_pending')],
      holdingsRows: [declaredNone('SOL')],
    });
    const obs = await observeOneMouth(pool, subject({
      text: 'Quick note — we are about to list $SOL, thought you would want the heads-up.',
    }));
    expect(obs.assetsExtracted).toContain('SOL');
    expect(obs.refusalCodes).toContain('ART_90_ASSET_UNDER_EMBARGO');
    expect(obs.wouldBlock).toBe(true);
  });

  it('runs over CAMPAIGN text on the same engine and the same codes', async () => {
    const { pool } = stub({
      embargoRows: [embargo('SOL', 'mnpi_pending')],
      holdingsRows: [declaredNone('SOL')],
    });
    const obs = await observeOneMouth(pool, subject({
      surface: 'dist_campaign',
      locator: {
        table: 'dist_campaigns', rowId: 'camp-1', columns: SOURCE_COLUMNS.dist_campaign,
      },
      text: 'Earn rewards for paying with $SOL support coming soon',
      actor: 'monty@lcx.com',
    }));
    expect(obs.surface).toBe('dist_campaign');
    expect(obs.refusalCodes).toContain('ART_90_ASSET_UNDER_EMBARGO');
  });

  it('reaches the Art 91(3)(c) limb against the real sender of the email', async () => {
    // The holdings limb is the one no wording review can see, and it turns on WHO is
    // sending. The stub declares a holding for this sender.
    const { pool } = stub({
      embargoRows: [embargo('BTC', 'clear')],
      holdingsRows: [{ ...declaredNone('BTC'), holds: true }],
    });
    const obs = await observeOneMouth(pool, subject({
      text: 'We are very bullish on $BTC right now, worth a look before the quarter ends.',
    }));
    expect(obs.refusalCodes).toContain('ART_91_3_C_UNDISCLOSED_HOLDING');
    expect(obs.actor).toBe(AUTHOR);
    expect(obs.actorAttributed).toBe(true);
  });

  it('does not refuse a clean factual email once the perimeter answers', async () => {
    // The other direction, which is what stops this from being a gate that refuses
    // everything: with the perimeter answering, ordinary text passes.
    const { pool } = stub(cleared('BTC'));
    const obs = await observeOneMouth(pool, subject({
      text: '$BTC deposits are processing normally again.',
    }));
    expect(obs.wouldBlock).toBe(false);
    expect(obs.refusalCodes).toEqual([]);
    expect(obs.disposition).not.toBe('refused');
  });
});

/* ════════ 2. SHADOW MEANS SHADOW ════════ */

describe('shadow mode records and blocks nothing', () => {
  it('reports a would-be refusal as wouldBlock and never as a stop', async () => {
    const { pool } = stub({
      embargoRows: [embargo('SOL', 'mnpi_pending')],
      holdingsRows: [declaredNone('SOL')],
    });
    const obs = await observeOneMouth(pool, subject({ text: 'Listing $SOL next week.' }));

    expect(obs.wouldBlock).toBe(true);
    // The literal, pinned as a value: a row in this ledger may never be read as evidence
    // that a send was prevented.
    expect(obs.blocked).toBe(false);
    expect(obs.mode).toBe(ONE_MOUTH_MODE);
    expect(ONE_MOUTH_MODE).toBe('shadow');
  });

  it('carries no field a send path could read as permission', async () => {
    /*
     * STRUCTURAL, NOT CONVENTIONAL. `OutboundGateVerdict` carries `allowed` and
     * `usableText`, and a caller wiring this module in beside the real gate could very
     * easily branch on either. There is nothing here to branch on, and this assertion is
     * what stops one being added quietly later.
     */
    const { pool } = stub(cleared('BTC'));
    const obs = await observeOneMouth(pool, subject({ text: '$BTC deposits are open.' }));
    expect('allowed' in obs).toBe(false);
    expect('usableText' in obs).toBe(false);
  });

  it('records the observation as mode=shadow and blocked=false', async () => {
    const { pool, inserts } = stub({
      embargoRows: [embargo('SOL', 'mnpi_pending')],
      holdingsRows: [declaredNone('SOL')],
    });
    const obs = await observeOneMouth(pool, subject({ text: 'Listing $SOL next week.' }));
    expect(await recordOneMouthObservation(pool, obs)).toBe(true);

    expect(inserts).toHaveLength(1);
    const [mode, blocked] = inserts[0]!.params;
    expect(mode).toBe('shadow');
    expect(blocked).toBe(false);
  });

  it('does not throw when the shadow ledger is absent, and says the count is not evidence', async () => {
    // A module that could 500 a send queue would be enforcement by accident.
    const { pool } = stub({ shadowLedger: false });
    const obs = await observeOneMouth(pool, subject());
    expect(await recordOneMouthObservation(pool, obs)).toBe(false);
  });

  it('records a gate failure as a would-be refusal rather than as a clean pass', async () => {
    // An unavailable check is not a passed check — even in shadow mode, where nothing is
    // blocked, calling it clear would understate the base rate enforcement would produce.
    const pool = {
      query: async (sql: string) => {
        if (/to_regclass/.test(sql)) return { rows: [{ ok: true }], rowCount: 1 };
        if (/SELECT DISTINCT asset_symbol/.test(sql)) throw new Error('connection reset');
        return { rows: [], rowCount: 0 };
      },
    } as unknown as pg.Pool;
    const obs = await observeOneMouth(pool, subject({ text: 'Our AMA is later today.' }));
    expect(obs.gateError).toBe('connection reset');
    expect(obs.wouldBlock).toBe(true);
    expect(obs.blocked).toBe(false);
  });

  it('does not file a gate CRASH under "the register is unattested"', async () => {
    /*
     * THE THIRD CAUSE. `gateFailure` stamps its own crash `ASSET_STATE_UNKNOWN`, which is in
     * PERIMETER_CODES — so attributing from the codes alone made a connection reset
     * indistinguishable from an unattested register, and `loadOneMouthShadowReport` then
     * stated the register as the CAUSE of a window of crashes. The code is still recorded
     * (grep-parity with the gate), and `gateError` is what separates the two.
     */
    const pool = {
      query: async (sql: string) => {
        if (/to_regclass/.test(sql)) return { rows: [{ ok: true }], rowCount: 1 };
        if (/SELECT DISTINCT asset_symbol/.test(sql)) throw new Error('connection reset');
        return { rows: [], rowCount: 0 };
      },
    } as unknown as pg.Pool;
    const obs = await observeOneMouth(pool, subject({ text: 'Our AMA is later today.' }));

    expect(obs.gateError).toBe('connection reset');
    expect(obs.wouldBlock).toBe(true);
    // The code the crash carries IS a perimeter code, which is the whole trap: attribution
    // from the code list alone cannot tell these two facts apart.
    expect(obs.refusalCodes).toContain('ASSET_STATE_UNKNOWN');
    expect(PERIMETER_CODES).toContain('ASSET_STATE_UNKNOWN');
    // The claim under test: nothing here read a register, so nothing here is evidence about
    // one. NEGATIVE assertion, so it is not wrapped in anything that could pass vacuously.
    expect(obs.perimeterAttributable).toBe(false);
  });

  it('states the digest as unavailable — and blames no register — when the observer itself throws', async () => {
    /*
     * THE OTHER FAILURE PATH, which is `observeOneMouth`'s own catch rather than the gate's.
     * `gateOutboundText` never rejects (its whole body is a try that resolves with
     * `gateFailure`), so the only way in is a `gateTextSha256` that throws — a `text` that is
     * not a string, which is what a driver shape change on `messages.body` looks like from
     * here. Recorded as a would-be refusal with a STATED 64-zero digest, because 0073's CHECK
     * admits only 64 hex characters and a row that cannot be written is an observation lost —
     * and NOT as perimeter-attributable, because no register was read.
     */
    const { pool } = stub(cleared('BTC'));
    const obs = await observeOneMouth(pool, subject({
      text: { length: 12 } as unknown as string,
    }));

    expect(obs.gateError).not.toBeNull();
    expect(obs.wouldBlock).toBe(true);
    expect(obs.blocked).toBe(false);
    expect(obs.textSha256).toBe('0'.repeat(64));
    expect(obs.reference).toBe('gate:reference-unavailable');
    expect(obs.perimeterAttributable).toBe(false);
  });
});

/* ════════ 3. A FINDING IS ACTIONABLE ════════ */

describe('every would-be refusal carries a code, the rule it cites, and a locator', () => {
  it('records the stable code, the provision, and where to find the text again', async () => {
    const { pool, inserts } = stub({
      embargoRows: [embargo('SOL', 'mnpi_pending')],
      holdingsRows: [declaredNone('SOL')],
    });
    const obs = await observeOneMouth(pool, subject({
      locator: { table: 'messages', rowId: 'msg-42', columns: 'subject+body' },
      text: 'Listing $SOL next week.',
    }));

    // The code.
    expect(obs.refusalCodes.length).toBeGreaterThan(0);
    // The rule. Non-empty for every refusal that fired, and it names an instrument.
    expect(obs.rulesCited.length).toBeGreaterThan(0);
    expect(obs.rulesCited.join(' ')).toMatch(/mica|desk_policy|house_doctrine|finra|ucpd/i);
    // The locator — table, row and WHICH bytes.
    expect(obs.locator).toEqual({ table: 'messages', rowId: 'msg-42', columns: 'subject+body' });
    // And the digest, which is the one the outbound gate ledger stores, so the same
    // reference resolves at both.
    expect(obs.textSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(obs.reference).toBe(`gate:${obs.textSha256.slice(0, 16)}`);

    await recordOneMouthObservation(pool, obs);
    const params = inserts[0]!.params;
    expect(params).toContain('messages');
    expect(params).toContain('msg-42');
    expect(params).toContain(obs.textSha256);
  });

  it('states the lexical limit on every observation rather than implying completeness', async () => {
    const { pool } = stub(cleared('BTC'));
    const obs = await observeOneMouth(pool, subject({ text: '$BTC deposits are open.' }));
    expect(obs.extractionCaveat).toContain('matched lexically');
  });

  it('marks an unattributed sender as such instead of naming a colleague', async () => {
    /*
     * `messages` records the recipient, not the author; the sender lives on the sequence
     * and can be null. Those observations still refuse — a text whose author is unknown
     * cannot have its holdings limb cleared — and the flag is what stops that refusal
     * being read as a finding about a named person.
     */
    const { pool } = stub(cleared('BTC'));
    const obs = await observeOneMouth(pool, subject({
      actor: null,
      text: 'We are very bullish on $BTC right now.',
    }));
    expect(obs.actorAttributed).toBe(false);
    expect(obs.actor).toBe(UNATTRIBUTED_ACTOR);
    expect(obs.actor).toContain('unattributed');
  });

  it('separates a register-caused refusal from a text-caused one', async () => {
    // Every code in PERIMETER_CODES fires today on any text naming any symbol, because
    // the embargo register is not attested by design. Reported as one number the rate
    // would read ~100% and would mean nothing.
    const { pool } = stub({ embargoRows: [], holdingsRows: [] });
    const obs = await observeOneMouth(pool, subject({ text: 'A note about $SOL.' }));
    expect(obs.wouldBlock).toBe(true);
    expect(obs.perimeterAttributable).toBe(true);
    expect(obs.refusalCodes.some((c) => PERIMETER_CODES.includes(c))).toBe(true);
  });
});

/* ════════ 4. SYMBOLS ARE EXTRACTED SERVER-SIDE ════════ */

describe('a caller cannot suppress the check by omitting a field', () => {
  it('never lets a caller-supplied symbol list reach the observation', async () => {
    /*
     * WHAT THE FIRST VERSION OF THIS TEST PROVED, WHICH WAS NOTHING. It passed
     * `namedAssets: []`, `symbols: []` and `assetsExtracted: []` and asserted that `$SOL` was
     * still extracted. No interface declares any of those keys, so no implementation could
     * read them without being written to do it: the assertion held for every possible
     * implementation, which makes it a description rather than a test.
     *
     * WHAT IS ACTUALLY FALSIFIABLE. The payload now carries a symbol list that CONTRADICTS
     * the text — `DOGE`, which the text never names — and the assertions are that the
     * caller's value never appears in the extraction, and that no key the caller invented
     * appears anywhere on the observation. Both fail against the obvious wrong
     * implementation, `return { ...subject, ...base, … }`, which is exactly how a
     * caller-controlled field gets into a control record. There is still no symbol field on
     * `OneMouthSubject` — that is what the interface's own docblock is for; this is the
     * behavioural half.
     */
    const { pool } = stub({
      embargoRows: [embargo('SOL', 'mnpi_pending')],
      holdingsRows: [declaredNone('SOL')],
    });
    const payload = {
      ...subject({ text: 'Heads-up: $SOL is going live.' }),
      namedAssets: ['DOGE'],
      symbols: ['DOGE'],
      assetsExtracted: ['DOGE'],
      perimeterAttributable: false,
      wouldBlock: false,
    } as Parameters<typeof observeOneMouth>[1];

    const obs = await observeOneMouth(pool, payload);
    // Extracted from the text, server-side.
    expect(obs.assetsExtracted).toContain('SOL');
    expect(obs.refusalCodes).toContain('ART_90_ASSET_UNDER_EMBARGO');
    expect(obs.wouldBlock).toBe(true);
    // And the caller's contradicting claims reached nothing.
    expect(obs.assetsExtracted).not.toContain('DOGE');
    expect(Object.keys(obs)).not.toContain('namedAssets');
    expect(Object.keys(obs)).not.toContain('symbols');
    expect(JSON.stringify(obs)).not.toContain('DOGE');
  });

  it('folds a homoglyph so a lookalike ticker is still looked up', async () => {
    // One Cyrillic О was a complete bypass of the Art 90 join before the gate folded
    // homoglyphs. Asserted here because the shadow count would otherwise be quietly
    // beatable by anybody who knew.
    const { pool } = stub({
      embargoRows: [embargo('SOL', 'mnpi_pending')],
      holdingsRows: [declaredNone('SOL')],
    });
    const obs = await observeOneMouth(pool, subject({ text: 'Heads-up: SОL is going live.' }));
    expect(obs.assetsExtracted).toContain('SOL');
  });
});

/* ════════ 5. THE THREE STATES ════════ */

describe('a surface showing nothing says which nothing it is', () => {
  it('not_loaded when 0073 has not been applied — never a report of zero findings', async () => {
    const { pool } = stub({ absent: ['marketing_one_mouth_shadow'] });
    const r = await loadOneMouthShadowReport(pool, { now: new Date(NOW) });

    expect(r.state).toBe('not_loaded');
    expect(r.counts.observations).toBeNull();
    expect(r.counts.wouldBlock).toBeNull();
    expect(r.byCode).toBeNull();
    expect(r.bySurface).toBeNull();
    expect(r.refusals.map((x) => x.code)).toContain('ONE_MOUTH_LEDGER_ABSENT');
    expect(r.stateStatement).toContain('NOTHING IS KNOWN');
    expect(r.refusals.some((x) => x.rule.includes('three states are never collapsed'))).toBe(true);
  });

  it('recording_nothing_observed when the ledger is readable and empty', async () => {
    /*
     * THE STATE THAT WOULD OTHERWISE BE A SILENT PASS. The instrument is installed and
     * nothing has ever been put through it. A screen that rendered this as "no findings"
     * would be asserting that outbound text was checked and found clean.
     */
    const { pool } = stub({
      totals: {
        observations: '0', would_block: '0', perimeter: '0', distinct_texts: '0',
        unattributed: '0', gate_errors: '0', earliest: null, latest: null,
      },
    });
    const r = await loadOneMouthShadowReport(pool, { now: new Date(NOW) });

    expect(r.state).toBe('recording_nothing_observed');
    expect(r.counts.observations).toBe(0);
    expect(r.stateStatement).toContain('nothing has been put through it');
    expect(r.stateStatement).toContain('not');
  });

  it('observed_no_findings is a MEASURED zero and carries its frame', async () => {
    const { pool } = stub({
      totals: {
        observations: '37', would_block: '0', perimeter: '0', distinct_texts: '12',
        unattributed: '4', gate_errors: '0',
        earliest: '2026-07-20T09:00:00.000Z', latest: '2026-08-05T18:00:00.000Z',
      },
      bySurface: [{ surface: 'sales_email', n: '37', wb: '0' }],
    });
    const r = await loadOneMouthShadowReport(pool, { now: new Date(NOW), windowDays: 30 });

    expect(r.state).toBe('observed_no_findings');
    expect(r.counts.observations).toBe(37);
    expect(r.counts.wouldBlock).toBe(0);
    // A zero is a claim, so it carries what was observed, when, over what window, and
    // where it was read from.
    expect(r.frame.windowDays).toBe(30);
    expect(r.frame.windowTo).toBe(NOW);
    expect(r.frame.windowFrom < r.frame.windowTo).toBe(true);
    expect(r.frame.captures.length).toBeGreaterThan(0);
    expect(r.frame.doesNotCapture.length).toBeGreaterThan(0);
    expect(r.frame.knownBiases.length).toBeGreaterThan(0);
    expect(r.frame.earliestObservation).toBe('2026-07-20T09:00:00.000Z');
    // THE ENVIRONMENT LABEL. Never NODE_ENV alone.
    expect(r.frame.environment).toMatch(/·/);
    expect(r.frame.source).toBe('marketing_one_mouth_shadow');
  });

  it('observed_with_findings publishes the number and splits out the perimeter half', async () => {
    const { pool } = stub({
      totals: {
        observations: '120', would_block: '96', perimeter: '90', distinct_texts: '31',
        unattributed: '12', gate_errors: '1',
        earliest: '2026-07-10T09:00:00.000Z', latest: '2026-08-05T18:00:00.000Z',
      },
      byCode: [
        { code: 'HOLDINGS_DECLARATION_MISSING', n: '90' },
        { code: 'ART_90_ASSET_UNDER_EMBARGO', n: '6' },
      ],
      bySurface: [
        { surface: 'dist_campaign', n: '20', wb: '16' },
        { surface: 'sales_email', n: '100', wb: '80' },
      ],
    });
    const r = await loadOneMouthShadowReport(pool, { now: new Date(NOW) });

    expect(r.state).toBe('observed_with_findings');
    expect(r.counts.wouldBlock).toBe(96);
    expect(r.counts.perimeterAttributable).toBe(90);
    expect(r.counts.distinctTexts).toBe(31);
    expect(r.byCode).toEqual({
      HOLDINGS_DECLARATION_MISSING: 90,
      ART_90_ASSET_UNDER_EMBARGO: 6,
    });
    expect(r.bySurface?.map((s) => s.surface)).toEqual(['dist_campaign', 'sales_email']);
    expect(r.stateStatement).toContain('96');
    expect(r.stateStatement).toContain('90');
  });

  it('refuses to let a perimeter-only rate be read as a finding about the text', async () => {
    const { pool } = stub({
      totals: {
        observations: '50', would_block: '50', perimeter: '50', distinct_texts: '9',
        unattributed: '0', gate_errors: '0',
        earliest: '2026-07-10T09:00:00.000Z', latest: '2026-08-05T18:00:00.000Z',
      },
      byCode: [{ code: 'HOLDINGS_DECLARATION_MISSING', n: '50' }],
      bySurface: [{ surface: 'sales_email', n: '50', wb: '50' }],
    });
    const r = await loadOneMouthShadowReport(pool, { now: new Date(NOW) });
    expect(r.refusals.map((x) => x.code)).toContain('ONE_MOUTH_RATE_IS_PERIMETER_ONLY');
    expect(r.counts.gateErrors).toBe(0);
  });

  it('does not state the register as the cause of a window of gate crashes', async () => {
    /*
     * THE LIE THIS ASSERTS AGAINST, IN THE REPORT RATHER THAN THE OBSERVATION.
     * ONE_MOUTH_RATE_IS_PERIMETER_ONLY states as FACT that "the embargo and holdings
     * registers are not attested". These rows are perimeter-attributable AND carry a gate
     * error on every one — which is what the ledger looks like for observations written
     * before `observeOneMouth` stopped conflating the two — and in that window the sentence
     * is simply false: nothing read a register.
     *
     * The gate-error count is published beside it and nothing consulted it. Now it decides.
     */
    const { pool } = stub({
      totals: {
        observations: '50', would_block: '50', perimeter: '50', distinct_texts: '9',
        unattributed: '0', gate_errors: '50',
        earliest: '2026-07-10T09:00:00.000Z', latest: '2026-08-05T18:00:00.000Z',
      },
      byCode: [{ code: 'ASSET_STATE_UNKNOWN', n: '50' }],
      bySurface: [{ surface: 'sales_email', n: '50', wb: '50' }],
    });
    const r = await loadOneMouthShadowReport(pool, { now: new Date(NOW) });
    const codes = r.refusals.map((x) => x.code);

    expect(codes).toContain('ONE_MOUTH_BLOCKS_ARE_GATE_FAILURES');
    // NEGATIVE, and outside anything that could make it pass against an unbuilt payload.
    expect(codes).not.toContain('ONE_MOUTH_RATE_IS_PERIMETER_ONLY');
    // The third cause is named in the headline sentence too, not only in a refusal.
    expect(r.stateStatement).toContain('CHECK ITSELF DID NOT COMPLETE');
    expect(r.counts.gateErrors).toBe(50);
  });

  it('refuses with a stable code when the ledger read fails for any reason but 42P01', async () => {
    /*
     * IT USED TO RETHROW. Only a missing relation was handled, so a statement timeout took
     * the whole surface to a 500 — and a 500 is the one answer this report may not give,
     * because it says nothing about which of the four states the ledger is in.
     */
    const { pool } = stub({ totalsThrows: readFails('57014', 'canceling statement due to statement timeout') });
    const r = await loadOneMouthShadowReport(pool, { now: new Date(NOW) });

    expect(r.state).toBe('not_loaded');
    expect(r.refusals.map((x) => x.code)).toContain('ONE_MOUTH_LEDGER_UNREADABLE');
    // Not conflated with "the table does not exist here": different code, different remedy.
    expect(r.refusals.map((x) => x.code)).not.toContain('ONE_MOUTH_LEDGER_ABSENT');
    expect(r.counts.observations).toBeNull();
    expect(r.stateStatement).toContain('statement timeout');
  });

  it('fires the declared UNREADABLE codes on the failures that can actually happen', async () => {
    /*
     * BOTH CODES WERE UNREACHABLE. They are documented as "the breakdown failed while the
     * totals succeeded" and both only fired on 42P01 — which cannot happen once the totals
     * query over the same relation has answered. The reachable failures rethrew.
     */
    const totals = {
      observations: '120', would_block: '96', perimeter: '90', distinct_texts: '31',
      unattributed: '12', gate_errors: '0', earliest: NOW, latest: NOW,
    };
    const histogramTimedOut = await loadOneMouthShadowReport(
      stub({ totals, byCodeThrows: readFails('57014', 'canceling statement due to statement timeout') }).pool,
      { now: new Date(NOW) },
    );
    expect(histogramTimedOut.byCode).toBeNull();
    expect(histogramTimedOut.refusals.map((x) => x.code))
      .toContain('ONE_MOUTH_CODE_HISTOGRAM_UNREADABLE');

    const splitDenied = await loadOneMouthShadowReport(
      stub({ totals, bySurfaceThrows: readFails('42501', 'permission denied for table marketing_one_mouth_shadow') }).pool,
      { now: new Date(NOW) },
    );
    expect(splitDenied.bySurface).toBeNull();
    expect(splitDenied.refusals.map((x) => x.code))
      .toContain('ONE_MOUTH_SURFACE_SPLIT_UNREADABLE');
    // And the split disagreement is NOT also claimed: there is no split to disagree with.
    expect(splitDenied.refusals.map((x) => x.code)).not.toContain('ONE_MOUTH_SPLIT_DISAGREES');
  });

  it('never publishes a per-surface count it could not read as a measured zero', async () => {
    /*
     * `int(r.n) ?? 0` WAS THE SAME FAIL-OPEN THE TOTALS HAD ALREADY BEEN HARDENED AGAINST,
     * one block below the hardening. An unread surface was published as a measured zero, and
     * the reconciliation cannot catch it while the other surfaces still sum to the total —
     * which is precisely the arrangement here: 100 + (unread) against a total of 120.
     */
    const { pool } = stub({
      totals: {
        observations: '120', would_block: '96', perimeter: '90', distinct_texts: '31',
        unattributed: '12', gate_errors: '0', earliest: NOW, latest: NOW,
      },
      bySurface: [
        { surface: 'dist_campaign', n: 'not-a-number', wb: '16' },
        { surface: 'sales_email', n: '100', wb: '80' },
      ],
    });
    const r = await loadOneMouthShadowReport(pool, { now: new Date(NOW) });
    const campaign = r.bySurface!.find((s) => s.surface === 'dist_campaign')!;

    expect(campaign.observations).toBeNull();
    expect(campaign.observations).not.toBe(0);
    expect(r.refusals.map((x) => x.code)).toContain('ONE_MOUTH_SURFACE_COUNT_UNREADABLE');
    expect(r.refusals.find((x) => x.code === 'ONE_MOUTH_SURFACE_COUNT_UNREADABLE')!.sentence)
      .toContain('dist_campaign');
    // A sum over a hole is not a sum, so the disagreement is NOT also asserted.
    expect(r.refusals.map((x) => x.code)).not.toContain('ONE_MOUTH_SPLIT_DISAGREES');
  });

  it('says why the code breakdown is empty beside a non-zero would-block', async () => {
    /*
     * THE REACHABLE CASE THE CODE'S OWN COMMENT FORBIDS. An error-severity VIOLATION blocks
     * while emitting NO refusal code (`outboundGate.ts`), so `would_block: 2` with zero rows
     * in `unnest(refusal_codes)` is ordinary — and `byCode: {}` rendered beside it reads as
     * "no gate fired", which contradicts the count. The read succeeded, so `null` would be a
     * lie; the empty object stays and a sentence says what it means and where to look.
     */
    const { pool } = stub({
      totals: {
        observations: '10', would_block: '2', perimeter: '0', distinct_texts: '10',
        unattributed: '0', gate_errors: '0', earliest: NOW, latest: NOW,
      },
      byCode: [],
      byViolation: [{ code: 'title_vi.directional_with_no_named_asset', n: '2' }],
      bySurface: [{ surface: 'sales_email', n: '10', wb: '2' }],
    });
    const r = await loadOneMouthShadowReport(pool, { now: new Date(NOW) });

    expect(r.byCode).toEqual({});
    expect(r.refusals.map((x) => x.code)).toContain('ONE_MOUTH_BLOCK_CODES_ABSENT');
    // And the report now publishes the histogram that CAN explain those blocks. Before this
    // there was nowhere in the payload a reader could learn which gate fired.
    expect(r.byViolation).toEqual({ 'title_vi.directional_with_no_named_asset': 2 });
  });

  it('states a disagreement between the total and the split instead of picking a number', async () => {
    // Both reads cover the same rows over the same window. If they do not add up, one of
    // them is wrong and neither is trustworthy — which is a thing to say.
    const { pool } = stub({
      totals: {
        observations: '50', would_block: '10', perimeter: '2', distinct_texts: '9',
        unattributed: '0', gate_errors: '0', earliest: NOW, latest: NOW,
      },
      bySurface: [{ surface: 'sales_email', n: '30', wb: '10' }],
    });
    const r = await loadOneMouthShadowReport(pool, { now: new Date(NOW) });
    expect(r.refusals.map((x) => x.code)).toContain('ONE_MOUTH_SPLIT_DISAGREES');
  });

  it('never turns an unreadable count into a claim that nothing would be refused', async () => {
    /*
     * `COUNT(*)` never returns NULL on real Postgres, so this is a shape fault — a renamed
     * column, a view, a driver returning something odd. It matters because the state
     * machine reads `wouldBlock > 0`: an unreadable `wouldBlock` beside a real
     * `observations` would have produced `observed_no_findings`, which is a POSITIVE claim
     * that outbound text was checked and found clean, from a read that failed.
     */
    const { pool } = stub({
      totals: {
        observations: '12', would_block: 'not-a-number', perimeter: '0', distinct_texts: '4',
        unattributed: '0', gate_errors: '0', earliest: NOW, latest: NOW,
      },
    });
    const r = await loadOneMouthShadowReport(pool, { now: new Date(NOW) });
    expect(r.state).toBe('not_loaded');
    expect(r.counts.observations).toBeNull();
    expect(r.stateStatement).toContain('shape fault');
  });

  it('never claims completeness and publishes no proportion', async () => {
    const { pool } = stub({
      totals: {
        observations: '10', would_block: '2', perimeter: '2', distinct_texts: '10',
        unattributed: '0', gate_errors: '0', earliest: NOW, latest: NOW,
      },
      bySurface: [{ surface: 'sales_email', n: '10', wb: '2' }],
    });
    const r = await loadOneMouthShadowReport(pool, { now: new Date(NOW) });

    expect(r.coverage.complete).toBe(false);
    expect(r.frame.completeness).toBe('population_is_what_was_submitted');
    /*
     * No ratio anywhere in the payload: a rate over an unknown denominator is the one number
     * this report must never produce.
     *
     * THE FIRST VERSION OF THIS GUARD ONLY MATCHED KEYS THAT STARTED WITH A FORBIDDEN WORD
     * (`/"(rate|percent|…)[A-Za-z]*":/`), and every key in this payload is camelCase with the
     * qualifier FIRST — so `wouldBlockRate`, `perimeterShare` and `refusalPct`, the three
     * spellings anybody adding a rate here would actually reach for, all passed it untouched.
     * The pattern now catches the forbidden word as a camelCase suffix as well as a prefix.
     *
     * DELIBERATELY NOT A SUBSTRING MATCH: `/rate/` would fire on an innocent `accurateAt`,
     * and a guard that cries wolf is a guard somebody deletes. A key that needs one of these
     * words for an honest reason has to be argued for here, which is the point.
     */
    const forbidden = /"(?:[A-Za-z_]*(?:Rate|Pct|Percent|Percentage|Proportion|Share)|(?:rate|pct|percent|percentage|proportion|share)[A-Za-z_]*)":/;
    const flat = JSON.stringify(r);
    expect(flat).not.toMatch(forbidden);
    // Non-vacuity: the pattern must actually catch the spellings it exists to catch, or the
    // assertion above is a comment. All four of these passed the first version.
    for (const spelling of ['wouldBlockRate', 'blockRate', 'perimeterShare', 'refusalPct']) {
      expect(
        JSON.stringify({ ...r, [spelling]: 0.5 }),
        `the no-proportion guard does not catch "${spelling}", which is exactly the shape a `
        + 'future rate would arrive in',
      ).toMatch(forbidden);
    }
  });

  it('never reports a migration nobody has applied as applied', async () => {
    /*
     * THIS TEST CAUGHT A REAL FAIL-OPEN. `ledgerApplied` was
     * `!PENDING_MIGRATIONS.includes(ONE_MOUTH_MIGRATION)`, and 0073 is absent from that
     * list because `db/migrationLedger.ts` is another lane's file and has never heard of
     * it — so the report published `ledgerApplied: true` for a migration that has reached
     * no database anywhere. Absence from the pending list read as "applied".
     *
     * Today the true state is UNREGISTERED, which is the worst of the three: nothing lists
     * the file, so nobody applies it. Once the lead adds it to PENDING_MIGRATIONS this
     * flips to ONE_MOUTH_LEDGER_PENDING, and only a digest in SHIPPED_MIGRATIONS makes
     * `ledgerApplied` true.
     */
    const { pool } = stub({
      totals: {
        observations: '3', would_block: '0', perimeter: '0', distinct_texts: '3',
        unattributed: '0', gate_errors: '0', earliest: NOW, latest: NOW,
      },
      bySurface: [{ surface: 'sales_email', n: '3', wb: '0' }],
    });
    const r = await loadOneMouthShadowReport(pool, { now: new Date(NOW) });
    expect(r.frame.ledgerApplied).toBe(false);
    const codes = r.refusals.map((x) => x.code);
    expect(
      codes.includes('ONE_MOUTH_MIGRATION_UNREGISTERED') || codes.includes('ONE_MOUTH_LEDGER_PENDING'),
      'the report must state which of the two unapplied states this environment is in',
    ).toBe(true);
    expect(ONE_MOUTH_MIGRATION).toBe('0073_one_mouth_shadow.sql');
    expect(ONE_MOUTH_CONTRACT).toBe('marketing.one_mouth_shadow.v1');
  });
});

/* ════════ 6. THE SWEEP ════════ */

describe('the sweep reads the corpora itself and stops nothing', () => {
  it('observes every mouth and records what it found', async () => {
    const { pool, inserts } = stub({
      ...cleared('BTC'),
      sources: {
        messages: [{ row_id: 'm1', subject: 'Listing update', body: '$BTC deposits are open.', actor: AUTHOR }],
        outreach_tasks: [{ row_id: 't1', subject: null, body: 'Following up on our chat.', actor: null, channel: 'linkedin' }],
        dist_campaigns: [{ row_id: 'c1', subject: 'Pay with PayAgent', body: 'Earn rewards.', actor: 'monty@lcx.com' }],
      },
    });
    const sweep = await sweepOneMouth(pool, { now: new Date(NOW) });

    expect(sweep.blocked).toBe(false);
    expect(sweep.mode).toBe('shadow');
    expect(sweep.sources.map((s) => s.surface)).toEqual(
      ['sales_email', 'assisted_touch', 'dist_campaign'],
    );
    for (const s of sweep.sources) {
      expect(s.state).toBe('read');
      expect(s.observed).toBe(1);
      expect(s.recorded).toBe(1);
    }
    expect(inserts).toHaveLength(3);
    // Every insert claims shadow mode and no block.
    for (const i of inserts) {
      expect(i.params[0]).toBe('shadow');
      expect(i.params[1]).toBe(false);
    }
  });

  it('records a locator whose named parts an operator could actually find', async () => {
    /*
     * 0073 calls `locator_columns` "enough to find the text again". The campaign locator said
     * `name+detail+task_labels` — and there is no `task_labels` column on `dist_campaigns`,
     * nothing reads one, and a NULL `detail` is published as the export's fallback sentence
     * rather than as nothing. An operator following it to the row would have found two of the
     * three parts and been unable to recompute the digest, which is the only thing the
     * locator is for.
     */
    const { pool, inserts } = stub({
      ...cleared('BTC'),
      sources: {
        dist_campaigns: [{ row_id: 'c1', subject: 'Pay with PayAgent', body: null, actor: 'monty@lcx.com' }],
      },
    });
    await sweepOneMouth(pool, { now: new Date(NOW), surfaces: ['dist_campaign'] });

    expect(inserts).toHaveLength(1);
    const columns = String(inserts[0]!.params[5]);
    expect(columns).toBe(SOURCE_COLUMNS.dist_campaign);
    // It must not imply a column that does not exist…
    expect(columns).not.toContain('task_labels');
    // …and it must name where the two non-column parts come from.
    expect(columns).toContain('CAMPAIGN_TASK_LABELS');
    expect(columns).toContain('CAMPAIGN_DESCRIPTION_FALLBACK_PREFIX');
  });

  it('reports a missing source as not_loaded with null counts, not as zero', async () => {
    /*
     * `messages` can exist on an environment where `dist_campaigns` does not (0003
     * against 0043). One guard around the loop would turn one missing table into three
     * zeroes, and a zero and an absence look identical on a panel while meaning opposite
     * things.
     */
    const { pool } = stub({
      ...cleared('BTC'),
      absent: ['dist_campaigns'],
      sources: { messages: [{ row_id: 'm1', subject: 'Hi', body: 'Nothing to see.', actor: AUTHOR }] },
    });
    const sweep = await sweepOneMouth(pool, { now: new Date(NOW) });

    const campaign = sweep.sources.find((s) => s.surface === 'dist_campaign')!;
    expect(campaign.state).toBe('not_loaded');
    expect(campaign.observed).toBeNull();
    expect(campaign.wouldBlock).toBeNull();
    expect(sweep.refusals.map((r) => r.code)).toContain('ONE_MOUTH_SOURCE_ABSENT');

    const email = sweep.sources.find((s) => s.surface === 'sales_email')!;
    expect(email.state).toBe('read');
    expect(email.observed).toBe(1);
  });

  it('says the sweep is not evidence when nothing could be recorded', async () => {
    const { pool } = stub({
      ...cleared('BTC'),
      shadowLedger: false,
      sources: { messages: [{ row_id: 'm1', subject: 'Hi', body: '$BTC is fine.', actor: AUTHOR }] },
    });
    const sweep = await sweepOneMouth(pool, { now: new Date(NOW), surfaces: ['sales_email'] });

    expect(sweep.ledgerAbsent).toBe(true);
    expect(sweep.refusals.map((r) => r.code)).toContain('ONE_MOUTH_LEDGER_ABSENT');
    expect(sweep.sources[0]!.observed).toBe(1);
    expect(sweep.sources[0]!.recorded).toBe(0);
  });
});
