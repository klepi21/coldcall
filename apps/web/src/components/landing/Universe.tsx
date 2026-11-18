'use client';
/**
 * The Cold Call universe: a gold vault coin with four game worlds in orbit, in a violet nebula.
 * Lazy loaded by UniverseStage (never server rendered). Scroll progress drives a camera journey
 * from the wide hero view to each world in turn. Procedural geometry and canvas textures only.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as THREE from 'three';
import type { MotionValue } from 'motion/react';
import {
  atmosphereMaterial,
  cardTexture,
  chessSurface,
  cloudTexture,
  diceFaces,
  dotTexture,
  glowTexture,
  knightGeometry,
  oceanGrid,
  oceanSurface,
  pawnGeometry,
  shipGeometry,
  tichuSurface,
  woodSurface,
} from './universeAssets';

export type WorldId = 'chess' | 'backgammon' | 'tichu' | 'seabattle';
export const JOURNEY: WorldId[] = ['chess', 'backgammon', 'tichu', 'seabattle'];
const TINT: Record<WorldId, string> = { chess: '#c6ff3d', backgammon: '#ff8a3d', tichu: '#ff4d8d', seabattle: '#3ddcff' };

const ORBIT_R = 2.6;
const PLANET_R = 0.55;
const FOV = 38;
const TAN = Math.tan(((FOV / 2) * Math.PI) / 180);

export interface UniverseProps {
  /** 0..1 over the journey wrapper (hero then four stops). */
  progress: MotionValue<number>;
  /** 'wide': desktop sticky journey. 'band': phone and tablet hero band, no journey. */
  layout: 'wide' | 'band';
  active: boolean;
  onReady: () => void;
}

/** Shared mutable state between the rig and the worlds (no React re-renders per frame). */
interface Shared {
  worlds: (THREE.Object3D | null)[];
  p: number;
  orbitSpeed: number;
}

export default function Universe({ progress, layout, active, onReady }: UniverseProps) {
  const shared = useMemo<Shared>(() => ({ worlds: [null, null, null, null], p: 0, orbitSpeed: 1 }), []);
  const phone = typeof window !== 'undefined' && window.innerWidth < 768;
  return (
    <Canvas
      frameloop={active ? 'always' : 'never'}
      dpr={[1, phone ? 1.5 : 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ fov: FOV, near: 0.1, far: 200, position: [0, 2, 12] }}
      style={{ position: 'absolute', inset: 0 }}
      aria-hidden
    >
      <Lights />
      <Environment resolution={64} frames={1}>
        <Lightformer form="ring" intensity={3} color="#fff4d6" position={[0, 4, 6]} scale={5} />
        <Lightformer form="rect" intensity={2} color="#7c5cff" position={[-6, 0, 2]} scale={[2, 8, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#3ddcff" position={[6, -1, 2]} scale={[2, 6, 1]} />
        <Lightformer form="circle" intensity={1.2} color="#ff4d8d" position={[0, -5, -2]} scale={4} />
      </Environment>
      <Stars />
      <Nebula />
      <Rig progress={progress} layout={layout} shared={shared} />
      <VaultCoin />
      <group rotation={layout === 'wide' ? [0.35, 0, -1.05] : [0.3, 0, -0.06]}>
        <OrbitLine />
        {JOURNEY.map((w, i) => (
          <Orbiter key={w} index={i} shared={shared}>
            {w === 'chess' ? <ChessWorld /> : w === 'backgammon' ? <BackgammonWorld /> : w === 'tichu' ? <TichuWorld /> : <SeaWorld />}
          </Orbiter>
        ))}
      </group>
      <ReadySignal onReady={onReady} />
    </Canvas>
  );
}

function ReadySignal({ onReady }: { onReady: () => void }) {
  const n = useRef(0);
  useFrame(() => {
    n.current++;
    if (n.current === 3) onReady();
  });
  return null;
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.35} color="#8b7bff" />
      <directionalLight position={[5, 6, 6]} intensity={1.6} color="#ffffff" />
      <directionalLight position={[-6, -2, -4]} intensity={0.6} color="#7c5cff" />
      <pointLight position={[0, 0, 0]} intensity={14} distance={9} decay={1.6} color="#ffcf4a" />
    </>
  );
}

