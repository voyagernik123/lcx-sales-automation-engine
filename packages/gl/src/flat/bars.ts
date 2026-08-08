/**
 * L4 · FLAT — bars, on the same pipeline the 3-D surfaces use.
 *
 * `PLATFORM_VFX_100X.md`'s thesis in one primitive: **a chart with no third data axis still
 * gets linear light, HDR accumulation, real edge falloff and a contact shadow.** None of
 * that needs a z axis, and it is the whole difference between "instrument" and "coloured
 * rectangle".
 *
 * W0 looked at all 13 existing primitives and found them COMPETENT — correct markers, real
 * confidence intervals, honest conversion percentages, legible type. They are not broken and
 * this layer must not rewrite them. What they have is a flat fill and nothing else: no
 * material, no light, no depth. This adds exactly that and changes no number.
 *
 * ── WHY ORTHOGRAPHIC, AND WHY THAT IS NOT A COMPROMISE ──────────────────────────────
 * A bar chart has no depth to read, so perspective would add foreshortening that means
 * nothing and makes equal bars unequal. The projection is orthographic and the "depth" here
 * is entirely LIGHTING — a gradient down the bar, a bright top edge, a shadow on the plate.
 * That is how a physical instrument looks, and it is honest because none of it encodes data.
 *
 * ── WHAT IS DATA AND WHAT IS LIGHT ──────────────────────────────────────────────────
 * The bar's COLOUR is data and is never tone mapped (`look/tonemap.ts`). The gradient, the
 * edge and the shadow are LIGHT and are shaped by the composite. A reader can still match a
 * bar to its legend swatch exactly, because the hue is untouched — only the illumination
 * across it varies.
 */

import type { Mat4 } from '../math.js';
import type { Stage } from '../stage.js';
import { stageRefusal, type StageRefusal } from '../stage.js';
import type { Linear } from '../look/colour.js';

export interface BarDatum {
  /** Plot-space rectangle. x to the right, y up, both in world units. */
  readonly x0: number; readonly x1: number;
  readonly y0: number; readonly y1: number;
  readonly colour: Linear;
}

export interface BarStyle {
  /**
   * How far the fill darkens from the lit edge to the far edge, 0–1. This is the single
   * knob that turns a flat rectangle into a surface. 0 reproduces the SVG exactly, which is
   * useful as a control.
   */
  readonly modelling?: number;
  /** Brightness of the lit edge, in stops above the fill. */
  readonly edgeStops?: number;
  /** Contact shadow opacity at the base. 0 disables it. */
  readonly contact?: number;
  /** Corner radius in world units. */
  readonly radius?: number;
  /** Vertical bars light from the top; horizontal bars light from the left. */
  readonly orientation?: 'vertical' | 'horizontal';
}

export const BARS_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 quad;          // unit quad, 0..1
layout(location=1) in vec4 rect;          // x0,y0,x1,y1
layout(location=2) in vec3 tint;
uniform mat4 uMVP;
out vec2 vUV;
out vec3 vTint;
out vec2 vSize;
void main(){
  vUV = quad;
  vTint = tint;
  vSize = vec2(rect.z - rect.x, rect.w - rect.y);
  vec2 p = mix(rect.xy, rect.zw, quad);
  gl_Position = uMVP * vec4(p, 0.0, 1.0);
}`;

/**
 * The fragment stage is where the grade actually happens.
 *
 * `uModelling` shades ACROSS the bar so it reads as a surface catching light rather than a
 * filled region. `uEdge` puts a brighter line on the lit side — the single strongest cue
 * that an object has a top face. `uRadius` and the analytic AA below remove the hard 1-pixel
 * corner that makes SVG bars look printed rather than rendered.
 *
 * ANALYTIC ANTI-ALIASING, not MSAA: the exact distance to the rounded-rectangle boundary is
 * known here, so `fwidth` gives a one-pixel feather that is correct at any zoom and costs
 * nothing. MSAA would cost 4× the fill rate for a worse edge on a shape we can solve.
 */
export const BARS_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
in vec3 vTint;
in vec2 vSize;
uniform float uModelling, uEdge, uRadius, uHorizontal;
out vec4 frag;

/** Signed distance to a rounded rectangle centred at the origin. */
float sdRoundRect(vec2 p, vec2 half_, float r){
  vec2 q = abs(p) - half_ + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

void main(){
  vec2 half_ = vSize * 0.5;
  vec2 p = (vUV - 0.5) * vSize;
  float r = min(uRadius, min(half_.x, half_.y));
  float d = sdRoundRect(p, half_, r);
  // One-pixel feather from the exact boundary. Correct at any zoom.
  float aa = fwidth(d);
  float mask = 1.0 - smoothstep(-aa, aa, d);
  if (mask <= 0.001) discard;

  // MODELLING: 0 at the lit edge, 1 at the far edge. Vertical bars are lit from the top,
  // horizontal bars from the left — the direction a reader's eye already assumes.
  float t = uHorizontal > 0.5 ? vUV.x : (1.0 - vUV.y);
  float shade = 1.0 - uModelling * t * t;

  // THE LIT EDGE. A thin band on the near side, in world units so it does not thicken
  // when the chart grows.
  float edgeT = uHorizontal > 0.5 ? vUV.x : (1.0 - vUV.y);
  float edge = smoothstep(0.10, 0.0, edgeT) * uEdge;

  // The tint is DATA and its ratios are untouched: shade and edge are scalars applied to
  // all three channels equally, so the hue cannot move.
  vec3 lit = vTint * shade + vTint * edge;
  frag = vec4(lit * mask, mask);
}`;

