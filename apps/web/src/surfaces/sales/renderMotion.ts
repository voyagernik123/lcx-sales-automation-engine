/**
 * S6 · the draw. Written to the L4 contract (`3D_WORK_100X.md` §3): it imports from
 * `@lcx/gl` and from nowhere else, touches no `WebGL*` symbol, and makes no colour
 * decision the palette has not already made.
 *
 * The reference lane is `docs/3d/p1/surface.ts`.
 */

import {
  createStage, isStage, createLineBatch, createPipeline,
  beginAdditive, endPass, perspective, lookAt, multiply, projectScreen,
  BRAND, BRAND_HEX, exposure, mixLinear, hexToLinear,
  type Mat4, type StageRefusal, type Linear,
} from '@lcx/gl';
import { X0, X1, Y0, Y1, isMotionGeometry, type MotionOutcome, type MotionGeometry } from './motionGeometry';

export interface MotionRender {
  readonly kind: 'rendered';
  readonly hdr: boolean;
  readonly drawn: number;
  readonly redraw: () => void;
  readonly dispose: () => void;
}

export type MotionRenderOutcome = MotionRender | StageRefusal;

/** Screen-space label the caller positions in the DOM overlay. */
export interface MotionLabel {
  readonly sx: number;
  readonly sy: number;
  readonly text: string;
  readonly kind: 'stage' | 'time' | 'terminal';
}

export function renderMotion(
  canvas: HTMLCanvasElement,
  outcome: MotionOutcome,
  onLabels: (labels: MotionLabel[]) => void,
): MotionRenderOutcome {
  if (!isMotionGeometry(outcome)) {
    // The geometry layer already decided there is nothing honest to draw. Re-deciding it
    // here would put the judgement in two places.
    return { kind: 'refused', code: 'NO_WEBGL2', reason: outcome.reason };
  }
  const stage = createStage(canvas);
  if (!isStage(stage)) return stage;
  const lines = createLineBatch(stage);
  if ('kind' in lines) return lines;
  const pipeline = createPipeline(stage);
  if ('kind' in pipeline) return pipeline;

  const g: MotionGeometry = outcome;
  const { gl } = stage;

  /* Eye ON AXIS in x — `packages/gl/src/math.ts` records why: a lateral offset tilts every
     horizontal in screen space, and this figure is read against horizontal stage rules. */
  const mvp: Mat4 = multiply(
    perspective(0.235, stage.width / stage.height, 0.1, 60),
    lookAt([0, 0.42, 6.6], [0, 0.10, 0], [0, 1, 0]),
  );

  const rule = hexToLinear(BRAND_HEX.rule);
  /* Fast → brand blue. Stalled → the REFERENCE hue, which the palette reserves for marks
     that are not data values. A stall is a reading about the deal's motion rather than a
     value on any axis, so it borrows that hue deliberately. */
  const FAST: Linear = exposure(BRAND.brandBright, -0.35);
  const STALL: Linear = exposure(BRAND.reference, 0.15);
  const RISER: Linear = exposure(BRAND.brand, -0.6);

  const frame = () => {
    stage.bindTarget(stage.scene);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    beginAdditive(gl);

    // Stage rules: one horizontal hairline per rung, at the back of the box so the deal
    // paths read in front of them.
    for (const t of g.stageTicks) {
      if (t.rule) lines.rule(mvp, X0, t.y, X1, t.y, 0.0016, { colour: rule, gain: 1 });
    }

    /* THE RISERS FIRST, thin and cool: they are the moves, and a move is an instant. They
       are drawn under the dwells so a long stall reads over the step that ended it. */
    for (const r of g.risers) {
      lines.ruleAtDepth(mvp, r.x, r.y0, r.x, r.y1, r.z, 0.0022, { colour: RISER, gain: 0.5 });
    }

    /* THE DWELLS. Horizontal, at the stage the deal was sitting in, and their LENGTH is the
       time it sat there — which is the whole figure. Depth is value, so a long bar far back
       is an expensive deal that stopped, the comparison a Kanban cannot make at all.

       Thicker AND warmer with the stall, because colour alone would fail a reader who
       cannot separate blue from amber and this figure's entire claim rides on that
       distinction. An OPEN dwell — still running, ending at the observation time rather
       than at a recorded move — is drawn brightest: it is the only bar the reader can still
       do something about. */
    for (const s of g.dwells) {
      const colour = mixLinear(FAST, STALL, s.stallT);
      const w = 0.0032 + 0.0090 * s.stallT;
      const gain = (0.80 + 0.95 * s.stallT) * (s.open ? 1.45 : 1);
      lines.ruleAtDepth(mvp, s.ax, s.ay, s.bx, s.by, s.z, w, { colour, gain });
    }

    for (const t of g.terminals) {
      const colour = t.outcome === 'won' ? BRAND.brandBright
        : t.outcome === 'lost' ? hexToLinear(BRAND_HEX.refusal)
        : BRAND.brand;
      const gain = t.outcome === 'open' ? 1.1 : 2.0;
      lines.ruleAtDepth(mvp, t.x - 0.012, t.y, t.x + 0.012, t.y, t.z, 0.010, { colour, gain });
    }

    /* A single-transition deal has a position but no measured velocity. It is a mark, not
       a segment — a flat segment would read as a stall nobody measured. */
    for (const p of g.pointsOnly) {
      lines.ruleAtDepth(mvp, p.x - 0.006, p.y, p.x + 0.006, p.y, p.z, 0.006,
        { colour: hexToLinear(BRAND_HEX.refusal), gain: 1.2 });
    }
    endPass(gl);

    pipeline.resolve({ plate: hexToLinear(BRAND_HEX.plate) });
  };

  frame();

  /* Type is DOM, projected through the same matrix. */
  const labels: MotionLabel[] = [];
  for (const t of g.stageTicks) {
    // z = 0, the mid plane. At the front face (z = ZR) the top rung projected above the
    // canvas and its label was clipped away entirely.
    const p = projectScreen(mvp, [X0, t.y, 0], stage.cssWidth, stage.cssHeight);
    labels.push({ sx: p.sx, sy: p.sy, text: t.label, kind: 'stage' });
  }
  /* Time ticks: five, not two. Two endpoints tell the reader the span and nothing about
     WHERE in it a bar sits, and the length of a bar is only meaningful against a scale. */
  const fmt = (ms: number) =>
    new Date(ms).toLocaleDateString([], { month: 'short', year: '2-digit' });
  const TIME_TICKS = 5;
  for (let i = 0; i < TIME_TICKS; i++) {
    const u = i / (TIME_TICKS - 1);
    const ms = g.window.from + u * (g.window.to - g.window.from);
    const p = projectScreen(mvp, [X0 + u * (X1 - X0), Y0, 0], stage.cssWidth, stage.cssHeight);
    labels.push({ sx: p.sx, sy: p.sy, text: fmt(ms), kind: 'time' });
  }
  onLabels(labels);

  return {
    kind: 'rendered',
    hdr: stage.hdr,
    drawn: g.drawnDeals,
    redraw: frame,
    dispose: () => { lines.dispose(); stage.dispose(); },
  };
}

export { Y1 };
