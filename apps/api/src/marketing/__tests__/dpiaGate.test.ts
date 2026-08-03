import { describe, expect, it } from 'vitest';
import { PER_HANDLE_SCORING_DPIA, RECORD_REFUSAL_CODES, scoreHandleOverTime } from '../record.js';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE DPIA GATE, AND THE DIFFERENCE BETWEEN "OFF" AND "FOUND NOTHING".
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  WHAT IS BEING PROTECTED. Per-handle scoring over time — keeping a reputation
 *  score, a "difficult account" flag, or a persisting bot-likelihood about a named
 *  human across their posts — is systematic evaluation of a natural person under
 *  GDPR Art 35(3)(a), and it needs a data protection impact assessment BEFORE it
 *  ships. `scoreHandleOverTime` (`../record.ts`) is built to the point of its own
 *  refusal and stops there. The draft assessment is `DPIA_MARKETING.md` at the
 *  repository root; it is UNSIGNED, and while it is unsigned the capability stays
 *  off.
 *
 *  THE SPECIFIC FAILURE THESE TESTS EXIST TO PREVENT, and it is not "the feature
 *  ships by accident". It is subtler: **a disabled feature that answers `0` is
 *  indistinguishable from a feature that ran and found nothing.** A caller handed
 *  `{ score: 0 }` cannot tell whether the handle is clean or whether the whole
 *  capability is switched off, so it renders "risk 0" either way — a claim the
 *  system is not entitled to make, about a person, on a legal basis nobody has
 *  assessed. So the assertions below are in two halves: the gate is off by
 *  default, AND what comes back when it is off is a refusal carrying a code and a
 *  rule, with no numeric payload anywhere in it.
 *
 *  ══ WHAT THIS FILE DOES NOT VERIFY ══
 *  It does not prove the capability is unreachable from a route — that is a
 *  repository-wide property and lives in `dpiaGateSource.test.ts`. It does not
 *  prove `DPIA_MARKETING.md` says anything in particular; also that file. And it
 *  makes no claim about whether the assessment is correct, which is a human's
 *  judgement and is explicitly unmade.
 */

/** The refusal shape this layer emits. Kept local: the assertions are about keys. */
type Unknown = Record<string, unknown>;

/**
 * The invariant, factored out so it can be pointed at a deliberately-broken result
 * in the last test and shown to have teeth.
 *
 * Three things at once: the call did not succeed, it named WHY with a stable code
 * and a cited rule, and **nothing numeric came back**. The third is the one that
 * matters — a `0`, a `score`, or a `value` would be the ambiguity described above.
 */
function expectRefusedAndNotZero(got: unknown): void {
  expect(got).toBeTypeOf('object');
  const r = got as Unknown;
  expect(r.ok).toBe(false);
  expect(r.code).toBe('RECORD_DPIA_ABSENT');
  expect(r.rule).toBe('GDPR Art 35(3)(a)');
  expect(typeof r.ruleText).toBe('string');
  expect(typeof r.sentence).toBe('string');
  expect(typeof r.remedy).toBe('string');

  // No successful payload smuggled alongside the refusal.
  expect('value' in r).toBe(false);
  expect('score' in r).toBe(false);
  expect('band' in r).toBe(false);

  // And no numeric field at all, under any name. This is the "answers 0" guard:
  // it fires on `score: 0`, on `risk: 0`, and on anything else numeric someone
  // adds later while believing a zero is harmless.
  for (const [key, v] of Object.entries(r)) {
    expect(typeof v, `refusal field ${key} must not be numeric`).not.toBe('number');
  }
}

