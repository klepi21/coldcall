/**
 * GPU particles for splashes, fireballs, sparks, smoke and burning cells. One instanced billboard
 * geometry, one draw call per pool. Motion is evaluated in the vertex shader from per particle
 * start values, so the CPU only writes a few floats when something is emitted, never per frame.
 * Premultiplied blending lets one material do additive fire (alpha out 0) and normal smoke.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec3 iVel;
attribute vec4 iTime;   // start, life, loop, gravity
attribute vec4 iC0;     // rgb start, additive (1) or normal (0)
attribute vec4 iC1;     // rgb end, peak alpha
attribute vec3 iSize;   // start size, end size, spin
uniform float uTime;
uniform vec3 uWind;
varying vec2 vUv;
varying vec3 vCol;
varying float vA;
varying float vAdd;
void main() {
  float age = uTime - iTime.x;
  if (iTime.z > 0.5) age = mod(age, iTime.y);
  float u = age / iTime.y;
  if (iTime.y <= 0.0 || u < 0.0 || u > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec3 p = iPos + iVel * age + vec3(0.0, -0.5 * iTime.w * age * age, 0.0) + uWind * age * age * 0.5 * (1.0 - iC0.w);
  float s = mix(iSize.x, iSize.y, sqrt(u));
  float a = iSize.z * age;
  vec2 corner = mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xy;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  mv.xy += corner * s;
  gl_Position = projectionMatrix * mv;
  vUv = position.xy + 0.5;
  vCol = mix(iC0.rgb, iC1.rgb, u);
  vA = iC1.w * smoothstep(0.0, 0.08, u) * (1.0 - smoothstep(0.55, 1.0, u));
  vAdd = iC0.w;
}
`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
varying float vA;
varying float vAdd;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float m = pow(max(1.0 - d, 0.0), 1.6);
  float a = m * vA;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol * a, a * (1.0 - vAdd));
}
`;

export interface Particle {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  start: number;
  life: number;
  loop?: boolean;
  gravity?: number;
  c0: [number, number, number];
  c1?: [number, number, number];
  alpha?: number;
  additive?: boolean;
  s0: number;
  s1?: number;
  spin?: number;
}

export class ParticlePool {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private geo: THREE.InstancedBufferGeometry;
  private attrs: Record<'iPos' | 'iVel' | 'iTime' | 'iC0' | 'iC1' | 'iSize', THREE.InstancedBufferAttribute>;
  private next = 0;
  readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.getAttribute('position'));
    const mk = (n: number) => new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n).setUsage(THREE.DynamicDrawUsage);
    this.attrs = { iPos: mk(3), iVel: mk(3), iTime: mk(4), iC0: mk(4), iC1: mk(4), iSize: mk(3) };
    for (const [k, a] of Object.entries(this.attrs)) this.geo.setAttribute(k, a);
    this.geo.instanceCount = capacity;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTime: { value: 0 }, uWind: { value: new THREE.Vector3(0.18, 0, -0.08) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  private write(i: number, p: Particle) {
    const a = this.attrs;
    a.iPos.setXYZ(i, p.x, p.y, p.z);
    a.iVel.setXYZ(i, p.vx ?? 0, p.vy ?? 0, p.vz ?? 0);
    a.iTime.setXYZW(i, p.start, p.life, p.loop ? 1 : 0, p.gravity ?? 0);
    const c1 = p.c1 ?? p.c0;
    a.iC0.setXYZW(i, p.c0[0], p.c0[1], p.c0[2], p.additive ? 1 : 0);
    a.iC1.setXYZW(i, c1[0], c1[1], c1[2], p.alpha ?? 1);
    a.iSize.setXYZ(i, p.s0, p.s1 ?? p.s0, p.spin ?? 0);
  }

  private flush() {
    for (const a of Object.values(this.attrs)) a.needsUpdate = true;
  }

  /** Ring buffer emit: oldest particles are recycled. */
  emit(list: Particle[]) {
    for (const p of list) {
      this.write(this.next, p);
      this.next = (this.next + 1) % this.capacity;
    }
    this.flush();
  }

  /** Replace the whole pool (persistent looping emitters). */
  set(list: Particle[]) {
    const n = Math.min(list.length, this.capacity);
    for (let i = 0; i < n; i++) this.write(i, list[i]!);
    for (let i = n; i < this.capacity; i++) this.attrs.iTime.setXYZW(i, 0, 0, 0, 0);
    this.flush();
  }

  setTime(t: number) {
    this.material.uniforms.uTime!.value = t;
  }

  dispose() {
    this.geo.dispose();
    this.material.dispose();
  }
}

