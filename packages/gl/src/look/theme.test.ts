/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *  THE DATA / SCENERY BOUNDARY, PINNED — because it is the whole design and it is one edit from gone.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *  `theme.ts` swaps a scene's ground, structure, plate, rule, sky and light rig between themes, and
 *  swaps NOTHING ELSE. That restraint is the entire reason a theme is legitimate at all: §6 rule 5
 *  says a data-encoding colour is DATA, so tinting a mark to suit its background is editing the
 *  measurement to flatter the page.
 *
 *  The failure this guards is not dramatic and that is why it needs a test. Somebody adds
 *  `brand: hexToLinear('#5B8CFF')` to the light theme because the blue "looks harsh on white", every
 *  capture still renders, every existing assertion still passes, and the platform quietly starts
 *  encoding the same value as two different colours depending on a preference.
 *
 *  WHAT THIS FILE DOES NOT CLAIM. It does not prove a mark keeps its hex through the pipeline — the
 *  3-D path tone-maps the whole frame including data marks, which is a separate and larger defect
 *  tracked as T1 in `3D_VFX_100X_LIVE.md`. This pins the PALETTE boundary only: that the theme layer
 *  never offers a data colour in the first place. Saying so explicitly, because a test whose scope is
 *  assumed rather than stated is how "brand hex exact" came to be believed on the strength of a
 *  constants-table round-trip.
 *
 *  ══ AND A SECOND BOUNDARY, ADDED 2026-08-15: WHICH QUANTITY EACH FIELD CARRIES ══════════════════
 *  The block above pins WHICH colours a theme may offer. It said nothing about what the numbers MEAN,
 *  and for three fields they meant the wrong thing for as long as the light theme existed. The third
 *  `describe` below pins that, and it is separate on purpose: the two failures look nothing alike. A
 *  data colour leaking into scenery is a palette mistake; a sky authored as a reflectance renders 25
 *  luma dark and every existing assertion in this file stays green.
 */
import { describe, expect, it } from 'vitest';
import {
  sceneTheme, liveTheme, AUTHORED_HEX, ALBEDO_FIELDS, RADIANCE_FIELDS,
  type SceneTheme, type ThemeName, type ColourField,
} from './theme.js';
import { BRAND_HEX, hexToLinear, linearToHex } from './colour.js';
import { toneMapComposite } from './tonemap.js';
import { inverseToneMap, PRECOMP_CLIP, PRECOMP_POLE } from './precompensate.js';

const THEMES: readonly ThemeName[] = ['dark', 'light'];

/** The five colours §6 rule 5 fixes. A theme may not offer any of them, in either direction. */
const DATA_KEYS = ['brand', 'brandBright', 'brandDeep', 'reference', 'refusal'] as const;

/** Scenery fields carrying a colour. Derived from the record so a new field is covered on the day. */
const colourFields = (t: SceneTheme): ReadonlyArray<readonly [string, readonly number[]]> =>
  Object.entries(t)
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => [k, v as readonly number[]] as const);

