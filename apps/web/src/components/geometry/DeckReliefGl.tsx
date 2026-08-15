/**
 * E1 THE THEATRE, as a product component rather than a harness.
 *
 * `docs/3d/e1` proved the environment; this is the part that ships. `3D_VFX_1000X.md` §2: "the command deck as a
 * physical operations room — panels are lit planes floating in depth on a dark deck plate, a shallow-DOF camera
 * that racks focus to the panel you address."
 *
 * ── WHAT IT DRAWS, AND WHAT IT DELIBERATELY DOES NOT ─────────────────────────────────
 * The deck's panel SET, not the page. Each slab carries that panel's HEADING and the one count the panel leads
 * with — the same strings the flat grid shows, passed in by the page that owns them. The gating list, the
 * workstream rows, the partner bars and the risk grid are NOT here: projecting a live table onto a turned surface
 * would put interactive controls behind a homography and truncate the rest. The frame says so on itself, because a
 * view that quietly carries less than the one it replaced is the §7(b) failure this programme keeps finding.
 *
 * ── THE READING IT ADDS OVER A FLAT GRID ─────────────────────────────────────────────
 * A grid of cards gives every panel equal weight. Here DEPTH ORDER states which panel is being addressed and the
 * focus rack states it again — two independent cues for one fact. At rest nothing is addressed, the lens is OFF,
 * and the depth order is the deck's own sequence. That is `docs/3d/e1/README.md`'s own conclusion, quoted: "the
 * wide aperture is a hero frame, not an operator surface. A shipping version racks focus on interaction and sits
 * at dof=0 at rest." So it does.
 *
 * ── THE TEXT IS DOM, AND THAT IS THE WHOLE MECHANISM ─────────────────────────────────
 * §6 rule 4. The surfaces are GL and the words are real DOM nodes laid onto the rendered quads by a perspective
 * transform (`projectQuad`), so they stay selectable, searchable, translatable, screen-reader addressable and
 * correct at any zoom. An environment that spends those four abilities to buy a third dimension has failed §7(b)
 * before it starts. Four bugs in the harness paid for this mechanism and each is a rule below: fixed-point
 * rounding quantising the perspective terms to zero; an opaque background hiding the entire render; centred
 * content putting two panels into the refusal branch; and a blur clamp doing the work of a scale.
 *
 * ── THIS FILE IS ONLY EVER REACHED THROUGH A LAZY IMPORT ─────────────────────────────
 * `DeckRelief` imports it with `lazy()`, so neither it nor any of `@lcx/gl` lands in the initial bundle. The perf
 * budget measures RAW pre-gzip initial JS at 839/850 KB — 11 KB of headroom for the whole application — and the
 * environment layer alone is 35.7 KB.
 *
 * ── IT REFUSES RATHER THAN DEGRADING, AND THE CALLER SHOWS THE GRID ──────────────────
 * Every resource is checked. On any refusal this renders NOTHING and calls `onRefused` with a code; the parent puts
 * the grid back. §6 rule 1, and the reason the parent owns the fallback: a component that cannot construct its
 * renderer cannot be trusted to draw its own escape hatch.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  createStage, isStage, box, plane, uploadMesh, createLitRenderer, createTarget3D, createShadowMap,
  createAmbientOcclusion, createDepthOfField, createSkyBackdrop,
  projectQuad, isQuadRefusal, uprightPanelCorners, projectScreen,
  viewProjection, eyeOf, nearFarOf, lightViewProjection, boundsCentre, boundsRadius,
  hexToLinear, inverseToneMap, assertBrandFidelity, IDENTITY, TONE_MAP_GLSL, SRGB_ENCODE_GLSL,
  qualitySettings, shadowMapSizeFor, pickQualityTier,
  type LitDraw, type Viewpoint, type MeshBuffer, type Linear,
} from '@lcx/gl';
/* A SUB-PATH IMPORT, NOT THE BARREL — `docs/3d/w2/SUBPATH_COST.md`; `SurfaceReliefGl.tsx` carries the reason. */
import { sceneTheme, liveTheme, type SceneTheme, type ThemeName } from '@lcx/gl/look/theme.js';
import {
  slotsFor, rankSlots, addressOrder, fitPanelText, MAX_PANELS, MIN_PANELS,
  type DeckPanelDatum, type PanelLine,
} from './deckSlots';
import {
  useResolvedQualityTier, needsQualityProbe, measureFrameMs, recordQualityProbe,
} from '../shared/useQualityTier';

export interface DeckReliefGlProps {
  readonly panels: readonly DeckPanelDatum[];
  readonly heightPx: number;
  /** Called with a stable code when the theatre cannot be drawn. The parent then shows the grid. */
  readonly onRefused: (code: string) => void;
}

/* SHADER COMMENTS LIVE ABOVE THE LITERAL. A backtick inside a template literal terminates it — twelve times in
   this programme — and a comment inside a shader string is shipped bytes no minifier can reach. */
const PRESENT_VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/* Present through the pipeline's OWN tone curve. A second tone map here would fork the one thing in this renderer
   whose output is verified brand-exact. */
