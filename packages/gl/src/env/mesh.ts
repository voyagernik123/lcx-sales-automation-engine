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

function finish(positions: Float32Array, uvs: Float32Array, indices: Uint16Array, normals?: Float32Array): Geometry {
  const { min, max } = bounds(positions);
  return { positions, normals: normals ?? computeNormals(positions, indices), uvs, indices, min, max };
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
      indices[i++] = a; indices[i++] = c; indices[i++] = b;
      indices[i++] = b; indices[i++] = c; indices[i++] = d;
    }
  }
  return finish(positions, uvs, indices, normals);
}

/** Total triangles — the number a frame budget is actually spent on. */
export function triangleCount(g: Geometry): number {
  return g.indices.length / 3;
}
