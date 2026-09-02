/**
 * E6 THE VAULT, as a product component rather than a harness.
 *
 * `docs/3d/e6` proved the environment on synthetic records; this is the part that ships, and it draws the SAME
 * `AuditEntry[]` the table beside it draws — one page of the audit spine, two drawings. `3D_VFX_1000X.md` §2:
 * "audit + governance as a deep architectural space; every governed action a lit record receding into fog.
 * Depth IS the time axis."
 *
 * ── THE THREE READINGS A TABLE CANNOT GIVE, AND WHAT THIS FILE OWES EACH OF THEM ─────
 *
 * 1 · HOW FAR BACK YOU CAN SEE IS A NUMBER — and it is THREE numbers, because they are three different facts
 *     and reporting one of them claims either more reach or less than the frame has:
 *       · READABLE TO — the oldest record whose every run of type MEASURES at or above WCAG AA against the
 *         frame's own pixels. A pixel read, not a distance test. `docs/3d/e6/README.md` records what it cost to
 *         learn that: the harness printed `READABLE TO 4.0 d` while the record setting that horizon carried its
 *         actor at 2.56:1, because "readable" was a metres test wearing the word.
 *       · IN RANGE TO — the oldest the geometry would allow, which is what the lie above was actually reporting.
 *       · VISIBLE TO — the oldest slab that is lit at all.
 * 2 · A WITHHELD RECORD IS VISIBLY PRESENT. In the table a row whose payload you may not read looks like any
 *     other row with a thin Details cell. Here it is a steel slab at its own moment in time whose SUBJECT line
 *     is a named absence — see `vaultRecords.ts` for why that is the honest statement rather than a slab with no
 *     text: the API withholds the payload and deliberately keeps the row attributable.
 * 3 · DENSITY IS SHAPE. A burst of refused actions in one afternoon is a visible STACK at one depth. Depth stays
 *     strictly linear in time and the collision is resolved perpendicular to it, so four blocks in one afternoon
 *     read as a stack of four — which is not a workaround for the overlap, it is what the overlap MEANT.
 *
 * ── THIS FILE IS ONLY EVER REACHED THROUGH A LAZY IMPORT ─────────────────────────────
 * `VaultRelief` imports it with `lazy()`, so neither it nor any of `@lcx/gl` lands in the initial bundle. The
 * perf budget measures RAW pre-gzip initial JS at 839/850 KB — 11 KB of headroom for the whole application —
 * and the environment layer alone is 35.7 KB.
 *
 * ── IT REFUSES RATHER THAN DEGRADING, AND THE CALLER SHOWS THE TABLE ─────────────────
 * Every resource is checked. On any refusal this renders NOTHING and calls `onRefused` with a code; the parent
 * puts the table back. §6 rule 1, and the reason the parent owns the fallback: a component that cannot construct
 * its renderer cannot be trusted to draw its own escape hatch.
 *
 * ── THE FOG COLOUR IS A LITERAL, AND THAT IS NOT A DETAIL ────────────────────────────
 * `colour: 'sky'` takes the analytic sky along the view ray, which is correct outdoors and wrong here: a sealed
 * corridor lit by a daylight sky becomes a glowing tunnel whose deepest, most fogged region is its BRIGHTEST —
 * the exact inverse of the reading. It cost the harness a whole revision. No sky backdrop is allocated, the
 * clear colour IS the fog colour, and the far end of the corridor is capped.
 *
 * ══ THE RECORD IS NOT A LIT OBJECT, AND THAT WAS THE DEFECT ═══════════════════════════════════════════
 *
 * `APP_SWEEP_THEME_ONLY=1 node scripts/3d-audit-app.mjs` measured this surface's drawing buffer against the
 * data-chroma floor of 60 it DERIVES from the palette (the most saturated scenery colour anywhere in either
 * theme, 52, plus 8). E6 cleared it in NEITHER theme: max chroma 48 in dark and 22 in light, 0.00% of pixels
 * above the floor on both. So the marks were not merely worse on a white page — they were not separable from
 * the scenery on ANY page, which is a stronger failure than the light-theme one and it is the one below.
 *
 * WHY, MEASURED RATHER THAN GUESSED. The corridor has a CEILING (`ceilMesh`, spanning its whole length), and
 * the key light comes from above at `lightDir` y = −0.42. Every record slab is therefore inside the ceiling's
 * shadow, so the key reaches it at `1 − shadowStrength`: 0.06 in dark and 0.35 in light. What actually lights a
 * record is the AMBIENT term — the analytic sky through `ambientGain` — and that is a near-black interior in
 * dark (so the mark is too DIM for 8-bit chroma to survive) and a near-white studio in light (so the mark is
 * washed toward white before the fog has even started). The fog then mixes it the rest of the way: in light,
 * toward #DCE5F3.
 *
 * AND THE SHADING WAS NOT BUYING ANYTHING. The argument for lighting a mark is that its GEOMETRY carries a
 * measurement. This one does not: `box(REC_W, REC_H, REC_T)` is ONE mesh shared by every record on the page,
 * REC_H and REC_T are module constants and REC_W is a property of the PAGE (the longest line anywhere on it),
 * so no per-record fact is in the slab's shape at all. The only per-record facts are POSITION — z is time, the
 * tier is the density stack, the wall is alternation — and the VERDICT, which is colour. Shading a constant
 * shape by its orientation therefore made colour-to-category MANY-TO-ONE for nothing: measured on this
 * geometry, the same ALLOWED albedo renders at N·L 0.71 on the right wall and 0.11 on the left, so two records
 * with the same verdict are two different colours and a near BLOCKED can match a far ALLOWED. Unlit is
 * correctness here, not laziness.
 *
 * ── SO THE RECORD IS A CARD WITH A VERDICT STRIPE, AND THE TWO HALVES ARE DIFFERENT KINDS OF COLOUR ──
 *
 * A record slab has two jobs that were fighting each other, and one box painted one colour cannot do both:
 *
 *   · it is the GROUND FOR FOUR LINES OF DOM TYPE, which have to clear WCAG AA against it. That is exactly
 *     `SceneTheme.plate`'s stated role — "panel and card fills behind projected DOM text; must clear contrast
 *     against that text" — and it is SCENERY, so it moves with the theme by design.
 *   · it carries the VERDICT, which is DATA, and a data colour may not be retinted per theme.
 *
 * Painting the whole face the verdict colour makes the type unreadable — a saturated mid-luminance blue is the
 * worst possible ground, because neither white nor ink clears 4.5:1 against it at the element opacities this
 * frame's fog law hands out. Painting the whole face a plate deletes the verdict. So the face is SPLIT in the
 * shader by the model's own local Y: the bottom `BAND_FRAC` is the verdict at full chroma, the rest is the
 * theme's plate, and the type never sits on the stripe. One draw call, no extra geometry, and the split is
 * exact because it is a comparison against a vertex coordinate rather than a texture.
 *
 * ── THE ATMOSPHERE IS THE SAME BYTES, NOT A COPY OF THEM ────────────────────────────
 * The unlit pass still has to fog, or a record would float in front of a corridor that recedes. Re-typing the
 * height-fog block would be a second implementation free to drift from `env/lit.ts`'s, and the two disagreeing
 * is invisible — it looks like a lighting choice. So `FOG_GLSL` is SLICED OUT OF THE IMPORTED `LIT_FRAG` at
 * module load and spliced into this shader, and the surface REFUSES with `FOG_SOURCE_UNREADABLE` if the slice
 * markers are not found exactly once. The corridor and the marks cannot fog differently; they share the source.
 *
 * ══ AND THAT FIXED THE CHROMA WITHOUT FIXING THE CONTRAST. THE ROOM WAS THE OTHER HALF ══════════════
 *
 * Everything above is about the MARK. Re-measured on 2026-08-16 the mark was correct in isolation and still
 * invisible: `data-to-scenery contrast 3.16:1 dark → 1.02:1 light`, the worst single number in the sweep, with
 * p99.9 chroma 196 → 113. Two defects in the ROOM, both light-only, both units errors, and each owns exactly
 * one of those two columns — proven by reverting them one at a time and re-running (see the table below):
 *
 *   · THE HAZE WAS THE DAYLIGHT SKY. `theme.ts:312` derives `fog` from `skyHorizon`, so reading `th.fog` here
 *     re-introduced through the theme the very thing the paragraph four sections up refuses by name. It owns
 *     the CHROMA column. See `corridorHaze`.
 *   · THE ROOM WAS UNDER-EXPOSED. Its floor rendered at rgb(179,181,183) for an authored albedo of #FFFFFF,
 *     while the unlit marks and cards arrived at exactly their authored colour — so the two populations met in
 *     the middle. It owns the CONTRAST column. See `solvedExposure`, which is `ForgeBackdrop.lightExposure()`'s
 *     criterion with the sign reversed.
 *
 * MEASURED, one E6-only run of the frozen sweep per row, same instrument, same frozen instant:
 *
 *   variant                          light contrast   p99.9 chroma   max chroma   data px %
 *   shipped                                1.0153            113          114        1.269
 *   haze fixed, exposure reverted          1.1667            173          173        1.387
 *   exposure fixed, haze reverted          1.3736            113          114        1.269
 *   BOTH — what this file now does         1.6806            150          151        1.381
 *
 * DARK IS THE SAME FRAME. Every dark statistic is identical to the digit across all four runs — contrast
 * 3.1614, p99.9 chroma 196, max 196, data 1.389%, mean luma 13.341, sd 8.9928, 34 colours — because every
 * change above is inside a `th.name === 'dark'` literal branch or multiplies by an exact 1. The dark canvas
 * differs from the pre-change capture in 77 pixels of 545,824 (0.0141%) at a maximum channel delta of ONE
 * level, all of them card plates at the vanishing point: the `inverseToneMap` rounding step described at
 * `uPlate`. No dark statistic moves at all.
 *
 * WHAT IS STILL NOT TRUE: light is 53% of dark's contrast, not 100%, and it cannot be. The mark is brand blue
 * (WCAG relative luminance 0.179) and the light room is pale by construction, so the two can never be as far
 * apart as a mark and a near-black room. That ceiling is a number rather than an excuse: run the CPU model of
 * this frame — the one validated against the sweep at the top of this note — with the fog density taken to
 * zero and light reaches 2.54:1 while dark reaches 4.57:1, a ratio of 56%. This pass delivers 53%, which is
 * 96% of what the palette allows a fogged corridor to deliver. The remaining separation in light is carried by
 * CHROMA, which is why those columns are the ones to watch and why the haze defect was the more serious of
 * the two.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  createStage, isStage, box, uploadMesh, createLitRenderer, createTarget3D, createShadowMap,
  createAmbientOcclusion, projectQuad, isQuadRefusal, uprightPanelCorners, projectScreen,
  viewProjection, eyeOf, nearFarOf, lightViewProjection, boundsCentre, boundsRadius,
  hexToLinear, assertBrandFidelity, IDENTITY, createPresenter, statusAlbedo, statusHex,
  qualitySettings, shadowMapSizeFor, pickQualityTier, LIT_FRAG, SKY_GLSL, bindSky,
  precompensate, isPrecompRefusal, inverseToneMap, skyIrradiance,
  type LitDraw, type Viewpoint, type MeshBuffer, type Linear,
} from '@lcx/gl';
/* A SUB-PATH IMPORT, NOT THE BARREL — `docs/3d/w2/SUBPATH_COST.md`; `SurfaceReliefGl.tsx` carries the reason. */
import { sceneTheme, liveTheme, type SceneTheme, type ThemeName } from '@lcx/gl/look/theme.js';
import {
  useResolvedQualityTier, needsQualityProbe, measureFrameMs, recordQualityProbe,
} from '../shared/useQualityTier';
import type { AuditEntry } from '@/lib/api/audit';
import { buildVaultRecords, whenOf, type AuditVerdict, type VaultRecord, type VaultUnplaced } from './vaultRecords';

export interface VaultReliefGlProps {
  readonly entries: readonly AuditEntry[];
  readonly heightPx: number;
  /** Called with a stable code when the corridor cannot be drawn. The parent then shows the table. */
  readonly onRefused: (code: string) => void;
}

/* SHADER COMMENTS LIVE ABOVE THE LITERAL. A backtick inside a template literal terminates it — twelve times in
   this repo — and a comment inside a shader string is shipped bytes no minifier can reach. */
/* The present shaders that used to live here moved into the engine's ONE present path (look/present.ts, P4). */

/*
 * ══ THE RECORD PROGRAM — UNLIT, AND FOGGED WITH `env/lit.ts`'s OWN BYTES ════════════════════════════
 *
 * The header carries the argument for unlit. This is the machinery, and the only part of it that needs care is
 * that the fog must be the SAME fog. `FOG_GLSL` is cut out of the imported `LIT_FRAG` between two markers,
 * each of which must occur EXACTLY ONCE — `indexOf !== lastIndexOf` means the shader gained a second fog block
 * or a second `frag` write and the cut is no longer the thing it is named after, which is a state to refuse in
 * rather than to slice through. The block reads `uEye`, `uFog*`, `vWorld` and the variable `lit`, and calls
 * `skyColour` on its unreachable `'sky'` branch, so `SKY_GLSL` is included and `bindSky` is called with the
 * same stops the lit pass gets.
 */