const PRESENT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${TONE_MAP_GLSL}
${SRGB_ENCODE_GLSL}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`;

/* 6 cm, not a zero-thickness plane. §2 says planes; a slab has a side edge to catch the key light and casts a
   shadow with width, which is what makes the arrangement read as objects in a room rather than as decals in fog. */
const THICKNESS = 0.06;
/* Panels turn toward the camera but NOT all the way. At 1.0 every face is square-on, the edges vanish and the arc
   flattens back into the grid this view replaces. */
const FACE_FRACTION = 0.72;
/* Content sits inside the slab's own margin. Text to the very edge reads as a texture applied to the panel; a
   margin reads as a display mounted in it. */
const PAD_U = 0.11, PAD_V = 0.10;
/**
 * THE LENS, AND IT IS DELIBERATELY SHALLOWER THAN THE HARNESS'S.
 *
 * `docs/3d/e1` renders at aperture 0.16 / maxCoc 0.014, which defocuses the far panel surfaces by 14 px — and its
 * own measurement is that a wide aperture costs an operator four of five readable panels. Its README calls that a
 * hero frame. An operator surface racks enough to say WHICH panel is addressed and no more, so the aperture is
 * 0.11 against a 0.010 ceiling here. That is a stated departure from the capture, not a tuning: the capture and
 * this frame are two different products of the same geometry.
 */
const APERTURE = 0.11;
const MAX_COC = 0.010;
/**
 * THE DOM LENS CEILING, BISECTED IN THE HARNESS — AND NOW CHECKED ON THIS FRAME RATHER THAN ASSUMED.
 *
 * The harness set 2.4 px "by reading it", then measured the glyph core against the frame's own pixels and found
 * 1.47:1 on an 11.5 px note against a 4.5:1 requirement, with 11 of 18 text runs failing WCAG AA. Bisected against
 * that measurement, the largest pair that held every run above 4.5:1 was 0.45 px of blur and 0.90 opacity. Those
 * are the numbers below.
 *
 * WHAT CHANGED: this file used to end with a sentence admitting the pair had never been re-measured on this page,
 * and adding a second lighting environment made that admission untenable — a carried number is a number about a
 * frame that no longer exists. The frame now READS ITS OWN PIXELS after the blit and picks the type colour per
 * panel from what is actually behind it, the way `VaultReliefGl` already does, and prints the worst ratio it
 * measured. The BLUR is still not modelled by that read: an alpha composite is exact and a Gaussian over glyph
 * strokes is not, so the number below stays the bisected ceiling and the printed ratio is stated as being for
 * the unblurred glyph core — which is the best case, so a run that fails there fails for certain.
 */
const DOM_BLUR_CEILING = 0.45;
const DOM_DIM_MAX = 0.10;
/** Below this the smallest slab projects under ~90 px wide, where a heading is more wrapped rows than information. */
const MIN_CSS_W = 480;
/** 1536, not 1024: this deck is 15 m across, and at 1024 a texel is 15 mm — the panel-on-panel shadows, the
 *  strongest depth cue after the rack, arrive visibly stepped. */
const SHADOW_SIZE = 1536;
/* Shifts before scales, and smaller before larger, so a panel takes the LEAST intervention that works and an
   unobstructed one takes none — which is what makes a reported shift of 0 mean "needed nothing" rather than
   "was not checked". */
const SHIFTS = [0, 0.06, -0.06, 0.12, -0.12, 0.18, -0.18, 0.24, -0.24, 0.30, -0.30, 0.36, -0.36];
const SCALES = [1, 0.92, 0.84, 0.76, 0.68, 0.60];

/**
 * THE THREE LINES OF A PANEL, AS DATA — so the fit test and the paint pass describe the same pixels.
 *
 * Every colour is a SOLID hex. They were `rgba(...,0.78)` in the harness, which multiplied with the recession
 * opacity and put an effective alpha of 0.45 on the furthest note — two dimmers stacked, and the lens is already
 * one. `charPx` is documented in `deckSlots.ts`: measured for the monospace line, deliberately generous for the
 * proportional ones, because this number decides what is DROPPED and a truncated line presented as complete is the
 * worse failure.
 */
const TAG_CHAR_PX = 7.92, TAG_LINE_PX = 14.9;
const HEAD_CHAR_PX = 16.1, HEAD_LINE_PX = 27.6;
const NOTE_CHAR_PX = 7.13, NOTE_LINE_PX = 16.7;
const LINE_GAP_PX = 7;

/**
 * ══ TWO TYPE FAMILIES, AND THE FRAME PICKS BETWEEN THEM BY MEASUREMENT ══════════════════════════════
 *
 * The panel a run of type sits on is either brand blue — data, which does not move — or the deck's structure,
 * which does. On dark that structure is #16203A and light type is the only thing that works; on light it is
 * #C3CEE0 and light type is the only thing that does not. Measured at the albedo, which is what these colours
 * ARE before the key light touches them:
 *
 *                    #FFFFFF   #EAF1FF   #7FB2FF   #C6D4EC   #1E2761   #333948   #0B1220
 *   dark  #16203A     16.13     14.23      7.46     10.78      1.17      1.40      1.16
 *   light #C3CEE0      1.59      1.40      1.36      1.06      8.71      7.27     11.79
 *   brand #2C6BFF      4.51      3.98      2.09      3.01      3.07      2.56      4.15
 *
 * Every run on a light panel fails and every run on a dark one passes, which is the whole defect this work is
 * about — and note the third row: on brand blue the LIGHT family is still the right one, so the choice cannot be
 * made per theme. It is made per panel, off the pixels, at `familyScore` below.
 *
 * THE TAG KEEPS ITS OWN VALUE WITHIN A FAMILY. It is the panel's label rather than its heading and it recedes;
 * flattening all three runs onto one colour to make the ratio simpler would delete that. What keeps the printed
 * ratio honest instead is that the score is the MINIMUM over the three runs, so the family is chosen on its
 * weakest line and the number reported is that line's.
 */
type TextFamily = 'light' | 'ink';
const familyColours = (f: TextFamily, onBlue: boolean): { tag: string; head: string; note: string } => (
  f === 'light'
    ? { tag: onBlue ? '#EAF1FF' : '#7FB2FF', head: '#FFFFFF', note: onBlue ? '#FFFFFF' : '#C6D4EC' }
    /* #1E2761 is the platform's `--navy`, #333948 its `--grey-dark`; #0B1220 is the deepest value in the scene's
       own palette and is used for the heading because that is the run with the most weight to spend. */
    : { tag: '#1E2761', head: '#0B1220', note: '#333948' }
);

const styleFor = (
  kind: 'tag' | 'head' | 'note', colours: { tag: string; head: string; note: string },
): CSSProperties => {
  if (kind === 'tag') {
    return {
      font: '600 11px/1.35 ui-monospace, monospace', letterSpacing: '.12em', color: colours.tag,
    };
  }
  if (kind === 'head') {
    return { font: '700 26px/1.06 system-ui, sans-serif', letterSpacing: '-0.01em', color: colours.head };
  }
  return { font: '400 11.5px/1.45 system-ui, sans-serif', color: colours.note };
};

/*
 * WCAG relative luminance and a ratio, kept local so the number this frame prints is the number a reader's own
 * checker would compute. `VaultReliefGl.tsx` carries an identical pair for the identical reason; both should move
 * to one module the moment a third surface needs them, which is a file neither of them owns.
 */
const relLum = (r: number, g: number, b: number): number => {
  const f = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratioOf = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const hexBytes = (hex: string): [number, number, number] => [1, 3, 5].map(
  (i) => parseInt(hex.slice(i, i + 2), 16),
) as [number, number, number];
/* Source-over in sRGB BYTES: the compositor applies the element's alpha to the ENCODED values, so the composite
   happens before `relLum`, not after. */
const overBg = (
  bg: readonly [number, number, number], a: number, fg: readonly [number, number, number],
): number => relLum(
  bg[0] + a * (fg[0] - bg[0]), bg[1] + a * (fg[1] - bg[1]), bg[2] + a * (fg[2] - bg[2]),
);

const scenery = (th: SceneTheme, darkHex: string, light: Linear): Linear =>
  (th.name === 'dark' ? hexToLinear(darkHex) : light);

/** The dark theme's record, held only as the denominator of the light rig's ratio — see `SurfaceReliefGl.tsx`,
    THE LIGHT RIG MOVES BY RATIO. Nothing reads a colour out of it. */
const TH_DARK = sceneTheme('dark');
const TH_LIGHT = sceneTheme('light');

/**
 * ══ THE RADIANCES THIS SURFACE HANDS `lit.draw`, AS ONE EXPRESSION ═══════════════════════════════════
 *
 * These were four literals sitting inside the `lit.draw` call, and the exposure solved below has to be solved
 * against the scene that is ACTUALLY DRAWN. A second copy of 3.5/3.45/3.3/1.05 in the solve would let a nudge
 * to the frame leave the solve describing a room nobody renders, and the symptom — a deck quietly off the
 * albedo it was authored with — is invisible without an instrument. So both callers go through here.
 *
 * `rig.key` and `rig.ambient` ALREADY CARRY THE EXPOSURE and carry it together, so the key/ambient ratio the
 * light theme was authored with survives the solve exactly.
 */
const litRadiance = (rig: { readonly key: number; readonly ambient: number }) => ({
  lightColour: [3.5 * rig.key, 3.45 * rig.key, 3.3 * rig.key] as [number, number, number],
  ambientGain: 1.05 * rig.ambient,
});
/**
 * ONE KEY LIGHT, 33° ABOVE THE HORIZON AND TO THE LEFT. Steeper lands almost entirely on the 6 cm top edges and
 * leaves the faces to the ambient sky, so the frame goes flat exactly where the information lives. The harness
 * measured 38° first and dropped it: a shadow falling across the panel BEHIND is the one cue that states two
 * panels are at different depths without the lens, and at 38° the reach stopped 15 cm short.
 *
 * At module scope rather than inside the effect because the exposure below is solved against it.
 */
const LIGHT_DIR: [number, number, number] = [0.62, -0.55, -0.58];
/** N·L for the deck, whose normal is the up axis: the one incidence in this scene that no layout can move. */
const DECK_NDOTL = -LIGHT_DIR[1] / Math.hypot(LIGHT_DIR[0], LIGHT_DIR[1], LIGHT_DIR[2]);

/**
 * ══ THE SKY WAS AUTHORED AS A DISPLAY COLOUR AND CONSUMED AS A RADIANCE, AND THAT DELETED THE SILHOUETTE ══
 *
 * ── WHAT WAS MEASURED, ON THE SHIPPED DRAWING BUFFER ────────────────────────────────
 * `docs/3d/app-sweep` reported this surface as the worst light regression in the app — luminance sd 27.22 →
 * 14.35, p01→p99 range 71 → 44 — under the reading that the panels were merging with the GROUND. Split into
 * the populations the frame is actually made of, by re-running this file's own projection over the drawing
 * buffer, that reading is refuted:
 *
 *                                     dark      light
 *   panel face : deck                 1.121     1.315     BETTER in light, by 17%
 *   panel face : sky, at the top edge 1.922     1.022     GONE
 *
 * Every panel stands partly above the deck plate's far edge, and it is against the SKY that its silhouette is
 * read. In dark all four slabs are 43–53 luma DARKER than the sky behind them. In light two of the four are
 * BRIGHTER than it — the step changes sign across the set — and the worst is 2.1 luma, which is no edge at all.
 *
 * ── THE MECHANISM, AND IT IS A UNITS ERROR RATHER THAN A LIGHTING ONE ───────────────
 * `env/sky.ts`'s `DEFAULT_SKY` is authored as RADIANCE: its horizon is `0.075`, which the tone map leaves at
 * 0.0728 and the encode puts at ~76/255. `look/theme.ts`'s per-theme stops are authored as DISPLAY HEXES and
 * handed to the same field. A lit surface is multiplied by the key and the ambient before the curve, so it
 * arrives near the value it was authored with; the sky is not, so `#DCE5F3` (luma 227.5) leaves the pipeline
 * at rgb(197,203,212) — 25 luma below the colour it was written as, and exactly on top of the lit slabs.
 *
 * THE COUNTERFACTUAL SETTLES IT. Drawn with `theme.ts`'s own DARK stops instead of `DEFAULT_SKY`, the DARK
 * frame collapses the same way: the sky renders rgb(19,28,49), the slabs rgb(22,27,42)…rgb(32,38,55), and the
 * worst silhouette goes 1.956 → 1.011. So the defect is which UNITS the stops are in, not the light rig — and
 * dark is only intact because it takes the `undefined` branch and never reaches them.
 *
 * ── THE FIX, IN TWO STEPS, EACH WITH ITS OWN CRITERION ──────────────────────────────
 * 1. PRE-COMPENSATE THE STOPS. `look/precompensate.ts`: write `inverseToneMap(target)` and the live,
 *    unmodified curve delivers `target`. The sky then leaves the pipeline at the colour `theme.ts` wrote.
 *    One object still goes to the backdrop AND to the lit pass, so the drawn room and every reflection of it
 *    move together — the property the note in `draw` exists to protect.
 * 2. RE-SOLVE THE EXPOSURE. Step 1 raises the ambient this scene is lit by (the horizon by 1.40x, the zenith
 *    by 1.57x), which pushes the deck to rgb(240,244,251) — 8 levels ABOVE the ground colour it was authored
 *    with. `ForgeBackdrop.lightExposure` is the precedent and this is its criterion, unchanged: the exposure
 *    at which the ground leaves the pipeline AT ITS OWN ALBEDO. Solved, not picked.
 *
 * ── THE INVERSE IS ALWAYS FINITE HERE, BY ARITHMETIC ────────────────────────────────
 * `inverseToneMap` is `y/(1-0.4y)` and its pole is at y = 2.5. Every stop above is `hexToLinear(...)`, whose
 * range is [0, 1], so the inverse is finite and at most 1/(1-0.4) = 1.6667 — which is `PRECOMP_CLIP`, the
 * largest value the curve can still move. There is no configuration of `SceneTheme` that reaches the pole.
 *
 * ── WHAT THIS DOES NOT FIX, WITH THE NUMBER ─────────────────────────────────────────
 * A ceiling remains and it is `theme.ts`'s, not this file's: with the sky at `#DCE5F3` and a slab at its own
 * `structure` albedo `#C3CEE0`, the best contrast those two hexes can produce is **1.251:1**. Dark reaches
 * 1.956 because `DEFAULT_SKY`'s horizon is not an albedo at all. The blocked change is recorded in this
 * work's return value; it is not E1's to make, because `structure` is shared by six renderers.
 */
const LIGHT_SKY = Object.freeze({
  zenith: inverseToneMap(TH_LIGHT.skyZenith),
  horizon: inverseToneMap(TH_LIGHT.skyHorizon),
  ground: inverseToneMap(TH_LIGHT.ground),
});

