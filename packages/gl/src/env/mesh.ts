/**
 * L1.5 · MESH — indexed triangle geometry with real vertex normals.
 *
 * The gap that made every previous "3-D" claim hollow. `@lcx/gl` could draw points, thin
 * lines, 2-D rectangles and 2-D strokes. It could not draw a SURFACE, which means it could
 * not be lit, could not cast a shadow, and could not occlude anything. Everything in
 * `3D_VFX_1000X.md` §4 depends on this file existing first.
 *
 * ── PURE, AND THAT IS DELIBERATE ────────────────────────────────────────────────────
 * Nothing here touches WebGL. A `Geometry` is plain typed arrays, so it is unit-testable
 * without a GPU — which matters because a wrong normal is invisible in a screenshot until it
 * is lit, and by then three other things have changed. `upload()` in `meshBuffer.ts` is the
 * only part that needs a context.
 *
 * ── FLAT-SHADED PRIMITIVES DUPLICATE THEIR CORNERS ──────────────────────────────────
 * A cube has 8 positions and 24 vertices. Sharing the 8 would average three perpendicular
 * face normals at every corner and light the cube like a sphere — the classic tell of an
 * engine that treats normals as an afterthought. Faces that should read as flat get their
 * own vertices; only genuinely smooth surfaces (the sphere) share.
 */

export interface Geometry {
  /** xyz triples. */
  readonly positions: Float32Array;
  /** Unit xyz triples, one per position. */
  readonly normals: Float32Array;
  /** uv pairs, one per position. */
  readonly uvs: Float32Array;
  /**
   * Unit xyz per position — the direction "along the surface" that anisotropic specular stretches
   * its highlight down. On a brushed disc this is the circumferential direction, because that is
   * the way a lathe leaves its marks; get it wrong and the highlight runs across the brush
   * instead of along it, which reads as scratched rather than machined.
   */
  readonly tangents: Float32Array;
  /** Triangle indices into the arrays above. */
  readonly indices: Uint16Array | Uint32Array;
  /** Axis-aligned bounds — needed for framing a camera and for shadow-map fitting. */
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

function bounds(positions: Float32Array): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = positions[i + a]!;
      if (v < min[a]!) min[a] = v;
      if (v > max[a]!) max[a] = v;
    }
  }
  // An empty geometry has no bounds. Returning ±Infinity would poison every camera fit
  // downstream, so collapse to the origin and let the caller see a zero-size box.
  if (positions.length === 0) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min, max };
}

/**
 * Derive per-vertex tangents from the UV parameterisation.
 *
 * The standard construction: for each triangle, solve the 2x2 UV system for the direction in
 * which u increases, accumulate per vertex, then Gram-Schmidt against the normal so the frame is
 * orthonormal. Accumulating BEFORE orthonormalising matters — doing it per face and averaging the
 * results afterwards produces a frame that is not perpendicular to the smoothed normal, and the
 * anisotropic highlight then wobbles across a smooth surface.
 *
 * A degenerate UV patch (zero area in texture space) has no defined tangent. Rather than emit NaN,
 * fall back to any vector perpendicular to the normal: an arbitrary-but-valid frame makes the
 * highlight point somewhere harmless, where a NaN makes the fragment black.
 */
