// The ink-bleed transition of Fig. 1. The photo layer of the transition is the poster image (the
// photo relief rendered at rest, which the live relief matches once it has settled), drawn on an
// opaque copy of the page colour on a 2D canvas laid over the WebGL canvas:
//   photo → run cycle: the poster covers the stage, the scene underneath switches to the run cycle
//     and keeps moving, and a ragged, ink-like hole washes the photo away from the click point;
//   run cycle → photo: the photo bleeds in from the click point over the running pair until it
//     covers the stage, the scene underneath switches back to the relief, and the veil goes.
// Nothing here reads pixels from WebGL or waits for the GPU (a read-back can stall for seconds on a
// busy or fragile driver): the canvases are CPU-backed and the poster is an ordinary image.

export interface Point {
  /** CSS pixels from the stage's left edge. */
  x: number;
  /** CSS pixels from the stage's top edge. */
  y: number;
}

export interface Veil {
  /** Decode the poster and size the canvases ahead of the first switch (call when idle). */
  warm(): Promise<void>;
  /** Show the photo over the stage, opaque, at once. */
  cover(): void;
  /** Wash the photo away from `origin`, uncovering the canvas; `fade` cross-fades instead. */
  open(origin: Point, fade?: boolean): Promise<void>;
  /** Bleed the photo in from `origin` until it covers the stage (it stays up until hide()). */
  close(origin: Point, fade?: boolean): Promise<void>;
  hide(): void;
}

const DURATION = 900; // ms for the ink to cross the whole stage
const FADE = 240; // ms
const MASK_CELL = 6; // CSS pixels per mask pixel; the browser's smoothing feathers the edge
const RAGGED = 0.16; // edge raggedness, as a fraction of the distance to the farthest corner
const FEATHER = 9; // CSS pixels of soft edge
const FRINGE = 0.14; // opacity of the wet-ink rim along the edge
const MAX_SCALE = 1.5; // canvas pixels per CSS pixel; the photo is soft, and this is CPU work

const smooth = (t: number) => t * t * (3 - 2 * t);
// A drop lands, then bleeds outward and slows: most of the spread crosses the subjects mid-way.
const spread = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) ** 2 / 2);
const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

