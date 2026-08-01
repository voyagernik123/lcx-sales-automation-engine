import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { TARGET_FACTOR_KEYS } from '@lcx/shared';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE ONE JSONB COLUMN GPS ADDS MAY HOLD SIX NUMBERS, AND NOTHING ELSE.
 * ══════════════════════════════════════════════════════════════════════════════
 *  `intakeLockout.test.ts` proves by CONTENT that no GPS table can hold a client
 *  document: no bytea, no large object, no url/mime/filename column. It is blind to
 *  exactly one shape — jsonb — which is why the set of jsonb columns on GPS tables is
 *  frozen and every addition has to be reviewed.
 *
 *  Reviewing `gps_outcome.factor_scores_at_quote` (0053_gps_outcome.sql) found that
 *  its only writer, `factorScoreMap`, closed the VALUES and left the KEYS wide open:
 *  any key name, any length, any quantity. A payload in the keys survived a round
 *  trip, because the read side (`gps/loop.ts:244` `factorScores`) filters values and
 *  not keys, and `calibration.ts:732` republishes `Object.keys(...)` as
 *  `observedKeys`. A write channel plus a read channel is a document store with extra
 *  steps.
 *
 *  0053 already CLAIMED the bound — "keyed by the six literal factor names in
 *  TARGET_FACTOR_KEYS and nothing else". These tests are what make the claim true.
 *
 *  The validator is exported and tested DIRECTLY, the way `app.ts`'s `requiresOperate`
 *  is: it is a pure function, and reaching it over HTTP needs a migrated database and
 *  an operator — fixtures that would make this ratchet fragile enough to get deleted.
 *  `loop.test.ts` covers the route wiring; this covers the rule.
 */

vi.mock('../../db/index.js', () => ({
  getPool: () => ({
    query: async () => {
      throw new Error('factorScoreMap is pure — nothing here may reach the database');
    },
  }),
  getDb: () => {
    throw new Error('getDb is not used by the GPS loop');
  },
  closeDb: async () => {},
  checkDb: async () => ({ ok: true }),
}));

const { factorScoreMap } = await import('../../routes/gpsLoop.js');

describe('factorScoresAtQuote is bounded to the scorer keys', () => {
  it('is wired to the real scorer key list, not a copy', () => {
    // Non-vacuity. If TARGET_FACTOR_KEYS were empty every rejection below would pass
    // for free, and a local copy of the six names could drift from the scorer.
    expect(TARGET_FACTOR_KEYS.length).toBe(6);
    const allSix = Object.fromEntries(TARGET_FACTOR_KEYS.map((k) => [k, 5]));
    expect(factorScoreMap(allSix)).toEqual(allSix);
  });

  it('accepts each of the six factor keys on its own', () => {
    for (const k of TARGET_FACTOR_KEYS) {
      expect(factorScoreMap({ [k]: 7 }), `${k} is a real factor and must be accepted`).toEqual({ [k]: 7 });
    }
  });

  it('refuses a key the scorer does not have', () => {
    // The audit case: a payload riding in the KEY names. Base64 is the shape that
    // matters, because a base64 value was already refused and a base64 key was not.
    for (const key of [
      'aGVsbG8gd29ybGQhIHRoaXMgaXMgYSBjbGllbnQgZG9jdW1lbnQ=',
      'mystery',
      'client_filing.pdf',
      '__proto__',
      'need ',
      'NEED',
      '',
    ]) {
      expect(
        factorScoreMap({ [key]: 1 }),
        `key ${JSON.stringify(key)} is not in TARGET_FACTOR_KEYS and must refuse the request`,
      ).toBe(false);
    }
  });

  it('refuses the whole object when one key is unrecognised, not just that key', () => {
    // Dropping the bad key and keeping the good ones would store a partial score and
    // report success — and would leave the channel open at one key per call.
    const first = TARGET_FACTOR_KEYS[0]!;
    expect(factorScoreMap({ [first]: 9, smuggled: 1 })).toBe(false);
  });

  it('caps the payload at six numbers, so there is no room for a document', () => {
    const wide = Object.fromEntries(
      Array.from({ length: 400 }, (_, i) => [`chunk${i}`, i]),
    );
    expect(factorScoreMap(wide)).toBe(false);
    const accepted = factorScoreMap(Object.fromEntries(TARGET_FACTOR_KEYS.map((k) => [k, 1])));
    expect(Object.keys(accepted as Record<string, number>)).toHaveLength(6);
  });

  it('still refuses every non-numeric value, which was already true', () => {
    const k = TARGET_FACTOR_KEYS[0]!;
    for (const bad of ['5', 'SGVsbG8=', null, undefined, {}, [], true, NaN, Infinity, -Infinity]) {
      expect(factorScoreMap({ [k]: bad }), `value ${String(bad)} must refuse`).toBe(false);
    }
  });

  it('keeps absent meaning absent', () => {
    // NULL is "this engagement predates scoring", which weightReviewPacket counts as
    // absent evidence rather than as a zero. It must not become `{}`.
    expect(factorScoreMap(undefined)).toBeNull();
    expect(factorScoreMap(null)).toBeNull();
  });

  it('refuses a non-object, so an array of scores cannot become one', () => {
    for (const bad of [[1, 2, 3], 'need=5', 5, true]) {
      expect(factorScoreMap(bad)).toBe(false);
    }
  });

  it('the 400 the route answers with names the permitted keys', () => {
    // A refusal that does not say what is allowed sends the operator to read the
    // source. The message is built from TARGET_FACTOR_KEYS so it cannot go stale.
    const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const code = readFileSync(resolve(SRC, 'routes/gpsLoop.ts'), 'utf8');
    const at = code.indexOf('factorScoresAtQuote must be');
    expect(at, 'the validation message has been renamed').toBeGreaterThan(-1);
    expect(code.slice(at, at + 400)).toContain('TARGET_FACTOR_KEYS.join');
  });
});
