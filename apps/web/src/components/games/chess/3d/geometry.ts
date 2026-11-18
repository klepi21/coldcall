/**
 * Original procedural chess pieces and board textures for the 3D board. Everything is built in code:
 * lathe profiles for the round pieces, an extruded and bevelled outline for the knight, and canvas
 * textures for the board surface. Nothing is loaded from the network.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { PieceType } from '../pieces';

type P = [number, number];

const SEGS = 64;

/** Points on a circle arc in the (radius, height) plane, angles in degrees. */
function arc(cy: number, r: number, from: number, to: number, n = 14): P[] {
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
    out.push([Math.max(0, r * Math.cos(a)), cy + r * Math.sin(a)]);
  }
  return out;
}

/** Smooth a run of control points with a spline, keeping the ends. */
function smooth(pts: P[], n: number): P[] {
  const c = new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  return c.getPoints(n).map((v) => [Math.max(0, v.x), v.y] as P);
}

/** Shared stepped foot: a wide plinth with a soft roll, a groove and a collar. */
function foot(R: number): P[] {
  return [
    [0, 0],
    [R - 0.02, 0],
    [R, 0.01],
    [R + 0.006, 0.03],
    [R, 0.052],
    [R - 0.025, 0.066],
    [R - 0.03, 0.08],
    [R - 0.05, 0.09],
    [R - 0.05, 0.105],
    [R - 0.075, 0.118],
  ];
}

function lathe(pts: P[], segs = SEGS) {
  const g = new THREE.LatheGeometry(
    pts.map(([x, y]) => new THREE.Vector2(x, y)),
    segs,
  );
  return g;
}

function merge(gs: THREE.BufferGeometry[]) {
  const parts = gs.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
    return n;
  });
  const m = mergeGeometries(parts, false)!;
  m.computeBoundingBox();
  m.computeBoundingSphere();
  return m;
}

function pawn() {
  const pts: P[] = [
    ...foot(0.32),
    ...smooth(
      [
        [0.23, 0.13],
        [0.17, 0.19],
        [0.13, 0.27],
        [0.105, 0.35],
        [0.1, 0.385],
      ],
      14,
    ),
    [0.16, 0.395],
    [0.172, 0.41],
    [0.16, 0.425],
    [0.09, 0.432],
    ...arc(0.53, 0.118, -58, 90, 20),
  ];
  return lathe(pts);
}

function ringSector(rIn: number, rOut: number, a0: number, a1: number) {
  const s = new THREE.Shape();
  s.moveTo(Math.cos(a0) * rOut, Math.sin(a0) * rOut);
  s.absarc(0, 0, rOut, a0, a1, false);
  s.lineTo(Math.cos(a1) * rIn, Math.sin(a1) * rIn);
  s.absarc(0, 0, rIn, a1, a0, true);
  s.closePath();
  return s;
}

function rook() {
  const body = lathe([
    ...foot(0.35),
    ...smooth(
      [
        [0.25, 0.13],
        [0.22, 0.19],
        [0.2, 0.3],
        [0.19, 0.44],
        [0.2, 0.5],
      ],
      14,
    ),
    [0.25, 0.525],
    [0.265, 0.545],
    [0.258, 0.565],
    [0.238, 0.575],
    [0.243, 0.59],
    [0.243, 0.645],
    [0.165, 0.645],
    [0.165, 0.62],
    [0, 0.62],
  ]);
  const merlons: THREE.BufferGeometry[] = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n / 2;
    const span = ((Math.PI * 2) / n) * 0.62;
    const g = new THREE.ExtrudeGeometry(ringSector(0.168, 0.24, a - span / 2, a + span / 2), {
      depth: 0.085,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.004,
      bevelSegments: 2,
      curveSegments: 6,
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.64, 0);
    merlons.push(g);
  }
  return merge([body, ...merlons]);
}