export function computeTangents(
  positions: Float32Array, normals: Float32Array, uvs: Float32Array, indices: Uint16Array | Uint32Array,
): Float32Array {
  const acc = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]!, b = indices[i + 1]!, c = indices[i + 2]!;
    const p0 = a * 3, p1 = b * 3, p2 = c * 3;
    const t0 = a * 2, t1 = b * 2, t2 = c * 2;
    const e1x = positions[p1]! - positions[p0]!, e1y = positions[p1 + 1]! - positions[p0 + 1]!, e1z = positions[p1 + 2]! - positions[p0 + 2]!;
    const e2x = positions[p2]! - positions[p0]!, e2y = positions[p2 + 1]! - positions[p0 + 1]!, e2z = positions[p2 + 2]! - positions[p0 + 2]!;
    const du1 = uvs[t1]! - uvs[t0]!, dv1 = uvs[t1 + 1]! - uvs[t0 + 1]!;
    const du2 = uvs[t2]! - uvs[t0]!, dv2 = uvs[t2 + 1]! - uvs[t0 + 1]!;
    const det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-12) continue;
    const r = 1 / det;
    const tx = (e1x * dv2 - e2x * dv1) * r;
    const ty = (e1y * dv2 - e2y * dv1) * r;
    const tz = (e1z * dv2 - e2z * dv1) * r;
    for (const v of [p0, p1, p2]) {
      acc[v] = acc[v]! + tx; acc[v + 1] = acc[v + 1]! + ty; acc[v + 2] = acc[v + 2]! + tz;
    }
  }

  const out = new Float32Array(positions.length);
  for (let i = 0; i < out.length; i += 3) {
    const nx = normals[i]!, ny = normals[i + 1]!, nz = normals[i + 2]!;
    let tx = acc[i]!, ty = acc[i + 1]!, tz = acc[i + 2]!;
    // Gram-Schmidt: remove the component along the normal so the frame is orthonormal.
    const d = tx * nx + ty * ny + tz * nz;
    tx -= nx * d; ty -= ny * d; tz -= nz * d;
    let l = Math.hypot(tx, ty, tz);
    if (l < 1e-8) {
      // No usable UV gradient. Any perpendicular is valid; pick the more stable of two axes.
      if (Math.abs(nx) < 0.9) { tx = 0; ty = -nz; tz = ny; } else { tx = -nz; ty = 0; tz = nx; }
      l = Math.hypot(tx, ty, tz) || 1;
    }
    out[i] = tx / l; out[i + 1] = ty / l; out[i + 2] = tz / l;
  }
  return out;
}

/**
 * Derive vertex normals from the faces, area-weighted.
 *
 * AREA-WEIGHTED, NOT AVERAGED. Summing the raw cross products weights each face by twice its
 * area, which is the correct weighting: a long thin triangle contributes to a vertex's normal
 * in proportion to how much surface it actually represents. Normalising each face normal
 * first — which is the more obvious implementation — makes a mesh with uneven tessellation
 * shade with visible facets along the seams where triangle sizes change.
 */
export function computeNormals(positions: Float32Array, indices: Uint16Array | Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]! * 3, b = indices[i + 1]! * 3, c = indices[i + 2]! * 3;
    const e1x = positions[b]! - positions[a]!;
    const e1y = positions[b + 1]! - positions[a + 1]!;
    const e1z = positions[b + 2]! - positions[a + 2]!;
    const e2x = positions[c]! - positions[a]!;
    const e2y = positions[c + 1]! - positions[a + 1]!;
    const e2z = positions[c + 2]! - positions[a + 2]!;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) {
      normals[v] = normals[v]! + nx;
      normals[v + 1] = normals[v + 1]! + ny;
      normals[v + 2] = normals[v + 2]! + nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!);
    if (l > 0) {
      normals[i] = normals[i]! / l;
      normals[i + 1] = normals[i + 1]! / l;
      normals[i + 2] = normals[i + 2]! / l;
    }
  }
  return normals;
}

function finish(
  positions: Float32Array, uvs: Float32Array, indices: Uint16Array,
  normals?: Float32Array, tangents?: Float32Array,
): Geometry {
  const { min, max } = bounds(positions);
  const n = normals ?? computeNormals(positions, indices);
  return {
    positions, normals: n, uvs, indices, min, max,
    // Analytic where a primitive knows its own brush direction; derived from UVs otherwise.
    tangents: tangents ?? computeTangents(positions, n, uvs, indices),
  };
}

