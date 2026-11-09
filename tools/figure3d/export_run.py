"""Export the animated v2 scene (me-and-dog-animated.blend) as one web GLB.

  blender -b tools/figure3d/out/v2/me-and-dog-animated.blend --python tools/figure3d/export_run.py -- --out <file.glb>

Joins each character's editable parts into one skinned mesh (Person_SkinnedMesh,
Dog_SkinnedMesh), leaves the Studio collection out, and exports both rigs' active
actions merged into a single clip named RunLoop (frames 1-37, frame 37 = frame 1).
"""
import argparse
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
ap.add_argument("--tangents", action="store_true", help="export tangents (bigger; three.js does fine without)")
args = ap.parse_args(argv)

scene = bpy.context.scene
START, END = 1, 37
bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None


def select(objects, active=None):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.hide_set(False)
        o.hide_viewport = False
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or objects[0]


exported = []
for root_name, rig_name in (("Person", "Person_Rig"), ("Dog", "Dog_Rig")):
    root, rig = bpy.data.objects[root_name], bpy.data.objects[rig_name]
    parts = [o for o in root.children_recursive if o.type == "MESH"]
    parts.sort(key=lambda o: -len(o.data.polygons))
    select(parts, active=parts[0])
    bpy.ops.object.join()
    mesh = bpy.context.view_layer.objects.active
    mesh.name = f"{root_name}_SkinnedMesh"
    mesh.data.name = mesh.name
    if not any(m.type == "ARMATURE" and m.object == rig for m in mesh.modifiers):
        mod = mesh.modifiers.new("Armature", "ARMATURE")
        mod.object = rig
    world = mesh.matrix_world.copy()
    mesh.parent = root
    mesh.matrix_world = world
    exported += [root, rig, mesh]
    print(f"{mesh.name}: {len(mesh.data.vertices)} vertices, {len(mesh.data.polygons)} faces, "
          f"{len(mesh.data.materials)} materials, {len(parts)} parts joined")

scene.frame_start, scene.frame_end = START, END
scene.frame_set(START)
select(exported, active=exported[0])
bpy.ops.export_scene.gltf(
    filepath=args.out,
    export_format="GLB",
    use_selection=True,
    export_apply=False,
    export_yup=True,
    export_normals=True,
    export_texcoords=True,
    export_tangents=args.tangents,
    export_image_format="AUTO",
    export_materials="EXPORT",
    export_extras=False,
    export_cameras=False,
    export_lights=False,
    export_animations=True,
    export_animation_mode="ACTIVE_ACTIONS",
    export_nla_strips_merged_animation_name="RunLoop",
    export_force_sampling=True,
    export_frame_range=True,
    export_frame_step=1,
    export_anim_slide_to_zero=True,
    export_optimize_animation_size=True,
    export_hierarchy_flatten_bones=True,
    export_skins=True,
    export_all_influences=False,
    export_morph=False,
)
print(f"exported {args.out}")
