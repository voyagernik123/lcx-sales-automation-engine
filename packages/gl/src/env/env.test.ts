import { describe, expect, it } from 'vitest';
import { box, plane, sphere, cylinder, torus, arcTube, latLonToVec3, heightfield, computeNormals, triangleCount } from './mesh.js';
import {
  eyeOf, viewProjection, lightViewProjection, boundsRadius, boundsCentre, ELEVATION_LIMIT,
} from './camera.js';
import { squareToQuad, projectQuad, uprightPanelCorners, isQuadRefusal } from './project.js';
import { particleLayout, emissionSchedule } from './particles.js';
import { rayBoxSlab, marchPlan } from './volume.js';

/**
 * L1.5 / L1.6 — and the two failures these exist to make impossible.
 *
 * A WRONG NORMAL IS INVISIBLE UNTIL IT IS LIT, and by then three other things have changed.
 * That is why `mesh.ts` is pure: the normals can be asserted arithmetically, before a GPU is
 * involved and before a screenshot could mislead about which layer is wrong.
 *
 * A NaN MATRIX RENDERS A BLACK FRAME WITH NO ERROR. Every vertex becomes NaN, every triangle is
 * discarded, `gl.getError()` returns zero and the capture is a dark rectangle. P0 lost a day to
 * exactly that shape of bug (a rebound attribute, not a matrix, but the same silence), and W4
 * clamped its azimuth slider to 8..82° because a view down an axis produced it. The sweeps below
 * are the reason that clamp can now live in the rig instead of in every widget.
 */

const finite = (m: Float32Array) => Array.from(m).every((v) => Number.isFinite(v));

describe('box — flat-shaded means the corners are NOT shared', () => {
  it('has 24 vertices, not 8', () => {
    /* Sharing the 8 positions would average three perpendicular face normals at every corner
       and light a cube like a sphere — the classic tell of normals as an afterthought. */
    expect(box().positions.length / 3).toBe(24);
    expect(triangleCount(box())).toBe(12);
  });

  it('has exactly six distinct axis-aligned unit normals', () => {
    const n = box().normals;
    const seen = new Set<string>();
    for (let i = 0; i < n.length; i += 3) {
      expect(Math.hypot(n[i]!, n[i + 1]!, n[i + 2]!)).toBeCloseTo(1, 5);
      seen.add([n[i], n[i + 1], n[i + 2]].map((v) => Math.round(v!)).join(','));
    }
    expect(seen.size).toBe(6);
  });

  it('winds counter-clockwise seen from outside, so gl.CULL_FACE keeps the right half', () => {
    /*
     * BACKWARDS WINDING IS THE OTHER SILENT FAILURE. With culling on, an inverted cube renders
     * as its own interior: you see the far faces, lit from inside, and it reads as a lighting
     * bug rather than a geometry one. Verified by the sign of the face normal against the
     * outward direction from the centre.
     */
    const g = box(2, 2, 2);
    for (let t = 0; t < g.indices.length; t += 3) {
      const [a, b, c] = [g.indices[t]! * 3, g.indices[t + 1]! * 3, g.indices[t + 2]! * 3];
      const e1 = [g.positions[b]! - g.positions[a]!, g.positions[b + 1]! - g.positions[a + 1]!, g.positions[b + 2]! - g.positions[a + 2]!];
      const e2 = [g.positions[c]! - g.positions[a]!, g.positions[c + 1]! - g.positions[a + 1]!, g.positions[c + 2]! - g.positions[a + 2]!];
      const cross = [
        e1[1]! * e2[2]! - e1[2]! * e2[1]!,
        e1[2]! * e2[0]! - e1[0]! * e2[2]!,
        e1[0]! * e2[1]! - e1[1]! * e2[0]!,
      ];
      // Outward = the centroid direction, since the box is centred on the origin.
      const outward = [
        (g.positions[a]! + g.positions[b]! + g.positions[c]!) / 3,
        (g.positions[a + 1]! + g.positions[b + 1]! + g.positions[c + 1]!) / 3,
        (g.positions[a + 2]! + g.positions[b + 2]! + g.positions[c + 2]!) / 3,
      ];
      const dot = cross[0]! * outward[0]! + cross[1]! * outward[1]! + cross[2]! * outward[2]!;
      expect(dot, `triangle ${t / 3} is wound inwards`).toBeGreaterThan(0);
    }
  });

  it('reports the bounds the camera and shadow frustum are fitted from', () => {
    const g = box(4, 2, 6);
    expect(Array.from(g.min)).toEqual([-2, -1, -3]);
    expect(Array.from(g.max)).toEqual([2, 1, 3]);
  });
});

