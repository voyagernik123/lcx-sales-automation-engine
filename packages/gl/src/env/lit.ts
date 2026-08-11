import type { Mat4 } from '../math.js';
import type { Stage, StageRefusal } from '../stage.js';
import type { Geometry } from './mesh.js';
import type { ShadowMap } from './target3d.js';
import { SKY_GLSL, bindSky, type SkyOptions } from './sky.js';

/**
 * L2.5 · MATERIAL and L2.6 · SHADOW — the first surface in this codebase that is actually lit.
 *
 * ── WHY GGX AND NOT PHONG ───────────────────────────────────────────────────────────
 * Phong's specular is a power function with no physical basis, so its highlight has the wrong
 * shape and its energy changes with roughness — a surface gets brighter as you make it rougher,
 * which reads as "the material is wrong" without anyone being able to say why. GGX has the long
 * tail real microfacet distributions have, and paired with Smith geometry and Schlick Fresnel it
 * conserves energy. That matters more here than in a game, because this pipeline accumulates in
 * HDR and tone maps ONCE at the end: an over-bright specular does not clip locally, it lifts the
 * whole composite and desaturates the brand colour.
 *
 * ── WHY THE SHADOW BIAS IS SLOPE-SCALED ─────────────────────────────────────────────
 * A constant bias is the standard first attempt and it cannot work: the depth error at a texel
 * scales with the surface's slope relative to the light, so a bias large enough to stop acne on
 * a grazing floor is large enough to detach the shadow from a vertical wall (peter-panning).
 * Scaling by `1 - dot(N, L)` costs one instruction and removes both.
 *
 * ── LINEAR IN, LINEAR OUT ───────────────────────────────────────────────────────────
 * Every colour here is LINEAR radiance and nothing is tone mapped. The composite owns the tone
 * curve — `look/tonemap.ts` states it is the only tone map in the pipeline — so a material that
 * applied one would double-apply it and break `assertBrandFidelity`.
 */

/* THE SHADOW PASS. Position only: no normals, no colour, no varyings beyond depth. Anything
   else would be bandwidth spent on a value the depth-only framebuffer cannot store. */
const SHADOW_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`;

const SHADOW_FRAG = `#version 300 es
precision highp float;
void main(){}`;

/*
 * THE DEPTH PREPASS NEEDS ITS OWN SHADER, AND REUSING THE SHADOW ONE COST A DEBUGGING PASS.
 *
 * SHADOW_VERT computes `uLightVP * uModel * vec4(aPos, 1.0)`. GLSL multiplication is LEFT
 * associative, so that multiplies the two MATRICES first and then applies the product to the
 * vector. LIT_VERT applies `uModel` to the vector first and then the view-projection. Same
 * result algebraically, DIFFERENT floating-point rounding — so the depth a prepass wrote and the
 * depth the lit pass computes disagree in the last bits, `LEQUAL` rejects fragments it should
 * pass, and the surface comes out stippled with nested stair-step blocks.
 *
 * That artefact was identical with AO on and off, which is what proved it was the prepass and
 * not the occlusion. The fix is to make the two transforms BIT-IDENTICAL, not to loosen the
 * depth test or add a polygon offset — both of those hide it and leave the disagreement in place.
 */
const DEPTH_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * world;
}`;

