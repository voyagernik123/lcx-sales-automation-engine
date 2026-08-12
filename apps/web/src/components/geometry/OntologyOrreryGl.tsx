/**
 * E4 · THE ORRERY, as a product component rather than a harness.
 *
 * `docs/3d/e4` proved the environment; this is the part that ships. It draws the SAME entities and the SAME
 * couplings the node-link diagram beside it is drawing — one graph, two drawings — which is what makes the
 * two comparable at all and is the whole basis for putting a 3-D reading in front of an operator.
 *
 * ── THIS FILE IS ONLY EVER REACHED THROUGH A LAZY IMPORT ─────────────────────────────
 * `OntologyOrrery` imports it with `lazy()`, so none of it — nor any of `@lcx/gl` — lands in the initial
 * bundle. The perf budget measures RAW pre-gzip initial JS with about 11 KB of headroom for the whole
 * application, and the environment layer alone is 35.7 KB. An eager import would spend all of it and more on
 * a view most readers never open. Same discipline as `ForgeBackdrop` and `SurfaceReliefGl`.
 *
 * ── THE GEOMETRY DECISIONS ARE NOT HERE ──────────────────────────────────────────────
 * `orrery/orreryLayout.ts` owns every position, every scale and every count, because those are the claims and
 * a claim needs a unit test rather than a screenshot. This file turns them into draw calls and refuses when
 * the GPU will not do it. On any refusal it renders NOTHING and calls `onRefused`, and the parent puts the
 * reader back on the diagram — §6 rule 1, and the reason the parent owns the fallback: a component that
 * cannot construct its renderer cannot be trusted to draw its own escape hatch.
 *
 * ── NO IDLE ANIMATION, AND THEREFORE NO ORBITAL MOTION ───────────────────────────────
 * §6 rule 2. The orbits are a single frozen phase: one frame is rendered and the renderer stops. There is no
 * `requestAnimationFrame` and no `setInterval` anywhere in this file, which is also why reduced motion needs
 * no branch — a still frame is already the final frame. A still of an orrery invites the assumption that it
 * turns; it does not, and the caption says so.
 */
import { useEffect, useRef, useState } from 'react';
import {
  createStage, isStage, plane, sphere, cylinder, torus, uploadMesh, createLitRenderer, createTarget3D,
  createShadowMap, viewProjection, lightViewProjection, boundsCentre, boundsRadius, projectScreen,
  hexToLinear, assertBrandFidelity, IDENTITY,
  TONE_MAP_GLSL, SRGB_ENCODE_GLSL,
  type LitDraw, type Geometry,
} from '@lcx/gl';
import {
  buildOrrery, isOrreryRefusal, ORRERY_PLANES, ABSENT_GEOM, WITHHELD_R, WITHHELD_H, DECK_Y,
  type OrreryInput, type OrreryLayout, type V3,
} from '@/components/geometry/orrery/orreryLayout';

/** What the renderer hands back to the wrapper: the numbers, plus where two labels landed on screen. */
export interface OrreryReading {
  readonly layout: OrreryLayout;
  readonly labels: readonly { readonly id: string; readonly label: string; readonly xPct: number; readonly yPct: number; readonly role: 'core' | 'selected' }[];
  readonly triangles: number;
  readonly drawCalls: number;
}

export interface OntologyOrreryGlProps {
  readonly input: Omit<OrreryInput, 'cssWidth' | 'cssHeight'>;
  /** Called with a stable code when the view cannot be drawn. The parent then shows the flat diagram. */
  readonly onRefused: (code: string, reason: string) => void;
  /** Called once per successful frame with everything the HUD prints. */
  readonly onReading: (r: OrreryReading) => void;
}

/* Comments live ABOVE the shader literals, never inside them: a comment inside a template literal is shipped
   bytes a minifier cannot reach, and a backtick inside one terminates it. That has bitten twelve times here. */
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
 * COLOUR CARRIES THE DATA STATE, NOT THE ENTITY KIND — a deliberate division, and E4's.
 *
 * Kind is already encoded by inclination, which is the axis this environment exists to spend. Using colour for
 * it as well would leave nothing for the distinction the honesty rules actually require: observed against
 * absent against withheld. So every observed body is the same brand blue and the palette stays exact under
 * `assertBrandFidelity`; five invented kind hues would not have.
 */
