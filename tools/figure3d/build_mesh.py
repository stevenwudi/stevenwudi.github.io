#!/usr/bin/env python
"""Inflate each cut-out into a closed relief mesh.

Front surface = silhouette inflation (sqrt of the distance to the outline, so thick
parts rise more than limbs) modulated by the Depth Anything relief (nearer parts
stand out); back = a flatter mirror; the two are welded along the outline.
The texture is the photo crop with colours extended past the matte and the matte
as alpha. Writes, per subject, <name>.npz (verts in metres, Blender axes: X right,
Y back, Z up; quads; uvs) and <name>_tex.png, plus scene.json (camera, subjects).
"""
import argparse
import json
from pathlib import Path

import numpy as np
import scipy.ndimage as ndi
from PIL import Image


def decontaminate(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Unmix the background from the matte's soft edge. A photo pixel is I = a*F + (1-a)*B;
    with B taken from the nearest pixel outside the matte, F = (I - (1-a)*B) / a. Without
    this, hair and skin at the outline keep a sky-coloured cast that the relief's rim stretches
    into a pale line."""
    outside = alpha < 0.02
    if not outside.any():
        return rgb
    idx = ndi.distance_transform_edt(~outside, return_distances=False, return_indices=True)
    background = rgb[idx[0], idx[1]].astype(np.float32)
    a = np.clip(alpha, 0.2, 1.0)[..., None]
    foreground = (rgb.astype(np.float32) - (1 - a) * background) / a
    out = rgb.astype(np.float32).copy()
    soft = (alpha >= 0.02) & (alpha < 0.98)
    out[soft] = foreground[soft]
    return np.clip(out, 0, 255).astype(np.uint8)


def extend_colours(rgb: np.ndarray, mask: np.ndarray, erode: int) -> np.ndarray:
    """Replace the outermost `erode` px of the matte and everything outside it with the
    nearest colour from deeper inside. The outline pixels are blended with the sea in
    the photo, and the steep rim of the relief stretches them, so they must not show."""
    core = ndi.binary_erosion(mask, iterations=erode) if erode else mask
    if not core.any():
        core = mask
    idx = ndi.distance_transform_edt(~core, return_distances=False, return_indices=True)
    return rgb[idx[0], idx[1]]


def height_fields(alpha: np.ndarray, depth: np.ndarray, p: argparse.Namespace):
    mask = alpha > 0.5
    H, W = mask.shape
    dt = ndi.distance_transform_edt(mask)
    vals = depth[mask]
    lo, hi = np.percentile(vals, [2, 98])
    near = ndi.gaussian_filter(np.clip((depth - lo) / (hi - lo + 1e-6), 0, 1), p.depth_blur)

    s = p.step
    nx, ny = int(np.ceil((W - 1) / s)) + 1, int(np.ceil((H - 1) / s)) + 1
    gx = np.minimum(np.arange(nx) * s, W - 1).astype(np.float32)
    gy = np.minimum(np.arange(ny) * s, H - 1).astype(np.float32)
    X, Y = np.meshgrid(gx, gy)
    coords = [Y.ravel(), X.ravel()]

    def sample(a: np.ndarray) -> np.ndarray:
        return ndi.map_coordinates(a.astype(np.float32), coords, order=1).reshape(ny, nx)

    a_s, dt_s, near_s = sample(alpha), sample(dt), sample(near)
    inside = a_s > 0.5
    # Outside vertices move onto the outline (nearest matte pixel), so the rim is textured with
    # opaque texels and the silhouette is the geometry's. Left one grid step out, the rim would
    # carry transparent texels, and the back sheet's rim would peek out as a detached sliver.
    nearest = ndi.distance_transform_edt(~mask, return_distances=False, return_indices=True)
    gy_i, gx_i = np.rint(Y).astype(int), np.rint(X).astype(int)
    snap_y, snap_x = nearest[0][gy_i, gx_i].astype(np.float32), nearest[1][gy_i, gx_i].astype(np.float32)
    X = np.where(inside, X, snap_x)
    Y = np.where(inside, Y, snap_y)
    puff = p.thickness * np.sqrt(np.minimum(dt_s, p.cap))  # px
    rim = np.clip(dt_s / p.ramp, 0, 1)  # keeps the additive relief at zero on the outline
    front = puff * (1 + p.depth_mul * (near_s - 0.5)) + p.depth_add * (near_s - 0.5) * rim
    front = ndi.gaussian_filter(np.maximum(front, 0), p.smooth)
    front[~inside] = 0
    back = p.back * puff
    back[~inside] = 0
    return X, Y, inside, front, back


def grid_mesh(X, Y, inside, front, back, W, H):
    """Closed mesh: front sheet + back sheet sharing the vertices outside the matte."""
    ny, nx = X.shape
    n = ny * nx
    id_f = np.arange(n).reshape(ny, nx)
    id_b = id_f.copy()
    id_b[inside] = n + np.arange(int(inside.sum()))

    vf = np.stack([X.ravel(), Y.ravel(), front.ravel()], 1)  # px: x right, y down, h out of the photo
    vb = np.stack([X[inside], Y[inside], -back[inside]], 1)
    verts = np.concatenate([vf, vb])
    uv = np.stack([(X.ravel() + 0.5) / W, 1 - (Y.ravel() + 0.5) / H], 1)
    uvs = np.concatenate([uv, uv[id_f[inside]]])

    keep = inside[:-1, :-1] | inside[:-1, 1:] | inside[1:, 1:] | inside[1:, :-1]
    A, B, C, D = id_f[:-1, :-1], id_f[:-1, 1:], id_f[1:, 1:], id_f[1:, :-1]
    Ab, Bb, Cb, Db = id_b[:-1, :-1], id_b[:-1, 1:], id_b[1:, 1:], id_b[1:, :-1]
    front_quads = np.stack([A, D, C, B], -1)[keep]  # wound so the normal faces the viewer
    back_quads = np.stack([Ab, Bb, Cb, Db], -1)[keep]
    return verts, np.concatenate([front_quads, back_quads]), uvs


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="folder written by segment.py and depth.py")
    ap.add_argument("--step", type=int, default=4, help="grid spacing in pixels")
    ap.add_argument("--thickness", type=float, default=7.0, help="inflation: height = thickness*sqrt(dist) px")
    ap.add_argument("--cap", type=float, default=80.0, help="inflation saturates beyond this distance (px)")
    ap.add_argument("--back", type=float, default=0.5, help="back height as a fraction of the front puff")
    ap.add_argument("--depth-mul", type=float, default=0.8, help="relief: multiplies the puff by 1 +- this/2")
    ap.add_argument("--depth-add", type=float, default=24.0, help="relief: px added for the nearest parts")
    ap.add_argument("--depth-blur", type=float, default=3.0)
    ap.add_argument("--ramp", type=float, default=10.0)
    ap.add_argument("--smooth", type=float, default=0.6, help="gaussian on the height field, grid cells")
    ap.add_argument("--margin", type=int, default=8, help="crop margin around each matte (px)")
    ap.add_argument("--edge-erode", type=int, default=5,
                    help="px of outline colour replaced from deeper inside the matte")
    ap.add_argument("--height", type=float, default=1.8, help="person's bbox height in metres")
    ap.add_argument("--cam-dist", type=float, default=4.4)
    ap.add_argument("--cam-z", type=float, default=0.9)
    ap.add_argument("--fov", type=float, default=30.0)
    ap.add_argument("--dog-forward", type=float, default=0.3,
                    help="metres the dog is moved towards the camera (projection-compensated)")
    args = ap.parse_args()

    out = Path(args.out)
    meta = json.loads((out / "subjects.json").read_text())
    Wf, Hf = meta["size"]
    subjects = meta["subjects"]
    bx = subjects["person"]["bbox"]
    scale = args.height / (bx[3] - bx[1])  # metres per pixel
    xs = [s["bbox"][0] for s in subjects.values()] + [s["bbox"][2] for s in subjects.values()]
    cx = (min(xs) + max(xs)) / 2
    y_ground = max(s["bbox"][3] for s in subjects.values())
    cam = np.array([0.0, -args.cam_dist, args.cam_z])

    scene = {
        "units": "metres",
        "axes": "Blender: X right, Y back (towards +Y is away from the viewer), Z up",
        "metres_per_px": scale,
        "camera": {"position": cam.tolist(), "target": [0.0, 0.0, args.cam_z], "fov_deg": args.fov},
        "subjects": [],
    }
    for name, info in subjects.items():
        rgba = np.asarray(Image.open(out / f"{name}.png").convert("RGBA"))
        depth = np.load(out / f"{name}_depth.npy")
        x0, y0, x1, y1 = info["bbox"]
        m = args.margin
        x0, y0, x1, y1 = max(0, x0 - m), max(0, y0 - m), min(Wf, x1 + m), min(Hf, y1 + m)
        crop, dcrop = rgba[y0:y1, x0:x1], depth[y0:y1, x0:x1]
        alpha = crop[..., 3].astype(np.float32) / 255.0
        # Narrow the matte's transition: the alpha test cuts at 0.5 and the outline vertices sit
        # on that contour, so texels just inside it must be solidly opaque.
        alpha = np.clip((alpha - 0.35) / 0.3, 0, 1)
        crop = crop.copy()
        crop[..., 3] = (alpha * 255).round().astype(np.uint8)
        mask = alpha > 0.5

        colours = extend_colours(decontaminate(crop[..., :3], alpha), mask, args.edge_erode)
        tex = np.dstack([colours, crop[..., 3]])
        Image.fromarray(tex, "RGBA").save(out / f"{name}_tex.png")

        X, Y, inside, front, back = height_fields(alpha, dcrop, args)
        W, H = x1 - x0, y1 - y0
        v_px, quads, uvs = grid_mesh(X, Y, inside, front, back, W, H)

        verts = np.empty_like(v_px)
        verts[:, 0] = (v_px[:, 0] + x0 - cx) * scale  # X right
        verts[:, 1] = -v_px[:, 2] * scale  # Y: relief towards the viewer is -Y
        verts[:, 2] = (y_ground - (v_px[:, 1] + y0)) * scale  # Z up, ground at 0
        forward = args.dog_forward if name == "dog" else 0.0
        if forward:
            t = (args.cam_dist - forward) / args.cam_dist  # shrink about the camera: same projection
            verts = cam + t * (verts - cam)

        np.savez_compressed(out / f"{name}.npz", verts=verts.astype(np.float32), quads=quads.astype(np.int32),
                            uvs=uvs.astype(np.float32))
        scene["subjects"].append({
            "name": name, "texture": f"{name}_tex.png", "forward_m": forward,
            "bbox_px": [x0, y0, x1, y1], "verts": int(len(verts)), "quads": int(len(quads)),
            "front_px_max": float(front.max()),
        })
        print(f"{name}: {len(verts)} verts, {len(quads)} quads, relief up to {front.max():.1f} px "
              f"({front.max() * scale * 100:.1f} cm)")
    (out / "scene.json").write_text(json.dumps(scene, indent=2))


if __name__ == "__main__":
    main()
