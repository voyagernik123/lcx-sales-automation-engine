/**
 * THE FORGE'S OBJECTS — the pure half of the glb swap (P6).
 *
 * `ForgeBackdrop` draws four primitives on its first frame (the shapes the S7 still was rendered from) and then, when
 * `/objects/forge.glb` has arrived and parsed, replaces THREE buffers — disc, ring, plinth — with the machined meshes.
 * This module decides what a parsed asset may replace and refuses partially: every named mesh must be present and every
 * upload must succeed, or nothing is swapped and whatever was uploaded is disposed. A half-swapped Forge (machined disc,
 * primitive ring) is exactly the kind of confident wrong frame the ledger keeps finding, so it is unrepresentable here.
 * No GL, no fetch: the caller hands in the uploader, which makes this testable with a fake.
 */
import type { GltfAsset } from '@lcx/gl';
import type { Geometry } from '@lcx/gl/env/mesh.js';

export const FORGE_GLB_URL = '/objects/forge.glb';
export const FORGE_PART_NAMES = ['disc', 'ring', 'plinth'] as const;
export type ForgePartName = (typeof FORGE_PART_NAMES)[number];

export interface Disposable { dispose(): void }
export interface SwapRefusal { readonly kind: 'refused'; readonly reason: string }

export function swapForgeMeshes<M extends Disposable>(
  asset: GltfAsset,
  upload: (g: Geometry) => M | { kind: 'refused'; reason: string },
): Record<ForgePartName, M> | SwapRefusal {
  const byName = new Map(asset.meshes.map((m) => [m.name, m] as const));
  const missing = FORGE_PART_NAMES.filter((n) => !byName.has(n));
  if (missing.length) return { kind: 'refused', reason: `forge.glb lacks ${missing.join(', ')} (has ${[...byName.keys()].join(', ') || 'nothing'})` };
  const done: Partial<Record<ForgePartName, M>> = {};
  for (const name of FORGE_PART_NAMES) {
    const r = upload(byName.get(name)!.geometry);
    if ('kind' in r) {
      for (const m of Object.values(done)) m.dispose();
      return { kind: 'refused', reason: `${name}: ${r.reason}` };
    }
    done[name] = r;
  }
  return done as Record<ForgePartName, M>;
}
