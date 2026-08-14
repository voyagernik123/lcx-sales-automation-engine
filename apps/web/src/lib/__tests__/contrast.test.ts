import { readdirSync, readFileSync } from 'node:fs';
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

/**
 * The surfaces a BORDERED CONTROL actually sits on, per theme, and they are not the
 * same list as SURFACES — which is why extending the text test would have missed the
 * two that matter most in dark.
 *
 * Derived by scanning every JSX tag that carries `border-line` and collecting the
 * `bg-*` classes on the same element (the counts are occurrences, 2026-08-13):
 *
 *   bg-card 78 · bg-ice-soft 70 · bg-ice-soft/10 58 · dark:bg-navy-deep 36 ·
 *   (no bg, inherits) 27 · bg-ice-soft/50 26 · bg-page 11 · dark:bg-ice 5 · …
 *
 * The fractional-alpha washes composite to within a hair of whatever is underneath, so
 * card / page-bg / ice-soft cover them. `dark:bg-navy-deep` and `dark:bg-ice` do not
 * reduce to anything already in the list and are dark-only, hence the split. --ice is
 * the LIGHTEST dark surface and therefore the binding constraint in that theme; in
 * light it is the primary-button fill and carries no bordered controls, so including it
 * there would fail a pair that is never rendered.
 */
const CONTROL_SURFACES = {
  light: ['card', 'page-bg', 'ice-soft'],
  dark: ['card', 'page-bg', 'ice-soft', 'ice', 'navy-deep'],
} as const;

/** SC 1.4.11: 3:1 for the visual boundary of a user interface component. */
const NON_TEXT_MINIMUM = 3;

/**
 * Every `.ts`/`.tsx` under src, excluding tests — the same exclusion
 * `tailwind.config.js`'s content scan uses, and for a related reason: a class name
 * written inside a test is not a rendered class name, and counting it here would let a
 * test file inflate or deflate the ratchet below.
 */
function sourceFiles(dir = SRC, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'node_modules') sourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Blank out `//` and comment blocks, PRESERVING every byte offset and newline.
 *
 * Two distinct defects, both measured, both of which moved the counts below:
 *
 *  1. PROSE INFLATES THE RATCHET. A comment that mentions a utility by name is not a
 *     rendered class, but `src.match(/border-line/g)` counts it. There are 9 such
 *     mentions in src today (1,109 raw occurrences vs 1,100 real), and writing the
 *     migration note for this very fix added two more — a ratchet that its own
 *     documentation can loosen is not a ratchet. This is the same failure the
 *     `content` exclusion at the top of tailwind.config.js exists for.
 *  2. A COMMENT INSIDE A TAG CAN HIDE THE TAG. `jsxTagRanges` abandons a candidate on
 *     an unbracketed `<`, to avoid swallowing the next tag on a `a < b` comparison.
 *     `pages/SendQueue.tsx:169` is an `<a>` styled as a secondary button whose
 *     attribute list contains the comment "An anchor cannot be a <Button>" — the `<`
 *     of `<Button>` killed the parse and the control vanished from the count. Exactly
 *     one site today, but it is a control that was invisible, which is the failure this
 *     whole file exists to catch.
 *
 * Offsets are preserved (comment bytes become spaces) because the callers below locate
 * occurrences by index and report line numbers by counting newlines before them.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    // `[^:]` guards against eating the `//` in a `https://` inside a string literal.
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p: string) => p + ' '.repeat(m.length - p.length));
}

/**
 * Every JSX opening tag in `src`, as { tag, start, end } over its ATTRIBUTE range.
 *
 * Hand-rolled rather than regex-per-line because the attribute list of a control in this
 * codebase routinely spans lines and contains `{clsx(...)}` with nested braces, quotes
 * and template literals — a naive `<(input|select)[^>]*>` stops at the first `>` inside
 * an arrow function and silently under-counts. Measured: the naive version found 27
 * control sites where the real number is 228, so it would have reported the defect as
 * an eighth of its actual size.
 *
 * RANGES, AND NO `i = j` SKIP — this is the correction over the previous version, and it
 * is worth 9 controls. The old loop jumped the cursor past each tag it accepted, so JSX
 * passed as a PROP was never seen as JSX: in `shared/ConfirmDialog.tsx` the two footer
 * buttons live inside `footer={<>…</>}`, the `>` that closes them is at brace depth 1, so
 * the whole fragment was absorbed into `<Modal>`'s attribute range and both buttons were
 * counted as a non-control. Emitting ranges and attributing each occurrence to the
 * SMALLEST range containing it fixes that without a second parser: the innermost tag is
 * by definition the element the class is actually on. 223 -> 232 before the sweep.
 */
