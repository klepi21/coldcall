'use client';
/**
 * The 3D naval scene (inside the R3F Canvas). Pure view: it draws what the props say and calls
 * back on taps. Cell (row, col) sits at world x = col - 4.5, z = row - 4.5; the camera looks from
 * +z, so A1 is at the far left corner just like the 2D grid.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { shipCells, sbShipSize, type SbMark, type SbShip, type SbShipId } from '@coldcall/games/seabattle';
import { HORIZON, MAX_FIRES, MAX_RIPPLES, makeLabelsTexture, makeMarksTexture, makeOceanMaterial, makeSkyMaterial, waveHeight } from './ocean';
import { ParticlePool, burning, fireBurst, splashBurst, trail, type Particle } from './particles';
import { shipGeometry, shipMaterials, type ShipLook3D, type Slot } from './ships';

export interface Cell {
  row: number;
  col: number;
}
export interface Impact extends Cell {
  key: number;
  kind: 'miss' | 'hit' | 'sunk';
  ship?: SbShip;
}
export interface SceneShip {
  ship: SbShip;
  look: ShipLook3D;
}
export interface SceneProps {
  mode: 'battle' | 'preview';
  marks?: SbMark[];
  ships: SceneShip[];
  aim?: Cell | null;
  aimActive?: boolean;
  hover?: Cell | null;
  lastShot?: Cell | null;
  flight?: (Cell & { key: number }) | null;
  impact?: Impact | null;
  active?: boolean;
  /** Grid visibility, 0..1 (defaults to 1 in battle, 0 in preview). */
  grid?: number;
  reduce: boolean;
  flightMs?: number;
  onTap?: (row: number, col: number) => void;
  onHover?: (c: Cell | null) => void;
}

export const cellX = (col: number) => col - 4.5;
export const cellZ = (row: number) => row - 4.5;
const STILL_T = 2.4;

/** Shared mutable state between scene parts (no React renders per frame). */
interface Shared {
  shake: number;
  sinkStart: Map<SbShipId, number>;
  burst: ParticlePool | null;
}

