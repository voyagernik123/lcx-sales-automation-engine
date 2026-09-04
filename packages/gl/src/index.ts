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
  toneMapComposite, assertBrandFidelity, brandThroughComposite,
  describeToneMapping, dataRoundTrip, encodeOutput,
  TONE_POLICY, TONE_SHOULDER, TONE_MAP_GLSL, SRGB_ENCODE_GLSL,
} from './look/tonemap.js';

/* L2 · CATEGORICAL SEPARATION — the invariant ORDER SURVIVES does not imply, because monotone is
   not injective. Reachable from the barrel because a module only a subpath specifier can reach is
   the same shape as the defect this programme already found once: code that ships, cannot be
   called by any consumer, and is written up as if it were live. The subpath
   `@lcx/gl/look/categorical.js` still resolves and is still the cheaper import — see
   `docs/3d/w2/SUBPATH_COST.md`; this block is about REACHABILITY, not about which specifier a
   surface should use. `categorical.test.ts` derives both sides of this list and fails if they
   diverge, so a symbol added to `categorical.ts` next week is not silently left behind. */
export {
  labOf, deltaE76Lab, deltaE2000Lab, deltaE2000, deltaE76, chromaOf, RAMP_CHROMA_FLOOR,
  PALETTE_CATEGORIES, categoryOf, CLAIM_CATEGORIES, isClaim, differentClaim, claimPairs,
  CATEGORICAL_FLOOR_DE2000, SEPARATION_PERCENTILE, CATEGORICAL_POLICY, reinhard, TONE_ASYMPTOTE,
  ENCODE_CLIP_RADIANCE, pixelAt, separationThroughComposite, illuminationCeiling,
  separationFailures,
} from './look/categorical.js';
export type {
  Lab, CategoryId, SeparationFailure,
} from './look/categorical.js';

export type { BrandFidelityFailure } from './look/tonemap.js';

export { precompensate, isPrecompRefusal, precompHeadroom, inverseToneMap } from './look/precompensate.js';
export type { CompositeSite, PrecompRefusal, BlendDest } from './look/precompensate.js';
export { createPipeline, PIPELINE_SOURCES } from './look/pipeline.js';
export type { Pipeline, PipelineOptions } from './look/pipeline.js';
export { createAntialias, AA_SOURCE } from './look/aa.js';
export { createPresenter, loadEnvironmentMap, PRESENT_BLOOM, PRESENT_COPY_FRAG, PRESENT_COPY_VERT } from './look/present.js';
export type { Presenter, PresentOptions } from './look/present.js';
export { uploadEnvironment, ENV_MAP_UNIT } from './env/sky.js';
export type { Antialias } from './look/aa.js';

/* L2 · SEMANTIC STATUS COLOUR — status is the third category, neither identity nor absence, and its
   VALUE belongs to the platform rather than to a scene. Reachable from the barrel for the same
   reason `categorical.js` is, and it is worth naming plainly: this module was built, measured to
   three decimals, tested at 318 lines, and exported from NOWHERE — the third time this programme
   has shipped that exact shape. `semantic.test.ts` derives both sides of this list from the module
   namespace and from `semantic.ts`'s own export statements, so a symbol added there next week is
   not silently left behind here.

   WHAT THIS BLOCK IS AND IS NOT. It makes the module CALLABLE, which is a precondition and was
   never the delivery. When it was written the divergence still lived in `PipelineReliefGl` and
   `VaultReliefGl`, and this comment said so rather than claiming a green box. Both surfaces now
   consume `statusAlbedo`, the burnt orange is gone from the code of both, and `semantic.test.ts`
   asserts that in BOTH directions — the literal is absent AND the import is present — so a
   refactor that puts a literal back goes red naming the surface.

   `ThemeName` is deliberately NOT re-exported here: `statusAlbedo(role, theme)` accepts the string
   literals `'light'` / `'dark'` directly, so a barrel-only consumer can call it without naming the
   type, and re-exporting `./look/theme.js` is a separate decision about a module this block does
   not own. */
export {
  STATUS_ROLES, statusToken, statusAlbedo, statusHex,
  hueAngleDeg, chroma, hueDistanceDeg, greyscaleRatio,
  HUE_BUCKET_DEG, statusAdmission, sceneStatusRoles, STATUS_POLICY,
} from './look/semantic.js';
export type { StatusRole, StatusAdmission } from './look/semantic.js';

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
export { box, plane, sphere, cylinder, torus, arcTube, latLonToVec3, heightfield, computeNormals, computeTangents, triangleCount } from './env/mesh.js';
export type { HeightfieldResult } from './env/mesh.js';
export { contourSegments } from './env/mesh.js';
export type { ContourSegment, ContourResult } from './env/mesh.js';
export type { Geometry } from './env/mesh.js';
export { projectQuad, squareToQuad, uprightPanelCorners, isQuadRefusal } from './env/project.js';
export { createParticleField, particleLayout, emissionSchedule, CURL_NOISE_GLSL } from './env/particles.js';
export type { ParticleField, ParticleSource } from './env/particles.js';
export { createVolumeField, rayBoxSlab, marchPlan, RAY_BOX_GLSL } from './env/volume.js';
export type { VolumeField } from './env/volume.js';
export {
  QUALITY_TIERS, qualitySettings, pickQualityTier, prefersReducedMotion, prefersMoreContrast, shadowMapSizeFor,
} from './env/quality.js';
export type { QualityTier, QualitySettings } from './env/quality.js';
export type { QuadCorners, QuadProjection, QuadRefusal } from './env/project.js';
export {
  eyeOf, viewProjection, lightViewProjection, boundsRadius, boundsCentre, ELEVATION_LIMIT,
  nearFarOf,
} from './env/camera.js';
export type { Viewpoint, DirectionalLight } from './env/camera.js';
export { createTarget3D, createShadowMap } from './env/target3d.js';
export type { Target3D, ShadowMap } from './env/target3d.js';
export {
  createLitRenderer, uploadMesh, LIT_VERT, LIT_FRAG, SHADOW_VERT, SHADOW_FRAG,
} from './env/lit.js';
export type { LitRenderer, LitDraw, Material, MeshBuffer } from './env/lit.js';
export { createSkyBackdrop, bindSky, skyIrradiance, SKY_GLSL, DEFAULT_SKY } from './env/sky.js';
export {
  createAmbientOcclusion, DEPTH_RECONSTRUCT_GLSL, LINEAR_DEPTH_GLSL, VIEW_POS_GLSL,
} from './env/ao.js';
export { createDepthOfField } from './env/dof.js';
export type { DepthOfField } from './env/dof.js';
export type { AmbientOcclusion } from './env/ao.js';
export type { SkyBackdrop, SkyOptions } from './env/sky.js';
export { parseGlb, isGltfRefusal } from './env/gltf.js';
export type { GltfAsset, GltfMesh, GltfMaterial, GltfRefusal } from './env/gltf.js';