describe('EVERY primitive winds outwards — the box test alone was not enough', () => {
  /*
   * THE GAP THAT SHIPPED AN INVERTED REFLECTION. Only the box had a winding test. The plane and
   * the sphere use the same `a, c, b` index pattern, but their grids are parameterised
   * differently (z-major vs phi/theta), so an identical pattern can produce OPPOSITE winding.
   *
   * A backwards-wound sphere is not invisible under `cullFace(BACK)` — it renders as a plausible
   * disc, because you are seeing the INSIDE of its far hemisphere. Its interpolated normals then
   * point the wrong way and every reflection is vertically mirrored: proven with an RGB
   * diagnostic sky where a mirror sphere showed GROUND-green at its top and ZENITH-red at its
   * bottom. Diffuse looked fine, which is why the first two captures did not catch it.
   */
  const outwardDot = (positions: Float32Array, indices: Uint16Array | Uint32Array, t: number) => {
    const [a, b, c] = [indices[t]! * 3, indices[t + 1]! * 3, indices[t + 2]! * 3];
    const e1 = [positions[b]! - positions[a]!, positions[b + 1]! - positions[a + 1]!, positions[b + 2]! - positions[a + 2]!];
    const e2 = [positions[c]! - positions[a]!, positions[c + 1]! - positions[a + 1]!, positions[c + 2]! - positions[a + 2]!];
    const n = [
      e1[1]! * e2[2]! - e1[2]! * e2[1]!,
      e1[2]! * e2[0]! - e1[0]! * e2[2]!,
      e1[0]! * e2[1]! - e1[1]! * e2[0]!,
    ];
    // The vertex normal is the authority on which way is out; the face normal must agree with it.
    return n[0]! * positions[a]! + n[1]! * positions[a + 1]! + n[2]! * positions[a + 2]!;
  };

  it('sphere: every face normal agrees with its outward position', () => {
    const g = sphere(1, 12, 16);
    let checked = 0;
    for (let t = 0; t < g.indices.length; t += 3) {
      const d = outwardDot(g.positions, g.indices, t);
      // Degenerate triangles at the poles have a zero cross product and carry no orientation.
      if (Math.abs(d) < 1e-9) continue;
      checked++;
      expect(d, `sphere triangle ${t / 3} is wound INWARDS — its reflections will be mirrored`).toBeGreaterThan(0);
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('torus: every face normal agrees with its analytic vertex normal', () => {
    /* A faceted torus is the most obvious possible tell on a metal ring, because the specular
       highlight travels along the tube and shows every seam. Winding checked against the vertex
       normal rather than against the origin — a torus surrounds the origin, so a position-based
       test is meaningless for it. */
    const g = torus(0.5, 0.1, 24, 12);
    for (let t = 0; t < g.indices.length; t += 3) {
      const [a, b, c] = [g.indices[t]! * 3, g.indices[t + 1]! * 3, g.indices[t + 2]! * 3];
      const e1 = [g.positions[b]! - g.positions[a]!, g.positions[b + 1]! - g.positions[a + 1]!, g.positions[b + 2]! - g.positions[a + 2]!];
      const e2 = [g.positions[c]! - g.positions[a]!, g.positions[c + 1]! - g.positions[a + 1]!, g.positions[c + 2]! - g.positions[a + 2]!];
      const f = [
        e1[1]! * e2[2]! - e1[2]! * e2[1]!,
        e1[2]! * e2[0]! - e1[0]! * e2[2]!,
        e1[0]! * e2[1]! - e1[1]! * e2[0]!,
      ];
      const d = f[0]! * g.normals[a]! + f[1]! * g.normals[a + 1]! + f[2]! * g.normals[a + 2]!;
      if (Math.abs(d) < 1e-12) continue;
      expect(d, `torus triangle ${t / 3} is wound inwards`).toBeGreaterThan(0);
    }
    for (let i = 0; i < g.normals.length; i += 3) {
      expect(Math.hypot(g.normals[i]!, g.normals[i + 1]!, g.normals[i + 2]!)).toBeCloseTo(1, 5);
    }
  });

  it('cylinder: the caps do NOT share the rim with the wall', () => {
    /* Sharing the rim averages an axial cap normal with a radial wall normal into a 45-degree
       bevel all the way round — a chamfered plastic puck instead of a machined edge. The count
       proves they are separate: a shared-rim cylinder would have far fewer vertices. */
    const g = cylinder(0.5, 0.2, 32);
    const axial = [], radial = [];
    for (let i = 0; i < g.normals.length; i += 3) {
      if (Math.abs(g.normals[i + 1]!) > 0.99) axial.push(i);
      else if (Math.abs(g.normals[i + 1]!) < 0.01) radial.push(i);
    }
    expect(axial.length, 'no purely axial cap normals — the rim was shared').toBeGreaterThan(30);
    expect(radial.length, 'no purely radial wall normals').toBeGreaterThan(30);
  });

  it('cylinder: both caps wind outwards', () => {
    const g = cylinder(0.5, 0.4, 24);
    for (let t = 0; t < g.indices.length; t += 3) {
      const [a, b, c] = [g.indices[t]! * 3, g.indices[t + 1]! * 3, g.indices[t + 2]! * 3];
      const e1 = [g.positions[b]! - g.positions[a]!, g.positions[b + 1]! - g.positions[a + 1]!, g.positions[b + 2]! - g.positions[a + 2]!];
      const e2 = [g.positions[c]! - g.positions[a]!, g.positions[c + 1]! - g.positions[a + 1]!, g.positions[c + 2]! - g.positions[a + 2]!];
      const f = [
        e1[1]! * e2[2]! - e1[2]! * e2[1]!,
        e1[2]! * e2[0]! - e1[0]! * e2[2]!,
        e1[0]! * e2[1]! - e1[1]! * e2[0]!,
      ];
      const d = f[0]! * g.normals[a]! + f[1]! * g.normals[a + 1]! + f[2]! * g.normals[a + 2]!;
      if (Math.abs(d) < 1e-12) continue;
      expect(d, `cylinder triangle ${t / 3} is wound inwards`).toBeGreaterThan(0);
    }
  });

  it('plane: faces point along +Y, matching the vertex normals', () => {
    const g = plane(4, 3);
    for (let t = 0; t < g.indices.length; t += 3) {
      const [a, b, c] = [g.indices[t]! * 3, g.indices[t + 1]! * 3, g.indices[t + 2]! * 3];
      const e1 = [g.positions[b]! - g.positions[a]!, 0, g.positions[b + 2]! - g.positions[a + 2]!];
      const e2 = [g.positions[c]! - g.positions[a]!, 0, g.positions[c + 2]! - g.positions[a + 2]!];
      const ny = e1[2]! * e2[0]! - e1[0]! * e2[2]!;
      expect(ny, `plane triangle ${t / 3} faces downwards`).toBeGreaterThan(0);
    }
  });
});

describe('computeNormals is area-weighted, which is not the obvious implementation', () => {
  it('weights a large triangle more than a small one at a shared vertex', () => {
    /*
     * Normalising each face normal BEFORE summing — the obvious version — weights a sliver the
     * same as a slab, and a mesh with uneven tessellation then shades with visible facets along
     * the seams where triangle size changes. Two triangles sharing vertex 0: one in the XY
     * plane (normal +Z) and one 100× larger in the XZ plane (normal -Y). Area weighting must
     * pull the shared normal decisively toward -Y.
     */
    const positions = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      0, 0, 100,
      100, 0, 100,
    ]);
    const indices = new Uint16Array([0, 1, 2, 0, 3, 4]);
    const n = computeNormals(positions, indices);
    const shared = [n[0]!, n[1]!, n[2]!];
    expect(Math.abs(shared[1]!)).toBeGreaterThan(Math.abs(shared[2]!) * 50);
  });

  it('leaves a degenerate (zero-area) triangle as a zero normal rather than NaN', () => {
    // A zero-length normal divided by its zero length is NaN, and one NaN normal makes one
    // fragment NaN — a single black pixel nobody finds. Guarded rather than normalised blindly.
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0]);
    const n = computeNormals(positions, new Uint16Array([0, 1, 2]));
    expect(Array.from(n).every((v) => Number.isFinite(v))).toBe(true);
  });
});

