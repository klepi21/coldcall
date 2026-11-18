'use client';
/**
 * Everything inside the WebGL canvas for the 3D chess board. State lives in ChessBoard3D;
 * this file only draws it and turns pointer input into square names.
 */
import { type ComponentRef, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls, RoundedBox } from '@react-three/drei';
import { FILES, sqIndex, type Tracked } from '../logic';
import type { PieceColor, PieceType } from '../pieces';
import { BOARD, arrowShape, drawBoardTexture, glowTexture, pieceGeometries, squareFrame } from './geometry';

export type OrbitControlsImpl = ComponentRef<typeof OrbitControls>;

export type Theme3D = 'marble' | 'night';

export interface SceneApi {
  /** own piece on a square that may be picked up right now */
  canDrag: (sq: string) => boolean;
  /** pointer went down on an own piece; returns whether it was already selected */
  pressOwn: (sq: string) => boolean;
  /** a tap (press and release without moving) on any square */
  tap: (sq: string) => void;
  /** press on own piece released without dragging */
  release: (sq: string, wasSelected: boolean) => void;
  /** drag ended over a square (or off the board) */
  drop: (from: string, to: string | null) => void;
  /** whether the square should show a pointer cursor */
  pointable: (sq: string) => boolean;
}

export interface Dying extends Tracked {
  born: number;
}

export interface SceneProps {
  theme: Theme3D;
  flipped: boolean;
  reduce: boolean;
  pieces: Tracked[];
  layerKey: number;
  dying: Dying[];
  selected: string | null;
  targets: { sq: string; capture: boolean }[];
  lastSq: string[];
  checkSq: string | null;
  hint: { from: string; to: string } | null;
  cursor: string | null;
  shake: { sq: string; n: number } | null;
  apiRef: MutableRefObject<SceneApi>;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  onViewChange: (moved: boolean) => void;
}

const LIME = '#7fe3ff';
const VIOLET = '#5a8fe0';

export const sqToXZ = (sq: string): [number, number] => {
  const f = sq.charCodeAt(0) - 97;
  const r = sq.charCodeAt(1) - 49;
  return [f - 3.5, 3.5 - r];
};
const xzToSq = (x: number, z: number): string | null => {
  const f = Math.floor(x + 4);
  const r = Math.floor(4 - z);
  if (f < 0 || f > 7 || r < 0 || r > 7) return null;
  return `${FILES[f]}${r + 1}`;
};

/** Knights turn three quarters towards the opponent so their profile reads from the player's seat; everything else turns its front (bishop slit) to its owner. */
const rotFor = (t: string, c: PieceColor) => (t === 'n' ? (c === 'w' ? 0.62 : Math.PI + 0.62) : c === 'w' ? 0 : Math.PI);

const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/* ---------------------------------------------------------------------------------------- */

function useMaterials(theme: Theme3D) {
  return useMemo(() => {
    const ivory = new THREE.MeshPhysicalMaterial({
      color: '#EFE6D3',
      roughness: 0.34,
      metalness: 0,
      clearcoat: 0.65,
      clearcoatRoughness: 0.22,
      sheen: 0.3,
      sheenColor: new THREE.Color('#fff6e4'),
      sheenRoughness: 0.6,
    });
    const obsidian = new THREE.MeshPhysicalMaterial({
      color: theme === 'night' ? '#1B1A24' : '#16151B',
      roughness: 0.24,
      metalness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      reflectivity: 0.6,
    });
    return { w: ivory, b: obsidian };
  }, [theme]);
}

/* ---------------------------------------------------------------------------------------- */

