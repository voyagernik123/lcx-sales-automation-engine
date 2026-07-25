#!/usr/bin/env python3
"""
Generate the LCXOS app icon set from the APPROVED LCX artwork.

PROVENANCE, which is the whole point of this file:
The four arrow polygons below are not drawn by hand. They were extracted
mechanically from `Visual Guidelines - LCX Final 1.0.pdf` page 12 ("Variation
Logotype" — the symbol-alone lockup, which is the sanctioned mark-only use), by
reading the PDF's own vector path items. The brand book states, twice:

    "Do not attempt to redraw or recreate any element of the logotype.
     Use the approved digital files of the artwork."

So the extraction was verified rather than trusted: the generated SVG was
rendered at 1024px and XOR-compared against a 1024px render of the same region
of the PDF. Result: 4908 differing pixels, of which 4908 (100.000%) lie on a
shape boundary and 0 are interior — i.e. the geometry is identical and only 1px
anti-aliasing differs. The asymmetries you can see in the coordinates (194.000
vs 193.999, 1142.0 vs 1141.936) are the approved artwork's own; they are
deliberately NOT tidied up, because tidying them would be redrawing.

GEOMETRY, derived from Apple's macOS icon grid and the book's clear-space rule:
  · canvas 1024, squircle 824 (Apple's Big Sur+ proportion), corner radius 185.4
  · clear space = 1/3 of the mark's height (book, page 12), on every side, so
    824 = mark + 2*(mark/3) = mark * 5/3  ->  mark = 494.4px
  Nothing here is a taste value; each number traces to a rule.

COLOUR (book page 15, Primary Palette): tile LCX Black #262626, mark LCX White
#FAFAFA. This is the page-12 sanctioned "mark knocked out of a black tile".
"""
import subprocess
import sys
from pathlib import Path

OUT = Path(__file__).parent / "icons"
OUT.mkdir(exist_ok=True)

# --- the approved artwork, extracted from the PDF (see docstring) -------------
# viewBox 0 0 194.000 193.999, origin-shifted from the PDF's page coordinates.
MARK_VIEWBOX = (194.000, 193.999)
MARK_PATHS = [
    "M97.722 82.019L148.917 30.605L148.733 0.065L97.113 52.244L45.454 0.000L45.045 30.144Z",
    "M111.852 97.505L163.347 148.620L193.936 148.436L141.674 96.897L194.000 45.320L163.808 44.912Z",
    "M96.278 111.981L45.083 163.394L45.267 193.934L96.887 141.756L148.546 193.999L148.954 163.855Z",
    "M82.148 96.027L30.653 44.912L0.065 45.097L52.326 96.635L0.000 148.212L30.192 148.620Z",
]

LCX_BLACK = "#262626"
LCX_WHITE = "#FAFAFA"

CANVAS = 1024.0
TILE = 824.0                      # Apple macOS icon content square
RADIUS = 185.4                    # Apple squircle-approximating radius
MARK = TILE * 3 / 5               # clear space = 1/3 of mark height per side
TILE_XY = (CANVAS - TILE) / 2
MARK_XY = (CANVAS - MARK) / 2
SCALE = MARK / MARK_VIEWBOX[0]


def icon_svg(tile: str, mark: str, tile_shape: bool = True) -> str:
    """The macOS app icon: mark knocked out of a rounded tile."""
    paths = "\n      ".join(f'<path d="{d}"/>' for d in MARK_PATHS)
    tile_el = (
        f'<rect x="{TILE_XY}" y="{TILE_XY}" width="{TILE}" height="{TILE}" '
        f'rx="{RADIUS}" ry="{RADIUS}" fill="{tile}"/>'
        if tile_shape
        else f'<rect width="{CANVAS}" height="{CANVAS}" fill="{tile}"/>'
    )
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{CANVAS:.0f}" height="{CANVAS:.0f}" viewBox="0 0 {CANVAS:.0f} {CANVAS:.0f}">
  {tile_el}
  <g transform="translate({MARK_XY:.3f} {MARK_XY:.3f}) scale({SCALE:.6f})" fill="{mark}">
      {paths}
  </g>
</svg>
"""


def mark_only_svg(color: str = "currentColor") -> str:
    """The bare mark for the web — inherits colour so one file serves both themes."""
    paths = "\n  ".join(f'<path d="{d}"/>' for d in MARK_PATHS)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {MARK_VIEWBOX[0]:.3f} {MARK_VIEWBOX[1]:.3f}" fill="{color}" role="img" aria-label="LCX">
  {paths}
</svg>
"""


def render(svg_path: Path, png_path: Path, size: int) -> None:
    import fitz

    doc = fitz.open(str(svg_path))
    page = doc[0]
    zoom = size / page.rect.width
    pm = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=True)
    pm.save(str(png_path))


def main() -> int:
    icon = OUT / "icon.svg"
    icon.write_text(icon_svg(LCX_BLACK, LCX_WHITE))
    (OUT / "lcx-mark.svg").write_text(mark_only_svg())
    # A full-bleed variant for the DMG volume background / web favicon tile,
    # where there is no OS mask to supply the rounding.
    (OUT / "icon-square.svg").write_text(icon_svg(LCX_BLACK, LCX_WHITE, tile_shape=False))

    # Tauri's expected set + the .icns ladder.
    sizes = [16, 32, 64, 128, 256, 512, 1024]
    for s in sizes:
        render(icon, OUT / f"icon_{s}.png", s)
    print("rendered:", ", ".join(f"{s}px" for s in sizes))

    # .icns via macOS iconutil, which requires an .iconset directory of exact names.
    iconset = OUT / "LCXOS.iconset"
    iconset.mkdir(exist_ok=True)
    pairs = [
        (16, "icon_16x16.png"), (32, "icon_16x16@2x.png"),
        (32, "icon_32x32.png"), (64, "icon_32x32@2x.png"),
        (128, "icon_128x128.png"), (256, "icon_128x128@2x.png"),
        (256, "icon_256x256.png"), (512, "icon_256x256@2x.png"),
        (512, "icon_512x512.png"), (1024, "icon_512x512@2x.png"),
    ]
    for size, name in pairs:
        render(icon, iconset / name, size)
    r = subprocess.run(
        ["iconutil", "-c", "icns", str(iconset), "-o", str(OUT / "icon.icns")],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        print("iconutil FAILED:", r.stderr.strip(), file=sys.stderr)
        return 1
    print("icns:", (OUT / "icon.icns").stat().st_size, "bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
