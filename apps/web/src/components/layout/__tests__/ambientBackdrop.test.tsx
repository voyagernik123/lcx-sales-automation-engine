import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { PIPELINE_SOURCES, toneMapComposite, linearToSrgb, srgbToLinear } from '@lcx/gl';
import { bufferBucket, BUFFER_FLOOR_W, BUFFER_FLOOR_H } from '@lcx/gl/flat/shared.js';
import {
  SignatureBackdrop, resetCanvasSnapshot, backdropSize, backdropPlate,
} from '@/components/command/SignatureBackdrop';

/**
 * X1 · THE AMBIENT BACKDROP — the one 3-D surface that is not opt-in.
 *
 * ── ONE ROUNDING CONVENTION, THE SAME ONE THE COMPONENT'S HEADER STATES ─────────────
 * A LEVEL is `level(L) = round(255 · linearToSrgb(L))` for a WCAG 2.x relative luminance `L`:
 * the 8-bit encoding of the NEUTRAL of that luminance. Every corridor figure, headroom and
 * "N levels" below is in that unit and no other. Per-CHANNEL bytes appear only as triples.
 * The helper is named `level` and not `byte` for exactly that reason — the previous name is
 * what let a channel byte and a neutral level be subtracted from each other in the prose this
 * file is supposed to pin.
 *
 * ── THE DEFECT THIS SUITE EXISTS BECAUSE OF ─────────────────────────────────────────
 * `SignatureBackdrop` shipped on `/command-deck` painting ONE hard-coded near-black plate in
 * BOTH themes, and the platform defaults to LIGHT. `PageTitle` has no background, so the deck's
 * own `<h1 className="text-navy">` measured 1.29:1 against WCAG 2.2 SC 1.4.3's 4.5:1. Nothing
 * caught it: `lib/__tests__/contrast.test.ts` computes every text role against `--page-bg`, and
 * the whole point of a backdrop is that `--page-bg` is no longer what the text sits on.
 *
 * So the assertions below are about the RELATIONSHIP between this layer and that ratchet, not
 * about a list of colours. Nothing here names a text role — where the ratchet's own text-role
 * list is needed it is PARSED OUT OF `contrast.test.ts`, so adding a role there puts it in
 * scope here on the same commit. The previous version's failure is precisely what a list of
 * "roles we checked" would have missed.
 *
 * ── CAPTURED, at 1440x900 through SwiftShader, dark theme, two route shapes ──────────
 * Brightest pixel over the whole 816x512 frame: [9, 14, 27] — EXACTLY `--page-bg`.
 * Darkest: [3, 5, 13]. 30 distinct colours over 417,792 pixels. Every one of the 31 tokens in
 * the dark palette that is lighter than the canvas measured the same or better over the
 * backdrop than over the flat canvas; zero got worse.
 *
 * ── AND WHY THE LIGHT HALF IS A REFUSAL RATHER THAN A GRADIENT ──────────────────────
 * Two independent numbers, both recomputed here rather than quoted:
 *   · the composite tone maps the PLATE, so light `--page-bg` #F4F7FC (the rig's `page`, since S2;
 *     #f4f6fb before) leaves the pipeline as 213 215 218 at ZERO vignette amplitude and takes five
 *     certified roles under 4.5:1;
 *   · the additive construction that would clear that floor is bounded by `--card` = #ffffff,
 *     which is AT the 8-bit ceiling, so the lift returns 96% of the elevation it destroys —
 *     and the ratio has a closed form, `(L_lifted + 0.05)/1.05`, that is below 1 at EVERY
 *     amplitude. The refusal is structural, not a judgement about how subtle is too subtle.
 * Both are asserted below, the second as the identity rather than as the 0.96, so that moving
 * `--card` off the ceiling fails a test instead of quietly invalidating a paragraph.
 */

const SRC = resolve(process.cwd(), 'src');
const REPO = resolve(process.cwd(), '..', '..');
const read = (p: string) => readFileSync(p, 'utf8');

const BACKDROP_SRC = read(join(SRC, 'components', 'command', 'SignatureBackdrop.tsx'));
const LAYOUT_SRC = read(join(SRC, 'components', 'layout', 'AppLayout.tsx'));
const HOOK_SRC = read(join(SRC, 'components', 'charts', 'gl', 'useFlatChart.ts'));
const TOKENS = read(join(SRC, 'styles', 'tokens.css'));
const RATCHET_SRC = read(join(SRC, 'lib', '__tests__', 'contrast.test.ts'));

