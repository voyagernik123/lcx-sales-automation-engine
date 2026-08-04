/**
 * P0 / 0067 — the notification bell's need-to-know boundary.
 *
 * These tests exist because the bell leaked in production: `listNotifications`
 * was `SELECT … FROM notifications ORDER BY created_at DESC LIMIT n` with no
 * filter, `markRead('all')` cleared every compartment, and the SSE token carried
 * no subject so the stream had to broadcast. Each test below is pinned to one
 * claim in `docs/phases/P0_CLAIM.md`.
 *
 * The SQL is rendered through drizzle's own dialect rather than string-matched on
 * a template, so these assert what Postgres would actually receive — including
 * that the scope list arrives as BOUND PARAMETERS and is never interpolated.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const dialect = new PgDialect();
const rendered: { sql: string; params: unknown[] }[] = [];

/** Captures each statement as Postgres would see it, then returns a canned result. */
function execute(q: SQL) {
  const { sql, params } = dialect.sqlToQuery(q);
  rendered.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
  return Promise.resolve({ rows: [{ n: 0, withheld: 0, unattributed: 0 }], rowCount: 0 });
}

vi.mock('../../db/index.js', () => ({
  getDb: () => ({ execute }),
  getPool: () => ({ query: () => Promise.resolve({ rows: [], rowCount: 0 }) }),
  closeDb: async () => {},
  checkDb: async () => ({ ok: true }),
}));

const { listNotifications, markRead, notify, scopesFor, DESK_SCOPE } = await import('../service.js');
const { mintStreamToken, verifyStreamToken } = await import('../events.js');

beforeEach(() => {
  rendered.length = 0;
});

const find = (needle: string) => rendered.filter((r) => r.sql.includes(needle));

describe('scopesFor — which compartments a reader may be shown', () => {
  it('includes only compartments held at >= view, plus the desk', () => {
    const scopes = scopesFor({ sales: 'view', gps: 'approve' });
    expect(scopes).toContain('sales');
    expect(scopes).toContain('gps');
    expect(scopes).toContain(DESK_SCOPE);
    expect(scopes).not.toContain('distribution');
    expect(scopes).not.toContain('marketing');
  });

  it('gives an actor holding nothing the desk and nothing else', () => {
    expect(scopesFor({})).toEqual([DESK_SCOPE]);
  });
});

describe('C1/C2/C3 — the read path is scoped, and says what it withheld', () => {
  it('filters the item query to the reader’s scopes', async () => {
    await listNotifications(['sales', DESK_SCOPE]);
    const items = find('FROM notifications WHERE workspace IN');
    expect(items).toHaveLength(1);
    // The scopes arrive as BOUND PARAMETERS. If this ever renders as inlined
    // literals, the query is string-built and one step from injection.
    // LIMIT is bound too, so the scopes are the leading params.
    expect(items[0]!.params.slice(0, 2)).toEqual(['sales', '_desk']);
    expect(items[0]!.sql).not.toContain("'sales'");
  });

  it('scopes the unread count too — a global count would leak the size of other compartments', async () => {
    await listNotifications(['sales', DESK_SCOPE]);
    const unread = find('COUNT(*) AS n');
    expect(unread).toHaveLength(1);
    expect(unread[0]!.sql).toContain('read_at IS NULL AND workspace IN');
    expect(unread[0]!.params).toEqual(['sales', '_desk']);
  });

  it('counts what it is not showing, separating withheld from unattributed', async () => {
    await listNotifications(['sales', DESK_SCOPE]);
    const hidden = find('FILTER (WHERE workspace IS NULL)');
    expect(hidden).toHaveLength(1);
    expect(hidden[0]!.sql).toContain('workspace NOT IN');
  });

  it('an actor holding nothing runs NO item query but is still told the size of the withheld set', async () => {
    const page = await listNotifications([]);
    // `IN ()` is a syntax error; the query must be skipped, not assembled empty.
    expect(find('FROM notifications WHERE workspace IN')).toHaveLength(0);
    expect(page.items).toEqual([]);
    expect(page.unread).toBe(0);
    expect(page).toHaveProperty('withheld');
    expect(page).toHaveProperty('unattributed');
  });

  it('reports the scopes it used, so the counts are interpretable', async () => {
    const page = await listNotifications(['gps', DESK_SCOPE]);
    expect(page.scopes).toEqual(['gps', DESK_SCOPE]);
  });
});