/** An axis-aligned box centred on the origin. Flat-shaded: 24 vertices, 6 independent faces. */
export function box(w = 1, h = 1, d = 1): Geometry {
  const x = w / 2, y = h / 2, z = d / 2;
  // Per face: 4 corners, in CCW order seen from outside, so the winding matches gl.CCW.
  const faces: Array<[[number, number, number], [number, number, number], [number, number, number], [number, number, number]]> = [
    [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]],       // +z
    [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]],   // -z
    [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]],       // +x
    [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]],   // -x
    [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]],       // +y
    [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]],   // -y
  ];
  const positions = new Float32Array(24 * 3);
  const uvs = new Float32Array(24 * 2);
  const indices = new Uint16Array(36);
  let p = 0, u = 0, i = 0, base = 0;
  for (const face of faces) {
    for (const [cx, cy, cz] of face) {
      positions[p++] = cx; positions[p++] = cy; positions[p++] = cz;
    }
    uvs[u++] = 0; uvs[u++] = 0; uvs[u++] = 1; uvs[u++] = 0;
    uvs[u++] = 1; uvs[u++] = 1; uvs[u++] = 0; uvs[u++] = 1;
    indices[i++] = base; indices[i++] = base + 1; indices[i++] = base + 2;
    indices[i++] = base; indices[i++] = base + 2; indices[i++] = base + 3;
    base += 4;
  }
  return finish(positions, uvs, indices);
}

/**
 * A ground plane in the XZ plane at y = 0, subdivided.
 *
 * SUBDIVIDED ON PURPOSE even though it is flat: a two-triangle floor cannot receive a
 * per-vertex anything, and more importantly a large flat quad makes shadow-map depth
 * interpolation degenerate at grazing angles — the acne this file's `segments` default is
 * chosen to avoid.
 */
/**
 * A SQUARE plane in x/z, `size` on both axes. NOT `plane(width, depth)`.
 *
 * Named explicitly because the mistake is silent and was made twice. E6 wrote
 * `plane(6, CORRIDOR_LEN)` intending a 6 m x 44 m corridor floor and got a 6 m x 6 m patch with 44
 * segments per side — the corridor had no floor beyond three metres of its length, which under fog and
 * a dark palette looks like a dark corridor rather than a missing one. E3 wrote `plane(2.9, 96)` and
 * got 18,432 triangles of flat deck, rasterised three times a frame (shadow, prepass, lit) for zero
 * extra shading detail.
 *
 * Both halves of that are worth stating: `segments` on a FLAT lit surface buys nothing at all, because
 * the lighting is evaluated per fragment and every interior vertex carries the same normal. Segments
 * matter only if something displaces them. For a rectangular floor use `box(width, thickness, depth)` —
 * 12 triangles, and it gains a lit edge.
 */
export function plane(size = 10, segments = 24): Geometry {
  const n = Math.max(1, Math.floor(segments));
  const verts = (n + 1) * (n + 1);
  const positions = new Float32Array(verts * 3);
  const normals = new Float32Array(verts * 3);
  const uvs = new Float32Array(verts * 2);
  const indices = new Uint16Array(n * n * 6);
  let p = 0, u = 0, i = 0;
  for (let z = 0; z <= n; z++) {
    for (let x = 0; x <= n; x++) {
      const fx = (x / n - 0.5) * size;
      const fz = (z / n - 0.5) * size;
      positions[p] = fx; positions[p + 1] = 0; positions[p + 2] = fz;
      normals[p] = 0; normals[p + 1] = 1; normals[p + 2] = 0;
      p += 3;
      uvs[u++] = x / n; uvs[u++] = z / n;
    }
  }
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const a = z * (n + 1) + x, b = a + 1, c = a + (n + 1), d = c + 1;
      indices[i++] = a; indices[i++] = c; indices[i++] = b;
      indices[i++] = b; indices[i++] = c; indices[i++] = d;
    }
  }
  return finish(positions, uvs, indices, normals);
}

