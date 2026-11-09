"""Render the cartoon dog as sprite frames for the Bio timeline (src/components/TimelineDog.astro).

    blender -b tools/figure3d/out/cute/me-and-dog-animation/me-and-dog-animated.blend \
        --python tools/figure3d/render_dog_sprites.py -- --out tools/figure3d/out/dog-sprite

Writes, under --out:
  run/0001.png … run/0036.png   the package's RunLoop (in place, 30 fps), the Dog only
  idle/0001.png …               the rest pose with a tail wag, a small head nod and an ear twitch
  meta.json                     frame size, counts, the paw (ground) line, the paw centre and the
                                airborne "hold" frame, all in render pixels

The camera looks along the package's own preview camera, so its key / fill / rim lights fall on
the dog exactly as in the package renders; the dog then faces screen-left, and
build_dog_sprite.mjs mirrors the frames so it faces the timeline text. The framing is fitted to
the dog's evaluated mesh over every frame, so the ground line never moves between frames.
Cycles on the CPU: the shared GPUs are left alone; 64 samples + OIDN on these small frames
takes a few minutes.
"""

import argparse
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--out', required=True)
    p.add_argument('--width', type=int, default=288, help='frame width in render pixels (height follows the dog)')
    p.add_argument('--samples', type=int, default=64)
    p.add_argument('--threads', type=int, default=24)
    p.add_argument('--idle-frames', type=int, default=12)
    p.add_argument('--margin', type=float, default=0.05, help='empty border around the union of all frames')
    p.add_argument('--only', choices=['all', 'run', 'idle', 'test'], default='all',
                   help='test: one rest-pose frame and run frames 1 and 19, at low samples')
    return p.parse_args(argv)


args = parse_args()
scene = bpy.context.scene
view_layer = bpy.context.view_layer

# --- the subject: the Dog only --------------------------------------------------------------
person = bpy.data.objects['Person']
for ob in [person, *person.children_recursive]:
    ob.hide_render = True
for ob in scene.objects:
    if ob.type == 'MESH' and ob.name.startswith('Shadow catcher'):
        ob.hide_render = True  # the page draws its own contact shadow, which can stay put during a hop
dog_root = bpy.data.objects['Dog']
rig = bpy.data.objects['Dog_Rig']
dog_meshes = [ob for ob in dog_root.children_recursive if ob.type == 'MESH' and not ob.hide_render]
run_action = rig.animation_data.action
run_frames = list(range(scene.frame_start, scene.frame_end + 1))  # 1..36, the loop's unique frames


def use_action(action):
    """Assign (or clear) the rig's action; Blender 4.4+ also needs the action slot."""
    ad = rig.animation_data
    ad.action = action
    if action is not None and hasattr(ad, 'action_slot') and ad.action_slot is None and len(action.slots):
        ad.action_slot = action.slots[0]


def turn(bone_name, angle, axis):
    """Rotate a pose bone by `angle` about an armature-space axis through its (posed) head."""
    pb = rig.pose.bones[bone_name]
    head = pb.head.copy()
    pb.matrix = Matrix.Translation(head) @ Matrix.Rotation(angle, 4, axis) @ Matrix.Translation(-head) @ pb.matrix
    view_layer.update()  # children read the parent's new pose


# The rest pose is a walking stride, which looks frozen mid-step when the dog waits on a logo.
# In a trot, frames half a cycle apart are near mirror images (each leg forward in one, back in
# the other), so blending the two puts every leg under the body. Half the blended paws hover a
# little (they were mid-swing in one of the two), so the dog is then lowered onto the ground.
def pose_basis():
    return {pb.name: (pb.location.copy(), pb.rotation_quaternion.copy(), pb.scale.copy()) for pb in rig.pose.bones}


def set_basis(basis):
    for pb in rig.pose.bones:
        location, rotation, scale = basis[pb.name]
        pb.location, pb.rotation_quaternion, pb.scale = location, rotation, scale
    view_layer.update()