const FOG_BEGIN = '  if (uFogDensity > 0.0) {';
const FOG_END = '  frag = vec4(lit, 1.0);';
const FOG_GLSL: string | null = (() => {
  const a = LIT_FRAG.indexOf(FOG_BEGIN), b = LIT_FRAG.indexOf(FOG_END);
  if (a < 0 || b < 0 || b <= a) return null;
  if (a !== LIT_FRAG.lastIndexOf(FOG_BEGIN) || b !== LIT_FRAG.lastIndexOf(FOG_END)) return null;
  return LIT_FRAG.slice(a, b);
})();

const RECORD_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
out vec3 vWorld;
out float vLocalY;
/* THE SAME TWO LINES AS \`DEPTH_VERT\` AND \`LIT_VERT\`, IN THE SAME ORDER, and that is what lets this pass draw
   at LEQUAL over the depth the prepass already wrote: the arithmetic is identical, so the fragments land at
   the identical depth. The lit pass has always relied on exactly this relation with the prepass. */
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  vLocalY = aPos.y;
  gl_Position = uViewProj * world;
}`;

const RECORD_FRAG = FOG_GLSL === null ? null : `#version 300 es
precision highp float;
in vec3 vWorld;
in float vLocalY;
uniform vec3 uEye;
uniform vec3 uPlate;
uniform vec3 uVerdict;
uniform float uBandTopY;
uniform float uFogDensity;
uniform float uFogHeight;
uniform vec3 uFogColour;
uniform float uFogFloor;
out vec4 frag;
${SKY_GLSL}
void main(){
  vec3 lit = vLocalY < uBandTopY ? uVerdict : uPlate;
${FOG_GLSL}
  frag = vec4(lit, 1.0);
}`;

/*
 * THE CALIBRATION, carried over from `docs/3d/e6/entry.ts` where each number was settled by a count rather than
 * by taste. The one figure that CANNOT be a constant here is hours-per-metre: the harness had 25 records
 * spanning 19 days and could fix 12 h/m, whereas a real page of the spine might span an hour or a year. It is
 * derived from the data below and REPORTED on the frame, because a depth axis whose scale is not stated is a
 * ruler with no units.
 */
const REC_T = 0.05;
const REC_H = 0.46;
const CORRIDOR_HALF = 1.34;
const REC_Y = 0.78;
const CORRIDOR_LEN = 44;
const CORRIDOR_MID = -CORRIDOR_LEN / 2 + 3;
/** Where the oldest record lands. Chosen with `FOG_DENSITY` so the corridor's length and its fog agree. */
const DEPTH_M = 22;
/** 13 m: measured against this type, not chosen. Past it the body copy is ~4 px and a word stops being one. */
const LEGIBLE_M = 13.0;
/** Solved, not dialled: 1 - exp(-26 d) = 0.95 → d = ln(20)/26, with 26 m the corridor's visible depth. */
const FOG_DENSITY = Math.log(20) / 26;
/* ONE FOG SPEC, READ BY TWO PASSES. The lit corridor and the unlit record cards must accumulate the same
   atmosphere over the same distance or the marks stop agreeing with the space they are in; two copies of
   `height` and `floor` is exactly how that drifts, so there is one. The COLOUR is not here because it is the
   only part that comes from the theme. */
const FOG_SPEC = { height: 6.0, floor: 0 } as const;
/** "Now" is a wall the reader FACES, not a line they stand on. Without it the newest record sits beside the eye. */
const NOW_OFFSET_M = 3.4;
const FOG_HEX = '#0B1220';
const RECORD_FACE = 0.42;
const MAX_TIERS = 4;
const PX_PER_METRE = 190;
/** Below this a projected record is seen so nearly edge-on that its homography is unusable, never mind legible. */
const MIN_PROJECTED_PX = 26;
/** WCAG 2.1 AA for body text. Not the 3:1 large-text allowance: the largest run here is 11 px. */
const AA_RATIO = 4.5;
/** Enough corridor for a page of the spine. A longer page is capped and the cap is reported, never silent. */
const MAX_RECORDS = 120;

/*
 * ── T4, DELIVERED: ONLY THE BLOCKED ARM MOVES, AND ONLY IT SHOULD ───────────────────
 * This was a module-level `Record<AuditVerdict, string>` holding `#C9552B` for BLOCKED — the
 * 3-D surfaces speaking burnt orange while the rest of the product says `--red`. It is a FUNCTION
 * now rather than a constant, because a status value resolves PER THEME and a module constant is a
 * snapshot taken before any theme exists: the exact failure this file already cites `ForgeBackdrop`
 * for elsewhere.
 *
 * THE OTHER TWO ARMS DO NOT MOVE, and the reason is the three-category argument in
 * `look/semantic.ts`. `#2C6BFF` is IDENTITY, not status — this file's own line further down already
 * says "the VERDICT colours are data" — and identity does not change with the page. `#5C6880` is
 * ABSENCE, which is a third thing again: a withheld record is not a status the platform has a token
 * for, it is the lack of one. Routing either through a status role would be the mirror of the
 * defect being fixed: using a status colour for something that is not a status.
 */
const verdictAlbedo = (v: AuditVerdict, theme: ThemeName): Linear =>
  v === 'BLOCKED' ? statusAlbedo('blocked', theme)
    /* Withheld is neither an allow nor a block: it is the absence of a reading, and giving it either
       verdict colour would assert a finding nobody is entitled to. Steel says "a record is here". */
    : hexToLinear(v === 'ALLOWED' ? '#2C6BFF' : '#5C6880');

/*
 * `VERDICT_MATERIAL` IS GONE, AND ITS DELETION IS THE FIX RATHER THAN A TIDY-UP. It held a roughness and a
 * metalness per verdict — WITHHELD at metalness 0.55, which replaced over half that mark's albedo with a
 * mirror of the sky and is why steel came back as whatever the ceiling was. A material is a claim that the
 * mark's SHAPE is being described by light. This mark's shape is one shared box, so there is nothing to
 * describe and the material was only ever a way for the room to overwrite the category. See the header.
 *
 * ── THE STRIPE IS PRE-COMPENSATED; THE CARD BEHIND THE TYPE IS NOT ──────────────────
 * `look/precompensate.ts` writes `inverseToneMap(target)` so the LIVE curve delivers the authored hex, and its
 * perimeter is "a FIXED-DENSITY mark over a ZERO plate with no bloom reaching it". Every clause holds here:
 * the record pass runs with `BLEND` disabled (`dstFactor: 'none'`), and this surface's present shader is
 * `lcxEncode(lcxToneMap(scene))` with no plate term and no bloom pass at all. So the refusals cannot fire on
 * this site, and the value is exact.
 *
 * WHAT IT DOES AND DOES NOT BUY, stated because the honest claim is narrow: the stripe is written at
 * `inverseToneMap(albedo)` and the fog then mixes it toward the corridor's far colour BEFORE the curve, so the
 * hex is delivered exactly where the fog is zero and every record is at fog > 0. What pre-compensation removes
 * is the 35/255 blue drop the plain write ships (`tonemap.ts`: #2C6BFF → #2C68DC, ΔE76 18.3) at the near end of
 * that ramp, which is the end the chroma statistics are read off. The CARD is deliberately left plain: it is
 * `SceneTheme.plate`, it is scenery, and spending a fidelity mechanism on a colour that is allowed to move
 * with the theme would say the opposite of what the taxonomy says.
 */
const MARK_SITE = {
  dstFactor: 'none',
  plate: [0, 0, 0],
  bloomGain: 0,
  threshold: [0, 1],
  shaderScale: 1,
} as const;

/**
 * THE MATERIAL A RECORD CARRIES INTO THE TWO PASSES THAT DO NOT READ IT.
 *
 * `shadowPass` and `depthPrepass` both bind a POSITION-ONLY program and set only `uModel`, so nothing in this
 * object reaches a shader. It exists because `LitDraw` requires the field, and it is a named constant with an
 * impossible-looking value rather than a copy of the verdict albedo precisely so that nobody reading a record's
 * draw later mistakes it for the colour the record is painted.
 */
const PASS_ONLY_MATERIAL = Object.freeze({
  baseColour: [0, 0, 0] as Linear, roughness: 1, metalness: 0,
});

interface MarkRadiance { readonly colour: Linear; readonly refusal: string | null }
const markRadiance = (v: AuditVerdict, theme: ThemeName): MarkRadiance => {
  const target = verdictAlbedo(v, theme);
  const pre = precompensate(target, MARK_SITE);
  /* A REFUSAL DRAWS THE PLAIN ALBEDO AND IS NAMED ON THE FRAME. Blanking a governed action because its colour
     could not be made exact would trade a measurable 18 ΔE for a missing record. */
  return isPrecompRefusal(pre)
    ? { colour: target, refusal: `${v} ${pre.code}` }
    : { colour: pre, refusal: null };
};

/*
 * THE FOUR LINES OF A RECORD, AS DATA — for two reasons that are both scars.
 *
 * ONE: the contrast measurement and the paint pass have to be describing the same pixels. While a per-line style
 * existed only inside a style string, only the paint pass could see it, and the frame was free to publish a
 * reading limit for type it had never looked at.
 *
 * TWO: every line is FULLY OPAQUE, and the fog is the only thing that dims a record. Ranking the lines by alpha
 * cost the harness days of reach — a header at 0.66 crossed AA at nine hours while the action name beside it was
 * still at 8.6:1 four days back. Size and weight already rank them.
 *
 * THE COLOUR IS NO LONGER HERE, and that is the theme fix rather than a tidy-up. It was `#fff` on all four,
 * which is correct against a corridor that fogs toward #0B1220 and exactly wrong against one that fogs toward
 * #DCE5F3. It is now chosen PER RECORD from the background this frame actually rendered — see `INK` and the
 * candidate scoring in `draw` — so the four still share one colour and therefore still share one ratio.
 *
 * `charPx` is the measured advance of `ui-monospace` at each size (0.6 em, plus tracking where set). It is here
 * because the element box is sized against the LONGEST line present: `campaign.publ` served as an action name by
 * `overflow: hidden` is worse than no record at all.
 *
 * THE FONT STRING IS NOW DERIVED FROM THE SAME FIELDS THE HEIGHT IS, and that is what makes the verdict
 * stripe's size a measurement instead of a taste. `BAND_PX` below is "whatever is left of the card once the
 * four lines have their measured height", so it has to know that height — and a line box's height is
 * `sizePx × lineH`, which is unreadable from inside a CSS shorthand string. Two numbers describing one line is
 * how a layout constant goes stale; there is one set, and `styleOf` builds the shorthand from it.
 */
const LINE_SPEC: readonly {
  readonly charPx: number;
  readonly weight: number;
  readonly sizePx: number;
  readonly lineH: number;
  readonly tracking?: string;
  readonly text: (r: VaultRecord) => string;
}[] = [
  {
    charPx: 6.5, weight: 600, sizePx: 9, lineH: 1, tracking: '.12em',
    text: (r) => `${r.verdict} · ${whenOf(r.hoursAgo)}`,
  },
  {
    charPx: 6.7, weight: 700, sizePx: 11, lineH: 1.05,
    text: (r) => r.action ?? 'ACTION NOT RECORDED',
  },
  {
    charPx: 6.4, weight: 400, sizePx: 10.5, lineH: 1.2,
    text: (r) => r.actor ?? 'ACTOR NOT RECORDED',
  },
  {
    charPx: 5.8, weight: 400, sizePx: 9.5, lineH: 1.2,
    /* THREE STATES, THREE STRINGS. A withheld subject exists and may not be shown; an unrecorded one never
       existed. Collapsing them into one blank is the table's failure, and it is the reading this view exists
       to keep.

       KEYED ON `subjectWithheld`, NOT ON THE VERDICT. A WITHHELD row does not necessarily have a withheld
       SUBJECT: `audit.ts` redacts `meta` alone on a GPS row and keeps the engagement id readable on purpose,
       so keying this off the verdict printed SUBJECT WITHHELD over a subject the table beside it was showing.
       See `vaultRecords.subjectOf`. */
    text: (r) => r.subject ?? (r.subjectWithheld ? 'SUBJECT WITHHELD' : 'NO SUBJECT RECORDED'),
  },
];
const styleOf = (ln: (typeof LINE_SPEC)[number]): CSSProperties => ({
  font: `${ln.weight} ${ln.sizePx}px/${ln.lineH} ui-monospace, monospace`,
  ...(ln.tracking === undefined ? {} : { letterSpacing: ln.tracking }),
});

/**
 * ══ THE VERDICT STRIPE'S HEIGHT, DERIVED FROM THE TYPE RATHER THAN CHOSEN ═══════════════════════════
 *
 * The card is `REC_H` metres tall and the overlay element that carries the type is `REC_ELEM_PX` tall, because
 * `projectQuad` maps that element rectangle onto the projected face. The four lines occupy a height the layout
 * already fixes — each line box is `sizePx × lineH`, separated by the flex `gap` — so the space that is NOT
 * the type is exactly what the stripe can have, less one gap of clearance top and bottom so the stripe never
 * crowds the last line. The clearance is THE SAME `TYPE_GAP_PX` the lines use between themselves rather than a
 * second spacing constant nobody can relate to the first.
 *
 * Every number here therefore moves if a line is added, resized or restyled, which is the property a literal
 * `0.25` would not have had.
 */
