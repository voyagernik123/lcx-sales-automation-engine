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
  hexToLinear, assertBrandFidelity, IDENTITY, TONE_MAP_GLSL, SRGB_ENCODE_GLSL,
  qualitySettings, shadowMapSizeFor, pickQualityTier,
  type LitDraw, type Viewpoint, type MeshBuffer,
} from '@lcx/gl';
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
 * THE DOM LENS CEILING, CARRIED FROM A CONTRAST MEASUREMENT — AND NOT RE-MEASURED HERE.
 *
 * The harness set 2.4 px "by reading it", then measured the glyph core against the frame's own pixels and found
 * 1.47:1 on an 11.5 px note against a 4.5:1 requirement, with 11 of 18 text runs failing WCAG AA. Bisected against
 * that measurement, the largest pair that held every run above 4.5:1 was 0.45 px of blur and 0.90 opacity. Those
 * are the numbers below.
 *
 * WHAT IS HONEST TO SAY ABOUT THEM HERE: the panel hexes, the type colours and the sizes are the same, so the
 * carry-over is defensible — but this page has no capture harness, so nobody has re-run the measurement on THIS
 * frame. The frame says that under itself rather than implying a measurement it does not have.
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

const styleFor = (kind: 'tag' | 'head' | 'note', onBlue: boolean): CSSProperties => {
  if (kind === 'tag') {
    return {
      font: '600 11px/1.35 ui-monospace, monospace', letterSpacing: '.12em',
      color: onBlue ? '#EAF1FF' : '#7FB2FF',
    };
  }
  if (kind === 'head') {
    return { font: '700 26px/1.06 system-ui, sans-serif', letterSpacing: '-0.01em', color: '#FFFFFF' };
  }
  return { font: '400 11.5px/1.45 system-ui, sans-serif', color: onBlue ? '#FFFFFF' : '#C6D4EC' };
};

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