/* ------------------------------------------------------------------ camera */

const smooth = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function Rig({ progress, layout, shared }: { progress: MotionValue<number>; layout: 'wide' | 'band'; shared: Shared }) {
  const { camera, size } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const pointer = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const look = useRef(new THREE.Vector3());
  const film = useRef(0);
  const tmp = useMemo(
    () => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), ta: new THREE.Vector3(), tb: new THREE.Vector3(), w: new THREE.Vector3(), out: new THREE.Vector3(), side: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }),
    [],
  );

  useEffect(() => {
    const mv = (e: PointerEvent) => {
      pointer.current.tx = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.ty = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', mv, { passive: true });
    return () => window.removeEventListener('pointermove', mv);
  }, []);

  /** Wide hero framing: the coin sits in the gap between the text column and the mini game card. */
  const heroPose = (outPos: THREE.Vector3, outLook: THREE.Vector3) => {
    const { width: w, height: h } = size;
    let ppu: number;
    let f = 0;
    if (layout === 'wide') {
      // Centre on the gap between the text column (430px) and the mini game card (352px).
      // The orbit is tilted about 60 degrees, so its width is about half its radius; perspective
      // magnifies the near side by up to 1.3x. Size it so nothing reaches the text column.
      const contentLeft = Math.max(0, (w - 1200) / 2) + 24;
      const textRight = contentLeft + 430;
      const cardLeft = w - contentLeft - 352;
      const half = (cardLeft - textRight) / 2 - 10;
      ppu = Math.min(h / 11, half / ((ORBIT_R * 0.5 + PLANET_R) * 1.3));
      f = (textRight + cardLeft) / 2 / w - 0.5;
    } else {
      ppu = Math.min((w * 0.45) / (ORBIT_R + PLANET_R), (h * 0.42) / 1.45);
    }
    const d = h / (2 * TAN * ppu);
    const el = layout === 'wide' ? 0.3 : 0.3;
    outPos.set(0, Math.sin(el) * d, Math.cos(el) * d);
    outLook.set(0, layout === 'band' ? -0.1 : 0, 0);
    return f;
  };

  /** Close up on world k (0..3): camera outside the orbit, slightly above and to the side. */
  const worldPose = (k: number, outPos: THREE.Vector3, outLook: THREE.Vector3) => {
    const o = shared.worlds[k];
    if (!o) return heroPose(outPos, outLook);
    o.getWorldPosition(tmp.w);
    // aim a little above the planet's centre so the piece on top stays in frame
    outLook.copy(tmp.w).y += 0.18;
    // straight out from the coin, then pulled towards the viewer so the coin glows behind, off centre
    tmp.out.copy(tmp.w).normalize().multiplyScalar(0.75).add(tmp.side.set(0, 0.15, 0.6)).normalize();
    tmp.side.crossVectors(tmp.up, tmp.out).normalize();
    const D = 3.0;
    outPos.copy(tmp.w).addScaledVector(tmp.out, D).addScaledVector(tmp.side, k % 2 ? -0.9 : 0.9).addScaledVector(tmp.up, 0.35);
    // even stops: copy on the left, world on the right; odd stops the other way round
    return k % 2 ? -0.2 : 0.2;
  };

  const pose = (stop: number, outPos: THREE.Vector3, outLook: THREE.Vector3) => (stop <= 0 ? heroPose(outPos, outLook) : worldPose(stop - 1, outPos, outLook));

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const p = layout === 'wide' ? clamp01(progress.get()) * JOURNEY.length : 0;
    shared.p = p;
    shared.orbitSpeed = 1 - smooth(clamp01((p - 0.05) / 0.6));

    const i = Math.min(JOURNEY.length - 1, Math.floor(p));
    // dwell at each stop: travel happens in the middle 60% between stops
    const t = smooth(clamp01((p - i - 0.2) / 0.6));
    const fa = pose(i, tmp.a, tmp.ta);
    const fb = pose(Math.min(JOURNEY.length, i + 1), tmp.b, tmp.tb);

    // interpolate around the coin (cylindrical) so the camera swings instead of cutting through
    const ra = Math.hypot(tmp.a.x, tmp.a.z);
    const rb = Math.hypot(tmp.b.x, tmp.b.z);
    const aa = Math.atan2(tmp.a.x, tmp.a.z);
    let ab = Math.atan2(tmp.b.x, tmp.b.z);
    if (ab - aa > Math.PI) ab -= Math.PI * 2;
    if (aa - ab > Math.PI) ab += Math.PI * 2;
    const ang = aa + (ab - aa) * t;
    const r = ra + (rb - ra) * t;
    const y = tmp.a.y + (tmp.b.y - tmp.a.y) * t;
    const want = tmp.w.set(Math.sin(ang) * r, y, Math.cos(ang) * r);
    const wantLook = tmp.ta.lerp(tmp.tb, t);
    const wantFilm = fa + (fb - fa) * t;

    // pointer parallax, gentle, smaller once close to a world
    const pt = pointer.current;
    pt.x += (pt.tx - pt.x) * (1 - Math.exp(-dt * 3));
    pt.y += (pt.ty - pt.y) * (1 - Math.exp(-dt * 3));
    const par = p > 0.5 ? 0.25 : 0.6;
    tmp.side.set(Math.cos(ang), 0, -Math.sin(ang));
    want.addScaledVector(tmp.side, pt.x * par).addScaledVector(tmp.up, -pt.y * par * 0.6);

    const k = 1 - Math.exp(-dt * 5);
    if (state.clock.elapsedTime < 0.2) {
      cam.position.copy(want);
      look.current.copy(wantLook);
      film.current = wantFilm;
    } else {
      cam.position.lerp(want, k);
      look.current.lerp(wantLook, k);
      film.current += (wantFilm - film.current) * k;
    }
    cam.lookAt(look.current);
    // shift the frustum so the focus lands at (0.5 + film) of the width
    cam.filmOffset = -film.current * cam.aspect * 2 * TAN * cam.getFilmWidth();
    cam.updateProjectionMatrix();
  });
  return null;
}

