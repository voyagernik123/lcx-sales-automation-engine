/**
 * E2 THE GLOBE, as a product component rather than a harness.
 *
 * `3D_VFX_1000X.md` §2 E2: "Rotating earth, extruded arcs for every partner and listing corridor, city
 * bloom, terminator line, atmospheric scatter at the limb." `docs/3d/e2` proved the environment. This is
 * the part that ships, and it draws the SAME `MapPoint[]` the scatter beside it draws — one universe, two
 * drawings.
 *
 * ══ THE TWO THINGS THAT MAKE THIS THE HARDEST OF THE NINE, AND WHAT WAS DONE ABOUT THEM ══
 *
 * 1 · THE PAGE HAS NO COORDINATES, SO NOTHING IS PLACED AT AN ORGANISATION.
 *
 *     `MapPoint` carries a coarse `region` string. It does not carry latitude, longitude, an address, or
 *     anything else that would let a marker mean "this project is here". So no project is placed. What is
 *     placed is a REGION, at a published geographic centre for that region, and the frame says that in
 *     those words above the globe and again in every label's own provenance line. `globeSites.ts` owns the
 *     table and the reasoning; the short version is that a globe which LOOKS like it knows where an
 *     organisation is, and does not, is the worst thing this programme could ship, so the only positions
 *     on this frame are two published reference points and one registered address.
 *
 *     Everything the table cannot place — `other`, an unrecognised value, a null column — is COUNTED and
 *     NAMED under the frame. It is never nudged onto a nearby continent and never dropped.
 *
 * 2 · THE HARNESS RENDERS NO DOM TEXT AT ALL, WHICH IS A §6 RULE 4 VIOLATION ON RECORD.
 *
 *     `docs/3d/e2/README.md` records it as outstanding: twelve sited cities and seven corridors reaching
 *     neither the accessibility tree nor the print path, which is why E1's derived panel set skips E2. That
 *     is NOT carried forward. Every region name, every count, the hub, the sub-solar reading and every
 *     absence on this frame is real DOM text, projected through the same view-projection matrix the
 *     renderer used, via `projectScreen` — the annotation path, because these labels float BESIDE the
 *     geometry rather than lying on a surface. `projectQuad` is the tool for the second case and there is
 *     no second case here; using it for a floating annotation would lay a homography on a rectangle that
 *     is not on any plane.
 *
 *     CSS has no depth buffer, so a label cannot be occluded by the sphere. A site behind the limb is
 *     therefore NOT LABELLED ON THE FRAME — it is listed in words underneath it, with its numbers, so the
 *     reading survives without a label floating over the wrong hemisphere.
 *
 * ══ ONE FRAME, THEN NOTHING ══════════════════════════════════════════════════════════════
 * §6 rule 2. No `requestAnimationFrame`, no `setInterval`, no `setTimeout`. The camera is AIMED BY THE
 * DATA — its central meridian is the circular mean of the longitudes that carry a book — so every placed
 * site is on the visible face in the single frame this draws, and the globe does not need to turn for the
 * reading to be complete. §2's word "rotating" is the one part of the brief deliberately not built: a
 * planet that turns on its own is an idle animation with a budget.
 *
 * ══ WHAT IS DELIBERATELY NOT PROMOTED FROM THE HARNESS ═══════════════════════════════════
 *   · THE ORBITAL RING. It is polished metal and it encodes nothing. In a harness it justified the shadow
 *     map; in a product figure it is decoration, and §7(b) is the clause that stops decoration.
 *   · DEPTH OF FIELD. It blurs the near cap of the subject to buy an impression. An operator reading a
 *     count off a pin wants the pin sharp.
 *   · THE TWELVE PLACEHOLDER CITIES. They were a siting mechanism proven on real city coordinates that
 *     were never a claim about LCX's corridor. This file has a real book and no cities.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  createStage, isStage, sphere, cylinder, arcTube, uploadMesh, createLitRenderer, createTarget3D,
  createShadowMap, createSkyBackdrop, createAmbientOcclusion, viewProjection, eyeOf, nearFarOf,
  lightViewProjection, boundsCentre, boundsRadius, projectScreen, triangleCount,
  hexToLinear, assertBrandFidelity, IDENTITY,
  TONE_MAP_GLSL, SRGB_ENCODE_GLSL,
  qualitySettings, shadowMapSizeFor,
  type LitDraw, type Viewpoint, type MeshBuffer,
} from '@lcx/gl';
import { useResolvedQualityTier } from '../shared/useQualityTier';
import type { MapPoint } from '@/lib/api/bd';
import { formatMoney } from '@/lib/format';
import {
  buildGlobeBook, centralMeridian, formatSolarHour, geoUnit, pinHeight, separationDeg, solarHourAt,
  standOnNormal, subSolarPoint,
  EARTH_R, HUB, LABEL_BG, LABEL_DIM_FG, LABEL_FG, PIN_MAX,
  type GlobeBook, type RegionBook,
} from '@/components/market/globeSites';

export interface GlobeReliefGlProps {
  /** The same visible universe the scatter is drawing. */
  readonly points: readonly MapPoint[];
  readonly heightPx: number;
  /** Called with a stable code when the renderer cannot draw. The parent then shows the scatter. */
  readonly onRefused: (code: string) => void;
}

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

/* `EARTH_R` and `PIN_MAX` come from `globeSites` so the pin arithmetic that is unit-tested there and the
   geometry drawn here cannot disagree about the surface a pin stands on. */
