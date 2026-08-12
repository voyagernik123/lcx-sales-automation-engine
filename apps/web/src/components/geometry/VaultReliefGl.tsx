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
  type LitDraw, type Viewpoint, type MeshBuffer,
} from '@lcx/gl';
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
    style: { font: '600 9px/1 ui-monospace, monospace', letterSpacing: '.12em', color: '#fff' },
    text: (r) => `${r.verdict} · ${whenOf(r.hoursAgo)}`,
  },
  {
    charPx: 6.7,
    style: { font: '700 11px/1.05 ui-monospace, monospace', color: '#fff' },
    text: (r) => r.action ?? 'ACTION NOT RECORDED',
  },
  {
    charPx: 6.4,
    style: { font: '400 10.5px/1.2 ui-monospace, monospace', color: '#fff' },
    text: (r) => r.actor ?? 'ACTOR NOT RECORDED',
  },
  {
    charPx: 5.8,
    style: { font: '400 9.5px/1.2 ui-monospace, monospace', color: '#fff' },
    /* THREE STATES, THREE STRINGS. A withheld subject exists and may not be shown; an unrecorded one never
       existed. Collapsing them into one blank is the table's failure, and it is the reading this view exists
       to keep. */
    text: (r) => r.subject ?? (r.verdict === 'WITHHELD' ? 'SUBJECT WITHHELD' : 'NO SUBJECT RECORDED'),
  },
];

interface OverlayRecord {
  readonly key: string;
  readonly transform: string;
  readonly ew: number;
  readonly eh: number;
  readonly opacity: number;
  readonly lines: readonly { readonly text: string; readonly style: CSSProperties }[];
}

