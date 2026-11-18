/**
 * Procedural assets for the landing universe. Everything is built in code: canvas textures and
 * extruded or lathed geometry. Nothing is loaded from the network. The knight and hull outlines are
 * adapted copies of the shapes in components/games (those files stay untouched).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const cache = new Map<string, unknown>();
function once<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function tex(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ------------------------------------------------------------------ sprites */

export const dotTexture = () =>
  once('dot', () => {
    const [c, g] = canvas(64, 64);
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.25, 'rgba(255,255,255,.8)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    return tex(c);
  });

export const glowTexture = (color: string) =>
  once(`glow-${color}`, () => {
    const [c, g] = canvas(128, 128);
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, color);
    r.addColorStop(0.35, color.replace(/[\d.]+\)$/, '0.35)'));
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    return tex(c);
  });

/** Soft lumpy cloud for nebula sprites. */
export const cloudTexture = () =>
  once('cloud', () => {
    const [c, g] = canvas(256, 256);
    const rand = rng(7);
    for (let i = 0; i < 26; i++) {
      const x = 128 + (rand() - 0.5) * 120;
      const y = 128 + (rand() - 0.5) * 120;
      const rad = 40 + rand() * 70;
      const r = g.createRadialGradient(x, y, 0, x, y, rad);
      r.addColorStop(0, 'rgba(255,255,255,0.16)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, 256, 256);
    }
    return tex(c);
  });

/* ------------------------------------------------------------------ planet surfaces (equirect 2:1) */

export const chessSurface = () =>
  once('chess-surface', () => {
    const [c, g] = canvas(1024, 512);
    const rand = rng(11);
    const cols = 16;
    const rows = 8;
    const sw = 1024 / cols;
    const sh = 512 / rows;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const light = (x + y) % 2 === 0;
        g.fillStyle = light ? '#ecebf2' : '#14121f';
        g.fillRect(x * sw, y * sh, sw, sh);
      }
    // marble veins on light squares, glints on obsidian
    g.lineWidth = 1.4;
    for (let i = 0; i < 160; i++) {
      let px = rand() * 1024;
      let py = rand() * 512;
      g.strokeStyle = `rgba(110,110,140,${0.15 + rand() * 0.25})`;
      g.beginPath();
      g.moveTo(px, py);
      for (let k = 0; k < 6; k++) {
        px += (rand() - 0.3) * 30;
        py += (rand() - 0.5) * 22;
        g.lineTo(px, py);
      }
      g.stroke();
    }
    // lime seams
    g.strokeStyle = 'rgba(198,255,61,0.55)';
    g.lineWidth = 2;
    for (let x = 0; x <= cols; x++) {
      g.beginPath();
      g.moveTo(x * sw, 0);
      g.lineTo(x * sw, 512);
      g.stroke();
    }
    for (let y = 0; y <= rows; y++) {
      g.beginPath();
      g.moveTo(0, y * sh);
      g.lineTo(1024, y * sh);
      g.stroke();
    }
    return tex(c);
  });

export const woodSurface = () =>
  once('wood-surface', () => {
    const [c, g] = canvas(1024, 512);
    const rand = rng(23);
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#5a2a10');
    grad.addColorStop(0.5, '#a65a24');
    grad.addColorStop(1, '#4a200b');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 120; i++) {
      const y = rand() * 512;
      g.strokeStyle = `rgba(${rand() < 0.5 ? '40,16,4' : '255,200,140'},${0.08 + rand() * 0.12})`;
      g.lineWidth = 1 + rand() * 3;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= 1024; x += 32) g.lineTo(x, y + Math.sin((x / 1024) * Math.PI * 2 * 11 + i) * 4);
      g.stroke();
    }
    // backgammon points around the equator
    const n = 24;
    const w = 1024 / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? 'rgba(243,223,191,.75)' : 'rgba(255,138,61,.8)';
      g.beginPath();
      g.moveTo(i * w + 4, 196);
      g.lineTo(i * w + w / 2, 248);
      g.lineTo(i * w + w - 4, 196);
      g.fill();
      g.fillStyle = i % 2 ? 'rgba(255,138,61,.8)' : 'rgba(243,223,191,.75)';
      g.beginPath();
      g.moveTo(i * w + 4, 316);
      g.lineTo(i * w + w / 2, 264);
      g.lineTo(i * w + w - 4, 316);
      g.fill();
    }
    g.fillStyle = '#d4a24c';
    g.fillRect(0, 252, 1024, 8);
    return tex(c);
  });