describe('C4/C5 — the write path is scoped on both limbs', () => {
  it('mark-all touches only the reader’s compartments', async () => {
    await markRead('all', ['sales', DESK_SCOPE]);
    const upd = find('UPDATE notifications SET read_at');
    expect(upd).toHaveLength(1);
    expect(upd[0]!.sql).toContain('read_at IS NULL AND workspace IN');
    expect(upd[0]!.params).toEqual(['sales', '_desk']);
  });

  it('mark-by-id carries the scope as well as the id — a guessed uuid must not be actionable', async () => {
    await markRead('11111111-2222-3333-4444-555555555555', ['sales', DESK_SCOPE]);
    const upd = find('UPDATE notifications SET read_at');
    expect(upd[0]!.sql).toContain('WHERE id = $1 AND workspace IN');
    expect(upd[0]!.params).toEqual(['11111111-2222-3333-4444-555555555555', 'sales', '_desk']);
  });

  it('an actor holding nothing issues no UPDATE at all', async () => {
    const res = await markRead('all', []);
    expect(rendered).toHaveLength(0);
    expect(res.changed).toBe(0);
  });

  it('reports how many rows changed so a caller cannot claim success it did not have', async () => {
    const res = await markRead('all', ['sales']);
    expect(res).toHaveProperty('changed');
    expect(typeof res.changed).toBe('number');
  });
});

describe('C8/C9 — every write records a compartment', () => {
  it('notify() puts the workspace in the INSERT', async () => {
    await notify({ rule: 'test', title: 't', workspace: 'gps' });
    const ins = find('INSERT INTO notifications');
    expect(ins).toHaveLength(1);
    expect(ins[0]!.sql).toContain('dedup_key, workspace)');
    expect(ins[0]!.params).toContain('gps');
  });

  it('the sweep’s ten rules each carry a literal compartment, and none is NULL', async () => {
    // Source-level, because the sweep runs raw pool.query strings rather than
    // drizzle templates. A rule that forgets the column would insert a row no
    // reader can ever see — silent, which is the failure mode 0067 closed.
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../service.ts', import.meta.url), 'utf8'),
    );
    const inserts = src.match(/INSERT INTO notifications \(([^)]*)\)/g) ?? [];
    expect(inserts.length).toBeGreaterThanOrEqual(9);
    for (const ins of inserts) expect(ins).toContain('workspace');

    // And each sweep SELECT ends with a quoted compartment before its FROM.
    const compartments = src.match(/TO_CHAR\(NOW\(\), 'IYYY-IW'\), '(\w+)'/g) ?? [];
    expect(compartments.length).toBeGreaterThanOrEqual(6);
    for (const c of compartments) expect(c).not.toMatch(/NULL/i);
  });
});

describe('C7 — the stream token is bound to a subject', () => {
  it('round-trips the subject it was minted for', () => {
    const t = mintStreamToken('nik');
    expect(verifyStreamToken(t)).toEqual({ subject: 'nik' });
  });

  it('cannot be replayed as a different actor', () => {
    const t = mintStreamToken('nik');
    const [expires, , sig] = t.split('.');
    // Swap the subject, keep the signature — this is the attack the old
    // subject-less token could not even express.
    expect(verifyStreamToken(`${expires}.mallory.${sig}`)).toBeNull();
  });

  it('survives a subject containing dots — second-tier ids look like ext:nikhil.sharma', () => {
    // REGRESSION PIN. The first version percent-encoded the subject, but '.' is
    // an UNRESERVED character so encodeURIComponent left it alone, yielding a
    // four-segment token that failed to verify. That silently killed the live
    // stream for every second-tier colleague. Caught by this test, not in prod.
    for (const subject of ['ext:nikhil.sharma', 'nik', 'monitor:a.b.c', 'ai']) {
      expect(verifyStreamToken(mintStreamToken(subject))).toEqual({ subject });
    }
  });

  it('rejects a subject segment that is not canonical base64url', () => {
    const t = mintStreamToken('nik');
    const [expires, subj, sig] = t.split('.');
    expect(verifyStreamToken(`${expires}.${subj}=.${sig}`)).toBeNull();
    expect(verifyStreamToken(`${expires}.not/base64url.${sig}`)).toBeNull();
  });

  it('rejects an expired token', () => {
    const t = mintStreamToken('nik', Date.now() - 60 * 60 * 1000);
    expect(verifyStreamToken(t)).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const t = mintStreamToken('nik');
    const [expires, subject, sig] = t.split('.');
    const flipped = (sig![0] === 'a' ? 'b' : 'a') + sig!.slice(1);
    expect(verifyStreamToken(`${expires}.${subject}.${flipped}`)).toBeNull();
  });

  it('rejects a token with no subject, which is what the pre-0067 shape looked like', () => {
    expect(verifyStreamToken(`${Date.now() + 60_000}.deadbeef`)).toBeNull();
    expect(verifyStreamToken('')).toBeNull();
  });

  it('rejects a malformed subject segment rather than throwing', () => {
    const t = mintStreamToken('nik');
    const [expires, , sig] = t.split('.');
    expect(() => verifyStreamToken(`${expires}.%E0%A4%A.${sig}`)).not.toThrow();
    expect(verifyStreamToken(`${expires}.%E0%A4%A.${sig}`)).toBeNull();
  });
});