function bishop() {
  const pts: P[] = [
    ...foot(0.33),
    ...smooth(
      [
        [0.22, 0.13],
        [0.17, 0.2],
        [0.13, 0.3],
        [0.108, 0.42],
        [0.102, 0.475],
      ],
      14,
    ),
    [0.18, 0.49],
    [0.198, 0.505],
    [0.18, 0.52],
    [0.1, 0.53],
    ...smooth(
      [
        [0.1, 0.545],
        [0.135, 0.59],
        [0.155, 0.645],
        [0.15, 0.7],
        [0.128, 0.75],
        [0.09, 0.8],
        [0.045, 0.835],
        [0.018, 0.85],
      ],
      44,
    ),
    ...arc(0.878, 0.034, -60, 90, 10),
  ];
  const g = lathe(pts, 96);
  // Carve the mitre slit: pull vertices near a tilted plane inward on the front half.
  const pos = g.attributes.position as THREE.BufferAttribute;
  const n = new THREE.Vector3(0.62, 0.78, 0).normalize();
  const c = new THREE.Vector3(0, 0.71, 0);
  const v = new THREE.Vector3();
  const w = 0.024;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (v.y < 0.58 || v.y > 0.83 || v.z < 0.01) continue;
    const d = Math.abs(v.clone().sub(c).dot(n));
    if (d >= w) continue;
    const k = 1 - 0.5 * Math.pow(1 - d / w, 0.7) * Math.min(1, v.z / 0.06);
    pos.setXYZ(i, v.x * k, v.y, v.z * k);
  }
  g.computeVertexNormals();
  return g;
}

function queen() {
  const pts: P[] = [
    ...foot(0.35),
    ...smooth(
      [
        [0.245, 0.13],
        [0.19, 0.21],
        [0.15, 0.32],
        [0.125, 0.45],
        [0.115, 0.55],
      ],
      16,
    ),
    [0.195, 0.565],
    [0.212, 0.582],
    [0.19, 0.6],
    [0.125, 0.61],
    ...smooth(
      [
        [0.12, 0.63],
        [0.15, 0.69],
        [0.19, 0.76],
        [0.225, 0.83],
        [0.238, 0.86],
      ],
      18,
    ),
    [0.232, 0.872],
    [0.2, 0.868],
    [0.16, 0.86],
    [0.13, 0.87],
    ...smooth(
      [
        [0.11, 0.88],
        [0.08, 0.905],
        [0.04, 0.925],
        [0.02, 0.93],
      ],
      8,
    ),
    ...arc(0.965, 0.042, -65, 90, 12),
  ];
  const g = lathe(pts, 96);
  // Crown points: lift the rim in eight peaks.
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const peaks = 8;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const r = Math.hypot(v.x, v.z);
    if (v.y < 0.8 || r < 0.15) continue;
    const phi = Math.atan2(v.z, v.x);
    const wgt = Math.min(1, (v.y - 0.8) / 0.06) * Math.min(1, (r - 0.15) / 0.06);
    const lift = 0.07 * Math.pow(Math.max(0, Math.cos(phi * peaks)), 3) * wgt;
    pos.setY(i, v.y + lift);
  }
  g.computeVertexNormals();
  const balls: THREE.BufferGeometry[] = [];
  for (let i = 0; i < peaks; i++) {
    const phi = (i / peaks) * Math.PI * 2;
    const b = new THREE.SphereGeometry(0.024, 12, 8);
    b.translate(Math.cos(phi) * 0.232, 0.94, Math.sin(phi) * 0.232);
    balls.push(b);
  }
  return merge([g, ...balls]);
}

function king() {
  const pts: P[] = [
    ...foot(0.36),
    ...smooth(
      [
        [0.255, 0.13],
        [0.2, 0.21],
        [0.16, 0.33],
        [0.135, 0.47],
        [0.125, 0.6],
      ],
      16,
    ),
    [0.205, 0.615],
    [0.222, 0.635],
    [0.2, 0.652],
    [0.135, 0.665],
    ...smooth(
      [
        [0.132, 0.685],
        [0.16, 0.74],
        [0.198, 0.81],
        [0.218, 0.86],
        [0.214, 0.885],
      ],
      16,
    ),
    [0.19, 0.895],
    ...smooth(
      [
        [0.16, 0.9],
        [0.12, 0.925],
        [0.075, 0.95],
        [0.035, 0.962],
        [0, 0.965],
      ],
      10,
    ),
  ];
  const body = lathe(pts, 72);
  const v = new RoundedBoxGeometry(0.068, 0.25, 0.068, 2, 0.016);
  v.translate(0, 1.07, 0);
  const h = new RoundedBoxGeometry(0.19, 0.064, 0.068, 2, 0.016);
  h.translate(0, 1.1, 0);
  const stem = new THREE.CylinderGeometry(0.045, 0.06, 0.04, 24);
  stem.translate(0, 0.975, 0);
  return merge([body, stem, v, h]);
}