/** Fractal value noise in [-1, 1], `width`×`height` samples, features about `cell` samples wide. */
function noise(width: number, height: number, cell: number): Float32Array {
  const out = new Float32Array(width * height);
  let total = 0;
  for (let octave = 0, size = cell, amplitude = 1; octave < 3; octave++, size /= 2.2, amplitude /= 2) {
    const gw = Math.ceil(width / size) + 2;
    const gh = Math.ceil(height / size) + 2;
    const lattice = Float32Array.from({ length: gw * gh }, () => Math.random() * 2 - 1);
    for (let y = 0; y < height; y++) {
      const gy = y / size;
      const y0 = Math.floor(gy);
      const fy = smooth(gy - y0);
      for (let x = 0; x < width; x++) {
        const gx = x / size;
        const x0 = Math.floor(gx);
        const fx = smooth(gx - x0);
        const i = y0 * gw + x0;
        const top = lattice[i] + (lattice[i + 1] - lattice[i]) * fx;
        const bottom = lattice[i + gw] + (lattice[i + gw + 1] - lattice[i + gw]) * fx;
        out[y * width + x] += (top + (bottom - top) * fy) * amplitude;
      }
    }
    total += amplitude;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** The colour behind the stage: the nearest ancestor with an opaque background. */
function pageColour(element: HTMLElement): string {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const colour = getComputedStyle(node).backgroundColor;
    if (colour && colour !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(colour)) return colour;
  }
  return '#faf9f6';
}

/** A CPU-backed 2D context: drawing on it never waits for the GPU. */
const context2d = (canvas: HTMLCanvasElement) => canvas.getContext('2d', { willReadFrequently: true })!;

export function createVeil(stage: HTMLElement, poster: HTMLImageElement | null, element?: HTMLCanvasElement | null): Veil {
  const veil = element ?? document.createElement('canvas');
  if (!element) {
    veil.className = 'figure3d__veil';
    veil.setAttribute('aria-hidden', 'true');
    stage.append(veil);
  }
  veil.hidden = true;
  const context = context2d(veil);
  const photo = document.createElement('canvas'); // page colour + poster, at the veil's size
  const photoContext = context2d(photo);
  const mask = document.createElement('canvas');
  const maskContext = context2d(mask);
  const rim = document.createElement('canvas');
  const rimContext = context2d(rim);

  /** Size the canvases to the stage and paint the photo layer. */
  const paint = () => {
    const scale = Math.min(devicePixelRatio || 1, MAX_SCALE);
    const width = Math.max(1, Math.round(stage.clientWidth * scale));
    const height = Math.max(1, Math.round(stage.clientHeight * scale));
    for (const canvas of [veil, photo]) {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    }
    photoContext.fillStyle = pageColour(stage); // opaque: nothing may show through around the subjects
    photoContext.fillRect(0, 0, width, height);
    if (poster?.complete && poster.naturalWidth) {
      const k = Math.min(width / poster.naturalWidth, height / poster.naturalHeight); // object-fit: contain
      const w = poster.naturalWidth * k;
      const h = poster.naturalHeight * k;
      photoContext.drawImage(poster, (width - w) / 2, (height - h) / 2, w, h);
    }
  };

  const show = (opacity: number) => {
    veil.getAnimations().forEach((animation) => animation.cancel());
    veil.style.opacity = String(opacity);
    veil.hidden = false;
  };

  const fade = async (from: number, to: number) => {
    context.globalCompositeOperation = 'copy';
    context.drawImage(photo, 0, 0);
    context.globalCompositeOperation = 'source-over';
    show(from);
    await veil
      .animate([{ opacity: from }, { opacity: to }], { duration: FADE, easing: 'ease-out', fill: 'forwards' })
      .finished.catch(() => undefined);
    veil.style.opacity = String(to);
    veil.getAnimations().forEach((animation) => animation.cancel());
  };

  /** Animate the ink edge from `origin`: `inward` false washes the photo away, true bleeds it in. */
  const ink = async (origin: Point, inward: boolean) => {
    const cssWidth = stage.clientWidth || 1;
    const cssHeight = stage.clientHeight || 1;
    const mw = Math.max(2, Math.ceil(cssWidth / MASK_CELL) + 1);
    const mh = Math.max(2, Math.ceil(cssHeight / MASK_CELL) + 1);
    mask.width = rim.width = mw;
    mask.height = rim.height = mh;
    const keepImage = maskContext.createImageData(mw, mh);
    const rimImage = rimContext.createImageData(mw, mh);
    const inkColour = getComputedStyle(stage).color || '#151517';
    const reach = Math.max(
      Math.hypot(origin.x, origin.y),
      Math.hypot(cssWidth - origin.x, origin.y),
      Math.hypot(origin.x, cssHeight - origin.y),
      Math.hypot(cssWidth - origin.x, cssHeight - origin.y),
    );
    const ragged = RAGGED * reach;
    const distance = new Float32Array(mw * mh);
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        distance[y * mw + x] = Math.hypot((x + 0.5) * MASK_CELL - origin.x, (y + 0.5) * MASK_CELL - origin.y);
      }
    }
    const cell = Math.max(4, Math.round(mw / 6));
    const first = noise(mw, mh, cell);
    const second = noise(mw, mh, cell);
    const start = -(ragged + FEATHER);
    const end = reach + ragged + FEATHER;
    const sx = (mw * MASK_CELL * veil.width) / cssWidth;
    const sy = (mh * MASK_CELL * veil.height) / cssHeight;
    let began = -1;
    for (;;) {
      const now = await nextFrame();
      if (began < 0) began = now; // the clock starts with the first frame actually drawn
      const t = Math.min((now - began) / DURATION, 1);
      const radius = start + (end - start) * spread(t);
      for (let i = 0; i < distance.length; i++) {
        // < 0 inside the ink, > 0 outside it
        const field = distance[i] + (first[i] + (second[i] - first[i]) * t) * ragged - radius;
        const outside = smooth(Math.min(Math.max((field + FEATHER) / (2 * FEATHER), 0), 1));
        keepImage.data[i * 4 + 3] = 255 * (inward ? 1 - outside : outside);
        const edge = Math.max(0, 1 - Math.abs(field + (inward ? 1.2 : -1.2) * FEATHER) / (1.8 * FEATHER));
        rimImage.data[i * 4 + 3] = 255 * FRINGE * edge * edge;
      }
      maskContext.putImageData(keepImage, 0, 0);
      rimContext.putImageData(rimImage, 0, 0);
      rimContext.globalCompositeOperation = 'source-in'; // tint the rim's alpha with the ink colour
      rimContext.fillStyle = inkColour;
      rimContext.fillRect(0, 0, mw, mh);
      rimContext.globalCompositeOperation = 'source-over';
      context.globalCompositeOperation = 'copy';
      context.drawImage(photo, 0, 0);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.globalCompositeOperation = 'destination-in';
      context.drawImage(mask, 0, 0, sx, sy);
      context.globalCompositeOperation = 'source-atop';
      context.drawImage(rim, 0, 0, sx, sy);
      context.globalCompositeOperation = 'source-over';
      if (t === 0) show(1); // the first frame is drawn before the veil appears, so nothing flashes
      if (t >= 1) break;
    }
  };

  return {
    async warm() {
      await poster?.decode().catch(() => undefined);
      paint();
    },
    cover() {
      paint();
      context.globalCompositeOperation = 'copy';
      context.drawImage(photo, 0, 0);
      context.globalCompositeOperation = 'source-over';
      show(1);
    },
    async open(origin, crossFade = false) {
      if (crossFade) await fade(1, 0);
      else await ink(origin, false);
      veil.hidden = true;
    },
    async close(origin, crossFade = false) {
      paint();
      if (crossFade) await fade(0, 1);
      else await ink(origin, true);
    },
    hide() {
      veil.hidden = true;
      veil.style.opacity = '';
    },
  };
}