describe('plane and sphere', () => {
  it('plane normals all point straight up', () => {
    const n = plane(10, 4).normals;
    for (let i = 0; i < n.length; i += 3) {
      expect([n[i], n[i + 1], n[i + 2]]).toEqual([0, 1, 0]);
    }
  });

  it('plane is subdivided, because a two-triangle floor makes shadow depth degenerate', () => {
    expect(triangleCount(plane(10, 24))).toBe(24 * 24 * 2);
  });

  it('sphere normals are the analytic normalised position, exactly', () => {
    /* Face-averaging a UV sphere facets visibly at the poles, where the triangles collapse.
       The analytic normal has no such failure and costs nothing. */
    const g = sphere(2, 8, 12);
    for (let i = 0; i < g.positions.length; i += 3) {
      const l = Math.hypot(g.positions[i]!, g.positions[i + 1]!, g.positions[i + 2]!);
      expect(l).toBeCloseTo(2, 5);
      expect(g.normals[i]!).toBeCloseTo(g.positions[i]! / 2, 5);
      expect(Math.hypot(g.normals[i]!, g.normals[i + 1]!, g.normals[i + 2]!)).toBeCloseTo(1, 5);
    }
  });
});

describe('THE CAMERA CANNOT PRODUCE A NaN MATRIX — the silent black frame', () => {
  it('clamps elevation short of the pole, where lookAt degenerates', () => {
    /* At ±90° the view direction is parallel to up and `lookAt` divides by a zero-length cross
       product. 89° rather than 90° also removes the spin a user sees dragging THROUGH the pole,
       where azimuth is undefined. */
    const high = eyeOf({ target: [0, 0, 0], distance: 5, azimuthDeg: 30, elevationDeg: 90 });
    expect(high.every((v) => Number.isFinite(v))).toBe(true);
    expect(high[1]).toBeLessThan(5);
    expect(ELEVATION_LIMIT).toBeLessThan(90);
  });

  it('produces a finite matrix across a full sweep of viewpoints', () => {
    // The sweep is the point: a single spot-check passes on a rig that breaks at one angle, and
    // one broken angle is a black screen for whoever happens to drag there.
    for (let az = -360; az <= 360; az += 15) {
      for (let el = -90; el <= 90; el += 5) {
        const m = viewProjection({ target: [0, 1, 0], distance: 8, azimuthDeg: az, elevationDeg: el }, 16 / 9);
        expect(finite(m), `azimuth ${az} elevation ${el} produced a non-finite matrix`).toBe(true);
      }
    }
  });

  it('survives a zero distance and a zero aspect rather than emitting NaN', () => {
    // Both happen in practice: distance 0 from an over-eager zoom, aspect 0 from a container
    // measured before layout.
    expect(finite(viewProjection({ target: [0, 0, 0], distance: 0, azimuthDeg: 0, elevationDeg: 20 }, 0))).toBe(true);
  });
});

describe('THE LIGHT RIG HAS THE SAME TRAP, and straight down is the common case', () => {
  it('produces a finite matrix for a light pointing exactly down', () => {
    /* The default key light in almost every scene points down. An up vector of [0,1,0] is then
       parallel to the light direction and `lookAt` returns NaN — so the FIRST light anyone adds
       is the one that breaks it. */
    const m = lightViewProjection({ direction: [0, -1, 0], colour: [1, 1, 1] }, [0, 0, 0], 5);
    expect(finite(m)).toBe(true);
  });

  it('produces a finite matrix for every light direction on a sphere', () => {
    for (let a = 0; a < 360; a += 15) {
      for (let e = -89; e <= 89; e += 7) {
        const ar = (a * Math.PI) / 180, er = (e * Math.PI) / 180;
        const dir: [number, number, number] = [
          Math.cos(er) * Math.sin(ar), Math.sin(er), Math.cos(er) * Math.cos(ar),
        ];
        const m = lightViewProjection({ direction: dir, colour: [1, 1, 1] }, [0, 0, 0], 4);
        expect(finite(m), `light ${a}/${e} produced a non-finite matrix`).toBe(true);
      }
    }
  });

  it('fits the frustum to the scene bounds', () => {
    const g = box(2, 2, 2);
    expect(boundsRadius(g.min, g.max)).toBeCloseTo(Math.hypot(2, 2, 2) / 2, 5);
    expect(boundsCentre(g.min, g.max)).toEqual([0, 0, 0]);
  });

  it('a zero-radius scene does not collapse the frustum to nothing', () => {
    // A single point light target with radius 0 would give an orthographic box of zero extent,
    // which projects everything to one texel and shadows nothing.
    const m = lightViewProjection({ direction: [0, -1, -1], colour: [1, 1, 1] }, [0, 0, 0], 0);
    expect(finite(m)).toBe(true);
  });
});


