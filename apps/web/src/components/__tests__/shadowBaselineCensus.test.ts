import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * EVERY COMPONENT THAT OWNS A TIER-SCALED SHADOW MAP MUST TELL THE LIT PASS WHAT SIZE ITS BIAS WAS TUNED AT.
 *
 * `lit.ts:686-691` states the contract: `shadowBaseline` is "the shadow-map size this scene's bias was tuned
 * at — i.e. the baseline you hand `shadowMapSizeFor`, NOT the size the tier resolved to", and omitting it
 * means "the tier then renders a coarser map with a bias tuned for a finer one, which is hard speckle at one
 * tap". `lit.ts:837-839` is the arithmetic: `scale = baseline / shadow.size`, defaulting to 1.
 *
 * ── WHAT WAS ACTUALLY WRONG, WITH THE NUMBER ────────────────────────────────────────────
 * The §10.6 bias fix reached SEVEN of EIGHT. `geometry/DeckReliefGl.tsx` was missed, and the reason was the
 * NAME: the other seven declare `SHADOW_BASELINE`, that file declares `SHADOW_SIZE` (`DeckReliefGl.tsx:124`),
 * and the eight were enumerated by hand. It owns the LARGEST shadow map in the app — baseline 1536, against
 * 1024 everywhere else — so `shadowMapSizeFor('minimum', 1536)` resolves 512 and the bias needed
 * `1536 / 512 = 3.0`. It got 1.0: a third of the bias its geometry requires. And `minimum` is the rung that
 * takes `shadowTaps: 1` (`quality.ts:142`), where there is no 3x3 average to smear the residual acne into a
 * dither — so it is hard binary speckle, on the machines least able to hide it.
 *
 * ── WHY THE PREDICATE IS DERIVED, AND WHY IT IGNORES NAMES ──────────────────────────────
 * A hand-written list of eight cannot fail on the ninth, and cannot fail on the one whose constant somebody
 * spelled differently — which is precisely how the largest map in the app missed the fix. So:
 *
 *   · the census is "calls `createShadowMap(`", not a list of paths;
 *   · the expected baseline is READ OUT OF each file's own `shadowMapSizeFor(tier, X)` call, so `SHADOW_SIZE`,
 *     `SHADOW_BASELINE` and a bare `1536` are all equally acceptable. The test is about the ARGUMENT being
 *     passed, not about what it is called. Naming was the trap; re-encoding a name would rebuild it;
 *   · a file whose `createShadowMap` calls this test cannot PARSE fails loudly (see the arithmetic in the
 *     first case) rather than dropping out of the census, which is the silent-exemption failure mode.
 *
 * ── COMMENTS ARE STRIPPED, AND HERE THAT IS LOAD-BEARING ────────────────────────────────
 * `glContextBudget.test.ts:151-170` records this repo's scar: PROSE about a symbol counted as a use of it.
 * This file would hit it in both directions on raw source — `lit.ts`'s contract is quoted in component
 * headers, and `ForgeBackdrop.tsx:158-162` discusses `shadowMapSizeFor` versus the tier's absolute
 * `shadowMapSize` in a comment directly above the call. A `shadowBaseline:` line commented OUT — which is how
 * a uniform gets disabled while staying visible in review — would pass a raw-source check outright.
 *
 * ── WHAT THIS CANNOT SEE, stated rather than left to be discovered ──────────────────────
 *  · Whether the options object carrying `shadowBaseline` is actually handed to `lit.draw`. It requires the
 *    object to carry `lightVP` too, which `LitRenderer.draw` requires and nothing else in these files uses,
 *    so the property is in lit-draw options shape — either the draw's own literal or the object spread into it
 *    (`GlobeReliefGl.tsx:513-524` is the spread case). An object of the right shape that is then dropped on
 *    the floor would still pass. That is a static limit; the frame is what `docs/3d` captures measure.
 *  · Whether the resolved bias is CORRECT for the scene. This proves the baseline is declared and consistent
 *    with the size request, which is the defect that shipped; the tuning itself is a capture question.
 */

/* Resolved from `process.cwd()` (apps/web), matching `qualityTierStamp.test.ts:49`, and asserted to exist
   before it is walked — a source census that silently finds nothing is a green test that checks nothing. */
const SRC = resolve(process.cwd(), 'src');

