import { describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import { RELATED_RESOLVERS, isResolvableType, withheldGroup, type ResolveContext } from '../links.js';

/**
 * THE JOIN (S5 of INSTRUMENT_100X_PLAN). What is under test is the compartment CONTRACT of the
 * search-around, not its SQL: a reader who does not hold a compartment gets a WITHHELD group that
 * names it and leaks nothing — not a smaller set of groups that reads as the whole world; a reader
 * who holds it is asked the register; and every inspector type the web can push has a resolver.
 */

function fakePool(rowsFor: (sql: string) => unknown[]) {
  const asked: string[] = [];
  const pool = {
    query: vi.fn(async (sql: string) => { asked.push(sql); return { rows: rowsFor(sql) }; }),
  } as unknown as pg.Pool;
  return { pool, asked };
}
const ctxOf = (held: readonly string[]): ResolveContext => ({ holds: (ws) => held.includes(ws) });
const UUID = '0191abcd-ef01-4345-8789-abcdef012345';

describe('search-around resolvers · compartments', () => {
  it('every resolvable type is one of the union, and the union is covered except claim (no register)', () => {
    const keys = Object.keys(RELATED_RESOLVERS).sort();
    expect(keys).toEqual([
      'asset', 'client', 'contact', 'deal', 'decision', 'document', 'draft', 'engagement', 'handoff',
      'holding', 'jurisdiction', 'listing', 'partner', 'project', 'signal', 'target', 'task',
    ]);
    for (const k of keys) expect(isResolvableType(k)).toBe(true);
    expect(isResolvableType('constructor')).toBe(false);
    expect(isResolvableType('claim')).toBe(false); // no register to search around yet — said, not hidden
  });

  it('a gps object for a reader WITHOUT gps: one withheld group, no query, nothing leaked', async () => {
    const { pool, asked } = fakePool(() => [{ id: 'x', total: 1 }]);
    for (const type of ['engagement', 'client', 'target', 'partner', 'draft', 'jurisdiction'] as const) {
      const out = await RELATED_RESOLVERS[type]!(pool, UUID, ctxOf(['sales']));
      expect(out, type).toHaveLength(1);
      expect(out[0], type).toMatchObject({ withheld: 'gps', count: 0, items: [] });
    }
    expect(asked, 'a register the reader may not see must not even be asked').toEqual([]);
  });

  it('a marketing object for a reader WITHOUT marketing: withheld, unqueried', async () => {
    const { pool, asked } = fakePool(() => [{ id: 'x', total: 1 }]);
    for (const type of ['holding', 'asset'] as const) {
      const out = await RELATED_RESOLVERS[type]!(pool, 'LCX', ctxOf(['gps']));
      expect(out[0], type).toMatchObject({ withheld: 'marketing', count: 0, items: [] });
    }
    expect(asked).toEqual([]);
  });

  it('a sales object for a reader WITHOUT sales is withheld too — the pre-S5 leak is closed', async () => {
    const { pool, asked } = fakePool(() => [{ id: 'x', total: 1 }]);
    const out = await RELATED_RESOLVERS.project!(pool, UUID, ctxOf(['gps']));
    expect(out[0]).toMatchObject({ withheld: 'sales', count: 0, items: [] });
    const viaChild = await RELATED_RESOLVERS.deal!(pool, UUID, ctxOf(['gps']));
    expect(viaChild[0]).toMatchObject({ withheld: 'sales' });
    expect(asked).toEqual([]);
  });

  it('an engagement for a reader WITH gps but WITHOUT sales: the client is a group, the project is a locked line', async () => {
    const { pool } = fakePool((sql) => {
      if (/FROM gps_engagement WHERE id/.test(sql)) return [{ client_id: 'c1', project_id: UUID, partner_id: null }];
      if (/FROM gps_client/.test(sql)) return [{ id: 'c1', name: 'Aster Labs', jurisdiction: 'US', status: 'active', total: 1 }];
      return [];
    });
    const out = await RELATED_RESOLVERS.engagement!(pool, UUID, ctxOf(['gps']));
    const client = out.find((g) => g.key === 'client');
    expect(client).toMatchObject({ inspector: 'client', count: 1 });
    expect(client!.items[0]).toMatchObject({ id: 'c1', label: 'Aster Labs' });
    const project = out.find((g) => g.key === 'project');
    expect(project, 'the sales parent must be SAID as withheld, not dropped').toMatchObject({ withheld: 'sales', count: 0 });
  });

  it('a project for a reader WITH sales and gps reaches its engagements; without gps that group is locked', async () => {
    const rows = (sql: string) => (/FROM gps_engagement/.test(sql) ? [{ id: UUID, offer_key: 'listing_readiness', status: 'accepted', total: 2 }] : []);
    const withGps = await RELATED_RESOLVERS.project!(fakePool(rows).pool, UUID, ctxOf(['sales', 'gps']));
    expect(withGps.find((g) => g.key === 'engagements')).toMatchObject({ inspector: 'engagement', count: 2 });
    const withoutGps = await RELATED_RESOLVERS.project!(fakePool(rows).pool, UUID, ctxOf(['sales']));
    expect(withoutGps.find((g) => g.key === 'engagements')).toMatchObject({ withheld: 'gps', count: 0, items: [] });
  });

  it('withheldGroup leaks nothing by construction', () => {
    expect(withheldGroup('k', 'Label', 'engagement', 'gps')).toEqual({ key: 'k', label: 'Label', inspector: 'engagement', count: 0, items: [], withheld: 'gps' });
  });
});
