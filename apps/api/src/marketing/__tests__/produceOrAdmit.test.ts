import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  composeExportBundle,
  readBundleSource,
  renderBundleText,
  sha256Hex,
  _resetRecordMigrated,
  type BundleRequest,
  type BundleSource,
  type ClearanceLedgerSource,
  type ClearedStatementRow,
  type RecordRow,
} from '../record.js';
import {
  GATE_MIGRATION,
  GATE_REFERENCE_UNAVAILABLE,
  gateReferenceFrom,
  resolveGateReference,
  _resetGateLedgerMigrated,
} from '../outboundGate.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  P3b — PRODUCE OR ADMIT. The Art 8(2) production stops asserting completeness.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  THE BLIND DECISION THESE TESTS DEFEND: "is this production complete? can I sign
 *  it?", taken once, under a deadline, by the approver calling GET /v1/marketing/export.
 *  The failure mode is not a blank page — it is a page that LOOKS like a complete record
 *  and is not one, because the desk cleared statements the register never received.
 *
 *  THE GAP IS 100% BY CONSTRUCTION TODAY, and that is why every count here is asserted
 *  as a NUMBER rather than as "greater than zero": the clearance path writes a 0062
 *  gate-ledger row and no `marketing_record` row (routes/marketing.ts), `writeRecord`'s
 *  only caller is a separate manual approver POST, and `closeOutPublication` has no
 *  caller at all. So on day one the honest answer is "everything the desk cleared is
 *  unrecorded", and a test that accepted a rounded-down number would pass against a
 *  bundle that hid the finding.
 *
 *  THE THREE BUCKETS ARE ASSERTED SEPARATELY, ON PURPOSE. `hash_differs` — the text was
 *  legitimately edited between clearance and recording — is a DIFFERENT fact from "never
 *  recorded", and folding it into either neighbour is the quiet omission this lane
 *  exists to prevent. Each bucket has its own `it`, and each one fails if the bucketing
 *  collapses.
 *
 *  AND "0 UNRECORDED" IS A FORBIDDEN OUTPUT when the ledger could not be read. 0 and "we
 *  could not look" are different facts about the same screen, and the second one is the
 *  one that must never render as the first.
 *
 *  ── THE UNIT IS THE DISTINCT STATEMENT, NOT THE CLEARANCE EVENT ──
 *  The first cut of this lane counted 0062 ROWS and labelled the total "statements cleared
 *  by the desk". The crisis room accepts a clear from any of three lanes and writes three
 *  rows for the SAME `text_sha256`, so one statement was reported as three unrecorded
 *  statements, the digest was printed three times and three humans were named — a threefold
 *  overstatement of the gap in a document filed with a competent authority. §1b pins the
 *  two figures apart and fails if they are ever collapsed again.
 */

/* ── Fixtures ─────────────────────────────────────────────────────────────────── */

const CLEARED_TEXT = 'LCX is registered with the FMA in Liechtenstein. Nothing here is advice.';
const EDITED_TEXT = 'LCX is registered with the FMA in Liechtenstein. This is not advice.';

const REQ: BundleRequest = {
  requestedBy: 'nik',
  authority: 'FMA Liechtenstein',
  windowFrom: new Date('2026-07-01T00:00:00.000Z'),
  windowTo: new Date('2026-07-31T23:59:59.000Z'),
  jurisdiction: null,
  generatedAt: new Date('2026-08-02T12:00:00.000Z'),
};

function recordRow(over: Partial<RecordRow> = {}): RecordRow {
  const text = over.statement_text ?? CLEARED_TEXT;
  return {
    record_uid: 'rec_0000000000000000000000000000aaaa',
    x_comment_id: '1800000000000000001',
    draft_id: 7,
    regime: 'casp_conduct',
    drafted_by: 'sam',
    drafted_at: '2026-07-10T09:00:00.000Z',
    cleared_by: 'monty',
    cleared_at: '2026-07-10T09:30:00.000Z',
    clearance_reason: 'Reviewed against the claim library.',
    statement_text: text,
    statement_hash: sha256Hex(text),
    published_text: text,
    published_hash: sha256Hex(text),
    published_at: '2026-07-10T09:35:00.000Z',
    published_permalink: 'https://x.com/lcx/status/1800000000000000002',
    close_out_state: 'published',
    close_out_by: 'monty',
    withdrawn_at: null,
    withdrawal_reason: null,
    inbound_context_hash: sha256Hex('is lcx regulated?'),
    inbound_context_excerpt: null,
    context_minimised_at: null,
    mandatory_elements: [{ element: 'fair_clear_not_misleading', present: true }],
    embargo_snapshot: { LCX: 'clear' },
    holdings_snapshot: { sam: 'declared_none' },
    desk_state: { mode: 'normal' },
    consideration_kind: 'none',
    named_assets: ['LCX'],
    jurisdictions: ['li'],
    snapshot_complete: true,
    snapshot_gaps: [],
    retention_class: 'lcx_statement',
    retention_basis: 'inferred_art_68_9_plus_art_88_1',
    retention_expires_at: '2031-07-10T09:00:00.000Z',
    legal_hold: false,
    legal_hold_reason: null,
    legal_hold_until: null,
    ...over,
  };
}

function clearedRow(over: Partial<ClearedStatementRow> = {}): ClearedStatementRow {
  return {
    id: '41',
    reply_id: '3',
    actor: 'monty',
    created_at: '2026-07-10T09:30:00.000Z',
    text_sha256: sha256Hex(CLEARED_TEXT),
    disposition: 'clear',
    ...over,
  };
}

/** The clearance ledger, present and read. Every field is overridable per test. */
function ledger(over: Partial<ClearanceLedgerSource> = {}): ClearanceLedgerSource {
  return {
    ledgerPresent: true,
    cleared: [clearedRow()],
    recordedDigests: [],
    replyComments: [{ id: '3', x_comment_id: '1800000000000000001' }],
    ...over,
  };
}

function source(over: Partial<BundleSource> = {}): BundleSource {
  return {
    registerPresent: true,
    records: [recordRow()],
    refusals: [],
    claims: [],
    transfers: [],
    presentCommentIds: ['1800000000000000001'],
    clearance: ledger(),
    ...over,
  };
}

/** Compose and assert success in one step — every test below needs the value. */
function bundle(over: Partial<BundleSource> = {}) {
  const got = composeExportBundle(REQ, source(over));
  if (!got.ok) throw new Error(`expected a bundle, got refusal ${got.code}: ${got.sentence}`);
  return got.value;
}

/* ── §1 THE THREE BUCKETS ─────────────────────────────────────────────────────── */

