/*
 * PROJECTING REAL DOM CONTENT ONTO A RENDERED SURFACE.
 *
 * §6 rule 4 of the 3D plan is absolute: text stays in the DOM. Not because DOM text is easier, but
 * because GL text is unselectable, unsearchable, invisible to a screen reader, wrong at every zoom
 * level it was not baked for, and untranslatable. A 3D environment that renders its own labels has
 * traded an operator's ability to read for the author's ability to show off.
 *
 * So the surfaces are GL and the content is DOM, and something has to make them agree. That is the
 * whole job of this file. `projectScreen` already turns one world point into one screen point, which
 * is enough to POSITION a label near a surface. It is not enough to lie a label ON one: a panel
 * turned away from the camera projects to a trapezium, and a rectangle pinned at its centre stays
 * stubbornly rectangular while the surface underneath it is not. The label reads as a sticker on the
 * lens rather than as content on the panel, and every viewer notices without being able to say why.
 *
 * The fix is the perspective transform that maps the DOM element's own rectangle onto the projected
 * quadrilateral — a plane-to-plane homography, which is exactly the class of transform CSS
 * `matrix3d` can express. Solve for eight coefficients, hand them to the compositor, and the browser
 * rasterises real selectable text with real font hinting into the shape the renderer says the
 * surface occupies.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It does not occlude. CSS has no depth buffer, so a projected panel cannot be hidden by GL geometry
 * in front of it; a caller wanting that must sort and hide by hand. It is called out because the
 * failure is silent and looks like a z-index bug rather than like a missing feature.
 */

import type { Mat4, Vec3 } from '../math';
import { projectScreen } from '../math';

/** The four corners of a surface, in world space, wound the same way every time. */
export interface QuadCorners {
  /** The element's own top-left, i.e. (0, 0) in its local CSS box. */
  topLeft: Vec3;
  topRight: Vec3;
  bottomRight: Vec3;
  bottomLeft: Vec3;
}

/** Why a quad could not be projected. Stable codes: these are asserted on, and logged. */
export type QuadRefusal =
  /** At least one corner is at or behind the eye plane. The projection is not merely inaccurate
   *  there, it is inverted — w flips sign, so the corner lands on the OPPOSITE side of the frame
   *  and the element renders turned inside out at enormous size. */
  | 'CORNER_BEHIND_CAMERA'
  /** The four corners are collinear or coincident on screen: the surface is edge-on, or degenerate.
   *  The homography's determinant vanishes and the coefficients are infinities. */
  | 'DEGENERATE_ON_SCREEN'
  /** The caller passed a zero or negative element size, so there is no source rectangle to map. */
  | 'EMPTY_ELEMENT_BOX';

export interface QuadProjection {
  /** Ready for `element.style.transform`. Assumes `transform-origin: 0 0`. */
  readonly transform: string;
  /** The nine homography coefficients, row-major, for tests and for callers doing their own maths. */
  readonly matrix: readonly number[];
  /** Screen-space corners, in the winding order they were given. Useful for hit-testing and for
   *  deciding paint order without recomputing the projection. */
  readonly screen: readonly { x: number; y: number }[];
  /** Signed screen area. NEGATIVE means the surface is presenting its back to the camera, and a
   *  caller that ignores this will render mirror-imaged text rather than hiding it. */
  readonly signedArea: number;
}

/*
 * FORMATTING A COEFFICIENT FOR CSS, which has two traps that between them cost a caught bug.
 *
 * 1. CSS NUMBER SYNTAX HAS NO EXPONENT NOTATION. `Number.prototype.toString` switches to `2.5e-7`
 *    below 1e-6, and a single such token makes the browser reject the ENTIRE `matrix3d` — so the
 *    element renders untransformed, at its natural position and size, which reads as a layout bug
 *    somewhere else entirely.
 *
 * 2. THE PERSPECTIVE COEFFICIENTS ARE LEGITIMATELY TINY. They are divided by the element's pixel
 *    width, so for a 400 px panel they land around 1e-7 — while the translation terms sit around
 *    1e3, nine orders of magnitude away. `toFixed(6)` looked like ample precision and silently
 *    quantised every perspective term to zero, turning the transform affine: correct head-on,
 *    drifting off the surface as the panel turned. Fixed-point rounding is the wrong tool for a
 *    matrix whose entries do not share a scale.
 *
 * Twelve decimals is chosen against the smallest term that can matter rather than for tidiness: a
 * coefficient below 1e-12 moves a 4K pixel by less than a millionth of its own width.
 */
function cssNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n === 0) return '0';
  const s = n.toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
}

/**
 * Solve the unit-square-to-quadrilateral homography.
 *
 * The closed form (Heckbert) rather than an 8×8 solve: it is exact, allocation-free, and cannot
 * silently return a least-squares approximation of a degenerate case the way a general solver can.
 *
 * Maps (0,0)→p0, (1,0)→p1, (1,1)→p2, (0,1)→p3, so a point (u,v) in the unit square lands at
 * `((a u + b v + c) / (g u + h v + i), (d u + e v + f) / (g u + h v + i))`.
 */
