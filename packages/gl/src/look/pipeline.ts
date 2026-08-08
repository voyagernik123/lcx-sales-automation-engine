/**
 * L2 · THE PIPELINE — bright pass, separable blur, composite.
 *
 * This is the run of passes that turns an HDR accumulation buffer into a frame, and the
 * place where the tone-map policy stops being a comment and becomes shader code:
 *
 *   scene (HDR, linear)  ──►  bright pass  ──►  blur ×N  ──┐
 *                          │                              ▼
 *                          └──────────────────────►  COMPOSITE  ──► sRGB ──► canvas
 *                                                        ▲
 *                                              background gradient
 *
 * The tone map lives in the COMPOSITE and nowhere else. By that point background, data
 * and bloom are one set of pixels representing LIGHT, and rolling that off is the whole
 * reason to have a tone map: accumulated density gets a shoulder instead of clipping to
 * white. The data colour was already placed, so the map shapes light without re-grading
 * a brand hue — `3D_WORK_100X.md` §4.1.
 *
 * sRGB is encoded exactly ONCE, at the end of the composite. Every blend, accumulation
 * and blur upstream of it happened in linear light.
 */

import type { Stage, RenderTarget, StageRefusal } from '../stage.js';
import type { Linear } from './colour.js';
import { TONE_MAP_GLSL, SRGB_ENCODE_GLSL } from './tonemap.js';

const FS_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 q;
out vec2 uv;
void main(){ uv = q * 0.5 + 0.5; gl_Position = vec4(q, 0.0, 1.0); }`;

/**
 * Bright pass. Thresholds on Rec.709 LUMINANCE, not on max(r,g,b) — thresholding on the
 * max channel makes a saturated blue bloom before a brighter neutral, which reads as the
 * data glowing for the wrong reason.
 *
 * `smoothstep` rather than a hard cut: a hard threshold makes the bloom boundary crawl
 * across the frame as values cross it, which is visible under any motion at all.
 */
const BRIGHT_FRAG = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D uSource;
uniform vec2 uThreshold;
out vec4 frag;
void main(){
  vec3 c = texture(uSource, uv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  frag = vec4(c * smoothstep(uThreshold.x, uThreshold.y, l), 1.0);
}`;

/** 9-tap gaussian, separable. Two passes at σ, then two at 2σ, is a cheap wide kernel. */
const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D uSource;
uniform vec2 uDirection;
out vec4 frag;
void main(){
  float w[5] = float[](0.2270, 0.1946, 0.1216, 0.0540, 0.0162);
  vec3 c = texture(uSource, uv).rgb * w[0];
  for (int i = 1; i < 5; i++) {
    vec2 o = uDirection * float(i);
    c += texture(uSource, uv + o).rgb * w[i];
    c += texture(uSource, uv - o).rgb * w[i];
  }
  frag = vec4(c, 1.0);
}`;

const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D uScene, uBloom;
uniform vec3 uPlate;
uniform vec2 uVignetteCentre;
uniform float uVignetteDepth, uBloomGain;
out vec4 frag;
${TONE_MAP_GLSL}
${SRGB_ENCODE_GLSL}
void main(){
  vec3 scene = texture(uScene, uv).rgb;
  vec3 bloom = texture(uBloom, uv).rgb;
  // Background gradient in LINEAR space. A flat black plate reads as "unfinished", and
  // building the gradient in sRGB would band visibly across a large dark field.
  vec2 d = uv - uVignetteCentre;
  vec3 plate = uPlate * (1.0 - uVignetteDepth * smoothstep(0.12, 1.00, length(d * vec2(1.0, 1.45))));
  vec3 lit = plate + scene + bloom * uBloomGain;
  // THE ONLY TONE MAP IN THE PIPELINE, and it is on the composite.
  lit = lcxToneMap(lit);
  // THE ONLY sRGB ENCODE IN THE PIPELINE.
  frag = vec4(lcxEncode(lit), 1.0);
}`;