export const tichuSurface = () =>
  once('tichu-surface', () => {
    const [c, g] = canvas(1024, 512);
    const rand = rng(31);
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#ff7ab0');
    grad.addColorStop(0.35, '#d63f7f');
    grad.addColorStop(0.55, '#1f9d6e');
    grad.addColorStop(1, '#0b3d2a');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 40; i++) {
      const y = rand() * 512;
      g.strokeStyle = rand() < 0.5 ? 'rgba(255,255,255,.12)' : 'rgba(10,60,40,.25)';
      g.lineWidth = 4 + rand() * 14;
      g.beginPath();
      for (let x = 0; x <= 1024; x += 16) g.lineTo(x, y + Math.sin((x / 1024) * Math.PI * 2 * 7 + i * 1.7) * 18);
      g.stroke();
    }
    // jade coins scattered
    for (let i = 0; i < 18; i++) {
      const x = rand() * 1024;
      const y = 140 + rand() * 240;
      g.fillStyle = 'rgba(180,255,220,.5)';
      g.beginPath();
      g.arc(x, y, 9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(10,60,40,.7)';
      g.fillRect(x - 3, y - 3, 6, 6);
    }
    return tex(c);
  });

export const oceanSurface = () =>
  once('ocean-surface', () => {
    const [c, g] = canvas(1024, 512);
    const rand = rng(41);
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#0b3a5c');
    grad.addColorStop(0.5, '#0a6a98');
    grad.addColorStop(1, '#062a46');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(160,240,255,${rand() * 0.18})`;
      const x = rand() * 1024;
      const y = rand() * 512;
      g.fillRect(x, y, 6 + rand() * 18, 1.5);
    }
    return tex(c);
  });

/** Emissive sonar grid for the ocean world. */
export const oceanGrid = () =>
  once('ocean-grid', () => {
    const [c, g] = canvas(1024, 512);
    g.fillStyle = '#000';
    g.fillRect(0, 0, 1024, 512);
    g.strokeStyle = 'rgba(61,220,255,.8)';
    g.lineWidth = 1.5;
    for (let x = 0; x <= 1024; x += 64) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 512);
      g.stroke();
    }
    for (let y = 0; y <= 512; y += 64) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(1024, y);
      g.stroke();
    }
    return tex(c);
  });

/* ------------------------------------------------------------------ cards and dice */

export function cardTexture(rank: string, color: string, symbol: 'jade' | 'sword' | 'pagoda' | 'star' | 'dragon') {
  return once(`card-${rank}-${symbol}`, () => {
    const [c, g] = canvas(256, 360);
    const dragon = symbol === 'dragon';
    g.fillStyle = dragon ? '#1a0a14' : '#fbf8f2';
    g.beginPath();
    g.roundRect(0, 0, 256, 360, 26);
    g.fill();
    g.strokeStyle = dragon ? '#ffd23f' : color;
    g.lineWidth = 10;
    g.beginPath();
    g.roundRect(10, 10, 236, 340, 20);
    g.stroke();
    g.fillStyle = dragon ? '#ffd23f' : color;
    g.font = '800 64px system-ui, sans-serif';
    g.fillText(rank, 28, 84);
    g.save();
    g.translate(128, 200);
    g.fillStyle = dragon ? '#ff4d8d' : color;
    if (symbol === 'jade') {
      g.beginPath();
      g.arc(0, 0, 54, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fbf8f2';
      g.fillRect(-16, -16, 32, 32);
    } else if (symbol === 'sword') {
      g.fillRect(-9, -80, 18, 120);
      g.fillRect(-40, 34, 80, 14);
      g.fillRect(-9, 44, 18, 34);
    } else if (symbol === 'pagoda') {
      g.beginPath();
      g.moveTo(0, -80);
      g.lineTo(60, -40);
      g.lineTo(-60, -40);
      g.fill();
      g.fillRect(-36, -40, 72, 26);
      g.beginPath();
      g.moveTo(0, -18);
      g.lineTo(70, 22);
      g.lineTo(-70, 22);
      g.fill();
      g.fillRect(-36, 22, 72, 50);
    } else if (symbol === 'star') {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 26 : 64;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.fill();
    } else {
      // an original stylised dragon: a coiled body with a head and a flame
      g.lineWidth = 22;
      g.lineCap = 'round';
      g.strokeStyle = '#ff4d8d';
      g.beginPath();
      g.moveTo(-60, 70);
      g.bezierCurveTo(-90, 0, 40, 30, 30, -20);
      g.bezierCurveTo(22, -60, -40, -50, -30, -80);
      g.stroke();
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.arc(-30, -84, 20, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(-10, -90);
      g.quadraticCurveTo(40, -110, 70, -70);
      g.quadraticCurveTo(30, -80, -10, -76);
      g.fill();
    }
    g.restore();
    return tex(c);
  });
}

export function diceFaces() {
  return once('dice', () =>
    [1, 6, 2, 5, 3, 4].map((n) => {
      const [c, g] = canvas(128, 128);
      g.fillStyle = '#fff6ea';
      g.fillRect(0, 0, 128, 128);
      const P: Record<number, [number, number][]> = {
        1: [[64, 64]],
        2: [[36, 36], [92, 92]],
        3: [[34, 34], [64, 64], [94, 94]],
        4: [[36, 36], [92, 36], [36, 92], [92, 92]],
        5: [[34, 34], [94, 34], [64, 64], [34, 94], [94, 94]],
        6: [[36, 30], [92, 30], [36, 64], [92, 64], [36, 98], [92, 98]],
      };
      g.fillStyle = '#1a0f08';
      for (const [x, y] of P[n]!) {
        g.beginPath();
        g.arc(x, y, 11, 0, Math.PI * 2);
        g.fill();
      }
      return tex(c);
    }),
  );
}

/* ------------------------------------------------------------------ geometry */

function clean(gs: THREE.BufferGeometry[]) {
  const parts = gs.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
    return n;
  });
  const m = mergeGeometries(parts, false)!;
  m.computeBoundingSphere();
  return m;
}

function lathe(pts: [number, number][], segs = 32) {
  return new THREE.LatheGeometry(
    pts.map(([x, y]) => new THREE.Vector2(x, y)),
    segs,
  );
}

const foot = (R: number): [number, number][] => [
  [0, 0],
  [R, 0],
  [R + 0.01, 0.035],
  [R - 0.02, 0.06],
  [R - 0.05, 0.09],
  [R - 0.075, 0.12],
];

/** Stylised knight: lathed foot plus an extruded, bevelled horse head (1 unit = one board square). */
export const knightGeometry = () =>
  once('knight', () => {
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
    const depth = 0.18;
    const head = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.03, bevelSegments: 3, curveSegments: 14 });
    head.translate(-0.02, 0.15, -depth / 2);
    head.computeVertexNormals();
    const base = lathe([...foot(0.34), [0.25, 0.14], [0.25, 0.165], [0, 0.165]]);
    return clean([base, head]);
  });

export const pawnGeometry = () =>
  once('pawn', () => {
    const body = lathe([...foot(0.3), [0.17, 0.2], [0.12, 0.32], [0.1, 0.39], [0.16, 0.4], [0.16, 0.43], [0.09, 0.45], [0, 0.45]]);
    const head = new THREE.SphereGeometry(0.13, 20, 14);
    head.translate(0, 0.55, 0);
    return clean([body, head]);
  });

/** Low poly warship: hull extruded from a top outline, deck, bridge, two turrets. Bow at +x. */
export const shipGeometry = () =>
  once('ship', () => {
    const len = 1;
    const beam = 0.24;
    const hx = len / 2;
    const hb = beam / 2;
    const bow = 0.26;
    const s = new THREE.Shape();
    s.moveTo(-hx + 0.05, -hb);
    s.lineTo(hx - bow, -hb);
    s.quadraticCurveTo(hx - bow * 0.25, -hb * 0.85, hx, 0);
    s.quadraticCurveTo(hx - bow * 0.25, hb * 0.85, hx - bow, hb);
    s.lineTo(-hx + 0.05, hb);
    s.quadraticCurveTo(-hx, hb, -hx, hb - 0.05);
    s.lineTo(-hx, -hb + 0.05);
    s.quadraticCurveTo(-hx, -hb, -hx + 0.05, -hb);
    const hull = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false, curveSegments: 8 });
    hull.rotateX(-Math.PI / 2);
    hull.translate(0, -0.04, 0);
    const bridge = new THREE.BoxGeometry(0.2, 0.12, 0.14);
    bridge.translate(-0.06, 0.14, 0);
    const mast = new THREE.CylinderGeometry(0.012, 0.016, 0.18, 6);
    mast.translate(-0.06, 0.29, 0);
    const t1 = new THREE.CylinderGeometry(0.05, 0.06, 0.05, 10);
    t1.translate(0.2, 0.1, 0);
    const g1 = new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6);
    g1.rotateZ(Math.PI / 2);
    g1.translate(0.3, 0.11, 0);
    const t2 = t1.clone();
    t2.translate(-0.42, 0, 0);
    const g2 = new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6);
    g2.rotateZ(Math.PI / 2);
    g2.translate(-0.32, 0.11, 0);
    return clean([hull, bridge, mast, t1, g1, t2, g2]);
  });

/** Fresnel rim glow for planet atmospheres. */
/** Back side halo: brightest at the planet's edge, fading out to the shell's silhouette. */
export function atmosphereMaterial(color: string, power = 1.6, strength = 2.4) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uPower: { value: power }, uStrength: { value: strength } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uPower; uniform float uStrength;
      varying vec3 vN; varying vec3 vV;
      void main(){
        float f = pow(max(0.0, -dot(vN, vV)), uPower) * uStrength;
        gl_FragColor = vec4(uColor * f, f);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
  });
}