export function squareToQuad(
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
  p3: readonly [number, number],
): readonly number[] | null {
  const [x0, y0] = p0, [x1, y1] = p1, [x2, y2] = p2, [x3, y3] = p3;

  // How far the quad departs from a parallelogram. Zero on both axes means the perspective terms
  // vanish and the map is affine — worth branching for, because the general formula divides by a
  // determinant that is itself zero in that case.
  const px = x0 - x1 + x2 - x3;
  const py = y0 - y1 + y2 - y3;

  if (Math.abs(px) < 1e-9 && Math.abs(py) < 1e-9) {
    const m = [
      x1 - x0, x3 - x0, x0,
      y1 - y0, y3 - y0, y0,
      0, 0, 1,
    ];
    // An affine map is still degenerate if its 2×2 part is singular: a panel seen exactly edge-on
    // reaches here, not the perspective branch.
    const det = m[0]! * m[4]! - m[1]! * m[3]!;
    return Math.abs(det) < 1e-9 ? null : m;
  }

  const dx1 = x1 - x2, dx2 = x3 - x2;
  const dy1 = y1 - y2, dy2 = y3 - y2;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-9) return null;

  const g = (px * dy2 - dx2 * py) / den;
  const h = (dx1 * py - px * dy1) / den;

  return [
    x1 - x0 + g * x1, x3 - x0 + h * x3, x0,
    y1 - y0 + g * y1, y3 - y0 + h * y3, y0,
    g, h, 1,
  ];
}

/**
 * Project a world-space quad and return the CSS transform that lays a `width`×`height` element onto
 * it. Returns a refusal code rather than a wrong transform — a garbage `matrix3d` does not throw,
 * it renders content at the wrong size somewhere off-frame, which is far harder to diagnose than a
 * named refusal.
 *
 * The element must have `transform-origin: 0 0`, because the homography is expressed in the
 * element's own coordinates with the origin at its top-left corner. Any other origin silently
 * shears the result.
 */
export function projectQuad(
  viewProjection: Mat4,
  corners: QuadCorners,
  cssWidth: number,
  cssHeight: number,
  elementWidth: number,
  elementHeight: number,
): QuadProjection | { refusal: QuadRefusal } {
  if (!(elementWidth > 0) || !(elementHeight > 0)) return { refusal: 'EMPTY_ELEMENT_BOX' };

  const order = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  const projected = order.map((p) => projectScreen(viewProjection, p, cssWidth, cssHeight));

  // Checked BEFORE the solve, not after: a behind-camera corner produces finite-looking screen
  // coordinates, so the homography solves cleanly and returns a confidently wrong answer.
  if (projected.some((p) => p.behind)) return { refusal: 'CORNER_BEHIND_CAMERA' };

  const pts = projected.map((p) => ({ x: p.sx, y: p.sy }));
  const [a, b, c, d] = pts as [typeof pts[0], typeof pts[0], typeof pts[0], typeof pts[0]];

  const m = squareToQuad([a.x, a.y], [b.x, b.y], [c.x, c.y], [d.x, d.y]);
  if (!m) return { refusal: 'DEGENERATE_ON_SCREEN' };

  // Shoelace over the four corners. Screen y runs DOWN, so a front-facing quad wound clockwise on
  // screen has positive area under this sign convention.
  const signedArea = 0.5 * (
    (a.x * b.y - b.x * a.y) + (b.x * c.y - c.x * b.y) +
    (c.x * d.y - d.x * c.y) + (d.x * a.y - a.x * d.y)
  );

  // The solve maps the UNIT square; the element is `elementWidth`×`elementHeight`. Fold that scale
  // into the coefficients rather than composing a separate `scale()`, so the caller can set one
  // transform and the compositor does one pass.
  const sx = 1 / elementWidth, sy = 1 / elementHeight;
  const [a11, a12, a13, a21, a22, a23, g, h, i] = m as [
    number, number, number, number, number, number, number, number, number,
  ];

  // CSS matrix3d is COLUMN-MAJOR and 4×4. A 2D homography embeds with the third row and column left
  // as the identity's, and the perspective terms in the fourth ROW — which, column-major, means
  // positions 4, 8, 16 of the argument list. Getting this wrong yields a transform that looks
  // plausible head-on and diverges as the surface turns, i.e. the worst kind of wrong.
  const transform = `matrix3d(${[
    a11 * sx, a21 * sx, 0, g * sx,
    a12 * sy, a22 * sy, 0, h * sy,
    0, 0, 1, 0,
    a13, a23, 0, i,
  ].map(cssNumber).join(', ')})`;

  return { transform, matrix: m, screen: pts, signedArea };
}

/** Narrowing helper, so callers do not have to remember which shape carries the refusal. */
export function isQuadRefusal(
  r: QuadProjection | { refusal: QuadRefusal },
): r is { refusal: QuadRefusal } {
  return 'refusal' in r;
}

/**
 * The four corners of an upright, yawed rectangle standing on a deck — the shape every panel in
 * E1 and E3–E7 is. Extracted because deriving corners inline is where the winding order gets
 * silently reversed, and a reversed winding is a mirror-imaged label rather than an error.
 *
 * `yaw` follows the same convention as the panels' model matrices: the face normal aims at
 * (sin yaw, 0, cos yaw).
 */
export function uprightPanelCorners(
  centreX: number,
  centreZ: number,
  baseY: number,
  width: number,
  height: number,
  yaw: number,
  faceOffset = 0,
): QuadCorners {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // `u` runs along the face to the viewer's right; the offset pushes the plane clear of the surface
  // so the DOM content is not co-planar with the geometry it sits on.
  const at = (u: number, v: number): Vec3 => [
    centreX + c * u + s * faceOffset,
    baseY + v,
    centreZ - s * u + c * faceOffset,
  ];
  const hw = width / 2;
  return {
    topLeft: at(-hw, height),
    topRight: at(hw, height),
    bottomRight: at(hw, 0),
    bottomLeft: at(-hw, 0),
  };
}