describe('per-handle scoring is OFF by default', () => {
  it('refuses when called with no options at all', () => {
    expectRefusedAndNotZero(scoreHandleOverTime('lcxfan'));
  });

  it('refuses for every shape of absent reference, so nothing opens it by accident', () => {
    // Each of these is a way a caller ends up with "no DPIA" without meaning to:
    // an empty object, an unset field, a null from JSON, a whitespace-only form
    // value, and a tab-and-newline that `.trim()` must catch.
    const absent: Array<{ dpiaRef?: string | null }> = [
      {},
      { dpiaRef: undefined },
      { dpiaRef: null },
      { dpiaRef: '' },
      { dpiaRef: '   ' },
      { dpiaRef: '\t\n ' },
    ];
    for (const opts of absent) {
      expectRefusedAndNotZero(scoreHandleOverTime('lcxfan', opts));
    }
  });

  it('refuses identically whether or not a handle was even supplied', () => {
    // The gate must not become reachable by varying the subject. A blank handle is
    // still a refusal about the DPIA, not a refusal about the handle — otherwise
    // "off" would depend on the input, which is not what off means.
    expectRefusedAndNotZero(scoreHandleOverTime(''));
    expectRefusedAndNotZero(scoreHandleOverTime('  '));
    expectRefusedAndNotZero(scoreHandleOverTime('someone_who_replied_once'));
  });
});

describe('the refusal says why it is off, and cannot be mistaken for an empty result', () => {
  it('uses a DPIA code, not the register-empty code', () => {
    // `RECORD_REGISTER_EMPTY` is the house code for "we looked and held nothing".
    // If the gate used that, a caller would read "no history for this handle" from
    // a capability that never ran. The two must stay distinct codes.
    const got = scoreHandleOverTime('lcxfan') as Unknown;
    expect(got.code).not.toBe('RECORD_REGISTER_EMPTY');
    expect(RECORD_REFUSAL_CODES).toContain('RECORD_DPIA_ABSENT');
    expect(RECORD_REFUSAL_CODES).toContain('RECORD_REGISTER_EMPTY');
  });

  it('cites Art 35(3)(a) and quotes the obligation rather than paraphrasing it', () => {
    const got = scoreHandleOverTime('lcxfan') as Unknown;
    expect(got.rule).toBe('GDPR Art 35(3)(a)');
    expect(String(got.ruleText)).toMatch(/data protection impact assessment/i);
    expect(String(got.ruleText)).toMatch(/systematic and extensive evaluation/i);
  });

  it('tells the caller what to do instead, naming the DPIA as the precondition', () => {
    const got = scoreHandleOverTime('lcxfan') as Unknown;
    expect(String(got.remedy)).toMatch(/DPIA/);
    // The remedy must point at the alternative that stays lawful: judge the
    // message, not the person. Without that sentence the refusal is a dead end and
    // the next engineer routes around it.
    expect(String(got.sentence) + String(got.remedy)).toMatch(/not the person|per-handle/i);
  });
});

describe('the gate cannot reach a query, and never invents a reference', () => {
  it('is synchronous — the result is not a promise', () => {
    // Deliberate design property in `record.ts`: I/O-free and synchronous, so it is
    // impossible to reach the database through this function. A thenable result
    // would mean someone made it async, which is the first step to it doing I/O.
    const got = scoreHandleOverTime('lcxfan') as Unknown;
    expect(typeof got.then).toBe('undefined');
  });

  it('echoes the caller\'s reference exactly, or refuses — it never supplies one', () => {
    // Two legal outcomes and no third. The signed-constant design in
    // DPIA_MARKETING.md §11.2 is now the shipped one, so TODAY this takes the refusing
    // branch — `PER_HANDLE_SCORING_DPIA` is null and no reference matches it (pinned in
    // the describe below). Both branches stay asserted here on purpose: this test's
    // invariant is the one that must survive a human SETTING the constant, and it is
    // that the system never fabricates or defaults a DPIA reference — it echoes the
    // caller's exactly, or it refuses.
    const got = scoreHandleOverTime('lcxfan', { dpiaRef: '  DPIA-UNIT-TEST-NOT-A-REAL-REFERENCE  ' }) as Unknown;
    if (got.ok === true) {
      expect((got.value as Unknown).dpiaRef).toBe('DPIA-UNIT-TEST-NOT-A-REAL-REFERENCE');
    } else {
      expectRefusedAndNotZero(got);
    }
  });
});

