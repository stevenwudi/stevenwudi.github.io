# Fig. 1 — the photo relief, and the run cycle

The hero figure on the homepage is `public/Images/me_dog.jpg` turned into two 3D objects,
**Person** and **Dog**, that the page renders with three.js and that you can open in Blender
(`me-and-dog.blend`, textures packed).

They are *reliefs*, not full sculpts: each cut-out is inflated from its outline (thick parts
rise more than limbs), the front is modulated by a monocular depth map so the near arm and
the dog's head stand proud, and a flatter back is welded on along the outline. The photo is
the texture, with the matte as alpha. From the front and up to roughly ±45° it reads as a
figurine; from the side it is a puffed card, which is why the web viewer limits the turn.

## Pipeline

| Step | Script | What it does |
| --- | --- | --- |
| 1 | `segment.py` | rembg (`isnet-general-use`) for a fine matte; DeepLabV3 person/dog classes to split the two; GrabCut refines the boundary where the dog's head covers the shin; `--person-rect` / `--dog-rect` hand hints. |
| 2 | `depth.py` | Depth Anything V2 (small) on a padded crop of each subject. |
| 3 | `build_mesh.py` | Height fields (inflation + depth relief), closed grid mesh, textures with edge colours decontaminated. Tunables: `--thickness`, `--cap`, `--depth-mul`, `--depth-add`, `--back`, `--step`, `--dog-forward`. |
| 4 | `blender_build.py` | Builds the objects and materials in Blender, saves the `.blend`, exports `.glb` (WebP textures, alphaMode MASK); `--render` makes Cycles previews, `--draco` a Draco copy. |
| 5 | `glb_textures.py` | Re-encodes the GLB textures as WebP with exact RGB under transparent texels (libwebp smears them, which bleeds into the alpha-tested outline). |
| 6 | `gltfpack -cc -kn -km` | meshopt-compressed GLB for the site (1.4 MB → 0.34 MB). |

`run.sh` runs all of it. Model weights (~0.5 GB) download on first use. Everything runs on CPU
in about a minute.

## Web side

- `src/components/Figure3D.astro` — markup, poster image, lazy loading (three.js is fetched only
  when the figure is near the viewport and the browser is idle; no WebGL or Save-Data → poster).
- `src/scripts/figure3d.ts` — the viewer: framing, soft shadow, hover follows the cursor, drag
  turns further and eases back, dog bobs (not with `prefers-reduced-motion`). It dispatches a
  `figure3d:ready` event whose detail has `snapshot(yaw, pitch)` (PNG data URL), `run()`,
  `photo()`, `toggle()`, `pause()` and `resume()`.
- `src/scripts/figure3d-veil.ts` — the ink-bleed transition between the photo and the run cycle
  (below).
- No visible caption: the figure is its own control. The figcaption holds the download hairline,
  a visually hidden description and a toggle button that only shows under keyboard focus.
- `src/assets/portrait/me-and-dog-poster.png` — the first frame, shown until WebGL has drawn.
- `public/models/me-and-dog.glb` — what the page loads.

## v2: the animated run cycle (click to play)

A second, rigged and animated version of the pair (hand-modelled, stylised, not the photo) comes
from the user-supplied package `src/assets/me-and-dog-animation-cute.zip`, the cartoon revision with
a larger head and a closed dog mouth. Its combined `web/models/me-and-dog-run.glb` is intact, so it
only needs compressing:

| Step | Command | What it does |
| --- | --- | --- |
| 1 | unzip into `out/cute/`, copy `web/models/me-and-dog-run.glb` to `out/cute/me-and-dog-run.webp.glb` | The package's combined export: `RunLoop` clip (1.2 s, 30 fps), two skins, 16 PNG textures, 16.8 MB. |
| 2 | `glb_textures.py out/cute/me-and-dog-run.webp.glb --quality 85 --max-size 1024` | Re-encodes the 16 embedded PNGs as WebP in place (normal maps at higher quality). |
| 3 | `gltfpack -i out/cute/me-and-dog-run.webp.glb -o out/cute/me-and-dog-run.glb -cc -kn -km -vpf` | meshopt compression: 16.8 MB → 2.6 MB. `-vpf` keeps positions as floats: without it gltfpack stores them as 16-bit integers and puts the scale back to metres on the skinned mesh's node, and the person then rendered as black shards in at least one user browser (not reproducible here). |

