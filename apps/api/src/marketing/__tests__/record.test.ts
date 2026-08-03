import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  bundleDigest,
  closeOutPublication,
  composeExportBundle,
  deriveRecordUid,
  eraseByHandle,
  extendLegalHold,
  handlePseudonym,
  isRecordMigrated,
  listOutstandingCloseOuts,
  normaliseHandle,
  PER_HANDLE_SCORING_DPIA,
  recordProcessorTransfer,
  renderBundleText,
  retentionExpiry,
  scoreHandleOverTime,
  sha256Hex,
  subjectAccess,
  sweepExpiredRecords,
  thirdPartyRetentionDays,
  writeRecord,
  RETENTION_DPO_RULING_OUTSTANDING,
  RETENTION_INFERENCE_CAVEAT,
  RETENTION_YEARS_BASE,
  RETENTION_YEARS_MAX,
  _resetRecordMigrated,
  type BundleRequest,
  type BundleSource,
  type RecordRow,
} from '../record.js';

/**
 * M7 — THE RECORD. One property per `it`, and each one fails if its check is removed
 * from `../record.ts`. Verified by reverting: the assertions below were written against
 * the code and then each guard was deleted in turn to confirm the test goes red.
 *
 * WHY THESE PROPERTIES AND NOT OTHERS. MiCA Art 8(2) is produce-on-demand and Art 8(3)
 * removes any pre-approval regime, so the export IS the compliance act — which means the
 * failure modes worth defending are not "the bundle looked wrong" but:
 *
 *   · A BUNDLE THAT LIES BY OMISSION. Anything unreconstructable must be named in the
 *     output. Half these tests exist because a quiet omission is undetectable by the
 *     reader, which makes it the most dangerous defect this file can have.
 *   · AN EMPTY REGISTER THAT LOOKS COMPLIANT. Zero records rendered as a clean bundle
 *     reads as "LCX published nothing", which is a different claim from "we hold no
 *     record of what we published". It refuses instead — the GPS perimeter pattern.
 *   · A RETENTION CLOCK THAT CAN BE WOUND BACK. The named failure is records expiring
 *     mid-investigation, and the way it happens is a tidy-up change moving an expiry
 *     forward.
 *   · AN ERASURE LOG THAT KEEPS THE ERASED TEXT. That log is the copy that defeats the
 *     erasure, so the test reads every statement the erasure path issues.
 *
 * NO REAL POSTGRES. The fake below is not a SQL engine: it answers exactly the statements
 * these functions issue and RECORDS EVERY ONE, which is what makes claims like "the
 * erasure never writes a message body" checkable rather than merely stated.
 */

/* ── The fake pool ────────────────────────────────────────────────────────────── */

interface Stmt { sql: string; params: unknown[] }

class FakePool {
  statements: Stmt[] = [];
  migrated = true;
  probeThrows = false;
  replies: Array<{ id: number; x_comment_id: string }> = [];
  recordRow: { statement_text: string; published_text: string | null } | null = null;
  recordsForComment = 0;
  minimisedRows = 0;