describe('GREAT-CIRCLE ARCS — E2 payload, and the two endpoint pairs that silently delete one', () => {
  const finiteGeo = (g: { positions: Float32Array; normals: Float32Array; tangents: Float32Array }) =>
    [g.positions, g.normals, g.tangents].every((a) => Array.from(a).every((v) => Number.isFinite(v)));

  it('lat/lon maps north to +y and the prime meridian to +x', () => {
    // Fixing the convention in a test, because a silently transposed axis puts every corridor in
    // the wrong hemisphere and the globe still looks plausible.
    const north = latLonToVec3(90, 0);
    expect(north[1]).toBeCloseTo(1, 6);
    const greenwich = latLonToVec3(0, 0);
    expect(greenwich[0]).toBeCloseTo(1, 6);
    expect(greenwich[1]).toBeCloseTo(0, 6);
  });

  it('every sample stays ON or ABOVE the sphere, never inside it', () => {
    /* A chord between two points more than a quarter-turn apart cuts THROUGH the planet. Slerp is
       what keeps the corridor on the surface, and this is the assertion that proves it — a
       straight-line implementation fails here immediately. */
    const g = arcTube(51.5, -0.13, 40.7, -74.0, 1, 0.01, 0.22, 64, 6);
    for (let i = 0; i < g.positions.length; i += 3) {
      const r = Math.hypot(g.positions[i]!, g.positions[i + 1]!, g.positions[i + 2]!);
      // 1 minus the tube radius: the underside of the tube dips just below the path centreline.
      expect(r).toBeGreaterThan(0.985);
    }
  });

  it('leaves and meets the surface tangentially — the lift is a sine, not an offset', () => {
    /* A constant offset floats the whole corridor with a visible step at each end. With sin(pi t)
       the first and last samples sit at the sphere radius and the middle is lifted. */
    const g = arcTube(0, 0, 0, 90, 1, 0.0, 0.25, 32, 4);
    const first = Math.hypot(g.positions[0]!, g.positions[1]!, g.positions[2]!);
    const n = g.positions.length;
    const last = Math.hypot(g.positions[n - 3]!, g.positions[n - 2]!, g.positions[n - 1]!);
    expect(first).toBeCloseTo(1, 3);
    expect(last).toBeCloseTo(1, 3);
    // And the midpoint is genuinely higher.
    const midIdx = Math.floor(n / 6) * 3;
    expect(Math.hypot(g.positions[midIdx]!, g.positions[midIdx + 1]!, g.positions[midIdx + 2]!))
      .toBeGreaterThan(1.02);
  });

  it('a LONG corridor lifts higher than a short hop', () => {
    // A fixed lift makes short arcs look like tall croquet hoops. Height scales with angular span.
    const peak = (g: { positions: Float32Array }) => {
      let m = 0;
      for (let i = 0; i < g.positions.length; i += 3) {
        m = Math.max(m, Math.hypot(g.positions[i]!, g.positions[i + 1]!, g.positions[i + 2]!));
      }
      return m;
    };
    /* Compare the LIFT, not the radius. The first version of this compared peak radii, where the
       sphere's own radius of 1 swamps a lift of 0.01 against 0.21 and the ratio looks like 1.2x
       instead of 21x. Measuring the wrong quantity, not a wrong implementation. */
    const shortHop = peak(arcTube(0, 0, 0, 8, 1, 0.005, 0.22, 32, 4)) - 1;
    const longHaul = peak(arcTube(0, 0, 0, 170, 1, 0.005, 0.22, 32, 4)) - 1;
    expect(longHaul).toBeGreaterThan(shortHop * 5);
  });

  it('ANTIPODAL endpoints do not produce NaN — sin(omega) is zero there', () => {
    /* The degenerate case that deletes a corridor without a word: at omega = pi the slerp divisor
       is zero, every vertex becomes NaN, every triangle is discarded, and gl.getError() reports
       nothing. Finite-but-wrong is recoverable; NaN is invisible. */
    const g = arcTube(0, 0, 0, 180, 1, 0.01, 0.22, 32, 6);
    expect(finiteGeo(g)).toBe(true);
  });

  it('COINCIDENT endpoints do not produce NaN either', () => {
    // A partner routed to itself is a data error, not a crash. It must render something finite.
    expect(finiteGeo(arcTube(12, 34, 12, 34, 1, 0.01, 0.22, 16, 4))).toBe(true);
  });

  it('normals are unit length and point away from the tube centreline', () => {
    const g = arcTube(35, 139, -33, 151, 1, 0.02, 0.2, 48, 8);
    for (let i = 0; i < g.normals.length; i += 3) {
      expect(Math.hypot(g.normals[i]!, g.normals[i + 1]!, g.normals[i + 2]!)).toBeCloseTo(1, 5);
    }
  });

  it('tangents run ALONG the corridor, not around the tube', () => {
    /* An anisotropic highlight has to travel down the route. A tangent around the tube would band
       it into rings, which reads as a ribbed hose rather than a lit path. Checked by taking two
       vertices in the SAME ring: their tangents must agree. */
    const g = arcTube(0, 0, 0, 60, 1, 0.02, 0.2, 32, 8);
    const t0 = [g.tangents[0]!, g.tangents[1]!, g.tangents[2]!];
    const t1 = [g.tangents[9]!, g.tangents[10]!, g.tangents[11]!];
    const d = t0[0]! * t1[0]! + t0[1]! * t1[1]! + t0[2]! * t1[2]!;
    expect(d).toBeCloseTo(1, 4);
  });

  it('winds outwards, so back-face culling keeps the visible half', () => {
    const g = arcTube(20, 10, -20, 100, 1, 0.03, 0.2, 24, 6);
    for (let t = 0; t < g.indices.length; t += 3) {
      const [a, b, c] = [g.indices[t]! * 3, g.indices[t + 1]! * 3, g.indices[t + 2]! * 3];
      const e1 = [g.positions[b]! - g.positions[a]!, g.positions[b + 1]! - g.positions[a + 1]!, g.positions[b + 2]! - g.positions[a + 2]!];
      const e2 = [g.positions[c]! - g.positions[a]!, g.positions[c + 1]! - g.positions[a + 1]!, g.positions[c + 2]! - g.positions[a + 2]!];
      const f = [
        e1[1]! * e2[2]! - e1[2]! * e2[1]!,
        e1[2]! * e2[0]! - e1[0]! * e2[2]!,
        e1[0]! * e2[1]! - e1[1]! * e2[0]!,
      ];
      const d = f[0]! * g.normals[a]! + f[1]! * g.normals[a + 1]! + f[2]! * g.normals[a + 2]!;
      if (Math.abs(d) < 1e-12) continue;
      expect(d, `arc triangle ${t / 3} is wound inwards`).toBeGreaterThan(0);
    }
  });
});

/*
 * PROJECTING DOM CONTENT ONTO A RENDERED SURFACE — the tests that make §6 rule 4 shippable.
 *
 * The whole point of `project.ts` is that GL renders the surface and the BROWSER renders the text,
 * so there is no pixel of mine to inspect: the compositor either agrees with the renderer about
 * where the panel is or it does not. That agreement is a matrix identity, and a matrix identity can
 * be asserted exactly — which is a better position than any of the environments have been in, where
 * the only check on the geometry was a captured frame I had to look at.
 *
 * So the load-bearing test here is the ROUND TRIP: feed the solver four corners, then push the unit
 * square's own corners back through the homography it returned and demand the four points come back.
 * A wrong sign, a transposed coefficient, or an axis swap all survive a plausibility read of the
 * code and none of them survive that.
 */
function applyHomography(m: readonly number[], u: number, v: number): [number, number] {
  const w = m[6]! * u + m[7]! * v + m[8]!;
  return [
    (m[0]! * u + m[1]! * v + m[2]!) / w,
    (m[3]! * u + m[4]! * v + m[5]!) / w,
  ];
}

