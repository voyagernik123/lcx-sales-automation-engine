/**
 * The third fail-open: `hasActivePremortem` (routes/reviews.ts), which the $25k
 * deal gate in routes/deals.ts consumes. Its catch returned `true` — "a premortem
 * is on file" — for ANY error, so a statement timeout let a large deal close out
 * of negotiating with no premortem and nothing in the record saying the check had
 * not actually run.
 *
 * Same discipline as the two registry gates and as access/entitlements.ts:
 * `42P01` is a deploy-order fact and fails open; everything else propagates.
 *
 * NOT ASSERTED HERE: the caller's behaviour. routes/deals.ts:241 calls this inside
 * a try whose catch at :374-377 returns 500 STAGE_ERROR — read, not assumed, so
 * the deal does not advance. That file is outside this change's scope, so there is
 * no test on it here and this file must not be read as covering it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../../db/index.js', () => ({
  getPool: () => ({ query }),
  getDb: () => { throw new Error('getDb is not used by hasActivePremortem'); },
  closeDb: async () => {},
}));

const { hasActivePremortem } = await import('../../routes/reviews.js');

function pgError(code: string, message: string): Error {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

describe('hasActivePremortem', () => {
  beforeEach(() => { query.mockReset(); });

  it('fails open on 42P01 — the reviews table may predate the migration', async () => {
    query.mockRejectedValue(pgError('42P01', 'relation "analytic_reviews" does not exist'));
    await expect(hasActivePremortem('deal-1', 'proj-1')).resolves.toBe(true);
  });

  for (const [code, message] of [
    ['57014', 'canceling statement due to statement timeout'],
    ['42501', 'permission denied for table analytic_reviews'],
    ['40001', 'could not serialize access due to concurrent update'],
    ['ECONNRESET', 'read ECONNRESET'],
  ] as Array<[string, string]>) {
    it(`propagates ${code} rather than claiming a premortem exists`, async () => {
      query.mockRejectedValue(pgError(code, message));
      await expect(hasActivePremortem('deal-1', 'proj-1')).rejects.toThrow(message);
    });
  }

  it('still answers the actual question when the query works', async () => {
    query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    await expect(hasActivePremortem('deal-1', 'proj-1')).resolves.toBe(true);
    query.mockResolvedValue({ rows: [] });
    await expect(hasActivePremortem('deal-1', 'proj-1')).resolves.toBe(false);
  });
});