describe('a cleared statement the register never received is NAMED, not counted away', () => {
  it('names it by hash, with the actor who cleared it and when', () => {
    // The register holds a DIFFERENT statement, so nothing matches the cleared digest.
    const b = bundle({
      records: [recordRow({ statement_text: 'Something else entirely.' })],
      clearance: ledger({ recordedDigests: [] }),
    });
    expect(b.clearanceReconciliation.state).toBe('measured');
    expect(b.clearanceReconciliation.counts).toEqual({
      clearanceEvents: 1, distinctStatements: 1, recorded: 0, neverRecorded: 1, hashDiffers: 0,
    });
    const [found] = b.clearanceReconciliation.neverRecorded!;
    expect(found).toBeDefined();
    expect(found!.statementHash).toBe(sha256Hex(CLEARED_TEXT));
    expect(found!.clearances).toHaveLength(1);
    expect(found!.clearances[0]!.clearedBy).toBe('monty');
    expect(found!.clearances[0]!.clearedAt).toBe('2026-07-10T09:30:00.000Z');
    expect(found!.firstClearedAt).toBe('2026-07-10T09:30:00.000Z');
    expect(found!.lastClearedAt).toBe('2026-07-10T09:30:00.000Z');
    // The reference is the one the scoped Art 90 refusal tells a drafter to quote, so the
    // approver reading this bundle can resolve the very check that cleared the statement.
    expect(found!.gateReference).toBe(gateReferenceFrom(sha256Hex(CLEARED_TEXT)));
    expect(found!.recordUid).toBeNull();
  });

  it('prints the hash and the actor in the artefact a human hands over', () => {
    const b = bundle({
      records: [recordRow({ statement_text: 'Something else entirely.' })],
      clearance: ledger({ recordedDigests: [] }),
    });
    const text = renderBundleText(b);
    expect(text).toMatch(/CLEARED AND NEVER RECORDED/);
    expect(text).toContain(sha256Hex(CLEARED_TEXT));
    expect(text).toContain('monty');
    // And the bundle must not claim the production is complete anywhere.
    expect(text).toMatch(/does NOT assert that every statement/i);
  });
});

describe('a cleared statement whose bytes ARE in the register is counted, not named', () => {
  it('matches on the 256-bit digest and leaves the unrecorded list empty', () => {
    const b = bundle({
      clearance: ledger({
        recordedDigests: [{
          record_uid: 'rec_hit',
          statement_hash: sha256Hex(CLEARED_TEXT),
          x_comment_id: '1800000000000000001',
          drafted_at: '2026-07-10T09:00:00.000Z',
        }],
      }),
    });
    expect(b.clearanceReconciliation.counts).toEqual({
      clearanceEvents: 1, distinctStatements: 1, recorded: 1, neverRecorded: 0, hashDiffers: 0,
    });
    expect(b.clearanceReconciliation.neverRecorded).toEqual([]);
    expect(b.clearanceReconciliation.hashDiffers).toEqual([]);
  });
});

/* ── §1b THE CLEARANCE-EVENT MULTIPLIER ───────────────────────────────────────── */

/**
 * ONE STATEMENT CLEARED N TIMES IS ONE STATEMENT.
 *
 * `POST /crisis/instance/:id/clearance` "accepts a clear from any of the three lanes" and
 * writes one `phase='clearance' allowed=true` row per lane with the SAME `text_sha256`. The
 * first cut bucketed per ROW and printed the total under "statements cleared by the desk",
 * so this exact shape reported 3 unrecorded STATEMENTS where there is 1 — in an Art 8(2)
 * filing. These tests fail if the two figures are ever collapsed back into one.
 */
describe('one statement cleared by three lanes is ONE statement, not three', () => {
  const threeLanes = () => ledger({
    cleared: [
      clearedRow({ id: '51', actor: 'legal@lcx.com', created_at: '2026-07-12T08:00:00.000Z' }),
      clearedRow({ id: '52', actor: 'comms@lcx.com', created_at: '2026-07-12T08:05:00.000Z' }),
      clearedRow({ id: '53', actor: 'exec@lcx.com', created_at: '2026-07-12T08:09:00.000Z' }),
    ],
    recordedDigests: [],
  });

  it('reports 1 distinct statement behind 3 clearance events, as two separate figures', () => {
    const b = bundle({ records: [recordRow({ statement_text: 'Other.' })], clearance: threeLanes() });
    expect(b.clearanceReconciliation.counts).toEqual({
      clearanceEvents: 3, distinctStatements: 1, recorded: 0, neverRecorded: 1, hashDiffers: 0,
    });
    // ONE entry, not three. This is the assertion that was failing silently before.
    expect(b.clearanceReconciliation.neverRecorded).toHaveLength(1);
  });

  it('keeps every clearing human and every 0062 row on the single entry', () => {
    const b = bundle({ records: [recordRow({ statement_text: 'Other.' })], clearance: threeLanes() });
    const [s] = b.clearanceReconciliation.neverRecorded!;
    expect(s!.clearances.map((e) => e.clearedBy))
      .toEqual(['legal@lcx.com', 'comms@lcx.com', 'exec@lcx.com']);
    expect(s!.clearances.map((e) => e.gateId)).toEqual(['51', '52', '53']);
    expect(s!.firstClearedAt).toBe('2026-07-12T08:00:00.000Z');
    expect(s!.lastClearedAt).toBe('2026-07-12T08:09:00.000Z');
  });

  it('prints the digest ONCE and never says "3 statements"', () => {
    const b = bundle({ records: [recordRow({ statement_text: 'Other.' })], clearance: threeLanes() });
    const text = renderBundleText(b);
    const digest = sha256Hex(CLEARED_TEXT);
    expect(text.split(digest).length - 1).toBe(1);
    // The row count is still reported — nothing is hidden — but under its own label.
    expect(text).toMatch(/DISTINCT statements cleared \.+ 1/);
    expect(text).toMatch(/clearance events behind them \.+ 3/);
    // All three humans are still named beneath the one entry.
    for (const who of ['legal@lcx.com', 'comms@lcx.com', 'exec@lcx.com']) {
      expect(text).toContain(who);
    }
    // And the bundle-level completeness line counts statements, not events.
    const line = b.completeness.find((l) => l.field === 'production_completeness');
    expect(line!.why).toMatch(/^1 distinct statement\(s\)/);
    expect(line!.why).toMatch(/3 gate-ledger row\(s\)/);
  });

  it('takes the STRONGEST correlation across lanes and keeps the weaker ones visible', () => {
    // Lane A answered a reply whose queue row survives; lane B answered one the sweep took.
    const b = bundle({
      records: [recordRow({ statement_text: 'Other.' })],
      clearance: ledger({
        cleared: [
          clearedRow({ id: '61', reply_id: '3', created_at: '2026-07-13T08:00:00.000Z' }),
          clearedRow({ id: '62', reply_id: '99', created_at: '2026-07-13T08:01:00.000Z' }),
        ],
        recordedDigests: [],
      }),
    });
    const [s] = b.clearanceReconciliation.neverRecorded!;
    expect(s!.correlation).toBe('thread_checked_no_record');
    expect(s!.clearances.map((e) => e.correlation))
      .toEqual(['thread_checked_no_record', 'thread_row_swept']);
  });
});