/** A UV sphere. Smooth-shaded, so positions ARE shared and the analytic normal is exact. */
export function sphere(radius = 0.5, rings = 24, sectors = 32): Geometry {
  const R = Math.max(2, rings), S = Math.max(3, sectors);
  const verts = (R + 1) * (S + 1);
  const positions = new Float32Array(verts * 3);
  const normals = new Float32Array(verts * 3);
  const uvs = new Float32Array(verts * 2);
  const indices = new Uint16Array(R * S * 6);
  let p = 0, u = 0, i = 0;
  for (let r = 0; r <= R; r++) {
    const phi = (r / R) * Math.PI;
    for (let s = 0; s <= S; s++) {
      const theta = (s / S) * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      positions[p] = nx * radius; positions[p + 1] = ny * radius; positions[p + 2] = nz * radius;
      // ANALYTIC, not derived: a sphere's normal is its normalised position, and using the
      // exact value avoids the faceting that face-averaging leaves at the poles.
      normals[p] = nx; normals[p + 1] = ny; normals[p + 2] = nz;
      p += 3;
      uvs[u++] = s / S; uvs[u++] = r / R;
    }
  }
  for (let r = 0; r < R; r++) {
    for (let s = 0; s < S; s++) {
      const a = r * (S + 1) + s, b = a + 1, c = a + (S + 1), d = c + 1;
      /*
       * WINDING: a, b, c — NOT a, c, b, which is what `plane` uses.
       *
       * The same index pattern gives OPPOSITE winding here, because the sphere's grid runs
       * phi (downward from the north pole) × theta while the plane's runs x × z. Copying the
       * plane's order produced an inward-facing sphere, and an inward sphere is NOT invisible
       * under back-face culling — you see the inside of its far hemisphere as a perfectly
       * plausible disc, with interpolated normals pointing the wrong way. Diffuse still looked
       * right; every REFLECTION was vertically mirrored. Caught by an RGB diagnostic sky, then
       * pinned by the winding test in env.test.ts.
       */
      indices[i++] = a; indices[i++] = b; indices[i++] = c;
      indices[i++] = b; indices[i++] = d; indices[i++] = c;
    }
  }
  return finish(positions, uvs, indices, normals);
}

/**
 * A capped cylinder along Y. The body of E8's machined disc.
 *
 * THE CAPS DO NOT SHARE VERTICES WITH THE WALL, and that is the whole reason this is not four
 * lines shorter. A cap normal points along Y and a wall normal points radially outward; sharing
 * the rim would average them into a 45-degree bevel all the way round, which reads as a
 * chamfered plastic puck rather than a machined edge. Flat where it should be flat.
 */
export function cylinder(radius = 0.5, height = 0.2, sectors = 64): Geometry {
  const S = Math.max(3, sectors);
  const hy = height / 2;
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [], tan: number[] = [];

  // Wall: two rings, smooth around the circumference so the highlight travels rather than facets.
  for (let s = 0; s <= S; s++) {
    const a = (s / S) * Math.PI * 2;
    const cx = Math.cos(a), cz = Math.sin(a);
    /* CIRCUMFERENTIAL TANGENT, analytic. A lathe leaves its marks AROUND the axis, so that is the
       direction an anisotropic highlight must stretch along. Deriving it from UVs gives a RADIAL
       tangent on the caps, and the highlight then runs across the brush instead of along it —
       which reads as scratched metal rather than turned metal. */
    pos.push(cx * radius, hy, cz * radius); nrm.push(cx, 0, cz); uv.push(s / S, 1); tan.push(-cz, 0, cx);
    pos.push(cx * radius, -hy, cz * radius); nrm.push(cx, 0, cz); uv.push(s / S, 0); tan.push(-cz, 0, cx);
  }
  for (let s = 0; s < S; s++) {
    /* Triangle 0 was the WALL, not a cap — worth noting, because "the caps must be wrong" was the
       obvious guess and the test named the actual index instead. Vertices alternate top/bottom
       around the ring, so a,c,b is the outward order here. */
    const a = s * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }

  // Caps: their own vertices, their own axial normals.
  for (const [sign, y] of [[1, hy], [-1, -hy]] as const) {
    const centre = pos.length / 3;
    pos.push(0, y, 0); nrm.push(0, sign, 0); uv.push(0.5, 0.5); tan.push(1, 0, 0);
    for (let s = 0; s <= S; s++) {
      const a = (s / S) * Math.PI * 2;
      const cx = Math.cos(a), cz = Math.sin(a);
      pos.push(cx * radius, y, cz * radius); nrm.push(0, sign, 0);
      uv.push(0.5 + cx * 0.5, 0.5 + cz * 0.5);
      tan.push(-cz, 0, cx);
    }
    for (let s = 0; s < S; s++) {
      const r0 = centre + 1 + s, r1 = centre + 2 + s;
      // Winding flips with the cap so both face outwards under back-face culling.
      if (sign > 0) idx.push(centre, r1, r0); else idx.push(centre, r0, r1);
    }
  }

  return finish(new Float32Array(pos), new Float32Array(uv), new Uint16Array(idx), new Float32Array(nrm), new Float32Array(tan));
}