const ATMOS_R = 1.06;
const PIN_RADIUS = 0.021;
const HUB_RADIUS = 0.028;
const CORRIDOR_TUBE = 0.011;
const CAMERA_DISTANCE = 4.9;
const FOV_DEG = 30;

/** Widest a label box is allowed to get, and the number the edge-flip below is measured against. */
const LABEL_MAX_PX = 260;

interface ScreenLabel {
  readonly key: string;
  readonly sx: number;
  readonly sy: number;
  readonly title: string;
  readonly lines: readonly string[];
  readonly sunlit: boolean | null;
  /**
   * Whether the box hangs to the LEFT of its anchor. A site near the right edge of the pane would otherwise
   * push its label into `overflow: hidden` and lose the end of every line — which on this figure means losing
   * the provenance sentence, i.e. exactly the words that stop a position being read as an address.
   */
  readonly flip: boolean;
}

interface OffFace {
  readonly key: string;
  readonly text: string;
}

interface Plan {
  readonly cssW: number;
  readonly cssH: number;
  readonly labels: readonly ScreenLabel[];
  readonly offFace: readonly OffFace[];
  readonly subSolar: string;
  readonly clockLine: string;
  readonly corridors: readonly string[];
  readonly noCorridor: readonly string[];
  readonly book: GlobeBook;
  readonly triangles: number;
  readonly msFrame: number;
  readonly shortestPinPx: number;
  readonly aoRefusal: string | null;
  readonly meridianRefused: boolean;
  /*
   * THE PROSE IS COMPOSED HERE, NOT IN THE JSX, and that is not a style preference. A nested template
   * literal has been the most repeated defect in this programme — twelve times — and the way it gets
   * written is exactly this: a sentence in JSX whose middle clause depends on a value, so a second pair of
   * backticks goes inside the first. Every line below is assembled once, at the point where the numbers
   * exist, so the render has nothing to interpolate.
   */
  readonly headerNote: string;
  readonly pinNote: string;
  readonly unplacedNotes: readonly string[];
  readonly costNote: string;
  readonly aoNote: string | null;
  readonly placedNote: string;
}

/**
 * THIS SCENE'S OWN SHADOW BASELINE, which the tier SCALES rather than replaces.
 *
 * `env/quality.ts:91` records why: wiring the ladder in with the tier's ABSOLUTE `shadowMapSize` silently
 * enlarged three environments — E0, E2 and E8 had each chosen 1024 and were handed 1536 at the default tier, a
 * 2.25x bigger map and three captures that changed without anyone saying so. E2 was one of the three.
 */
const SHADOW_BASELINE = 1024;