export function Scene(props: SceneProps) {
  const { mode, reduce } = props;
  const shared = useRef<Shared>({ shake: 0, sinkStart: new Map(), burst: null });
  return (
    <>
      <Rig mode={mode} reduce={reduce} shared={shared} />
      <ambientLight intensity={0.35} color="#8fa6d8" />
      <hemisphereLight args={['#4a6cb0', '#05060a', 0.9]} />
      <directionalLight position={[-5, 7, -9]} intensity={2.1} color="#c4d2ff" />
      <directionalLight position={[6, 4, 8]} intensity={0.55} color="#7c5cff" />
      <Sky reduce={reduce} />
      <Ocean {...props} shared={shared} />
      {props.ships.map((s) => (
        <Ship key={s.ship.id} ship={s.ship} look={s.look} reduce={reduce} shared={shared} />
      ))}
      {mode === 'battle' ? (
        <>
          <MissBuoys marks={props.marks} reduce={reduce} />
          {props.aim ? <Crosshair cell={props.aim} active={!!props.aimActive} reduce={reduce} /> : null}
          {!reduce ? <Effects {...props} shared={shared} /> : null}
          <FireLight marks={props.marks} reduce={reduce} />
        </>
      ) : null}
    </>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* Camera                                                                                          */
/* ---------------------------------------------------------------------------------------------- */

function Rig({ mode, reduce, shared }: { mode: 'battle' | 'preview'; reduce: boolean; shared: MutableRefObject<Shared> }) {
  const { camera, size } = useThree();
  const base = useRef({ pos: new THREE.Vector3(0, 12, 10), target: new THREE.Vector3() });

  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = mode === 'battle' ? 30 : 32;
    cam.aspect = size.width / Math.max(1, size.height);
    // Phones (narrow canvas) get a steeper view so the far rows stay big enough to tap.
    const narrow = size.width / Math.max(1, size.height) < 1.4;
    const pitch = ((mode === 'battle' ? (narrow ? 66 : 51) : 22) * Math.PI) / 180;
    const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
    // Points that must stay on screen: the grid with its labels, plus mast height.
    const pts: THREE.Vector3[] = [];
    const xs = mode === 'battle' ? [-5.95, 5.25] : [-4.8, 4.8];
    const zs = mode === 'battle' ? [-5.2, 5.95] : [-3.8, 4.6];
    for (const x of xs) for (const z of zs) for (const y of [0, 0.7]) pts.push(new THREE.Vector3(x, y, z));
    const lim = mode === 'battle' ? [0.97, 0.95] : [0.98, 0.9];
    const v = new THREE.Vector3();
    let best: { d: number; tz: number } | null = null;
    for (let tz = -3; tz <= 2.4; tz += 0.1) {
      const target = new THREE.Vector3(mode === 'battle' ? -0.3 : 0, 0, tz);
      for (let d = 6; d < 60; d += 0.2) {
        cam.position.copy(target).addScaledVector(dir, d);
        cam.lookAt(target);
        cam.updateMatrixWorld();
        cam.updateProjectionMatrix();
        let ok = true;
        let ymin = 9;
        let ymax = -9;
        for (const p of pts) {
          v.copy(p).project(cam);
          if (Math.abs(v.x) > lim[0]! || Math.abs(v.y) > lim[1]!) ok = false;
          ymin = Math.min(ymin, v.y);
          ymax = Math.max(ymax, v.y);
        }
        if (ok) {
          // prefer the closest camera, then the best vertical centring
          const score = d * 0.25 + Math.abs(ymin + ymax) * 6;
          if (!best || score < best.d + 0.0001) best = { d: score, tz };
          break;
        }
      }
    }
    const tz = best?.tz ?? 0.4;
    const target = new THREE.Vector3(mode === 'battle' ? -0.3 : 0, 0, tz);
    for (let d = 6; d < 60; d += 0.05) {
      cam.position.copy(target).addScaledVector(dir, d);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      cam.updateProjectionMatrix();
      if (pts.every((p) => (v.copy(p).project(cam), Math.abs(v.x) <= lim[0]! && Math.abs(v.y) <= lim[1]!))) break;
    }
    base.current.pos.copy(cam.position);
    base.current.target.copy(target);
  }, [camera, size.width, size.height, mode]);

  useFrame((state, dt) => {
    const b = base.current;
    const t = state.clock.elapsedTime;
    const s = shared.current;
    camera.position.copy(b.pos);
    if (!reduce) {
      camera.position.x += Math.sin(t * 0.21) * 0.16;
      camera.position.y += Math.sin(t * 0.17) * 0.08;
      camera.position.z += Math.sin(t * 0.13 + 1) * 0.1;
      if (s.shake > 0.001) {
        camera.position.x += (Math.random() - 0.5) * s.shake;
        camera.position.y += (Math.random() - 0.5) * s.shake;
        s.shake *= Math.exp(-dt * 7);
      }
    }
    camera.lookAt(b.target);
  });
  return null;
}

/* ---------------------------------------------------------------------------------------------- */
/* Sky and ocean                                                                                   */
/* ---------------------------------------------------------------------------------------------- */

function Sky({ reduce }: { reduce: boolean }) {
  const mat = useMemo(() => makeSkyMaterial(), []);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame((s) => {
    mat.uniforms.uTime!.value = reduce ? STILL_T : s.clock.elapsedTime;
  });
  return (
    <mesh material={mat} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[120, 32, 16]} />
    </mesh>
  );
}

