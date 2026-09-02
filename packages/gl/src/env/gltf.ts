/**
 * THE glTF 2.0 LOADER — the minimum that carries a machined object from Blender into the engine.
 *
 * Scope, on purpose: GLB container only (one JSON chunk, one BIN chunk); triangle primitives (mode 4) with indices;
 * accessors decoded generically by componentType + `normalized`, which is what makes KHR_mesh_quantization files
 * load through the same path as float ones — a quantized int16 position is just an accessor whose bytes are read
 * with a different view and scale. Materials are pbrMetallicRoughness FACTORS plus two extras our exporter writes
 * (`anisotropy`, `brandHex`). No textures, no skins, no animation, no Draco, no external buffers. Anything outside
 * that is a REFUSAL with the reason, not a silent partial mesh: a half-loaded object drawn confidently is the class
 * of defect the ledger keeps finding.
 */
import { computeNormals, computeTangents, type Geometry } from './mesh.js';

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

export type GltfRefusalCode = 'gltf-container' | 'gltf-accessor' | 'gltf-primitive' | 'gltf-unsupported';

export interface GltfRefusal {
  readonly kind: 'refused';
  readonly code: GltfRefusalCode;
  /** What a reader should be told. Never "an error occurred". */
  readonly reason: string;
}

export interface GltfMaterial {
  /** Linear RGB 0..1 from baseColorFactor (glTF stores linear). */
  readonly baseColor: readonly [number, number, number];
  readonly metallic: number;
  readonly roughness: number;
  /** Our exporter's extras; 0 when absent. */
  readonly anisotropy: number;
  /** The sRGB hex the exporter claims for this material, for the brand-fidelity check to compare against bytes. */
  readonly brandHex: string | null;
}

export interface GltfMesh {
  readonly name: string;
  readonly geometry: Geometry;
  readonly material: GltfMaterial;
  /** True when NORMAL / TANGENT were absent from the file and derived here — the sidecar test reads this. */
  readonly derived: { readonly normals: boolean; readonly tangents: boolean };
}

export interface GltfAsset {
  readonly kind: 'gltf';
  readonly meshes: readonly GltfMesh[];
  readonly bytes: number;
  readonly generator: string | null;
}

interface JsonAccessor {
  bufferView?: number; byteOffset?: number; componentType: number; normalized?: boolean; count: number; type: string;
}
interface JsonBufferView { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }
interface JsonPrimitive { attributes: Record<string, number>; indices?: number; material?: number; mode?: number }
interface JsonMaterial {
  name?: string;
  pbrMetallicRoughness?: { baseColorFactor?: number[]; metallicFactor?: number; roughnessFactor?: number };
  extras?: { anisotropy?: number; brandHex?: string };
}
interface JsonNode { name?: string; mesh?: number; translation?: number[]; rotation?: number[]; scale?: number[]; children?: number[] }
interface JsonRoot {
  asset?: { version?: string; generator?: string };
  nodes?: JsonNode[]; scenes?: { nodes?: number[] }[]; scene?: number;
  accessors?: JsonAccessor[]; bufferViews?: JsonBufferView[]; buffers?: { byteLength: number; uri?: string }[];
  meshes?: { name?: string; primitives: JsonPrimitive[] }[]; materials?: JsonMaterial[];
  extensionsRequired?: string[];
}

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const SUPPORTED_EXTENSIONS = new Set(['KHR_mesh_quantization']);

function refuse(code: GltfRefusalCode, reason: string): GltfRefusal {
  return { kind: 'refused', code, reason };
}