const TYPE_GAP_PX = 4;
const TYPE_PX = LINE_SPEC.reduce((h, ln) => h + ln.sizePx * ln.lineH, 0)
  + TYPE_GAP_PX * (LINE_SPEC.length - 1);
/** The element height `draw` hands `projectQuad`, so the two cannot disagree about what a card is. */
const REC_ELEM_PX = Math.round(REC_H * PX_PER_METRE);
const BAND_PX = REC_ELEM_PX - TYPE_PX - 2 * TYPE_GAP_PX;
const BAND_FRAC = BAND_PX / REC_ELEM_PX;
/** `box()` centres its geometry, so local y runs −REC_H/2 … +REC_H/2 and the stripe is the bottom slice. */
const BAND_TOP_LOCAL_Y = REC_H * (BAND_FRAC - 0.5);

interface OverlayRecord {
  readonly key: string;
  readonly transform: string;
  readonly ew: number;
  readonly eh: number;
  readonly opacity: number;
  /** Chosen from THIS record's measured background — see `INK`. Applied to all four lines, so one ratio still
      covers all four. */
  readonly colour: string;
  readonly lines: readonly { readonly text: string; readonly style: CSSProperties }[];
}

interface Plan {
  readonly cssW: number;
  readonly cssH: number;
  /* THE THEME THE FRAME UNDER THIS OVERLAY WAS DRAWN AT. Carried rather than re-read in the render, because the
     class can change between the draw and React's commit and a second `liveTheme()` there could disagree with
     the canvas — which would put the HUD's light type on a light corridor. */
  readonly theme: ThemeName;
  readonly records: readonly OverlayRecord[];
  readonly ruler: readonly { readonly label: string; readonly sx: number; readonly sy: number }[];
  readonly rulerUnreadable: number;
  /** `null` when nothing on the frame clears AA — which is a statement, not a missing value. */
  readonly readableToDays: number | null;
  readonly inRangeToDays: number;
  readonly visibleToDays: number;
  /** The age of the newest record on the page, which is where the corridor's near wall now is. */
  readonly nearWallDays: number;
  readonly hoursPerMetre: number;
  readonly shown: number;
  readonly placed: number;
  readonly hiddenBy: Readonly<Record<string, number>>;
  readonly counts: Readonly<Record<AuditVerdict, number>>;
  readonly unplaced: readonly VaultUnplaced[];
  readonly cappedFrom: number | null;
  readonly worstShownRatio: number | null;
  /** Empty when every verdict's stripe was written exactly. Named, never summed — see `markRadiance`. */
  readonly markRefusals: readonly string[];
}

/* WCAG relative luminance, and a ratio. Kept local so the number the frame prints is the number a reader's own
   checker would compute. */