/** A stylised horse head outline, facing +x. Units match the board (1 = one square). */
function horseShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.2, 0);
  s.lineTo(0.19, 0);
  s.bezierCurveTo(0.2, 0.08, 0.13, 0.15, 0.07, 0.23);
  s.bezierCurveTo(0.12, 0.265, 0.2, 0.29, 0.26, 0.315);
  s.bezierCurveTo(0.31, 0.335, 0.315, 0.405, 0.275, 0.43);
  s.bezierCurveTo(0.21, 0.47, 0.13, 0.52, 0.085, 0.575);
  s.lineTo(0.06, 0.665);
  s.quadraticCurveTo(0.045, 0.7, 0.025, 0.69);
  s.lineTo(-0.035, 0.605);
  s.bezierCurveTo(-0.13, 0.585, -0.2, 0.47, -0.215, 0.33);
  s.bezierCurveTo(-0.23, 0.2, -0.215, 0.09, -0.2, 0);
  // eye, cut through so it reads from both sides
  const eye = new THREE.Path();
  eye.absellipse(0.1, 0.49, 0.022, 0.017, 0, Math.PI * 2, false, 0);
  s.holes.push(eye);
  return s;
}

function knight() {
  const base = lathe([
    ...foot(0.35),
    [0.25, 0.13],
    [0.255, 0.15],
    [0.25, 0.165],
    [0, 0.165],
  ]);
  const depth = 0.18;
  const head = new THREE.ExtrudeGeometry(horseShape(), {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.032,
    bevelSegments: 5,
    curveSegments: 24,
  });
  head.translate(-0.02, 0.15, -depth / 2);
  head.computeVertexNormals();
  return merge([base, head]);
}

let cache: Record<PieceType, THREE.BufferGeometry> | null = null;
export function pieceGeometries() {
  if (!cache) cache = { p: pawn(), r: rook(), n: knight(), b: bishop(), q: queen(), k: king() };
  return cache;
}

/* ----------------------------------------------------------------------------------------- */

export const BOARD = {
  /** half of the playing area: 8 squares of 1 unit */
  half: 4,
  /** frame margin on each side of the squares, where coordinates sit */
  margin: 0.62,
  /** slab thickness */
  thick: 0.42,
};

export const SURFACE = {
  marble: { light: '#EDE6D8', dark: '#9C8F7B', frame: '#17161C', coord: 'rgba(214,208,196,0.62)', inlay: 'rgba(198,255,61,0.7)', vein: 'rgba(90,74,52,0.08)' },
  night: { light: '#2B3A5C', dark: '#1A2540', frame: '#0E1018', coord: 'rgba(150,166,204,0.7)', inlay: 'rgba(124,92,255,0.85)', vein: 'rgba(200,214,255,0.02)' },
} as const;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * The whole top face of the board as one texture: frame, inlay line, squares with a soft stone grain,
 * and file and rank labels on the frame facing the player.
 */