/* ------------------------------------------------------------------ backdrop */

function Stars() {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const n = 2200;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const palette = [new THREE.Color('#ffffff'), new THREE.Color('#cfc8ff'), new THREE.Color('#ffe9a8'), new THREE.Color('#bfe9ff'), new THREE.Color('#ffc4dc')];
    let s = 99;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1;
      const th = r() * Math.PI * 2;
      const rad = 30 + r() * 60;
      const q = Math.sqrt(1 - u * u);
      pos.set([Math.cos(th) * q * rad, u * rad * 0.7, Math.sin(th) * q * rad], i * 3);
      const c = palette[Math.floor(r() * palette.length)]!;
      const b = 0.5 + r() * 0.5;
      col.set([c.r * b, c.g * b, c.b * b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }, []);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += Math.min(dt, 0.05) * 0.006;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.32} sizeAttenuation vertexColors map={dotTexture()} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

function Nebula() {
  const clouds = useMemo(
    () => [
      { p: [-14, 6, -40], s: 46, c: '#7c5cff', o: 0.55 },
      { p: [16, -4, -48], s: 52, c: '#5b3df5', o: 0.5 },
      { p: [4, 10, -55], s: 40, c: '#ff4d8d', o: 0.22 },
      { p: [-8, -10, -36], s: 34, c: '#3ddcff', o: 0.16 },
      { p: [22, 12, -30], s: 26, c: '#c6ff3d', o: 0.06 },
      { p: [0, 0, -70], s: 90, c: '#2a1a7a', o: 0.6 },
    ],
    [],
  );
  return (
    <group>
      {clouds.map((c, i) => (
        <sprite key={i} position={c.p as [number, number, number]} scale={[c.s, c.s, 1]}>
          <spriteMaterial map={cloudTexture()} color={c.c} opacity={c.o} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      ))}
    </group>
  );
}

function OrbitLine() {
  return (
    <>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[ORBIT_R, 0.008, 6, 160]} />
        <meshBasicMaterial color="#9a86ff" transparent opacity={0.4} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[ORBIT_R * 1.35, 0.005, 6, 160]} />
        <meshBasicMaterial color="#7c5cff" transparent opacity={0.18} />
      </mesh>
    </>
  );
}