function Lights({ flipped }: { flipped: boolean }) {
  const s = flipped ? -1 : 1;
  const key = useRef<THREE.DirectionalLight>(null);
  useLayoutEffect(() => {
    const l = key.current;
    if (!l) return;
    const c = l.shadow.camera;
    c.left = -6;
    c.right = 6;
    c.top = 6;
    c.bottom = -6;
    c.near = 1;
    c.far = 30;
    c.updateProjectionMatrix();
  }, []);
  return (
    <>
      <hemisphereLight args={['#E8ECFF', '#1A1424', 0.35]} />
      <directionalLight
        ref={key}
        position={[3.5 * s, 11, 4.5 * s]}
        intensity={1.7}
        color="#FFF4E6"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0003}
        shadow-normalBias={0.025}
        shadow-radius={6}
      />
      <directionalLight position={[-6 * s, 4, -7 * s]} intensity={1.6} color={VIOLET} />
      <directionalLight position={[7 * s, 3, -5 * s]} intensity={0.55} color={LIME} />
      <Environment resolution={256} frames={1} environmentIntensity={0.55}>
        <Lightformer form="rect" intensity={2.2} position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={2.4} position={[-7, 3, 2]} rotation-y={Math.PI / 2} scale={[10, 2, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={1.6} position={[7, 3, 0]} rotation-y={-Math.PI / 2} scale={[10, 2, 1]} color="#fff3e0" />
        <Lightformer form="rect" intensity={2.2} position={[0, 2, -8]} scale={[10, 1.4, 1]} color={VIOLET} />
        <Lightformer form="ring" intensity={1.2} position={[0, 2, 8]} scale={3} color={LIME} />
      </Environment>
    </>
  );
}

/* ---------------------------------------------------------------------------------------- */

function Board({ theme, flipped }: { theme: Theme3D; flipped: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  const units = BOARD.half * 2 + BOARD.margin * 2;
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 2048;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);
  useEffect(() => {
    const draw = () => {
      const font = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
      drawBoardTexture(tex.image as HTMLCanvasElement, theme, flipped, font);
      tex.needsUpdate = true;
      invalidate();
    };
    draw();
    let live = true;
    document.fonts?.ready.then(() => live && draw());
    return () => {
      live = false;
    };
  }, [tex, theme, flipped, invalidate]);
  useEffect(() => () => tex.dispose(), [tex]);
  const frame = theme === 'night' ? '#0E1018' : '#17161C';
  const slab = units + 0.36;
  return (
    <group>
      <RoundedBox args={[slab, BOARD.thick, slab]} radius={0.16} smoothness={5} position={[0, -BOARD.thick / 2 - 0.002, 0]} receiveShadow>
        <meshPhysicalMaterial color={frame} roughness={0.42} metalness={0.15} clearcoat={0.6} clearcoatRoughness={0.3} />
      </RoundedBox>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.0005, 0]} receiveShadow>
        <planeGeometry args={[units, units]} />
        <meshPhysicalMaterial map={tex} roughness={theme === 'marble' ? 0.38 : 0.5} metalness={0} clearcoat={theme === 'marble' ? 0.35 : 0.2} clearcoatRoughness={0.35} />
      </mesh>
    </group>
  );
}

/* ---------------------------------------------------------------------------------------- */

interface PieceProps {
  p: Tracked;
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  selected: boolean;
  dragging: boolean;
  dragPos: MutableRefObject<THREE.Vector3>;
  shakeN: number | null;
  reduce: boolean;
}

