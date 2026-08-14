/**
 * L2 · SEMANTIC STATUS COLOUR — the third category, and the one the palette did not have.
 *
 * ── THE DIVERGENCE THIS EXISTS TO CLOSE ─────────────────────────────────────────────
 * E6 THE VAULT draws a BLOCKED audit record in `#C9552B` (`VaultReliefGl.tsx:118`) and E3 THE
 * PIPELINE ends its staleness ramp at the same literal (`PipelineReliefGl.tsx:132`). The flat
 * product renders blocked in `--red`: `text-status-blocked` appears at 245 sites across
 * `apps/web/src`, and `tailwind.config.js:44` binds that role to `--red`. One product, two
 * colour languages — and a reader who learns the language on the table is misled by the scene.
 *
 * Measured, in CIE Lab, on the actual token values:
 *
 *     #C9552B  vs  --red light #a32035    23.8 deg of hue
 *     #C9552B  vs  --red dark  #e4687a    30.8 deg
 *     #C9552B  vs  reference   #FF8A3D    10.0 deg   <- ITS NEAREST PALETTE HUE IS A DATA COLOUR
 *
 * So the shipped value is not a slightly-wrong red. It sits inside the `reference` hue family,
 * which `colour.ts` reserves for percentiles, thresholds and targets and calls "deliberately not
 * a data hue". `VaultReliefGl.tsx:923` already describes its own three swatches as "blue, red and
 * steel" — the author's mental model was red all along; the constant was not.
 *
 * ── THE THREE CATEGORIES, BECAUSE TWO WAS NOT ENOUGH ────────────────────────────────
 * `theme.ts` splits a scene into DATA (never moves) and SCENERY (must move). Status is neither:
 *
 *   IDENTITY  `#2C6BFF` is LCX blue. It means "this is our data". It does not move, ever, and
 *             it is not a status — the ORDINARY case of a dataset is identity, not "healthy".
 *   STATUS    a semantic role the whole product shares: blocked, warning, ready. Its VALUE is
 *             the platform's to define and it differs per theme; what a scene must preserve is
 *             the ROLE, not the number. That is why binding here does not violate rule 5: the
 *             scene is not tinting a measurement to flatter the page, it is deferring to the
 *             platform's own definition of a word.
 *   ABSENCE   `refusal` #6B7A99 means "no measurement". Rule 6 depends on it never reading as a
 *             low value, and it is NOT a status. Nothing here folds into it.
 *
 * ── WHAT "MATCHES THE PLATFORM" CAN MEAN ON A LIT SURFACE, AND WHAT IT CANNOT ───────
 * Commit fd7fa0d measured this and the answer is not negotiable. A lit material's radiance is
 * base colour x illumination, and the whole frame is then tone-mapped: brand blue leaves the
 * flat path as `#2c68dc` (dE76 18.3) and lands 46-88 dE from its hex on the lit path. "Hex
 * exact" over a shaded mesh is a CATEGORY ERROR, not a bug.
 *
 * So a status colour in a scene CANNOT match the token's pixel, and any test asserting it does
 * would be the `assertBrandFidelity` mistake a second time. What transfers is:
 *
 *   HUE FAMILY — illumination is (near enough) achromatic here and the tone map is per channel,
 *                so the hue survives to within the desaturation the curve causes. A red slab
 *                renders as a red slab.
 *   ORDER      — the curve is monotone per channel, so a denser mark never renders lighter than
 *                a sparser one.
 *
 * Lightness does NOT transfer, and that is the reason ADMISSION below is decided on hue alone:
 * in a lit scene lightness is not available as a discriminator. Two albedos of the same hue and
 * different lightness render at overlapping lightnesses depending only on where each sits
 * relative to the key light. The globe already proved it in the other direction — `GlobeReliefGl.tsx:463`
 * draws its brand pins at `MARKER_AMBIENT = 120` against a `BODY_AMBIENT` of 1.6, because brand
 * blue against a plate-level sky returns about 0.02 of linear radiance.
 *
 * ── WHY THE TABLE IS RECORDED HERE AND NOT READ FROM THE DOM ────────────────────────
 * A `getComputedStyle` read would be drift-proof by construction, and it was refused: this
 * package's vitest environment is `node` with no DOM ON PURPOSE (`vitest.config.ts`), the
 * `docs/3d/*` harnesses never load `tokens.css`, and a silent fallback would hand a harness the
 * light triples while it renders dark. Instead the values are recorded and `semantic.test.ts`
 * parses `apps/web/src/styles/tokens.css` and `apps/web/tailwind.config.js` and fails if either
 * moves. `theme.ts` copies `--card` and `--line` by hand with a comment; this is that same copy
 * with the check the comment could not perform.
 */