/* ---------------- effect recipes (all original) ---------------- */

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const FIRE: [number, number, number] = [1.0, 0.55, 0.12];
const HOT: [number, number, number] = [1.0, 0.92, 0.6];
const EMBER: [number, number, number] = [0.6, 0.1, 0.02];

export function splashBurst(x: number, y: number, z: number, t: number): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < 46; i++) {
    const a = rnd(0, Math.PI * 2);
    const sp = rnd(0.05, 0.75);
    out.push({ x: x + Math.cos(a) * 0.08, y, z: z + Math.sin(a) * 0.08, vx: Math.cos(a) * sp, vy: rnd(2.6, 5.2), vz: Math.sin(a) * sp, start: t + rnd(0, 0.08), life: rnd(0.8, 1.15), gravity: 8.5, c0: [0.95, 0.98, 1], c1: [0.6, 0.8, 0.95], alpha: 0.85, s0: rnd(0.07, 0.16), s1: rnd(0.12, 0.24) });
  }
  for (let i = 0; i < 10; i++) {
    const a = rnd(0, Math.PI * 2);
    out.push({ x, y: y + 0.1, z, vx: Math.cos(a) * 0.5, vy: rnd(0.4, 1.0), vz: Math.sin(a) * 0.5, start: t + 0.05, life: rnd(1.0, 1.5), gravity: 0.3, c0: [0.85, 0.92, 1], alpha: 0.32, s0: 0.3, s1: 1.0 });
  }
  return out;
}

export function fireBurst(x: number, y: number, z: number, t: number, big: boolean): Particle[] {
  const out: Particle[] = [];
  const k = big ? 1.5 : 1;
  out.push({ x, y: y + 0.2, z, start: t, life: 0.18, c0: [1, 0.7, 0.35], additive: true, alpha: 0.8, s0: 0.5 * k, s1: 2.0 * k });
  out.push({ x, y: y + 0.3, z, start: t, life: 0.9, c0: [1, 0.5, 0.12], c1: [0.6, 0.1, 0.0], additive: true, alpha: 0.7, s0: 1.2 * k, s1: 2.4 * k });
  for (let i = 0; i < 18 * k; i++) {
    const a = rnd(0, Math.PI * 2);
    const sp = rnd(0.3, 1.4) * k;
    out.push({ x, y: y + 0.15, z, vx: Math.cos(a) * sp, vy: rnd(0.6, 2.2) * k, vz: Math.sin(a) * sp, start: t + rnd(0, 0.08), life: rnd(0.55, 1.0), gravity: -0.8, c0: [1, 0.75, 0.3], c1: [0.85, 0.16, 0.02], additive: true, alpha: 0.85, s0: rnd(0.45, 0.8) * k, s1: rnd(1.0, 1.6) * k, spin: rnd(-2, 2) });
  }
  for (let i = 0; i < 34 * k; i++) {
    const a = rnd(0, Math.PI * 2);
    const up = rnd(0.2, 1);
    const sp = rnd(1.5, 4.5);
    out.push({ x, y: y + 0.2, z, vx: Math.cos(a) * sp * (1 - up * 0.5), vy: up * sp * 1.4, vz: Math.sin(a) * sp * (1 - up * 0.5), start: t, life: rnd(0.5, 1.1), gravity: 7, c0: HOT, c1: FIRE, additive: true, alpha: 1, s0: 0.06, s1: 0.03 });
  }
  for (let i = 0; i < 12 * k; i++) {
    out.push({ x: x + rnd(-0.2, 0.2), y: y + 0.3, z: z + rnd(-0.2, 0.2), vx: rnd(-0.25, 0.25), vy: rnd(0.6, 1.2), vz: rnd(-0.25, 0.25), start: t + rnd(0.15, 0.4), life: rnd(1.8, 3), gravity: -0.05, c0: [0.25, 0.16, 0.12], c1: [0.42, 0.44, 0.5], alpha: 0.5, s0: 0.4, s1: 1.6 * k, spin: rnd(-0.6, 0.6) });
  }
  // water thrown up around the impact
  for (let i = 0; i < 14; i++) {
    const a = rnd(0, Math.PI * 2);
    out.push({ x, y, z, vx: Math.cos(a) * 0.6, vy: rnd(1.5, 3), vz: Math.sin(a) * 0.6, start: t, life: 0.8, gravity: 8, c0: [0.8, 0.9, 1], alpha: 0.35, s0: 0.07, s1: 0.12 });
  }
  return out;
}

