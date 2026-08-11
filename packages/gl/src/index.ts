/**
 * `@lcx/gl` — L1 renderer · L2 look · L3 motion.
 *
 * The spine of `3D_WORK_100X.md`. Deliberately small: §3.1 lists five primitives and
 * claims they express all nine surfaces. Three of them (`points`, `lines`,
 * `instancedQuads`) cover seven.
 *
 * ── THE CONTRACT THAT MAKES NINE PARALLEL LANES POSSIBLE ────────────────────────────
 * A surface (L4) receives a `SurfaceOutcome` from L0 and a `Stage` from L1, and emits
 * draw declarations. It never reaches into this package. A lane that believes a
 * primitive is missing files a SPINE REQUEST; it does not add one locally — nine lanes
 * each extending the renderer produce nine renderers.
 *
 * ── WHY NOT three.js ────────────────────────────────────────────────────────────────
 * Measured at P0, not assumed: 513 KB raw, tree-shaken to what one surface actually
 * needs. `MAX_CHUNK_KB` is 440, initial JS has 13 KB of headroom against 850, and
 * passthrough has 304 KB free of 1024. It breaches all three at once. The renderer that
 * beat it in the P0 capture is 12.8 KB. See `docs/3d/p0/README.md`.
 */

/* ── L1 · renderer ── */
export {
  createStage, isStage, stageRefusal,
  beginAdditive, beginAlpha, beginOpaque, endPass,
  DEPTH_POLICY, STAGE_REFUSAL_CODES,
} from './stage.js';
export type {
  Stage, StageOutcome, StageOptions, StageRefusal, StageRefusalCode, RenderTarget,
} from './stage.js';

export {
  IDENTITY, multiply, perspective, orthographic, lookAt,
  projectNdc, projectScreen, worldPerNdcY,
  sub, dot, cross, normalise,
} from './math.js';
export type { Mat4, Vec3 } from './math.js';

export { createPointCloud, FALLOFF, POINTS_VERT, POINTS_FRAG } from './primitives/points.js';
export type { PointCloud, PointCloudData, PointCloudStyle } from './primitives/points.js';

export { createLineBatch, LINES_VERT, LINES_FRAG } from './primitives/lines.js';
export type { LineBatch, StrokeStyle } from './primitives/lines.js';

/* ── L2 · look ── */
export {
  srgbToLinear, linearToSrgb, hexToLinear, linearToHex,
  exposure, mixLinear, luminance,
  BRAND, BRAND_HEX,
} from './look/colour.js';
export type { Linear, BrandKey } from './look/colour.js';

export {
  toneMapComposite, assertBrandFidelity, brandUnderIllegalToneMap,
  describeToneMapping, dataRoundTrip, encodeOutput,
  TONE_POLICY, TONE_SHOULDER, TONE_MAP_GLSL, SRGB_ENCODE_GLSL,
} from './look/tonemap.js';
export type { BrandFidelityFailure } from './look/tonemap.js';

export { createPipeline, PIPELINE_SOURCES } from './look/pipeline.js';
export type { Pipeline, PipelineOptions } from './look/pipeline.js';

/* ── L4 · flat ──────────────────────────────────────────────────────────────────────
   2-D primitives on the SAME pipeline as the 3-D surfaces. PLATFORM_VFX_100X.md's thesis:
   a chart with no third data axis still gets linear light, HDR accumulation, real edge
   falloff and a contact shadow — none of which needs a z axis. */
export { createBarBatch, plotMatrix, BARS_VERT, BARS_FRAG, CONTACT_VERT, CONTACT_FRAG } from './flat/bars.js';
export type { BarBatch, BarDatum, BarStyle } from './flat/bars.js';
export { createStrokeBatch } from './flat/strokes.js';
export type { StrokeBatch, StrokeStyleFlat } from './flat/strokes.js';
export { sharedRenderer, resetSharedRenderer } from './flat/shared.js';
export type { SharedRenderer, SharedFrame } from './flat/shared.js';

/* ── L3 · motion ── */
export {
  startMotion, browserMotionEnvironment, easeInOut, interpolateFraming,
  IdleMotionError, MOTION_POLICY,
} from './motion/index.js';
export type { MotionSpec, MotionPurpose, MotionEnvironment, Tween, Framing } from './motion/index.js';

/* ── L1.5/L1.6/L2.5/L2.6 · ENVIRONMENT ──────────────────────────────────────────────
   3D_VFX_1000X.md §4. The mesh, camera, depth target, lit material and shadow map that
   `@lcx/gl` did not have — and whose absence is why exactly one file in the web app had a
   3-D camera. Everything here lands in a LAZY chunk; initial JS is untouched. */
export { box, plane, sphere, computeNormals, triangleCount } from './env/mesh.js';
export type { Geometry } from './env/mesh.js';
export {
  eyeOf, viewProjection, lightViewProjection, boundsRadius, boundsCentre, ELEVATION_LIMIT,
} from './env/camera.js';
export type { Viewpoint, DirectionalLight } from './env/camera.js';
export { createTarget3D, createShadowMap } from './env/target3d.js';
export type { Target3D, ShadowMap } from './env/target3d.js';
export {
  createLitRenderer, uploadMesh, LIT_VERT, LIT_FRAG, SHADOW_VERT, SHADOW_FRAG,
} from './env/lit.js';
export type { LitRenderer, LitDraw, Material, MeshBuffer } from './env/lit.js';