const LIT_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aTangent;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform mat3 uNormalMat;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vTangent;
void main(){
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  /* THE NORMAL MATRIX, not the model matrix. Under non-uniform scale the model matrix skews
     normals off the surface and the lighting rotates as the object is squashed — the transpose
     of the inverse is the only transform that keeps them perpendicular. */
  vNormal = normalize(uNormalMat * aNormal);
  /* The tangent transforms by the MODEL matrix, not the normal matrix: it is a direction lying IN
     the surface, so it follows the geometry rather than staying perpendicular to it. Using the
     normal matrix here is a common slip and rotates the brush direction under non-uniform scale. */
  vTangent = normalize(mat3(uModel) * aTangent);
  gl_Position = uViewProj * world;
}`;

const LIT_FRAG = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vTangent;

uniform vec3 uEye;
uniform vec3 uLightDir;      // direction the light TRAVELS
uniform vec3 uLightColour;   // linear radiance
uniform float uAmbientGain;  // scales the environment's contribution
uniform vec3 uBaseColour;    // linear, brand-exact
uniform float uRoughness;
uniform float uMetalness;
uniform float uAnisotropy;   // 0 = isotropic, ->1 = highlight stretched along the tangent

uniform mat4 uLightVP;
uniform sampler2D uShadowMap;
uniform float uShadowTexel;  // 1.0 / shadowMapSize
uniform float uShadowStrength;

uniform sampler2D uAO;
uniform vec2 uScreenSize;
uniform float uAOEnabled;

out vec4 frag;
${SKY_GLSL}

const float PI = 3.14159265359;

float distributionGGX(float NdotH, float rough) {
  float a = rough * rough;
  float a2 = a * a;
  float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / max(1e-6, PI * d * d);
}

/*
 * ANISOTROPIC GGX — the difference between machined metal and grey plastic.
 *
 * Isotropic GGX gives a round highlight. Real turned or brushed metal has microscopic grooves
 * running one way, so the highlight STRETCHES perpendicular to nothing and elongates ALONG the
 * grooves — which is why a brushed-steel dial shows a bar of light rather than a dot, and why §2
 * asks for anisotropy specifically.
 *
 * Two roughnesses instead of one: at along the tangent, ab along the bitangent. The half-vector is
 * measured in that frame, so the lobe becomes an ellipse. Same energy, different shape.
 */
float distributionGGXAniso(float NdotH, float TdotH, float BdotH, float at, float ab) {
  float a2 = at * ab;
  vec3 v = vec3(ab * TdotH, at * BdotH, a2 * NdotH);
  float v2 = dot(v, v);
  float w2 = a2 / max(1e-8, v2);
  return a2 * w2 * w2 / PI;
}

float geometrySmith(float NdotV, float NdotL, float rough) {
  // Schlick-GGX with the direct-lighting k. Using the IBL k here is a common copy-paste error
  // that makes rough surfaces too dark at grazing angles.
  float k = (rough + 1.0) * (rough + 1.0) / 8.0;
  float gv = NdotV / (NdotV * (1.0 - k) + k);
  float gl = NdotL / (NdotL * (1.0 - k) + k);
  return gv * gl;
}

vec3 fresnelSchlick(float cosTheta, vec3 f0) {
  return f0 + (1.0 - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

float shadowFactor(vec3 world, float NdotL) {
  vec4 lc = uLightVP * vec4(world, 1.0);
  vec3 p = lc.xyz / lc.w;
  p = p * 0.5 + 0.5;
  /* OUTSIDE THE LIGHT FRUSTUM IS LIT, NOT SHADOWED. Returning 0 here would drop everything
     beyond the shadow extent into darkness — a hard rectangular edge across the floor that
     looks like a bug in the geometry rather than a shadow map that ran out of room. */
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;

  // SLOPE-SCALED BIAS — see the header. Constant bias cannot fix acne and peter-panning at once.
  float bias = max(0.0009, 0.0045 * (1.0 - NdotL));

  float lit = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 off = vec2(float(x), float(y)) * uShadowTexel;
      float d = texture(uShadowMap, p.xy + off).r;
      lit += (p.z - bias) <= d ? 1.0 : 0.0;
    }
  }
  lit /= 9.0;
  return mix(1.0, lit, uShadowStrength);
}

void main(){
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uEye - vWorld);
  vec3 L = normalize(-uLightDir);
  vec3 H = normalize(V + L);

  float NdotL = max(dot(N, L), 0.0);
  float NdotV = max(dot(N, V), 1e-4);
  float NdotH = max(dot(N, H), 0.0);
  float VdotH = max(dot(V, H), 0.0);

  vec3 f0 = mix(vec3(0.04), uBaseColour, uMetalness);
  float rough = clamp(uRoughness, 0.045, 1.0);

  /* The tangent frame, re-orthogonalised in the fragment. Interpolating a tangent across a
     triangle leaves it slightly off-perpendicular to the interpolated normal, and an anisotropic
     lobe built on a skewed frame twists visibly along a curved surface. */
  vec3 T = normalize(vTangent - N * dot(N, vTangent));
  vec3 B = cross(N, T);
  float aniso = clamp(uAnisotropy, 0.0, 0.95);
  // Preserve the average roughness while splitting it, so turning anisotropy up does not also
  // change how rough the surface reads.
  float at = max(0.002, rough * (1.0 + aniso));
  float ab = max(0.002, rough * (1.0 - aniso));

  float D = aniso > 0.001
    ? distributionGGXAniso(NdotH, dot(T, H), dot(B, H), at, ab)
    : distributionGGX(NdotH, rough);
  float G = geometrySmith(NdotV, NdotL, rough);
  vec3  F = fresnelSchlick(VdotH, f0);

  vec3 spec = (D * G * F) / max(1e-6, 4.0 * NdotV * NdotL + 1e-4);
  // Metals have no diffuse lobe — the energy went into the specular. Not cosmetic: a metallic
  // surface with a diffuse term reads as painted plastic.
  vec3 kd = (1.0 - F) * (1.0 - uMetalness);
  vec3 diffuse = kd * uBaseColour / PI;

  float shadow = shadowFactor(vWorld, NdotL);
  vec3 direct = (diffuse + spec) * uLightColour * NdotL * shadow;

  /*
   * THE ENVIRONMENT TERM — and this is what stopped the metal being black.
   *
   * A metal has essentially no diffuse lobe, so almost everything visible on it is reflected
   * environment. E0 rendered a metalness-0.92 sphere nearly black and the material was right:
   * there was nothing to reflect.
   *
   * DIFFUSE irradiance is the sky sampled along the normal. SPECULAR is the sky sampled along
   * the reflection, lerped toward the normal by roughness — with an analytic sky there is
   * nothing to prefilter, so moving the sample direction lets the gradient do the blurring. A
   * mirror samples R, a rough surface samples near N, and highlights stretch and soften
   * together, which is the behaviour that reads as "material" rather than "shader".
   */
  vec3 R = reflect(-V, N);
  vec3 envDiffuse = skyColour(N) * uBaseColour * (1.0 - uMetalness);
  vec3 envSpecular = skyColour(normalize(mix(R, N, rough * rough))) * fresnelSchlick(NdotV, f0);
  /*
   * AO MULTIPLIES THE ENVIRONMENT TERM ONLY, never the direct light.
   *
   * Ambient occlusion answers "how much of the sky can this point see", so it belongs on the
   * sky's contribution and nowhere else. Applying it to the whole colour — which is what a
   * post-process multiply would do — darkens the direct highlight as well, and a lit surface
   * whose specular dims inside a crease reads as dirt rather than as shadow. The shadow MAP
   * already handles the direct term.
   */
  float ao = uAOEnabled > 0.5 ? texture(uAO, gl_FragCoord.xy / uScreenSize).r : 1.0;
  vec3 ambient = (envDiffuse + envSpecular) * uAmbientGain * ao;

  // NO TONE MAP. The composite owns the only one in the pipeline.
  frag = vec4(direct + ambient, 1.0);
}`;