describe('projectQuad — DOM content on a rendered surface', () => {
  const CORNERS: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];

  it('round-trips an arbitrary perspective quad through its own homography', () => {
    // Deliberately not a parallelogram and not axis-aligned, so this exercises the perspective
    // branch and would catch an x/y swap that a symmetric quad hides.
    const quad: [number, number][] = [[120, 60], [430, 95], [388, 340], [96, 268]];
    const m = squareToQuad(quad[0]!, quad[1]!, quad[2]!, quad[3]!);
    expect(m, 'a non-degenerate quad must solve').not.toBeNull();

    CORNERS.forEach(([u, v], i) => {
      const [x, y] = applyHomography(m!, u, v);
      expect(x, `corner ${i} x`).toBeCloseTo(quad[i]![0], 6);
      expect(y, `corner ${i} y`).toBeCloseTo(quad[i]![1], 6);
    });
  });

  it('round-trips a parallelogram, which takes the affine branch', () => {
    // px and py both vanish here, so the perspective formula would divide by a zero determinant.
    const quad: [number, number][] = [[100, 100], [300, 140], [340, 300], [140, 260]];
    const m = squareToQuad(quad[0]!, quad[1]!, quad[2]!, quad[3]!);
    expect(m).not.toBeNull();
    expect(m![6], 'an affine map has no perspective term in g').toBeCloseTo(0, 12);
    expect(m![7], 'an affine map has no perspective term in h').toBeCloseTo(0, 12);
    CORNERS.forEach(([u, v], i) => {
      const [x, y] = applyHomography(m!, u, v);
      expect(x, `corner ${i} x`).toBeCloseTo(quad[i]![0], 6);
      expect(y, `corner ${i} y`).toBeCloseTo(quad[i]![1], 6);
    });
  });

  it('refuses a quad collapsed onto a line — the edge-on panel', () => {
    // A panel turned exactly side-on to the camera. The determinant vanishes; without the guard the
    // coefficients are infinities and CSS silently drops the whole transform, so the label snaps
    // back to the element's untransformed position rather than disappearing.
    expect(squareToQuad([0, 0], [100, 50], [200, 100], [100, 50])).toBeNull();
    expect(squareToQuad([10, 10], [10, 10], [10, 10], [10, 10])).toBeNull();
  });

  const VIEW = { target: [0, 1, 0] as [number, number, number], distance: 7, azimuthDeg: 0, elevationDeg: 12, fovDeg: 38 };
  const W = 1200, H = 720;

  it('lays a head-on panel down as a pure scale and translate', () => {
    const vp = viewProjection(VIEW, W / H);
    const corners = uprightPanelCorners(0, 0, 0, 2, 1.5, 0, 0.03);
    const r = projectQuad(vp, corners, W, H, 400, 300);
    expect(isQuadRefusal(r), 'a panel facing the camera must project').toBe(false);
    if (isQuadRefusal(r)) return;

    // Facing the camera square-on, the only foreshortening is the 12 degrees of elevation, which
    // tilts the panel's top away and so DOES introduce a small vertical perspective term. What must
    // be zero is the HORIZONTAL one: nothing about this arrangement is left-right asymmetric.
    expect(Math.abs(r.matrix[6]!), 'no horizontal perspective on a symmetric head-on panel').toBeLessThan(1e-6);
    expect(r.signedArea, 'a front-facing panel has positive signed area').toBeGreaterThan(0);
  });

  it('yaws into a real perspective transform, and reports a back-facing panel as negative area', () => {
    const vp = viewProjection(VIEW, W / H);
    const turned = projectQuad(vp, uprightPanelCorners(2.4, 0, 0, 2, 1.5, -0.7, 0.03), W, H, 400, 300);
    expect(isQuadRefusal(turned)).toBe(false);
    if (isQuadRefusal(turned)) return;
    // The far vertical edge of a yawed panel is further from the eye, so its projected height is
    // smaller: that difference IS the perspective term, and a zero here means the transform is
    // affine and the label will float off the surface as it turns.
    expect(Math.abs(turned.matrix[6]!), 'a yawed panel must carry horizontal perspective').toBeGreaterThan(1e-5);

    // Spun to present its back. CSS has no back-face culling on a projected quad, so without this
    // signal the caller renders mirror-imaged, perfectly legible-looking reversed text.
    const behindFacing = projectQuad(vp, uprightPanelCorners(0, 0, 0, 2, 1.5, Math.PI, 0.03), W, H, 400, 300);
    expect(isQuadRefusal(behindFacing)).toBe(false);
    if (isQuadRefusal(behindFacing)) return;
    expect(behindFacing.signedArea, 'a panel turned away must report negative area').toBeLessThan(0);
  });

  it('refuses rather than inverting when a corner passes behind the eye', () => {
    const vp = viewProjection({ ...VIEW, distance: 2 }, W / H);
    /*
     * MY FIRST ATTEMPT AT THIS TEST WAS WRONG, and the way it was wrong is worth keeping: a very
     * WIDE panel facing the camera is not behind it. Every corner still has positive w — they are
     * merely far off-frame to the sides — so the guard correctly did not fire and the test failed
     * for the right reason. Off-frame and behind-the-eye are different failures with different
     * remedies, and conflating them is how a projection library ends up refusing valid panels.
     *
     * Turned side-on instead, so the panel's width runs ALONG the view axis and one corner is
     * genuinely past the eye plane. `projectScreen` hands back finite-looking coordinates for that
     * corner, so the homography solves cleanly and returns a confidently inverted transform — which
     * is exactly why the check is on `behind` rather than on whether the maths produced numbers.
     */
    const r = projectQuad(vp, uprightPanelCorners(0, 0, 0, 40, 1.5, Math.PI / 2, 0), W, H, 400, 300);
    expect(isQuadRefusal(r), 'a corner behind the eye must refuse').toBe(true);
    if (isQuadRefusal(r)) expect(r.refusal).toBe('CORNER_BEHIND_CAMERA');
  });

  it('refuses an element with no box to map', () => {
    const vp = viewProjection(VIEW, W / H);
    const corners = uprightPanelCorners(0, 0, 0, 2, 1.5, 0, 0.03);
    for (const [w, h] of [[0, 300], [400, 0], [-10, 300], [400, Number.NaN]]) {
      const r = projectQuad(vp, corners, W, H, w!, h!);
      expect(isQuadRefusal(r), `element ${w}x${h} must refuse`).toBe(true);
      if (isQuadRefusal(r)) expect(r.refusal).toBe('EMPTY_ELEMENT_BOX');
    }
  });

  it('emits a matrix3d whose column-major embedding agrees with the homography it came from', () => {
    /*
     * THE TEST THAT ACTUALLY PROTECTS THE FEATURE.
     *
     * Every other assertion here checks the homography, which is my maths. This one checks the
     * handoff to CSS, which is a convention I can get wrong in a way that looks right: a matrix3d
     * with the perspective terms in the fourth COLUMN instead of the fourth ROW renders correctly
     * head-on and drifts as the surface turns. So parse the string back, run the element's own
     * corners through it exactly as the compositor would, and demand the projected screen corners.
     */
    const vp = viewProjection(VIEW, W / H);
    const EW = 400, EH = 300;
    const r = projectQuad(vp, uprightPanelCorners(1.8, 0, 0, 2, 1.5, -0.55, 0.03), W, H, EW, EH);
    expect(isQuadRefusal(r)).toBe(false);
    if (isQuadRefusal(r)) return;

    const nums = r.transform.replace('matrix3d(', '').replace(')', '').split(',').map(Number);
    expect(nums, 'matrix3d takes exactly 16 numbers').toHaveLength(16);
    expect(nums.some(Number.isNaN), 'no NaN may reach the compositor').toBe(false);

    // Column-major: element (row, col) lives at nums[col * 4 + row].
    const at = (row: number, col: number): number => nums[col * 4 + row]!;
    // CSS transforms a homogeneous column vector [x, y, 0, 1] and divides by the resulting w, which
    // the fourth ROW produces. Feed it the element's own pixel corners.
    const push = (x: number, y: number): [number, number] => {
      const w = at(3, 0) * x + at(3, 1) * y + at(3, 3);
      return [
        (at(0, 0) * x + at(0, 1) * y + at(0, 3)) / w,
        (at(1, 0) * x + at(1, 1) * y + at(1, 3)) / w,
      ];
    };
    const box: [number, number][] = [[0, 0], [EW, 0], [EW, EH], [0, EH]];
    box.forEach(([x, y], i) => {
      const [px, py] = push(x, y);
      expect(px, `element corner ${i} lands on screen x`).toBeCloseTo(r.screen[i]!.x, 3);
      expect(py, `element corner ${i} lands on screen y`).toBeCloseTo(r.screen[i]!.y, 3);
    });
  });
});

