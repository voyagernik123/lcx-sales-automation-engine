import { describe, expect, it } from 'vitest';
import {
  IDENTITY, multiply, perspective, orthographic, lookAt,
  projectNdc, projectScreen, worldPerNdcY, normalise, cross, dot,
} from './math.js';

/**
 * The GL binding layer cannot be unit tested without a context, so the ARITHMETIC is
 * separated from it — and the arithmetic is where projection bugs actually live. Every
 * defect this file pins came out of the P0 capture, not out of imagination.
 */

describe('matrices', () => {
  it('identity is the multiplicative identity in both orders', () => {
    const m = perspective(0.4, 1.6, 0.1, 50);
    expect([...multiply(m, IDENTITY())]).toEqual([...m]);
    expect([...multiply(IDENTITY(), m)]).toEqual([...m]);
  });

  it('is column-major, so no call site ever passes transpose=true', () => {
    // A transpose flag is a place for two mistakes to cancel in one view and not
    // another. The layout is pinned here so the convention cannot drift.
    const v = lookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);
    // Translation lives in elements 12..14 for column-major.
    expect(v[12]).toBeCloseTo(0, 12);
    expect(v[13]).toBeCloseTo(0, 12);
    expect(v[14]).toBeCloseTo(-5, 12);
  });
});

describe('lookAt survives the degenerate cases instead of emitting NaN', () => {
  it('eye at target returns identity, not a matrix of NaN', () => {
    const m = lookAt([1, 2, 3], [1, 2, 3], [0, 1, 0]);
    expect([...m].every(Number.isFinite)).toBe(true);
    expect([...m]).toEqual([...IDENTITY()]);
  });

  it('up parallel to the view direction returns identity too', () => {
    // Looking straight down with up = +y. cross(up, z) is zero and the basis collapses.
    const m = lookAt([0, 5, 0], [0, 0, 0], [0, 1, 0]);
    expect([...m].every(Number.isFinite)).toBe(true);
  });

  it('WHY IT MATTERS: NaN projects to a blank canvas with no error at all', () => {
    // The failure mode being prevented. A single NaN in the matrix makes every
    // gl_Position NaN, every primitive is culled, and the frame is empty — with no
    // exception thrown and no console output. Identity at least renders something a
    // human recognises as wrong.
    const good = lookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);
    const p = projectNdc(multiply(perspective(0.4, 1, 0.1, 50), good), [0, 0, 0]);
    expect(Number.isNaN(p.x)).toBe(false);
  });

  it('normalise returns a zero vector unchanged rather than dividing by zero', () => {
    expect(normalise([0, 0, 0])).toEqual([0, 0, 0]);
    const n = normalise([3, 0, 4]);
    expect(Math.hypot(...n)).toBeCloseTo(1, 12);
  });

  it('the basis lookAt builds is orthonormal and right-handed', () => {
    const eye: [number, number, number] = [1.5, 2.5, 6];
    const m = lookAt(eye, [0, 0.2, 0], [0, 1, 0]);
    const x: [number, number, number] = [m[0]!, m[4]!, m[8]!];
    const y: [number, number, number] = [m[1]!, m[5]!, m[9]!];
    const z: [number, number, number] = [m[2]!, m[6]!, m[10]!];
    for (const v of [x, y, z]) expect(Math.hypot(...v)).toBeCloseTo(1, 6);
    expect(dot(x, y)).toBeCloseTo(0, 6);
    expect(dot(y, z)).toBeCloseTo(0, 6);
    const xy = cross(x, y);
    expect(dot(xy, z)).toBeCloseTo(1, 6);
  });
});

describe('the eye stays on axis, and this is why', () => {
  const mvp = (eyeX: number) =>
    multiply(perspective(0.205, 1600 / 740, 0.1, 60), lookAt([eyeX, 0.66, 7.6], [0, 0.17, 0], [0, 1, 0]));

  it('an on-axis eye keeps a horizontal line horizontal in screen space', () => {
    const m = mvp(0);
    const left = projectScreen(m, [-1.5, -0.5, 0], 1600, 740);
    const right = projectScreen(m, [1.5, -0.5, 0], 1600, 740);
    expect(Math.abs(left.sy - right.sy)).toBeLessThan(0.01);
  });

  it('an OFF-axis eye tilts it — measured, in pixels', () => {
    /*
     * P0 pass 4. The eye was at x = 0.36 and the row of tick labels came out sloping
     * across the plate. Two iterations were spent treating it as a text-layout problem.
     * It is a camera problem, and this is the assertion that names it.
     */
    const m = mvp(0.36);
    const left = projectScreen(m, [-1.5, -0.5, 0], 1600, 740);
    const right = projectScreen(m, [1.5, -0.5, 0], 1600, 740);
    expect(Math.abs(left.sy - right.sy)).toBeGreaterThan(5);
  });
});

