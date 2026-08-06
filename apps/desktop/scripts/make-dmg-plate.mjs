#!/usr/bin/env node
/**
 * Generate the DMG window plate — the last surface a colleague sees before Gatekeeper.
 *
 * Before this, the `dmg` block carried `appPosition`, `applicationFolderPosition` and
 * `windowSize` and NO `background`, so the installer window was default system white with
 * two icons floating in it: the one moment where the product is unmistakably a download,
 * and it said nothing.
 *
 * THE MARK IS NOT DRAWN HERE. `readMark()` (see `make-icons.mjs`) reads the four arrow
 * paths out of `apps/web/public/lcx-mark.svg` — the approved artwork the web shell
 * renders — because the brand book says twice: "Do not attempt to redraw or recreate any
 * element of the logotype." Everything else on the plate (ground, hairline, arrow) is
 * plain geometry authored here, which the book does not restrict.
 *
 * THE LAYOUT IS READ FROM `tauri.conf.json`, not repeated here. The plate has to line up
 * with icon positions the bundler places from that same config; two copies of 660x420 and
 * (180,200)/(480,200) would be a drift waiting to happen, and the failure mode is an
 * arrow pointing at nothing.
 *
 * WHY THE GROUND IS LCX WHITE AND NOT LCX BLACK. Finder draws the two icon LABELS
 * ("LCXOS", "Applications") itself, in dark system text, and a DMG background cannot
 * change the label colour — the setting lives in the volume's `.DS_Store` view options,
 * which the bundler writes and we do not control. A black plate therefore ships two
 * unreadable labels. #FAFAFA is LCX White from the same Primary Palette page as LCX
 * Black, so this is a palette choice, not a fallback to "default white": the mark, the
 * hairline and the arrow are what make it the product's window.
 *
 * WHY THERE IS NO WORDING ON IT. The shell's type is a self-hosted Inter variable
 * webfont (`apps/web/public/fonts/InterVariable.woff2`), and Inter is not an installed
 * system face — verified: absent from ~/Library/Fonts, /Library/Fonts and
 * /System/Library/Fonts here. `sips` rasterises SVG without @font-face support, so any
 * `<text>` on this plate would come out in whatever face the BUILD MACHINE happened to
 * resolve — off-brand, and different per machine, which would also cost the determinism
 * this script exists to give. The arrow plus Finder's own labels carry the instruction.
 *
 * RETINA. `windowSize` is in POINTS. The plate is rendered at 2x pixels and then stamped
 * 144 dpi, so macOS maps it back to exactly `windowSize` points and uses the extra pixels
 * on a Retina display. A 72-dpi 1320x840 file would instead be treated as 1320x840
 * POINTS and crop to about a quarter of the window.
 *
 * USAGE
 *   node scripts/make-dmg-plate.mjs                    # writes ./dmg-plate.png
 *   node scripts/make-dmg-plate.mjs /tmp/plate.png     # writes elsewhere
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LCX_BLACK, LCX_WHITE, rasterise, readMark } from './make-icons.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TAURI_CONF = resolve(HERE, '..', 'src-tauri', 'tauri.conf.json');

/** The DMG plate's own name, so config and generator cannot disagree about it. */
export const PLATE_PNG = resolve(HERE, 'dmg-plate.png');

/** Retina factor. Not a knob — 2 is what @2x means and what the dpi stamp below assumes. */
const SCALE = 2;

/**
 * The window and the two icon positions, as the bundler will use them.
 *
 * Refuses instead of defaulting. A plate laid out against assumed numbers looks correct
 * in isolation and wrong in the installer, which is the one place nobody re-checks.
 */
export function readDmgLayout(confPath = TAURI_CONF) {
  const conf = JSON.parse(readFileSync(confPath, 'utf8'));
  const dmg = conf?.bundle?.macOS?.dmg;
  const size = dmg?.windowSize;
  const app = dmg?.appPosition;
  const folder = dmg?.applicationFolderPosition;
  if (!size?.width || !size?.height || !app || !folder) {
    throw new Error(
      `DMG_LAYOUT_ABSENT: ${confPath} must declare bundle.macOS.dmg.windowSize, .appPosition ` +
        'and .applicationFolderPosition before a plate can be laid out against them',
    );
  }
  return { width: size.width, height: size.height, app, folder };
}

/**
 * The plate, in the window's own point coordinates (origin top-left, as Finder's
 * icon positions are).
 */
export function plateSvg(layout = readDmgLayout(), mark = readMark()) {
  const { width, height, app, folder } = layout;

  // The mark sits in the band ABOVE the icon row. Sizing is the book's, not taste:
  // 48pt clears the 40pt minimum digital size (page 12), and its clear space
  // (1/3 of the mark's height = 16pt) is what keeps it off the icons below.
  const markSize = 48;
  const markCx = width / 2;
  const markCy = 60;
  const markScale = markSize / mark.width;

  // A hairline separates the brand band from the action band — the same device the
  // app's own chrome uses, where hairlines do the separating and nothing is boxed.
  const ruleY = markCy + markSize / 2 + 26;
  const ruleInset = 48;

  // The arrow spans only the MIDDLE 40% of the gap between the two icon centres. The
  // bundler picks the icon size, not us, so anything wider risks sliding under an icon
  // on a future default.
  const gap = folder.x - app.x;
  const arrowMid = app.x + gap / 2;
  const arrowFrom = arrowMid - gap * 0.2;
  const arrowTo = arrowMid + gap * 0.2;
  const arrowY = (app.y + folder.y) / 2;
  const headLen = 30;
  const headHalf = 18;
  const shaftHalf = 5;

  const paths = mark.paths.map((d) => `<path d="${d}"/>`).join('\n    ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${LCX_WHITE}"/>
  <g transform="translate(${(markCx - markSize / 2).toFixed(3)} ${(markCy - markSize / 2).toFixed(3)}) scale(${markScale.toFixed(6)})" fill="${LCX_BLACK}">
    ${paths}
  </g>
  <rect x="${ruleInset}" y="${ruleY}" width="${width - ruleInset * 2}" height="1" fill="${LCX_BLACK}" fill-opacity="0.10"/>
  <rect x="${ruleInset}" y="${height - ruleY}" width="${width - ruleInset * 2}" height="1" fill="${LCX_BLACK}" fill-opacity="0.10"/>
  <path d="M${arrowFrom} ${arrowY - shaftHalf}H${arrowTo - headLen}V${arrowY - headHalf}L${arrowTo} ${arrowY}L${arrowTo - headLen} ${arrowY + headHalf}V${arrowY + shaftHalf}H${arrowFrom}Z" fill="${LCX_BLACK}" fill-opacity="0.22"/>
</svg>
`;
}

export function makeDmgPlate(outPng = PLATE_PNG) {
  const layout = readDmgLayout();
  rasterise(plateSvg(layout), outPng, layout.width * SCALE, layout.height * SCALE);
  // Stamp the density so the 2x pixels describe a `windowSize`-point image. Without
  // this the installer window shows the top-left quarter of the plate.
  execFileSync('sips', ['-s', 'dpiWidth', String(72 * SCALE), '-s', 'dpiHeight', String(72 * SCALE), outPng], {
    stdio: 'pipe',
  });
  return { outPng, widthPx: layout.width * SCALE, heightPx: layout.height * SCALE };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const out = process.argv[2] ? resolve(process.argv[2]) : PLATE_PNG;
  const { widthPx, heightPx } = makeDmgPlate(out);
  process.stdout.write(`dmg plate -> ${out} (${widthPx}x${heightPx}px @ ${72 * SCALE}dpi)\n`);
}
