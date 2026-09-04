import { describe, expect, it } from 'vitest';
import { swapForgeMeshes, FORGE_PART_NAMES } from '../forgeObjects';
import type { GltfAsset } from '@lcx/gl';

const geo = () => ({ positions: new Float32Array(9), normals: new Float32Array(9), uvs: new Float32Array(6), tangents: new Float32Array(9), indices: new Uint16Array([0, 1, 2]), min: [0, 0, 0] as const, max: [1, 1, 1] as const });
const mat = { baseColor: [1, 1, 1] as const, metallic: 1, roughness: 1, anisotropy: 0, brandHex: null };
const asset = (names: string[]): GltfAsset => ({ kind: 'gltf', bytes: 1, generator: 't', meshes: names.map((name) => ({ name, geometry: geo(), material: mat, derived: { normals: false, tangents: true } })) });

describe('swapForgeMeshes', () => {
  it('uploads the three named parts and returns them by name', () => {
    const uploaded: string[] = [];
    const r = swapForgeMeshes(asset(['plinth', 'disc', 'ring', 'floor']), (g) => { uploaded.push(String(g.indices.length)); return { dispose() {} }; });
    expect('kind' in r).toBe(false);
    expect(Object.keys(r).sort()).toEqual([...FORGE_PART_NAMES].sort());
    expect(uploaded).toHaveLength(3);
  });
  it('refuses when a part is missing, naming what it has', () => {
    const r = swapForgeMeshes(asset(['disc', 'ring']), () => ({ dispose() {} }));
    expect(r).toMatchObject({ kind: 'refused' });
    if ('kind' in r) expect(r.reason).toMatch(/lacks plinth/);
  });
  it('refuses partially-uploaded swaps and disposes what it already uploaded', () => {
    let disposed = 0; let n = 0;
    const r = swapForgeMeshes(asset(['disc', 'ring', 'plinth']), () => (++n === 3 ? { kind: 'refused', reason: 'GPU said no' } : { dispose() { disposed++; } }));
    expect(r).toMatchObject({ kind: 'refused', reason: 'plinth: GPU said no' });
    expect(disposed).toBe(2);
  });
});
