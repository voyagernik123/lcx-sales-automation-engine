#!/usr/bin/env python3
"""
THE ENCODER — S7 of INSTRUMENT_100X_PLAN. 2× PNG in, 1× and 2× WebP out, within a stated byte budget.

    python3 scripts/blender/encode.py <render@2x.png> --out <dir/name> [--quality 88] [--budget-kb 120]

Downsamples with PIL's LANCZOS to the 1× size (the plan: render at 2×, downsample — supersampling is the
cheapest antialiasing there is) and writes `<name>.webp` (1×) and `<name>@2x.webp` (2×) with the SAME quality,
then refuses if the pair exceeds the budget: a render over budget is not shipped, it is re-encoded lower or
re-framed smaller. Carries the render's sidecar forward with the encoded bytes recorded. No cwebp on this Mac —
PIL's bundled libwebp does the encoding; that fact is in the sidecar too.
"""
import argparse
import hashlib
import json
import os
import sys

from PIL import Image, features


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("src")
    p.add_argument("--out", required=True, help="output path stem, e.g. apps/web/public/objects/forge-dark")
    p.add_argument("--quality", type=int, default=88)
    p.add_argument("--budget-kb", type=int, default=120)
    a = p.parse_args()

    if not features.check("webp"):
        print("  REFUSED: this PIL has no WebP encoder")
        return 3
    im = Image.open(a.src)
    w2, h2 = im.size
    w1, h1 = w2 // 2, h2 // 2
    one = im.resize((w1, h1), Image.LANCZOS)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)) or ".", exist_ok=True)
    p1, p2 = a.out + ".webp", a.out + "@2x.webp"
    one.save(p1, "WEBP", quality=a.quality, method=6)
    im.save(p2, "WEBP", quality=a.quality, method=6)
    b1, b2 = os.path.getsize(p1), os.path.getsize(p2)
    total_kb = (b1 + b2) / 1024
    side_src = a.src + ".render.json"
    side = json.load(open(side_src)) if os.path.exists(side_src) else {}
    side["encoded"] = {
        "encoder": f"PIL {Image.__version__} libwebp",
        "quality": a.quality,
        "1x": {"path": os.path.relpath(p1), "size": [w1, h1], "bytes": b1, "sha256_16": hashlib.sha256(open(p1, "rb").read()).hexdigest()[:16]},
        "2x": {"path": os.path.relpath(p2), "size": [w2, h2], "bytes": b2, "sha256_16": hashlib.sha256(open(p2, "rb").read()).hexdigest()[:16]},
        "budgetKb": a.budget_kb,
        "withinBudget": total_kb <= a.budget_kb,
    }
    with open(a.out + ".render.json", "w") as f:
        json.dump(side, f, indent=2, sort_keys=True)
    print(f"  {p1} {w1}x{h1} {b1} B · {p2} {w2}x{h2} {b2} B · total {total_kb:.1f} KB of {a.budget_kb} KB")
    if total_kb > a.budget_kb:
        print("  REFUSED: over budget — lower --quality or re-frame smaller; nothing over budget ships")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