function Ocean(props: SceneProps & { shared: MutableRefObject<Shared> }) {
  const { marks, aim, aimActive, hover, lastShot, reduce, active, mode, onTap, onHover, impact, shared, grid } = props;
  const marksTex = useMemo(() => makeMarksTexture(), []);
  const labels = useMemo(() => (mode === 'battle' ? makeLabelsTexture() : null), [mode]);
  const mat = useMemo(() => makeOceanMaterial(labels, marksTex), [labels, marksTex]);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(110, 110, 150, 150);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const ripple = useRef(0);
  useEffect(
    () => () => {
      mat.dispose();
      geo.dispose();
      marksTex.dispose();
      labels?.dispose();
    },
    [mat, geo, marksTex, labels],
  );

  // Marks into the data texture and fire lights into uniforms.
  useEffect(() => {
    const d = marksTex.image.data as Uint8Array;
    d.fill(0);
    const fires = mat.uniforms.uFires!.value as THREE.Vector3[];
    let n = 0;
    marks?.forEach((m, i) => {
      const o = i * 4;
      if (m === 'miss') d[o] = 255;
      else if (m === 'auto') d[o + 1] = 255;
      else if (m === 'hit') d[o + 2] = 255;
      else if (m === 'sunk') {
        d[o + 2] = 150;
        d[o + 3] = 255;
      }
      if ((m === 'hit' || m === 'sunk') && n < MAX_FIRES) fires[n++]!.set(cellX(i % 10), cellZ(Math.floor(i / 10)), m === 'hit' ? 1 : 0.55);
    });
    mat.uniforms.uFireCount!.value = n;
    marksTex.needsUpdate = true;
  }, [marks, marksTex, mat]);

  useEffect(() => {
    mat.uniforms.uGrid!.value = grid ?? (mode === 'battle' ? 1 : 0);
  }, [mat, mode, grid]);

  // Ripple on each landing.
  const clock = useThree((s) => s.clock);
  useEffect(() => {
    if (!impact || reduce) return;
    const r = mat.uniforms.uRipples!.value as THREE.Vector4[];
    const slot = ripple.current++ % MAX_RIPPLES;
    r[slot]!.set(cellX(impact.col), cellZ(impact.row), clock.elapsedTime, impact.kind === 'miss' ? 1 : 0.6);
  }, [impact, mat, reduce, clock]);

  useFrame((s) => {
    const u = mat.uniforms;
    u.uTime!.value = reduce ? STILL_T : s.clock.elapsedTime;
    const pulse = reduce ? 1 : 0.75 + 0.25 * Math.sin(s.clock.elapsedTime * 4);
    (u.uAim!.value as THREE.Vector3).set(aim?.col ?? 0, aim?.row ?? 0, aim ? (aimActive ? pulse : 0.4) : 0);
    (u.uHover!.value as THREE.Vector3).set(hover?.col ?? 0, hover?.row ?? 0, hover && (!aim || hover.row !== aim.row || hover.col !== aim.col) ? 0.6 : 0);
    (u.uLast!.value as THREE.Vector3).set(lastShot?.col ?? 0, lastShot?.row ?? 0, lastShot ? 1 : 0);
    const a = u.uActive!.value as number;
    u.uActive!.value = a + ((active ? 1 : 0) - a) * 0.08;
  });

  const down = useRef<{ x: number; y: number } | null>(null);
  const cellAt = (e: ThreeEvent<PointerEvent>) => {
    const col = Math.floor(e.point.x + 5);
    const row = Math.floor(e.point.z + 5);
    return row >= 0 && row < 10 && col >= 0 && col < 10 ? { row, col } : null;
  };
  void shared;

  return (
    <>
      <mesh geometry={geo} material={mat} frustumCulled={false} />
      {onTap ? (
        <mesh
          rotation-x={-Math.PI / 2}
          position={[0, 0.02, 0]}
          onPointerDown={(e) => {
            down.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
          }}
          onPointerUp={(e) => {
            const d = down.current;
            down.current = null;
            if (!d || Math.hypot(e.nativeEvent.clientX - d.x, e.nativeEvent.clientY - d.y) > 10) return;
            const c = cellAt(e);
            if (c) onTap(c.row, c.col);
          }}
          onPointerMove={(e) => {
            if (e.nativeEvent.pointerType !== 'mouse') return;
            onHover?.(cellAt(e));
          }}
          onPointerOut={() => onHover?.(null)}
        >
          <planeGeometry args={[10, 10]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      ) : null}
    </>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* Ships                                                                                           */
/* ---------------------------------------------------------------------------------------------- */

const SLOTS: Slot[] = ['hull', 'deck', 'detail', 'glow'];
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

function Ship({ ship, look, reduce, shared }: { ship: SbShip; look: ShipLook3D; reduce: boolean; shared: MutableRefObject<Shared> }) {
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const geo = useMemo(() => shipGeometry(ship.id), [ship.id]);
  const mats = shipMaterials(look);
  const size = sbShipSize(ship.id);
  const cx = ship.dir === 'h' ? ship.col + size / 2 - 5 : cellX(ship.col);
  const cz = ship.dir === 'h' ? cellZ(ship.row) : ship.row + size / 2 - 5;
  const yaw = ship.dir === 'h' ? 0 : -Math.PI / 2;
  const seed = ship.row * 7 + ship.col * 3;

  useFrame((state) => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const t = reduce ? STILL_T : state.clock.elapsedTime;
    const half = size * 0.45;
    const ax = ship.dir === 'h' ? 1 : 0;
    const az = ship.dir === 'h' ? 0 : 1;
    const hc = waveHeight(cx, cz, t);
    const hb = waveHeight(cx + ax * half, cz + az * half, t);
    const hs = waveHeight(cx - ax * half, cz - az * half, t);
    const hl = waveHeight(cx - az * 0.3, cz + ax * 0.3, t);
    const hr = waveHeight(cx + az * 0.3, cz - ax * 0.3, t);
    let y = hc + (reduce ? 0 : Math.sin(t * 1.3 + seed) * 0.012);
    let pitch = Math.atan2(hb - hs, half * 2) * 1.4;
    let roll = Math.atan2(hl - hr, 0.6) * 0.8 + (reduce ? 0 : Math.sin(t * 0.9 + seed) * 0.015);
    if (look === 'wreck') {
      // Final pose: settled low, listing to one side, bow down a little.
      const wreck = { y: -0.08, roll: 0.26, pitch: -0.06 };
      const start = shared.current.sinkStart.get(ship.id);
      const e = start === undefined || reduce ? 99 : state.clock.elapsedTime - start;
      if (e < 0.7) {
        // rises from under the waves
        const k = ease(e / 0.7);
        y = THREE.MathUtils.lerp(-0.8, y + 0.04, k);
      } else if (e < 1.9) {
        y += 0.04;
      } else {
        const k = ease((e - 1.9) / 1.8);
        y = THREE.MathUtils.lerp(y + 0.04, hc * 0.4 + wreck.y, k);
        roll = THREE.MathUtils.lerp(roll, wreck.roll, k);
        pitch = THREE.MathUtils.lerp(pitch, wreck.pitch, k);
      }
    }
    o.position.set(cx, y, cz);
    i.rotation.set(roll, 0, pitch);
  });

  return (
    <group ref={outer} rotation-y={yaw}>
      <group ref={inner}>
        {SLOTS.map((s) => (
          <mesh key={s} geometry={geo[s]} material={mats[s]} />
        ))}
      </group>
    </group>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* Markers, crosshair, fire light                                                                  */
/* ---------------------------------------------------------------------------------------------- */

function MissBuoys({ marks, reduce }: { marks?: SbMark[]; reduce: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const cells = useMemo(() => (marks ?? []).flatMap((m, i) => (m === 'miss' ? [i] : [])), [marks]);
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(0.075, 12, 8);
    g.scale(1, 0.7, 1);
    return g;
  }, []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#e8f6ff', toneMapped: false }), []);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  useFrame((s) => {
    const im = ref.current;
    if (!im) return;
    const t = reduce ? STILL_T : s.clock.elapsedTime;
    cells.forEach((i, k) => {
      const x = cellX(i % 10);
      const z = cellZ(Math.floor(i / 10));
      m4.makeTranslation(x, waveHeight(x, z, t) + 0.04, z);
      im.setMatrixAt(k, m4);
    });
    im.count = cells.length;
    im.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, 100]} frustumCulled={false} />;
}

function Crosshair({ cell, active, reduce }: { cell: Cell; active: boolean; reduce: boolean }) {
  const g = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#C6FF3D', transparent: true, depthTest: false, toneMapped: false }), []);
  const beam = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uA: { value: 1 } },
        vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform float uA; varying float vY; void main(){ float a = (1.0 - smoothstep(-1.2, 1.2, vY)) * 0.35 * uA; gl_FragColor = vec4(vec3(0.78,1.0,0.24) * a, 1.0); }',
      }),
    [],
  );
  useEffect(
    () => () => {
      mat.dispose();
      beam.dispose();
    },
    [mat, beam],
  );
  const x = cellX(cell.col);
  const z = cellZ(cell.row);
  useFrame((s, dt) => {
    const t = reduce ? STILL_T : s.clock.elapsedTime;
    if (g.current) {
      const target = new THREE.Vector3(x, waveHeight(x, z, t) + 0.05, z);
      if (reduce) g.current.position.copy(target);
      else g.current.position.lerp(target, 1 - Math.exp(-dt * 18));
    }
    if (spin.current && !reduce) spin.current.rotation.z = t * 0.6;
    const k = active ? (reduce ? 1 : 1 + Math.sin(t * 5) * 0.06) : 0.92;
    spin.current?.scale.setScalar(k);
    mat.opacity = active ? 1 : 0.5;
    beam.uniforms.uA!.value = active ? 1 : 0.4;
  });
  return (
    <group ref={g} position={[x, 0.05, z]} renderOrder={20}>
      <group rotation-x={-Math.PI / 2}>
        <group ref={spin}>
          <mesh material={mat} renderOrder={20}>
            <ringGeometry args={[0.33, 0.39, 40]} />
          </mesh>
          {[0, 1, 2, 3].map((k) => (
            <mesh key={k} material={mat} renderOrder={20} rotation-z={(k * Math.PI) / 2} position={[Math.cos((k * Math.PI) / 2) * 0.44, Math.sin((k * Math.PI) / 2) * 0.44, 0]}>
              <planeGeometry args={[0.16, 0.045]} />
            </mesh>
          ))}
        </group>
        <mesh material={mat} renderOrder={20}>
          <circleGeometry args={[0.05, 16]} />
        </mesh>
      </group>
      <mesh material={beam} position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 2.4, 8, 1, true]} />
      </mesh>
    </group>
  );
}

