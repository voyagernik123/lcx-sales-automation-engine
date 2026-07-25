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

/**
 * Parse the `--token: #rrggbb;` chart palette out of tokens.css, per theme.
 *
 * A second parser is needed because the chart block writes hex rather than the
 * `r g b` triples the base palette uses, so `palettes()` above silently skips
 * every one of them — which is exactly how the chart series went unmeasured while
 * a comment claimed they were validated.
 */
function hexPalettes(): { light: Palette; dark: Palette } {
  const css = readFileSync(join(SRC, 'styles', 'tokens.css'), 'utf8');
  const light: Palette = {};
  const dark: Palette = {};
  for (const block of css.matchAll(/(:root|\.dark)\s*\{([\s\S]*?)\n\}/g)) {
    const target = block[1] === '.dark' ? dark : light;
    for (const m of block[2].matchAll(/--([a-z0-9-]+):\s*#([0-9a-fA-F]{6})\s*;/g)) {
      const h = m[2];
      target[m[1]] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
    }
  }
  expect(Object.keys(light).length, 'parsed no light hex tokens — did the chart block change shape?').toBeGreaterThan(8);
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
 * IT IS NOW EMPTY, and that is the point of leaving it here rather than deleting
 * the mechanism. It held three entries, all the same defect in two themes — a
 * mid-tone accent tuned against pure white and never re-checked against the two
 * darker surfaces this app uses more often:
 *
 *   light amber on page-bg   4.34   fixed: --amber #9a6b00 -> #8a5f00
 *   light amber on ice-soft  4.13   now 5.22 / 4.98
 *   dark red on ice-soft     4.04   fixed: --red (dark) #dc5064 -> #e4687a, now 4.93
 *
 * The old note here said darkening --amber "is not an audit's call". That was the
 * wrong call: the token is the whole defect, 29 `text-status-conditional` sites
 * inherit it, and the change is a lightness move that does not touch the hue.
 * Both tokens were also failing on their OWN badge background — 4.24:1 for amber
 * on --amber-bg, 4.30:1 for dark red on --red-bg — which no test measured at all.
 * That pair is now covered below, and it is why the fix had to move the token
 * rather than the surfaces.
 *
 * STILL NOT FIXED, and deliberately not: `text-amber-*` Tailwind-scale sites are a
 * SEPARATE and worse failure that this token change does nothing for —
 * `text-amber-600` (#d97706) measures 3.19:1 on white, 2.81 on ice-soft. Those
 * sites do not read the --amber token.
 *
 * ALSO STILL FAILING, found by the verifier re-walking the cyan sweep. The sweep
 * moved 122 of the 137 `text-cyan-600` occurrences (121 lines, one of them a test
 * assertion) to cyan-700 — 5.36 / 4.96 / 4.72 on card / canvas / wash — and
 * deliberately left the other 15 on cyan-600 because all 15 are icons, which is
 * the right call and not a blanket find-and-replace: an icon is a graphical object
 * at 3:1 and cyan-600 clears that on all three surfaces (3.68 / 3.41 / 3.25). Two
 * things it did not reach, because it grepped for the string `text-cyan-600`:
 *
 *   - `text-cyan-500` (#06b6d4) is untouched, and at 2.43:1 on white it is below
 *     BOTH floors — worse as text than the defect the sweep fixed, and below 3:1
 *     even as an icon. 57 source sites. Most are ornamental lucide icons beside a
 *     text label, where 1.4.11's "required to identify a component or state" carve-
 *     out is the only thing making them defensible; a dozen-odd render glyphs and
 *     have no such defence — `{progressPercent}%` at text-2xl in ReadinessStack,
 *     three figures in CapitalEstimator, `TODAY` in RoadmapTimeline, the charter
 *     chips in CompetitorGrid (on `bg-cyan-50`, so worse still), the Phase 1 / NMLS
 *     buttons in BriefGenerator and StateCohortGrid.
 *   - `fill-cyan-600` on an SVG <text> in MarketScatter. Moved to cyan-700; it
 *     still measures 4.43 because of an inline `opacity: 0.9`, which is the alpha
 *     defect below, not a hue defect.
 *
 * None of this is token-driven, so no assertion here can catch it; it is recorded
 * because the next sweep should grep for the COLOUR, not for one utility prefix.
 */
const KNOWN_BELOW_MINIMUM: Record<string, number> = {};

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

  it('status text clears 4.5:1 on its OWN badge background', () => {
    /*
     * The gap this closes. The suite tested each status hue against card, canvas
     * and wash, and against nothing else — but the commonest place these hues
     * appear as text is inside their own tinted badge (`text-status-conditional`
     * on `bg-status-conditional-bg`). Unmeasured, two of the six were failing:
     * light --amber on --amber-bg at 4.24:1 and dark --red on --red-bg at 4.30:1.
     * Both are fixed by the token moves recorded in KNOWN_BELOW_MINIMUM above,
     * and this test is what stops them regressing.
     */
    const BADGES = [
      ['green', 'green-bg'],
      ['amber', 'amber-bg'],
      ['red', 'red-bg'],
    ] as const;
    const failures: string[] = [];
    for (const [themeName, palette] of themes) {
      for (const [role, bg] of BADGES) {
        const ratio = round(contrast(palette[role], palette[bg]));
        if (ratio < 4.5) failures.push(`${themeName} --${role} on --${bg} — ${ratio}:1`);
      }
    }
    expect(failures, `status text below 4.5:1 on its own badge:\n${failures.join('\n')}`).toEqual([]);
  });

  it('the chart series are tracked against the 3:1 non-text floor, shrink-only', () => {
    /*
     * This test is the thing tokens.css's chart comment CLAIMED already existed.
     * It did not — the comment said the failures were "Tracked in
     * lib/__tests__/contrast.test.ts as a shrink-only allowlist" and there was no
     * chart assertion in this file at all, partly because `palettes()` only reads
     * `r g b` triples and the chart block is written in hex. The claim is now true.
     *
     * The floor is 3:1 (SC 1.4.11, non-text UI), measured against --card-fill,
     * which is the surface a chart is actually drawn on in each theme.
     *
     * WHY THESE THREE ARE NOT RE-HUED. The cost of fixing them is genuinely small
     * — scaling toward black by 4% (chart-2 -> #1aa875), 16% (chart-3 -> #c78700)
     * and 6% (chart-7 -> #da749a) is enough — and it is NOT being done here for
     * two measured reasons rather than as a punt. First, a categorical palette's
     * job is mutual distinguishability, and contrast RATIO is the wrong instrument
     * for that: chart-2 (green) and chart-7 (pink) already sit 1.05:1 apart, i.e.
     * near-identical luminance, and are trivially told apart by hue, so "improve
     * the ratio against the background" and "keep the series separable" are not
     * the same axis and this file cannot adjudicate the second. Second, all three
     * are safe wherever the series also carries a label or a distinct shape and
     * unsafe only as the SOLE encoding, and which charts do which is not knowable
     * from a token file. Recorded here so the number can only go down.
     */
    const { light: chartLight, dark: chartDark } = hexPalettes();
    const chartThemes = [
      ['light', chartLight],
      ['dark', chartDark],
    ] as const;

    // Measured against --card-fill at the time of writing. Shrink-only: a series
    // that improves past 3:1 fails the test and must be deleted from the list.
    const KNOWN_BELOW_NON_TEXT: Record<string, number> = {
      'light chart-2': 2.82,
      'light chart-3': 2.17,
      'light chart-7': 2.69,
    };

    const unexpected: string[] = [];
    const fixed: string[] = [];
    for (const [themeName, palette] of chartThemes) {
      const surface = palette['card-fill'];
      expect(surface, `--card-fill missing from the ${themeName} chart palette`).toBeDefined();
      for (let i = 1; i <= 8; i++) {
        const key = `${themeName} chart-${i}`;
        const series = palette[`chart-${i}`];
        expect(series, `--chart-${i} missing from the ${themeName} palette`).toBeDefined();
        const ratio = round(contrast(series, surface));
        const known = KNOWN_BELOW_NON_TEXT[key];
        if (known === undefined) {
          if (ratio < 3) unexpected.push(`${key} — ${ratio}:1 (needs 3:1)`);
          continue;
        }
        if (ratio >= 3) {
          fixed.push(`${key} — now ${ratio}:1, delete it from KNOWN_BELOW_NON_TEXT`);
        } else {
          expect(ratio, `${key} regressed below its recorded ${known}:1`).toBeGreaterThanOrEqual(known - 0.05);
        }
      }
    }
    expect(unexpected, `chart series below the 3:1 non-text floor:\n${unexpected.join('\n')}`).toEqual([]);
    expect(fixed, `chart contrast improved — tighten the ratchet:\n${fixed.join('\n')}`).toEqual([]);
  });

  it('avatar initials on --chart-1 are recorded as failing, with the reason they are hard', () => {
    /*
     * White initials on a --chart-1 fill measure 4.42:1 light and 3.64:1 dark,
     * against the 4.5:1 in SC 1.4.3. Recorded rather than fixed, because in DARK
     * the two requirements pull in opposite directions and the token cannot satisfy
     * both — measured, not assumed:
     *
     *   fill        white-on-fill   fill-vs-dark-card
     *   #3987e5     3.64            4.86   (today: text fails)
     *   #2166b8     5.74            3.08   (text passes, fill nearly vanishes)
     *   #1a559a     7.47            2.37   (fill fails 1.4.11 outright)
     *
     * So darkening the fill to rescue white text breaks the fill's own contrast
     * against the canvas. The fix in dark is the TEXT colour, not the fill: the
     * DARK --navy-deep, rgb(7 11 22), on #3987e5 measures 5.40:1. (Not 4.57 — that
     * is the LIGHT --navy-deep, #141a45, which is not what a dark-theme avatar
     * would resolve; the two themes give the token different values and mixing them
     * up understates the remedy.) In light the gap is 0.08
     * and nudging the fill to #2874d0 clears it (4.67) while also improving the
     * fill against white — but --chart-1 is the primary series across every chart
     * and the avatar, so that belongs in one deliberate palette edit, not here.
     */
    const { light: chartLight, dark: chartDark } = hexPalettes();
    const white: [number, number, number] = [255, 255, 255];
    const lightRatio = round(contrast(white, chartLight['chart-1']));
    const darkRatio = round(contrast(white, chartDark['chart-1']));
    expect(lightRatio, 'white on light --chart-1 improved — re-check the avatar and tighten this').toBeLessThan(4.5);
    expect(darkRatio, 'white on dark --chart-1 improved — re-check the avatar and tighten this').toBeLessThan(4.5);
    // Direction of travel only: these may improve, never decay.
    expect(lightRatio).toBeGreaterThanOrEqual(4.42 - 0.05);
    expect(darkRatio).toBeGreaterThanOrEqual(3.64 - 0.05);
    // The dark remedy this comment recommends must actually hold. --navy-deep is
    // an `r g b` triple, so it comes from palettes(), not the hex parser.
    const remedy = round(contrast(dark['navy-deep'], chartDark['chart-1']));
    expect(remedy, `dark --navy-deep on dark --chart-1 is ${remedy}:1`).toBeGreaterThanOrEqual(4.5);
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
