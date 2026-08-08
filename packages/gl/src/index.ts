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
  beginAdditive, beginOpaque, endPass,
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

/* ── L3 · motion ── */
export {
  startMotion, browserMotionEnvironment, easeInOut, interpolateFraming,
  IdleMotionError, MOTION_POLICY,
} from './motion/index.js';
export type { MotionSpec, MotionPurpose, MotionEnvironment, Tween, Framing } from './motion/index.js';