/**
 * ══ THE GATE IS CLOSED BY CONSTRUCTION, NOT BY EVERYONE PASSING NOTHING ══
 *
 * `PER_HANDLE_SCORING_DPIA` (`record.ts`) is the named constant DPIA_MARKETING.md §11.2 asks
 * for, and it is `null`. Before it existed the gate refused only an EMPTY reference, so any
 * non-empty string opened it — item N7 in that document — and "is scoring on?" was not a
 * question anyone could answer without reading every caller.
 *
 * These assertions are about the CONSTANT, not about the strings. Revert `record.ts` to the
 * `ref === ''` check and every one of them fails, because each string below is non-empty.
 */
describe('no string opens the gate while the DPIA constant is null', () => {
  it('is null, and that is the whole state of the capability', () => {
    expect(
      PER_HANDLE_SCORING_DPIA,
      'PER_HANDLE_SCORING_DPIA is set. That asserts a SIGNED DPIA exists under '
      + 'DPIA_MARKETING.md §12 and that this is its reference — and it makes the Art 15 note '
      + 'in subjectAccess false, which must be rewritten in the same commit (§11.2).',
    ).toBeNull();
  });

  it('refuses an invented reference, which is what N7 let through', () => {
    for (const ref of [
      'DPIA-2026-001',
      'yes',
      'see attached',
      'DPIA_MARKETING.md',
      // The one most likely to be tried, because it is the document's own name plus a status.
      'DPIA_MARKETING.md DRAFT_UNSIGNED',
    ]) {
      expectRefusedAndNotZero(scoreHandleOverTime('lcxfan', { dpiaRef: ref }));
    }
  });

  it('refuses a reference that differs only in case or whitespace from a plausible id', () => {
    // Trimming happens before the comparison, so these are about EQUALITY rather than about
    // sloppiness: with the constant null there is nothing to be equal to.
    for (const ref of ['  DPIA-2026-001  ', 'dpia-2026-001', 'DPIA 2026 001']) {
      expectRefusedAndNotZero(scoreHandleOverTime('lcxfan', { dpiaRef: ref }));
    }
  });

  it('never reports the constant\'s value in the refusal, so the gate is not an oracle', () => {
    // If a human sets it later, the refusal for a WRONG reference must not leak the right
    // one — otherwise the gate hands out the credential it exists to check.
    const got = scoreHandleOverTime('lcxfan', { dpiaRef: 'DPIA-2026-001' }) as Unknown;
    const text = JSON.stringify(got);
    expect(text).not.toContain('PER_HANDLE_SCORING_DPIA');
    // Vacuity guard: the refusal is a real object with prose in it, not an empty shell that
    // trivially contains nothing.
    expect(text.length).toBeGreaterThan(200);
  });
});

describe('the assertion above has teeth', () => {
  it('rejects a result that silently returns an empty score', () => {
    // The exact failure this file exists to catch, fed in by hand. If
    // `expectRefusedAndNotZero` ever stops throwing on these, the tests above
    // become decoration.
    expect(() => expectRefusedAndNotZero({ ok: true, value: { score: 0 } })).toThrow();
    expect(() => expectRefusedAndNotZero({ ok: false, code: 'RECORD_DPIA_ABSENT', rule: 'GDPR Art 35(3)(a)', ruleText: 'x', sentence: 'x', remedy: 'x', score: 0 })).toThrow();
    expect(() => expectRefusedAndNotZero({ ok: false, code: 'RECORD_REGISTER_EMPTY' })).toThrow();
    expect(() => expectRefusedAndNotZero(undefined)).toThrow();
  });
});
