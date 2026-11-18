import * as THREE from 'three';
import { CH, CR } from './layout';

/**
 * Checker: a turned disc with bevelled edges, a groove round the rim and a shallow ring on the top
 * face, like a lathe turned tavli piece. Base at y = 0, top at y = CH.
 */
export function makeCheckerGeometry(): THREE.LatheGeometry {
  const r = CR;
  const h = CH;
  const p: [number, number][] = [
    [0, 0],
    [r - 0.03, 0],
    [r - 0.008, 0.006],
    [r, 0.02],
    [r, 0.038],
    [r - 0.012, h * 0.46],
    [r - 0.012, h * 0.54],
    [r, h - 0.038],
    [r, h - 0.02],
    [r - 0.008, h - 0.006],
    [r - 0.03, h],
    [r * 0.74, h],
    [r * 0.71, h - 0.012],
    [r * 0.66, h - 0.012],
    [r * 0.63, h - 0.004],
    [r * 0.6, h - 0.006],
    [0, h - 0.006],
  ];
  const g = new THREE.LatheGeometry(
    p.map(([x, y]) => new THREE.Vector2(x, y)),
    56,
  );
  g.computeVertexNormals();
  return g;
}

/**
 * Rounded cube with six material groups (BoxGeometry order: +x, -x, +y, -y, +z, -z), so each face
 * can carry its own pip texture.
 */
export function makeDieGeometry(size: number, radius: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(size, size, size, 10, 10, 10);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const h = size / 2;
  const inner = h - radius;
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    c.set(THREE.MathUtils.clamp(v.x, -inner, inner), THREE.MathUtils.clamp(v.y, -inner, inner), THREE.MathUtils.clamp(v.z, -inner, inner));
    const d = v.clone().sub(c);
    if (d.lengthSq() > 0) v.copy(c).add(d.normalize().multiplyScalar(radius));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Face value carried by each BoxGeometry group. Opposite faces sum to seven. */
export const DIE_FACES = [3, 4, 1, 6, 2, 5] as const;

/** Rotation that turns `value` to face up (+y), before any yaw. */
export function faceUpQuat(value: number): THREE.Quaternion {
  const q = new THREE.Quaternion();
  const X = new THREE.Vector3(1, 0, 0);
  const Z = new THREE.Vector3(0, 0, 1);
  switch (value) {
    case 6:
      q.setFromAxisAngle(X, Math.PI);
      break;
    case 2:
      q.setFromAxisAngle(X, -Math.PI / 2);
      break;
    case 5:
      q.setFromAxisAngle(X, Math.PI / 2);
      break;
    case 3:
      q.setFromAxisAngle(Z, Math.PI / 2);
      break;
    case 4:
      q.setFromAxisAngle(Z, -Math.PI / 2);
      break;
    default:
      break;
  }
  return q;
}

/** A flat point (triangle) lying on the field, slightly raised. Built in the xz plane. */
export function makePointGeometry(halfBase: number, length: number, top: boolean, depth = 0.008): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  const dir = top ? 1 : -1;
  s.moveTo(-halfBase, 0);
  s.lineTo(halfBase, 0);
  s.lineTo(0.02, dir * (length - 0.03));
  s.quadraticCurveTo(0, dir * length, -0.02, dir * (length - 0.03));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 4 });
  // shape lives in xy; lay it on the field so +y of the shape becomes +z of the world
  g.rotateX(Math.PI / 2);
  g.translate(0, depth, 0);
  return g;
}
