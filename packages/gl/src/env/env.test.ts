import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { hexToLinear } from '../look/colour.js';
import {
  box, plane, sphere, cylinder, torus, arcTube, latLonToVec3, heightfield, computeNormals, triangleCount,
  contourSegments,
} from './mesh.js';
import {
  eyeOf, viewProjection, lightViewProjection, boundsRadius, boundsCentre, ELEVATION_LIMIT,
} from './camera.js';
import { squareToQuad, projectQuad, uprightPanelCorners, isQuadRefusal } from './project.js';
import { particleLayout, emissionSchedule } from './particles.js';
import { rayBoxSlab, marchPlan, lightTransmittanceAlong } from './volume.js';
import { LIT_FRAG } from './lit.js';
import {
  QUALITY_TIERS, qualitySettings, pickQualityTier, prefersMoreContrast, prefersReducedMotion,
  type QualitySettings, type QualityTier,
  shadowMapSizeFor,
} from './quality.js';

/* `volume.ts`'s own text. The self-shadow march is pinned against the TS mirror of it, the same pairing
   `LIT_SOURCE` further down uses: a mirror alone can drift from the shader it claims to mirror, and a
   source match alone proves a string is present and nothing about what it computes. */
const VOLUME_SOURCE = readFileSync(resolve(process.cwd(), 'src/env/volume.ts'), 'utf8');

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

/*
 * E9 · THE QUALITY LADDER. §8 hedged that the ladder might be optional; E0's measurement settled it —
 * 11.328 ms at 2× with depth of field against a 16.6 ms budget is 5.3 ms of headroom on the fastest machine
 * this will ever run on. The tests below are about the two things a ladder gets wrong silently: picking a
 * tier from a number that means nothing, and picking one nobody can reconstruct from the capture.
 */
