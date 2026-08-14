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
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  createStage, isStage, box, uploadMesh, createLitRenderer, createTarget3D, createShadowMap,
  createAmbientOcclusion, projectQuad, isQuadRefusal, uprightPanelCorners, projectScreen,
  viewProjection, eyeOf, nearFarOf, lightViewProjection, boundsCentre, boundsRadius,
  hexToLinear, assertBrandFidelity, IDENTITY, TONE_MAP_GLSL, SRGB_ENCODE_GLSL,
  qualitySettings, shadowMapSizeFor, pickQualityTier,
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
const PRESENT_VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const PRESENT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 frag;
${TONE_MAP_GLSL}
${SRGB_ENCODE_GLSL}
void main(){ frag = vec4(lcxEncode(lcxToneMap(texture(uScene, vUv).rgb)), 1.0); }`;

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

const VERDICT_HEX: Record<AuditVerdict, string> = {
  ALLOWED: '#2C6BFF',
  BLOCKED: '#C9552B',
  /* Withheld is neither an allow nor a block: it is the absence of a reading, and giving it either verdict
     colour would assert a finding nobody is entitled to. Steel says "a record is here". */
  WITHHELD: '#5C6880',
};
const VERDICT_MATERIAL: Record<AuditVerdict, { roughness: number; metalness: number }> = {
  ALLOWED: { roughness: 0.36, metalness: 0.06 },
  BLOCKED: { roughness: 0.42, metalness: 0.05 },
  WITHHELD: { roughness: 0.30, metalness: 0.55 },
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
 */
const LINE_SPEC: readonly {
  readonly charPx: number;
  readonly style: CSSProperties;
  readonly text: (r: VaultRecord) => string;
}[] = [
  {
    charPx: 6.5,
    style: { font: '600 9px/1 ui-monospace, monospace', letterSpacing: '.12em' },
    text: (r) => `${r.verdict} · ${whenOf(r.hoursAgo)}`,
  },
  {
    charPx: 6.7,
    style: { font: '700 11px/1.05 ui-monospace, monospace' },
    text: (r) => r.action ?? 'ACTION NOT RECORDED',
  },
  {
    charPx: 6.4,
    style: { font: '400 10.5px/1.2 ui-monospace, monospace' },
    text: (r) => r.actor ?? 'ACTOR NOT RECORDED',
  },
  {
    charPx: 5.8,
    style: { font: '400 9.5px/1.2 ui-monospace, monospace' },
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
  readonly hoursPerMetre: number;
  readonly shown: number;
  readonly placed: number;
  readonly hiddenBy: Readonly<Record<string, number>>;
  readonly counts: Readonly<Record<AuditVerdict, number>>;
  readonly unplaced: readonly VaultUnplaced[];
  readonly cappedFrom: number | null;
  readonly worstShownRatio: number | null;
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
 * THE TWO CANDIDATE TYPE COLOURS, AND WHY THE CHOICE IS MEASURED PER RECORD RATHER THAN PER THEME.
 *
 * A record's background is not the page and not the theme — it is the slab, whose albedo is the VERDICT and
 * therefore data that does not move, fogged toward the corridor's own far colour, which does. So within one
 * light-theme frame the near records sit on saturated brand blue and the far ones on near-white haze, and no
 * single type colour serves both. Measured WCAG ratios of the two candidates against the backgrounds this
 * corridor actually produces, at the element opacities the fog law hands out:
 *
 *                         a=1.00        a=0.50        a=0.25
 *   ALLOWED  #2C6BFF   4.51 / 4.36   2.22 / 2.30   1.49 / 1.50      (white / ink)
 *   BLOCKED  #C9552B   4.36 / 4.52   2.18 / 2.37   1.47 / 1.52
 *   WITHHELD #5C6880   5.60 / 3.51   2.68 / 2.05   1.70 / 1.43
 *   dark fog #0B1220  18.72 / 1.05   5.30 / 1.03   2.21 / 1.01
 *   light fog #DCE5F3  1.27 / 15.51  1.13 / 3.50   1.06 / 1.75
 *
 * Taking the better of the two is never worse than the white-only rule this shipped with — the last column of
 * every row proves it — so this is a strict improvement in the DARK theme as well as the enabling change for
 * the light one. On dark it picks white everywhere except where a steel slab is already brighter than the type,
 * and on light it picks ink for the haze and white for the saturated slabs, which is what legibility means: the
 * type follows its own ground rather than the page's.
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
 * ══ THE CORRIDOR SHELL IS SCENERY, AND ITS FOUR SURFACES ARE ORDERED ════════════════════════════════
 *
 * `packages/gl/src/look/theme.ts` argues the data/scenery line; `SurfaceReliefGl.tsx` carries the note on why
 * only the LIGHT half comes from the theme. What matters here is that the shell is four surfaces whose ORDER is
 * the architecture, and the theme's roles happen to mirror it exactly. Measured WCAG luminance of the albedos:
 *
 *   dark   floor #080C15 0.00369 < ceiling #0A101C 0.00519 < end cap #0B1220 0.00608 < wall #141F35 0.01386
 *   light  plate #FFFFFF 1.00000 > ground #E8EDF6 0.84378 > fog #DCE5F3 0.77725 > structure #C3CEE0 0.61127
 *
 * Four surfaces, same order, mirrored — so floor takes `plate`, ceiling `ground`, the end cap `fog` and the
 * walls `structure`. Two of those are not choices at all: the end cap must EQUAL the fog or the far end of the
 * corridor stops dissolving into it (its dark hex #0B1220 is already `FOG_HEX`), and the wall's dark hex #141F35
 * is already the theme's own dark `structure`.
 *
 * The VERDICT colours are data and appear nowhere here. They do not move in either theme.
 */
const scenery = (th: SceneTheme, darkHex: string, light: Linear): Linear =>
  (th.name === 'dark' ? hexToLinear(darkHex) : light);

/** The dark theme's record, held only as the denominator of the light rig's ratio — see `SurfaceReliefGl.tsx`,
    THE LIGHT RIG MOVES BY RATIO. Nothing reads a colour out of it. */
const TH_DARK = sceneTheme('dark');
const rigFor = (th: SceneTheme) => ({
  key: th.keyGain / TH_DARK.keyGain,
  ambient: th.ambientGain / TH_DARK.ambientGain,
  shadow: th.shadowStrength / TH_DARK.shadowStrength,
});

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
 * is printed under the frame. Depth is the time axis, so hour zero is the "now" wall — the single most
 * misleading place in this frame to put a record whose age nobody knows.
 */
function buildVault(entries: readonly AuditEntry[]): VaultBuild | { refusal: string } {
  if (entries.length === 0) return { refusal: 'NO_OBSERVED_RECORDS' };
  const built = buildVaultRecords(entries, Date.now());
  if (built.records.length === 0) return { refusal: 'NO_RECORD_CARRIES_A_USABLE_TIMESTAMP' };
  const cappedFrom = built.records.length > MAX_RECORDS ? built.records.length : null;
  const records = built.records.slice(0, MAX_RECORDS);
  const spanHours = records[records.length - 1]!.hoursAgo;
  const widest = Math.max(...records.map(lineWidthOf));
  const recPx = Math.max(118, Math.min(209, Math.ceil(widest + 12)));
  return {
    records, unplaced: built.unplaced, cappedFrom, spanHours,
    recPx, recW: recPx / PX_PER_METRE, tierH: REC_H + 0.10,
    /*
     * HOURS PER METRE, FROM THE DATA. Depth stays strictly linear in time — that is the environment's premise —
     * so the only free parameter is the scale, and it is set so the oldest record on the page lands at
     * `DEPTH_M`. A floor of 0.05 h/m keeps a page that spans two minutes from being drawn at a resolution the
     * geometry cannot express; when that floor binds, the corridor is simply short, which is the truth about
     * the page.
     */
    hoursPerMetre: Math.max(0.05, spanHours / DEPTH_M),
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

    const present = stage.compile(PRESENT_VERT, PRESENT_FRAG);
    if ('kind' in present) { refuse(present.code); return; }
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
        material: { baseColour: scenery(th, '#080C15', th.plate), roughness: 0.84, metalness: 0 } },
      { mesh: wallMesh, model: modelOf(-CORRIDOR_HALF, 1.5, CORRIDOR_MID), normalMat: N3,
        material: { baseColour: scenery(th, '#141F35', th.structure), roughness: 0.62, metalness: 0.03 } },
      { mesh: wallMesh, model: modelOf(CORRIDOR_HALF, 1.5, CORRIDOR_MID), normalMat: N3,
        material: { baseColour: scenery(th, '#141F35', th.structure), roughness: 0.62, metalness: 0.03 } },
      { mesh: ceilMesh, model: modelOf(0, 2.86, CORRIDOR_MID), normalMat: N3,
        material: { baseColour: scenery(th, '#0A101C', th.ground), roughness: 0.80, metalness: 0 } },
      { mesh: endMesh, model: modelOf(0, 1.5, CORRIDOR_MID - CORRIDOR_LEN / 2), normalMat: N3,
        material: { baseColour: scenery(th, '#0B1220', th.fog), roughness: 0.86, metalness: 0 } },
    ];

    /* Down the corridor and slightly to one side, so records on both walls take light at a grazing angle and
       their 5 cm edges catch it. A light down the axis would flatten every slab against its wall. */
    const lightDir: [number, number, number] = [0.34, -0.42, -0.84];
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
    /* A FUNCTION NOW, SO IT CAN BE MEASURED — and it ends with `target` bound, which is what `probeSync`
       requires: a `readPixels` only guarantees completion of work affecting the framebuffer it reads. */
    const renderScene = (th: SceneTheme, draws: readonly LitDraw[]): void => {
      const rig = rigFor(th);
      const fc = scenery(th, FOG_HEX, th.fog);
      lit.shadowPass(lightVP, draws, shadow);
      target.bind();
      gl.clearColor(fc[0], fc[1], fc[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      lit.depthPrepass(vp, draws);
      if (ao) {
        ao.compute({
          depthTexture: target.depthTexture, near, far, fovDeg: view.fovDeg ?? 33,
          aspect: W / H, radius: 0.42, strength: 1.35,
        });
        target.bind();
      }
      /* NO SKY BACKDROP IS ALLOCATED — a vault has no sky, see the header — so the theme's stops reach the lit
         pass as the irradiance environment only, with no backdrop to stay in step with. */
      const sky = th.name === 'dark' ? undefined : {
        zenith: th.skyZenith, horizon: th.skyHorizon, ground: th.ground,
      };
      lit.draw({
        viewProj: vp, eye, lightDir,
        lightColour: [3.0 * rig.key, 2.95 * rig.key, 2.85 * rig.key],
        /* 0.46, not 0.86. At the higher gain the floor and ceiling — whose normals point at the analytic sky's
           bright zenith — became two glowing wedges brighter than the key light. */
        ambientGain: 0.46 * rig.ambient, sky, lightVP, shadow,
        shadowStrength: 0.94 * rig.shadow,
        shadowTaps: Q.shadowTaps, shadowBaseline: SHADOW_BASELINE, draws,
        ao: ao ? ao.texture : null, screenSize: [W, H],
        fog: { density: FOG_DENSITY, height: 6.0, floor: 0, colour: fc },
      });
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
      const { records, cappedFrom, spanHours, recPx, recW, tierH, hoursPerMetre } = b;
      const REC_W = recW, REC_PX = recPx, TIER_H = tierH;
      const zOf = (hoursAgo: number): number => -(hoursAgo / hoursPerMetre) - NOW_OFFSET_M;

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

      const draws: LitDraw[] = [
        ...staticDrawsFor(th),
        ...placed.map((p): LitDraw => {
          const model = modelOf(p.x, p.y, p.z, p.yaw);
          const mat = VERDICT_MATERIAL[p.r.verdict];
          return {
            mesh: recMesh, model, normalMat: normalOf(model),
            material: { baseColour: hexToLinear(VERDICT_HEX[p.r.verdict]), ...mat },
          };
        }),
      ];

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
        const ms = measureFrameMs(gl, () => renderScene(th, draws));
        const r = recordQualityProbe({
          pick: pickQualityTier, gl, msAtProbeTier: ms, probeTier: tier, source: 'VaultReliefGl',
        });
        if (r.tier !== tier) return 'STALE_TIER';
      }

      renderScene(th, draws);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.disable(gl.DEPTH_TEST);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, target.texture);
      /* `blit` takes a CALLBACK, not a texture: the uniform is set against the program it has just bound. */
      stage.blit(present, (p) => gl.uniform1i(gl.getUniformLocation(p, 'uScene'), 0));
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
        const ew = REC_PX, eh = Math.round(REC_H * PX_PER_METRE);
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
        const sample = screen.length === 0 ? null : (() => {
          const xs = screen.map((c) => c.x), ys = screen.map((c) => c.y);
          const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
          const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
          const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
          if (cx < 0 || cx > cssW || cy < 0 || cy > cssH) return null;
          return { cx, cy, hx: Math.max(1, (x1 - x0) / 4), hy: Math.max(1, (y1 - y0) / 4) };
        })();
        const bg = sample ? brightestBehind(sample.cx, sample.cy, sample.hx, sample.hy) : null;
        const bgLum = bg ? relLum(bg[0], bg[1], bg[2]) : null;
        /*
         * ONE RATIO COVERS ALL FOUR LINES, and that is a consequence of the fix rather than a shortcut: every
         * entry in `LINE_SPEC` is fully opaque white, so the composited colour is identical for all of them and
         * the element's own fog opacity is the only alpha in play. The harness measured per line because it USED
         * to rank the lines by alpha, and that ranking was what cost it its reach. If a per-line alpha is ever
         * reintroduced this must go back to a per-line minimum, because a record whose action you can read and
         * whose actor you cannot is the truncation failure in a different costume.
         */
        /*
         * THE TYPE COLOUR IS CHOSEN FROM THE BACKGROUND THIS FRAME ACTUALLY RENDERED, not from the theme.
         * `INK` carries the measured table and the argument; the short version is that within one light-theme
         * frame a near record sits on saturated brand blue and a far one on near-white haze, and neither white
         * nor ink serves both. Taking the better of the two is never worse than the white-only rule this
         * shipped with, so this also lifts the dark theme's reach on steel slabs.
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
          lines: LINE_SPEC.map((ln) => ({ text: ln.text(d.p.r), style: ln.style })),
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
      const CANDIDATES = [1 / 24, 3 / 24, 6 / 24, 0.5, 1, 2, 3, 7, 14, 30, 60, 90, 180, 365];
      const inSpan = CANDIDATES.filter((d) => d <= spanDays);
      const picks = inSpan.length <= 4 ? inSpan
        : [0, 1, 2, 3].map((k) => inSpan[Math.round((k * (inSpan.length - 1)) / 3)]!);
      let rulerUnreadable = 0;
      const ruler: { label: string; sx: number; sy: number }[] = [];
      for (const days of picks) {
        const z = zOf(days * 24);
        const s = projectScreen(vp, [-CORRIDOR_HALF + 0.30, 0.035, z], cssW, cssH);
        const onFrame = !s.behind && s.sx > 0 && s.sx < cssW && s.sy > 0 && s.sy < cssH;
        const bg = onFrame ? brightestBehind(s.sx, s.sy, 13, 7) : null;
        const ratio = bg ? ratioOf(overBg(bg, RULER_ALPHA, rulerFg), relLum(bg[0], bg[1], bg[2])) : null;
        if (!onFrame || ratio === null || ratio < AA_RATIO) { rulerUnreadable++; continue; }
        ruler.push({
          label: days < 1 ? `${Math.round(days * 24)}h` : `${days}d`,
          sx: s.sx, sy: s.sy,
        });
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
                  gap: 4, padding: '0 5px', overflow: 'hidden', opacity: r.opacity,
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
            {/* THE HORIZON, ON THE FRAME. Not "here are 50 rows" but how far back you can read, how far the
                geometry reaches, and how far you can see a shape at all — three facts, never one. */}
            <div style={{ position: 'absolute', left: 16, top: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{
                font: '600 11px/1 ui-monospace, monospace', letterSpacing: '.16em',
                color: FRAME_TEXT[plan.theme].head,
              }}>
                GOVERNED ACTIONS · DEPTH IS TIME
              </div>
              <div style={label(FRAME_TEXT[plan.theme].body)}>
                {plan.readableToDays === null
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
                    {v === 'BLOCKED' ? ' (action names a refusal)' : ''}
                    {v === 'WITHHELD' ? ' (present, payload not shown)' : ''}
                  </span>
                  <span style={{
                    width: 11, height: 11, display: 'inline-block', background: VERDICT_HEX[v],
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
          {plan.cappedFrom !== null && (
            <div>{plan.cappedFrom} records on this page, newest {MAX_RECORDS} drawn</div>
          )}
        </div>
      )}
    </div>
  );
}
