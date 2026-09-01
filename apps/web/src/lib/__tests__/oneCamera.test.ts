import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * THE ONE-CAMERA RATCHET — S3 of INSTRUMENT_100X_PLAN.md, made mechanical.
 *
 * S0 measured zero of 79 route commits attempting a view transition: every navigation in the
 * app was a hard cut. The browser ships the camera as a primitive, and react-router 6.30
 * carries a `viewTransition` option from every <Link> and navigate() into the data router,
 * where RouterProvider performs the `startViewTransition` with correct commit timing. S3 wraps
 * the router's `navigate` ONCE so the option defaults on — and this file makes that permanent:
 *
 *   · the wrap exists at the router seam and defaults the option from the reduced-motion
 *     preference (read at call time, never cached — `lib/motion.ts`), passing `history.go(n)`
 *     through untouched;
 *   · the stylesheet declares the transition's duration for the root, and switches it OFF under
 *     `prefers-reduced-motion` — continuity is a courtesy, not a requirement, and the OS setting
 *     is the operator's word;
 *   · the inspector drawer names itself so opening it is a morph, not a cut, and the first
 *     row→page pair (pipeline row → lead heading) shares one name;
 *   · no component reaches for `document.startViewTransition` directly — one camera, one seam.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l)).join('\n');

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (!/__tests__|e2e|node_modules/.test(n)) walk(p, out); }
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.|\.spec\./.test(n)) out.push(p);
  }
  return out;
}

describe('one camera', () => {
  it('the router seam defaults viewTransition from the live reduced-motion preference', () => {
    const src = strip(read('router.tsx'));
    expect(src).toMatch(/router\.navigate\s*=/);
    // `??` on the CALLER'S value, not a plain default spread first: <Link> forwards
    // `viewTransition: undefined`, which would clobber a default placed before the spread.
    expect(src).toMatch(/viewTransition:\s*opts\?\.viewTransition\s*\?\?\s*!prefersReducedMotion\(\)/);
    // A numeric `to` is history.go(): it takes no options and must pass through untouched.
    expect(src).toMatch(/typeof to === 'number'/);
  });

  it('the stylesheet gives the root transition a duration and removes it under reduced motion', () => {
    const css = read('styles/globals.css');
    expect(css).toMatch(/::view-transition-old\(root\)[\s\S]*?animation-duration/);
    const reducedAt = css.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(reducedAt).toBeGreaterThan(0);
    expect(css.slice(reducedAt), 'reduced motion must switch view transitions off, not merely shorten them')
      .toMatch(/::view-transition-(group|old|new)\(\*\)[\s\S]*?animation:\s*none/);
  });

  it('the inspector drawer and the first row→page pair name themselves for the morph', () => {
    expect(read('components/ui/InspectorDrawer.tsx')).toMatch(/viewTransitionName:\s*'inspector'/);
    const row = read('components/bd/LeadTable.tsx');
    const heading = read('pages/LeadDetail.tsx');
    // Same name on both sides, or the pair is two cuts wearing one comment.
    expect(row).toMatch(/viewTransitionName:\s*`lead-\$\{lead\.id\}`/);
    expect(heading).toMatch(/viewTransitionName:\s*`lead-\$\{lead\.id\}`/);
  });

  it('no component calls document.startViewTransition itself — the router is the one seam', () => {
    const callers = walk(SRC)
      .filter((f) => /document\.startViewTransition\s*\(/.test(strip(readFileSync(f, 'utf8'))))
      .map((f) => f.slice(SRC.length + 1));
    expect(callers, 'a second camera — route continuity is the router\'s; drawer and row morphs are CSS names').toEqual([]);
  });
});
