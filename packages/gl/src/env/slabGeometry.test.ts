import { describe, expect, it } from 'vitest';
import { slabGeometry, PLATE_CHAMFER, PLATE_THICKNESS } from './stageScene';

const top = [[-4, 0.32, -2], [4, 0.32, -2], [4, 0.32, 1.5], [-4, 0.32, 1.5]] as const;

describe('slabGeometry — the plate with a machined edge', () => {
  it('has ten faces with their own normals, all unit, and a top face that is exactly the rect handed in', () => {
    const g = slabGeometry(top);
    expect(g.positions.length / 3).toBe(40);
    expect(g.indices.length / 3).toBe(20);
    for (let i = 0; i < g.normals.length; i += 3) expect(Math.hypot(g.normals[i]!, g.normals[i + 1]!, g.normals[i + 2]!)).toBeCloseTo(1, 5);
    // the first four vertices ARE the top corners (as a set — the winding may be reversed to face up), untouched
    const firstFour = [0, 1, 2, 3].map((k) => [g.positions[k * 3]!, g.positions[k * 3 + 1]!, g.positions[k * 3 + 2]!].map((v) => Math.round(v * 1e6) / 1e6).join(','));
    for (const c of top) expect(firstFour).toContain(c.join(','));
    // and the top face's normal points UP — the face the page stands on is lit, never culled
    expect(g.normals[1]).toBeCloseTo(1, 5);
  });
  it('cuts the chamfer OUTWARD: bounds grow by the chamfer in x and z, the top face does not move', () => {
    const g = slabGeometry(top);
    expect(g.min[0]).toBeCloseTo(-4 - PLATE_CHAMFER, 6); expect(g.max[0]).toBeCloseTo(4 + PLATE_CHAMFER, 6);
    expect(g.min[2]).toBeCloseTo(-2 - PLATE_CHAMFER, 6); expect(g.max[2]).toBeCloseTo(1.5 + PLATE_CHAMFER, 6);
    expect(g.max[1]).toBeCloseTo(0.32, 6); expect(g.min[1]).toBeCloseTo(0.32 - PLATE_THICKNESS, 6);
  });
  it('the chamfer band faces up-and-out at 45°, so it takes the key light beside the page, not under it', () => {
    const g = slabGeometry(top);
    // face 2 = front chamfer (+z side): normal should have +y and +z components of equal size
    const n = [g.normals[2 * 12]!, g.normals[2 * 12 + 1]!, g.normals[2 * 12 + 2]!];
    expect(n[1]).toBeGreaterThan(0.6); expect(n[2]).toBeGreaterThan(0.6); expect(Math.abs(n[1]! - n[2]!)).toBeLessThan(1e-4);
    // face 6 = front wall: vertical, facing +z
    const w = [g.normals[6 * 12]!, g.normals[6 * 12 + 1]!, g.normals[6 * 12 + 2]!];
    expect(Math.abs(w[1]!)).toBeLessThan(1e-4); expect(w[2]).toBeGreaterThan(0.99);
  });
  it('a zero chamfer degenerates to the plain slab profile (walls straight down from the top edge)', () => {
    const g = slabGeometry(top, PLATE_THICKNESS, 0);
    expect(g.min[0]).toBeCloseTo(-4, 6); expect(g.max[2]).toBeCloseTo(1.5, 6);
  });
});