export interface MeshBuffer {
  readonly vao: WebGLVertexArrayObject;
  readonly indexCount: number;
  readonly indexType: number;
  dispose(): void;
}

/** Upload a `Geometry` to the GPU once. Geometry is static; re-uploading per frame is the leak. */
export function uploadMesh(stage: Stage, g: Geometry): MeshBuffer | StageRefusal {
  const { gl } = stage;
  const vao = gl.createVertexArray();
  const pos = gl.createBuffer();
  const nrm = gl.createBuffer();
  const tanBuf = gl.createBuffer();
  const idx = gl.createBuffer();
  if (!vao || !pos || !nrm || !tanBuf || !idx) {
    return { kind: 'refused', code: 'FRAMEBUFFER_INCOMPLETE', reason: 'The GPU refused a vertex buffer.' };
  }
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, pos);
  gl.bufferData(gl.ARRAY_BUFFER, g.positions, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, nrm);
  gl.bufferData(gl.ARRAY_BUFFER, g.normals, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, tanBuf);
  gl.bufferData(gl.ARRAY_BUFFER, g.tangents, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  return {
    vao,
    indexCount: g.indices.length,
    indexType: g.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
    dispose() {
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(pos); gl.deleteBuffer(nrm); gl.deleteBuffer(tanBuf); gl.deleteBuffer(idx);
    },
  };
}