/**
 * A torus in the XZ plane — E8's machined ring.
 *
 * The normal is ANALYTIC: the vector from the tube's centre circle to the surface point. Deriving
 * it from faces would facet visibly along the tube, which on a metal ring is the most obvious
 * possible tell because the specular highlight follows the tube exactly.
 */
export function torus(ringRadius = 0.5, tubeRadius = 0.08, ringSegs = 64, tubeSegs = 24): Geometry {
  const R = Math.max(3, ringSegs), T = Math.max(3, tubeSegs);
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [], tan: number[] = [];
  for (let i = 0; i <= R; i++) {
    const u = (i / R) * Math.PI * 2;
    const cu = Math.cos(u), su = Math.sin(u);
    for (let j = 0; j <= T; j++) {
      const v = (j / T) * Math.PI * 2;
      const cv = Math.cos(v), sv = Math.sin(v);
      // Tube centre at (cu, 0, su) * ringRadius; the surface offsets from it by tubeRadius.
      pos.push((ringRadius + tubeRadius * cv) * cu, tubeRadius * sv, (ringRadius + tubeRadius * cv) * su);
      nrm.push(cu * cv, sv, su * cv);
      uv.push(i / R, j / T);
      // Along the RING, not around the tube: that is the direction a turned ring is brushed.
      tan.push(-su, 0, cu);
    }
  }
  for (let i = 0; i < R; i++) {
    for (let j = 0; j < T; j++) {
      const a = i * (T + 1) + j, b = a + 1, c = a + (T + 1), d = c + 1;
      /* a,b,c — NOT a,c,b. Same lesson as the sphere: the correct order depends on how the grid
         is parameterised, so it is asserted against the analytic normal rather than reasoned about. */
      idx.push(a, b, c, b, d, c);
    }
  }
  return finish(new Float32Array(pos), new Float32Array(uv), new Uint16Array(idx), new Float32Array(nrm), new Float32Array(tan));
}

/** Latitude/longitude in DEGREES to a unit vector. y is north, so the poles sit on the y axis. */
export function latLonToVec3(latDeg: number, lonDeg: number): [number, number, number] {
  const la = (latDeg * Math.PI) / 180;
  const lo = (lonDeg * Math.PI) / 180;
  const c = Math.cos(la);
  return [c * Math.cos(lo), Math.sin(la), c * Math.sin(lo)];
}

/**
 * A GREAT-CIRCLE ARC as a swept tube — E2's actual payload.
 *
 * `3D_VFX_1000X.md` §2 E2 asks for "extruded arcs for every partner and listing corridor". Without
 * them the globe is a handsome planet carrying no information, which fails §7(b) exactly as five
 * blank panels do. The sphere is the frame; THIS is the data.
 *
 * ── WHY SLERP AND NOT A STRAIGHT LINE ───────────────────────────────────────────────
 * The shortest path between two points on a sphere is a great circle, and a corridor drawn as a
 * chord would cut THROUGH the planet — visibly wrong for any pair more than a quarter-turn apart,
 * and subtly wrong for every pair. Spherical interpolation keeps every sample exactly on the
 * surface radius before the lift is applied, so the arc reads as a route rather than as a wire.
 *
 * ── THE LIFT IS A SINE, NOT A CONSTANT ──────────────────────────────────────────────
 * Height scales as `sin(pi t)`, so the arc leaves and meets the surface TANGENTIALLY at both ends
 * and peaks in the middle. A constant offset would float the whole corridor above the planet with
 * two visible steps at the endpoints, which is the tell that says "line drawn on a sphere".
 *
 * Peak height also scales with the arc's own angular length: a short hop should stay low and a
 * transatlantic corridor should climb. A fixed lift makes short arcs look like tall croquet hoops.
 *
 * ── THE FRAME IS RADIAL, NOT FRENET ─────────────────────────────────────────────────
 * A Frenet frame twists where the path's curvature flips and the tube visibly corkscrews. Using
 * the OUTWARD RADIAL direction as the reference up removes that entirely: the tube's cross-section
 * stays oriented relative to the planet, which is both stable and what a reader expects.
 */
