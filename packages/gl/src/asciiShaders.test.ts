import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * EVERY SHADER SOURCE IS PURE ASCII. Found 2026-09-14: an em dash in a comment inside the depth-of-field fragment
 * shader made Chromium reject the source; the DOF program failed on every desk surface that uses it and the desk's
 * keyboard layer went down with it — ten Playwright specs red, none of them about shaders. A comment is source too.
 */
const ROOT = join(__dirname);
/* Shaders whose source text is HASHED beside a recorded pixel measurement (look/brandPixel.test.ts and the pre-compensation   record): changing a byte in them, even a comment, invalidates the record and the tests that guard it — rightly, since
   the record says "these pixels came from this source". They keep their existing comments; the rule applies to every
   shader that is free to change. */
const PIXEL_PINNED = new Set(['src/look/aa.ts', 'src/look/pipeline.ts', 'src/primitives/points.ts']);
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.ts$/.test(n) && !/\.test\.ts$/.test(n)) out.push(p);
  }
  return out;
}
describe('shader sources are pure ASCII', () => {
  const files = walk(ROOT);
  const shaders: { file: string; index: number; text: string }[] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const re = /`(#version 300 es[\s\S]*?)`/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) shaders.push({ file: f.replace(ROOT, 'src'), index: m.index, text: m[1]! });
  }
  it('finds the shaders', () => {
    expect(shaders.length).toBeGreaterThan(10);
  });
  it('none carries a character above 0x7F, comments included', () => {
    for (const s of shaders) {
      if (PIXEL_PINNED.has(s.file)) continue;
      const bad = [...s.text].filter((c) => c.charCodeAt(0) > 0x7f);
      expect(bad, `${s.file} @${s.index}: non-ASCII in shader source: ${[...new Set(bad)].map((c) => `U+${c.charCodeAt(0).toString(16)}`).join(' ')}`).toEqual([]);
    }
  });
});
