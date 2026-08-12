import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/*
 * THE RATCHET FOR §6, APPLIED TO THE ENVIRONMENTS THEMSELVES.
 *
 * Every rule in §6 is described as a scar, and every one of them was nonetheless broken across all six
 * environments at once — found by an audit, not by the gate. A rule that only a reviewer can enforce is
 * a rule that gets broken the next time nobody reviews.
 *
 * The tests below are deliberately STRUCTURAL rather than semantic: they cannot tell whether an
 * environment carries information, but they can tell whether it called the brand check, whether it
 * timed itself with the instrument this repo has twice written down, and whether it animates when the
 * rules forbid it. Those are exactly the three that went wrong silently.
 *
 * AND THEY PARSE RATHER THAN ENUMERATE. The directory is globbed, so an environment added tomorrow is
 * checked tomorrow — "a hand-listed enumeration cannot fail on a member nobody thought of" is the whole
 * reason the earlier gaps survived six environments.
 */
const DOCS = resolve(__dirname, '../../../../docs/3d');

/*
 * AN ENVIRONMENT IS CHECKED ONCE IT HAS MADE A CLAIM, and a capture is what makes one.
 *
 * A directory mid-construction has an `entry.ts` and nothing else; holding it to the finished rules
 * fails the gate for work that has not asserted anything yet. But the moment a `live.png` exists, the
 * environment has published a picture — §6 rule 8 makes a capture the unit of a claim — and everything
 * §6 requires applies to it.
 *
 * The converse is asserted separately below: a capture without a README is a claim with no verdict, and
 * that is a failure rather than an exemption.
 */
const ALL = existsSync(DOCS)
  ? readdirSync(DOCS)
      .filter((d) => /^e\d+$/.test(d) && existsSync(join(DOCS, d, 'entry.ts')))
      .sort()
      .map((d) => ({
        id: d,
        src: readFileSync(join(DOCS, d, 'entry.ts'), 'utf8'),
        captured: existsSync(join(DOCS, d, 'live.png')),
        hasReadme: existsSync(join(DOCS, d, 'README.md')),
      }))
  : [];
const environments = ALL.filter((e) => e.captured);

describe('§6 rules, ratcheted across every docs/3d/e* environment', () => {
  it('finds environments to check at all', () => {
    /* A glob that silently matches nothing is a green test that checks nothing — the failure mode this
       whole file exists to prevent, reproduced inside the file itself. */
    expect(environments.length, `no captured environments found under ${DOCS}`).toBeGreaterThanOrEqual(6);
  });

  it('rule 5 — every environment runs assertBrandFidelity and acts on the result', () => {
    for (const { id, src } of environments) {
      expect(src, `${id} does not import assertBrandFidelity`).toContain('assertBrandFidelity');
      expect(src, `${id} imports assertBrandFidelity but never calls it`).toMatch(/assertBrandFidelity\(\)/);
      /* Calling it and ignoring the result is the same as not calling it. The harness must branch on
         the failure list, not merely put it in a report a reader may not open. */
      expect(src, `${id} calls assertBrandFidelity but never branches on the failures`)
        .toMatch(/brandFailures\.length\s*>\s*0/);
    }
  });

  it('rule 2 — no environment schedules idle animation', () => {
    for (const { id, src } of environments) {
      for (const banned of ['requestAnimationFrame', 'setInterval']) {
        expect(src.includes(banned), `${id} uses ${banned}: §6 rule 2 forbids idle animation`).toBe(false);
      }
    }
  });

  it('times itself with the trailing-readPixels instrument, never bare gl.finish()', () => {
    /*
     * THE ONE THAT COST THE MOST. E5 and E6 measured with `gl.finish()` over a 4-frame batch and
     * published 0.45 ms and 0.425 ms for shadow-mapped, AO'd frames under a CPU rasteriser. The real
     * figures were 63.7 and 60.3 — factors of 140 — because gl.finish() returns on command-buffer
     * FLUSH, not on GPU completion. A pixel read cannot be satisfied until the frame exists, which is
     * what makes the clock mean anything.
     */
    for (const { id, src } of environments) {
      const timed = /performance\.now\(\)/.test(src);
      if (!timed) continue;
      expect(src, `${id} times a frame without forcing completion — add the trailing readPixels`)
        .toMatch(/readPixels/);
      /* gl.finish() is allowed to appear, but not as the ONLY barrier around the clock. Flag the
         specific shape that was wrong: finish() immediately before reading performance.now(). */
      expect(
        /gl\.finish\(\);\s*(\r?\n)\s*ms\s*=/.test(src),
        `${id} reads the clock straight after gl.finish() — that measures the flush, not the frame`,
      ).toBe(false);
    }
  });

  it('refuses a 60 Hz headroom figure when the renderer is a software rasteriser', () => {
    for (const { id, src } of environments) {
      if (!/headroom/.test(src)) continue;
      expect(src, `${id} reports headroom without detecting a software rasteriser`)
        .toMatch(/swiftshader|llvmpipe|SOFTWARE/i);
    }
  });

  it('clips any DOM overlay to the canvas box', () => {
    /* A surface seen nearly edge-on yields a homography with enormous coefficients; without
       overflow:hidden the element's transformed box runs to millions of pixels and Playwright fails
       with "Unable to capture screenshot", naming the screenshot rather than the transform. */
    for (const { id, src } of environments) {
      if (!/position:relative/.test(src)) continue;
      expect(src, `${id} builds a DOM overlay without overflow:hidden on the wrapper`)
        .toMatch(/overflow:hidden/);
    }
  });

  it('ships no GLSL comments — a minifier cannot see inside a string', () => {
    /* 13.6 KB of the engine was comment bytes inside shader literals, and E8 is live on the sign-in
       route. Harnesses are not shipped, but they are the template every environment is copied from, so
       the habit is what is being ratcheted here rather than the bytes. */
    for (const { id, src } of environments) {
      const lits = [...src.matchAll(/`([^`]*)`/g)]
        .map((m) => m[1]!)
        .filter((l) => /#version|precision\s+highp|uniform\s+(vec|mat|float|sampler)/.test(l));
      const bytes = lits.reduce(
        (n, l) => n + [...l.matchAll(/\/\*[\s\S]*?\*\//g)].reduce((a, m) => a + m[0].length, 0)
          + [...l.matchAll(/\/\/[^\n]*/g)].reduce((a, m) => a + m[0].length, 0),
        0,
      );
      expect(bytes, `${id} ships ${bytes} bytes of GLSL comment inside a template literal`).toBe(0);
    }
  });

  it('a capture without a README is a claim with no verdict', () => {
    /* The converse of the skip above. An environment that has published a picture has made a claim, and
       a claim needs a verdict a reader can find. E1 also DERIVES its rendered panel content from these
       first lines, so an unparseable one puts a refusal on another environment's frame. */
    for (const e of ALL) {
      if (!e.captured) continue;
      expect(e.hasReadme, `${e.id} has a capture but no README`).toBe(true);
    }
  });

  it('every environment has a README whose first line states a verdict', () => {
    for (const { id } of environments) {
      const rd = join(DOCS, id, 'README.md');
      expect(existsSync(rd), `${id} has no README`).toBe(true);
      const first = readFileSync(rd, 'utf8').split('\n')[0]!;
      /* E1 derives its rendered panel content from these lines, so an unparseable first line is not a
         documentation problem — it puts a refusal on another environment's frame. */
      expect(first, `${id} README first line is not a parseable verdict: ${first}`)
        .toMatch(/^#\s*E\d+\s*·\s*[^—]+—/);
    }
  });
});