def blend(a, b):
    return {name: ((a[name][0] + b[name][0]) / 2, a[name][1].slerp(b[name][1], 0.5), (a[name][2] + b[name][2]) / 2)
            for name in a}


def lower(world_dz):
    """Move the whole rig vertically (through its root bones) by world_dz metres."""
    offset = rig.matrix_world.inverted().to_3x3() @ Vector((0.0, 0.0, world_dz))
    for pb in rig.pose.bones:
        if pb.parent is None:
            pb.matrix = Matrix.Translation(offset) @ pb.matrix
    view_layer.update()


standing = None  # blended basis, set once the run has been sampled
stand_drop = 0.0


def idle_pose(i, n):
    """Frame i of n of the idle loop: standing, wagging. Armature Z is up, -Y is forward."""
    set_basis(standing)
    lower(-stand_drop)
    phase = 2 * math.pi * i / n
    turn('Tail.Base', 0.42 * math.sin(phase), 'Z')
    turn('Tail.Tip', 0.34 * math.sin(phase - 0.9), 'Z')
    turn('Head', 0.035 * math.sin(phase + 0.6), 'X')
    twitch = 0.12 * max(0.0, math.sin(phase * 2 - 1.2)) ** 3  # a short flick, twice per loop
    turn('Ear.L', twitch, 'Y')
    turn('Ear.R', -0.5 * twitch, 'Y')


