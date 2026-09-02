import { describe, expect, it } from 'vitest';
import { parseGlb, isGltfRefusal } from './gltf';

/** Build a GLB in memory: a unit quad, positions QUANTIZED to int16 normalized (KHR_mesh_quantization shape). */
function quadGlb(opts: { quantize: boolean; withNormals: boolean; corruptMagic?: boolean; node?: { scale: number[]; translation: number[] } }): ArrayBuffer {
  const pos = [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0];
  const uv = [0, 0, 1, 0, 1, 1, 0, 1];
  const nrm = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
  const idx = [0, 1, 2, 0, 2, 3];
  const parts: ArrayBuffer[] = [];
  const views: object[] = [];
  const accessors: object[] = [];
  let offset = 0;
  const push = (bytes: ArrayBuffer, componentType: number, count: number, type: string, normalized?: boolean) => {
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength });
    accessors.push({ bufferView: views.length - 1, componentType, count, type, ...(normalized ? { normalized: true } : {}) });
    parts.push(bytes);
    offset += bytes.byteLength + ((4 - (bytes.byteLength % 4)) % 4);
    return accessors.length - 1;
  };
  const posAcc = opts.quantize
    ? push(Int16Array.from(pos.map((v) => Math.round(v * 32767))).buffer, 5122, 4, 'VEC3', true)
    : push(Float32Array.from(pos).buffer, 5126, 4, 'VEC3');
  const uvAcc = push(Float32Array.from(uv).buffer, 5126, 4, 'VEC2');
  const nrmAcc = opts.withNormals ? push(Float32Array.from(nrm).buffer, 5126, 4, 'VEC3') : -1;
  const idxAcc = push(Uint16Array.from(idx).buffer, 5123, 6, 'SCALAR');
  const attributes: Record<string, number> = { POSITION: posAcc, TEXCOORD_0: uvAcc };
  if (opts.withNormals) attributes.NORMAL = nrmAcc;
  const json = {
    asset: { version: '2.0', generator: 'test' },
    ...(opts.quantize ? { extensionsRequired: ['KHR_mesh_quantization'], extensionsUsed: ['KHR_mesh_quantization'] } : {}),
    buffers: [{ byteLength: offset }], bufferViews: views, accessors,
    materials: [{ name: 'ring', pbrMetallicRoughness: { baseColorFactor: [0.03, 0.15, 1, 1], metallicFactor: 0.92, roughnessFactor: 0.13 }, extras: { anisotropy: 0.72, brandHex: '#2C6BFF' } }],
    meshes: [{ name: 'quad', primitives: [{ attributes, indices: idxAcc, material: 0, mode: 4 }] }],
    ...(opts.node ? { nodes: [{ name: 'quadNode', mesh: 0, scale: opts.node.scale, translation: opts.node.translation }], scenes: [{ nodes: [0] }], scene: 0 } : {}),
  };
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const bin = new Uint8Array(offset);
  let at = 0;
  for (const p of parts) { bin.set(new Uint8Array(p), at); at += p.byteLength + ((4 - (p.byteLength % 4)) % 4); }
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + bin.length;
  const out = new ArrayBuffer(total);
  const dv = new DataView(out);
  const u8 = new Uint8Array(out);
  dv.setUint32(0, opts.corruptMagic ? 0x12345678 : 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length + jsonPad, true); dv.setUint32(16, 0x4e4f534a, true);
  u8.set(jsonBytes, 20); for (let i = 0; i < jsonPad; i++) u8[20 + jsonBytes.length + i] = 0x20;
  const binAt = 20 + jsonBytes.length + jsonPad;
  dv.setUint32(binAt, bin.length, true); dv.setUint32(binAt + 4, 0x004e4942, true);
  u8.set(bin, binAt + 8);
  return out;
}

describe('parseGlb', () => {
  it('round-trips a float quad with normals: geometry, material factors, extras', () => {
    const r = parseGlb(quadGlb({ quantize: false, withNormals: true }));
    expect(isGltfRefusal(r)).toBe(false);
    if (isGltfRefusal(r)) return;
    expect(r.meshes).toHaveLength(1);
    const m = r.meshes[0]!;
    expect(m.name).toBe('quad');
    expect(Array.from(m.geometry.positions)).toEqual([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
    expect(Array.from(m.geometry.indices)).toEqual([0, 1, 2, 0, 2, 3]);
    expect(m.geometry.min).toEqual([-1, -1, 0]); expect(m.geometry.max).toEqual([1, 1, 0]);
    expect(m.derived).toEqual({ normals: false, tangents: true });
    expect(m.material.metallic).toBe(0.92); expect(m.material.roughness).toBe(0.13);
    expect(m.material.anisotropy).toBe(0.72); expect(m.material.brandHex).toBe('#2C6BFF');
    expect(m.geometry.tangents.length).toBe(12);
  });
  it('decodes int16-normalized positions (KHR_mesh_quantization) to the same floats within 1/32767', () => {
    const r = parseGlb(quadGlb({ quantize: true, withNormals: false }));
    if (isGltfRefusal(r)) throw new Error(r.reason);
    const p = r.meshes[0]!.geometry.positions;
    for (let i = 0; i < p.length; i++) expect(Math.abs(p[i]! - [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0][i]!)).toBeLessThanOrEqual(1 / 32767);
    expect(r.meshes[0]!.derived.normals).toBe(true);
    const n = r.meshes[0]!.geometry.normals;
    expect(Math.abs(n[2]!)).toBeCloseTo(1, 5);
  });
  it('de-quantizes through the node TRS: unit-cube positions come back in real units, normals stay unit', () => {
    const r = parseGlb(quadGlb({ quantize: true, withNormals: true, node: { scale: [2, 3, 1], translation: [1, 0, 5] } }));
    if (isGltfRefusal(r)) throw new Error(r.reason);
    const m = r.meshes[0]!;
    expect(m.name).toBe('quadNode');
    const p = Array.from(m.geometry.positions);
    const want = [-1, -3, 5, 3, -3, 5, 3, 3, 5, -1, 3, 5];
    for (let i = 0; i < p.length; i++) expect(Math.abs(p[i]! - want[i]!)).toBeLessThanOrEqual(3 / 32767);
    const tol = 3 / 32767;
    [-1, -3, 5].forEach((v, c) => expect(Math.abs(m.geometry.min[c]! - v)).toBeLessThanOrEqual(tol));
    [3, 3, 5].forEach((v, c) => expect(Math.abs(m.geometry.max[c]! - v)).toBeLessThanOrEqual(tol));
    expect(m.geometry.normals[2]).toBeCloseTo(1, 5);
    expect(Math.hypot(m.geometry.normals[0]!, m.geometry.normals[1]!, m.geometry.normals[2]!)).toBeCloseTo(1, 5);
  });
  it('refuses a wrong magic with the reason in words', () => {
    const r = parseGlb(quadGlb({ quantize: false, withNormals: true, corruptMagic: true }));
    expect(r.kind).toBe('refused');
    if (r.kind === 'refused') { expect(r.code).toBe('gltf-container'); expect(r.reason).toMatch(/glTF/); }
  });
  it('refuses a file too short to be a GLB', () => {
    const r = parseGlb(new ArrayBuffer(8));
    expect(r.kind).toBe('refused');
  });
});