/** A soft shadow cast onto the plate directly beneath each bar. */
export const CONTACT_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 quad;
layout(location=1) in vec4 rect;
uniform mat4 uMVP; uniform float uDrop, uSpread, uHorizontal;
out vec2 vUV;
void main(){
  vUV = quad;
  vec2 lo, hi;
  if (uHorizontal > 0.5) {
    // Horizontal bars sit ON the plate; the shadow falls below the whole run.
    lo = vec2(rect.x, rect.y - uDrop - uSpread);
    hi = vec2(rect.z + uSpread * 0.5, rect.y + uSpread * 0.25);
  } else {
    lo = vec2(rect.x - uSpread, rect.y - uDrop - uSpread);
    hi = vec2(rect.z + uSpread, rect.y + uSpread * 0.25);
  }
  gl_Position = uMVP * vec4(mix(lo, hi, quad), 0.0, 1.0);
}`;

export const CONTACT_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
uniform vec3 uColour; uniform float uStrength;
out vec4 frag;
void main(){
  // Softest at the top and the edges, densest where the bar meets the plate — which is
  // where a real contact shadow is densest, and the reason it reads as contact at all.
  vec2 c = (vUV - vec2(0.5, 1.0));
  float f = exp(-dot(c * vec2(2.4, 1.6), c * vec2(2.4, 1.6)) * 3.2);
  frag = vec4(uColour * f * uStrength, f * uStrength);
}`;

export interface BarBatch {
  draw(mvp: Mat4, bars: readonly BarDatum[], style?: BarStyle): void;
  dispose(): void;
}

export function createBarBatch(stage: Stage): BarBatch | StageRefusal {
  const { gl } = stage;
  const barsP = stage.compile(BARS_VERT, BARS_FRAG);
  if ('kind' in barsP) return barsP;
  const contactP = stage.compile(CONTACT_VERT, CONTACT_FRAG);
  if ('kind' in contactP) return contactP;

  /* OWN VAO — see `stage.ts`. A pass that binds into another's VAO renders a black frame
     with no error, which cost P0 an entire iteration. */
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const quadBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const rectBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, rectBuf);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(1, 1);
  const tintBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, tintBuf);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(2, 1);
  gl.bindVertexArray(null);

  const u = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);

  return {
    draw(mvp, bars, style = {}) {
      if (bars.length === 0) return;
      const horizontal = (style.orientation ?? 'vertical') === 'horizontal';
      const rects = new Float32Array(bars.length * 4);
      const tints = new Float32Array(bars.length * 3);
      bars.forEach((b, i) => {
        rects[i * 4] = b.x0; rects[i * 4 + 1] = b.y0;
        rects[i * 4 + 2] = b.x1; rects[i * 4 + 3] = b.y1;
        tints[i * 3] = b.colour[0]; tints[i * 3 + 1] = b.colour[1]; tints[i * 3 + 2] = b.colour[2];
      });
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, rectBuf);
      gl.bufferData(gl.ARRAY_BUFFER, rects, gl.STREAM_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, tintBuf);
      gl.bufferData(gl.ARRAY_BUFFER, tints, gl.STREAM_DRAW);

      const contact = style.contact ?? 0.55;
      if (contact > 0) {
        // Shadow FIRST, so the bar lands on top of it rather than through it.
        gl.useProgram(contactP);
        gl.uniformMatrix4fv(u(contactP, 'uMVP'), false, mvp);
        gl.uniform1f(u(contactP, 'uDrop'), 0.004);
        gl.uniform1f(u(contactP, 'uSpread'), 0.030);
        gl.uniform1f(u(contactP, 'uHorizontal'), horizontal ? 1 : 0);
        gl.uniform3f(u(contactP, 'uColour'), 0.02, 0.03, 0.06);
        gl.uniform1f(u(contactP, 'uStrength'), contact);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, bars.length);
      }

      gl.useProgram(barsP);
      gl.uniformMatrix4fv(u(barsP, 'uMVP'), false, mvp);
      gl.uniform1f(u(barsP, 'uModelling'), style.modelling ?? 0.34);
      gl.uniform1f(u(barsP, 'uEdge'), Math.pow(2, style.edgeStops ?? -1.4) - 0.5);
      gl.uniform1f(u(barsP, 'uRadius'), style.radius ?? 0.012);
      gl.uniform1f(u(barsP, 'uHorizontal'), horizontal ? 1 : 0);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, bars.length);
      gl.bindVertexArray(null);
    },
    dispose() {
      gl.deleteBuffer(quadBuf); gl.deleteBuffer(rectBuf); gl.deleteBuffer(tintBuf);
      gl.deleteVertexArray(vao);
    },
  };
}

/** Orthographic plot transform: data space → clip. No perspective, deliberately. */
export function plotMatrix(x0: number, x1: number, y0: number, y1: number): Mat4 {
  const sx = 2 / (x1 - x0), sy = 2 / (y1 - y0);
  return new Float32Array([
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, 1, 0,
    -1 - x0 * sx, -1 - y0 * sy, 0, 1,
  ]);
}

export function barRefusal(detail: string): StageRefusal {
  return stageRefusal('FRAMEBUFFER_INCOMPLETE', detail);
}
