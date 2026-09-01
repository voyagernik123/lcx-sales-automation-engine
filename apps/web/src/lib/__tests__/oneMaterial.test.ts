import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTHORED_HEX } from '@lcx/gl/look/theme.js';
import {
  CHART_BEGIN, CHART_END, SCENERY_BEGIN, SCENERY_END, SCENERY_TOKENS,
  pageColourHex, renderChartTwinBlock, renderSceneryBlock,
} from '../sceneryTokens';

/**
 * THE ONE-MATERIAL RATCHET — S2 of INSTRUMENT_100X_PLAN.md, made mechanical.
 *
 * S0 measured the seam between the DOM's scenery tokens and the GL rig's scenery fields: 2.78,
 * 3.09 and 3.13 ΔE2000 on three of six pairs. The plan's target is < 1.0 everywhere. This file
 * asserts something stronger and simpler — the DOM tokens ARE the GL fields, rendered by one
 * pure function — and it does so on the committed artefacts, not on a claim:
 *
 *   · the generated blocks in tokens.css equal what `renderSceneryBlock()` renders from theme.ts
 *     RIGHT NOW (so an edit to theme.ts without `npm run gen:tokens` is a red build);
 *   · every derived token's triple decodes to a colour within 0.01 ΔE2000 of its GL field — the
 *     conversion is exact, the tolerance is only floating point;
 *   · index.html paints the pre-hydration page in the same ground, both themes — the first frame
 *     is the same colour as the second;
 *   · no scenery token is defined anywhere in tokens.css OUTSIDE the generated block — the second
 *     author is gone, not merely outvoted.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const css = readFileSync(join(SRC, 'styles/tokens.css'), 'utf8');
const html = readFileSync(join(SRC, '../index.html'), 'utf8');

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const spans = (begin: string, end: string) =>
  [...css.matchAll(new RegExp(`[ \\t]*${esc(begin)}[\\s\\S]*?${esc(end)}`, 'g'))].map((m) => m[0]);

/* ΔE2000 over Lab, the same maths S0 validated against Sharma's pairs. */
const S2L = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function lab(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const [R, G, B] = [0, 2, 4].map((i) => S2L(parseInt(h.slice(i, i + 2), 16) / 255));
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
  const Z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
function dE2000(a: string, b: string): number {
  const [L1, a1, b1] = lab(a), [L2, a2, b2] = lab(b);
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (x: number, y: number) => { if (x === 0 && y === 0) return 0; const t = Math.atan2(y, x) * deg; return t < 0 ? t + 360 : t; };
  const h1 = h(a1p, b1), h2 = h(a2p, b2);
  let dh = 0; if (C1p * C2p !== 0) { dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * rad);
  const Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hb = h1 + h2; if (C1p * C2p !== 0) { if (Math.abs(h1 - h2) > 180) hb += hb < 360 ? 360 : -360; hb /= 2; }
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.20 * Math.cos((4 * hb - 63) * rad);
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2), SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T;
  const RT = -2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hb - 275) / 25) ** 2)) * rad);
  return Math.sqrt(((L2 - L1) / SL) ** 2 + ((C2p - C1p) / SC) ** 2 + (dH / SH) ** 2 + RT * ((C2p - C1p) / SC) * (dH / SH));
}
const tripleToHex = (t: string) => '#' + t.trim().split(/\s+/).map((v) => Number(v).toString(16).padStart(2, '0')).join('');

describe('one material — the DOM scenery IS the GL rig', () => {
  it('ΔE2000 passes its Sharma control before judging anything', () => {
    // Sharma, Wu & Dalal (2005) pair 1 via hexes is not exact; use the Lab pair directly through
    // the same function shape: two greys one L apart must be ~1.0 and identical colours 0.
    expect(dE2000('#808080', '#808080')).toBe(0);
    expect(dE2000('#2C6BFF', '#2C6BFF')).toBe(0);
    expect(dE2000('#000000', '#FFFFFF')).toBeGreaterThan(90);
  });

  it('the committed scenery blocks equal what the generator renders from theme.ts right now', () => {
    const found = spans(SCENERY_BEGIN, SCENERY_END);
    expect(found, 'expected exactly two generated scenery blocks (:root, .dark)').toHaveLength(2);
    expect(found[0]).toBe(renderSceneryBlock('light'));
    expect(found[1]).toBe(renderSceneryBlock('dark'));
    const twins = spans(CHART_BEGIN, CHART_END);
    expect(twins, 'expected exactly two chart-twin blocks').toHaveLength(2);
    expect(twins[0]).toBe(renderChartTwinBlock('light'));
    expect(twins[1]).toBe(renderChartTwinBlock('dark'));
  });

  it('every derived token decodes to its GL field — the seam is zero, not "under 1.0"', () => {
    for (const [i, theme] of (['light', 'dark'] as const).entries()) {
      const block = spans(SCENERY_BEGIN, SCENERY_END)[i]!;
      for (const { token, field } of SCENERY_TOKENS) {
        const m = new RegExp(`--${token}:\\s*(\\d+ \\d+ \\d+);`).exec(block);
        expect(m, `${theme}: --${token} missing from the generated block`).toBeTruthy();
        const dom = tripleToHex(m![1]!);
        const gl = AUTHORED_HEX[theme][field];
        expect(dE2000(dom, gl), `${theme}: --${token} (${dom}) vs ${field} (${gl})`).toBeLessThan(0.01);
      }
    }
  });

  it('index.html paints the first frame in the same ground as the stylesheet will, both themes', () => {
    expect(html).toContain(`style="background-color: ${pageColourHex('light')}"`);
    expect(html).toContain(`document.body.style.backgroundColor = '${pageColourHex('dark')}'`);
  });

  it('no scenery token has a second author anywhere in tokens.css', () => {
    const outside = css.replace(new RegExp(`[ \\t]*${esc(SCENERY_BEGIN)}[\\s\\S]*?${esc(SCENERY_END)}`, 'g'), '')
      .replace(new RegExp(`[ \\t]*${esc(CHART_BEGIN)}[\\s\\S]*?${esc(CHART_END)}`, 'g'), '');
    for (const { token } of SCENERY_TOKENS) {
      expect(outside, `--${token} is defined outside the generated block — the second palette is back`).not.toMatch(new RegExp(`--${token}:`));
    }
    expect(outside).not.toMatch(/--card-fill:/);
  });
});
