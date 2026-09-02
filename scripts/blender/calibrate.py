"""
THE CALIBRATION — S7 of INSTRUMENT_100X_PLAN. The one test every render must pass before it ships.

    blender -b -P scripts/blender/calibrate.py -- --out <patch.png> --transform Standard|AgX [--hex 2C6BFF]

Builds a scene from nothing: an orthographic camera looking straight at a plane that fills the frame, the plane
carrying an EMISSION shader of the brand colour (sRGB hex → linear, strength 1), no lights, no world light, black
background. Under a view transform that is the sRGB OETF and nothing else ("Standard"), the encoded PNG must carry
the hex back EXACTLY; under AgX it must not — the plan measured #2C6BFF → #467ECF. `brand_hex.py` decodes the
result from the bytes. An instrument that cannot move is not reading, so both transforms are rendered every time.
"""
import argparse
import os
import sys

import bpy  # type: ignore


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear(hex6: str):
    h = hex6.lstrip("#")
    return tuple(srgb_to_linear(int(h[i : i + 2], 16) / 255.0) for i in (0, 2, 4))


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True)
    p.add_argument("--transform", default="Standard")
    p.add_argument("--hex", default="2C6BFF")
    p.add_argument("--size", type=int, default=128)
    a = p.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = a.size
    scene.render.resolution_y = a.size
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False

    # The patch: a plane with an emission shader of the linearised brand colour.
    bpy.ops.mesh.primitive_plane_add(size=4.0, location=(0, 0, 0))
    plane = bpy.context.active_object
    mat = bpy.data.materials.new("calibration_patch")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    for n in list(nodes):
        nodes.remove(n)
    out = nodes.new("ShaderNodeOutputMaterial")
    emit = nodes.new("ShaderNodeEmission")
    r, g, b = hex_to_linear(a.hex)
    emit.inputs["Color"].default_value = (r, g, b, 1.0)
    emit.inputs["Strength"].default_value = 1.0
    links.new(emit.outputs["Emission"], out.inputs["Surface"])
    plane.data.materials.append(mat)

    # An orthographic camera straight down, framing exactly the plane.
    cam_data = bpy.data.cameras.new("cal_cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 2.0
    cam = bpy.data.objects.new("cal_cam", cam_data)
    cam.location = (0, 0, 5)
    cam.rotation_euler = (0, 0, 0)
    scene.collection.objects.link(cam)
    scene.camera = cam

    # No world light: the emission is the only light, so the encoded pixel is the transform's answer alone.
    world = bpy.data.worlds.new("cal_world")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0, 0, 0, 1)
        bg.inputs["Strength"].default_value = 0.0
    scene.world = world

    scene.display_settings.display_device = "sRGB"
    scene.view_settings.view_transform = a.transform
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    scene.view_settings.use_curve_mapping = False
    img = scene.render.image_settings
    img.file_format = "PNG"
    img.color_mode = "RGB"
    img.color_depth = "8"
    scene.render.filepath = os.path.abspath(a.out)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)) or ".", exist_ok=True)
    bpy.ops.render.render(write_still=True)
    print(f"  calibration patch #{a.hex} under {scene.view_settings.view_transform} → {os.path.abspath(a.out)}")


main()
