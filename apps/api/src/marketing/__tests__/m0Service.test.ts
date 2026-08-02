import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  _resetMigrated,
  UNVERIFIED_GRADE,
  approveDraft,
  assertSent,
  clearRawEmail,
  ingestEmails,
  insertReply,
  listReplies,
  migrationState,
  queueSummary,
  recordPostedOn,
  saveDraft,
  setReplyStatus,
  sweepRawEmail,
} from '../service.js';
import type { RawEmail } from '../xNotificationParse.js';

/**
 * M0 — THE FIVE DEFECTS THAT LIVE IN `service.ts`, EACH WITH THE BEHAVIOUR THAT WAS
 * TRUE ON PRODUCTION RECORDED NEXT TO IT.
 *
 * A recorded query log rather than a database, for the same reason
 * `deploySafety.test.ts` reads source: what is being asserted is WHICH statements run
 * and what they carry — that an audit row is written inside the same transaction as
 * the approval, that no draft text reaches `audit_log.meta`, that `posted_at` is never
 * written again. A real database would prove the SQL executes; it would not prove any
 * of those, and CI has no marketing schema anyway.
 */

interface Recorded {
  sql: string;
  params: unknown[];
}

interface FakeOptions {
  /** Rows to answer a SELECT of the conflicting row with. */
  existingRow?: { id: number; author_handle: string; body: string };
  /** Make the migration probe throw, to model a transient database fault. */
  probeThrows?: boolean;
  probeAnswer?: boolean;
  draftRow?: Record<string, unknown>;
  updateRowCount?: number;
  summary?: { openRows: number; withDate: number };
}

