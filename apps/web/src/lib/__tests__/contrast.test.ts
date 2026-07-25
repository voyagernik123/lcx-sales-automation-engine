import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The WCAG contrast ratchet, computed from tokens.css (TERMINAL Phase 7).
 *
 * WHY THIS IS COMPUTED AND NOT EYEBALLED. Every previous contrast claim in this
 * repo was an assertion about a single token — `focusVisible.test.ts` measures
 * the focus ring, and nothing measured the text palette at all. On a surface this
 * dense (964 `text-micro` / 11px sites, 1365 `text-grey`) "it looks fine" is not
 * evidence: the failures here are all in the 3.5-4.4:1 band, which looks
 * perfectly legible to someone with full contrast sensitivity on a good monitor
 * and is exactly the band the standard exists to catch.
 *
 * WHAT IS AND IS NOT ASSERTED. Only combinations that actually occur are tested.
 * The full cross product of 7 text roles x 12 surfaces x 2 themes is 552 pairs
 * and 308 of them "fail", but nearly all of those are nonsense pairs the app
 * never renders (`text-white` on `card`, `text-ice-soft` on `ice-soft`). A test
 * that reports 308 failures teaches the reader to ignore it. The three surfaces
 * below — card, the page canvas, and the raised wash — are where this app puts
 * body text, verified by grepping the source and by walking the live DOM.
 *
 * THE THRESHOLD. 4.5:1 for normal text (WCAG 2.2 SC 1.4.3). Large-text relief
 * (3:1) is deliberately NOT applied: every failure recorded below is on text at
 * 14px or smaller, so relief could never apply, and hard-coding the stricter
 * number keeps the test honest if a token is later reused at a larger size.
 */

const SRC = join(__dirname, '..', '..');

/** WCAG 2.x relative luminance. Same maths as focusVisible.test.ts. */
function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** src-over composite of `fg` at `alpha` onto an opaque `bg`. */
function over(
  fg: [number, number, number],
  alpha: number,
  bg: [number, number, number],
): [number, number, number] {
  return [0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha)) as [number, number, number];
}

const round = (n: number) => Math.round(n * 100) / 100;

type Palette = Record<string, [number, number, number]>;

/**
 * Parse the `--token: r g b;` triples out of tokens.css, per theme.
 *
 * The file is a sequence of `:root { ... }` and `.dark { ... }` blocks (base
 * palette, then chart colours, then elevation), so every `:root` block merges
 * into light and every `.dark` block into dark. Dark then INHERITS anything it
 * does not redefine, which is how the real cascade behaves — getting this wrong
 * would silently test light values against dark surfaces.
 */