describe('hash_differs is its own finding and is never folded into a neighbour', () => {
  it('reports BOTH digests when the text was edited between clearance and recording', () => {
    const b = bundle({
      clearance: ledger({
        // The record exists on the same thread, with different bytes. A hash join alone
        // cannot tell that from "never recorded", and the two mean opposite things to an
        // approver: one is a gap in the register, the other is an ordinary edit.
        recordedDigests: [{
          record_uid: 'rec_edited',
          statement_hash: sha256Hex(EDITED_TEXT),
          x_comment_id: '1800000000000000001',
          drafted_at: '2026-07-10T09:40:00.000Z',
        }],
      }),
    });
    expect(b.clearanceReconciliation.counts).toEqual({
      clearanceEvents: 1, distinctStatements: 1, recorded: 0, neverRecorded: 0, hashDiffers: 1,
    });
    expect(b.clearanceReconciliation.neverRecorded).toEqual([]);
    const [diff] = b.clearanceReconciliation.hashDiffers!;
    expect(diff!.statementHash).toBe(sha256Hex(CLEARED_TEXT));
    expect(diff!.recordedStatementHash).toBe(sha256Hex(EDITED_TEXT));
    expect(diff!.recordUid).toBe('rec_edited');
    expect(diff!.correlation).toBe('same_thread_different_bytes');
    expect(renderBundleText(b)).toMatch(/hash_differs/);
  });

  it('does not claim an edit was ruled out when the queue was never consulted', () => {
    const b = bundle({
      clearance: {
        ledgerPresent: true,
        cleared: [clearedRow()],
        recordedDigests: [],
        // `replyComments` omitted: the queue was NOT read, so the bundle cannot say whether
        // a same-thread record with different bytes exists. Saying so is the whole point.
      },
    });
    const [found] = b.clearanceReconciliation.neverRecorded!;
    expect(found!.correlation).toBe('thread_not_checked');
    expect(b.clearanceReconciliation.counts!.hashDiffers).toBe(0);
  });

  it('separates a swept queue row from a thread that genuinely holds no record', () => {
    const swept = bundle({
      clearance: ledger({ replyComments: [], recordedDigests: [] }),
    });
    expect(swept.clearanceReconciliation.neverRecorded![0]!.correlation).toBe('thread_row_swept');

    const checked = bundle({ clearance: ledger({ recordedDigests: [] }) });
    expect(checked.clearanceReconciliation.neverRecorded![0]!.correlation)
      .toBe('thread_checked_no_record');
  });
});

/* ── §1c A NULL reply_id DOES NOT MEAN "desk-authored original" ────────────────── */

/**
 * `reply_id IS NULL` was documented and rendered as "a desk-authored original with no
 * inbound reply". That is an inference stated as a fact about a row that carries a named
 * human's principal id into a regulatory filing.
 *
 * THREE live surfaces write `phase='clearance'` rows with a null `reply_id`:
 * `routes/marketingMemory.ts` `POST /crisis/instance/:id/clearance` (web-reachable),
 * `routes/marketingGates.ts` `POST /claim-safety` (which takes `phase` from the request
 * BODY on a `requireOperator` route, so any operator including the shared machine key can
 * put a row into the reconciliation), and a genuine desk original. 0062 has no source
 * column, so the reconciliation CANNOT tell them apart — and the vocabulary now says so.
 */
describe('a null reply_id admits that the originating surface is unknown', () => {
  const noReply = () => bundle({
    records: [recordRow({ statement_text: 'Other.' })],
    clearance: ledger({ cleared: [clearedRow({ reply_id: null })], recordedDigests: [] }),
  });

  it('does not claim it is a desk-authored original', () => {
    const s = noReply().clearanceReconciliation.neverRecorded![0]!;
    expect(s.correlation).toBe('originating_surface_unknown');
    // The old value name is gone. If it returns, so does the inference.
    expect(s.correlation).not.toBe('no_thread_to_correlate');
  });

  it('says in the artefact that three surfaces write such a row and only one owes a record', () => {
    const text = renderBundleText(noReply());
    expect(text).toContain('originating_surface_unknown');
    expect(text).toMatch(/CANNOT be established from/);
    expect(text).toMatch(/three surfaces write such rows and only one of them owes a record/);
    // And the artefact must not print the old inference anywhere.
    expect(text).not.toMatch(/desk-authored original/);
  });
});

/* ── §2 DAY ONE, WHICH IS A LARGE NUMBER AND MUST STAY ONE ─────────────────────── */

describe('the day-one answer is reported plainly rather than rounded away', () => {
  it('reports every cleared statement as unrecorded when writeRecord has no caller', () => {
    const many: ClearedStatementRow[] = Array.from({ length: 40 }, (_, i) => clearedRow({
      id: String(100 + i),
      reply_id: String(i),
      text_sha256: sha256Hex(`draft ${i}`),
      created_at: `2026-07-${String(10 + (i % 20)).padStart(2, '0')}T09:00:00.000Z`,
    }));
    const b = bundle({ clearance: ledger({ cleared: many, recordedDigests: [], replyComments: [] }) });
    expect(b.clearanceReconciliation.counts).toEqual({
      clearanceEvents: 40, distinctStatements: 40, recorded: 0, neverRecorded: 40, hashDiffers: 0,
    });
    // All forty are NAMED. A summary count with a truncated list would be the omission.
    expect(b.clearanceReconciliation.neverRecorded).toHaveLength(40);
    const text = renderBundleText(b);
    for (const row of many) expect(text).toContain(row.text_sha256);
  });

  it('carries the finding on the empty-register refusal instead of losing it', () => {
    // Day one in full: nothing recorded at all, so the bundle refuses. The refusal must
    // still hand over the statements the desk cleared, or the approver learns nothing.
    const got = composeExportBundle(REQ, source({
      records: [],
      clearance: ledger({ recordedDigests: [], replyComments: [] }),
    }));
    expect(got.ok).toBe(false);
    if (got.ok) return;
    expect(got.code).toBe('RECORD_REGISTER_EMPTY');
    // The wording the existing suite pins stays put.
    expect(got.sentence.toLowerCase()).toContain('empty');
    expect(got.sentence).toMatch(/nothing was recorded/i);
    // And the number is in the sentence, because a refusal that says "empty" while the
    // gate ledger holds cleared statements is understating what happened.
    expect(got.sentence).toContain('1 statement');
    expect(got.clearanceReconciliation?.counts?.neverRecorded).toBe(1);
    expect(got.clearanceReconciliation?.neverRecorded![0]!.statementHash)
      .toBe(sha256Hex(CLEARED_TEXT));
  });

  /*
   * THE MAXIMAL-GAP STATE, WHICH USED TO LOSE THE FINDING ENTIRELY.
   *
   * 0062 present, 0061 absent: everything the desk cleared is UNRECORDABLE, not merely
   * unrecorded. `RECORD_REGISTER_ABSENT` returned before the reconciliation was computed, so
   * the artefact said only "migration 0061 has not been applied" — a config nit where the
   * true finding is the total absence of the register the completeness claim depends on.
   * This is the same guard-ordering mistake the empty-register comment was written to avoid.
   */
  it('carries the finding on the ABSENT-register refusal, which is the stronger case', () => {
    const got = composeExportBundle(REQ, source({
      registerPresent: false,
      records: [],
      clearance: ledger({
        cleared: [clearedRow(), clearedRow({ id: '42', reply_id: '4', text_sha256: sha256Hex('two') })],
        recordedDigests: [],
        replyComments: [],
        registerPresent: false,
      }),
    }));
    expect(got.ok).toBe(false);
    if (got.ok) return;
    expect(got.code).toBe('RECORD_REGISTER_ABSENT');
    // The migration is still named — nothing was taken away.
    expect(got.sentence).toContain('0061');
    // And the finding is now there, in the words that distinguish it from "unrecorded".
    expect(got.sentence).toMatch(/ALL 2 statements/);
    expect(got.sentence).toMatch(/unrecordable here — not merely unrecorded/);
    expect(got.sentence).toMatch(/not a configuration nit/i);
    expect(got.clearanceReconciliation?.counts?.neverRecorded).toBe(2);
    expect(got.clearanceReconciliation?.neverRecorded).toHaveLength(2);
  });

  it('still refuses ABSENT with a withdrawn claim when the gate ledger could not be read', () => {
    // Both halves missing. The refusal must not gain a fake number, and it must say which
    // of the two absences it is talking about.
    const got = composeExportBundle(REQ, source({ registerPresent: false, records: [], clearance: undefined }));
    expect(got.ok).toBe(false);
    if (got.ok) return;
    expect(got.code).toBe('RECORD_REGISTER_ABSENT');
    expect(got.sentence).not.toMatch(/ALL 0 statement/);
    expect(got.clearanceReconciliation?.state).toBe('refused');
    expect(got.clearanceReconciliation?.counts).toBeNull();
    expect(got.clearanceReconciliation?.neverRecorded).toBeNull();
  });
});

