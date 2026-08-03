import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  THE DPIA GATE AS A REPOSITORY INVARIANT, NOT AS A CODE COMMENT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  `dpiaGate.test.ts` proves the function refuses. That is not enough on its own:
 *  a refusing function is one keyword argument away from being called, and the
 *  decision "per-handle scoring is not enabled" previously existed only inside a
 *  docblock and inside a report nobody re-reads. This file moves it somewhere that
 *  fails a build.
 *
 *  THREE INVARIANTS, AND THEY ARE COUPLED IN BOTH DIRECTIONS.
 *
 *   1. **Unreachable.** No shipped source file — anywhere in `apps/api/src`,
 *      `apps/web/src`, or `packages/shared/src` — calls `scoreHandleOverTime` or
 *      supplies a `dpiaRef`. The capability exists and nothing can reach it. The
 *      day somebody wires it into a route, this test goes red and the reviewer is
 *      pointed at `DPIA_MARKETING.md`.
 *
 *   2. **The assessment is a draft, and cannot be laundered into an approval.**
 *      `DPIA_MARKETING.md` carries a single machine-read status line. While it
 *      reads `DRAFT_UNSIGNED`, the unsigned banner and the blank sign-off must
 *      still be there — so the status cannot be edited to look approved by
 *      deleting the word DRAFT, and the banner cannot be deleted while the status
 *      still says draft.
 *
 *   3. **Draft implies OFF; signed implies the flag and the Art 15 note were both
 *      changed.** While the document is an unsigned draft, `record.ts` must carry
 *      no enabled scoring flag. If the document is ever marked otherwise, this
 *      test then DEMANDS the two code edits that must accompany it — the flag, and
 *      the subject-access note at `record.ts:1795` that currently tells every data
 *      subject "nothing in this compartment scores, ranks or profiles a handle
 *      over time". That sentence becomes false on the day the flag moves, and an
 *      untrue Art 15 answer is worse than none.
 *
 *  ══ WHAT THIS FILE DOES NOT VERIFY ══
 *  These are source-level and document-level assertions, the same technique and
 *  the same caveat as `queueDataMinimisation.test.ts`: they read text, they do not
 *  execute a route, and they cannot prove a running deployment behaves this way.
 *  They also make NO claim that the assessment in `DPIA_MARKETING.md` is adequate,
 *  correct, or sufficient — that is a human judgement and it has not been made.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));

const RECORD_SRC = readFileSync(join(HERE, '..', 'record.ts'), 'utf8');
const DPIA_PATH = join(REPO, 'DPIA_MARKETING.md');
const DPIA = readFileSync(DPIA_PATH, 'utf8');

/** Shipped source only: no test files, no build output, no dependencies. */
function shippedSources(): string[] {
  const roots = [
    join(REPO, 'apps', 'api', 'src'),
    join(REPO, 'apps', 'web', 'src'),
    join(REPO, 'packages', 'shared', 'src'),
  ];
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(?:ts|tsx)$/.test(entry)) continue;
      if (/\.test\.tsx?$/.test(entry) || /\.d\.ts$/.test(entry)) continue;
      out.push(full);
    }
  };
  for (const r of roots) walk(r);
  return out;
}

/**
 * `record.ts` with comment lines stripped. The docblocks in that file quote the
 * capability's own name repeatedly while explaining why it refuses, and an
 * assertion scanning raw text would fire on the explanation instead of on a
 * regression. The invariant is about code that executes.
 */
function stripComments(src: string): string {
  return src
    .split('\n')
    .filter((line) => !/^\s*(?:\*|\/\/|\/\*)/.test(line))
    .join('\n');
}

/**
 * The two §12.2 fields that make a signature a signature. Each anchors to the
 * backticked placeholder IMMEDIATELY after its label, not to "a run of underscores
 * somewhere on the line" — the sign-off lines also carry a blank `Date:` field, and
 * a looser pattern stays satisfied by that date while the name has been filled in.
 */