export interface Material {
  readonly baseColour: readonly [number, number, number];
  readonly roughness: number;
  readonly metalness: number;
  /**
   * 0 = isotropic (a round highlight). Toward 1 the highlight stretches ALONG the surface tangent,
   * which is what makes turned or brushed metal show a bar of light instead of a dot.
   */
  readonly anisotropy?: number;
}

export interface LitDraw {
  readonly mesh: MeshBuffer;
  readonly model: Mat4;
  /** Inverse-transpose of the model's 3×3, row-major for `uniformMatrix3fv`. */
  readonly normalMat: Float32Array;
  readonly material: Material;
}

export interface LitRenderer {
  /** Depth-only pass into the shadow map. Call before `draw`. */
  /**
   * Optional per-call probe. `getError()` reports the first error since the last call and
   * CLEARS it, so a single check at the end of a pass identifies the pass and never the call.
   * Passing this makes a GL_INVALID_VALUE name its own line instead of costing three guesses.
   */
  shadowPass(lightVP: Mat4, draws: readonly LitDraw[], shadow: ShadowMap, onStep?: (label: string) => void): void;
  /**
   * DEPTH-ONLY, from the camera. Breaks the AO circularity — AO needs depth, the lit pass needs
   * AO — and is not a tax: the lit pass then rejects every occluded fragment before its GGX
   * evaluation rather than after. Reuses the shadow program, which is already position-only.
   */
  depthPrepass(viewProj: Mat4, draws: readonly LitDraw[]): void;
  draw(opts: {
    readonly viewProj: Mat4;
    readonly eye: readonly [number, number, number];
    readonly lightDir: readonly [number, number, number];
    readonly lightColour: readonly [number, number, number];
    /** Scales the environment contribution. 1 = the sky as authored. */
    readonly ambientGain?: number;
    readonly sky?: SkyOptions;
    readonly lightVP: Mat4;
    readonly shadow: ShadowMap | null;
    readonly shadowStrength?: number;
    readonly draws: readonly LitDraw[];
    /** Half-resolution occlusion from `createAmbientOcclusion`. Omit to disable. */
    readonly ao?: WebGLTexture | null;
    readonly screenSize?: readonly [number, number];
    readonly onStep?: (label: string) => void;
  }): void;
  dispose(): void;
}

