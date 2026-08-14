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
 */
import { describe, expect, it } from 'vitest';
import { sceneTheme, liveTheme, type SceneTheme, type ThemeName } from './theme.js';
import { BRAND_HEX, hexToLinear, linearToHex } from './colour.js';

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
