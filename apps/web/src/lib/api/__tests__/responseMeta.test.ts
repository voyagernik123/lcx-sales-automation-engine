import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { attachMeta, isMigrated, responseMeta, unwrapWithMeta } from '../meta';

/**
 * `meta` USED TO DIE IN THE FETCH LAYER, IN EIGHT MODULES.
 *
 * Every GPS API module declared its own copy of
 * `const unwrap = <T>(p) => p.then((r) => r.data)`, so `meta` arrived over the wire
 * and was discarded before any component could read it. Three things travel there and
 * nowhere else: `migrated` (the difference between "no rows" and "no table"),
 * `provenance` (the D1 trail), and the delivery `schemaGaps` ledger that says which
 * values on the acceptance table are SUBSTITUTED rather than recorded.
 *
 * These tests pin both halves: the mechanism, and the fact that no module has quietly
 * gone back to its own copy.
 */

describe('the response envelope carries meta to the browser', () => {
  it('a fetcher can read migrated: false off the value it resolved', async () => {
    const value = await unwrapWithMeta(
      Promise.resolve({ data: [] as unknown[], meta: { migrated: false, version: '1.2.3' } }),
    );
    // Before the fix this expectation was unreachable: `meta` never left `unwrap`.
    expect(responseMeta(value)?.migrated).toBe(false);
    expect(isMigrated(value)).toBe(false);
    expect(responseMeta(value)?.version).toBe('1.2.3');
  });

  it('distinguishes "the server said false" from "the server said nothing"', async () => {
    const silent = await unwrapWithMeta(Promise.resolve({ data: {}, meta: { version: '1' } }));
    // undefined, NOT false. Rendering a migration banner because a read carried no
    // flag would be inventing the fact this whole module exists to preserve.
    expect(isMigrated(silent)).toBeUndefined();
    const denied = await unwrapWithMeta(Promise.resolve({ data: {}, meta: { migrated: false } }));
    expect(isMigrated(denied)).toBe(false);
  });

  it('changes nothing about the payload — not spreads, not JSON, not key order', () => {
    const data = { rows: [1, 2], total: 2 };
    const out = attachMeta(data, { migrated: true, secretish: 'x' });
    expect(Object.keys(out)).toEqual(['rows', 'total']);
    expect(JSON.stringify(out)).toBe('{"rows":[1,2],"total":2}');
    expect({ ...out }).toEqual({ rows: [1, 2], total: 2 });
    // The symbol survives on the object itself, which is what the page reads.
    expect(responseMeta(out)?.migrated).toBe(true);
  });

  it('cannot collide with a payload that has its own meta field', () => {
    const out = attachMeta({ meta: 'the payload said this' }, { migrated: true });
    expect((out as { meta: string }).meta).toBe('the payload said this');
    expect(responseMeta(out)?.migrated).toBe(true);
  });

  it('returns primitives, null and meta-less envelopes untouched rather than throwing', async () => {
    expect(attachMeta(null, { migrated: true })).toBeNull();
    expect(attachMeta(7, { migrated: true })).toBe(7);
    expect(responseMeta(null)).toBeUndefined();
    expect(responseMeta(7)).toBeUndefined();
    expect(responseMeta('x')).toBeUndefined();
    const noMeta = await unwrapWithMeta(Promise.resolve({ data: { a: 1 } }));
    expect(noMeta).toEqual({ a: 1 });
    expect(responseMeta(noMeta)).toBeUndefined();
  });

  it('survives being attached twice — a cached result handed back does not throw', () => {
    const data = { a: 1 };
    attachMeta(data, { migrated: true });
    expect(() => attachMeta(data, { migrated: false })).not.toThrow();
    expect(responseMeta(data)?.migrated).toBe(false);
  });

  /**
   * THE RATCHET. The defect was not one bad line, it was the same bad line copied
   * eight times — so the guard is "nobody has a private copy", not "this module is
   * correct".
   */
  it('no api module declares its own meta-dropping unwrap', () => {
    const dir = join(__dirname, '..');
    const offenders: string[] = [];
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.ts') || f === 'meta.ts') continue;
      const src = readFileSync(join(dir, f), 'utf8');
      // The exact shape that dropped it: an unwrap whose body reads only `.data`.
      if (/const\s+unwrap\s*=\s*<T>\s*\([^)]*\)\s*:[^=]*=>\s*p\.then\(\(r\)\s*=>\s*r\.data\)/.test(src)) {
        offenders.push(f);
      }
    }
    expect(
      offenders,
      `these modules re-declared a meta-dropping unwrap; import unwrapWithMeta from './meta.js' instead`,
    ).toEqual([]);
  });
});
