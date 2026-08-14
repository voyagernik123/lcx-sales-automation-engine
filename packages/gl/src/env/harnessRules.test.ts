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
        readme: existsSync(join(DOCS, d, 'README.md'))
          ? readFileSync(join(DOCS, d, 'README.md'), 'utf8') : '',
        /*
         * THE BUILT BUNDLE, because rule 2 was being checked against the wrong bytes. Grepping
         * `entry.ts` for `requestAnimationFrame` cannot see a scheduler inside an imported module, and
         * two environments import one: E5 pulls in `@/components/geometry/SurfacePlot` and
         * `react-dom/server`. What actually ships is the bundle, so that is what is read.
         */
        bundle: existsSync(join(DOCS, d, 'bundle.js'))
          ? readFileSync(join(DOCS, d, 'bundle.js'), 'utf8') : null,
      }))
  : [];
const environments = ALL.filter((e) => e.captured);

describe('§6 rules, ratcheted across every docs/3d/e* environment', () => {
  it('finds environments to check at all', () => {
    /* A glob that silently matches nothing is a green test that checks nothing — the failure mode this
       whole file exists to prevent, reproduced inside the file itself. */
    /*
     * NINE, NOT SIX. The floor was set when six existed and was never raised, so three environments'
     * captures could have been deleted with the suite still green — a ratchet that stops ratcheting is
     * a ratchet nobody notices has stopped. It is a FLOOR rather than an equality so that adding E9's
     * successor does not fail the gate for existing.
     */
    expect(environments.length, `no captured environments found under ${DOCS}`).toBeGreaterThanOrEqual(9);
  });

  /*
   * ── RULE 5 IS TWO TESTS NOW, BECAUSE THE OLD ONE ENFORCED A CHECK THAT CANNOT FAIL ────────────
   *
   * This block was a single test titled "every environment runs assertBrandFidelity and acts on the
   * result", written against §6 rule 5's original wording: "Brand hex exact. `assertBrandFidelity`
   * runs on every new material." Measured 2026-08-14, that rule was false AND unfalsifiable.
   * `assertBrandFidelity` compares `linearToHex(hexToLinear(BRAND_HEX[k]))` with `BRAND_HEX[k]` — a
   * frozen table round-tripping through two pure functions — so no edit to the composite, the tone
   * curve, TONE_SHOULDER, the sRGB encode or any shader can move its result. Perturbing
   * TONE_SHOULDER from 0.4 to 0.45 leaves all 15 assertions in `look/look.test.ts` green while
   * `look/brandPixel.test.ts` fails on real GPU bytes. This ratchet was demanding that nine
   * harnesses each install a guard that could not fire, and reporting that as rule 5 enforced.
   *
   * So the requirement is SPLIT rather than dropped, because the two halves catch different things:
   *
   *   · the CALL is still required (below). It is a consistency check on the constants table and a
   *     mistyped hex in `BRAND_HEX` is a real defect. Narrow, but real, and cheap to keep.
   *   · and a second test forbids what actually went wrong — nine harnesses PUBLISHING a guarantee
   *     nothing established. A guard that cannot fail is survivable. A guard that cannot fail while a
   *     document beside it claims the guarantee is how "brand hex exact" was believed for months.
   */
  it('rule 5 — every environment still runs assertBrandFidelity and branches on it', () => {
    /* NON-EMPTY BEFORE THE LOOP. `environments` is a filtered glob; an empty one makes every
       assertion below vaporise and the test green, which is the failure this whole file exists to
       prevent. The floor test above checks the same thing; this is local so a reordering cannot
       silently separate them. */
    expect(environments.length, 'no captured environments — the loop below checks nothing')
      .toBeGreaterThan(0);
    for (const { id, src } of environments) {
      expect(src, `${id} does not import assertBrandFidelity`).toContain('assertBrandFidelity');
      expect(src, `${id} imports assertBrandFidelity but never calls it`).toMatch(/assertBrandFidelity\(\)/);
      /* Calling it and ignoring the result is the same as not calling it. The harness must branch on
         the failure list, not merely put it in a report a reader may not open. What this can catch is
         narrow and stated: a corrupted `BRAND_HEX` table. Not a pipeline change. */
      expect(src, `${id} calls assertBrandFidelity but never branches on the failures`)
        .toMatch(/brandFailures\.length\s*>\s*0/);
    }
  });

  it('rule 5 — no environment asserts hex exactness without the measurement that refutes it', () => {
    /*
     * DERIVED, NOT ENUMERATED. A hand-list of the seventeen sentences that were wrong could not fail
     * on the eighteenth, which is exactly how they accumulated. So the shape of the claim is what is
     * matched: a BRAND token within one clause of an EXACTNESS token, in the source or the README —
     * the two places an environment speaks to a maintainer and to a reader.
     *
     * The rule is not "never mention it". Refuting the old claim REQUIRES quoting it, and the
     * historical record is house style. The rule is that a hex-exactness sentence must sit next to
     * the measurement: `docs/3d/brand-fidelity.json`, the measured pixel `#2c68dc`, a ΔE figure, or
     * `brandPixel.test.ts`. An uncited claim is precisely the defect — every one of the seventeen
     * original sites had zero measurement anywhere near it.
     *
     * WINDOW: 1600 characters either side of the match, which is about one comment block in these
     * files. A fixed number rather than a parse, because splitting TypeScript into comment blocks and
     * string literals correctly is a bigger machine than the check deserves, and being generous here
     * only ever lets a claim through — it never invents a failure.
     */
    const BRAND = /brand|hex|palette|#2c6bff/i;
    const EXACT = /\bexact\b|\bexactly\b|\bexactness\b|\bsurvives?\b|\bunchanged\b|\bpreserv/i;
    const CITED = /brand-fidelity\.json|#2c68dc|ΔE|brandPixel\.test/i;
    /* Both orders, because "brand hex exact" and "exact, whole palette" both shipped. The clause is
       bounded by sentence punctuation so a claim cannot be paired with an exactness word four
       sentences away and counted as a match. */
    const CLAIM = new RegExp(
      `(?:${BRAND.source})[^.;\\n]{0,160}?(?:${EXACT.source})`
      + `|(?:${EXACT.source})[^.;\\n]{0,160}?(?:${BRAND.source})`,
      'gi',
    );

    let claimsSeen = 0;
    const offenders = new Set<string>();
    for (const { id, src, readme } of environments) {
      for (const text of [src, readme]) {
        for (const m of text.matchAll(CLAIM)) {
          claimsSeen++;
          const at = m.index;
          const window = text.slice(Math.max(0, at - 1600), at + m[0].length + 1600);
          if (!CITED.test(window)) offenders.add(id);
        }
      }
    }
    /* THE PATTERN MUST BITE. If a future refactor renames the palette or rewords every block, this
       loop finds nothing and the assertion below passes on an empty set — green, and checking
       nothing. 31 claim sites were found across nine environments when this was written. */
    expect(claimsSeen, 'the claim pattern matched nothing in any environment — it has stopped '
      + 'describing how this repo writes about brand fidelity, and is no longer a check')
      .toBeGreaterThan(10);

    /*
     * THE RECORDED SET, in the idiom the rule 4 ratchet above already uses: a NEW offender fails, and
     * so does fixing one of these without updating the string, which is what forces the record to
     * stay true.
     *
     * E3 and E7 are open, deliberately. `docs/3d/e3/entry.ts:1598` still heads its guard "§6 RULE 5 —
     * BRAND HEX EXACT, AND IT DIES RATHER THAN WARNS", and `docs/3d/e7/entry.ts:1443` reads "§6 rule
     * 5 — brand hex exact"; e7:1479 additionally documented its report field as "every brand hex
     * round-tripped exactly through this frame's own pipeline". Both files were owned by another track
     * when this test was written — recording them as a failing-by-name set rather than quietly widening
     * the pattern was the only version of this that stayed honest.
     *
     * CLOSED TO EMPTY, 2026-08-15. Both now carry the measured refutation beside the claim, and
     * scripts/3d-audit.mjs no longer reports the palette-table check as a fidelity verdict. Empty here
     * is the GOAL STATE rather than an inert test: the anti-vacuity guard above proves the pattern still
     * matches how this repo writes about brand fidelity — 31 claim sites today — so empty means clean,
     * not blind. A new name appearing is a fresh unenforceable claim.
     */
    expect([...offenders].sort().join(','),
      'the set of environments claiming hex exactness with no measurement beside it changed. A NEW '
      + 'name here is a fresh unenforceable claim; a MISSING name means one was fixed and this '
      + 'record needs updating')
      .toBe('');
  });

  it('rule 1 — every environment installs a flat fallback and captures its refusal', () => {
    /*
     * The rule is "every environment has a flat fallback that is NOT a downgrade in INFORMATION", and
     * all six were failing it: a refusal resolved to a title and one log line. Three things are checked,
     * because the first two are satisfiable without the fallback ever being seen:
     *
     *   · it is INSTALLED — and before the stage, since a shader compile failure happens during module
     *     evaluation and anything built afterwards never runs on the failure it exists for;
     *   · it is REVEALED only after a frame exists, via markRendered, so success leaves it in the
     *     accessibility tree and the print path rather than deleting it;
     *   · there is a CAPTURE of the refusal. Rule 8 admits no exceptions, and this was the one claim in
     *     the programme that had never been photographed — because you cannot switch off WebGL from
     *     inside the page, which is what `?refuse=1` exists for.
     */
    for (const { id, src } of environments) {
      expect(src, `${id} installs no flat fallback (§6 rule 1)`).toContain('installFlatFallback');
      expect(src, `${id} never reveals or hides its fallback — markRendered is missing`)
        .toContain('markRendered');
      const install = src.indexOf('installFlatFallback(');
      const stage = src.indexOf('createStage(');
      expect(install >= 0 && stage >= 0 && install < stage,
        `${id} installs its fallback AFTER createStage, so a shader failure never builds it`).toBe(true);
      expect(existsSync(join(DOCS, id, 'refused.png')),
        `${id} has no refused.png — rule 1's claim is uncaptured, and rule 8 admits no exceptions`).toBe(true);
    }
  });

  it('rule 2 — no environment schedules idle animation, in its source OR its bundle', () => {
    for (const { id, src, bundle } of environments) {
      for (const banned of ['requestAnimationFrame', 'setInterval']) {
        expect(src.includes(banned), `${id} uses ${banned}: §6 rule 2 forbids idle animation`).toBe(false);
        /* An imported module's scheduler ships just as surely as a written one. Verified to be zero in
           all nine bundles today, so this is a ratchet rather than a discovery. */
        if (bundle !== null) {
          expect(bundle.includes(banned),
            `${id}'s BUNDLE contains ${banned} — something it imports schedules idle animation`).toBe(false);
        }
      }
    }
  });

  it('rule 7 — one shared GL context per environment', () => {
    /*
     * §6 rule 7: "Sixty contexts will exhaust an 8 GB M1." The rule was enforced for `flat/shared.ts`
     * and asserted nowhere for the environments, which each construct their own stage. One canvas and
     * one `createStage` per harness is what makes "one context" true, and both are cheap to check.
     */
    for (const { id, src } of environments) {
      const stages = [...src.matchAll(/createStage\(/g)].length;
      expect(stages, `${id} calls createStage ${stages} times — §6 rule 7 allows one context`).toBe(1);
      const canvases = [...src.matchAll(/createElement\((?:'|")canvas(?:'|")\)/g)].length;
      expect(canvases, `${id} creates ${canvases} canvases in script as well as the one in its page`)
        .toBe(0);
    }
  });

  it('rule 4 — the only environment with no projected DOM content is the one with nothing to say', () => {
    /*
     * §6 rule 4 — "text stays in the DOM, projected from the same matrix" — had no check at all, and it
     * was the rule with a LIVE violation. This assertion read `'e0,e2'` for as long as that was true.
     *
     * E2's IS NOW FIXED, so the ratchet is tightened to `'e0'`. What was wrong was never baked text: E2's
     * `LIT_FRAG` has no texture sampler at all, so there was nothing to unbake — `docs/3d/e2/build.mjs`
     * emitted no overlay, and twelve sited cities and seven corridors therefore carried no words in any
     * accessibility tree, print or selection. `docs/3d/e2/entry.ts` now projects them through
     * `projectScreen` from the frame's own matrix, hides the ones behind the limb, fades the ones near it,
     * and names every site it does not label in DOM prose under the frame.
     *
     * WHY THIS IS STILL A CEILING AND NOT "EVERY ENVIRONMENT PROJECTS". E0 does not, and that is not a
     * defect: it is the frame-budget spike and has no text to project in the first place. No grep can tell
     * "has nothing to say" apart from "should be saying it", so asserting universal projection would fail
     * the gate for E0 having nothing to say, and asserting a README waiver would fail it for E0 not
     * carrying a sentence about text it does not have.
     *
     * A tenth environment that bakes its labels fails here, and so does a regression in E2 — this is the
     * assertion that would catch either.
     */
    const withoutProjection = environments
      .filter((e) => !/projectQuad|projectScreen/.test(e.src))
      .map((e) => e.id);
    expect(withoutProjection.sort().join(','),
      'the set of environments with no projected DOM content changed — a NEW one is a §6 rule 4 '
      + 'regression, and E2 reappearing here means its DOM label layer was removed')
      .toBe('e0');
    /*
     * E2 IS NAMED SEPARATELY, because it is the one environment whose violation was recorded as debt and
     * therefore the one whose fix a reader will come looking for. `find` is asserted to have found it
     * rather than guarded with an `if`: a guard would make both assertions below vanish silently the day
     * e2's capture is deleted, which is the shape of the empty-loop failure this file exists to prevent.
     */
    const e2 = environments.find((e) => e.id === 'e2');
    expect(e2, 'e2 is not among the captured environments, so the two assertions below check nothing')
      .toBeDefined();
    expect(e2!.src, 'e2 no longer projects DOM labels — the rule 4 violation the ratchet above recorded '
      + 'has come back').toMatch(/projectScreen|projectQuad/);
    expect(e2!.readme, 'e2 no longer records what its rule 4 violation was or how it was closed')
      .toMatch(/rule 4/);
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