  async query(sql: string, params: unknown[] = []): Promise<{ rows: unknown[]; rowCount: number }> {
    this.statements.push({ sql, params });
    const q = sql.replace(/\s+/g, ' ').trim();

    if (q.includes('to_regclass')) {
      if (this.probeThrows) throw new Error('connection terminated unexpectedly');
      return { rows: [{ ok: this.migrated }], rowCount: 1 };
    }
    if (q.startsWith('SELECT id, x_comment_id FROM marketing_x_reply')) {
      return { rows: this.replies, rowCount: this.replies.length };
    }
    if (q.includes('count(*)::int AS n FROM marketing_reply_draft')) {
      return { rows: [{ n: 2 }], rowCount: 1 };
    }
    if (q.includes('count(*)::int AS n FROM marketing_record')) {
      return { rows: [{ n: this.recordsForComment }], rowCount: 1 };
    }
    if (q.startsWith('UPDATE marketing_record SET inbound_context_excerpt = NULL')) {
      return { rows: [], rowCount: this.minimisedRows };
    }
    if (q.startsWith('DELETE FROM marketing_x_reply')) {
      return { rows: [], rowCount: this.replies.length };
    }
    if (q.startsWith('DELETE FROM marketing_record')) {
      return { rows: [], rowCount: 3 };
    }
    if (q.startsWith('SELECT statement_text, published_text FROM marketing_record')) {
      return { rows: this.recordRow ? [this.recordRow] : [], rowCount: this.recordRow ? 1 : 0 };
    }
    if (q.startsWith('SELECT record_uid, drafted_at, drafted_by FROM marketing_record')) {
      return { rows: [{ record_uid: 'rec_a', drafted_at: '2026-07-01T00:00:00.000Z', drafted_by: 'nik' }], rowCount: 1 };
    }
    if (q.startsWith('SELECT id, x_comment_id, x_post_id, author_handle')) {
      return { rows: [], rowCount: 0 };
    }
    if (q.startsWith('INSERT INTO marketing_record ')) {
      return { rows: [{ record_uid: 'x' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  /** Every statement, whitespace-collapsed, for text assertions. */
  all(): string[] {
    return this.statements.map((s) => s.sql.replace(/\s+/g, ' ').trim());
  }

  /** The one statement whose collapsed text contains `needle`, with its parameters. */
  find(needle: string): Stmt | undefined {
    return this.statements.find((s) => s.sql.replace(/\s+/g, ' ').includes(needle));
  }
}

const pool = () => {
  const p = new FakePool();
  return { p, pool: p as unknown as Pool };
};

/* ── Fixtures ─────────────────────────────────────────────────────────────────── */

const STATEMENT = 'LCX is registered with the FMA in Liechtenstein. Nothing here is investment advice.';

function row(over: Partial<RecordRow> = {}): RecordRow {
  const text = over.statement_text ?? STATEMENT;
  return {
    record_uid: 'rec_0000000000000000000000000000aaaa',
    x_comment_id: '1800000000000000001',
    draft_id: 7,
    regime: 'casp_conduct',
    drafted_by: 'sam',
    drafted_at: '2026-07-10T09:00:00.000Z',
    cleared_by: 'monty',
    cleared_at: '2026-07-10T09:30:00.000Z',
    clearance_reason: 'Reviewed against the claim library; no forward-looking language.',
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
    jurisdictions: ['li', 'eea_other'],
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

const REQ: BundleRequest = {
  requestedBy: 'nik',
  authority: 'FMA Liechtenstein',
  windowFrom: new Date('2026-07-01T00:00:00.000Z'),
  windowTo: new Date('2026-07-31T23:59:59.000Z'),
  jurisdiction: null,
  generatedAt: new Date('2026-08-02T12:00:00.000Z'),
};

function source(over: Partial<BundleSource> = {}): BundleSource {
  return {
    registerPresent: true,
    records: [row()],
    refusals: [],
    claims: [],
    transfers: [],
    presentCommentIds: ['1800000000000000001'],
    ...over,
  };
}

beforeEach(() => _resetRecordMigrated());

/* ── §1 The gate ──────────────────────────────────────────────────────────────── */

describe('the migration gate degrades honestly and does not cache a failure', () => {
  it('reports migrated when the table is there', async () => {
    const { pool: p } = pool();
    expect(await isRecordMigrated(p)).toBe(true);
  });

  it('does NOT remember a database blip as "migration missing"', async () => {
    // service.ts caches `false` on any error, so one blip permanently fakes
    // awaiting-migration until a redeploy. Only a TRUE may be memoised here.
    const { p, pool: pl } = pool();
    p.probeThrows = true;
    expect(await isRecordMigrated(pl)).toBe(false);
    p.probeThrows = false;
    expect(await isRecordMigrated(pl)).toBe(true);
  });

  it('refuses the export by name when 0061 is not applied, rather than returning nothing', () => {
    const got = composeExportBundle(REQ, source({ registerPresent: false, records: [] }));
    expect(got.ok).toBe(false);
    if (!got.ok) {
      expect(got.code).toBe('RECORD_REGISTER_ABSENT');
      expect(got.sentence).toContain('0061_marketing_record.sql');
      expect(got.rule).toBe('MiCA Art 8(2)');
    }
  });
});

/* ── §2 The refusals that make an export honest ────────────────────────────────── */

describe('an empty register refuses and says it is empty', () => {
  it('does not produce a clean zero-record bundle', () => {
    const got = composeExportBundle(REQ, source({ records: [] }));
    expect(got.ok).toBe(false);
    if (!got.ok) {
      expect(got.code).toBe('RECORD_REGISTER_EMPTY');
      // The distinction is the whole point: empty register ≠ published nothing.
      expect(got.sentence.toLowerCase()).toContain('empty');
      expect(got.sentence).toMatch(/nothing was recorded/i);
    }
  });
});

describe('an export is an act, so it needs a producer, an asker and a period', () => {
  it('refuses when the producing human is unnamed', () => {
    const got = composeExportBundle({ ...REQ, requestedBy: '  ' }, source());
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.code).toBe('RECORD_ACTOR_UNNAMED');
  });

  it('refuses when the requesting authority is unnamed — Art 7(3) means it need not be the FMA', () => {
    const got = composeExportBundle({ ...REQ, authority: '' }, source());
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.code).toBe('RECORD_ACTOR_UNNAMED');
  });

  it('refuses an inverted or unreadable window', () => {
    for (const req of [
      { ...REQ, windowFrom: new Date('2026-07-31T00:00:00Z'), windowTo: new Date('2026-07-01T00:00:00Z') },
      { ...REQ, windowTo: new Date('nonsense') },
    ]) {
      const got = composeExportBundle(req, source());
      expect(got.ok).toBe(false);
      if (!got.ok) expect(got.code).toBe('RECORD_WINDOW_INVALID');
    }
  });
});

/* ── §3 Determinism, because a digest is only worth printing if it is stable ───── */

describe('the bundle is deterministic and printable', () => {
  it('renders identical bytes for identical inputs', () => {
    const a = composeExportBundle(REQ, source());
    const b = composeExportBundle(REQ, source());
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(renderBundleText(a.value)).toEqual(renderBundleText(b.value));
      expect(bundleDigest(a.value)).toEqual(bundleDigest(b.value));
      expect(bundleDigest(a.value)).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('orders records by date then uid regardless of the order they arrive in', () => {
    const early = row({ record_uid: 'rec_b', drafted_at: '2026-07-02T00:00:00.000Z' });
    const late = row({ record_uid: 'rec_a', drafted_at: '2026-07-20T00:00:00.000Z' });
    const one = composeExportBundle(REQ, source({ records: [late, early] }));
    const two = composeExportBundle(REQ, source({ records: [early, late] }));
    expect(one.ok && two.ok).toBe(true);
    if (one.ok && two.ok) {
      expect(one.value.records.map((r) => r.recordUid)).toEqual(['rec_b', 'rec_a']);
      expect(renderBundleText(one.value)).toEqual(renderBundleText(two.value));
    }
  });

  it('prints the retention inference AS an inference and names the outstanding DPO ruling', () => {
    const got = composeExportBundle(REQ, source());
    expect(got.ok).toBe(true);
    if (got.ok) {
      const text = renderBundleText(got.value);
      expect(text).toMatch(/INFERENCE, NOT CITATION/);
      expect(text).toMatch(/OUTSTANDING DPO RULING/);
      // And it must not silently claim MiCA states a marketing retention period.
      expect(text).toMatch(/MiCA sets no express retention period/);
    }
  });

  it('states that engagement metrics are absent by design rather than showing zeros', () => {
    const got = composeExportBundle(REQ, source());
    expect(got.ok).toBe(true);
    if (got.ok) {
      const line = got.value.completeness.find((c) => c.field === 'engagement_metrics');
      expect(line?.state).toBe('absent');
      expect(line?.why).toMatch(/no X API credential/i);
      expect(renderBundleText(got.value)).not.toMatch(/impressions\s*[.:]*\s*0/i);
    }
  });
});

/* ── §4 The completeness statement: the bundle names what it cannot show ───────── */

describe('a bundle states its own completeness instead of omitting quietly', () => {
  it('names the missing published text when nobody has pasted it back', () => {
    const got = composeExportBundle(
      REQ,
      source({ records: [row({ close_out_state: 'outstanding', published_text: null, published_hash: null })] }),
    );
    expect(got.ok).toBe(true);
    if (got.ok) {
      const line = got.value.records[0]!.completeness.find((c) => c.field === 'published_text');
      expect(line?.state).toBe('absent');
      expect(line?.why).toMatch(/CLEARED text only/);
      expect(got.value.counts.outstandingCloseOut).toBe(1);
      // And it must appear in the PRINTED artefact, not only in the JSON.
      expect(renderBundleText(got.value)).toMatch(/\[absent\] published_text/);
    }
  });

  it('refuses to assert integrity when the stored bytes disagree with the stored hash', () => {
    const got = composeExportBundle(REQ, source({ records: [row({ statement_hash: sha256Hex('something else') })] }));
    expect(got.ok).toBe(true);
    if (got.ok) {
      const rec = got.value.records[0]!;
      expect(rec.integrity).toBe('broken');
      expect(got.value.counts.integrityBroken).toBe(1);
      expect(rec.completeness.some((c) => c.field === 'statement_text' && /does NOT assert/.test(c.why))).toBe(true);
    }
  });

  it('says integrity is unverifiable when no hash was ever written', () => {
    const got = composeExportBundle(REQ, source({ records: [row({ statement_hash: '' })] }));
    expect(got.ok).toBe(true);
    if (got.ok) {
      expect(got.value.records[0]!.integrity).toBe('unverifiable');
      expect(got.value.counts.integrityUnverifiable).toBe(1);
    }
  });

  it('reports four-eyes honestly when the drafter cleared their own words', () => {
    const got = composeExportBundle(REQ, source({ records: [row({ cleared_by: 'sam' })] }));
    expect(got.ok).toBe(true);
    if (got.ok) {
      expect(got.value.records[0]!.fourEyes).toBe('same_human');
      expect(
        got.value.records[0]!.completeness.some((c) => c.field === 'cleared_by' && /four-eyes did not operate/.test(c.why)),
      ).toBe(true);
    }
  });

  it('reports an uncleared statement as uncleared', () => {
    const got = composeExportBundle(REQ, source({ records: [row({ cleared_by: null, cleared_at: null })] }));
    expect(got.ok).toBe(true);
    if (got.ok) {
      expect(got.value.records[0]!.fourEyes).toBe('not_cleared');
      expect(got.value.records[0]!.completeness.some((c) => c.field === 'cleared_by')).toBe(true);
    }
  });

  it('distinguishes a context that was minimised from one never captured', () => {
    const minimised = composeExportBundle(
      REQ,
      source({ records: [row({ context_minimised_at: '2026-07-20T00:00:00.000Z' })] }),
    );
    const never = composeExportBundle(
      REQ,
      source({ records: [row({ inbound_context_hash: null, inbound_context_excerpt: null })] }),
    );
    expect(minimised.ok && never.ok).toBe(true);
    if (minimised.ok && never.ok) {
      const a = minimised.value.records[0]!.completeness.find((c) => c.field === 'inbound_context');
      const b = never.value.records[0]!.completeness.find((c) => c.field === 'inbound_context');
      expect(a?.why).toContain('2026-07-20T00:00:00.000Z');
      expect(a?.why).toMatch(/retention split/);
      expect(b?.why).toMatch(/not captured at all/);
      expect(a?.why).not.toEqual(b?.why);
    }
  });

  it('says when the inbound queue row was swept, and when the sweep state was never checked', () => {
    const swept = composeExportBundle(REQ, source({ presentCommentIds: [] }));
    const unchecked = composeExportBundle(REQ, source({ presentCommentIds: undefined }));
    expect(swept.ok && unchecked.ok).toBe(true);
    if (swept.ok && unchecked.ok) {
      expect(
        swept.value.records[0]!.completeness.some((c) => c.field === 'inbound_queue_row' && /90-day/.test(c.why)),
      ).toBe(true);
      const bundleLine = unchecked.value.completeness.find((c) => c.field === 'inbound_context_sweep_state');
      expect(bundleLine?.state).toBe('unverifiable');
    }
  });

  it('does not read "no refusals recorded" as "the draft was clean"', () => {
    const got = composeExportBundle(REQ, source({ refusals: [] }));
    expect(got.ok).toBe(true);
    if (got.ok) {
      const line = got.value.records[0]!.completeness.find((c) => c.field === 'refusals');
      expect(line?.state).toBe('unverifiable');
      expect(line?.why).toMatch(/cannot tell them apart/);
    }
  });

  it('names an unlinked claim set rather than implying the words were pre-approved', () => {
    const got = composeExportBundle(REQ, source({ claims: [] }));
    expect(got.ok).toBe(true);
    if (got.ok) {
      expect(got.value.records[0]!.completeness.some((c) => c.field === 'claims_used')).toBe(true);
    }
  });

  it('carries every gap the desk recorded at clearance time into the bundle', () => {
    const got = composeExportBundle(
      REQ,
      source({ records: [row({ snapshot_gaps: ['holdings register absent for sam'], snapshot_complete: false })] }),
    );
    expect(got.ok).toBe(true);
    if (got.ok) {
      expect(renderBundleText(got.value)).toMatch(/holdings register absent for/);
      expect(got.value.counts.incompleteRecords).toBe(1);
    }
  });
});

describe('the record shows which claim at which version, and every refusal that fired', () => {
  it('prints the claim version and flags a paraphrase as not the pre-approved wording', () => {
    const got = composeExportBundle(
      REQ,
      source({
        claims: [
          { record_uid: row().record_uid, claim_id: 'reg-fma-01', claim_version: 3, claim_category: 'regulatory', verbatim: false },
        ],
      }),
    );
    expect(got.ok).toBe(true);
    if (got.ok) {
      const text = renderBundleText(got.value);
      expect(text).toMatch(/reg-fma-01 @ v3/);
      expect(text).toMatch(/PARAPHRASED — not the pre-approved wording/);
    }
  });

  it('prints an overridden refusal with the name of whoever overrode it', () => {
    const got = composeExportBundle(
      REQ,
      source({
        refusals: [
          {
            record_uid: row().record_uid,
            code: 'ESMA_REGULATORY_STATUS_AS_PROMOTION',
            sentence: 'LCX\'s regulatory status is being used as a selling point.',
            rule_cited: 'ESMA35-1872330276-2329',
            phase: 'draft',
            fired_at: '2026-07-10T09:10:00.000Z',
            overridden: true,
            overridden_by: 'monty',
            override_reason: 'Factual statement of registration in answer to a direct question.',
          },
        ],
      }),
    );
    expect(got.ok).toBe(true);
    if (got.ok) {
      const text = renderBundleText(got.value);
      expect(text).toMatch(/ESMA_REGULATORY_STATUS_AS_PROMOTION/);
      expect(text).toMatch(/OVERRIDDEN by monty/);
      expect(text).toMatch(/ESMA35-1872330276-2329/);
      expect(got.value.counts.refusalsOverridden).toBe(1);
    }
  });
});

/* ── §5 Retention: five years, seven on request, and never backwards ───────────── */

describe('retention is five years, extendable to seven, and cannot be shortened', () => {
  it('lands five calendar years after the statement was drafted', () => {
    const got = retentionExpiry(new Date('2026-07-10T09:00:00.000Z'), 'lcx_statement');
    expect(got.ok).toBe(true);
    if (got.ok) {
      expect(got.value.expiresAt.toISOString()).toBe('2031-07-10T09:00:00.000Z');
      expect(got.value.years).toBe(5);
      expect(got.value.basis).toBe('inferred_art_68_9_plus_art_88_1');
    }
  });

  it('refuses to put third-party content on the five-year clock', () => {
    const got = retentionExpiry(new Date('2026-07-10T09:00:00.000Z'), 'third_party_content');
    expect(got.ok).toBe(false);
    if (!got.ok) {
      expect(got.code).toBe('RECORD_RETENTION_CLASS_UNKNOWN');
      expect(got.sentence).toMatch(/90-day sweep/);
    }
  });

  it('refuses a hold that would move the expiry forward', () => {
    const got = extendLegalHold({
      draftedAt: new Date('2026-07-10T00:00:00.000Z'),
      currentExpiry: new Date('2031-07-10T00:00:00.000Z'),
      until: new Date('2029-01-01T00:00:00.000Z'),
      by: 'nik',
      reason: 'FMA request 2026-08',
    });
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.code).toBe('RECORD_RETENTION_WOULD_SHORTEN');
  });

  it('allows an extension inside the seven-year ceiling and refuses beyond it', () => {
    const base = {
      draftedAt: new Date('2026-07-10T00:00:00.000Z'),
      currentExpiry: new Date('2031-07-10T00:00:00.000Z'),
      by: 'nik',
      reason: 'FMA request 2026-08',
    };
    const inside = extendLegalHold({ ...base, until: new Date('2033-07-10T00:00:00.000Z') });
    const beyond = extendLegalHold({ ...base, until: new Date('2034-01-01T00:00:00.000Z') });
    expect(inside.ok).toBe(true);
    expect(beyond.ok).toBe(false);
    if (!beyond.ok) expect(beyond.sentence).toMatch(/at most 7 years/);
  });

  it('refuses a legal hold with no named human, no reason, or no end date', () => {
    const base = {
      draftedAt: new Date('2026-07-10T00:00:00.000Z'),
      currentExpiry: new Date('2031-07-10T00:00:00.000Z'),
      until: new Date('2032-07-10T00:00:00.000Z'),
      by: 'nik',
      reason: 'FMA request',
    };
    for (const bad of [{ ...base, by: ' ' }, { ...base, reason: '' }, { ...base, until: new Date('bad') }]) {
      const got = extendLegalHold(bad);
      expect(got.ok).toBe(false);
      if (!got.ok) expect(got.code).toBe('RECORD_LEGAL_HOLD_UNACCOUNTABLE');
    }
  });

  it('refuses an unusable MARKETING_RETENTION_DAYS instead of building a NaN interval', () => {
    expect(thirdPartyRetentionDays('90')).toEqual({ ok: true, value: 90 });
    expect(thirdPartyRetentionDays(undefined)).toEqual({ ok: true, value: 90 });
    for (const bad of ['ninety', '0', '-5', '9.5', '999999']) {
      const got = thirdPartyRetentionDays(bad);
      expect(got.ok, `${bad} was accepted`).toBe(false);
      if (!got.ok) expect(got.code).toBe('RECORD_RETENTION_ENV_INVALID');
    }
  });
});

/* ── §6 Identity, integrity, pseudonymity ─────────────────────────────────────── */

describe('a record id is content-derived and a handle is pseudonymised, not anonymised', () => {
  it('gives the same uid for the same statement and a different one for different bytes', () => {
    const parts = { xCommentId: '18', draftId: 4, statementHash: sha256Hex('a'), draftedAt: new Date('2026-07-10T00:00:00Z') };
    expect(deriveRecordUid(parts)).toEqual(deriveRecordUid(parts));
    expect(deriveRecordUid({ ...parts, statementHash: sha256Hex('b') })).not.toEqual(deriveRecordUid(parts));
  });

  it('treats @LCXFan, lcxfan and " @lcxfan " as one person', () => {
    expect(normaliseHandle(' @LCXFan ')).toBe('lcxfan');
    expect(handlePseudonym('@LCXFan')).toEqual(handlePseudonym('lcxfan'));
  });

  it('never stores the handle in the clear in the pseudonym', () => {
    const h = handlePseudonym('lcxfan');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain('lcxfan');
  });
});

/* ── §7 GDPR paths ────────────────────────────────────────────────────────────── */

describe('per-handle scoring is refused until a DPIA exists', () => {
  it('refuses with the Art 35(3)(a) citation and no database access', () => {
    const got = scoreHandleOverTime('lcxfan');
    expect(got.ok).toBe(false);
    if (!got.ok) {
      expect(got.code).toBe('RECORD_DPIA_ABSENT');
      expect(got.rule).toBe('GDPR Art 35(3)(a)');
      expect(got.remedy).toMatch(/DPIA must be completed/);
    }
  });

  /*
   * THIS TEST PINNED THE DEFECT, and the defect had a name: N7 in DPIA_MARKETING.md §9.
   *
   * It used to assert `{ dpiaRef: 'DPIA-2026-004' }` SUCCEEDS — i.e. that an invented string
   * opens a gate whose whole purpose is to require a completed assessment. That is what the
   * code did, so the test was accurate; it was accurate about the wrong thing, in the way
   * `outboundGateCoverage.test.ts` was once accurate about a SELECT naming a column that did
   * not exist.
   *
   * The gate now compares the reference to `PER_HANDLE_SCORING_DPIA` (`record.ts`), which is
   * `null` — so there is NO string that opens it, and the successful branch is unreachable
   * until a human sets that constant, having signed §12.2. Asserting the old `true` here
   * would now require re-opening the gate to satisfy a test, which is the inversion this
   * comment exists to prevent.
   */
  it('refuses every reference, including a plausible one, while the constant is null', () => {
    expect(PER_HANDLE_SCORING_DPIA).toBeNull();
    expect(scoreHandleOverTime('lcxfan', { dpiaRef: '  ' }).ok).toBe(false);
    expect(scoreHandleOverTime('lcxfan', { dpiaRef: 'DPIA-2026-004' }).ok).toBe(false);
    // The refusal is still a refusal with a cited rule, not a bare false.
    const got = scoreHandleOverTime('lcxfan', { dpiaRef: 'DPIA-2026-004' });
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.code).toBe('RECORD_DPIA_ABSENT');
  });
});

describe('erasure erases, records that it happened, and never keeps what it erased', () => {
  it('refuses a blank subject, a blank decider, and an unrecordable erasure', async () => {
    const { p, pool: pl } = pool();
    expect((await eraseByHandle(pl, { handle: ' ', decidedBy: 'nik', basis: 'data_subject_request' })).ok).toBe(false);
    expect((await eraseByHandle(pl, { handle: 'lcxfan', decidedBy: '', basis: 'data_subject_request' })).ok).toBe(false);
    p.migrated = false;
    _resetRecordMigrated();
    const blocked = await eraseByHandle(pl, { handle: 'lcxfan', decidedBy: 'nik', basis: 'data_subject_request' });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe('RECORD_REGISTER_ABSENT');
    // Nothing was deleted while the erasure could not be evidenced.
    expect(p.all().some((s) => s.startsWith('DELETE'))).toBe(false);
  });

  it('matches the handle case-insensitively, so @LCXFan cannot survive a request from @lcxfan', async () => {
    const { p, pool: pl } = pool();
    p.replies = [{ id: 1, x_comment_id: '18001' }];
    await eraseByHandle(pl, { handle: '@LCXFan', decidedBy: 'nik', basis: 'data_subject_request' });
    const lookup = p.find('SELECT id, x_comment_id FROM marketing_x_reply');
    expect(lookup?.sql).toContain('lower(author_handle)');
    expect(lookup?.params[0]).toBe('lcxfan');
  });

  it('retains LCX statements under Art 17(3)(b), says so, and strips the stranger\'s words from them', async () => {
    const { p, pool: pl } = pool();
    p.replies = [{ id: 1, x_comment_id: '18001' }];
    p.recordsForComment = 2;
    p.minimisedRows = 1;
    const got = await eraseByHandle(pl, { handle: 'lcxfan', decidedBy: 'nik', basis: 'art_17_1_c_objection' });
    expect(got.ok).toBe(true);
    if (got.ok) {
      expect(got.value.recordsRetained).toBe(2);
      expect(got.value.retainedBasis).toBe('art_17_3_b');
      expect(got.value.excerptsMinimised).toBe(1);
      expect(got.value.explanation).toMatch(/Art 17\(3\)\(b\)/);
    }
    expect(p.all().some((s) => s.startsWith('UPDATE marketing_record SET inbound_context_excerpt = NULL'))).toBe(true);
  });

  it('writes an erasure log that holds no message text and no handle in the clear', async () => {
    const { p, pool: pl } = pool();
    p.replies = [{ id: 1, x_comment_id: '18001' }];
    await eraseByHandle(pl, { handle: 'lcxfan', decidedBy: 'nik', basis: 'data_subject_request' });
    const log = p.find('INSERT INTO marketing_erasure_log');
    expect(log).toBeDefined();
    const params = (log?.params ?? []).map(String);
    expect(params).toContain(handlePseudonym('lcxfan'));
    expect(params.some((v) => v.includes('lcxfan'))).toBe(false);
    // No column for content exists, so no content can be logged.
    expect(log?.sql).not.toMatch(/\bbody\b|statement_text|raw_email/);
  });

  it('never deletes an LCX record as part of a subject erasure', async () => {
    const { p, pool: pl } = pool();
    p.replies = [{ id: 1, x_comment_id: '18001' }];
    p.recordsForComment = 1;
    await eraseByHandle(pl, { handle: 'lcxfan', decidedBy: 'nik', basis: 'data_subject_request' });
    expect(p.all().some((s) => s.startsWith('DELETE FROM marketing_record'))).toBe(false);
  });
});

describe('subject access answers, logs, and admits what is missing', () => {
  it('refuses without an identifiable subject or an accountable human', async () => {
    const { pool: pl } = pool();
    const a = await subjectAccess(pl, { handle: '', fulfilledBy: 'nik' });
    const b = await subjectAccess(pl, { handle: 'lcxfan', fulfilledBy: ' ' });
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    if (!a.ok) expect(a.code).toBe('RECORD_SUBJECT_UNIDENTIFIED');
    if (!b.ok) expect(b.code).toBe('RECORD_ACTOR_UNNAMED');
  });

  it('states the two GDPR gaps that are still open, and does not pretend an empty answer means nothing was received', async () => {
    const { p, pool: pl } = pool();
    const got = await subjectAccess(pl, { handle: '@LCXFan', fulfilledBy: 'nik' });
    expect(got.ok).toBe(true);
    if (got.ok) {
      expect(got.value.notes.join(' ')).toMatch(/NO legitimate-interests assessment is on file/);
      expect(got.value.notes.join(' ')).toMatch(/no privacy notice is referenced/);
      expect(got.value.notes.join(' ')).toMatch(/cannot distinguish/);
    }
    const q = p.find('FROM marketing_x_reply WHERE lower(author_handle)');
    expect(q?.params[0]).toBe('lcxfan');
    expect(p.all().some((s) => s.startsWith('INSERT INTO marketing_subject_access_log'))).toBe(true);
  });
});

describe('the processor transfer register refuses to be filled in by default', () => {
  it('refuses when the caller has not said whether third-party data left the EEA', async () => {
    const { pool: pl } = pool();
    const got = await recordProcessorTransfer(pl, {
      processor: 'openrouter',
      purpose: 'draft a reply',
      payloadKind: 'inbound_reply_text',
      payload: 'is lcx regulated?',
      containsThirdPartyPersonalData: undefined as unknown as boolean,
      thirdCountry: true,
    });
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.code).toBe('RECORD_TRANSFER_SCOPE_UNDECLARED');
  });

  it('records the payload as a hash and the handle as a pseudonym', async () => {
    const { p, pool: pl } = pool();
    const got = await recordProcessorTransfer(pl, {
      processor: 'openrouter',
      model: 'nemotron',
      purpose: 'draft a reply to a customer question',
      payloadKind: 'inbound_reply_text',
      payload: 'is lcx regulated?',
      handle: '@LCXFan',
      containsThirdPartyPersonalData: true,
      thirdCountry: true,
    });
    expect(got.ok).toBe(true);
    const ins = p.find('INSERT INTO marketing_record_transfer');
    const params = (ins?.params ?? []).map(String);
    expect(params).toContain(sha256Hex('is lcx regulated?'));
    expect(params).toContain(handlePseudonym('lcxfan'));
    expect(params.some((v) => v.includes('is lcx regulated?'))).toBe(false);
    // The honest default when nobody has assessed the transfer.
    expect(params).toContain('not_assessed');
  });
});

/* ── §8 Writing the record, and the paste-back that makes it evidence ─────────── */

describe('writing a record', () => {
  it('refuses an unnamed drafter and an empty statement', async () => {
    const { pool: pl } = pool();
    const noName = await writeRecord(pl, {
      xCommentId: null, draftId: null, regime: 'casp_conduct', draftedBy: '  ',
      draftedAt: new Date('2026-07-10T00:00:00Z'), statementText: STATEMENT,
    });
    const noText = await writeRecord(pl, {
      xCommentId: null, draftId: null, regime: 'casp_conduct', draftedBy: 'sam',
      draftedAt: new Date('2026-07-10T00:00:00Z'), statementText: '   ',
    });
    expect(noName.ok).toBe(false);
    expect(noText.ok).toBe(false);
    if (!noName.ok) expect(noName.code).toBe('RECORD_ACTOR_UNNAMED');
    if (!noText.ok) expect(noText.code).toBe('RECORD_CLOSE_OUT_TEXT_ABSENT');
  });

  it('hashes the statement, stores only a hash of the third party\'s words, and is idempotent', async () => {
    const { p, pool: pl } = pool();
    const got = await writeRecord(pl, {
      xCommentId: '18001', draftId: 7, regime: 'casp_conduct', draftedBy: 'sam',
      draftedAt: new Date('2026-07-10T09:00:00.000Z'), statementText: STATEMENT,
      inboundContextText: 'is lcx regulated?',
    });
    expect(got.ok).toBe(true);
    const ins = p.find('INSERT INTO marketing_record (record_uid');
    expect(ins?.sql).toContain('ON CONFLICT (record_uid) DO NOTHING');
    const params = (ins?.params ?? []).map(String);
    expect(params).toContain(sha256Hex(STATEMENT));
    expect(params).toContain(sha256Hex('is lcx regulated?'));
    expect(params.some((v) => v.includes('is lcx regulated?'))).toBe(false);
    // Five years, from the drafted-at instant, written by the code and not by a default.
    expect(params).toContain('2031-07-10T09:00:00.000Z');
  });

  it('refuses to record anything when 0061 is not applied', async () => {
    const { p, pool: pl } = pool();
    p.migrated = false;
    const got = await writeRecord(pl, {
      xCommentId: null, draftId: null, regime: 'casp_conduct', draftedBy: 'sam',
      draftedAt: new Date('2026-07-10T00:00:00Z'), statementText: STATEMENT,
    });
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.code).toBe('RECORD_REGISTER_ABSENT');
    expect(p.all().some((s) => s.startsWith('INSERT INTO marketing_record '))).toBe(false);
  });
});

describe('the paste-back is immutable, because that is what makes it evidence', () => {
  it('refuses to overwrite a different published text', async () => {
    const { p, pool: pl } = pool();
    p.recordRow = { statement_text: STATEMENT, published_text: STATEMENT };
    const got = await closeOutPublication(pl, {
      recordUid: 'rec_a', publishedText: 'something else entirely', publishedAt: null, by: 'monty',
    });
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.code).toBe('RECORD_CLOSE_OUT_IMMUTABLE');
    expect(p.all().some((s) => s.startsWith('UPDATE marketing_record SET published_text'))).toBe(false);
  });

  it('accepts an identical retry and reports whether what went out matched what was cleared', async () => {
    const { pool: pl } = pool();
    const p2 = pool();
    p2.p.recordRow = { statement_text: STATEMENT, published_text: STATEMENT };
    const same = await closeOutPublication(p2.pool, {
      recordUid: 'rec_a', publishedText: STATEMENT, publishedAt: new Date('2026-07-10T09:35:00Z'), by: 'monty',
    });
    expect(same.ok).toBe(true);
    if (same.ok) expect(same.value.matchesCleared).toBe(true);

    const p3 = pool();
    p3.p.recordRow = { statement_text: STATEMENT, published_text: null };
    const edited = await closeOutPublication(p3.pool, {
      recordUid: 'rec_a', publishedText: `${STATEMENT} Trade now.`, publishedAt: null, by: 'monty',
    });
    expect(edited.ok).toBe(true);
    if (edited.ok) expect(edited.value.matchesCleared).toBe(false);
    void pl;
  });

  it('refuses a close-out with no text and one with no named human', async () => {
    const { p, pool: pl } = pool();
    p.recordRow = { statement_text: STATEMENT, published_text: null };
    const blank = await closeOutPublication(pl, { recordUid: 'rec_a', publishedText: ' ', publishedAt: null, by: 'monty' });
    const unnamed = await closeOutPublication(pl, { recordUid: 'rec_a', publishedText: STATEMENT, publishedAt: null, by: '' });
    expect(blank.ok).toBe(false);
    expect(unnamed.ok).toBe(false);
    if (!blank.ok) expect(blank.code).toBe('RECORD_CLOSE_OUT_TEXT_ABSENT');
    if (!unnamed.ok) expect(unnamed.code).toBe('RECORD_ACTOR_UNNAMED');
  });

  it('refuses to attach a publication to a record that does not exist', async () => {
    const { pool: pl } = pool();
    const got = await closeOutPublication(pl, { recordUid: 'rec_missing', publishedText: STATEMENT, publishedAt: null, by: 'monty' });
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.code).toBe('RECORD_NOT_FOUND');
  });

  it('refuses to show an outstanding count it cannot compute', async () => {
    const { p, pool: pl } = pool();
    p.migrated = false;
    const got = await listOutstandingCloseOuts(pl);
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.sentence).toMatch(/unknown/);
  });
});