import { BRAND, BRAND_HEX, linearToHex, srgbToLinear, type BrandKey, type Linear } from './colour.js';
import { sceneTheme, type ThemeName } from './theme.js';

/**
 * The platform's semantic roles, as `tailwind.config.js` defines them under `status`.
 *
 * The `-bg` half of each pair is deliberately absent and is not an omission: a badge fill is a
 * flat-UI construct with no counterpart in a scene, where "behind" is the theme's ground rather
 * than a rectangle. `deferred-bg` binds `--ice-soft` and `unverified-bg` is an inline rgba, so
 * the flat side does not even treat them as a palette family.
 */
export type StatusRole = 'ready' | 'conditional' | 'blocked' | 'deferred' | 'unverified';

/** sRGB bytes, exactly as `tokens.css` writes them, so the test's comparison is an equality. */
type Srgb = readonly [number, number, number];

interface RoleRecord {
  /** The CSS custom property `tailwind.config.js` binds this role to. */
  readonly token: string;
  readonly srgb: Readonly<Record<ThemeName, Srgb>>;
}

/*
 * Both themes for every role, because a role defined in one theme and not the other keeps the
 * other theme's value on a switch — the silent half-swap `theme.test.ts` guards for scenery.
 */
const ROLES: Readonly<Record<StatusRole, RoleRecord>> = Object.freeze({
  ready: { token: '--green', srgb: { light: [30, 122, 74], dark: [45, 180, 130] } },
  conditional: { token: '--amber', srgb: { light: [138, 95, 0], dark: [230, 160, 40] } },
  blocked: { token: '--red', srgb: { light: [163, 32, 53], dark: [228, 104, 122] } },
  deferred: { token: '--grey', srgb: { light: [90, 98, 114], dark: [148, 160, 182] } },
  unverified: { token: '--indigo', srgb: { light: [79, 70, 229], dark: [129, 140, 248] } },
});

export const STATUS_ROLES: readonly StatusRole[] = Object.freeze(
  Object.keys(ROLES) as StatusRole[],
);

/** Which CSS custom property a role is bound to. Printed by a surface that states its sources. */
export function statusToken(role: StatusRole): string {
  return ROLES[role].token;
}

/**
 * The role's colour as a LINEAR albedo, ready for a lit material's `baseColour`.
 *
 * Linear because every blend, accumulation and blur in this pipeline happens in linear light and
 * sRGB is encoded exactly once at output — handing a shader the sRGB triple is the mistake
 * `colour.ts` calls "the single most common reason WebGL work looks cheap".
 */
export function statusAlbedo(role: StatusRole, theme: ThemeName): Linear {
  const s = ROLES[role].srgb[theme];
  return [srgbToLinear(s[0] / 255), srgbToLinear(s[1] / 255), srgbToLinear(s[2] / 255)];
}

/**
 * The same colour as `#RRGGBB`, for a DOM legend swatch beside the canvas.
 *
 * It is the TOKEN's value, not the rendered pixel — those differ by the illumination and the tone
 * map, which is measured and unavoidable (see the header). A swatch claiming to sample the frame
 * cannot be computed statically, and the honest statement a legend can make is "this is the role",
 * not "this is the pixel".
 */
export function statusHex(role: StatusRole, theme: ThemeName): string {
  return linearToHex(statusAlbedo(role, theme));
}

/* ── THE METRICS THE INVARIANT IS STATED IN ────────────────────────────────────────────
 * CIE Lab, D65, so hue is an angle a reviewer can re-measure rather than an impression. Local
 * rather than in `colour.ts` because their job is to DERIVE the admission below, not to grade a
 * colour, and grading is the one thing that file forbids.
 */