describe('the theme offers scenery and never data', () => {
  it('covers both themes, so neither loop below can pass over an empty set', () => {
    expect(THEMES).toHaveLength(2);
    for (const name of THEMES) expect(sceneTheme(name).name).toBe(name);
  });

  it('has the same shape in both themes — a field present in one and absent in the other is a hole', () => {
    /* A missing field falls back to whatever the caller had, which on a theme switch means keeping the
       other theme's value: the exact silent half-swap this whole file exists to prevent. */
    const keys = THEMES.map((n) => Object.keys(sceneTheme(n)).sort().join(','));
    expect(keys[0]).toBe(keys[1]);
  });

  it('NEVER offers a rule-5 data colour as scenery, in either theme', () => {
    const banned = new Set(DATA_KEYS.map((k) => BRAND_HEX[k].toLowerCase()));
    expect(banned.size).toBe(DATA_KEYS.length);
    for (const name of THEMES) {
      const fields = colourFields(sceneTheme(name));
      /* Asserted before the loop: an empty field list would make this pass while checking nothing. */
      expect(fields.length, `${name} exposes no colour fields — the census is broken`).toBeGreaterThan(3);
      for (const [field, linear] of fields) {
        const hex = linearToHex(linear as Parameters<typeof linearToHex>[0]).toLowerCase();
        expect(banned.has(hex), `${name}.${field} is ${hex}, which is a rule-5 DATA colour`).toBe(false);
      }
    }
  });

  it('and the ban is real — the same check FAILS against a deliberately wrong theme', () => {
    /*
     * The negative control. Without it the assertion above is satisfied by any palette that merely
     * happens not to collide, and would keep passing if `DATA_KEYS` were emptied by a refactor.
     */
    const banned = new Set(DATA_KEYS.map((k) => BRAND_HEX[k].toLowerCase()));
    const sabotaged = { ...sceneTheme('light'), ground: hexToLinear(BRAND_HEX.brand) };
    const offenders = colourFields(sabotaged as SceneTheme).filter(([, l]) =>
      banned.has(linearToHex(l as Parameters<typeof linearToHex>[0]).toLowerCase()));
    expect(offenders.map(([k]) => k)).toEqual(['ground']);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *  WHICH QUANTITY EACH COLOUR FIELD CARRIES — the defect the boundary above did not cover.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *  The taxonomy above says WHICH colours a theme may offer. It says nothing about what the numbers
 *  MEAN, and for three fields they meant the wrong thing for as long as the light theme existed.
 *  `skyHorizon`, `skyZenith` and `fog` are written into the scene target and go through the tone map
 *  unmultiplied; they were authored as `hexToLinear(hex)`, which is a REFLECTANCE. The frame therefore
 *  applied the curve to a value that had already been chosen as the curve's OUTPUT, and the light sky
 *  rendered 25 Rec.601 luma below the hex it was written as — landing on the lit slabs it exists to
 *  sit behind.
 *
 *  THE ONLY THING THAT CAN CATCH THIS IS THE AUTHORED HEX. A reflectance and a radiance are both just
 *  three positive numbers; nothing about `[0.716, 0.784, 0.896]` says whether it is wrong. What says
 *  so is `#DCE5F3` — the statement of what the stop is meant to LOOK like — which is why `theme.ts`
 *  exports `AUTHORED_HEX` and why these tests put every field through the transform its declared
 *  quantity implies and check where it lands.
 *
 *  A test that hardcoded the corrected numbers would be the same bug with more digits, so no THEME
 *  value appears below as a literal: every expectation is the authored table put through the
 *  pipeline's own `toneMapComposite` and `linearToHex`. The one hex written by hand is `#FFFFFF`, in
 *  the pole test, and it is there as the EXTREME OF THE HEX DOMAIN rather than as a theme value —
 *  the worst case any authorable colour can produce, which is the whole point of writing it.
 */
describe('every colour field declares its quantity, and carries it', () => {
  /** What the frame SHOWS for a value written into the scene target — every consumer's present pass is
      `lcxEncode(lcxToneMap(scene))`, and `toneMapComposite` is that curve on the CPU. */
  const rendered = (c: readonly number[]): string =>
    linearToHex(toneMapComposite(c as Parameters<typeof toneMapComposite>[0]));
  /** What a swatch of an albedo encodes to. No curve: an albedo never reaches one without a light on it. */
  const swatch = (c: readonly number[]): string =>
    linearToHex(c as Parameters<typeof linearToHex>[0]);
  /**
   * The hex a field was authored as. `fog` is the one field with no hex of its own — `theme.ts` derives
   * it from `skyHorizon` so the two cannot disagree about either the colour or the quantity, and that
   * derivation is pinned separately by `fog follows the horizon` below.
   */
  const authoredHexOf = (t: ThemeName, f: ColourField): string =>
    (AUTHORED_HEX[t] as Record<string, string>)[f === 'fog' ? 'skyHorizon' : f]!;

  /**
   * THE CHECK ITSELF, as one function, so the negative controls below exercise the SAME code as the
   * positive assertions rather than a re-typing of it. Returns the fields that do not land on their
   * authored hex under the transform their declared quantity implies.
   */
  const wrongQuantity = (t: SceneTheme): string[] => {
    const out: string[] = [];
    for (const f of ALBEDO_FIELDS) {
      /*
       * TWO CONDITIONS, and the second is not redundant. `linearToHex` CLAMPS, so a pre-compensated
       * #FFFFFF — 1.6667, a surface returning more light than falls on it — still encodes to #ffffff
       * and the hex test alone would pass it. A reflectance is bounded by 1 by definition, so the
       * bound is the check that catches the brightest albedo in the file.
       */
      const overOne = t[f].some((v) => v > 1 || v < 0);
      if (overOne || swatch(t[f]).toLowerCase() !== authoredHexOf(t.name, f).toLowerCase()) out.push(f);
    }
    for (const f of RADIANCE_FIELDS) {
      if (rendered(t[f]).toLowerCase() !== authoredHexOf(t.name, f).toLowerCase()) out.push(f);
    }
    return out;
  };

  it('declares one for EVERY colour field — a new field cannot inherit whatever its first consumer assumes', () => {
    /*
     * DERIVED FROM THE RECORD, not from a list kept in this file. Somebody adding `skyGround` to
     * `SceneTheme` and forgetting to say which quantity it is in gets a red suite here, which is the
     * only moment the question is cheap to answer — after a consumer exists, the answer is whatever
     * that consumer happened to assume.
     */
    const declared = [...ALBEDO_FIELDS, ...RADIANCE_FIELDS];
    expect(new Set(declared).size, 'a field is declared as BOTH an albedo and a radiance').toBe(declared.length);
    expect(ALBEDO_FIELDS.length, 'no albedo fields — the loops below would check nothing').toBeGreaterThan(0);
    expect(RADIANCE_FIELDS.length, 'no radiance fields — the loops below would check nothing').toBeGreaterThan(0);
    for (const name of THEMES) {
      const present = colourFields(sceneTheme(name)).map(([k]) => k).sort();
      expect(present, `${name} has a colour field with no declared quantity, or declares one it lacks`)
        .toEqual([...declared].sort());
    }
  });

  it('an ALBEDO encodes back to its hex, and a RADIANCE TONE-MAPS back to its hex', () => {
    for (const name of THEMES) {
      expect(wrongQuantity(sceneTheme(name)), `${name} carries a field in the wrong quantity`).toEqual([]);
    }
  });

  it('and the check is real — the shipped defect and its mirror each FAIL it', () => {
    /*
     * TWO NEGATIVE CONTROLS, one per direction, because a check that only catches one of them would
     * pass a file where every field had been converted including the four that must not be.
     *
     *   · THE SHIPPED DEFECT: a sky stop authored as a reflectance, `hexToLinear('#DCE5F3')`. That is
     *     the exact expression this file's subject shipped with, so this control is the regression.
     *   · ITS MIRROR: an albedo pre-compensated, `inverseToneMap(hexToLinear('#FFFFFF'))` = 1.6667 —
     *     a reflectance above 1, which is a surface emitting more light than falls on it. Caught by
     *     the bound rather than by the hex, because `linearToHex` clamps; both are checked, on both
     *     the brightest albedo in the file and one that does not clamp.
     *
     * WHAT NEITHER CONTROL CATCHES, stated rather than left to be discovered: on the DARK theme the
     * conversion moves a stop by at most 1.24% and no byte changes, so a dark field in the wrong
     * quantity is invisible to this check. That is not a gap in the test — it is the same fact as
     * `DARK does not move` below, and it means the light theme is where this contract is enforceable.
     */
    const light = sceneTheme('light');
    const asShipped = { ...light, skyHorizon: hexToLinear(AUTHORED_HEX.light.skyHorizon) };
    expect(wrongQuantity(asShipped as SceneTheme)).toEqual(['skyHorizon']);
    const mirrored = { ...light, plate: inverseToneMap(hexToLinear(AUTHORED_HEX.light.plate)) };
    expect(wrongQuantity(mirrored as SceneTheme)).toEqual(['plate']);
    const mirroredNoClamp = {
      ...light, structure: inverseToneMap(hexToLinear(AUTHORED_HEX.light.structure)),
    };
    expect(wrongQuantity(mirroredNoClamp as SceneTheme)).toEqual(['structure']);
  });

  it('and the defect was worth catching — as shipped the light sky was 25 Rec.601 luma below its hex', () => {
    /*
     * The magnitude, so a reader knows this is not a rounding argument. Derived from the authored hex
     * and the pipeline's own curve; no byte in this test is typed.
     */
    const bytes = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const luma = (b: number[]): number => 0.299 * b[0]! + 0.587 * b[1]! + 0.114 * b[2]!;
    const hex = AUTHORED_HEX.light.skyHorizon;
    const authored = luma(bytes(hex));
    const asShipped = luma(bytes(rendered(hexToLinear(hex))));
    const asFixed = luma(bytes(rendered(sceneTheme('light').skyHorizon)));
    expect(authored - asShipped,
      `authoring the light sky as a reflectance cost ${(authored - asShipped).toFixed(1)} luma`)
      .toBeGreaterThan(20);
    expect(asFixed, 'converted at the boundary, the sky renders at the luma it was authored with')
      .toBe(authored);
  });

  it('DARK does not move under this change, and the reason is why the defect hid there for so long', () => {
    /*
     * Every consumer of the three radiance fields guards dark with `th.name === 'dark' ? undefined : …`,
     * so no dark frame reads them at all — that is reachability and it is checked in `apps/web`, not
     * here. What IS checkable here is the stronger statement: at dark's radiance levels the curve is
     * the identity TO THE BYTE, so even a dark consumer added tomorrow would render the same pixels
     * under either quantity. A light sky is where the two readings diverge, which is exactly why this
     * shipped undetected until the platform grew one.
     */
    for (const f of RADIANCE_FIELDS) {
      const hex = authoredHexOf('dark', f).toLowerCase();
      expect(rendered(hexToLinear(hex)).toLowerCase(),
        `dark ${f} read as a reflectance no longer encodes to ${hex}; dark now DEPENDS on the quantity`)
        .toBe(hex);
      expect(rendered(sceneTheme('dark')[f]).toLowerCase()).toBe(hex);
    }
  });

  it('no authorable hex can push a stop past the pole, and that is arithmetic rather than luck', () => {
    /*
     * `inverseToneMap` is `y/(1-0.4y)`: it diverges at `PRECOMP_POLE` and is NEGATIVE above it, so a
     * stop past the pole renders BLACK with no other symptom. `hexToLinear` ranges over [0,1] and the
     * conversion is monotone, so #FFFFFF is the worst case any hex can produce — asserted rather than
     * argued, and then every shipped stop is checked against it.
     */
    const worst = Math.max(...inverseToneMap(hexToLinear('#FFFFFF')));
    expect(worst).toBeCloseTo(PRECOMP_CLIP, 12);
    expect(worst).toBeLessThan(PRECOMP_POLE);
    for (const name of THEMES) {
      for (const f of RADIANCE_FIELDS) {
        const m = Math.max(...sceneTheme(name)[f]);
        expect(m, `${name}.${f} is above the value the curve can still move`).toBeLessThanOrEqual(worst);
      }
    }
  });
});

describe('the light theme is a considered inversion, not a lightened dark one', () => {
  const dark = sceneTheme('dark');
  const light = sceneTheme('light');

  it('inverts the value structure — light ground is brighter than dark ground, by a lot', () => {
    /* Luminance, not a channel: a ground that is merely a different hue at the same value would read
       as a colour cast rather than as a lit page. */
    const luma = (c: readonly number[]) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    expect(luma(light.ground)).toBeGreaterThan(luma(dark.ground) * 20);
  });

  it('the light ground is NOT white, or a highlight has nowhere to go', () => {
    /*
     * #FFFFFF as a ground makes every specular clip to the same value as the floor and the object
     * loses its silhouette. Pinned as an upper bound rather than an exact value so the tint can be
     * tuned without this test becoming a copy of the constant.
     */
    const luma = (c: readonly number[]) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    expect(luma(light.ground)).toBeLessThan(0.92);
  });

  it('takes a STRONGER key and a WEAKER ambient on light, which is not the intuition', () => {
    /*
     * ForgeBackdrop established this by hand on the live sign-in screen: 5.2 -> 7.4 key,
     * 1.15 -> 0.62 ambient, 0.9 -> 0.62 shadow. On a bright ground the bounce already fills the
     * scene, so ambient adds haze rather than form and form has to come from the key; and a hard
     * shadow on a white plate reads as dirt rather than as contact.
     *
     * Pinned as DIRECTIONS, not values, so the rig can be retuned without breaking the test — what
     * must not change is the relationship, because getting it backwards is the failure that makes a
     * light scene look washed out and sends the next person to lighten the albedo instead.
     */
    expect(light.keyGain).toBeGreaterThan(dark.keyGain);
    expect(light.ambientGain).toBeLessThan(dark.ambientGain);
    expect(light.shadowStrength).toBeLessThan(dark.shadowStrength);
  });

  it('fog follows the horizon in both themes, or the scene seams where it should dissolve', () => {
    for (const t of [dark, light]) {
      expect(t.fog, `${t.name} fog must equal its sky horizon`).toEqual(t.skyHorizon);
    }
  });
});

describe('liveTheme reads the switch the platform actually uses', () => {
  it('defaults to LIGHT with no document, because the platform default is light', () => {
    /* A server render that guessed dark would flash to light on hydration. index.html adds `.dark`
       only from stored preference and there is no prefers-color-scheme fallback anywhere in the app. */
    const doc = (globalThis as { document?: unknown }).document;
    try {
      delete (globalThis as { document?: unknown }).document;
      expect(liveTheme()).toBe('light');
    } finally {
      if (doc !== undefined) (globalThis as { document?: unknown }).document = doc;
    }
  });
});