function fakePool(o: FakeOptions = {}): { pool: Pool; log: Recorded[] } {
  const log: Recorded[] = [];

  const answer = (sql: string): { rows: unknown[]; rowCount: number } => {
    if (/to_regclass/.test(sql)) {
      if (o.probeThrows) throw new Error('connection terminated unexpectedly');
      return { rows: [{ ok: o.probeAnswer ?? true }], rowCount: 1 };
    }
    if (/INSERT INTO marketing_x_reply/.test(sql)) {
      // rowCount 0 models the ON CONFLICT DO NOTHING path.
      return o.existingRow ? { rows: [], rowCount: 0 } : { rows: [{ id: 7 }], rowCount: 1 };
    }
    if (/SELECT id, author_handle, body FROM marketing_x_reply/.test(sql)) {
      return o.existingRow ? { rows: [o.existingRow], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (/SELECT author_handle FROM marketing_x_reply/.test(sql)) {
      return { rows: [{ author_handle: 'cryptocurious' }], rowCount: 1 };
    }
    if (/UPDATE marketing_reply_draft|UPDATE marketing_x_reply/.test(sql)) {
      const rows = o.draftRow ? [o.draftRow] : [];
      return { rows, rowCount: o.updateRowCount ?? (o.draftRow ? 1 : 0) };
    }
    if (/count\(posted_on_displayed\)/.test(sql)) {
      const s = o.summary ?? { openRows: 0, withDate: 0 };
      return {
        rows: [{ open_rows: s.openRows, with_date: s.withDate, hours: s.withDate > 0 ? 30 : null }],
        rowCount: 1,
      };
    }
    if (/min\(received_at\)/.test(sql)) return { rows: [{ hours: 12 }], rowCount: 1 };
    if (/GROUP BY status/.test(sql)) return { rows: [{ status: 'new', n: 2 }], rowCount: 1 };
    if (/WHERE quarantined/.test(sql) && /count/.test(sql)) {
      return { rows: [{ n: 3, collisions: 1 }], rowCount: 1 };
    }
    if (/count\(\*\)::int AS n FROM marketing_x_reply WHERE parse_failed/.test(sql)) {
      return { rows: [{ n: 1 }], rowCount: 1 };
    }
    if (/SELECT \* FROM marketing_x_reply/.test(sql)) return { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 1 };
  };

  const query = async (sql: string, params: unknown[] = []) => {
    log.push({ sql, params });
    return answer(sql);
  };

  const pool = {
    query,
    connect: async () => ({
      query: async (sql: string, params: unknown[] = []) => {
        log.push({ sql, params });
        return answer(sql);
      },
      release: () => undefined,
    }),
  } as unknown as Pool;

  return { pool, log };
}

const sqlOf = (log: Recorded[], re: RegExp): Recorded[] => log.filter((q) => re.test(q.sql));

beforeEach(() => _resetMigrated());
afterEach(() => _resetMigrated());

/* ── DEFECT 8 ────────────────────────────────────────────────────────────────── */

describe('defect 8 — one database blip used to fake "awaiting migration" forever', () => {
  it('does not remember an error as an answer', async () => {
    // WAS: `catch { migratedCache = false }`, and the cache is permanent for the life
    // of the process. A single failover pinned the whole compartment into
    // "awaiting migration 0046" until somebody happened to restart the API.
    const failing = fakePool({ probeThrows: true });
    expect(await migrationState(failing.pool)).toBe('unknown');

    // The next probe, on a database that is answering again, gets the truth.
    const healthy = fakePool({ probeAnswer: true });
    expect(await migrationState(healthy.pool)).toBe('migrated');
  });

  it('distinguishes "the table is not there" from "we could not ask"', async () => {
    const absent = fakePool({ probeAnswer: false });
    expect(await migrationState(absent.pool)).toBe('absent');
    _resetMigrated();
    const unknown = fakePool({ probeThrows: true });
    expect(await migrationState(unknown.pool)).toBe('unknown');
  });

  it('still caches a definitive answer, so a once-ever event is not a per-read cost', async () => {
    const { pool, log } = fakePool({ probeAnswer: true });
    await migrationState(pool);
    await migrationState(pool);
    expect(sqlOf(log, /to_regclass/)).toHaveLength(1);
  });
});

/* ── DEFECT 1 ────────────────────────────────────────────────────────────────── */

describe('defect 1 — an unauthenticated message is quarantined, never graded C3', () => {
  it('grades an unverified sender F6 and quarantines the row', async () => {
    // WAS: every email-sourced row got C3, "fairly reliable source, possibly true
    // content" — a claim nobody made and nothing supported, on a mailbox anybody can
    // send SMTP to.
    const { pool, log } = fakePool();
    const result = await insertReply(pool, {
      xCommentId: '1799887766554433221',
      xPostId: null,
      authorHandle: 'cryptocurious',
      authorDisplay: null,
      body: 'fabricated',
      sourceKind: 'x_notification_email',
      senderAuth: 'unverified',
      senderFrom: 'X <info@x.com>',
    });
    expect(result).toBe('quarantined');
    const insert = sqlOf(log, /INSERT INTO marketing_x_reply/)[0]!;
    expect(insert.params).toContain(UNVERIFIED_GRADE);
    expect(insert.params).toContain(true);
    expect(insert.params).toContain('MKT_INGEST_SENDER_UNVERIFIED');
  });

  it('defaults to unverified when no evidence is supplied at all', async () => {
    // Omission must not read as a pass. The old signature had nowhere to say it.
    const { pool, log } = fakePool();
    expect(
      await insertReply(pool, {
        xCommentId: '1', xPostId: null, authorHandle: 'a', authorDisplay: null,
        body: 'b', sourceKind: 'x_notification_email',
      }),
    ).toBe('quarantined');
    expect(sqlOf(log, /INSERT INTO marketing_x_reply/)[0]!.params).toContain('unverified');
  });

  it('accepts a DKIM-authenticated row at the source grade, unquarantined', async () => {
    const { pool, log } = fakePool();
    expect(
      await insertReply(pool, {
        xCommentId: '1', xPostId: null, authorHandle: 'a', authorDisplay: null,
        body: 'b', sourceKind: 'x_notification_email', senderAuth: 'dkim',
        senderDkimDomain: 'x.com',
      }),
    ).toBe('inserted');
    const insert = sqlOf(log, /INSERT INTO marketing_x_reply/)[0]!;
    expect(insert.params).toContain('C3');
    expect(insert.params).toContain(false);
  });

  it('separates "no trust anchor configured" from "the check failed"', async () => {
    const { pool, log } = fakePool();
    await insertReply(pool, {
      xCommentId: '1', xPostId: null, authorHandle: 'a', authorDisplay: null,
      body: 'b', sourceKind: 'x_notification_email', senderAuth: 'no_trust_anchor',
    });
    expect(sqlOf(log, /INSERT INTO marketing_x_reply/)[0]!.params)
      .toContain('MKT_INGEST_NO_TRUST_ANCHOR');
  });

  it('counts quarantined arrivals separately in the tick outcome', async () => {
    // "40 replies arrived" and "40 unauthenticated messages arrived" are different
    // facts, and the tick used to report the second as the first.
    const { pool } = fakePool();
    const email: RawEmail = {
      subject: 'Crypto Curious (@cryptocurious) replied to your post',
      text: 'A question about SEPA deposits.\nhttps://x.com/cryptocurious/status/1799887766554433221',
      sender: null,
    };
    const out = await ingestEmails(pool, [email]);
    expect(out).toMatchObject({ inserted: 0, quarantined: 1, collisions: 0, failed: 0 });
  });

  it('never writes posted_at again, on any path', async () => {
    // Defect 4's other half: the column exists and is deprecated, and the way it stays
    // deprecated is that no statement mentions it.
    const { pool, log } = fakePool();
    await insertReply(pool, {
      xCommentId: '1', xPostId: null, authorHandle: 'a', authorDisplay: null,
      body: 'b', sourceKind: 'x_notification_email', senderAuth: 'dkim',
      senderDkimDomain: 'x.com',
      // The route still passes this. It must be ignored, not stored.
      postedAt: new Date('2026-07-30T09:15:00Z'),
    });
    for (const q of log) expect(q.sql).not.toMatch(/\bposted_at\b\s*[,)=]/);
  });
});

/* ── DEFECT 6 ────────────────────────────────────────────────────────────────── */

describe('defect 6 — an id collision with different content is never innocent', () => {
  const arriving = {
    xCommentId: '1799887766554433221',
    xPostId: null,
    authorHandle: 'cryptocurious',
    authorDisplay: null,
    body: 'My withdrawal has been pending for six hours.',
    sourceKind: 'x_notification_email',
    senderAuth: 'dkim' as const,
  };

  it('is still a duplicate when the same content arrives twice', async () => {
    const { pool, log } = fakePool({
      existingRow: { id: 3, author_handle: 'CryptoCurious', body: arriving.body },
    });
    expect(await insertReply(pool, arriving)).toBe('duplicate');
    expect(sqlOf(log, /INSERT INTO audit_log/)).toHaveLength(0);
  });

  it('preserves the arriving content when a different message holds the id', async () => {
    // WAS: reported as "duplicates" and discarded. Post a hostile reply, read its id
    // out of your own URL, email a forged notification carrying that id with harmless
    // text — and X's real notification is dropped. Silently, permanently.
    const { pool, log } = fakePool({
      existingRow: { id: 3, author_handle: 'someoneelse', body: 'harmless placeholder text' },
    });
    expect(await insertReply(pool, arriving)).toBe('collision');

    const inserts = sqlOf(log, /INSERT INTO marketing_x_reply/);
    expect(inserts).toHaveLength(2);
    const preserved = inserts[1]!;
    expect(preserved.params[0]).toMatch(/^collision:1799887766554433221:/);
    expect(preserved.params).toContain(arriving.body);
    expect(preserved.sql).toContain('MKT_INGEST_ID_COLLISION');
  });

  it('raises it on the audit spine, with fingerprints and no reply text', async () => {
    const { pool, log } = fakePool({
      existingRow: { id: 3, author_handle: 'someoneelse', body: 'harmless placeholder text' },
    });
    await insertReply(pool, arriving);

    const audit = sqlOf(log, /INSERT INTO audit_log/);
    expect(audit).toHaveLength(1);
    const meta = JSON.parse(String(audit[0]!.params[1]));
    expect(meta.claimedCommentId).toBe(arriving.xCommentId);
    expect(meta.storedRowId).toBe(3);
    expect(meta.storedBodyFingerprint).not.toBe(meta.arrivingBodyFingerprint);
    // audit_log has no retention sweep, so a body in a param is a body kept forever.
    const serialised = JSON.stringify(audit[0]!.params);
    expect(serialised).not.toContain(arriving.body);
    expect(serialised).not.toContain('harmless placeholder text');
  });

  it('reports a collision as a collision in the tick outcome, not as a duplicate', async () => {
    const { pool } = fakePool({
      existingRow: { id: 3, author_handle: 'someoneelse', body: 'different' },
    });
    const out = await ingestEmails(pool, [{
      subject: 'Crypto Curious (@cryptocurious) replied to your post',
      text: 'Real complaint text here.\nhttps://x.com/cryptocurious/status/1799887766554433221',
      sender: { dkimPass: true, dkimDomain: 'x.com', arcPass: false, arcSealerDomain: null, rawAuthenticationResults: 'dkim=pass header.d=x.com' },
    }]);
    expect(out).toMatchObject({ collisions: 1, duplicates: 0, inserted: 0 });
  });
});

/* ── DEFECTS 3 AND 5 ─────────────────────────────────────────────────────────── */

const DRAFT = { id: 11, reply_id: 7, used_llm: true, flagged: false, status: 'approved' };

describe('defect 3 — approve is called "the governed act" and now writes a record', () => {
  it('writes both spine rows, and writes them inside the approval transaction', async () => {
    // WAS: no audit_log row and no object_actions row. Marketing was the only
    // compartment off the audit spine while its own comment claimed to be governed.
    const { pool, log } = fakePool({ draftRow: DRAFT });
    const row = await approveDraft(pool, 11, 'nik');
    expect(row).not.toBeNull();

    const order = log.map((q) => q.sql.trim().split(/\s+/).slice(0, 3).join(' '));
    expect(order[0]).toBe('BEGIN');
    expect(order[order.length - 1]).toBe('COMMIT');
    expect(sqlOf(log, /INSERT INTO audit_log/)).toHaveLength(1);
    expect(sqlOf(log, /INSERT INTO object_actions/)).toHaveLength(1);

    // Both between BEGIN and COMMIT: an approval that committed without a record is
    // the failure this is preventing, so it must not be two separate writes.
    const beginAt = log.findIndex((q) => /BEGIN/.test(q.sql));
    const commitAt = log.findIndex((q) => /COMMIT/.test(q.sql));
    const auditAt = log.findIndex((q) => /INSERT INTO audit_log/.test(q.sql));
    const actionAt = log.findIndex((q) => /INSERT INTO object_actions/.test(q.sql));
    expect(auditAt).toBeGreaterThan(beginAt);
    expect(actionAt).toBeGreaterThan(beginAt);
    expect(commitAt).toBeGreaterThan(actionAt);
  });

  it('names the human from the caller and carries IDS ONLY', async () => {
    const { pool, log } = fakePool({ draftRow: DRAFT });
    await approveDraft(pool, 11, 'nik');
    const audit = sqlOf(log, /INSERT INTO audit_log/)[0]!;
    expect(audit.params[0]).toBe('nik');
    const meta = JSON.parse(String(audit.params[2]));
    expect(meta).toMatchObject({ replyId: 7, draftId: 11 });
    // audit_log has no retention sweep. No draft text, no reply text, ever.
    expect(Object.keys(meta)).not.toContain('body');

    const action = sqlOf(log, /INSERT INTO object_actions/)[0]!;
    expect(JSON.parse(String(action.params[1]))).toEqual({ draftId: 11, replyId: 7 });
  });

  it('rolls back and writes nothing when the draft was not in proposed state', async () => {
    const { pool, log } = fakePool({ draftRow: undefined, updateRowCount: 0 });
    expect(await approveDraft(pool, 11, 'nik')).toBeNull();
    expect(sqlOf(log, /INSERT INTO audit_log/)).toHaveLength(0);
    expect(sqlOf(log, /ROLLBACK/)).toHaveLength(1);
  });
});

describe('defect 5 — "answered" was set when nothing had been sent', () => {
  it('approval moves the reply to approved_pending_send, not to answered', async () => {
    // WAS: `setReplyStatus(pool, row.reply_id, 'answered')` on approval. There is no
    // send path in this compartment, so the customer might still be waiting — and
    // queueSummary's SLA figure inherited the claim.
    const { pool, log } = fakePool({ draftRow: DRAFT });
    await approveDraft(pool, 11, 'nik');
    const updates = sqlOf(log, /UPDATE marketing_x_reply/);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.sql).toContain("status = 'approved_pending_send'");
    for (const q of log) expect(q.sql).not.toContain("'answered'");
  });

  it('models sending as a named human’s assertion, because nothing can observe it', async () => {
    const { pool, log } = fakePool({ draftRow: DRAFT });
    const row = await assertSent(pool, 11, 'sam');
    expect(row).not.toBeNull();
    expect(sqlOf(log, /UPDATE marketing_reply_draft/)[0]!.sql).toContain('sent_asserted_by');
    expect(sqlOf(log, /UPDATE marketing_x_reply/)[0]!.sql).toContain("status = 'sent'");
    const action = sqlOf(log, /INSERT INTO object_actions/)[0]!;
    // The record says out loud that this is testimony rather than observation.
    expect(JSON.parse(String(action.params[2]))).toEqual({
      evidence: 'human_assertion',
      observed: false,
    });
  });

  it('will not let a proposed draft be asserted sent', async () => {
    // The guard is in the WHERE clause, so it cannot be forgotten by a caller.
    const { pool, log } = fakePool({ draftRow: undefined, updateRowCount: 0 });
    expect(await assertSent(pool, 11, 'sam')).toBeNull();
    expect(sqlOf(log, /UPDATE marketing_reply_draft/)[0]!.sql).toContain("status = 'approved'");
    expect(sqlOf(log, /INSERT INTO audit_log/)).toHaveLength(0);
  });
});