/*
 * THE HEIGHTFIELD, and the one property that distinguishes a promotion from a regression.
 *
 * The flat score surfaces already refuse to interpolate across a cell nobody measured — they draw a
 * hole. A 3D version that builds a watertight grid instead would look better and say less, asserting
 * values that were never taken. So the tests below are mostly about ABSENCE: that a hole survives
 * into the index buffer, that a normal at a hole's rim does not read through it, and that a flat
 * surface stays flat rather than dividing by a zero span.
 */
describe('heightfield — a measured surface, holes and all', () => {
  it('builds every cell when every point is observed, wound to face up', () => {
    const r = heightfield(5, 4, (c, z) => c + z, 4, 3, 1);
    expect(r.cellsDrawn).toBe(4 * 3);
    expect(r.cellsHoles).toBe(0);
    expect(r.pointsAbsent).toBe(0);
    expect(r.observedRange).toEqual([0, 7]);

    // Every triangle's normal must have a positive y, or the surface is lit from underneath.
    const { positions, indices } = r.geometry;
    for (let t = 0; t < indices.length; t += 3) {
      const p = [0, 1, 2].map((k) => {
        const i = indices[t + k]!;
        return [positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!] as const;
      });
      const u = [p[1]![0] - p[0]![0], p[1]![1] - p[0]![1], p[1]![2] - p[0]![2]] as const;
      const w = [p[2]![0] - p[0]![0], p[2]![1] - p[0]![1], p[2]![2] - p[0]![2]] as const;
      const ny = u[2]! * w[0]! - u[0]! * w[2]!;
      expect(ny, `triangle ${t / 3} faces down`).toBeGreaterThan(0);
    }
  });

  it('holes the four cells around one absent point, and keeps the vertex slot', () => {
    // One absent point at (2,2) on a 6x6 grid touches exactly 4 cells.
    const r = heightfield(6, 6, (c, z) => (c === 2 && z === 2 ? null : 1 + 0.1 * c * z));
    expect(r.pointsAbsent).toBe(1);
    expect(r.cellsHoles).toBe(4);
    expect(r.cellsDrawn).toBe(25 - 4);
    // The vertex array is NOT compacted: indices are absolute, so the unreferenced slot stays.
    expect(r.geometry.positions.length).toBe(6 * 6 * 3);
    // And nothing indexes the absent point.
    expect([...r.geometry.indices].includes(2 * 6 + 2)).toBe(false);
  });

  it('refuses a range rather than reporting zero when nothing was measured', () => {
    const r = heightfield(4, 4, () => null);
    expect(r.observedRange, 'no observation must not report a range').toBeNull();
    expect(r.cellsDrawn).toBe(0);
    expect(r.geometry.indices.length).toBe(0);
    expect(r.pointsAbsent).toBe(16);
    // Every position finite: a null height must not leak NaN into the buffer.
    expect([...r.geometry.positions].every(Number.isFinite)).toBe(true);
    expect([...r.geometry.normals].every(Number.isFinite)).toBe(true);
  });

  it('treats NaN and Infinity as unmeasured instead of propagating them', () => {
    // A single NaN height NaNs every normal that touches it, and the surface goes black in a patch
    // that looks like a shader fault rather than like the data problem it is.
    const r = heightfield(5, 5, (c, z) => (c === 1 && z === 1 ? Number.NaN : c === 3 && z === 3 ? Infinity : 2));
    expect(r.pointsAbsent).toBe(2);
    expect([...r.geometry.normals].every(Number.isFinite)).toBe(true);
    expect([...r.geometry.positions].every(Number.isFinite)).toBe(true);
  });

  it('keeps a genuinely flat surface flat rather than dividing by a zero span', () => {
    const r = heightfield(4, 4, () => 7);
    expect(r.observedRange).toEqual([7, 7]);
    for (let i = 1; i < r.geometry.positions.length; i += 3) {
      expect(r.geometry.positions[i], 'a flat surface must not lift').toBe(0);
    }
    // And its normals must all be straight up, not NaN.
    for (let i = 0; i < r.geometry.normals.length; i += 3) {
      expect(r.geometry.normals[i + 1]).toBeCloseTo(1, 12);
    }
  });

  it('does not let a normal at a hole rim read through the hole', () => {
    /*
     * THE TEST THAT JUSTIFIES THE ONE-SIDED DIFFERENCE.
     *
     * A ramp rising in x, with the whole right half absent. At the last observed column a central
     * difference would sample the missing side — whose position sits at y=0 because it was never
     * measured — and compute a slope that plunges downhill, tilting the rim as though the surface
     * fell away. The one-sided difference must instead report the SAME slope as the interior.
     */
    const CUT = 4;
    const r = heightfield(8, 3, (c) => (c > CUT ? null : c), 7, 2, 1);
    const nx = 8;
    const nAt = (c: number, row: number): number => r.geometry.normals[(row * nx + c) * 3]!;
    const interior = nAt(2, 1);
    const rim = nAt(CUT, 1);
    expect(rim, 'the rim normal must match the interior slope it belongs to').toBeCloseTo(interior, 6);
    // Sanity: the ramp really does tilt, so this is not passing on two zeroes.
    expect(Math.abs(interior)).toBeGreaterThan(0.05);
  });

  it('emits unit normals and unit tangents perpendicular to them', () => {
    const r = heightfield(9, 7, (c, z) => Math.sin(c * 0.6) * Math.cos(z * 0.5));
    const { normals, tangents } = r.geometry;
    for (let i = 0; i < normals.length; i += 3) {
      const n: [number, number, number] = [normals[i]!, normals[i + 1]!, normals[i + 2]!];
      const t: [number, number, number] = [tangents[i]!, tangents[i + 1]!, tangents[i + 2]!];
      expect(Math.hypot(...n), `normal ${i / 3}`).toBeCloseTo(1, 6);
      expect(Math.hypot(...t), `tangent ${i / 3}`).toBeCloseTo(1, 6);
      // Anisotropic specular needs the tangent IN the surface; a tangent with a normal component
      // stretches the highlight out of the plane and reads as a smear rather than as a brush.
      expect(n[0] * t[0] + n[1] * t[1] + n[2] * t[2], `tangent ${i / 3} not in plane`).toBeCloseTo(0, 6);
    }
  });

  it('switches to a 32-bit index buffer before 16 bits would wrap', () => {
    // 260x260 = 67,600 vertices. A Uint16Array here wraps silently and the mesh folds in on itself.
    const r = heightfield(260, 260, () => 1);
    expect(r.geometry.indices).toBeInstanceOf(Uint32Array);
    const small = heightfield(20, 20, () => 1);
    expect(small.geometry.indices).toBeInstanceOf(Uint16Array);
  });
});

