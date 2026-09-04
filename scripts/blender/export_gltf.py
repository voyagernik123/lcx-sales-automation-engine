"""
THE FORGE AS A MACHINED MESH — Blender → GLB, written by hand.

    blender -b -P scripts/blender/export_gltf.py -- --out apps/web/public/objects/forge.glb [--theme dark|light]
            [--bevel-segments 6] [--mark-depth 0.012] [--report]

Why by hand and not the glTF add-on: the add-on writes float32 everything (~3× the bytes we can afford under the
passthrough budget) and its quantization is an external post-process. Writing the container ourselves gives
KHR_mesh_quantization from the start (int16 positions, int8 normals, uint16 uv, uint16 indices), no Draco (the
loader is minimal by design), and a JSON we fully control — the `extras` carry the anisotropy and the brand hex the
brand-fidelity check compares against encoded bytes.

The scene is build_forge.py's scene (same radii, same materials) with what a lathe leaves that primitives cannot:
bevelled edges on disc, ring and plinth, and the LCX mark ENGRAVED into the disc face. The mark is read from
apps/web/public/lcx-mark.svg — the extracted path data, never redrawn (M/L/Z polygons in a 194×194 box).
"""
from __future__ import annotations
import argparse, json, math, os, re, struct, sys
import bpy, bmesh
from mathutils import Vector

# ── shared with build_forge.py (kept identical; a drift here is a drift in the S7 still vs the live mesh) ──────────
def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def hex_rgb_linear(hex6: str):
    h = hex6.lstrip("#")
    return [srgb_to_linear(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4)]

MATERIALS = {
    # name: (hex, roughness, metallic, anisotropy)
    "disc":   ("#8FA3C4", 0.30, 0.95, 0.86),
    "ring":   ("#2C6BFF", 0.13, 0.92, 0.72),
    "plinth": {"dark": ("#161D2E", 0.52, 0.35, 0.0), "light": ("#B9C5D8", 0.52, 0.35, 0.0)},
    # The stage's room markers (P6): a small machined puck, eight instances on the arc behind the plate. Drawn with the
    # stage rig's structure albedo at runtime (stageScene.ts owns the material); this entry is descriptive.
    "marker": ("#161D2E", 0.45, 0.6, 0.0),
}
MARKER = (0.18, 0.05)
DISC = (0.92, 0.16); RING = (1.06, 0.055); PLINTH = (1.9, 0.09)  # radii/heights from ForgeBackdrop.tsx:461-463

# ── geometry ──────────────────────────────────────────────────────────────────────────────────────────────────────
def add_cylinder(name, radius, height, z, segments=128, bevel_width=0.0, bevel_segments=6):
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments, radius=radius, depth=height, location=(0, 0, z))
    ob = bpy.context.active_object; ob.name = name
    if bevel_width > 0:
        m = ob.modifiers.new("bevel", "BEVEL"); m.width = bevel_width; m.segments = bevel_segments; m.limit_method = "ANGLE"
    return ob

def add_torus(name, ring_radius, tube_radius, z, ring_segs=128, tube_segs=32):
    bpy.ops.mesh.primitive_torus_add(major_radius=ring_radius, minor_radius=tube_radius, major_segments=ring_segs,
                                     minor_segments=tube_segs, location=(0, 0, z))
    ob = bpy.context.active_object; ob.name = name
    return ob

def svg_polygons(path):
    """M/L/Z absolute polygons from lcx-mark.svg → list of point lists in the SVG's 194×194 box."""
    text = open(path, encoding="utf-8").read()
    polys = []
    for d in re.findall(r'd="([^"]+)"', text):
        pts = []
        for cmd, x, y in re.findall(r'([ML])\s*([-\d.]+)[ ,]([-\d.]+)', d):
            pts.append((float(x), float(y)))
        if len(pts) >= 3:
            polys.append(pts)
    if not polys:
        raise SystemExit(f"no M/L polygons in {path}")
    return polys

def engrave_mark(disc, svg_path, disc_radius, depth):
    """Boolean-difference an extruded copy of the mark into the disc's top face. Mark spans 62 % of the diameter."""
    polys = svg_polygons(svg_path)
    scale = (disc_radius * 2 * 0.62) / 194.0
    top_z = disc.location.z + DISC[1] / 2
    cutters = []
    for i, pts in enumerate(polys):
        bm = bmesh.new()
        verts = [bm.verts.new(((x - 97.0) * scale, -(y - 97.0) * scale, 0.0)) for x, y in pts]
        bm.faces.new(verts)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        r = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
        bmesh.ops.translate(bm, verts=[g for g in r["geom"] if isinstance(g, bmesh.types.BMVert)], vec=(0, 0, depth * 2))
        me = bpy.data.meshes.new(f"mark{i}"); bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new(f"mark{i}", me); bpy.context.collection.objects.link(ob)
        ob.location = (0, 0, top_z - depth)
        cutters.append(ob)
    for c in cutters:
        m = disc.modifiers.new("engrave", "BOOLEAN"); m.operation = "DIFFERENCE"; m.object = c; m.solver = "EXACT"
    return cutters

