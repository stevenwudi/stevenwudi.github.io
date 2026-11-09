// Skinning on the CPU, for GPUs whose drivers get vertex skinning — or even plain drawing of a
// large mesh — wrong (seen with VMware's virtual SVGA adapter under ANGLE/Direct3D 11: the
// animated pair turned into black shards).
//
// Each SkinnedMesh under `root` gets a plain Mesh twin that shares its materials, UVs and index;
// `update()` moves the twin's vertices to the current pose. Vertices are kept in `root`'s local
// space, so turning or moving `root` (or its parents) needs no update — only a new animation pose
// does. Tangents are not skinned; normal maps fall back to the screen-space tangent frame three.js
// derives when a geometry has no tangent attribute.
//
// For drivers that mishandle big buffers or 32-bit indices, `setChunked(true)` draws the twins as
// pieces of at most CHUNK_VERTICES vertices each (16-bit indices, buffers under 200 KB), and
// `setMaterials('flat')` replaces the materials by one average colour each, so no texture is needed.
//
// `silhouette()` rasterises the current pose on the CPU, which gives the viewer a GPU-independent
// picture of what the model should look like, to compare against what the GPU actually drew.
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  type Material,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  type MeshStandardMaterial,
  type Object3D,
  type SkinnedMesh,
  SRGBColorSpace,
  type Texture,
} from 'three';

export const CHUNK_VERTICES = 16384;

interface Chunk {
  mesh: Mesh;
  map: Uint32Array; // chunk vertex → original vertex
}

interface Part {
  mesh: SkinnedMesh;
  proxy: Mesh;
  basePosition: Float32Array;
  baseNormal: Float32Array | undefined;
  joints: Float32Array;
  weights: Float32Array;
  matrices: Float32Array; // one 4×4 (column-major) per bone: rootInverse · bone · boneInverse · bind
  original: Material | Material[];
  simple: Material | Material[] | undefined;
  flat: Material | Material[] | undefined;
  chunks: Chunk[] | undefined;
  scratch: RasterScratch | undefined;
}

export type CpuSkinningMaterials = 'original' | 'simple' | 'flat';

export interface CpuSkinning {
  /** Pose the twin meshes from the skeletons' current bone transforms. */
  update(): void;
  /** Draw the CPU-skinned twins instead of the GPU-skinned meshes (or the reverse). */
  setActive(active: boolean): void;
  /** The model's own materials, flat Lambert copies (colour and texture), or one average colour each. */
  setMaterials(kind: CpuSkinningMaterials): void;
  /** Draw the twins as pieces of at most CHUNK_VERTICES vertices (16-bit indices, small buffers). */
  setChunked(chunked: boolean): void;
  /** Free every texture the model's materials reference (for GPUs short of memory; use with 'flat'). */
  disposeTextures(): void;
  /**
   * Rasterise the current pose into a width×height coverage mask (1 = covered), row 0 at the
   * bottom like WebGL's readPixels. `matrix` is projection · view · root.matrixWorld.
   */
  silhouette(matrix: Matrix4, width: number, height: number, out?: Uint8Array): Uint8Array;
  dispose(): void;
}

export interface RasterScratch {
  screen: Float32Array;
  inFront: Uint8Array;
}

/**
 * Rasterise indexed triangles into `out` (ORed in; the caller clears it). A pixel is covered when
 * its centre is inside a triangle, the same rule the GPU uses. Row 0 is the bottom row.
 */
export function rasterizeTriangles(
  positions: ArrayLike<number>,
  index: ArrayLike<number> | null,
  matrix: Matrix4,
  width: number,
  height: number,
  out: Uint8Array,
  scratch?: RasterScratch,
): void {
  const e = matrix.elements;
  const count = positions.length / 3;
  const screen = scratch?.screen.length === count * 2 ? scratch.screen : new Float32Array(count * 2);
  const inFront = scratch?.inFront.length === count ? scratch.inFront : new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const w = e[3] * x + e[7] * y + e[11] * z + e[15];
    inFront[i] = w > 1e-6 ? 1 : 0;
    if (!inFront[i]) continue;
    screen[i * 2] = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / w + 1) * 0.5 * width;
    screen[i * 2 + 1] = ((e[1] * x + e[5] * y + e[9] * z + e[13]) / w + 1) * 0.5 * height;
  }
  const triangles = index ? index.length / 3 : count / 3;
  for (let t = 0; t < triangles; t++) {
    const a = index ? index[t * 3] : t * 3;
    const b = index ? index[t * 3 + 1] : t * 3 + 1;
    const c = index ? index[t * 3 + 2] : t * 3 + 2;
    if (!(inFront[a] && inFront[b] && inFront[c])) continue;
    const ax = screen[a * 2];
    const ay = screen[a * 2 + 1];
    const bx = screen[b * 2];
    const by = screen[b * 2 + 1];
    const cx = screen[c * 2];
    const cy = screen[c * 2 + 1];
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (area === 0) continue;
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)));
    if (minX > maxX || minY > maxY) continue;
    const sign = area > 0 ? 1 : -1;
    for (let py = minY; py <= maxY; py++) {
      const yc = py + 0.5;
      for (let px = minX; px <= maxX; px++) {
        const xc = px + 0.5;
        if (
          ((bx - ax) * (yc - ay) - (by - ay) * (xc - ax)) * sign >= 0 &&
          ((cx - bx) * (yc - by) - (cy - by) * (xc - bx)) * sign >= 0 &&
          ((ax - cx) * (yc - cy) - (ay - cy) * (xc - cx)) * sign >= 0
        ) {
          out[py * width + px] = 1;
        }
      }
    }
  }
}