describe('quality ladder — monotonic, and it refuses rather than guessing', () => {
  it('is monotonically cheaper as it descends, on every axis at once', () => {
    /* A ladder with one axis going the wrong way is worse than no ladder: it makes a lower tier slower on
       some machines, so the fallback for a slow machine is the thing that breaks it. */
    const [min, red, full] = QUALITY_TIERS.map(qualitySettings) as [
      QualitySettings, QualitySettings, QualitySettings,
    ];
    expect(min.dprScale).toBeLessThanOrEqual(red.dprScale);
    expect(red.dprScale).toBeLessThanOrEqual(full.dprScale);
    expect(min.shadowMapSize).toBeLessThan(red.shadowMapSize);
    expect(red.shadowMapSize).toBeLessThan(full.shadowMapSize);
    expect(min.shadowTaps).toBeLessThanOrEqual(red.shadowTaps);
    /* `particleCapacity` and `volumeMaxSteps` WERE ASSERTED HERE, which is how three inert numbers came
       to read as load-bearing: this test made the ladder look monotonic in fields nothing read. Both are
       deleted — see the note above `QualitySettings` for why neither could have been wired without
       changing a reading rather than a cost. Their absence is asserted below, not here. */
    expect(min.volumeLightSteps).toBeLessThanOrEqual(red.volumeLightSteps);
    expect(red.volumeLightSteps).toBeLessThanOrEqual(full.volumeLightSteps);
    // Effects may only be turned OFF going down, never on.
    expect(Number(min.ao)).toBeLessThanOrEqual(Number(red.ao));
    expect(Number(min.dof)).toBeLessThanOrEqual(Number(red.dof));
    expect(Number(red.dof)).toBeLessThanOrEqual(Number(full.dof));
  });

  it('keeps a shadow at the minimum tier', () => {
    /* Not an optimisation left on the table. A scene with no shadow loses contact between object and
       ground, and an object that does not sit on a surface reads as a MISTAKE rather than as a cheaper
       render — worse than a hard-edged shadow by a wide margin. */
    const min = qualitySettings('minimum');
    expect(min.shadowMapSize).toBeGreaterThan(0);
    expect(min.shadowTaps).toBeGreaterThanOrEqual(1);
  });

  it('keeps a self-shadow inside a volumetric at the minimum tier, for the same reason', () => {
    /*
     * `volumeLightSteps` WAS 0 AT THIS TIER and the field's own doc said 0 gives "a flat, volumeless
     * wash" — the identical mistake the shadow-map rule above forbids, shipped one field along.
     * `volume.ts` returns transmittance 1.0 for every sample below one step, so the cloud loses its lit
     * top and dark underside, which that file calls the entire cue that makes a volume read as having
     * volume. A volume with no self-shadow is fog on the lens, not a cheaper volume.
     */
    expect(qualitySettings('minimum').volumeLightSteps).toBeGreaterThanOrEqual(1);
  });

  it('turns volumeLightSteps into a DIFFERENT PICTURE and a DIFFERENT COST at every tier', () => {
    /*
     * THE LAST FIELD IN THE LADDER WITH NO OBSERVABLE TEST, and the assertion above is why that was not
     * good enough: it holds a number, not a consequence. `volumeLightSteps` lives only inside a shader
     * string, so the only thing that had ever asserted it was the ratchet below — which finds the NAME
     * and says so in its own comment. §4.2's finding was that a field reading as a guarantee without
     * being one is worse than no field; a field wired to a uniform no test can see is one step along
     * from that, not a different thing.
     *
     * `lightTransmittanceAlong` in `volume.ts` mirrors `lightTransmittance` in its FRAG line for line,
     * and the source is pinned for that form further down, because either half alone is a test that
     * passes while the shader is wrong.
     *
     * The profile is density(t) = t², so the exact optical depth over [0, L] is L³/3 and the midpoint
     * rule converges on it as the step count rises. A LINEAR profile would have been the obvious choice
     * and would have proved nothing: midpoint is EXACT on a linear integrand at every n, so all three
     * tiers would have returned the identical number and this test would have passed while measuring
     * that the ladder does nothing.
     */
    const L = 2;
    let samples = 0;
    const density = (t: number) => { samples++; return t * t; };
    const exact = Math.exp(-(L ** 3) / 3);

    expect(QUALITY_TIERS.length, 'no tiers to compare').toBe(3);
    const seen = new Map<QualityTier, { t: number; samples: number }>();
    for (const tier of QUALITY_TIERS) {
      samples = 0;
      const t = lightTransmittanceAlong(density, L, qualitySettings(tier).volumeLightSteps);
      seen.set(tier, { t, samples });
    }
    expect(seen.size, 'the sweep recorded nothing').toBe(3);

    for (const [tier, r] of seen) {
      /* A LIT TOP AND A DARK UNDERSIDE, AT EVERY RUNG. This is the assertion that fails if the minimum
         rung goes back to 0: transmittance is then exactly 1 for every sample, the cloud takes no
         self-shadow anywhere, and what is left is fog on the lens. Verified by reverting the rung. */
      expect(r.t, `${tier} returns full transmittance — the volumeless wash`).toBeLessThan(1);
      expect(r.samples, `${tier} takes no density sample at all`).toBeGreaterThanOrEqual(1);
    }

    /* THE COST REALLY DROPS, counted rather than asserted from the declared number: one fetch and one
       exp() per march sample at minimum against six at full. This is the saving §4.2 went looking for,
       and E7 was passing a literal 6 at every tier before this field was wired. */
    expect(seen.get('minimum')!.samples).toBe(1);
    expect(seen.get('reduced')!.samples).toBe(4);
    expect(seen.get('full')!.samples).toBe(6);

    /* AND THE THREE ARE THREE DIFFERENT PICTURES. Distinctness is what makes the field a tier control
       rather than a number nobody can see the effect of. */
    expect(new Set([...seen.values()].map((r) => r.t)).size, 'two tiers render identically').toBe(3);

    /* Descending the ladder must lose ACCURACY, not gain it — otherwise `full` is paying six samples to
       be further from the truth, and the ladder's direction is the wrong way round. */
    const err = (tier: QualityTier) => Math.abs(seen.get(tier)!.t - exact);
    expect(err('full')).toBeLessThan(err('reduced'));
    expect(err('reduced')).toBeLessThan(err('minimum'));
  });

  it('treats a fractional step count as ZERO, which is the trap in reading it as a dial', () => {
    /* The shader takes `int n = int(uLightSteps)`, so 0.5 does not buy half a shadow — it takes the
       `uLightSteps < 1.0` branch and returns full transmittance, the same volumeless wash the minimum
       rung was just moved off. Encoded here so the ladder can never reach it by interpolation. */
    const density = () => 1;
    expect(lightTransmittanceAlong(density, 2, 0)).toBe(1);
    expect(lightTransmittanceAlong(density, 2, 0.5)).toBe(1);
    expect(lightTransmittanceAlong(density, 2, 0.999)).toBe(1);
    expect(lightTransmittanceAlong(density, 2, 1)).toBeLessThan(1);
    /* 4.9 marches FOUR steps, not five and not 4.9 — the truncation, not a rounding. */
    let n = 0;
    lightTransmittanceAlong(() => { n++; return 1; }, 2, 4.9);
    expect(n).toBe(4);
    /* A ray that missed the box, or a camera exactly on a face, is full transmittance and not a
       divide-by-zero: `dl = len / n` with len 0 would make every sample land on the same point. */
    for (const bad of [0, -1, Number.NaN]) {
      expect(lightTransmittanceAlong(density, bad, 6), `segment ${bad}`).toBe(1);
    }
  });

  it('keeps the uniform clamp and the shader loop bound at the SAME 16', () => {
    /*
     * A COUPLING THAT WOULD BRIGHTEN THE VOLUME SILENTLY. `draw` clamps `uLightSteps` to 16 and the
     * march is written `for (int i = 0; i < 16; i++) if (i >= n) break;`. Raise the clamp on its own and
     * `dl` is sized for n steps while only 16 are taken, so the optical depth comes out short by n/16
     * and the cloud gets BRIGHTER the more self-shadow steps it was asked for. Nothing about that looks
     * like a bug in a step count.
     */
    expect(VOLUME_SOURCE).toContain("gl.uniform1f(u('uLightSteps'), Math.min(16, Math.max(0, o.lightSteps ?? 6)))");
    expect(VOLUME_SOURCE).toContain('for (int i = 0; i < 16; i++) {');
    expect(VOLUME_SOURCE).toContain('if (i >= n) break;');
    /* The guard and the arithmetic the mirror above assumes, pinned in the shipped shader text. */
    expect(VOLUME_SOURCE).toContain('if (uLightSteps < 1.0) return 1.0;');
    expect(VOLUME_SOURCE).toContain('int n = int(uLightSteps);');
    expect(VOLUME_SOURCE).toContain('float dl = len / float(n);');
    expect(VOLUME_SOURCE).toContain('tau += sampleDensity(p + toLight * (float(i) + 0.5) * dl) * dl;');
  });

  it('proves volumeLightSteps is the SAFE knob: alpha never sees the self-shadow', () => {
    /*
     * THE WHOLE REASON THIS FIELD SURVIVED THE CULL AND `volumeMaxSteps` DID NOT. A volumetric reading
     * assigns MAGNITUDE to alpha — in E7, accumulated risk between the operator and a given day — so a
     * tier may vary anything that feeds radiance and nothing that feeds alpha. `maxSteps` fed alpha by
     * truncating the march, which is why 48 steps would have shown distant days as less risky than they
     * are; `lightSteps` feeds only the colour term.
     *
     * Asserted on the two statements themselves rather than on a comment, because the failure mode is
     * one edit: multiplying `a` or the alpha accumulation by `tr` would make a shadowed core read as
     * LOWER risk, and the tier would then be changing the data.
     */
    const march = VOLUME_SOURCE.slice(VOLUME_SOURCE.indexOf('vec3 acc = vec3(0.0);'));
    const body = march.slice(0, march.indexOf('frag = vec4(acc, alpha);'));
    expect(body.length, 'the march body was not found — the slice matched nothing').toBeGreaterThan(200);
    const alphaLines = body.split('\n').filter((l) => /\balpha\b\s*(\+?=)/.test(l));
    expect(alphaLines.length, 'no alpha assignments found to check').toBe(2);
    for (const line of alphaLines) {
      expect(line, `alpha must not depend on the self-shadow: ${line.trim()}`).not.toMatch(/\btr\b/);
    }
    /* And `tr` must still reach the radiance term, or the field is inert in the other direction. */
    expect(body).toContain('vec3 lit = col * (uEmission + (1.0 - uEmission) * tr);');
    expect(body).toContain('float a = 1.0 - exp(-d * dt);');
  });

  it('declares only tap counts the renderer can actually take — 1 or 9, nothing between', () => {
    /*
     * `shadowTaps` READS AS A COUNT AND IS A SWITCH. `lit.ts` is two static branches (`if (uShadowTaps
     * < 9)`) and snaps the uniform with `(o.shadowTaps ?? 9) >= 9 ? 9 : 1`, so a rung declaring 4 taps
     * would render one and be reported as four — the §4.2 defect in miniature, a declared number that is
     * not the guarantee it reads as. The snap in `lit.ts` is right; what was missing is anything stopping
     * the ladder from declaring a value the snap has to rewrite.
     *
     * Fails on a rung set to any third value. Verified by setting `reduced` to 4.
     */
    const declared = QUALITY_TIERS.map((t) => qualitySettings(t).shadowTaps);
    expect(declared.length, 'no tiers to check').toBe(3);
    for (const [i, taps] of declared.entries()) {
      expect([1, 9], `${QUALITY_TIERS[i]} declares ${taps}, which lit.ts would snap to ${taps >= 9 ? 9 : 1}`)
        .toContain(taps);
    }
    /* And the snap itself, pinned — if it ever became a dynamic loop bound this ratchet is the thing
       that should be deleted, not worked around. */
    expect(LIT_FRAG).toContain('if (uShadowTaps < 9)');
  });

  it('drops depth of field before resolution, which is the opposite of the instinct', () => {
    // Type and edges live in the resolution; E1 measured the lens as costing four of five readable panels.
    const red = qualitySettings('reduced');
    expect(red.dof, 'DOF must be the first thing to go').toBe(false);
    expect(red.dprScale, 'resolution must survive one tier longer than the lens').toBe(2);
  });

  it('picks the highest tier that fits the budget', () => {
    // A fast machine: probe at minimum costs 0.4 ms, so full is predicted at ~3.5 ms.
    const r = pickQualityTier({ msAtProbeTier: 0.4, probeTier: 'minimum', budgetMs: 16.6 });
    expect(r.tier).toBe('full');
    expect(r.predictedMs.full).toBeLessThan(16.6);
  });

  it('steps down when full will not fit', () => {
    // Probe at minimum costs 2 ms → full ~17.4 ms, over budget; reduced ~7.5 ms, under.
    const r = pickQualityTier({ msAtProbeTier: 2, probeTier: 'minimum', budgetMs: 16.6 });
    expect(r.tier).toBe('reduced');
    expect(r.predictedMs.full).toBeGreaterThan(16.6);
  });

  it('never exceeds what the caller requested, even on a fast machine', () => {
    /* A request may be about LEGIBILITY rather than speed — E1's depth-of-field finding is exactly that
       case — so the ladder is a ceiling the machine lowers, never one it raises. */
    const r = pickQualityTier({ msAtProbeTier: 0.2, probeTier: 'minimum', budgetMs: 16.6, requested: 'reduced' });
    expect(r.tier).toBe('reduced');
  });

  it('returns minimum AND says the budget is unreachable rather than inventing a lower tier', () => {
    const r = pickQualityTier({ msAtProbeTier: 40, probeTier: 'minimum', budgetMs: 16.6 });
    expect(r.tier).toBe('minimum');
    expect(r.reason).toContain('BUDGET_UNREACHABLE');
    // And it points at the remedy that already exists rather than at a tier that does not.
    expect(r.reason).toContain('flat fallback');
  });

  it('REFUSES to choose from a software rasteriser', () => {
    /* The ratio between SwiftShader and real hardware is not a constant, so a tier picked from it is a
       guess wearing a number. This is the same refusal every harness now makes about headroom. */
    const r = pickQualityTier({ msAtProbeTier: 60, probeTier: 'full', budgetMs: 16.6, software: true, requested: 'full' });
    expect(r.tier).toBe('full');
    expect(r.reason).toContain('SOFTWARE_RASTERISER_HAS_NO_FRAME_BUDGET');
    expect(Number.isNaN(r.predictedMs.full)).toBe(true);
  });

  it('reads prefers-contrast, and absence of a request is not a request', () => {
    /*
     * The engine read `prefers-reduced-motion` and NOTHING else. Measured with Playwright's
     * `contrast: 'more'` on E6 and E7: the query matched and every computed colour was byte-identical
     * to the normal run, so a reader who had asked their OS for more contrast still got E6's 1.25:1
     * tick. This asserts the hook, including the default that the captures depend on.
     */
    const w = globalThis as { window?: unknown };
    const had = 'window' in w;
    const original = w.window;
    const stub = (matcher: (q: string) => boolean) => {
      w.window = { matchMedia: (q: string) => ({ matches: matcher(q) }) };
    };
    try {
      stub(() => false);
      expect(prefersMoreContrast(), 'no preference must not opt a reader in').toBe(false);
      stub((q) => q.includes('prefers-contrast: more'));
      expect(prefersMoreContrast()).toBe(true);
      /* Windows High Contrast means the same thing to a renderer and is the query that is actually
         implemented in more places. */
      stub((q) => q.includes('forced-colors: active'));
      expect(prefersMoreContrast()).toBe(true);
      /* An embedded webview that THROWS on one unrecognised feature must not hide the other. */
      w.window = {
        matchMedia: (q: string) => {
          if (q.includes('forced-colors')) throw new Error('unrecognised media feature');
          return { matches: q.includes('prefers-contrast: more') };
        },
      };
      expect(prefersMoreContrast()).toBe(true);
      /* And with no window at all — SSR — it is false, where reduced motion is TRUE. The asymmetry is
         the point: an unwanted still frame costs nothing, an unwanted repaint of the design costs
         every reader who never asked. */
      delete w.window;
      expect(prefersMoreContrast()).toBe(false);
      expect(prefersReducedMotion()).toBe(true);
    } finally {
      if (had) w.window = original; else delete w.window;
    }
  });

  it('REFUSES on an unusable probe instead of treating zero as instant', () => {
    // 0 ms would otherwise imply an infinitely fast machine and select `full` on a machine that hung.
    for (const ms of [0, -1, Number.NaN, Infinity]) {
      const r = pickQualityTier({ msAtProbeTier: ms, probeTier: 'full', budgetMs: 16.6, requested: 'reduced' });
      expect(r.reason, `probe ${ms}`).toContain('NO_USABLE_PROBE');
      expect(r.tier, `probe ${ms}`).toBe('reduced');
    }
  });

  it('predicts the probe tier back as its own measurement', () => {
    // Internal consistency: whatever else the scaling does, it must be the identity at the probe.
    const r = pickQualityTier({ msAtProbeTier: 4.914, probeTier: 'reduced', budgetMs: 16.6 });
    expect(r.predictedMs.reduced).toBeCloseTo(4.914, 2);
  });

  it('declares NO field that nothing reads — the defect §4.2 found four times', () => {
    /*
     * THE RATCHET, AND THE REASON IT PARSES INSTEAD OF LISTING NAMES.
     *
     * `shadowTaps` was declared per tier and read by nothing: the minimum tier paid 9 texture fetches per
     * lit fragment for the 1-tap result it had asked for. Wiring it turned up three more of exactly the
     * same shape — `aoScale`, `particleCapacity`, `volumeMaxSteps` — none of which any of the nine
     * harnesses or eight components touched either, while the monotonicity test above asserted two of
     * them and so made them read as guarantees. Four for four, and every one survived because the check
     * was a reviewer's attention.
     *
     * So the fields are enumerated from the OBJECT rather than hand-listed — a hand-list cannot fail on a
     * field nobody thought of, which is how the first four got in — and each one must appear as a
     * PROPERTY ACCESS somewhere that is not a test. Adding an inert field to the ladder now fails here.
     *
     * WHAT THIS DOES NOT PROVE, stated so nobody reads more into a green: the access it finds may be an
     * unrelated property of the same name — `lit.ts` has its own `o.ao` and `o.shadowTaps` options — so
     * this is a name ratchet, not proof that the TIER's value reaches a uniform. That proof is per-field
     * and lives beside the field: `useQualityTier.test.ts` for the eight components, the harness type
     * check for the nine entries. What this catches, which nothing did, is a field with no reader at all.
     */
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === 'dist' || e.name === '__tests__') continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
      }
      return out;
    };
    const ROOT = resolve(__dirname, '../../../..');
    const corpus = [
      resolve(ROOT, 'packages/gl/src'),
      resolve(ROOT, 'docs/3d'),
      resolve(ROOT, 'apps/web/src/components'),
    ].flatMap((d) => (existsSync(d) ? walk(d) : []))
      .map((f) => ({ file: f.slice(ROOT.length + 1), src: readFileSync(f, 'utf8') }));

    /* NON-EMPTY FIRST. Every assertion below loops over this, so a walk that matched nothing would pass
       the whole test while checking not one field — the exact shape of green this file keeps catching. */
    expect(corpus.length, 'the source walk found no files to check').toBeGreaterThan(100);

    const fields = Object.keys(qualitySettings('full'));
    expect(fields.length, 'the settings object has no fields to check').toBeGreaterThan(3);
    for (const field of fields) {
      /* A property ACCESS, not the word: `quality.ts` writes every field name twice as a declaration and
         as a ladder rung, and neither is a read. `\b` after the name keeps `.ao` off `.aoScale`. */
      const access = new RegExp(`\\.\\s*${field}\\b`);
      const readers = corpus.filter((f) => access.test(f.src)).map((f) => f.file);
      expect(readers.length, `\`${field}\` is declared per tier and read by NOTHING — wire it or delete it`)
        .toBeGreaterThan(0);
    }

    /* And the three that were deleted are GONE, not merely unasserted. A future edit that puts one back
       fails on the loop above; this names them so the failure explains itself. */
    for (const gone of ['aoScale', 'particleCapacity', 'volumeMaxSteps']) {
      expect(fields, `\`${gone}\` was deleted as a fiction — see the note above QualitySettings`)
        .not.toContain(gone);
    }
  });
});