The earlier package, `me-and-dog-animation.zip`, was truncated. Its web GLB had to be re-exported from
the `.blend` with `export_run.py`; that route still works for any package that ships only a `.blend`:
`blender -b <pkg>/me-and-dog-animated.blend --python export_run.py -- --out <raw.glb>`, then steps 2–3.

**Broken GPU drivers.** Some drivers get vertex skinning, or even plain drawing of a large mesh,
wrong (seen with VMware's virtual SVGA adapter under Chrome/ANGLE/Direct3D 11: the pair rendered as
black shards). Before the run cycle is shown, the viewer draws the posed model off screen and
compares its silhouette with a CPU rasterisation of the same pose (intersection over union; correct
drivers score 98–100 %, garbage 15–35 %, pass mark 93 %). It tries, in order (`DRAW_PATHS` in
`figure3d.ts`, all but the first implemented in `cpu-skinning.ts`):

| Path | What it does |
| --- | --- |
| `gpu` | Normal three.js skinning (skipped on virtual GPUs). |
| `cpu` | Skinning in JavaScript (~11 ms per pose, 30 poses/s), the model's own materials. |
| `cpu-simple` | As above with flat Lambert materials (colour + texture only). |
| `cpu-chunked` | The twins drawn as pieces of ≤ 16 384 vertices: 16-bit indices, buffers under 200 KB. |
| `cpu-lite` | Chunked, one average colour per material, every texture and the environment map freed. |

Each path is measured only after a safe upload order (`settleUploads`): the textures it needs
are uploaded first, the GPU is waited for, then the geometry is uploaded again on its own and
waited for, and only then is the silhouette drawn and compared. This is the actual
VMware fault: a vertex or index buffer followed by a large texture upload before the GPU has
consumed it comes out scrambled, which is what the first draw of a textured model does. A path
that still misses gets one clean re-upload and a second measurement before it is rejected, and a
failed periodic re-check does the same before stepping down. If no path passes the run cycle is
marked unsupported (`data-run="unsupported"`): the figure stays a photo, and clicks do nothing. The chosen path is re-verified after 1, 4 and 20 s
of animation and every 30 s after that, stepping down if the driver fails late. A path other than
`gpu` is remembered per GPU name in localStorage (`figure3d-path`, for a week, with a protocol
version so a changed measurement re-examines old verdicts; cleared when the figure gives up) so
later visits start from it instead of drawing garbage off screen again. `data-skinning`
says which path is in use; `?figure3d-skinning=<path>` forces one; `?figure3d-debug` starts the run
cycle as soon as it is ready, overlays the GPU name and all measurements, and runs synthetic probes (one
big mesh with 16- and 32-bit indices, 24 small meshes, a dynamic re-upload, 16 textures) that say
which kind of GPU work fails (`figure3d-debug.ts`, loaded only then). The headless harness in the
session scratchpad simulated corrupt bone textures (→ `cpu`), corrupt large buffers and corrupt
32-bit indices (→ `cpu-chunked`) and the VMware-style interleaved-upload scramble (→ every path
passes once uploads are settled) to validate the ladder.

**Nothing of this runs on the click.** Done synchronously, the ladder froze Chrome for 2 s on a
healthy software renderer and 5–7 s on the VMware machine (shader compiles and pixel read-backs
that wait for the GPU). So `prepareRun()` does all of it in the background once the model has
downloaded, one step per idle callback, on a private staging scene with the same lights, shadow
and environment as the running page: `compileAsync` for every path (both the off-screen and the
canvas shader variants; `KHR_parallel_shader_compile` keeps compiles off the main thread),
fence-polled GPU waits (`gpuIdle`) instead of `gl.finish()`, and `readRenderTargetPixelsAsync`
instead of `readPixels`. The staging shadow map and check target are allocated before any model
geometry goes up (a large allocation right after a vertex upload is the VMware fault again), the
environment map is built only for the paths that use it, and shader error checks are on only with
`?figure3d-debug`. `data-run` is `loading` (download), `preparing`, then `ready` or `unsupported`
(a device where nothing passes keeps the photo). Each rung has
`RUNG_BUDGET_MS` = 20 s: garbage draws are huge and fill-heavy, so a rung that runs out of time is
counted as a failure and the cheaper rungs still get their turn (a persistent-corruption fault on
SwiftShader needed 39 s for the GPU rung alone and used to exhaust a single 60 s budget before
reaching the chunked rung). A click before preparation ends waits (`data-mode="loading"`, a progress cursor) and then switches. Measured in headless Chrome: click → running
7–27 ms with no main-thread block over 80 ms (SwiftShader, RTX 5090, simulated VMware fault);
background preparation 1–3 s in blocks of at most ~250 ms; re-checks while running are
asynchronous too.