interface Plan {
  readonly cssW: number;
  readonly cssH: number;
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
   canvas: the alpha applies to the encoded values, so the composite happens before `relLum`, not after. */
const overBg = (bg: readonly [number, number, number], a: number): number => relLum(
  bg[0] + a * (255 - bg[0]), bg[1] + a * (255 - bg[1]), bg[2] + a * (255 - bg[2]),
);

export default function VaultReliefGl({ entries, heightPx, onRefused }: VaultReliefGlProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    /* Any earlier overlay is dropped before a new frame exists. A projected label from the previous page of the
       spine sitting over a freshly drawn corridor is a stale picture presented as live data. */
    setPlan(null);

    if (entries.length === 0) { onRefused('NO_OBSERVED_RECORDS'); return; }

    /*
     * §6 RULE 5 BEFORE ANYTHING IS DRAWN. If the palette does not round-trip through this pipeline's tone map
     * there is no point rendering: the frame would be off-brand by an amount too small to see and too large to
     * be exact, and it would be screenshotted into a deck.
     */
    if (assertBrandFidelity().length > 0) { onRefused('BRAND_FIDELITY_FAILED'); return; }

    /*
     * ABSENT TIME REFUSES A POSITION, it does not get hour zero. `buildVaultRecords` excludes and counts; the
     * count is printed under the frame. Depth is the time axis, so hour zero is the "now" wall — the single most
     * misleading place in this frame to put a record whose age nobody knows.
     */
    const built = buildVaultRecords(entries, Date.now());
    if (built.records.length === 0) { onRefused('NO_RECORD_CARRIES_A_USABLE_TIMESTAMP'); return; }
    const cappedFrom = built.records.length > MAX_RECORDS ? built.records.length : null;
    const records = built.records.slice(0, MAX_RECORDS);
    const spanHours = records[records.length - 1]!.hoursAgo;

    /*
     * THE SLAB IS SIZED AGAINST THE LONGEST LINE ACTUALLY PRESENT, not against a guess. `workspace.access_refused`
     * is 24 characters; at 11 px monospace that is 161 px, and in the harness's 118 px box `overflow: hidden`
     * would have served `workspace.access_ref` as though it were the name of a governed action.
     */
    const lineWidthOf = (r: VaultRecord): number => Math.max(
      ...LINE_SPEC.map((ln) => ln.text(r).length * ln.charPx),
    );
    const widest = Math.max(...records.map(lineWidthOf));
    const REC_PX = Math.max(118, Math.min(209, Math.ceil(widest + 12)));
    const REC_W = REC_PX / PX_PER_METRE;
    const TIER_H = REC_H + 0.10;

    /*
     * HOURS PER METRE, FROM THE DATA. Depth stays strictly linear in time — that is the environment's premise —
     * so the only free parameter is the scale, and it is set so the oldest record on the page lands at `DEPTH_M`.
     * A floor of 0.05 h/m keeps a page that spans two minutes from being drawn at a resolution the geometry
     * cannot express; when that floor binds, the corridor is simply short, which is the truth about the page.
     */
    const hoursPerMetre = Math.max(0.05, spanHours / DEPTH_M);
    const zOf = (hoursAgo: number): number => -(hoursAgo / hoursPerMetre) - NOW_OFFSET_M;

    /* DPR CAPPED AT 2. Everything here is fill-bound; a 3× display would triple the cost of a surface whose
       whole justification is that an operator reads it faster. */
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const cssW = Math.max(320, canvas.clientWidth || 640);
    const cssH = heightPx;
    const W = Math.round(cssW * dpr), H = Math.round(cssH * dpr);
    canvas.width = W; canvas.height = H;

    const out = createStage(canvas, { alpha: false });
    if (!isStage(out)) { onRefused(out.code); return; }
    const stage = out;
    const gl = stage.gl;

    const disposers: (() => void)[] = [];
    const refuse = (code: string): void => {
      for (const d of disposers.reverse()) d();
      /* THE STAGE LAST, even on the refusal path: it owns the context, and releasing it first leaves every
         other delete* operating on a dead context — silent, and it leaks on every remount. */
      stage.dispose();
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
    const shadow = createShadowMap(stage, 1024);
    if ('kind' in shadow) { refuse(shadow.code); return; }
    disposers.push(() => shadow.dispose());
    const ao = createAmbientOcclusion(stage, W, H);
    if ('kind' in ao) { refuse(ao.code); return; }
    disposers.push(() => ao.dispose());
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
    const recGeo = box(REC_W, REC_H, REC_T);

    /* UPLOADED ONE AT A TIME, EACH REGISTERED FOR DISPOSAL BEFORE THE NEXT IS ATTEMPTED. Uploading all five and
       then checking them means a failure on the fifth refuses while the first four are still on the GPU with no
       disposer recorded — a leak on exactly the path that is hardest to reach and most likely to repeat, because
       this component remounts every time a reader toggles the view. */
    const uploaded: MeshBuffer[] = [];
    for (const g of [floorGeo, wallGeo, ceilGeo, endGeo, recGeo]) {
      const m = uploadMesh(stage, g);
      if ('kind' in m) { refuse(m.code); return; }
      uploaded.push(m);
      disposers.push(() => m.dispose());
    }
    const [floorMesh, wallMesh, ceilMesh, endMesh, recMesh] = uploaded;

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

    /*
     * RECORDS ARE ANGLED SIGNAGE, NOT WALL PLAQUES. Mounted flat, a record's normal points across the corridor
     * at the centre line — where the reader stands — so it is seen almost along its own plane. Turned toward the
     * axis at 0.42 of a right angle, which is how signage in a real corridor is hung. The facing is AIMED AT THE
     * MEASURED EYE rather than derived from a winding convention: reasoning the sign out got it backwards once
     * and put 19 records face-first into their own walls.
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
      const tier = crowded ? (prev.tier + 1) % MAX_TIERS : 0;
      const wrapped = crowded && prev.tier + 1 >= MAX_TIERS;
      lastOnWall[wall] = { z, tier };
      const y = REC_Y + tier * TIER_H;
      return {
        r, x, y, z, yaw, wrapped,
        distance: Math.hypot(x - eye[0], y - eye[1], z - eye[2]),
      };
    });

    const draws: LitDraw[] = [
      { mesh: floorMesh, model: modelOf(0, -0.06, CORRIDOR_MID), normalMat: N3,
        material: { baseColour: hexToLinear('#080C15'), roughness: 0.84, metalness: 0 } },
      { mesh: wallMesh, model: modelOf(-CORRIDOR_HALF, 1.5, CORRIDOR_MID), normalMat: N3,
        material: { baseColour: hexToLinear('#141F35'), roughness: 0.62, metalness: 0.03 } },
      { mesh: wallMesh, model: modelOf(CORRIDOR_HALF, 1.5, CORRIDOR_MID), normalMat: N3,
        material: { baseColour: hexToLinear('#141F35'), roughness: 0.62, metalness: 0.03 } },
      { mesh: ceilMesh, model: modelOf(0, 2.86, CORRIDOR_MID), normalMat: N3,
        material: { baseColour: hexToLinear('#0A101C'), roughness: 0.80, metalness: 0 } },
      { mesh: endMesh, model: modelOf(0, 1.5, CORRIDOR_MID - CORRIDOR_LEN / 2), normalMat: N3,
        material: { baseColour: hexToLinear('#0B1220'), roughness: 0.86, metalness: 0 } },
      ...placed.map((p): LitDraw => {
        const model = modelOf(p.x, p.y, p.z, p.yaw);
        const mat = VERDICT_MATERIAL[p.r.verdict];
        return {
          mesh: recMesh, model, normalMat: normalOf(model),
          material: { baseColour: hexToLinear(VERDICT_HEX[p.r.verdict]), ...mat },
        };
      }),
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
    lit.shadowPass(lightVP, draws, shadow);
    target.bind();
    const fc = hexToLinear(FOG_HEX);
    gl.clearColor(fc[0], fc[1], fc[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    lit.depthPrepass(vp, draws);
    ao.compute({
      depthTexture: target.depthTexture, near, far, fovDeg: view.fovDeg ?? 33,
      aspect: W / H, radius: 0.42, strength: 1.35,
    });
    target.bind();
    lit.draw({
      viewProj: vp, eye, lightDir, lightColour: [3.0, 2.95, 2.85],
      /* 0.46, not 0.86. At the higher gain the floor and ceiling — whose normals point at the analytic sky's
         bright zenith — became two glowing wedges brighter than the key light. */
      ambientGain: 0.46, lightVP, shadow, shadowStrength: 0.94, draws,
      ao: ao.texture, screenSize: [W, H],
      fog: { density: FOG_DENSITY, height: 6.0, floor: 0, colour: fc },
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.DEPTH_TEST);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    /* `blit` takes a CALLBACK, not a texture: the uniform is set against the program it has just bound. */
    stage.blit(present, (p) => gl.uniform1i(gl.getUniformLocation(p, 'uScene'), 0));

    const err = gl.getError();
    if (err !== 0) { refuse('GL_ERROR_AFTER_DRAW'); return; }

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
      const minRatio = bg && bgLum !== null ? ratioOf(overBg(bg, opacity), bgLum) : null;
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
      return { p, proj, shown, hiddenBecause, ew, eh, opacity, minRatio, tooFar };
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
      const ratio = bg ? ratioOf(overBg(bg, RULER_ALPHA), relLum(bg[0], bg[1], bg[2])) : null;
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
      unplaced: built.unplaced,
      cappedFrom,
      /* THE CHECK ON THE HEADLINE, so the printed claim is falsifiable: the worst measured ratio among the
         records the frame actually shows. Below `AA_RATIO` and the word READABLE is not earned. */
      worstShownRatio: shownRecords.length === 0
        ? null : Number(Math.min(...shownRecords.map((d) => d.minRatio ?? 0)).toFixed(2)),
    });

    /*
     * CONTEXT LOSS RESOLVES TO THE TABLE. Without this the canvas keeps its last frame for ever while the GPU
     * has dropped the context — a stale picture presented as live data, which on an audit log is the worst
     * possible failure. Registered on this canvas rather than the document so it cannot fire for someone else's.
     */
    const onLost = (e: Event): void => { e.preventDefault(); onRefused('CONTEXT_LOST'); };
    canvas.addEventListener('webglcontextlost', onLost);

    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      for (const d of disposers.reverse()) d();
      /* THE STAGE LAST. It owns the context; releasing it before the resources built on it leaves each delete*
         operating on a dead context — silent rather than fatal, and it leaks on every remount. This component
         remounts every time a reader toggles the view. */
      stage.dispose();
    };
  }, [entries, heightPx, onRefused]);

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
                  color: 'rgba(196,212,240,.85)', whiteSpace: 'nowrap',
                }}
              >
                {t.label}
              </div>
            ))}
            {/* THE HORIZON, ON THE FRAME. Not "here are 50 rows" but how far back you can read, how far the
                geometry reaches, and how far you can see a shape at all — three facts, never one. */}
            <div style={{ position: 'absolute', left: 16, top: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ font: '600 11px/1 ui-monospace, monospace', letterSpacing: '.16em', color: '#8FB7FF' }}>
                GOVERNED ACTIONS · DEPTH IS TIME
              </div>
              <div style={label('rgba(196,212,240,.86)')}>
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
                <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'rgba(196,212,240,.85)' }}>
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
        <div style={{ ...label('rgba(196,212,240,.62)'), marginTop: 6, fontSize: 10 }}>
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
