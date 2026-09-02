import os
import hashlib
import json
"""
THE STUDIO ENVIRONMENT — an equirectangular map per theme, rendered headless (THE PRODUCTION, P3).

    blender -b -P scripts/blender/env_studio.py -- --theme dark --out scratchpad/env/env-dark@2x.png [--samples 64]

The stage and the heroes light themselves and reflect a room. Until now that room was a three-stop gradient
(`env/sky.ts`); this renders a REAL studio — a gradient world plus soft area lights on a light stand — as a 2048×1024
equirect under the Standard view transform (S7's rule: brand hex is decided from bytes, and AgX would tint them), then
`encode.py`-style downsampling to 1024×512 WebP keeps each map under its budget. Nothing here encodes data.
"""
import argparse, math, os, sys
import bpy  # type: ignore
from mathutils import Vector  # type: ignore

def srgb_to_linear(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hex_rgba(h):
    h = h.lstrip('#'); return tuple(srgb_to_linear(int(h[i:i+2], 16) / 255.0) for i in (0, 2, 4)) + (1.0,)

def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--theme', default='dark', choices=['dark', 'light'])
    p.add_argument('--out', required=True)
    p.add_argument('--samples', type=int, default=64)
    p.add_argument('--width', type=int, default=2048)
    a = p.parse_args(argv)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'; prefs.get_devices()
        for d in prefs.devices: d.use = d.type != 'CPU'
        sc.cycles.device = 'GPU'
    except Exception:
        sc.cycles.device = 'CPU'
    sc.cycles.samples = a.samples; sc.cycles.use_denoising = True
    sc.render.resolution_x = a.width; sc.render.resolution_y = a.width // 2; sc.render.resolution_percentage = 100
    sc.display_settings.display_device = 'sRGB'; sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'; sc.render.image_settings.color_depth = '8'
    # the world: the theme's sky gradient (S2's authored stops), by world-normal Z
    dark = a.theme == 'dark'
    zenith, horizon = (('#1B2740', '#070B14') if dark else ('#FFFFFF', '#CFDAEA'))
    world = bpy.data.worlds.new('studio'); world.use_nodes = True
    n, l = world.node_tree.nodes, world.node_tree.links
    for x in list(n): n.remove(x)
    out = n.new('ShaderNodeOutputWorld'); bg = n.new('ShaderNodeBackground'); ramp = n.new('ShaderNodeValToRGB')
    sep = n.new('ShaderNodeSeparateXYZ'); geo = n.new('ShaderNodeNewGeometry'); mp = n.new('ShaderNodeMapRange')
    l.new(geo.outputs['Normal'], sep.inputs['Vector']); l.new(sep.outputs['Z'], mp.inputs['Value'])
    mp.inputs['From Min'].default_value = -1.0; mp.inputs['From Max'].default_value = 1.0
    l.new(mp.outputs['Result'], ramp.inputs['Fac']); ramp.color_ramp.elements[0].color = hex_rgba(horizon); ramp.color_ramp.elements[1].color = hex_rgba(zenith)
    l.new(ramp.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = 1.0 if dark else 0.9
    l.new(bg.outputs['Background'], out.inputs['Surface']); sc.world = world
    # a floor so the lower hemisphere is a room, not sky
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, -1.2)); floor = bpy.context.active_object
    m = bpy.data.materials.new('floor'); m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = hex_rgba('#141F35' if dark else '#C3CEE0')
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.85; floor.data.materials.append(m)
    # three soft area lights: key (upper left, warm-white), fill (right, cool, dim), rim (behind, brand-tinted)
    def area(name, loc, energy, size, colour):
        d = bpy.data.lights.new(name, type='AREA'); d.shape = 'DISK'; d.size = size; d.energy = energy; d.color = colour
        o = bpy.data.objects.new(name, d); o.location = Vector(loc); sc.collection.objects.link(o)
        o.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); return o
    area('key', (-6, -4, 7), 2200 if dark else 520, 4.0, (1.0, 0.98, 0.94))
    area('fill', (7, -2, 4), 500 if dark else 220, 6.0, (0.85, 0.9, 1.0))
    area('rim', (0, 8, 3), 900 if dark else 160, 3.0, (0.35, 0.55, 1.0))
    # SOFTBOXES the camera can SEE: emissive panels at the key and fill positions, so a glossy surface reflects a
    # studio (two bright rectangles and a floor) rather than a gradient. Area lights are invisible to camera rays.
    def softbox(name, loc, size, strength, colour):
        bpy.ops.mesh.primitive_plane_add(size=size, location=loc); o = bpy.context.active_object; o.name = name
        m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
        for x in list(nt.nodes): nt.nodes.remove(x)
        outn = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
        em.inputs['Color'].default_value = colour + (1.0,); em.inputs['Strength'].default_value = strength
        nt.links.new(em.outputs['Emission'], outn.inputs['Surface']); o.data.materials.append(m)
        o.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat('Z', 'Y').to_euler()
        o.visible_shadow = False
    softbox('key_box', (-6.6, -4.4, 7.6), 3.2, 6.0 if dark else 2.2, (1.0, 0.98, 0.94))
    softbox('fill_box', (7.6, -2.2, 4.4), 4.0, 2.0 if dark else 1.0, (0.85, 0.9, 1.0))
    # THE FRONT KEY (P3): ahead of and above the stage camera (Blender +Y is the engine's −z, the view direction), so a
    # glossy shelf top reflects it and the wall ahead carries its pool — the one softbox that is IN the frame.
    softbox('front_box', (0.0, 8.5, 3.4), 3.6, 5.0 if dark else 1.8, (1.0, 0.98, 0.94))
    # the panoramic camera at the stage's eye height
    cam = bpy.data.cameras.new('pano'); cam.type = 'PANO'
    try: cam.panorama_type = 'EQUIRECTANGULAR'
    except Exception: cam.cycles.panorama_type = 'EQUIRECTANGULAR'
    co = bpy.data.objects.new('pano', cam); co.location = (0, 0, 0.6); co.rotation_euler = (math.radians(90), 0, 0)
    sc.collection.objects.link(co); sc.camera = co
    sc.render.filepath = os.path.abspath(a.out); os.makedirs(os.path.dirname(sc.render.filepath), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    # THE SIDECAR — the same shape render.py writes for the forge, so encode.py carries it forward and oneObject.test.ts
    # reads it: nothing ships without the record of the transform it was rendered under.
    out = sc.render.filepath
    digest = hashlib.sha256(open(out, 'rb').read()).hexdigest()[:16]
    sidecar = {
        'blender': bpy.app.version_string, 'engine': sc.render.engine,
        'transform': sc.view_settings.view_transform, 'look': sc.view_settings.look, 'display': sc.display_settings.display_device,
        'exposure': sc.view_settings.exposure, 'gamma': sc.view_settings.gamma,
        'samples': a.samples, 'scale': 2.0, 'resolution': [sc.render.resolution_x, sc.render.resolution_y],
        'format': 'PNG', 'transparent': False, 'source': '(built in memory: scripts/blender/env_studio.py)',
        'purpose': 'environment', 'theme': a.theme, 'bytes': os.path.getsize(out), 'sha256_16': digest,
    }
    with open(out + '.render.json', 'w') as f:
        json.dump(sidecar, f, indent=2, sort_keys=True)
    print(f'  rendered {out} {sc.render.resolution_x}x{sc.render.resolution_y} theme={a.theme} transform={sidecar["transform"]} sha256={digest}')

main()
