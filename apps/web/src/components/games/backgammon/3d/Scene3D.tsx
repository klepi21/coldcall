'use client';
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Environment, Html, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { BAR_X, BOT, FIELD_END, FX, H, LEFT_X, MID, PL, PW, RIGHT_X, TOP, TRAY, TRAY_X, W, colRow, colX, hitTest, type Where } from '../geometry';
import { CASE, CH, CR, WALL_H, toSvg, wx, wz, type V3 } from './layout';
import { DIE_FACES, faceUpQuat, makeCheckerGeometry, makeDieGeometry, makePointGeometry } from './geometries';
import { makeDieFace, makeEdgeShade, makeFelt, makeWood } from './textures';

/* ------------------------------------------------------------------ types */

export interface CheckerSpec {
  key: string;
  seat: number;
  p: V3;
  /** Borne off: stands on its edge in the tray. */
  edge?: boolean;
  lift?: number;
}
export interface RingSpec {
  key: string;
  p: V3;
  active: boolean;
  focus: boolean;
}
export interface DestSpec {
  key: string;
  kind: 'point' | 'off';
  /** perspective point for column glows */
  c?: number;
  p: V3;
  dice: number[];
  blot: boolean;
  focus: boolean;
  /** the viewer's half of the tray (bear off) */
  mine?: boolean;
}
export interface FlySpec {
  key: string;
  seat: number;
  from: V3;
  to: V3;
  hop: boolean;
  fromEdge: boolean;
  toEdge: boolean;
}
export interface DiceSpec {
  rollKey: string;
  values: number[];
  used: boolean[];
  /** half of the board the dice land in */
  side: 'left' | 'right';
  /** thrown from the viewer's edge (true) or the far edge */
  near: boolean;
}
export interface SceneProps {
  checkers: CheckerSpec[];
  badges: { key: string; p: V3; n: number }[];
  rings: RingSpec[];
  dests: DestSpec[];
  fly: FlySpec | null;
  dice: DiceSpec | null;
  primary: string;
  mySeat: number;
  /** latest tap handler (a ref, so the raycast handler never holds a stale closure) */
  onTap: React.MutableRefObject<(w: Where | null) => void>;
  onFlyDone: (key: string) => void;
  parallax: React.MutableRefObject<{ x: number; y: number }>;
}

/* ------------------------------------------------------------------ shared resources */

const FIELD_Y = 0;
const POINT_D = 0.008;
const SEAT_Y = POINT_D; // checkers rest on the point inlays
const DIE = 0.46;

