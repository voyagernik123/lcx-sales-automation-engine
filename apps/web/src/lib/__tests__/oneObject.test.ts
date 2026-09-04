import { parseGlb } from '@lcx/gl/env/gltf.js';
import { linearToHex } from '@lcx/gl/look/colour.js';
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * THE OBJECT RATCHET — S7 of INSTRUMENT_100X_PLAN, made mechanical.
 *
 * The rendered objects are brand artefacts, exempt from the five kill tests and bound by two things only:
 * the byte budget and brand fidelity decoded from the bytes. This file keeps both, and the two rules that
 * make a still honest on a page:
 *
 *   · every shipped object under `public/objects/` has a render sidecar that says `Standard` was the view
 *     transform and that the encoder found it within its budget;
 *   · `calibration.json` beside them shows the Standard patch decoding to `#2C6BFF` EXACTLY and the AgX patch
 *     NOT — an instrument that cannot move is not reading;
 *   · the directory stays inside the passthrough headroom the plan reserved for S7;
 *   · every `<img>` of an object declares width and height (no layout shift), and no object is animated;
 *   · no web code imports a `.blend`, and nothing under `scripts/blender/` is referenced from CI config.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const WEB = resolve(SRC, '..');
const ROOT = resolve(WEB, '../..');
const OBJECTS = join(WEB, 'public/objects');
/* 300 → 448 on 2026-09-04 (THE PRODUCTION P6): the Forge as a machined mesh, `forge.glb` (160,520 B + sidecar), joined the
   stills and the environment maps; public/objects measured 302.3 KB with it. The passthrough budget rose 1024 → 1152 in
   check-bundle.mjs for the same bytes, so the objects' share of it is stated here as 448 (≈ 130 KB of headroom for P7). */
const BUDGET_KB = 448;

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (!/__tests__|e2e|node_modules/.test(n)) walk(p, out); }
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.|\.spec\./.test(n)) out.push(p);
  }
  return out;
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l)).join('\n');