/* ── DEFECT 7 ────────────────────────────────────────────────────────────────── */

describe('defect 7 — raw_email was never cleared despite 0046 saying it was', () => {
  it('clears it when a human moves the row on', async () => {
    // WAS: written once by insertUnparsed and cleared nowhere in the repo — up to
    // 20,000 characters of a stranger's email for the full 90-day window.
    const { pool, log } = fakePool();
    await setReplyStatus(pool, 7, 'triaged');
    const sql = log[0]!.sql;
    expect(sql).toContain('raw_email = NULL');
    expect(sql).toContain('raw_email_cleared_at');
  });

  it('does not claim to have cleared a row that had nothing to clear', async () => {
    // `raw_email_cleared_at` is evidence, so it must not be stamped on a row where no
    // clearing happened — otherwise it stops being a queryable fact.
    const { pool, log } = fakePool();
    await setReplyStatus(pool, 7, 'triaged');
    expect(log[0]!.sql).toMatch(/CASE WHEN raw_email IS NOT NULL THEN now\(\)/);
  });

  it('sweeps rows nobody triaged, on a much shorter clock than the row itself', async () => {
    const { pool, log } = fakePool();
    await sweepRawEmail(pool);
    const q = log[0]!;
    expect(q.sql).toContain('raw_email IS NOT NULL');
    expect(q.sql).toContain("received_at < now() - ($1 || ' days')::interval");
    // Data minimisation is per-field: 7 days for the forwarding artefact against 90
    // for the customer's comment.
    expect(q.params[0]).toBe('7');
  });

  it('clears one row explicitly, without asserting a status change', async () => {
    const { pool, log } = fakePool();
    await clearRawEmail(pool, 7);
    expect(log[0]!.sql).not.toContain('status =');
    expect(log[0]!.sql).toContain('raw_email IS NOT NULL');
  });

  it('clears it on approval too, since nobody will look at it after that', async () => {
    const { pool, log } = fakePool({ draftRow: DRAFT });
    await approveDraft(pool, 11, 'nik');
    expect(sqlOf(log, /UPDATE marketing_x_reply/)[0]!.sql).toContain('raw_email = NULL');
  });
});

