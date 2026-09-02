import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLASS, GLASS_CHROME_CLASS, GLASS_PLATE_CLASS } from '../glass';
import { STAGE_LUMINANCE_MAX, STAGE_LUMINANCE_MIN } from '@lcx/gl/env/stageScene.js';

/**
 * GLASS OVER THE STAGE — the text floors hold through it (THE PRODUCTION, P1).
 *
 * The chrome (`bg-card` at GLASS.chrome) and the page plate (`bg-page` at GLASS.plate) are translucent over a lit
 * stage. `contrast.test.ts` proves every text role against SOLID surfaces; this proves the same roles against the
 * WORST composite the stage can produce beneath them: the surface colour blended at its alpha over a backdrop at the
 * stage's declared maximum luminance (dark) or minimum (light — a dark shadow under a bright page is the worst case
 * there). The stage declares those bounds (`STAGE_LUMINANCE_MAX`) and lights itself under them; this file is what
 * notices if either side moves. It also pins that the components spell the alphas the table says.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TEXT_ROLES = ['navy', 'grey-dark', 'grey', 'green', 'amber', 'red', 'indigo'] as const;

type RGB = [number, number, number];
function palettes(): { light: Record<string, RGB>; dark: Record<string, RGB> } {
  const css = readFileSync(join(SRC, 'styles', 'tokens.css'), 'utf8');
  const darkStart = css.search(/\.dark\s*\{/);
  const parse = (block: string) => {
    const out: Record<string, RGB> = {};
    for (const m of block.matchAll(/--([a-z0-9-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) out[m[1]!] = [Number(m[2]), Number(m[3]), Number(m[4])];
    return out;
  };
  return { light: parse(css.slice(0, darkStart)), dark: parse(css.slice(darkStart)) };
}
const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrastL = (la: number, lb: number) => (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
/** Luminance of `surface` at `alpha` over a backdrop of luminance `behind` (linear-light blend, the worst honest model). */
const composite = (surface: RGB, alpha: number, behind: number) => alpha * lum(surface) + (1 - alpha) * behind;

describe('the glass keeps every text floor over the stage', () => {
  const { light, dark } = palettes();
  const cases = [
    ['light', light, GLASS.light, STAGE_LUMINANCE_MIN.light], // light: the darkest the stage may be under the glass (shadows lifted by ambient)
    ['dark', dark, GLASS.dark, STAGE_LUMINANCE_MAX.dark],       // dark: the brightest the stage may be under the glass
  ] as const;
  for (const [theme, pal, alphas, worstBehind] of cases) {
    for (const [surfaceName, alpha] of [['card', alphas.chrome], ['page-bg', alphas.plate]] as const) {
      for (const role of TEXT_ROLES) {
        it(`${theme}: --${role} on --${surfaceName} at α ${alpha} over the stage's worst luminance ≥ 4.5:1`, () => {
          const fg = pal[role]!, bg = pal[surfaceName]!;
          expect(fg, `--${role} missing in ${theme}`).toBeDefined();
          const behind = Math.min(worstBehind, 1);
          const ratio = contrastL(lum(fg), composite(bg, alpha, behind));
          const solid = contrastL(lum(fg), lum(bg));
          // A pair that fails on the SOLID surface is contrast.test's business (it is recorded there); the glass
          // must not take a passing pair below the floor, nor a failing pair further down by more than 0.05.
          if (solid >= 4.5) expect(ratio, `${theme} ${role} on ${surfaceName}: ${ratio.toFixed(2)}:1 through the glass (solid ${solid.toFixed(2)})`).toBeGreaterThanOrEqual(4.5);
          else expect(ratio).toBeGreaterThanOrEqual(solid - 0.05);
        });
      }
    }
  }

  it('the stage declares a luminance bound the glass maths can use', () => {
    expect(STAGE_LUMINANCE_MAX.dark).toBeGreaterThan(0);
    expect(STAGE_LUMINANCE_MAX.dark).toBeLessThan(0.2);
    expect(STAGE_LUMINANCE_MAX.light).toBeLessThanOrEqual(1);
  });

  it('the components spell the alphas the table declares', () => {
    expect(GLASS_CHROME_CLASS).toContain(`bg-card/[${GLASS.light.chrome.toFixed(2).replace(/^0/, '')}]`);
    expect(GLASS_CHROME_CLASS).toContain(`dark:bg-card/[${GLASS.dark.chrome.toFixed(2).replace(/^0/, '')}]`);
    expect(GLASS_PLATE_CLASS).toContain(`bg-page/[${GLASS.light.plate.toFixed(2).replace(/^0/, '')}]`);
    expect(GLASS_PLATE_CLASS).toContain(`dark:bg-page/[${GLASS.dark.plate.toFixed(2).replace(/^0/, '')}]`);
    for (const f of ['components/layout/TopNav.tsx', 'components/layout/Sidebar.tsx']) {
      expect(readFileSync(join(SRC, f), 'utf8'), `${f} does not use GLASS_CHROME_CLASS`).toContain('GLASS_CHROME_CLASS');
    }
    expect(readFileSync(join(SRC, 'components/layout/MainContent.tsx'), 'utf8')).toContain('GLASS_PLATE_CLASS');
  });
});
