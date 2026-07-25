/**
 * THE SECOND, UNGOVERNED WRITE PATH.
 *
 * `POST /v1/intel/actions` → intel/actions.ts `executeAction` writes the same two
 * governed tables as invokeAction, but reached none of its checks: `body.params`
 * arrived unvalidated and landed in `object_actions.params` AND `audit_log.meta`
 * as raw `JSON.stringify`, with no redaction, no subject-type check and no role
 * check. That falsified the header comment on actions/registry.ts, which called
 * itself "the ONE path every server-side mutation takes" — the claim is now
 * corrected there rather than left standing.
 *
 * These pin the floor the path was raised to. They do NOT prove the two paths are
 * one; `unflag` and `note_add` still have no ACTION_REGISTRY entry and are still
 * unreachable through invokeAction.
 *
 * Severity was capped and stays capped: all five ids are minRole 'operator' and
 * the route's floor is already operator, so there was nothing to escalate to. The
 * containment failure was the unbounded client blob in two audited tables, and
 * that is what these assert.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const execute = vi.fn(async () => ({ rows: [] as Record<string, unknown>[] }));
vi.mock('../../db/index.js', () => ({
  getDb: () => ({ execute }),
  getPool: () => { throw new Error('getPool is not used by executeAction'); },
  closeDb: async () => {},
}));

const { executeAction } = await import('../../intel/actions.js');

/**
 * Split a drizzle `sql` template into its literal SQL and its bound values.
 *
 * Measured, because the first version of this helper was wrong and the failure was
 * SILENT: interpolated primitives are pushed onto `queryChunks` as bare strings,
 * NOT wrapped in a `Param`, so filtering for objects with a `.value` returned no
 * binds at all — and the "both tables get the same object" assertion below then
 * compared undefined to undefined and passed. Only StringChunk carries a `.value`,
 * and it is a string[] of literal SQL.
 */
function parts(q: unknown): { literal: string; binds: unknown[] } {
  const chunks = (q as { queryChunks?: unknown[] }).queryChunks ?? [];
  const lit: string[] = [];
  const binds: unknown[] = [];
  for (const c of chunks) {
    const val = c && typeof c === 'object' && 'value' in c ? (c as { value: unknown }).value : undefined;
    if (Array.isArray(val)) { lit.push(val.join('')); continue; }
    binds.push(val !== undefined ? val : c);
  }
  return { literal: lit.join(' '), binds };
}

/**
 * The jsonb payloads written by statements matching `table`, one array per
 * statement. object_actions binds params then result; audit_log binds meta alone.
 * Matched on INSERT specifically: getObjectState also SELECTs from object_actions,
 * and a looser pattern picked that read up as a second write.
 */
function payloads(table: RegExp): Record<string, unknown>[][] {
  const out: Record<string, unknown>[][] = [];
  for (const call of execute.mock.calls) {
    const { literal, binds } = parts((call as unknown as unknown[])[0]);
    if (!table.test(literal)) continue;
    const json: Record<string, unknown>[] = [];
    for (const b of binds) {
      if (typeof b !== 'string' || !b.startsWith('{')) continue;
      try { json.push(JSON.parse(b) as Record<string, unknown>); } catch { /* not json */ }
    }
    out.push(json);
  }
  return out;
}

/** The `params` / `meta` object of the single statement matching `table`. */
function recordedParams(table: RegExp): Record<string, unknown> | undefined {
  const rows = payloads(table);
  expect(rows.length, `expected exactly one ${table} statement`).toBeLessThan(2);
  return rows[0]?.[0];
}

const run = (over: Partial<Parameters<typeof executeAction>[0]> = {}) => executeAction({
  subjectType: 'project', subjectId: 'proj-1', action: 'note_add',
  actor: 'sam', role: 'operator', params: { note: 'a real note' },
  ...over,
});

describe('the intel write path no longer records an arbitrary client blob', () => {
  beforeEach(() => { execute.mockClear(); });

  it('strips undeclared keys before they reach object_actions OR audit_log', async () => {
    await run({ params: { note: 'a real note', stepUpPasscode: 'test#1234', junk: { deep: 'x' } } });

    const ledger = recordedParams(/INSERT INTO object_actions/);
    const audit = recordedParams(/INSERT INTO audit_log/);
    for (const [label, rec] of [['ledger', ledger], ['audit', audit]] as const) {
      expect(rec, label).toBeDefined();
      expect(rec!.note, label).toBe('a real note');
      expect(Object.keys(rec!), label).toEqual(['note']);
      expect(JSON.stringify(rec), label).not.toContain('test#1234');
    }
  });

  it('writes the SAME recorded object to both tables', async () => {
    // They used to be two independent JSON.stringify(params) calls. Two records of
    // one action that could disagree is worse than one record.
    await run();
    const ledger = recordedParams(/INSERT INTO object_actions/);
    // Guarded, because the first version of this test compared two undefineds and
    // passed against a broken extractor.
    expect(ledger).toEqual({ note: 'a real note' });
    expect(recordedParams(/INSERT INTO audit_log/)).toEqual(ledger);
  });

  it('refuses note_add with no note instead of recording that a note was added', async () => {
    // The old code coerced a missing note to '' and wrote an audit row asserting a
    // note_add — a record of something that did not happen.
    await expect(run({ params: {} })).rejects.toMatchObject({ code: 'VALIDATION', status: 400 });
    expect(recordedParams(/INSERT INTO object_actions/)).toBeUndefined();
  });

  it('enforces the length limits the registry entries already declared', async () => {
    await expect(executeAction({
      subjectType: 'project', subjectId: 'p', action: 'watchlist_add',
      actor: 'sam', role: 'operator', params: { note: 'x'.repeat(301) },
    })).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('the intel write path enforces what the read path advertises', () => {
  beforeEach(() => { execute.mockClear(); });

  it('refuses an action the role cannot see', async () => {
    // GET /v1/intel/actions builds its list with actionsFor(); the write path now
    // uses the same function, so it cannot drift from what was offered.
    await expect(run({ role: 'viewer' })).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
    expect(recordedParams(/INSERT INTO object_actions/)).toBeUndefined();
  });

  it('allows an approver everything an operator may do', async () => {
    await expect(run({ role: 'approver' })).resolves.toBeTruthy();
  });

  it('refuses a client-only action with a typed error, not a bare throw', async () => {
    // These used to be `throw new Error('CLIENT_ONLY_ACTION')`, which routes/intel.ts
    // turned into a 500 — telling the caller to retry a payload that can never work.
    await expect(run({ action: 'start_deal' })).rejects.toMatchObject({ code: 'CLIENT_ONLY_ACTION', status: 400 });
  });

  it('refuses an unknown action with 404', async () => {
    await expect(run({ action: 'definitely_not_an_action' })).rejects.toMatchObject({ code: 'UNKNOWN_ACTION', status: 404 });
  });
});