/**
 * THE EXPOSURE AT WHICH THE DECK LEAVES THE PIPELINE AT THE COLOUR IT WAS AUTHORED WITH.
 *
 * `ForgeBackdrop.lightExposure`'s derivation, on E1's deck under E1's rig: the deck is Lambertian
 * (metalness 0) and its normal is the up axis, so its radiance is `albedo · (key·N·L/π + sky(up)·ambient)`,
 * and the radiance that tone-maps and encodes back to `albedo` is `inverseToneMap(albedo)`. Divide, take the
 * binding channel so no channel renders brighter than authored.
 *
 * WHY THE DECK AND NOT A SLAB, which is the surface that actually takes the most key here: a slab's normal
 * yaws with where it stands, so solving on the slabs as PLACED makes the exposure a function of HOW MANY
 * PANELS THE PAGE HAS. Measured, it does: 0.894565 on the deck against 0.818541 binding on the fourth slab of
 * a four-panel deck. An exposure that moves with the dataset is an exposure under which two screenshots of the
 * same programme are not comparable — and it would move the addressed panel's brand blue with it. The deck's
 * incidence is fixed by the light direction alone. Solving instead on the BOUND — the largest N·L an upright
 * slab can take, `hypot(Lx, Lz)` = 0.839278 — gives 0.680691 and renders the deck 19 levels UNDER its albedo,
 * which trades one direction of the same defect for the other; measured and rejected.
 *
 * kd = (1-F)(1-metalness), the key's specular lobe and the environment specular are all dropped, exactly as
 * `lightExposure` drops them and for the same reason: against the full BRDF, transcribed and bisected, this
 * estimate is 0.83% LOW — 0.887128 against 0.894565 — so the solve is conservative. A model that erred the
 * other way would put the over-exposure back, and the sign of the approximation is the one to have.
 */
function lightExposure(): number {
  const albedo = TH_LIGHT.ground;
  const target = inverseToneMap(albedo);
  /* THE RIG AT EXPOSURE 1, THROUGH THE SAME EXPRESSION THE FRAME USES — see `litRadiance`. */
  const base = litRadiance({
    key: TH_LIGHT.keyGain / TH_DARK.keyGain,
    ambient: TH_LIGHT.ambientGain / TH_DARK.ambientGain,
  });
  /* `skyColour([0,1,0])` is the ZENITH stop: `smoothstep(0, 0.85, 1)` is 1. Read off `env/sky.ts` rather
     than re-derived, because a floor samples the environment along its own normal and nothing else. */
  const peak = (c: 0 | 1 | 2): number =>
    albedo[c] * ((base.lightColour[c] * DECK_NDOTL) / Math.PI + LIGHT_SKY.zenith[c] * base.ambientGain);
  return Math.min(target[0] / peak(0), target[1] / peak(1), target[2] / peak(2));
}
/** Computed once. `sceneTheme` returns a frozen record, so this cannot go stale within a page load. */
const LIGHT_EXPOSURE = lightExposure();

/**
 * DARK IS UNCHANGED BY CONSTRUCTION, NOT BY INSPECTION. `exposure` is EXACTLY 1 on dark and multiplication by
 * 1.0 is exact in IEEE 754, so `(5.2/5.2) * 1` is bit-for-bit what this file shipped. The dark rig is not
 * re-derived, re-tuned or re-checked; it is the same expression with an exact identity in it.
 */
const rigFor = (th: SceneTheme) => {
  const exposure = th.name === 'dark' ? 1 : LIGHT_EXPOSURE;
  return {
    key: (th.keyGain / TH_DARK.keyGain) * exposure,
    ambient: (th.ambientGain / TH_DARK.ambientGain) * exposure,
    /* NOT SCALED BY THE EXPOSURE. `shadowStrength` is a mix factor between lit and unlit, not a radiance;
       multiplying it would darken the shadows as a side effect of an exposure solve about the floor. */
    shadow: th.shadowStrength / TH_DARK.shadowStrength,
    exposure,
  };
};

/**
 * ONE OBJECT TO THE BACKDROP AND TO THE LIT PASS. `env/sky.ts` is the same function for the drawn sky and for
 * every reflection, so handing a themed sky to one and the default to the other makes a panel's sheen
 * disagree with the room behind it. `undefined` on dark keeps that frame on `DEFAULT_SKY`, the path it
 * shipped on and the only one of the two whose stops are in the units this field is read in.
 */
const skyFor = (th: SceneTheme) => (th.name === 'dark' ? undefined : LIGHT_SKY);

/**
 * THE HUD KEEPS ITS DARK PLATE IN BOTH THEMES, AND THAT IS A MEASUREMENT REFUTING THE OBVIOUS MOVE.
 *
 * `rgba(4,6,11,0.82)` was added as a contrast fix — the three HUD lines measured 3.6–4.0:1 on the bare sky — and
 * the instinct on a light theme is to flip it to a white chip with dark type. Measured over the two extreme
 * backgrounds a renderer can produce, which brackets every real one:
 *
 *   dark plate  over black  10.09 / 13.63 /  9.66      over white  6.27 / 8.47 / 6.00
 *   white plate over black  10.52 /  8.78 /  4.30      over white 13.83 / 11.54 / 5.65
 *
 * At 0.82 the plate dominates its background, so the DARK chip never drops below 6.00:1 on any frame either
 * theme can draw, while the white chip's amber line falls to 4.30:1 over a dark scene. Keeping it is the
 * measured-better option and it is also one fewer thing to keep in step. The chip is a self-contained surface,
 * like the globe's label boxes; only type with nothing under it has to follow the page.
 */
const HUD_PLATE = 'rgba(4,6,11,0.82)';

/**
 * THE CAPTION UNDER THE FRAME, WHICH SITS ON THE PAGE AND WAS ALREADY FAILING FOR THE DEFAULT READER.
 *
 * `rgba(196,212,240,.62)` composites against `--card`, and the platform defaults to LIGHT: measured 5.25:1 on
 * the dark card #10182B and **1.28:1 on the light card #FFFFFF**. The sentence naming which panels carry no
 * text — the §7(b) disclosure this frame exists to make — has been below the floor on the default theme since
 * it shipped. #5A6272 is the platform's own `--grey` and measures 6.13:1 on white.
 */
const CAPTION = { dark: 'rgba(196,212,240,.62)', light: '#5A6272' } as const;

interface OverlayPanel {
  readonly key: string;
  readonly panelIndex: number;
  readonly addressed: boolean;
  readonly depthRank: number;
  readonly transform: string;
  readonly ew: number;
  readonly eh: number;
  readonly blurPx: number;
  readonly opacity: number;
  readonly lines: readonly { readonly text: string; readonly style: CSSProperties }[];
}

interface Plan {
  readonly cssW: number;
  readonly cssH: number;
  /* THE THEME THE FRAME UNDER THIS OVERLAY WAS DRAWN AT. Carried rather than re-read in the render: the class
     can change between the draw and React's commit, and a disagreement there is light type on a light panel. */
  readonly theme: ThemeName;
  /** The worst measured ratio among the runs this frame actually shows, or null when nothing could be sampled.
   *  For the UNBLURRED glyph core, which is the best case — see `DOM_BLUR_CEILING`. */
  readonly worstTextRatio: number | null;
  readonly addressedIndex: number | null;
  readonly addressedTitle: string | null;
  readonly panels: readonly OverlayPanel[];
  /** Named, never summed: an operator does something different about a panel that is covered than about one whose
   *  heading will not fit on the slab it was given. */
  readonly withheld: readonly { readonly title: string; readonly reason: string }[];
  readonly notesDropped: number;
  readonly lensOn: boolean;
  /** The tier that turned the lens off, or null when the lens is off simply because nothing is addressed. */
  readonly lensOffReason: string | null;
  readonly maxCocPx: number;
}

/** Point in convex quad by consistent edge sign. A bounding-box test would claim a yawed panel covers the wedges
 *  beyond its own corners, which is exactly the region the outer panels' content is shifted into. */
const inQuad = (q: readonly { x: number; y: number }[], x: number, y: number): boolean => {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!, b = q[(i + 1) % 4]!;
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (Math.abs(cross) < 1e-9) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
};

/**
 * The refusals that belong to the DECK rather than to the renderer, in one place because the setup effect and
 * every later redraw have to make the identical judgement — a new deck arriving through the data effect below
 * reaches `draw` without passing setup again.
 */
const deckRefusal = (deck: readonly DeckPanelDatum[]): string | null => {
  /* A single panel has no ORDER to state, and the whole reading here is an ordering. */
  if (deck.length < MIN_PANELS) return 'FEWER_THAN_TWO_PANELS_NO_DEPTH_ORDER';
  /* REFUSES RATHER THAN DROPPING ONE. The arc has five measured positions; a sixth panel would have to be
     invented, and silently omitting a panel from a view of the deck is the defect E1's own frame shipped once
     and had to be corrected for. The grid carries all of them. */
  if (deck.length > MAX_PANELS) return 'MORE_PANELS_THAN_THE_ARC_HAS_POSITIONS';
  return null;
};

/**
 * WHETHER TWO DECKS ARE THE SAME DECK, WHICH DECIDES WHETHER AN ADDRESSED PANEL SURVIVES THE UPDATE.
 *
 * `addressed` is an INDEX. Carrying it across a dataset change would silently address a different panel the
 * moment the set is reordered or one is added, and the frame would state "ADDRESSING X" over Y's slab. So the
 * index survives only when every id is unchanged and in the same place; anything else returns the deck to rest,
 * which is the state that asserts nothing.
 */
const sameDeck = (a: readonly DeckPanelDatum[], b: readonly DeckPanelDatum[]): boolean =>
  a.length === b.length && a.every((p, i) => p.id === b[i]!.id);

