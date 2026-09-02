#!/usr/bin/env tsx
/**
 * S2 ONE MATERIAL — write the GL rig's scenery into the DOM's token file and the pre-hydration page
 * colour. Idempotent: it replaces what sits between the markers and nothing else. Run:
 *
 *     npm run gen:tokens -w apps/web
 *
 * The ratchet `lib/__tests__/oneMaterial.test.ts` fails the build if the committed output differs
 * from what this would write, so the generated blocks can never drift from theme.ts unnoticed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHART_BEGIN, CHART_END, SCENERY_BEGIN, SCENERY_END,
  EDGE_BEGIN, EDGE_END, pageColourHex, renderChartTwinBlock, renderEdgeBlock, renderSceneryBlock,
} from '../src/lib/sceneryTokens.js';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS = join(WEB, 'src/styles/tokens.css');
const INDEX = join(WEB, 'index.html');

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replace every `begin … end` span with `body`, in order: first span is light (:root), second dark. */
function replaceSpans(src: string, begin: string, end: string, bodies: readonly string[], what: string): string {
  const re = new RegExp(`[ \\t]*${esc(begin)}[\\s\\S]*?${esc(end)}`, 'g');
  const found = src.match(re)?.length ?? 0;
  if (found !== bodies.length) {
    throw new Error(`${what}: expected ${bodies.length} generated spans, found ${found} — the markers in tokens.css have been disturbed`);
  }
  let i = 0;
  return src.replace(re, () => bodies[i++]!);
}

let css = readFileSync(TOKENS, 'utf8');
css = replaceSpans(css, SCENERY_BEGIN, SCENERY_END, [renderSceneryBlock('light'), renderSceneryBlock('dark')], 'scenery');
css = replaceSpans(css, CHART_BEGIN, CHART_END, [renderChartTwinBlock('light'), renderChartTwinBlock('dark')], 'chart twin');
css = replaceSpans(css, EDGE_BEGIN, EDGE_END, [renderEdgeBlock('light'), renderEdgeBlock('dark')], 'edge');
writeFileSync(TOKENS, css);

let html = readFileSync(INDEX, 'utf8');
const bodyStyle = /(<body[^>]*style="background-color: )#[0-9a-fA-F]{6}(")/;
const darkPaint = /(document\.body\.style\.backgroundColor = ')#[0-9a-fA-F]{6}(')/;
if (!bodyStyle.test(html) || !darkPaint.test(html)) throw new Error('index.html: the pre-hydration page colours were not found where the generator expects them');
html = html.replace(bodyStyle, `$1${pageColourHex('light')}$2`).replace(darkPaint, `$1${pageColourHex('dark')}$2`);
writeFileSync(INDEX, html);

console.log(`scenery tokens written: light ground ${pageColourHex('light')} · dark ground ${pageColourHex('dark')}`);