/* ------------------------------------------------------------------ vault coin */

function VaultCoin() {
  const ref = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Points>(null);
  const bar = useMemo(() => new RoundedBoxGeometry(0.92, 0.2, 0.09, 3, 0.05), []);
  const ringGeo = useMemo(() => {
    const n = 260;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 1.9 + Math.sin(i * 12.9898) * 0.14;
      pos.set([Math.cos(a) * r, Math.sin(i * 78.233) * 0.05, Math.sin(a) * r], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (ref.current) {
      ref.current.rotation.y = Math.sin(t * 0.45) * 0.38;
      ref.current.rotation.x = Math.sin(t * 0.3) * 0.08;
      ref.current.position.y = Math.sin(t * 0.8) * 0.06;
    }
    if (ring.current) ring.current.rotation.y += Math.min(dt, 0.05) * 0.25;
  });
  const gold = { color: '#ffd650', metalness: 0.8, roughness: 0.28, emissive: '#a86e00', emissiveIntensity: 0.75 } as const;
  return (
    <group>
      <sprite scale={[8, 8, 1]} position={[0, 0, -0.6]}>
        <spriteMaterial map={glowTexture('rgba(255,200,60,0.9)')} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.7} />
      </sprite>
      <group rotation={[0.25, 0, 0]}>
        <points ref={ring} geometry={ringGeo}>
          <pointsMaterial size={0.05} color="#ffd23f" map={dotTexture()} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </points>
      </group>
      <group ref={ref} scale={1.3}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1.08, 1.08, 0.2, 72]} />
          <meshStandardMaterial {...gold} />
        </mesh>
        <mesh>
          <torusGeometry args={[1.08, 0.07, 12, 72]} />
          <meshStandardMaterial {...gold} roughness={0.18} />
        </mesh>
        {[1, -1].map((side) => (
          <group key={side} position={[0, 0, side * 0.1]}>
            <mesh>
              <torusGeometry args={[0.86, 0.022, 8, 72]} />
              <meshStandardMaterial color="#b37a00" metalness={1} roughness={0.4} />
            </mesh>
            <mesh geometry={bar} position={[0, 0.17, side * 0.03]}>
              <meshStandardMaterial color="#ffe27a" metalness={1} roughness={0.18} emissive="#7a5200" emissiveIntensity={0.5} />
            </mesh>
            <mesh geometry={bar} position={[0, -0.17, side * 0.03]}>
              <meshStandardMaterial color="#ffe27a" metalness={1} roughness={0.18} emissive="#7a5200" emissiveIntensity={0.5} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ worlds */

function Orbiter({ index, shared, children }: { index: number; shared: Shared; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const angle = useRef((index / 4) * Math.PI * 2 + 0.6);
  useEffect(() => {
    shared.worlds[index] = ref.current;
  }, [index, shared]);
  const upright = useRef<THREE.Group>(null);
  const q = useMemo(() => new THREE.Quaternion(), []);
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    angle.current += dt * 0.09 * shared.orbitSpeed;
    // As the journey starts, glide to the nearest copy of the starting layout, so every visitor
    // gets the same composition at each stop however long they stayed in the hero.
    const lock = 1 - shared.orbitSpeed;
    if (lock > 0) {
      const base = (index / 4) * Math.PI * 2 + 0.6;
      const target = base + Math.PI * 2 * Math.round((angle.current - base) / (Math.PI * 2));
      angle.current += (target - angle.current) * (1 - Math.exp(-dt * 4 * lock));
    }
    const a = angle.current;
    if (!ref.current) return;
    ref.current.position.set(Math.cos(a) * ORBIT_R, Math.sin(state.clock.elapsedTime * 0.6 + index) * 0.08, Math.sin(a) * ORBIT_R);
    // keep each world upright whatever the tilt of the orbit plane
    if (upright.current && ref.current.parent) upright.current.quaternion.copy(ref.current.parent.getWorldQuaternion(q).invert());
  });
  return (
    <group ref={ref}>
      <group ref={upright}>{children}</group>
    </group>
  );
}

function Planet({ map, tint, emissiveMap, roughness = 0.55, metalness = 0.05, spin = 0.12 }: { map: THREE.Texture; tint: string; emissiveMap?: THREE.Texture; roughness?: number; metalness?: number; spin?: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const atmo = useMemo(() => atmosphereMaterial(tint), [tint]);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += Math.min(dt, 0.05) * spin;
  });
  return (
    <>
      <mesh ref={ref}>
        <sphereGeometry args={[PLANET_R, 48, 32]} />
        <meshStandardMaterial map={map} roughness={roughness} metalness={metalness} emissive={emissiveMap ? tint : '#000000'} emissiveMap={emissiveMap ?? null} emissiveIntensity={emissiveMap ? 0.6 : 0} />
      </mesh>
      <mesh material={atmo} scale={1.22}>
        <sphereGeometry args={[PLANET_R, 32, 24]} />
      </mesh>
      <pointLight intensity={2.2} distance={2.6} decay={1.5} color={tint} position={[0, PLANET_R * 1.6, PLANET_R * 1.2]} />
    </>
  );
}

function ChessWorld() {
  const aurora = useRef<THREE.Group>(null);
  const knight = useRef<THREE.Group>(null);
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (aurora.current) aurora.current.rotation.y += Math.min(dt, 0.05) * 0.5;
    if (knight.current) {
      knight.current.position.y = PLANET_R - 0.02 + Math.max(0, Math.sin(t * 1.1)) * 0.06;
      knight.current.rotation.y = Math.sin(t * 0.4) * 0.6 + 0.5;
    }
  });
  return (
    <group>
      <Planet map={chessSurface()} tint="#c6ff3d" roughness={0.25} metalness={0.15} spin={0.08} />
      <group ref={knight} position={[0, PLANET_R, 0]} scale={0.7}>
        <mesh geometry={knightGeometry()}>
          <meshStandardMaterial color="#f4f2ec" roughness={0.22} metalness={0.05} />
        </mesh>
      </group>
      <group position={[0.38, 0.32, 0.14]} rotation={[0, 0, -0.85]} scale={0.42}>
        <mesh geometry={pawnGeometry()}>
          <meshStandardMaterial color="#141220" roughness={0.15} metalness={0.4} />
        </mesh>
      </group>
      <group ref={aurora}>
        <mesh rotation={[1.25, 0, 0.3]}>
          <torusGeometry args={[0.86, 0.012, 6, 96]} />
          <meshBasicMaterial color="#c6ff3d" transparent opacity={0.85} blending={THREE.AdditiveBlending} />
        </mesh>
        <mesh rotation={[1.5, 0.4, 0]}>
          <torusGeometry args={[0.96, 0.006, 6, 96]} />
          <meshBasicMaterial color="#e4ff9a" transparent opacity={0.5} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
    </group>
  );
}