export default function DeckReliefGl({ panels, heightPx, onRefused }: DeckReliefGlProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  /**
   * THE REDRAW LIVES IN A REF, AND THAT IS WHAT KEEPS ONE GL CONTEXT — FOR THE DATASET AS WELL AS FOR A CLICK.
   *
   * Addressing a panel changes the frame, so it needs a redraw, and if the addressed index were React state in
   * the setup effect's dependency list every click would tear the renderer down and build a new context. This
   * file shipped that half of the fix and the other six renderers were generalised from it — but its ref carried
   * only the ADDRESSED PANEL, so `panels` stayed in the setup effect and a new deck still rebuilt the context.
   * `reliefRedrawRatchet.test.ts` carried it as the last PENDING admission in the repo for exactly that reason.
   *
   * MEASURED THROUGH THE SAME COUNTING WEBGL2 CONTEXT THAT FILE USES, driven from outside the repo so the
   * numbers come from a run rather than from an estimate. One change to `panels` that keeps the deck's SIZE —
   * four panels in, four out, new headlines, which is what a data update on this page IS — cost:
   *
   *   before   1 context · 8 programs · 16 shaders · 6 VAOs · 21 bufferData · 9 textures · 8 framebuffers ·
   *            3,924 B — every byte of it identical to what was already on the GPU, i.e. the entire mount again
   *   after    0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 B, and `drawElements` still fires, so the frame is redrawn and not
   *            merely skipped
   *
   * A change of SIZE (four panels to three) keeps the context, all eight programs, all nine textures and all
   * eight framebuffers, and re-uploads 3 VAOs / 2,808 B — the slab geometry, which IS the shape.
   *
   * Now the ref carries BOTH, and the split is three-way rather than two — see THE SHAPE CACHE below, because
   * one thing here really does depend on the data: the number of panels chooses the slot set, and the slot set
   * is the geometry, the camera and the content layout. What it does NOT choose is the context, the four
   * programs, the HDR target, the shadow map, the AO pair or the DOF buffer, and those are what a rebuild was
   * throwing away on every update.
   */
  const drawRef = useRef<((deck: readonly DeckPanelDatum[], addressed: number | null) => void) | null>(null);
  /* THE LATEST DECK, so a TIER change can redraw it: the setup effect re-runs when the probe resolves a lower
     tier and the data effect below does NOT — its dependency did not change — so without this the rebuilt
     context would have nothing to put on the canvas under a caption describing a deck. */
  const panelsRef = useRef<readonly DeckPanelDatum[]>(panels);
  /* WHICH PANEL IS ADDRESSED, IN A REF AS WELL AS IN `plan`. The theme observer below is a closure created once
     per setup and cannot see React state, and it must redraw at the panel the reader has open rather than at
     rest — a theme toggle is not an interaction and must not undo one. */
  const addressedRef = useRef<number | null>(null);
  /*
   * THE TIER. Subscribed rather than read once: every frame here goes into an offscreen target and is blitted
   * only at the end, so a resolved lower tier can rebuild the deck before anything has been painted.
   */
  const tier = useResolvedQualityTier();

  /*
   * THE DATA EFFECT IS DECLARED FIRST, AND THE ORDER IS LOAD-BEARING. React runs effects in declaration order,
   * so on MOUNT this one records the deck and returns — nothing is published yet — and the setup effect draws
   * it. On a DATA CHANGE only this one re-runs, and the context is untouched.
   */
  useEffect(() => {
    const previous = panelsRef.current;
    panelsRef.current = panels;
    drawRef.current?.(panels, sameDeck(previous, panels) ? addressedRef.current : null);
  }, [panels]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    /* Any earlier overlay is dropped before a new frame exists. A projected heading from the previous deck sitting
       over a freshly drawn room is a stale picture presented as live data. */
    setPlan(null);
    drawRef.current = null;

    /* READ THROUGH THE REF, NOT THE PROP. The deck's own refusals still come before the renderer exists, and
       reading the prop here would put the dataset back in this effect's dependency list — the whole defect. */
    const firstRefusal = deckRefusal(panelsRef.current);
    if (firstRefusal !== null) { onRefused(firstRefusal); return; }

    /*
     * §6 RULE 5 BEFORE ANYTHING IS DRAWN. If the palette does not round-trip through this pipeline's tone map there
     * is no point rendering: the frame would be off-brand by an amount too small to see and too large to be exact,
     * and it would be screenshotted into a board pack.
     */
    if (assertBrandFidelity().length > 0) { onRefused('BRAND_FIDELITY_FAILED'); return; }

    const cssW = Math.round(canvas.clientWidth || 0);
    if (cssW < MIN_CSS_W) { onRefused('CANVAS_TOO_NARROW_FOR_PANEL_TEXT'); return; }
    const cssH = heightPx;
    /* DPR CAPPED AT 2. Everything in this frame is fill-bound — shadow map, prepass, AO, lit, DOF, present — so a
       3× display would triple the cost of a surface whose justification is that an operator reads it faster. */
    const Q = qualitySettings(tier);
    const dpr = Math.min(Q.dprScale, Math.max(1, window.devicePixelRatio || 1));
    const W = Math.round(cssW * dpr), H = Math.round(cssH * dpr);
    canvas.width = W; canvas.height = H;

    const out = createStage(canvas, { alpha: false });
    if (!isStage(out)) { onRefused(out.code); return; }
    const stage = out;
    const gl = stage.gl;

    let dead = false;
    const disposers: (() => void)[] = [];
    /*
     * THE SHAPE'S OWN DISPOSER LIST, DECLARED HERE AND NOT BESIDE `buildShape`, because `releaseAll` below has to
     * be able to call it. `refuse` fires from the resource block a few lines down — before any shape exists — so
     * the list has to be initialised before `releaseAll` can ever run, or the refusal path throws in the temporal
     * dead zone instead of refusing. See THE SHAPE CACHE for what goes in it.
     */
    const shape: { current: DeckShape | null; disposers: (() => void)[] } = { current: null, disposers: [] };
    const releaseShape = (): void => {
      for (const d of shape.disposers.reverse()) d();
      shape.disposers = [];
      shape.current = null;
    };
    const releaseAll = (): void => {
      /* THE SHAPE FIRST, because `refuse` is now reachable from a REDRAW as well as from the build — a late
         deck below two panels, or a GL error after the blit — and at that point the slab meshes exist. */
      releaseShape();
      for (const d of disposers.reverse()) d();
      /* THE STAGE LAST. It owns the context; releasing it before the resources built on it leaves every other
         delete* call operating on a dead context — silent rather than fatal, and it leaks on every remount. */
      stage.dispose();
    };
    const refuse = (code: string): void => {
      if (dead) return;
      dead = true;
      drawRef.current = null;
      releaseAll();
      onRefused(code);
    };

    const present = stage.compile(PRESENT_VERT, PRESENT_FRAG);
    if ('kind' in present) { refuse(present.code); return; }
    const lit = createLitRenderer(stage);
    if ('kind' in lit) { refuse(lit.code); return; }
    disposers.push(() => lit.dispose());
    const target = createTarget3D(stage, W, H);
    if ('kind' in target) { refuse(target.code); return; }
    disposers.push(() => target.dispose());
    /* `shadowMapSizeFor`, NOT the tier's absolute `shadowMapSize`. `env/quality.ts:91` records what the
       absolute value did: E0, E2 and E8 had each chosen 1024 and were handed 1536 at the default tier, so three
       captures changed without anyone saying so. SHADOW_SIZE is this deck's own choice and the tier scales it. */
    const shadow = createShadowMap(stage, shadowMapSizeFor(tier, SHADOW_SIZE));
    if ('kind' in shadow) { refuse(shadow.code); return; }
    disposers.push(() => shadow.dispose());
    const skyBox = createSkyBackdrop(stage);
    if ('kind' in skyBox) { refuse(skyBox.code); return; }
    disposers.push(() => skyBox.dispose());
    /* AO IS THE TIER'S SECOND DROP; DOF IS ITS FIRST. Neither is allocated when the tier declines it — a
       full-resolution HDR DOF buffer plus a half-res AO pair is the largest thing this component holds after
       the scene target. */
    const ao = Q.ao ? createAmbientOcclusion(stage, W, H) : null;
    if (ao && 'kind' in ao) { refuse(ao.code); return; }
    if (ao) disposers.push(() => ao.dispose());
    /*
     * DOF GOES FIRST AND THAT IS THE LADDER AGREEING WITH E1's OWN MEASUREMENT, not a coincidence: the lens is
     * the most expensive single pass (E0 measured ~6.4 ms of an 11.328 ms frame) AND E1 measured a wide aperture
     * costing an operator four of five readable panels. The most expensive pass is the one whose loss costs the
     * reader least.
     */
    const dof = Q.dof ? createDepthOfField(stage, W, H) : null;
    if (dof && 'kind' in dof) { refuse(dof.code); return; }
    if (dof) disposers.push(() => dof.dispose());

    /* THE DECK PLATE IS NOT DATA. It is 30 m of floor whatever stands on it, so it is uploaded once for the
       life of this context and is not part of the shape below. */
    const deckMeshOrRefusal = uploadMesh(stage, plane(30, 1));
    if ('kind' in deckMeshOrRefusal) { refuse(deckMeshOrRefusal.code); return; }
    const deckMesh = deckMeshOrRefusal;
    disposers.push(() => deckMesh.dispose());

    /* See THE FRAME READS ITS OWN PIXELS in `draw`: sized by W and H, which do not change for this context, so
       one allocation serves every click rather than 6.45 MB of garbage per click. */
    const pixels = new Uint8Array(W * H * 4);

    const N3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const modelOf = (x: number, y: number, z: number, yaw: number): Float32Array => {
      /* `IDENTITY` IS A FACTORY. `new Float32Array(IDENTITY)` is length 0: every vertex collapses to the origin,
         the framebuffer is complete and nothing errors. It cost E0 a day. */
      const m = IDENTITY();
      const c = Math.cos(yaw), s = Math.sin(yaw);
      // Column-major, matching the layout `uniformMatrix4fv` is given with transpose=false: a yaw of a aims the
      // box's +Z face normal at (sin a, 0, cos a).
      m[0] = c; m[2] = -s;
      m[8] = s; m[10] = c;
      m[12] = x; m[13] = y; m[14] = z;
      return m;
    };
    /* THE NORMAL MATRIX IS LIFTED OUT OF THE MODEL MATRIX, in the identical storage order, rather than
       reconstructed. `normalMat` is documented row-major and uploaded with transpose=false, and a rotation is not
       symmetric — fed the wrong way round, every panel is lit as though yawed the opposite way while its geometry
       stays put, which looks like a light in the wrong place rather than like a bug. These matrices are pure
       rotations, so the inverse-transpose IS the rotation. */
    const normalOf = (m: Float32Array): Float32Array => new Float32Array([
      m[0]!, m[1]!, m[2]!, m[4]!, m[5]!, m[6]!, m[8]!, m[9]!, m[10]!,
    ]);

    /*
     * ══ THE SHAPE CACHE — the third lifetime, and the reason "keep one context" is not enough here ══════
     *
     * `slotsFor` picks the slot SET from the panel COUNT, and the slot set is one box geometry per slab, the
     * camera's x centroid, the projection, every projected quad and the whole content-placement search. So a
     * deck that gains a panel really does have to rebuild those; a deck whose HEADLINES changed — which is what
     * a data update on this page IS — must rebuild nothing at all.
     *
     * Three lifetimes, two lists, exactly as `StormReliefGl` splits the same problem: `disposers` holds what the
     * SIZE and the TIER own and is released once on unmount; `shape.disposers` holds the panel meshes, whose
     * count and dimensions are the slot set's. A deck whose values change touches neither.
     *
     * KEYED ON THE COUNT AND NOT ON THE DECK, because the count is the only thing `slotsFor` reads. Keying on
     * the ids would rebuild five box geometries every time a headline moved, which is the cost this exists to
     * avoid wearing a cache's clothes.
     */
    interface DeckShape {
      readonly count: number;
      readonly view: Viewpoint;
      readonly eye: readonly [number, number, number];
      readonly near: number;
      readonly far: number;
      readonly vp: Float32Array;
      readonly lightVP: Float32Array;
      readonly placed: readonly {
        readonly x: number; readonly z: number; readonly w: number; readonly h: number;
        readonly yaw: number; readonly model: Float32Array; readonly normalMat: Float32Array;
        readonly mesh: MeshBuffer; readonly distance: number;
      }[];
      readonly rank: readonly number[];
      readonly depthRankOf: ReadonlyMap<number, number>;
      readonly layout: readonly {
        readonly slot: number;
        readonly chosen: {
          transform: string; ew: number; eh: number; screen: { x: number; y: number }[];
        } | null;
        readonly refusal: string | null;
      }[];
    }
    /** Builds the slot-set-dependent half of the scene, or returns null having already refused. */
    const buildShape = (count: number): DeckShape | null => {
      /*
       * THE CAMERA IS FRAMED ON THE SLOTS ACTUALLY USED, and only on their x centroid.
       *
       * Eye height 1.67 m and 7.2° of downward tilt — a person standing on the deck, not a drone above it — are
       * the harness's, and the elevation is what costs most if it drifts: past about 15° the deck plate becomes
       * the subject and the panels read as objects on a table. What is NOT the harness's is the centring: this
       * deck has four panels where the arc has five positions, so framing on x=0 would leave a half-frame of
       * empty deck.
       */
      const slots = slotsFor(count);
      const cx = slots.reduce((s, p) => s + p.x, 0) / slots.length;
      const view: Viewpoint = {
        target: [cx, 0.62, 0.1], distance: 8.4, azimuthDeg: 1.5, elevationDeg: 7.2, fovDeg: 38,
      };
      const eye = eyeOf(view);
      const FOV = view.fovDeg ?? 38;
      /* FROM THE VIEWPOINT, NOT HAND-WRITTEN: these planes linearise the depth buffer for AO and DOF, and
         linearising with planes the projection was not built from is silently wrong — the effect then describes
         a slightly different scene, which reads as its strength being mistuned. */
      const { near, far } = nearFarOf(view);
      const vp = viewProjection(view, W / H);

      /*
       * PIXELS PER METRE IS DERIVED FROM THE CANVAS, NOT A CONSTANT — and this is a correction to the harness.
       *
       * `entry.ts` fixes 250 px/m because every capture is 1200×720. In the app the canvas is whatever the page
       * is wide, and the homography SCALES the element onto the quad: a constant px/m makes the rendered type
       * shrink on a narrow viewport and swell on a wide one, so the one thing that must not change with layout
       * would. Solving for the screen scale at the target plane keeps a 26 px heading at about 26 px wherever
       * the deck is drawn, and lets the projection do the foreshortening — which is what states the depth.
       */
      const pxPerMetre = (cssW / 2) / (Math.tan((FOV * Math.PI) / 360) * view.distance);

      /* ONE GEOMETRY PER SLOT rather than one box scaled five ways. A non-uniform scale stops the normal matrix
         being a rotation, so normals tilt off the surface and the lighting rotates as the panel stretches. Five
         boxes are 60 triangles.

         UPLOADED ONE AT A TIME, EACH REGISTERED FOR DISPOSAL BEFORE THE NEXT IS ATTEMPTED. Uploading all of them
         and then checking means a failure on the last refuses while the earlier ones are still on the GPU with
         no disposer recorded — a leak on the path that is hardest to reach and repeats on every toggle. */
      const panelMesh: MeshBuffer[] = [];
      for (const s of slots) {
        const m = uploadMesh(stage, box(s.w, s.h, THICKNESS));
        if ('kind' in m) { refuse(m.code); return null; }
        panelMesh.push(m);
        shape.disposers.push(() => m.dispose());
      }

      const placed = slots.map((s, i) => {
        const yaw = Math.atan2(eye[0] - s.x, eye[2] - s.z) * FACE_FRACTION;
        // Bases ON the deck. A floating panel has no contact shadow and no AO in the join, and those two cues are
        // most of what makes a rendered object sit on a surface rather than hover over one.
        const model = modelOf(s.x, s.h / 2, s.z, yaw);
        return {
          ...s, yaw, model, normalMat: normalOf(model), mesh: panelMesh[i]!,
          distance: Math.hypot(s.x - eye[0], s.h / 2 - eye[1], s.z - eye[2]),
        };
      });

      /* Nearest by MEASUREMENT, not by declaration order: the focus target has to follow the geometry, or a later
         nudge to one z silently racks focus onto the wrong panel. */
      const rank = rankSlots(slots, eye);
      const depthRankOf = new Map<number, number>();
      /* Farthest gets the LOWEST z-index, so a nearer panel's DOM paints over the one behind it. Paint order is a
         z-index rather than an append order because DOM order is the ANNOUNCED order: appending far-to-near made
         the harness's accessibility tree read the deck backwards, and it changed if the camera moved. */
      [...rank].reverse().forEach((slotIdx, r) => depthRankOf.set(slotIdx, r));

      /*
       * WHERE ON EACH SLAB THE CONTENT GOES — SEARCHED WITH THE SHAPE, BECAUSE IT DOES NOT DEPEND ON WHAT IS
       * WRITTEN ON IT. That is why this search sits in the shape builder and not in `draw`: a new headline
       * arriving on the same deck re-uses this placement rather than re-running a 13 × 6 occlusion search.
       *
       * Centred content put two of the harness's panels straight into the refusal branch: two of each one's four
       * corners landed behind the panel standing nearer, so both outer panels went dark and three of five
       * workstreams carried nothing. The cheap fix is to loosen the occlusion test until they pass, which is a fix
       * to the INSTRUMENT and ships text lying across the wrong surface. Each panel is occluded on ONE side — the
       * side its nearer neighbour stands on — so a shift away from the occluder recovers the box without shrinking.
       *
       * There is no depth buffer in the compositor and the canvas is one element, so a projected panel necessarily
       * paints in front of ALL the geometry. Refusing to show occluded content is avoidance rather than a solution,
       * and it is the honest one: content floating over the wrong surface does not look like a bug, it looks like
       * content, and the reader attributes it to whatever it is lying on.
       */
      const faceQuad = (p: (typeof placed)[number]): { x: number; y: number }[] => {
        const c = uprightPanelCorners(p.x, p.z, 0, p.w, p.h, p.yaw, THICKNESS / 2);
        return [c.topLeft, c.topRight, c.bottomRight, c.bottomLeft].map((q) => {
          const s = projectScreen(vp, q, cssW, cssH);
          return { x: s.sx, y: s.sy };
        });
      };
      const quads = placed.map(faceQuad);

      const layout = placed.map((p, i) => {
        /* THE PROJECTED CORNERS ARE KEPT, not just the homography string: the contrast read below needs a screen
           BOX to sample the frame inside, and re-deriving one from the CSS transform would be a second expression
           of the same projection — which is how a measurement ends up describing pixels the paint pass never
           touched. */
        let chosen: { transform: string; ew: number; eh: number; screen: { x: number; y: number }[] } | null = null;
        let lastRefusal: string | null = null;
        outer: for (const scale of SCALES) {
          const cw = Math.max(0.2, (p.w - 2 * PAD_U) * scale);
          const ch = Math.max(0.2, (p.h - 2 * PAD_V) * scale);
          const ew = Math.round(cw * pxPerMetre), eh = Math.round(ch * pxPerMetre);
          for (const shift of SHIFTS) {
            /* Content overhanging the slab it is mounted on is a worse artefact than content that is occluded, so
               a shift past the panel's own edge is not a candidate. */
            if (Math.abs(shift) + cw / 2 > p.w / 2 - PAD_U * 0.5) continue;
            const cs = Math.cos(p.yaw), ss = Math.sin(p.yaw);
            const corners = uprightPanelCorners(
              p.x + cs * shift, p.z - ss * shift, PAD_V, cw, ch, p.yaw, THICKNESS / 2 + 0.008,
            );
            const proj = projectQuad(vp, corners, cssW, cssH, ew, eh);
            if (isQuadRefusal(proj)) { lastRefusal = proj.refusal; continue; }
            /* Occluded by panels the MEASUREMENT says are nearer — not by panels that merely appear earlier. */
            const covered = proj.screen.filter((c) => placed.some(
              (o, j) => j !== i && o.distance < p.distance && inQuad(quads[j]!, c.x, c.y),
            )).length;
            if (covered === 0 && proj.signedArea > 0) {
              chosen = {
                transform: proj.transform, ew, eh,
                screen: proj.screen.map((c) => ({ x: c.x, y: c.y })),
              };
              break outer;
            }
            if (proj.signedArea <= 0) lastRefusal = 'BACK_FACING';
            else lastRefusal = 'OCCLUDED_BY_A_NEARER_PANEL';
          }
        }
        return { slot: i, chosen, refusal: chosen ? null : (lastRefusal ?? 'NO_UNOCCLUDED_PLACEMENT') };
      });

      /* BOUNDS SIZED TO THE SHADOWS, NOT TO THE GEOMETRY, and derived so they cannot go stale when the panel count
         changes. Each cast shadow reaches a further ~1.13 × its panel height in +x and ~1.06 × in -z; a frustum
         fitted to the panels alone clips every tail mid-deck, which reads as the deck being dirty. */
      const maxH = Math.max(...slots.map((s) => s.h));
      const sceneMin: [number, number, number] = [
        Math.min(...slots.map((s) => s.x - s.w / 2)) - 0.8, 0,
        Math.min(...slots.map((s) => s.z)) - 1.06 * maxH - 0.8,
      ];
      const sceneMax: [number, number, number] = [
        Math.max(...slots.map((s) => s.x + s.w / 2)) + 1.13 * maxH, maxH + 0.2,
        Math.max(...slots.map((s) => s.z)) + 0.8,
      ];
      const radius = boundsRadius(sceneMin, sceneMax);
      const lightVP = lightViewProjection(
        { direction: LIGHT_DIR, colour: [1, 1, 1], extent: radius * 1.15 },
        boundsCentre(sceneMin, sceneMax), radius,
      );

      return { count, view, eye, near, far, vp, lightVP, placed, rank, depthRankOf, layout };
    };

    /** The shape for a deck, built only when the COUNT has changed. Null means it refused while building. */
    const shapeFor = (count: number): DeckShape | null => {
      if (shape.current?.count === count) return shape.current;
      releaseShape();
      shape.current = buildShape(count);
      return shape.current;
    };

    /* The circle of confusion a slab gets, in CSS pixels — one expression, so the GL lens and the DOM lens cannot
       drift apart. Depends on the canvas width and nothing the dataset chooses, so it is not part of the shape. */
    const cocOf = (d: number, focus: number): number =>
      Math.min(MAX_COC, Math.abs(1 / focus - 1 / d) * APERTURE) * cssW;

    /**
     * ONE FRAME PER CALL, AND NOTHING BETWEEN CALLS.
     *
     * §6 rule 2: no idle animation. There is no `requestAnimationFrame`, no `setInterval` and no `setTimeout` in
     * this file — a click draws exactly one frame and the GPU then goes quiet, which is also why the reduced-motion
     * case needs no branch: a still frame is already the final frame, and addressing a panel is a state change
     * rather than a transition.
     */
    /* Which theme the frame on screen was drawn at — see `SurfaceReliefGl.tsx`, A THEME CHANGE IS A REDRAW. */
    let drawnTheme: ThemeName | null = null;

    const draw = (deck: readonly DeckPanelDatum[], addressed: number | null): void => {
      if (dead) return;
      /* THE DECK'S OWN REFUSALS, ON EVERY FRAME AND NOT ONLY THE FIRST. A deck arriving through the data effect
         has not passed the setup check, and one that fell below two panels must refuse rather than draw an
         ordering of one thing. `refuse` disposes and hands the parent back its grid. */
      const late = deckRefusal(deck);
      if (late !== null) { refuse(late); return; }
      const shaped = shapeFor(deck.length);
      if (!shaped) return;
      const { view, eye, near, far, vp, lightVP, placed, rank, depthRankOf, layout } = shaped;
      const FOV = view.fovDeg ?? 38;
      /* READ PER FRAME, NOT CAPTURED AT SETUP — `ForgeBackdrop.tsx:120-127` records what the snapshot cost. */
      const th = sceneTheme(liveTheme());
      const rig = rigFor(th);
      const radiance = litRadiance(rig);
      /* PRE-COMPENSATED ON LIGHT, `DEFAULT_SKY` ON DARK — see THE SKY WAS AUTHORED AS A DISPLAY COLOUR above. */
      const sky = skyFor(th);
      addressedRef.current = addressed;
      const order = addressOrder(deck.length, addressed);
      /* Content index per depth rank: rank 0 (nearest) gets the addressed panel, then the deck's own order. */
      const panelAtSlot = new Map<number, number>();
      order.forEach((panelIdx, r) => panelAtSlot.set(rank[r]!, panelIdx));

      const addressedSlot = addressed === null ? null : rank[0]!;
      const focus = addressedSlot === null ? placed[rank[0]!]!.distance : placed[addressedSlot]!.distance;

      const draws: LitDraw[] = [
        /*
         * THE DECK AND THE SLABS SEPARATE IN BOTH THEMES, AND THE SIGN OF THE STEP FLIPS BETWEEN THEM.
         *
         * A sentence claiming "the deck is brighter than the navy panels standing on it" stood here, carried over
         * from the harness's own frame (`32/36/48` lit deck against `26/32/50` on a panel face). Measured on the
         * SHIPPED drawing buffer of this component, on `/command-deck`, it is false for the app's frame — read
         * off the projected face quads and the off-slab floor:
         *
         *              deck                     slab faces, near to far        panel : deck
         *   dark       rgb(26,28,32) luma 27.7  luma 32.2 · 35.3 · 38.7 · 41.4      1.121
         *   light      rgb(231,235,242)  234.8  luma 191.0 · 197.8 · 205.9 · 208.5  1.368
         *
         * In dark the slabs are BRIGHTER than the floor, not darker: the deck albedo `#070B14` is the darker of
         * the pair and the floor's N·L of 0.54 does not make up the difference. In light the order inverts with
         * the albedos — `ground` 0.8438 over `structure` 0.6113 — and the step is 22% LARGER than dark's, which
         * is why the light regression this file was sent to fix turned out not to live here at all. What the
         * light theme lost was the SILHOUETTE against the sky; see THE SKY WAS AUTHORED AS A DISPLAY COLOUR.
         *
         * The one part of the old note that survived measurement is the warning about the obvious levers: a
         * rougher deck came out brighter, and a lower ambient gain brightened it further while draining the
         * shadow interiors.
         */
        { mesh: deckMesh, model: modelOf(0, 0, 0, 0), normalMat: N3,
          /* SCENERY. The deck is the ground and the unaddressed panels are the structure standing on it. */
          material: { baseColour: scenery(th, '#070B14', th.ground), roughness: 0.86, metalness: 0 } },
        ...placed.map((p, i): LitDraw => ({
          mesh: p.mesh, model: p.model, normalMat: p.normalMat,
          /*
           * THE ADDRESSED PANEL CARRIES BRAND BLUE, so colour and focus agree about which panel is being addressed
           * instead of the frame arguing with itself. NEAR-DIELECTRIC, and that is a brand constraint before it is
           * a taste one: a metal has no diffuse lobe, so its colour arrives only through the specular F0 and
           * #2C6BFF would become a blue-tinted mirror of the sky rather than the brand hex (§6 rule 5).
           */
          material: i === addressedSlot
            /* DATA, in both themes. Which panel is addressed is the reading, and brand blue is how it is said. */
            ? { baseColour: hexToLinear('#2C6BFF'), roughness: 0.42, metalness: 0.06 }
            : { baseColour: scenery(th, '#16203A', th.structure), roughness: 0.48, metalness: 0.06 },
        })),
      ];

      /* A FUNCTION, SO IT CAN BE MEASURED — and it ends with `target` bound, which is what `probeSync` needs: a
         `readPixels` only guarantees completion of work affecting the framebuffer it reads. */
      const renderScene = (): void => {
        lit.shadowPass(lightVP, draws, shadow);
        target.bind();
        gl.clear(gl.DEPTH_BUFFER_BIT);
        /* The backdrop replaces a flat clear, and it is the same function the materials reflect — so a panel's
           sheen and the room behind it agree about what the room looks like. */
        skyBox.draw({ eye, target: view.target, fovDeg: FOV, aspect: W / H, sky });
        /* PREPASS → AO → LIT, forced by the data: AO reads depth and the lit pass reads AO. */
        lit.depthPrepass(vp, draws);
        if (ao) {
          ao.compute({
            depthTexture: target.depthTexture, near, far, fovDeg: FOV, aspect: W / H,
            // 0.5 m, about a third of a panel height. Larger and the occlusion stops describing the join between
            // panel and deck and starts dimming whole panels that face each other.
            radius: 0.5, strength: 1.3,
          });
          /* AO bound its own half-res framebuffer, so the rebind is INSIDE the gate. Outside it, a tier with AO
             off would render the rest of the frame at half resolution. */
          target.bind();
        }
        lit.draw({
          /* The sky fill stays at full strength: it is the only light inside a shadow, and the cheaper
             alternative was measured — 0.72 with the key raised to compensate drained the shadow interiors by
             about a fifth. */
          viewProj: vp, eye, lightDir: LIGHT_DIR,
          /* THE SAME EXPRESSION THE EXPOSURE WAS SOLVED AGAINST — see `litRadiance`. */
          lightColour: radiance.lightColour,
          ambientGain: radiance.ambientGain, sky, lightVP, shadow,
          shadowStrength: 0.92 * rig.shadow, shadowTaps: Q.shadowTaps,
          /* THE BIGGEST SHADOW MAP IN THE APP, and the one the bias fix originally missed. Without a
             baseline the scale is 1.0, so the minimum tier renders a 512 map (shadowMapSizeFor of 1536)
             with a bias tuned for 1536 — a third of the bias it needs, which at one tap is hard
             speckle. It was missed because the eight components were enumerated BY HAND and this file
             names its constant SHADOW_SIZE rather than SHADOW_BASELINE; the census test added beside
             this now derives the set from the source instead. */
          shadowBaseline: SHADOW_SIZE, draws,
          ao: ao ? ao.texture : null, screenSize: [W, H],
        });
      };

      /*
       * THE PROBE, ON THE FIRST FRAME THIS DECK DRAWS. `pickQualityTier` exists to choose a tier from a measured
       * frame and had no caller anywhere in the repo; this is one. A discarded warm-up frame first — the first
       * frame pays shader upload, and charging that to the GPU would downgrade every machine — then two
       * sync-bounded samples of which the cheaper is used, because one sample can catch a GC pause and a single
       * unlucky 40 ms would drop a fast machine for the rest of the page load.
       *
       * A LOWER TIER MEANS THIS BUILD IS STALE, so this returns without presenting and WITHOUT calling `setPlan`.
       * The projected DOM overlay must never describe a frame the reader will not see — the transforms in it are
       * a homography of THIS build's projection. The effect re-runs on the resolved tier and publishes then.
       */
      if (needsQualityProbe()) {
        const ms = measureFrameMs(gl, renderScene);
        const r = recordQualityProbe({
          pick: pickQualityTier, gl, msAtProbeTier: ms, probeTier: tier, source: 'DeckReliefGl',
        });
        if (r.tier !== tier) return;
      }

      renderScene();

      let resolved = target.texture;
      /*
       * THE LENS IS OFF AT REST, AND NOW ALSO OFF BELOW THE TOP TIER. `docs/3d/e1/README.md`: the wide-aperture
       * frame is a hero frame, and its own no-dof capture is the operator configuration. Racking with nothing
       * addressed would defocus panels to say something the frame is not saying.
       *
       * `lensOn` is ONE expression rather than three tests, because the GL lens, the DOM blur normalisation and
       * the sentence under the frame all have to agree. They did not have to before: the DOM blur was gated on
       * `addressedSlot` alone, so a tier with DOF off would have blurred real text over sharp geometry — the
       * contradiction the comment on `norm` warns about, inverted.
       */
      const lensOn = dof !== null && addressedSlot !== null;
      if (lensOn && dof) {
        dof.apply({
          scene: target.texture, depthTexture: target.depthTexture, near, far, fovDeg: FOV,
          aspect: W / H, focusDistance: focus, aperture: APERTURE, maxCoc: MAX_COC,
        });
        resolved = dof.texture;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.disable(gl.DEPTH_TEST);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, resolved);
      /* `blit` takes a CALLBACK, not a texture: the uniform is set against the program it has just bound. */
      stage.blit(present, (p) => gl.uniform1i(gl.getUniformLocation(p, 'uScene'), 0));

      /* STAMPED, because `env/quality.ts` is explicit that a tier which cannot be reported cannot be trusted. */
      canvas.dataset.qualityTier = tier;

      const err = gl.getError();
      if (err !== 0) { refuse('GL_ERROR_AFTER_DRAW'); return; }

      /*
       * ══ THE FRAME READS ITS OWN PIXELS, WHICH IS WHAT LETS THE TYPE COLOUR BE MEASURED ══════════════
       *
       * The frame is in the default framebuffer at this point, so the background under every projected run is
       * readable and the composited glyph colour is computable rather than guessable. Read ONCE, whole, into a
       * CPU buffer: five small `readPixels` calls are five pipeline stalls reading one finished frame.
       * `VaultReliefGl.tsx` does exactly this on up to 120 records and has shipped it; five panels is cheaper.
       *
       * A failed read is a NAMED ABSENCE, not a fallback to the old assumption: `worstTextRatio` goes null and
       * the sentence under the frame says the type colour was chosen without a measurement.
       *
       * THE BUFFER IS ALLOCATED ONCE PER MOUNT, NOT PER FRAME, and that is the difference between this and
       * `VaultReliefGl`'s version: a vault redraws on a page turn, this deck redraws on every CLICK, and at
       * dpr 2 on a 960 px canvas `new Uint8Array(W * H * 4)` is 6.45 MB of garbage per click. Its size is set
       * by W and H, which are fixed for the life of this context, so it belongs beside them.
       */
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      /* THE BRIGHTEST PIXEL IN THE BOX, not the mean — a mean lets a bright patch under a word average away
         against the darker slab beside it and reports a contrast no glyph has. It is the worst case for LIGHT
         type; `darkestBehind` is its mirror and is the worst case for ink, and both are needed because the two
         families are being compared. `readPixels` counts rows from the bottom, hence `H - 1 -`. */
      const extremesBehind = (
        box: readonly { x: number; y: number }[],
      ): { bright: [number, number, number]; dark: [number, number, number] } | null => {
        const xs = box.map((c) => c.x), ys = box.map((c) => c.y);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const hx = Math.max(1, (Math.max(...xs) - Math.min(...xs)) / 4);
        const hy = Math.max(1, (Math.max(...ys) - Math.min(...ys)) / 4);
        const x0 = Math.round((cx - hx) * dpr), x1 = Math.round((cx + hx) * dpr);
        const y0 = Math.round((cy - hy) * dpr), y1 = Math.round((cy + hy) * dpr);
        /* AN OFF-FRAME SAMPLE BOX REFUSES rather than clamping to the frame edge: a clamped read measures a
           background that is not behind the text, and an invented ratio is worse than a named absence. */
        if (x1 < 0 || y1 < 0 || x0 > W - 1 || y0 > H - 1) return null;
        let bright: [number, number, number] = [0, 0, 0], hi = -1;
        let dark: [number, number, number] = [0, 0, 0], lo = Infinity;
        for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
          const row = (H - 1 - y) * W;
          for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
            const i = (row + x) * 4;
            const px: [number, number, number] = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
            const l = relLum(px[0], px[1], px[2]);
            if (l > hi) { hi = l; bright = px; }
            if (l < lo) { lo = l; dark = px; }
          }
        }
        return hi < 0 ? null : { bright, dark };
      };

      const maxCocPx = Math.max(...placed.map((p) => cocOf(p.distance, focus)));
      const overlay: OverlayPanel[] = [];
      const withheld: { title: string; reason: string }[] = [];
      const measured: number[] = [];
      let notesDropped = 0;

      for (const panelIdx of order) {
        const slotIdx = [...panelAtSlot.entries()].find(([, v]) => v === panelIdx)![0];
        /* FROM THE ARGUMENT, NEVER FROM THE PROP. The setup effect no longer re-runs on a data change, so the
           `panels` this closure captured is whichever render created it — reading it here would draw the deck
           the reader arrived with under a caption describing the one they have now. */
        const datum = deck[panelIdx]!;
        const lay = layout[slotIdx]!;
        if (!lay.chosen) { withheld.push({ title: datum.title, reason: lay.refusal! }); continue; }
        const { transform, ew, eh } = lay.chosen;
        const onBlue = slotIdx === addressedSlot;

        /* A HEADLINE THE PAGE DOES NOT HAVE IS A NAMED ABSENCE, NEVER A ZERO (§6 rule 6). A gating chain with no
           gates and a count the API did not return are both "not reported", and printing 0 would assert a
           measurement nobody took. */
        const lines: PanelLine[] = [
          { text: datum.title, charPx: TAG_CHAR_PX, lineHeightPx: TAG_LINE_PX, optional: false },
          {
            text: datum.headline ?? 'NOT REPORTED',
            charPx: HEAD_CHAR_PX, lineHeightPx: HEAD_LINE_PX, optional: false,
          },
        ];
        if (datum.note) {
          lines.push({ text: datum.note, charPx: NOTE_CHAR_PX, lineHeightPx: NOTE_LINE_PX, optional: true });
        }
        const fit = fitPanelText(lines, ew - 4, eh - 2, LINE_GAP_PX);
        if (fit.refusal) { withheld.push({ title: datum.title, reason: fit.refusal }); continue; }
        if (datum.note && fit.keep[2] === false) notesDropped++;

        const cocPx = cocOf(placed[slotIdx]!.distance, focus);
        /*
         * BLUR IS NORMALISED AGAINST THE WORST PANEL IN THE SCENE, NOT CLAMPED AT A CONSTANT.
         *
         * `min(2.4, coc × 0.45)` clamped at the ceiling for every unfocused panel, so a 5.5 px circle of confusion
         * and a 14 px one came out identically blurred — the blur said only "not the subject" and the ordering it
         * existed to convey was gone. A clamp doing the work of a scale. Both lens effects are GATED on the lens
         * being on: with nothing addressed the GL frame is sharp everywhere, and blurred text on crisp geometry is
         * the same contradiction inverted.
         */
        const norm = lensOn ? cocPx / Math.max(1e-6, maxCocPx) : 0;
        const opacity = 1 - DOM_DIM_MAX * norm;

        /*
         * THE FAMILY IS CHOSEN ON ITS WEAKEST RUN, AGAINST ITS OWN WORST-CASE BACKGROUND.
         *
         * Light type is worst against the BRIGHTEST pixel behind the box and ink type against the DARKEST, so
         * each family is scored against the extreme that hurts it rather than both against one. Scoring both
         * against the brightest would flatter ink on a panel that has a dark corner in the sample box, which is
         * every panel with a cast shadow across it.
         *
         * The `opacity` in the composite is the element's own dim, which is the only alpha in play — every one
         * of the three runs is a solid hex, for the reason recorded at the top of this file.
         */
        const ext = extremesBehind(lay.chosen.screen);
        const familyScore = (f: TextFamily): number | null => {
          if (!ext) return null;
          const bg = f === 'light' ? ext.bright : ext.dark;
          const bgLum = relLum(bg[0], bg[1], bg[2]);
          const c = familyColours(f, onBlue);
          return Math.min(...[c.tag, c.head, c.note].map(
            (h) => ratioOf(overBg(bg, opacity, hexBytes(h)), bgLum),
          ));
        };
        const lightScore = familyScore('light'), inkScore = familyScore('ink');
        /* NO MEASUREMENT ⇒ THE LIGHT FAMILY, which is what this file shipped with, and the frame says the choice
           was unmeasured rather than quietly presenting it as one. */
        const family: TextFamily = lightScore === null || inkScore === null
          ? 'light' : (inkScore > lightScore ? 'ink' : 'light');
        const score = family === 'ink' ? inkScore : lightScore;
        if (score !== null) measured.push(score);

        const kind: ('tag' | 'head' | 'note')[] = ['tag', 'head', 'note'];
        const colours = familyColours(family, onBlue);
        overlay.push({
          key: datum.id,
          panelIndex: panelIdx,
          addressed: onBlue,
          depthRank: depthRankOf.get(slotIdx) ?? 0,
          transform, ew, eh,
          blurPx: DOM_BLUR_CEILING * norm,
          opacity,
          lines: lines
            .map((ln, k) => ({ text: ln.text, style: styleFor(kind[k]!, colours) }))
            .filter((_, k) => fit.keep[k]),
        });
      }

      /* RECORDED ONLY ONCE THE FRAME IS PRESENTED, so a probe that returned early cannot leave the observer
         believing a theme is on screen that never reached it. */
      drawnTheme = th.name;
      setPlan({
        cssW, cssH,
        theme: th.name,
        worstTextRatio: measured.length === 0 ? null : Number(Math.min(...measured).toFixed(2)),
        addressedIndex: addressed,
        addressedTitle: addressed === null ? null : (deck[addressed]?.title ?? null),
        /* APPENDED IN READING ORDER — addressed first, then the deck's own sequence — which is the order the
           headings are announced in. Depth is expressed as a z-index instead, so the announced order does not
           change when the reader addresses a different panel. */
        panels: overlay,
        withheld,
        notesDropped,
        lensOn,
        /* Reported as 0 when the lens is off, so the sentence under the frame cannot quote a defocus the frame
           does not have. */
        maxCocPx: lensOn ? Number(maxCocPx.toFixed(1)) : 0,
        lensOffReason: dof === null ? tier : null,
      });
    };

    drawRef.current = draw;
    /* AT REST: nothing addressed, the lens off, the depth order the deck's own. Drawn from the REF rather than
       from the prop — the prop is not in this effect's dependency list any more, so reading it here would
       capture whichever render happened to create this closure. */
    draw(panelsRef.current, null);
    /* A REFUSAL ON THE FIRST DRAW HAS ALREADY DISPOSED EVERYTHING, so there is nothing to arm a redraw against.
       Leaving `draw` published would hand a later data change a closure over a dead stage, which GL does not
       throw on — it simply draws nothing, for ever. */
    if (dead) { drawRef.current = null; return; }

    /*
     * CONTEXT LOSS RESOLVES TO THE GRID. Without this the canvas keeps its last frame for ever while the GPU has
     * dropped the context — a stale picture of a launch programme presented as live data. Registered on this canvas
     * rather than the document so it cannot fire for someone else's.
     */
    const onLost = (e: Event): void => { e.preventDefault(); onRefused('CONTEXT_LOST'); };
    canvas.addEventListener('webglcontextlost', onLost);

    /*
     * A THEME CHANGE IS A REDRAW, NOT A REBUILD — the full reasoning, including why `beforeprint` is needed for
     * `BoardReport.tsx:105-109` specifically and why the `drawnTheme` guard is what makes the other three print
     * handlers free, is in `SurfaceReliefGl.tsx` under that heading.
     *
     * THIS SURFACE REDRAWS AT ITS CURRENT ADDRESSED PANEL rather than at rest. A theme change is not an
     * interaction and must not undo one: dropping the reader back to `draw(null)` would close the panel they had
     * open, and on the print path — where the class comes off and goes back on — it would do it twice.
     */
    const redrawForTheme = (): void => {
      if (liveTheme() === drawnTheme) return;
      drawRef.current?.(panelsRef.current, addressedRef.current);
    };
    const themeWatch = new MutationObserver(redrawForTheme);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('beforeprint', redrawForTheme);

    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      themeWatch.disconnect();
      window.removeEventListener('beforeprint', redrawForTheme);
      drawRef.current = null;
      /* Already released on the refusal path, and `disposers.reverse()` MUTATES — running it twice would restore
         the original order and dispose forwards, with the stage killed before the resources built on it. */
      if (dead) return;
      dead = true;
      releaseShape();
      for (const d of disposers.reverse()) d();
      stage.dispose();
    };
    /* `tier` IS A DEPENDENCY, and that is the rebuild mechanism: a resolved lower tier tears this context down
       and builds the deck again at it. `panels` IS NOT, and that is the defect this split closes: it was this
       file's own PENDING entry in `reliefRedrawRatchet.test.ts`, the last one in the repo. */
  }, [heightPx, onRefused, tier]);

  const address = (panelIndex: number): void => {
    const fn = drawRef.current;
    if (!fn) return;
    /* Addressing the panel already addressed returns the deck to rest, which is also what Escape does. A toggle
       that cannot be undone leaves the reader in a configuration they did not choose. */
    fn(panelsRef.current, plan?.addressedIndex === panelIndex ? null : panelIndex);
  };

  return (
    <div>
      {/* `overflow:hidden` IS NOT COSMETIC. A projected element is clipped to this box or it extends the PAGE box,
          and a surface seen nearly edge-on produces a homography whose transformed bounding box runs to millions
          of pixels — which shows up as a screenshot or a scrollbar failure three layers from the cause. */}
      <div
        style={{ position: 'relative', overflow: 'hidden', width: '100%', height: heightPx }}
        onKeyDown={(e) => { if (e.key === 'Escape' && plan?.addressedIndex !== null) address(-1); }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: `${heightPx}px`, display: 'block' }}
          /* The slabs are a drawing of the panels; the TEXT on them is real DOM text (§6 rule 4), which is what a
             screen reader and the print path read. The bitmap itself is not described twice. */
          aria-hidden="true"
        />
        {plan && (
          /* THE CONTAINER IGNORES THE POINTER; THE CONTENT DOES NOT. The container must not swallow a gesture aimed
             at the canvas, and until the harness measured it, `elementFromPoint` at the centre of all five panels
             returned the CANVAS and a drag across the frame selected the empty string — the words were in the
             document and unreachable with a pointer, which is four of the five abilities the hybrid exists to keep. */
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {plan.panels.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => address(p.panelIndex)}
                aria-pressed={p.addressed}
                style={{
                  position: 'absolute', left: 0, top: 0, width: p.ew, height: p.eh,
                  /* THE HOMOGRAPHY IS EXPRESSED FROM THE ELEMENT'S TOP-LEFT. CSS defaults to `50% 50%`, which
                     shears the result — a silent, plausible-looking error. */
                  transformOrigin: '0 0', transform: p.transform,
                  zIndex: p.depthRank,
                  /*
                   * GLYPHS AND NOTHING ELSE, and this is the most instructive mistake in the harness. Reusing the
                   * page's card class put an OPAQUE background on the content, and the capture was five dark cards
                   * with a blue rim: the GGX response, the cast shadows, the AO in the join and the brand blue
                   * itself all sat behind flat DOM. That is a 2-D layout with a 3-D border — it costs the frame
                   * everything the renderer was for while keeping all of its expense.
                   */
                  background: 'transparent', border: 0, margin: 0, padding: 0, appearance: 'none',
                  display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                  gap: LINE_GAP_PX, textAlign: 'left', overflow: 'hidden',
                  filter: p.blurPx > 0 ? `blur(${p.blurPx.toFixed(2)}px)` : 'none',
                  opacity: p.opacity,
                  pointerEvents: 'auto', cursor: 'pointer',
                  userSelect: 'text', WebkitUserSelect: 'text',
                  /* Sub-pixel text on a transformed surface: without this the glyphs snap to the device grid and
                     the type stops sitting on the plane it is drawn on. */
                  WebkitFontSmoothing: 'antialiased',
                } as CSSProperties}
              >
                {p.lines.map((ln, i) => <div key={i} style={ln.style}>{ln.text}</div>)}
              </button>
            ))}
            {/*
              THE HUD SITS ON A PLATE, AND THE PLATE IS A CONTRAST FIX RATHER THAN A STYLING ONE. Unblurred and at
              full opacity, the harness's three HUD lines still measured 3.6–4.0:1 against the rendered sky, below
              the 4.5:1 requirement, because they sat on a mid-slate gradient. `rgba(4,6,11,0.82)` under them took
              all three over 4.5:1 without moving a hex.
            */}
            <div style={{
              position: 'absolute', left: 14, top: 12, display: 'flex', flexDirection: 'column', gap: 4,
              font: '500 10.5px/1.45 ui-monospace, monospace', letterSpacing: '.05em',
              background: HUD_PLATE, padding: '8px 10px', borderRadius: 5, maxWidth: '62%',
              pointerEvents: 'auto', userSelect: 'text',
            }}>
              <div style={{ color: '#8FB7FF', fontWeight: 600, letterSpacing: '.15em' }}>
                COMMAND DECK · DEPTH IS THE PANEL YOU ADDRESS
              </div>
              <div style={{ color: '#C6D4EC' }}>
                {plan.addressedTitle === null
                  ? 'AT REST · LENS OFF · DEPTH ORDER IS THE DECK’S OWN'
                  : `ADDRESSING ${plan.addressedTitle.toUpperCase()} · LENS RACKED TO IT`}
              </div>
              {/* THE FRAME STATES ITS OWN COVERAGE. Naming what is missing is the only honest version of not
                  showing it — the harness shipped a frame presenting itself as the whole programme with a shipped
                  environment silently absent, and this is the correction it landed on. */}
              <div style={{ color: '#E0A94A' }}>
                HEADINGS AND ONE COUNT EACH — THE GRID CARRIES THE FULL PANELS
              </div>
            </div>
          </div>
        )}
      </div>
      {/*
        THE COSTS, UNDER THE FRAME AND IN WORDS. Each of these is something the room did not deliver that the grid
        does, and an operator does something different about each — so they are named and never summed.
      */}
      {plan && (
        <div style={{
          font: '400 10px/1.5 ui-monospace, monospace', color: CAPTION[plan.theme], marginTop: 6,
        }}>
          <div>
            Click a panel to address it — it comes to the front and the lens racks to it. Click it again, or press
            Escape, to return the deck to rest.
          </div>
          {plan.withheld.length > 0 && (
            <div>
              {plan.withheld.length} panel{plan.withheld.length === 1 ? '' : 's'} carry no text on this frame:{' '}
              {plan.withheld.map((w) => `${w.title} (${w.reason})`).join(' · ')}. They are in the grid view.
            </div>
          )}
          {plan.notesDropped > 0 && (
            <div>
              {plan.notesDropped} context line{plan.notesDropped === 1 ? '' : 's'} dropped rather than clipped —
              the slab was too small for the whole sentence, and half a sentence presented as the whole one is the
              failure this refuses.
            </div>
          )}
          <div>
            {plan.lensOn
              ? `Lens on: the unaddressed panels are defocused by up to ${plan.maxCocPx} px of circle of confusion.`
              /* THE TWO REASONS THE LENS IS OFF ARE DIFFERENT FACTS and are said differently. "Off at rest" is a
                 design decision the reader can undo by addressing a panel; off at a tier is a measurement about
                 their machine that addressing a panel will not change, and telling them to click would be a lie
                 about what the click does. */
              : plan.lensOffReason !== null
                ? `Lens off at the ${plan.lensOffReason} quality tier, chosen from a measured frame time on this `
                  + 'machine. Addressing a panel still brings it forward and colours it; it will not defocus the others.'
                : 'Lens off at rest, so nothing is defocused until you address a panel.'}{' '}
            The DOM blur ceiling ({DOM_BLUR_CEILING} px) and dim ({DOM_DIM_MAX}) are E1&#39;s bisected pair.
          </div>
          {/* THE READABILITY CLAIM IS NOW A MEASUREMENT OR A NAMED ABSENCE, never an implication. The ratio is
              for the unblurred glyph core against this frame&#39;s own pixels — the best case, so a run that
              fails here fails for certain — and the blur above is the one term it does not model. */}
          <div>
            {plan.worstTextRatio === null
              ? 'The type colour on each panel was chosen WITHOUT a measurement — the frame could not sample its '
                + 'own pixels behind the projected boxes, so no contrast ratio is claimed for this frame.'
              : `Type colour chosen per panel from this frame's own pixels; worst measured contrast `
                + `${plan.worstTextRatio}:1 against a 4.5:1 floor, for the unblurred glyph core.`}
          </div>
        </div>
      )}
    </div>
  );
}
