#!/usr/bin/env python3
"""
BRAND HEX FROM BYTES — S7 of INSTRUMENT_100X_PLAN.

    python3 scripts/blender/brand_hex.py <image.png|webp> [--expect 2C6BFF] [--x X --y Y] [--box 16]

Reads the encoded pixels with PIL — OUTSIDE Blender's colour management, which is the whole point: a hex read
back through `bpy.data.images[...].pixels` would be reconverted by the very transform under test. Samples a
`--box`×`--box` window at the centre (or at --x/--y), reports the mean and the mode, and exits non-zero when
`--expect` is given and the mode is not that hex exactly. Also writes the reading into `<image>.render.json`
when a sidecar exists, under `brandHex`, so the evidence travels with the asset.
"""
import argparse
import json
import os
import sys
from collections import Counter

from PIL import Image


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("image")
    p.add_argument("--expect", default=None)
    p.add_argument("--x", type=int, default=None)
    p.add_argument("--y", type=int, default=None)
    p.add_argument("--box", type=int, default=16)
    a = p.parse_args()

    im = Image.open(a.image).convert("RGB")
    w, h = im.size
    cx = a.x if a.x is not None else w // 2
    cy = a.y if a.y is not None else h // 2
    half = a.box // 2
    px = [im.getpixel((x, y)) for x in range(max(0, cx - half), min(w, cx + half)) for y in range(max(0, cy - half), min(h, cy + half))]
    mode = Counter(px).most_common(1)[0][0]
    mean = tuple(round(sum(c[i] for c in px) / len(px)) for i in range(3))
    hx = lambda t: "#%02X%02X%02X" % t  # noqa: E731
    reading = {"mode": hx(mode), "mean": hx(mean), "samples": len(px), "at": [cx, cy], "box": a.box}
    print(f"  {os.path.basename(a.image)} {w}x{h} → mode {reading['mode']} mean {reading['mean']} over {len(px)} px")

    sidecar = a.image + ".render.json"
    if os.path.exists(sidecar):
        with open(sidecar) as f:
            side = json.load(f)
        side["brandHex"] = reading
        if a.expect:
            side["brandHexExpected"] = "#" + a.expect.upper().lstrip("#")
            side["brandHexExact"] = reading["mode"] == side["brandHexExpected"]
        with open(sidecar, "w") as f:
            json.dump(side, f, indent=2, sort_keys=True)

    if a.expect:
        want = "#" + a.expect.upper().lstrip("#")
        if reading["mode"] != want:
            print(f"  REFUSED: expected {want}, the bytes say {reading['mode']} (mean {reading['mean']})")
            return 2
        print(f"  EXACT: {want}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