describe('shadowMapSizeFor — the ladder scales a baseline, it does not replace it', () => {
  it('returns the environment\'s OWN size at the full tier', () => {
    /* Wiring the ladder naively used the tier's absolute size and silently enlarged three environments:
       E0, E2 and E8 had each chosen 1024 and were handed 1536 — a 2.25x bigger map and three captures that
       changed without anyone saying so. A ladder that alters the highest tier is a redesign. */
    expect(shadowMapSizeFor('full', 1024)).toBe(1024);
    expect(shadowMapSizeFor('full', 1536)).toBe(1536);
  });

  it('never exceeds the baseline at any tier', () => {
    for (const base of [256, 512, 1024, 1536, 2048]) {
      for (const tier of QUALITY_TIERS) {
        expect(shadowMapSizeFor(tier, base), `${tier} of ${base}`).toBeLessThanOrEqual(base);
      }
    }
  });

  it('descends monotonically and stays a power of two', () => {
    for (const base of [1024, 1536, 2048]) {
      const [min, red, full] = QUALITY_TIERS.map((t) => shadowMapSizeFor(t, base));
      expect(min!).toBeLessThanOrEqual(red!);
      expect(red!).toBeLessThanOrEqual(full!);
      for (const v of [min!, red!]) expect(Math.log2(v) % 1, `${v} is not a power of two`).toBe(0);
    }
  });

  it('floors at 256 rather than shrinking past its own contact shadow', () => {
    // Below 256 the map is coarser than the shadow it exists to draw, and a contact shadow that misses its
    // own object is worse than a hard-edged one.
    expect(shadowMapSizeFor('minimum', 256)).toBe(256);
    expect(shadowMapSizeFor('minimum', 512)).toBeGreaterThanOrEqual(256);
  });

  it('takes its multiplier FROM the declared ladder, which used to be a second disagreeing copy', () => {
    /*
     * TWO LADDERS, DISAGREEING, NEITHER AWARE OF THE OTHER. This function hard-coded `1 / 0.5 / 0.25`
     * while the ladder declared `1536 / 1024 / 512`, i.e. `1 / 0.667 / 0.333`. The monotonicity test
     * asserted the declared numbers; every shadow map ever allocated came from the hard-coded ones. Same
     * defect class as `shadowTaps` — the declared field read as the guarantee and was not it.
     *
     * Asserted at 1280 because that is where the two disagree. Under the hard-coded factors: `reduced`
     * returned 512 (0.5 × 1280 = 640, snapped down) and `minimum` 256 — a 2.5× and a 5× reduction where
     * the ladder declares 1.5× and 3×. Every power-of-two baseline from 1 to 16384 and the 1536/3072/6144
     * family produce the IDENTICAL size under both, and the only baselines in this repo are 1024 and
     * 1536, so nothing shipping moved.
     */
    const declared = QUALITY_TIERS.map((t) => qualitySettings(t).shadowMapSize);
    expect(declared, 'the rung this function derives from').toEqual([512, 1024, 1536]);
    expect(shadowMapSizeFor('reduced', 1280), '0.667 x 1280 = 853, nearest POT 1024').toBe(1024);
    expect(shadowMapSizeFor('minimum', 1280), '0.333 x 1280 = 427, nearest POT 512').toBe(512);
    /* And the identity that makes the derivation checkable at all: handed the ladder's OWN full-tier
       size, this must reproduce the ladder's own numbers at every rung. */
    for (const t of QUALITY_TIERS) {
      expect(shadowMapSizeFor(t, qualitySettings('full').shadowMapSize), `${t} of its own rung`)
        .toBe(qualitySettings(t).shadowMapSize);
    }
  });

  it('falls back to a usable size rather than propagating a bad baseline', () => {
    for (const bad of [0, -1, Number.NaN, Infinity]) {
      const v = shadowMapSizeFor('full', bad);
      expect(Number.isFinite(v), `baseline ${bad}`).toBe(true);
      expect(v).toBeGreaterThanOrEqual(256);
    }
  });
});

