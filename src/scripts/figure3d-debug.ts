// Diagnostics for Fig. 1, loaded only with `?figure3d-debug` in the URL.
//
// `attachDebug` overlays the GPU name, the run model's download, which drawing path the viewer
// chose and how each candidate's silhouette compared with the CPU rasterisation. `runProbes` draws
// a few synthetic meshes that isolate what a broken driver might trip on (one big mesh, 32-bit
// indices, many draws, dynamic re-upload, lots of texture memory) and scores each the same way,
// so a screenshot from a problem machine says which stage goes wrong. In debug mode the viewer
// also starts the run cycle by itself once the model has downloaded, so no click is needed.
import {
  DataTexture,
  DynamicDrawUsage,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type PerspectiveCamera,
  Scene,
  SphereGeometry,
  TorusKnotGeometry,
  type BufferAttribute,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { rasterizeTriangles } from './cpu-skinning';

export function attachDebug(figure: HTMLElement, lines: () => string[]): () => void {
  const pre = document.createElement('pre');
  pre.className = 'figure3d__debug';
  const render = () => {
    const progress = figure.querySelector('[data-figure3d-progress]')?.getAttribute('aria-valuenow');
    const run = figure.dataset.run ?? '-';
    pre.textContent = [
      `mode ${figure.dataset.mode ?? '-'} · run ${run}${run === 'loading' && progress ? ` ${progress}%` : ''} · skinning ${figure.dataset.skinning ?? '-'}`,
      ...lines(),
    ].join('\n');
  };
  figure.querySelector('.figure3d__stage')?.appendChild(pre);
  figure.addEventListener('figure3d:diagnostic', render);
  const attributes = new MutationObserver(render);
  attributes.observe(figure, { attributes: true, attributeFilter: ['data-mode', 'data-run', 'data-skinning'] });
  const progressElement = figure.querySelector('[data-figure3d-progress]');
  if (progressElement) attributes.observe(progressElement, { attributes: true, attributeFilter: ['aria-valuenow'] });
  render();
  return () => {
    figure.removeEventListener('figure3d:diagnostic', render);
    attributes.disconnect();
    pre.remove();
  };
}

/**
 * Draw synthetic test meshes with the viewer's camera and score each against the CPU
 * rasterisation. Returns one line per probe. Everything created here is disposed again.
 */
export function runProbes(renderer: WebGLRenderer, camera: PerspectiveCamera, width = 128): string[] {
  const height = Math.max(8, Math.round(width / camera.aspect));
  const target = new WebGLRenderTarget(width, height);
  const pixels = new Uint8Array(width * height * 4);
  const expected = new Uint8Array(width * height);
  const matrix = new Matrix4();
  const lines: string[] = [];
  const clearAlpha = renderer.getClearAlpha();
  const previousTarget = renderer.getRenderTarget();
  camera.updateMatrixWorld();

  const score = (scene: Scene, meshes: Mesh[]): number => {
    renderer.setClearAlpha(0);
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    renderer.setRenderTarget(previousTarget);
    renderer.setClearAlpha(clearAlpha);
    expected.fill(0);
    for (const mesh of meshes) {
      mesh.updateMatrixWorld(true);
      matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(mesh.matrixWorld);
      const position = mesh.geometry.getAttribute('position') as BufferAttribute;
      rasterizeTriangles(position.array, mesh.geometry.index?.array ?? null, matrix, width, height, expected);
    }
    let both = 0;
    let either = 0;
    for (let i = 0; i < width * height; i++) {
      const drawn = pixels[i * 4 + 3] > 127 ? 1 : 0;
      if (drawn & expected[i]) both++;
      if (drawn | expected[i]) either++;
    }
    return either ? both / either : 0;
  };

  const probe = (name: string, build: (scene: Scene) => Mesh[], before?: (scene: Scene, meshes: Mesh[]) => void) => {
    const scene = new Scene();
    let meshes: Mesh[] = [];
    try {
      meshes = build(scene);
      scene.add(...meshes);
      before?.(scene, meshes);
      const iou = score(scene, meshes);
      lines.push(`probe ${name}: ${(iou * 100).toFixed(0)}% ${iou >= 0.93 ? 'ok' : 'FAIL'}`);
    } catch (error) {
      lines.push(`probe ${name}: threw ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        const material = mesh.material as MeshBasicMaterial;
        material.map?.dispose();
        material.dispose();
      }
    }
  };

  const white = () => new MeshBasicMaterial({ color: 0xffffff });
  const sphere = (radius: number, segments: number) => new Mesh(new SphereGeometry(radius, segments, segments), white());
  // A torus knot has holes in its outline, so scrambled indices or vertices change the silhouette
  // (on a convex sphere they would not). 800×80 segments → 64,881 vertices, 16-bit indices;
  // 1000×80 → 81,081 vertices, 32-bit indices. Either way ~0.8–1 MB per attribute.
  const knot = (tubular: number) => new Mesh(new TorusKnotGeometry(0.5, 0.1, tubular, 80), white());
  const expectIndex = (mesh: Mesh, type: typeof Uint16Array | typeof Uint32Array) => {
    const index = mesh.geometry.index!.array;
    if (!(index instanceof type)) lines.push(`  (index is ${index.constructor.name}, not ${type.name})`);
    return mesh;
  };

  probe('one mesh, 128k triangles, 16-bit index', () => [expectIndex(knot(800), Uint16Array)]);
  probe('one mesh, 160k triangles, 32-bit index', () => [expectIndex(knot(1000), Uint32Array)]);
  // Many small draws (24 meshes, 4k vertices each).
  probe('24 meshes, 8k triangles each', () => {
    const meshes: Mesh[] = [];
    for (let i = 0; i < 24; i++) {
      const mesh = sphere(0.11, 64);
      mesh.position.set(((i % 6) - 2.5) * 0.3, (Math.floor(i / 6) - 1.5) * 0.4, 0);
      meshes.push(mesh);
    }
    return meshes;
  });
  // A dynamic buffer that is uploaded, then rewritten and re-uploaded (the CPU paths do this every pose).
  probe(
    'dynamic re-upload, 128k triangles',
    () => {
      const mesh = knot(800);
      (mesh.geometry.getAttribute('position') as BufferAttribute).setUsage(DynamicDrawUsage);
      return [mesh];
    },
    (scene, [mesh]) => {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera); // first upload
      renderer.setRenderTarget(previousTarget);
      const position = mesh.geometry.getAttribute('position') as BufferAttribute;
      const array = position.array as Float32Array;
      for (let i = 0; i < array.length; i++) array[i] *= 0.9; // a new pose
      position.needsUpdate = true;
    },
  );
  // Texture memory: 16 mipmapped 512² RGBA textures (~22 MB), as the run model uses.
  probe('16 textures of 512², 128k triangles', () => {
    const mesh = knot(800);
    const textures: DataTexture[] = [];
    for (let i = 0; i < 16; i++) {
      const data = new Uint8Array(512 * 512 * 4);
      for (let p = 0; p < data.length; p += 4) {
        data[p] = (p >> 2) & 255;
        data[p + 1] = i * 16;
        data[p + 2] = 128;
        data[p + 3] = 255;
      }
      const texture = new DataTexture(data, 512, 512);
      texture.generateMipmaps = true;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.needsUpdate = true;
      textures.push(texture);
      renderer.initTexture(texture); // upload them all now
    }
    (mesh.material as MeshBasicMaterial).map = textures[15];
    (mesh.material as MeshBasicMaterial).needsUpdate = true;
    // The other 15 are only there to occupy memory; dispose them after the draw.
    queueMicrotask(() => textures.slice(0, 15).forEach((t) => t.dispose()));
    return [mesh];
  });

  target.dispose();
  return lines;
}
