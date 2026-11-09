"""Run inside Blender:  blender -b --python blender_build.py -- --out <folder> --name me-and-dog [--render]

Builds one object per subject from the npz files written by build_mesh.py, gives each a
textured material (photo as base colour, matte as alpha, clipped), saves a .blend with
the textures packed, and exports a glTF binary (.glb) with WebP textures for the web.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
ap.add_argument("--name", default="me-and-dog")
ap.add_argument("--render", action="store_true", help="also render a preview with Cycles (CPU)")
ap.add_argument("--samples", type=int, default=48)
ap.add_argument("--draco", action="store_true", help="also write <name>.draco.glb (Draco-compressed geometry)")
args = ap.parse_args(argv)
out = Path(args.out)
scene_meta = json.loads((out / "scene.json").read_text())

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"


def make_material(name: str, image_path: Path) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.85
    bsdf.inputs["Specular IOR Level"].default_value = 0.25
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(image_path))
    tex.image.alpha_mode = "STRAIGHT"
    tex.location = (-400, 300)
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    # Clipped alpha: the outline follows the matte, and glTF gets alphaMode MASK.
    mat.surface_render_method = "DITHERED"
    if hasattr(mat, "blend_method"):
        mat.blend_method = "CLIP"
    mat.alpha_threshold = 0.5
    mat.use_backface_culling = True  # closed mesh: single-sided in glTF
    return mat


objects = []
for subj in scene_meta["subjects"]:
    data = np.load(out / f"{subj['name']}.npz")
    verts, quads, uvs = data["verts"], data["quads"], data["uvs"]
    mesh = bpy.data.meshes.new(subj["name"].capitalize())
    mesh.from_pydata(verts.tolist(), [], quads.tolist())
    mesh.validate(verbose=False)
    uv_layer = mesh.uv_layers.new(name="UVMap")
    loop_vertex = np.empty(len(mesh.loops), dtype=np.int32)
    mesh.loops.foreach_get("vertex_index", loop_vertex)
    uv_layer.data.foreach_set("uv", uvs[loop_vertex].ravel())
    mesh.update()
    mesh.shade_smooth()

    obj = bpy.data.objects.new(subj["name"].capitalize(), mesh)
    scene.collection.objects.link(obj)
    obj.data.materials.append(make_material(f"{subj['name'].capitalize()}Photo", out / subj["texture"]))
    objects.append(obj)
    print(f"{obj.name}: {len(mesh.vertices)} vertices, {len(mesh.polygons)} faces")

# Camera and a soft world light, so the .blend opens ready to look at.
cam_meta = scene_meta["camera"]
cam_data = bpy.data.cameras.new("Camera")
cam_data.lens_unit = "FOV"
cam_data.angle = math.radians(cam_meta["fov_deg"])
cam_data.sensor_fit = "VERTICAL"
cam = bpy.data.objects.new("Camera", cam_data)
cam.location = cam_meta["position"]
cam.rotation_euler = (math.radians(90), 0, 0)  # look along +Y, Z up
scene.collection.objects.link(cam)
scene.camera = cam

world = bpy.data.worlds.new("World")
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (0.96, 0.95, 0.93, 1)
bg.inputs["Strength"].default_value = 1.0
scene.world = world

sun_data = bpy.data.lights.new("Key", "SUN")
sun_data.energy = 2.0
sun_data.angle = math.radians(12)
sun = bpy.data.objects.new("Key", sun_data)
sun.rotation_euler = (math.radians(55), math.radians(-25), math.radians(-25))
scene.collection.objects.link(sun)

for img in bpy.data.images:
    img.pack()
blend_path = out / f"{args.name}.blend"
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
print(f"saved {blend_path}")

def patch_alpha_mode(path: Path, cutoff: float = 0.5) -> None:
    """Blender 4.5 writes alphaMode BLEND for a clipped material; the web wants MASK
    (no sorting, hard matte edge), so rewrite the JSON chunk in place."""
    import struct

    raw = path.read_bytes()
    json_len = struct.unpack_from("<I", raw, 12)[0]
    doc = json.loads(raw[20:20 + json_len])
    for material in doc.get("materials", []):
        material["alphaMode"] = "MASK"
        material["alphaCutoff"] = cutoff
    body = json.dumps(doc, separators=(",", ":")).encode()
    body += b" " * (-len(body) % 4)
    rest = raw[20 + json_len:]
    header = struct.pack("<III", 0x46546C67, 2, 20 + len(body) + len(rest)) + struct.pack("<II", len(body), 0x4E4F534A)
    path.write_bytes(header + body + rest)


for o in objects:
    o.select_set(True)
cam.select_set(False)
sun.select_set(False)
variants = [(out / f"{args.name}.glb", {})]
if args.draco:
    variants.append((out / f"{args.name}.draco.glb", dict(
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14, export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12)))
for glb_path, extra in variants:
  bpy.ops.export_scene.gltf(
    filepath=str(glb_path),
    **extra,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_image_format="WEBP",
    export_image_quality=88,
    export_normals=True,
    export_texcoords=True,
    export_materials="EXPORT",
    export_animations=False,
    export_skins=False,
    export_morph=False,
    export_cameras=False,
    export_lights=False,
  )
  patch_alpha_mode(glb_path)
  print(f"exported {glb_path} ({glb_path.stat().st_size / 1e6:.2f} MB)")

if args.render:
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = args.samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 640, 800
    scene.render.film_transparent = False
    for yaw in (0, 25, -25):
        for o in objects:
            o.rotation_euler = (0, 0, math.radians(yaw))
        scene.render.filepath = str(out / f"render_{yaw:+d}.png")
        bpy.ops.render.render(write_still=True)
        print(f"rendered {scene.render.filepath}")