export function createLitRenderer(stage: Stage): LitRenderer | StageRefusal {
  const { gl } = stage;
  const shadowProg = stage.compile(SHADOW_VERT, SHADOW_FRAG);
  if ('kind' in shadowProg) return shadowProg;
  const litProg = stage.compile(LIT_VERT, LIT_FRAG);
  if ('kind' in litProg) return litProg;
  const depthProg = stage.compile(DEPTH_VERT, SHADOW_FRAG);
  if ('kind' in depthProg) return depthProg;

  const u = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);

  return {
    shadowPass(lightVP, draws, shadow, onStep) {
      const step = onStep ?? (() => undefined);
      shadow.bind(); step('shadow.bind');
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.BLEND);
      /* FRONT-FACE CULLING IN THE SHADOW PASS. Rendering back faces puts the recorded depth on
         the far side of the object, which moves the acne inside the geometry where nothing can
         see it. Cheaper and more robust than tuning bias alone. */
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.FRONT);
      gl.useProgram(shadowProg); step('useProgram(shadow)');
      gl.uniformMatrix4fv(u(shadowProg, 'uLightVP'), false, lightVP); step('uLightVP');
      for (const d of draws) {
        gl.uniformMatrix4fv(u(shadowProg, 'uModel'), false, d.model); step('shadow uModel');
        gl.bindVertexArray(d.mesh.vao); step('shadow bindVAO');
        gl.drawElements(gl.TRIANGLES, d.mesh.indexCount, d.mesh.indexType, 0); step('shadow drawElements');
      }
      gl.bindVertexArray(null);
      gl.cullFace(gl.BACK);
    },

    depthPrepass(viewProj, draws) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      /* colorMask off: this pass exists for depth, and writing colour would overwrite the
         environment backdrop that was drawn before it. */
      gl.colorMask(false, false, false, false);
      gl.useProgram(depthProg);
      gl.uniformMatrix4fv(u(depthProg, 'uViewProj'), false, viewProj);
      for (const d of draws) {
        gl.uniformMatrix4fv(u(depthProg, 'uModel'), false, d.model);
        gl.bindVertexArray(d.mesh.vao);
        gl.drawElements(gl.TRIANGLES, d.mesh.indexCount, d.mesh.indexType, 0);
      }
      gl.bindVertexArray(null);
      gl.colorMask(true, true, true, true);
    },

    draw(o) {
      const step = o.onStep ?? (() => undefined);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      /* depthMask STAYS ON. With a prepass the values are already correct so writing them again
         is a no-op, and turning it off would break the no-prepass path that E0 also exercises. */
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.useProgram(litProg);
      gl.uniformMatrix4fv(u(litProg, 'uViewProj'), false, o.viewProj); step('uViewProj');
      gl.uniform3fv(u(litProg, 'uEye'), o.eye as unknown as number[]); step('uEye');
      gl.uniform3fv(u(litProg, 'uLightDir'), o.lightDir as unknown as number[]); step('uLightDir');
      gl.uniform3fv(u(litProg, 'uLightColour'), o.lightColour as unknown as number[]); step('uLightColour');
      gl.uniform1f(u(litProg, 'uAmbientGain'), o.ambientGain ?? 1); step('uAmbientGain');
      bindSky(gl, litProg, o.sky); step('bindSky');
      if (o.ao && o.screenSize) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, o.ao);
        gl.uniform1i(u(litProg, 'uAO'), 1);
        gl.uniform2f(u(litProg, 'uScreenSize'), o.screenSize[0], o.screenSize[1]);
        gl.uniform1f(u(litProg, 'uAOEnabled'), 1);
      } else {
        // NO AO TEXTURE MEANS UNOCCLUDED, never fully occluded: a missing resource must not
        // black out the scene, which is indistinguishable from a broken shader.
        gl.uniform1f(u(litProg, 'uAOEnabled'), 0);
      }
      step('bindAO');
      gl.uniformMatrix4fv(u(litProg, 'uLightVP'), false, o.lightVP); step('lit uLightVP');

      if (o.shadow) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, o.shadow.depthTexture);
        gl.uniform1i(u(litProg, 'uShadowMap'), 0);
        gl.uniform1f(u(litProg, 'uShadowTexel'), 1 / o.shadow.size);
        gl.uniform1f(u(litProg, 'uShadowStrength'), o.shadowStrength ?? 1);
      } else {
        // NO SHADOW MAP IS "FULLY LIT", never "fully shadowed". A missing resource must not
        // black out the scene — that is indistinguishable from a broken shader.
        gl.uniform1f(u(litProg, 'uShadowStrength'), 0);
      }

      for (const d of o.draws) {
        gl.uniformMatrix4fv(u(litProg, 'uModel'), false, d.model);
        gl.uniformMatrix3fv(u(litProg, 'uNormalMat'), false, d.normalMat); step('uNormalMat');
        gl.uniform3fv(u(litProg, 'uBaseColour'), d.material.baseColour as unknown as number[]); step('uBaseColour');
        gl.uniform1f(u(litProg, 'uRoughness'), d.material.roughness);
        gl.uniform1f(u(litProg, 'uMetalness'), d.material.metalness);
        gl.uniform1f(u(litProg, 'uAnisotropy'), d.material.anisotropy ?? 0);
        gl.bindVertexArray(d.mesh.vao); step('lit bindVAO');
        gl.drawElements(gl.TRIANGLES, d.mesh.indexCount, d.mesh.indexType, 0); step('lit drawElements');
      }
      gl.bindVertexArray(null);
      gl.disable(gl.CULL_FACE);
    },

    dispose() {
      gl.deleteProgram(shadowProg);
      gl.deleteProgram(litProg);
      gl.deleteProgram(depthProg);
    },
  };
}

export { LIT_VERT, LIT_FRAG, SHADOW_VERT, SHADOW_FRAG, DEPTH_VERT };