/* ── §3 ABSENT DATA REFUSES THE COMPLETENESS CLAIM ────────────────────────────── */

describe('the bundle refuses the completeness claim rather than reporting 0 unrecorded', () => {
  it('names 0062 when the gate ledger does not exist on this environment', () => {
    const b = bundle({ clearance: { ledgerPresent: false, cleared: [], recordedDigests: [] } });
    expect(b.clearanceReconciliation.state).toBe('refused');
    expect(b.clearanceReconciliation.counts).toBeNull();
    /*
     * NULL, NOT `[]`. The lists used to be empty arrays beside `counts: null`, so only
     * `state` disambiguated and a consumer reading `.neverRecorded.length === 0` as "nothing
     * missing" got exactly the collapse `counts` was carefully protected from.
     */
    expect(b.clearanceReconciliation.neverRecorded).toBeNull();
    expect(b.clearanceReconciliation.hashDiffers).toBeNull();
    const codes = b.clearanceReconciliation.refusals.map((r) => r.code);
    expect(codes).toContain('RECORD_CLEARANCE_LEDGER_ABSENT');
    expect(b.clearanceReconciliation.refusals[0]!.sentence).toContain(GATE_MIGRATION);
    expect(b.clearanceReconciliation.refusals[0]!.rule).toBe('MiCA Art 8(2)');
  });

  it('uses a DIFFERENT code when the ledger was simply never consulted', () => {
    // not-loaded and does-not-exist are different facts. `clearance: undefined` is the
    // first; `ledgerPresent: false` is the second.
    const b = bundle({ clearance: undefined });
    expect(b.clearanceReconciliation.state).toBe('refused');
    expect(b.clearanceReconciliation.refusals.map((r) => r.code))
      .toContain('RECORD_CLEARANCE_LEDGER_UNREAD');
  });

  it('never prints a zero for the unrecorded count in either refused state', () => {
    for (const clearance of [
      undefined,
      { ledgerPresent: false, cleared: [], recordedDigests: [] } as ClearanceLedgerSource,
    ]) {
      const text = renderBundleText(bundle({ clearance }));
      expect(text).toMatch(/COMPLETENESS OF THIS PRODUCTION/);
      // The forbidden output. `0` here would read as "we checked and found none".
      expect(text).not.toMatch(/cleared and never recorded[\s.]*:?\s*0\b/i);
      expect(text).not.toMatch(/statements cleared[\s.]*:?\s*0\b/i);
      expect(text).toMatch(/WITHDRAWN|cannot be stated|refuses/i);
    }
  });

  it('states a genuine zero as a measured zero when the ledger WAS read and held nothing', () => {
    // The third state. An empty window is a real answer and must not read as a refusal.
    const b = bundle({ clearance: ledger({ cleared: [] }) });
    expect(b.clearanceReconciliation.state).toBe('measured');
    expect(b.clearanceReconciliation.counts).toEqual({
      clearanceEvents: 0, distinctStatements: 0, recorded: 0, neverRecorded: 0, hashDiffers: 0,
    });
    expect(renderBundleText(b)).toMatch(/cleared no statement/i);
  });
});

/* ── §3b THE SCOPE THIS SECTION HAS, AND THE ONE IT DOES NOT ──────────────────── */

/**
 * The bundle is jurisdiction-scoped and this section is not, because 0062 has no Member
 * State column. That cannot be fixed in code, which is exactly why it has to be SAID: a
 * production filed for one Member State was reporting the whole desk's clearances twelve
 * lines below a header printing "Member State filter : de".
 */
describe('the section states the scope it has and the one it cannot have', () => {
  it('says the Member State filter does not reach it, and names the filter', () => {
    const req: BundleRequest = { ...REQ, jurisdiction: 'de' };
    const got = composeExportBundle(req, source());
    if (!got.ok) throw new Error(`unexpected refusal ${got.code}`);
    expect(got.value.clearanceReconciliation.scope.jurisdictionRequested).toBe('de');
    // Not a maybe — the field is typed `false` because it can never be anything else.
    expect(got.value.clearanceReconciliation.scope.jurisdictionApplied).toBe(false);
    const text = renderBundleText(got.value);
    expect(text).toMatch(/Member State\s+: NOT APPLIED to this section/);
    expect(text).toMatch(/narrows the RECORDS only/);
    expect(text).toMatch(/DESK-WIDE for the window/);
    // And it is in the structured completeness list too, for a reader who scans only that.
    const line = got.value.completeness.find(
      (l) => l.field === 'production_completeness_member_state_scope',
    );
    expect(line).toBeDefined();
    expect(line!.state).toBe('unverifiable');
    expect(line!.why).toContain('"de"');
    expect(line!.why).toMatch(/0062 has no Member State column/);
  });

  it('does not invent a filter caveat when no Member State was requested', () => {
    const b = bundle();
    expect(b.completeness.some((l) => l.field === 'production_completeness_member_state_scope'))
      .toBe(false);
    expect(renderBundleText(b)).toMatch(/and none was requested/);
  });

  it('refuses to let a zero-width window read as a desk-wide zero', () => {
    /*
     * `GET /export/:itemId` builds `windowFrom = windowTo = drafted_at`. The clearance read is
     * `created_at >= $1 AND created_at <= $2`, so it can only match rows stamped at exactly
     * that instant — a zero there is an artefact of the window, not a finding.
     */
    const instant = new Date('2026-07-10T09:00:00.000Z');
    const req: BundleRequest = { ...REQ, windowFrom: instant, windowTo: instant };
    const got = composeExportBundle(req, source({ clearance: ledger({ cleared: [] }) }));
    if (!got.ok) throw new Error(`unexpected refusal ${got.code}`);
    expect(got.value.clearanceReconciliation.scope.instantaneousWindow).toBe(true);
    // Normalised: the block is word-wrapped at 74 columns, so the sentence spans lines.
    const text = renderBundleText(got.value).replace(/\s+/g, ' ');
    expect(text).toMatch(/SINGLE INSTANT/);
    expect(text).toMatch(/a zero here does NOT mean the desk cleared nothing/);
    const line = got.value.completeness.find(
      (l) => l.field === 'production_completeness_window',
    );
    expect(line!.state).toBe('unverifiable');
    expect(line!.why).toContain(instant.toISOString());
  });

  it('says the recorded count spans the whole register, not this production', () => {
    // `counts.recorded` is unwindowed by design and can exceed the bundle's own record
    // count. Rendered twelve lines below "records ... M" with no note, N > M reads as a bug.
    const text = renderBundleText(bundle({
      clearance: ledger({
        recordedDigests: [{
          record_uid: 'rec_hit',
          statement_hash: sha256Hex(CLEARED_TEXT),
          x_comment_id: '1800000000000000001',
          drafted_at: '2026-07-10T09:00:00.000Z',
        }],
      }),
    }));
    expect(text).toMatch(/COUNTED OVER THE WHOLE REGISTER/);
    expect(text).toMatch(/can legitimately exceed it/);
  });
});

/* ── §4 DETERMINISM — a digest is only worth printing if it is stable ──────────── */