function Piece({ p, geo, mat, selected, dragging, dragPos, shakeN, reduce }: PieceProps) {
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const [tx, tz] = sqToXZ(`${FILES[p.sq % 8]}${Math.floor(p.sq / 8) + 1}`);
  const anim = useRef<{ from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number; arc: number } | null>(null);
  const mounted = useRef(false);
  const shakeT0 = useRef(0);
  const selT0 = useRef(0);

  useLayoutEffect(() => {
    const g = outer.current;
    if (!g) return;
    const to = new THREE.Vector3(tx, 0, tz);
    if (!mounted.current || reduce) {
      g.position.copy(to);
      mounted.current = true;
      anim.current = null;
      invalidate();
      return;
    }
    if (dragging) return;
    const from = g.position.clone();
    const dist = Math.hypot(from.x - to.x, from.z - to.z);
    if (dist < 0.001 && from.y < 0.001) return;
    const lifted = from.y > 0.05;
    anim.current = {
      from,
      to,
      t0: performance.now(),
      dur: lifted ? 140 : Math.min(420, 240 + dist * 28),
      arc: lifted ? 0 : p.t === 'n' ? 0.55 : 0.18 + Math.min(0.3, dist * 0.05),
    };
    invalidate();
  }, [tx, tz, dragging, reduce, invalidate, p.t]);

  useEffect(() => {
    if (shakeN != null) {
      shakeT0.current = performance.now();
      invalidate();
    }
  }, [shakeN, invalidate]);

  useEffect(() => {
    if (selected) selT0.current = performance.now();
    invalidate();
  }, [selected, invalidate]);

  useFrame(() => {
    const g = outer.current;
    const i = inner.current;
    if (!g || !i) return;
    const now = performance.now();
    let more = false;
    if (dragging) {
      const d = dragPos.current;
      g.position.lerp(d, 0.55);
      if (g.position.distanceTo(d) > 0.002) more = true;
    } else if (anim.current) {
      const a = anim.current;
      const k = Math.min(1, (now - a.t0) / a.dur);
      const e = a.arc ? easeInOut(k) : easeOut(k);
      g.position.lerpVectors(a.from, a.to, e);
      g.position.y = a.from.y * (1 - e) + a.arc * Math.sin(Math.PI * k);
      if (k < 1) more = true;
      else {
        g.position.copy(a.to);
        anim.current = null;
      }
    }
    // selected: lift and breathe
    let y = 0;
    if (selected && !dragging) {
      const t = (now - selT0.current) / 1000;
      const up = Math.min(1, t / 0.16);
      y = 0.12 * easeOut(up) + (reduce ? 0 : 0.022 * Math.sin(t * 2.6) * up);
      if (!reduce || up < 1) more = true;
    }
    i.position.y = y;
    // shake
    const sk = (now - shakeT0.current) / 380;
    if (shakeT0.current && sk < 1) {
      i.position.x = Math.sin(sk * Math.PI * 7) * 0.07 * (1 - sk);
      more = true;
    } else i.position.x = 0;
    if (more) invalidate();
  });

  const rotY = rotFor(p.t, p.c);
  return (
    <group ref={outer}>
      <group ref={inner}>
        <mesh geometry={geo} material={mat} rotation-y={rotY} castShadow userData={{ sq: p.sq }} />
      </group>
    </group>
  );
}

function DyingPiece({ p, geo, mat }: { p: Dying; geo: THREE.BufferGeometry; mat: THREE.Material }) {
  const ref = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const m = useMemo(() => {
    const c = mat.clone() as THREE.MeshPhysicalMaterial;
    c.transparent = true;
    return c;
  }, [mat]);
  useEffect(() => () => m.dispose(), [m]);
  const [x, z] = sqToXZ(`${FILES[p.sq % 8]}${Math.floor(p.sq / 8) + 1}`);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const k = Math.min(1, Math.max(0, (performance.now() - p.born - 150) / 420));
    const e = k * k;
    g.position.set(x, -0.5 * e, z);
    g.scale.setScalar(1 - 0.12 * e);
    m.opacity = 1 - e;
    if (k < 1) invalidate();
  });
  return (
    <group ref={ref} position={[x, 0, z]}>
      <mesh geometry={geo} material={m} rotation-y={rotFor(p.t, p.c)} raycast={() => null} />
    </group>
  );
}

/* ---------------------------------------------------------------------------------------- */

const noRay = () => null;