const OBSERVED_HEX = '#2C6BFF';
const CORE_HEX = '#7FB2FF';
const LINK_HEX = '#7FB2FF';
const ABSENT_HEX = '#FF8A3D';
const WITHHELD_HEX = '#6B7A99';
/* The rings are the AXIS and the tubes are the DATA, so the rings must lose on value: same thickness, lower
   value, structure recedes. The collapsed rings on the plate are the flat control and lose again. */
const RING_HEX = '#22355E';
const FLAT_RING_HEX = '#141F38';
/* Darker than the palette's plate (#0E1628), deliberately: a horizontal plane takes the key light at nearly
   N·L = 1, so its own albedo is the only thing holding it below the bodies in value. */
const DECK_HEX = '#090F1C';
const CLEAR_HEX = '#05070E';

const N3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

/* `IDENTITY` IS A FACTORY. `new Float32Array(IDENTITY)` has length 0, every vertex collapses to the origin,
   and the frame comes back a clear colour with a complete framebuffer and no error raised. It cost E0 a day. */
const scaledAt = (p: V3, s: number): Float32Array => {
  const m = IDENTITY();
  m[0] = s; m[5] = s; m[10] = s;
  m[12] = p[0]; m[13] = p[1]; m[14] = p[2];
  return m;
};

/**
 * A LINK'S MODEL MATRIX IS A BASIS, NOT A ROTATION SOLVED FOR.
 *
 * Two columns are the tube's radial directions scaled by its thickness and the third is the link direction
 * scaled by its length; the translation is the midpoint. Built this way there is no axis-angle to get
 * backwards and no gimbal case, only the degenerate one where two entities coincide — which refuses.
 *
 * The normal matrix is the inverse transpose, which for M = [u·r | d·L | v·r] is [u/r | d/L | v/r]. Getting it
 * wrong under non-uniform scale does not throw: it lights a thin tube as though it were round, which reads as
 * a material that is subtly wrong and nothing more.
 */
