import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * EVERY SURFACE THAT RESOLVES A QUALITY TIER MUST STAMP THE ONE IT RESOLVED.
 *
 * `shared/useQualityTier.ts:94-99` states the contract in as many words: "The app has no capture harness, so
 * the components stamp `data-quality-tier` on their canvas and this is where a debug surface reads the rest."
 * `packages/gl/src/env/quality.ts` is why it matters — a tier that cannot be reported cannot be trusted,
 * because a capture "has to be able to say which tier it shows, or the numbers beside it describe a
 * configuration nobody can reconstruct".
 *
 * ── WHAT WAS ACTUALLY WRONG, WITH THE NUMBER ────────────────────────────────────────────
 * SIX of the eight did it. `brand/ForgeBackdrop.tsx` and `market/GlobeReliefGl.tsx` did not, and had not for
 * the life of the programme. `scripts/3d-audit-app.mjs` reached both of them on the live page — `/select` and
 * `/market-map` — watched each draw, and reported `0 of 1 canvases` for the tier each had drawn at. Those two
 * lines were the only two findings the 2026-08-13 app sweep left open.
 *
 * ── WHY THIS IS DERIVED FROM THE SOURCE AND NOT A LIST OF EIGHT PATHS ───────────────────
 * A hand-written list cannot fail on a surface nobody thought of, and that is precisely how these two were
 * missed: every quality-ladder change was applied to the reliefs somebody remembered. The census below is the
 * predicate instead — a module that builds its own GL context AND asks for a quality tier — so a ninth surface
 * added tomorrow is censused tomorrow, whether or not anyone updates this file.
 *
 * ── COMMENTS ARE STRIPPED, AND HERE THAT IS LOAD-BEARING, NOT A HABIT ───────────────────
 * `components/__tests__/glContextBudget.test.ts:151-170` records this repo's scar: PROSE about a symbol used
 * to count as a use of it, and a census satisfied by documentation is a green test that checks nothing. This
 * file would hit it in BOTH directions on the raw source:
 *   · `ForgeBackdrop.tsx:98` explains in a comment why it "reads `resolveQualityTier()` instead of
 *     `useResolvedQualityTier()`" — a comment-only match would enrol a file for the wrong reason, and would
 *     have enrolled a file that had no call at all had the header outlived the code.
 *   · `SurfaceReliefGl.tsx:316` mentions `useResolvedQualityTier` in prose the same way.
 *   · And the failure that matters: a `canvas.dataset.qualityTier = tier` written inside a comment — which is
 *     how the stamp gets DISCUSSED while being deleted — would pass a raw-source check outright.
 *
 * ── WHAT THIS CANNOT SEE, stated rather than left to be discovered ──────────────────────
 *  · A surface that draws through `sharedRenderer()` instead of building its own context. The predicate is an
 *    AND, so such a surface is out of the census even if it reads a tier. No such surface exists today
 *    (`glContextBudget.test.ts` proves the one shared-renderer call site is `charts/gl/useFlatChart.ts`), and
 *    the day one does, this predicate is the thing to widen.
 *  · Whether the stamp is REACHED. This is a source census; it proves the line exists and assigns the
 *    resolved tier. That the line actually runs on the live page is what `scripts/3d-audit-app.mjs` measures,
 *    and its `tier stamped` column is the half of this claim a static test cannot make.
 */

/* Resolved from `process.cwd()` (apps/web), matching `glContextBudget.test.ts:64`, and asserted to exist
   before it is walked — a source census that silently finds nothing is a green test that checks nothing. */
const SRC = resolve(process.cwd(), 'src');

/** The number of surfaces the app sweep walks. A floor, not an equality — see the assertion's message. */
const KNOWN_SURFACES = 8; // seven after S5 retired E1 DeckReliefGl; eight since P1 of THE PRODUCTION added the shell's stage (2026-09-02)

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

/* The same helper as `glContextBudget.test.ts:171-172`, deliberately spelled the same way: the `[^:]` guard is
   there so a `https://` inside a string is not read as the start of a line comment. */
const withoutComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const CODE = new Map(FILES.map((f) => [f, withoutComments(readFileSync(f, 'utf8'))]));

/** Calls a tier resolver. `useQualityTier.ts` DECLARES both, so it is excluded by the context test below. */
const RESOLVES_TIER = /\b(?:useResolvedQualityTier|resolveQualityTier)\s*\(\s*\)/;
/** Builds its own GL context, i.e. owns a canvas whose tier there is somewhere to stamp. */
const OWNS_CONTEXT = /createStage\s*\(/;

const SURFACES = FILES.filter((f) => RESOLVES_TIER.test(CODE.get(f)!) && OWNS_CONTEXT.test(CODE.get(f)!));

describe('the quality tier every 3-D surface renders at is readable off its canvas', () => {
  it('censuses the surfaces at all', () => {
    expect(existsSync(SRC), `cannot find ${SRC}`).toBe(true);
    expect(FILES.length, 'walked no source files — every assertion below would be vacuous')
      .toBeGreaterThanOrEqual(100);
    /*
     * A FLOOR OF 8, because 8 is what `docs/3d/APP_SWEEP.md` walks and a census that finds fewer has stopped
     * matching the app. It is not an equality: a ninth surface is legitimate growth, and the per-file
     * assertion below already binds it to the same contract on the day it appears.
     */
    expect(SURFACES.length,
      `only ${SURFACES.length} surfaces resolve a tier AND own a context (${SURFACES.map(id).join(', ')});`
      + ` the app sweep walks ${KNOWN_SURFACES}. Either a surface stopped asking for a tier — which means it`
      + ' renders at whatever it hard-codes — or this predicate has stopped matching how they are written.')
      .toBeGreaterThanOrEqual(KNOWN_SURFACES);
    /* The module that DECLARES the resolvers must not be in the census: it owns no canvas, and if it ever
       appeared here the predicate would be matching declarations rather than calls. */
    expect(SURFACES.map(id).some((p) => p.endsWith('shared/useQualityTier.ts')),
      'useQualityTier.ts is being censused as a surface — the predicate is matching its declarations').toBe(false);
  });

  it('every surface that resolves a tier stamps it on its canvas', () => {
    for (const f of SURFACES) {
      const code = CODE.get(f)!;
      /*
       * The RESOLVED tier, not a literal. `canvas.dataset.qualityTier = 'full'` satisfies a presence check
       * and reports a configuration the machine may never have rendered — which is the same defect as not
       * stamping at all, wearing the fix. The six that already did this all assign the `tier` binding, so
       * requiring it costs nothing and closes the hole.
       */
      expect(/\.dataset\.qualityTier\s*=\s*tier\b/.test(code),
        `${id(f)} resolves a quality tier and never stamps it on its canvas. useQualityTier.ts:94-99 says the`
        + ' components stamp data-quality-tier because the app has no capture harness, and env/quality.ts is'
        + ' why: a tier that cannot be reported cannot be trusted. Add `canvas.dataset.qualityTier = tier;`'
        + ' after the frame is presented. ForgeBackdrop.tsx and GlobeReliefGl.tsx failed exactly this and the'
        + ' app sweep reported "0 of 1 canvases" for each.').toBe(true);

      /* And `tier` must be the resolver's answer. A local `const tier = 'full'` would satisfy the line above
         while pinning the surface to one rung of a ladder that exists to have rungs. */
      expect(/\btier\s*=\s*(?:useResolvedQualityTier|resolveQualityTier)\s*\(\s*\)/.test(code),
        `${id(f)} stamps a \`tier\` that is not bound from useResolvedQualityTier()/resolveQualityTier()`)
        .toBe(true);
    }
    /* The loop is over a derived collection, so it proves nothing if the collection is empty. */
    expect(SURFACES.length, 'no surfaces were censused — the loop above asserted nothing')
      .toBeGreaterThanOrEqual(KNOWN_SURFACES);
  });
});
