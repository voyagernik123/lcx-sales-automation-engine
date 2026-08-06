import { describe, expect, it, vi, afterEach } from 'vitest';
import * as compliance from '../compliance';
import { briefSelectionPayload, computeSelectionDigest } from '../compliance';

const SELECTION = {
  template: 'sec',
  signatory: 'Chief Compliance Officer, LCX USA',
  states: ['MT', 'WY', 'TX', 'CA'],
  products: ['CUSTODY', 'LCX_TOKEN'],
};

describe('computeBriefDigest is gone', () => {
  it('no longer exists — it was a djb2 hash printed as sha256_', () => {
    expect('computeBriefDigest' in compliance).toBe(false);
  });
});

describe('briefSelectionPayload', () => {
  it('is stable under click order', () => {
    expect(briefSelectionPayload(SELECTION)).toBe(
      briefSelectionPayload({ ...SELECTION, states: ['CA', 'TX', 'WY', 'MT'] })
    );
  });

  it('carries a version tag so the digest pins a known payload shape', () => {
    expect(briefSelectionPayload(SELECTION).startsWith('lcx-brief-selection/v1\n')).toBe(true);
  });

  it('changes when any selection field changes', () => {
    const base = briefSelectionPayload(SELECTION);
    expect(briefSelectionPayload({ ...SELECTION, template: 'exec' })).not.toBe(base);
    expect(briefSelectionPayload({ ...SELECTION, signatory: 'Someone Else' })).not.toBe(base);
    expect(briefSelectionPayload({ ...SELECTION, states: ['MT'] })).not.toBe(base);
    expect(briefSelectionPayload({ ...SELECTION, products: [] })).not.toBe(base);
  });
});

describe('computeSelectionDigest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /*
   * WHY THIS TEST LOOKS LIKE THIS. The previous version of it was named "is a
   * real SHA-256 — verified against the published vector for 'abc'" and never
   * called computeSelectionDigest at all: it hashed 'abc' with Node's own
   * crypto.subtle and asserted that Node was correct. Every other assertion in
   * this file checked only SHAPE (64 lowercase hex, changes with the selection,
   * no 'bcf1c3' tail). Measured: a djb2-derived fabrication —
   * `for (i=0..7) out += djb2(payload+i).toString(16).padStart(8,'0')` —
   * satisfied all of them, and BriefGenerator's /SHA-256 [0-9a-f]{64}/ regex
   * too. Given that the lane's headline finding WAS a fabricated digest, the
   * replacement was unpinned.
   *
   * So the PAYLOAD → HEX MAPPING itself is pinned, against literals produced
   * independently by node:crypto's createHash('sha256') over
   * briefSelectionPayload(SELECTION). A fabrication cannot satisfy these.
   */
  const SELECTION_HEX = '55deb5e67c6f10cab961a31b51c83b5b0b98a5222b0c2c1514ef0292b7a35d38';
  const MT_ONLY_HEX = '61f1787842172578146a5e80f3f7c1bc3cdbe46f1db4bfa41cfdbd4edccf25a5';

  it('is SHA-256 OF THE PAYLOAD — pinned to an independently computed hex', async () => {
    const result = await computeSelectionDigest(SELECTION);
    expect(result).toMatchObject({ kind: 'digest', algorithm: 'SHA-256' });
    if (result.kind !== 'digest') return;
    expect(result.hex).toBe(SELECTION_HEX);
  });

  it('pins a second payload, so the mapping cannot be one memorised constant', async () => {
    const result = await computeSelectionDigest({ ...SELECTION, states: ['MT'] });
    if (result.kind !== 'digest') throw new Error('expected a digest');
    expect(result.hex).toBe(MT_ONLY_HEX);
  });

  it('hashes exactly what briefSelectionPayload emits and nothing else', async () => {
    // Recomputed here from the payload the module itself produces, through the
    // platform's own SubtleCrypto. If the function ever hashes a different
    // string — a stringified object, an unsorted list, an added timestamp — the
    // two diverge even though both are real SHA-256.
    const payload = briefSelectionPayload(SELECTION);
    const buffer = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(payload)
    );
    const expected = Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    expect(expected).toBe(SELECTION_HEX);
    const result = await computeSelectionDigest(SELECTION);
    if (result.kind !== 'digest') throw new Error('expected a digest');
    expect(result.hex).toBe(expected);
  });

  it('uses the primitive the published vector for "abc" describes', async () => {
    // Kept as a sanity check on the environment's SubtleCrypto, and labelled as
    // such: on its own it proves nothing about this module.
    const buffer = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode('abc')
    );
    const hex = Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    expect(hex).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('produces a 64-hex-character digest that changes with the selection', async () => {
    const a = await computeSelectionDigest(SELECTION);
    const b = await computeSelectionDigest({ ...SELECTION, states: ['MT'] });
    expect(a).toMatchObject({ kind: 'digest', algorithm: 'SHA-256' });
    if (a.kind !== 'digest' || b.kind !== 'digest') return;
    expect(a.hex).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hex).not.toBe(b.hex);
    // Never again a fabricated constant tail.
    expect(a.hex).not.toContain('bcf1c3');
  });

  it('refuses with a code and a rule when SubtleCrypto is unavailable', async () => {
    vi.stubGlobal('crypto', {});
    const result = await computeSelectionDigest(SELECTION);
    expect(result).toMatchObject({ kind: 'unavailable', code: 'DIGEST_NO_WEBCRYPTO' });
    if (result.kind !== 'unavailable') return;
    expect(result.rule).toMatch(/secure origin/);
  });

  it('refuses rather than throwing when the digest call fails', async () => {
    vi.stubGlobal('crypto', {
      subtle: {
        digest: () => Promise.reject(new Error('nope')),
      },
    });
    const result = await computeSelectionDigest(SELECTION);
    expect(result).toMatchObject({ kind: 'unavailable', code: 'DIGEST_FAILED' });
  });
});
