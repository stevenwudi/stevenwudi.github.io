#!/usr/bin/env python
"""Relative depth for each cut-out with Depth Anything V2 (small), run on a padded
crop around the subject so it gets the full model resolution. Writes
<name>_depth.npy (float32, full-image size, larger = closer; 0 outside the crop)
and <name>_depth.png for inspection."""
import argparse
import json
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForDepthEstimation

MODEL = "depth-anything/Depth-Anything-V2-Small-hf"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="folder written by segment.py")
    ap.add_argument("--pad", type=float, default=0.12, help="context margin, fraction of bbox size")
    args = ap.parse_args()
    out = Path(args.out)
    meta = json.loads((out / "subjects.json").read_text())
    img = Image.open(meta["image"]).convert("RGB")
    W, H = img.size

    processor = AutoImageProcessor.from_pretrained(MODEL)
    model = AutoModelForDepthEstimation.from_pretrained(MODEL).eval()

    for name, info in meta["subjects"].items():
        x0, y0, x1, y1 = info["bbox"]
        px, py = int((x1 - x0) * args.pad), int((y1 - y0) * args.pad)
        cx0, cy0, cx1, cy1 = max(0, x0 - px), max(0, y0 - py), min(W, x1 + px), min(H, y1 + py)
        crop = img.crop((cx0, cy0, cx1, cy1))
        inputs = processor(images=crop, return_tensors="pt")
        with torch.no_grad():
            pred = model(**inputs).predicted_depth  # (1, h, w), relative inverse depth
        depth = F.interpolate(pred[None], size=(cy1 - cy0, cx1 - cx0), mode="bicubic", align_corners=False)[0, 0]
        full = np.zeros((H, W), np.float32)
        full[cy0:cy1, cx0:cx1] = depth.numpy()
        np.save(out / f"{name}_depth.npy", full)

        alpha = np.asarray(Image.open(out / f"{name}.png"))[..., 3] > 127
        vals = full[alpha]
        lo, hi = np.percentile(vals, [1, 99])
        vis = np.clip((full - lo) / (hi - lo + 1e-6), 0, 1)
        vis[~alpha] = 0
        Image.fromarray((vis[cy0:cy1, cx0:cx1] * 255).astype(np.uint8)).save(out / f"{name}_depth.png")
        print(f"{name}: depth range inside matte {lo:.3f}..{hi:.3f}")


if __name__ == "__main__":
    main()