/** Copy a 4-wide attribute (any storage, normalized or not) into a Float32Array. */
const toFloat4 = (attribute: BufferAttribute): Float32Array => {
  const out = new Float32Array(attribute.count * 4);
  for (let i = 0; i < attribute.count; i++) {
    for (let c = 0; c < 4; c++) out[i * 4 + c] = attribute.getComponent(i, c);
  }
  return out;
};

const toFloat3 = (attribute: BufferAttribute): Float32Array => {
  const out = new Float32Array(attribute.count * 3);
  for (let i = 0; i < attribute.count; i++) {
    out[i * 3] = attribute.getX(i);
    out[i * 3 + 1] = attribute.getY(i);
    out[i * 3 + 2] = attribute.getZ(i);
  }
  return out;
};

/** A flat stand-in for a PBR material: its colour and colour texture, nothing a weak driver can trip on. */
const simplify = (material: Material): Material => {
  const source = material as MeshStandardMaterial;
  return new MeshLambertMaterial({
    color: source.color ?? 0xffffff,
    map: source.map ?? null,
    side: source.side,
    transparent: source.transparent,
    opacity: source.opacity,
    alphaTest: source.alphaTest,
  });
};

/** The mean colour of a texture's image (sRGB → linear), or undefined if it cannot be read. */
const averageColor = (texture: Texture | null): Color | undefined => {
  const image = texture?.image as CanvasImageSource | undefined;
  if (!image) return undefined;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return undefined;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, 16, 16);
    const data = context.getImageData(0, 0, 16, 16).data;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    const n = (data.length / 4) * 255;
    return new Color().setRGB(r / n, g / n, b / n, SRGBColorSpace);
  } catch {
    return undefined;
  }
};

/** One colour per material: its colour factor times the mean of its colour texture. */
const flatten = (material: Material): Material => {
  const source = material as MeshStandardMaterial;
  const color = new Color(source.color ?? 0xffffff);
  const mean = averageColor(source.map ?? null);
  if (mean) color.multiply(mean);
  return new MeshLambertMaterial({ color, side: source.side });
};

const mapMaterials = (material: Material | Material[], fn: (m: Material) => Material) =>
  Array.isArray(material) ? material.map(fn) : fn(material);

const eachMaterial = (material: Material | Material[] | undefined, fn: (m: Material) => void) => {
  if (!material) return;
  for (const m of Array.isArray(material) ? material : [material]) fn(m);
};

