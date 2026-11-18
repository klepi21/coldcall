/**
 * Original procedural 3D ships for Sea Battle, built from extrusions and primitives. Each ship is
 * merged into one geometry per material slot (hull, deck, detail, glow), so a ship costs four draw
 * calls. Ships lie along +x (bow at +x), centred on the origin, waterline at y = 0. One grid cell
 * is one world unit. Geometries are cached per class.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SbShipId } from '@coldcall/games/seabattle';

export type Slot = 'hull' | 'deck' | 'detail' | 'glow';
export type ShipGeo = Record<Slot, THREE.BufferGeometry>;

type Parts = Record<Slot, THREE.BufferGeometry[]>;

const prep = (g: THREE.BufferGeometry) => {
  const n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  n.deleteAttribute('uv');
  if (!n.getAttribute('normal')) n.computeVertexNormals();
  return n;
};

function box(p: Parts, slot: Slot, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  p[slot].push(prep(g));
}

function cyl(p: Parts, slot: Slot, rt: number, rb: number, h: number, x: number, y: number, z: number, seg = 10, axis: 'y' | 'x' = 'y') {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  p[slot].push(prep(g));
}

/** Hull outline seen from above: pointed bow at +x, rounded stern, extruded upwards. */
function hullShape(len: number, beam: number, bowLen: number, sternRound: number) {
  const s = new THREE.Shape();
  const hx = len / 2;
  const hb = beam / 2;
  s.moveTo(-hx + sternRound, -hb);
  s.lineTo(hx - bowLen, -hb);
  s.quadraticCurveTo(hx - bowLen * 0.25, -hb * 0.85, hx, 0);
  s.quadraticCurveTo(hx - bowLen * 0.25, hb * 0.85, hx - bowLen, hb);
  s.lineTo(-hx + sternRound, hb);
  s.quadraticCurveTo(-hx, hb, -hx, hb - sternRound);
  s.lineTo(-hx, -hb + sternRound);
  s.quadraticCurveTo(-hx, -hb, -hx + sternRound, -hb);
  return s;
}

/** Thin glowing band around the hull at the waterline. */
function waterline(p: Parts, len: number, beam: number, bowLen: number, stern = 0.08) {
  hull(p, 'glow', len + 0.05, beam + 0.05, 0.0, 0.025, bowLen + 0.02, stern);
}

function hull(p: Parts, slot: Slot, len: number, beam: number, bottom: number, top: number, bowLen: number, stern = 0.08, inset = 0) {
  const g = new THREE.ExtrudeGeometry(hullShape(len - inset * 2, beam - inset * 2, bowLen, stern), {
    depth: top - bottom,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 1,
    curveSegments: 6,
  });
  // Shape lies in XY, extruded along +Z. Turn it so the extrusion goes up.
  g.rotateX(-Math.PI / 2);
  g.translate(0, bottom, 0);
  p[slot].push(prep(g));
}

function turret(p: Parts, x: number, y: number, dir: 1 | -1, barrels = 2, r = 0.1) {
  cyl(p, 'deck', r, r * 1.15, 0.07, x, y + 0.035, 0, 12);
  box(p, 'detail', r * 1.3, 0.05, r * 1.3, x, y + 0.085, 0);
  for (let b = 0; b < barrels; b++) {
    const z = barrels === 1 ? 0 : (b - (barrels - 1) / 2) * 0.06;
    cyl(p, 'detail', 0.014, 0.018, 0.3, x + dir * 0.2, y + 0.08, z, 6, 'x');
  }
}