describe('the reconciliation does not disturb the bundle digest contract', () => {
  it('renders identical bytes for identical rows regardless of arrival order', () => {
    const a = clearedRow({ id: '2', created_at: '2026-07-11T09:00:00.000Z', text_sha256: sha256Hex('a') });
    const z = clearedRow({ id: '1', created_at: '2026-07-12T09:00:00.000Z', text_sha256: sha256Hex('z') });
    const one = bundle({ clearance: ledger({ cleared: [z, a], recordedDigests: [] }) });
    const two = bundle({ clearance: ledger({ cleared: [a, z], recordedDigests: [] }) });
    expect(renderBundleText(one)).toEqual(renderBundleText(two));
    // Grouped by digest, in order of FIRST clearance — so the earlier `created_at` leads
    // regardless of which row arrived first from the driver.
    expect(one.clearanceReconciliation.neverRecorded!.map((s) => s.clearances[0]!.gateId))
      .toEqual(['2', '1']);
  });
});

/* ── §5 THE READ — the LEFT JOIN, as the statements it actually issues ─────────── */

interface Stmt { sql: string; params: unknown[] }

class FakePool {
  statements: Stmt[] = [];
  gatePresent = true;
  queuePresent = true;
  recordPresent = true;
  clearedRows: unknown[] = [];
  recordRows: unknown[] = [];

  async query(sql: string, params: unknown[] = []): Promise<{ rows: unknown[]; rowCount: number }> {
    this.statements.push({ sql, params });
    const q = sql.replace(/\s+/g, ' ').trim();
    if (/to_regclass\('public.marketing_outbound_gate_decision'\)/.test(q)) {
      return {
        rows: [{ gate: this.gatePresent, queue: this.queuePresent, ok: this.gatePresent }],
        rowCount: 1,
      };
    }
    if (/to_regclass/.test(q)) return { rows: [{ ok: this.recordPresent }], rowCount: 1 };
    if (/FROM marketing_outbound_gate_decision/.test(q)) {
      return { rows: this.clearedRows, rowCount: this.clearedRows.length };
    }
    if (/FROM marketing_record WHERE statement_hash = ANY/.test(q)
      || /FROM marketing_record WHERE x_comment_id = ANY/.test(q)) {
      return { rows: this.recordRows, rowCount: this.recordRows.length };
    }
    if (/FROM marketing_record WHERE/.test(q)) {
      return { rows: [recordRow()], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  all(): string[] {
    return this.statements.map((s) => s.sql.replace(/\s+/g, ' ').trim());
  }

  find(needle: string): Stmt | undefined {
    return this.statements.find((s) => s.sql.replace(/\s+/g, ' ').includes(needle));
  }
}

const fake = () => {
  const p = new FakePool();
  return { p, pool: p as unknown as Pool };
};

beforeEach(() => {
  _resetRecordMigrated();
  _resetGateLedgerMigrated();
});

describe('readBundleSource issues the produce-or-admit join', () => {
  it('asks only for CLEARED clearance decisions, scoped to the window', async () => {
    const { p, pool } = fake();
    await readBundleSource(pool, REQ);
    const stmt = p.find('FROM marketing_outbound_gate_decision');
    expect(stmt).toBeDefined();
    expect(stmt!.sql.replace(/\s+/g, ' ')).toContain("phase = 'clearance'");
    expect(stmt!.sql.replace(/\s+/g, ' ')).toContain('allowed = true');
    expect(stmt!.params).toEqual([
      REQ.windowFrom.toISOString(), REQ.windowTo.toISOString(),
    ]);
  });

  it('looks the digests up WITHOUT the window, because a later record still records it', async () => {
    const { p, pool } = fake();
    p.clearedRows = [clearedRow()];
    await readBundleSource(pool, REQ);
    const stmt = p.find('FROM marketing_record WHERE statement_hash = ANY');
    expect(stmt).toBeDefined();
    expect(stmt!.params[0]).toEqual([sha256Hex(CLEARED_TEXT)]);
    // No window parameters on this one. "Was it ever recorded?" is not a windowed question.
    expect(stmt!.params).toHaveLength(1);
  });

  it('reports the ledger ABSENT rather than empty when 0062 is not applied', async () => {
    const { p, pool } = fake();
    p.gatePresent = false;
    const src = await readBundleSource(pool, REQ);
    expect(src.clearance).toBeDefined();
    expect(src.clearance!.ledgerPresent).toBe(false);
    // And it did not go on to ask the ledger anything.
    expect(p.all().some((s) => /FROM marketing_outbound_gate_decision/.test(s))).toBe(false);
  });

  it('leaves replyComments UNDEFINED when the queue table is gone, never an empty list', async () => {
    const { p, pool } = fake();
    p.queuePresent = false;
    p.clearedRows = [clearedRow()];
    const src = await readBundleSource(pool, REQ);
    expect(src.clearance!.replyComments).toBeUndefined();
  });

  /*
   * THE MAXIMAL GAP, AT THE READ. `readBundleSource` returned before the ledger read when
   * 0061 was unapplied, so the state in which 100% of what the desk cleared is unrecordable
   * produced a source with no `clearance` key at all — and the composition then had nothing
   * to attach to `RECORD_REGISTER_ABSENT`.
   */
  it('still reads the gate ledger when 0061 is unapplied, which is the maximal-gap state', async () => {
    const { p, pool } = fake();
    p.recordPresent = false;
    p.clearedRows = [clearedRow()];
    const src = await readBundleSource(pool, REQ);
    expect(src.registerPresent).toBe(false);
    expect(src.clearance).toBeDefined();
    expect(src.clearance!.ledgerPresent).toBe(true);
    expect(src.clearance!.cleared).toHaveLength(1);
    expect(src.clearance!.registerPresent).toBe(false);
    // The gate ledger WAS asked.
    expect(p.all().some((s) => /FROM marketing_outbound_gate_decision/.test(s))).toBe(true);
    // And the two `marketing_record` reads were NOT issued — they would throw against a
    // table that does not exist, and a thrown read would take the finding down with it.
    expect(p.all().some((s) => /FROM marketing_record WHERE statement_hash = ANY/.test(s)))
      .toBe(false);
    expect(p.all().some((s) => /FROM marketing_record WHERE x_comment_id = ANY/.test(s)))
      .toBe(false);
  });
});

/* ── §6 THE DEFECT: `gate:<16 hex>` HAD NO READER ─────────────────────────────── */

describe('the gate reference a drafter is told to quote can now be resolved', () => {
  it('refuses a malformed reference WITHOUT issuing a statement', async () => {
    const { p, pool } = fake();
    for (const bad of ['', 'gate:', 'nonsense', 'gate:zzzz', `gate:${'a'.repeat(15)}`, 'gate:aaaaaaaaaaaaaaa%']) {
      const got = await resolveGateReference(pool, bad);
      expect(got.ok).toBe(false);
      if (!got.ok) expect(got.code).toBe('GATE_REFERENCE_MALFORMED');
    }
    // A `%` or `_` inside the reference must never reach a LIKE pattern. The guard above
    // is what stops it, so the proof is that no statement was issued at all.
    expect(p.statements).toHaveLength(0);
  });

  it('treats the UNAVAILABLE sentinel as a stated absence, not a lookup failure', async () => {
    /*
     * The gate hands a drafter `gate:reference-unavailable` when it could not compute the
     * digest at all. That is not a reference that resolves to nothing — there is nothing to
     * look up — and the approve path's `unknown` note branches on this code, so it is pinned.
     */
    const { p, pool } = fake();
    const got = await resolveGateReference(pool, GATE_REFERENCE_UNAVAILABLE);
    expect(got.ok).toBe(false);
    if (got.ok) return;
    expect(got.code).toBe('GATE_REFERENCE_MALFORMED');
    expect(got.sentence).toContain(GATE_REFERENCE_UNAVAILABLE);
    expect(got.sentence).toMatch(/there is no row to find/);
    expect(p.statements).toHaveLength(0);
  });

  it('refuses by naming 0062 when the ledger does not exist here', async () => {
    const { p, pool } = fake();
    p.gatePresent = false;
    const got = await resolveGateReference(pool, gateReferenceFrom(sha256Hex(CLEARED_TEXT)));
    expect(got.ok).toBe(false);
    if (!got.ok) {
      expect(got.code).toBe('GATE_LEDGER_ABSENT');
      expect(got.sentence).toContain(GATE_MIGRATION);
    }
  });

  it('says NO ROW CARRIES IT rather than answering with an empty verdict list', async () => {
    const { pool } = fake();
    const got = await resolveGateReference(pool, gateReferenceFrom(sha256Hex(CLEARED_TEXT)));
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.code).toBe('GATE_REFERENCE_NOT_FOUND');
  });

  it('returns EVERY decision the reference covers, because one text is gated twice', async () => {
    const { p, pool } = fake();
    const hash = sha256Hex(CLEARED_TEXT);
    p.clearedRows = [
      {
        id: '9', reply_id: '3', phase: 'clearance', actor: 'monty', allowed: false,
        disposition: 'refused', text_sha256: hash, assets_extracted: ['BTC'],
        refusal_codes: ['ART_90_ASSET_UNDER_EMBARGO'], violation_codes: [], gate_error: null,
        created_at: '2026-07-10T09:30:00.000Z',
      },
      {
        id: '4', reply_id: '3', phase: 'draft', actor: 'sam', allowed: true,
        disposition: 'clear', text_sha256: hash, assets_extracted: ['BTC'],
        refusal_codes: [], violation_codes: [], gate_error: null,
        created_at: '2026-07-10T09:00:00.000Z',
      },
    ];
    const got = await resolveGateReference(pool, gateReferenceFrom(hash));
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.decisions).toHaveLength(2);
    // The UNSCOPED codes are what makes this useful to the approver the scoped refusal
    // told the drafter to ask. That is why the route behind it is approver-only.
    expect(got.decisions[0]!.refusalCodes).toContain('ART_90_ASSET_UNDER_EMBARGO');
    // The reference identifies the TEXT, not one check, and the note says so.
    expect(got.note).toMatch(/same bytes/i);
    const stmt = p.find('FROM marketing_outbound_gate_decision');
    expect(stmt!.params[0]).toBe(`${hash.slice(0, 16)}%`);
    // Under the bound, so the count IS the total and the note may say so.
    expect(got.truncated).toBe(false);
    expect(got.note).toMatch(/that is the whole set/);
  });

  /*
   * A CEILING STATED AS A MEASUREMENT. `LIMIT 200` bounded the read and the note then said
   * "200 decision(s) carry this reference" — a total — and in the same sentence asserted that
   * the draft-phase row "appear[s] here", which is the row `created_at DESC` drops first at
   * the limit. Reachable: every re-gate of the same bytes writes a row, so a template reply
   * accumulates them indefinitely.
   */
  describe('a truncated result set is reported as a ceiling, not as a count', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({
      id: String(1000 - i), reply_id: '3', phase: 'clearance', actor: 'monty', allowed: true,
      disposition: 'clear', text_sha256: sha256Hex(CLEARED_TEXT), assets_extracted: [],
      refusal_codes: [], violation_codes: [], gate_error: null,
      created_at: `2026-07-10T09:${String(i % 60).padStart(2, '0')}:00.000Z`,
    }));

    it('asks for one more row than it shows, so truncation is detectable at all', async () => {
      const { p, pool } = fake();
      p.clearedRows = many(5);
      await resolveGateReference(pool, gateReferenceFrom(sha256Hex(CLEARED_TEXT)));
      expect(p.find('FROM marketing_outbound_gate_decision')!.sql).toContain('LIMIT 201');
    });

    it('says AT LEAST 200 and never reports 201, and admits the oldest rows are missing', async () => {
      const { p, pool } = fake();
      p.clearedRows = many(201);
      const got = await resolveGateReference(pool, gateReferenceFrom(sha256Hex(CLEARED_TEXT)));
      expect(got.ok).toBe(true);
      if (!got.ok) return;
      expect(got.truncated).toBe(true);
      expect(got.limit).toBe(200);
      // The extra row is a probe, not content: exactly the bound is returned.
      expect(got.decisions).toHaveLength(200);
      expect(got.note).toMatch(/AT LEAST 200/);
      expect(got.note).toMatch(/THIS IS A CEILING, NOT A COUNT/);
      // The specific lie: the note promised the draft-phase row is here. It is the first one
      // DESC ordering drops, so the truncated note must not promise it.
      expect(got.note).toMatch(/rows that are missing are the OLDEST/);
      expect(got.note).not.toMatch(/both rows appear here/);
    });

    it('does not cry truncation at exactly the bound', async () => {
      const { p, pool } = fake();
      p.clearedRows = many(200);
      const got = await resolveGateReference(pool, gateReferenceFrom(sha256Hex(CLEARED_TEXT)));
      expect(got.ok).toBe(true);
      if (!got.ok) return;
      expect(got.truncated).toBe(false);
      expect(got.decisions).toHaveLength(200);
      expect(got.note).toMatch(/200 decision\(s\) carry this reference, and that is the whole set/);
    });
  });
});