def evaluated_mesh(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.normal_update()
    # Smooth by angle, done here rather than by a modifier so the rule is in the file that ships the bytes: a loop
    # whose face normal is within SMOOTH_DEG of the vertex normal shares the smooth vertex; beyond it (the engraving's
    # walls against the cap, the bevel's first ring against the side) it gets its own vertex with the FACE normal, so
    # the machined step reads as a step and not as a smear across the edge.
    SMOOTH_COS = math.cos(math.radians(30.0))
    verts = []; index = {}; tris = []
    split_by_angle = 0
    for f in bm.faces:
        n = f.normal
        for lo in f.loops:
            p = lo.vert.co
            smooth = f.smooth and n.dot(lo.vert.normal) >= SMOOTH_COS
            if f.smooth and not smooth: split_by_angle += 1
            key = (round(p.x, 5), round(p.y, 5), round(p.z, 5)) + ((round(n.x, 3), round(n.y, 3), round(n.z, 3)) if not smooth else ())
            if key not in index:
                index[key] = len(verts)
                nn = lo.vert.normal if smooth else n
                # uv: cylindrical (angle, height) — the anisotropic tangent wants the circumferential direction.
                ang = (math.atan2(p.y, p.x) / (2 * math.pi)) % 1.0
                # BLENDER IS Z-UP, THE ENGINE IS Y-UP (mesh.ts: a cylinder's axis is y, caps at ±h/2). build_forge.py
                # carries the inverse (`gl_to_blender`); this is the forward map, applied to positions AND normals:
                # (x, y, z)_blender → (x, z, -y)_gl. Forgetting it lays the disc on its side — the first export did.
                verts.append((p.x, p.z, -p.y, nn.x, nn.z, -nn.y, ang, p.z))
            tris.append(index[key])
    bm.free(); ev.to_mesh_clear()
    print(f"SPLIT {ob.name}: {split_by_angle} smooth loops split by angle; {len(verts)} vertices", file=sys.stderr)
    return verts, tris

# ── GLB writer with quantized accessors ──────────────────────────────────────────────────────────────────────────
def q16(v, lo, hi):
    t = 0.0 if hi == lo else (v - lo) / (hi - lo)
    return int(round((t * 2 - 1) * 32767))

def build_glb(objects, theme, generator):
    bin_parts = []; views = []; accessors = []; meshes = []; materials = []; nodes = []
    offset = 0
    def push(data: bytes, component_type, count, type_, normalized=False, min_=None, max_=None):
        nonlocal offset
        pad = (4 - len(data) % 4) % 4
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data)})
        acc = {"bufferView": len(views) - 1, "componentType": component_type, "count": count, "type": type_}
        if normalized: acc["normalized"] = True
        if min_ is not None: acc["min"] = min_; acc["max"] = max_
        accessors.append(acc); bin_parts.append(data + b"\0" * pad); offset += len(data) + pad
        return len(accessors) - 1
    for name, verts, tris, mat in objects:
        # Quantize positions to the object's own bounds; the node carries the de-quantization as scale/translation.
        xs = [v[0] for v in verts]; ys = [v[1] for v in verts]; zs = [v[2] for v in verts]
        lo = (min(xs), min(ys), min(zs)); hi = (max(xs), max(ys), max(zs))
        pos = struct.pack(f"<{len(verts)*3}h", *[q16(v[c], lo[c], hi[c]) for v in verts for c in range(3)])
        nrm = struct.pack(f"<{len(verts)*3}b", *[max(-127, min(127, int(round(v[3 + c] * 127)))) for v in verts for c in range(3)])
        uv = struct.pack(f"<{len(verts)*2}H", *[int(round(max(0.0, min(1.0, (v[6] if c == 0 else (v[7] - lo[1]) / max(1e-9, hi[1] - lo[1])))) * 65535)) for v in verts for c in range(2)])
        idx = struct.pack(f"<{len(tris)}H", *tris)
        p_acc = push(pos, 5122, len(verts), "VEC3", True, [-1, -1, -1], [1, 1, 1])
        n_acc = push(nrm, 5120, len(verts), "VEC3", True)
        u_acc = push(uv, 5123, len(verts), "VEC2", True)
        i_acc = push(idx, 5123, len(tris), "SCALAR")
        hex6, rough, metal, aniso = mat
        materials.append({"name": name, "pbrMetallicRoughness": {"baseColorFactor": hex_rgb_linear(hex6) + [1.0],
                          "metallicFactor": metal, "roughnessFactor": rough}, "extras": {"anisotropy": aniso, "brandHex": hex6}})
        meshes.append({"name": name, "primitives": [{"attributes": {"POSITION": p_acc, "NORMAL": n_acc, "TEXCOORD_0": u_acc},
                       "indices": i_acc, "material": len(materials) - 1, "mode": 4}]})
        # de-quantization: p = (q/32767 + 1)/2 * (hi-lo) + lo  → scale (hi-lo)/2, translation (hi+lo)/2
        nodes.append({"name": name, "mesh": len(meshes) - 1,
                      "scale": [(hi[c] - lo[c]) / 2 for c in range(3)], "translation": [(hi[c] + lo[c]) / 2 for c in range(3)]})
    root = {"asset": {"version": "2.0", "generator": generator, "extras": {"theme": theme, "viewTransform": "Standard"}},
            "extensionsUsed": ["KHR_mesh_quantization"], "extensionsRequired": ["KHR_mesh_quantization"],
            "buffers": [{"byteLength": offset}], "bufferViews": views, "accessors": accessors,
            "materials": materials, "meshes": meshes, "nodes": nodes, "scenes": [{"nodes": list(range(len(nodes)))}], "scene": 0}
    js = json.dumps(root, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    body = b"".join(bin_parts)
    total = 12 + 8 + len(js) + 8 + len(body)
    return (struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js
            + struct.pack("<II", len(body), 0x004E4942) + body), root

def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True); p.add_argument("--theme", default="dark", choices=["dark", "light"])
    p.add_argument("--bevel-segments", type=int, default=6); p.add_argument("--mark-depth", type=float, default=0.012)
    p.add_argument("--svg", default="apps/web/public/lcx-mark.svg"); p.add_argument("--report", action="store_true")
    a = p.parse_args(argv)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    disc = add_cylinder("disc", DISC[0], DISC[1], DISC[1] / 2, 128, bevel_width=0.018, bevel_segments=a.bevel_segments)
    ring = add_torus("ring", RING[0], RING[1], RING[1], 128, 16)  # tube r .055: 16 segs → facets .02 units, below one device px at render scale
    plinth = add_cylinder("plinth", PLINTH[0], PLINTH[1], -PLINTH[1] / 2, 128, bevel_width=0.03, bevel_segments=a.bevel_segments)
    cutters = engrave_mark(disc, a.svg, DISC[0], a.mark_depth)
    marker = add_cylinder("marker", MARKER[0], MARKER[1], 0.0, 64, bevel_width=0.008, bevel_segments=3)
    for ob in (disc, ring, plinth, marker):
        for poly in ob.data.polygons: poly.use_smooth = True
    objects = []
    plinth_mat = MATERIALS["plinth"][a.theme]
    for ob, mat in ((disc, MATERIALS["disc"]), (ring, MATERIALS["ring"]), (plinth, plinth_mat), (marker, MATERIALS["marker"])):
        verts, tris = evaluated_mesh(ob)
        if len(verts) > 65535: raise SystemExit(f"{ob.name}: {len(verts)} vertices exceed uint16 indices")
        objects.append((ob.name, verts, tris, mat))
    glb, root = build_glb(objects, a.theme, "lcx export_gltf.py (hand-written GLB, KHR_mesh_quantization)")
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "wb") as f: f.write(glb)
    report = {"bytes": len(glb), "theme": a.theme, "viewTransform": "Standard", "blender": bpy.app.version_string,
              "meshes": [{"name": n, "vertices": len(v), "triangles": len(t) // 3, "material": {"hex": m[0], "roughness": m[1], "metallic": m[2], "anisotropy": m[3]}} for n, v, t, m in objects],
              "mark": {"source": a.svg, "polygons": len(cutters), "depth": a.mark_depth},
              "scripts": ["scripts/blender/export_gltf.py"]}
    with open(a.out + ".render.json", "w") as f: json.dump(report, f, indent=2)
    print(json.dumps(report if a.report else {"bytes": len(glb), "triangles": sum(len(t) // 3 for _, _, t, _ in objects)}))

if __name__ == "__main__":
    main()