const relLum = (r: number, g: number, b: number): number => {
  const f = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratioOf = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
/* Source-over in sRGB BYTES, because that is what the compositor does when it lays a DOM text layer over a
   canvas: the alpha applies to the encoded values, so the composite happens before `relLum`, not after.
   THE FOREGROUND IS A PARAMETER NOW. It used to be hard-coded to 255 on every channel, which silently assumed
   the type was white — so the moment a light theme put dark type on a light slab, every ratio this frame printed
   would have described a colour it was not painting. For fg = (255,255,255) this is the identical expression. */
const overBg = (
  bg: readonly [number, number, number], a: number, fg: readonly [number, number, number],
): number => relLum(
  bg[0] + a * (fg[0] - bg[0]), bg[1] + a * (fg[1] - bg[1]), bg[2] + a * (fg[2] - bg[2]),
);

/**
 * THE TWO CANDIDATE TYPE COLOURS, AND WHY THE CHOICE IS STILL MEASURED PER RECORD.
 *
 * The type's ground is no longer the verdict. It is the theme's `plate` under the corridor's fog, so within one
 * frame the near cards sit on the plate almost undiluted and the far ones on near-pure fog, and those are two
 * different backgrounds in the same theme. That is why the choice stays a per-record measurement off the
 * rendered pixels rather than a per-theme constant: the theme decides the plate, the DEPTH decides how much of
 * it survives, and only the frame knows the answer.
 *
 * WHAT THIS TABLE USED TO BE, AND WHY IT IS NOT A TABLE ANY MORE. It listed the two candidates' WCAG ratios
 * against the three VERDICT albedos, and its own numbers are the reason the card is a plate now: ALLOWED
 * #2C6BFF measured 4.51 white / 4.36 ink at a = 1.00 and 2.22 / 2.30 at a = 0.50. A saturated mid-luminance
 * ground has NO legible type colour once the element's own fog opacity is applied — both candidates fail
 * together, and a record that is beautifully coloured and carries no readable line is the failure this whole
 * file is arranged around not having. The plate's job is to be the one thing on the card that a glyph can win
 * against; the stripe carries the colour, and nothing is written on the stripe.
 */
const INK: readonly [number, number, number] = [8, 11, 18];
const WHITE: readonly [number, number, number] = [255, 255, 255];

/**
 * THIS SCENE'S OWN SHADOW BASELINE, which the tier SCALES rather than replaces.
 *
 * `env/quality.ts:91` records why the distinction matters: wiring the ladder in with the tier's ABSOLUTE
 * `shadowMapSize` silently enlarged three environments — E0, E2 and E8 had each chosen 1024 and were handed
 * 1536 at the default tier, a 2.25x bigger map and three captures that changed without anyone saying so.
 */
const SHADOW_BASELINE = 1024;

/**
 * ══ THE CORRIDOR SHELL IS SCENERY, AND ITS ROLES ARE WHAT EACH SURFACE *IS* ═════════════════════════
 *
 * `packages/gl/src/look/theme.ts` argues the data/scenery line; `SurfaceReliefGl.tsx` carries the note on why
 * only the LIGHT half comes from the theme.
 *
 * ── THE MAPPING THAT USED TO BE HERE WAS ARGUED ACROSS TWO DIFFERENT QUANTITIES ─────
 * It read: "dark floor #080C15 0.00369 < ceiling #0A101C 0.00519 < end cap #0B1220 0.00608 < wall #141F35
 * 0.01386 / light plate #FFFFFF 1.00000 > ground #E8EDF6 0.84378 > fog #DCE5F3 0.77725 > structure #C3CEE0
 * 0.61127 — four surfaces, same order, mirrored", and so gave the floor `plate`, the ceiling `ground`, the end
 * cap `fog` and the walls `structure`. THREE of those four numbers are ALBEDOS, which are multiplied by the
 * light that reaches them and therefore arrive well under their hex; the fourth, `fog`, is a RADIANCE and
 * arrives AT its hex. An ordering read off that table is an ordering of things that are not the same quantity,
 * and it does not survive into pixels: measured on the shipped frame, the light haze left the pipeline at
 * rgb(220,229,243) — luma 228 — against a scenery mean of 177. The deepest, most fogged region of a sealed
 * corridor was its BRIGHTEST, which is the glowing tunnel this file's header says cost the harness a revision.
 *
 * SO THE ROLES ARE ASSIGNED BY WHAT THE SURFACE IS, and the light half is then solvable:
 *   · floor and ceiling take `ground` — "the floor or backdrop a scene sits on, the single largest area".
 *     They still render differently, because the analytic sky delivers a different irradiance to a normal
 *     pointing up than to one pointing down; only the reflectance is shared.
 *   · walls and the end cap take `structure` — "plinths, walls, rails: geometry that holds data up".
 *   · `plate` is left to the RECORD CARDS, which are its stated role: "panel and card fills behind projected
 *     DOM text". It is #FFFFFF in light, and a floor painted with it is (a) the same colour as every card in
 *     the frame and (b) an albedo of 1.0, which leaves the exposure solve below no headroom at all —
 *     `theme.ts` says so in as many words under its own `ground` entry.
 *   · `fog` is not a shell albedo at all. See `corridorHaze`.
 *
 * The dark hexes are untouched literals, so none of this reaches the dark frame.
 *
 * The VERDICT colours are data and appear nowhere here. They do not move in either theme.
 */
const scenery = (th: SceneTheme, darkHex: string, light: Linear): Linear =>
  (th.name === 'dark' ? hexToLinear(darkHex) : light);

/** The dark theme's record, held only as the denominator of the light rig's ratio — see `SurfaceReliefGl.tsx`,
    THE LIGHT RIG MOVES BY RATIO. Nothing reads a colour out of it. */
const TH_DARK = sceneTheme('dark');

/**
 * ══ ONE RIG SPEC, READ BY THE LIT PASS AND BY THE HAZE THAT MUST AGREE WITH IT ══════════════════════
 *
 * These three were literals inside the `lit.draw` call. The corridor's haze is now DERIVED from the same
 * illumination the shell is lit with, so two readers exist and a second copy of any of them is exactly how the
 * haze and the room drift into describing different rooms — the failure `FOG_SPEC` already exists to prevent
 * one field over.
 */
const KEY_COLOUR: Linear = [3.0, 2.95, 2.85];
/** 0.46, not 0.86. At the higher gain the floor and ceiling — whose normals point at the analytic sky's
    bright zenith — became two glowing wedges brighter than the key light. */
const AMBIENT_GAIN = 0.46;
const SHADOW_STRENGTH = 0.94;
/*
 * Down the corridor and slightly to one side, so the WALLS take light at a grazing angle and the corridor
 * reads as a space rather than as a flat backdrop. A light down the axis would flatten it.
 *
 * IT DOES NOT LIGHT THE RECORDS, and the sentence that used to be here said it did — "records on both walls
 * take light at a grazing angle and their 5 cm edges catch it". Measured, the ceiling shadows every record, so
 * the key reached a slab at 1 − shadowStrength: 0.06 in dark. The edge catch was prose about a highlight the
 * frame never drew. The records are unlit now and the light's only job is the architecture.
 */
const LIGHT_DIR: Linear = [0.34, -0.42, -0.84];
const KEY_L: Linear = (() => {
  const m = Math.hypot(LIGHT_DIR[0], LIGHT_DIR[1], LIGHT_DIR[2]);
  return [-LIGHT_DIR[0] / m, -LIGHT_DIR[1] / m, -LIGHT_DIR[2] / m];
})();
/** The floor's normal — the surface the exposure below is solved against. */
const CORRIDOR_UP: Linear = [0, 1, 0];
/** The far end of the corridor faces the eye straight down the axis. It is the surface a ray that never
    resolves anything finally lands on, which is what makes it the colour the corridor dissolves INTO. */
const CORRIDOR_END_N: Linear = [0, 0, 1];

const rigFor = (th: SceneTheme) => ({
  key: th.keyGain / TH_DARK.keyGain,
  ambient: th.ambientGain / TH_DARK.ambientGain,
  shadow: th.shadowStrength / TH_DARK.shadowStrength,
});

/**
 * NO SKY BACKDROP IS ALLOCATED — a vault has no sky, see the header — so the theme's stops reach the lit pass
 * as the irradiance environment only, with no backdrop to stay in step with. The record pass binds the SAME
 * stops: the fog block it shares with `LIT_FRAG` has a `'sky'` branch, and two passes holding different skies
 * for a branch neither takes is a trap set for whoever takes it.
 *
 * THE THIRD STOP IS `inverseToneMap(th.ground)`, NOT `th.ground`. `theme.ts:184-189` names this exactly: the
 * sky's lower stop is a RADIANCE slot and `ground` is an ALBEDO, so passing it raw asks a downward-facing
 * normal to reflect a value a third under the one the palette authored. This file was one of the six call
 * sites it lists. Dark passes no stops at all, so the correction cannot reach the dark frame.
 */
const skyStops = (th: SceneTheme) => (th.name === 'dark' ? undefined : {
  zenith: th.skyZenith, horizon: th.skyHorizon, ground: inverseToneMap(th.ground),
});

/** The ambient a surface with normal `n` receives here: the analytic sky through the rig's own gain. */
const ambientOn = (th: SceneTheme, n: Linear, exposure: number): Linear => {
  const irr = skyIrradiance(n, skyStops(th));
  const g = AMBIENT_GAIN * rigFor(th).ambient * exposure;
  return [irr[0] * g, irr[1] * g, irr[2] * g];
};
/** The key a surface with normal `n` receives here. Everything in this corridor is under the ceiling, so the
    shadow term is the leak `1 − shadowStrength` rather than the full key — the header measured that. */
const keyOn = (th: SceneTheme, n: Linear, exposure: number): Linear => {
  const rig = rigFor(th);
  const s = (Math.max(0, n[0] * KEY_L[0] + n[1] * KEY_L[1] + n[2] * KEY_L[2])
    * (1 - SHADOW_STRENGTH * rig.shadow) * exposure) / Math.PI;
  return [KEY_COLOUR[0] * rig.key * s, KEY_COLOUR[1] * rig.key * s, KEY_COLOUR[2] * rig.key * s];
};

/**
 * ══ THE LIGHT EXPOSURE IS SOLVED, AND DARK IS MULTIPLIED BY EXACTLY 1 ═══════════════════════════════
 *
 * `ForgeBackdrop.tsx`'s `lightExposure()` is the precedent and this is the same criterion, mirrored: E8's
 * light ground was CLIPPING — an albedo of 215 rendering at 255 — and the fix solved the absolute exposure so
 * it rendered at 215. This corridor had the same defect with the sign reversed. Its floor is the frame's
 * largest area; measured on the shipped light frame it left the pipeline at rgb(179,181,183) against an
 * authored albedo of #FFFFFF, so the room rendered at 70% of the value the palette states, while the record
 * cards and the verdict stripes — which are UNLIT, and therefore written at whatever radiance this file asks
 * for — arrived at exactly their authored colour. A room three tenths under, marks exactly on: the two
 * populations met in the middle, which is the 1.02:1 this pass exists to fix.
 *
 * The solve is E8's: the radiance that tone-maps and encodes back to the floor's own albedo, divided by the
 * illumination the floor actually receives, per channel, binding channel taken so nothing renders brighter
 * than authored. The key/ambient RATIO is untouched — both are multiplied by the same scalar — so the light
 * rig's authored 11.9:1 against dark's 4.5:1 is exactly as it was.
 *
 * DARK RETURNS THE LITERAL 1 AND IS NOT SOLVED AT ALL. Multiplication by 1.0 is exact in IEEE 754, so every
 * dark term is bit-for-bit the expression it always was. The criterion is a light-studio criterion — "render
 * at your albedo" would DARKEN a near-black room that was authored to lift a floor off black — and it says so.
 */
const solvedExposure = (th: SceneTheme): number => {
  if (th.name === 'dark') return 1;
  const albedo = th.ground;
  const target = inverseToneMap(albedo);
  const k = keyOn(th, CORRIDOR_UP, 1), a = ambientOn(th, CORRIDOR_UP, 1);
  return Math.min(
    target[0] / (albedo[0] * (k[0] + a[0])),
    target[1] / (albedo[1] * (k[1] + a[1])),
    target[2] / (albedo[2] * (k[2] + a[2])),
  );
};

/**
 * ══ THE HAZE IS THE CORRIDOR, NOT THE SKY — AND THAT WAS THE DEFECT ════════════════════════════════
 *
 * The header already refuses `colour: 'sky'` for this surface: "a sealed corridor lit by a daylight sky becomes
 * a glowing tunnel whose deepest, most fogged region is its BRIGHTEST — the exact inverse of the reading. It
 * cost the harness a whole revision." The dark branch obeys that with a literal. The LIGHT branch read
 * `th.fog`, and `theme.ts:312` defines `fog: toRadiance(hex.skyHorizon)` — so the light corridor was fogged
 * with the daylight sky after all, arriving through the theme instead of through the branch that was refused.
 *
 * WHAT REPLACES IT IS DERIVED, NOT PICKED. A ray that resolves nothing ends on the corridor's far wall, so the
 * colour the corridor dissolves into is what that wall radiates. Two terms, and only one of them is defined
 * there:
 *   · AMBIENT — the analytic sky on a normal facing the eye, through the rig. Defined everywhere.
 *   · KEY — omitted, and not as a taste call: `sceneMin`/`sceneMax` bound the shadow map at z = −27.4 and the
 *     end cap sits at z = −41, THIRTEEN METRES BEYOND IT. The shadow pass never saw that geometry, so there is
 *     no measured key/shadow answer to quote for it, and quoting the in-map leak term there would be inventing
 *     one. It is also the physically obvious answer for the deepest point of a tube with a ceiling on it.
 *
 * Measured consequence in light: the haze leaves the pipeline at rgb(153,168,194) rather than rgb(220,229,243),
 * which is the same value the corridor's own unlit wall renders at — so the far end now dissolves into the
 * wall it is made of, and the brightest thing in the frame is the floor and the cards, where a reader's eye
 * belongs. Dark takes `hexToLinear(FOG_HEX)` and is untouched.
 */
const corridorHaze = (th: SceneTheme, exposure: number): Linear => {
  if (th.name === 'dark') return hexToLinear(FOG_HEX);
  const e = ambientOn(th, CORRIDOR_END_N, exposure);
  return [th.structure[0] * e[0], th.structure[1] * e[1], th.structure[2] * e[2]];
};

/**
 * THE FRAME'S OWN TEXT TOKENS — the HUD, the depth ruler and the caption under the frame.
 *
 * The ruler and the HUD sit on the rendered corridor with no plate, so they follow the same ink/light rule the
 * records do; they are not measured per label because they are drawn at a fixed screen position over the
 * corridor's own fog, which is the theme's colour by construction.
 *
 * THE CAPTION IS A DEFECT THIS WORK FOUND RATHER THAN CAUSED. `rgba(196,212,240,.62)` sits on the PAGE, and the
 * platform defaults to LIGHT: measured 5.25:1 on the dark card #10182B and **1.28:1 on the light card #FFFFFF**.
 * The list of records the corridor could not deliver — the thing this whole file is arranged around not losing —
 * has been below the WCAG floor on the default theme since it shipped. #5A6272 is the platform's own `--grey`
 * and measures 6.13:1 on white.
 */
const FRAME_TEXT = {
  dark: { head: '#8FB7FF', body: 'rgba(196,212,240,.86)', ruler: 'rgba(196,212,240,.85)', caption: 'rgba(196,212,240,.62)' },
  light: { head: '#1E2761', body: '#333948', ruler: '#333948', caption: '#5A6272' },
} as const;

/** What the corridor is built from on any one draw: the page of the spine, already sliced and measured. */
interface VaultBuild {
  readonly records: readonly VaultRecord[];
  readonly unplaced: ReturnType<typeof buildVaultRecords>['unplaced'];
  readonly cappedFrom: number | null;
  readonly spanHours: number;
  /** The NEWEST record's age. The near wall of the corridor is this, not zero — see `buildVault`. */
  readonly nearHours: number;
  readonly recPx: number;
  readonly recW: number;
  readonly tierH: number;
  readonly hoursPerMetre: number;
  readonly lineWidthOf: (r: VaultRecord) => number;
}

/**
 * THE SLAB IS SIZED AGAINST THE LONGEST LINE ACTUALLY PRESENT, not against a guess. `workspace.access_refused`
 * is 24 characters; at 11 px monospace that is 161 px, and in the harness's 118 px box `overflow: hidden` would
 * have served `workspace.access_ref` as though it were the name of a governed action.
 */
const lineWidthOf = (r: VaultRecord): number => Math.max(
  ...LINE_SPEC.map((ln) => ln.text(r).length * ln.charPx),
);

/**
 * Everything about a page of the spine that the corridor's geometry depends on, in one place because two
 * callers need it: the setup effect, so a page with nothing to draw never costs a WebGL context, and every
 * redraw, so the second page is measured as carefully as the first.
 *
 * ABSENT TIME REFUSES A POSITION, it does not get hour zero. `buildVaultRecords` excludes and counts; the count
 * is printed under the frame. Depth is the time axis, so a record whose age nobody knows has no depth to be at.
 *
 * ══ THE NEAR WALL IS THE NEWEST RECORD, NOT `NOW`. MEASURED, THEN CHANGED ═══════════════════════════
 *
 * It used to be `now`: `zOf(h) = -(h / hoursPerMetre) - NOW_OFFSET_M`, with `hoursPerMetre = spanHours /
 * DEPTH_M`. Depth was linear in time and hour zero faced the reader, which sounds right and is right for one
 * page in the log — the one you get by opening it. On the harness's stubbed page, whose newest entry is three
 * days old, the SAME frame reported, in its own words:
 *
 *      IN RANGE TO 0.00 d (GEOMETRY) · 0 of 18 RECORDS CARRY TEXT
 *
 * Eighteen perfectly good records, and the geometry delivered none of them: the newest landed at 19.3 m of a
 * 22 m corridor because 72% of the depth was spent on time in which nothing happened, `LEGIBLE_M` is 13 m, and
 * every mark was consequently 84–91% fogged. Measured, that is also why the light theme could not clear the
 * data-chroma floor: a mark at 16% of its own value mixed into a near-white fog has nowhere left to be blue.
 * On a spine you page through, "everything on this page is older than the legible range" is the ordinary case,
 * not the exotic one.
 *
 * SO THE PAGE FILLS THE CORRIDOR. `[newest, oldest]` maps onto `[NOW_OFFSET_M, NOW_OFFSET_M + DEPTH_M]` and
 * DEPTH IS STILL STRICTLY LINEAR IN TIME — the premise is untouched, only the origin moves, and the origin was
 * previously an unlabelled claim that the page starts at now. It is labelled now: the frame prints NEAR WALL
 * as one of its horizons, so an axis that used to assert its zero states it instead.
 *
 * A FLOOR OF 0.05 h/m still keeps a page that spans two minutes from being drawn at a resolution the geometry
 * cannot express; when it binds the corridor is simply short, which is the truth about the page.
 */
function buildVault(entries: readonly AuditEntry[]): VaultBuild | { refusal: string } {
  if (entries.length === 0) return { refusal: 'NO_OBSERVED_RECORDS' };
  const built = buildVaultRecords(entries, Date.now());
  if (built.records.length === 0) return { refusal: 'NO_RECORD_CARRIES_A_USABLE_TIMESTAMP' };
  const cappedFrom = built.records.length > MAX_RECORDS ? built.records.length : null;
  const records = built.records.slice(0, MAX_RECORDS);
  const spanHours = records[records.length - 1]!.hoursAgo;
  const nearHours = records[0]!.hoursAgo;
  const widest = Math.max(...records.map(lineWidthOf));
  const recPx = Math.max(118, Math.min(209, Math.ceil(widest + 12)));
  return {
    records, unplaced: built.unplaced, cappedFrom, spanHours, nearHours,
    recPx, recW: recPx / PX_PER_METRE, tierH: REC_H + 0.10,
    hoursPerMetre: Math.max(0.05, (spanHours - nearHours) / DEPTH_M),
    lineWidthOf,
  };
}

export default function VaultReliefGl({ entries, heightPx, onRefused }: VaultReliefGlProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  /* Subscribed rather than read once: this surface renders one frame into an offscreen target and only then
     blits it, so a resolved lower tier can rebuild the scene before anything has been painted. */
  const tier = useResolvedQualityTier();

  /**
   * THE REDRAW LIVES IN A REF, AND THAT IS WHAT KEEPS ONE GL CONTEXT ACROSS A DATA CHANGE.
   *
   * `entries` used to be in the setup effect's dependency list, so paging the audit log disposed the stage and
   * built another one. Measured with a counting WebGL2 context, one change to `entries` cost **1 context, 6
   * programs, 12 shaders, 6 vertex arrays, 21 bufferData calls, 8 textures and 7 framebuffers** — and the only
   * thing in that list which is actually data is ONE record slab, whose width is set by the longest line on the
   * page. That is §6 rule 7's hazard on every data update; `DeckReliefGl.tsx:205-213` already ships the fix for
   * its own click path.
   */
  const drawRef = useRef<((e: readonly AuditEntry[]) => 'STALE_TIER' | undefined) | null>(null);
  /* THE LATEST PAGE, so a TIER change can redraw it: the setup effect re-runs on a resolved tier while the draw
     effect below does not, and a rebuilt context with no draw is a blank canvas under a live caption. */
  const entriesRef = useRef<readonly AuditEntry[]>(entries);

  /* THE DRAW EFFECT IS DECLARED FIRST, AND THE ORDER IS LOAD-BEARING. React runs effects in declaration order,
     so on MOUNT this one records the page and returns (nothing is published yet) and the setup effect draws it.
     On a DATA CHANGE only this one re-runs, and the context is untouched. */
  useEffect(() => {
    entriesRef.current = entries;
    drawRef.current?.(entries);
  }, [entries]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawRef.current = null;
    /* Any earlier overlay is dropped before a new frame exists. A projected label from the previous page of the
       spine sitting over a freshly drawn corridor is a stale picture presented as live data. */
    setPlan(null);

    /* THE PAGE'S OWN REFUSALS STILL COME BEFORE THE RENDERER, so a page with no usable timestamp never costs a
       WebGL context to be told so. Read through the ref rather than the prop, so this does not put the data back
       in the dependency list below; `draw` makes the identical judgement on every later page. */
    const first = buildVault(entriesRef.current);
    if ('refusal' in first) { onRefused(first.refusal); return; }

    /*
     * §6 RULE 5 BEFORE ANYTHING IS DRAWN. If the palette does not round-trip through this pipeline's tone map
     * there is no point rendering: the frame would be off-brand by an amount too small to see and too large to
     * be exact, and it would be screenshotted into a deck.
     */
    if (assertBrandFidelity().length > 0) { onRefused('BRAND_FIDELITY_FAILED'); return; }

    /* THE FOG SLICE, BEFORE A CONTEXT EXISTS. `RECORD_FRAG` is null when the markers in `LIT_FRAG` are missing
       or doubled, and a corridor whose marks fog by a second, private implementation is worse than no corridor:
       it looks like a lighting decision. Refused by name, at no cost. */
    if (RECORD_FRAG === null) { onRefused('FOG_SOURCE_UNREADABLE'); return; }
    /* AND A CARD WITH NO STRIPE IS A RECORD WITH NO VERDICT. `BAND_PX` is what the four lines leave behind, so
       a fifth line or a larger size can drive it to zero — silently, because the card would still draw. */
    if (!(BAND_PX > 0)) { onRefused('NO_ROOM_FOR_A_VERDICT_STRIPE'); return; }

    /* DPR CAPPED BY THE TIER. Everything here is fill-bound; a 3× display would triple the cost of a surface
       whose whole justification is that an operator reads it faster. The cap WAS a literal 2; `Q.dprScale` is 2
       at `full` and `reduced` and 1 at `minimum`, and resolution multiplies every fill-bound pass. */
    const Q = qualitySettings(tier);
    const dpr = Math.min(Q.dprScale, Math.max(1, window.devicePixelRatio || 1));
    const cssW = Math.max(320, canvas.clientWidth || 640);
    const cssH = heightPx;
    const W = Math.round(cssW * dpr), H = Math.round(cssH * dpr);
    canvas.width = W; canvas.height = H;

    const out = createStage(canvas, { alpha: false });
    if (!isStage(out)) { onRefused(out.code); return; }
    const stage = out;
    const gl = stage.gl;

    const disposers: (() => void)[] = [];
    /*
     * TWO DISPOSAL LISTS, BECAUSE TWO LIFETIMES. `disposers` holds what the SIZE and the TIER own — the context,
     * the programs, the targets, the corridor shell — and is released once, on unmount. `dataDisposers` holds
     * the ONE mesh whose dimensions are the data: the record slab, sized to the longest line on the page. Its
     * width changes with the page, and `MeshBuffer` (`packages/gl/src/env/lit.ts:596`) exposes no way to rewrite
     * a `STATIC_DRAW` buffer in place, so that one really must be reallocated. The other four must not.
     */
    const data: { disposers: (() => void)[] } = { disposers: [] };
    const releaseData = (): void => {
      for (const d of data.disposers.reverse()) d();
      data.disposers = [];
    };
    /* Set by whichever of `refuse` and the cleanup runs first. A redraw can refuse now, so both are reachable in
       one mount, and `disposers.reverse()` MUTATES — running it twice disposes forwards. */
    let dead = false;
    const releaseAll = (): void => {
      if (dead) return;
      dead = true;
      releaseData();
      for (const d of disposers.reverse()) d();
      /* THE STAGE LAST, even on the refusal path: it owns the context, and releasing it first leaves every
         other delete* operating on a dead context — silent, and it leaks on every remount. */
      stage.dispose();
    };
    const refuse = (code: string): void => {
      drawRef.current = null;
      releaseAll();
      onRefused(code);
    };

    // THE ONE PRESENT PATH (P4): copy → pipeline (bloom, the one tone map, the one encode) → FXAA → canvas.
    const presenter = createPresenter(stage);
    if ('kind' in presenter) { refuse(presenter.code); return; }
    presenter.resize(W, H);
    disposers.push(() => presenter.dispose());
    /* NO DISPOSER, and that is `stage.ts`'s rule rather than an omission: a `Stage` owns every program it
       compiles and deletes them with the context. `lit` deletes its own three because it made them itself. */
    const recProg = stage.compile(RECORD_VERT, RECORD_FRAG);
    if ('kind' in recProg) { refuse(recProg.code); return; }
    const lit = createLitRenderer(stage);
    if ('kind' in lit) { refuse(lit.code); return; }
    disposers.push(() => lit.dispose());
    const target = createTarget3D(stage, W, H);
    if ('kind' in target) { refuse(target.code); return; }
    disposers.push(() => target.dispose());
    const shadow = createShadowMap(stage, shadowMapSizeFor(tier, SHADOW_BASELINE));
    if ('kind' in shadow) { refuse(shadow.code); return; }
    disposers.push(() => shadow.dispose());
    /* AO IS THE TIER'S SECOND DROP, after depth of field. Not allocated at all when the tier says no: a
       half-res R8 ping-pong pair plus two programs is not free to hold. */
    const ao = Q.ao ? createAmbientOcclusion(stage, W, H) : null;
    if (ao && 'kind' in ao) { refuse(ao.code); return; }
    if (ao) disposers.push(() => ao.dispose());
    /* `createSkyBackdrop` IS DELIBERATELY NOT ALLOCATED. A vault has no sky; see the header. */

    /*
     * A BOX, NOT A PLANE, for floor/walls/ceiling. `plane(size, segments)` is SQUARE, so `plane(6, 44)` asks for
     * a 6 × 44 corridor floor and produces a 6 × 6 patch with 44 segments a side — a floor for three metres and
     * void for the rest, which under this palette reads as a dark corridor rather than a missing one. The
     * segments bought nothing either: the surface is flat and the lighting is per-fragment.
     */
    const floorGeo = box(6, 0.12, CORRIDOR_LEN);
    const wallGeo = box(0.22, 3.0, CORRIDOR_LEN);
    const ceilGeo = box(2 * CORRIDOR_HALF + 0.44, 0.18, CORRIDOR_LEN);
    /* THE FAR END IS CAPPED. Without it the deepest, most fogged part of the frame is its brightest. */
    const endGeo = box(2 * CORRIDOR_HALF + 0.44, 3.0, 0.2);

    /* UPLOADED ONE AT A TIME, EACH REGISTERED FOR DISPOSAL BEFORE THE NEXT IS ATTEMPTED. Uploading all four and
       then checking them means a failure on the fourth refuses while the first three are still on the GPU with
       no disposer recorded — a leak on exactly the path that is hardest to reach and most likely to repeat,
       because this component remounts every time a reader toggles the view.
       THE RECORD SLAB USED TO BE THE FIFTH ENTRY HERE. It is the only one whose size is data, so it moved into
       the redraw; the corridor shell is the same for every page of the spine. */
    const uploaded: MeshBuffer[] = [];
    for (const g of [floorGeo, wallGeo, ceilGeo, endGeo]) {
      const m = uploadMesh(stage, g);
      if ('kind' in m) { refuse(m.code); return; }
      uploaded.push(m);
      disposers.push(() => m.dispose());
    }
    const [floorMesh, wallMesh, ceilMesh, endMesh] = uploaded;

    const N3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const modelOf = (x: number, y: number, z: number, yaw = 0): Float32Array => {
      /* `IDENTITY` IS A FACTORY. `new Float32Array(IDENTITY)` is length 0: every vertex collapses to the origin,
         the framebuffer is complete and nothing errors. It cost E0 a day. */
      const m = IDENTITY();
      const c = Math.cos(yaw), s = Math.sin(yaw);
      m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
      m[12] = x; m[13] = y; m[14] = z;
      return m;
    };
    /*
     * THE NORMAL MATRIX FOR A YAWED MESH. The walls only translate, so the identity is right for them. Handing
     * the identity to a YAWED slab lights every record as though it faced straight down the corridor — it does
     * not look like a bug, it looks like a light in the wrong place. Copied in the same storage order rather than
     * reconstructed: `normalMat` is documented row-major and uploaded with transpose=false, which for a pure
     * rotation IS the correct normal matrix. It stops being correct the moment a scale appears, which is why
     * every record shares one un-scaled geometry.
     */
    const normalOf = (m: Float32Array): Float32Array => new Float32Array([
      m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10],
    ]);

    /*
     * 33°, NOT 46 — and the field of view was the problem, not the distance. A wide lens on a 2.7 m corridor
     * throws the walls past the frame edge, so the architecture arrives as two dark wedges rather than as a
     * space, and the depth it exaggerates is what shrinks the far records. §2 asks for a deep architectural
     * space, and a wide angle is the one lens choice that cannot deliver one.
     */
    const view: Viewpoint = {
      target: [0, 0.80, -9.0], distance: 8.6, azimuthDeg: 0, elevationDeg: 3.5, fovDeg: 33,
    };
    const eye = eyeOf(view);
    const SIDE_X = CORRIDOR_HALF - 0.20;

    /* THE CORRIDOR ITSELF, which is the same for every page of the spine. Built once; only the records inside
       it are rebuilt when the page changes. */
    const staticDrawsFor = (th: SceneTheme): LitDraw[] => [
      { mesh: floorMesh, model: modelOf(0, -0.06, CORRIDOR_MID), normalMat: N3,
        material: { baseColour: scenery(th, '#080C15', th.ground), roughness: 0.84, metalness: 0 } },
      { mesh: wallMesh, model: modelOf(-CORRIDOR_HALF, 1.5, CORRIDOR_MID), normalMat: N3,
        material: { baseColour: scenery(th, '#141F35', th.structure), roughness: 0.62, metalness: 0.03 } },
      { mesh: wallMesh, model: modelOf(CORRIDOR_HALF, 1.5, CORRIDOR_MID), normalMat: N3,
        material: { baseColour: scenery(th, '#141F35', th.structure), roughness: 0.62, metalness: 0.03 } },
      { mesh: ceilMesh, model: modelOf(0, 2.86, CORRIDOR_MID), normalMat: N3,
        material: { baseColour: scenery(th, '#0A101C', th.ground), roughness: 0.80, metalness: 0 } },
      /* AN ALBEDO, NOT `th.fog`. `Material.baseColour` is a reflectance and `th.fog` is a RADIANCE — in light
         it is (1.00, 1.14, 1.40), a wall reflecting 140% of the blue light that lands on it, which `theme.ts`
         names in as many words as "a reflectance above 1". The end cap is a wall of this corridor and takes
         the wall's material; `corridorHaze` then derives the fog from that same material, so "the end cap must
         EQUAL the fog" is true by construction in light instead of by two hexes agreeing in dark. */
      { mesh: endMesh, model: modelOf(0, 1.5, CORRIDOR_MID - CORRIDOR_LEN / 2), normalMat: N3,
        material: { baseColour: scenery(th, '#0B1220', th.structure), roughness: 0.86, metalness: 0 } },
    ];

    const lightDir = LIGHT_DIR as [number, number, number];
    const sceneMin: [number, number, number] = [-2.2, 0, -(DEPTH_M + NOW_OFFSET_M + 2)];
    const sceneMax: [number, number, number] = [2.2, 3.4, 3.0];
    const lightVP = lightViewProjection(
      { direction: lightDir, colour: [1, 1, 1], extent: 11 },
      boundsCentre(sceneMin, sceneMax), boundsRadius(sceneMin, sceneMax),
    );
    /* FROM THE VIEWPOINT, NOT HAND-WRITTEN: these planes linearise the depth buffer for occlusion, and
       linearising with planes the projection was not built from is silently wrong — the AO then describes a
       slightly different scene, which reads as its strength being mistuned. */
    const { near, far } = nearFarOf(view);
    const vp = viewProjection(view, W / H);

    /*
     * ONE FRAME, THEN NOTHING. §6 rule 2 forbids idle animation, and this is why the reduced-motion case needs
     * no branch: a still frame is already the final frame. No requestAnimationFrame, no setInterval.
     */
    /* The stops live at module scope now, next to `ambientOn`, because the haze derivation reads the SAME sky
       the lit pass and the record pass are handed. Three readers, one stop set — see `skyStops`. */

    /**
     * ══ THE RECORD PASS — UNLIT, AFTER THE CORRIDOR, OVER THE DEPTH THE PREPASS ALREADY WROTE ═══════
     *
     * The records are still in the shadow pass and the depth prepass, and that is what makes this change
     * invisible to the corridor: their shadows still fall on the walls, their occlusion still reaches AO, and
     * the shell fragments behind them are still depth-rejected exactly as before. Only the fragments the
     * records themselves cover are painted by a different program.
     *
     * STATE IS SAVED AND RESTORED BY HAND, because `env/passState.ts` is internal to the package and
     * `env/lit.ts`'s note on it is exactly right: leaving state for the next caller to "happen to" set is how a
     * blit comes back empty on one driver. The blit that follows disables the depth test itself and would be
     * culled away if this left `CULL_FACE` on in a state it did not find it in.
     */
    const drawRecords = (
      th: SceneTheme,
      recs: readonly { readonly mesh: MeshBuffer; readonly model: Float32Array; readonly verdict: AuditVerdict }[],
      radiance: Readonly<Record<AuditVerdict, Linear>>,
      /* PASSED IN, NOT RECOMPUTED. `renderScene` clears the target to this and the lit pass fogs to it; a
         second `corridorHaze(th, …)` here is a second chance for the marks and the room to disagree about
         what the corridor's far end looks like, which is invisible because it reads as a lighting choice. */
      fc: Linear,
    ): void => {
      if (recs.length === 0) return;
      const wasCull = gl.isEnabled(gl.CULL_FACE);
      const wasCullMode = gl.getParameter(gl.CULL_FACE_MODE) as number;
      const wasBlend = gl.isEnabled(gl.BLEND);
      const wasDepth = gl.isEnabled(gl.DEPTH_TEST);
      const wasDepthFunc = gl.getParameter(gl.DEPTH_FUNC) as number;
      const wasDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK) as boolean;
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.useProgram(recProg);
      const u = (n: string) => gl.getUniformLocation(recProg, n);
      gl.uniformMatrix4fv(u('uViewProj'), false, vp);
      gl.uniform3f(u('uEye'), eye[0], eye[1], eye[2]);
      /*
       * `inverseToneMap(th.plate)`, NOT `th.plate`. This pass is UNLIT, so whatever is written here goes
       * straight into the scene target as a RADIANCE and then through the curve — and an albedo written as a
       * radiance is a claim that the card emits 100% of its own reflectance, i.e. that it is a light source.
       * In dark that was harmless by accident: the curve is the identity to within a rounding step at
       * #0E1628, and this expression is byte-identical there. In light it made every card render at
       * rgb(220,220,220) for an authored #FFFFFF — a card three tenths under its own colour, sitting in a
       * room that was three tenths under its own colour for a different reason. Writing the radiance that
       * tone-maps back to the albedo is the same rule the verdict stripe already obeys, applied to the half
       * of the card that is scenery.
       */
      const plate = inverseToneMap(th.plate);
      gl.uniform3f(u('uPlate'), plate[0], plate[1], plate[2]);
      gl.uniform1f(u('uBandTopY'), BAND_TOP_LOCAL_Y);
      gl.uniform1f(u('uFogDensity'), FOG_DENSITY);
      gl.uniform1f(u('uFogHeight'), FOG_SPEC.height);
      gl.uniform1f(u('uFogFloor'), FOG_SPEC.floor);
      gl.uniform3f(u('uFogColour'), fc[0], fc[1], fc[2]);
      bindSky(gl, recProg, skyStops(th));
      for (const r of recs) {
        const c = radiance[r.verdict];
        gl.uniformMatrix4fv(u('uModel'), false, r.model);
        gl.uniform3f(u('uVerdict'), c[0], c[1], c[2]);
        gl.bindVertexArray(r.mesh.vao);
        gl.drawElements(gl.TRIANGLES, r.mesh.indexCount, r.mesh.indexType, 0);
      }
      gl.bindVertexArray(null);
      gl.depthMask(wasDepthMask);
      gl.depthFunc(wasDepthFunc);
      gl.cullFace(wasCullMode);
      if (!wasCull) gl.disable(gl.CULL_FACE);
      if (wasBlend) gl.enable(gl.BLEND);
      if (!wasDepth) gl.disable(gl.DEPTH_TEST);
    };

    /* A FUNCTION NOW, SO IT CAN BE MEASURED — and it ends with `target` bound, which is what `probeSync`
       requires: a `readPixels` only guarantees completion of work affecting the framebuffer it reads.
       IT TAKES TWO LISTS. `occluders` is everything that owns depth and casts shadow, records included;
       `shell` is only what the LIT renderer paints. Splitting them here rather than at the call site is what
       keeps the shadow map and the prepass complete while the records leave the lit pass. */
    const renderScene = (
      th: SceneTheme,
      occluders: readonly LitDraw[],
      shell: readonly LitDraw[],
      recs: readonly { readonly mesh: MeshBuffer; readonly model: Float32Array; readonly verdict: AuditVerdict }[],
      radiance: Readonly<Record<AuditVerdict, Linear>>,
    ): void => {
      const rig = rigFor(th);
      /* SOLVED ONCE PER FRAME AND USED BY EVERY TERM BELOW — the key, the ambient and the haze that must agree
         with what they light. Exactly 1 in dark, see `solvedExposure`. */
      const exposure = solvedExposure(th);
      const fc = corridorHaze(th, exposure);
      lit.shadowPass(lightVP, occluders, shadow);
      target.bind();
      gl.clearColor(fc[0], fc[1], fc[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      lit.depthPrepass(vp, occluders);
      if (ao) {
        ao.compute({
          depthTexture: target.depthTexture, near, far, fovDeg: view.fovDeg ?? 33,
          aspect: W / H, radius: 0.42, strength: 1.35,
        });
        target.bind();
      }
      lit.draw({
        viewProj: vp, eye, lightDir,
        /* THE RATIO IS UNTOUCHED AND THE SCALE IS SOLVED. Both terms take the SAME `exposure`, so the light
           rig's authored key:ambient is exactly what it was; what changed is that the room now leaves the
           pipeline at the albedos the palette states instead of at 70% of them. */
        lightColour: [
          KEY_COLOUR[0] * rig.key * exposure,
          KEY_COLOUR[1] * rig.key * exposure,
          KEY_COLOUR[2] * rig.key * exposure,
        ],
        ambientGain: AMBIENT_GAIN * rig.ambient * exposure, sky: skyStops(th), lightVP, shadow,
        shadowStrength: SHADOW_STRENGTH * rig.shadow,
        shadowTaps: Q.shadowTaps, shadowBaseline: SHADOW_BASELINE, draws: shell,
        ao: ao ? ao.texture : null, screenSize: [W, H],
        fog: { density: FOG_DENSITY, height: FOG_SPEC.height, floor: FOG_SPEC.floor, colour: fc },
      });
      drawRecords(th, recs, radiance, fc);
    };

    /*
     * ONE REDRAW, WHICH IS THE WHOLE RESPONSE TO A NEW PAGE OF THE SPINE — no context, no program, no target.
     *
     * The previous page's slab is released FIRST: building the new one before disposing the old would hold two
     * on the GPU at once, and forgetting the release is silent — `Stage` owns programs and its own targets and
     * knows nothing about a VAO, so it would be one vertex array and four buffers stranded per page turn.
     */
    /* Which theme the frame on screen was drawn at — see `SurfaceReliefGl.tsx`, A THEME CHANGE IS A REDRAW. */
    let drawnTheme: ThemeName | null = null;

    const draw = (entryPage: readonly AuditEntry[]): 'STALE_TIER' | undefined => {
      /* READ PER FRAME, NOT CAPTURED AT SETUP — `ForgeBackdrop.tsx:120-127` records what the snapshot cost. */
      const th = sceneTheme(liveTheme());
      /* The previous page's projected labels are dropped BEFORE the new frame exists, and before any refusal:
         a record from the page the reader has navigated away from, sitting over a freshly drawn corridor, is a
         stale picture of a governed action presented as live. */
      setPlan(null);
      const b = buildVault(entryPage);
      if ('refusal' in b) { refuse(b.refusal); return undefined; }
      const { records, cappedFrom, spanHours, nearHours, recPx, recW, tierH, hoursPerMetre } = b;
      const REC_W = recW, REC_PX = recPx, TIER_H = tierH;
      /* MEASURED FROM THE NEAR WALL, WHICH IS THE NEWEST RECORD — see `buildVault`. Still linear in time, and
         still one scale for the whole frame, so two records the same age are the same depth and the ruler and
         the records are placed by one function. */
      const zOf = (hoursAgo: number): number =>
        -((hoursAgo - nearHours) / hoursPerMetre) - NOW_OFFSET_M;

      releaseData();
      const recMeshOut = uploadMesh(stage, box(REC_W, REC_H, REC_T));
      if ('kind' in recMeshOut) { refuse(recMeshOut.code); return undefined; }
      const recMesh = recMeshOut;
      data.disposers.push(() => recMesh.dispose());

      /*
       * RECORDS ARE ANGLED SIGNAGE, NOT WALL PLAQUES. Mounted flat, a record's normal points across the corridor
       * at the centre line — where the reader stands — so it is seen almost along its own plane. Turned toward
       * the axis at 0.42 of a right angle, which is how signage in a real corridor is hung. The facing is AIMED
       * AT THE MEASURED EYE rather than derived from a winding convention: reasoning the sign out got it
       * backwards once and put 19 records face-first into their own walls.
       *
       * Records alternate walls, so two actions minutes apart do not occlude each other, and a record within one
       * record-width of the last one on its wall goes UP A TIER instead of overlapping it — the density reading.
       */
      const lastOnWall = [{ z: Infinity, tier: -1 }, { z: Infinity, tier: -1 }];
      const placed = records.map((r, i) => {
        const left = i % 2 === 0;
        const wall = left ? 0 : 1;
        const x = left ? -SIDE_X : SIDE_X;
        const z = zOf(r.hoursAgo);
        const toEye = Math.atan2(eye[0] - x, eye[2] - z);
        const yaw = toEye * RECORD_FACE + (left ? 1 : -1) * (Math.PI / 2) * (1 - RECORD_FACE);
        const prev = lastOnWall[wall]!;
        const crowded = Math.abs(z - prev.z) < REC_W * 1.05;
        /* Tiers WRAP rather than climbing into the ceiling: a record 2 m up is a record nobody reads. A wrapped
           stack loses one behind another, so it is counted as a hidden record with its own reason. */
        const stackTier = crowded ? (prev.tier + 1) % MAX_TIERS : 0;
        const wrapped = crowded && prev.tier + 1 >= MAX_TIERS;
        lastOnWall[wall] = { z, tier: stackTier };
        const y = REC_Y + stackTier * TIER_H;
        return {
          r, x, y, z, yaw, wrapped,
          distance: Math.hypot(x - eye[0], y - eye[1], z - eye[2]),
        };
      });

      const shellDraws = staticDrawsFor(th);
      const recDraws = placed.map((p) => ({
        mesh: recMesh, model: modelOf(p.x, p.y, p.z, p.yaw), verdict: p.r.verdict,
      }));
      /*
       * THE SAME RECORDS AS `LitDraw`s, FOR THE TWO PASSES THAT READ ONLY `mesh` AND `model`.
       * `shadowPass` and `depthPrepass` (`env/lit.ts`) use the position-only program and never look at a
       * material or a normal matrix, which is why the records can leave the LIT pass without leaving those two
       * — and leaving those two is what would have moved the corridor. The material below therefore reaches no
       * shader at all; it is here because `LitDraw` requires the field, and it is named rather than filled with
       * a plausible-looking albedo somebody would later read as the record's colour.
       */
      const occluders: LitDraw[] = [
        ...shellDraws,
        ...recDraws.map((d): LitDraw => ({
          mesh: d.mesh, model: d.model, normalMat: normalOf(d.model), material: PASS_ONLY_MATERIAL,
        })),
      ];
      /* ONE RESOLUTION PER VERDICT PER FRAME, not one per record: `precompensate` is pure and 18 records on a
         page share three answers. The refusals are collected so the frame can name them. */
      const marks = { ALLOWED: markRadiance('ALLOWED', th.name), BLOCKED: markRadiance('BLOCKED', th.name), WITHHELD: markRadiance('WITHHELD', th.name) } as const;
      const radiance: Record<AuditVerdict, Linear> = {
        ALLOWED: marks.ALLOWED.colour, BLOCKED: marks.BLOCKED.colour, WITHHELD: marks.WITHHELD.colour,
      };
      const markRefusals = [marks.ALLOWED.refusal, marks.BLOCKED.refusal, marks.WITHHELD.refusal]
        .filter((x): x is string => x !== null);

      /*
       * THE PROBE, TAKEN BEFORE ANYTHING IS PRESENTED. `pickQualityTier` exists to choose a tier from one
       * measured frame and had no caller in this repo; this is one. A discarded warm-up frame first — the first
       * frame pays shader upload, and charging that to the GPU would downgrade every machine — then two
       * sync-bounded samples of which the cheaper is used, because one sample can catch a GC pause and a single
       * unlucky 40 ms would drop a fast machine for the rest of the page load.
       *
       * IT MUST SIT ABOVE THE PRESENT AND ABOVE THE CONTRAST READ BELOW. Those measure the frame that is on
       * screen; if the tier turns out to be stale there is no frame on screen to measure, and a WCAG ratio taken
       * off a frame nobody will see is a number about nothing.
       *
       * AND IT NEVER RUNS ON A REDRAW: `needsQualityProbe()` is false the moment a tier resolves, so a page turn
       * cannot re-time the machine and make the quality ladder follow the dataset instead of the GPU.
       */
      if (needsQualityProbe()) {
        const ms = measureFrameMs(gl, () => renderScene(th, occluders, shellDraws, recDraws, radiance));
        const r = recordQualityProbe({
          pick: pickQualityTier, gl, msAtProbeTier: ms, probeTier: tier, source: 'VaultReliefGl',
        });
        if (r.tier !== tier) return 'STALE_TIER';
      }

      renderScene(th, occluders, shellDraws, recDraws, radiance);
      presenter.present(target, { theme: th.name });
      /* RECORDED ONLY ONCE THE FRAME IS PRESENTED, so a STALE_TIER return cannot leave the observer believing a
         theme is on screen that never reached it. */
      drawnTheme = th.name;
      /* STAMPED, because `env/quality.ts` is explicit that a tier which cannot be reported cannot be trusted. */
      canvas.dataset.qualityTier = tier;

      const err = gl.getError();
      if (err !== 0) { refuse('GL_ERROR_AFTER_DRAW'); return undefined; }

      /*
       * ══════════════════════════════════════════════════════════════════════════════════
       * READABILITY, MEASURED OFF THE FRAME — because "readable" was a metres test wearing the word.
       * ══════════════════════════════════════════════════════════════════════════════════
       *
       * The background beneath every record is now in the default framebuffer, and the type's effective alpha is
       * exactly `line opacity × element opacity`, both of which this file owns. So the composited glyph colour is
       * computable rather than guessable, and the comparison is the same WCAG ratio a reader's own checker would
       * run. Read ONCE, whole, into a CPU buffer: fifty small `readPixels` calls are fifty pipeline stalls, and
       * they would all be reading the same finished frame anyway.
       *
       * Best-possible, not average: these ratios are for a FULLY covered glyph pixel, so an antialiased edge is
       * worse than this and a run that fails here fails for certain.
       */
      const pixels = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      /* THE BRIGHTEST PIXEL IN THE BOX, not the mean. All the type here is light, so a light background is the
         worst case; a mean would let a bright patch under a word average away against the dark slab beside it and
         report a contrast no glyph actually has. `readPixels` counts rows from the bottom, hence `H - 1 -`. */
      const brightestBehind = (
        cx: number, cy: number, hx: number, hy: number,
      ): [number, number, number] | null => {
        const x0 = Math.round((cx - hx) * dpr), x1 = Math.round((cx + hx) * dpr);
        const y0 = Math.round((cy - hy) * dpr), y1 = Math.round((cy + hy) * dpr);
        /* AN OFF-FRAME SAMPLE BOX REFUSES rather than clamping to the frame edge: a clamped read measures a
           background that is not behind the text, and an invented ratio is worse than a named absence. */
        if (x1 < 0 || y1 < 0 || x0 > W - 1 || y0 > H - 1) return null;
        let best: [number, number, number] = [0, 0, 0], bestL = -1;
        for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
          const row = (H - 1 - y) * W;
          for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
            const i = (row + x) * 4;
            const l = relLum(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!);
            if (l > bestL) { bestL = l; best = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!]; }
          }
        }
        return bestL < 0 ? null : best;
      };

      const fogAt = (dist: number): number => 1 - Math.exp(-FOG_DENSITY * dist);
      const inQuad = (q: readonly { x: number; y: number }[], x: number, y: number): boolean => {
        let sign = 0;
        for (let i = 0; i < 4; i++) {
          const a = q[i]!, b = q[(i + 1) % 4]!;
          const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
          if (Math.abs(cross) < 1e-9) continue;
          const sg = cross > 0 ? 1 : -1;
          if (sign === 0) sign = sg;
          else if (sg !== sign) return false;
        }
        return true;
      };

      /*
       * DECIDED NEAR TO FAR, PAINTED FAR TO NEAR — two orders, for opposite reasons. Sorting far-to-near is right
       * for painting, because a later element covers an earlier one; it is exactly wrong for DECIDING occlusion,
       * because the already-accepted quads are then the ones behind the record being tested. That version reported
       * zero occlusions against a capture that visibly had them.
       */
      const shownQuads: { x: number; y: number }[][] = [];
      const decided = [...placed].sort((a, b) => a.distance - b.distance).map((p) => {
        /* `REC_ELEM_PX`, not a second `Math.round(REC_H * PX_PER_METRE)` — `BAND_PX` is the remainder of this
           exact number, and two copies of one derivation is how a stripe ends up sized against a card that is
           no longer that tall. */
        const ew = REC_PX, eh = REC_ELEM_PX;
        const corners = uprightPanelCorners(p.x, p.z, p.y - REC_H / 2, REC_W, REC_H, p.yaw, REC_T / 2 + 0.004);
        const proj = projectQuad(vp, corners, cssW, cssH, ew, eh);
        const refusal = isQuadRefusal(proj) ? proj.refusal : null;
        const backFacing = !isQuadRefusal(proj) && proj.signedArea <= 0;
        const widthPx = isQuadRefusal(proj) ? 0 : Math.max(
          Math.hypot(proj.screen[0]!.x - proj.screen[1]!.x, proj.screen[0]!.y - proj.screen[1]!.y),
          Math.hypot(proj.screen[3]!.x - proj.screen[2]!.x, proj.screen[3]!.y - proj.screen[2]!.y),
        );
        const edgeOn = widthPx < MIN_PROJECTED_PX;
        const tooFar = p.distance > LEGIBLE_M;
        /* A LINE THAT WILL NOT FIT REFUSES, because `overflow: hidden` would otherwise serve a truncated
           identifier as though it were the name of a governed action. */
        const tooLong = lineWidthOf(p.r) > REC_PX - 10;
        /*
         * SYMMETRIC OCCLUSION. Testing only "is a corner of the far record inside a nearer quad" misses the
         * commonest case, where a large near record covers the MIDDLE of a smaller far one and neither quad's
         * corners land inside the other. Checking both directions is still four cheap point-in-quad tests a pair.
         * Two corners is the threshold: one clipped corner still leaves the action and the actor legible.
         */
        const screen = isQuadRefusal(proj) ? [] : proj.screen.map((c) => ({ x: c.x, y: c.y }));
        const coveredCorners = screen.length === 0 ? 0 : (
          screen.filter((c) => shownQuads.some((q) => inQuad(q, c.x, c.y))).length
          + shownQuads.reduce((n, q) => n + q.filter((c) => inQuad(screen, c.x, c.y)).length, 0)
        );
        const occluded = coveredCorners >= 2;
        const opacity = 1 - 0.75 * fogAt(p.distance);
        /*
         * SAMPLED OVER THE PLATE, NOT OVER THE CARD. The bottom `BAND_FRAC` of the face is the verdict stripe
         * and no glyph is ever laid on it, so a box centred on the whole card would fold the stripe's colour
         * into a ratio the type does not have — and because `brightestBehind` takes the BRIGHTEST pixel, in
         * dark that would be the stripe every single time and the reported ratio would be for a background no
         * line sits on. Walked down the quad's own top→bottom axis rather than down its bounding box, because
         * the card is yawed and the box's centre is not the card's.
         */
        const sample = screen.length === 0 ? null : (() => {
          const mid = (a: { x: number; y: number }, b: { x: number; y: number }) =>
            ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
          const top = mid(screen[0]!, screen[1]!), bot = mid(screen[3]!, screen[2]!);
          const t = (1 - BAND_FRAC) / 2;
          const cx = top.x + t * (bot.x - top.x), cy = top.y + t * (bot.y - top.y);
          if (cx < 0 || cx > cssW || cy < 0 || cy > cssH) return null;
          const plateH = Math.hypot(bot.x - top.x, bot.y - top.y) * (1 - BAND_FRAC);
          return { cx, cy, hx: Math.max(1, widthPx / 4), hy: Math.max(1, plateH / 4) };
        })();
        const bg = sample ? brightestBehind(sample.cx, sample.cy, sample.hx, sample.hy) : null;
        const bgLum = bg ? relLum(bg[0], bg[1], bg[2]) : null;
        /*
         * ONE RATIO COVERS ALL FOUR LINES, and that is a consequence of the fix rather than a shortcut: every
         * entry in `LINE_SPEC` is fully opaque and they all take one colour, so the composited value is
         * identical for all of them and the element's own fog opacity is the only alpha in play. The harness
         * measured per line because it USED to rank the lines by alpha, and that ranking was what cost it its
         * reach. If a per-line alpha is ever reintroduced this must go back to a per-line minimum, because a
         * record whose action you can read and whose actor you cannot is the truncation failure in a costume.
         */
        /*
         * THE TYPE COLOUR IS CHOSEN FROM THE BACKGROUND THIS FRAME ACTUALLY RENDERED, not from the theme.
         * `INK` carries the argument; the short version is that the ground is the theme's plate diluted by
         * however much fog this record's depth earns, so the near cards and the far ones are two different
         * backgrounds inside one theme and only the frame knows which is which.
         */
        const candidates = bg && bgLum !== null
          ? ([WHITE, INK] as const).map((fg) => ({ fg, r: ratioOf(overBg(bg, opacity, fg), bgLum) }))
          : null;
        const best = candidates === null ? null
          : candidates.reduce((a, b) => (b.r > a.r ? b : a));
        const minRatio = best === null ? null : best.r;
        const colour = best === null ? '#fff' : `rgb(${best.fg[0]},${best.fg[1]},${best.fg[2]})`;
        const tooFaint = minRatio === null || minRatio < AA_RATIO;
        const shown = !refusal && !backFacing && !edgeOn && !tooFar && !tooLong && !tooFaint
          && !occluded && !p.wrapped;
        if (shown) shownQuads.push(screen);
        /* NAMED, NOT COUNTED, and in priority order. "17 hidden" is useless; an operator does something different
           about a record they are too far from than about one that is covered. */
        const hiddenBecause = shown ? null
          : refusal ?? (p.wrapped ? 'STACK_WRAPPED'
            : backFacing ? 'BACK_FACING'
              : edgeOn ? 'EDGE_ON'
                : tooFar ? 'BEYOND_LEGIBLE_RANGE'
                  : tooLong ? 'LINE_TOO_LONG_TO_SHOW'
                    : minRatio === null ? 'CONTRAST_UNMEASURABLE'
                      : minRatio < AA_RATIO ? 'BELOW_READABLE_CONTRAST' : 'OCCLUDED');
        return { p, proj, shown, hiddenBecause, ew, eh, opacity, minRatio, tooFar, colour };
      });

      const overlay: OverlayRecord[] = [];
      for (const d of [...decided].sort((a, b) => b.p.distance - a.p.distance)) {
        if (!d.shown || isQuadRefusal(d.proj)) continue;
        overlay.push({
          key: d.p.r.id,
          transform: d.proj.transform,
          ew: d.ew, eh: d.eh,
          /* The text obeys the same atmosphere as the slab, and this is the ONE owner of that law — computed in
             the decision pass so the measured ratios above describe exactly these pixels. */
          opacity: d.opacity,
          colour: d.colour,
          lines: LINE_SPEC.map((ln) => ({ text: ln.text(d.p.r), style: styleOf(ln) })),
        });
      }

      /*
       * THE DEPTH RULER, so "depth is time" is a marked axis rather than an assertion. Screen space, because it
       * annotates the corridor rather than living in it — which is also why it takes a CONSTANT alpha: fog is a
       * property of the corridor, and fogging an axis label about the corridor deletes the axis while leaving the
       * claim on the frame. Three of the harness's four ticks were at 1.04:1 to 3.4:1 under the old fogged law and
       * `rulerOffFrame: 0` reported them as fine, because that was a frame-BOUNDS count.
       *
       * A tick that does not measure at AA is NOT DRAWN and is counted, for the same reason a record is not.
       */
      const RULER_ALPHA = 0.85;
      /* MEASURED AGAINST THE COLOUR ACTUALLY PAINTED. The ruler's token moves with the theme, so measuring it as
         white on a light corridor would have dropped every tick for being 1.1:1 while the frame drew them at
         15:1 — a refusal caused by the measurement disagreeing with the paint, which is the exact class of bug
         `LINE_SPEC` was restructured to prevent. */
      const rulerFg = th.name === 'dark' ? WHITE : INK;
      const spanDays = spanHours / 24;
      const nearDays = nearHours / 24;
      const CANDIDATES = [1 / 24, 3 / 24, 6 / 24, 0.5, 1, 2, 3, 7, 14, 30, 60, 90, 180, 365];
      /*
       * TICKS INSIDE THE CORRIDOR, AND THE NEAR WALL IS ALWAYS ONE OF THEM.
       *
       * The candidates are ABSOLUTE ages and the labels stay absolute, because "3d" is a fact about the record
       * and "0d from the near wall" is a fact about this drawing. What changed with the near wall is which of
       * them are ON the corridor at all: a 1d tick on a page whose newest record is 3d old is behind the
       * reader, and the old filter — `d <= spanDays` alone — projected it there anyway and then counted it as
       * unreadable, which named a contrast problem for what was a placement one.
       *
       * The near wall's own age is appended rather than filtered for, because it is the one number on this
       * axis that no candidate list can be relied on to contain and the one a reader needs first.
       */
      const labelOf = (d: number): string =>
        (d < 1 ? `${Math.round(d * 24)}h` : `${Number(d.toFixed(2))}d`);
      const inSpan = CANDIDATES.filter((d) => d >= nearDays && d <= spanDays);
      /* DEDUPED ON THE LABEL, NOT ON THE NUMBER, because the near wall at 3.0004 d and the 3 d candidate are two
         numbers and one tick — and `ruler` is keyed by its label in the DOM, so two of them is a duplicate key
         and a React warning rather than a second mark anyone can see. */
      const picks = [nearDays, ...(inSpan.length <= 3 ? inSpan
        : [0, 1, 2].map((k) => inSpan[Math.round((k * (inSpan.length - 1)) / 2)]!))]
        .filter((d, i, all) => all.findIndex((o) => labelOf(o) === labelOf(d)) === i);
      let rulerUnreadable = 0;
      const ruler: { label: string; sx: number; sy: number }[] = [];
      for (const days of picks) {
        const z = zOf(days * 24);
        const s = projectScreen(vp, [-CORRIDOR_HALF + 0.30, 0.035, z], cssW, cssH);
        const onFrame = !s.behind && s.sx > 0 && s.sx < cssW && s.sy > 0 && s.sy < cssH;
        const bg = onFrame ? brightestBehind(s.sx, s.sy, 13, 7) : null;
        const ratio = bg ? ratioOf(overBg(bg, RULER_ALPHA, rulerFg), relLum(bg[0], bg[1], bg[2])) : null;
        if (!onFrame || ratio === null || ratio < AA_RATIO) { rulerUnreadable++; continue; }
        ruler.push({ label: labelOf(days), sx: s.sx, sy: s.sy });
      }

      const shownRecords = decided.filter((d) => d.shown);
      const legibleHours = shownRecords.length === 0
        ? null : Math.max(...shownRecords.map((d) => d.p.r.hoursAgo));
      /* TAKEN FROM THE PREDICATE, NOT FROM `hiddenBecause`, which reports ONE reason in priority order — so a
         record both edge-on and 41 m away is named EDGE_ON and would slip through a name-based filter, making this
         horizon equal the one below it and carry no information. */
      const inRangeHours = Math.max(0, ...decided.filter((d) => !d.tooFar).map((d) => d.p.r.hoursAgo));

      setPlan({
        cssW, cssH,
        theme: th.name,
        records: overlay,
        ruler,
        rulerUnreadable,
        readableToDays: legibleHours === null ? null : Number((legibleHours / 24).toFixed(2)),
        inRangeToDays: Number((inRangeHours / 24).toFixed(2)),
        visibleToDays: Number((spanHours / 24).toFixed(2)),
        nearWallDays: Number((nearHours / 24).toFixed(2)),
        hoursPerMetre: Number(hoursPerMetre.toFixed(2)),
        shown: shownRecords.length,
        placed: placed.length,
        hiddenBy: decided.filter((d) => !d.shown).reduce<Record<string, number>>((acc, d) => {
          const k = d.hiddenBecause ?? 'UNKNOWN';
          acc[k] = (acc[k] ?? 0) + 1;
          return acc;
        }, {}),
        counts: {
          ALLOWED: placed.filter((p) => p.r.verdict === 'ALLOWED').length,
          BLOCKED: placed.filter((p) => p.r.verdict === 'BLOCKED').length,
          WITHHELD: placed.filter((p) => p.r.verdict === 'WITHHELD').length,
        },
        unplaced: b.unplaced,
        cappedFrom,
        /* THE CHECK ON THE HEADLINE, so the printed claim is falsifiable: the worst measured ratio among the
           records the frame actually shows. Below `AA_RATIO` and the word READABLE is not earned. */
        worstShownRatio: shownRecords.length === 0
          ? null : Number(Math.min(...shownRecords.map((d) => d.minRatio ?? 0)).toFixed(2)),
        markRefusals,
      });
      return undefined;
    };

    /* THE FIRST FRAME COMES FROM THE SETUP, NOT FROM THE DRAW EFFECT ABOVE. On a tier rebuild that effect does
       not re-run — its dependency did not change — so a rebuilt context with no draw would leave a blank canvas
       where a page of governed actions was. */
    if (draw(entriesRef.current) === 'STALE_TIER') {
      /* No context-lost listener on this path: nothing is on screen to go stale, and `onRefused` must not fire —
         the corridor is about to be rebuilt at the resolved tier, not refused. */
      return releaseAll;
    }
    /* A REFUSAL ON THE FIRST DRAW HAS ALREADY DISPOSED EVERYTHING, so there is nothing left to arm a redraw
       against and nothing left to clean up. Publishing `draw` here would leave a closure over a dead stage
       that a later data change would call — silently, because GL does not throw on a disposed context. */
    if (dead) return;
    drawRef.current = draw;

    /*
     * CONTEXT LOSS RESOLVES TO THE TABLE. Without this the canvas keeps its last frame for ever while the GPU
     * has dropped the context — a stale picture presented as live data, which on an audit log is the worst
     * possible failure. Registered on this canvas rather than the document so it cannot fire for someone else's.
     */
    const onLost = (e: Event): void => { e.preventDefault(); onRefused('CONTEXT_LOST'); };
    canvas.addEventListener('webglcontextlost', onLost);

    /* A THEME CHANGE IS A REDRAW, NOT A REBUILD — the full reasoning, including why `beforeprint` is needed for
       `BoardReport.tsx:105-109` specifically and why the `drawnTheme` guard is what makes the other three print
       handlers free, is in `SurfaceReliefGl.tsx` under that heading. It matters more here than anywhere else:
       this frame MEASURES its own readability off the pixels, so a stale-theme canvas under a fresh-theme
       overlay would publish a WCAG ratio for a background that is no longer on screen. */
    const redrawForTheme = (): void => {
      if (liveTheme() === drawnTheme) return;
      drawRef.current?.(entriesRef.current);
    };
    const themeWatch = new MutationObserver(redrawForTheme);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('beforeprint', redrawForTheme);

    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      themeWatch.disconnect();
      window.removeEventListener('beforeprint', redrawForTheme);
      drawRef.current = null;
      releaseAll();
    };
    /* `tier` IS A DEPENDENCY, and that is the rebuild mechanism: a resolved lower tier tears this context down
       and builds the corridor again at it. `entries` IS NOT, and that is the fix this file exists to carry. */
  }, [heightPx, onRefused, tier]);

  const label = (t: string): CSSProperties => ({
    font: '400 10.5px/1.5 ui-monospace, monospace', color: t, whiteSpace: 'pre-wrap',
  });

  return (
    <div>
      <div style={{ position: 'relative', overflow: 'hidden', width: '100%', height: heightPx }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: `${heightPx}px`, display: 'block' }}
          /* The slabs are a drawing of the records; the TEXT over them is real DOM text (§6 rule 4), which is
             what a screen reader and the print path read. The bitmap itself is not described twice. */
          aria-hidden="true"
        />
        {plan && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {plan.records.map((r) => (
              <div
                key={r.key}
                style={{
                  position: 'absolute', left: 0, top: 0, width: r.ew, height: r.eh,
                  transformOrigin: '0 0', transform: r.transform,
                  display: 'flex', flexDirection: 'column', justifyContent: 'center',
                  gap: TYPE_GAP_PX,
                  /* THE BOTTOM PADDING IS THE VERDICT STRIPE, and `border-box` is what makes it one.
                     `projectQuad` maps the rectangle `ew × eh` onto the card's face, so the element has to BE
                     that rectangle: under the default `content-box` a bottom pad would make the element taller
                     than the card and slide the type off it, and the 5 px side pads were already making it 10 px
                     WIDER than the face they were mapped onto — which is the same 10 px the `tooLong` test
                     subtracts, so the fit test and the layout now agree instead of nearly agreeing. */
                  boxSizing: 'border-box',
                  padding: `0 5px ${BAND_PX}px`,
                  overflow: 'hidden', opacity: r.opacity,
                  /* ONE COLOUR FOR ALL FOUR LINES, set here rather than in `LINE_SPEC`, which is what keeps the
                     single measured ratio above honest: the moment a per-line colour returns, `minRatio` has to
                     go back to a per-line minimum. */
                  color: r.colour,
                }}
              >
                {r.lines.map((ln, i) => <div key={i} style={ln.style}>{ln.text}</div>)}
              </div>
            ))}
            {plan.ruler.map((t) => (
              <div
                key={t.label}
                style={{
                  position: 'absolute', left: t.sx, top: t.sy, transform: 'translate(-50%,-50%)',
                  font: '500 10px/1 ui-monospace, monospace', letterSpacing: '.08em',
                  color: FRAME_TEXT[plan.theme].ruler, whiteSpace: 'nowrap',
                }}
              >
                {t.label}
              </div>
            ))}
            {/* THE HORIZON, ON THE FRAME. Not "here are 50 rows" but where the axis STARTS, how far back you can
                read, how far the geometry reaches, and how far you can see a shape at all — four facts, never
                one. NEAR WALL is the newest record's age: the corridor no longer begins at an unlabelled `now`,
                so the number that used to be assumed is printed. */}
            <div style={{ position: 'absolute', left: 16, top: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{
                font: '600 11px/1 ui-monospace, monospace', letterSpacing: '.16em',
                color: FRAME_TEXT[plan.theme].head,
              }}>
                GOVERNED ACTIONS · DEPTH IS TIME
              </div>
              <div style={label(FRAME_TEXT[plan.theme].body)}>
                NEAR WALL AT {plan.nearWallDays.toFixed(2)} d — THE NEWEST RECORD ON THIS PAGE
                {'\n'}{plan.readableToDays === null
                  ? `READABLE TO — nothing on this frame clears ${AA_RATIO}:1`
                  : `READABLE TO ${plan.readableToDays.toFixed(2)} d — MEASURED AT ${AA_RATIO}:1`}
                {'\n'}IN RANGE TO {plan.inRangeToDays.toFixed(2)} d (GEOMETRY) · VISIBLE TO {plan.visibleToDays.toFixed(2)} d
                {'\n'}{plan.hoursPerMetre} h PER METRE · {plan.shown} of {plan.placed} RECORDS CARRY TEXT
              </div>
            </div>
            {/* The verdict key. `forcedColorAdjust: none` on the SWATCHES ONLY: under forced colours the browser
                replaces every author colour and the canvas — a bitmap — keeps its own, so three hues became one
                white square while the slabs behind them stayed blue, red and steel. The swatch is a sample of a
                colour the renderer actually produces, which is one of the narrow cases where the author's colour
                must win; the label text keeps its forced colours, and every entry is named in words. */}
            <div style={{
              position: 'absolute', right: 16, bottom: 14, display: 'flex', flexDirection: 'column',
              gap: 5, alignItems: 'flex-end', font: '500 10.5px/1 ui-monospace, monospace',
            }}>
              {(['ALLOWED', 'BLOCKED', 'WITHHELD'] as const).map((v) => (
                <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 7, color: FRAME_TEXT[plan.theme].ruler }}>
                  <span>
                    {v} · {plan.counts[v]}
                    {v === 'ALLOWED' ? ' (the stripe along each record’s foot)' : ''}
                    {v === 'BLOCKED' ? ' (action names a refusal)' : ''}
                    {v === 'WITHHELD' ? ' (present, payload not shown)' : ''}
                  </span>
                  {/* NAMED, because a stripe is not self-describing. The key says WHERE the colour is as well
                      as what it means, once, rather than leaving a reader to infer that the coloured strip
                      along the foot of a card is the thing the swatch matches. */}
                  <span style={{
                    width: 11, height: 11, display: 'inline-block',
                    /* `statusHex`, not the albedo: this is a DOM swatch and needs the token's own
                       CSS value, not the linear colour the renderer lights. */
                    background: v === 'BLOCKED' ? statusHex('blocked', plan.theme)
                      : (v === 'ALLOWED' ? '#2C6BFF' : '#5C6880'),
                    forcedColorAdjust: 'none',
                  } as CSSProperties} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {/*
        THE COSTS, UNDER THE FRAME AND IN WORDS. Every one of these is a record the corridor did not deliver, and
        an operator does something different about each — so they are named and never summed. A view that quietly
        drops rows from an audit log is the defect this whole file is arranged to avoid.
      */}
      {plan && (
        <div style={{ ...label(FRAME_TEXT[plan.theme].caption), marginTop: 6, fontSize: 10 }}>
          {plan.unplaced.length > 0 && (
            <div>
              {plan.unplaced.length} record{plan.unplaced.length === 1 ? '' : 's'} not placed —{' '}
              {plan.unplaced.filter((u) => u.reason === 'NO_TIMESTAMP').length} with no usable timestamp,{' '}
              {plan.unplaced.filter((u) => u.reason === 'TIMESTAMP_AHEAD_OF_NOW').length} timestamped ahead of
              this clock. Depth is time, so hour zero would have been a lie; they are in the table.
            </div>
          )}
          {Object.keys(plan.hiddenBy).length > 0 && (
            <div>
              text withheld: {Object.entries(plan.hiddenBy).map(([k, n]) => `${k} ${n}`).join(' · ')}
            </div>
          )}
          {plan.worstShownRatio !== null && (
            <div>worst contrast among shown records {plan.worstShownRatio}:1 against a {AA_RATIO}:1 floor</div>
          )}
          {plan.rulerUnreadable > 0 && (
            <div>{plan.rulerUnreadable} depth tick(s) not drawn — below {AA_RATIO}:1 on this frame</div>
          )}
          {/* A NAMED ABSENCE RATHER THAN A SILENT DOWNGRADE. When `precompensate` refuses, the stripe is drawn
              at the plain albedo and ships the composite's measured 35/255 blue drop; the reader is told which
              verdict and which refusal rather than being shown a colour that quietly is not the token. */}
          {plan.markRefusals.length > 0 && (
            <div>
              verdict stripe not written exactly: {plan.markRefusals.join(' · ')} — drawn at the plain albedo,
              which the composite ships ~18 ΔE76 off the token
            </div>
          )}
          {plan.cappedFrom !== null && (
            <div>{plan.cappedFrom} records on this page, newest {MAX_RECORDS} drawn</div>
          )}
        </div>
      )}
    </div>
  );
}