export function arcTube(
  fromLat: number, fromLon: number, toLat: number, toLon: number,
  sphereRadius = 1, tubeRadius = 0.012, liftScale = 0.22, segs = 96, tubeSegs = 8,
): Geometry {
  const S = Math.max(8, segs), T = Math.max(3, tubeSegs);
  const a = latLonToVec3(fromLat, fromLon);
  const b = latLonToVec3(toLat, toLon);

  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const omega = Math.acos(dot);
  /* ANTIPODAL AND COINCIDENT ARE BOTH DEGENERATE. At omega 0 there is no path; at omega pi there
     are infinitely many and `sin(omega)` is zero, so slerp divides by zero and every vertex
     becomes NaN — a whole corridor silently vanishing. Fall back to a fixed perpendicular. */
  const degenerate = omega < 1e-4 || Math.abs(Math.PI - omega) < 1e-4;
  const sinOmega = Math.sin(omega);
  // Peak lift proportional to angular distance: a short hop stays low, a long one climbs.
  const lift = liftScale * sphereRadius * (omega / Math.PI);

  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], tan: number[] = [], idx: number[] = [];

  const pathAt = (t: number): [number, number, number] => {
    if (degenerate) {
      // No defined great circle. A straight blend keeps the geometry finite and visibly wrong
      // rather than absent, which is the honest failure for a corridor nobody can route.
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
    const w0 = Math.sin((1 - t) * omega) / sinOmega;
    const w1 = Math.sin(t * omega) / sinOmega;
    return [a[0] * w0 + b[0] * w1, a[1] * w0 + b[1] * w1, a[2] * w0 + b[2] * w1];
  };

  const sampleAt = (t: number): [number, number, number] => {
    const p = pathAt(t);
    const l = Math.hypot(p[0], p[1], p[2]) || 1;
    const r = sphereRadius + lift * Math.sin(Math.PI * t);
    return [(p[0] / l) * r, (p[1] / l) * r, (p[2] / l) * r];
  };

  for (let i = 0; i <= S; i++) {
    const t = i / S;
    const c = sampleAt(t);
    // Central difference for the tangent, clamped at the ends. A forward difference biases the
    // frame at the endpoints, which is exactly where the arc meets the surface and shows.
    const fwd = sampleAt(Math.min(1, t + 1 / S));
    const bwd = sampleAt(Math.max(0, t - 1 / S));
    let tx = fwd[0] - bwd[0], ty = fwd[1] - bwd[1], tz = fwd[2] - bwd[2];
    let tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;

    // Radially outward, which is the stable reference the header explains.
    const rl = Math.hypot(c[0], c[1], c[2]) || 1;
    const ux = c[0] / rl, uy = c[1] / rl, uz = c[2] / rl;
    let bx = ty * uz - tz * uy, by = tz * ux - tx * uz, bz = tx * uy - ty * ux;
    const bl = Math.hypot(bx, by, bz) || 1;
    bx /= bl; by /= bl; bz /= bl;
    const nx2 = by * tz - bz * ty, ny2 = bz * tx - bx * tz, nz2 = bx * ty - by * tx;

    for (let j = 0; j <= T; j++) {
      const ang = (j / T) * Math.PI * 2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const ox = bx * ca + nx2 * sa, oy = by * ca + ny2 * sa, oz = bz * ca + nz2 * sa;
      pos.push(c[0] + ox * tubeRadius, c[1] + oy * tubeRadius, c[2] + oz * tubeRadius);
      nrm.push(ox, oy, oz);
      uv.push(t, j / T);
      // ALONG the tube, so an anisotropic highlight runs down the corridor rather than banding it.
      tan.push(tx, ty, tz);
    }
  }

  for (let i = 0; i < S; i++) {
    for (let j = 0; j < T; j++) {
      const p0 = i * (T + 1) + j, p1 = p0 + 1, p2 = p0 + (T + 1), p3 = p2 + 1;
      idx.push(p0, p2, p1, p1, p2, p3);
    }
  }

  return finish(
    new Float32Array(pos), new Float32Array(uv),
    pos.length / 3 > 65535 ? new Uint32Array(idx) as unknown as Uint16Array : new Uint16Array(idx),
    new Float32Array(nrm), new Float32Array(tan),
  );
}