describe('the record sweep never deletes a held record', () => {
  it('excludes legal holds in the DELETE itself, not in a caller\'s filter', async () => {
    const { p, pool: pl } = pool();
    const got = await sweepExpiredRecords(pl);
    expect(got.ok).toBe(true);
    const del = p.all().find((s) => s.startsWith('DELETE FROM marketing_record'));
    expect(del).toMatch(/legal_hold = false/);
    expect(del).toMatch(/legal_hold_until IS NULL OR legal_hold_until < now\(\)/);
  });

  it('refuses rather than reporting zero swept when 0061 is missing', async () => {
    const { p, pool: pl } = pool();
    p.migrated = false;
    const got = await sweepExpiredRecords(pl);
    expect(got.ok).toBe(false);
  });
});

/* ── §9 The shared vocabulary this file mirrors, pinned so it cannot drift ─────── */

describe('the retention numbers agree with the shared engine', () => {
  /**
   * WHY THIS IS A FILE READ AND NOT AN IMPORT. `packages/shared/src/marketing/` landed
   * `MICA_RECORD_RETENTION_YEARS`, `MICA_RECORD_RETENTION_MAX_YEARS` and
   * `RETENTION_RULING_QUESTION` while this compartment was being built, and
   * `packages/shared/src/index.ts` does NOT re-export `marketing/` yet — apps/api can only
   * reach the package barrel, so the import cannot be written today (a wiring pass nobody
   * in this wave owns). Two copies of "five years" is exactly how a legal number quietly
   * becomes two different legal numbers, so until the import is possible the agreement is
   * ASSERTED against the shared source text. When the barrel exports marketing, delete this
   * block and import the constants directly.
   */
  const SHARED = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../packages/shared/src/marketing/types.ts'),
    'utf8',
  );

  it('finds the shared constants at all', () => {
    // Non-vacuity: a moved or renamed file would make every assertion below pass for free.
    expect(SHARED.length).toBeGreaterThan(1000);
    expect(SHARED).toMatch(/MICA_RECORD_RETENTION_YEARS/);
  });

  it('uses the same five-year floor and seven-year ceiling as the engine', () => {
    expect(SHARED).toMatch(new RegExp(`MICA_RECORD_RETENTION_YEARS = ${RETENTION_YEARS_BASE};`));
    expect(SHARED).toMatch(new RegExp(`MICA_RECORD_RETENTION_MAX_YEARS = ${RETENTION_YEARS_MAX};`));
  });

  it('agrees with the engine that the DPO ruling is still outstanding', () => {
    // If the engine ever flips this to false, the caveat printed in every bundle is stale
    // and this test is the thing that says so.
    expect(SHARED).toMatch(/RETENTION_RULING_OUTSTANDING = true;/);
    expect(RETENTION_DPO_RULING_OUTSTANDING).toMatch(/OUTSTANDING DPO RULING/);
  });

  it('agrees that the retention period is an inference and not a citation', () => {
    expect(SHARED).toMatch(/MiCA sets no express retention period/);
    expect(RETENTION_INFERENCE_CAVEAT).toMatch(/INFERENCE, NOT CITATION/);
  });
});