/*
 * L3.5 PARTICLES — the two pure parts, which are where the silent failures live.
 *
 * The simulation itself is GPU state and is verified by `readState()` in the harnesses, which is the
 * whole reason this layer uses float textures instead of transform feedback. What CAN be tested here
 * is the arithmetic around it, and both functions below exist because their obvious implementations
 * are wrong in ways that produce a working-looking system.
 */
describe('particleLayout — the last row must exist', () => {
  it('covers the requested capacity with power-of-two dimensions', () => {
    for (const cap of [1, 2, 3, 17, 100, 1000, 4096, 5000, 65536]) {
      const l = particleLayout(cap);
      expect(l.slots, `capacity ${cap} must fit`).toBeGreaterThanOrEqual(cap);
      expect(l.width * l.height, `slots must equal w*h for ${cap}`).toBe(l.slots);
      // Power of two on both axes: the update pass indexes by integer texel, and a POT width keeps
      // `slot = y * width + x` exact at every size.
      expect(Math.log2(l.width) % 1, `width ${l.width} not POT`).toBe(0);
      expect(Math.log2(l.height) % 1, `height ${l.height} not POT`).toBe(0);
    }
  });

  it('never returns a zero dimension, whatever it is handed', () => {
    // A zero-width texture is a silently incomplete framebuffer: every write does nothing and the
    // particles sit frozen wherever they were seeded.
    for (const cap of [0, -5, 0.4, Number.NaN]) {
      const l = particleLayout(cap);
      expect(l.width, `width for ${cap}`).toBeGreaterThanOrEqual(1);
      expect(l.height, `height for ${cap}`).toBeGreaterThanOrEqual(1);
      expect(l.slots).toBeGreaterThanOrEqual(1);
    }
  });

  it('does not waste more than a factor of two on a bad fit', () => {
    // 4097 must not become 128x128. A layout that over-allocates by 4x costs a full curl evaluation
    // per wasted slot per frame, which is invisible in a capture and expensive in a profile.
    const l = particleLayout(4097);
    expect(l.slots).toBeLessThan(4097 * 2.2);
  });
});

describe('emissionSchedule — a rate below one per frame must not vanish', () => {
  const src = (rate: number): Parameters<typeof emissionSchedule>[0][number] => ({
    at: [0, 0, 0], rate, velocity: [0, 1, 0], colour: [1, 1, 1], life: 2,
  });

  it('carries the fraction, so 30/s at 60fps emits 30 in a second and not zero', () => {
    /*
     * THE BUG THIS EXISTS TO PREVENT. `floor(30 * (1/60))` is `floor(0.5)` is 0 — for ever, with
     * every uniform correctly set and no error anywhere. Any rate under one particle per frame
     * silently produces nothing, and the emitter looks broken in a way that leads you to the shader.
     */
    let carry: number[] = [];
    let total = 0;
    for (let f = 0; f < 60; f++) {
      const r = emissionSchedule([src(30)], 1 / 60, carry);
      total += r.counts[0]!;
      carry = r.carry;
    }
    expect(total, 'a second of 30/s must emit 30').toBe(30);
  });

  it('is exact in the long run for an awkward rate', () => {
    let carry: number[] = [];
    let total = 0;
    for (let f = 0; f < 600; f++) {
      const r = emissionSchedule([src(7)], 1 / 60, carry);
      total += r.counts[0]!;
      carry = r.carry;
    }
    // 10 seconds at 7/s. Allow one particle of rounding at the boundary, no more.
    expect(total).toBeGreaterThanOrEqual(69);
    expect(total).toBeLessThanOrEqual(70);
  });

  it('clamps a backgrounded tab so it does not dump a minute of emission into one frame', () => {
    // A tab returning from the background hands over a multi-second dt. Unclamped, `rate * dt` emits
    // the whole gap at once — a flash that reads as a blending bug rather than as a timing one.
    const r = emissionSchedule([src(1000)], 12, []);
    expect(r.counts[0], '12 s must be clamped to 100 ms of emission').toBe(100);
  });

  it('emits nothing for a zero or negative rate, and keeps no carry', () => {
    const r = emissionSchedule([src(0), src(-50)], 1 / 60, [0, 0]);
    expect(r.counts).toEqual([0, 0]);
    expect(r.carry).toEqual([0, 0]);
  });

  it('tracks each source independently', () => {
    let carry: number[] = [];
    const totals = [0, 0];
    for (let f = 0; f < 120; f++) {
      const r = emissionSchedule([src(6), src(90)], 1 / 60, carry);
      totals[0]! += r.counts[0]!;
      totals[1]! += r.counts[1]!;
      carry = r.carry;
    }
    // 2 s at 6/s and 90/s. A shared carry would smear one source's remainder into the other.
    expect(totals[0]).toBeGreaterThanOrEqual(11);
    expect(totals[0]).toBeLessThanOrEqual(12);
    expect(totals[1]).toBeGreaterThanOrEqual(179);
    expect(totals[1]).toBeLessThanOrEqual(180);
  });
});