/*
 * CONTOUR RIBBONS. §5 names them as an outstanding E5 deliverable, and the tests below are about the two
 * things a contour gets wrong silently: tracing a line through data nobody measured, and a saddle resolved by
 * a lookup table's row order rather than by the data.
 */
describe('contourSegments — an iso-line may not cross unmeasured ground', () => {
  /* A plane rising in x: value == col. Every iso-line is therefore a straight vertical line at x = level. */
  const ramp = (c: number): number => c;

  it('puts a level exactly where the data says, on a known ramp', () => {
    const r = contourSegments(5, 4, ramp, [2.5]);
    expect(r.segments.length).toBeGreaterThan(0);
    for (const s of r.segments) {
      expect(s.from[0], 'crossing must sit at x = 2.5').toBeCloseTo(2.5, 9);
      expect(s.to[0]).toBeCloseTo(2.5, 9);
    }
    expect(r.levelsDrawn).toEqual([2.5]);
    expect(r.levelsEmpty).toEqual([]);
  });

  it('REPORTS a level that lies outside the data instead of dropping it', () => {
    /* A legend listing a contour that was never drawn is a legend that lies. */
    const r = contourSegments(5, 4, ramp, [-3, 2.5, 99]);
    expect(r.levelsDrawn).toEqual([2.5]);
    expect(r.levelsEmpty).toEqual([-3, 99]);
  });

  it('emits NOTHING through a cell with an unmeasured corner, and counts it', () => {
    /*
     * THE RULE THAT MATTERS. Treating an absent corner as zero would draw a contour that appears to trace
     * measured ground and does not — a fabricated line, which is worse than a gap because it is
     * indistinguishable from a real one.
     */
    const holed = (c: number, r: number): number | null => (c === 2 && r === 1 ? null : c);
    const res = contourSegments(5, 4, holed, [2.5]);
    expect(res.cellsSkippedAbsent, 'one absent corner touches four cells').toBe(4);
    // No segment may lie inside any cell that touched the hole: cols 1..2, rows 0..1.
    for (const s of res.segments) {
      const inHoleCell = (p: readonly [number, number]): boolean =>
        p[0] >= 1 && p[0] <= 3 && p[1] >= 0 && p[1] <= 2;
      expect(inHoleCell(s.from) && inHoleCell(s.to), 'a segment crosses a holed cell').toBe(false);
    }
  });

  it('treats NaN and Infinity as unmeasured rather than as a crossing', () => {
    const bad = (c: number, r: number): number => (c === 2 && r === 1 ? Number.NaN : c === 3 && r === 2 ? Infinity : c);
    const res = contourSegments(6, 5, bad, [2.5, 3.5]);
    for (const s of res.segments) {
      expect(Number.isFinite(s.from[0]) && Number.isFinite(s.from[1])).toBe(true);
      expect(Number.isFinite(s.to[0]) && Number.isFinite(s.to[1])).toBe(true);
    }
    expect(res.cellsSkippedAbsent).toBeGreaterThan(0);
  });

  it('resolves a saddle from the cell mean, not from the case index', () => {
    /*
     * Opposite corners above the level, the other two below. Both cuts are consistent with the four samples,
     * so the tie must be broken by the DATA. Two grids with the same case code but different means must
     * produce different connectivity — if they do not, the table's row order is deciding the drawing.
     */
    const saddle = (hi: number, lo: number) => (c: number, r: number): number =>
      (c === r ? hi : lo);
    const highMean = contourSegments(2, 2, saddle(10, 4), [5]);
    const lowMean = contourSegments(2, 2, saddle(10, -20), [5]);
    expect(highMean.segments.length, 'a saddle emits two segments').toBe(2);
    expect(lowMean.segments.length).toBe(2);
    const key = (r: typeof highMean): string => r.segments
      .map((s) => `${s.from[0].toFixed(3)},${s.from[1].toFixed(3)}->${s.to[0].toFixed(3)},${s.to[1].toFixed(3)}`)
      .sort().join(' | ');
    expect(key(highMean), 'the mean must change the connectivity').not.toBe(key(lowMean));
  });

  it('never divides by zero when two corners straddle nothing', () => {
    // Every corner exactly on the level: the interpolation denominator is zero.
    const flat = (): number => 5;
    const r = contourSegments(4, 4, flat, [5]);
    for (const s of r.segments) {
      expect(Number.isFinite(s.from[0]) && Number.isFinite(s.to[0])).toBe(true);
    }
  });

  it('returns nothing, without throwing, for a grid that was never measured', () => {
    const r = contourSegments(4, 4, () => null, [1, 2]);
    expect(r.segments).toEqual([]);
    expect(r.levelsDrawn).toEqual([]);
    expect(r.levelsEmpty).toEqual([1, 2]);
    expect(r.cellsSkippedAbsent).toBe(9);
  });

  it('keeps every crossing inside the grid', () => {
    const wavy = (c: number, r: number): number => Math.sin(c * 0.7) + Math.cos(r * 0.5);
    const res = contourSegments(9, 7, wavy, [-0.5, 0, 0.5]);
    expect(res.segments.length).toBeGreaterThan(10);
    for (const s of res.segments) {
      for (const p of [s.from, s.to]) {
        expect(p[0]).toBeGreaterThanOrEqual(0);
        expect(p[0]).toBeLessThanOrEqual(8);
        expect(p[1]).toBeGreaterThanOrEqual(0);
        expect(p[1]).toBeLessThanOrEqual(6);
      }
    }
  });
});


/*
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *  THE TWO SHADER DEFECTS THE BLUEPRINT AUDIT FOUND — pinned so neither can come back.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *  Both live in GLSL, which no unit test can execute. So each is pinned twice: the ALGEBRA is mirrored
 *  in TypeScript and checked numerically, and the SOURCE is checked to still contain the form the
 *  algebra assumes. Either alone would be a test that passes while the shader is wrong — the mirror
 *  because it is not the shipped code, the source pin because matching a string proves nothing about
 *  what the maths does.
 */

/** Mirror of `distributionGGX` in LIT_FRAG. Takes PERCEPTUAL roughness and squares it internally. */
function dGGXIso(NdotH: number, rough: number): number {
  const a = rough * rough;
  const a2 = a * a;
  const d = NdotH * NdotH * (a2 - 1) + 1;
  return a2 / Math.max(1e-16, Math.PI * d * d); // tracks LIT_FRAG — see the epsilon tests
}