describe('worldPerNdcY is MEASURED from the matrix, not derived from the field of view', () => {
  it('agrees exactly with the finite difference it was measured over', () => {
    const m = multiply(perspective(0.205, 2, 0.1, 60), lookAt([0, 0.66, 7.6], [0, 0.17, 0], [0, 1, 0]));
    const at: [number, number, number] = [0, -0.5, 0];
    const scale = worldPerNdcY(m, at, 0.05);
    const a = projectNdc(m, at).y;
    const b = projectNdc(m, [0, -0.5 + 0.05, 0]).y;
    expect(scale * (b - a)).toBeCloseTo(0.05, 5);
  });

  it('is a SECANT, so the default probe carries a bounded error — stated, not hidden', () => {
    /*
     * The projection is not linear in y, so a scale measured over 0.2 world units is not
     * exactly the scale over 0.05. It is within ~0.2% at the P0 camera, which is far
     * below one device pixel at the floor and is why the default probe is safe there.
     * Asserting it rather than assuming it is the difference between a bound and a hope.
     */
    const m = multiply(perspective(0.205, 2, 0.1, 60), lookAt([0, 0.66, 7.6], [0, 0.17, 0], [0, 1, 0]));
    const at: [number, number, number] = [0, -0.5, 0];
    const coarse = worldPerNdcY(m, at);
    const fine = worldPerNdcY(m, at, 0.002);
    expect(Math.abs(coarse - fine) / fine).toBeLessThan(0.003);
  });

  it('stays correct under an ORTHOGRAPHIC projection, where a fov-derived value is meaningless', () => {
    // The reason it samples the matrix. A surface that swaps to orthographic must not
    // silently get a point cloud that bleeds through its own floor.
    const m = multiply(orthographic(-2, 2, -1, 1, 0.1, 60), lookAt([0, 0.5, 6], [0, 0, 0], [0, 1, 0]));
    const scale = worldPerNdcY(m, [0, 0, 0]);
    expect(Number.isFinite(scale)).toBe(true);
    expect(scale).toBeGreaterThan(0);
    const a = projectNdc(m, [0, 0, 0]).y;
    const b = projectNdc(m, [0, 0.1, 0]).y;
    expect(scale * (b - a)).toBeCloseTo(0.1, 6);
  });

  it('returns 0 rather than Infinity when the projection is degenerate in y', () => {
    expect(worldPerNdcY(IDENTITY(), [0, 0, 0], 0)).toBe(0);
  });
});

describe('projectScreen', () => {
  const m = multiply(perspective(0.4, 2, 0.1, 50), lookAt([0, 0, 6], [0, 0, 0], [0, 1, 0]));

  it('puts the origin at the centre of the viewport, y DOWN', () => {
    const p = projectScreen(m, [0, 0, 0], 1000, 500);
    expect(p.sx).toBeCloseTo(500, 6);
    expect(p.sy).toBeCloseTo(250, 6);
  });

  it('y increases downward — the DOM convention, since overlays are DOM', () => {
    const up = projectScreen(m, [0, 1, 0], 1000, 500);
    expect(up.sy).toBeLessThan(250);
  });

  it('flags geometry behind the camera instead of returning a plausible position', () => {
    // A point behind the eye projects to a perfectly reasonable-looking coordinate with
    // the sign flipped. A label placed there lands somewhere believable and wrong.
    const behind = projectScreen(m, [0, 0, 60], 1000, 500);
    expect(behind.behind).toBe(true);
    expect(projectScreen(m, [0, 0, 0], 1000, 500).behind).toBe(false);
  });
});

describe('perspective is near-orthographic for data work', () => {
  /*
   * WHAT MAKES A PROJECTION NEAR-ORTHOGRAPHIC IS DISTANCE, NOT THE FIELD OF VIEW.
   *
   * Worth stating precisely, because the loose version of this claim is wrong and I
   * asserted the loose version first. At a FIXED depth, perspective is exactly linear in
   * x — w is constant across the row, so equal steps along the value axis project to
   * equal screen steps no matter how wide the lens is. Nothing is gained there.
   *
   * The distortion lives on DEPTH: screen scale goes as 1/w, so the same world width
   * measures differently at the front and back of the data. That ratio is set by
   * depth ÷ camera distance, and a narrow fov is simply what lets the camera sit far
   * away and still fill the frame. The fov is the means; the distance is the mechanism.
   */
  const measure = (m: Float32Array, z: number) =>
    projectScreen(m, [1.5, 0, z], 1600, 740).sx - projectScreen(m, [-1.5, 0, z], 1600, 740).sx;
  // Sign-free: how far front-to-back scale departs from equal. z = −0.35 is the FAR
  // side (the camera sits at +z), so the raw ratio is below 1; the magnitude is the fact.
  const depthScaleError = (m: Float32Array) => Math.abs(measure(m, -0.35) / measure(m, 0.35) - 1);

  const far = multiply(perspective(0.205, 2, 0.1, 60), lookAt([0, 0.66, 7.6], [0, 0.17, 0], [0, 1, 0]));
  const near = multiply(perspective(0.87, 2, 0.1, 60), lookAt([0, 0.66, 4.0], [0, 0.17, 0], [0, 1, 0]));

  it('at a fixed depth the value axis is EXACTLY linear, at any fov', () => {
    for (const m of [far, near]) {
      const xs = [-1.5, -0.5, 0.5, 1.5].map((x) => projectScreen(m, [x, 0, 0], 1600, 740).sx);
      const gaps = [xs[1]! - xs[0]!, xs[2]! - xs[1]!, xs[3]! - xs[2]!];
      expect(Math.max(...gaps) / Math.min(...gaps)).toBeCloseTo(1, 6);
    }
  });

  it('the P0 camera holds front-to-back scale within 10%; the near one is nearly double that', () => {
    // 10% across the full depth of the cloud is under the width of one deposit, so two
    // equal masses at different depths still read as equal. At the near camera they do
    // not, and the reader silently compares a front column against a back one.
    expect(depthScaleError(far)).toBeLessThan(0.10);
    expect(depthScaleError(near)).toBeGreaterThan(0.15);
    expect(depthScaleError(near)).toBeGreaterThan(depthScaleError(far) * 1.5);
  });
});