export default function DeckReliefGl({ panels, heightPx, onRefused }: DeckReliefGlProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  /**
   * THE REDRAW LIVES IN A REF, AND THAT IS WHAT KEEPS ONE GL CONTEXT.
   *
   * Addressing a panel changes the frame, so it needs a redraw — and if the addressed index were React state in
   * this effect's dependency list, every click would tear the renderer down and build a new context. §6 rule 7
   * exists to stop exactly that. So the effect builds the scene once and publishes a draw function; a click calls
   * it. The overlay is React state because it is DOM, and it is the only thing a click changes up here.
   */
  const drawRef = useRef<((addressed: number | null) => void) | null>(null);
  /*
   * THE TIER. Subscribed rather than read once: every frame here goes into an offscreen target and is blitted
   * only at the end, so a resolved lower tier can rebuild the deck before anything has been painted.
   */
  const tier = useResolvedQualityTier();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    /* Any earlier overlay is dropped before a new frame exists. A projected heading from the previous deck sitting
       over a freshly drawn room is a stale picture presented as live data. */
    setPlan(null);
    drawRef.current = null;

    /* A single panel has no ORDER to state, and the whole reading here is an ordering. */
    if (panels.length < MIN_PANELS) { onRefused('FEWER_THAN_TWO_PANELS_NO_DEPTH_ORDER'); return; }
    /* REFUSES RATHER THAN DROPPING ONE. The arc has five measured positions; a sixth panel would have to be
       invented, and silently omitting a panel from a view of the deck is the defect E1's own frame shipped once
       and had to be corrected for. The grid carries all of them. */
    if (panels.length > MAX_PANELS) { onRefused('MORE_PANELS_THAN_THE_ARC_HAS_POSITIONS'); return; }

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
    const releaseAll = (): void => {
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

    /*
     * THE CAMERA IS FRAMED ON THE SLOTS ACTUALLY USED, and only on their x centroid.
     *
     * Eye height 1.67 m and 7.2° of downward tilt — a person standing on the deck, not a drone above it — are the
     * harness's, and the elevation is what costs most if it drifts: past about 15° the deck plate becomes the
     * subject and the panels read as objects on a table. What is NOT the harness's is the centring: this deck has
     * four panels where the arc has five positions, so framing on x=0 would leave a half-frame of empty deck.
     */
    const slots = slotsFor(panels.length);
    const cx = slots.reduce((s, p) => s + p.x, 0) / slots.length;
    const view: Viewpoint = {
      target: [cx, 0.62, 0.1], distance: 8.4, azimuthDeg: 1.5, elevationDeg: 7.2, fovDeg: 38,
    };
    const eye = eyeOf(view);
    const FOV = view.fovDeg ?? 38;
    /* FROM THE VIEWPOINT, NOT HAND-WRITTEN: these planes linearise the depth buffer for AO and DOF, and
       linearising with planes the projection was not built from is silently wrong — the effect then describes a
       slightly different scene, which reads as its strength being mistuned. */
    const { near, far } = nearFarOf(view);
    const vp = viewProjection(view, W / H);

    /*
     * PIXELS PER METRE IS DERIVED FROM THE CANVAS, NOT A CONSTANT — and this is a correction to the harness.
     *
     * `entry.ts` fixes 250 px/m because every capture is 1200×720. In the app the canvas is whatever the page is
     * wide, and the homography SCALES the element onto the quad: a constant px/m makes the rendered type shrink on
     * a narrow viewport and swell on a wide one, so the one thing that must not change with layout would. Solving
     * for the screen scale at the target plane keeps a 26 px heading at about 26 px wherever the deck is drawn,
     * and lets the projection do the foreshortening — which is what states the depth.
     */
    const pxPerMetre = (cssW / 2) / (Math.tan((FOV * Math.PI) / 360) * view.distance);

    const deckGeo = plane(30, 1);
    /* ONE GEOMETRY PER SLOT rather than one box scaled five ways. A non-uniform scale stops the normal matrix
       being a rotation, so normals tilt off the surface and the lighting rotates as the panel stretches. Five
       boxes are 60 triangles. */
    const panelGeo = slots.map((s) => box(s.w, s.h, THICKNESS));

    /* UPLOADED ONE AT A TIME, EACH REGISTERED FOR DISPOSAL BEFORE THE NEXT IS ATTEMPTED. Uploading all of them and
       then checking means a failure on the last refuses while the earlier ones are still on the GPU with no
       disposer recorded — a leak on the path that is hardest to reach and repeats on every toggle. */
    const meshes: MeshBuffer[] = [];
    for (const g of [deckGeo, ...panelGeo]) {
      const m = uploadMesh(stage, g);
      if ('kind' in m) { refuse(m.code); return; }
      meshes.push(m);
      disposers.push(() => m.dispose());
    }
    const deckMesh = meshes[0]!;
    const panelMesh = meshes.slice(1);

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
       z-index rather than an append order because DOM order is the ANNOUNCED order: appending far-to-near made the
       harness's accessibility tree read the deck backwards, and it changed if the camera moved. */
    [...rank].reverse().forEach((slotIdx, r) => depthRankOf.set(slotIdx, r));

    /*
     * WHERE ON EACH SLAB THE CONTENT GOES — SEARCHED ONCE, BECAUSE IT DOES NOT DEPEND ON WHAT IS WRITTEN ON IT.
     *
     * Centred content put two of the harness's panels straight into the refusal branch: two of each one's four
     * corners landed behind the panel standing nearer, so both outer panels went dark and three of five workstreams
     * carried nothing. The cheap fix is to loosen the occlusion test until they pass, which is a fix to the
     * INSTRUMENT and ships text lying across the wrong surface. Each panel is occluded on ONE side — the side its
     * nearer neighbour stands on — so a shift away from the occluder recovers the whole box without shrinking it.
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
      let chosen: { transform: string; ew: number; eh: number } | null = null;
      let lastRefusal: string | null = null;
      outer: for (const scale of SCALES) {
        const cw = Math.max(0.2, (p.w - 2 * PAD_U) * scale);
        const ch = Math.max(0.2, (p.h - 2 * PAD_V) * scale);
        const ew = Math.round(cw * pxPerMetre), eh = Math.round(ch * pxPerMetre);
        for (const shift of SHIFTS) {
          /* Content overhanging the slab it is mounted on is a worse artefact than content that is occluded, so a
             shift past the panel's own edge is not a candidate. */
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
            chosen = { transform: proj.transform, ew, eh };
            break outer;
          }
          if (proj.signedArea <= 0) lastRefusal = 'BACK_FACING';
          else lastRefusal = 'OCCLUDED_BY_A_NEARER_PANEL';
        }
      }
      return { slot: i, chosen, refusal: chosen ? null : (lastRefusal ?? 'NO_UNOCCLUDED_PLACEMENT') };
    });

    /* The circle of confusion a slab gets, in CSS pixels — one expression, so the GL lens and the DOM lens cannot
       drift apart. */
    const cocOf = (d: number, focus: number): number =>
      Math.min(MAX_COC, Math.abs(1 / focus - 1 / d) * APERTURE) * cssW;

    /*
     * ONE KEY LIGHT, 33° ABOVE THE HORIZON AND TO THE LEFT. Steeper lands almost entirely on the 6 cm top edges and
     * leaves the faces to the ambient sky, so the frame goes flat exactly where the information lives. The harness
     * measured 38° first and dropped it: a shadow falling across the panel BEHIND is the one cue that states two
     * panels are at different depths without the lens, and at 38° the reach stopped 15 cm short.
     */
    const lightDir: [number, number, number] = [0.62, -0.55, -0.58];
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
      { direction: lightDir, colour: [1, 1, 1], extent: radius * 1.15 },
      boundsCentre(sceneMin, sceneMax), radius,
    );

    /**
     * ONE FRAME PER CALL, AND NOTHING BETWEEN CALLS.
     *
     * §6 rule 2: no idle animation. There is no `requestAnimationFrame`, no `setInterval` and no `setTimeout` in
     * this file — a click draws exactly one frame and the GPU then goes quiet, which is also why the reduced-motion
     * case needs no branch: a still frame is already the final frame, and addressing a panel is a state change
     * rather than a transition.
     */
    const draw = (addressed: number | null): void => {
      if (dead) return;
      const order = addressOrder(panels.length, addressed);
      /* Content index per depth rank: rank 0 (nearest) gets the addressed panel, then the deck's own order. */
      const panelAtSlot = new Map<number, number>();
      order.forEach((panelIdx, r) => panelAtSlot.set(rank[r]!, panelIdx));

      const addressedSlot = addressed === null ? null : rank[0]!;
      const focus = addressedSlot === null ? placed[rank[0]!]!.distance : placed[addressedSlot]!.distance;

      const draws: LitDraw[] = [
        /*
         * THE DECK IS BRIGHTER THAN THE NAVY PANELS STANDING ON IT, and that is the key light's doing rather than a
         * number that wants tuning. The harness measured 32/36/48 on the lit deck against 26/32/50 on a panel
         * face, and both obvious levers backfired — a rougher deck came out brighter, and a lower ambient gain
         * brightened it further while draining the shadow interiors. A floor under a key 33° up has N·L = 0.54.
         * Which is what a photograph of this room would do: dark panels as silhouettes against a lit floor.
         */
        { mesh: deckMesh, model: modelOf(0, 0, 0, 0), normalMat: N3,
          material: { baseColour: hexToLinear('#070B14'), roughness: 0.86, metalness: 0 } },
        ...placed.map((p, i): LitDraw => ({
          mesh: p.mesh, model: p.model, normalMat: p.normalMat,
          /*
           * THE ADDRESSED PANEL CARRIES BRAND BLUE, so colour and focus agree about which panel is being addressed
           * instead of the frame arguing with itself. NEAR-DIELECTRIC, and that is a brand constraint before it is
           * a taste one: a metal has no diffuse lobe, so its colour arrives only through the specular F0 and
           * #2C6BFF would become a blue-tinted mirror of the sky rather than the brand hex (§6 rule 5).
           */
          material: i === addressedSlot
            ? { baseColour: hexToLinear('#2C6BFF'), roughness: 0.42, metalness: 0.06 }
            : { baseColour: hexToLinear('#16203A'), roughness: 0.48, metalness: 0.06 },
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
        skyBox.draw({ eye, target: view.target, fovDeg: FOV, aspect: W / H });
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
          viewProj: vp, eye, lightDir, lightColour: [3.5, 3.45, 3.3],
          ambientGain: 1.05, lightVP, shadow, shadowStrength: 0.92, shadowTaps: Q.shadowTaps,
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

      const maxCocPx = Math.max(...placed.map((p) => cocOf(p.distance, focus)));
      const overlay: OverlayPanel[] = [];
      const withheld: { title: string; reason: string }[] = [];
      let notesDropped = 0;

      for (const panelIdx of order) {
        const slotIdx = [...panelAtSlot.entries()].find(([, v]) => v === panelIdx)![0];
        const datum = panels[panelIdx]!;
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
        const kind: ('tag' | 'head' | 'note')[] = ['tag', 'head', 'note'];
        overlay.push({
          key: datum.id,
          panelIndex: panelIdx,
          addressed: onBlue,
          depthRank: depthRankOf.get(slotIdx) ?? 0,
          transform, ew, eh,
          blurPx: DOM_BLUR_CEILING * norm,
          opacity: 1 - DOM_DIM_MAX * norm,
          lines: lines
            .map((ln, k) => ({ text: ln.text, style: styleFor(kind[k]!, onBlue) }))
            .filter((_, k) => fit.keep[k]),
        });
      }

      setPlan({
        cssW, cssH,
        addressedIndex: addressed,
        addressedTitle: addressed === null ? null : (panels[addressed]?.title ?? null),
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
    /* AT REST: nothing addressed, the lens off, the depth order the deck's own. */
    draw(null);

    /*
     * CONTEXT LOSS RESOLVES TO THE GRID. Without this the canvas keeps its last frame for ever while the GPU has
     * dropped the context — a stale picture of a launch programme presented as live data. Registered on this canvas
     * rather than the document so it cannot fire for someone else's.
     */
    const onLost = (e: Event): void => { e.preventDefault(); onRefused('CONTEXT_LOST'); };
    canvas.addEventListener('webglcontextlost', onLost);

    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      drawRef.current = null;
      /* Already released on the refusal path, and `disposers.reverse()` MUTATES — running it twice would restore
         the original order and dispose forwards, with the stage killed before the resources built on it. */
      if (dead) return;
      dead = true;
      for (const d of disposers.reverse()) d();
      stage.dispose();
    };
    /* `tier` IS A DEPENDENCY, and that is the rebuild mechanism: a resolved lower tier tears this context down
       and builds the deck again at it. */
  }, [panels, heightPx, onRefused, tier]);

  const address = (panelIndex: number): void => {
    const fn = drawRef.current;
    if (!fn) return;
    /* Addressing the panel already addressed returns the deck to rest, which is also what Escape does. A toggle
       that cannot be undone leaves the reader in a configuration they did not choose. */
    fn(plan?.addressedIndex === panelIndex ? null : panelIndex);
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
              background: 'rgba(4,6,11,0.82)', padding: '8px 10px', borderRadius: 5, maxWidth: '62%',
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
          font: '400 10px/1.5 ui-monospace, monospace', color: 'rgba(196,212,240,.62)', marginTop: 6,
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
            The DOM blur ceiling ({DOM_BLUR_CEILING} px) and dim ({DOM_DIM_MAX}) are carried from E1&#39;s measured
            contrast bisection on the same hexes and type sizes; they have NOT been re-measured on this page.
          </div>
        </div>
      )}
    </div>
  );
}