/** Total triangles — the number a frame budget is actually spent on. */
export function triangleCount(g: Geometry): number {
  return g.indices.length / 3;
}

/*
 * A MEASURED SURFACE AS A MESH — and the whole difficulty is the cells nobody measured.
 *
 * The flat score surfaces this promotes (`SurfaceGeometry` in `@lcx/shared`) already get the hard
 * part right: a grid point is OBSERVED, ABSENT, or WITHHELD, the three are never collapsed, and a
 * cell with an unmeasured corner is drawn as a HOLE rather than interpolated across. A 3D promotion
 * that quietly builds a watertight grid would throw that away and be a straight regression — the
 * resulting surface would be smooth, handsome, and would assert values nobody ever took.
 *
 * So `null` from the sampler means no cell, and the hole survives into the mesh. Two consequences
 * that are easy to miss and both of which are handled below:
 *
 *   · NORMALS AT A HOLE'S EDGE cannot use a central difference — one side of it does not exist. Fall
 *     back to a one-sided difference, and where neither side exists, to straight up. Sampling
 *     through a hole is how a rim ends up lit as though the surface continued flat across it, which
 *     reads as a lighting bug rather than as the missing data it is.
 *
 *   · A VERTEX IS SHARED between up to four cells, and a vertex that no surviving cell references
 *     must still occupy its slot in the arrays, because the indices are absolute. Compacting the
 *     vertex list would be a memory optimisation paid for with an off-by-one in every index.
 */
export interface HeightfieldResult {
  readonly geometry: Geometry;
  /** Cells built. The n the surface is over. */
  readonly cellsDrawn: number;
  /** Cells omitted because at least one corner was unmeasured. Reported, never silently dropped. */
  readonly cellsHoles: number;
  /** Grid points the sampler refused. Distinct from `cellsHoles`: one absent point holes 4 cells. */
  readonly pointsAbsent: number;
  /** Observed vertical range, in the sampler's own units, or `null` if nothing was observed. */
  readonly observedRange: readonly [number, number] | null;
}

/**
 * Build a mesh from a `cols × rows` grid of samples.
 *
 * `sample(col, row)` returns the height in the caller's own units, or `null` for a point that was
 * never measured. Heights are mapped onto `[0, heightWorld]` from the OBSERVED range, so the surface
 * uses its full relief regardless of the units it arrived in.
 *
 * The grid lies in x/z with y up: `x` spans `[-widthWorld/2, +widthWorld/2]` across columns and `z`
 * spans `[-depthWorld/2, +depthWorld/2]` across rows.
 */