const LAB_M: readonly (readonly [number, number, number])[] = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.0721750],
  [0.0193339, 0.1191920, 0.9503041],
];
const WHITE: readonly [number, number, number] = [0.95047, 1.0, 1.08883];

function lab(c: Linear): readonly [number, number, number] {
  const f = (v: number): number => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  const [fx, fy, fz] = LAB_M.map((r, i) => f((r[0] * c[0] + r[1] * c[1] + r[2] * c[2]) / WHITE[i]!));
  return [116 * fy! - 16, 500 * (fx! - fy!), 200 * (fy! - fz!)];
}

/** Lab hue angle in degrees, 0..360. */
export function hueAngleDeg(c: Linear): number {
  const [, a, b] = lab(c);
  return (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
}

/** Lab chroma. Distance from the neutral axis — how much hue there is to be distinguished BY. */
export function chroma(c: Linear): number {
  const [, a, b] = lab(c);
  return Math.hypot(a, b);
}

/** Shortest angular distance between two hues, 0..180. */
export function hueDistanceDeg(a: Linear, b: Linear): number {
  return Math.abs(((hueAngleDeg(a) - hueAngleDeg(b)) + 540) % 360 - 180);
}

/**
 * WCAG-shaped ratio on Rec. 709 luminance — what survives a greyscale print or a monochromat.
 *
 * Not a contrast claim about text: nothing here is text. It is the redundancy check
 * `PipelineReliefGl.tsx:473` promises when it says colour repeats the height "deliberately"
 * because a single-channel encoding "fails for anyone reading at a glance or in greyscale".
 */
export function greyscaleRatio(a: Linear, b: Linear): number {
  const y = (c: Linear): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const [p, q] = [y(a), y(b)];
  return (Math.max(p, q) + 0.05) / (Math.min(p, q) + 0.05);
}

/**
 * 15 degrees = 360 / 24, the granularity at which hues get separate names.
 *
 * ONE constant for both directions of the invariant, because it is one question — do these two
 * colours fall in the same named hue bucket:
 *   · a surface's status colour must be WITHIN it of the platform token (same role, same hue);
 *   · a status colour must be OUTSIDE it of every data colour (different meaning, different hue).
 *
 * The verdicts below are robust to the choice, which is the honest way to report a threshold:
 * every admitted role clears 19.7 deg and every refused one is inside 9.4 deg, so anything from
 * 10 to 19 produces the same five answers.
 */
export const HUE_BUCKET_DEG = 15;

/**
 * DERIVED, not written down: which palette keys are DATA.
 *
 * A `BRAND_HEX` key is scenery exactly when `SceneTheme` has a field of that name — `plate` and
 * `rule` do, the other five do not. Deriving it means a sixth data colour is covered on the day
 * it is added, which a hand-list cannot be. If somebody ever adds a `SceneTheme` field named
 * after a data colour this misclassifies it, and `theme.test.ts` is the test that fails first.
 */
const SCENERY_FIELDS: ReadonlySet<string> = new Set(Object.keys(sceneTheme('dark')));
const DATA_KEYS: readonly BrandKey[] = Object.freeze(
  (Object.keys(BRAND_HEX) as BrandKey[]).filter((k) => !SCENERY_FIELDS.has(k)),
);

/** The chroma at or below which a colour has no hue to be distinguished by — `refusal`'s own. */
const ACHROMATIC_CEILING = chroma(BRAND.refusal);

export interface StatusAdmission {
  readonly role: StatusRole;
  /** May this role be used as a mark colour in a lit scene at all? */
  readonly admitted: boolean;
  /** The data colour it comes closest to in hue, and by how much, in its worst theme. */
  readonly nearestDataKey: BrandKey;
  readonly nearestDataDeg: number;
  /** Its worst-theme chroma, against `ACHROMATIC_CEILING`. */
  readonly minChroma: number;
  /** Why, in words, naming the measurement. Printed by a surface that refuses a role. */
  readonly reason: string;
}

/*
 * ADMISSION IS COMPUTED FROM THE PALETTE, NOT DECLARED.
 *
 * Two of the five roles are inadmissible in a scene, and neither is a taste call — both were
 * measured, and both would have shipped as a plausible-looking mapping:
 *
 *   unverified  --indigo dark #818cf8 is 0.4 deg of hue from brand blue (light: 9.4 deg). In a
 *               scene where brand blue means "this is our data", an unverified mark would be
 *               indistinguishable from an ordinary observed one at exactly the moment the
 *               distinction matters.
 *   deferred    --grey has chroma 10.1 light / 12.8 dark, BELOW `refusal`'s 18.6, so it has no
 *               hue signal at all; what it has is `refusal`'s hue (1.2 deg light, 3.1 deg dark)
 *               at another lightness. Lightness is the discriminator a lit scene does not have,
 *               and E6, E3 and E7 all already draw a refusal neutral. Two near-neutrals in one
 *               frame, one meaning "we chose not to" and one meaning "no measurement", is the
 *               exact confusion rule 6 exists to prevent.
 *
 * Declaring these by hand would make the verdicts unfalsifiable; computing them means a token
 * retune flips the verdict and the test says so.
 */
const ADMISSIONS: Readonly<Record<StatusRole, StatusAdmission>> = Object.freeze(
  Object.fromEntries(STATUS_ROLES.map((role): [StatusRole, StatusAdmission] => {
    let nearestDataKey: BrandKey = DATA_KEYS[0]!;
    let nearestDataDeg = 180;
    let minChroma = Infinity;
    for (const theme of ['light', 'dark'] as const) {
      const c = statusAlbedo(role, theme);
      minChroma = Math.min(minChroma, chroma(c));
      for (const key of DATA_KEYS) {
        const d = hueDistanceDeg(c, BRAND[key]);
        if (d < nearestDataDeg) { nearestDataDeg = d; nearestDataKey = key; }
      }
    }
    const hasHue = minChroma > ACHROMATIC_CEILING;
    const separated = nearestDataDeg >= HUE_BUCKET_DEG;
    const reason = !hasHue
      ? `chroma ${minChroma.toFixed(1)} does not exceed refusal's ${ACHROMATIC_CEILING.toFixed(1)}`
        + `, so it carries no hue signal and would be a second absence-coloured neutral`
      : !separated
        ? `${nearestDataDeg.toFixed(1)} deg of hue from the data colour ${nearestDataKey}`
          + `, inside the ${HUE_BUCKET_DEG} deg bucket, so a reader cannot tell them apart`
        : `chroma ${minChroma.toFixed(1)} and ${nearestDataDeg.toFixed(1)} deg from the nearest`
          + ` data colour (${nearestDataKey}) in its worst theme`;
    return [role, Object.freeze({
      role, admitted: hasHue && separated, nearestDataKey, nearestDataDeg, minChroma, reason,
    })];
  })),
) as Readonly<Record<StatusRole, StatusAdmission>>;

/** Whether a role may colour a mark in a lit scene, and the measurement that decides it. */
export function statusAdmission(role: StatusRole): StatusAdmission {
  return ADMISSIONS[role];
}

/** The roles a scene may use. Derived from the palette, so a token retune moves this list. */
export function sceneStatusRoles(): readonly StatusRole[] {
  return Object.freeze(STATUS_ROLES.filter((r) => ADMISSIONS[r].admitted));
}

/**
 * What a surface prints under itself when it binds a status role, so the claim on screen is the
 * one this file can defend. It says hue and order, and it does not say hex.
 */
export const STATUS_POLICY =
  'Status colour is the platform\'s, not the scene\'s: blocked, warning and ready take '
  + '--red, --amber and --green and resolve per theme, so the table and the scene name a state '
  + 'the same way. What matches is the HUE FAMILY and the ORDER, never the pixel — a lit '
  + 'material\'s radiance is albedo x illumination and the whole frame is tone-mapped, so an '
  + 'exact hex over a shaded mesh is not a coherent thing to ask for (docs/3d/w2/COLOUR_LANGUAGE.md). '
  + 'Identity colour (#2C6BFF) and the absence mark (#6B7A99) are NOT status and do not move.';