/** Read one accessor into Float32Array, applying `normalized` de-quantization per the glTF spec table. */
function readAccessor(root: JsonRoot, bin: DataView, index: number): Float32Array | GltfRefusal {
  const acc = root.accessors?.[index];
  if (!acc) return refuse('gltf-accessor', `accessor ${index} is not in the file`);
  const view = acc.bufferView === undefined ? undefined : root.bufferViews?.[acc.bufferView];
  if (!view) return refuse('gltf-accessor', `accessor ${index} has no bufferView (sparse accessors are not supported)`);
  const n = COMPONENTS[acc.type];
  if (!n) return refuse('gltf-accessor', `accessor ${index} type ${acc.type} is not SCALAR/VEC2/VEC3/VEC4`);
  const out = new Float32Array(acc.count * n);
  const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const size = componentSize(acc.componentType);
  if (size === 0) return refuse('gltf-accessor', `accessor ${index} componentType ${acc.componentType} is unknown`);
  const stride = view.byteStride ?? size * n;
  if (acc.count > 0 && base + (acc.count - 1) * stride + size * n > bin.byteLength) {
    return refuse('gltf-accessor', `accessor ${index} runs past the end of the binary chunk`);
  }
  for (let i = 0; i < acc.count; i++) {
    const at = base + i * stride;
    for (let c = 0; c < n; c++) {
      out[i * n + c] = readComponent(bin, at + c * size, acc.componentType, acc.normalized === true);
    }
  }
  return out;
}

function componentSize(t: number): number {
  switch (t) {
    case 5120: case 5121: return 1;
    case 5122: case 5123: return 2;
    case 5125: case 5126: return 4;
    default: return 0;
  }
}

function readComponent(v: DataView, at: number, t: number, normalized: boolean): number {
  switch (t) {
    case 5126: return v.getFloat32(at, true);
    case 5120: { const x = v.getInt8(at); return normalized ? Math.max(x / 127, -1) : x; }
    case 5121: { const x = v.getUint8(at); return normalized ? x / 255 : x; }
    case 5122: { const x = v.getInt16(at, true); return normalized ? Math.max(x / 32767, -1) : x; }
    case 5123: { const x = v.getUint16(at, true); return normalized ? x / 65535 : x; }
    case 5125: return v.getUint32(at, true);
    default: return 0;
  }
}

function readIndices(root: JsonRoot, bin: DataView, index: number): Uint16Array | Uint32Array | GltfRefusal {
  const acc = root.accessors?.[index];
  if (!acc) return refuse('gltf-accessor', `index accessor ${index} is not in the file`);
  const f = readAccessor(root, bin, index);
  if ('kind' in f) return f;
  if (acc.componentType === 5125) return Uint32Array.from(f);
  if (acc.componentType === 5123 || acc.componentType === 5121) return Uint16Array.from(f);
  return refuse('gltf-accessor', `index accessor ${index} componentType ${acc.componentType} is not an integer type`);
}

function bounds(p: Float32Array): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      const v = p[i + c]!;
      if (v < min[c]!) min[c] = v;
      if (v > max[c]!) max[c] = v;
    }
  }
  return { min, max };
}

function material(root: JsonRoot, index: number | undefined): GltfMaterial {
  const m = index === undefined ? undefined : root.materials?.[index];
  const pbr = m?.pbrMetallicRoughness;
  const c = pbr?.baseColorFactor ?? [1, 1, 1, 1];
  return {
    baseColor: [c[0] ?? 1, c[1] ?? 1, c[2] ?? 1],
    metallic: pbr?.metallicFactor ?? 1,
    roughness: pbr?.roughnessFactor ?? 1,
    anisotropy: typeof m?.extras?.anisotropy === 'number' ? m.extras.anisotropy : 0,
    brandHex: typeof m?.extras?.brandHex === 'string' ? m.extras.brandHex : null,
  };
}

/** Unit quaternion → 3×3 rotation (column-major rows here as a flat array r[row*3+col]). */
function quatToMat(q: readonly number[]): number[] {
  const [x = 0, y = 0, z = 0, w = 1] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
}

/** p' = R · (S · p) + T, in place on a copy. */
function applyTrs(p: Float32Array, node: JsonNode, label: string): Float32Array | GltfRefusal {
  const s = node.scale ?? [1, 1, 1];
  const t = node.translation ?? [0, 0, 0];
  const r = quatToMat(node.rotation ?? [0, 0, 0, 1]);
  if (s.length !== 3 || t.length !== 3 || r.length !== 9) return refuse('gltf-container', `${label}: malformed node TRS`);
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i]! * s[0]!, y = p[i + 1]! * s[1]!, z = p[i + 2]! * s[2]!;
    out[i] = r[0]! * x + r[1]! * y + r[2]! * z + t[0]!;
    out[i + 1] = r[3]! * x + r[4]! * y + r[5]! * z + t[1]!;
    out[i + 2] = r[6]! * x + r[7]! * y + r[8]! * z + t[2]!;
  }
  return out;
}

