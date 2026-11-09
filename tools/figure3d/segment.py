#!/usr/bin/env python
"""Cut the person and the dog out of one photo.

rembg gives a fine foreground matte (hair, fur, spray); DeepLabV3 (person vs dog
classes) decides which subject each foreground pixel belongs to. Outputs, in --out:
  person.png / dog.png   RGBA cut-outs in full-image coordinates
  subjects.json          bounding boxes and image size
  debug_split.png        overlay to eyeball the split
"""
import argparse
import json
from pathlib import Path

import numpy as np
import scipy.ndimage as ndi
from PIL import Image

PERSON, DOG = 15, 12  # VOC label ids used by torchvision's COCO_WITH_VOC_LABELS weights


def fine_matte(img: Image.Image, model: str) -> np.ndarray:
    from rembg import new_session, remove

    session = new_session(model)
    mask = remove(img, session=session, only_mask=True, post_process_mask=False)
    return np.asarray(mask, dtype=np.float32) / 255.0


def person_minus_dog(img: Image.Image) -> np.ndarray:
    """Per-pixel (person logit - dog logit) at full image resolution."""
    import torch
    from torchvision.models.segmentation import DeepLabV3_ResNet101_Weights, deeplabv3_resnet101

    weights = DeepLabV3_ResNet101_Weights.COCO_WITH_VOC_LABELS_V1
    model = deeplabv3_resnet101(weights=weights).eval()
    x = torch.from_numpy(np.asarray(img, dtype=np.float32) / 255.0).permute(2, 0, 1)
    mean = torch.tensor([0.485, 0.456, 0.406])[:, None, None]
    std = torch.tensor([0.229, 0.224, 0.225])[:, None, None]
    x = ((x - mean) / std)[None]
    with torch.no_grad():
        logits = model(x)["out"][0]
    return (logits[PERSON] - logits[DOG]).numpy()


def colour_refine(rgb: np.ndarray, fg: np.ndarray, diff: np.ndarray, band: int = 30) -> np.ndarray:
    """Re-decide person-vs-dog inside a band around their boundary with GrabCut.

    DeepLab predicts at 1/8 resolution, so where one subject occludes the other its
    boundary wanders by a few tens of pixels. Its labels are kept as definite outside
    the band and only "probable" inside it; GrabCut's colour models and edge-aware
    smoothing then settle the overlap (skin against black-and-white fur).
    """
    import cv2

    person = fg & (diff > 0)
    dog = fg & ~person
    grow = lambda m: ndi.binary_dilation(m, iterations=band)
    band_px = fg & grow(person) & grow(dog)
    if not band_px.any():
        return person

    ys, xs = np.nonzero(ndi.binary_dilation(band_px, iterations=band))
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    gc = np.full(fg.shape, cv2.GC_BGD, np.uint8)
    gc[person] = cv2.GC_FGD
    gc[band_px & person] = cv2.GC_PR_FGD
    gc[band_px & dog] = cv2.GC_PR_BGD
    gc = np.ascontiguousarray(gc[y0:y1, x0:x1])
    # Pixels outside the matte (sea, foam) must not teach the dog's colour model what
    # wet skin in foam looks like, so they are flattened to one unnatural colour.
    bgr = rgb[y0:y1, x0:x1, ::-1].copy()
    bgr[~fg[y0:y1, x0:x1]] = (0, 255, 0)
    bgr = np.ascontiguousarray(bgr)
    bg_model, fg_model = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(bgr, gc, None, bg_model, fg_model, 8, cv2.GC_INIT_WITH_MASK)
    refined = person.copy()
    refined[y0:y1, x0:x1] = (gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD)
    refined &= fg
    return component_vote(refined, fg, diff)


