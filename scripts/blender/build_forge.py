"""
THE FORGE, BUILT FROM ITS NUMBERS — S7 of INSTRUMENT_100X_PLAN.

    blender -b -P scripts/blender/build_forge.py -- --out scripts/blender/forge.blend [--phase 0.62] [--theme dark|light]

E8 (docs/3d/e8) authored the object in code — a machined disc on a plinth inside a polished ring, one key light on
an arc — and its harness `docs/3d/e8/entry.ts` carries every number: geometry, materials, camera, light. This script
rebuilds that scene in Blender FROM THOSE NUMBERS, so the .blend is a derived artefact (git-ignored, regenerated),
the scene is reviewable as text, and a change to the object is a diff, not a binary.

COORDINATES. E8 is Y-up (WebGL); Blender is Z-up. The mapping is (x, y, z)_gl → (x, −z, y)_blender everywhere.

MATERIALS are the AUTHORED perceptual values from the README's table (disc r0.30/m0.95, ring r0.13/m0.92 brand
blue, plinth r0.52/m0.35, floor r0.88/m0). The √ values in `entry.ts` are the GL engine's alpha convention, not
the design — Blender's Principled BSDF takes perceptual roughness, so the table's numbers go in unchanged.
Anisotropy uses a RADIAL tangent about the part's axis, which is what makes the highlight travel around the disc
wall and along the ring tube (the README: "a BAR of light rather than a dot").

THE LIGHT is the harness's key light at one PHASE of its arc — a still, not the sweep. `--phase` picks the
radian; the default sits where the bar crosses the disc face towards the camera. Colour and ambient gain are the
harness's. NEVER A NUMBER: nothing here encodes data.
"""
import argparse
import math
import os
import sys

import bpy  # type: ignore
from mathutils import Vector  # type: ignore


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(hex6: str):
    h = hex6.lstrip("#")
    return tuple(srgb_to_linear(int(h[i : i + 2], 16) / 255.0) for i in (0, 2, 4)) + (1.0,)


def gl_to_blender(x: float, y: float, z: float):
    return (x, -z, y)


def principled(name: str, hex6: str, roughness: float, metallic: float, anisotropic: float = 0.0, radial_axis: str | None = None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = hex_rgba(hex6)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if anisotropic > 0:
        # Blender 4.x/5.x names the inputs "Anisotropic" / "Anisotropic Rotation" under the Specular panel.
        bsdf.inputs["Anisotropic"].default_value = anisotropic
        # TANGENTIAL brushing, not radial. A lathe-brushed disc's grooves run CONCENTRIC; the highlight stretches
        # ALONG the grooves, so it bends around the face as a bar (the README's words). A radial tangent on a flat
        # cap collapses the lobe into a starburst at the axis — v1/v2 rendered exactly that. Rotation 0.25 = 90°.
        bsdf.inputs["Anisotropic Rotation"].default_value = 0.25
        if radial_axis:
            tangent = nodes.new("ShaderNodeTangent")
            tangent.direction_type = "RADIAL"
            tangent.axis = radial_axis
            if "Tangent" in bsdf.inputs:
                links.new(tangent.outputs["Tangent"], bsdf.inputs["Tangent"])
    return mat


def add_cylinder(name: str, radius: float, height: float, at, mat, segments: int = 128):
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments, radius=radius, depth=height, location=at)
    ob = bpy.context.active_object
    ob.name = name
    ob.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return ob


def add_torus(name: str, ring_radius: float, tube_radius: float, at, mat):
    bpy.ops.mesh.primitive_torus_add(major_radius=ring_radius, minor_radius=tube_radius, major_segments=192, minor_segments=48, location=at)
    ob = bpy.context.active_object
    ob.name = name
    ob.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return ob


def add_plane(name: str, size: float, at, mat):
    bpy.ops.mesh.primitive_plane_add(size=size, location=at)
    ob = bpy.context.active_object
    ob.name = name
    ob.data.materials.append(mat)
    return ob