def dog_points():
    """World-space vertices of every visible dog mesh, as evaluated now (skinned)."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    chunks = []
    for ob in dog_meshes:
        evaluated = ob.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        co = np.empty(len(mesh.vertices) * 3, dtype=np.float64)
        mesh.vertices.foreach_get('co', co)
        m = np.array(evaluated.matrix_world)
        chunks.append(co.reshape(-1, 3) @ m[:3, :3].T + m[:3, 3])
        evaluated.to_mesh_clear()
    return np.concatenate(chunks)


# --- camera: the package's preview camera direction, fitted to the dog --------------------------
preview = bpy.data.objects['Preview Camera']
rotation = preview.matrix_world.to_3x3().normalized()
right = np.array(rotation @ Vector((1, 0, 0)))
up = np.array(rotation @ Vector((0, 1, 0)))
forward = np.array(rotation @ Vector((0, 0, -1)))

assert all(pb.rotation_mode == 'QUATERNION' for pb in rig.pose.bones), 'the blend assumes quaternion bones'
samples = {}  # (strip, frame) -> world points
bases = {}
use_action(run_action)
for f in run_frames:
    scene.frame_set(f)
    samples[('run', f)] = dog_points()
    bases[f] = pose_basis()
ground_z = min(samples[('run', f)][:, 2].min() for f in run_frames)  # where planted paws are
use_action(None)
half = len(run_frames) // 2
lifts = {}
for f in run_frames[:half]:
    set_basis(blend(bases[f], bases[f + half]))
    lifts[f] = dog_points()[:, 2].min() - ground_z
stand_from = min(lifts, key=lifts.get)  # the pair whose blend hovers least
standing = blend(bases[stand_from], bases[stand_from + half])
stand_drop = lifts[stand_from]
for i in range(args.idle_frames):
    idle_pose(i, args.idle_frames)
    samples[('idle', i)] = dog_points()

every = np.concatenate(list(samples.values()))
xs, ys = every @ right, every @ up
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
pad = args.margin * max(x1 - x0, y1 - y0)
x0, x1, y0, y1 = x0 - pad, x1 + pad, y0 - pad, y1 + pad
width = args.width
height = int(round(width * (y1 - y0) / (x1 - x0) / 2)) * 2
ortho_w = x1 - x0
ortho_h = ortho_w * height / width
centre = every.mean(axis=0)
centre_plane = centre - (centre @ right) * right - (centre @ up) * up  # keep depth, re-centre in the plane
cam_pos = centre_plane + ((x0 + x1) / 2) * right + ((y0 + y1) / 2) * up - 20.0 * forward

camera_data = bpy.data.cameras.new('Sprite camera')
camera_data.type = 'ORTHO'
camera_data.ortho_scale = max(ortho_w, ortho_h)
camera_data.sensor_fit = 'AUTO'
camera_data.clip_start = 0.1
camera_data.clip_end = 60.0
camera = bpy.data.objects.new('Sprite camera', camera_data)
scene.collection.objects.link(camera)
camera.matrix_world = Matrix.Translation(Vector(cam_pos)) @ rotation.to_4x4()
scene.camera = camera


rim_data = bpy.data.lights.new('Sprite rim', 'SUN')
rim_data.energy = 8.0
rim_data.color = (1.0, 0.97, 0.92)
rim_data.angle = math.radians(8)
rim = bpy.data.objects.new('Sprite rim', rim_data)
scene.collection.objects.link(rim)
rim_dir = Vector(-forward) * 0.75 + Vector((0.0, 0.0, -1.0)) * 0.66  # travels toward the camera and down
rim.rotation_euler = rim_dir.normalized().to_track_quat('-Z', 'Y').to_euler()


def to_pixels(points):
    """Render-pixel coordinates (x right, y down) of world points."""
    px = (points @ right - x0) / ortho_w * width
    py = (y1 - points @ up) / ortho_h * height
    return px, py


# Ground line: where the nearest paws touch, i.e. the lowest image point over the run (some paw is
# always down in a trot); the standing pose rests on the same line.
lowest = {key: to_pixels(pts)[1].max() for key, pts in samples.items()}
ground_y = max(v for (kind, _), v in lowest.items() if kind == 'run')
# Paw centre: middle of the standing dog's footprint (points within 4 cm of the ground).
idle_points = samples[('idle', 0)]
feet_x = to_pixels(idle_points[idle_points[:, 2] < idle_points[:, 2].min() + 0.04])[0]
paw_x = float(feet_x.min() + feet_x.max()) / 2
# Airborne frame: the run frame whose lowest point is highest above the ground (all paws up).
hold = max(run_frames, key=lambda f: samples[('run', f)][:, 2].min())

# --- render --------------------------------------------------------------------------------------
r = scene.render
r.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 8 if args.only == 'test' else args.samples
scene.cycles.use_adaptive_sampling = True
scene.cycles.use_denoising = True
scene.cycles.denoiser = 'OPENIMAGEDENOISE'
r.threads_mode = 'FIXED'
r.threads = args.threads
r.film_transparent = True
r.use_motion_blur = False
r.resolution_x, r.resolution_y, r.resolution_percentage = width, height, 100
r.image_settings.file_format = 'PNG'
r.image_settings.color_mode = 'RGBA'
r.image_settings.color_depth = '8'


def render_to(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    r.filepath = path
    bpy.ops.render.render(write_still=True)


out = os.path.abspath(args.out)
if args.only in ('all', 'idle', 'test'):
    use_action(None)
    for i in range(1 if args.only == 'test' else args.idle_frames):
        idle_pose(i, args.idle_frames)
        render_to(os.path.join(out, 'idle', f'{i + 1:04d}.png'))
if args.only in ('all', 'run', 'test'):
    use_action(run_action)
    for f in ([1, hold] if args.only == 'test' else run_frames):
        scene.frame_set(f)
        render_to(os.path.join(out, 'run', f'{f:04d}.png'))

meta = {
    'frameWidth': width,
    'frameHeight': height,
    'runFrames': len(run_frames),
    'idleFrames': args.idle_frames,
    'fps': scene.render.fps,
    'groundY': round(float(ground_y), 1),
    'pawX': round(paw_x, 1),
    'holdFrame': hold - run_frames[0],  # 0-based index into the run strip
    'standFrom': [stand_from, stand_from + half],
    'standDropMetres': round(float(stand_drop), 4),
    'mirrored': False,  # build_dog_sprite.mjs mirrors frames and pawX
    'source': os.path.basename(bpy.data.filepath),
}
with open(os.path.join(out, 'meta.json'), 'w') as fh:
    json.dump(meta, fh, indent=2)
print('SPRITE META', json.dumps(meta))
