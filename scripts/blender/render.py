"""
THE RENDER — S7 of INSTRUMENT_100X_PLAN (the object). Headless, reproducible, calibrated.

    blender -b <scene.blend> -P scripts/blender/render.py -- --out <path.png> [--scale 2] [--transform Standard]
            [--samples 64] [--width 1200 --height 720] [--transparent] [--engine BLENDER_EEVEE]

WHY A WRAPPER RATHER THAN THE .blend's OWN SETTINGS. A .blend carries whatever view transform the last person
who saved it left on; Blender's default is AgX, and AgX renders the brand blue #2C6BFF as #467ECF. The plan's
rule is that brand fidelity is decided from the PNG BYTES, so this wrapper SETS the transform explicitly, records
what it set in a sidecar JSON beside the output, and never trusts the file. `brand_hex.py` then reads the bytes.

NEVER IN CI. NEVER A NUMBER. Nothing this script renders encodes data; it renders the object.
"""
import argparse
import hashlib
import json
import os
import sys

import bpy  # type: ignore


def parse() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True)
    p.add_argument("--scale", type=float, default=2.0, help="render at N× the base size; the encoder downsamples")
    p.add_argument("--transform", default="Standard", help="view transform: Standard (brand-exact) or AgX (the negative control)")
    p.add_argument("--samples", type=int, default=64)
    p.add_argument("--width", type=int, default=1200)
    p.add_argument("--height", type=int, default=720)
    p.add_argument("--transparent", action="store_true")
    p.add_argument("--engine", default="BLENDER_EEVEE")
    p.add_argument("--format", default="PNG", help="PNG (default) or WEBP")
    p.add_argument("--quality", type=int, default=90, help="WEBP quality when --format WEBP")
    return p.parse_args(argv)


def configure(scene: "bpy.types.Scene", a: argparse.Namespace) -> None:
    scene.render.engine = a.engine
    scene.render.resolution_x = int(a.width * a.scale)
    scene.render.resolution_y = int(a.height * a.scale)
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = a.transparent
    if hasattr(scene, "eevee"):
        try:
            scene.eevee.taa_render_samples = a.samples
        except AttributeError:
            pass
    if a.engine == "CYCLES":
        # Anisotropic specular — the disc's travelling bar — is a Cycles feature; EEVEE renders it as a hotspot.
        # Metal GPU when this Mac exposes it, CPU otherwise; OIDN denoise so a 96-sample frame is clean.
        try:
            prefs = bpy.context.preferences.addons["cycles"].preferences
            prefs.compute_device_type = "METAL"
            prefs.get_devices()
            gpu = False
            for d in prefs.devices:
                d.use = d.type != "CPU"
                gpu = gpu or d.use
            scene.cycles.device = "GPU" if gpu else "CPU"
        except Exception as e:  # noqa: BLE001
            print(f"  cycles device: CPU ({e})")
            scene.cycles.device = "CPU"
        scene.cycles.samples = a.samples
        scene.cycles.use_denoising = True
        try:
            scene.cycles.denoiser = "OPENIMAGEDENOISE"
        except TypeError:
            pass
        scene.cycles.use_adaptive_sampling = True
    # THE CALIBRATION CONTRACT: set explicitly, never inherited from the file.
    scene.display_settings.display_device = "sRGB"
    scene.view_settings.view_transform = a.transform
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    scene.view_settings.use_curve_mapping = False
    img = scene.render.image_settings
    img.file_format = a.format
    img.color_mode = "RGBA" if a.transparent else "RGB"
    if a.format == "PNG":
        img.color_depth = "8"
        img.compression = 90
    elif a.format == "WEBP":
        img.quality = a.quality
    scene.render.filepath = os.path.abspath(a.out)


def main() -> None:
    a = parse()
    scene = bpy.context.scene
    configure(scene, a)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)) or ".", exist_ok=True)
    bpy.ops.render.render(write_still=True)
    out = os.path.abspath(a.out)
    digest = hashlib.sha256(open(out, "rb").read()).hexdigest()[:16]
    sidecar = {
        "blender": bpy.app.version_string,
        "engine": scene.render.engine,
        "transform": scene.view_settings.view_transform,
        "look": scene.view_settings.look,
        "display": scene.display_settings.display_device,
        "exposure": scene.view_settings.exposure,
        "gamma": scene.view_settings.gamma,
        "samples": a.samples,
        "scale": a.scale,
        "resolution": [scene.render.resolution_x, scene.render.resolution_y],
        "format": a.format,
        "transparent": a.transparent,
        "source": bpy.data.filepath or "(built in memory)",
        "bytes": os.path.getsize(out),
        "sha256_16": digest,
    }
    with open(out + ".render.json", "w") as f:
        json.dump(sidecar, f, indent=2, sort_keys=True)
    print(f"  rendered {out} ({sidecar['bytes']} B) transform={sidecar['transform']} engine={sidecar['engine']} sha256={digest}")


main()