function Die({ phase }: { phase: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => new RoundedBoxGeometry(0.2, 0.2, 0.2, 3, 0.035), []);
  const mats = useMemo(() => diceFaces().map((t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.35 })), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime * 0.7 + phase;
    if (!ref.current) return;
    ref.current.position.set(Math.cos(t) * 0.98, 0.28 + Math.sin(t * 2) * 0.12, Math.sin(t) * 0.98);
    // tumble in bursts: fast spin, then a short settle
    const burst = (state.clock.elapsedTime + phase) % 3;
    const sp = burst < 0.9 ? 6 : 0.4;
    ref.current.rotation.x += 0.016 * sp;
    ref.current.rotation.y += 0.012 * sp;
  });
  return <mesh ref={ref} geometry={geo} material={mats} />;
}

function BackgammonWorld() {
  const ring = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ring.current) ring.current.rotation.z += Math.min(dt, 0.05) * 0.2;
  });
  return (
    <group>
      <Planet map={woodSurface()} tint="#ff8a3d" roughness={0.6} spin={0.1} />
      <group rotation={[1.2, 0.2, 0]}>
        <group ref={ring}>
          <mesh>
            <ringGeometry args={[0.74, 0.92, 72]} />
            <meshStandardMaterial color="#e2b25a" metalness={0.7} roughness={0.4} emissive="#5a3500" emissiveIntensity={0.5} side={THREE.DoubleSide} />
          </mesh>
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i / 10) * Math.PI * 2;
            return (
              <mesh key={i} position={[Math.cos(a) * 0.83, Math.sin(a) * 0.83, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.055, 0.055, 0.03, 18]} />
                <meshStandardMaterial color={i % 2 ? '#1a0f08' : '#fff2dc'} roughness={0.35} />
              </mesh>
            );
          })}
        </group>
      </group>
      <Die phase={0} />
      <Die phase={Math.PI} />
    </group>
  );
}

