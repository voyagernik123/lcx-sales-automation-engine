/**
 * L2 · ANTI-ALIASING — an FXAA 3.11-shaped pass on the ENCODED image (THE PRODUCTION, P3).
 *
 * WHAT IT IS, SAID PLAINLY. Fast approximate anti-aliasing: it reads the sRGB-encoded LDR frame the composite produced,
 * estimates local contrast from luma, finds the edge direction, and blends along it. It is not SMAA and not MSAA; it is
 * the pass a GL2 pipeline with one HDR target can afford at 2× DPR, and it removes the shimmer on the shelf's edge,
 * the slab's silhouette and every hairline the reliefs draw. Named for what it does so nobody "upgrades" a claim later.
 *
 * WHERE IT RUNS. After the composite, before the canvas: the composite encodes sRGB exactly once (pipeline.ts), and AA
 * wants perceptual luma, so it runs on that image and writes it back unchanged in colour where there is no edge. It
 * therefore cannot move a brand hex on a flat mark — `brand-fidelity.mjs` measures flat marks, and a flat mark has no
 * edge to blend. On an edge it blends two neighbouring colours, which is the whole point.
 *
 * NO STATE, NO HISTORY. Temporal AA would need the previous frame; the stage draws frames on demand and holds them, so a
 * history buffer would be a second frame nobody asked for. This pass is stateless by design.
 */
import type { Stage, StageRefusal } from '../stage.js';

const FS_VERT = `#version 300 es
precision highp float; out vec2 uv;
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); uv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

/* FXAA 3.11 "quality" simplified: 12-tap edge walk, sub-pixel blend 0.75, edge threshold 0.125 with a 0.0312 floor. */
const FXAA_FRAG = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D uImage;
uniform vec2 uInvSize;
out vec4 frag;
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
void main(){
  vec4 c  = texture(uImage, uv);
  float lM = luma(c.rgb);
  float lN = luma(texture(uImage, uv + vec2( 0.0, -1.0) * uInvSize).rgb);
  float lS = luma(texture(uImage, uv + vec2( 0.0,  1.0) * uInvSize).rgb);
  float lW = luma(texture(uImage, uv + vec2(-1.0,  0.0) * uInvSize).rgb);
  float lE = luma(texture(uImage, uv + vec2( 1.0,  0.0) * uInvSize).rgb);
  float lMin = min(lM, min(min(lN, lS), min(lW, lE)));
  float lMax = max(lM, max(max(lN, lS), max(lW, lE)));
  float range = lMax - lMin;
  if (range < max(0.0312, lMax * 0.125)) { frag = c; return; }
  float lNW = luma(texture(uImage, uv + vec2(-1.0, -1.0) * uInvSize).rgb);
  float lNE = luma(texture(uImage, uv + vec2( 1.0, -1.0) * uInvSize).rgb);
  float lSW = luma(texture(uImage, uv + vec2(-1.0,  1.0) * uInvSize).rgb);
  float lSE = luma(texture(uImage, uv + vec2( 1.0,  1.0) * uInvSize).rgb);
  float edgeH = abs(lNW + lNE - 2.0 * lN) + 2.0 * abs(lW + lE - 2.0 * lM) + abs(lSW + lSE - 2.0 * lS);
  float edgeV = abs(lNW + lSW - 2.0 * lW) + 2.0 * abs(lN + lS - 2.0 * lM) + abs(lNE + lSE - 2.0 * lE);
  bool horizontal = edgeH >= edgeV;
  float l1 = horizontal ? lN : lW, l2 = horizontal ? lS : lE;
  float grad1 = l1 - lM, grad2 = l2 - lM;
  bool first = abs(grad1) >= abs(grad2);
  float gradScaled = 0.25 * max(abs(grad1), abs(grad2));
  float step = horizontal ? uInvSize.y : uInvSize.x;
  float lAvg = 0.5 * ((first ? l1 : l2) + lM);
  if (first) step = -step;
  vec2 cur = uv; if (horizontal) cur.y += step * 0.5; else cur.x += step * 0.5;
  vec2 off = horizontal ? vec2(uInvSize.x, 0.0) : vec2(0.0, uInvSize.y);
  vec2 a = cur - off, b = cur + off;
  float la = luma(texture(uImage, a).rgb) - lAvg, lb = luma(texture(uImage, b).rgb) - lAvg;
  bool ra = abs(la) >= gradScaled, rb = abs(lb) >= gradScaled;
  for (int i = 0; i < 12 && !(ra && rb); i++) {
    if (!ra) { a -= off; la = luma(texture(uImage, a).rgb) - lAvg; ra = abs(la) >= gradScaled; }
    if (!rb) { b += off; lb = luma(texture(uImage, b).rgb) - lAvg; rb = abs(lb) >= gradScaled; }
  }
  float dA = horizontal ? uv.x - a.x : uv.y - a.y, dB = horizontal ? b.x - uv.x : b.y - uv.y;
  float d = min(dA, dB), len = dA + dB;
  bool towardA = dA < dB;
  bool good = ((towardA ? la : lb) < 0.0) != (lM - lAvg < 0.0);
  float pixelOff = good ? (-d / len + 0.5) : 0.0;
  // sub-pixel: blend by the local contrast of the 3×3 neighbourhood
  float lAvg9 = (2.0 * (lN + lS + lW + lE) + lNW + lNE + lSW + lSE) / 12.0;
  float sub = clamp(abs(lAvg9 - lM) / range, 0.0, 1.0); sub = (-2.0 * sub + 3.0) * sub * sub; sub = sub * sub * 0.75;
  float finalOff = max(pixelOff, sub);
  vec2 fuv = uv; if (horizontal) fuv.y += finalOff * step; else fuv.x += finalOff * step;
  frag = vec4(texture(uImage, fuv).rgb, c.a);
}`;

/** The FXAA fragment source, exported so a test can hold its properties (no tone map, no encode: it reads the ENCODED frame). */
export const AA_SOURCE = FXAA_FRAG;

export interface Antialias {
  /** Read `image` (an sRGB-encoded LDR texture of the given size) and write the anti-aliased result to the bound target. */
  apply(image: WebGLTexture, width: number, height: number): void;
  dispose(): void;
}

export function createAntialias(stage: Stage): Antialias | StageRefusal {
  const program = stage.compile(FS_VERT, FXAA_FRAG);
  if ('kind' in program) return program;
  const { gl } = stage;
  return {
    apply(image, width, height) {
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, image);
      stage.blit(program, (p) => {
        gl.uniform1i(gl.getUniformLocation(p, 'uImage'), 0);
        gl.uniform2f(gl.getUniformLocation(p, 'uInvSize'), 1 / width, 1 / height);
      });
    },
    dispose() { gl.deleteProgram(program); },
  };
}