function jsxTagRanges(src: string): { tag: string; start: number; end: number }[] {
  const out: { tag: string; start: number; end: number }[] = [];
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '<') continue;
    const head = /^<([A-Za-z][A-Za-z0-9.]*)/.exec(src.slice(i, i + 64));
    if (!head) continue;
    const attrStart = i + head[0].length;
    let j = attrStart;
    let depth = 0;
    let quote: string | null = null;
    for (; j < src.length; j++) {
      const c = src[j];
      if (quote) {
        if (c === quote && src[j - 1] !== '\\') quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        quote = c;
        continue;
      }
      if (c === '{' || c === '(' || c === '[') depth++;
      else if (c === '}' || c === ')' || c === ']') depth--;
      else if (c === '>' && depth === 0) break;
      // An unbracketed '<' before the closing '>' means this was not a tag at all
      // (a comparison, a generic). Abandon it rather than swallowing the next tag.
      else if (c === '<' && depth === 0) {
        j = -1;
        break;
      }
    }
    if (j <= 0 || j >= src.length) continue;
    out.push({ tag: head[1], start: attrStart, end: j });
  }
  return out;
}

/**
 * Attribute every occurrence of `needle` in `src` to the INNERMOST JSX tag whose
 * attribute range contains it, or to `null` when it sits outside every tag.
 *
 * `null` is not a parser failure — it is the class-VARIANT-TABLE case, and it is where
 * the single most-reused control in the app was hiding. `ui/Button.tsx` keeps its
 * recipes in `const variantStyles: Record<ButtonVariant, string>`, so the border of
 * every `<Button variant="secondary">` in the codebase is a bare string constant that no
 * tag-attribute scanner can ever see. Callers must therefore handle the orphan bucket
 * deliberately rather than treating "not on a control tag" as "not a control".
 */
function attributeOccurrences(
  src: string,
  needle: RegExp,
): { tag: string | null; line: number }[] {
  const ranges = jsxTagRanges(src);
  const out: { tag: string | null; line: number }[] = [];
  for (const m of src.matchAll(needle)) {
    const idx = m.index!;
    let best: { tag: string; start: number; end: number } | null = null;
    for (const r of ranges) {
      if (idx < r.start || idx >= r.end) continue;
      if (!best || r.end - r.start < best.end - best.start) best = r;
    }
    out.push({ tag: best?.tag ?? null, line: src.slice(0, idx).split('\n').length });
  }
  return out;
}

