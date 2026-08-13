import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { TrendDelta, type TrendDeltaProps } from '../TrendDelta';

// `import.meta.url` is not a file: URL under Vitest's transform — reading it that way threw
// "The URL must be of scheme file" and took the whole suite down at collection. `__dirname` is
// the seam every other source-text assertion here uses (gps/__tests__/gpsPrint.test.tsx:48).
const SRC = readFileSync(join(__dirname, '..', 'TrendDelta.tsx'), 'utf8');

/**
 * §4.4 · TrendDelta is the one chart primitive deliberately OUTSIDE the GL path
 * (`GL_NO_MARK_TO_BACK`); the argument is in the component's header. This file does two jobs:
 * it stops the exclusion being undone by accident, and it stops the CONSEQUENCE of the
 * exclusion regressing — with no GL layer, the DOM is not the fallback path, it is the only
 * path, so its text is the entire product.
 */
describe('TrendDelta · the GL exclusion is enforced, not just documented', () => {
  it('renders no canvas and no svg on any of its branches', () => {
    /* The ten GL-backed primitives are all recognisable the same way: a `<canvas>` beneath a
       `<svg>` in the chart's own stacking context. If a later change quietly hands this chip to
       `useFlatBars`/`useFlatTrack`, this fails. */
    const branches: readonly TrendDeltaProps[] = [
      { value: 4.2 },
      { value: -4.2 },
      { value: 12.5, goodIsUp: false },
      { value: 0 },
      { value: null },
      { value: undefined },
    ];
    // The loop is guarded because a "no canvas anywhere" assertion is exactly the kind that
    // passes triumphantly over an empty list, and this repo has been bitten by that before.
    expect(branches.length).toBe(6);
    let asserted = 0;
    for (const props of branches) {
      const { container } = render(<TrendDelta {...props} />);
      expect(container.querySelector('canvas')).toBeNull();
      expect(container.querySelector('svg')).toBeNull();
      // Proves the branch actually produced markup, so the two nulls above mean "no GL layer"
      // and not "nothing rendered at all".
      expect(container.textContent?.length ?? 0).toBeGreaterThan(0);
      asserted += 1;
    }
    expect(asserted).toBe(branches.length);
  });

  it('imports nothing from the renderer, so it adds no eager bytes to a StatCard chunk', () => {
    /* `useFlatChart` and the five adapters are EAGER imports in the chart that uses them — only
       `@lcx/gl` itself is dynamic. Initial JS has ~11 KB of headroom (839 of 850 KB) and this
       component reaches nearly every route through `StatCard`, so an import here is the one item
       in §4.4 with real budget risk (`3D_VFX_FINAL_PLAN.md` §6.4). Asserted against the source
       text, because a passing render proves nothing about what the bundler pulled in.

       QUOTE-AGNOSTIC ON PURPOSE. The first version matched only `'./gl/` with a single quote,
       and a probe that injected `from "./gl/FlatBars"` passed all 8 tests in this file. The
       match is on the path and the call, never on the quoting. */
    expect(SRC).not.toMatch(/\.\/gl\//);
    expect(SRC).not.toMatch(/@lcx\/gl/);
    expect(SRC).not.toMatch(/useFlat(Bars|Line|Band|Dial|Track|Chart)\s*\(/);
    // Guards all three above against silently passing on a file that was moved or emptied.
    expect(SRC).toContain('export function TrendDelta');
  });

  it('carries the exclusion code, so docs/phases/ABSENCES.md can cite this pair', () => {
    // scripts/doctrine-lint.mjs RULE 1 fails a registered code that is absent from either the
    // file that refuses or the test that proves it. Both strings are here so registering the
    // row is a one-line change and cannot land stale.
    expect(SRC).toContain('GL_NO_MARK_TO_BACK');
  });
});

describe('TrendDelta · direction survives without colour', () => {
  /* THE DEFECT THE EXCLUSION EXPOSED. `Math.abs()` strips the sign and the ▲/▼ glyph is
     `aria-hidden`, so before the `sr-only` word +4.2 % and −4.2 % produced the IDENTICAL
     accessible name, "4.2%" — the one fact the chip exists to carry, lost to every screen
     reader, text extraction and copy-paste. Colour was not a second cue: simulating
     deuteranopia (Viénot/Brettel/Mollon 1999) on the real tokens `--chart-good #0ca30c` and
     `--chart-bad #d03b3b` collapses their separation from ΔE76 121.3 to 13.5 in light mode, at
     a contrast ratio of 1.16:1 between them. */

  const textOf = (props: TrendDeltaProps) =>
    render(<TrendDelta {...props} />).container.textContent ?? '';

  it('distinguishes a rise from a fall in text alone', () => {
    const rise = textOf({ value: 4.2 });
    const fall = textOf({ value: -4.2 });
    expect(rise).not.toBe(fall);
    expect(rise).toContain('Up');
    expect(fall).toContain('Down');
  });

  it('keeps the printed number unsigned, so the direction word is load-bearing', () => {
    /* The tempting alternative fix is to print +4.2% / -4.2%. That changes the visible chip and
       moves the Playwright snapshots; the sign stays out of the number and the word carries it.
       If this assertion ever fails, the word has become decorative and can be deleted. */
    expect(textOf({ value: -4.2 })).toContain('4.2%');
    expect(textOf({ value: -4.2 })).not.toContain('-4.2');
    expect(textOf({ value: 4.2 })).not.toContain('+4.2');
  });

  it('reports the DIRECTION, not the judgement, when falling is the good direction', () => {
    /* The trap: `goodIsUp: false` flips the colour, and an implementation that derives the word
       from `good` rather than from `up` announces "Up" for a metric that went DOWN because the
       drop was welcome. The word describes the movement; only the hue describes the verdict. */
    const churnFell = textOf({ value: -12.5, goodIsUp: false });
    expect(churnFell).toContain('Down');
    expect(churnFell).not.toContain('Up');
  });

  it('hides the glyph from assistive technology while keeping it on screen', () => {
    const { container } = render(<TrendDelta value={4.2} />);
    const glyph = container.querySelector('[aria-hidden="true"]');
    expect(glyph).not.toBeNull();
    expect(glyph?.textContent).toBe('▲');
    const word = container.querySelector('.sr-only');
    expect(word).not.toBeNull();
    expect(word?.textContent).toBe('Up');
  });

  it('claims no direction at all when there is none to claim', () => {
    /* An em dash means "no change, or no prior period to compare against". Asserting the exact
       string is what proves no direction word leaked into this branch — inventing "Up" for a
       value of 0 would be worse than the defect this word fixes. */
    const noChange = [0, null, undefined] as const;
    expect(noChange.length).toBe(3);
    let asserted = 0;
    for (const value of noChange) {
      expect(textOf({ value })).toBe('—');
      asserted += 1;
    }
    expect(asserted).toBe(noChange.length);
  });
});