export interface PipelineOptions {
  /** Luminance range over which the bright pass ramps in. */
  readonly threshold?: readonly [number, number];
  /** Blur passes. Each entry is a σ multiplier; `[1,1,2,2]` = two at σ, two at 2σ. */
  readonly blurSteps?: readonly number[];
  readonly bloomGain?: number;
  readonly plate?: Linear;
  readonly vignetteCentre?: readonly [number, number];
  readonly vignetteDepth?: number;
}

export interface Pipeline {
  /**
   * Run bright → blur → composite. The scene target must already contain the frame in
   * linear HDR. Leaves the canvas bound.
   */
  resolve(opts?: PipelineOptions): void;
  dispose(): void;
}

export function createPipeline(stage: Stage): Pipeline | StageRefusal {
  const { gl } = stage;
  const bright = stage.compile(FS_VERT, BRIGHT_FRAG);
  if ('kind' in bright) return bright;
  const blur = stage.compile(FS_VERT, BLUR_FRAG);
  if ('kind' in blur) return blur;
  const composite = stage.compile(FS_VERT, COMPOSITE_FRAG);
  if ('kind' in composite) return composite;

  const bindSource = (program: WebGLProgram, t: RenderTarget, name: string, unit: number) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t.texture);
    gl.uniform1i(gl.getUniformLocation(program, name), unit);
  };

  return {
    resolve(opts = {}) {
      const threshold = opts.threshold ?? [0.12, 0.7];
      const steps = opts.blurSteps ?? [1, 1, 2, 2];
      const { bloomA, bloomB } = stage;

      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);

      stage.bindTarget(bloomA);
      stage.blit(bright, (p) => {
        bindSource(p, stage.scene, 'uSource', 0);
        gl.uniform2f(gl.getUniformLocation(p, 'uThreshold'), threshold[0], threshold[1]);
      });

      // Ping-pong, alternating axis per step so the kernel stays separable.
      let src = bloomA, dst = bloomB;
      steps.forEach((sigma, i) => {
        const horizontal = i % 2 === 0;
        stage.bindTarget(dst);
        stage.blit(blur, (p) => {
          bindSource(p, src, 'uSource', 0);
          gl.uniform2f(
            gl.getUniformLocation(p, 'uDirection'),
            horizontal ? sigma / dst.width : 0,
            horizontal ? 0 : sigma / dst.height,
          );
        });
        const t = src; src = dst; dst = t;
      });

      stage.bindTarget(null);
      stage.blit(composite, (p) => {
        bindSource(p, stage.scene, 'uScene', 0);
        bindSource(p, src, 'uBloom', 1);
        const plate = opts.plate ?? ([0.0045, 0.0075, 0.0205] as const);
        gl.uniform3f(gl.getUniformLocation(p, 'uPlate'), plate[0], plate[1], plate[2]);
        const vc = opts.vignetteCentre ?? [0.4, 0.34];
        gl.uniform2f(gl.getUniformLocation(p, 'uVignetteCentre'), vc[0], vc[1]);
        gl.uniform1f(gl.getUniformLocation(p, 'uVignetteDepth'), opts.vignetteDepth ?? 0.62);
        gl.uniform1f(gl.getUniformLocation(p, 'uBloomGain'), opts.bloomGain ?? 0.9);
      });
    },
    dispose() {
      /* Programs are owned and freed by the Stage. */
    },
  };
}

/**
 * Exported so a test can assert the composite is the ONLY place the tone map appears.
 * A future pass that adds `lcxToneMap` to the bright pass or to a primitive shader is
 * exactly the regression §4.1 warns about, and a string search over these sources is
 * what catches it — nothing about the rendered pixels would look obviously wrong.
 */
export const PIPELINE_SOURCES = Object.freeze({
  vertex: FS_VERT,
  bright: BRIGHT_FRAG,
  blur: BLUR_FRAG,
  composite: COMPOSITE_FRAG,
});
