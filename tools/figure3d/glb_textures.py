#!/usr/bin/env python
"""Re-encode the textures inside a GLB as WebP with exact RGB under transparent pixels.

libwebp (which Blender's exporter uses) smears the colour of fully transparent texels by
default; bilinear and mip filtering then bleed that smear into the alpha-tested outline.
Run after blender_build.py and before gltfpack:  glb_textures.py <file.glb> <texture-dir>
"""
import io
import json
import struct
import sys
from pathlib import Path

from PIL import Image

GLB_MAGIC, JSON_CHUNK, BIN_CHUNK = 0x46546C67, 0x4E4F534A, 0x004E4942


def encode(image: Image.Image, name: str, max_size: int, quality: int) -> bytes:
    if max(image.size) > max_size:
        scale = max_size / max(image.size)
        image = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    # Normal maps are sensitive to lossy artefacts; give them more quality.
    q = max(quality, 94) if "normal" in name.lower() else quality
    image.save(buf, "WEBP", quality=q, method=6, exact=True)
    return buf.getvalue()


def main(glb: Path, texdir: Path | None, quality: int = 90, max_size: int = 4096) -> None:
    raw = glb.read_bytes()
    assert raw[:4] == b"glTF", "not a GLB"
    json_len = struct.unpack_from("<I", raw, 12)[0]
    doc = json.loads(raw[20:20 + json_len])
    bin_len = struct.unpack_from("<I", raw, 20 + json_len)[0]
    blob = raw[28 + json_len:28 + json_len + bin_len]

    views = doc["bufferViews"]
    chunks = [blob[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]] for v in views]
    for image in doc.get("images", []):
        src = texdir / f"{image.get('name', '')}.png" if texdir else None
        if src is not None and src.exists():
            pil = Image.open(src)
        else:  # re-encode the embedded image
            pil = Image.open(io.BytesIO(chunks[image["bufferView"]]))
        has_alpha = pil.mode in ("RGBA", "LA") or "transparency" in pil.info
        pil = pil.convert("RGBA" if has_alpha else "RGB")
        before = len(chunks[image["bufferView"]])
        chunks[image["bufferView"]] = encode(pil, image.get("name", ""), max_size, quality)
        image["mimeType"] = "image/webp"
        print(f"{image.get('name', '?')}: {pil.size[0]}x{pil.size[1]} {before} -> {len(chunks[image['bufferView']])} bytes")

    body = bytearray()
    for view, chunk in zip(views, chunks):
        body += b"\0" * (-len(body) % 4)
        view["byteOffset"], view["byteLength"] = len(body), len(chunk)
        body += chunk
    body += b"\0" * (-len(body) % 4)
    doc["buffers"][0]["byteLength"] = len(body)
    js = json.dumps(doc, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    out = struct.pack("<III", GLB_MAGIC, 2, 28 + len(js) + len(body))
    out += struct.pack("<II", len(js), JSON_CHUNK) + js + struct.pack("<II", len(body), BIN_CHUNK) + bytes(body)
    glb.write_bytes(out)


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("glb", type=Path)
    ap.add_argument("texdir", nargs="?", type=Path, help="folder with <image name>.png sources (else embedded)")
    ap.add_argument("--quality", type=int, default=90)
    ap.add_argument("--max-size", type=int, default=4096)
    a = ap.parse_args()
    main(a.glb, a.texdir, a.quality, a.max_size)
