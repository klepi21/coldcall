import * as THREE from 'three';

/** Procedural textures drawn on a canvas at runtime. No images are loaded. */

function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function smooth(t: number) {
  return t * t * (3 - 2 * t);
}
function noise(x: number, y: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
function fbm(x: number, y: number, seed: number) {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < 4; o++) {
    v += amp * noise(x * f, y * f, seed + o * 17);
    f *= 2;
    amp *= 0.5;
  }
  return v;
}

const hex = (c: string) => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};

export interface WoodOpts {
  light: string;
  dark: string;
  seed: number;
  /** Grain lines across the texture height. */
  rings: number;
  width?: number;
  height?: number;
}

/**
 * Wood grain: long fibres along x, gently wandering growth rings, fine pores and a few darker
 * streaks. Returns a colour map and a matching roughness map.
 */
export function makeWood(o: WoodOpts): { map: THREE.CanvasTexture; rough: THREE.CanvasTexture } {
  const w = o.width ?? 1024;
  const h = o.height ?? 256;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const rc = document.createElement('canvas');
  rc.width = w;
  rc.height = h;
  const ctx = cv.getContext('2d')!;
  const rctx = rc.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const rimg = rctx.createImageData(w, h);
  const L = hex(o.light);
  const D = hex(o.dark);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const warp = fbm(u * 1.6, v * 1.2, o.seed) * 0.9 + fbm(u * 6, v * 3, o.seed + 5) * 0.12 + Math.sin(u * 9 + fbm(u, v, o.seed + 2) * 4) * 0.04;
      const ring = v * o.rings + warp;
      const fr = ring - Math.floor(ring);
      // late wood: a sharp darker band in each ring
      const band = Math.pow(Math.max(0, 1 - Math.abs(fr - 0.78) / 0.16), 2.2);
      const fibre = noise(u * 260, v * 70, o.seed + 9) * 0.55 + noise(u * 40, v * 140, o.seed + 3) * 0.45;
      const pore = hash(x, y, o.seed) > 0.985 ? 0.35 : 0;
      const streak = Math.pow(fbm(u * 1.2, v * 9, o.seed + 11), 3) * 0.6;
      let t = 0.3 + band * 0.42 + (fibre - 0.5) * 0.34 + pore + streak;
      t = Math.min(1, Math.max(0, t));
      const i = (y * w + x) * 4;
      img.data[i] = L[0] + (D[0] - L[0]) * t;
      img.data[i + 1] = L[1] + (D[1] - L[1]) * t;
      img.data[i + 2] = L[2] + (D[2] - L[2]) * t;
      img.data[i + 3] = 255;
      const r = 120 + band * 70 + (fibre - 0.5) * 50;
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = r;
      rimg.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  const map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  const rough = new THREE.CanvasTexture(rc);
  rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
  return { map, rough };
}

/** Edge darkening for a recessed field: fakes the ambient occlusion of the surrounding walls. */
export function makeEdgeShade(): THREE.CanvasTexture {
  const w = 128;
  const h = 256;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = Math.min(x, w - 1 - x) / w;
      const dy = Math.min(y, h - 1 - y) / h;
      const ex = Math.max(0, 1 - dx / 0.16);
      const ey = Math.max(0, 1 - dy / 0.07);
      const a = Math.min(1, ex * ex * 0.75 + ey * ey * 0.75);
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
      img.data[i + 3] = a * 150;
    }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(cv);
}

/** Soft fabric for the bear off tray. */
export function makeFelt(color: string, seed = 3): THREE.CanvasTexture {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(s, s);
  const C = hex(color);
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      const n = (hash(x, y, seed) - 0.5) * 18 + (noise(x / 9, y / 9, seed) - 0.5) * 16;
      const i = (y * s + x) * 4;
      img.data[i] = C[0] + n;
      img.data[i + 1] = C[1] + n;
      img.data[i + 2] = C[2] + n;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Pip layout on a 3 by 3 grid for each face value. */
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

/** One die face: warm ivory with engraved ink pips (the one is terracotta, a tavli tradition). */
export function makeDieFace(value: number): THREE.CanvasTexture {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(s * 0.45, s * 0.4, s * 0.1, s / 2, s / 2, s * 0.75);
  g.addColorStop(0, '#FFFCF4');
  g.addColorStop(1, '#EDE3CF');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const pr = value === 1 ? 30 : 23;
  for (const [cx, cy] of PIPS[value]!) {
    const x = s * (0.24 + cx * 0.26);
    const y = s * (0.24 + cy * 0.26);
    // engraved look: a light lip below, a dark well with a soft inner shade
    ctx.beginPath();
    ctx.arc(x + 1.5, y + 2.5, pr + 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    const pg = ctx.createRadialGradient(x - pr * 0.3, y - pr * 0.35, pr * 0.1, x, y, pr);
    if (value === 1) {
      pg.addColorStop(0, '#7A2414');
      pg.addColorStop(1, '#B0442A');
    } else {
      pg.addColorStop(0, '#05070F');
      pg.addColorStop(1, '#1F2640');
    }
    ctx.beginPath();
    ctx.arc(x, y, pr, 0, Math.PI * 2);
    ctx.fillStyle = pg;
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