function build(id: SbShipId): Parts {
  const p: Parts = { hull: [], deck: [], detail: [], glow: [] };
  switch (id) {
    case 'carrier': {
      const L = 4.7;
      hull(p, 'hull', L, 0.62, -0.12, 0.12, 0.9, 0.12);
      waterline(p, L, 0.62, 0.9, 0.12);
      // overhanging flight deck, slightly angled on the port side
      box(p, 'deck', L * 0.96, 0.05, 0.78, -0.02, 0.17, -0.03);
      box(p, 'deck', 1.5, 0.05, 0.22, -0.55, 0.17, -0.43, 0.12);
      // runway markings
      box(p, 'glow', L * 0.86, 0.006, 0.018, -0.05, 0.198, -0.05);
      for (let i = 0; i < 7; i++) box(p, 'detail', 0.18, 0.006, 0.02, -1.9 + i * 0.55, 0.197, -0.05);
      box(p, 'glow', 0.02, 0.006, 0.5, 2.0, 0.198, -0.05);
      // island on the starboard side
      box(p, 'detail', 0.62, 0.3, 0.16, 0.45, 0.34, 0.27);
      box(p, 'detail', 0.38, 0.14, 0.13, 0.42, 0.56, 0.27);
      box(p, 'glow', 0.36, 0.03, 0.135, 0.42, 0.6, 0.27);
      cyl(p, 'detail', 0.012, 0.016, 0.42, 0.42, 0.82, 0.27, 5);
      box(p, 'detail', 0.02, 0.02, 0.22, 0.42, 0.92, 0.27);
      // parked aircraft
      for (const [x, z] of [[-1.5, 0.18], [-1.1, 0.2], [1.5, -0.25]] as const) {
        box(p, 'detail', 0.22, 0.03, 0.05, x, 0.215, z);
        box(p, 'detail', 0.06, 0.025, 0.22, x + 0.02, 0.215, z);
      }
      break;
    }
    case 'warship': {
      const L = 3.75;
      hull(p, 'hull', L, 0.56, -0.12, 0.1, 0.85, 0.12);
      waterline(p, L, 0.56, 0.85, 0.12);
      hull(p, 'deck', L - 0.08, 0.5, 0.1, 0.13, 0.8, 0.1);
      // stepped superstructure
      box(p, 'detail', 0.95, 0.16, 0.36, -0.05, 0.21, 0);
      box(p, 'detail', 0.62, 0.15, 0.28, 0.05, 0.36, 0);
      box(p, 'detail', 0.3, 0.13, 0.22, 0.12, 0.5, 0);
      box(p, 'glow', 0.31, 0.025, 0.225, 0.12, 0.53, 0);
      cyl(p, 'detail', 0.09, 0.1, 0.24, -0.35, 0.38, 0, 10);
      cyl(p, 'detail', 0.012, 0.016, 0.45, 0.12, 0.78, 0, 5);
      box(p, 'detail', 0.02, 0.02, 0.26, 0.12, 0.88, 0);
      turret(p, 1.1, 0.13, 1, 3, 0.13);
      turret(p, 0.72, 0.2, 1, 2, 0.11);
      turret(p, -1.15, 0.13, -1, 3, 0.13);
      break;
    }
    case 'destroyer': {
      const L = 2.75;
      hull(p, 'hull', L, 0.42, -0.1, 0.09, 0.85, 0.08);
      waterline(p, L, 0.42, 0.85);
      hull(p, 'deck', L - 0.06, 0.37, 0.09, 0.115, 0.8, 0.07);
      box(p, 'detail', 0.7, 0.15, 0.26, -0.05, 0.19, 0);
      box(p, 'detail', 0.32, 0.12, 0.2, 0.12, 0.33, 0);
      box(p, 'glow', 0.33, 0.022, 0.205, 0.12, 0.36, 0);
      cyl(p, 'detail', 0.06, 0.07, 0.26, -0.3, 0.38, 0, 10);
      box(p, 'glow', 0.13, 0.02, 0.13, -0.3, 0.52, 0);
      cyl(p, 'detail', 0.01, 0.014, 0.38, 0.1, 0.56, 0, 5);
      turret(p, 0.82, 0.115, 1, 1, 0.1);
      turret(p, -0.88, 0.115, -1, 1, 0.09);
      break;
    }
    case 'submarine': {
      const L = 2.8;
      // long low cigar hull, mostly under water
      const body = new THREE.CapsuleGeometry(0.17, L - 0.34, 6, 14);
      body.rotateZ(Math.PI / 2);
      body.scale(1, 0.62, 1);
      body.translate(0, -0.02, 0);
      p.hull.push(prep(body));
      box(p, 'deck', L * 0.62, 0.025, 0.12, 0.05, 0.085, 0);
      // conning tower with fairwater planes
      const sail = new THREE.CapsuleGeometry(0.06, 0.26, 4, 10);
      sail.rotateZ(Math.PI / 2);
      sail.scale(1, 3.2, 1);
      sail.translate(0.25, 0.22, 0);
      p.detail.push(prep(sail));
      box(p, 'detail', 0.09, 0.012, 0.32, 0.3, 0.27, 0);
      box(p, 'glow', 0.3, 0.02, 0.1, 0.25, 0.4, 0);
      cyl(p, 'detail', 0.008, 0.008, 0.2, 0.18, 0.5, 0, 4);
      cyl(p, 'detail', 0.01, 0.01, 0.15, 0.3, 0.48, 0, 4);
      // stern rudder and planes
      box(p, 'detail', 0.14, 0.22, 0.015, -1.32, 0.02, 0);
      box(p, 'detail', 0.12, 0.012, 0.36, -1.28, 0.0, 0);
      break;
    }
    case 'patrol': {
      const L = 1.75;
      hull(p, 'hull', L, 0.38, -0.08, 0.08, 0.6, 0.08);
      waterline(p, L, 0.38, 0.6);
      hull(p, 'deck', L - 0.06, 0.33, 0.08, 0.1, 0.55, 0.07);
      box(p, 'detail', 0.5, 0.15, 0.25, -0.15, 0.17, 0);
      box(p, 'glow', 0.06, 0.08, 0.24, 0.12, 0.2, 0);
      box(p, 'detail', 0.3, 0.03, 0.27, -0.2, 0.26, 0);
      cyl(p, 'detail', 0.01, 0.012, 0.25, -0.2, 0.39, 0, 5);
      turret(p, 0.45, 0.1, 1, 1, 0.065);
      box(p, 'detail', 0.12, 0.05, 0.08, -0.62, 0.12, 0);
      break;
    }
  }
  return p;
}

