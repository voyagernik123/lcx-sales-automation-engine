import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * DEBUG INSTRUMENTS MUST NOT SURVIVE INTO A COMMITTED SPEC.
 *
 * `framebudget.spec.ts` failed five consecutive CI runs because a `beforeEach`
 * applying `Emulation.setCPUThrottlingRate` at rate 30 — added by hand to
 * reproduce a slow runner, labelled "TEMP PROBE" — was committed along with an
 * unrelated rebrand. Every number the failure produced was the probe:
 * per-element cost read 3.6ms against a 0.5ms budget (0.12ms once divided by
 * the throttle), and the idle control dropped 31 of 37 frames, which pushed it
 * past its own `test.skip` guard and silently disabled the comparison the
 * throttle had been added to study.
 *
 * It failed for five runs rather than one because the spec still *ran*, still
 * reported a plausible number, and the number was wrong in the believable
 * direction. Nothing distinguishes "the app got slow" from "I left a throttle
 * in" by reading the output — only by reading the spec. Hence a ratchet: this
 * is a property of the source, so it is checked in the source, in the fast unit
 * suite that runs before anything reaches CI.
 *
 * These are all CDP/Playwright knobs that alter the machine the test measures.
 * Any of them may be used in a local run; none may be committed.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const E2E_DIR = resolve(HERE, '../../../e2e');

/** Each entry: the API, and what a reader would wrongly conclude from it. */
const FORBIDDEN: Array<{ pattern: RegExp; why: string }> = [
  {
    pattern: /setCPUThrottlingRate/,
    why: 'CPU throttling makes every timing assertion measure the throttle',
  },
  {
    pattern: /emulateNetworkConditions|setNetworkConditions/,
    why: 'network emulation makes latency assertions measure the emulator',
  },
  {
    pattern: /\.setDefaultTimeout\(\s*0\s*\)/,
    why: 'a zero timeout turns a hang into an indefinite wait, not a failure',
  },
  {
    pattern: /\btest\.only\b|\bdescribe\.only\b|\bit\.only\b/,
    why: 'a committed .only silently reduces the suite to one test and reports green',
  },
];

describe('committed e2e specs contain no measurement-altering instruments', () => {
  const specs = readdirSync(E2E_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.(spec|test)\.ts$/.test(e.name))
    .map((e) => e.name);

  it('finds the e2e specs at all — an empty sweep would pass vacuously', () => {
    // The exact failure mode this whole file exists to prevent: a check that
    // cannot fail because it is looking at nothing.
    expect(specs.length).toBeGreaterThan(3);
    expect(specs).toContain('framebudget.spec.ts');
  });

  for (const { pattern, why } of FORBIDDEN) {
    it(`no spec uses ${String(pattern)} — ${why}`, () => {
      const hits: string[] = [];
      for (const name of specs) {
        // Comments stripped first: this file's own explanation names the API,
        // and framebudget.spec.ts documents the incident in its header. A
        // ratchet that trips on its own post-mortem gets deleted, not obeyed.
        const code = readFileSync(resolve(E2E_DIR, name), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');
        if (pattern.test(code)) hits.push(name);
      }
      expect(
        hits,
        `${why}. Use it while debugging locally, never in a commit: ${hits.join(', ')}`,
      ).toEqual([]);
    });
  }

  it('the frame-budget spec measures an unthrottled page', () => {
    // Named directly, not just covered by the sweep above, because this is the
    // spec that actually broke and the one whose numbers are quoted as evidence
    // that the Phase 5 "frame budget held" claim is true.
    const src = readFileSync(resolve(E2E_DIR, 'framebudget.spec.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toContain('CPUThrottling');
    expect(src).not.toContain('newCDPSession');
  });
});