function useResources() {
  return useMemo(() => {
    const frameWood = makeWood({ light: '#D9BE93', dark: '#A88559', seed: 7, rings: 9 });
    const fieldWood = makeWood({ light: '#EAD7B6', dark: '#C9AA7E', seed: 21, rings: 6 });
    const felt = makeFelt('#5B7FA8');
    // veneer for the inlaid points: pale maple and a terracotta stained wood
    const veneer = (light: string, dark: string, seed: number) => {
      const { map } = makeWood({ light, dark, seed, rings: 5, width: 512, height: 128 });
      map.center.set(0.5, 0.5);
      map.rotation = Math.PI / 2;
      map.repeat.set(0.35, 1.2);
      return map;
    };
    const ivoryVeneer = veneer('#F4F9FF', '#D3E6F6', 31);
    const terraVeneer = veneer('#6F9FE6', '#3F6FB8', 37);
    const wood = (base: ReturnType<typeof makeWood>, rx: number, ry: number, rot: boolean) => {
      const map = base.map.clone();
      const rough = base.rough.clone();
      for (const t of [map, rough]) {
        t.repeat.set(rx, ry);
        if (rot) {
          t.center.set(0.5, 0.5);
          t.rotation = Math.PI / 2;
        }
        t.needsUpdate = true;
      }
      return new THREE.MeshStandardMaterial({ map, roughnessMap: rough, roughness: 0.9, metalness: 0, envMapIntensity: 0.6 });
    };
    const mats = {
      frameH: wood(frameWood, 1, 0.12, false),
      frameV: wood(frameWood, 1, 0.1, true),
      bar: wood(frameWood, 1, 0.14, true),
      base: wood(frameWood, 1, 1, false),
      field: wood(fieldWood, 1, 1.1, true),
      tray: new THREE.MeshStandardMaterial({ map: felt, roughness: 1, metalness: 0 }),
      ivoryPoint: new THREE.MeshPhysicalMaterial({ map: ivoryVeneer, roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.4 }),
      terraPoint: new THREE.MeshPhysicalMaterial({ map: terraVeneer, roughness: 0.55, clearcoat: 0.4, clearcoatRoughness: 0.4 }),
      inlay: new THREE.MeshStandardMaterial({ color: '#EAF4FC', roughness: 0.45 }),
      brass: new THREE.MeshStandardMaterial({ color: '#BFD8EE', roughness: 0.22, metalness: 0.85 }),
      groove: new THREE.MeshStandardMaterial({ color: '#6B5232', roughness: 1 }),
      checker: [
        new THREE.MeshPhysicalMaterial({ color: '#EAF7FF', roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.5, sheenColor: new THREE.Color('#7FE3FF') }),
        new THREE.MeshPhysicalMaterial({ color: '#1F4C8C', roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08, metalness: 0.02, sheen: 0.4, sheenColor: new THREE.Color('#9CC2F7') }),
      ],
      shadow: new THREE.ShadowMaterial({ opacity: 0.32 }),
      edgeShade: new THREE.MeshBasicMaterial({ map: makeEdgeShade(), transparent: true, depthWrite: false, toneMapped: false }),
    };
    const dieFaces = DIE_FACES.map((v) => makeDieFace(v));
    const dieMats = dieFaces.map((map) => new THREE.MeshPhysicalMaterial({ map, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.15 }));
    const dieMatsUsed = dieFaces.map((map) => new THREE.MeshPhysicalMaterial({ map, color: '#D8EEFA', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.1, transmission: 0, sheen: 0.4, sheenColor: new THREE.Color('#7FE3FF') }));
    const geo = {
      checker: makeCheckerGeometry(),
      die: makeDieGeometry(DIE, 0.065),
      pointTop: makePointGeometry(PW * 0.01 / 2 - 0.035, PL * 0.01, true, POINT_D),
      pointBot: makePointGeometry(PW * 0.01 / 2 - 0.035, PL * 0.01, false, POINT_D),
      glowTop: makePointGeometry(PW * 0.01 / 2 - 0.02, PL * 0.01 + 0.04, true, 0.002),
      glowBot: makePointGeometry(PW * 0.01 / 2 - 0.02, PL * 0.01 + 0.04, false, 0.002),
      ring: new THREE.TorusGeometry(CR + 0.035, 0.016, 10, 48),
      ringFat: new THREE.TorusGeometry(CR + 0.04, 0.026, 10, 48),
      disc: new THREE.CircleGeometry(CR - 0.01, 40),
      box: new THREE.BoxGeometry(1, 1, 1),
      hinge: new THREE.CylinderGeometry(0.045, 0.045, 0.6, 20),
    };
    return { mats, dieMats, dieMatsUsed, geo };
  }, []);
}
type Res = ReturnType<typeof useResources>;

/* ------------------------------------------------------------------ the case */

/** A box given in SVG units on x and z and world units on y. */
function Slab({ x0, x1, z0, z1, y0, y1, mat, res, cast = true }: { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number; mat: THREE.Material; res: Res; cast?: boolean }) {
  return (
    <mesh
      geometry={res.geo.box}
      material={mat}
      position={[(wx(x0) + wx(x1)) / 2, (y0 + y1) / 2, (wz(z0) + wz(z1)) / 2]}
      scale={[wx(x1) - wx(x0), y1 - y0, wz(z1) - wz(z0)]}
      castShadow={cast}
      receiveShadow
    />
  );
}

const TRAY_END = TRAY_X + TRAY;