/* ── DEFECT 4 ────────────────────────────────────────────────────────────────── */

describe('defect 4 — the post clock and the observation clock are different clocks', () => {
  it('writes nothing at all when X gave no date', async () => {
    // Not a zero, not received_at, not the email header date.
    const { pool, log } = fakePool();
    expect(await recordPostedOn(pool, '1799887766554433221', null)).toBe(false);
    expect(log).toHaveLength(0);
  });

  it('records X’s own calendar date, and says that is where it came from', async () => {
    const { pool, log } = fakePool({ updateRowCount: 1 });
    expect(await recordPostedOn(pool, '1799887766554433221', '2026-08-01')).toBe(true);
    const q = log[0]!;
    expect(q.sql).toContain('posted_on_displayed = $2::date');
    expect(q.sql).toContain("posted_at_source = 'oembed_display_date'");
    expect(q.params).toEqual(['1799887766554433221', '2026-08-01']);
  });

  it('refuses the since-posted figure rather than substituting the one it has', async () => {
    // WAS: one number, measured from received_at, labelled "oldest unanswered". It
    // included mail-forwarding latency and it was the only clock on the surface.
    const { pool } = fakePool({ summary: { openRows: 4, withDate: 1 } });
    const s = await queueSummary(pool);
    expect(s.oldestObservedWaitingHours).toBe(12);
    expect(typeof s.oldestSincePostedHours).toBe('object');
    const refusal = s.oldestSincePostedHours as { code: string; message: string; needs: string };
    expect(refusal.code).toBe('MKT_CLOCK_POST_TIME_UNKNOWN');
    expect(refusal.message).toContain('3 of 4');
    expect(refusal.needs).toContain('oembed');
  });

  it('answers the since-posted figure once every open reply has a date', async () => {
    const { pool } = fakePool({ summary: { openRows: 2, withDate: 2 } });
    const s = await queueSummary(pool);
    expect(s.oldestSincePostedHours).toBe(30);
  });

  it('keeps the old key as an alias, because the web surface is not this lane’s file', async () => {
    const { pool } = fakePool({ summary: { openRows: 0, withDate: 0 } });
    const s = await queueSummary(pool);
    expect(s.oldestUnansweredHours).toBe(s.oldestObservedWaitingHours);
  });
});

