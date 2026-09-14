import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGlb, type GltfAsset, type GltfRefusal } from '@lcx/gl/env/gltf.js';
import { FORGE_DISC_INLAY, FORGE_DISC_TOP_Y, FORGE_DISC_Y } from '../ForgeBackdrop';

/**
 * THE INLAY'S NUMBERS COME FROM THE ASSET. forge.glb's disc: top face at +0.08 about its node, the LCX mark engraved
 * 0.012 deep inside r ≈ 0.57, a bevelled rim from r ≈ 0.90. The inlay plane must sit between the engraving floor and
 * the top face, and its radius must clear the mark and stop short of the rim — re-derived here from the bytes so a
 * re-export with a deeper mark or a wider rim fails this test instead of shipping a blank or a dark-rimmed disc.
 */
// vitest's jsdom environment gives import.meta.url a non-file scheme, so the asset is found from the package root.
const GLB = ['public/objects/forge.glb', 'apps/web/public/objects/forge.glb'].map((rel) => join(process.cwd(), rel)).find((f) => existsSync(f))!;
const bytes = readFileSync(GLB);
const parsed = parseGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer) as GltfAsset | GltfRefusal;
const refused = (a: GltfAsset | GltfRefusal): a is GltfRefusal => (a as GltfRefusal).kind === 'refused';

describe('the Forge disc inlay is bracketed by the engraving in forge.glb', () => {
  it('parses, and the disc is there', () => {
    expect(refused(parsed)).toBe(false);
  });
  it('plane: below the top face, above the engraving floor; radius: past the mark, short of the rim', () => {
    if (refused(parsed)) throw new Error(parsed.reason);
    const disc = parsed.meshes.find((m) => m.name === 'disc')!;
    const p = disc.geometry.positions;
    let top = -Infinity;
    for (let i = 1; i < p.length; i += 3) top = Math.max(top, p[i]!);
    expect(top).toBeCloseTo(0.08, 3);
    expect(FORGE_DISC_TOP_Y).toBeCloseTo(FORGE_DISC_Y + top, 6);
    // the engraving floor: the deepest level inside the mark's radius
    let floor = top, markR = 0, rimInner = Infinity;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i]!, y = p[i + 1]!, z = p[i + 2]!, r = Math.hypot(x, z);
      if (y < top - 1e-4) {
        if (r < 0.8) { floor = Math.min(floor, y); markR = Math.max(markR, r); }
        else rimInner = Math.min(rimInner, r);
      }
    }
    expect(floor).toBeLessThan(top - 0.005);
    const planeLocal = FORGE_DISC_INLAY.belowY - FORGE_DISC_Y;
    expect(planeLocal).toBeGreaterThan(floor);
    expect(planeLocal).toBeLessThan(top);
    expect(FORGE_DISC_INLAY.withinRadius).toBeGreaterThan(markR);
    expect(FORGE_DISC_INLAY.withinRadius).toBeLessThan(rimInner);
  });
});