const cache = new Map<SbShipId, ShipGeo>();

export function shipGeometry(id: SbShipId): ShipGeo {
  const hit = cache.get(id);
  if (hit) return hit;
  const parts = build(id);
  const out = {} as ShipGeo;
  for (const slot of ['hull', 'deck', 'detail', 'glow'] as Slot[]) {
    const list = parts[slot];
    out[slot] = list.length ? (mergeGeometries(list, false) ?? new THREE.BufferGeometry()) : new THREE.BufferGeometry();
    for (const g of list) g.dispose();
  }
  cache.set(id, out);
  return out;
}

export type ShipLook3D = 'own' | 'reveal' | 'wreck';

/** Shared materials per look. Lit by a cool moon and the fire light. */
const mats = new Map<ShipLook3D, Record<Slot, THREE.Material>>();
export function shipMaterials(look: ShipLook3D): Record<Slot, THREE.Material> {
  const hit = mats.get(look);
  if (hit) return hit;
  const std = (color: string, rough = 0.55, metal = 0.45, emissive = '#000000', ei = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive, emissiveIntensity: ei, flatShading: true });
  const glow = (color: string) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const m: Record<Slot, THREE.Material> =
    look === 'own'
      ? { hull: std('#3a3f7e', 0.45, 0.5, '#3a24b0', 0.45), deck: std('#5a5f9e', 0.55, 0.3), detail: std('#9298d0', 0.45, 0.4), glow: glow('#b3a1ff') }
      : look === 'reveal'
        ? { hull: std('#2c3a4c', 0.45, 0.55, '#16380a', 0.35), deck: std('#4b5a6c', 0.55, 0.35), detail: std('#93a3b5', 0.45, 0.4), glow: glow('#c6ff3d') }
        : { hull: std('#2a1c16', 0.85, 0.2, '#7a1e04', 0.7), deck: std('#3a2a22', 0.9, 0.1, '#5a1800', 0.6), detail: std('#4a362c', 0.9, 0.15, '#3a1000', 0.5), glow: glow('#ff6a2a') };
  mats.set(look, m);
  return m;
}
