#!/usr/bin/env node
/**
 * Regenerate the LCXOS macOS icon set — deterministically, from the ONE approved asset.
 *
 * WHY THIS EXISTS. `src-tauri/icons/` held five PNGs and an .icns that nobody could
 * reproduce: the only generator on disk was `docs/brand-make-icons.py`, which needs
 * PyMuPDF (`import fitz`) and that module is not installed on this machine — verified,
 * it raises ModuleNotFoundError. So the shipped icon was, in practice, a set of binaries
 * with no recipe. This script has no dependency that is not already in macOS: `sips`
 * rasterises, `iconutil` packs the .icns.
 *
 * PROVENANCE — the rule that shapes every line below. The brand book states twice:
 *
 *     "Do not attempt to redraw or recreate any element of the logotype.
 *      Use the approved digital files of the artwork."
 *
 * So the four arrow paths are NOT written here. They are READ OUT of
 * `apps/web/public/lcx-mark.svg` at generation time — the same file the web shell
 * renders — and passed through untouched. `docs/brand-make-icons.py` kept its own inline
 * copy of the coordinates; a copy is a thing that can drift, so this script deliberately
 * has none. If you ever find path data typed into this file, that is the defect.
 *
 * GEOMETRY, inherited from `docs/brand-make-icons.py` so the icon does not silently
 * change shape when the generator changes language. Every number traces to a rule:
 *   · canvas 1024, tile 824 (Apple's Big Sur+ content square), radius 185.4
 *   · clear space = 1/3 of the mark's height per side (book, page 12), so
 *     824 = mark * 5/3  ->  mark = 494.4
 * COLOUR (book page 15, Primary Palette): tile LCX Black #262626, mark LCX White #FAFAFA
 * — the page-12 sanctioned "mark knocked out of a black tile".
 *
 * USAGE
 *   node scripts/make-icons.mjs            # writes ../src-tauri/icons in place
 *   node scripts/make-icons.mjs /tmp/out   # writes elsewhere (for verification)
 *
 * The committed icons are NOT rewritten by merely importing this module; only the CLI
 * entry point writes anything.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The one approved digital file. Shared with the web shell — not a copy of it. */
export const MARK_SVG = resolve(HERE, '..', '..', 'web', 'public', 'lcx-mark.svg');

export const LCX_BLACK = '#262626';
export const LCX_WHITE = '#FAFAFA';

/**
 * Read the mark's geometry out of the approved SVG.
 *
 * Refuses rather than guesses. A partial read here would ship a mark with a missing
 * arrow at 1024px on every operator's dock, so a mismatch against the known shape of
 * the artwork (one viewBox, exactly four subpaths) is a hard stop with a stable code.
 */
export function readMark(svgPath = MARK_SVG) {
  let src;
  try {
    src = readFileSync(svgPath, 'utf8');
  } catch {
    throw new Error(`MARK_SOURCE_UNREADABLE: cannot read the approved artwork at ${svgPath}`);
  }
  const viewBox = /viewBox="([^"]+)"/.exec(src)?.[1];
  const paths = [...src.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);
  if (!viewBox || paths.length !== 4) {
    throw new Error(
      `MARK_GEOMETRY_UNEXPECTED: expected one viewBox and four arrow paths in ${svgPath}, ` +
        `found ${viewBox ? 'a viewBox' : 'no viewBox'} and ${paths.length} paths. ` +
        'The artwork changed shape — do not "fix" this by hand-writing the paths.',
    );
  }
  const [, , w, h] = viewBox.trim().split(/\s+/).map(Number);
  return { viewBox, width: w, height: h, paths };
}

/**
 * Rasterise an SVG string at exact pixel dimensions.
 *
 * `sips` is the rasteriser because it is the only one present: `rsvg-convert`,
 * ImageMagick and Inkscape are all absent here, and `qlmanage` produces a
 * thumbnail with its own padding rather than an exact-size render. sips reads SVG
 * directly (verified on this machine) and `--resampleHeightWidth` pins both axes,
 * so a caller cannot accidentally ship a 1023px icon.
 */
export function rasterise(svg, outPng, widthPx, heightPx = widthPx) {
  const scratch = mkdtempSync(join(tmpdir(), 'lcxos-raster-'));
  const svgPath = join(scratch, 'in.svg');
  try {
    writeFileSync(svgPath, svg);
    execFileSync(
      'sips',
      ['-s', 'format', 'png', '--resampleHeightWidth', String(heightPx), String(widthPx), svgPath, '--out', outPng],
      { stdio: 'pipe' },
    );
  } catch (e) {
    // ENOENT here means no rasteriser at all, which no amount of retrying fixes.
    if (e && e.code === 'ENOENT') {
      throw new Error('RASTERISER_ABSENT: `sips` is not on this machine; cannot rasterise the approved SVG');
    }
    throw e;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const CANVAS = 1024;
const TILE = 824; // Apple macOS icon content square
const RADIUS = 185.4; // Apple squircle-approximating radius
const MARK = (TILE * 3) / 5; // clear space = 1/3 of mark height per side

/** The macOS app icon: the approved mark knocked out of a rounded LCX-Black tile. */
export function iconSvg(mark = readMark()) {
  const tileXY = (CANVAS - TILE) / 2;
  const markXY = (CANVAS - MARK) / 2;
  const scale = MARK / mark.width;
  const paths = mark.paths.map((d) => `<path d="${d}"/>`).join('\n    ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <rect x="${tileXY}" y="${tileXY}" width="${TILE}" height="${TILE}" rx="${RADIUS}" ry="${RADIUS}" fill="${LCX_BLACK}"/>
  <g transform="translate(${markXY.toFixed(3)} ${markXY.toFixed(3)}) scale(${scale.toFixed(6)})" fill="${LCX_WHITE}">
    ${paths}
  </g>
</svg>
`;
}

/** Tauri reads these five names out of `bundle.icon` + the bundler's defaults. */
const TAURI_SET = [
  ['32x32.png', 32],
  ['128x128.png', 128],
  ['128x128@2x.png', 256],
  ['icon.png', 1024],
];

/** iconutil accepts only these exact names, and refuses the directory otherwise. */
const ICONSET = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

export function makeIcons(outDir) {
  mkdirSync(outDir, { recursive: true });
  const svg = iconSvg();

  for (const [name, size] of TAURI_SET) {
    rasterise(svg, join(outDir, name), size);
  }

  const iconset = join(outDir, 'LCXOS.iconset');
  mkdirSync(iconset, { recursive: true });
  for (const [name, size] of ICONSET) {
    rasterise(svg, join(iconset, name), size);
  }
  try {
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(outDir, 'icon.icns')], { stdio: 'pipe' });
  } catch (e) {
    throw new Error(`ICONUTIL_FAILED: ${String(e.stderr ?? e.message).trim()}`);
  }
  // The .iconset is scaffolding, not an artefact — leaving it behind would put ten
  // more unexplained PNGs next to the five that are actually shipped.
  rmSync(iconset, { recursive: true, force: true });

  return [...TAURI_SET.map(([n]) => n), 'icon.icns'];
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const outDir = process.argv[2] ? resolve(process.argv[2]) : resolve(HERE, '..', 'src-tauri', 'icons');
  const written = makeIcons(outDir);
  process.stdout.write(`icons -> ${outDir}\n  ${written.join('\n  ')}\n`);
}