const BLANK_REVIEWER = /Reviewed by \(name, role\):\s*`_{6,}`/;
const BLANK_REFERENCE = /DPIA reference id assigned:[^\n`]{0,4}\s*`_{6,}`/;

/** The machine-read status line in §12.2, or null when it is missing. */
function dpiaStatus(): string | null {
  const m = /^\s*DPIA_STATUS:\s*([A-Z_]+)\s*$/m.exec(DPIA);
  return m ? m[1] : null;
}

/**
 * Is a per-handle scoring flag present in `record.ts` AND set to something other
 * than `null`? Absent counts as OFF: today the gate is a reference check with no
 * named constant behind it (DPIA_MARKETING.md §11, item N7).
 */
function scoringFlag(): { present: boolean; enabled: boolean } {
  const m = /PER_HANDLE_SCORING_DPIA\s*(?::[^=\n]*)?=\s*([^;\n]+)/.exec(stripComments(RECORD_SRC));
  if (!m) return { present: false, enabled: false };
  return { present: true, enabled: m[1].trim() !== 'null' };
}

describe('per-handle scoring is unreachable from any shipped code path', () => {
  const files = shippedSources();

  it('walks a real, non-empty set of source files', () => {
    // Guards the guard. A typo in the roots above would make every assertion
    // below pass over zero files.
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((f) => f.endsWith(join('marketing', 'record.ts')))).toBe(true);
  });

  it('is called by nothing outside its own definition', () => {
    const callers = files
      .filter((f) => !f.endsWith(join('marketing', 'record.ts')))
      .filter((f) => /\bscoreHandleOverTime\b/.test(stripComments(readFileSync(f, 'utf8'))));
    expect(
      callers.map((f) => f.slice(REPO.length)),
      'per-handle scoring gained a call site; DPIA_MARKETING.md must be signed first',
    ).toEqual([]);
  });

  it('has no shipped code supplying a DPIA reference', () => {
    // The other way in: not calling the function, but passing the argument that
    // opens it — from a route handler, a config object, or an env read.
    const suppliers = files
      .filter((f) => !f.endsWith(join('marketing', 'record.ts')))
      .filter((f) => /\bdpiaRef\b/.test(stripComments(readFileSync(f, 'utf8'))));
    expect(suppliers.map((f) => f.slice(REPO.length))).toEqual([]);
  });

  it('would actually notice a call site — the scan and its exclusions have teeth', () => {
    // `record.test.ts` legitimately calls the gate and passes `dpiaRef`. It is the
    // only positive sample available without adding a call site, and it proves two
    // things at once: the matchers do match, and the test-file exclusion is what
    // keeps the two assertions above green rather than the matchers silently
    // failing to match anything.
    const known = join(HERE, 'record.test.ts');
    const code = stripComments(readFileSync(known, 'utf8'));
    expect(/\bscoreHandleOverTime\b/.test(code)).toBe(true);
    expect(/\bdpiaRef\b/.test(code)).toBe(true);
    expect(files).not.toContain(known);
  });

  it('keeps the gate itself free of I/O, so it cannot reach the register', () => {
    // Bounded by the next top-level export rather than by a neighbouring comment,
    // so an unrelated edit elsewhere in `record.ts` cannot silently widen the slice
    // into other functions and turn this into an assertion about the whole file.
    const start = RECORD_SRC.indexOf('export function scoreHandleOverTime');
    expect(start, 'scoreHandleOverTime has been renamed or removed').toBeGreaterThan(-1);
    const after = RECORD_SRC.indexOf('\nexport ', start + 1);
    expect(after, 'no export follows the gate — the slice bound is gone').toBeGreaterThan(start);
    const body = RECORD_SRC.slice(start, after);
    expect(body.length).toBeGreaterThan(100);
    expect(body.length).toBeLessThan(3000);
    expect(body).not.toMatch(/\bawait\b/);
    expect(body).not.toMatch(/pool\.query/);
    expect(body).not.toMatch(/\basync\b/);
  });
});

describe('DPIA_MARKETING.md is a draft and cannot be laundered into an approval', () => {
  it('exists and carries exactly one machine-read status line', () => {
    expect(DPIA.length).toBeGreaterThan(2000);
    expect(DPIA.match(/^\s*DPIA_STATUS:/gm)?.length).toBe(1);
    expect(dpiaStatus()).not.toBeNull();
  });

  it('is marked DRAFT_UNSIGNED today', () => {
    expect(dpiaStatus()).toBe('DRAFT_UNSIGNED');
  });

  it('keeps the unsigned banner and the blank sign-off while the status says draft', () => {
    if (dpiaStatus() !== 'DRAFT_UNSIGNED') return;
    expect(DPIA).toMatch(/DRAFT PREPARED FOR REVIEW/);
    expect(DPIA).toMatch(/UNSIGNED/);
    expect(DPIA).toMatch(/has not been reviewed, accepted, or signed/i);
    expect(DPIA).toMatch(/not legal advice/i);
    // The sign-off blanks must still be blank. A filled-in name under a DRAFT
    // status is the ambiguous middle state this refuses to allow.
    expect(DPIA).toMatch(BLANK_REVIEWER);
    expect(DPIA).toMatch(BLANK_REFERENCE);
  });

  it('contains none of the sentences that would make it read as approved', () => {
    // A literal list rather than a clever pattern, because the document
    // legitimately discusses signature as a future condition ("before this DPIA is
    // signed", "until this document is signed") and a pattern broad enough to
    // catch a false claim also catches those. Each string below is what a
    // hollowing-out edit actually writes.
    const forbidden = [
      'DPIA_STATUS: SIGNED',
      'DPIA_STATUS: APPROVED',
      'DPIA_STATUS: COMPLETE',
      'this DPIA is complete',
      'this DPIA is approved',
      'this DPIA has been approved',
      'this DPIA has been signed',
      'this assessment is complete',
      'this assessment has been approved',
      'the DPIA is on file',
      'a DPIA is on file',
    ];
    for (const phrase of forbidden) {
      expect(DPIA.toLowerCase(), `DPIA_MARKETING.md must not say "${phrase}"`)
        .not.toContain(phrase.toLowerCase());
    }
  });

  it('states the things a reviewer cannot review without', () => {
    // Each of these is a finding the document exists to carry. Deleting any one of
    // them turns the assessment into a formality.
    expect(DPIA, 'lawful basis').toMatch(/Art 6\(1\)\(f\)/);
    expect(DPIA, 'the missing LIA').toMatch(/NO LEGITIMATE-INTERESTS ASSESSMENT ON FILE/i);
    expect(DPIA, 'the Art 35 trigger').toMatch(/Art 35\(3\)\(a\)/);
    expect(DPIA, 'the refusal code, so a grep from code lands here').toMatch(/RECORD_DPIA_ABSENT/);
    expect(DPIA, 'the third-country transfer').toMatch(/third[- ]country transfer/i);
    expect(DPIA, 'the model provider path').toMatch(/llm\.ts/);
    expect(DPIA, 'the retention collision').toMatch(/RETENTION_DPO_RULING_OUTSTANDING/);
    expect(DPIA, 'the data subject in question').toMatch(/replied to (?:an LCX post|a tweet)/i);
    expect(DPIA, 'mitigations that exist').toMatch(/Mitigations actually implemented/i);
    expect(DPIA, 'mitigations that do not').toMatch(/Mitigations NOT implemented/);
    expect(DPIA, 'residual risk').toMatch(/Residual risk/);
    expect(DPIA, 'what a human must decide').toMatch(/Open questions only a human can answer/i);
  });
});

describe('draft implies OFF; a signed document demands the code catch up', () => {
  const ART_15_NO_PROFILING_NOTE = /Nothing in this compartment scores, ranks or profiles a handle over time/;

  it('has no enabled scoring flag while the assessment is an unsigned draft', () => {
    if (dpiaStatus() !== 'DRAFT_UNSIGNED') return;
    expect(
      scoringFlag().enabled,
      'PER_HANDLE_SCORING_DPIA is set while DPIA_MARKETING.md is still an unsigned draft',
    ).toBe(false);
  });

  it('still tells Art 15 requesters that nothing profiles them, which is true while it is off', () => {
    if (scoringFlag().enabled) return;
    expect(RECORD_SRC).toMatch(ART_15_NO_PROFILING_NOTE);
  });

  it('requires the flag and the rewritten Art 15 note once the status is no longer a draft', () => {
    if (dpiaStatus() === 'DRAFT_UNSIGNED') return;
    // Reached only after a human changes the status line. At that point the two
    // code edits named in DPIA_MARKETING.md §11.2 are mandatory, and the blanks in
    // §12.2 must have been filled in.
    expect(scoringFlag().present, 'set PER_HANDLE_SCORING_DPIA in record.ts (§11.2)').toBe(true);
    expect(DPIA, 'fill in the reviewer name in §12.2').not.toMatch(BLANK_REVIEWER);
    expect(DPIA, 'assign a DPIA reference id in §12.2').not.toMatch(BLANK_REFERENCE);
    if (scoringFlag().enabled) {
      expect(
        RECORD_SRC,
        'rewrite the Art 15 note at record.ts:1795 — it claims nothing profiles a handle over time',
      ).not.toMatch(ART_15_NO_PROFILING_NOTE);
    }
  });
});
