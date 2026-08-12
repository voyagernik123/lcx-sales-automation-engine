/**
 * L4 · FLAT — polylines, areas and arcs, on the same pipeline as the bars.
 *
 * The three primitives the remaining chart kit needs:
 *   `polyline` — Sparkline, ControlBand's centre line, the actual overlay
 *   `area`     — Sparkline's fill, ControlBand's envelope
 *   `arc`      — DonutChart, GaugeChart
 *
 * Same rules as `bars.ts`: colour is DATA and is never tone mapped; the gradient, the lit
 * edge and the softness are LIGHT. Everything is expanded on the CPU into triangles because
 * these shapes are tens of vertices, not thousands — a geometry shader would be a worse
 * trade at this size and WebGL2 does not have one anyway.
 */

import type { Mat4 } from '../math.js';
import type { Stage } from '../stage.js';
import type { StageRefusal } from '../stage.js';
import type { Linear } from '../look/colour.js';

export interface StrokeStyleFlat {
  readonly colour: Linear;
  /** Half-width in world units. */
  readonly halfWidth?: number;
  readonly gain?: number;
  /** 0 = flat fill, 1 = strong cross-stroke modelling. */
  readonly modelling?: number;
  /** Fade the fill toward the far edge, for areas under a line. */
  readonly fade?: number;
}

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 pos;
layout(location=1) in float across;   // -1..1 across the ribbon, or 0..1 down an area
uniform mat4 uMVP;
out float vAcross;
void main(){ vAcross = across; gl_Position = uMVP * vec4(pos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
in float vAcross;
uniform vec3 uColour;
uniform float uGain, uModelling, uFade, uSoft;
out vec4 frag;
void main(){
  /* SOFTNESS ACROSS THE RIBBON. across runs -1..1, so its absolute value is the distance to the
     edge and a smoothstep against it is a feather that costs one instruction and needs no
     multisampling. At uSoft = 0 this is a hard edge, which is what an area fill wants. */
  float edge = uSoft > 0.0 ? smoothstep(1.0, 1.0 - uSoft, abs(vAcross)) : 1.0;
  // Modelling runs across the stroke: brightest at the centre line, like a lit cylinder.
  float shade = 1.0 - uModelling * vAcross * vAcross;
  // Fade runs DOWN an area, so its far edge dissolves into the plate instead of ending
  // on a hard horizontal that reads as a second data line.
  float fade = 1.0 - uFade * clamp(vAcross, 0.0, 1.0);
  float a = edge * fade;
  frag = vec4(uColour * uGain * shade * a, a);
}`;

export interface StrokeBatch {
  /** A polyline through flat xy pairs, expanded to a ribbon with mitred joins. */
  polyline(mvp: Mat4, points: Float32Array, s: StrokeStyleFlat): void;
  /** The region between a polyline and a baseline. */
  area(mvp: Mat4, points: Float32Array, baselineY: number, s: StrokeStyleFlat): void;
  /** A ring segment: centre, radii, angles in radians (0 = 12 o'clock, clockwise). */
  arc(
    mvp: Mat4,
    cx: number, cy: number, rInner: number, rOuter: number,
    a0: number, a1: number, s: StrokeStyleFlat,
  ): void;
  dispose(): void;
}

export function createStrokeBatch(stage: Stage): StrokeBatch | StageRefusal {
  const { gl } = stage;
  const program = stage.compile(VERT, FRAG);
  if ('kind' in program) return program;

  /* OWN VAO — binding into another pass's VAO renders a black frame with no error. */
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const posBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
  gl.bindVertexArray(null);

  const u = (n: string) => gl.getUniformLocation(program, n);

  const emit = (mvp: Mat4, verts: Float32Array, s: StrokeStyleFlat, soft: number) => {
    if (verts.length < 9) return;
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW);
    gl.uniformMatrix4fv(u('uMVP'), false, mvp);
    gl.uniform3fv(u('uColour'), s.colour as unknown as number[]);
    gl.uniform1f(u('uGain'), s.gain ?? 1);
    gl.uniform1f(u('uModelling'), s.modelling ?? 0);
    gl.uniform1f(u('uFade'), s.fade ?? 0);
    gl.uniform1f(u('uSoft'), soft);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, verts.length / 3);
    gl.bindVertexArray(null);
  };

  return {
    polyline(mvp, points, s) {
      const n = points.length / 2;
      if (n < 2) return;
      const hw = s.halfWidth ?? 0.01;
      const v = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) {
        const px = points[i * 2]!, py = points[i * 2 + 1]!;
        /* MITRED NORMAL: the average of the two adjacent segment normals. Using only the
           next segment's normal makes the outside of a sharp corner pinch and the inside
           overlap — the classic polyline artefact, and very visible on a sparkline where
           every vertex is a corner. */
        const ax = i > 0 ? px - points[(i - 1) * 2]! : points[2]! - points[0]!;
        const ay = i > 0 ? py - points[(i - 1) * 2 + 1]! : points[3]! - points[1]!;
        const bx = i < n - 1 ? points[(i + 1) * 2]! - px : ax;
        const by = i < n - 1 ? points[(i + 1) * 2 + 1]! - py : ay;
        const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
        let nx = -(ay / la + by / lb), ny = ax / la + bx / lb;
        const l = Math.hypot(nx, ny) || 1;
        nx /= l; ny /= l;
        v[i * 6] = px + nx * hw; v[i * 6 + 1] = py + ny * hw; v[i * 6 + 2] = 1;
        v[i * 6 + 3] = px - nx * hw; v[i * 6 + 4] = py - ny * hw; v[i * 6 + 5] = -1;
      }
      emit(mvp, v, s, 1);
    },

    area(mvp, points, baselineY, s) {
      const n = points.length / 2;
      if (n < 2) return;
      const v = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) {
        const px = points[i * 2]!, py = points[i * 2 + 1]!;
        v[i * 6] = px; v[i * 6 + 1] = py; v[i * 6 + 2] = 0;          // top: full strength
        v[i * 6 + 3] = px; v[i * 6 + 4] = baselineY; v[i * 6 + 5] = 1; // baseline: faded
      }
      // soft = 0: an area has a real top edge (the data line), not a feathered one.
      emit(mvp, v, s, 0);
    },

    arc(mvp, cx, cy, rInner, rOuter, a0, a1, s) {
      /* Segment count from the ARC LENGTH, not a constant. A fixed 64 makes a small gauge
         wasteful and a large donut visibly polygonal — the tell that says "drawn by code". */
      const sweep = Math.abs(a1 - a0);
      const segs = Math.max(6, Math.ceil((sweep / (Math.PI * 2)) * 128 * Math.max(0.35, rOuter)));
      const v = new Float32Array((segs + 1) * 6);
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        // 0 rad = 12 o'clock, increasing clockwise — the convention a reader expects of a
        // dial, and the one the SVG kit already uses.
        const ang = a0 + (a1 - a0) * t - Math.PI / 2;
        const c = Math.cos(ang), sn = Math.sin(ang);
        v[i * 6] = cx + c * rOuter; v[i * 6 + 1] = cy + sn * rOuter; v[i * 6 + 2] = 1;
        v[i * 6 + 3] = cx + c * rInner; v[i * 6 + 4] = cy + sn * rInner; v[i * 6 + 5] = -1;
      }
      emit(mvp, v, s, 0.9);
    },

    dispose() {
      gl.deleteBuffer(posBuf);
      gl.deleteVertexArray(vao);
      /* See lines.ts: the program is this object's, so its lifetime is this object's. */
      gl.deleteProgram(program);
    },
  };
}
