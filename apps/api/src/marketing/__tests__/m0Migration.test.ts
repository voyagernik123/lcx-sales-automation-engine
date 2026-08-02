import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 0059 IS PASTED INTO THE SUPABASE SQL EDITOR BY A HUMAN, so the file is the artefact
 * under test — there is no runner and no CI database to apply it to.
 *
 * These assertions are text-level and honest about what that buys: they prove the file
 * SAYS the right thing, not that Postgres does it. What they catch is the regression
 * class this repository has already hit twice — a destructive verb creeping into a
 * hand-pasted file, and an ADD COLUMN losing its IF NOT EXISTS during an edit. The
 * behavioural half is `m0Service.test.ts`.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = resolve(HERE, '../../db/migrations');
const FILE = '0059_marketing_m0.sql';
const raw = readFileSync(resolve(MIGRATIONS, FILE), 'utf8');

/** Comments carry the reasoning, and it names the very verbs the SQL must not use. */
const sql = raw.replace(/^\s*--.*$/gm, '');

describe('the file a human pastes by hand cannot cost a round trip', () => {
  it('takes a number no other workflow owns', () => {
    // 0057 and 0058 are the GPS artifact pair, written by the workflow running
    // alongside this one; 0060 and 0061 are the later marketing phases. 0059 is the
    // gap between them, which is why this file is not 0058.
    expect(FILE).toBe('0059_marketing_m0.sql');
    expect(() => readFileSync(resolve(MIGRATIONS, '0058_gps_artifact_custody.sql')))
      .not.toThrow();
  });

  it('contains no destructive operation', () => {
    // A destructive-operations warning in the Supabase editor stops the paste and
    // costs a round trip with the one human who can run it.
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bDELETE\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/ALTER\s+COLUMN/i);
    expect(sql).not.toMatch(/\bUPDATE\s+marketing/i);
  });

  it('is idempotent in every statement that creates something', () => {
    const adds = [...sql.matchAll(/ADD COLUMN(?!\s+IF NOT EXISTS)/gi)];
    expect(adds, 'an ADD COLUMN lost its IF NOT EXISTS').toHaveLength(0);
    const indexes = [...sql.matchAll(/CREATE INDEX(?!\s+IF NOT EXISTS)/gi)];
    expect(indexes).toHaveLength(0);
  });

  it('adds no CHECK constraint to an already-populated column', () => {
    // A CHECK that fails on paste is the same round trip by another route: 'answered'
    // rows exist in production and a status enum would reject them.
    expect(sql).not.toMatch(/ADD\s+CONSTRAINT/i);
    expect(sql).not.toMatch(/\bCHECK\s*\(/i);
  });
});

describe('every column the M0 fixes need is actually declared', () => {
  const REQUIRED_REPLY_COLUMNS = [
    // defect 1 — the evidence, per row
    'sender_from', 'sender_auth_state', 'sender_dkim_domain', 'sender_auth_evidence',
    'quarantined', 'quarantine_code',
    // defect 4 — the post clock, separate from the observation clock
    'posted_on_displayed', 'posted_at_source',
    // defect 6 — the losing content is kept, not discarded
    'collision_of_comment_id',
    // defect 7 — the clearing is a queryable fact
    'raw_email_cleared_at',
  ];

  for (const col of REQUIRED_REPLY_COLUMNS) {
    it(`declares marketing_x_reply.${col}`, () => {
      expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}\\b`));
    });
  }

  it('declares the send assertion on the draft, not on the reply', () => {
    // Approval and sending are different acts by possibly different people, and the
    // draft is the artefact that was sent. Putting it on the reply would lose which
    // draft the human actually pasted.
    const draftBlock = sql.slice(sql.indexOf('ALTER TABLE marketing_reply_draft'));
    expect(draftBlock).toMatch(/ADD COLUMN IF NOT EXISTS\s+sent_asserted_by/);
    expect(draftBlock).toMatch(/ADD COLUMN IF NOT EXISTS\s+sent_asserted_at/);
  });

  it('stores the post date as a DATE, because X publishes no time of day', () => {
    // Widening it into a timestamptz would invent a time, which is the same class of
    // mistake as writing the email header date into posted_at.
    expect(sql).toMatch(/posted_on_displayed\s+date\b/);
    expect(sql).not.toMatch(/posted_on_displayed\s+timestamptz/);
  });
});

describe('the comments that used to assert untrue guarantees are corrected', () => {
  it('records in the database that posted_at is deprecated and why', () => {
    // A COMMENT ON COLUMN rather than only a note in this file: a database restored
    // from the schema must carry the true statement.
    const c = /COMMENT ON COLUMN marketing_x_reply\.posted_at IS\s+'([^']*(?:''[^']*)*)'/.exec(raw);
    expect(c, 'posted_at has no corrective comment').not.toBeNull();
    expect(c![1]).toMatch(/NO LONGER WRITTEN/);
    expect(c![1]).toMatch(/Date header/);
  });

  it('records that raw_email is cleared, now that it actually is', () => {
    const c = /COMMENT ON COLUMN marketing_x_reply\.raw_email IS\s+'([^']*(?:''[^']*)*)'/.exec(raw);
    expect(c).not.toBeNull();
    expect(c![1]).toMatch(/clearRawEmail|sweepRawEmail/);
    expect(c![1]).toMatch(/0046 claimed this was already happening and it was not/);
  });

  /**
   * 0046 IS FROZEN AND ITS FALSE COMMENT STAYS IN THE FILE.
   *
   * The correction was first written into 0046 directly, and
   * `db/__tests__/migrationImmutability.test.ts` rejected it — with a message naming
   * this exact situation: 0046 has already been applied, `db/migrate.ts` skips applied
   * filenames, so an edit changes nothing in any environment that ran it while the
   * repository claims otherwise. That ratchet is right and it was not weakened. The
   * correction is delivered where it can actually reach a database: as a
   * COMMENT ON COLUMN in 0059, which overwrites the comment Postgres is holding.
   */
  it('leaves 0046 byte-identical and corrects it from 0059 instead', () => {
    const original = readFileSync(resolve(MIGRATIONS, '0046_marketing.sql'), 'utf8');
    // The false claim is still in the frozen file, and that is deliberate.
    expect(original).toMatch(/Cleared once parsed\./);
    // 0059 is what a database actually ends up believing, and it names the file it is
    // correcting so the contradiction is traceable rather than silent.
    const c = /COMMENT ON COLUMN marketing_x_reply\.raw_email IS\s+'([^']*(?:''[^']*)*)'/.exec(raw);
    expect(c![1]).toMatch(/0046/);
    expect(raw).toMatch(/0046 claimed this was already happening and it was not/);
  });

  it('says out loud that an assertion of sending is not an observation of it', () => {
    const c = /COMMENT ON COLUMN marketing_reply_draft\.sent_asserted_by IS\s+'([^']*(?:''[^']*)*)'/.exec(raw);
    expect(c).not.toBeNull();
    expect(c![1]).toMatch(/AN ASSERTION, NOT AN OBSERVATION/);
  });

  it('states what a NULL post date means, so nothing substitutes for it', () => {
    const c = /COMMENT ON COLUMN marketing_x_reply\.posted_on_displayed IS\s+'([^']*(?:''[^']*)*)'/.exec(raw);
    expect(c![1]).toMatch(/NULL means the post time is NOT KNOWN/);
    expect(c![1]).toMatch(/refuse/);
  });
});