/* ── §7 THE TWO SURFACES, THROUGH THE REAL ROUTERS ────────────────────────────── */

/**
 * A unit test cannot detect a route that does not exist — that is the failure recorded in
 * `routes/__tests__/marketingRecord.test.ts`, where `record.ts` was fully covered and had
 * no importer. `resolveGateReference` would be the same kind of dead engine without a
 * caller, and the whole point of it is that an approver can reach it. So these go through
 * `.request(...)`.
 */

let routeCalls: { sql: string; params: unknown[] }[] = [];
let gateTablePresent = true;
let ledgerInsertThrows = false;
let ledgerRows: unknown[] = [];
let draftBody = 'LCX deposits are processing normally again.';
/** Rows the windowed record read returns. Empty means the register is empty for the window. */
let registerRows: unknown[] = [];
/** Rows the DIGEST lookup returns. Kept separate: it is a different question. */
let digestRows: unknown[] = [];

/**
 * ONE BARRIER FOR ALL OF IT.
 *
 * Every one of these is module-level, and the first cut reset them in one describe's
 * `beforeEach` and not the next's — so the second block's isolation was accidental, holding
 * only because the previous block's hook happened to run last. Reordering the describes or
 * running one with `.only` changed what the tests saw. A single function that every
 * `beforeEach` calls cannot drift out of sync with the state it owns; adding a variable
 * without adding it here is a visible omission rather than an invisible one.
 */
function resetRouteState(): void {
  routeCalls = [];
  gateTablePresent = true;
  ledgerInsertThrows = false;
  ledgerRows = [];
  registerRows = [];
  digestRows = [];
  draftBody = 'LCX deposits are processing normally again.';
  routeQuery.mockClear();
  _resetRecordMigrated();
  _resetGateLedgerMigrated();
}