/** Tags whose bordered edge is a CONTROL boundary under SC 1.4.11, not a decorative rule. */
const CONTROL_TAGS = new Set(['input', 'select', 'textarea', 'button', 'a', 'label']);

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

  it('the hairline token is decorative-only, and is measured so nobody assumes otherwise', () => {
    /*
     * `--line` is far below the 3:1 in SC 1.4.11 on every surface, in both themes.
     * That is NOT automatically a defect: 1.4.11 covers visual information "required
     * to identify user interface components and states", which exempts a purely
     * decorative table-row rule — and ~808 of the 1,115 `border-line` occurrences are
     * exactly that.
     *
     * WHAT CHANGED. The previous version of this test asserted only the two card
     * ratios and said raising the token "would redraw every table in the app and that
     * is a design decision", leaving the control case uncovered. That reasoning was
     * right and the conclusion was incomplete: the answer is not to raise --line, it
     * is that a token serving both a decorative rule and a control boundary has two
     * different floors and only one token. So --control-border now exists, --line
     * stays decorative, and the two are measured separately.
     *
     * This test is now the FULL grid rather than two cells, because "--line fails as a
     * control border" was being asserted on card alone while dark's binding surface is
     * --ice, where it measures 1.03:1 — nearly invisible, and unmeasured.
     */
    const measured: Record<string, number> = {};
    for (const [themeName, palette] of themes) {
      for (const surface of CONTROL_SURFACES[themeName]) {
        measured[`${themeName} line on ${surface}`] = round(contrast(palette['line'], palette[surface]));
      }
    }
    // Recorded 2026-08-13. Every one is below 3:1 by construction — the point of pinning
    // them is that they may only ever move UP, and that a reader meets the numbers.
    const RECORDED: Record<string, number> = {
      'light line on card': 1.72,
      'light line on page-bg': 1.59,
      'light line on ice-soft': 1.52,
      'dark line on card': 1.3,
      'dark line on page-bg': 1.42,
      'dark line on ice-soft': 1.16,
      'dark line on ice': 1.03,
      'dark line on navy-deep': 1.45,
    };
    expect(Object.keys(measured).sort()).toEqual(Object.keys(RECORDED).sort());
    for (const [key, ratio] of Object.entries(measured)) {
      expect(ratio, `${key} is ${ratio}:1, was recorded at ${RECORDED[key]}:1`).toBeGreaterThanOrEqual(
        RECORDED[key] - 0.05,
      );
      expect(
        ratio,
        `${key} now measures ${ratio}:1, at or over the 3:1 control-boundary floor. If --line ` +
          'was deliberately promoted, --control-border is redundant and this test and that ' +
          'token both need revisiting.',
      ).toBeLessThan(NON_TEXT_MINIMUM);
    }
  });

  it('--control-border clears the 3:1 control-boundary floor on every surface a control sits on', () => {
    /*
     * SC 1.4.11's actual requirement for the thing this token exists to be: 3:1 for the
     * visual boundary of a user interface component. Eight pairs — three light surfaces,
     * five dark — and all eight are asserted, not sampled.
     *
     * THIS TEST FAILS AGAINST THE UNFIXED TOKENS. Before --control-border existed the
     * lookup below is undefined and the first expect trips; setting the token to --line's
     * value instead gives 1.72 / 1.59 / 1.52 / 1.30 / 1.42 / 1.16 / 1.03 / 1.45 and all
     * eight ratio assertions trip. Verified both ways rather than assumed.
     */
    const failures: string[] = [];
    let pairs = 0;
    for (const [themeName, palette] of themes) {
      const border = palette['control-border'];
      expect(
        border,
        `--control-border missing from the ${themeName} palette. Every bordered control in ` +
          'the app depends on it clearing 3:1; a missing token would make the loop below ' +
          'empty and pass.',
      ).toBeDefined();
      for (const surface of CONTROL_SURFACES[themeName]) {
        expect(palette[surface], `--${surface} missing from the ${themeName} palette`).toBeDefined();
        pairs++;
        const ratio = round(contrast(border, palette[surface]));
        if (ratio < NON_TEXT_MINIMUM) {
          failures.push(`${themeName} --control-border on --${surface} — ${ratio}:1 (needs 3:1)`);
        }
      }
    }
    // Assert the collection is non-empty BEFORE trusting a loop over it. Both surface
    // lists could be emptied by a refactor and every assertion above would still pass.
    expect(pairs, 'measured no control-border pairs at all').toBe(8);
    expect(
      failures,
      `control boundaries below the 3:1 floor:\n${failures.join('\n')}`,
    ).toEqual([]);

    /*
     * A CEILING TOO, because the lazy fix is to point control borders at --grey and the
     * count says that is the wrong answer: --grey is the SECONDARY TEXT colour, and
     * re-measured over all eight of these surfaces its range is 5.31-7.45 (not the
     * 5.41-7.30 this comment used to claim — that list was missing dark on --ice at 5.31
     * and dark on --navy-deep at 7.45). So a border wearing it has the visual weight of
     * body copy on all 234 control boundaries in the app. 1.4.11 asks for 3:1. This
     * asserts the token stays clear of the floor without becoming text-weight, i.e. that
     * it is still a hairline.
     */
    for (const [themeName, palette] of themes) {
      const worstControl = Math.min(
        ...CONTROL_SURFACES[themeName].map((s) => contrast(palette['control-border'], palette[s])),
      );
      const worstGrey = Math.min(
        ...CONTROL_SURFACES[themeName].map((s) => contrast(palette['grey'], palette[s])),
      );
      expect(
        round(worstControl),
        `${themeName} --control-border is ${round(worstControl)}:1 at worst, against --grey's ` +
          `${round(worstGrey)}:1. It has become a text-weight border. If that is wanted, argue ` +
          'for it here — the design intent recorded in tokens.css is 3:1 plus margin, not 6:1.',
      ).toBeLessThan(round(worstGrey));
    }
  });

  it('the scanner sees the two things that hid controls from the previous count', () => {
    /*
     * A SELF-TEST, on fixtures rather than on the app, because both corrections below were
     * found by noticing a control the shipped scanner did not report — and a scanner that
     * silently regresses to the old behaviour would make every count in this file look
     * BETTER while the app got worse. That failure is invisible to a shrink-only ratchet:
     * fewer sites found reads as progress.
     *
     * The fixtures reproduce the two real sites, reduced:
     *   · shared/ConfirmDialog.tsx:45 — a <button> inside `footer={<>…</>}`, which the
     *     old `i = j` cursor skip absorbed into <Modal>'s attribute range.
     *   · pages/SendQueue.tsx:169 — an <a> whose attribute list contains a comment
     *     mentioning `<Button>`, whose `<` tripped the abandon rule and voided the tag.
     * Plus the orphan case (ui/Button.tsx:15) which must report `null`, not a tag.
     */
    const propPassed = '<Modal footer={<><button className="border-line">Cancel</button></>}>';
    const propTags = attributeOccurrences(stripComments(propPassed), /border-line/g);
    expect(propTags.map((o) => o.tag), 'JSX passed as a prop must attribute to the inner <button>, not <Modal>').toEqual(['button']);

    const commented = '<a\n  /* cannot be a <Button> */\n  className="border-line"\n>x</a>';
    expect(
      attributeOccurrences(commented, /border-line/g).map((o) => o.tag),
      'without stripComments the `<` inside the comment voids the tag — this is the ' +
        'negative control, and it must show the defect',
    ).toEqual([null]);
    expect(
      attributeOccurrences(stripComments(commented), /border-line/g).map((o) => o.tag),
      'stripComments must restore the <a>',
    ).toEqual(['a']);

    const table = "const v = { secondary: 'border border-line' };";
    expect(
      attributeOccurrences(stripComments(table), /border-line/g).map((o) => o.tag),
      'a class-variant table is outside every tag and must report null, so callers are ' +
        'forced to classify it rather than silently scoring it as "not a control"',
    ).toEqual([null]);

    expect(
      attributeOccurrences(stripComments('// border-line\n<p className="x" />'), /border-line/g),
      'a commented-out utility is not a rendered class and must not be counted at all',
    ).toEqual([]);
  });

  it('--control-border is wired to a real utility class in tailwind.config.js', async () => {
    /*
     * THE ONE LINE THIS WHOLE TOKEN WAITED ON. Until it existed, --control-border was
     * measured by the test above, documented at length in tokens.css, and reachable from
     * exactly nothing: Tailwind only emits a `border-*` utility for a key present in
     * `theme.extend.colors`, so `className="border-control"` compiled to no rule at all
     * and every control silently kept --line. A comment saying "NOT YET WIRED" cannot fail;
     * this can.
     *
     * The config is IMPORTED, not grepped, because the build reads the module — a regex
     * over the file would also match the token name inside the explanatory comment that
     * now sits directly above the entry, and would pass with the entry deleted.
     *
     * DERIVED, not asserted by name: the utility name comes from whichever colour key
     * references the token, so renaming the key to `ctl` keeps this test meaningful and
     * renaming the TOKEN fails it. That link is the point — this file measures
     * `--control-border` and components spell a Tailwind class, and nothing else in the
     * repo ties the two together.
     */
    /* tailwind.config.js is plain JS with no declaration file and `allowJs` is off for
     * this project, so TS cannot type the import. `@ts-expect-error` rather than
     * `@ts-ignore` deliberately: if the config ever gains types, TS reports the
     * suppression as unused and this line has to be revisited instead of rotting. The
     * shape is checked at runtime on the next line, which is the test's actual job. */
    // @ts-expect-error -- untyped JS config; shape asserted at runtime below
    const mod = await import('../../../tailwind.config.js');
    const config = (mod as { default?: unknown }).default as
      | { theme?: { extend?: { colors?: Record<string, unknown> } } }
      | undefined;
    // `?? {}` rather than a non-null assertion: an empty object is what the length check
    // immediately below is for, so a config that changed shape fails with the message
    // that explains it instead of throwing a TypeError three lines later.
    const colors = config?.theme?.extend?.colors ?? {};
    expect(
      Object.keys(colors).length,
      'imported tailwind.config.js but found no `theme.extend.colors`. The config changed ' +
        'shape, so every assertion below is about a structure that no longer exists.',
    ).toBeGreaterThan(5);

    const wired = Object.entries(colors).filter(
      ([, v]) => typeof v === 'string' && v.includes('--control-border'),
    );
    expect(
      wired.map(([k]) => k),
      'no key in tailwind.config.js `theme.extend.colors` references --control-border, so ' +
        'no `border-*` utility resolves to it and every control boundary in the app falls ' +
        'back to --line at 1.03-1.72:1 against the 3:1 in WCAG 2.2 SC 1.4.11.',
    ).toHaveLength(1);

    const [utilityName, value] = wired[0] as [string, string];
    /*
     * The alpha-value form matters and is not cosmetic. `rgb(var(--x))` without the
     * `<alpha-value>` slash placeholder compiles, but every `/NN` opacity modifier on it
     * silently produces an invalid declaration the browser drops — so `border-control/70`
     * would render NO border rather than a lighter one. `border-line/70` and
     * `border-line/20` are both already in use, so the next person to copy one onto a
     * control would hit exactly that.
     */
    expect(
      value,
      `\`${utilityName}\` must follow the convention the other tokens use — ` +
        'rgb(var(--token) / <alpha-value>) — so opacity modifiers stay valid',
    ).toBe('rgb(var(--control-border) / <alpha-value>)');

    // And the utility must actually be reachable from a component, not merely declared.
    const utility = `border-${utilityName}`;
    let uses = 0;
    for (const file of sourceFiles()) {
      uses += (stripComments(readFileSync(file, 'utf8')).match(new RegExp(utility, 'g')) ?? []).length;
    }
    expect(
      uses,
      `\`${utility}\` is defined in tailwind.config.js but no component uses it. Tailwind ` +
        'purges unused utilities, so the class would not even ship — the token would be ' +
        'wired on paper and absent from the stylesheet.',
    ).toBeGreaterThan(0);
  });

  it('no control still takes its boundary from --line, and the count can only shrink', () => {
    /*
     * The token assertion above proves --control-border is COMPLIANT. This one is about
     * whether controls actually use it, which is a different question and the one that
     * decides whether a user can see the edge of an input.
     *
     * THE COUNT WENT UP BEFORE IT WENT DOWN, and that is the honest part. This test used to
     * record 223. Re-measured with the two scanner corrections documented on
     * `stripComments` and `jsxTagRanges`, the real figure was 232: nine controls were
     * hidden, eight inside JSX passed as a prop and one behind a comment containing `<`.
     * The sweep in components/ui and components/shared then moved six sites (five tags plus
     * `ui/Button.tsx`'s secondary variant table), leaving 228 — and `ui/Button.tsx` is worth
     * more than its single line, since every `<Button variant="secondary">` in the app
     * renders through it.
     *
     * WHAT IS DELIBERATELY NOT COUNTED, because 1.4.11 does not cover it and sweeping it
     * would make the UI heavier for no accessibility gain: 816 occurrences on inert
     * elements — table rules, card edges, section dividers, the `<pre>` in ErrorBoundary,
     * the dialog panel edge in `ui/Modal.tsx`. Those are correct on --line and must stay
     * there; a 3:1 hairline against white is no longer a hairline. A further 16 sit on
     * interactive non-control elements (`<div onClick>`, `role="button"`), which is a
     * judgement per site that a test cannot make, so they are excluded rather than folded
     * in to make the number look worse.
     *
     * SHRINK-ONLY, not pinned to equality: a sibling track deleting a control must not fail
     * this. Adding a NEW bordered control on --line does fail it.
     */
    const files = sourceFiles();
    expect(files.length, 'scanned no source files — SRC or the walk is wrong').toBeGreaterThan(100);

    let occurrences = 0;
    let onControls = 0;
    let orphans = 0;
    const sites: string[] = [];
    for (const file of files) {
      const src = stripComments(readFileSync(file, 'utf8'));
      const rel = file.slice(SRC.length + 1);
      for (const { tag, line } of attributeOccurrences(src, /border-line/g)) {
        occurrences++;
        if (tag === null) orphans++;
        else if (CONTROL_TAGS.has(tag)) {
          onControls++;
          sites.push(`${rel}:${line} <${tag}>`);
        }
      }
    }

    /*
     * ANTI-VACUITY. Every number below is a count over a discovered set, and a count over
     * nothing is 0, which satisfies "shrink-only" forever while measuring nothing. If the
     * utility is renamed, or the tag scanner stops recognising JSX, this test must fail
     * rather than report a clean sweep it did not verify.
     */
    expect(
      occurrences,
      'found no `border-line` anywhere in src. Either the sweep is genuinely complete — in ' +
        'which case delete this test and the token comment that references it — or the ' +
        'utility was renamed and this test is now measuring nothing.',
    ).toBeGreaterThan(0);
    expect(
      onControls + orphans,
      'the scanner found `border-line` occurrences but attributed none to a control tag ' +
        'and found no class-table orphans either, which means it stopped parsing JSX ' +
        'rather than that the defect is fixed.',
    ).toBeGreaterThan(0);

    const RECORDED_CONTROL_SITES = 228;
    expect(
      onControls,
      `${onControls} control borders now take their colour from --line (was ` +
        `${RECORDED_CONTROL_SITES} after the ui/ and shared/ sweep). Every one measures ` +
        '1.03-1.72:1 against its surface, against the 3:1 in WCAG 2.2 SC 1.4.11. Use ' +
        '`border-control` (--control-border) on a control boundary; --line is for ' +
        `decorative rules only.\nFirst few: ${sites.slice(0, 5).join(', ')}`,
    ).toBeLessThanOrEqual(RECORDED_CONTROL_SITES);
  });

  it('the swept primitives stay swept, and nothing decorative gets dragged along', () => {
    /*
     * TWO RATCHETS IN OPPOSITE DIRECTIONS, because this token has two failure modes and
     * only one of them is "a control is too faint".
     *
     * The other one is over-application. --control-border is roughly 2.3x the contrast of
     * --line (3.97 vs 1.72 on the light card); painting it onto the ~816 decorative rules
     * would clear no WCAG criterion at all — 1.4.11 does not cover a table hairline — and
     * would redraw every table and card edge in the app as a heavy rule. So the second
     * assertion below is the one that stops a well-meaning find-and-replace: every
     * `border-control` occurrence must be on a control.
     *
     * components/ui and components/shared are pinned at ZERO rather than shrink-only
     * because they were swept completely; they are the shared primitives, so a regression
     * here reappears on every page at once.
     */
    const SWEPT = /^components\/(ui|shared)\//;

    let sweptControls = 0;
    let sweptTotal = 0;
    const sweptControlSites: string[] = [];
    const sweptOrphans: string[] = [];
    let controlTokenTotal = 0;
    const misapplied: string[] = [];

    for (const file of sourceFiles()) {
      const src = stripComments(readFileSync(file, 'utf8'));
      const rel = file.slice(SRC.length + 1);

      if (SWEPT.test(rel)) {
        for (const { tag, line } of attributeOccurrences(src, /border-line/g)) {
          sweptTotal++;
          if (tag === null) sweptOrphans.push(`${rel}:${line}`);
          else if (CONTROL_TAGS.has(tag)) {
            sweptControls++;
            sweptControlSites.push(`${rel}:${line} <${tag}>`);
          }
        }
      }

      for (const { tag, line } of attributeOccurrences(src, /border-control\b/g)) {
        controlTokenTotal++;
        // `null` is the class-variant-table case, which is legitimate — ui/Button.tsx
        // holds the secondary recipe there — so it cannot be judged from the tag alone
        // and is checked by the orphan pin below instead.
        if (tag !== null && !CONTROL_TAGS.has(tag)) misapplied.push(`${rel}:${line} <${tag}>`);
      }
    }

    /*
     * ANTI-VACUITY FIRST. Both swept-dir assertions below are "expected 0" / "expected
     * empty", which a broken walk or a renamed utility satisfies perfectly. 24 decorative
     * `border-line` occurrences remain in these two directories — card edges, modal header
     * and footer rules, the ontology-node dividers, the ErrorBoundary <pre> — so the
     * scanner must still be finding those.
     */
    expect(
      sweptTotal,
      'no `border-line` at all under components/ui or components/shared. 24 decorative ' +
        'ones are supposed to remain, so this means the walk or the utility name broke, ' +
        'not that the sweep succeeded.',
    ).toBeGreaterThan(0);

    expect(
      sweptControls,
      'a control in components/ui or components/shared is back on --line, where its ' +
        'boundary measures 1.03-1.72:1 against the 3:1 in SC 1.4.11. These are the shared ' +
        `primitives, so this regresses every page at once.\n${sweptControlSites.join('\n')}`,
    ).toBe(0);

    /*
     * The class-table borders in the swept dirs, pinned as a SET so a new one has to be
     * classified by a person rather than defaulting to "not a control".
     *
     * IT IS EMPTY, and both reasons are worth keeping. `ui/Button.tsx:15` was the real
     * orphan — the secondary variant recipe, invisible to any tag scanner, and the
     * most-reused control in the app — and it is now on --control-border.
     * `ui/Modal.tsx:94` looked like a second one and is not: it sits on a <div> whose
     * attribute list carries a 14-line comment, and the `<` inside that comment was
     * voiding the tag until stripComments landed. It is the dialog PANEL edge, a surface
     * rather than an operable component, so 1.4.11 does not reach it and --line is right.
     * Left as an empty pin rather than deleted because the next such string will not
     * announce which of the two kinds it is.
     */
    expect(
      sweptOrphans.sort(),
      'a `border-line` appeared in a class-variant table under components/ui or ' +
        'components/shared. No tag scanner can see these, so each one must be classified ' +
        'by hand: if it lands on a control, move it to `border-control`; if it is a ' +
        'surface or divider, add it here with the reason.',
    ).toEqual([]);

    expect(
      misapplied,
      '`border-control` is on an element that is not a control. It is the heavier token ' +
        '(3.97:1 vs --line\'s 1.72:1 on the light card) and exists only for boundaries ' +
        'SC 1.4.11 actually covers — inputs, selects, buttons, links. A table rule, a card ' +
        'edge or a divider on it clears no criterion and just makes the UI heavier.\n' +
        misapplied.join('\n'),
    ).toEqual([]);

    // Anti-vacuity: if nothing uses the token, both assertions above are trivially true.
    expect(
      controlTokenTotal,
      'no `border-control` anywhere in src — the sweep was reverted, or the utility was ' +
        'renamed and this test is measuring nothing.',
    ).toBeGreaterThan(0);
  });

  it('the inset focus ring against the border it sits inside — the one number --control-border makes worse', () => {
    /*
     * FOUND WHILE CHECKING THE CLAIM THAT --grey WAS THE ONLY QUALIFYING TOKEN. It is not
     * (eight clear 3:1 — see tokens.css), and one of the eight is `--focus`. Measuring the
     * new token against it turned up the only respect in which --control-border is worse
     * than --line, so it is recorded here rather than left for the sweep to discover.
     *
     * WHY ADJACENCY MATTERS FOR EXACTLY ONE OF THE TWO FOCUS TREATMENTS. `:focus-visible`
     * in globals.css draws `outline: 2px` at `outline-offset: 2px`, so two pixels of
     * BACKGROUND separate the ring from the control's border and the ring's contrast is a
     * ring-vs-surface question (already asserted elsewhere: --focus is 3.25:1 light /
     * 7.74:1 dark on its worst control surface). `.focus-ring-inset` does not: it draws
     * `box-shadow: inset 0 0 0 2px` INSIDE the border box, flush against the border. Four
     * of its five sites in src are the two segmented view toggles, whose buttons sit inside
     * a `border border-line rounded-lg overflow-hidden` container
     * (`productIntel/ProductGrid.tsx:311`, `competition/CompetitorGrid.tsx:523`), so the
     * ring paints directly against that rule.
     *
     * THE MEASUREMENT, and the reason this is a recorded number and not a 3:1 assertion:
     * light --focus is #0891B2 and light --control-border is #778093, which differ in hue
     * and chroma but are within 1.08:1 of each other in LUMINANCE. Against today's --line
     * the same pair is 2.14:1 — already under the floor, so migrating those containers to
     * `border-control` would take a failing figure from 2.14 to 1.08 and make the state
     * change effectively colour-alone at that edge, which is the failure mode §10.5 of
     * `3D_VFX_FINAL_PLAN.md` already caught once in this programme (a pair that separated
     * by ΔE76 121.3 for normal vision collapsed to 13.5 simulated).
     *
     * So the recommendation on the record is: leave those two CONTAINERS on --line (they
     * are decorative group edges, not the control boundary — the buttons inside them are
     * the controls, and they are unbordered), or give the inset ring an outer keyline. This
     * test does not decide that. It pins all four ratios so the decision cannot be lost,
     * and so tuning either token silently past this point fails.
     */
    const RECORDED: Record<string, number> = {
      'light focus vs control-border': 1.08,
      'light focus vs line': 2.14,
      'dark focus vs control-border': 2.26,
      'dark focus vs line': 7.52,
    };
    const measured: Record<string, number> = {};
    for (const [themeName, palette] of themes) {
      expect(palette['focus'], `--focus missing from the ${themeName} palette`).toBeDefined();
      for (const role of ['control-border', 'line'] as const) {
        expect(palette[role], `--${role} missing from the ${themeName} palette`).toBeDefined();
        measured[`${themeName} focus vs ${role}`] = round(contrast(palette['focus'], palette[role]));
      }
    }
    // Assert the key SET first: a renamed token would leave `measured` short and every
    // per-key comparison below would read `undefined` and be skipped by `toBeCloseTo`.
    expect(Object.keys(measured).sort()).toEqual(Object.keys(RECORDED).sort());
    for (const [key, ratio] of Object.entries(measured)) {
      expect(
        ratio,
        `${key} now measures ${ratio}:1, recorded at ${RECORDED[key]}:1 on 2026-08-13. If a ` +
          'token moved deliberately, re-measure and update this record — and re-read whether ' +
          'the inset focus ring is still visible against the border it paints inside.',
      ).toBeCloseTo(RECORDED[key], 1);
    }

    /* The four-of-five claim above is a count over a discovered set, so it is checked
       rather than asserted in prose: if the utility is renamed or the toggles are
       rewritten, the comment stops describing the app and must fail here. */
    let insetSites = 0;
    for (const file of sourceFiles()) {
      insetSites += (readFileSync(file, 'utf8').match(/focus-ring-inset/g) ?? []).length;
    }
    expect(
      insetSites,
      `${insetSites} \`focus-ring-inset\` occurrences in src, recorded at 5. This test's ` +
        'adjacency argument is about those sites; a different number means it needs re-reading.',
    ).toBe(5);
  });
});