function SquareTint({ sq, color, opacity, y = 0.003 }: { sq: string; color: string; opacity: number; y?: number }) {
  const [x, z] = sqToXZ(sq);
  return (
    <mesh rotation-x={-Math.PI / 2} position={[x, y, z]} raycast={noRay}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function Overlays(props: Pick<SceneProps, 'selected' | 'targets' | 'lastSq' | 'checkSq' | 'hint' | 'cursor' | 'theme' | 'reduce'> & { dragOver: string | null }) {
  const { selected, targets, lastSq, checkSq, hint, cursor, theme, reduce, dragOver } = props;
  const invalidate = useThree((s) => s.invalidate);
  const glow = useMemo(() => glowTexture('rgba(127, 227, 255,0.9)', 'rgba(127, 227, 255,0.25)'), []);
  const red = useMemo(() => glowTexture('rgba(255,77,109,1)', 'rgba(255,77,109,0.45)'), []);
  const frameGeo = useMemo(() => new THREE.ShapeGeometry(squareFrame(0.92, 0.055)), []);
  const checkMat = useRef<THREE.MeshBasicMaterial>(null);
  const checkT0 = useRef(0);
  useEffect(() => {
    checkT0.current = performance.now();
    invalidate();
  }, [checkSq, invalidate]);
  useFrame(() => {
    const m = checkMat.current;
    if (!m) return;
    const t = (performance.now() - checkT0.current) / 1000;
    if (reduce || t > 2.6) {
      m.opacity = 0.85;
      return;
    }
    m.opacity = 0.55 + 0.4 * (0.5 + 0.5 * Math.cos(t * Math.PI * 2.3));
    invalidate();
  });

  const hintMesh = useMemo(() => {
    if (!hint) return null;
    const [x1, z1] = sqToXZ(hint.from);
    const [x2, z2] = sqToXZ(hint.to);
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (!len) return null;
    const geo = new THREE.ShapeGeometry(arrowShape(len - 0.3));
    geo.translate(0.15, 0, 0);
    return { geo, x: x1, z: z1, rot: Math.atan2(-(z2 - z1), x2 - x1) };
  }, [hint]);

  const lastColor = theme === 'night' ? '#E8B44C' : '#E8B44C';
  return (
    <group>
      {lastSq.map((sq) => (
        <SquareTint key={`l${sq}`} sq={sq} color={lastColor} opacity={theme === 'night' ? 0.22 : 0.38} />
      ))}
      {selected ? <SquareTint sq={selected} color={LIME} opacity={theme === 'night' ? 0.26 : 0.4} y={0.004} /> : null}
      {checkSq ? <SquareTint sq={checkSq} color="#FF4D6D" opacity={0.35} y={0.005} /> : null}
      {checkSq
        ? (() => {
            const [x, z] = sqToXZ(checkSq);
            return (
              <mesh rotation-x={-Math.PI / 2} position={[x, 0.006, z]} raycast={noRay}>
                <planeGeometry args={[2, 2]} />
                <meshBasicMaterial ref={checkMat} map={red} transparent depthWrite={false} toneMapped={false} />
              </mesh>
            );
          })()
        : null}
      {targets.map(({ sq, capture }) => {
        const [x, z] = sqToXZ(sq);
        return capture ? (
          <group key={`t${sq}`} position={[x, 0.008, z]} rotation-x={-Math.PI / 2}>
            <mesh raycast={noRay}>
              <ringGeometry args={[0.39, 0.465, 48]} />
              <meshBasicMaterial color={LIME} transparent opacity={0.95} depthWrite={false} toneMapped={false} />
            </mesh>
            <mesh raycast={noRay}>
              <planeGeometry args={[1.1, 1.1]} />
              <meshBasicMaterial map={glow} transparent opacity={0.35} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
            </mesh>
          </group>
        ) : (
          <group key={`t${sq}`} position={[x, 0.008, z]} rotation-x={-Math.PI / 2}>
            <mesh raycast={noRay}>
              <planeGeometry args={[0.95, 0.95]} />
              <meshBasicMaterial map={glow} transparent opacity={0.75} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
            </mesh>
            <mesh raycast={noRay} position-z={0.002}>
              <circleGeometry args={[0.16, 40]} />
              <meshBasicMaterial color={LIME} transparent opacity={0.95} depthWrite={false} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
      {dragOver && targets.some((t) => t.sq === dragOver)
        ? (() => {
            const [x, z] = sqToXZ(dragOver);
            return (
              <mesh geometry={frameGeo} rotation-x={-Math.PI / 2} position={[x, 0.01, z]} raycast={noRay}>
                <meshBasicMaterial color="#ffffff" transparent opacity={0.85} depthWrite={false} toneMapped={false} />
              </mesh>
            );
          })()
        : null}
      {cursor
        ? (() => {
            const [x, z] = sqToXZ(cursor);
            return (
              <mesh geometry={frameGeo} rotation-x={-Math.PI / 2} position={[x, 0.011, z]} raycast={noRay} renderOrder={9}>
                <meshBasicMaterial color={LIME} transparent opacity={0.9} depthWrite={false} depthTest={false} toneMapped={false} />
              </mesh>
            );
          })()
        : null}
      {hintMesh ? (
        <mesh geometry={hintMesh.geo} position={[hintMesh.x, 0.02, hintMesh.z]} rotation={[-Math.PI / 2, 0, hintMesh.rot]} raycast={noRay} renderOrder={10}>
          <meshBasicMaterial color={LIME} transparent opacity={0.62} depthWrite={false} depthTest={false} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
    </group>
  );
}

/* ---------------------------------------------------------------------------------------- */

/** Place the camera behind the player's side so the whole board fits the canvas, then save it as home. */
function Rig({ flipped, controlsRef, onViewChange }: { flipped: boolean; controlsRef: SceneProps['controlsRef']; onViewChange: (m: boolean) => void }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    const c = controlsRef.current;
    const s = flipped ? -1 : 1;
    // Portrait phones get a taller canvas, so look down more steeply: bigger squares, easier taps.
    const elev = ((size.width / Math.max(1, size.height) < 1.2 ? 54 : 41) * Math.PI) / 180;
    const target = new THREE.Vector3();
    const dir = new THREE.Vector3(0, Math.sin(elev), Math.cos(elev) * s);
    camera.aspect = size.width / Math.max(1, size.height);
    const ext = BOARD.half + BOARD.margin + 0.2;
    const pts: THREE.Vector3[] = [];
    for (const x of [-ext, ext]) for (const z of [-ext, ext]) for (const y of [-BOARD.thick, 0]) pts.push(new THREE.Vector3(x, y, z));
    // tall pieces on the far rank
    for (const x of [-3.5, 3.5]) pts.push(new THREE.Vector3(x, 1.15, -3.5 * s));
    // Screen-up direction in world space, used to pan the view so the board sits centred.
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(dir, -dir.y).normalize();
    const look = new THREE.Vector3();
    const place = (d: number, pan: number) => {
      look.copy(target).addScaledVector(up, pan);
      camera.position.copy(look).addScaledVector(dir, d);
      camera.lookAt(look);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      let xm = 0;
      let lo = Infinity;
      let hi = -Infinity;
      for (const p of pts) {
        const v = p.clone().project(camera);
        xm = Math.max(xm, Math.abs(v.x));
        lo = Math.min(lo, v.y);
        hi = Math.max(hi, v.y);
      }
      return { xm, lo, hi };
    };
    let pan = 0;
    let dist = 20;
    for (let iter = 0; iter < 4; iter++) {
      let lo = 5;
      let hi = 40;
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        const b = place(mid, pan);
        if (b.xm <= 0.97 && b.hi - b.lo <= 1.9) hi = mid;
        else lo = mid;
      }
      dist = hi;
      const b = place(dist, pan);
      pan += ((b.hi + b.lo) / 2) * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    }
    place(dist, pan);
    target.copy(look);
    if (c) {
      c.target.copy(target);
      c.update();
      c.saveState();
      const base = flipped ? Math.PI : 0;
      c.minAzimuthAngle = base - 0.55;
      c.maxAzimuthAngle = base + 0.55;
    }
    onViewChange(false);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped, size.width, size.height, camera]);
  return null;
}

/* ---------------------------------------------------------------------------------------- */

export function Scene(props: SceneProps) {
  const { theme, flipped, reduce, pieces, layerKey, dying, selected, targets, lastSq, checkSq, hint, cursor, shake, apiRef, controlsRef, containerRef, onViewChange } = props;
  const geos = useMemo(() => pieceGeometries(), []);
  const mats = useMaterials(theme);
  const { camera, gl, invalidate } = useThree();
  const [drag, setDrag] = useState<{ from: string; id: string } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const dragPos = useRef(new THREE.Vector3());
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  const pointOnBoard = (cx: number, cy: number, h = 0) => {
    const r = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    plane.constant = -h;
    const out = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, out) ? out : null;
  };

  const setControls = (on: boolean) => {
    if (controlsRef.current) controlsRef.current.enabled = on;
  };

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const ne = e.nativeEvent;
    if (ne.pointerType === 'mouse' && ne.button !== 0) return;
    const ud = e.object.userData as { sq?: number };
    const sq = typeof ud.sq === 'number' ? `${FILES[ud.sq % 8]}${Math.floor(ud.sq / 8) + 1}` : xzToSq(e.point.x, e.point.z);
    if (!sq) return;
    const api = apiRef.current;
    const sx = ne.clientX;
    const sy = ne.clientY;
    const pid = ne.pointerId;
    if (api.canDrag(sq)) {
      setControls(false);
      const wasSelected = api.pressOwn(sq);
      const id = pieces.find((p) => p.sq === sqIndex(sq))?.id ?? null;
      let moved = false;
      let over: string | null = sq;
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) return;
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 7) return;
        if (!moved) {
          moved = true;
          if (id) setDrag({ from: sq, id });
        }
        const pt = pointOnBoard(ev.clientX, ev.clientY, 0);
        if (pt) {
          dragPos.current.set(THREE.MathUtils.clamp(pt.x, -4.3, 4.3), 0.42, THREE.MathUtils.clamp(pt.z, -4.3, 4.3));
          const o = xzToSq(pt.x, pt.z);
          if (o !== over) {
            over = o;
            setDragOver(o);
          }
        }
        invalidate();
      };
      const end = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) return;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        setControls(true);
        setDragOver(null);
        if (!moved) {
          if (ev.type === 'pointerup') api.release(sq, wasSelected);
          return;
        }
        setDrag(null);
        if (ev.type !== 'pointerup') return;
        const pt = pointOnBoard(ev.clientX, ev.clientY, 0);
        api.drop(sq, pt ? xzToSq(pt.x, pt.z) : null);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
      return;
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      window.removeEventListener('pointerup', up);
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 8) api.tap(sq);
    };
    window.addEventListener('pointerup', up);
  };

  const onHover = (e: ThreeEvent<PointerEvent>) => {
    const el = containerRef.current;
    if (!el || drag) return;
    const ud = e.object.userData as { sq?: number };
    const sq = typeof ud.sq === 'number' ? `${FILES[ud.sq % 8]}${Math.floor(ud.sq / 8) + 1}` : xzToSq(e.point.x, e.point.z);
    el.style.cursor = sq && apiRef.current.pointable(sq) ? 'pointer' : '';
  };

  const units = BOARD.half * 2 + BOARD.margin * 2;

  return (
    <>
      <Lights flipped={flipped} />
      <Board theme={theme} flipped={flipped} />
      <Overlays selected={drag ? drag.from : selected} targets={targets} lastSq={lastSq} checkSq={checkSq} hint={hint} cursor={cursor} theme={theme} reduce={reduce} dragOver={dragOver} />
      <group
        onPointerDown={onDown}
        onPointerMove={onHover}
        onPointerOut={() => {
          if (containerRef.current) containerRef.current.style.cursor = '';
        }}
      >
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.001, 0]}>
          <planeGeometry args={[8, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <group key={layerKey}>
          {pieces.map((p) => (
            <Piece
              key={p.id}
              p={p}
              geo={geos[p.t as PieceType]}
              mat={mats[p.c]}
              selected={selected === `${FILES[p.sq % 8]}${Math.floor(p.sq / 8) + 1}` && !drag}
              dragging={drag?.id === p.id}
              dragPos={dragPos}
              shakeN={shake && shake.sq === `${FILES[p.sq % 8]}${Math.floor(p.sq / 8) + 1}` ? shake.n : null}
              reduce={reduce}
            />
          ))}
        </group>
      </group>
      {dying.map((p) => (
        <DyingPiece key={`d${p.id}`} p={p} geo={geos[p.t as PieceType]} mat={mats[p.c]} />
      ))}
      <ContactShadows position={[0, -BOARD.thick - 0.01, 0]} scale={units + 4} blur={2.6} far={3} opacity={0.75} resolution={512} frames={1} color="#000000" />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enablePan={false}
        enableZoom={false}
        enableDamping
        dampingFactor={0.12}
        rotateSpeed={0.55}
        minPolarAngle={0.5}
        maxPolarAngle={1.12}
        onChange={() => {
          const c = controlsRef.current;
          if (!c) return;
          const home = (c as unknown as { position0: THREE.Vector3 }).position0;
          onViewChange(!!home && c.object.position.distanceTo(home) > 0.25);
        }}
      />
      <Rig flipped={flipped} controlsRef={controlsRef} onViewChange={onViewChange} />
    </>
  );
}