/** Strip block and line comments. Prose about a colour is not a colour. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/* ── the token file, parsed the way `lib/__tests__/contrast.test.ts` parses it ─────── */
type Rgb = [number, number, number];
function palettes(): { light: Record<string, Rgb>; dark: Record<string, Rgb> } {
  const light: Record<string, Rgb> = {};
  const dark: Record<string, Rgb> = {};
  for (const block of TOKENS.matchAll(/(:root|\.dark)\s*\{([\s\S]*?)\n\}/g)) {
    const target = block[1] === '.dark' ? dark : light;
    for (const m of block[2]!.matchAll(/--([a-z0-9-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) {
      target[m[1]!] = [Number(m[2]), Number(m[3]), Number(m[4])];
    }
    for (const m of block[2]!.matchAll(/--([a-z0-9-]+):\s*#([0-9a-fA-F]{6})\s*;/g)) {
      target[m[1]!] = [0, 2, 4].map((i) => parseInt(m[2]!.slice(i, i + 2), 16)) as Rgb;
    }
  }
  return { light, dark: { ...light, ...dark } };
}

/** WCAG 2.x relative luminance and contrast — the same maths as `lib/__tests__/contrast.test.ts`. */
const luminance = ([r, g, b]: Rgb): number => {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: Rgb, b: Rgb): number => {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
/** THE convention. See the header. A luminance in, an 8-bit NEUTRAL level out. */
const level = (lum: number) => Math.round(255 * linearToSrgb(Math.max(0, Math.min(1, lum))));

/**
 * A token triple through the component's own plate derivation and the shipped composite, at one
 * pixel of the vignette.
 *
 * `factor` is `pipeline.ts:97`'s `1.0 - uVignetteDepth * smoothstep(0.12, 1.00, …)` — the whole
 * per-pixel term, passed directly rather than reconstructed from a depth, because the shader's
 * shape is pinned as a STRING in the first test and re-deriving it here would be a second copy.
 * `factor` 1 is the vignette centre, where `smoothstep` is 0 for every depth.
 */
const throughComposite = (rgb: Rgb, factor = 1): Rgb =>
  toneMapComposite(
    backdropPlate(rgb.join(' '), srgbToLinear).map((c) => c * factor) as [number, number, number],
  ).map(level) as Rgb;

/**
 * THE RATCHET'S OWN TEXT ROLES, read out of `contrast.test.ts` rather than re-typed.
 *
 * This is the fix for a disagreement that sat between this file and the component's header
 * since both were written. The header said the light DOWN corridor was TEN levels, set by
 * `--green` at 4.932:1. This file derived "the weakest certified pair" as the smallest ratio
 * at or above 4.5 over EVERY light token darker than the canvas — which admits `--chart-4`
 * #008300 at 4.574:1, a categorical CHART series that `contrast.test.ts` tracks against the
 * 3:1 NON-TEXT floor and never certifies as text. That yields TWO levels, and the assertion
 * was `<= 16`, so it passed at 2 and never said which number it had computed.
 *
 * Both numbers are real and they answer different questions, so both are now asserted, each
 * against the set it belongs to. Parsing the list means a role added to the ratchet lands here
 * on the same commit, which re-typing it would not.
 */
function ratchetTextRoles(): string[] {
  const m = /const TEXT_ROLES = \[([^\]]*)\] as const;/.exec(RATCHET_SRC);
  if (!m) throw new Error('TEXT_ROLES is no longer declared in contrast.test.ts — the ratchet moved');
  return [...m[1]!.matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1]!);
}

/**
 * How many LEVELS a canvas may move before `fg` on it reaches exactly 4.5:1.
 *
 * Signed and direction-aware, because the two themes move opposite ways: in light the canvas
 * darkens toward the text, in dark it lightens toward it. One function so the two corridors
 * cannot end up computed by two slightly different lines, which is how they ended up quoted in
 * two different rounding conventions.
 */
function corridorLevels(fg: Rgb, canvas: Rgb): number {
  const lf = luminance(fg), lc = luminance(canvas);
  const bound = lf < lc
    ? 4.5 * (lf + 0.05) - 0.05        // light: background falls to this luminance
    : (lf + 0.05) / 4.5 - 0.05;       // dark:  background rises to this luminance
  return Math.abs(level(lc) - level(bound));
}

afterEach(() => {
  cleanup();
  resetCanvasSnapshot();
  document.documentElement.classList.remove('dark');
  document.documentElement.style.removeProperty('--page-bg');
});

/** jsdom applies no stylesheet, so the token is installed inline — the same computed value. */
function theme(name: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', name === 'dark');
  document.documentElement.style.setProperty('--page-bg', name === 'dark' ? '9 14 27' : '244 246 251');
  resetCanvasSnapshot();
}

describe('X1 · the backdrop can only ever raise the contrast the ratchet certified', () => {
  it('the composite SUBTRACTS the vignette from the plate, so the plate is the frame maximum', () => {
    /*
     * THE WHOLE INVARIANT RESTS ON THIS ONE SHADER LINE, so it is asserted against the shipped
     * source rather than restated in prose. `look/pipeline.ts`:
     *
     *     vec3 plate = uPlate * (1.0 - uVignetteDepth * smoothstep(0.12, 1.00, length(...)));
     *
     * `smoothstep` is in [0,1] and `uVignetteDepth` is in [0,1], so the factor is in [0,1] and
     * the plate is the supremum of the field. A future edit to `1.0 +`, or to a gain above one,
     * or a bloom term that is not zeroed, would make some pixel BRIGHTER than `--page-bg` — and
     * in the dark theme that is the direction that costs a text role its contrast. Nothing about
     * the rendered frame would look wrong, which is why this is a string check.
     */
    expect(PIPELINE_SOURCES.composite).toMatch(
      /vec3\s+plate\s*=\s*uPlate\s*\*\s*\(\s*1\.0\s*-\s*uVignetteDepth\s*\*\s*smoothstep\(/,
    );
    /* And the composite must still ADD the scene and bloom to it — the backdrop draws an empty
       scene and passes `bloomGain: 0`, so both terms are zero and the plate stands alone. If the
       composite ever multiplied instead, "empty scene" would mean "black frame". */
    expect(PIPELINE_SOURCES.composite).toContain('vec3 lit = plate + scene + bloom * uBloomGain;');
  });

  it('the tone map cannot lift a channel, so the encoded maximum is at most --page-bg', () => {
    /* Reinhard `c / (1 + 0.4c)` is <= c for every c >= 0. Swept rather than argued, because the
       exported curve is the thing that could be replaced with one that has gain below 1. */
    for (let i = 0; i <= 400; i++) {
      const c = i / 100;
      const [r] = toneMapComposite([c, c, c]);
      expect(r, `toneMapComposite lifted ${c} to ${r} — the plate would exceed --page-bg`)
        .toBeLessThanOrEqual(c + 1e-12);
    }
  });

  it('every dark token that can be canvas text measures the same or better over the backdrop', () => {
    /*
     * DERIVED, NOT ENUMERATED. The candidate set is "every token in the dark palette that is
     * LIGHTER than the canvas", because a colour darker than the canvas cannot be text on it in
     * a dark theme — it would already fail the ratchet at 1.1:1. A token added tomorrow is in
     * this set tomorrow, which is the property a hand list of text roles does not have.
     *
     * Contrast against a fixed foreground is monotone in the background's luminance, so checking
     * the two ENDS of the ramp checks the whole ramp: the plate itself (the maximum, which is
     * `--page-bg` up to the tone map) and full extinction at vignette depth 1.
     */
    const { dark } = palettes();
    const canvas = dark['page-bg'];
    expect(canvas, '--page-bg missing from the dark palette').toBeDefined();

    /* THROUGH THE COMPONENT'S OWN DERIVATION, not a re-typed copy of it: `backdropPlate` is the
       single step between the token the page paints and the uniform the composite multiplies,
       so a stray gain introduced there fails HERE. */
    const brightest = throughComposite(canvas!);
    const darkest = toneMapComposite([0, 0, 0]).map(level) as Rgb;

    /* The measured capture, pinned: the brightest pixel of the real 816x512 frame was exactly
       [9, 14, 27]. If the derivation or the tone map ever costs a byte here, this says so
       instead of the invariant drifting. */
    expect(brightest, 'the plate no longer resolves to --page-bg itself').toEqual(canvas);

    const candidates = Object.entries(dark).filter(([, v]) => luminance(v) > luminance(canvas!));
    expect(candidates.length, 'no dark token is lighter than the canvas — the parser broke')
      .toBeGreaterThanOrEqual(10);

    const worse: string[] = [];
    for (const [name, rgb] of candidates) {
      const flat = contrast(rgb, canvas!);
      for (const [where, bg] of [['brightest', brightest], ['darkest', darkest]] as const) {
        const over = contrast(rgb, bg);
        if (over + 1e-9 < flat) worse.push(`--${name} ${flat.toFixed(2)}:1 -> ${over.toFixed(2)}:1 at the ${where} pixel`);
      }
    }
    expect(worse, `the backdrop REDUCED contrast:\n${worse.join('\n')}`).toEqual([]);
  });

  it('the light corridor is TWO numbers, and the header quoted one of them', () => {
    /*
     * The corridor, computed twice against two candidate sets, because the two answer different
     * questions and quoting either as "the corridor" is what put a 10 in the component's header
     * and a 2 in this file for the whole time both existed.
     *
     *   TEXT — the roles `contrast.test.ts` actually certifies at 4.5:1, parsed from its source.
     *          The weakest is what a DARKENING backdrop would break first.
     *   ALL  — every light token darker than the canvas that happens to reach 4.5:1. Wider,
     *          because it admits chart series the ratchet tracks against the 3:1 non-text floor.
     *
     * Both are pinned to their exact value, not to a `<= 16` band. A band is why the earlier
     * version of this test could compute 2, print nothing, and stay green beside a header that
     * said 10 — the two never had to meet.
     */
    const { light } = palettes();
    const canvas = light['page-bg']!;
    const card = light['card']!;

    const textRoles = ratchetTextRoles();
    expect(textRoles.length, 'contrast.test.ts declares no TEXT_ROLES — the ratchet changed shape')
      .toBeGreaterThanOrEqual(5);
    const textDarker = textRoles
      .map((n) => [n, light[n]] as const)
      .filter(([n, v]) => (expect(v, `--${n} is in TEXT_ROLES but not in the light palette`).toBeDefined(), luminance(v!) < luminance(canvas)));

    const weakestText = textDarker.reduce((a, b) => (contrast(a[1]!, canvas) <= contrast(b[1]!, canvas) ? a : b));
    const downText = corridorLevels(weakestText[1]!, canvas);
    expect(
      `--${weakestText[0]} ${contrast(weakestText[1]!, canvas).toFixed(3)}:1 -> ${downText} levels`,
      'the weakest CERTIFIED TEXT role on the light canvas, and its corridor, moved',
    // Re-recorded 2026-09-01: S2 derives --page-bg from the rig's `page` (light #F4F7FC, one level
    // brighter than the authored #F4F6FB); the weakest certified text role gained headroom.
    ).toBe('--green 4.966:1 -> 11 levels');

    const anyDarker = Object.entries(light).filter(([, v]) => luminance(v) < luminance(canvas) && contrast(v, canvas) >= 4.5);
    const weakestAny = anyDarker.reduce((a, b) => (contrast(a[1], canvas) <= contrast(b[1], canvas) ? a : b));
    const downAny = corridorLevels(weakestAny[1], canvas);
    expect(
      `--${weakestAny[0]} ${contrast(weakestAny[1], canvas).toFixed(3)}:1 -> ${downAny} levels`,
      'the weakest token of ANY kind above 4.5:1 on the light canvas, and its corridor, moved',
    // Re-recorded 2026-09-01 with the S2 page move (one level brighter): the weakest non-text token
    // gained a level of corridor too.
    ).toBe('--chart-4 4.605:1 -> 3 levels');

    expect(downAny, 'the widened set is no longer the tighter bound — re-read which number binds')
      .toBeLessThan(downText);

    /* UP is `level(luminance(card)) - level(luminance(canvas))`, in the one convention. It read
       ELEVEN in the header until 2026-08-15, which is 255 minus the canvas's RED byte. */
    expect(level(luminance(card)) - level(luminance(canvas)),
      // 9 until 2026-09-01: the S2 page is one level brighter, so one level less separates it from
      // the white card. The additive corridor below is derived from this and moves with it.
      'the canvas-to-card headroom moved; the additive corridor below is derived from it').toBe(8);
  });

  it('at ZERO vignette amplitude the light plate ALREADY fails, which is the real refusal', () => {
    /*
     * THE NUMBER THAT DECIDES THIS FILE, and neither corridor above is it. `pipeline.ts:98-100`
     * tone maps `plate + scene + bloom` as a SUM, so the plate goes through `c/(1+0.4c)` too.
     * That curve is near-identity only where c is small. With the vignette switched off
     * entirely — no gradient, no amplitude, nothing to tune down — the light canvas still
     * leaves the composite 31/32/34 levels darker than the page it is covering.
     *
     * DERIVED, NOT ENUMERATED: the losers are computed as "every light token darker than the
     * canvas that clears 4.5:1 today and does not clear it over the flat plate". A token added
     * tomorrow is in that set tomorrow.
     */
    const { light, dark } = palettes();
    const lightCanvas = light['page-bg']!;
    const darkCanvas = dark['page-bg']!;

    expect(throughComposite(darkCanvas), 'the dark plate no longer survives the curve to the byte')
      .toEqual(darkCanvas);
    expect(throughComposite(lightCanvas), 'the light plate through the shipped curve moved')
      // [213, 214, 217] until 2026-09-01; the light canvas moved one level with S2 (see above).
      .toEqual([213, 215, 218]);
    expect(throughComposite(lightCanvas, 1 - 0.62), 'the darkest light pixel at the shipped depth moved')
      // [149, 150, 153] until 2026-09-01; one level with the S2 page move.
      .toEqual([149, 151, 154]);

    const flat = throughComposite(lightCanvas);
    const lost = Object.entries(light)
      .filter(([, v]) => luminance(v) < luminance(lightCanvas))
      .filter(([, v]) => contrast(v, lightCanvas) >= 4.5 && contrast(v, flat) < 4.5)
      .map(([n, v]) => `--${n} ${contrast(v, lightCanvas).toFixed(3)} -> ${contrast(v, flat).toFixed(3)}`);
    expect(lost.length,
      `a FLAT light plate takes certified roles under 4.5:1 — there is no amplitude that is safe:\n${lost.join('\n')}`)
      .toBeGreaterThanOrEqual(5);

    /*
     * AND NO DEPTH REMOVES THAT PIXEL, including the negative ones. `pipeline.ts:192` uploads
     * `uVignetteDepth` unclamped, so d < 0 is expressible and inverts the falloff — at d = -0.5
     * the EDGE reaches 241 242 245 and at d = -1 it clips to white. It buys nothing, because
     * the term is `1 - d*smoothstep(0.12, 1.00, …)` and `smoothstep` is 0 at the vignette
     * CENTRE for every d, so factor 1 — the failing pixel — is in every frame the shader can
     * draw. The shape of that term is pinned as a string in the first test in this file; what
     * is measured here is the two ends of the field it produces.
     */
    for (const d of [-2, -1, -0.5, 0, 0.62, 1]) {
      const field = [0, 0.25, 0.5, 0.75, 1].map((s) => throughComposite(lightCanvas, 1 - d * s));
      expect(field, `vignetteDepth ${d} produced no un-attenuated pixel — re-read the centre`)
        .toContainEqual(flat);
    }
    expect(throughComposite(lightCanvas, 1 - -0.5 * 1), 'the inverted-vignette edge pixel moved')
      // [241, 242, 245] until 2026-09-01; one level with the S2 page move.
      .toEqual([241, 243, 246]);
    expect(throughComposite(lightCanvas, 1 - -1 * 1), 'the inverted vignette no longer clips at d = -1')
      .toEqual([255, 255, 255]);
  });

  it('the ADDITIVE construction clears the floor and is refused on the ceiling instead', () => {
    /*
     * THE HONEST HALF OF THE REFUSAL. A layer that only ever ADDS to the light canvas raises
     * every dark-on-light ratio, so text contrast is not what stops it. What stops it is that
     * `--card` in light is #ffffff — level 255, the top of the 8-bit range — so the canvas's 9
     * levels of headroom are the SAME 9 levels that are the card's entire elevation step, and
     * the card cannot move up to make more.
     *
     * Priced in one unit: contrast EXCESS, the part of a ratio above 1.0. If the layer creates
     * less excess of its own than it destroys of the ladder's, it is a wash. Everything here is
     * computed from the two tokens; nothing is a recorded constant.
     */
    const { light } = palettes();
    const canvas = light['page-bg']!;
    const card = light['card']!;

    expect(card, 'light --card is no longer at the 8-bit ceiling — the whole argument below moves')
      .toEqual([255, 255, 255]);

    /* THE RANGE, derived from the tint rather than asserted: lift every channel together until
       one of them pins, because a lift past that point changes the page's hue. */
    const headroom = Math.min(...canvas.map((c) => 255 - c));
    // 4 until 2026-09-01: the light canvas is one level brighter under S2, so there is one level
    // less above it before the encode clips. The refusal this test argues is unchanged by it.
    expect(headroom, 'the binding channel headroom moved (blue binds at 3)').toBe(3);
    const lifted = canvas.map((c) => c + headroom) as Rgb;
    expect(lifted[2]! - lifted[0]! , 'the lift changed the page tint B-R — that is not decoration')
      .toBe(canvas[2]! - canvas[0]!);

    /* PRE-COMPENSATION IS WHAT MAKES THE LIFT REACHABLE AT ALL. The curve costs 31 levels, so
       the target has to be written as its inverse. Driven through the component's own plate
       derivation so a stray gain there fails here too. */
    const inverse = backdropPlate(lifted.join(' '), srgbToLinear)
      .map((c) => c / (1 - c * 0.4)) as [number, number, number];
    expect(toneMapComposite(inverse).map(level), 'inverseToneMap no longer delivers the lift exactly')
      .toEqual(lifted);

    /* NOTHING LOSES CONTRAST. The floor the header uses, before and after, with no role named. */
    const worse = Object.entries(light)
      .filter(([, v]) => luminance(v) < luminance(canvas))
      .filter(([, v]) => contrast(v, lifted) + 1e-9 < contrast(v, canvas))
      .map(([n]) => `--${n}`);
    expect(worse, `an ADDITIVE light layer reduced contrast, which it cannot:\n${worse.join('\n')}`).toEqual([]);

    /*
     * AND THE TRADE IS A WASH — NOT NARROWLY, AND NOT ONLY AT THIS AMPLITUDE.
     *
     * Price it in one unit: contrast EXCESS, the part of a ratio above 1.0. Write `Lc` for the
     * canvas luminance and `Ll` for the lifted one. With the card at pure white its luminance
     * is 1, so `contrast(x, card) = 1.05 / (Lx + 0.05)` and:
     *
     *     destroyed = 1.05/(Lc+0.05) − 1.05/(Ll+0.05) = 1.05·(Ll−Lc) / ((Lc+0.05)(Ll+0.05))
     *     created   = (Ll+0.05)/(Lc+0.05) − 1        =      (Ll−Lc) /  (Lc+0.05)
     *     ─────────────────────────────────────────────────────────────────────────────
     *     created / destroyed = (Ll + 0.05) / 1.05
     *
     * The lift cancels. The ratio depends ONLY on where the lifted canvas lands, and it is
     * below 1 for every `Ll < 1` — that is, for every light backdrop that is not itself pure
     * white. So this is not "the corridor is too small to be worth it": WHILE `--card` IS AT
     * THE CEILING THE LIGHT LAYER CANNOT CREATE MORE CONTRAST THAN IT DESTROYS AT ANY
     * AMPLITUDE. That is what makes the refusal structural rather than a judgement about
     * subtlety, and it is why the identity is asserted rather than the 0.96.
     *
     * It is also what this assertion is FOR: move `--card` off #ffffff and the identity breaks,
     * which is precisely the token change that would re-open the whole question.
     */
    const destroyed = (contrast(canvas, card) - 1) - (contrast(lifted, card) - 1);
    const created = contrast(lifted, canvas) - 1;
    expect(created / destroyed,
      `the light trade no longer follows (L_lifted + 0.05)/1.05 — --card has moved off the ceiling ` +
      `and the refusal's arithmetic must be re-derived`)
      .toBeCloseTo((luminance(lifted) + 0.05) / 1.05, 10);
    expect(created,
      `a +${headroom} light lift creates ${created.toFixed(4)} of its own contrast excess and destroys ` +
      `${destroyed.toFixed(4)} of the canvas-to-card step — it is no longer a wash, RE-OPEN THE REFUSAL`)
      .toBeLessThan(destroyed);
    expect(Math.round((created / destroyed) * 100), 'the light trade ratio at the shipped tokens moved').toBe(96);
  });

  it('the same trade is FREE in dark, which is the asymmetry — not the corridor', () => {
    /*
     * The mirror of the test above, and the reason this layer ships at all. The dark layer
     * spends DOWNWARD, into range nothing above it owns, so it creates its own gradient AND
     * widens the card's elevation step at the same time. Both numbers positive is what "free"
     * means here, and it is what light cannot reproduce at any amplitude.
     */
    const { dark } = palettes();
    const canvas = dark['page-bg']!;
    const card = dark['card']!;
    const brightest = throughComposite(canvas);
    const darkest = throughComposite(canvas, 1 - 0.62);

    const created = contrast(brightest, darkest) - 1;
    const ladderGain = (contrast(darkest, card) - 1) - (contrast(canvas, card) - 1);
    expect(created, 'the dark layer stopped producing a gradient of its own').toBeGreaterThan(0.05);
    expect(ladderGain,
      `the dark backdrop now COSTS the canvas-to-card step ${(-ladderGain).toFixed(4)} of excess — ` +
      `it used to widen it, and the light refusal is argued from that difference`).toBeGreaterThan(0);
    expect(level(luminance(canvas)) - level(luminance(darkest)),
      'the levels the dark layer spends downward moved').toBe(9);

    /*
     * AND THE DARK CORRIDOR IT DOES NOT SPEND, both ways round, for the same reason the light
     * one is computed twice: the header quotes both and the two candidate sets disagree by 22
     * levels. `--red` is the weakest role the ratchet certifies as TEXT on this canvas;
     * `--control-border` is the weakest token of any kind above 4.5:1 and is a 3:1 BORDER role
     * that the ratchet never certifies at 4.5. Through the same `corridorLevels` as light, so
     * the two themes cannot end up in two rounding conventions again — which is exactly how
     * this header came to carry `41.7 − 14.3 = 27` beside a rounded light figure.
     */
    const textRoles = ratchetTextRoles();
    const weakestText = textRoles
      .map((n) => [n, dark[n]!] as const)
      .filter(([, v]) => luminance(v) > luminance(canvas))
      .reduce((a, b) => (contrast(a[1], canvas) <= contrast(b[1], canvas) ? a : b));
    expect(
      `--${weakestText[0]} ${contrast(weakestText[1], canvas).toFixed(3)}:1 -> ${corridorLevels(weakestText[1], canvas)} levels`,
      'the weakest CERTIFIED TEXT role on the dark canvas, and its corridor, moved',
    ).toBe('--red 6.017:1 -> 28 levels');

    const weakestAny = Object.entries(dark)
      .filter(([, v]) => luminance(v) > luminance(canvas) && contrast(v, canvas) >= 4.5)
      .reduce((a, b) => (contrast(a[1], canvas) <= contrast(b[1], canvas) ? a : b));
    expect(
      `--${weakestAny[0]} ${contrast(weakestAny[1], canvas).toFixed(3)}:1 -> ${corridorLevels(weakestAny[1], canvas)} levels`,
      'the weakest token of ANY kind above 4.5:1 on the dark canvas, and its corridor, moved',
    ).toBe('--control-border 4.714:1 -> 6 levels');
  });

  it('and the component acts on all of it: the light theme renders nothing', () => {
    theme('light');
    const { container } = render(<SignatureBackdrop />);
    expect(container.innerHTML, 'the light theme rendered a backdrop despite the arithmetic above').toBe('');
  });
});

describe('X1 · rule 1 — the page is unchanged by this layer being absent', () => {
  it('a refusal paints NOTHING: no canvas, no CSS plate, no background of its own', async () => {
    /*
     * jsdom has no WebGL2, so this is the real refusal path and not a simulation of one.
     *
     * The version this replaces painted a hard-coded `radial-gradient(#0b1220 -> #04060b)` div
     * that was "always present, always underneath" — so a machine without WebGL2 got the dark
     * plate laid over a LIGHT page with no pipeline involved at all. §6 rule 1 asks for a flat
     * fallback that is not a downgrade in information; for a backdrop the flat fallback is the
     * page, and `bg-page` is already painted by the shell.
     */
    theme('dark');
    const { container } = render(<SignatureBackdrop />);
    const host = container.querySelector('div');
    expect(host, 'the dark theme rendered no host at all').not.toBeNull();
    expect(host!.getAttribute('aria-hidden')).toBe('true');
    expect(host!.className).toContain('pointer-events-none');
    /* `-z-10` is only behind the content while an ancestor isolates; AppLayout's is asserted below. */
    expect(host!.className).toContain('-z-10');

    for (const el of container.querySelectorAll<HTMLElement>('*')) {
      expect(el.style.background, `${el.tagName} paints its own background on the refusal path`).toBe('');
      expect(el.style.backgroundImage, `${el.tagName} paints a gradient on the refusal path`).toBe('');
    }
    const canvas = container.querySelector('canvas');
    expect(canvas, 'no canvas element').not.toBeNull();
    expect(canvas!.style.display, 'the canvas is shown before a frame has been drawn').toBe('none');
  });

  it('two mounts produce ONE layer — the shell wins and the page-scoped copy stands down', () => {
    /*
     * `pages/CommandDeck.tsx:95` mounts this component inside `.br-page`, and `AppLayout` now
     * mounts one across the shell. Both are OPAQUE, so the deck's copy covers the shell's inside
     * the page container only — and its falloff is computed over a 1400 px box against the
     * shell's viewport, so the two disagree at the container's edge. Captured before the guard:
     * a visibly darker rectangle with a hard seam down the left of the content area.
     *
     * Order matters and is the right way round: AppLayout renders before the Outlet, so the
     * shell claims first and the page-scoped copy is the one that stands down.
     */
    theme('dark');
    const { container } = render(<><SignatureBackdrop /><SignatureBackdrop /></>);
    expect(container.querySelectorAll('canvas').length,
      'two backdrops are live at once — the deck seam is back').toBe(1);
  });

  it('an unreadable --page-bg refuses rather than guessing a colour, and keeps looking', () => {
    document.documentElement.classList.add('dark');
    document.documentElement.style.setProperty('--page-bg', 'var(--something-else)');
    resetCanvasSnapshot();
    const { container, rerender } = render(<SignatureBackdrop />);
    expect(container.innerHTML, 'a shape this parser does not recognise produced a backdrop anyway').toBe('');

    /*
     * AND THE REFUSAL IS NOT STICKY. In dev the stylesheet is injected by JS, so the first render
     * can find no `--page-bg` at all; memoising that answer would leave the layer absent for the
     * whole session, because the class attribute never changes to invalidate it. The token
     * arriving late must be enough — with NO `resetCanvasSnapshot()` here, which is exactly what
     * a memoised null would need.
     */
    document.documentElement.style.setProperty('--page-bg', '9 14 27');
    rerender(<SignatureBackdrop />);
    expect(container.querySelector('canvas'),
      'the layer never came back after the token resolved — a null read was memoised').not.toBeNull();
  });

  it('a theme flip swaps the layer without a remount', () => {
    theme('light');
    const { container, rerender } = render(<SignatureBackdrop />);
    expect(container.innerHTML).toBe('');
    theme('dark');
    rerender(<SignatureBackdrop />);
    expect(container.querySelector('canvas'), 'the dark theme did not bring the layer back').not.toBeNull();
  });

  it('no colour is written into this component — the plate comes from the live token', () => {
    /*
     * THE EXACT DEFECT, RATCHETED. `DECK_PLATE = [0.0052, 0.0086, 0.0224]` and a
     * `#0b1220 -> #04060b` CSS gradient were both hard-coded here, which is how a dark plate
     * ended up under a light page. A hex or an `rgb(` in this file's CODE (comments stripped —
     * the header quotes the old values on purpose) means a second definition of a colour that
     * `tokens.css` already owns, and a second definition is what drifts.
     */
    const body = code(BACKDROP_SRC);
    expect(body).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(body).not.toMatch(/\brgba?\(/);
    expect(body).not.toContain('gradient');
    /* And it must read the token it is covering, not some other one. */
    expect(body).toContain("getPropertyValue('--page-bg')");
  });
});

describe('X1 · rule 2 — it renders on mount, resize and theme change, and then stops', () => {
  it('schedules no frame of its own', () => {
    const body = code(BACKDROP_SRC);
    for (const banned of ['requestAnimationFrame', 'setInterval', 'setTimeout']) {
      expect(body.includes(banned), `SignatureBackdrop schedules ${banned} — §6 rule 2 forbids idle animation`)
        .toBe(false);
    }
  });

  it('passes BOTH tween durations as zero, and that is load-bearing rather than tidy', () => {
    /*
     * `useFlatChart` runs a `requestAnimationFrame` tween unless the duration is `<= 0`, and it
     * uses TWO durations: `entranceMs` for the first frame and `updateMs` (default 260) for every
     * later one. The previous version passed only `entranceMs: 0`, so every resize and every
     * theme flip ran a 260 ms rAF loop redrawing the SAME static gradient about sixteen times,
     * each pass being the full five-pass pipeline plus a blit. Frames that carry no new
     * information — §6 rule 2 reached from the direction the policy does not name.
     */
    const body = code(BACKDROP_SRC);
    expect(body).toMatch(/entranceMs:\s*0/);
    expect(body).toMatch(/updateMs:\s*0/);
    /* The zeros only mean anything while the hook still short-circuits on them. If this branch
       is removed, the two options above become decoration and the loop comes back. */
    expect(code(HOOK_SRC), 'useFlatChart no longer short-circuits a zero-length tween')
      .toMatch(/if\s*\(reduced\s*\|\|\s*ms\s*<=\s*0\)/);
  });
});

describe('X1 · rule 7 — one shared context, and it must not make the shared buffer grow', () => {
  it('builds no context of its own', () => {
    expect(code(BACKDROP_SRC)).not.toContain('createStage');
    expect(code(BACKDROP_SRC)).toContain('useFlatChart');
  });

  it('the copied buffer floor is the renderer\'s own', () => {
    /*
     * The component cannot IMPORT these: a value import from `@lcx/gl` in a file the eager shell
     * chunk reaches would pull the renderer into the initial bundle. So they are copied, and this
     * is what stops the copy going stale.
     */
    const body = code(BACKDROP_SRC);
    expect(body).toContain(`const BUFFER_FLOOR_W = ${BUFFER_FLOOR_W};`);
    expect(body).toContain(`const BUFFER_FLOOR_H = ${BUFFER_FLOOR_H};`);
  });

  it('every realistic viewport renders inside the buffer floor, so no other chart pays for it', () => {
    /*
     * `flat/shared.ts` prices a `drawImage` by the WHOLE drawing buffer and not by the source
     * rect — 0.50 ms at the floor against 2.41 ms at 2400x920 on an M1 through ANGLE Metal. A
     * viewport-sized backdrop grows that buffer and hands the bill to every sparkline on the
     * page. The fit below is the arithmetic in the component, driven through the renderer's OWN
     * `bufferBucket` rather than a copy of it.
     */
    const viewports: [number, number, number][] = [
      [1280, 720, 1], [1440, 900, 2], [1512, 982, 2], [1920, 1080, 1],
      [2560, 1440, 2], [3440, 1440, 2], [800, 600, 1], [5120, 2880, 2],
    ];
    for (const [vw, vh, dpr] of viewports) {
      /* `backdropSize` IS the component's sizing, exported for exactly this. The first version
         of this test recomputed the same three lines and then checked its own output, which
         stayed green with the reduction deleted from the component entirely. */
      const { w, h } = backdropSize(vw, vh, dpr);
      const dw = Math.round(w * dpr), dh = Math.round(h * dpr);
      expect(bufferBucket(dw, BUFFER_FLOOR_W),
        `${vw}x${vh}@${dpr} renders ${dw}x${dh} and grows the shared buffer's width`).toBe(BUFFER_FLOOR_W);
      expect(bufferBucket(dh, BUFFER_FLOOR_H),
        `${vw}x${vh}@${dpr} renders ${dw}x${dh} and grows the shared buffer's height`).toBe(BUFFER_FLOOR_H);
    }
  });

  it('the target set it asks for is small enough for stage.ts to keep', () => {
    /*
     * `stage.ts` caches target sets by size with a budget of `TARGET_CACHE_TEXELS`. A set over
     * that budget is evicted the moment any chart renders at a different size, so the backdrop
     * would reallocate three framebuffers and three textures on every redraw AND push the
     * chart's own set out. Read from the package source so the budget cannot move underneath it.
     */
    const stageSrc = read(join(REPO, 'packages', 'gl', 'src', 'stage.ts'));
    const m = /TARGET_CACHE_TEXELS\s*=\s*([\d_]+)/.exec(stageSrc);
    expect(m, 'TARGET_CACHE_TEXELS is no longer declared in stage.ts').not.toBeNull();
    const budget = Number(m![1]!.replace(/_/g, ''));
    expect(BUFFER_FLOOR_W * BUFFER_FLOOR_H,
      `a full-floor backdrop set is over stage.ts's ${budget}-texel cache budget`).toBeLessThan(budget);
  });
});

describe('X1 · the mount — the shell is the only element that spans every route', () => {
  it('AppLayout mounts it, and isolates the stacking context it needs', () => {
    /*
     * Without `isolate` the failure is INVISIBILITY, not breakage: a negative-z child paints
     * above its stacking context's own background, and this div creates no stacking context on
     * its own, so the layer would resolve against the ROOT element and paint behind `bg-page`
     * here. Nothing throws. `pages/CommandDeck.tsx:89` carries the same pair for the same reason.
     */
    expect(LAYOUT_SRC).toContain('<SignatureBackdrop />');
    const root = /<div className="([^"]*bg-page[^"]*)">/.exec(LAYOUT_SRC);
    expect(root, "AppLayout's shell div no longer matches — the backdrop's ancestor is unpinned").not.toBeNull();
    expect(root![1]).toContain('relative');
    expect(root![1]).toContain('isolate');
  });

  it('the routes outside the shell are outside on purpose', () => {
    /* `/select` and `/lcxos` are SIBLINGS of AppLayout in `router.tsx`, so this layer does not
       reach them. `/select` already has E8's ForgeBackdrop; `/lcxos` is the public page. Pinned
       so that moving either one under the shell is a decision rather than a side effect. */
    const router = read(join(SRC, 'router.tsx'));
    expect(router).toMatch(/path:\s*'\/select'[\s\S]{0,80}element:\s*<SelectOperator\s*\/>/);
    expect(router).toMatch(/path:\s*'\/lcxos'/);
  });

  it('a STRANGER reaches none of it, in either theme — X1\'s goal is gated, not themed', () => {
    /*
     * THE REACHABILITY HALF OF THE VERDICT, and the half nothing measured. X1's line in the plan
     * is that a stranger sees a 3-D frame WITHOUT A CLICK on more than one route of the shell.
     * `AppLayout` returns a redirect before it renders anything at all when there is no
     * operator, so a stranger never mounts this component on ANY shell URL — not in light, and
     * not in dark either. Their reachable set is exactly the two siblings above, and `/select`
     * already carried E8's ForgeBackdrop before this layer existed.
     *
     * So the count was one before and is one now, and the light-theme refusal is not what
     * decides it. Pinned here so that gating this differently — or ungating the shell — is a
     * decision that has to come past this assertion.
     */
    expect(LAYOUT_SRC, 'AppLayout no longer redirects an operator-less reader; X1 reachability changed')
      .toMatch(/if\s*\(!operator\)\s*\{[\s\S]{0,200}<Navigate\s+to=\{[^}]*'\/select'\}\s*replace\s*\/>/);
    /* And the redirect must still come BEFORE the mount, or it stops being a gate. */
    const gate = LAYOUT_SRC.indexOf('if (!operator)');
    const mount = LAYOUT_SRC.indexOf('<SignatureBackdrop />');
    expect(gate, 'the operator gate is gone from AppLayout').toBeGreaterThan(-1);
    expect(mount, 'the backdrop mount is gone from AppLayout').toBeGreaterThan(-1);
    expect(gate, 'the backdrop now mounts before the operator gate — a stranger would reach it')
      .toBeLessThan(mount);
  });

  it('the shell URL count this layer spans is derived from the router, not remembered', () => {
    /*
     * The component's header and `CommandDeck.tsx:89` both quote a route count. `__tests__/
     * glContextBudget.test.ts:27` quotes a different one (70) from its own mount-site census.
     * This derives it, so the prose has one source: every `path:` under the AppLayout route
     * object, plus its `index` child.
     */
    const router = read(join(SRC, 'router.tsx'));
    const under = router.slice(router.indexOf('element: <AppLayout />'));
    const paths = [...under.matchAll(/path:\s*'([^']+)'/g)].length;
    const index = [...under.matchAll(/index:\s*true/g)].length;
    expect(`${paths + index}`, 'the number of shell URLs moved — the header quotes it').toBe('77');
  });
});

describe('X1 · what the DEFAULT theme pays for a layer that draws nothing', () => {
  /*
   * The refusal above stands, so this layer is inert for a default-theme reader. That makes
   * every byte it puts in the eager shell chunk pure cost, and a cost with no number attached
   * is how it stayed unexamined. These two assertions are the number.
   */

  it('it holds no GL context and pulls no renderer bytes when it refuses', () => {
    /*
     * STRUCTURAL, not a spy: the refusal returns before `LinearPlate` is constructed, so the
     * dynamic `import('@lcx/gl')` in it and `useFlatChart`'s `import('@lcx/gl/flat/shared.js')`
     * are never evaluated and `sharedRenderer()` is never called. Asserted three ways — the
     * refusal precedes the child in the source, the child owns the import, and the hook's GL
     * entry point is dynamic — because any one of the three moving re-opens the question.
     */
    const body = code(BACKDROP_SRC);
    const refusal = body.indexOf('return null');
    const child = body.indexOf('<LinearPlate');
    expect(refusal, 'the refusal branch is gone').toBeGreaterThan(-1);
    expect(refusal, 'the refusal no longer precedes the GL child — light would build a context')
      .toBeLessThan(child);
    /*
     * ANY `@lcx/gl` SPECIFIER, not the barrel one. This used to pin `import('@lcx/gl')` exactly, and
     * it went red when the layer was migrated off the barrel to `look/pipeline.js` and
     * `look/colour.js` — a change that STRENGTHENS the property being asserted, because a sub-path
     * import pulls strictly less than the barrel did. A regex that fails on an improvement is
     * pinning the spelling rather than the claim.
     *
     * The claim is: the renderer is reached DYNAMICALLY, from inside the child that only exists once
     * the layer has decided to draw. That is what the pattern below says, and it stays true however
     * many specifiers the migration ends up needing.
     */
    expect(body.slice(child), 'LinearPlate no longer owns a dynamic @lcx/gl import')
      .toMatch(/import\('@lcx\/gl(\/[\w./-]+)?'\)/);
    expect(code(HOOK_SRC), 'useFlatChart now imports the renderer statically — light would fetch it')
      .toMatch(/await import\('@lcx\/gl\/flat\/shared\.js'\)/);
    expect(code(HOOK_SRC).match(/^\s*import\s+(?!type\b)[^\n]*'@lcx\/gl/m),
      'useFlatChart has a VALUE import of @lcx/gl at module scope').toBeNull();

    /* And the light render really does produce no canvas element to attach one to. */
    theme('light');
    const { container } = render(<SignatureBackdrop />);
    expect(container.querySelector('canvas'), 'the light theme built a canvas after all').toBeNull();
  });

  it('all of the eager cost is this mount\'s, and it is pinned so it cannot drift', async () => {
    /*
     * TWO SEPARATE CLAIMS, because the header makes two.
     *
     * 1. ATTRIBUTION. Walk the EAGER first-party graph from `main.tsx` — `import(` is a chunk
     *    boundary and `import type` is erased, so both are cuts — and check that
     *    `SignatureBackdrop` is in it and is the ONLY module in it that imports `useFlatChart`.
     *    If a chart primitive ever becomes eager, the hook is paid for anyway and the number
     *    below stops being attributable to this mount; that is the case this catches.
     *    DERIVED, not a list of files: the walk finds whatever is there.
     *
     * 2. SIZE. Build the file the way the header says to and compare. A ceiling rather than an
     *    equality, because minifier versions move by a byte or two and a test that fails on
     *    that teaches people to widen it; a ceiling only ever fails on real growth.
     */
    const EXT = ['.ts', '.tsx', '.js', '.jsx'];
    const resolveSpec = (spec: string, from: string): string | null => {
      let base: string;
      if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
      else if (spec.startsWith('.')) base = resolve(from, '..', spec);
      else return null;
      for (const e of ['', ...EXT]) { const p = base + e; if (existsSync(p) && statSync(p).isFile()) return p; }
      for (const e of EXT) { const p = join(base, `index${e}`); if (existsSync(p)) return p; }
      return null;
    };
    const eager = new Set<string>();
    const walk = (file: string) => {
      if (eager.has(file)) return;
      eager.add(file);
      const src = code(read(file));
      const specs = [
        ...[...src.matchAll(/(?:^|\n)\s*import\s+(?!type\b)[\s\S]*?from\s*['"]([^'"]+)['"]/g)],
        ...[...src.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g)],
        ...[...src.matchAll(/(?:^|\n)\s*export\s+(?!type\b)(?:\*|\{[\s\S]*?\})\s*from\s*['"]([^'"]+)['"]/g)],
      ].map((m) => m[1]!);
      for (const s of specs) { const r = resolveSpec(s, file); if (r) walk(r); }
    };
    walk(join(SRC, 'main.tsx'));

    const backdrop = join(SRC, 'components', 'command', 'SignatureBackdrop.tsx');
    expect(eager.has(backdrop), 'SignatureBackdrop is no longer in the eager graph — re-price it').toBe(true);
    const hookImporters = [...eager].filter((p) =>
      /(?:^|\n)\s*import\s+(?!type\b)[\s\S]*?from\s*['"][^'"]*useFlatChart['"]/.test(code(read(p))));
    expect(hookImporters.map((p) => p.replace(`${SRC}/`, '')),
      'something else in the eager graph now imports useFlatChart, so the cost below is no longer all this mount\'s')
      .toEqual(['components/command/SignatureBackdrop.tsx']);

    /*
     * IN A CHILD PROCESS, and that is not a workaround for a flake — esbuild refuses to start
     * under this suite's jsdom environment ("new TextEncoder().encode('') instanceof Uint8Array
     * is incorrectly false"), because jsdom installs its own TextEncoder whose output is not the
     * realm's Uint8Array. A plain node child has the real globals and the real bundler.
     */
    const { execFileSync } = await import('node:child_process');
    const script = `
      const { buildSync } = require('esbuild');
      const { gzipSync } = require('node:zlib');
      const out = buildSync({
        entryPoints: [process.argv[1]],
        bundle: true, minify: true, format: 'esm', jsx: 'automatic', write: false, logLevel: 'silent',
        external: ['react', 'react/jsx-runtime', '@lcx/gl', '@lcx/gl/*'],
        alias: { '@': process.argv[2] },
      }).outputFiles[0].contents;
      process.stdout.write(out.length + ' ' + gzipSync(Buffer.from(out), { level: 9 }).length);
    `;
    const [min, gz] = execFileSync(process.execPath, ['-e', script, backdrop, SRC], {
      cwd: process.cwd(), encoding: 'utf8',
    }).split(' ').map(Number) as [number, number];

    /* 3,883 B / 1,879 B as measured on 2026-08-15; the component's header quotes both and names
       this command. A CEILING rather than an equality: a minifier version bump moves the last
       byte or two, and a test that fails on that only ever teaches people to widen it. */
    expect(min, `the eager shell cost of this no-op grew to ${min} B minified`).toBeLessThanOrEqual(4100);
    expect(gz, `the eager shell cost of this no-op grew to ${gz} B gzip`).toBeLessThanOrEqual(1990);
  }, 30_000);
});
