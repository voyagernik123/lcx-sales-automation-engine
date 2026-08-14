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
 * scene rather than an annotation on it.
 *
 * ── TWO SENTENCES THAT USED TO FOLLOW, AND WHAT MEASURING THEM FOUND (2026-08-15) ────
 *
 * "These are REFERENCES" and "the only modulation allowed is a fade along the run" were
 * both false, and the second one is why a colour finding went to the wrong file.
 *
 *   · NOT ONLY REFERENCES. `apps/web/src/surfaces/sales/renderMotion.ts` draws every DATA
 *     mark in the S6 figure through this batch — the dwells, the risers, the terminals. It
 *     is the only data primitive that surface has. So a `StrokeStyle.colour` is sometimes
 *     structure and sometimes an encoded value, and the file cannot assume which.
 *   · THE FADE IS NOT THE ONLY MODULATION, and at the shipping call sites it is not a
 *     modulation at all: `fade` is passed at exactly one call site in the repo
 *     (`docs/3d/p1/surface.ts:183`) and at NEITHER `apps/web` one. `gain` is passed at all
 *     of them, ranging 0.5 to 2.5. Whatever this primitive does to a data colour, it does
 *     through `gain`.
 *
 * ── WHAT THIS PRIMITIVE DOES TO A DATA COLOUR, MEASURED ─────────────────────────────
 *
 * `docs/3d/flat-fidelity.mjs` renders a `rule` covering the whole frame through the shaders
 * below on a real driver and reads the bytes back (`docs/3d/flat-fidelity.json`):
 *
 *   · AT GAIN 1 THIS PRIMITIVE IS COLOUR-TRANSPARENT. All seven palette entries land on the
 *     exact byte triple `brand-fidelity.json` records for a mark written straight into the
 *     scene target with no primitive involved — `#2c68dc` for brand blue, `#dc843c` for
 *     reference, and so on for the other five. The shift is the composite's, entirely. The
 *     finding that sent this file its brief said the primitives "break the hex independently
 *     of the tone map"; at unit gain they add nothing to break it with.
 *   · THE TWO NAMED CAUSES ARE ONE SCALAR. `LINES_FRAG`'s only colour statement is
 *     `uColour * uGain * (1 - uFade*t)` — the line the finding cites as `lines.ts:36` — so
 *     at any one pixel the gain and the fade are a single multiply. Measured: `fade 0.55`
 *     sampled where t = 0.50195 and `gain 0.72393` with no fade produce the SAME BYTE on
 *     all seven colours. Reporting them as separate causes would report one number twice.
 *   · AND THE SCALAR HAS A CLIFF. See `STROKE_CLIP_LINEAR` below — this is the part that
 *     matters, and it breaks the invariant that REPLACED brand-hex-exact, not that one.
 */

import type { Mat4 } from '../math.js';
import type { Stage } from '../stage.js';
import type { StageRefusal } from '../stage.js';
import type { Linear } from '../look/colour.js';
import { TONE_SHOULDER } from '../look/tonemap.js';

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