export default function GlobeReliefGl({ points, heightPx, onRefused }: GlobeReliefGlProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  /*
   * THE TIER IS CONSUMED HERE, NOT MEASURED HERE — and this is the one relief that deliberately takes no
   * probe.
   *
   * Its own `msFrame` is a documented COLD single sample: the clock spans the shadow pass, AO, the lit passes
   * and the present of the FIRST frame, and it is printed under the figure as "one sample". A ladder probe
   * needs the opposite — a discarded warm-up frame, because the first frame pays shader upload and charging
   * that to the GPU downgrades every machine. Inserting warm-up frames here would silently change what the
   * number under the figure means, from "what this frame cost" to "what a warm frame costs". So the five other
   * reliefs probe and this one reads the answer.
   */
  const tier = useResolvedQualityTier();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    /* Any earlier overlay is dropped before a new frame exists. A projected label from the previous filter
       sitting over a freshly drawn globe is a stale picture presented as live data. */
    setPlan(null);

    if (points.length === 0) { onRefused('NO_MAP_POINTS'); return; }

    /*
     * THE BOOK BEFORE THE CONTEXT. Constructing a GL context and then discovering there is nothing to put
     * on the sphere costs the reader a context and gains nothing, and it is the cheaper of the two checks.
     */
    const book = buildGlobeBook(points);
    if (book.sites.length === 0) { onRefused('NO_PLACEABLE_REGION'); return; }

    /*
     * §6 RULE 5 BEFORE ANYTHING IS DRAWN. If the palette does not round-trip through this pipeline's tone
     * map there is no point rendering: the frame would be off-brand by an amount too small to see and too
     * large to be exact, and it would be screenshotted into a deck.
     */
    if (assertBrandFidelity().length > 0) { onRefused('BRAND_FIDELITY_FAILED'); return; }

    /* DPR CAPPED BY THE TIER. This frame is fill-bound — a sky, an atmosphere annulus, AO and a lit pass — so
       a 3× display would triple the cost of a figure whose whole justification is a faster answer. The cap WAS
       a literal 2; `Q.dprScale` is 2 at `full` and `reduced` and 1 at `minimum`. */
    const Q = qualitySettings(tier);
    const dpr = Math.min(Q.dprScale, Math.max(1, window.devicePixelRatio || 1));
    const cssW = canvas.clientWidth || 640;
    const cssH = heightPx;
    const W = Math.max(1, Math.round(cssW * dpr)), H = Math.max(1, Math.round(cssH * dpr));
    canvas.width = W; canvas.height = H;

    const out = createStage(canvas, { alpha: false });
    if (!isStage(out)) { onRefused(out.code); return; }
    const stage = out;
    const gl = stage.gl;

    const disposers: (() => void)[] = [];
    const refuse = (code: string): void => {
      for (const d of disposers.reverse()) d();
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
    const shadow = createShadowMap(stage, shadowMapSizeFor(tier, SHADOW_BASELINE));
    if ('kind' in shadow) { refuse(shadow.code); return; }
    disposers.push(() => shadow.dispose());
    const skyBox = createSkyBackdrop(stage);
    if ('kind' in skyBox) { refuse(skyBox.code); return; }
    disposers.push(() => skyBox.dispose());

    /*
     * AMBIENT OCCLUSION IS THE ONE RESOURCE WHOSE REFUSAL DOES NOT COST THE FIGURE, and the distinction is
     * worth being exact about because everything else here refuses hard.
     *
     * §6 rule 1 is about INFORMATION: a fallback must not be a downgrade in what the reader can learn. The
     * scene target, the shadow map and the shaders all carry information — without them there is no frame,
     * or no contact between a pin and the planet. AO carries none: it darkens the crevice where a pin meets
     * the sphere. A driver that will not allocate a half-res buffer gets the globe without that darkening
     * and is TOLD so under the frame, which is a better answer than sending a reader back to the scatter
     * over a look pass.
     */
    /*
     * AND THE QUALITY LADDER CAN DECLINE IT TOO, which is a different thing from a driver declining it — so
     * the reason the reader is given says which. `aoNote` below prints the code, and printing a driver
     * refusal for a tier decision would blame the machine for something the ladder chose.
     */
    const aoOut = Q.ao ? createAmbientOcclusion(stage, W, H) : null;
    const ao = aoOut === null || 'kind' in aoOut ? null : aoOut;
    const aoRefusal = aoOut === null
      ? `QUALITY_TIER_${tier.toUpperCase()}`
      : 'kind' in aoOut ? aoOut.code : null;
    if (ao) disposers.push(() => ao.dispose());

    /* ── THE SUN, FROM THE READER'S CLOCK ── */
    const now = Date.now();
    const sub = subSolarPoint(now);
    const sunUnit = geoUnit(sub.lat, sub.lon);
    /* `lightDir` is the direction light TRAVELS, so it is the sub-solar direction negated. */
    const lightDir: [number, number, number] = [-sunUnit[0], -sunUnit[1], -sunUnit[2]];

    /* ── THE CAMERA, AIMED BY THE DATA ── */
    const meridian = centralMeridian([HUB.lon, ...book.sites.map((s) => s.lon)]);
    const meridianRefused = meridian === null;
    /*
     * A refusal here is antipodal sites, where no single face shows both and any choice is arbitrary. The
     * hub's own meridian is then the honest default — it is the one position that is an address — and every
     * site that falls behind the limb is named in words under the frame instead of being labelled over the
     * wrong hemisphere.
     */
    const centre = meridian ?? HUB.lon;
    /* ELEVATION FOLLOWS THE LATITUDES THAT CARRY A BOOK, damped, rather than sitting on the equator: a
       camera level with the equator looks at 40 N obliquely and foreshortens exactly the pins being read. */
    const meanLat = [HUB.lat, ...book.sites.map((s) => s.lat)].reduce((a, b) => a + b, 0) / (book.sites.length + 1);
    const view: Viewpoint = {
      target: [0, 0, 0],
      distance: CAMERA_DISTANCE,
      azimuthDeg: 90 - centre,
      elevationDeg: Math.max(-45, Math.min(45, meanLat)) * 0.55,
      fovDeg: FOV_DEG,
    };
    const eye = eyeOf(view);
    const eyeLen = Math.hypot(eye[0], eye[1], eye[2]) || 1;
    const eyeUnit: [number, number, number] = [eye[0] / eyeLen, eye[1] / eyeLen, eye[2] / eyeLen];
    /*
     * THE LIMB, EXACTLY. For a unit sphere seen from distance d the horizon is the circle where
     * n · eyeUnit = 1/d. A site at or beyond it is on the far side, and a DOM label there would float over
     * the near hemisphere pointing at nothing. The margin keeps a site that is technically a degree inside
     * the limb — where the surface is edge-on and a pin is a single leaning pixel — out of the labelled set
     * and into the words underneath.
     */
    const LIMB_DOT = 1 / CAMERA_DISTANCE + 0.05;

    /* ── GEOMETRY ── */
    const earthGeo = sphere(EARTH_R, 56, 84);
    /* Built AT 1.06 rather than scaled from the earth: a scale in the model matrix would also scale the
       tangents the anisotropic terms read, for no saving. */
    const atmosGeo = sphere(ATMOS_R, 48, 72);
    const hubGeo = sphere(HUB_RADIUS, 14, 20);

    const maxProjects = Math.max(...book.sites.map((s) => s.projects));
    const pinGeos = book.sites.map((s) => cylinder(PIN_RADIUS, Math.max(1e-4, pinHeight(s.projects, maxProjects)), 20));

    /*
     * ONE ARC PER REGION THAT LCX ACTUALLY LISTS FROM. A region with zero listings gets NO corridor and the
     * absence is stated in words under the frame — an OBSERVED zero, which is a different statement from an
     * absence and is never drawn as a hairline.
     *
     * The tube radius is FIXED and does not encode the listing count. A tube's apparent thickness on screen
     * varies with its lift and its distance from the camera, so two corridors of different radius cannot be
     * compared by eye on a sphere; encoding a number in it would be a quantity nobody can read back. The
     * count is in the label instead.
     */
    const corridorSites = book.sites.filter((s) => s.listed > 0);
    const corridorGeos = corridorSites.map((s) => arcTube(HUB.lat, HUB.lon, s.lat, s.lon, EARTH_R, CORRIDOR_TUBE, 0.20, 128, 10));

    const meshes: (MeshBuffer | { kind: 'refused'; code: string })[] = [
      uploadMesh(stage, earthGeo), uploadMesh(stage, atmosGeo), uploadMesh(stage, hubGeo),
      ...pinGeos.map((g) => uploadMesh(stage, g)),
      ...corridorGeos.map((g) => uploadMesh(stage, g)),
    ];
    for (const m of meshes) if ('kind' in m) { refuse(m.code); return; }
    const ok = meshes as MeshBuffer[];
    for (const m of ok) disposers.push(() => m.dispose());
    const earthMesh = ok[0]!, atmosMesh = ok[1]!, hubMesh = ok[2]!;
    const pinMeshes = ok.slice(3, 3 + pinGeos.length);
    const corridorMeshes = ok.slice(3 + pinGeos.length);

    const NM = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const at = (x: number, y: number, z: number): Float32Array => {
      /* `IDENTITY` is a FACTORY: `new Float32Array(IDENTITY)` is length 0, every vertex collapses to the
         origin, and the frame is a clear colour with no GL error. It cost E0 a day. */
      const m = IDENTITY();
      m[12] = x; m[13] = y; m[14] = z;
      return m;
    };

    /*
     * THE ATMOSPHERE SHELL IS DRAWN INSIDE-OUT, AND THAT IS THE WHOLE TRICK.
     *
     * `lit.ts` disables blending — every surface is opaque. An opaque sphere at 1.06 drawn the normal way
     * would hide the earth completely, so the shell gets a model matrix with a NEGATIVE determinant (mirror
     * in x). The mirror maps the sphere onto itself but flips triangle winding, so the fixed back-face
     * culling keeps the FAR hemisphere and discards the near one; the far hemisphere loses the depth test
     * everywhere the earth covers it, leaving an annulus at the limb. Grazing-angle Fresnel lights it.
     *
     * IT IS A STAND-IN, NOT SCATTERING, and it carries no data. Real scattering is a volumetric integral
     * along the view ray; `3D_VFX_1000X.md` §4 lists it as L2.9 and §10.2 records it as only partly built.
     * The shell has the right silhouette and roughly the right gradient and gets both from a surface
     * reflection. It is on this frame because a globe without a limb reads as a billiard ball, not because
     * it encodes anything.
     *
     * The inverse-transpose of a mirror is the mirror, so the normal matrix flips with it.
     */
    const ATMOS_MODEL = (() => { const m = IDENTITY(); m[0] = -1; return m; })();
    const ATMOS_NM = new Float32Array([-1, 0, 0, 0, 1, 0, 0, 0, 1]);

    /*
     * THE SKY IS SCALED FROM THE PLATFORM'S OWN PLATE COLOUR, #0E1628, so a globe dropped into a dark page
     * has no bright seam behind it. `DEFAULT_SKY` is a dark instrument interior and it is right where a
     * floor plate fills the frame; here the backdrop IS the frame. Not FLAT, though: `sky.ts` is the same
     * function for the backdrop AND for every reflection, and a constant environment gives a dielectric
     * nothing to catch — which is the defect E0 found when its metal came out black.
     *
     * ONE OBJECT, PASSED TO BOTH the backdrop and the lit pass. Handing a custom sky to one and the default
     * to the other is how a reflection ends up disagreeing with the sky it is reflecting.
     */
    const PLATE = hexToLinear('#0E1628');
    const fromPlate = (k: number): [number, number, number] => [PLATE[0] * k, PLATE[1] * k, PLATE[2] * k];
    const SKY = { zenith: fromPlate(0.55), horizon: fromPlate(1.6), ground: fromPlate(0.35) };

    /* Roughness 0.58 rather than 0.42: at 0.42 the key leaves a broad bright blob on the daylit hemisphere
       and the earth reads as a shiny plastic ball. An ocean does glint, but a planet-wide glint is wide and
       weak. Dielectric, so §6 rule 5's hexes survive — a metal has no diffuse lobe. */
    const EARTH_MAT = { baseColour: hexToLinear('#0B2B5C'), roughness: 0.58, metalness: 0.06 };
    const ATMOS_MAT = { baseColour: hexToLinear('#7FB2FF'), roughness: 0.86, metalness: 0.0 };
    const PIN_MAT = { baseColour: hexToLinear('#2C6BFF'), roughness: 0.42, metalness: 0.05 };
    /*
     * ── WHY THE ANISOTROPIC ROUGHNESS VALUES LOOK ODD: THEY ARE sqrt() OF WHAT THEY WERE ────────────────
     * Re-authored 2026-08-13. The RENDERED RESULT IS INTENDED TO BE UNCHANGED; only the units moved.
     *
     * `distributionGGXAniso` used to receive at/ab derived from PERCEPTUAL roughness, so its effective alpha
     * was ~rough, while the isotropic branch has always used alpha = rough^2. Commit 38c01b1 made the two
     * branches agree — correct, and verified symbolically. But every anisotropic material in this repo had been
     * AUTHORED against the old convention, so correcting it made all eleven of them sharper: the E8 disc's lobe
     * half-width by 3.33x, the ring's by 7.9x along the highlight and 7.7x across.
     *
     * That is a redesign, not a fix. `docs/3d/e8/README.md` states the intent in as many words — the highlight
     * "has to TRAVEL", the disc is "brushed, not mirror — a broad travelling highlight instead of a hotspot",
     * and it "shows a BAR of light rather than a dot". A lobe 3.3x narrower works against that.
     *
     * So each value is now sqrt() of the authored one, which restores the effective alpha exactly
     * (sqrt(r)^2 == r) while the number finally means what the type says it means. Isotropic materials are
     * untouched: they always used rough^2, so they were never affected.
     * Pinned by `packages/gl/src/env/anisoPreserved.test.ts`.
     */
    const HUB_MAT = { baseColour: hexToLinear('#8FA3C4'), roughness: 0.4243, metalness: 0.9, anisotropy: 0.4 };
    /* Anisotropy 0.85 with `arcTube`'s along-the-path tangent, so the highlight runs DOWN the corridor. An
       isotropic tube bands into rings and reads as a ribbed hose rather than a lit route. */
    const CORRIDOR_MAT = { baseColour: hexToLinear('#4C86FF'), roughness: 0.469, metalness: 0.85, anisotropy: 0.85 };

    const earthDraw: LitDraw = { mesh: earthMesh, model: at(0, 0, 0), normalMat: NM, material: EARTH_MAT };
    const atmosDraw: LitDraw = { mesh: atmosMesh, model: ATMOS_MODEL, normalMat: ATMOS_NM, material: ATMOS_MAT };

    const hubUnit = geoUnit(HUB.lat, HUB.lon);
    /* Half-buried, deliberately. A marker floated clear of the surface reads as a pin hovering over the
       planet and casts a detached shadow; centred ON the surface it reads as a light at that place. */
    const hubDraw: LitDraw = {
      mesh: hubMesh,
      model: at(hubUnit[0] * EARTH_R, hubUnit[1] * EARTH_R, hubUnit[2] * EARTH_R),
      normalMat: NM, material: HUB_MAT,
    };

    const pinDraws: LitDraw[] = book.sites.map((s, i) => {
      const n = geoUnit(s.lat, s.lon);
      const h = Math.max(1e-4, pinHeight(s.projects, maxProjects));
      const { model, normalMat } = standOnNormal(n, EARTH_R + h / 2);
      return { mesh: pinMeshes[i]!, model, normalMat, material: PIN_MAT };
    });

    const corridorDraws: LitDraw[] = corridorMeshes.map((m) => ({
      mesh: m, model: at(0, 0, 0), normalMat: NM, material: CORRIDOR_MAT,
    }));

    const bodyDraws: LitDraw[] = [earthDraw, atmosDraw];
    /*
     * THE SHELL IS NOT A SHADOW CASTER, and that is a correctness fix rather than a saving. `shadowPass`
     * culls FRONT faces to push depth to the far side of each object; applied to the mirrored shell that
     * inverts back to the hemisphere FACING the light, so it would write a full disc of depth in front of
     * the earth and shadow the entire daylit face. An atmosphere does not cast a hard shadow on its planet
     * either way.
     */
    const shadowCasters: LitDraw[] = [earthDraw, hubDraw, ...pinDraws, ...corridorDraws];
    /* Everything that will be shaded must be in the prepass or LEQUAL rejects it. */
    const depthDraws: LitDraw[] = [...bodyDraws, hubDraw, ...pinDraws, ...corridorDraws];

    const SCENE_EXTENT = ATMOS_R + PIN_MAX;
    const sceneMin: [number, number, number] = [-SCENE_EXTENT, -SCENE_EXTENT, -SCENE_EXTENT];
    const sceneMax: [number, number, number] = [SCENE_EXTENT, SCENE_EXTENT, SCENE_EXTENT];
    const sceneCentre = boundsCentre(sceneMin, sceneMax);
    /* `boundsRadius` measures the AABB diagonal, which overstates a sphere scene by ~73% — right for the
       light's stand-off distance and wrong for the shadow frustum, where wasted extent is wasted texels. */
    const standOff = boundsRadius(sceneMin, sceneMax);
    const SHADOW_EXTENT = SCENE_EXTENT * 1.05;

    const vp = viewProjection(view, W / H);
    const { near, far } = nearFarOf(view);

    /*
     * AMBIENT IS A PER-PASS UNIFORM, WHICH IS WHY THE PINS AND CORRIDORS ARE SEPARATE DRAW CALLS.
     *
     * `Material` has no emission channel and `uAmbientGain` is set once per `lit.draw`. So the only way to
     * make a marker read where it crosses the night side is to draw it in its own pass at a higher gain.
     * Depth is already resolved by the prepass, so the extra passes cost a handful of small primitives of
     * fill and nothing else. The SIZE of these numbers is the missing emission channel, not a tuning
     * choice — brand blue against a plate-level sky returns about 0.02 of linear radiance, so reaching the
     * top of the blue channel costs roughly two orders of magnitude.
     *
     * The corridors sit BETWEEN the body and the pins: they must stay legible across the night side, but a
     * route louder than its endpoints inverts the reading.
     */
    const BODY_AMBIENT = 1.6;
    const MARKER_AMBIENT = 120;
    const CORRIDOR_AMBIENT = (BODY_AMBIENT + MARKER_AMBIENT) / 2;

    /*
     * ONE FRAME, MEASURED. `docs/3d/e2/README.md` records that no real-hardware frame time for E2 exists —
     * its harness has only ever run headless under SwiftShader, where `headroom` correctly refuses. This
     * runs on an operator's actual GPU, so the number below is the first real-hardware E2 figure that will
     * ever exist, and it is measured rather than asserted: the clock spans the shadow pass, AO, the lit
     * passes and the present, and a single-pixel `readPixels` forces the driver to FINISH before the clock
     * is read. Without that read the driver has merely QUEUED the work and the figure is submission cost —
     * the mistake that made the harness report 191.7 ms for one thing and microseconds for another.
     *
     * ONE SAMPLE. It is labelled as one sample on the frame; a sweep would be a loop, and §6 rule 2 does
     * not have an exception for measurement.
     */
    const t0 = performance.now();

    const lightVP = lightViewProjection(
      { direction: lightDir, colour: [1, 1, 1], extent: SHADOW_EXTENT }, sceneCentre, standOff,
    );
    lit.shadowPass(lightVP, shadowCasters, shadow);

    target.bind();
    gl.clear(gl.DEPTH_BUFFER_BIT);
    skyBox.draw({ eye, target: view.target, fovDeg: FOV_DEG, aspect: W / H, sky: SKY });
    lit.depthPrepass(vp, depthDraws);
    if (ao) {
      ao.compute({
        depthTexture: target.depthTexture, near, far, fovDeg: FOV_DEG, aspect: W / H,
        radius: 0.3, strength: 1.0,
      });
      /* AO binds its OWN half-res framebuffer, so the scene target must be rebound INSIDE the gate.
         Leaving this outside and skipping the compute would render the rest of the frame at half res. */
      target.bind();
    }

    const common = {
      viewProj: vp, eye, lightDir,
      /* Warm sun against the cool sky. The colour separation is doing real work: it is what distinguishes
         the daylit hemisphere from the ambient-lit one, and a neutral key against a blue ambient reads as
         an exposure difference rather than as sunlight. */
      lightColour: [6.6, 6.2, 5.5] as [number, number, number],
      sky: SKY,
      lightVP, shadow, shadowStrength: 0.92, shadowTaps: Q.shadowTaps, shadowBaseline: SHADOW_BASELINE,
      ao: ao ? ao.texture : null,
      screenSize: [W, H] as [number, number],
    };
    lit.draw({ ...common, ambientGain: BODY_AMBIENT, draws: bodyDraws });
    if (corridorDraws.length > 0) lit.draw({ ...common, ambientGain: CORRIDOR_AMBIENT, draws: corridorDraws });
    lit.draw({ ...common, ambientGain: MARKER_AMBIENT, draws: [hubDraw, ...pinDraws] });

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.DEPTH_TEST);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    stage.blit(present, (p) => gl.uniform1i(gl.getUniformLocation(p, 'uScene'), 0));

    const flush = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, flush);
    const msFrame = performance.now() - t0;

    /*
     * READ ONCE, because `getError` CLEARS the flag — a second read anywhere returns 0 and would make this
     * check a lie about a state it had itself consumed. GL does not throw: an invalid call is dropped, the
     * draw silently does less than it was asked to, and the frame still completes. E0 lost a day to exactly
     * that, with a complete framebuffer and no refusal anywhere.
     */
    const err = gl.getError();
    if (err !== 0) { refuse('GL_ERROR_AFTER_DRAW'); return; }

    /* ── THE DOM LAYER: §6 RULE 4, AND E2's OUTSTANDING VIOLATION ── */
    const worldPerPixel = (2 * Math.tan((FOV_DEG * Math.PI) / 360) * CAMERA_DISTANCE) / Math.max(1, cssH);
    const labels: ScreenLabel[] = [];
    const offFace: OffFace[] = [];

    /** dot(a, b) for two unit vectors. Written out because a `reduce` over a tuple hides the sign error. */
    const dot3 = (a: readonly [number, number, number], b: readonly [number, number, number]): number =>
      a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

    /*
     * THE FOUR LINES EVERY REGION GETS, and the second one is the one with a scar in it.
     *
     * "No readable market cap" is NOT "$0". A region whose every member carried a broken figure has an
     * unknown total, and printing zero would be a measurement nobody took — the same defect E3 fixed on
     * `BdLead`. The unreadable count rides along so the reader can see the difference between a thin region
     * and a broken column.
     *
     * The last line is the provenance of the POSITION, on every label, because the position is the one thing
     * on this figure a reader could otherwise mistake for an address.
     */
    const describe = (s: RegionBook): string[] => {
      const hour = solarHourAt(s.lon, now);
      const sunlit = dot3(geoUnit(s.lat, s.lon), sunUnit) > 0;
      const projectWord = s.projects === 1 ? 'project' : 'projects';
      const unreadableSuffix = s.mcapUnreadable > 0 ? ` · ${s.mcapUnreadable} unreadable` : '';
      const mcapLine = s.mcapUsd === null
        ? `No readable market cap in this region${unreadableSuffix}`
        : `${formatMoney(s.mcapUsd)} market cap${unreadableSuffix}`;
      return [
        `${s.projects} ${projectWord} · ${s.listed} on LCX`,
        mcapLine,
        `${formatSolarHour(hour)} solar · ${sunlit ? 'daylight' : 'night'}`,
        s.provenance,
      ];
    };

    const hubDot = dot3(hubUnit, eyeUnit);
    if (hubDot > LIMB_DOT) {
      const p = projectScreen(vp, [hubUnit[0] * (EARTH_R + HUB_RADIUS), hubUnit[1] * (EARTH_R + HUB_RADIUS), hubUnit[2] * (EARTH_R + HUB_RADIUS)], cssW, cssH);
      if (!p.behind) {
        labels.push({
          key: 'hub', sx: p.sx, sy: p.sy, title: `${HUB.label} · hub`,
          lines: [HUB.provenance], sunlit: null,
          flip: p.sx > cssW - LABEL_MAX_PX,
        });
      }
    } else {
      offFace.push({ key: 'hub', text: `${HUB.label} (the hub) is on the far side of this face.` });
    }

    for (const s of book.sites) {
      const n = geoUnit(s.lat, s.lon);
      const dotEye = dot3(n, eyeUnit);
      const lines = describe(s);
      if (dotEye <= LIMB_DOT) {
        /* NOT LABELLED, BUT NOT LOST. CSS has no depth buffer, so a label here would float over the near
           hemisphere pointing at a pin nobody can see. The numbers move into the words under the frame. */
        offFace.push({ key: s.key, text: `${s.label} is behind the limb on this face — ${lines[0]!}, ${lines[1]!}, ${lines[2]!}.` });
        continue;
      }
      const h = pinHeight(s.projects, maxProjects);
      const topR = EARTH_R + h;
      const p = projectScreen(vp, [n[0] * topR, n[1] * topR, n[2] * topR], cssW, cssH);
      if (p.behind) {
        offFace.push({ key: s.key, text: `${s.label} projected behind the camera and is not labelled — ${lines[0]!}, ${lines[1]!}.` });
        continue;
      }
      const sunlit = dot3(n, sunUnit) > 0;
      labels.push({
        key: s.key, sx: p.sx, sy: p.sy, title: s.label, lines, sunlit,
        flip: p.sx > cssW - LABEL_MAX_PX,
      });
    }

    const shortestPinPx = book.sites.length === 0 ? 0
      : Math.min(...book.sites.map((s) => pinHeight(s.projects, maxProjects))) / worldPerPixel;

    const triangles = triangleCount(earthGeo) + triangleCount(atmosGeo) + triangleCount(hubGeo)
      + pinGeos.reduce((n, g) => n + triangleCount(g), 0)
      + corridorGeos.reduce((n, g) => n + triangleCount(g), 0);

    const latText = sub.lat >= 0 ? `${sub.lat.toFixed(1)} N` : `${(-sub.lat).toFixed(1)} S`;
    const lonText = sub.lon >= 0 ? `${sub.lon.toFixed(1)} E` : `${(-sub.lon).toFixed(1)} W`;
    const subSolar = `${latText} ${lonText}`;
    const clockLine = `${new Date(now).toISOString().replace('T', ' ').slice(0, 16)} UTC`;
    const pinPx = Number(shortestPinPx.toFixed(1));
    const shortestLine = pinPx < 2
      ? `Shortest pin is ${pinPx} px at this camera — read it from its label, not its height.`
      : `Shortest pin is ${pinPx} px at this camera.`;
    const regionWord = book.sites.length === 1 ? 'region' : 'regions';

    setPlan({
      cssW, cssH, labels, offFace,
      subSolar,
      clockLine,
      corridors: corridorSites.map((s) => `${HUB.label} → ${s.label}: ${s.listed} listed, ${separationDeg(HUB.lat, HUB.lon, s.lat, s.lon).toFixed(1)}° away`),
      noCorridor: book.sites.filter((s) => s.listed === 0).map((s) => `${s.label}: 0 of ${s.projects} on LCX, so no corridor is drawn`),
      book,
      triangles,
      msFrame: Number(msFrame.toFixed(2)),
      shortestPinPx: pinPx,
      aoRefusal,
      meridianRefused,
      headerNote: 'Every marker is a published reference point for a REGION. This dataset carries no per-project\n'
        + `coordinates, so no project is placed anywhere. Sunlit hemisphere from your clock at ${clockLine};\n`
        + `sub-solar point ${subSolar}, accurate to about 4° of longitude (no equation of time).`,
      pinNote: 'Pin height ∝ projects in that region, proportional with no floor.\n'
        + `${shortestLine}\n`
        + 'Arc lift rises with distance from the hub — that is geometry, not data.',
      unplacedNotes: book.unplaced.map((u) => {
        const n = u.projects;
        const word = n === 1 ? 'project' : 'projects';
        if (u.reason === 'NO_REGION_RECORDED') return `${n} ${word} with no region recorded at all — not placed.`;
        if (u.reason === 'NOT_A_PLACE') return `${n} ${word} in region "${u.region}", which is a category rather than a place — not placed.`;
        return `${n} ${word} in region "${u.region}", which has no published reference point in this figure's table — not placed.`;
      }),
      costNote: `${triangles.toLocaleString()} triangles · ${msFrame.toFixed(2)} ms for this frame, one sample, GPU flushed before the clock was read.`,
      aoNote: aoRefusal === null ? null
        : Q.ao
          ? `Ambient occlusion unavailable on this driver (${aoRefusal}) — the contact shading is missing and every number above is unaffected.`
          /* NOT "unavailable on this driver". The ladder dropped it on a measured frame time, and telling a
             reader their driver refused something the software chose to skip is a false statement about their
             machine. */
          : `Ambient occlusion off at the ${tier} quality tier, chosen from a measured frame time on this machine — the contact shading is missing and every number above is unaffected.`,
      placedNote: `${book.placedProjects} of ${book.considered} visible projects sit in a region this figure can place, across ${book.sites.length} ${regionWord}.`,
    });

    /*
     * CONTEXT LOSS RESOLVES TO THE SCATTER. Without this the canvas keeps its last frame for ever while the
     * GPU has dropped the context — a stale picture presented as live data, and on a figure whose whole
     * point is "which desks are awake right now" a frozen terminator is a wrong answer rather than a stale
     * one. Registered on this canvas rather than the document so it cannot fire for someone else's.
     */
    const onLost = (e: Event): void => { e.preventDefault(); onRefused('CONTEXT_LOST'); };
    canvas.addEventListener('webglcontextlost', onLost);

    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      for (const d of disposers.reverse()) d();
      /* THE STAGE LAST. It owns the context; releasing it before the resources built on it leaves every
         `delete*` operating on a dead context — silent rather than fatal, and it leaks on every remount.
         This component remounts whenever a reader toggles the view or changes a filter. */
      stage.dispose();
    };
    /* `tier` IS A DEPENDENCY: a tier resolved by another surface rebuilds this one at it. */
  }, [points, heightPx, onRefused, tier]);

  const mono = (colour: string, size = 10.5): CSSProperties => ({
    font: `400 ${size}px/1.45 ui-monospace, monospace`, color: colour, whiteSpace: 'pre-wrap',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* `flexShrink: 0` so the frame keeps the height it was measured at and the NOTES take the remainder. The
          other way round, a long unplaced list would squeeze the canvas away from the drawing buffer it was
          sized for and the globe would arrive stretched. */}
      <div style={{ position: 'relative', overflow: 'hidden', width: '100%', height: heightPx, flexShrink: 0 }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: `${heightPx}px`, display: 'block' }}
          /* The sphere, the pins and the arcs are a DRAWING of the book; every word on this figure is real
             DOM text in the layer below (§6 rule 4), which is what a screen reader and the print path read.
             The bitmap is not described twice. */
          aria-hidden="true"
        />
        {plan && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {/*
              THE HEADLINE THAT HAS TO BE FIRST, because it is the one sentence that stops this figure being
              a lie. Nothing on this globe is at an organisation's location, and the reader is told that
              before they read a single position.
            */}
            <div style={{ position: 'absolute', left: 14, top: 12, maxWidth: '62%' }}>
              <div style={{ font: '600 11px/1.3 ui-monospace, monospace', letterSpacing: '.14em', color: '#8FB7FF' }}>
                LISTING GEOGRAPHY · REGION CENTROIDS, NOT ORGANISATIONS
              </div>
              <div style={{ ...mono(LABEL_DIM_FG, 10), marginTop: 5 }}>{plan.headerNote}</div>
            </div>

            {plan.labels.map((l) => (
              <div
                key={l.key}
                style={{
                  position: 'absolute', left: l.sx, top: l.sy,
                  /* `-100%` on Y lifts the box above its anchor so it never covers the pin it names; the X
                     term hangs it left of the anchor near the right edge instead of clipping. */
                  transform: l.flip ? 'translate(calc(-100% - 10px), -100%)' : 'translate(10px, -100%)',
                  background: LABEL_BG, border: '1px solid rgba(127,178,255,.30)',
                  padding: '5px 7px', maxWidth: LABEL_MAX_PX,
                }}
              >
                <div style={{ font: '600 10.5px/1.2 ui-monospace, monospace', letterSpacing: '.1em', color: LABEL_FG }}>
                  {l.title}
                  {l.sunlit === null ? '' : l.sunlit ? ' · ☀' : ' · ☾'}
                </div>
                {l.lines.map((t, i) => (
                  <div key={i} style={mono(i === l.lines.length - 1 ? LABEL_DIM_FG : LABEL_FG, i === l.lines.length - 1 ? 9.5 : 10)}>
                    {t}
                  </div>
                ))}
              </div>
            ))}

            {/* THE PIN'S UNIT, ON THE FRAME. A height that encodes a count is only a reading if the reader is
                told what the tallest one is, and told when the shortest is too short to see. */}
            <div style={{ position: 'absolute', right: 14, bottom: 12, textAlign: 'right' }}>
              <div style={mono(LABEL_DIM_FG, 10)}>{plan.pinNote}</div>
            </div>
          </div>
        )}
      </div>

      {/*
        EVERYTHING THIS FIGURE COULD NOT PLACE, IN WORDS AND NEVER SUMMED. An operator does something
        different about each one, and a map that quietly omits part of its universe is the defect this whole
        component is arranged around.
      */}
      {plan && (
        <div style={{
          ...mono('rgba(196,212,240,.66)', 10), marginTop: 6,
          display: 'flex', flexDirection: 'column', gap: 3,
          /* SCROLLS RATHER THAN CLIPS. A universe with many unrecognised region strings produces a long list,
             and the list of what a map left out is the last thing that may be silently cut off. */
          minHeight: 0, overflowY: 'auto',
        }}>
          <div>{plan.placedNote}</div>
          {plan.corridors.map((t) => <div key={t}>{t}</div>)}
          {plan.noCorridor.map((t) => <div key={t}>{t}</div>)}
          {plan.offFace.map((o) => <div key={o.key}>{o.text}</div>)}
          {plan.meridianRefused && (
            <div>
              The regions on this frame are antipodal, so no single camera face shows them all — the view keeps
              the hub&apos;s own meridian and the rest are named above.
            </div>
          )}
          {plan.unplacedNotes.map((t) => <div key={t}>{t}</div>)}
          {plan.aoNote && <div>{plan.aoNote}</div>}
          <div>{plan.costNote}</div>
        </div>
      )}
    </div>
  );
}
