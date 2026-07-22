import { describe, expect, it } from 'vitest';
import { extractCitedIds, parseJsonBlock, AI_PROPOSABLE } from '../operator.js';

/** Phase 5 pure helpers — citation extraction + defensive JSON parsing. */
describe('extractCitedIds', () => {
  const A = '11111111-1111-1111-1111-111111111111';
  const B = '22222222-2222-2222-2222-222222222222';

  it('pulls uuids out of [[ ]] citations, de-duped and ordered', () => {
    const text = `Conviction is low [[${A}]] and wash-trading is flagged [[${B}]]; see also [[${A}]].`;
    expect(extractCitedIds(text)).toEqual([A, B]);
  });

  it('ignores malformed or non-uuid brackets', () => {
    expect(extractCitedIds('no citations here')).toEqual([]);
    expect(extractCitedIds('[[not-a-uuid]] [[123]]')).toEqual([]);
  });

  it('is case-insensitive on hex', () => {
    const upper = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA';
    expect(extractCitedIds(`[[${upper}]]`)).toEqual([upper]);
  });
});

describe('parseJsonBlock', () => {
  it('parses a bare JSON object', () => {
    expect(parseJsonBlock<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses JSON inside a ```json fence with prose around it', () => {
    const t = 'Here is the plan:\n```json\n{"proposals":[{"actionId":"create_task"}]}\n```\nDone.';
    expect(parseJsonBlock<{ proposals: unknown[] }>(t)?.proposals).toHaveLength(1);
  });

  it('finds the first array/object when the model adds a preamble', () => {
    expect(parseJsonBlock<number[]>('Sure! [1,2,3]')).toEqual([1, 2, 3]);
  });

  it('returns null on unparseable text (caller falls back deterministically)', () => {
    expect(parseJsonBlock('the model refused')).toBeNull();
    expect(parseJsonBlock('')).toBeNull();
  });
});

describe('AI_PROPOSABLE whitelist', () => {
  it('never includes destructive actions', () => {
    for (const bad of ['watchlist_remove', 'assign']) expect(AI_PROPOSABLE).not.toContain(bad);
    expect(AI_PROPOSABLE).toContain('create_task');
  });
});