export function trail(x: number, y: number, z: number, t: number): Particle[] {
  return [
    { x, y, z, start: t, life: 0.4, c0: [0.9, 1, 0.6], c1: [1, 0.45, 0.1], additive: true, alpha: 0.9, s0: 0.42, s1: 0.08 },
    { x, y, z, vy: 0.1, start: t, life: 0.9, c0: [0.5, 0.55, 0.6], alpha: 0.18, s0: 0.1, s1: 0.4 },
  ];
}

/** Looping fire and smoke over a cell. heavy = fresh hit (big flames), light = sunk wreck. */
export function burning(x: number, y: number, z: number, seed: number, heavy: boolean): Particle[] {
  const out: Particle[] = [];
  const r = (i: number) => {
    const s = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  const flames = heavy ? 12 : 5;
  for (let i = 0; i < flames; i++) {
    const life = 0.6 + r(i) * 0.45;
    out.push({ x: x + (r(i + 10) - 0.5) * 0.32, y: y + 0.08, z: z + (r(i + 20) - 0.5) * 0.32, vx: 0, vy: 1.0 + r(i + 30) * 0.7, vz: 0, start: -r(i + 40) * life, life, loop: true, c0: HOT, c1: [0.85, 0.15, 0.02], additive: true, alpha: heavy ? 1 : 0.8, s0: heavy ? 0.62 : 0.38, s1: 0.14, spin: (r(i + 50) - 0.5) * 3 });
  }
  // soft glow pool that breathes under the flames
  out.push({ x, y: y + 0.12, z, start: -r(200) * 1.6, life: 1.6, loop: true, c0: [1, 0.45, 0.1], c1: [1, 0.35, 0.05], additive: true, alpha: heavy ? 0.4 : 0.22, s0: heavy ? 1.3 : 0.9, s1: heavy ? 1.5 : 1.0 });
  const smokes = heavy ? 6 : 5;
  for (let i = 0; i < smokes; i++) {
    const life = 2.6 + r(i + 60) * 1.4;
    out.push({ x: x + (r(i + 70) - 0.5) * 0.2, y: y + 0.35, z, vx: (r(i + 80) - 0.5) * 0.1, vy: 0.55 + r(i + 90) * 0.3, vz: 0, start: -r(i + 100) * life, life, loop: true, c0: [0.3, 0.2, 0.16], c1: [0.42, 0.45, 0.52], alpha: heavy ? 0.42 : 0.36, s0: 0.3, s1: 1.4 + r(i + 110) * 0.6, spin: (r(i + 120) - 0.5) });
  }
  if (heavy) {
    for (let i = 0; i < 3; i++) {
      const life = 1.2 + r(i + 130);
      out.push({ x, y: y + 0.2, z, vx: (r(i + 140) - 0.5) * 0.6, vy: 1.1 + r(i + 150), vz: (r(i + 160) - 0.5) * 0.6, start: -r(i + 170) * life, life, loop: true, gravity: 0.6, c0: HOT, c1: EMBER, additive: true, alpha: 1, s0: 0.05, s1: 0.02 });
    }
  }
  return out;
}