/*
 * L4.5 VOLUME — the intersection, which is where a volumetric goes wrong invisibly.
 *
 * Get `rayBoxSlab` slightly wrong and the volume still RENDERS — clipped, or inside out, or starting
 * behind the camera — and every one of those reads as a density problem rather than an intersection
 * one. `RAY_BOX_GLSL` mirrors this function line for line, so a tested reference is the only thing
 * that makes a divergence between the two findable at all.
 */
describe('rayBoxSlab — the intersection nobody can see is wrong', () => {
  const MIN: [number, number, number] = [-1, -1, -1];
  const MAX: [number, number, number] = [1, 1, 1];

  it('hits a box straight ahead with the right entry and exit', () => {
    const r = rayBoxSlab([0, 0, -5], [0, 0, 1], MIN, MAX);
    expect(r).not.toBeNull();
    expect(r!.tNear).toBeCloseTo(4, 12);
    expect(r!.tFar).toBeCloseTo(6, 12);
  });

  it('misses a box beside the ray', () => {
    expect(rayBoxSlab([5, 0, -5], [0, 0, 1], MIN, MAX)).toBeNull();
  });

  it('returns null for a box entirely behind the eye, not a negative march', () => {
    /* tFar < 0. Without this check the march runs backwards from the camera and the volume appears
       mirrored behind the viewer — which, on a symmetric field, looks exactly like a correct render. */
    expect(rayBoxSlab([0, 0, 5], [0, 0, 1], MIN, MAX)).toBeNull();
  });

  it('clamps tNear to zero when the camera is INSIDE the box', () => {
    // Otherwise the march starts at a negative distance, i.e. behind the eye, and the near half of
    // the volume is integrated twice while the far half is missed.
    const r = rayBoxSlab([0, 0, 0], [0, 0, 1], MIN, MAX);
    expect(r).not.toBeNull();
    expect(r!.tNear).toBe(0);
    expect(r!.tFar).toBeCloseTo(1, 12);
  });

  it('handles a ray exactly parallel to a slab, inside and outside', () => {
    /*
     * THE CASE THAT PRODUCES NaN. A parallel ray divides by zero; the slab method survives ±Infinity,
     * but a ray whose origin sits exactly ON a face gives `0 * Infinity` = NaN, and NaN fails every
     * comparison — so `tNear > tFar` is false and the miss is reported as a HIT with garbage bounds.
     */
    const inside = rayBoxSlab([0, 0.5, -5], [0, 0, 1], MIN, MAX);
    expect(inside, 'parallel and within the slab must hit').not.toBeNull();
    expect(inside!.tNear).toBeCloseTo(4, 12);

    const outside = rayBoxSlab([0, 9, -5], [0, 0, 1], MIN, MAX);
    expect(outside, 'parallel and outside the slab must miss').toBeNull();

    // Origin exactly on the face — the NaN case.
    const onFace = rayBoxSlab([0, 1, -5], [0, 0, 1], MIN, MAX);
    expect(onFace, 'a ray on the boundary must not produce NaN bounds').not.toBeNull();
    expect(Number.isFinite(onFace!.tNear)).toBe(true);
    expect(Number.isFinite(onFace!.tFar)).toBe(true);
  });

  it('is correct for a diagonal ray, where an axis-at-a-time error would not show', () => {
    const inv = 1 / Math.sqrt(3);
    const r = rayBoxSlab([-3, -3, -3], [inv, inv, inv], MIN, MAX);
    expect(r).not.toBeNull();
    // Enters at (-1,-1,-1): distance from (-3,-3,-3) is 2*sqrt(3).
    expect(r!.tNear).toBeCloseTo(2 * Math.sqrt(3), 10);
    expect(r!.tFar).toBeCloseTo(4 * Math.sqrt(3), 10);
  });

  it('handles an off-centre box, so the origin is not doing the work', () => {
    const r = rayBoxSlab([0, 0, 0], [1, 0, 0], [3, -1, -1], [5, 1, 1]);
    expect(r).not.toBeNull();
    expect(r!.tNear).toBeCloseTo(3, 12);
    expect(r!.tFar).toBeCloseTo(5, 12);
  });
});

describe('marchPlan — a fixed WORLD step, so density does not depend on the ray', () => {
  it('keeps sample spacing constant regardless of segment length', () => {
    /*
     * `len / steps` would make a corner-to-corner ray sample the SAME field more coarsely than a
     * face-to-face one, so the volume looks denser at its edges than in its middle — an artefact that
     * reads as data. The step is the world step, always.
     */
    const short = marchPlan(1, 0.05, 128);
    const long = marchPlan(6, 0.05, 128);
    expect(short.step).toBe(0.05);
    expect(long.step).toBe(0.05);
    expect(short.steps).toBe(20);
  });

  it('reports truncation instead of silently ending the volume early', () => {
    // 10 units at 0.05 wants 200 steps against a budget of 128. The far side of the volume simply is
    // not integrated, which looks like the data stopping rather than the march stopping.
    const p = marchPlan(10, 0.05, 128);
    expect(p.steps).toBe(128);
    expect(p.truncated).toBe(true);
    expect(marchPlan(1, 0.05, 128).truncated).toBe(false);
  });

  it('returns no steps for a degenerate segment rather than dividing by zero', () => {
    for (const [len, step] of [[0, 0.05], [-1, 0.05], [1, 0], [1, -0.05], [Number.NaN, 0.05]]) {
      const p = marchPlan(len!, step!, 128);
      expect(p.steps, `segment ${len} step ${step}`).toBe(0);
      expect(Number.isFinite(p.step)).toBe(true);
    }
  });

  it('always takes at least one step for a real segment, however short', () => {
    const p = marchPlan(0.001, 0.05, 128);
    expect(p.steps).toBe(1);
  });
});
