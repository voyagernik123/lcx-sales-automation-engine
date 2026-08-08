/**
 * L1 · LINES — axes, rules, ticks, reference marks, envelope curves.
 *
 * NOT `gl.LINES`. `lineWidth` above 1.0 is unsupported on every major driver, so a
 * "2px rule" silently renders 1px on the reader's machine and 2px on yours. Every line
 * here is a triangle strip of quads with an explicit half-width in WORLD units, which
 * also means a rule keeps its thickness relationship to the geometry it belongs to
 * rather than to the viewport.
 *
 * These are REFERENCES, and references are emissive — no shading, no lighting model.
 * Shading a reference is a lie about depth: it implies the axis is an object in the
 * scene rather than an annotation on it. The only modulation allowed is a fade along
 * the run, which exists so a reference does not compete with the data it refers to.
 */

import type { Mat4 } from '../math.js';
import type { Stage } from '../stage.js';
import type { StageRefusal } from '../stage.js';
import type { Linear } from '../look/colour.js';

export const LINES_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 p;
uniform mat4 uMVP;
out float vY;
void main(){ vY = p.y; gl_Position = uMVP * vec4(p, 1.0); }`;

export const LINES_FRAG = `#version 300 es
precision highp float;
in float vY;
uniform vec3 uColour;
uniform float uGain, uFade, uFadeFrom, uFadeTo;
out vec4 frag;
void main(){
  float t = clamp((vY - uFadeFrom) / max(uFadeTo - uFadeFrom, 1e-4), 0.0, 1.0);
  frag = vec4(uColour * uGain * (1.0 - uFade * t), 1.0);
}`;

export interface StrokeStyle {
  readonly colour: Linear;
  readonly gain: number;
  /** Fraction of brightness lost across the run, 0–1. A reference that fades recedes. */
  readonly fade?: number;
  /** World-y bounds the fade runs between. Defaults to no fade. */
  readonly fadeFrom?: number;
  readonly fadeTo?: number;
}

export interface LineBatch {
  /** A stroke from (x0,y0) to (x1,y1) at z = 0, given a half-width. */
  rule(mvp: Mat4, x0: number, y0: number, x1: number, y1: number, halfWidth: number, s: StrokeStyle): void;
  /**
   * The same stroke at an arbitrary DEPTH.
   *
   * SPINE REQUEST from the S6 lane (`apps/web/src/surfaces/sales/`), which draws one path
   * per deal at a depth set by that deal's value — so every stroke it needs is off the
   * z = 0 plane that `rule` is pinned to.
   *
   * Both endpoints share a single `z` and that is deliberate rather than a shortcut: the
   * extrusion is perpendicular in the XY plane, which is exact for a segment lying in a
   * constant-depth plane and WRONG for one that slants through depth. A general 3-D stroke
   * needs a billboard normal per vertex, which is a bigger change and a different
   * primitive. Naming the limitation in the signature is better than shipping something
   * that looks general and is quietly incorrect at some angles.
   */
  ruleAtDepth(
    mvp: Mat4, x0: number, y0: number, x1: number, y1: number, z: number,
    halfWidth: number, s: StrokeStyle,
  ): void;
  /**
   * A polyline through `points` (flat xy pairs), extruded vertically by `halfWidth`.
   * Vertical extrusion is correct for a function-of-x curve — the case this exists for —
   * and is deliberately NOT a general mitred stroke: a mitre join needs a normal, and a
   * normal on a curve that doubles back is ambiguous. A surface that needs a stroke
   * along an arbitrary path files a spine request; it does not approximate one here.
   */
  curve(mvp: Mat4, points: Float32Array, halfWidth: number, s: StrokeStyle): void;
  dispose(): void;
}

export function createLineBatch(stage: Stage): LineBatch | StageRefusal {
  const { gl } = stage;
  const program = stage.compile(LINES_VERT, LINES_FRAG);
  if ('kind' in program) return program;

  /* OWN VAO — see the note in `stage.ts`. Binding geometry into a VAO another pass uses
     is how P0 pass 2 produced a solid black frame with no error. */
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const u = (n: string) => gl.getUniformLocation(program, n);
  const loc = {
    mvp: u('uMVP'), colour: u('uColour'), gain: u('uGain'),
    fade: u('uFade'), fadeFrom: u('uFadeFrom'), fadeTo: u('uFadeTo'),
  };

  const emit = (mvp: Mat4, verts: Float32Array, s: StrokeStyle) => {
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW);
    gl.uniformMatrix4fv(loc.mvp, false, mvp);
    gl.uniform3fv(loc.colour, s.colour as unknown as number[]);
    gl.uniform1f(loc.gain, s.gain);
    gl.uniform1f(loc.fade, s.fade ?? 0);
    gl.uniform1f(loc.fadeFrom, s.fadeFrom ?? 0);
    gl.uniform1f(loc.fadeTo, s.fadeTo ?? 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, verts.length / 3);
    gl.bindVertexArray(null);
  };

  const strokeAt = (
    mvp: Mat4, x0: number, y0: number, x1: number, y1: number, z: number,
    halfWidth: number, s: StrokeStyle,
  ) => {
    // Perpendicular in the xy plane, so a rule keeps its width at any angle.
    const dx = x1 - x0, dy = y1 - y0;
    const l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * halfWidth, ny = (dx / l) * halfWidth;
    emit(mvp, new Float32Array([
      x0 - nx, y0 - ny, z, x0 + nx, y0 + ny, z,
      x1 - nx, y1 - ny, z, x1 + nx, y1 + ny, z,
    ]), s);
  };

  return {
    rule(mvp, x0, y0, x1, y1, halfWidth, s) {
      strokeAt(mvp, x0, y0, x1, y1, 0, halfWidth, s);
    },

    ruleAtDepth(mvp, x0, y0, x1, y1, z, halfWidth, s) {
      strokeAt(mvp, x0, y0, x1, y1, z, halfWidth, s);
    },

    curve(mvp, points, halfWidth, s) {
      const n = points.length / 2;
      const v = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) {
        const x = points[i * 2]!, y = points[i * 2 + 1]!;
        v[i * 6 + 0] = x; v[i * 6 + 1] = y - halfWidth; v[i * 6 + 2] = 0;
        v[i * 6 + 3] = x; v[i * 6 + 4] = y + halfWidth; v[i * 6 + 5] = 0;
      }
      emit(mvp, v, s);
    },

    dispose() {
      gl.deleteBuffer(buf);
      gl.deleteVertexArray(vao);
    },
  };
}