const Case = memo(function Case({ res }: { res: Res }) {
  const { mats, geo } = res;
  const points = [];
  for (let c = 0; c < 24; c++) {
    const { col, top } = colRow(c);
    const terracotta = (col + (top ? 0 : 1)) % 2 === 0;
    points.push(
      <mesh
        key={c}
        geometry={top ? geo.pointTop : geo.pointBot}
        material={terracotta ? mats.terraPoint : mats.ivoryPoint}
        position={[wx(colX(col)), FIELD_Y, wz(top ? TOP : BOT)]}
        receiveShadow
      />,
    );
  }
  const Y_IN = 0.012; // inlay line on the walls
  const bx = BAR_X + (RIGHT_X - BAR_X) / 2;
  return (
    <group>
      {/* base and fields */}
      <Slab x0={CASE.x0} x1={CASE.x1} z0={CASE.y0} z1={CASE.y1} y0={-0.2} y1={-0.004} mat={mats.base} res={res} />
      <Slab x0={LEFT_X} x1={BAR_X} z0={TOP} z1={BOT} y0={-0.02} y1={FIELD_Y} mat={mats.field} res={res} cast={false} />
      <Slab x0={RIGHT_X} x1={FIELD_END} z0={TOP} z1={BOT} y0={-0.02} y1={FIELD_Y} mat={mats.field} res={res} cast={false} />
      <Slab x0={TRAY_X} x1={TRAY_END} z0={TOP} z1={BOT} y0={-0.02} y1={FIELD_Y} mat={mats.tray} res={res} cast={false} />
      {points}
      {[
        [LEFT_X, BAR_X],
        [RIGHT_X, FIELD_END],
      ].map(([a, b]) => (
        <mesh key={a} material={mats.edgeShade} position={[(wx(a!) + wx(b!)) / 2, POINT_D + 0.0015, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
          <planeGeometry args={[wx(b!) - wx(a!), wz(BOT) - wz(TOP)]} />
        </mesh>
      ))}
      {/* walls */}
      <Slab x0={CASE.x0} x1={CASE.x1} z0={CASE.y0} z1={TOP} y0={0} y1={WALL_H} mat={mats.frameH} res={res} />
      <Slab x0={CASE.x0} x1={CASE.x1} z0={BOT} z1={CASE.y1} y0={0} y1={WALL_H} mat={mats.frameH} res={res} />
      <Slab x0={CASE.x0} x1={LEFT_X} z0={TOP} z1={BOT} y0={0} y1={WALL_H} mat={mats.frameV} res={res} />
      <Slab x0={TRAY_END} x1={CASE.x1} z0={TOP} z1={BOT} y0={0} y1={WALL_H} mat={mats.frameV} res={res} />
      <Slab x0={FIELD_END} x1={TRAY_X} z0={TOP} z1={BOT} y0={0} y1={WALL_H * 0.92} mat={mats.frameV} res={res} />
      <Slab x0={TRAY_X} x1={TRAY_END} z0={MID - 4} z1={MID + 4} y0={0} y1={WALL_H * 0.6} mat={mats.frameV} res={res} />
      {/* hinge bar: two halves of the case meeting in the middle */}
      <Slab x0={BAR_X} x1={RIGHT_X} z0={TOP} z1={BOT} y0={0} y1={WALL_H} mat={mats.bar} res={res} />
      <Slab x0={bx - 1.2} x1={bx + 1.2} z0={CASE.y0} z1={CASE.y1} y0={WALL_H - 0.002} y1={WALL_H + 0.001} mat={mats.groove} res={res} cast={false} />
      {[TOP + 70, BOT - 70].map((z) => (
        <mesh key={z} geometry={geo.hinge} material={mats.brass} position={[wx(bx), WALL_H + 0.012, wz(z)]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 1]} castShadow />
      ))}
      {/* ivory inlay lines along the inner edge of the walls */}
      <Slab x0={FX - 6} x1={TRAY_END + 6} z0={TOP - 9} z1={TOP - 7} y0={WALL_H} y1={WALL_H + Y_IN * 0.15} mat={mats.inlay} res={res} cast={false} />
      <Slab x0={FX - 6} x1={TRAY_END + 6} z0={BOT + 7} z1={BOT + 9} y0={WALL_H} y1={WALL_H + Y_IN * 0.15} mat={mats.inlay} res={res} cast={false} />
      <Slab x0={FX - 9} x1={FX - 7} z0={TOP - 9} z1={BOT + 9} y0={WALL_H} y1={WALL_H + Y_IN * 0.15} mat={mats.inlay} res={res} cast={false} />
      <Slab x0={TRAY_END + 7} x1={TRAY_END + 9} z0={TOP - 9} z1={BOT + 9} y0={WALL_H} y1={WALL_H + Y_IN * 0.15} mat={mats.inlay} res={res} cast={false} />
      {/* soft ground shadow under the case */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]} material={mats.shadow} receiveShadow>
        <planeGeometry args={[18, 14]} />
      </mesh>
    </group>
  );
});