/** Mirror of `distributionGGXAniso` in LIT_FRAG. Takes ALPHAS — this is the whole point. */
function dGGXAniso(NdotH: number, TdotH: number, BdotH: number, at: number, ab: number): number {
  const a2 = at * ab;
  const v: [number, number, number] = [ab * TdotH, at * BdotH, a2 * NdotH];
  const v2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
  const w2 = a2 / Math.max(1e-16, v2); // must track LIT_FRAG exactly — see the epsilon test below
  return (a2 * w2 * w2) / Math.PI;
}

describe('the anisotropic and isotropic GGX branches must agree where they meet', () => {
  /* A half-vector on the tangent plane at a given NdotH, so TdotH^2 + BdotH^2 = 1 - NdotH^2 holds —
     the identity the reduction depends on. Picking TdotH arbitrarily would test nothing. */
  const tangentSplit = (NdotH: number, share: number) => {
    const rest = Math.max(0, 1 - NdotH * NdotH);
    return { TdotH: Math.sqrt(rest * share), BdotH: Math.sqrt(rest * (1 - share)) };
  };

  it('reduces EXACTLY to the isotropic form when anisotropy is zero', () => {
    for (const rough of [0.045, 0.1, 0.3, 0.5, 0.8, 1.0]) {
      const alpha = rough * rough;
      /* 1.0 included deliberately: at the peak the tangential terms vanish and v2 hits its true
         floor of (at*ab)^2, which is where the old 1e-8 divide guard silently clamped the result. */
      for (const NdotH of [0.05, 0.3, 0.6, 0.9, 0.999, 1.0]) {
        for (const share of [0, 0.25, 0.5, 1]) {
          const { TdotH, BdotH } = tangentSplit(NdotH, share);
          const iso = dGGXIso(NdotH, rough);
          const aniso = dGGXAniso(NdotH, TdotH, BdotH, alpha, alpha);
          /* Relative, because D spans many orders of magnitude across this sweep — an absolute
             tolerance would be vacuous at rough 1.0 and impossible at rough 0.045. */
          expect(Math.abs(aniso - iso) / iso).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('AND THE OLD DERIVATION FAILS THAT, which is why this test exists', () => {
    /*
     * The shipped code used to pass `rough * (1 +/- aniso)` — perceptual roughness where an alpha was
     * expected. At aniso -> 0 that hands the anisotropic form `rough`, not `rough^2`.
     *
     * Without this case the test above could be satisfied by a shader that never calls the anisotropic
     * branch at all. This pins the SIZE of the bug that was fixed.
     */
    const rough = 0.3;
    const NdotH = 0.9;
    const { TdotH, BdotH } = tangentSplit(NdotH, 0.5);
    const correct = dGGXAniso(NdotH, TdotH, BdotH, rough * rough, rough * rough);
    const old = dGGXAniso(NdotH, TdotH, BdotH, rough, rough);
    expect(Math.abs(old - correct) / correct).toBeGreaterThan(0.5);

    /*
     * AND IN A SPECIFIC DIRECTION, which is what made it visible: treating perceptual roughness as an
     * alpha WIDENS the lobe. The same energy spreads out, so the peak dims and the tail brightens.
     * Both halves are asserted, because "it changed" is a weaker claim than "it blurred" and only the
     * second one explains what an operator would have seen on E8's mark.
     */
    const peak = 0.999;
    const tail = 0.9;
    const at = (n: number, a: number) => {
      const sp = tangentSplit(n, 0.5);
      return dGGXAniso(n, sp.TdotH, sp.BdotH, a, a);
    };
    expect(at(peak, rough)).toBeLessThan(at(peak, rough * rough));
    expect(at(tail, rough)).toBeGreaterThan(at(tail, rough * rough));
  });

  it('still varies with anisotropy — the fix must not have flattened the feature', () => {
    const rough = 0.4;
    const alpha = rough * rough;
    const NdotH = 0.85;
    const { TdotH, BdotH } = tangentSplit(NdotH, 0.8);
    const round = dGGXAniso(NdotH, TdotH, BdotH, alpha, alpha);
    const stretched = dGGXAniso(NdotH, TdotH, BdotH, alpha * 1.6, alpha * 0.4);
    expect(stretched).not.toBeCloseTo(round, 6);
  });

  it('guards the divide BELOW the smallest value the denominator can really take', () => {
    /* v2's true floor is (at*ab)^2 = 1.6e-11 at the 0.002 clamp. A guard at 1e-8 sits ABOVE that and
       clamps real output instead of preventing a real divide by zero. */
    expect(LIT_FRAG).toContain('max(1e-16, v2)');
    expect(LIT_FRAG).not.toContain('max(1e-8, v2)');
    /* The isotropic branch had the same defect and it was live on the sign-in screen: its denominator's
       floor is PI*a2^2 = 5.3e-11 at the roughness clamp, five orders below the old 1e-6 guard. */
    expect(LIT_FRAG).toContain('max(1e-16, PI * d * d)');
    expect(LIT_FRAG).not.toContain('max(1e-6, PI * d * d)');
  });

  it('returns the TRUE specular peak for the three materials that were being clipped', () => {
    /*
     * ForgeBackdrop (0.13), e8 (0.13) and e2 (0.14) are the shipped materials below the 0.154 threshold
     * where the old guard fired. Pinned as a number so nobody reinstates a guard above the real floor.
     */
    /* Measured, not guessed: 0.13 -> 3.90x, 0.14 -> 2.16x. Thresholds sit just under those. */
    for (const [rough, minFactor] of [[0.13, 3.85], [0.14, 2.1]] as const) {
      const a2 = (rough * rough) ** 2;
      const truePeak = 1 / (Math.PI * a2);
      const oldClamped = a2 / 1e-6;
      expect(truePeak / oldClamped).toBeGreaterThan(minFactor);
      /* And the fixed mirror must now produce that true peak rather than the clamped one. */
      expect(dGGXIso(1, rough)).toBeCloseTo(truePeak, 5);
    }
  });

  it('the shader derives at/ab from alpha, not from perceptual roughness', () => {
    /* The mirror above is only meaningful if the shipped source still feeds it alphas. */
    expect(LIT_FRAG).toContain('float alpha = rough * rough;');
    expect(LIT_FRAG).toMatch(/float at = max\(0\.002, alpha \* \(1\.0 \+ aniso\)\)/);
    expect(LIT_FRAG).toMatch(/float ab = max\(0\.002, alpha \* \(1\.0 - aniso\)\)/);
    /* The exact form that was wrong, banned by shape so a revert cannot pass. */
    expect(LIT_FRAG).not.toMatch(/at = max\([^)]*, rough \* \(1\.0 \+ aniso\)\)/);
  });
});

describe('the PCF tap count is wired, so the minimum tier gets what it asks for', () => {
  it('declares the uniform and branches on it', () => {
    expect(LIT_FRAG).toContain('uniform int uShadowTaps;');
    expect(LIT_FRAG).toContain('if (uShadowTaps < 9)');
  });

  it('takes ONE texture fetch on the cheap path, not nine', () => {
    /* The whole point is the fetches, so count them per branch rather than trusting the comment. */
    const fn = LIT_FRAG.slice(LIT_FRAG.indexOf('float shadowFactor'), LIT_FRAG.indexOf('void main('));
    const cheap = fn.slice(fn.indexOf('if (uShadowTaps < 9)'), fn.indexOf('float lit = 0.0;'));
    expect(cheap.match(/texture\(uShadowMap/g) ?? []).toHaveLength(1);
    /* And it must return, not fall through into the 3x3 loop — a missing return here would make the
       cheap path cost TEN fetches, which is the opposite of the fix. */
    expect(cheap).toContain('return mix(1.0,');
  });

  it('still filters 3x3 on the full path', () => {
    const fn = LIT_FRAG.slice(LIT_FRAG.indexOf('float shadowFactor'), LIT_FRAG.indexOf('void main('));
    expect(fn).toContain('lit /= 9.0;');
    expect(fn).toMatch(/for \(int y = -1; y <= 1; y\+\+\)/);
  });

  it('applies the bias ONCE, to both paths', () => {
    /* The refactor split one comparison into two. If the cheap path had been written without the bias
       it would shadow-acne on every surface at the tier least able to hide it. */
    const fn = LIT_FRAG.slice(LIT_FRAG.indexOf('float shadowFactor'), LIT_FRAG.indexOf('void main('));
    expect(fn.match(/float bias = /g) ?? []).toHaveLength(1);
    expect(fn.match(/float ref = p\.z - bias;/g) ?? []).toHaveLength(1);
    expect(fn.match(/ref <= d/g) ?? []).toHaveLength(2);
  });
});


/*
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *  THE AMBIENT TERM RETURNED MORE ENERGY THAN IT RECEIVED — split-sum DFG, multiscatter, and kd.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *  Pinned the same way as the GGX fixes above, and for the same reason: the ALGEBRA is mirrored here
 *  and swept numerically, and the SOURCE is pinned to still contain the form the mirror assumes.
 *  Either alone is a test that passes while the shader is wrong.
 *
 *  Everything below is a sweep, and every sweep counts its own iterations and asserts the count. This
 *  file has been bitten by a loop over an empty collection before, and an energy-conservation test
 *  that silently checked nothing is worse than no test, because the claim it makes is total.
 */

/** Mirror of `envDFG` in LIT_FRAG — Karis's `EnvBRDFApprox`. Returns [A, B]; spec weight is f0*A + B. */
function envDFG(NdotV: number, rough: number): [number, number] {
  const c0 = [-1, -0.0275, -0.572, 0.022];
  const c1 = [1, 0.0425, 1.04, -0.04];
  const r = [
    rough * c0[0]! + c1[0]!, rough * c0[1]! + c1[1]!, rough * c0[2]! + c1[2]!, rough * c0[3]! + c1[3]!,
  ];
  const a004 = Math.min(r[0]! * r[0]!, Math.pow(2, -9.28 * NdotV)) * r[0]! + r[1]!;
  return [-1.04 * a004 + r[2]!, 1.04 * a004 + r[3]!];
}

/** Mirror of `fresnelSchlick` in LIT_FRAG, one channel. */
function schlick(cosTheta: number, f0: number): number {
  return f0 + (1 - f0) * Math.pow(Math.max(0, Math.min(1, 1 - cosTheta)), 5);
}

/** What the shader now hands the environment specular, per channel: clamped, single-scattering. */
const specWeight = (NdotV: number, rough: number, f0: number) => {
  const [A, B] = envDFG(NdotV, rough);
  return Math.max(0, f0 * A + B);
};
/**
 * Mirror of `msComp`. Ess is A + B, the white-furnace albedo of the fit.
 *
 * Evaluated at NdotV = 1 while the shader evaluates it at the fragment's own NdotV. That is faithful
 * rather than convenient: A + B is INDEPENDENT of NdotV — the a004 halves cancel — and the sweep in
 * the DFG block proves that to 1e-12 rather than assuming it.
 */
const msComp = (rough: number, f0: number) => {
  const [A, B] = envDFG(1, rough);
  return 1 + f0 * (1 / Math.max(1e-3, A + B) - 1);
};

/* The clamp the shader applies to roughness BEFORE any of this. Two of the floors proved below
   depend on it, so it is pinned here rather than assumed from the other describe block. */
const ROUGH_MIN = 0.045;

/* lit.ts's own source. The contact-hardening REFUSAL is a TypeScript comment — it is deliberately
   not in the shipped shader bytes — so the only way to check it survives is to read the file, which
   `stage.test.ts:56` already does for the same kind of claim. */
const LIT_SOURCE = readFileSync(resolve(process.cwd(), 'src/env/lit.ts'), 'utf8');

describe('SPLIT-SUM DFG — the environment specular had no BRDF integration term at all', () => {
  it('the shader computes the weight from f0, NOT from a second Fresnel — the double-count trap', () => {
    /* `fresnelSchlick(NdotV, f0) * dfg.x + dfg.y` is the natural-looking edit and it applies Schlick
       twice, because the fit was made against the Fresnel-weighted integral. Banned by shape. */
    expect(LIT_FRAG).toContain('vec3 specWeight = max(vec3(0.0), f0 * dfg.x + dfg.y);');
    expect(LIT_FRAG).not.toMatch(/fresnelSchlick\(NdotV, f0\)\s*\*\s*dfg/);
    /* And the old bare-Fresnel environment specular must be gone, not merely supplemented. */
    expect(LIT_FRAG).not.toContain('skyColour(normalize(mix(R, N, rough * rough))) * fresnelSchlick(NdotV, f0)');
    /* PERCEPTUAL roughness, not alpha. The fit is defined on `Roughness` in UE4's terms; feeding it
       rough*rough is the same class of mistake as defect 2 above and reads as too-sharp reflections. */
    expect(LIT_FRAG).toContain('vec2 dfg = envDFG(NdotV, rough);');
  });

  it('the mirror below carries the SHADER coefficients, digit for digit', () => {
    /*
     * Without this the two halves can drift silently: every numeric claim in this block is made
     * against the mirror, so a shader whose coefficients were retyped would keep passing all of them.
     * Four numbers, and every energy figure in the note above LIT_FRAG depends on the third
     * (-0.572 and 0.022 are what make Ess exactly 1 - 0.55*rough).
     */
    expect(LIT_FRAG).toContain('const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);');
    expect(LIT_FRAG).toContain('const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);');
    expect(LIT_FRAG).toContain('float a004 = min(r.x * r.x, exp2(-9.28 * NdotV)) * r.x + r.y;');
    expect(LIT_FRAG).toContain('return vec2(-1.04, 1.04) * a004 + r.zw;');
    /* And the mirror agrees with those bytes at the one point where they can be evaluated by hand:
       rough 0, NdotV 0, where exp2(0) = 1 and r.x = 1, so a004 = 1 + 0.0425 exactly. */
    const [A, B] = envDFG(0, 0);
    expect(A).toBeCloseTo(1.04 - 1.04 * 1.0425, 12);
    expect(B).toBeCloseTo(1.04 * 1.0425 - 0.04, 12);
  });

  it('carries Schlick INSIDE the fit — a fit without it would be flat in NdotV', () => {
    /*
     * This is the numeric half of the test above, and the reason a source match alone was not enough.
     * At the smoothest legal roughness a dielectric's weight rises 20.6x from normal incidence to
     * NdotV 0.01; Schlick's own rise over the same range is 23.8x. Flat in NdotV would be ~1.0x.
     */
    const w = (n: number) => specWeight(n, ROUGH_MIN, 0.04);
    const rise = w(0.01) / w(1);
    expect(rise).toBeGreaterThan(15);
    expect(rise).toBeCloseTo(20.6, 1);
    expect(schlick(0.01, 0.04) / schlick(1, 0.04)).toBeCloseTo(23.8, 1);

    /* And it tracks Schlick in absolute terms across every angle and every f0 the shader can hold —
       0.085 is the worst case, at NdotV 0.0005 where a dielectric reflects almost everything. */
    let worst = 0;
    let checked = 0;
    for (let ni = 1; ni <= 2000; ni++) {
      for (const f0 of [0.04, 0.2, 0.5, 1.0]) {
        const NdotV = ni / 2000;
        worst = Math.max(worst, Math.abs(specWeight(NdotV, ROUGH_MIN, f0) - schlick(NdotV, f0)));
        checked++;
      }
    }
    expect(checked).toBe(8000);
    expect(worst).toBeLessThan(0.09);
  });

  it('AND THE DOUBLE-COUNTED FORM FAILS THAT, which is why the numeric half exists', () => {
    /* The size of the bug that would be reintroduced: a rim of invented light on every dielectric. */
    const doubled = (n: number, r: number, f0: number) => {
      const [A, B] = envDFG(n, r);
      return schlick(n, f0) * A + B;
    };
    expect(doubled(0.35, ROUGH_MIN, 0.04) / specWeight(0.35, ROUGH_MIN, 0.04)).toBeCloseTo(1.675, 2);
    expect(doubled(0.1, 0.62, 0.04) / specWeight(0.1, 0.62, 0.04)).toBeCloseTo(5.199, 2);
  });

  it('is ENERGY-CONSERVING at both roughness limits and for metal and dielectric alike', () => {
    /*
     * The one claim that matters: the white-furnace albedo A + B must never exceed 1, or the surface
     * emits. It is exactly 1 - 0.55*rough — the NdotV-dependent halves of A and B cancel, which is
     * why no lookup texture is needed to state this. Swept in NdotV as well, because that
     * cancellation is the property being checked and not an assumption.
     */
    let checked = 0;
    let maxEss = -1;
    let worstDrift = 0;
    for (let ri = 0; ri <= 1000; ri++) {
      for (let ni = 1; ni <= 200; ni++) {
        const rough = ri / 1000;
        const [A, B] = envDFG(ni / 200, rough);
        /* Accumulated and asserted once, not asserted 200,200 times: the same coverage, and the
           failure message names the worst case instead of the first. */
        worstDrift = Math.max(worstDrift, Math.abs(A + B - (1 - 0.55 * rough)));
        maxEss = Math.max(maxEss, A + B);
        checked++;
      }
    }
    expect(checked).toBe(200_200);
    expect(worstDrift).toBeLessThan(1e-12);
    /* rough = 0 is below the shader's clamp and is included on purpose: it is where the fit is
       tightest against 1, so if the coefficients are ever retyped this is where it breaks first. */
    expect(maxEss).toBeLessThanOrEqual(1);
    expect(maxEss).toBeCloseTo(1, 12);
    /* And the floor, which the msComp divide relies on: 0.45 at rough 1, 450x above its 1e-3 guard. */
    expect(envDFG(1, 1)[0] + envDFG(1, 1)[1]).toBeCloseTo(0.45, 12);
  });

  it('replaces a form that was up to 2.222x too bright on a rough metal', () => {
    /* The old code multiplied the prefiltered sky by fresnelSchlick alone, which for a metal
       (f0 -> 1) is 1.0 at every angle and roughness. The integral it stood in for is not. */
    const tooBright = (rough: number) => schlick(1, 1) / (envDFG(1, rough)[0] + envDFG(1, rough)[1]);
    expect(tooBright(0.13)).toBeCloseTo(1.077, 3);   // the LCX mark
    expect(tooBright(0.62)).toBeCloseTo(1.517, 3);   // StormRelief's lid
    expect(tooBright(1.0)).toBeCloseTo(2.222, 3);
  });

  it('takes no texture unit, which is the reason the analytic fit was chosen over a LUT', () => {
    /* lit.ts binds the shadow map on unit 0 and AO on unit 1 and has already had one feedback-hazard
       bug from that bookkeeping. A DFG LUT would be a third. Pinned so nobody adds one quietly. */
    /* Three since THE PRODUCTION P3: the environment map (SKY_GLSL, bound on ENV_MAP_UNIT 7 by bindSky, clear of the
       shadow/AO units). Still no LUT: the DFG stays analytic. */
    expect(LIT_FRAG.match(/uniform sampler2D/g) ?? []).toHaveLength(3);
    expect(LIT_FRAG).toContain('uniform sampler2D uShadowMap;');
    expect(LIT_FRAG).toContain('uniform sampler2D uAO;');
    expect(LIT_FRAG).toContain('uniform sampler2D uEnvMap;');
    expect(LIT_FRAG).not.toMatch(/uniform sampler2D u\w*(DFG|Brdf|BRDF|Lut|LUT)/);
  });
});

describe('kd ON ENVIRONMENT DIFFUSE — the missing factor, and why it is 1-specWeight not 1-F', () => {
  it('the shader applies it, and derives it from what the specular actually took', () => {
    /* P3: the diffuse sample is a SOFT LOD of the environment (skyColourLod; the procedural sky ignores the LOD). The kd
       factor is unchanged. */
    expect(LIT_FRAG).toContain(
      'vec3 envDiffuse = skyColourLod(N, 5.5) * uBaseColour * (1.0 - specWeight) * (1.0 - uMetalness);',
    );
    /* The exact line that was shipping, banned by shape so a revert cannot pass — in both the old and the LOD form. */
    expect(LIT_FRAG).not.toContain('vec3 envDiffuse = skyColour(N) * uBaseColour * (1.0 - uMetalness);');
    expect(LIT_FRAG).not.toContain('vec3 envDiffuse = skyColourLod(N, 5.5) * uBaseColour * (1.0 - uMetalness);');
    /* And the roughness clamp both floors below depend on. */
    expect(LIT_FRAG).toContain('float rough = clamp(uRoughness, 0.045, 1.0);');
  });

  it('the OLD form returned twice the energy it received, and the new one is capped at 1.0030', () => {
    /*
     * Summed against a UNIFORM sky, which is the case where the diffuse (sampled along N) and the
     * specular (sampled along the roughness-lerped reflection) see the same radiance and their
     * weights can legitimately be added. Albedo 1 is the worst case and is the bound being stated.
     */
    let checked = 0;
    let worstOld = 0;
    let worstNew = 0;
    for (let ri = ROUGH_MIN * 1000; ri <= 1000; ri++) {
      for (let ni = 1; ni <= 2000; ni++) {
        const rough = ri / 1000;
        const NdotV = ni / 2000;
        const f0 = 0.04;
        const w = specWeight(NdotV, rough, f0);
        /* OLD: diffuse weight was a flat 1.0 for a dielectric, plus a bare Schlick specular. */
        worstOld = Math.max(worstOld, 1 + schlick(NdotV, f0));
        worstNew = Math.max(worstNew, (1 - w) + w * msComp(rough, f0));
        checked++;
      }
    }
    expect(checked).toBe(1_912_000);
    expect(worstOld).toBeGreaterThan(1.99);
    /* 1.0030 is not slack: it is the multiscatter coupling deliberately left out of kd, and it is
       bounded by f0 = 0.04 because kd is zero wherever f0 is large (a metal has no diffuse lobe). */
    expect(worstNew).toBeLessThan(1.0031);
    expect(worstNew - 1).toBeCloseTo(0.003, 3);
  });

  it('needs NO clamp, and that is provable from the roughness clamp rather than lucky', () => {
    /*
     * `1 - (f0*A + B)` could in principle go negative — at rough exactly 0 and grazing incidence B
     * reaches 1.044. It cannot here: clamping rough to 0.045 first caps a004, which keeps A >= 0.065,
     * and with A positive the smallest kd is at f0 = 1 where it is 1 - Ess. Swept to NdotV 1e-5,
     * five times finer than the shader's own 1e-4 NdotV floor.
     */
    let checked = 0;
    let minKd = 9;
    let minA = 9;
    for (let ri = ROUGH_MIN * 1000; ri <= 1000; ri++) {
      for (let ni = 1; ni <= 500; ni++) {
        const rough = ri / 1000;
        /* ni = 1 is spent on 1e-5 rather than 0.002, because the floor is approached as NdotV -> 0
           and the shader's own floor is 1e-4. Testing only down to 0.002 would miss it entirely. */
        const NdotV = ni === 1 ? 1e-5 : ni / 500;
        minA = Math.min(minA, envDFG(NdotV, rough)[0]);
        for (const f0 of [0.04, 0.2, 0.5, 1.0]) {
          minKd = Math.min(minKd, 1 - specWeight(NdotV, rough, f0));
          checked++;
        }
      }
    }
    expect(checked).toBe(1_912_000);
    expect(minA).toBeGreaterThan(0.065);
    expect(minKd).toBeGreaterThan(0);
    expect(minKd).toBeCloseTo(0.0248, 4);
    /* A dielectric never gets close to that floor — 0.0877 is its worst case. */
    expect(1 - specWeight(1e-5, ROUGH_MIN, 0.04)).toBeCloseTo(0.0877, 4);
  });

  it('AND 1-F WOULD HAVE OVER-SUBTRACTED BY 24x, which is why it is not 1-F', () => {
    /*
     * The literal reading of the direct path's `kd = (1-F)*(1-metalness)`. Once the specular takes
     * `f0*A + B`, F is no longer what it took: at rough 1 and NdotV 0.1 a dielectric's real specular
     * weight is 0.0157 while 1-F removes 0.607. That is the bug that makes rough dielectrics go black
     * at their silhouette. Both are asserted, because "different" is weaker than "24x too much".
     */
    const w = specWeight(0.1, 1.0, 0.04);
    const removedByF = schlick(0.1, 0.04);
    expect(w).toBeCloseTo(0.0157, 4);
    expect(removedByF).toBeCloseTo(0.607, 3);
    expect(removedByF / w).toBeGreaterThan(24);
    /* And the two agree where the old form was defensible — a smooth surface at normal incidence,
       where A -> 1 and B -> 0. Stated as an absolute gap because both values are ~0.04, and a
       relative tolerance on a number that small says nothing. */
    expect(Math.abs(specWeight(1, ROUGH_MIN, 0.04) - schlick(1, 0.04))).toBeLessThan(0.005);
  });

  it('is zero for a metal, so the fix cannot have re-introduced a diffuse lobe on one', () => {
    /* Not a tautology of the shader line: it pins that `(1 - uMetalness)` still gates the whole term,
       which is the factor that keeps a metal from reading as painted plastic (see the header). */
    const kdFull = (NdotV: number, rough: number, f0: number, metalness: number) =>
      (1 - specWeight(NdotV, rough, f0)) * (1 - metalness);
    expect(kdFull(0.5, 0.3, 0.9, 1)).toBe(0);
    expect(kdFull(0.5, 0.3, 0.04, 0)).toBeGreaterThan(0.5);
  });
});

describe('MULTISCATTER COMPENSATION — the loss is real at the roughness this app actually ships', () => {
  it('restores exactly the lost energy in the white-furnace case', () => {
    /* f0 = 1 must come back to 1.0 at every roughness: Ess * (1/Ess) = 1. This is the whole
       justification for the form, so it is swept rather than spot-checked. */
    let checked = 0;
    for (let ri = ROUGH_MIN * 1000; ri <= 1000; ri++) {
      const rough = ri / 1000;
      expect(specWeight(1, rough, 1) * msComp(rough, 1)).toBeCloseTo(1, 12);
      checked++;
    }
    expect(checked).toBe(956);
    /* And it only ever ADDS: a compensation below 1 would be a second energy bug wearing the name of
       the fix. Nothing here may darken the specular. */
    for (const rough of [ROUGH_MIN, 0.13, 0.5, 1.0]) {
      for (const f0 of [0, 0.04, 0.5, 1]) expect(msComp(rough, f0)).toBeGreaterThanOrEqual(1);
    }
  });

  it('corrects a loss between 7.15% and 49.5% ACROSS THE SHIPPED ROUGHNESS RANGE', () => {
    /*
     * The values are grepped from apps/web/src and docs/3d, not invented: 0.13 is ForgeBackdrop's and
     * e8's LCX mark on the sign-in screen, 0.88/0.90 are the darkest floors. If the range this test
     * asserts ever stops matching the app, the justification for carrying this code has changed.
     */
    const shipped = [0.13, 0.14, 0.18, 0.22, 0.30, 0.34, 0.42, 0.52, 0.62, 0.74, 0.88, 0.90];
    expect(shipped.length).toBeGreaterThan(0);
    for (const rough of shipped) {
      const loss = 1 - (envDFG(1, rough)[0] + envDFG(1, rough)[1]);
      expect(loss).toBeGreaterThan(0.07);
    }
    expect(1 - (envDFG(1, 0.13)[0] + envDFG(1, 0.13)[1])).toBeCloseTo(0.0715, 4);
    expect(1 - (envDFG(1, 0.90)[0] + envDFG(1, 0.90)[1])).toBeCloseTo(0.4950, 4);
  });

  it('measures the per-channel gain on four shipped materials, including the sign-in screen', () => {
    /*
     * The gain scales with f0, so on a coloured metal it is a SATURATION change as well as a
     * brightness one — the LCX mark's blue gains 7.1% and its red 0.2%. That asymmetry is the visible
     * consequence, and it is the reason this is asserted per channel rather than as a scalar.
     */
    /* Measured, to 2 decimals, with a 0.05-point tolerance below. Not rounded to the numbers in the
       note above LIT_FRAG — the note rounds these, so pinning the note's figures would let a 0.4%
       drift through. */
    const materials = [
      { name: 'LCX mark (ForgeBackdrop, e8)', hex: '#2C6BFF', rough: 0.13, metalness: 0.92, blue: 7.11, red: 0.20 },
      { name: 'E2 / GlobeRelief corridors', hex: '#4C86FF', rough: 0.22, metalness: 0.85, blue: 11.78, red: 0.93 },
      { name: 'ForgeBackdrop brushed ring', hex: '#8FA3C4', rough: 0.30, metalness: 0.95, blue: 10.40, red: 5.20 },
      { name: 'StormRelief lid', hex: '#6B7A99', rough: 0.62, metalness: 0.35, blue: 7.11, red: 4.01 },
    ];
    expect(materials.length).toBe(4);
    for (const m of materials) {
      const base = hexToLinear(m.hex);
      /* f0 = mix(vec3(0.04), uBaseColour, uMetalness), the shader's own line. */
      const f0 = (i: number) => 0.04 + m.metalness * (base[i]! - 0.04);
      const gain = (i: number) => (msComp(m.rough, f0(i)) - 1) * 100;
      expect(Math.abs(gain(2) - m.blue), `${m.name} blue`).toBeLessThan(0.05);
      expect(Math.abs(gain(0) - m.red), `${m.name} red`).toBeLessThan(0.05);
      /* The blue channel gains strictly more than the red on all four, which is the saturation claim. */
      expect(gain(2), m.name).toBeGreaterThan(gain(0));
    }
  });

  it('the shader applies it to the environment specular ONLY, not to the direct lobe', () => {
    /* Deliberate and argued in the note above LIT_FRAG: the factor is a hemispherical directional
       albedo, and Filament's choice to apply it to the direct lobe puts the recovered energy in a
       direction it did not scatter to. If that is ever revisited it should be by argument, so the
       absence is pinned rather than left to be read as an oversight. */
    expect(LIT_FRAG).toContain('* specWeight * msComp;');
    const direct = LIT_FRAG.slice(LIT_FRAG.indexOf('vec3 spec = '), LIT_FRAG.indexOf('vec3 R = reflect'));
    expect(direct.length).toBeGreaterThan(0);
    expect(direct).not.toContain('msComp');
  });

  it('the clamp on specWeight is REACHABLE, which is why it is a guard and not decoration', () => {
    /* B is -0.0024 at roughness 1, so a metal dark enough drives f0*A + B negative — and a negative
       radiance in this pipeline darkens the whole composite instead of clipping locally. The
       threshold is sharp enough to be worth pinning on both sides. */
    const raw = (hex: string) => {
      const [A, B] = envDFG(1, 1);
      return hexToLinear(hex)[0]! * A + B;
    };
    expect(raw('#101010')).toBeLessThan(0);
    expect(raw('#111111')).toBeGreaterThan(0);
    expect(specWeight(1, 1, hexToLinear('#101010')[0]!)).toBe(0);
    expect(LIT_FRAG).toContain('max(vec3(0.0), f0 * dfg.x + dfg.y)');
  });
});

describe('CONTACT HARDENING IS REFUSED — the argument is in the source, so it is checkable', () => {
  /*
   * §1.3 of `3D_VFX_FINAL_PLAN.md` named four missing Layer 3 items. Three were energy defects and
   * are fixed above. The fourth is a look, and it was refused in writing — the register
   * `3D_VFX_1000X.md:330` uses for god rays. This test exists so the refusal cannot be quietly
   * reversed by someone who does not know it was ever made, and so the shader's cost claims stay
   * true: contact hardening needs a blocker-search loop, which is a SECOND set of taps.
   */
  it('no blocker search reached the shader, and the tap count is still 1 or 9', () => {
    const fn = LIT_FRAG.slice(LIT_FRAG.indexOf('float shadowFactor'), LIT_FRAG.indexOf('void main('));
    expect(fn.length).toBeGreaterThan(0);
    /* Exactly two fetches in the source: one per branch. A blocker search would add a third. */
    expect(fn.match(/texture\(uShadowMap/g) ?? []).toHaveLength(2);
    expect(fn.match(/for \(int/g) ?? []).toHaveLength(2);   // the 3x3 y and x loops, nothing else
    expect(fn).not.toMatch(/blocker|penumbra|pcss/i);
  });

  it('and the refusal is recorded where the code would have gone', () => {
    /* A refusal that lives only in a plan document is a refusal the next reader never sees. */
    expect(LIT_FRAG).not.toMatch(/CONTACT HARDENING/i);   // not in the shipped bytes, and not needed
    expect(LIT_SOURCE).toMatch(/CONTACT HARDENING IS REFUSED/);
    /* The refusal has to carry its precedent and its four counts, or it is an opinion. */
    expect(LIT_SOURCE).toContain('3D_VFX_1000X.md:330');
    expect(LIT_SOURCE).toContain('BLOCKER SEARCH');
  });
});
