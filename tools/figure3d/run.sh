#!/usr/bin/env bash
# Rebuild the Fig. 1 relief from the photo. Needs: a Python env with the packages in
# requirements.txt (CPU is fine), Blender 4.5 on PATH or in $BLENDER, and Node (gltfpack).
#
#   tools/figure3d/run.sh public/Images/me_dog.jpg [out-dir]
#
# Produces, in out-dir (default tools/figure3d/out):
#   person.png, dog.png       cut-outs            debug_split.png   person/dog split overlay
#   *_depth.npy/png           relief depth        *_tex.png         textures with matte alpha
#   me-and-dog.blend          Blender scene (Person, Dog, camera, light; textures packed)
#   me-and-dog.glb            glTF for Blender / other tools (WebP textures)
#   me-and-dog.meshopt.glb    the compressed copy that the website serves
# and copies the .blend next to this script and the compressed GLB to public/models/.
set -euo pipefail
cd "$(dirname "$0")/../.."
photo=${1:?photo path}
out=${2:-tools/figure3d/out}
py=${PYTHON:-python}
blender=${BLENDER:-blender}

# The foot under the dog's chin is the one spot no model gets right: force it to the person.
"$py" -I tools/figure3d/segment.py "$photo" --out "$out" --person-rect 496,1360,527,1420
"$py" -I tools/figure3d/depth.py --out "$out"
"$py" -I tools/figure3d/build_mesh.py --out "$out"
"$blender" -b --python tools/figure3d/blender_build.py -- --out "$out" --name me-and-dog "${@:3}"
"$py" -I tools/figure3d/glb_textures.py "$out/me-and-dog.glb" "$out"
npx gltfpack -i "$out/me-and-dog.glb" -o "$out/me-and-dog.meshopt.glb" -cc -kn -km

cp "$out/me-and-dog.blend" tools/figure3d/me-and-dog.blend
mkdir -p public/models
cp "$out/me-and-dog.meshopt.glb" public/models/me-and-dog.glb
echo "done: tools/figure3d/me-and-dog.blend and public/models/me-and-dog.glb"