describe('quarantined rows count towards nothing', () => {
  it('is excluded from the drafting queue', async () => {
    const { pool, log } = fakePool();
    await listReplies(pool, { limit: 10 });
    expect(log[0]!.sql).toContain('NOT quarantined');
  });

  it('is excluded from the status filter too, not only from the open queue', async () => {
    const { pool, log } = fakePool();
    await listReplies(pool, { status: 'new' });
    expect(log[0]!.sql).toContain('NOT quarantined');
  });

  it('is excluded from the counts and from the SLA, and reported on its own', async () => {
    const { pool, log } = fakePool({ summary: { openRows: 0, withDate: 0 } });
    const s = await queueSummary(pool);
    for (const q of sqlOf(log, /GROUP BY status|min\(received_at\)/)) {
      expect(q.sql).toContain('NOT quarantined');
    }
    expect(s.quarantined).toBe(3);
    expect(s.collisions).toBe(1);
  });
});

/* ── W4 — the hostility signal, and the coverage figure the panels needed ────── */

describe('a draft written from hostile input says so after a reload', () => {
  /*
   * `suspiciousInput` was a transient toast: `MarketingDesk.tsx` showed it once when the
   * 201 came back, and `saveDraft` stored only the SANITISER's `flagged`. So the draft
   * generated from a reply carrying "ignore all previous instructions" was, after a
   * refresh, indistinguishable from any other draft in the table — and the reviewer who
   * comes back to it tomorrow is the one who most needs to know.
   *
   * It does not block, and the stored reason says that in as many words: a reply that tries
   * this is exactly the reply the desk most wants answered.
   */
  const insertOf = (log: Recorded[]) => sqlOf(log, /INSERT INTO marketing_reply_draft/)[0];

  it('persists the flag and the reason', async () => {
    const { pool, log } = fakePool({ probeAnswer: true });
    await saveDraft(pool, 1, 'Thanks — the team is looking into it.', true, true);
    const row = insertOf(log);
    expect(row).toBeDefined();
    expect(row.params[3]).toBe(true);
    expect(String(row.params[4])).toMatch(/instruction aimed at the model/);
    expect(String(row.params[4])).toMatch(/Nothing was blocked on that basis/);
  });

  it('leaves an ordinary draft unflagged, so the flag keeps meaning something', async () => {
    const { pool, log } = fakePool({ probeAnswer: true });
    await saveDraft(pool, 1, 'Thanks — the team is looking into it.', true, false);
    expect(insertOf(log).params[3]).toBe(false);
    expect(insertOf(log).params[4]).toBeNull();
  });

  it('keeps the sanitiser reason alongside it rather than replacing it', async () => {
    const { pool, log } = fakePool({ probeAnswer: true });
    // A live URL is redacted by the sanitiser, which sets its own flag and reason.
    await saveDraft(pool, 1, 'See https://not-lcx.example for details.', true, true);
    const reason = String(insertOf(log).params[4]);
    expect(reason).toMatch(/Removed/);
    expect(reason).toMatch(/instruction aimed at the model/);
  });
});

describe('the summary reports post-time coverage over the population', () => {
  it('returns the open-row and with-date counts as first-class fields', async () => {
    // Both panels used to divide by `queue.length`, which is a PAGE capped at 50: a desk
    // with 120 open replies of which 50 carried a post time rendered "100% — 50 of 50".
    const { pool } = fakePool({ probeAnswer: true, summary: { openRows: 120, withDate: 50 } });
    const s = await queueSummary(pool);
    expect(s.postTimeCoverage).toEqual({ openRows: 120, withPostTime: 50 });
    // And the refusal built from the same two numbers still agrees with them.
    expect(s.oldestSincePostedHours).toMatchObject({ code: 'MKT_CLOCK_POST_TIME_UNKNOWN' });
  });

  it('reports a real zero denominator as zero rather than omitting it', async () => {
    const { pool } = fakePool({ probeAnswer: true, summary: { openRows: 0, withDate: 0 } });
    const s = await queueSummary(pool);
    expect(s.postTimeCoverage).toEqual({ openRows: 0, withPostTime: 0 });
    expect(s.oldestSincePostedHours).toBeNull();
  });
});