describe('the object — rendered, calibrated, budgeted', () => {
  const webps = existsSync(OBJECTS) ? readdirSync(OBJECTS).filter((f) => f.endsWith('.webp')) : [];

  it('ships at least one object, and every screen 1× has its 2× twin (a print mark is one file, by its sidecar)', () => {
    expect(webps.length).toBeGreaterThan(0);
    for (const f of webps.filter((f) => !f.includes('@2x'))) {
      const side = JSON.parse(readFileSync(join(OBJECTS, f.replace('.webp', '.render.json')), 'utf8'));
      if (/print/.test(String(side.encoded?.purpose ?? ''))) continue; // paper is the budget: one small file, no retina twin
      expect(webps, `${f} has no @2x twin`).toContain(f.replace('.webp', '@2x.webp'));
    }
  });

  it('every object carries a sidecar that rendered under Standard and encoded within budget', () => {
    for (const f of webps.filter((f) => !f.includes('@2x'))) {
      const side = join(OBJECTS, f.replace('.webp', '.render.json'));
      expect(existsSync(side), `${f} has no .render.json sidecar — nothing ships without its evidence`).toBe(true);
      const j = JSON.parse(readFileSync(side, 'utf8'));
      expect(j.transform, `${f} was not rendered under Standard`).toBe('Standard');
      expect(j.look).toBe('None');
      expect(j.display).toBe('sRGB');
      expect(j.encoded?.withinBudget, `${f} encoded over its budget`).toBe(true);
      expect(j.encoded?.['1x']?.bytes).toBe(statSync(join(OBJECTS, f)).size);
    }
  });

  it('the calibration pair holds: Standard exact, AgX not', () => {
    const cal = JSON.parse(readFileSync(join(OBJECTS, 'calibration.json'), 'utf8'));
    expect(cal.patchHex).toBe('#2C6BFF');
    expect(cal.readings.Standard.decoded).toBe('#2C6BFF');
    expect(cal.readings.Standard.exact).toBe(true);
    expect(cal.readings.AgX.decoded).not.toBe('#2C6BFF');
    expect(cal.readings.AgX.exact).toBe(false);
  });

  it('the objects stay inside the passthrough headroom', () => {
    const bytes = readdirSync(OBJECTS).reduce((n, f) => n + statSync(join(OBJECTS, f)).size, 0);
    expect(bytes / 1024, `public/objects is ${(bytes / 1024).toFixed(1)} KB`).toBeLessThanOrEqual(BUDGET_KB);
  });

  it('every <img> of an object declares width and height, and none is animated', () => {
    const files = walk(SRC).filter((f) => /\/objects\/[a-z-]+\.webp|data-object=/.test(readFileSync(f, 'utf8')));
    expect(files.length, 'no component renders an object').toBeGreaterThan(0);
    for (const f of files) {
      const src = strip(readFileSync(f, 'utf8'));
      const imgs = src.match(/<img[\s\S]*?\/>/g) ?? [];
      for (const img of imgs.filter((i) => /objects\/|data-object/.test(i))) {
        expect(img, `${f}: an object <img> without width`).toMatch(/\bwidth=/);
        expect(img, `${f}: an object <img> without height`).toMatch(/\bheight=/);
        expect(img).not.toMatch(/animate-/);
      }
    }
  });

  it('no web code imports a .blend, and CI does not reference the render pipeline', () => {
    for (const f of walk(SRC)) expect(readFileSync(f, 'utf8')).not.toMatch(/\.blend['"]/);
    const ci = join(ROOT, '.github/workflows');
    if (existsSync(ci)) {
      for (const w of readdirSync(ci)) expect(readFileSync(join(ci, w), 'utf8'), `${w} references scripts/blender`).not.toMatch(/scripts\/blender/);
    }
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(JSON.stringify(pkg.scripts ?? {})).not.toMatch(/blender/);
  });

  /* THE MACHINED OBJECTS (P6). A .glb ships under the same rule as a .webp: nothing without its evidence. The sidecar
     is written by scripts/blender/export_gltf.py at export time — bytes must equal the file (a re-export without its
     sidecar fails here), the view transform is Standard like every other object in this directory, and the mark was
     actually engraved (the polygon count is read from lcx-mark.svg, never assumed). */
  const glbs = existsSync(OBJECTS) ? readdirSync(OBJECTS).filter((f) => f.endsWith('.glb')) : [];
  it('every .glb carries an export sidecar whose bytes, transform and engraving are real', () => {
    expect(glbs.length, 'the Forge mesh is not in public/objects').toBeGreaterThan(0);
    for (const f of glbs) {
      const side = join(OBJECTS, `${f}.render.json`);
      expect(existsSync(side), `${f} has no .render.json sidecar`).toBe(true);
      const j = JSON.parse(readFileSync(side, 'utf8'));
      expect(j.bytes, `${f}: sidecar bytes ≠ file bytes — re-exported without its sidecar`).toBe(statSync(join(OBJECTS, f)).size);
      expect(j.viewTransform).toBe('Standard');
      expect(String(j.blender)).toMatch(/^5\./);
      expect(j.meshes.length).toBeGreaterThanOrEqual(3);
      for (const name of ['disc', 'ring', 'plinth']) expect(j.meshes.map((m: { name: string }) => m.name)).toContain(name);
      expect(j.mark.polygons, 'the mark was not engraved').toBeGreaterThanOrEqual(1);
      expect(j.mark.source).toBe('apps/web/public/lcx-mark.svg');
    }
  });

  /* THE BRAND HEX FROM THE BYTES (P6 gate, the S7 rule applied to a mesh). The still's calibration reads a rendered patch;
     a glb has no pixels, so the claim is decided on the material bytes the loader hands the engine: the ring's linear
     baseColorFactor, encoded back through the engine's own sRGB transfer, must be the brand hex EXACTLY — and the
     exporter's descriptive `brandHex` must agree with it, so the two cannot drift apart silently. */
  it('the Forge glb carries the brand hex FROM THE BYTES: the ring decodes to #2C6BFF exactly', () => {
    const buf = readFileSync(join(OBJECTS, 'forge.glb'));
    const asset = parseGlb(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    expect(asset.kind).toBe('gltf');
    if (asset.kind !== 'gltf') return;
    const ring = asset.meshes.find((m) => m.name === 'ring');
    expect(ring, 'no ring mesh').toBeTruthy();
    const [r, g, b] = ring!.material.baseColor;
    expect(linearToHex([r, g, b]).toUpperCase()).toBe('#2C6BFF');
    expect(ring!.material.brandHex).toBe('#2C6BFF');
    const disc = asset.meshes.find((m) => m.name === 'disc')!;
    expect(linearToHex([...disc.material.baseColor] as [number, number, number]).toUpperCase()).toBe(disc.material.brandHex!.toUpperCase());
    expect(asset.meshes.map((m) => m.name).sort()).toEqual(['disc', 'marker', 'plinth', 'ring']);
  });
});
