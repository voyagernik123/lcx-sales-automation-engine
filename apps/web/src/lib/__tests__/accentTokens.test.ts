import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * THE ACCENT TOKENS, HELD TO THE TWO FLOORS THEY EXIST FOR (2026-09-02).
 *
 * `text-cyan-500` sat on 57 sites at 2.43:1 in the light theme — below the 3:1 floor for a glyph
 * and the 4.5:1 floor for text, a dozen of them rendering glyphs. It was replaced by two tokens
 * because the two floors differ: `--accent-icon` (cyan-600 light / cyan-400 dark) for icons and
 * strokes, `--accent-text` (cyan-700 light / cyan-400 dark) for words. This file recomputes every
 * ratio from tokens.css against the page and the card in both themes, and refuses the raw class
 * anywhere in source so the sweep cannot silently regress site by site.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function luminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a: [number, number, number], b: [number, number, number]): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `--token: r g b;` triples per theme block — the same shape contrast.test.ts parses. */
function tokens(): { light: Record<string, [number, number, number]>; dark: Record<string, [number, number, number]> } {
  const css = readFileSync(join(SRC, 'styles', 'tokens.css'), 'utf8');
  const darkStart = css.search(/\.dark\s*\{/);
  expect(darkStart, 'tokens.css has no `.dark {` block').toBeGreaterThan(0);
  const parse = (block: string) => {
    const out: Record<string, [number, number, number]> = {};
    for (const m of block.matchAll(/--([a-z0-9-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) out[m[1]!] = [Number(m[2]), Number(m[3]), Number(m[4])];
    return out;
  };
  return { light: parse(css.slice(0, darkStart)), dark: parse(css.slice(darkStart)) };
}

function walk(dir: string, out: string[] = []): string[] {
  const fs = require('node:fs') as typeof import('node:fs');
  for (const n of fs.readdirSync(dir)) {
    const p = join(dir, n);
    if (fs.statSync(p).isDirectory()) { if (!/__tests__|node_modules/.test(n)) walk(p, out); }
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\./.test(n)) out.push(p);
  }
  return out;
}

describe('the accent tokens clear the floors they were introduced for', () => {
  const { light, dark } = tokens();

  for (const [theme, t] of [['light', light], ['dark', dark]] as const) {
    for (const ground of ['page-bg', 'card'] as const) {
      it(`${theme}: --accent-text ≥ 4.5:1 on --${ground} (text floor)`, () => {
        expect(t['accent-text'], `--accent-text missing in ${theme}`).toBeDefined();
        expect(t[ground], `--${ground} missing in ${theme}`).toBeDefined();
        const r = contrast(t['accent-text']!, t[ground]!);
        expect(r, `--accent-text on --${ground} in ${theme} is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      });
      it(`${theme}: --accent-icon ≥ 3:1 on --${ground} (glyph floor)`, () => {
        const r = contrast(t['accent-icon']!, t[ground]!);
        expect(r, `--accent-icon on --${ground} in ${theme} is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
      });
    }
  }

  it('the raw class that failed both floors is gone from source', () => {
    const offenders = walk(SRC).filter((f) => /\btext-cyan-500\b/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(SRC.length + 1));
    expect(offenders).toEqual([]);
  });

  it('the negative control: cyan-500 on the light page really did fail the text floor', () => {
    expect(contrast([6, 182, 212], light['page-bg']!)).toBeLessThan(3);
  });
});