const routeQuery = vi.fn(async (sql: string, params: unknown[] = []) => {
  routeCalls.push({ sql, params });
  if (/to_regclass\('public.marketing_outbound_gate_decision'\)/.test(sql)) {
    return { rows: [{ ok: gateTablePresent, gate: gateTablePresent, queue: true }], rowCount: 1 };
  }
  if (/to_regclass/.test(sql)) return { rows: [{ ok: true }], rowCount: 1 };
  if (/INSERT INTO marketing_outbound_gate_decision/.test(sql)) {
    if (ledgerInsertThrows) throw new Error('deadlock detected');
    return { rows: [], rowCount: 1 };
  }
  if (/FROM marketing_outbound_gate_decision/.test(sql)) {
    return { rows: ledgerRows, rowCount: ledgerRows.length };
  }
  if (/EXISTS \(SELECT 1 FROM marketing_asset_embargo/.test(sql)) {
    return { rows: [{ any_rows: false }], rowCount: 1 };
  }
  if (/SELECT reply_id, body FROM marketing_reply_draft/.test(sql)) {
    return { rows: [{ reply_id: 3, body: draftBody }], rowCount: 1 };
  }
  if (/UPDATE marketing_reply_draft/.test(sql)) {
    return { rows: [{ id: 9, reply_id: 3, status: 'approved', approved_by: 'nik' }], rowCount: 1 };
  }
  // The digest and comment lookups, which answer "was this ever recorded?" — NOT the same
  // question as the windowed record read below, so they are driven by their own fixture.
  if (/FROM marketing_record WHERE statement_hash = ANY/.test(sql)
    || /FROM marketing_record WHERE x_comment_id = ANY/.test(sql)) {
    return { rows: digestRows, rowCount: digestRows.length };
  }
  if (/SELECT drafted_at FROM marketing_record WHERE record_uid/.test(sql)) {
    const row = (registerRows as Array<{ drafted_at?: string }>)[0];
    return { rows: row ? [{ drafted_at: row.drafted_at }] : [], rowCount: row ? 1 : 0 };
  }
  if (/FROM marketing_record WHERE/.test(sql)) {
    return { rows: registerRows, rowCount: registerRows.length };
  }
  return { rows: [], rowCount: 0 };
});

vi.mock('../../db/index.js', () => ({
  getPool: () => ({ query: routeQuery, connect: async () => ({ query: routeQuery, release: vi.fn() }) }),
  closeDb: async () => {},
  getDb: () => { throw new Error('getDb is not used by these routes'); },
}));

const { marketingRecordRoutes } = await import('../../routes/marketingRecord.js');
const { marketingRoutes } = await import('../../routes/marketing.js');
const { _resetMigrated } = await import('../service.js');
const { _resetAbuseRegisterMigrated } = await import('../abuseRegister.js');

const PASSCODE = process.env.DESK_PASSCODE ?? 'test#1234';
const APPROVER = `nik@lcx.com:${PASSCODE}`;
const OPERATOR = `sam@lcx.com:${PASSCODE}`;

async function hit(
  router: { request: (p: string, i?: RequestInit) => Promise<Response> },
  path: string,
  cred = APPROVER,
  method = 'GET',
) {
  const res = await router.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-api-key': cred },
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

describe('GET /gate-reference/:reference — the remedy in the scoped refusal now has a route', () => {
  beforeEach(() => {
    resetRouteState();
    _resetMigrated();
    _resetAbuseRegisterMigrated();
  });

  it('answers an approver with the unscoped verdict behind the reference', async () => {
    const hash = sha256Hex(CLEARED_TEXT);
    ledgerRows = [{
      id: '9', reply_id: '3', phase: 'clearance', actor: 'monty', allowed: false,
      disposition: 'refused', text_sha256: hash, assets_extracted: ['BTC'],
      refusal_codes: ['ART_90_ASSET_UNDER_EMBARGO'], violation_codes: [], gate_error: null,
      created_at: '2026-07-10T09:30:00.000Z',
    }];
    const res = await hit(marketingRecordRoutes, `/gate-reference/${gateReferenceFrom(hash)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.decisions[0].refusalCodes).toContain('ART_90_ASSET_UNDER_EMBARGO');
  });

  it('is APPROVER-only, because the answer is the basis the drafter was not shown', async () => {
    const res = await hit(
      marketingRecordRoutes,
      `/gate-reference/${gateReferenceFrom(sha256Hex(CLEARED_TEXT))}`,
      OPERATOR,
    );
    expect(res.status).toBe(403);
  });

  it('400s a malformed reference and 404s a genuine absence — different facts', async () => {
    expect((await hit(marketingRecordRoutes, '/gate-reference/gate:zz')).status).toBe(400);
    const absent = await hit(
      marketingRecordRoutes,
      `/gate-reference/${gateReferenceFrom(sha256Hex(CLEARED_TEXT))}`,
    );
    expect(absent.status).toBe(404);
    expect(absent.body.code).toBe('GATE_REFERENCE_NOT_FOUND');
  });

  it('503s naming 0062 rather than reporting no such check', async () => {
    gateTablePresent = false;
    const res = await hit(
      marketingRecordRoutes,
      `/gate-reference/${gateReferenceFrom(sha256Hex(CLEARED_TEXT))}`,
    );
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('GATE_LEDGER_ABSENT');
    expect(res.body.error).toContain(GATE_MIGRATION);
  });
});

/**
 * A ROW THE LEDGER WOULD RETURN for `text_sha256 LIKE '<prefix>%'`. The draft path writes
 * one of these for the same bytes on every draft, which is the fact the approve response
 * used to contradict.
 */
function ledgerRowFor(body: string, over: Record<string, unknown> = {}) {
  return {
    id: '4', reply_id: '3', phase: 'draft', actor: 'sam', allowed: true, disposition: 'clear',
    text_sha256: sha256Hex(body), assets_extracted: [], refusal_codes: [], violation_codes: [],
    gate_error: null, created_at: '2026-07-10T09:00:00.000Z',
    ...over,
  };
}

describe('the clearance path stops implying its reference is always resolvable', () => {
  /*
   * `ledgerRows` USED TO SURVIVE INTO THIS BLOCK. It was reset only in the previous describe's
   * beforeEach, so this one inherited whatever the file order left behind — `[]` today purely
   * because that hook happened to run last. `resetRouteState` owns every module-level fixture
   * and every block calls it, so the isolation is stated rather than accidental.
   */
  beforeEach(() => {
    resetRouteState();
    _resetMigrated();
    _resetAbuseRegisterMigrated();
  });

  it('carries the reference and where to resolve it on a clean approval', async () => {
    ledgerRows = [ledgerRowFor(draftBody)];
    const res = await hit(marketingRoutes, '/draft/9/approve', APPROVER, 'POST');
    expect(res.status).toBe(200);
    expect(res.body.meta.gateReference.reference).toMatch(/^gate:[0-9a-f]{16}$/);
    expect(res.body.meta.gateReference.resolvable).toBe('resolves');
    expect(res.body.meta.gateReference.clearanceRowWritten).toBe(true);
    expect(res.body.meta.gateReference.decisionsUnderReference).toBe(1);
    expect(res.body.meta.gateReference.resolveAt).toContain('/v1/marketing/gate-reference/');
  });

  /*
   * THE CORRECTED VALUE CHANGE. The first cut set `resolvable: false` from the CLEARANCE
   * insert's return value and stated as fact that the reference "resolves to nothing" and
   * that quoting it "will fail". In the normal case that is false: `routes/marketing.ts`
   * writes a `phase='draft'` row for the same bytes on every draft, and the reference is a
   * prefix of the digest of the TEXT, so it resolves to that row perfectly well. The
   * response was telling the drafter their only remedy was dead while it worked.
   */
  it('does NOT call the reference dead when an earlier gate row for the same text resolves', async () => {
    ledgerInsertThrows = true;
    ledgerRows = [ledgerRowFor(draftBody)];
    const res = await hit(marketingRoutes, '/draft/9/approve', APPROVER, 'POST');
    expect(res.status).toBe(200);
    const ref = res.body.meta.gateReference;
    // The clearance row genuinely did not land, and that is reported as its own fact.
    expect(ref.clearanceRowWritten).toBe(false);
    // But the reference resolves, because the draft-phase row carries the same digest.
    expect(ref.resolvable).toBe('resolves');
    expect(ref.decisionsUnderReference).toBe(1);
    // The two forbidden assertions.
    expect(ref.note).not.toMatch(/resolves to nothing/i);
    expect(ref.note).not.toMatch(/will fail/i);
    // And the note says which half is actually missing.
    expect(ref.note).toMatch(/OWN row was not written/);
    expect(ref.note).toMatch(/Art 8\(2\) production/);
  });

  it('says resolves_to_nothing only when the ledger was asked and held nothing', async () => {
    ledgerInsertThrows = true;
    ledgerRows = [];
    const res = await hit(marketingRoutes, '/draft/9/approve', APPROVER, 'POST');
    expect(res.status).toBe(200);
    const ref = res.body.meta.gateReference;
    expect(ref.resolvable).toBe('resolves_to_nothing');
    expect(ref.decisionsUnderReference).toBe(0);
    expect(ref.lookupRefusalCode).toBe('GATE_REFERENCE_NOT_FOUND');
    expect(ref.note).toMatch(/measured absence, not a guess/);
  });

  it('says UNKNOWN, not false, when 0062 is unapplied and nothing can be asked', async () => {
    // Three states, never collapsed: resolves / resolves_to_nothing / unknown. A boolean
    // had to lie about one of them, and the resolver already returns three codes.
    gateTablePresent = false;
    const res = await hit(marketingRoutes, '/draft/9/approve', APPROVER, 'POST');
    expect(res.status).toBe(200);
    const ref = res.body.meta.gateReference;
    expect(ref.resolvable).toBe('unknown');
    expect(ref.decisionsUnderReference).toBeNull();
    expect(ref.lookupRefusalCode).toBe('GATE_LEDGER_ABSENT');
    expect(ref.note).toMatch(/UNKNOWN — not\s+false/);
    expect(ref.note).not.toMatch(/resolves to nothing/i);
  });

  it('never spreads the unscoped ledger codes into the refusal body', async () => {
    // `ledgerOnly` holds the TRUE refusal codes. A 422 that carried it would undo the
    // scoping in one field, so the shape of the response is the control. The resolver reads
    // those same codes back, so the count crosses over and the decisions never do.
    draftBody = 'Open an account and start trading BTC today.';
    ledgerRows = [ledgerRowFor(draftBody, {
      refusal_codes: ['ART_90_ASSET_UNDER_EMBARGO'], phase: 'clearance',
    })];
    const res = await hit(marketingRoutes, '/draft/9/approve', APPROVER, 'POST');
    expect(res.status).toBe(422);
    expect(res.body).not.toHaveProperty('ledgerOnly');
    expect(res.body.gateReference.reference).toMatch(/^gate:[0-9a-f]{16}$/);
    expect(res.body.embargoScope).not.toHaveProperty('refusalCodes');
    // THE ORACLE STAYS CLOSED. The resolver returns the unscoped codes; only the COUNT may
    // travel. A `decisions` array here would hand the drafter the Art 90 basis the scoping
    // just removed, on a `requireOperator` route the shared machine key can call.
    expect(res.body.gateReference).not.toHaveProperty('decisions');
    expect(JSON.stringify(res.body)).not.toContain('ART_90_ASSET_UNDER_EMBARGO');
  });
});

/* ── §8 THE ROUTE THE ONLY WEB SURFACE ACTUALLY CALLS ─────────────────────────── */

/**
 * `GET /export/:itemId` re-assembles a filtered `BundleSource` and dropped `source.clearance`,
 * so the lane's entire deliverable was permanently `RECORD_CLEARANCE_LEDGER_UNREAD` on the
 * one export route a browser reaches — and that refusal's remedy said "produce the bundle
 * through a caller that reads the clearance ledger", which the route did, one line above.
 *
 * The window it builds is a zero-width instant, so the reconciliation must ALSO say that any
 * figure in it is an artefact of the window. Both facts are asserted here, through the real
 * router, because a unit test cannot detect a field a route forgot to forward.
 */
describe('GET /export/:itemId forwards the clearance ledger it read', () => {
  const RECORD_UID = 'rec_0000000000000000000000000000aaaa';
  const DRAFTED_AT = '2026-07-10T09:00:00.000Z';

  beforeEach(() => {
    resetRouteState();
    _resetMigrated();
    _resetAbuseRegisterMigrated();
    registerRows = [recordRow({ record_uid: RECORD_UID, drafted_at: DRAFTED_AT })];
  });

  it('reports a MEASURED reconciliation rather than refusing with UNREAD', async () => {
    // One cleared statement, stamped at the record's own instant so the zero-width window
    // can reach it, and no record holds its digest.
    ledgerRows = [{
      id: '41', reply_id: null, actor: 'monty', created_at: DRAFTED_AT,
      text_sha256: sha256Hex('a statement no record holds'), disposition: 'clear',
    }];
    const res = await hit(marketingRecordRoutes, `/export/${RECORD_UID}?authority=FMA`);
    expect(res.status).toBe(200);
    const rec = res.body.data.bundle.clearanceReconciliation;
    expect(rec.state).toBe('measured');
    expect(rec.refusals).toEqual([]);
    expect(rec.counts.neverRecorded).toBe(1);
    // The digest reaches the artefact the human reads, which is the whole point of the lane.
    expect(res.body.data.renderedText).toContain(sha256Hex('a statement no record holds'));
  });

  it('never prints the UNREAD remedy that blames the caller for what the caller did', async () => {
    const res = await hit(marketingRecordRoutes, `/export/${RECORD_UID}?authority=FMA`);
    expect(res.status).toBe(200);
    expect(res.body.data.renderedText).not.toContain('RECORD_CLEARANCE_LEDGER_UNREAD');
    expect(res.body.data.bundle.completeness.map((l: { why: string }) => l.why).join(' '))
      .not.toContain('RECORD_CLEARANCE_LEDGER_UNREAD');
  });

  it('states that its window is one instant, so a zero is an artefact and not a finding', async () => {
    const res = await hit(marketingRecordRoutes, `/export/${RECORD_UID}?authority=FMA`);
    expect(res.status).toBe(200);
    const rec = res.body.data.bundle.clearanceReconciliation;
    expect(rec.scope.instantaneousWindow).toBe(true);
    expect(rec.scope.windowFrom).toBe(rec.scope.windowTo);
    const flat = String(res.body.data.renderedText).replace(/\s+/g, ' ');
    expect(flat).toMatch(/SINGLE INSTANT/);
    expect(flat).toMatch(/a zero here does NOT mean the desk cleared nothing/);
    expect(res.body.data.bundle.completeness
      .some((l: { field: string }) => l.field === 'production_completeness_window')).toBe(true);
  });
});
