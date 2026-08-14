/**
 * L2 · THE SCENE THEME — the one place that knows a lit scene has to survive a white page.
 *
 * ── THE DEFECT THIS EXISTS TO CLOSE ─────────────────────────────────────────────────
 * Seven of the eight shipping 3-D surfaces have NO theme adaptation whatsoever. Every `dark`
 * token in them is prose inside a comment; only `ForgeBackdrop` branches on the class. And the
 * platform DEFAULTS TO LIGHT — `index.html` adds `.dark` only from stored preference, and the
 * command deck strips it deliberately for printing. So the ordinary case, the one a first-time
 * reader gets, is a lit interior authored against a near-black ground painted onto a white card.
 *
 * ── THE LINE THIS FILE DRAWS, AND WHY IT IS THE WHOLE DESIGN ────────────────────────
 * §6 rule 5 fixes the brand hex exactly: a data-encoding colour is DATA, and `assertBrandFidelity`
 * proves it survives the pipeline. So a theme may NOT tint a mark to suit its background — that
 * would be editing the measurement to flatter the page.
 *
 * But not every colour in a scene is data. `BRAND_HEX` already says so in its own comments: `rule`
 * is "structure — axes, ticks. RECEDES", and `plate` is "plate background". Those are ROLES, and a
 * role that must recede against #0E1628 cannot be the same value that recedes against #FFFFFF.
 * `#26355A` does not recede on a white card; it reads as near-black ink.
 *
 *   DATA — never moves, per theme or ever:  brand, brandBright, brandDeep, reference, refusal
 *   SCENERY — must move with the theme:     ground, structure, plate, rule, sky, and the light rig
 *
 * That taxonomy is the deliverable. The implementation below is bookkeeping around it, and
 * `theme.test.ts` pins the boundary so a future edit cannot quietly move a data colour into scenery.
 *
 * ── WHY THESE VALUES AND NOT AN ALGORITHM ───────────────────────────────────────────
 * The obvious idea — invert or rotate the dark palette for light — was not taken. A lit scene is
 * not a stylesheet: ambient gain, key intensity, shadow strength and the sky all interact through
 * one tone map, and inverting an albedo while holding the light rig gives a milky grey that reads
 * as a rendering fault. `ForgeBackdrop` had already solved this by hand on the live sign-in screen
 * and its numbers are the worked example these follow: ground #080C15 -> #D7DEEA, plinth
 * #161D2E -> #AEBACD, ambient 1.15 -> 0.62, key 5.2 -> 7.4, shadow 0.9 -> 0.62.
 *
 * Note the direction of the last three, because it is not the intuition: the LIGHT theme takes a
 * STRONGER key and a WEAKER ambient and WEAKER shadows. On a bright ground, bounced light already
 * fills the scene, so ambient adds haze rather than form, and a hard shadow on a white plate reads
 * as dirt. Form has to come from the key instead.
 */
import { hexToLinear, type Linear } from './colour.js';

export type ThemeName = 'dark' | 'light';

/**
 * The scenery half of a scene. Every field here is a ROLE, not a colour anyone chose for its own
 * sake — which is why swapping them wholesale is legitimate and swapping a brand hex is not.
 */
export interface SceneTheme {
  readonly name: ThemeName;
  /** The floor or backdrop a scene sits on. The single largest area, so it sets the read. */
  readonly ground: Linear;
  /** Plinths, walls, rails — the geometry that holds data up without being data. */
  readonly structure: Linear;
  /** Panel and card fills behind projected DOM text. Must clear contrast against that text. */
  readonly plate: Linear;
  /** Axes, ticks, hairlines. Recedes by construction, which is a different value per ground. */
  readonly rule: Linear;
  /** Two stops of the analytic sky: horizon then zenith. Also the ambient IBL source. */
  readonly skyHorizon: Linear;
  readonly skyZenith: Linear;
  /** Multiplies the environment contribution. Lower on light, where the ground already bounces. */
  readonly ambientGain: number;
  /** Key light intensity. HIGHER on light — form has to come from somewhere once ambient drops. */
  readonly keyGain: number;
  /** 0 = no shadow, 1 = full. Softer on light: a hard shadow on a white plate reads as dirt. */
  readonly shadowStrength: number;
  /** Height-fog colour. Follows the sky or it will not agree with the horizon behind it. */
  readonly fog: Linear;
}

/*
 * FOG follows the sky rather than carrying its own authored value, because a fog colour that does
 * not match the horizon behind it produces a visible seam exactly where the scene is meant to
 * dissolve. So it is derived, not declared — one fewer number to keep in step by hand.
 */
const THEMES: Readonly<Record<ThemeName, SceneTheme>> = Object.freeze({
  dark: Object.freeze({
    name: 'dark' as const,
    ground: hexToLinear('#070B14'),
    structure: hexToLinear('#141F35'),
    plate: hexToLinear('#0E1628'),
    rule: hexToLinear('#26355A'),
    skyHorizon: hexToLinear('#131C31'),
    skyZenith: hexToLinear('#050810'),
    ambientGain: 1.15,
    keyGain: 5.2,
    shadowStrength: 0.9,
    fog: hexToLinear('#131C31'),
  }),
  light: Object.freeze({
    name: 'light' as const,
    /*
     * NOT WHITE. #FFFFFF as a ground leaves a lit surface nowhere to go: every highlight clips to
     * the same value as the floor and the object loses its silhouette. #E8EDF6 is the platform's
     * own page tint deepened just enough that a white specular still reads as brighter than the
     * ground it sits on, which is the whole job of a ground.
     */
    ground: hexToLinear('#E8EDF6'),
    structure: hexToLinear('#C3CEE0'),
    /* Matches --card (#FFFFFF) so a panel on a light page is the page's own card, not a grey box. */
    plate: hexToLinear('#FFFFFF'),
    /* --line is 185 198 224 (#B9C6E0); the scene's rule is that role, so it takes that value. */
    rule: hexToLinear('#B9C6E0'),
    skyHorizon: hexToLinear('#DCE5F3'),
    skyZenith: hexToLinear('#F4F7FC'),
    ambientGain: 0.62,
    keyGain: 7.4,
    shadowStrength: 0.62,
    fog: hexToLinear('#DCE5F3'),
  }),
});

/** The scenery for a theme. Data colours are NOT here and never will be — see the header. */
export function sceneTheme(theme: ThemeName): SceneTheme {
  return THEMES[theme];
}

/**
 * Which theme is live, read from the DOM the platform actually uses.
 *
 * `document.documentElement.classList.contains('dark')` is the app's own switch — `index.html`
 * adds it from stored preference and the print path strips it. Defaults to LIGHT with no document,
 * which is the honest default: the platform's default is light, and a server render that guessed
 * dark would flash to light on hydration.
 */
export function liveTheme(): ThemeName {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}
