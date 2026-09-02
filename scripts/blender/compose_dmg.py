#!/usr/bin/env python3
"""
THE DMG PLATE, WITH THE OBJECT — S7 of INSTRUMENT_100X_PLAN.

    python3 scripts/blender/compose_dmg.py <forge-transparent@2x.png> [--plate apps/desktop/scripts/dmg-plate.png]
                                           [--out apps/desktop/scripts/dmg-plate.rendered.png]

The generated plate (`make-dmg-plate.mjs`) already honours the four constraints the installer window imposes —
LCX White ground because Finder draws its labels dark, the mark READ from `lcx-mark.svg` and never redrawn, the
icon positions read from `tauri.conf.json`, no wording — so it is the BASE, untouched. This script adds one thing:
the rendered Forge, transparent, scaled into the lower band (below the action band's hairline, centred), where the
installer window has nothing but ground. The result is written BESIDE the generated plate, not over it, and is not
wired into `tauri.conf.json`: the plan reserves that choice for the owner's one look (§9). Nothing here is data.
"""
import argparse
import hashlib
import json
import os
import sys

from PIL import Image


def _wired(out: str) -> bool:
    """True when tauri.conf.json's dmg.background names this file — read, never asserted."""
    import json as _json
    try:
        conf = _json.load(open("apps/desktop/src-tauri/tauri.conf.json"))
        bg = conf.get("bundle", {}).get("macOS", {}).get("dmg", {}).get("background") or conf.get("bundle", {}).get("dmg", {}).get("background", "")
        return os.path.basename(str(bg)) == os.path.basename(out)
    except Exception:  # noqa: BLE001
        return False


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("forge")
    p.add_argument("--plate", default="apps/desktop/scripts/dmg-plate.png")
    p.add_argument("--out", default="apps/desktop/scripts/dmg-plate.rendered.png")
    p.add_argument("--band-height-pt", type=int, default=96, help="object height in points inside the 110 pt lower band")
    a = p.parse_args()

    plate = Image.open(a.plate).convert("RGBA")
    W, H = plate.size  # 1320×840 = 660×420 pt @2x
    scale = W / 660
    forge = Image.open(a.forge).convert("RGBA")
    h = int(a.band_height_pt * scale)
    w = int(forge.width * h / forge.height)
    forge = forge.resize((w, h), Image.LANCZOS)
    # the lower band runs from the bottom hairline (height − 110 pt) to the bottom; centre the object in it
    band_top = int((420 - 110) * scale)
    cx, cy = W // 2, band_top + (H - band_top) // 2
    plate.alpha_composite(forge, (cx - w // 2, cy - h // 2))
    # pHYs at 144 dpi. Finder reads a PNG without a density as POINTS, so a 1320×840 plate would show a
    # quarter of itself; with 144 dpi it is a 660×420 pt image at 2× — the same chunk make-dmg-plate.mjs
    # writes, pinned by topNavChrome.test.tsx.
    plate.convert("RGB").save(a.out, "PNG", optimize=True, dpi=(144, 144))
    side = {
        "base": os.path.relpath(a.plate), "object": os.path.relpath(a.forge), "placed": {"x": cx - w // 2, "y": cy - h // 2, "w": w, "h": h},
        "constraints": ["light ground (Finder labels are dark)", "mark from lcx-mark.svg, never redrawn", "positions from tauri.conf.json", "no wording"],
        "wired": _wired(a.out), "decision": "wired by owner instruction 2026-09-02 (\"ship everything pending\"); one path in tauri.conf.json — the generated plate remains beside it to revert to",
        "bytes": os.path.getsize(a.out), "sha256_16": hashlib.sha256(open(a.out, "rb").read()).hexdigest()[:16],
    }
    json.dump(side, open(a.out + ".render.json", "w"), indent=2)
    print(f"  {a.out} {W}x{H} {side['bytes']} B — object {w}x{h} at ({side['placed']['x']},{side['placed']['y']}); {'wired' if _wired(a.out) else 'NOT wired'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