function palettes(): { light: Palette; dark: Palette } {
  const css = readFileSync(join(SRC, 'styles', 'tokens.css'), 'utf8');
  const light: Palette = {};
  const dark: Palette = {};
  for (const block of css.matchAll(/(:root|\.dark)\s*\{([\s\S]*?)\n\}/g)) {
    const target = block[1] === '.dark' ? dark : light;
    for (const m of block[2].matchAll(/--([a-z0-9-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) {
      target[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
    }
  }
  expect(Object.keys(light).length, 'parsed no light tokens — did tokens.css change shape?').toBeGreaterThan(10);
  expect(Object.keys(dark).length, 'parsed no dark tokens').toBeGreaterThan(10);
  return { light, dark: { ...light, ...dark } };
}

/** The surfaces this app actually places body text on. */
const SURFACES = ['card', 'page-bg', 'ice-soft'] as const;

/** The text roles, as the Tailwind config maps them (see tailwind.config.js). */
const TEXT_ROLES = ['navy', 'grey-dark', 'grey', 'green', 'amber', 'red', 'indigo'] as const;

/**
 * Pairs that are BELOW 4.5:1 today, with the ratio measured at the time of
 * writing. This is a ratchet, not an amnesty: a listed pair that improves past
 * 4.5:1 fails the test asking you to delete the line, and any pair NOT listed
 * must clear 4.5:1. That way the list can only ever shrink.
 *
 * Both entries are the same defect in different themes — a mid-tone accent that
 * was tuned against white and never re-checked against the two darker surfaces
 * the app actually uses more often:
 *
 *   --amber (light, #9a6b00) is the `status-conditional` role, 25 direct uses
 *   plus 157 `text-amber-*` sites. It clears 4.5:1 on pure white by 0.19 and
 *   fails on both the page canvas and the raised wash. Fixing it means darkening
 *   the token (#8a5f00 measures 5.2:1 on the canvas), which is a palette change
 *   across every "conditional" badge in the app and is not an audit's call.
 *
 *   --red (dark, #dc5064) fails only on the raised wash, and only in dark. It is
 *   marginal on the dark card too (4.53:1).
 */
const KNOWN_BELOW_MINIMUM: Record<string, number> = {
  'light amber on page-bg': 4.34,
  'light amber on ice-soft': 4.13,
  'dark red on ice-soft': 4.04,
};

describe('WCAG text contrast, computed from the tokens', () => {
  const { light, dark } = palettes();
  const themes = [
    ['light', light],
    ['dark', dark],
  ] as const;

  it('every text role clears 4.5:1 on every surface it is used on', () => {
    const unexpected: string[] = [];
    const fixed: string[] = [];

    for (const [themeName, palette] of themes) {
      for (const role of TEXT_ROLES) {
        for (const surface of SURFACES) {
          const fg = palette[role];
          const bg = palette[surface];
          expect(fg, `--${role} missing from the ${themeName} palette`).toBeDefined();
          expect(bg, `--${surface} missing from the ${themeName} palette`).toBeDefined();

          const key = `${themeName} ${role} on ${surface}`;
          const ratio = round(contrast(fg, bg));
          const known = KNOWN_BELOW_MINIMUM[key];

          if (known === undefined) {
            if (ratio < 4.5) unexpected.push(`${key} — ${ratio}:1 (needs 4.5:1)`);
            continue;
          }
          if (ratio >= 4.5) {
            fixed.push(`${key} — now ${ratio}:1, delete it from KNOWN_BELOW_MINIMUM`);
          } else {
            // Pin the recorded value so a listed pair cannot quietly get WORSE
            // while still being covered by its own entry.
            expect(ratio, `${key} regressed below its recorded ${known}:1`).toBeGreaterThanOrEqual(known - 0.05);
          }
        }
      }
    }

    expect(unexpected, `text below the 4.5:1 minimum:\n${unexpected.join('\n')}`).toEqual([]);
    expect(fixed, `contrast improved — tighten the ratchet:\n${fixed.join('\n')}`).toEqual([]);
  });

  it('status colours clear the 3:1 non-text minimum as dots and borders', () => {
    // The same three hues are also used as bare status dots and badge borders,
    // where SC 1.4.11 applies instead and the bar is 3:1. They all pass there —
    // which is exactly why the text failures above are easy to miss: the token
    // is fine for the dot next to the label and not for the label.
    for (const [themeName, palette] of themes) {
      for (const role of ['green', 'amber', 'red'] as const) {
        for (const surface of SURFACES) {
          const ratio = contrast(palette[role], palette[surface]);
          expect(ratio, `${themeName} --${role} dot on --${surface} is ${round(ratio)}:1`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('alpha on TEXT is what breaks it, so the ladder is recorded not guessed', () => {
    /*
     * The single most repeated contrast mistake in this app, and the reason this
     * test composites rather than comparing raw token values: `text-grey` passes
     * everywhere (6.13:1 on card) and `text-grey/70` does not (3.16:1). The alpha
     * is the whole defect, and it is invisible in the source — the class name
     * still says "grey", so it reads as a shade rather than as a standards
     * failure.
     *
     * Phase 7 removed the worst instance (the legal disclaimer in the status bar,
     * measured at 3.16:1). The rest are recorded here as arithmetic so the next
     * person can see the cliff instead of rediscovering it: at full strength the
     * token is fine, and there is NO alpha value at or below 0.8 that still
     * clears 4.5:1 on the card surface.
     */
    const card = light['card'];
    const grey = light['grey'];
    const ladder = [1, 0.8, 0.7, 0.6, 0.55, 0.5, 0.4].map((a) => ({
      alpha: a,
      ratio: round(contrast(over(grey, a, card), card)),
    }));

    // Full strength is the only member of the ladder that passes.
    expect(ladder[0].ratio).toBeGreaterThanOrEqual(4.5);
    for (const step of ladder.slice(1)) {
      expect(
        step.ratio,
        `text-grey/${step.alpha * 100} measures ${step.ratio}:1 — if this now passes, the grey token changed and this test's premise needs re-checking`,
      ).toBeLessThan(4.5);
    }
  });

  it('the hairline token is documented as decorative, because it cannot pass 3:1', () => {
    /*
     * `--line` measures 1.72:1 light / 1.30:1 dark against the card. That is far
     * below the 3:1 in SC 1.4.11, and it is NOT automatically a defect: 1.4.11
     * covers visual information "required to identify user interface components
     * and states", which exempts a purely decorative table-row rule — and that is
     * most of the 411 `border border-line` uses.
     *
     * It IS a defect wherever the hairline is the only thing marking the boundary
     * of a CONTROL (14 inputs use `border border-line`). This test does not fail
     * on it, because raising the token would redraw every table in the app and
     * that is a design decision. It exists to stop the value drifting DOWN, and
     * to make sure the next reader meets the number rather than assuming a border
     * token must already be compliant.
     */
    const lightLine = round(contrast(light['line'], light['card']));
    const darkLine = round(contrast(dark['line'], dark['card']));
    expect(lightLine).toBeLessThan(3);
    expect(darkLine).toBeLessThan(3);
    // Guard the direction of travel: these may only improve.
    expect(lightLine).toBeGreaterThanOrEqual(1.72 - 0.05);
    expect(darkLine).toBeGreaterThanOrEqual(1.3 - 0.05);
  });
});