export function heightfield(
  cols: number,
  rows: number,
  sample: (col: number, row: number) => number | null,
  widthWorld = 4,
  depthWorld = 4,
  heightWorld = 1,
): HeightfieldResult {
  const nx = Math.max(2, Math.floor(cols));
  const nz = Math.max(2, Math.floor(rows));

  const raw: (number | null)[] = new Array(nx * nz);
  let lo = Infinity, hi = -Infinity, absent = 0;
  for (let r = 0; r < nz; r++) {
    for (let c = 0; c < nx; c++) {
      const v = sample(c, r);
      // Infinity and NaN are treated as unmeasured rather than propagated. A NaN height silently
      // NaNs every normal that touches it and the surface goes black in a patch, which looks like a
      // shader fault three layers away from the data that caused it.
      const ok = v !== null && Number.isFinite(v);
      raw[r * nx + c] = ok ? v : null;
      if (ok) { if (v! < lo) lo = v!; if (v! > hi) hi = v!; } else absent++;
    }
  }

  const observed = absent === nx * nz ? null : ([lo, hi] as const);
  /* A genuinely FLAT surface has span 0, and dividing by it would give every point NaN. Flat is a
     real measurement — the flat engine says so out loud rather than treating it as an error — so it
     maps to the base of the height range and stays flat. */
  const span = observed && hi > lo ? hi - lo : 0;
  const yOf = (v: number): number => (span === 0 ? 0 : ((v - lo) / span) * heightWorld);

  const positions = new Float32Array(nx * nz * 3);
  const normals = new Float32Array(nx * nz * 3);
  const uvs = new Float32Array(nx * nz * 2);
  const tangents = new Float32Array(nx * nz * 3);

  const at = (c: number, r: number): number | null =>
    (c < 0 || c >= nx || r < 0 || r >= nz ? null : raw[r * nx + c]!);

  const dx = widthWorld / (nx - 1), dz = depthWorld / (nz - 1);

  for (let r = 0; r < nz; r++) {
    for (let c = 0; c < nx; c++) {
      const i = r * nx + c;
      /* `?? null` rather than `raw[i]!`: under `noUncheckedIndexedAccess` an indexed read is
         `number | null | undefined`, and the `undefined` arm flows straight into `yOf` three lines
         down and again inside `grad`. Vitest strips types, so all 105 tests passed and only the real
         `tsc` emit the gate runs found it — the same lesson as the api/web build order. */
      const v = raw[i] ?? null;
      const x = -widthWorld / 2 + c * dx;
      const z = -depthWorld / 2 + r * dz;
      positions[i * 3] = x;
      positions[i * 3 + 1] = v === null ? 0 : yOf(v);
      positions[i * 3 + 2] = z;
      uvs[i * 2] = nx === 1 ? 0 : c / (nx - 1);
      uvs[i * 2 + 1] = nz === 1 ? 0 : r / (nz - 1);

      /*
       * SLOPE FROM WHICHEVER NEIGHBOURS EXIST — central where both do, one-sided at an edge or a
       * hole rim, and zero where neither does. Never a plain `(right - left) / 2dx`: at a rim that
       * reads through the hole and tilts the edge as though the data continued.
       */
      const grad = (a: number | null, b: number | null, step: number): number => {
        if (a !== null && b !== null) return (yOf(b) - yOf(a)) / (2 * step);
        if (v === null) return 0;
        if (b !== null) return (yOf(b) - yOf(v)) / step;
        if (a !== null) return (yOf(v) - yOf(a)) / step;
        return 0;
      };
      const sx = grad(at(c - 1, r), at(c + 1, r), dx);
      const sz = grad(at(c, r - 1), at(c, r + 1), dz);
      // The surface normal of y = f(x,z) is (-df/dx, 1, -df/dz), normalised.
      const nl = Math.hypot(-sx, 1, -sz);
      normals[i * 3] = -sx / nl;
      normals[i * 3 + 1] = 1 / nl;
      normals[i * 3 + 2] = -sz / nl;

      /* Tangent along +x, projected onto the tangent plane so it is perpendicular to the normal.
         Anisotropic specular stretches along it, which on a contoured surface should run with the
         grid the values were sampled on rather than across it. */
      const tn = normals[i * 3]!, tny = normals[i * 3 + 1]!, tnz = normals[i * 3 + 2]!;
      let tx = 1 - tn * tn, ty = -tn * tny, tz = -tn * tnz;
      const tl = Math.hypot(tx, ty, tz);
      if (tl < 1e-6) { tx = 0; ty = 0; tz = 1; } else { tx /= tl; ty /= tl; tz /= tl; }
      tangents[i * 3] = tx; tangents[i * 3 + 1] = ty; tangents[i * 3 + 2] = tz;
    }
  }

  const idx: number[] = [];
  let holes = 0;
  for (let r = 0; r < nz - 1; r++) {
    for (let c = 0; c < nx - 1; c++) {
      const a = r * nx + c, b = a + 1, d = (r + 1) * nx + c, e = d + 1;
      if (raw[a] === null || raw[b] === null || raw[d] === null || raw[e] === null) { holes++; continue; }
      /* Wound counter-clockwise seen from ABOVE (+y), so the lit face is the top. Getting this
         backwards gives a surface lit from underneath — dark where the key falls, bright in the
         hollows — which is the same signature as a wrong light direction. */
      idx.push(a, d, b, b, d, e);
    }
  }

  const indices = nx * nz > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  const bb = bounds(positions);
  return {
    geometry: { positions, normals, uvs, tangents, indices, min: bb.min, max: bb.max },
    cellsDrawn: (nx - 1) * (nz - 1) - holes,
    cellsHoles: holes,
    pointsAbsent: absent,
    observedRange: observed,
  };
}