The site serves the result as `public/models/me-and-dog-run.glb`; the viewer downloads it in the
background after the relief has drawn and prepares it as above. Then:

- **It comes alive by itself, once.** When the run cycle is ready and the figure has been at least
  half in view for 1.5 s (tab visible, no drag under way), the photo turns into it without a click.
  Not with `prefers-reduced-motion`; never again in that page view once the visitor clicks back to
  the photo. A click (or the keyboard toggle) switches between the two at any time.
- **Ink-bleed transition** (`figure3d-veil.ts`). Its photo layer is the poster (the relief rendered
  at rest), drawn over an opaque copy of the page colour on a 2D canvas laid over the WebGL one.
  Photo → run cycle: the relief first settles to rest (≤ 300 ms, so the poster matches it), the
  poster covers the stage, the scene underneath switches and draws its first frame, and a ragged
  hole washes the photo away from the click point (from the dog when nobody clicked). Run cycle →
  photo: the photo bleeds in from the click point over the running pair until it covers the stage,
  then the relief, at rest, replaces it underneath. The edge is a low-resolution mask of distance
  plus drifting fractal noise, upscaled with smoothing (feathered), with a faint ink-coloured rim;
  ease-in-out over 900 ms; a 240 ms fade with reduced motion, or when a failed re-check sends the
  figure back to the photo. Nothing reads pixels from WebGL and the 2D canvases are CPU-backed: on
  the shared, busy RTX machines here a single GPU read-back (`getImageData`, or `drawImage` of the
  WebGL canvas) stalled the page for 20–60 s, and a fragile driver could do the same.
- While the run cycle shows and the pointer is not on the figure, it is drawn at the clip's own
  30 fps (the clip is sampled at 30 fps), which halves the cost for visitors who just read the page.

## Timeline dog sprite

The Bio timeline has the cartoon dog standing on the logo of the entry being read and hopping to
the next one as the page scrolls (`src/components/TimelineDog.astro`, `src/scripts/timeline-dog.ts`).
It is a sprite, not a second WebGL renderer: two image strips rendered once from the package's
`.blend` and stepped with CSS transforms.

| Step | Command | What it does |
| --- | --- | --- |
| 1 | `blender -b out/cute/me-and-dog-animation/me-and-dog-animated.blend --python render_dog_sprites.py -- --out out/dog-sprite --samples 96` | The Dog only, through the package's own preview-camera direction (its key/fill/rim lights read the same) plus a rim light so the black coat keeps an edge on the dark theme; orthographic, framed on the union of every frame so the ground line never moves; Cycles on the CPU, film transparent. Renders `run/` (the `RunLoop`, 36 frames) and `idle/` (12 frames: standing, wagging, a nod and an ear flick), and `meta.json` (ground line, paw centre, the airborne frame). The rest pose is a walking stride, so the standing pose is the blend of the two trot frames half a cycle apart (mirror images: each leg ends up under the body). About 30 s. |
| 2 | `node build_dog_sprite.mjs out/dog-sprite ../../src/assets/dog 144` | Mirrors the frames (the dog faces the timeline text), scales them to 144 px (2× the 72 px it is shown at), packs `dog-run.webp` (~114 KB) and `dog-idle.webp` (~36 KB), and writes `dog-sprite.json`. Run it from `tools/figure3d/` or pass paths from the repository root. |

On the page the dog appears (dropping in) when the first logo passes 85 % of the viewport height,
then follows the entry whose logo has passed the middle: one entry per hop (crouch, a ballistic arc
with the in-air frame held and the body pitched along it, a squash on landing), quicker hops when
behind, and a fade-and-reappear when four or more behind. It trots in place while the page scrolls
and stands wagging 0.6 s after it stops; animations pause off screen; with reduced motion it just
stands on the right entry. The strips load only when the timeline is within a screen of the
viewport. `.timeline__mark` has 3 rem of bottom padding so the dog has headroom above each logo.