export function cpuSkinning(root: Object3D): CpuSkinning {
  const meshes: SkinnedMesh[] = [];
  root.traverse((node) => {
    if ((node as SkinnedMesh).isSkinnedMesh) meshes.push(node as SkinnedMesh);
  });

  const parts: Part[] = meshes.map((mesh) => {
    const source = mesh.geometry;
    const position = source.getAttribute('position') as BufferAttribute;
    const normal = source.getAttribute('normal') as BufferAttribute | undefined;
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(position.count * 3), 3).setUsage(DynamicDrawUsage),
    );
    if (normal) {
      geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normal.count * 3), 3).setUsage(DynamicDrawUsage));
    }
    for (const name of ['uv', 'uv1', 'color']) {
      const attribute = source.getAttribute(name);
      if (attribute) geometry.setAttribute(name, attribute);
    }
    geometry.setIndex(source.index);
    for (const group of source.groups) geometry.addGroup(group.start, group.count, group.materialIndex);

    const proxy = new Mesh(geometry, mesh.material);
    proxy.name = `${mesh.name}_cpu`;
    proxy.castShadow = mesh.castShadow;
    proxy.receiveShadow = mesh.receiveShadow;
    proxy.frustumCulled = false;
    proxy.visible = false;
    root.add(proxy);

    return {
      mesh,
      proxy,
      basePosition: toFloat3(position),
      baseNormal: normal ? toFloat3(normal) : undefined,
      joints: toFloat4(source.getAttribute('skinIndex') as BufferAttribute),
      weights: toFloat4(source.getAttribute('skinWeight') as BufferAttribute),
      matrices: new Float32Array(mesh.skeleton.bones.length * 16),
      original: mesh.material,
      simple: undefined,
      flat: undefined,
      chunks: undefined,
      scratch: undefined,
    };
  });

  let active = false;
  let chunked = false;
  let materials: CpuSkinningMaterials = 'original';

  const currentMaterial = (part: Part): Material | Material[] => {
    if (materials === 'simple') return (part.simple ??= mapMaterials(part.original, simplify));
    if (materials === 'flat') return (part.flat ??= mapMaterials(part.original, flatten));
    return part.original;
  };

  /** Split a part's triangles into pieces of at most CHUNK_VERTICES vertices, in index order. */
  const buildChunks = (part: Part): Chunk[] => {
    const geometry = part.proxy.geometry;
    const index = geometry.index!.array;
    const vertexCount = part.basePosition.length / 3;
    const stamp = new Int32Array(vertexCount).fill(-1); // chunk id that last claimed a vertex
    const local = new Uint32Array(vertexCount); // its index within that chunk
    const uv = geometry.getAttribute('uv') as BufferAttribute | undefined;
    const chunks: Chunk[] = [];
    let id = 0;
    let vertices: number[] = [];
    let triangles: number[] = [];
    const flush = () => {
      if (!triangles.length) return;
      const map = Uint32Array.from(vertices);
      const piece = new BufferGeometry();
      piece.setAttribute('position', new BufferAttribute(new Float32Array(map.length * 3), 3).setUsage(DynamicDrawUsage));
      if (part.baseNormal) {
        piece.setAttribute('normal', new BufferAttribute(new Float32Array(map.length * 3), 3).setUsage(DynamicDrawUsage));
      }
      if (uv) {
        const uvs = new Float32Array(map.length * 2);
        for (let i = 0; i < map.length; i++) {
          uvs[i * 2] = uv.getX(map[i]);
          uvs[i * 2 + 1] = uv.getY(map[i]);
        }
        piece.setAttribute('uv', new BufferAttribute(uvs, 2));
      }
      piece.setIndex(new BufferAttribute(Uint16Array.from(triangles), 1));
      const mesh = new Mesh(piece, currentMaterial(part));
      mesh.name = `${part.proxy.name}_chunk${chunks.length}`;
      mesh.castShadow = part.proxy.castShadow;
      mesh.receiveShadow = part.proxy.receiveShadow;
      mesh.frustumCulled = false;
      mesh.visible = false;
      root.add(mesh);
      chunks.push({ mesh, map });
      vertices = [];
      triangles = [];
      id++;
    };
    const claim = (v: number) => {
      if (stamp[v] !== id) {
        stamp[v] = id;
        local[v] = vertices.length;
        vertices.push(v);
      }
      triangles.push(local[v]);
    };
    for (let t = 0; t < index.length; t += 3) {
      const a = index[t];
      const b = index[t + 1];
      const c = index[t + 2];
      const fresh = (stamp[a] !== id ? 1 : 0) + (stamp[b] !== id && b !== a ? 1 : 0) + (stamp[c] !== id && c !== a && c !== b ? 1 : 0);
      if (vertices.length + fresh > CHUNK_VERTICES) flush();
      claim(a);
      claim(b);
      claim(c);
    }
    flush();
    return chunks;
  };

  const refreshVisibility = () => {
    for (const part of parts) {
      part.mesh.visible = !active;
      part.proxy.visible = active && !chunked;
      if (part.chunks) for (const chunk of part.chunks) chunk.mesh.visible = active && chunked;
    }
  };

  const rootInverse = new Matrix4();
  const matrix = new Matrix4();

  const update = () => {
    root.updateMatrixWorld(true);
    rootInverse.copy(root.matrixWorld).invert();
    for (const part of parts) {
      const { mesh, matrices: m, basePosition, baseNormal, joints, weights } = part;
      const { bones, boneInverses } = mesh.skeleton;
      for (let k = 0; k < bones.length; k++) {
        matrix
          .multiplyMatrices(rootInverse, bones[k].matrixWorld)
          .multiply(boneInverses[k])
          .multiply(mesh.bindMatrix)
          .toArray(m, k * 16);
      }
      const positionAttribute = part.proxy.geometry.getAttribute('position') as BufferAttribute;
      const normalAttribute = part.proxy.geometry.getAttribute('normal') as BufferAttribute | undefined;
      const out = positionAttribute.array as Float32Array;
      const outNormal = normalAttribute?.array as Float32Array | undefined;
      const count = basePosition.length / 3;
      const hasNormal = baseNormal !== undefined;
      for (let i = 0; i < count; i++) {
        const px = basePosition[i * 3];
        const py = basePosition[i * 3 + 1];
        const pz = basePosition[i * 3 + 2];
        let x = 0;
        let y = 0;
        let z = 0;
        let nx = 0;
        let ny = 0;
        let nz = 0;
        const qx = hasNormal ? baseNormal[i * 3] : 0;
        const qy = hasNormal ? baseNormal[i * 3 + 1] : 0;
        const qz = hasNormal ? baseNormal[i * 3 + 2] : 0;
        for (let c = 0; c < 4; c++) {
          const w = weights[i * 4 + c];
          if (w === 0) continue;
          const j = joints[i * 4 + c] * 16;
          x += w * (m[j] * px + m[j + 4] * py + m[j + 8] * pz + m[j + 12]);
          y += w * (m[j + 1] * px + m[j + 5] * py + m[j + 9] * pz + m[j + 13]);
          z += w * (m[j + 2] * px + m[j + 6] * py + m[j + 10] * pz + m[j + 14]);
          if (hasNormal) {
            nx += w * (m[j] * qx + m[j + 4] * qy + m[j + 8] * qz);
            ny += w * (m[j + 1] * qx + m[j + 5] * qy + m[j + 9] * qz);
            nz += w * (m[j + 2] * qx + m[j + 6] * qy + m[j + 10] * qz);
          }
        }
        out[i * 3] = x;
        out[i * 3 + 1] = y;
        out[i * 3 + 2] = z;
        if (outNormal) {
          outNormal[i * 3] = nx;
          outNormal[i * 3 + 1] = ny;
          outNormal[i * 3 + 2] = nz;
        }
      }
      positionAttribute.needsUpdate = true;
      if (normalAttribute) normalAttribute.needsUpdate = true;

      if (chunked && part.chunks) {
        for (const { mesh: piece, map } of part.chunks) {
          const pieceGeometry = piece.geometry;
          const pp = pieceGeometry.getAttribute('position') as BufferAttribute;
          const pn = pieceGeometry.getAttribute('normal') as BufferAttribute | undefined;
          const pa = pp.array as Float32Array;
          const na = pn?.array as Float32Array | undefined;
          for (let i = 0; i < map.length; i++) {
            const s = map[i] * 3;
            const d = i * 3;
            pa[d] = out[s];
            pa[d + 1] = out[s + 1];
            pa[d + 2] = out[s + 2];
            if (na && outNormal) {
              na[d] = outNormal[s];
              na[d + 1] = outNormal[s + 1];
              na[d + 2] = outNormal[s + 2];
            }
          }
          pp.needsUpdate = true;
          if (pn) pn.needsUpdate = true;
        }
      }
    }
  };

  const silhouette = (view: Matrix4, width: number, height: number, out = new Uint8Array(width * height)) => {
    out.fill(0);
    for (const part of parts) {
      const geometry = part.proxy.geometry;
      const count = part.basePosition.length / 3;
      part.scratch ??= { screen: new Float32Array(count * 2), inFront: new Uint8Array(count) };
      rasterizeTriangles(
        (geometry.getAttribute('position') as BufferAttribute).array,
        geometry.index?.array ?? null,
        view,
        width,
        height,
        out,
        part.scratch,
      );
    }
    return out;
  };

  return {
    update,
    silhouette,
    setActive(next) {
      active = next;
      refreshVisibility();
    },
    setChunked(next) {
      chunked = next;
      if (chunked) {
        for (const part of parts) part.chunks ??= buildChunks(part);
        update(); // fill the pieces with the current pose
      }
      refreshVisibility();
    },
    setMaterials(kind) {
      materials = kind;
      for (const part of parts) {
        const material = currentMaterial(part);
        part.proxy.material = material;
        if (part.chunks) for (const chunk of part.chunks) chunk.mesh.material = material;
      }
    },
    disposeTextures() {
      const textures = new Set<Texture>();
      for (const part of parts) {
        eachMaterial(part.original, (m) => {
          for (const value of Object.values(m)) if ((value as Texture)?.isTexture) textures.add(value as Texture);
        });
      }
      for (const texture of textures) texture.dispose();
    },
    dispose() {
      for (const part of parts) {
        root.remove(part.proxy); // its index and UVs are shared with the skinned mesh, so the geometry is not disposed
        if (part.chunks) {
          for (const chunk of part.chunks) {
            root.remove(chunk.mesh);
            chunk.mesh.geometry.dispose();
          }
        }
        eachMaterial(part.simple, (m) => m.dispose());
        eachMaterial(part.flat, (m) => m.dispose());
        part.mesh.visible = true;
      }
    },
  };
}