export function drawBoardTexture(canvas: HTMLCanvasElement, theme: 'marble' | 'night', flipped: boolean, fontFamily: string) {
  const pal = SURFACE[theme];
  const units = BOARD.half * 2 + BOARD.margin * 2;
  const size = canvas.width;
  const ppu = size / units;
  const g = canvas.getContext('2d')!;
  const M = BOARD.margin * ppu;
  const S = ppu;
  g.clearRect(0, 0, size, size);
  g.fillStyle = pal.frame;
  g.fillRect(0, 0, size, size);

  // brushed frame sheen
  const sheen = g.createLinearGradient(0, 0, size, size);
  sheen.addColorStop(0, 'rgba(255,255,255,0.05)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(255,255,255,0.035)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, size, size);

  // squares
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      g.fillStyle = (r + f) % 2 === 1 ? pal.light : pal.dark;
      g.fillRect(M + f * S, M + (7 - r) * S, S + 0.5, S + 0.5);
    }
  }

  // stone veins and grain, clipped to the playing area
  g.save();
  g.beginPath();
  g.rect(M, M, S * 8, S * 8);
  g.clip();
  const rand = rng(theme === 'marble' ? 11 : 29);
  g.strokeStyle = pal.vein;
  g.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    g.lineWidth = 1 + rand() * S * 0.05;
    g.beginPath();
    let x = M + rand() * S * 8;
    let y = M + rand() * S * 8;
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      const nx = x + (rand() - 0.3) * S * 2.2;
      const ny = y + (rand() - 0.5) * S * 1.2;
      g.quadraticCurveTo(x + (rand() - 0.5) * S, y + (rand() - 0.5) * S, nx, ny);
      x = nx;
      y = ny;
    }
    g.stroke();
  }
  const n = document.createElement('canvas');
  n.width = n.height = 256;
  const ng = n.getContext('2d')!;
  const img = ng.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 110 + rand() * 145;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ng.putImageData(img, 0, 0);
  g.globalAlpha = theme === 'marble' ? 0.07 : 0.05;
  g.globalCompositeOperation = theme === 'marble' ? 'multiply' : 'screen';
  for (let y = 0; y < size; y += 256) for (let x = 0; x < size; x += 256) g.drawImage(n, x, y);
  g.restore();
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';

  // inlay line around the squares
  g.strokeStyle = pal.inlay;
  g.lineWidth = S * 0.025;
  const o = S * 0.11;
  g.strokeRect(M - o, M - o, S * 8 + o * 2, S * 8 + o * 2);
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = S * 0.02;
  g.strokeRect(M - 1, M - 1, S * 8 + 2, S * 8 + 2);

  // coordinates on the frame, upright for the player
  g.fillStyle = pal.coord;
  g.font = `600 ${Math.round(S * 0.24)}px ${fontFamily}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const files = 'abcdefgh';
  const mid = M * 0.52;
  for (let i = 0; i < 8; i++) {
    const fx = M + i * S + S / 2;
    const ry = M + (7 - i) * S + S / 2;
    if (!flipped) {
      g.fillText(files[i]!, fx, size - mid);
      g.fillText(String(i + 1), mid, ry);
    } else {
      g.save();
      g.translate(fx, mid);
      g.rotate(Math.PI);
      g.fillText(files[i]!, 0, 0);
      g.restore();
      g.save();
      g.translate(size - mid, ry);
      g.rotate(Math.PI);
      g.fillText(String(i + 1), 0, 0);
      g.restore();
    }
  }
}

/** Soft round glow used for target discs and the check halo. */
export function glowTexture(inner: string, outer: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.45, outer);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Flat arrow along +x from 0 to len, for the hint. */
export function arrowShape(len: number) {
  const w = 0.11;
  const head = 0.36;
  const hw = 0.26;
  const s = new THREE.Shape();
  s.moveTo(0, -w / 2);
  s.lineTo(len - head, -w / 2);
  s.lineTo(len - head, -hw);
  s.lineTo(len, 0);
  s.lineTo(len - head, hw);
  s.lineTo(len - head, w / 2);
  s.lineTo(0, w / 2);
  s.closePath();
  return s;
}

/** Square outline frame (for the keyboard cursor and drag target). */
export function squareFrame(size = 0.94, thick = 0.06) {
  const h = size / 2;
  const s = new THREE.Shape();
  s.moveTo(-h, -h);
  s.lineTo(h, -h);
  s.lineTo(h, h);
  s.lineTo(-h, h);
  s.closePath();
  const i = h - thick;
  const p = new THREE.Path();
  p.moveTo(-i, -i);
  p.lineTo(-i, i);
  p.lineTo(i, i);
  p.lineTo(i, -i);
  p.closePath();
  s.holes.push(p);
  return s;
}