/** Directions under a TRS: rotate; for normals divide by the scale first (inverse-transpose of a diagonal); renormalise. */
function rotateDirections(d: Float32Array, node: JsonNode, isNormal: boolean): Float32Array {
  const s = node.scale ?? [1, 1, 1];
  const r = quatToMat(node.rotation ?? [0, 0, 0, 1]);
  const out = new Float32Array(d.length);
  for (let i = 0; i < d.length; i += 3) {
    let x = d[i]!, y = d[i + 1]!, z = d[i + 2]!;
    if (isNormal) { x /= s[0]! || 1; y /= s[1]! || 1; z /= s[2]! || 1; } else { x *= s[0]!; y *= s[1]!; z *= s[2]!; }
    const rx = r[0]! * x + r[1]! * y + r[2]! * z, ry = r[3]! * x + r[4]! * y + r[5]! * z, rz = r[6]! * x + r[7]! * y + r[8]! * z;
    const len = Math.hypot(rx, ry, rz) || 1;
    out[i] = rx / len; out[i + 1] = ry / len; out[i + 2] = rz / len;
  }
  return out;
}

/**
 * Parse a GLB. Pure: no fetch, no GL. Feed it the bytes and upload the result with `uploadMesh` per mesh.
 */
export function parseGlb(buffer: ArrayBuffer): GltfAsset | GltfRefusal {
  if (buffer.byteLength < 20) return refuse('gltf-container', `file is ${buffer.byteLength} bytes; a GLB header alone is 12`);
  const head = new DataView(buffer);
  if (head.getUint32(0, true) !== GLB_MAGIC) return refuse('gltf-container', 'the first four bytes are not "glTF"');
  const version = head.getUint32(4, true);
  if (version !== 2) return refuse('gltf-container', `GLB version ${version}; only 2 is supported`);
  const total = head.getUint32(8, true);
  if (total > buffer.byteLength) return refuse('gltf-container', `header says ${total} bytes, file has ${buffer.byteLength}`);

  let at = 12;
  let json: JsonRoot | null = null;
  let bin: DataView | null = null;
  while (at + 8 <= total) {
    const len = head.getUint32(at, true);
    const type = head.getUint32(at + 4, true);
    const start = at + 8;
    if (start + len > total) return refuse('gltf-container', `chunk at ${at} runs past the file`);
    if (type === CHUNK_JSON) {
      try {
        json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, len))) as JsonRoot;
      } catch (e) {
        return refuse('gltf-container', `JSON chunk does not parse: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else if (type === CHUNK_BIN) {
      bin = new DataView(buffer, start, len);
    }
    at = start + len + ((4 - (len % 4)) % 4);
  }
  if (!json) return refuse('gltf-container', 'no JSON chunk');
  if (!bin) return refuse('gltf-container', 'no BIN chunk (external buffers are not supported)');
  if (json.buffers?.some((b) => b.uri !== undefined)) return refuse('gltf-unsupported', 'external buffer uri');
  const unsupported = (json.extensionsRequired ?? []).filter((e) => !SUPPORTED_EXTENSIONS.has(e));
  if (unsupported.length) return refuse('gltf-unsupported', `required extensions not supported: ${unsupported.join(', ')}`);

  // Instances: every node that carries a mesh, with its TRS applied to positions — this is where a quantized file's
  // de-quantization lives (KHR_mesh_quantization puts positions in the unit cube and the real extent on the node).
  // A file with no nodes is read as its raw meshes. Node hierarchies are refused: the objects we export are flat.
  const instances: { mesh: NonNullable<JsonRoot['meshes']>[number]; mi: number; node: JsonNode | null }[] = [];
  const nodeList = json.nodes ?? [];
  const sceneNodes = json.scenes?.[json.scene ?? 0]?.nodes ?? nodeList.map((_, i) => i);
  if (nodeList.length > 0) {
    for (const ni of sceneNodes) {
      const node = nodeList[ni];
      if (!node) return refuse('gltf-container', `scene references node ${ni}, which is not in the file`);
      if (node.children?.length) return refuse('gltf-unsupported', `node ${node.name ?? ni} has children; hierarchies are not supported`);
      if (node.mesh === undefined) continue;
      const mesh = json.meshes?.[node.mesh];
      if (!mesh) return refuse('gltf-container', `node ${node.name ?? ni} references mesh ${node.mesh}, which is not in the file`);
      instances.push({ mesh, mi: node.mesh, node });
    }
  } else {
    for (const [mi, mesh] of (json.meshes ?? []).entries()) instances.push({ mesh, mi, node: null });
  }
  const meshes: GltfMesh[] = [];
  for (const { mesh, mi, node } of instances) {
    for (const [pi, prim] of mesh.primitives.entries()) {
      const label = `${node?.name ?? mesh.name ?? `mesh${mi}`}${mesh.primitives.length > 1 ? `#${pi}` : ''}`;
      if ((prim.mode ?? 4) !== 4) return refuse('gltf-primitive', `${label}: mode ${prim.mode} is not TRIANGLES`);
      if (prim.attributes.POSITION === undefined) return refuse('gltf-primitive', `${label}: no POSITION`);
      if (prim.indices === undefined) return refuse('gltf-primitive', `${label}: non-indexed primitives are not supported`);
      const rawPositions = readAccessor(json, bin, prim.attributes.POSITION);
      if ('kind' in rawPositions) return rawPositions;
      const trs = node ? applyTrs(rawPositions, node, label) : rawPositions;
      if ('kind' in trs) return trs;
      const positions = trs;
      const indices = readIndices(json, bin, prim.indices);
      if ('kind' in indices) return indices;
      if (indices.length % 3 !== 0) return refuse('gltf-primitive', `${label}: ${indices.length} indices is not a multiple of 3`);
      const vertexCount = positions.length / 3;
      for (let i = 0; i < indices.length; i++) {
        if (indices[i]! >= vertexCount) return refuse('gltf-primitive', `${label}: index ${indices[i]} ≥ ${vertexCount} vertices`);
      }
      let normals: Float32Array;
      let derivedNormals = false;
      if (prim.attributes.NORMAL !== undefined) {
        const n = readAccessor(json, bin, prim.attributes.NORMAL);
        if ('kind' in n) return n;
        normals = node ? rotateDirections(n, node, true) : n;
      } else { normals = computeNormals(positions, indices); derivedNormals = true; }
      let uvs: Float32Array;
      if (prim.attributes.TEXCOORD_0 !== undefined) {
        const u = readAccessor(json, bin, prim.attributes.TEXCOORD_0);
        if ('kind' in u) return u;
        uvs = u;
      } else uvs = new Float32Array(vertexCount * 2);
      let tangents: Float32Array;
      let derivedTangents = false;
      if (prim.attributes.TANGENT !== undefined) {
        const t = readAccessor(json, bin, prim.attributes.TANGENT);
        if ('kind' in t) return t;
        // glTF tangents are VEC4 (w = handedness); the engine wants xyz.
        let t3 = t;
        if (t.length === vertexCount * 4) {
          t3 = new Float32Array(vertexCount * 3);
          for (let i = 0; i < vertexCount; i++) { t3[i * 3] = t[i * 4]!; t3[i * 3 + 1] = t[i * 4 + 1]!; t3[i * 3 + 2] = t[i * 4 + 2]!; }
        }
        tangents = node ? rotateDirections(t3, node, false) : t3;
      } else { tangents = computeTangents(positions, normals, uvs, indices); derivedTangents = true; }
      const { min, max } = bounds(positions);
      meshes.push({
        name: label,
        geometry: { positions, normals, uvs, tangents, indices, min, max },
        material: material(json, prim.material),
        derived: { normals: derivedNormals, tangents: derivedTangents },
      });
    }
  }
  if (meshes.length === 0) return refuse('gltf-primitive', 'the file has no triangle primitives');
  return { kind: 'gltf', meshes, bytes: buffer.byteLength, generator: json.asset?.generator ?? null };
}

export function isGltfRefusal(x: GltfAsset | GltfRefusal): x is GltfRefusal { return x.kind === 'refused'; }