def look_at(ob, target: Vector) -> None:
    direction = target - ob.location
    ob.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", default="scripts/blender/forge.blend")
    p.add_argument("--phase", type=float, default=0.62, help="key-light arc phase in radians (the harness sweeps it; a still picks one)")
    p.add_argument("--theme", default="dark", choices=["dark", "light"])
    p.add_argument("--key-drop", type=float, default=0.62, help="the key's downward component (the harness uses 0.95; lower puts the bar on the wall)")
    p.add_argument("--fov", type=float, default=30.0, help="vertical field of view in degrees (the harness's 30; the plate variant opens it so the plinth clears the frame)")
    p.add_argument("--shadow-catcher", action="store_true", help="the floor catches the object's shadow but is itself transparent (Cycles) — for compositing onto a plate")
    a = p.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.unit_settings.system = "NONE"

    # ── geometry, from entry.ts:208-211 and the draw list (DISC_Y = 0.30; plinth at y 0.045; floor at 0) ──
    floor_hex, plinth_hex = ("#080C15", "#161D2E") if a.theme == "dark" else ("#DDE5F0", "#B9C5D8")
    m_floor = principled("floor", floor_hex, 0.88, 0.0)
    m_plinth = principled("plinth", plinth_hex, 0.52, 0.35)
    m_disc = principled("disc", "#8FA3C4", 0.30, 0.95, anisotropic=0.86, radial_axis="Z")
    m_ring = principled("ring", "#2C6BFF", 0.13, 0.92, anisotropic=0.72, radial_axis="Z")

    # 40, not the harness's 16: at this camera a 16-plane's far edge crosses the top of the frame as a band.
    floor = add_plane("floor", 40.0, gl_to_blender(0, 0, 0), m_floor)
    if a.shadow_catcher:
        # The plate already has its ground (LCX White, by the installer's constraint); the render contributes the
        # object and its shadow only. A shadow catcher renders the shadow onto transparent film and nothing else.
        floor.is_shadow_catcher = True
    add_cylinder("plinth", 1.9, 0.09, gl_to_blender(0, 0.045, 0), m_plinth)
    add_cylinder("disc", 0.92, 0.16, gl_to_blender(0, 0.30, 0), m_disc)
    add_torus("ring", 1.06, 0.055, gl_to_blender(0, 0.30, 0), m_ring)

    # ── camera, from entry.ts:257 — target (0, 0.34, 0), distance 5.0, azimuth 22°, elevation 24°, fov 30° ──
    target_gl = (0.0, 0.34, 0.0)
    az, el, dist = math.radians(22), math.radians(24), 5.0
    eye_gl = (target_gl[0] + dist * math.cos(el) * math.sin(az), target_gl[1] + dist * math.sin(el), target_gl[2] + dist * math.cos(el) * math.cos(az))
    cam_data = bpy.data.cameras.new("forge_cam")
    cam_data.sensor_fit = "VERTICAL"
    cam_data.angle_y = math.radians(a.fov)
    cam_data.dof.use_dof = True
    cam_data.dof.focus_distance = dist
    cam_data.dof.aperture_fstop = 7.0
    cam = bpy.data.objects.new("forge_cam", cam_data)
    cam.location = Vector(gl_to_blender(*eye_gl))
    scene.collection.objects.link(cam)
    look_at(cam, Vector(gl_to_blender(*target_gl)))
    scene.camera = cam

    # ── the key light, from entry.ts:277 — direction [sin a·0.85, −0.95, cos a·0.55], colour [5.2, 5.0, 4.6] ──
    # The harness's direction, with its steep −0.95 drop relaxed to `--key-drop` so the bar lands on the disc WALL
    # and the ring rather than the face's axis. A soft AREA key (v3) replaces the sun: a small source made a
    # hotspot (v1 6° sun, v2 18° sun); a 2-unit area light gives the brushed face a broad sheen.
    d_gl = (math.sin(a.phase) * 0.85, -a.key_drop, math.cos(a.phase) * 0.55)
    key_data = bpy.data.lights.new("key", type="AREA")
    key_data.shape = "DISK"
    key_data.size = 2.2
    key_data.energy = 260.0 if a.theme == "dark" else 180.0
    key_data.color = (5.2 / 5.2, 5.0 / 5.2, 4.6 / 5.2)
    key = bpy.data.objects.new("key", key_data)
    kd = Vector(gl_to_blender(*d_gl)).normalized()
    key.location = Vector(gl_to_blender(0, 0.30, 0)) - kd * 5.5
    scene.collection.objects.link(key)
    key.rotation_euler = kd.to_track_quat("-Z", "Y").to_euler()

    # ── the ambient — the harness's ambientGain 1.15 over a dark sky; a uniform world at low strength ──
    # A STUDIO SKY, not a flat colour: brushed metal reads by what it reflects, and the harness has a skybox.
    # Gradient from the theme's zenith (up) to its horizon (S2's authored scenery: dark #050810→#0B1220-ish,
    # light #F4F7FC→#DCE5F3), driven by the world normal's Z.
    world = bpy.data.worlds.new("forge_world")
    world.use_nodes = True
    wn, wl = world.node_tree.nodes, world.node_tree.links
    for n in list(wn):
        wn.remove(n)
    w_out = wn.new("ShaderNodeOutputWorld")
    w_bg = wn.new("ShaderNodeBackground")
    w_ramp = wn.new("ShaderNodeValToRGB")
    w_sep = wn.new("ShaderNodeSeparateXYZ")
    w_geo = wn.new("ShaderNodeNewGeometry")
    w_map = wn.new("ShaderNodeMapRange")
    wl.new(w_geo.outputs["Normal"], w_sep.inputs["Vector"])
    wl.new(w_sep.outputs["Z"], w_map.inputs["Value"])
    w_map.inputs["From Min"].default_value = -1.0
    w_map.inputs["From Max"].default_value = 1.0
    wl.new(w_map.outputs["Result"], w_ramp.inputs["Fac"])
    zenith, horizon = (("#1B2740", "#070B14") if a.theme == "dark" else ("#FFFFFF", "#CFDAEA"))
    w_ramp.color_ramp.elements[0].color = hex_rgba(horizon)
    w_ramp.color_ramp.elements[1].color = hex_rgba(zenith)
    wl.new(w_ramp.outputs["Color"], w_bg.inputs["Color"])
    w_bg.inputs["Strength"].default_value = 1.0 if a.theme == "dark" else 0.9
    wl.new(w_bg.outputs["Background"], w_out.inputs["Surface"])
    scene.world = world

    # EEVEE quality: shadows and AO in the spirit of the harness (AO radius 0.42, strength 1.3)
    try:
        scene.eevee.use_gtao = True
        scene.eevee.gtao_distance = 0.42
        scene.eevee.gtao_factor = 1.3
        scene.eevee.use_soft_shadows = True
    except AttributeError:
        pass

    out = os.path.abspath(a.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print(f"  built {out} (theme={a.theme}, phase={a.phase}) from docs/3d/e8/entry.ts numbers")


main()
