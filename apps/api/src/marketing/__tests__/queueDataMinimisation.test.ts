import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * THE QUEUE READ SHIPPED A STRANGER'S EMAIL BODY TO THE BROWSER.
 *
 * `listReplies` and `listQuarantined` were `SELECT * FROM marketing_x_reply`. That table
 * carries `raw_email` — up to 20,000 characters of the original forwarded notification,
 * headers and envelope addresses included — kept so a brittle regex never silently loses
 * a customer's comment. The wildcard put it in the route payload on EVERY queue read.
 *
 * WHY CLEARING AT TRIAGE DID NOT COVER IT. `setReplyStatus` nulls the column when a row
 * leaves `new`, and 0059 added `raw_email_cleared_at` to record that. But the queue's
 * whole purpose is the rows that have NOT been triaged, so the exposed set and the
 * protected set were disjoint. The retention sweep is no help either: it fires on
 * `retention_expires_at`, days after the payload reached a browser.
 *
 * Two rules broken by one character: GDPR Art 5(1)(c) data minimisation — a third
 * party's message body is not needed to decide whether to reply to it — and plain
 * over-exposure, since no surface ever rendered the field and no caller ever read it.
 *
 * ══ WHAT THIS FILE VERIFIES ══
 * Source-level assertions over `service.ts`, for the reason stated in
 * `deploySafety.test.ts`: these functions are `pg` over a real pool and the api suite is
 * database-free. They verify that the two queue queries name their columns, that
 * `raw_email` is not among the named columns, and that the row type does not declare it.
 * They do NOT execute a query, so they cannot prove what a live Postgres returns. The
 * test names below say "does not select" rather than "cannot leak" for that reason.
 */

const SERVICE = readFileSync(new URL('../service.ts', import.meta.url), 'utf8');

/**
 * `service.ts` with comment lines removed. The docblocks quote the defect verbatim —
 * "`listReplies` was `SELECT * FROM marketing_x_reply`" — and an assertion that scanned
 * the raw text would fire on the explanation of the fix instead of on a regression.
 * The invariant is about statements the database executes.
 */
const CODE = SERVICE.split('\n')
  .filter((line) => !/^\s*(?:\*|\/\/|\/\*)/.test(line))
  .join('\n');

/** Everything from the column-list constant to the end of `listQuarantined`. */
const QUEUE_REGION = SERVICE.slice(
  SERVICE.indexOf('const REPLY_COLUMNS'),
  SERVICE.indexOf('export async function setReplyStatus'),
);

/** The body of the named-column constant. */
const COLUMN_LIST = (() => {
  const m = /const REPLY_COLUMNS = `([^`]*)`/.exec(SERVICE);
  if (!m) throw new Error('REPLY_COLUMNS constant not found — the fix has been reverted');
  return m[1];
})();

describe('the marketing queue queries do not select raw_email', () => {
  it('defines a named column list rather than a wildcard', () => {
    expect(COLUMN_LIST.trim().length).toBeGreaterThan(0);
  });

  it('omits raw_email from the column list', () => {
    // Word-boundary match: `raw_email_cleared_at` is legitimately present and must not
    // satisfy or trip this assertion.
    expect(COLUMN_LIST).not.toMatch(/\braw_email\b(?!_)/);
  });

  it('keeps raw_email_cleared_at, which is an audit fact and not content', () => {
    expect(COLUMN_LIST).toMatch(/\braw_email_cleared_at\b/);
  });

  it('leaves no SELECT * against marketing_x_reply anywhere in service.ts', () => {
    // The narrow assertion would be satisfied by adding REPLY_COLUMNS to one query and
    // leaving the other on `*`. This one covers the whole file, including any query a
    // later change adds.
    const wildcards = [...CODE.matchAll(/SELECT\s+\*\s+FROM\s+marketing_x_reply/gi)];
    expect(
      wildcards.map((w) => w[0]),
      'a wildcard select on marketing_x_reply re-exposes raw_email',
    ).toEqual([]);
  });

  it('uses the column list in both queue reads', () => {
    const uses = [...QUEUE_REGION.matchAll(/SELECT \$\{REPLY_COLUMNS\} FROM marketing_x_reply/g)];
    // listReplies has two branches (filtered and open-statuses) and listQuarantined one.
    expect(uses.length).toBe(3);
  });

  it('does not declare raw_email on ReplyRow', () => {
    // A declared field the API never sends is the mirror-image defect: it compiles,
    // passes a mocked test, and reads as undefined on real data. `marketingContract`
    // pins this to the web shape in both directions.
    const start = SERVICE.indexOf('export interface ReplyRow {');
    const body = SERVICE.slice(start, SERVICE.indexOf('}', start));
    expect(body).not.toMatch(/^\s*raw_email\s*[?:]/m);
    expect(body).toMatch(/^\s*raw_email_cleared_at\s*:/m);
  });

  it('still writes raw_email on ingest, so a parse failure loses nothing', () => {
    // The fix is data minimisation on the READ path. Not storing the body at all would
    // trade a privacy defect for a correctness one: M0 defect 7 exists because a
    // mis-parsed comment used to vanish.
    expect(SERVICE).toMatch(/parse_failed,\s*raw_email\b/);
  });

  it('reaches the column only to null it, outside the ingest insert', () => {
    // Every executable mention of the body is accounted for as a write or a guard. A
    // future `SELECT raw_email` would add an unaccounted one and fail this.
    const statements = [...SERVICE.matchAll(/^.*\braw_email\b(?!_).*$/gm)]
      .map((m) => m[0])
      .filter((line) => !/^\s*\*/.test(line) && !/^\s*\/\//.test(line));
    for (const line of statements) {
      expect(
        /raw_email = NULL/.test(line)
          || /raw_email IS NOT NULL/.test(line)
          || /parse_failed,\s*raw_email/.test(line),
        `unaccounted use of raw_email — is it being read? ${line.trim()}`,
      ).toBe(true);
    }
    expect(statements.length).toBeGreaterThanOrEqual(4);
  });
});