/**
 * THE LARGEST LINEAR VALUE THAT SURVIVES THE COMPOSITE AS A DISTINGUISHABLE BYTE.
 *
 * `lcxToneMap` is `c/(1+c·s)`, so it reaches 1.0 — the most the sRGB encode can put in a
 * byte — at `c = 1/(1-s)` = 1.6667. Above that the channel is PINNED AT 255 and two
 * different linear values are the same pixel.
 *
 * ── WHY THIS IS THE SERIOUS FINDING AND THE HEX SHIFT IS NOT ────────────────────────
 *
 * §6 rule 5's "brand hex exact" was retired on 2026-08-14 and replaced by ORDER SURVIVES:
 * the curve is monotone per channel, so a denser mark never renders lighter than a sparser
 * one. That replacement is what a reader of a chart actually depends on — and `gain` breaks
 * it, which the retired rule's own arithmetic could not have caught.
 *
 * Measured, sweeping each palette entry at multiples of its OWN ceiling
 * (`docs/3d/flat-fidelity.json`, SwiftShader, RGBA16F scene target):
 *
 *     multiple of ceiling   0.25   0.5   0.75   0.9   0.98   1.0   1.02   1.1   1.5   2.0
 *     byte on the pinned channel  161   207    235   248    254   255    255   255   255   255
 *
 * Identical down every one of the seven colours, because `colour[max] · (m · ceiling)` is
 * `1.6667 · m` by construction — which is the formula being exactly right on seven colours
 * rather than a defect in the table. From 1.0× upward the byte does not move again: a
 * stroke at 2× its ceiling and a stroke at 1× render the same, so a reader comparing them
 * is comparing nothing. Order does not merely compress there; it stops.
 *
 * The hue goes with it. Brand blue at 2× ceiling lands `#51abff`, **ΔE76 48.9** from
 * `#2C6BFF` — past the 41.1 of the view transform `look/colour.ts` calls "the fashionable
 * default, and badly wrong" in its own table. The composite alone costs 18.3, so the scalar
 * does more damage than the whole tone curve.
 *
 * (That transform is named in `look/colour.ts` and deliberately not here.
 * `look/look.test.ts:122` asserts the token appears in no shader in this package, and it
 * greps the WHOLE of `points.ts` and `lines.ts` rather than their fragment strings — so
 * writing the name in prose fails a test about GLSL. Reported rather than worked around
 * silently, because the next person to document the comparison will hit it too.)
 *
 * ── WHAT SHIPS ABOVE IT ─────────────────────────────────────────────────────────────
 *
 * `brand`, `brandBright` and `reference` all have a linear-1.0 channel, so their ceiling is
 * 1.6667 — and three shipped call sites drive past it:
 * `apps/web/src/surfaces/sales/renderMotion.ts:100` reaches gain 2.54 on the stall mix
 * (1.69× that colour's ceiling), `:108` uses 2.0 on a `brandBright` terminal (1.20×), and
 * `docs/3d/p1/surface.ts:185` uses 2.2 on `reference` (1.32×).
 *
 * The S6 stall ramp is the one that costs a reader something. Its gain is DATA — it rises
 * with `stallT` — and the figure's whole claim is that a longer stall reads warmer and
 * brighter. Solving `max(mix(FAST,STALL,s)) · gain(s) = 1.6667` against that call site: a
 * CLOSED dwell pins its red channel above `stallT` 0.895, and an OPEN one above 0.672. The
 * top third of the ramp on the bar the file itself calls "the only bar the reader can still
 * do something about" is flat.
 *
 * Those are not this file's to change — they are named so the arithmetic has somewhere to
 * land. What this file owes them is the number, derived from the live shoulder rather than
 * written out, so it cannot drift when the shoulder moves.
 */
export const STROKE_CLIP_LINEAR = 1 / (1 - TONE_SHOULDER);

/**
 * A stroke's brightest linear channel as a multiple of `STROKE_CLIP_LINEAR`.
 *
 * `≤ 1` — every channel survives the composite as a byte that still moves with the data.
 * `> 1` — at least one channel is pinned at 255 and no longer encodes anything.
 *
 * `fade` is ignored deliberately: it only ever multiplies by `1 - fade·t` with `t` in [0,1]
 * and `fade` documented as 0–1, so it can only make a stroke dimmer. The worst case over the
 * whole run is at `t = 0`, which is `gain` alone.
 */
export function strokeClipRatio(s: StrokeStyle): number {
  return (Math.max(s.colour[0], s.colour[1], s.colour[2]) * s.gain) / STROKE_CLIP_LINEAR;
}

export interface StrokeStyle {
  /**
   * The mark's colour in LINEAR light. Sometimes structure, sometimes an encoded data value
   * — see the header. Nothing here grades it; the composite does, by 12-18 ΔE76 depending
   * on the entry, and `docs/3d/flat-fidelity.json` carries the figure for each.
   */
  readonly colour: Linear;
  /**
   * Scalar exposure on `colour`. NOT free: `colour[brightest] · gain` above
   * `STROKE_CLIP_LINEAR` pins that channel at 255 and the mark stops encoding. Check with
   * `strokeClipRatio` before choosing a gain from data — a gain that varies with a value is
   * an encoding channel, and an encoding channel that saturates is a broken axis.
   */
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
      /* THE PROGRAM TOO. `stage.dispose()` also deletes it — deleting twice is a documented no-op —
         but a caller that creates and drops batches without tearing the stage down was accumulating
         one program plus its two shaders per cycle, and "the stage will get it eventually" is not a
         lifetime for something a single surface can churn. */
      gl.deleteProgram(program);
    },
  };
}