function FireLight({ marks, reduce }: { marks?: SbMark[]; reduce: boolean }) {
  const light = useRef<THREE.PointLight>(null);
  const centre = useMemo(() => {
    let x = 0;
    let z = 0;
    let n = 0;
    marks?.forEach((m, i) => {
      if (m === 'hit' || m === 'sunk') {
        x += cellX(i % 10);
        z += cellZ(Math.floor(i / 10));
        n++;
      }
    });
    return n ? { x: x / n, z: z / n, n } : null;
  }, [marks]);
  useFrame((s) => {
    const l = light.current;
    if (!l) return;
    const t = s.clock.elapsedTime;
    l.intensity = centre ? (reduce ? 4 : 4 + Math.sin(t * 13) * 0.8 + Math.sin(t * 7.3) * 0.6) : 0;
  });
  return <pointLight ref={light} position={[centre?.x ?? 0, 0.9, centre?.z ?? 0]} color="#ff7a2a" distance={9} decay={1.6} intensity={0} />;
}

/* ---------------------------------------------------------------------------------------------- */
/* Shell, impacts, burning cells                                                                   */
/* ---------------------------------------------------------------------------------------------- */

function Effects({ marks, flight, impact, flightMs = 800, shared }: SceneProps & { shared: MutableRefObject<Shared> }) {
  const { scene, clock } = useThree();
  const pools = useMemo(() => ({ burst: new ParticlePool(1400), steady: new ParticlePool(320) }), []);
  const shell = useRef<THREE.Mesh>(null);
  const fl = useRef<{ key: number; start: number; from: THREE.Vector3; to: THREE.Vector3; ctrl: THREE.Vector3 } | null>(null);

  useEffect(() => {
    scene.add(pools.burst.mesh, pools.steady.mesh);
    shared.current.burst = pools.burst;
    return () => {
      scene.remove(pools.burst.mesh, pools.steady.mesh);
      pools.burst.dispose();
      pools.steady.dispose();
    };
  }, [pools, scene, shared]);

  // Looping fire and smoke on every burning cell.
  useEffect(() => {
    const list: Particle[] = [];
    marks?.forEach((m, i) => {
      if (m !== 'hit' && m !== 'sunk') return;
      list.push(...burning(cellX(i % 10), 0.06, cellZ(Math.floor(i / 10)), i + 1, m === 'hit'));
    });
    pools.steady.set(list);
  }, [marks, pools]);

  // New shell in flight.
  useEffect(() => {
    if (!flight) {
      fl.current = null;
      return;
    }
    const to = new THREE.Vector3(cellX(flight.col), 0.05, cellZ(flight.row));
    const from = new THREE.Vector3(to.x * 0.3 - 1.5, 9, 15);
    const ctrl = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 5, 0));
    fl.current = { key: flight.key, start: clock.elapsedTime, from, to, ctrl };
  }, [flight, clock]);

  // Landing.
  useEffect(() => {
    if (!impact) return;
    const t = clock.elapsedTime;
    const x = cellX(impact.col);
    const z = cellZ(impact.row);
    const y = waveHeight(x, z, t);
    if (impact.kind === 'miss') {
      pools.burst.emit(splashBurst(x, y, z, t));
      shared.current.shake = Math.max(shared.current.shake, 0.04);
    } else {
      pools.burst.emit(fireBurst(x, y, z, t, impact.kind === 'sunk'));
      shared.current.shake = Math.max(shared.current.shake, impact.kind === 'sunk' ? 0.32 : 0.18);
      if (impact.kind === 'sunk' && impact.ship) {
        shared.current.sinkStart.set(impact.ship.id, t);
        // A chain of blasts along the ship as it surfaces and burns.
        shipCells(impact.ship).forEach((p, k) => {
          const px = cellX(p.col);
          const pz = cellZ(p.row);
          pools.burst.emit(fireBurst(px, 0.1, pz, t + 0.55 + k * 0.16, false));
        });
      }
    }
  }, [impact, pools, clock, shared]);

  const tmp = useMemo(() => new THREE.Vector3(), []);
  const lastTrail = useRef(0);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    pools.burst.setTime(t);
    pools.steady.setTime(t);
    const f = fl.current;
    const m = shell.current;
    if (!m) return;
    if (!f) {
      m.visible = false;
      return;
    }
    const u = (t - f.start) / (flightMs / 1000);
    if (u >= 1) {
      m.visible = false;
      return;
    }
    const a = 1 - u;
    tmp.set(0, 0, 0).addScaledVector(f.from, a * a).addScaledVector(f.ctrl, 2 * a * u).addScaledVector(f.to, u * u);
    m.position.copy(tmp);
    m.visible = true;
    if (t - lastTrail.current > 1 / 90) {
      lastTrail.current = t;
      pools.burst.emit(trail(tmp.x, tmp.y, tmp.z, t));
    }
  });

  return (
    <mesh ref={shell} visible={false} renderOrder={12}>
      <sphereGeometry args={[0.13, 12, 8]} />
      <meshBasicMaterial color="#f6ffe0" toneMapped={false} />
    </mesh>
  );
}

export const HORIZON_CSS = `#${HORIZON.getHexString()}`;