function linkTransform(a: V3, b: V3, r: number): { model: Float32Array; normal: Float32Array } | null {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = Math.hypot(d[0], d[1], d[2]);
  if (L < 1e-6) return null;
  const dn: V3 = [d[0] / L, d[1] / L, d[2] / L];
  const ref: V3 = Math.abs(dn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u0: V3 = [
    dn[1] * ref[2] - dn[2] * ref[1],
    dn[2] * ref[0] - dn[0] * ref[2],
    dn[0] * ref[1] - dn[1] * ref[0],
  ];
  const ul = Math.hypot(u0[0], u0[1], u0[2]) || 1;
  const u: V3 = [u0[0] / ul, u0[1] / ul, u0[2] / ul];
  const v: V3 = [
    dn[1] * u[2] - dn[2] * u[1],
    dn[2] * u[0] - dn[0] * u[2],
    dn[0] * u[1] - dn[1] * u[0],
  ];
  const m = IDENTITY();
  m[0] = u[0] * r; m[1] = u[1] * r; m[2] = u[2] * r;
  m[4] = dn[0] * L; m[5] = dn[1] * L; m[6] = dn[2] * L;
  m[8] = v[0] * r; m[9] = v[1] * r; m[10] = v[2] * r;
  m[12] = (a[0] + b[0]) / 2; m[13] = (a[1] + b[1]) / 2; m[14] = (a[2] + b[2]) / 2;
  const n = new Float32Array([
    u[0] / r, u[1] / r, u[2] / r,
    dn[0] / L, dn[1] / L, dn[2] / L,
    v[0] / r, v[1] / r, v[2] / r,
  ]);
  return { model: m, normal: n };
}

/**
 * THE ABSENT RING HAS TO FACE THE READER.
 *
 * `torus` lies in the XZ plane, so an unrotated ring is HORIZONTAL, and at a 26-degree camera a horizontal
 * ring is a three-pixel sliver — an amber smear that reads as a rendering fault rather than as a ring, which
 * destroys the whole point: the ring's job is to be visibly NOT a sphere. So its axis aims at the eye. A
 * facing derived from a convention can be backwards; one aimed at the camera cannot.
 */
function facingBasis(p: V3, towards: V3): { model: Float32Array; normal: Float32Array } {
  const d: V3 = [towards[0] - p[0], towards[1] - p[1], towards[2] - p[2]];
  const L = Math.hypot(d[0], d[1], d[2]) || 1;
  const ax: V3 = [d[0] / L, d[1] / L, d[2] / L];
  const ref: V3 = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u0: V3 = [
    ax[1] * ref[2] - ax[2] * ref[1],
    ax[2] * ref[0] - ax[0] * ref[2],
    ax[0] * ref[1] - ax[1] * ref[0],
  ];
  const ul = Math.hypot(u0[0], u0[1], u0[2]) || 1;
  const u: V3 = [u0[0] / ul, u0[1] / ul, u0[2] / ul];
  const v: V3 = [
    ax[1] * u[2] - ax[2] * u[1],
    ax[2] * u[0] - ax[0] * u[2],
    ax[0] * u[1] - ax[1] * u[0],
  ];
  const m = IDENTITY();
  m[0] = u[0]; m[1] = u[1]; m[2] = u[2];
  m[4] = ax[0]; m[5] = ax[1]; m[6] = ax[2];
  m[8] = v[0]; m[9] = v[1]; m[10] = v[2];
  m[12] = p[0]; m[13] = p[1]; m[14] = p[2];
  /* A rotation's inverse transpose is itself, so the same nine numbers serve as the normal matrix. */
  return { model: m, normal: new Float32Array([u[0], u[1], u[2], ax[0], ax[1], ax[2], v[0], v[1], v[2]]) };
}

/** Rotation for an orbit RING, which `torus` emits in the XZ plane. Same convention as `orbitPoint`. */
function orbitBasis(incDeg: number, nodeDeg: number): { model: Float32Array; normal: Float32Array } {
  const RAD = Math.PI / 180;
  const i = incDeg * RAD, n = nodeDeg * RAD;
  const ci = Math.cos(i), si = Math.sin(i), cn = Math.cos(n), sn = Math.sin(n);
  const r9 = new Float32Array([cn, 0, -sn, sn * si, ci, cn * si, sn * ci, -si, cn * ci]);
  const m = IDENTITY();
  m[0] = r9[0]!; m[1] = r9[1]!; m[2] = r9[2]!;
  m[4] = r9[3]!; m[5] = r9[4]!; m[6] = r9[5]!;
  m[8] = r9[6]!; m[9] = r9[7]!; m[10] = r9[8]!;
  return { model: m, normal: r9 };
}

export default function OntologyOrreryGl({ input, onRefused, onReading }: OntologyOrreryGlProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /*
   * THE SIZE IS MEASURED, AND IT IS ROUNDED TO A STEP ON PURPOSE.
   *
   * This canvas lives in a flex column that resizes with the window, and every pixel claim the layout makes —
   * the 9-pixel body floor, the 3.2-pixel tube — is against these numbers, so a stale size is a false claim
   * rather than a blurry picture. But rebuilding a GL context per resize event would rebuild it sixty times
   * during one window drag. Snapping to 32-pixel steps bounds that to the handful of steps a drag crosses, and
   * it is also what stops the measure-then-set-state pair from oscillating.
   */
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const snap = (n: number): number => Math.max(0, Math.round(n / 32) * 32);
    const measure = (): void => {
      const w = snap(host.clientWidth), h = snap(host.clientHeight);
      setSize((prev) => (prev !== null && prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size === null) return;

    /*
     * §6 RULE 5 BEFORE ANYTHING IS DRAWN. If the palette does not round-trip through this pipeline's tone map
     * there is no point rendering: the frame would be off-brand by an amount too small to see and too large to
     * be exact, and it would be screenshotted into a deck.
     */
    if (assertBrandFidelity().length > 0) {
      onRefused('BRAND_FIDELITY_FAILED', 'the brand palette does not survive this pipeline unchanged');
      return;
    }

    /* THE LAYOUT AND ITS REFUSALS COME FIRST, before a context is created. A geometry refusal — an entity kind
       with no plane, a system that merges at every viewpoint — is not the GPU's fault and must not cost a
       WebGL context to discover. */
    const outcome = buildOrrery({ ...input, cssWidth: size.w, cssHeight: size.h });
    if (isOrreryRefusal(outcome)) { onRefused(outcome.code, outcome.reason); return; }
    const L = outcome;

    /* DPR CAPPED AT 2. Everything in this frame is fill-bound, so a 3× display would triple the cost of a
       reading whose whole justification is that an operator gets an answer faster. */
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const W = Math.round(size.w * dpr), H = Math.round(size.h * dpr);
    canvas.width = W; canvas.height = H;

    const out = createStage(canvas, { alpha: false });
    if (!isStage(out)) { onRefused(out.code, out.reason); return; }
    const stage = out;
    const gl = stage.gl;

    const disposers: (() => void)[] = [];
    const refuse = (code: string, reason: string): void => {
      for (const d of disposers.reverse()) d();
      stage.dispose();
      onRefused(code, reason);
    };

    const present = stage.compile(PRESENT_VERT, PRESENT_FRAG);
    if ('kind' in present) { refuse(present.code, present.reason); return; }
    const lit = createLitRenderer(stage);
    if ('kind' in lit) { refuse(lit.code, lit.reason); return; }
    disposers.push(() => lit.dispose());
    const target = createTarget3D(stage, W, H);
    if ('kind' in target) { refuse(target.code, target.reason); return; }
    disposers.push(() => target.dispose());
    /*
     * SHADOWS YES, AMBIENT OCCLUSION NO, AND THE OMISSION IS A MEASUREMENT RATHER THAN A SAVING.
     *
     * The shadows are load-bearing: a sphere floating over a plate is at an ambiguous height — the eye cannot
     * separate "small and close to the plate" from "large and high above it" — and the gap between a body and
     * its own shadow IS the height, which is the reading inclination depends on.
     *
     * Ambient occlusion was measured in the harness at E4's own settings and changed 0.44% of the frame: it
     * modulates the AMBIENT term only, the ambient here is a dark instrument sky, and a system of separated
     * spheres in open space has almost no concavities to occlude. Running it would cost a half-resolution
     * depth gather for a difference no reader can see. It also happens to avoid a live `@lcx/gl` defect where
     * a missing shadow map and a missing AO texture together leave two samplers bound to the float scene
     * target; the shadow map is present here, so that pairing cannot arise.
     */
    const shadow = createShadowMap(stage, 1024);
    if ('kind' in shadow) { refuse(shadow.code, shadow.reason); return; }
    disposers.push(() => shadow.dispose());

    /* ── MESHES. One unit sphere scaled per body: a uniform scale leaves a normal's DIRECTION unchanged, so
       the identity normal matrix is correct and the shader normalises what it is handed. ── */
    const deckGeo = plane(L.deckSize, 48);
    const sphereGeo = sphere(1, 20, 28);
    const absentGeo = torus(ABSENT_GEOM.ringRadius, ABSENT_GEOM.tubeRadius, 44, 14);
    const withheldGeo = cylinder(WITHHELD_R, WITHHELD_H, 36);
    /* A UNIT CYLINDER along Y, radius 1, height 1, so a link's model matrix carries its thickness in two
       columns and its length in the third and nothing is re-uploaded per link. */
    const linkGeo = cylinder(1, 1, 14);
    /* One ring geometry per shell radius. Each is used twice: inclined above the plate for a (kind, shell)
       that is occupied, and flat on the plate as the collapsed control. */
    const ringGeos = L.shells.map((r) => torus(r, L.ringTube, 128, 8));

    const named: readonly (readonly [string, Geometry])[] = [
      ['deck', deckGeo], ['sphere', sphereGeo], ['absent', absentGeo],
      ['withheld', withheldGeo], ['link', linkGeo],
      ...ringGeos.map((g, i) => ['ring' + i, g] as const),
    ];
    const meshes = new Map<string, { vao: WebGLVertexArrayObject; indexCount: number; indexType: number; dispose(): void }>();
    for (const [k, g] of named) {
      const m = uploadMesh(stage, g);
      if ('kind' in m) { refuse(m.code, m.reason); return; }
      meshes.set(k, m);
      disposers.push(() => m.dispose());
    }
    const meshOf = (k: string) => meshes.get(k)!;

    const draws: LitDraw[] = [
      {
        mesh: meshOf('deck'), model: scaledAt([0, DECK_Y, 0], 1), normalMat: N3,
        material: { baseColour: hexToLinear(DECK_HEX), roughness: 0.9, metalness: 0 },
      },
    ];
    /*
     * STRUCTURE DOES NOT CAST. In E4's first capture the orbit rings dropped concentric shadow ellipses onto
     * the plate, and a shadow of an axis is indistinguishable from an axis: the frame appeared to have twice as
     * many shells as the ontology has. The links came out too — their shadows were near-vertical black stripes,
     * and a dark stripe on a plate covered in tubes reads as another tube. The shadow says how high each BODY
     * sits above the reference plane; anything else it says is noise on top of that.
     */
    const casters: LitDraw[] = [];

    /*
     * THE FLAT ALTERNATIVE IS IN THE SAME FRAME, AS THE REFERENCE PLANE.
     *
     * One faint ring per SHELL is drawn flat on the plate, against one ring per (kind, shell) inclined above
     * it. That is the collapse the third axis undoes, drawn rather than argued: flattened, a licence's one-hop
     * ring and a requirement's one-hop ring are the same circle. `flatRingsCollapsed` is the count.
     */
    L.shells.forEach((_, i) => {
      draws.push({
        mesh: meshOf('ring' + i), model: scaledAt([0, DECK_Y + 0.02, 0], 1), normalMat: N3,
        material: { baseColour: hexToLinear(FLAT_RING_HEX), roughness: 0.7, metalness: 0.1 },
      });
    });

    /* One inclined ring per (kind, shell) that is actually occupied. A ring drawn where no entity sits would
       be a structure claiming a population it does not have. */
    const ringKeys = new Set<string>();
    for (const b of L.bodies) {
      if (b.offSystem || b.isCore || b.hops === null) continue;
      const key = b.kind + '@' + String(b.hops);
      if (ringKeys.has(key)) continue;
      ringKeys.add(key);
      const shellIndex = L.shells.indexOf(b.shell);
      if (shellIndex < 0) continue;
      /* THE SAME PLANE TABLE THE POSITIONS CAME FROM. Two copies of these angles is how a ring ends up drawn
         through bodies that are not on it — the layout would be right and the axis it is read off would be a
         few degrees wrong, which is invisible and total. */
      const pl = ORRERY_PLANES[b.kind] ?? { incDeg: 0, nodeDeg: 0 };
      const basis = orbitBasis(pl.incDeg, pl.nodeDeg);
      draws.push({
        mesh: meshOf('ring' + shellIndex), model: basis.model, normalMat: basis.normal,
        material: { baseColour: hexToLinear(RING_HEX), roughness: 0.55, metalness: 0.2 },
      });
    }

    for (const l of L.links) {
      const tf = linkTransform(l.a, l.b, l.r);
      if (!tf) continue;
      draws.push({
        mesh: meshOf('link'), model: tf.model, normalMat: tf.normal,
        material: { baseColour: hexToLinear(LINK_HEX), roughness: 0.34, metalness: 0.12 },
      });
    }

    for (const b of L.bodies) {
      const d: LitDraw = b.magnitude.state === 'absent'
        ? ((): LitDraw => {
          const f = facingBasis(b.pos, L.eye);
          return {
            mesh: meshOf('absent'), model: f.model, normalMat: f.normal,
            /* Roughness up and metalness down: once the ring faces the reader its normals point at the reader
               and the key light comes from above, so the diffuse term along the top of the tube is all there
               is. A metal here reflects a dark interior sky and comes back nearly black. */
            material: { baseColour: hexToLinear(ABSENT_HEX), roughness: 0.52, metalness: 0.04 },
          };
        })()
        : b.magnitude.state === 'withheld'
          ? {
            mesh: meshOf('withheld'), model: scaledAt(b.pos, 1), normalMat: N3,
            /* METALNESS 0.15, NOT 0.58, and that was a material error rather than a taste one: a metal has no
               diffuse term, it shows its environment, and this environment is a dark instrument interior. The
               one body whose job is to be seen and not read was the hardest thing on the frame to find. */
            material: { baseColour: hexToLinear(WITHHELD_HEX), roughness: 0.42, metalness: 0.15 },
          }
          : {
            mesh: meshOf('sphere'), model: scaledAt(b.pos, b.radius), normalMat: N3,
            material: {
              baseColour: hexToLinear(b.isCore ? CORE_HEX : OBSERVED_HEX),
              roughness: b.isCore ? 0.22 : 0.34,
              metalness: b.isCore ? 0.36 : 0.08,
            },
          };
      draws.push(d);
      casters.push(d);
    }

    /*
     * THE LIGHT IS NEARLY OVERHEAD, at 0.14 / 0.22 off plumb, and that is about attribution. A more oblique
     * key throws each shadow a metre and a half sideways, and at that offset the reader cannot tell whether the
     * gap between a body and a shadow is the body's HEIGHT or the light's ANGLE — which is the one thing the
     * shadow is here to say. Steep enough to attribute, tilted enough that the spheres keep a terminator.
     */
    const lightDir: [number, number, number] = [0.14, -0.966, -0.22];
    const span = L.outerRadius + 3;
    const sceneMin: [number, number, number] = [-span, DECK_Y, -span];
    const sceneMax: [number, number, number] = [span, span * 0.6, span];
    const lightVP = lightViewProjection(
      { direction: lightDir, colour: [1, 1, 1], extent: span * 1.5 },
      boundsCentre(sceneMin, sceneMax), boundsRadius(sceneMin, sceneMax),
    );

    /* ONE FRAME, then nothing. See the file header: §6 rule 2, and the reason reduced motion needs no branch. */
    const vp = viewProjection(L.view, W / H);
    lit.shadowPass(lightVP, casters, shadow);
    target.bind();
    const cc = hexToLinear(CLEAR_HEX);
    gl.clearColor(cc[0], cc[1], cc[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    lit.depthPrepass(vp, draws);
    lit.draw({
      viewProj: vp, eye: L.eye, lightDir, lightColour: [3.1, 3.05, 2.95],
      ambientGain: 0.52, lightVP, shadow, shadowStrength: 0.92, draws,
      ao: null, screenSize: [W, H], fog: null,
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.DEPTH_TEST);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    stage.blit(present, (p) => gl.uniform1i(gl.getUniformLocation(p, 'uScene'), 0));

    const err = gl.getError();
    if (err !== 0) { refuse('GL_ERROR_AFTER_DRAW', 'the driver reported error ' + err + ' after the frame'); return; }

    /*
     * TWO LABELS, IN THE DOM, PROJECTED FROM THE SAME MATRIX THE FRAME USED. §6 rule 4: text is the
     * accessibility tree and the print path, so it is never baked into a texture.
     *
     * Only two: the core, because "distance from the core" says nothing without naming it, and the reader's
     * selection, because that is the entity they asked about. Labelling all of them needs the harness's
     * obstacle system — one obstacle set filled in priority order with four candidate placements each — and at
     * up to a hundred entities that system does not have room to succeed. The absence is a real cost and it is
     * stated next to the toggle rather than discovered: naming a specific entity is what the diagram is for.
     */
    const labels: { id: string; label: string; xPct: number; yPct: number; role: 'core' | 'selected' }[] = [];
    const pushLabel = (id: string, role: 'core' | 'selected'): void => {
      const b = L.bodies.find((x) => x.id === id);
      if (!b) return;
      const q = projectScreen(vp, b.pos, size.w, size.h);
      if (q.behind) return;
      labels.push({
        id: b.id, label: b.label, role,
        xPct: (q.sx / size.w) * 100, yPct: (q.sy / size.h) * 100,
      });
    };
    pushLabel(L.core.id, 'core');
    if (input.selectedId !== null && input.selectedId !== L.core.id) pushLabel(input.selectedId, 'selected');

    onReading({
      layout: L,
      labels,
      /* Counted from the geometry that was uploaded rather than estimated: `draws.length` and this number are
         the two costs a frame is entitled to state about itself. */
      triangles: draws.reduce((n, d) => n + Math.floor(d.mesh.indexCount / 3), 0),
      drawCalls: draws.length,
    });

    /*
     * CONTEXT LOSS RESOLVES TO THE FLAT DIAGRAM. Without this the canvas keeps its last frame on screen for
     * ever while the GPU has dropped the context — a stale picture presented as live data, which is worse than
     * no picture. Registered on the canvas rather than the document, so it cannot fire for someone else's.
     */
    const onLost = (e: Event): void => {
      e.preventDefault();
      onRefused('CONTEXT_LOST', 'the browser dropped this canvas GPU context, so the frame on it is stale');
    };
    canvas.addEventListener('webglcontextlost', onLost);

    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      /* DISPOSE IN REVERSE, AND THE STAGE LAST. It owns the context; releasing it first leaves every other
         delete* call operating on a dead context — silent rather than fatal, and it leaks on every remount.
         This component remounts whenever a reader toggles the view or the window crosses a size step. */
      for (const d of disposers.reverse()) d();
      stage.dispose();
    };
  }, [input, size, onRefused, onReading]);

  return (
    <div ref={hostRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
        /* The relief carries the same entities the diagram and the inspector carry, so it is not announced
           twice; the HUD beside it is DOM text and is what a screen reader reads. */
        aria-hidden="true"
      />
    </div>
  );
}