def component_vote(person: np.ndarray, fg: np.ndarray, diff: np.ndarray) -> np.ndarray:
    """Detached fragments (a foot showing under the dog's chin) take DeepLab's majority
    label as a whole, instead of flipping pixel by pixel on colour alone."""
    out = person.copy()
    for cls_mask, is_person in ((person, True), (fg & ~person, False)):
        labels, n = ndi.label(cls_mask)
        if n < 2:
            continue
        sizes = ndi.sum(cls_mask, labels, index=np.arange(1, n + 1))
        for i in range(1, n + 1):
            if sizes[i - 1] == sizes.max():
                continue  # the main body keeps its label
            comp = labels == i
            votes_person = (diff[comp] > 0).mean()
            print(f"  fragment of {'person' if is_person else 'dog'}: {int(sizes[i - 1])} px, "
                  f"DeepLab says person for {votes_person:.0%}")
            out[comp] = votes_person > 0.5
    return out


def largest_component(mask: np.ndarray, keep_ratio: float = 0.003) -> np.ndarray:
    """Keep the largest connected blob plus any blob at least keep_ratio of its size."""
    labels, n = ndi.label(mask)
    if n == 0:
        return mask
    sizes = ndi.sum(mask, labels, index=np.arange(1, n + 1))
    keep = np.flatnonzero(sizes >= keep_ratio * sizes.max()) + 1
    return np.isin(labels, keep)


def bbox(mask: np.ndarray) -> list[int]:
    ys, xs = np.nonzero(mask)
    return [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--out", required=True)
    ap.add_argument("--matte-model", default="isnet-general-use")
    ap.add_argument("--fg-threshold", type=float, default=0.5)
    ap.add_argument("--person-rect", action="append", default=[], metavar="X0,Y0,X1,Y1",
                    help="force matte pixels inside this box to the person (repeatable)")
    ap.add_argument("--dog-rect", action="append", default=[], metavar="X0,Y0,X1,Y1",
                    help="force matte pixels inside this box to the dog (repeatable)")
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    img = Image.open(args.image).convert("RGB")
    rgb = np.asarray(img)

    alpha = fine_matte(img, args.matte_model)
    Image.fromarray((alpha * 255).astype(np.uint8)).save(out / "matte.png")
    fg = alpha > args.fg_threshold

    diff = ndi.gaussian_filter(person_minus_dog(img), sigma=3)
    person = colour_refine(rgb, fg, diff)
    # Hand hints for the few pixels no model gets right (e.g. a foot in the foam).
    for rects, value in ((args.person_rect, True), (args.dog_rect, False)):
        for rect in rects:
            x0, y0, x1, y1 = (int(v) for v in rect.split(","))
            person[y0:y1, x0:x1] = value
    person &= fg
    person = largest_component(person, keep_ratio=0.003)
    dog = largest_component(fg & ~person, keep_ratio=0.003)
    # Foreground pixels dropped by the component filter (spray, stray blobs) stay out of both.

    subjects = {"image": args.image, "size": [img.width, img.height], "subjects": {}}
    for name, mask in (("person", person), ("dog", dog)):
        rgba = np.dstack([rgb, (alpha * mask * 255).astype(np.uint8)])
        Image.fromarray(rgba, "RGBA").save(out / f"{name}.png")
        subjects["subjects"][name] = {"bbox": bbox(mask), "area": int(mask.sum())}
        print(f"{name}: bbox={bbox(mask)} area={int(mask.sum())}")
    (out / "subjects.json").write_text(json.dumps(subjects, indent=2))

    # Debug overlay: person tinted red, dog tinted blue, dropped foreground tinted yellow.
    over = rgb.astype(np.float32)
    tint = np.zeros_like(over)
    tint[person] = (255, 60, 60)
    tint[dog] = (60, 120, 255)
    tint[fg & ~person & ~dog] = (255, 220, 0)
    sel = person | dog | fg
    over[sel] = over[sel] * 0.5 + tint[sel] * 0.5
    Image.fromarray(over.astype(np.uint8)).save(out / "debug_split.png")


if __name__ == "__main__":
    main()