/** The eight shadow-owning components the app sweep walks. A FLOOR, not an equality — see the message. */
const KNOWN_OWNERS = 8;

function walk(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    if (entry === 'node_modules') continue;
    const full = join(root, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = existsSync(SRC)
  ? walk(SRC).filter((f) => !f.includes('__tests__') && !/\.test\.tsx?$/.test(f))
  : [];
const id = (f: string) => relative(SRC, f);

/* The same helper as `qualityTierStamp.test.ts:71-72` and `glContextBudget.test.ts:171-172`, spelled the same
   way deliberately: the `[^:]` guard stops a `https://` inside a string being read as a line comment. */
const withoutComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const CODE = new Map(FILES.map((f) => [f, withoutComments(readFileSync(f, 'utf8'))]));

/**
 * Owns a shadow map, therefore owns a bias that a tier can invalidate. NOT global: `RegExp.test` on a /g
 * pattern advances `lastIndex` and the next call resumes mid-file, so a shared /g predicate answers
 * differently per file and drops files out of a census by POSITION rather than by property.
 */
const OWNS_SHADOW = /createShadowMap\s*\(/;
/** The same pattern, global, for counting the calls in one file. */
const OWNS_SHADOW_ALL = /createShadowMap\s*\(/g;
/**
 * The TIER-SCALED form, with the baseline captured. Namespaced calls count: `ForgeBackdrop` imports the
 * package as `gl3` and writes `gl3.shadowMapSizeFor(tier, SHADOW_BASELINE)`.
 */
const SCALED_SHADOW =
  /createShadowMap\s*\(\s*[^,()]+,\s*(?:[A-Za-z_$][\w$]*\s*\.\s*)?shadowMapSizeFor\s*\(\s*[^,()]+,\s*([^,()]+?)\s*\)\s*\)/g;
/** A FIXED size, i.e. one the tier does not shrink: `baseline / actual` is 1 and no declaration is owed. */
const FIXED_SHADOW = /createShadowMap\s*\(\s*[^,()]+,\s*(\d+)\s*\)/g;
/** The property under test. Any value — identifier, member expression or literal. */
const BASELINE_PROP = /\bshadowBaseline\s*:\s*([^,}\n]+)/g;

const OWNERS = FILES.filter((f) => OWNS_SHADOW.test(CODE.get(f)!));

const matchAllOf = (re: RegExp, code: string): string[] => {
  re.lastIndex = 0;
  return [...code.matchAll(re)].map((m) => m[1]!.trim());
};
const countOf = (re: RegExp, code: string): number => {
  re.lastIndex = 0;
  return [...code.matchAll(re)].length;
};

/**
 * The innermost `{ ... }` block containing `index`, or null. Used to establish that a `shadowBaseline:`
 * property sits in an options object of lit-draw shape rather than anywhere in the file.
 */
function enclosingObject(code: string, index: number): string | null {
  let depth = 0;
  let start = -1;
  for (let p = index; p >= 0; p--) {
    const c = code[p];
    if (c === '}') depth++;
    else if (c === '{') {
      if (depth === 0) { start = p; break; }
      depth--;
    }
  }
  if (start < 0) return null;
  depth = 0;
  for (let p = start; p < code.length; p++) {
    const c = code[p];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return code.slice(start, p + 1);
    }
  }
  return null;
}

interface BaselineUse { readonly value: string; readonly inLitOptions: boolean; }

function baselineUses(code: string): BaselineUse[] {
  BASELINE_PROP.lastIndex = 0;
  return [...code.matchAll(BASELINE_PROP)].map((m) => {
    const obj = enclosingObject(code, m.index!);
    return {
      value: m[1]!.trim(),
      /* `lightVP` is required by `LitRenderer.draw` (`lit.ts:675`) and appears in no other options object in
         these files, so its presence identifies the block as lit-draw options. */
      inLitOptions: obj !== null && /\blightVP\b/.test(obj),
    };
  });
}

describe('the shadow bias baseline is declared by every component that owns a shadow map', () => {
  it('censuses the shadow owners at all, and can read every one of their createShadowMap calls', () => {
    expect(existsSync(SRC), `cannot find ${SRC}`).toBe(true);
    expect(FILES.length, 'walked no source files — every assertion below would be vacuous')
      .toBeGreaterThanOrEqual(100);
    /*
     * A FLOOR OF 8: eight components own a shadow map today. Not an equality — a ninth is legitimate growth,
     * and the loop below binds it to the same contract the day it appears. Fewer means the predicate has
     * stopped matching how these files are written, which is the failure that silently exempts everything.
     */
    expect(OWNERS.length,
      `only ${OWNERS.length} components call createShadowMap( (${OWNERS.map(id).join(', ')}); ${KNOWN_OWNERS}`
      + ' own a shadow map today. Either a surface dropped its shadow map or this predicate has stopped'
      + ' matching, and a census that matches nothing is a green test that checks nothing.')
      .toBeGreaterThanOrEqual(KNOWN_OWNERS);

    /* EVERY CALL MUST BE READABLE BY ONE OF THE TWO FORMS. A third spelling — a size from a helper, a
       ternary, a variable — would otherwise leave the file in the census with zero derived baselines and
       zero assertions made about it, which is exactly the silent pass this file exists to prevent. */
    for (const f of OWNERS) {
      const code = CODE.get(f)!;
      const total = countOf(OWNS_SHADOW_ALL, code);
      const scaled = matchAllOf(SCALED_SHADOW, code);
      const fixed = matchAllOf(FIXED_SHADOW, code);
      expect(scaled.length + fixed.length,
        `${id(f)} makes ${total} createShadowMap call(s) and this test could only read`
        + ` ${scaled.length + fixed.length} of them (${scaled.length} tier-scaled, ${fixed.length} fixed).`
        + ' An unreadable call is an unchecked bias: widen SCALED_SHADOW/FIXED_SHADOW to match the new'
        + ' spelling rather than leaving the file silently exempt.').toBe(total);
    }
  });

  it('every tier-scaled shadow map passes ITS OWN baseline to the lit draw, whatever it is called', () => {
    const scaledOwners = OWNERS.filter((f) => matchAllOf(SCALED_SHADOW, CODE.get(f)!).length > 0);
    /* Asserted before the loop: if `shadowMapSizeFor` were ever renamed, this loop would iterate nothing and
       report success on eight unchecked components. */
    expect(scaledOwners.length,
      `${scaledOwners.length} of ${OWNERS.length} shadow owners scale their map by tier; all eight do today.`
      + ' A zero here means SCALED_SHADOW no longer matches, not that the app stopped scaling.')
      .toBeGreaterThanOrEqual(KNOWN_OWNERS);

    for (const f of scaledOwners) {
      const code = CODE.get(f)!;
      const baselines = [...new Set(matchAllOf(SCALED_SHADOW, code))];
      const uses = baselineUses(code);

      for (const baseline of baselines) {
        const declared = uses.filter((u) => u.value === baseline);
        expect(declared.length > 0,
          `${id(f)} sizes its shadow map with shadowMapSizeFor(tier, ${baseline}) and never passes`
          + ` shadowBaseline: ${baseline} to its lit draw. lit.ts:686-691: the bias scales by baseline/actual,`
          + ' so without it the tier renders a coarser map with a bias tuned for a finer one — at'
          + ' shadowTaps 1 that is hard binary speckle, not a softened edge. DeckReliefGl.tsx shipped'
          + ' exactly this: baseline 1536, 512 at the minimum tier, a third of the bias it needs.').toBe(true);
        expect(declared.some((u) => u.inLitOptions),
          `${id(f)} declares shadowBaseline: ${baseline} somewhere that is not lit-draw options (no lightVP in`
          + ' the enclosing object). The uniform is only read by LitRenderer.draw, so a baseline declared'
          + ' anywhere else scales nothing.').toBe(true);
      }

      /* THE CONVERSE, because the naming trap runs both ways: a file copied from a sibling can pass a
         baseline that is not the one it sized with, and `1536 / 1024` is a bias 1.5x off rather than absent —
         which is harder to see than speckle and just as wrong. */
      for (const u of uses) {
        expect(baselines.includes(u.value),
          `${id(f)} passes shadowBaseline: ${u.value} but sizes its shadow map with baseline(s)`
          + ` ${baselines.join(' / ')}. lit.ts wants the baseline the SIZE was requested at; any other value`
          + ' scales the bias by the wrong ratio.').toBe(true);
      }
    }
  });
});