const CARDS = [
  { rank: 'A', color: '#1f9d55', sym: 'jade' as const },
  { rank: 'K', color: '#16161c', sym: 'sword' as const },
  { rank: 'Q', color: '#1f5fd6', sym: 'pagoda' as const },
  { rank: 'J', color: '#d1312b', sym: 'star' as const },
  { rank: '', color: '#ff4d8d', sym: 'dragon' as const },
];

function TichuWorld() {
  const ref = useRef<THREE.Group>(null);
  useFrame((state, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += Math.min(dt, 0.05) * 0.35;
    ref.current.children.forEach((c, i) => {
      c.position.y = Math.sin(state.clock.elapsedTime * 1.2 + i) * 0.08 + 0.1;
    });
  });
  return (
    <group>
      <Planet map={tichuSurface()} tint="#ff4d8d" roughness={0.4} spin={0.14} />
      <group ref={ref} rotation={[0.2, 0, 0.15]}>
        {CARDS.map((c, i) => {
          const a = (i / CARDS.length) * Math.PI * 2;
          const dragon = c.sym === 'dragon';
          return (
            <group key={i} position={[Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95]} rotation={[0, -a + Math.PI / 2, 0.18]}>
              <mesh>
                <planeGeometry args={[0.3, 0.42]} />
                <meshStandardMaterial
                  map={cardTexture(c.rank, c.color, c.sym)}
                  side={THREE.DoubleSide}
                  roughness={0.5}
                  emissive={dragon ? '#ff4d8d' : '#000000'}
                  emissiveMap={dragon ? cardTexture(c.rank, c.color, c.sym) : null}
                  emissiveIntensity={dragon ? 1.1 : 0}
                />
              </mesh>
              {dragon ? (
                <sprite scale={[0.9, 0.9, 1]} position={[0, 0, -0.02]}>
                  <spriteMaterial map={glowTexture('rgba(255,77,141,0.9)')} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.8} />
                </sprite>
              ) : null}
            </group>
          );
        })}
      </group>
    </group>
  );
}

function SeaWorld() {
  const sail = useRef<THREE.Group>(null);
  const sonar = useRef<THREE.Mesh>(null);
  const sonarMat = useRef<THREE.MeshBasicMaterial>(null);
  const lat = 0.9;
  const normal = useMemo(() => new THREE.Vector3(0, Math.cos(lat), Math.sin(lat)), []);
  const quat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal), [normal]);
  useFrame((state, dt) => {
    const d = Math.min(dt, 0.05);
    if (sail.current) sail.current.rotation.y += d * 0.35;
    const ph = (state.clock.elapsedTime % 2.4) / 2.4;
    if (sonar.current) sonar.current.scale.setScalar(1 + ph * 0.9);
    if (sonarMat.current) sonarMat.current.opacity = 0.8 * (1 - ph);
  });
  return (
    <group>
      <Planet map={oceanSurface()} emissiveMap={oceanGrid()} tint="#3ddcff" roughness={0.18} metalness={0.2} spin={0.05} />
      <group ref={sail}>
        <group position={normal.clone().multiplyScalar(PLANET_R + 0.005)} quaternion={quat} scale={0.6}>
          <mesh geometry={shipGeometry()}>
            <meshStandardMaterial color="#9aa7bd" roughness={0.45} metalness={0.5} />
          </mesh>
          {/* wake */}
          <mesh position={[-0.75, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.6, 0.12]} />
            <meshBasicMaterial color="#bff4ff" transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        </group>
      </group>
      <mesh ref={sonar} rotation={[Math.PI / 2 - 0.25, 0, 0]}>
        <torusGeometry args={[PLANET_R * 1.08, 0.008, 6, 96]} />
        <meshBasicMaterial ref={sonarMat} color="#3ddcff" transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}
