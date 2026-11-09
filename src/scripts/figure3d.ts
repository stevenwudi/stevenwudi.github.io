// Interactive hero figure: the photo relief built by tools/figure3d, framed in the stage, turned
// by the pointer (hover follows the cursor, drag turns further). Once the rigged, animated version
// (v2) has loaded and passed the drawing checks, the photo turns into it by itself, once, through
// an ink-bleed reveal (figure3d-veil.ts); a click switches between the two.
import {
  AnimationMixer,
  Box3,
  BufferAttribute,
  DirectionalLight,
  FrontSide,
  Group,
  HemisphereLight,
  LoopRepeat,
  MathUtils,
  Mesh,
  Matrix4,
  MeshLambertMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PMREMGenerator,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  type SkinnedMesh,
  SRGBColorSpace,
  type Texture,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { cpuSkinning, type CpuSkinning } from './cpu-skinning';
import { createVeil, type Point } from './figure3d-veil';

/**
 * How the run cycle is drawn, from the normal way down to the fallbacks for broken GPU drivers:
 * GPU skinning; CPU skinning; CPU skinning with flat Lambert materials; the same drawn as pieces of
 * ≤16k vertices (16-bit indices, small buffers); and the pieces with one colour per material and
 * every texture and the environment map freed (as little GPU memory as possible).
 */
type DrawPath = 'gpu' | 'cpu' | 'cpu-simple' | 'cpu-chunked' | 'cpu-lite';
const DRAW_PATHS: DrawPath[] = ['gpu', 'cpu', 'cpu-simple', 'cpu-chunked', 'cpu-lite'];
/**
 * Lowest intersection-over-union between what the GPU drew and the CPU rasterisation that still
 * counts as right. Correct drivers score 98–100 %; shards inside the right outline can reach 85 %.
 */
const MATCH = 0.93;
/** Seconds of animation after which the chosen path is checked again (drivers can fail late or intermittently)… */
const RECHECK_AT = [1, 4, 20];
/** …and then every so often for as long as it runs. */
const RECHECK_EVERY = 30;
const CHECK_WIDTH = 128;
/**
 * How long measuring one drawing path may take. Correct draws are measured in a few seconds even
 * on software renderers; a driver that only produces garbage makes each (huge, fill-heavy) garbage
 * draw take far longer, so a path that runs out of time counts as failed and the cheaper paths
 * still get their turn (the pieces are cheap to draw even when the big meshes are not).
 */
const RUNG_BUDGET_MS = 20_000;
/** Where the drawing path that worked on this GPU is remembered, so a weak driver is not asked to draw garbage again on every visit. */
const PATH_MEMORY_KEY = 'figure3d-path';
const PATH_MEMORY_VERSION = 2; // bump when the measurement protocol changes, so old verdicts are re-examined
const PATH_MEMORY_TTL = 7 * 24 * 3600 * 1000; // drivers get updated; try the better paths again after a week

const FOV = 30;
const HOVER_YAW = 20; // degrees, cursor at the stage edge
const HOVER_PITCH = 6;
const DRAG_YAW = 60;
const DRAG_PITCH = 18;
const DRAG_SPEED = 0.45; // degrees per CSS pixel
const TAP_SLOP = 6; // px of movement that still counts as a click
/** The photo turns into the run cycle by itself once the figure has been well in view this long… */
const AUTO_RUN_AFTER_MS = 1500;
/** …or this long after the visitor lets go of a drag. */
const AUTO_RUN_AFTER_DRAG_MS = 600;
/** While the run cycle shows and the pointer is elsewhere, draw at the clip's own 30 fps. */
const RUN_FRAME_MS = 1000 / 30 - 2;

export type Figure3DMode = 'photo' | 'loading' | 'running';

export interface Figure3DOptions {
  /** Called once the first frame is on screen (poster can fade out). */
  onReady?: () => void;
  /** Called whenever the figure switches between the photo relief and the run cycle. */
  onMode?: (mode: Figure3DMode) => void;
}

/** Sent as the detail of the `figure3d:ready` event dispatched on the figure. */
export interface Figure3DApi {
  /** Draw one frame at a fixed pose (and, for the run cycle, a fixed clip time) as a PNG data URL. */
  snapshot(yawDeg?: number, pitchDeg?: number, time?: number): string;
  mode(): Figure3DMode;
  /** Load (once) and switch to the animated version; the reveal grows from `origin` (stage CSS px), or from the dog. */
  run(origin?: Point): Promise<void>;
  /** Switch between the photo relief and the run cycle. */
  toggle(origin?: Point): Promise<void>;
  /** Back to the photo relief. */
  photo(origin?: Point): Promise<void>;
  /** Stop / restart the render loop (the scene stays as it is). */
  pause(): void;
  resume(): void;
}

export async function mount(figure: HTMLElement, options: Figure3DOptions = {}): Promise<() => void> {
  const canvas = figure.querySelector('canvas');
  const stage = canvas?.parentElement;
  const src = figure.dataset.src;
  const runSrc = figure.dataset.runSrc;
  if (!canvas || !stage || !src) throw new Error('figure3d: missing canvas or data-src');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  // Error checks make the browser wait for every shader to finish compiling on first use; the
  // run cycle's shaders are compiled asynchronously instead, so keep the checks for debugging.
  renderer.debug.checkShaderErrors = new URLSearchParams(location.search).has('figure3d-debug');

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 50);

  // The photo is already lit; these only shade the relief a little.
  const hemisphere = new HemisphereLight(0xffffff, 0xc4beb5, 1.9);
  scene.add(hemisphere);
  const key = new DirectionalLight(0xffffff, 0.7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 5;
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  key.position.set(-0.9, 3.4, 4.2); // mostly from the front, so side-facing rim faces stay quiet
  const shadowCam = key.shadow.camera;
  shadowCam.left = shadowCam.bottom = -2.2;
  shadowCam.right = shadowCam.top = 2.2;
  shadowCam.near = 0.5;
  shadowCam.far = 12;
  shadowCam.updateProjectionMatrix();

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder); // both GLBs are gltfpack-compressed (EXT_meshopt_compression)

  // --- the photo relief ------------------------------------------------------
  const relief = (await loader.loadAsync(src)).scene;
  relief.traverse((node) => {
    if (!(node as Mesh).isMesh) return;
    const mesh = node as Mesh;
    mesh.castShadow = true;
    // The photo is already lit; a specular-free material keeps the steep rim of the relief
    // from catching highlights that the front does not.
    const source = mesh.material as MeshStandardMaterial;
    mesh.material = new MeshLambertMaterial({
      map: source.map,
      alphaTest: 0.5, // the matte is baked into the texture alpha
      side: FrontSide,
    });
    source.dispose();
  });
  const reliefDog: Object3D | undefined = relief.getObjectByName('Dog');
  const reliefDogY = reliefDog?.position.y ?? 0;

  const pivot = new Group();
  scene.add(pivot);
  const ground = new Mesh(new PlaneGeometry(8, 8), new ShadowMaterial({ opacity: 0.16 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const size = new Vector3();
  const center = new Vector3();
  let subject: Object3D | undefined;

  /** Put `object` in the pivot, centred, with the ground under its feet, and frame the camera. */
  const show = (object: Object3D) => {
    if (subject) pivot.remove(subject);
    subject = object;
    object.position.set(0, 0, 0); // measure from the model's own origin, not last time's offset
    object.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(object);
    bounds.getSize(size);
    bounds.getCenter(center);
    object.position.set(-center.x, -center.y, -center.z);
    pivot.add(object);
    ground.position.y = bounds.min.y - center.y - 0.01;
    frame();
  };

  /** Aim `view` at the origin from far enough away that a box of `extent` fills the frame. */
  const placeCamera = (view: PerspectiveCamera, extent: Vector3, aspect: number) => {
    view.aspect = aspect;
    const tanHalf = Math.tan(MathUtils.degToRad(FOV / 2));
    const distForHeight = extent.y / 2 / tanHalf;
    const distForWidth = extent.x / 2 / (tanHalf * aspect);
    const dist = Math.max(distForHeight, distForWidth) * 1.1 + extent.z / 2;
    view.position.set(0, extent.y * 0.02, dist);
    view.lookAt(0, 0, 0);
    view.updateProjectionMatrix();
  };

  const frame = () => {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    placeCamera(camera, size, width / height);
  };
  show(relief);
  const resize = new ResizeObserver(frame);
  resize.observe(stage);

  // --- the run cycle (v2), loaded on demand -------------------------------------
  let mode: Figure3DMode = 'photo';
  let runScene: Object3D | undefined;
  let mixer: AnimationMixer | undefined;
  let runLoad: Promise<void> | undefined;
  let environment: ReturnType<PMREMGenerator['fromScene']> | undefined;
  // --- which way of drawing the run cycle to trust -----------------------------
  // Some drivers (VMware's virtual adapter under Direct3D 11, for one) get GPU skinning, or even
  // plain drawing of a large mesh, wrong and turn the pair into shards. So before the run cycle
  // is shown, what the GPU drew is compared with a CPU rasterisation of the same pose, trying the
  // DRAW_PATHS in turn. If nothing matches, the run cycle is marked unsupported and the figure
  // stays a photo rather than show garbage.
  // `?figure3d-skinning=<path>` forces a path, `?figure3d-debug` shows the measurements and probes.
  const query = new URLSearchParams(location.search);
  const forcedPath = DRAW_PATHS.find((p) => p === query.get('figure3d-skinning'));
  const debug = query.has('figure3d-debug');
  const diagnostics: string[] = [];
  const diag = (line: string) => {
    diagnostics.push(line);
    figure.dispatchEvent(new CustomEvent<string>('figure3d:diagnostic', { bubbles: true, detail: line }));
  };
  const gl = renderer.getContext();
  const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuName = String(rendererInfo ? gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  // Virtual GPUs are not trusted with skinning at all; the CPU path is tried first.
  const virtualGpu = /VMware|SVGA|VirtualBox|VBox|Basic Render|llvmpipe|Software Adapter|Parallels|Hyper-V|QXL|virgl/i.test(gpuName);
  diag(`gpu: ${gpuName}`);
  diag(`webgl: ${gl.getParameter(gl.VERSION)}${virtualGpu ? ' — virtual GPU, skinning not trusted' : ''}`);
  const rememberedPath = (): DrawPath | undefined => {
    try {
      const raw = localStorage.getItem(PATH_MEMORY_KEY);
      if (!raw) return undefined;
      const saved = JSON.parse(raw) as { v?: number; gpu?: string; path?: string; at?: number };
      if (saved.v !== PATH_MEMORY_VERSION || saved.gpu !== gpuName) return undefined;
      if (typeof saved.at !== 'number' || Date.now() - saved.at > PATH_MEMORY_TTL) return undefined;
      return DRAW_PATHS.find((p) => p === saved.path);
    } catch {
      return undefined;
    }
  };
  const rememberPath = (next: DrawPath | undefined) => {
    try {
      if (!next || next === 'gpu') localStorage.removeItem(PATH_MEMORY_KEY);
      else localStorage.setItem(PATH_MEMORY_KEY, JSON.stringify({ v: PATH_MEMORY_VERSION, gpu: gpuName, path: next, at: Date.now() }));
    } catch {
      // storage unavailable: the ladder simply runs again next time
    }
  };
  let cpuSkin: CpuSkinning | undefined;
  let cpuSkinAge = Infinity; // seconds since the CPU pose was last updated
  let path: DrawPath | undefined;
  let recheck = 0; // index into RECHECK_AT
  let nextCheckAt = RECHECK_AT[0];
  let runClock = 0; // seconds of animation since the path was chosen
  let runUnsupported = false;
  let lite = false; // the cpu-lite path freed the environment map and the model's textures for good
  let checkTarget: WebGLRenderTarget | undefined;
  let checkPixels: Uint8Array | undefined;
  let oracle: Uint8Array | undefined;
  const viewProjection = new Matrix4();

  const setMode = (next: Figure3DMode) => {
    mode = next;
    figure.dataset.mode = next;
    options.onMode?.(next);
    figure.dispatchEvent(new CustomEvent<Figure3DMode>('figure3d:mode', { bubbles: true, detail: next }));
  };

  // Download progress of the run cycle, drawn as a thin bar under the figure. `data-run` on the
  // figure is 'loading' while it downloads, 'preparing' while the drawing path is chosen in the
  // background, then 'ready' (or 'failed' / 'unsupported'), which the CSS uses to fade the bar out.
  const progressBar = figure.querySelector<HTMLElement>('[data-figure3d-progress]');
  const setProgress = (event: ProgressEvent) => {
    if (!progressBar) return;
    const known = event.lengthComputable && event.total > 0;
    // A gzip-encoded response reports the compressed total but counts decoded bytes, so clamp.
    const fraction = known ? Math.min(event.loaded / event.total, 1) : 0;
    progressBar.classList.toggle('figure3d__progress--indeterminate', !known);
    progressBar.style.setProperty('--progress', String(fraction));
    if (known) progressBar.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
    else progressBar.removeAttribute('aria-valuenow');
  };

  const loadRun = () => {
    if (!runSrc) return Promise.reject(new Error('figure3d: no data-run-src'));
    if (runLoad) return runLoad;
    figure.dataset.run = 'loading';
    const startedLoading = performance.now();
    diag(`run model: downloading ${runSrc}`);
    runLoad = loader.loadAsync(runSrc, setProgress).then((gltf) => {
      let triangles = 0;
      gltf.scene.traverse((node) => {
        const geometry = (node as Mesh).geometry;
        if ((node as Mesh).isMesh && geometry) triangles += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
      });
      diag(`run model: loaded in ${((performance.now() - startedLoading) / 1000).toFixed(1)} s, ${Math.round(triangles / 1000)}k triangles, clips ${gltf.animations.map((c) => c.name).join(', ') || 'none'}`);
      gltf.scene.traverse((node) => {
        if (!(node as Mesh).isMesh) return;
        node.castShadow = true;
        node.frustumCulled = false; // skinned parts move outside their rest-pose bounds
        const material = (node as Mesh).material as MeshPhysicalMaterial;
        // Blender exports the coat's sheen at full strength; in three.js that white velvet
        // layer turns black fur grey, so keep only a hint of it.
        if (material.isMeshPhysicalMaterial && material.sheen > 0) material.sheen = 0.2;
        // Bone indices arrive as 8-bit integers, a vertex format some drivers (e.g. VMware's
        // virtual GPU) mishandle; plain floats are the most widely supported.
        const geometry = (node as SkinnedMesh).geometry;
        for (const name of ['skinIndex', 'skinWeight']) {
          const attribute = geometry.getAttribute(name) as BufferAttribute | undefined;
          if (!attribute || attribute.array instanceof Float32Array) continue;
          const floats = new Float32Array(attribute.count * 4);
          for (let i = 0; i < attribute.count; i++) {
            for (let c = 0; c < 4; c++) floats[i * 4 + c] = attribute.getComponent(i, c);
          }
          geometry.setAttribute(name, new BufferAttribute(floats, 4));
        }
      });
      mixer = new AnimationMixer(gltf.scene);
      for (const clip of gltf.animations) {
        mixer.clipAction(clip).setLoop(LoopRepeat, Infinity).play();
      }
      runScene = gltf.scene;
      progressBar?.style.setProperty('--progress', '1');
      progressBar?.setAttribute('aria-valuenow', '100');
      figure.dataset.run = 'preparing'; // 'ready' once prepareRun has chosen a drawing path
    });
    runLoad.catch((error: unknown) => {
      figure.dataset.run = 'failed';
      diag(`run model: FAILED ${error instanceof Error ? error.message : String(error)}`);
      runLoad = undefined; // a later click may retry
    });
    return runLoad;
  };

  // --- getting the run cycle ready, in the background --------------------------
  // Everything a click used to do — the environment map, the CPU skinning data, compiling the
  // shaders and finding the drawing path this GPU gets right — now happens once the model has
  // downloaded, in small steps with a pause for the browser between them, on a private staging
  // scene the visitor never sees. Shaders are compiled with compileAsync (KHR_parallel_shader_compile,
  // off the main thread), pixels are read back asynchronously and waits for the GPU use fences, so
  // neither the page nor Chrome's GPU process is held up. A click then only swaps the model in.
  const breathe = () =>
    new Promise<void>((resolve) => {
      if ('requestIdleCallback' in window) requestIdleCallback(() => resolve(), { timeout: 100 });
      else setTimeout(resolve, 0);
    });

  /** Resolve once the GPU has finished everything submitted so far, without blocking (a polled fence). */
  const gpuIdle = () =>
    new Promise<void>((resolve) => {
      const gl2 = gl as WebGL2RenderingContext;
      const sync = gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl2.flush();
      const poll = () => {
        if (sync && gl2.clientWaitSync(sync, 0, 0) === gl2.TIMEOUT_EXPIRED) {
          setTimeout(poll, 4);
          return;
        }
        if (sync) gl2.deleteSync(sync);
        resolve();
      };
      poll();
    });

  // The staging scene has the same kinds of lights (and shadow) and the same environment as the
  // page will have while running, so the shaders compiled for it are exactly the ones needed later.
  const staging = new Scene();
  const stagingCamera = new PerspectiveCamera(FOV, 1, 0.1, 50);
  const stagingHemisphere = new HemisphereLight(0xffffff, 0xc4beb5, 0.5);
  const stagingKey = key.clone();
  // The staging shadow is never seen, and a path that draws garbage fills the whole shadow map
  // with every triangle: at 1024² that costs tens of seconds, at 16² nothing. The shaders are the same.
  stagingKey.shadow.mapSize.set(16, 16);
  staging.add(stagingHemisphere, stagingKey, stagingKey.target);

  /** Put the run cycle on the staging scene, centred, and frame the staging camera on it. */
  const stageRun = () => {
    const object = runScene!;
    object.position.set(0, 0, 0);
    staging.add(object);
    object.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(object);
    const extent = bounds.getSize(new Vector3());
    const middle = bounds.getCenter(new Vector3());
    object.position.set(-middle.x, -middle.y, -middle.z);
    object.updateMatrixWorld(true);
    placeCamera(stagingCamera, extent, (stage.clientWidth || 4) / (stage.clientHeight || 5));
  };

  const physicalPath = (p: DrawPath | undefined) => p === 'gpu' || p === 'cpu';

  const applyPath = (next: DrawPath) => {
    path = next;
    figure.dataset.skinning = next;
    const cpu = next !== 'gpu';
    cpuSkin!.setActive(cpu);
    if (cpu) {
      cpuSkin!.setChunked(next === 'cpu-chunked' || next === 'cpu-lite');
      cpuSkin!.setMaterials(next === 'cpu' ? 'original' : next === 'cpu-lite' ? 'flat' : 'simple');
    }
    if (next === 'cpu-lite' && !lite) {
      lite = true;
      cpuSkin!.disposeTextures();
      scene.environment = null;
      environment?.dispose();
      environment = undefined;
    }
    // Only the PBR materials use the environment map, so it is built when a path first needs it.
    if (physicalPath(next) && !environment && !lite) {
      const pmrem = new PMREMGenerator(renderer);
      environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
      pmrem.dispose();
    }
    staging.environment = physicalPath(next) ? (environment?.texture ?? null) : null;
    staging.environmentIntensity = 0.75;
  };

  /** Lights and environment of the page for the current path (the photo relief uses its own). */
  const runLighting = () => {
    const physical = physicalPath(path);
    scene.environment = physical ? (environment?.texture ?? null) : null;
    scene.environmentIntensity = 0.75;
    hemisphere.intensity = physical ? 0.5 : 1.4; // Lambert materials get no environment light
    key.intensity = 1.6;
  };

  const ensureCheckTarget = (aspect: number) => {
    const W = CHECK_WIDTH;
    const H = Math.max(8, Math.round(W / aspect));
    if (!checkTarget || checkTarget.width !== W || checkTarget.height !== H) {
      checkTarget?.dispose();
      checkTarget = new WebGLRenderTarget(W, H);
      checkPixels = new Uint8Array(W * H * 4);
      oracle = new Uint8Array(W * H);
    }
    return checkTarget;
  };

  /** Compile, without blocking, every shader `where` needs: for the off-screen checks and for the page. */
  const compileFor = async (where: Scene, view: PerspectiveCamera) => {
    const target = ensureCheckTarget(view.aspect);
    renderer.setRenderTarget(target); // off-screen draws use a different output colour space…
    const offscreen = renderer.compileAsync(where, view);
    renderer.setRenderTarget(null); // …from the canvas
    const onscreen = renderer.compileAsync(where, view);
    await Promise.all([offscreen, onscreen]);
  };

  /** Draw `where` into the small off-screen target (the page's ground hidden). */
  const renderOffscreen = (where: Scene, view: PerspectiveCamera) => {
    const target = ensureCheckTarget(view.aspect);
    const groundVisible = ground.visible;
    const clearAlpha = renderer.getClearAlpha();
    ground.visible = false;
    renderer.setClearAlpha(0);
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(where, view);
    renderer.setRenderTarget(null);
    renderer.setClearAlpha(clearAlpha);
    ground.visible = groundVisible;
  };

  /**
   * Hand the GPU everything the current path draws in a safe order: textures first, then a wait
   * for the GPU, then (optionally) the geometry again on its own, then another wait. VMware's
   * virtual GPU scrambles a vertex buffer when a large texture upload follows it before the GPU
   * has consumed it, which is exactly what a first draw of a textured model does. The waits are
   * fences polled from timers, so nothing blocks while the GPU catches up.
   */
  const settleUploads = async (where: Scene, view: PerspectiveCamera, reuploadGeometry: boolean) => {
    const textures = new Set<Texture>();
    const meshes: Mesh[] = [];
    runScene!.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh || !mesh.visible) return;
      meshes.push(mesh);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        for (const value of Object.values(material)) if ((value as Texture)?.isTexture) textures.add(value as Texture);
      }
    });
    for (const texture of textures) renderer.initTexture(texture);
    await gpuIdle();
    renderOffscreen(where, view); // uploads the geometry (possibly scrambled by the above)
    await gpuIdle();
    if (!reuploadGeometry) return;
    for (const mesh of meshes) {
      const geometry = mesh.geometry;
      for (const attribute of Object.values(geometry.attributes)) (attribute as BufferAttribute).needsUpdate = true;
      if (geometry.index) geometry.index.needsUpdate = true;
    }
    renderOffscreen(where, view); // geometry goes up again with nothing else in flight
    await gpuIdle();
  };

  /**
   * Draw `where` off screen and compare the model's silhouette with the CPU rasterisation of the
   * same pose. Returns their intersection over union (1 = identical). The CPU side is rasterised
   * right after the draw, while the pose still matches; the pixels arrive asynchronously.
   */
  const silhouetteMatch = async (where: Scene, view: PerspectiveCamera): Promise<number> => {
    cpuSkin!.update();
    cpuSkinAge = 0;
    renderOffscreen(where, view);
    const target = checkTarget!;
    const W = target.width;
    const H = target.height;
    view.updateMatrixWorld();
    runScene!.updateMatrixWorld(true);
    viewProjection.multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse).multiply(runScene!.matrixWorld);
    cpuSkin!.silhouette(viewProjection, W, H, oracle!);
    await renderer.readRenderTargetPixelsAsync(target, 0, 0, W, H, checkPixels!);
    let both = 0;
    let either = 0;
    for (let i = 0; i < W * H; i++) {
      const drawn = checkPixels![i * 4 + 3] > 127 ? 1 : 0;
      const expected = oracle![i];
      if (drawn & expected) both++;
      if (drawn | expected) either++;
    }
    return either ? both / either : 0;
  };

  const percent = (iou: number) => `${(iou * 100).toFixed(0)}%`;

  let rungDeadline = Infinity; // performance.now() by which the current measurePath must be done
  const outOfTime = () => performance.now() > rungDeadline;

  /** Set up a path, compile, upload safely, measure; on a miss, re-upload once more and measure again. */
  const measurePath = async (next: DrawPath, where: Scene, view: PerspectiveCamera): Promise<number> => {
    await gpuIdle(); // applyPath may upload textures (pieces' colours, the environment map): nothing else may be in flight
    applyPath(next);
    await breathe(); // building pieces or the environment map may have taken a moment
    const t0 = performance.now();
    rungDeadline = t0 + RUNG_BUDGET_MS;
    const timedOut = (score: number) => {
      diag(`${next}: ran out of time after ${RUNG_BUDGET_MS / 1000} s (${percent(score)} so far), counted as FAIL`);
      rungDeadline = Infinity;
      return score;
    };
    await compileFor(where, view);
    await settleUploads(where, view, true);
    if (outOfTime()) return timedOut(0);
    const first = await silhouetteMatch(where, view);
    if (first >= MATCH) {
      rungDeadline = Infinity;
      diag(`${next}: silhouette match ${percent(first)} ok (${(performance.now() - t0).toFixed(0)} ms)`);
      return first;
    }
    if (outOfTime()) return timedOut(first);
    await settleUploads(where, view, true);
    if (outOfTime()) return timedOut(first);
    const second = await silhouetteMatch(where, view);
    rungDeadline = Infinity;
    diag(
      `${next}: silhouette match ${percent(first)}, after re-upload ${percent(second)} ${second >= MATCH ? 'ok' : 'FAIL'} (${(performance.now() - t0).toFixed(0)} ms)`,
    );
    return second;
  };

  /** Try the drawing paths from index `from` and keep the first whose silhouette matches. */
  const choosePath = async (from: number, where: Scene, view: PerspectiveCamera): Promise<boolean> => {
    let chosen: number | undefined;
    for (let i = from; i < DRAW_PATHS.length; i++) {
      const ok = (await measurePath(DRAW_PATHS[i], where, view)) >= MATCH;
      if (ok) {
        chosen ??= i;
        if (!debug) break; // with the overlay on, measure every path for the record
      }
      await breathe();
    }
    if (chosen === undefined) return false;
    if (DRAW_PATHS[chosen] !== path) {
      applyPath(DRAW_PATHS[chosen]);
      await compileFor(where, view);
      await settleUploads(where, view, true);
    }
    rememberPath(DRAW_PATHS[chosen]);
    recheck = 0;
    nextCheckAt = RECHECK_AT[0];
    runClock = 0;
    return true;
  };

  const showPhoto = () => {
    scene.environment = null;
    hemisphere.intensity = 1.9;
    key.intensity = 0.7;
    show(relief);
    setMode('photo');
  };

  /** Nothing drew the run cycle correctly: stay with the photo and say so. */
  const giveUp = () => {
    if (runUnsupported) return; // both the preload and a click may learn the verdict
    runUnsupported = true;
    cancelAutoRun();
    figure.dataset.run = 'unsupported';
    figure.dataset.skinning = 'none';
    rememberPath(undefined); // let the next visit try again from the top
    diag('no drawing path matched: the run cycle is unavailable on this device');
    console.warn(`figure3d: ${gpuName} draws the run cycle wrong in every mode; keeping the photo.`);
    if (subject === runScene) void switchTo('photo', undefined, true); // a re-check failed while it ran
    else showPhoto();
  };

  /** Load the model and pick and warm up its drawing path; resolves false if no path draws it right. */
  let preparing: Promise<boolean> | undefined;
  const prepareRun = () => {
    preparing ??= (async () => {
      await loadRun();
      const started = performance.now();
      await breathe();
      await gpuIdle(); // the page's own uploads are consumed before any of ours begin
      // Allocate the staging scene's render targets (its shadow map, the check target) before any
      // model geometry goes up: a large allocation right after a vertex upload is exactly what
      // VMware's driver mishandles, and the first draw of the model would otherwise do both.
      stagingCamera.aspect = (stage.clientWidth || 4) / (stage.clientHeight || 5);
      stagingCamera.updateProjectionMatrix();
      renderOffscreen(staging, stagingCamera);
      await gpuIdle();
      stageRun();
      await breathe();
      cpuSkin ??= cpuSkinning(runScene!);
      await breathe();
      let ok: boolean;
      if (forcedPath) {
        await measurePath(forcedPath, staging, stagingCamera);
        diag(`(${forcedPath} forced)`);
        ok = true;
      } else {
        const remembered = rememberedPath();
        if (remembered) diag(`remembered from last visit: ${remembered}`);
        ok = await choosePath(Math.max(virtualGpu ? 1 : 0, remembered ? DRAW_PATHS.indexOf(remembered) : 0), staging, stagingCamera);
      }
      stagingKey.shadow.dispose(); // the staging shadow map is no longer needed
      diag(`prepared in ${((performance.now() - started) / 1000).toFixed(1)} s, in the background`);
      if (ok) console.info(`figure3d: drawing the run cycle with ${path} skinning on ${gpuName}`);
      if (debug) {
        const { runProbes } = await import('./figure3d-debug');
        for (const line of runProbes(renderer, camera)) diag(line);
      }
      if (ok) figure.dataset.run = 'ready'; // (a device that draws nothing right becomes 'unsupported' in giveUp)
      return ok;
    })();
    preparing.catch(() => {
      figure.dataset.run = 'failed';
      preparing = undefined; // a later click may retry
    });
    return preparing;
  };

  /** Periodic re-verification while running; steps down to the next path if the current one has gone wrong. */
  let checking = false;
  const verifyPath = async () => {
    if (checking) return;
    checking = true;
    const stillShown = () => subject === runScene && mode === 'running';
    try {
      const iou = await silhouetteMatch(scene, camera);
      if (!stillShown()) return;
      if (iou >= MATCH) {
        diag(`re-check at ${runClock.toFixed(0)}s: ${path} ${percent(iou)} ok`);
        return;
      }
      // A stray upload may have scrambled a buffer since; a clean re-upload usually puts it right.
      await settleUploads(scene, camera, true);
      const again = await silhouetteMatch(scene, camera);
      if (!stillShown()) return;
      diag(`re-check at ${runClock.toFixed(0)}s: ${path} ${percent(iou)}, after re-upload ${percent(again)} ${again >= MATCH ? 'ok' : 'FAIL'}`);
      if (again >= MATCH) return;
      if (await choosePath(DRAW_PATHS.indexOf(path!) + 1, scene, camera)) runLighting();
      else giveUp();
    } finally {
      checking = false;
    }
  };

  // --- switching between the photo and the run cycle ------------------------------------
  // Both ways go through the ink-bleed veil (figure3d-veil.ts), whose photo layer is the poster:
  // the photo relief rendered at rest. Going to the run cycle, the relief first settles to rest
  // (so the poster matches it), the poster covers the stage, the scene switches underneath and the
  // ink washes the photo away from where the visitor clicked (from the dog when nobody did). Coming
  // back, the photo bleeds in over the running pair, and the relief, at rest, replaces it.
  const veil = createVeil(
    stage,
    figure.querySelector<HTMLImageElement>('.figure3d__poster'),
    figure.querySelector<HTMLCanvasElement>('.figure3d__veil'),
  );
  let transitioning = false;
  let holdStill = false; // the relief eases to rest and stops swaying (to match the poster)
  const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

  /** Where the dog is on the stage right now, in CSS pixels. */
  const dogPoint = (): Point => {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const dog = subject?.getObjectByName(subject === relief ? 'Dog' : 'Dog_SkinnedMesh');
    const box = dog ? new Box3().setFromObject(dog) : undefined;
    if (!box || box.isEmpty()) return { x: width / 2, y: height * 0.6 };
    const p = box.getCenter(new Vector3()).project(camera);
    return { x: ((p.x + 1) / 2) * width, y: ((1 - p.y) / 2) * height };
  };

  /** Show the photo relief or the run cycle; behind the veil whenever the figure is being drawn. */
  const switchTo = async (next: 'photo' | 'running', origin?: Point, fade = reduceMotion) => {
    const swap = () => {
      if (next === 'photo') {
        showPhoto();
        return;
      }
      runLighting();
      show(runScene!);
      lastTick = performance.now();
      setMode('running');
    };
    if (!running) {
      swap(); // off screen: there is nothing to see
      return;
    }
    transitioning = true;
    const from = origin ?? dogPoint();
    try {
      if (next === 'running') {
        holdStill = true;
        for (const began = performance.now(); performance.now() - began < 300; await nextFrame()) {
          if (Math.abs(yaw) < 0.4 && Math.abs(pitch) < 0.4) break;
        }
        veil.cover();
        swap();
        holdStill = false;
        yaw = pitch = 0; // the run cycle starts square to the viewer and eases toward the pointer
        await nextFrame();
        await nextFrame(); // its first frame (slow on software GL) is drawn before the ink moves
        await veil.open(from, fade);
      } else {
        await veil.close(from, fade);
        holdStill = true;
        swap();
        yaw = pitch = 0;
        await nextFrame();
        await nextFrame(); // the relief has been drawn under the veil
        veil.hide();
      }
    } finally {
      holdStill = false;
      transitioning = false;
    }
  };

  const run = async (origin?: Point) => {
    if (mode !== 'photo' || runUnsupported || transitioning) return;
    cancelAutoRun();
    setMode('loading'); // until the model has loaded and a drawing path has been chosen
    let ok: boolean;
    try {
      ok = await prepareRun();
    } catch (error) {
      setMode('photo');
      throw error;
    }
    if (!ok) {
      giveUp();
      return;
    }
    await switchTo('running', origin);
  };
  const photo = async (origin?: Point) => {
    if (mode !== 'running' || transitioning) return;
    cancelAutoRun();
    await switchTo('photo', origin);
  };
  const toggle = async (origin?: Point) => {
    if (mode === 'running') await photo(origin);
    else if (mode === 'photo') await run(origin);
  };

  // --- the photo comes alive by itself, once ----------------------------------------------
  // When the run cycle is ready and the figure has been well in view for a moment, the photo turns
  // into it without a click. Once per page view: after a click back to the photo, the photo stays.
  // Not with prefers-reduced-motion (a click still works), and never in the middle of a drag.
  let autoRun = !reduceMotion && !debug; // debug mode starts the run cycle at once instead
  let wellInView = false;
  let autoTimer = 0;
  const autoRunDue = () =>
    autoRun && mode === 'photo' && !transitioning && !runUnsupported && figure.dataset.run === 'ready' && wellInView && !document.hidden;
  const armAutoRun = (delay = AUTO_RUN_AFTER_MS) => {
    window.clearTimeout(autoTimer);
    if (!autoRunDue()) return;
    autoTimer = window.setTimeout(() => {
      if (!autoRunDue() || dragging) return; // letting go of the drag arms it again
      void run().catch((error) => console.warn('figure3d: run cycle failed', error));
    }, delay);
  };
  function cancelAutoRun() {
    autoRun = false;
    window.clearTimeout(autoTimer);
  }

  // --- pointer -------------------------------------------------------------
  let hoverYaw = 0;
  let hoverPitch = 0;
  let hovering = false;
  let dragging = false;
  let dragYaw = 0;
  let dragPitch = 0;
  let lastX = 0;
  let lastY = 0;
  let downX = 0;
  let downY = 0;
  let moved = 0;
  let yaw = 0;
  let pitch = 0;

  const onMove = (event: PointerEvent) => {
    if (dragging) {
      moved += Math.abs(event.clientX - lastX) + Math.abs(event.clientY - lastY);
      dragYaw = MathUtils.clamp(dragYaw + (event.clientX - lastX) * DRAG_SPEED, -DRAG_YAW, DRAG_YAW);
      dragPitch = MathUtils.clamp(dragPitch + (event.clientY - lastY) * DRAG_SPEED * 0.6, -DRAG_PITCH, DRAG_PITCH);
      lastX = event.clientX;
      lastY = event.clientY;
      return;
    }
    if (event.pointerType !== 'mouse') return;
    const rect = stage.getBoundingClientRect();
    hoverYaw = ((event.clientX - rect.left) / rect.width - 0.5) * 2 * HOVER_YAW;
    hoverPitch = ((event.clientY - rect.top) / rect.height - 0.5) * 2 * HOVER_PITCH;
    hovering = true;
  };
  const onDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    dragging = true;
    moved = 0;
    downX = lastX = event.clientX;
    downY = lastY = event.clientY;
    stage.setPointerCapture(event.pointerId);
    figure.classList.add('figure3d--touched');
  };
  const onUp = (event: PointerEvent) => {
    const wasDragging = dragging;
    dragging = false;
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    const isTap =
      wasDragging && moved <= TAP_SLOP && Math.abs(event.clientX - downX) <= TAP_SLOP && Math.abs(event.clientY - downY) <= TAP_SLOP;
    if (isTap && event.type === 'pointerup') {
      const rect = stage.getBoundingClientRect();
      void toggle({ x: event.clientX - rect.left, y: event.clientY - rect.top }).catch((error) =>
        console.warn('figure3d: run cycle failed', error),
      );
    } else if (wasDragging) {
      armAutoRun(AUTO_RUN_AFTER_DRAG_MS);
    }
  };
  const onLeave = () => {
    hovering = false;
  };
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);
  stage.addEventListener('pointerleave', onLeave);

  // --- loop ----------------------------------------------------------------
  let running = false;
  let handle = 0;
  let ready = false;
  let startedAt = 0;
  let pausedAt = 0;
  let lastTick = 0;
  let lastDraw = 0;

  const tick = () => {
    if (!running) return;
    const now = performance.now();
    // The run cycle is by far the heavier scene, and every visitor now sees it: draw it at the
    // clip's own 30 fps unless the pointer is turning the figure.
    if (mode === 'running' && !dragging && !hovering && now - lastDraw < RUN_FRAME_MS) {
      handle = requestAnimationFrame(tick);
      return;
    }
    lastDraw = now;
    const t = (now - startedAt) / 1000;
    const dt = Math.min((now - lastTick) / 1000, 0.05);
    lastTick = now;
    const frames = dt * 60; // the easing below is tuned per 60 Hz frame
    const idleYaw = reduceMotion ? 0 : Math.sin(t * 0.45) * 3;
    const idlePitch = reduceMotion ? 0 : Math.sin(t * 0.3 + 1) * 1;
    if (!dragging) {
      const settle = Math.pow(0.96, frames); // ease back home after a drag
      dragYaw *= settle;
      dragPitch *= settle;
    }
    const targetYaw = holdStill ? 0 : (hovering ? hoverYaw : 0) + dragYaw + idleYaw;
    const targetPitch = holdStill ? 0 : (hovering ? hoverPitch : 0) + dragPitch + idlePitch;
    const follow = 1 - Math.pow(1 - (holdStill ? 0.3 : 0.08), frames);
    yaw = MathUtils.lerp(yaw, targetYaw, follow);
    pitch = MathUtils.lerp(pitch, targetPitch, follow);
    pivot.rotation.set(MathUtils.degToRad(pitch), MathUtils.degToRad(yaw), 0);
    if (mode === 'running' && mixer) {
      mixer.update(dt);
      // The clip is sampled at 30 fps, so a CPU pose more often than that would be wasted work.
      cpuSkinAge += dt;
      if (cpuSkin && path !== 'gpu' && cpuSkinAge >= 1 / 30) {
        cpuSkin.update();
        cpuSkinAge = 0;
      }
      runClock += dt;
      if (!checking && runClock >= nextCheckAt) {
        recheck++;
        nextCheckAt = recheck < RECHECK_AT.length ? RECHECK_AT[recheck] : runClock + RECHECK_EVERY;
        void verifyPath().catch((error) => console.warn('figure3d: re-check failed', error));
      }
    }
    if (subject === relief && reliefDog && !reduceMotion) {
      // A running dog does not hold still, even in a photo (except to match the poster).
      const bob = holdStill ? 0 : Math.sin(t * 2.4);
      reliefDog.position.y = reliefDogY + Math.abs(bob) * 0.012;
      reliefDog.rotation.x = bob * 0.012;
    }
    renderer.render(scene, camera);
    if (!ready) {
      ready = true;
      figure.classList.add('figure3d--ready');
      options.onReady?.();
      figure.dispatchEvent(new CustomEvent<Figure3DApi>('figure3d:ready', { bubbles: true, detail: api }));
      // Fetch the run cycle in the background once the relief is up, so a click plays it at once.
      const preload = () =>
        void prepareRun()
          .then((ok) => {
            if (!ok) {
              giveUp();
              return;
            }
            void veil.warm(); // decode the poster and size the transition's canvases now, not mid-switch
            if (debug && mode === 'photo') return run(); // debug mode: start at once
            armAutoRun();
          })
          .catch((error) => console.warn('figure3d: run cycle failed to load', error));
      if ('requestIdleCallback' in window) requestIdleCallback(preload, { timeout: 2000 });
      else setTimeout(preload, 300);
    }
    handle = requestAnimationFrame(tick);
  };
  const start = () => {
    if (running) return;
    running = true;
    startedAt += pausedAt ? performance.now() - pausedAt : performance.now();
    pausedAt = 0;
    lastTick = performance.now();
    handle = requestAnimationFrame(tick);
  };
  const stop = () => {
    if (running) pausedAt = performance.now();
    running = false;
    cancelAnimationFrame(handle);
  };

  const api: Figure3DApi = {
    snapshot(yawDeg = 0, pitchDeg = 0, time) {
      const wasRunning = running;
      stop();
      pivot.rotation.set(MathUtils.degToRad(pitchDeg), MathUtils.degToRad(yawDeg), 0);
      if (reliefDog) {
        reliefDog.position.y = reliefDogY;
        reliefDog.rotation.x = 0;
      }
      if (mixer && time !== undefined) {
        mixer.setTime(time);
        cpuSkin?.update();
      }
      renderer.render(scene, camera);
      const url = canvas.toDataURL('image/png');
      if (wasRunning) start();
      return url;
    },
    mode: () => mode,
    run,
    toggle,
    photo,
    pause: () => stop(),
    resume: () => start(),
  };

  // Draw only while some of the figure is on screen; "well in view" (half of it) also arms the
  // automatic switch to the run cycle.
  const visibility = new IntersectionObserver(
    (entries) => {
      const entry = entries[entries.length - 1];
      if (entry.isIntersecting) start();
      else stop();
      wellInView = entry.intersectionRatio >= 0.5;
      if (wellInView) armAutoRun();
      else window.clearTimeout(autoTimer);
    },
    { threshold: [0.05, 0.5] },
  );
  visibility.observe(figure);
  const onVisibility = () => {
    if (document.hidden) {
      stop();
      return;
    }
    if (visibility.takeRecords().length === 0) start();
    armAutoRun();
  };
  document.addEventListener('visibilitychange', onVisibility);

  // The keyboard equivalent of clicking the figure (visually hidden until focused).
  const controls = Array.from(figure.querySelectorAll<HTMLButtonElement>('[data-figure3d-action="toggle"]'));
  const onControl = () => void toggle().catch((error) => console.warn('figure3d: run cycle failed', error));
  for (const control of controls) control.addEventListener('click', onControl);
  setMode('photo');

  let detachDebug: (() => void) | undefined;
  if (debug) {
    void import('./figure3d-debug').then(({ attachDebug }) => {
      detachDebug = attachDebug(figure, () => diagnostics);
    });
  }

  return () => {
    stop();
    window.clearTimeout(autoTimer);
    visibility.disconnect();
    resize.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    stage.removeEventListener('pointermove', onMove);
    stage.removeEventListener('pointerdown', onDown);
    stage.removeEventListener('pointerup', onUp);
    stage.removeEventListener('pointercancel', onUp);
    stage.removeEventListener('pointerleave', onLeave);
    for (const control of controls) control.removeEventListener('click', onControl);
    detachDebug?.();
    stagingKey.shadow.dispose();
    checkTarget?.dispose();
    cpuSkin?.dispose();
    environment?.dispose();
    renderer.dispose();
  };
}