/* ------------------------------------------------------------------ checkers */

const EDGE_R = 0.72;
const EDGE_T = 1.9;

/** Pose a checker group: e = 0 lies flat with its base at p, e = 1 stands on its edge centred on p. */
function pose(g: THREE.Object3D, mesh: THREE.Object3D, p: V3, e: number, lift = 0) {
  const s = 1 + (EDGE_R - 1) * e;
  g.position.set(p[0], p[1] + SEAT_Y + lift + e * (CR * EDGE_R + 0.004), p[2]);
  mesh.rotation.set((Math.PI / 2) * e, 0, 0);
  mesh.scale.set(s, 1 + (EDGE_T - 1) * e, s);
  mesh.position.set(0, 0, -((CH * EDGE_T) / 2) * e);
}

function Checker({ spec, res }: { spec: CheckerSpec; res: Res }) {
  const g = useRef<THREE.Group>(null);
  const m = useRef<THREE.Mesh>(null);
  useLayoutEffect(() => {
    if (g.current && m.current) pose(g.current, m.current, spec.p, spec.edge ? 1 : 0, spec.lift ?? 0);
  });
  return (
    <group ref={g}>
      <mesh ref={m} geometry={res.geo.checker} material={res.mats.checker[spec.seat]!} castShadow receiveShadow />
    </group>
  );
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function Flyer({ spec, res, onDone }: { spec: FlySpec; res: Res; onDone: (key: string) => void }) {
  const g = useRef<THREE.Group>(null);
  const m = useRef<THREE.Mesh>(null);
  const start = useRef(0);
  const done = useRef(false);
  const invalidate = useThree((s) => s.invalidate);
  const dist = Math.hypot(spec.to[0] - spec.from[0], spec.to[2] - spec.from[2]);
  const dur = spec.hop ? 0.42 : Math.min(0.46, 0.26 + dist * 0.035);
  const arc = spec.hop ? 0.75 + dist * 0.04 : 0.22 + Math.min(0.35, dist * 0.05);
  useLayoutEffect(() => {
    start.current = performance.now();
    done.current = false;
    if (g.current && m.current) pose(g.current, m.current, spec.from, spec.fromEdge ? 1 : 0);
    invalidate();
    // restart only for a new flight; positions are fresh arrays on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.key]);
  useFrame(() => {
    if (!g.current || !m.current || done.current) return;
    const t = Math.min(1, (performance.now() - start.current) / (dur * 1000));
    const e = easeInOut(t);
    const p: V3 = [
      spec.from[0] + (spec.to[0] - spec.from[0]) * e,
      spec.from[1] + (spec.to[1] - spec.from[1]) * e,
      spec.from[2] + (spec.to[2] - spec.from[2]) * e,
    ];
    // lift first, then travel, then settle: a squashed sine gives a quick rise and a soft landing
    const h = Math.sin(Math.PI * Math.pow(t, 0.8)) * arc;
    const edge = (spec.fromEdge ? 1 : 0) + ((spec.toEdge ? 1 : 0) - (spec.fromEdge ? 1 : 0)) * e;
    pose(g.current, m.current, p, edge, h);
    // tilt into the direction of travel while in the air
    const dx = spec.to[0] - spec.from[0];
    const dz = spec.to[2] - spec.from[2];
    const tilt = Math.sin(Math.PI * t) * 0.22;
    g.current.rotation.set(dist > 0 ? (dz / dist) * tilt : 0, 0, dist > 0 ? (-dx / dist) * tilt : 0);
    if (t >= 1) {
      g.current.rotation.set(0, 0, 0);
      done.current = true;
      onDone(spec.key);
    } else invalidate();
  });
  return (
    <group ref={g}>
      <mesh ref={m} geometry={res.geo.checker} material={res.mats.checker[spec.seat]!} castShadow />
    </group>
  );
}

/* ------------------------------------------------------------------ dice */

function rand(seed: string, i: number) {
  let h = 2166136261;
  const s = `${seed}:${i}`;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

/** Height of a die above its resting height over the roll: a fall, then three shrinking bounces. */
function bounceY(t: number): number {
  const hits = [0.36, 0.6, 0.76, 0.86];
  const peaks = [0.34, 0.11, 0.03];
  if (t < hits[0]!) {
    const s = t / hits[0]!;
    return 1.25 * (1 - s * s);
  }
  for (let i = 0; i < 3; i++) {
    if (t < hits[i + 1]!) {
      const s = (t - hits[i]!) / (hits[i + 1]! - hits[i]!);
      return peaks[i]! * 4 * s * (1 - s);
    }
  }
  return 0;
}

function Die({ value, used, rest, from, seed, k, res }: { value: number; used: boolean; rest: V3; from: V3; seed: string; k: number; res: Res }) {
  const ref = useRef<THREE.Mesh>(null);
  const start = useRef(0);
  const running = useRef(true);
  const invalidate = useThree((s) => s.invalidate);
  const anim = useMemo(() => {
    const yaw = (rand(seed, k) - 0.5) * 0.55;
    const final = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(faceUpQuat(value));
    const axis = new THREE.Vector3(rand(seed, k + 10) - 0.5, rand(seed, k + 20) - 0.2, rand(seed, k + 30) - 0.5).normalize();
    // spin mostly around the axis perpendicular to travel so it reads as rolling
    const turns = (2.5 + rand(seed, k + 40) * 1.5) * Math.PI * 2;
    return { final, axis, turns };
  }, [seed, k, value]);
  const DUR = 0.85 + k * 0.05;
  useLayoutEffect(() => {
    start.current = performance.now();
    running.current = true;
    ref.current?.position.set(from[0], from[1] + DIE / 2 + 1.25, from[2]);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, invalidate]);
  const q = useMemo(() => new THREE.Quaternion(), []);
  useFrame(() => {
    const m = ref.current;
    if (!m || !running.current) return;
    const t = Math.min(1, (performance.now() - start.current) / (DUR * 1000));
    const slide = 1 - Math.pow(1 - Math.min(1, t / 0.9), 2.4);
    m.position.set(
      from[0] + (rest[0] - from[0]) * slide,
      rest[1] + DIE / 2 + bounceY(t) * (1 - k * 0.05),
      from[2] + (rest[2] - from[2]) * slide,
    );
    const spin = Math.pow(1 - Math.min(1, t / 0.88), 2.2) * anim.turns;
    q.setFromAxisAngle(anim.axis, spin);
    m.quaternion.copy(q).multiply(anim.final);
    if (t >= 1) running.current = false;
    else invalidate();
  });
  return (
    <mesh ref={ref} geometry={res.geo.die} material={used ? res.dieMatsUsed : res.dieMats} castShadow receiveShadow />
  );
}

function Dice({ spec, res }: { spec: DiceSpec; res: Res }) {
  const n = spec.values.length;
  const gap = n === 4 ? 0.52 : 0.6;
  const cx = wx((spec.side === 'right' ? RIGHT_X : LEFT_X) + 3 * PW);
  return (
    <group>
      {spec.values.map((v, k) => {
        const rest: V3 = [cx + (k - (n - 1) / 2) * gap, SEAT_Y, wz(MID) + (k % 2 ? 0.05 : -0.05)];
        const dir = spec.side === 'right' ? 1 : -1;
        const from: V3 = [rest[0] + dir * 1.6, rest[1], rest[2] + (spec.near ? 1.6 : -1.6) + k * 0.12];
        return <Die key={`${spec.rollKey}-${k}`} value={v} used={spec.used[k] ?? false} rest={rest} from={from} seed={spec.rollKey} k={k} res={res} />;
      })}
    </group>
  );
}

/* ------------------------------------------------------------------ highlights */

function Badge({ p, n }: { p: V3; n: number }) {
  return (
    <Html position={[p[0], p[1] + SEAT_Y + CH + 0.16, p[2]]} center zIndexRange={[20, 0]} pointerEvents="none" className="pointer-events-none" style={{ pointerEvents: "none" }}>
      <span className="pointer-events-none inline-flex min-w-[22px] items-center justify-center rounded-full bg-[#0B0F1C]/85 px-1.5 py-0.5 text-[12px] font-bold leading-none text-white tabular shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
        {n}
      </span>
    </Html>
  );
}

function DieLabel({ p, dice, strong }: { p: V3; dice: number[]; strong: boolean }) {
  return (
    <Html position={p} center zIndexRange={[30, 0]} pointerEvents="none" className="pointer-events-none" style={{ pointerEvents: "none" }}>
      <span
        className="pointer-events-none inline-flex min-w-[24px] items-center justify-center rounded-full px-1.5 py-1 text-[12px] font-bold leading-none tabular shadow-[0_2px_6px_rgba(0,0,0,0.45)]"
        style={{ background: strong ? 'var(--primary)' : 'rgba(11,15,28,0.82)', color: strong ? 'var(--primary-ink)' : '#fff' }}
      >
        {dice.join('/')}
      </span>
    </Html>
  );
}

function Highlights({ rings, dests, primary, res }: { rings: RingSpec[]; dests: DestSpec[]; primary: string; res: Res }) {
  const mats = useMemo(() => {
    const c = new THREE.Color(primary);
    return {
      glow: new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      ring: new THREE.MeshBasicMaterial({ color: c, toneMapped: false }),
      ringSoft: new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.6, toneMapped: false }),
      ghost: new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false }),
      tray: new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    };
  }, [primary]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  return (
    <group>
      {rings.map((r) => (
        <mesh
          key={r.key}
          geometry={r.active || r.focus ? res.geo.ringFat : res.geo.ring}
          material={r.active || r.focus ? mats.ring : mats.ringSoft}
          position={[r.p[0], r.p[1] + SEAT_Y + CH * 0.5 + (r.active ? 0.09 : 0), r.p[2]]}
          rotation={[Math.PI / 2, 0, 0]}
        />
      ))}
      {dests.map((d) => {
        if (d.kind === 'off') {
          const z0 = d.mine ? MID + 6 : TOP + 2;
          const z1 = d.mine ? BOT - 2 : MID - 6;
          return (
            <group key={d.key}>
              <mesh material={mats.tray} position={[wx(TRAY_X + TRAY / 2), 0.006, (wz(z0) + wz(z1)) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[TRAY * 0.01 - 0.04, wz(z1) - wz(z0)]} />
              </mesh>
              <DieLabel p={[wx(TRAY_X + TRAY / 2), 0.3, wz(d.mine ? MID + 60 : MID - 60)]} dice={d.dice} strong={d.focus} />
            </group>
          );
        }
        const { col, top } = colRow(d.c!);
        const y = d.p[1] + SEAT_Y + (d.blot ? CH : 0);
        return (
          <group key={d.key}>
            <mesh geometry={top ? res.geo.glowTop : res.geo.glowBot} material={mats.glow} position={[wx(colX(col)), POINT_D + 0.001, wz(top ? TOP - 2 : BOT + 2)]} />
            <mesh geometry={d.focus ? res.geo.ringFat : res.geo.ring} material={mats.ring} position={[d.p[0], y + 0.012, d.p[2]]} rotation={[Math.PI / 2, 0, 0]} />
            {d.blot ? null : <mesh geometry={res.geo.disc} material={mats.ghost} position={[d.p[0], y + 0.004, d.p[2]]} rotation={[-Math.PI / 2, 0, 0]} />}
            <DieLabel p={[d.p[0], y + 0.06, d.p[2]]} dice={d.dice} strong={d.focus} />
          </group>
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------------------ camera */

const ELEV = (52 * Math.PI) / 180;
const FOV = 30;

function CameraRig({ parallax }: { parallax: SceneProps['parallax'] }) {
  const { camera, size, invalidate } = useThree();
  const base = useRef({ d: 16, tz: 0.4 });
  const cur = useRef({ x: 0, y: 0 });

  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = FOV;
    cam.aspect = size.width / Math.max(1, size.height);
    cam.near = 0.5;
    cam.far = 80;
    cam.updateProjectionMatrix();
    const corners: THREE.Vector3[] = [];
    for (const x of [CASE.x0, CASE.x1]) for (const z of [CASE.y0, CASE.y1]) for (const y of [-0.2, WALL_H]) corners.push(new THREE.Vector3(wx(x), y, wz(z)));
    const v = new THREE.Vector3();
    const place = (d: number, tz: number) => {
      cam.position.set(0, Math.sin(ELEV) * d, tz + Math.cos(ELEV) * d);
      cam.lookAt(0, 0, tz);
      cam.updateMatrixWorld();
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const c of corners) {
        v.copy(c).project(cam);
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      }
      return { x0, x1, y0, y1 };
    };
    let tz = 0;
    let d = 16;
    for (let iter = 0; iter < 4; iter++) {
      let lo = 4;
      let hi = 60;
      for (let i = 0; i < 30; i++) {
        d = (lo + hi) / 2;
        const b = place(d, tz);
        const m = Math.max(-b.x0, b.x1, (b.y1 - b.y0) / 2);
        if (m > 0.955) lo = d;
        else hi = d;
      }
      d = hi;
      // centre vertically: move the target until the box sits in the middle of the frame
      const b = place(d, tz);
      const off = (b.y1 + b.y0) / 2;
      tz -= off * d * 0.25;
    }
    base.current = { d, tz };
    place(d, tz);
    invalidate();
  }, [camera, size.width, size.height, invalidate]);

  useFrame(() => {
    const target = parallax.current;
    const c = cur.current;
    c.x += (target.x - c.x) * 0.12;
    c.y += (target.y - c.y) * 0.12;
    const { d, tz } = base.current;
    const yaw = c.x * 0.035;
    const pitch = ELEV + c.y * 0.02;
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * d, Math.sin(pitch) * d, tz + Math.cos(yaw) * Math.cos(pitch) * d);
    camera.lookAt(0, 0, tz);
    if (Math.abs(target.x - c.x) > 0.002 || Math.abs(target.y - c.y) > 0.002) invalidate();
  });
  return null;
}

/* ------------------------------------------------------------------ scene */

export function Scene3D(props: SceneProps) {
  const res = useResources();
  const invalidate = useThree((s) => s.invalidate);
  const { mySeat, onTap } = props;
  useEffect(() => {
    invalidate();
  });
  useEffect(
    () => () => {
      Object.values(res.geo).forEach((g) => g.dispose());
      const all = [...res.dieMats, ...res.dieMatsUsed, ...Object.values(res.mats).flat()] as THREE.Material[];
      for (const m of all) {
        const mm = m as THREE.MeshStandardMaterial;
        mm.map?.dispose();
        mm.roughnessMap?.dispose();
        m.dispose();
      }
    },
    [res],
  );

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const s = toSvg(e.point.x, e.point.z);
    onTap.current(hitTest(s.x, s.y, mySeat));
  };

  return (
    <>
      <CameraRig parallax={props.parallax} />
      <hemisphereLight args={['#EAF6FF', '#2A3A55', 0.45]} />
      <ambientLight intensity={0.18} />
      <directionalLight
        position={[-3.5, 9, 4.5]}
        intensity={1.9}
        color="#F2F7FC"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-6.5}
        shadow-camera-right={6.5}
        shadow-camera-top={5.5}
        shadow-camera-bottom={-5.5}
        shadow-camera-near={1}
        shadow-camera-far={25}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[5, 4, -3]} intensity={0.35} color="#BFE6FF" />
      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={2.2} color="#F2F7FC" position={[0, 6, 2]} rotation={[-Math.PI / 2, 0, 0]} scale={[10, 6, 1]} />
        <Lightformer form="rect" intensity={1.1} color="#CDEBFF" position={[-6, 3, 2]} rotation={[0, Math.PI / 2, 0]} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={0.7} color="#B9C6FF" position={[6, 2, -3]} rotation={[0, -Math.PI / 2, 0]} scale={[6, 2, 1]} />
      </Environment>

      <Case res={res} />
      {props.checkers.map((c) => (
        <Checker key={c.key} spec={c} res={res} />
      ))}
      {props.badges.map((b) => (
        <Badge key={b.key} p={b.p} n={b.n} />
      ))}
      <Highlights rings={props.rings} dests={props.dests} primary={props.primary} res={res} />
      {props.dice ? <Dice spec={props.dice} res={res} /> : null}
      {props.fly ? <Flyer key={props.fly.key} spec={props.fly} res={res} onDone={props.onFlyDone} /> : null}

      {/* tap target: the whole case, hit tested with the 2D board geometry */}
      <mesh position={[0, CH * 0.6, 0]} rotation={[-Math.PI / 2, 0, 0]} onPointerDown={onDown}>
        <planeGeometry args={[(W + 60) * 0.01, (H + 40) * 0.01]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </>
  );
}

