'use client';
/**
 * 3D Ice Floe Battle board (WebGL via react-three-fiber). Same contract as the 2D SeaBattleBoard: the
 * server is the authority and this component only sends intents.
 *
 * Placing: the proven 2D placing UI (drag, turn, auto place, Ready) is rendered as is, with a 3D
 * preview of the fleet floating on the night sea above it. Firing: enemy waters are a 3D sea seen
 * from a fixed cinematic angle. Tap a square to aim (lime crosshair), tap again or press Fire to
 * shoot; a shell arcs in from off screen and lands as a splash, a fireball, or a sinking wreck.
 * Your own fleet is the 2D grid inset, showing incoming fire. A hidden grid of 100 buttons gives
 * keyboard and screen reader play with the same aim and fire logic.
 *
 * Falls back to the 2D board when WebGL 2 is missing, the canvas fails, or render3d is false.
 * Load with next/dynamic and ssr: false.
 */
import { Component, useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { useAnimate, useReducedMotion } from 'motion/react';
import { shipCells, type SbMark, type SbMove, type SbShip, type SbView } from '@coldcall/games/seabattle';
import type { BoardProps } from '../../types';
import { haptic, play, type SoundName } from '@/lib/sound';
import { SeaBattleBoard } from '../SeaBattleBoard';
import { COLORS, SB_CSS } from '../art';
import { COLS, Grid, cellName, type GridShip } from '../Grid';
import { Explosion, Shell, SinkFlash, Splash } from '../Effects';
import { Scene, type Cell, type Impact, type SceneShip } from './Scene';
import { FleetTracker, Icon, PanelTitle, ResultBanner, ShotStats, StatusBar, battleStatus } from './hud';

type Fire = Extract<SbMove, { type: 'fire' }>;
interface Flight extends Cell {
  key: number;
  shooter: number;
}
interface Fx extends Cell {
  key: number;
  board: number;
  kind: 'miss' | 'hit' | 'sunk';
  cells: Cell[];
  ship?: SbShip;
}

const FLIGHT_MS = 640;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function hasWebGL2(): boolean {
  try {
    const c = document.createElement('canvas');
    const ctx = c.getContext('webgl2');
    if (!ctx) return false;
    ctx.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

class GlBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.warn('Ice Floe Battle 3D failed, showing the 2D board instead.', e);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function SeaBattleBoard3D(props: BoardProps<SbView, SbMove>) {
  const [gl, setGl] = useState<'unknown' | 'ok' | 'no'>('unknown');
  const [lost, setLost] = useState(false);
  useEffect(() => setGl(hasWebGL2() ? 'ok' : 'no'), []);
  if (props.settings.render3d === false || gl === 'no' || lost) return <SeaBattleBoard {...props} />;
  return (
    <GlBoundary fallback={<SeaBattleBoard {...props} />}>
      <Board3D {...props} glReady={gl === 'ok'} onLost={() => setLost(true)} />
    </GlBoundary>
  );
}

/** Frame loop control: run only while on screen and the tab is visible; reduced motion renders on demand. */
function useLoop(ref: React.RefObject<HTMLElement | null>, reduce: boolean): 'always' | 'demand' | 'never' {
  const [onScreen, setOnScreen] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  useEffect(() => {
    const vis = () => setTabVisible(document.visibilityState !== 'hidden');
    vis();
    document.addEventListener('visibilitychange', vis);
    const el = ref.current;
    let io: IntersectionObserver | null = null;
    if (el && 'IntersectionObserver' in window) {
      io = new IntersectionObserver((es) => setOnScreen(es.some((e) => e.isIntersecting)), { rootMargin: '80px' });
      io.observe(el);
    }
    return () => {
      document.removeEventListener('visibilitychange', vis);
      io?.disconnect();
    };
  }, [ref]);
  if (reduce) return 'demand';
  return onScreen && tabVisible ? 'always' : 'never';
}

/** Re-render on demand whenever React props change (reduced motion mode). */
function Invalidator({ dep }: { dep: unknown }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
    const t = setTimeout(invalidate, 60);
    return () => clearTimeout(t);
  }, [dep, invalidate]);
  return null;
}

function SeaCanvas({ children, loop, onLost, dep, label }: { children: ReactNode; loop: 'always' | 'demand' | 'never'; onLost: () => void; dep: unknown; label: string }) {
  // A canvas that unmounts (for example the placing preview when the battle starts) releases its own
  // WebGL context on purpose. Only treat a loss as a failure if this canvas is still mounted and the
  // context has not come back shortly after.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return (
    <Canvas
      dpr={[1, 2]}
      frameloop={loop}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 36, near: 0.1, far: 300, position: [0, 12, 10] }}
      style={{ touchAction: 'manipulation', position: 'absolute', inset: 0 }}
      aria-label={label}
      onCreated={({ gl }) => {
        gl.setClearColor('#030810');
        let restored = false;
        gl.domElement.addEventListener('webglcontextrestored', () => {
          restored = true;
        });
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault();
          restored = false;
          setTimeout(() => {
            if (alive.current && gl.domElement.isConnected && !restored) onLost();
          }, 2500);
        });
      }}
    >
      <Invalidator dep={dep} />
      {children}
    </Canvas>
  );
}

function Board3D(props: BoardProps<SbView, SbMove> & { glReady: boolean; onLost: () => void }) {
  const { view, mySeat, settings, glReady, onLost } = props;
  const reduce = !!useReducedMotion();
  const me = mySeat ?? 0;
  const spectator = mySeat === null || view.viewer === -1;

  const sound = useCallback(
    (name: SoundName) => {
      if (!settings.sound) return;
      play(name);
      if (name === 'bomb' || name === 'capture') haptic('strong');
      else if (name === 'tap') haptic('light');
    },
    [settings.sound],
  );

  /* -------- shot animation: the shown view lags the real view while a shell is in flight (same as 2D) -------- */
  const [shown, setShown] = useState<SbView>(view);
  const shownRef = useRef<SbView>(view);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [fx, setFx] = useState<Fx[]>([]);
  const [impact, setImpact] = useState<Impact | null>(null);
  const fxKey = useRef(0);
  const pending = useRef<{ land: () => void; timer: ReturnType<typeof setTimeout> } | null>(null);
  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current.timer);
    },
    [],
  );

  useEffect(() => {
    // A newer view arrived while a shell was still flying: land that shot now so its effects and
    // sounds are not lost, then animate the new one.
    if (pending.current) {
      const p = pending.current;
      pending.current = null;
      clearTimeout(p.timer);
      p.land();
    }
    const prev = shownRef.current;
    const show = (v: SbView) => {
      shownRef.current = v;
      setShown(v);
    };
    const ls = view.lastShot;
    if (!ls || view.shotNo !== prev.shotNo + 1) {
      setFlight(null);
      show(view);
      return;
    }
    const land = () => {
      setFlight(null);
      show(view);
      const board = 1 - ls.seat;
      const ship = ls.result === 'sunk' ? view.boards[board as 0 | 1]!.ships.find((s) => s.id === ls.ship) : undefined;
      const key = ++fxKey.current;
      setFx((f) => [...f.slice(-3), { key, board, row: ls.row, col: ls.col, kind: ls.result, cells: ship ? shipCells(ship) : [], ship }]);
      setTimeout(() => setFx((f) => f.filter((e) => e.key !== key)), 1600);
      if (board !== me) setImpact({ key, row: ls.row, col: ls.col, kind: ls.result, ship });
      sound(ls.result === 'miss' ? 'tap' : ls.result === 'hit' ? 'bomb' : 'capture');
      if (ls.result === 'sunk') setTimeout(() => sound('bomb'), 160);
    };
    if (reduce) {
      land();
      return;
    }
    setFlight({ key: view.shotNo, shooter: ls.seat, row: ls.row, col: ls.col });
    if (settings.sound) play('card');
    const timer = setTimeout(() => {
      pending.current = null;
      land();
    }, FLIGHT_MS);
    pending.current = { land, timer };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const resultSounded = useRef(false);
  useEffect(() => {
    if (!shown.result) {
      resultSounded.current = false;
      return;
    }
    if (resultSounded.current || spectator) return;
    resultSounded.current = true;
    const won = shown.result.winners.includes(me);
    const t = setTimeout(() => sound(won ? 'win' : 'lose'), 700);
    return () => clearTimeout(t);
  }, [shown.result, me, spectator, sound]);

  const placing = shown.phase === 'placing' && !shown.result;

  return (
    <div className="relative mx-auto w-full max-w-[1120px] text-text">
      <style>{SB_CSS}</style>
      {placing ? (
        <div className="flex flex-col gap-3">
          {/* On phones the preview only appears once the fleet is locked in, so the grid, dock and Ready fit on one screen. */}
          {!spectator ? (
            <div className={shown.ready[me as 0 | 1] ? '' : 'max-lg:hidden'}>
              <FleetPreview view={shown} me={me} reduce={reduce} glReady={glReady} onLost={onLost} />
            </div>
          ) : null}
          <SeaBattleBoard {...props} />
        </div>
      ) : (
        <Battle {...props} shown={shown} me={me} spectator={spectator} reduce={reduce} flight={flight} fx={fx} impact={impact} sound={sound} glReady={glReady} />
      )}
    </div>
  );
}

/* ================================================================================================ */
/* Placing: 3D preview of your fleet above the 2D placing UI                                        */
/* ================================================================================================ */

/** A legal parade formation used until your real layout is locked in. */
const PARADE: SbShip[] = [
  { id: 'carrier', row: 1, col: 0, dir: 'h' },
  { id: 'warship', row: 3, col: 5, dir: 'h' },
  { id: 'destroyer', row: 5, col: 1, dir: 'h' },
  { id: 'submarine', row: 7, col: 6, dir: 'h' },
  { id: 'patrol', row: 8, col: 2, dir: 'h' },
];

function FleetPreview({ view, me, reduce, glReady, onLost }: { view: SbView; me: number; reduce: boolean; glReady: boolean; onLost: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const loop = useLoop(box, reduce);
  const ready = view.ready[me as 0 | 1];
  const mine = view.boards[me as 0 | 1].ships;
  const real = ready && mine.length === 5;
  const ships: SceneShip[] = useMemo(() => (real ? mine : PARADE).map((s) => ({ ship: s, look: 'own' as const })), [real, mine]);
  return (
    <div className="mx-auto w-full max-w-[1120px] px-2 lg:px-0">
      <div ref={box} className="relative aspect-[16/8] w-full overflow-hidden rounded-[20px] bg-[#030810] sm:aspect-[16/5]" style={{ boxShadow: '0 0 0 1px rgba(90, 143, 224,0.45), 0 0 36px rgba(90, 143, 224,0.22)' }}>
        {glReady ? (
          <SeaCanvas loop={loop} onLost={onLost} dep={ships} label={real ? 'Your fleet in position, shown in 3D.' : 'Your five ships, shown in 3D.'}>
            <Scene mode="preview" ships={ships} grid={real ? 0.5 : 0} reduce={reduce} />
          </SeaCanvas>
        ) : null}
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(120% 100% at 50% 40%, transparent 50%, rgba(0,0,0,0.55) 100%)' }} />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <p className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-white">
            <span className="inline-block size-2.5 rounded-full" style={{ background: COLORS.violet, boxShadow: `0 0 10px ${COLORS.violet}` }} />
            Your ships
          </p>
          <p className="rounded-chip bg-black/45 px-2 py-1 text-xs font-semibold text-[#d8d8ea]">{real ? 'In position' : 'Place them on your grid below'}</p>
        </div>
      </div>
    </div>
  );
}

/* ================================================================================================ */
/* Battle                                                                                           */
/* ================================================================================================ */

function markWord(m: SbMark | undefined) {
  switch (m) {
    case 'miss':
      return 'miss';
    case 'hit':
      return 'hit';
    case 'sunk':
      return 'sunk ship';
    case 'auto':
      return 'empty, touches a sunk ship';
    default:
      return 'not fired yet';
  }
}

function Battle({
  view: real,
  shown: view,
  legal,
  me,
  spectator,
  onMove,
  busy: busyProp,
  settings,
  error,
  seatNames,
  hint,
  reduce,
  flight,
  fx,
  impact,
  sound,
  glReady,
  onLost,
}: BoardProps<SbView, SbMove> & {
  shown: SbView;
  me: number;
  spectator: boolean;
  reduce: boolean;
  flight: Flight | null;
  fx: Fx[];
  impact: Impact | null;
  sound: (n: SoundName) => void;
  glReady: boolean;
  onLost: () => void;
}) {
  const uid = useId().replace(/:/g, '');
  const opp = 1 - me;
  const mine = view.boards[me as 0 | 1];
  const theirs = view.boards[opp as 0 | 1];
  const busy = !!busyProp || !!flight;
  const confirm = settings.confirmMoves;
  const myTurn = !spectator && real.turn === me && view.turn === me && !busy && !real.result;
  const fires = useMemo(() => new Set(legal.filter((m): m is Fire => m.type === 'fire').map((m) => m.row * 10 + m.col)), [legal]);
  const initialHint = hint && hint.type === 'fire' ? hint : null;

  const [aim, setAim] = useState<Cell | null>(initialHint ? { row: initialHint.row, col: initialHint.col } : null);
  const [hover, setHover] = useState<Cell | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [keyAim, setKeyAim] = useState(!!initialHint);
  const [scope, animate] = useAnimate();
  const lastShotNo = useRef(view.shotNo);
  const box = useRef<HTMLDivElement>(null);
  const loop = useLoop(box, reduce);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (view.shotNo !== lastShotNo.current) {
      lastShotNo.current = view.shotNo;
      setNote(null);
    }
  }, [view.shotNo]);

  const reject = useCallback(
    (row: number, col: number) => {
      const m = theirs.marks[row * 10 + col];
      setNote(m === 'auto' ? 'That square touches a sunk ship, so it must be empty. Pick another.' : 'You already fired at that square.');
      sound('error');
      if (!reduce && scope.current) void animate(scope.current, { x: [0, -6, 6, -4, 4, 0] }, { duration: 0.32 });
    },
    [animate, reduce, scope, sound, theirs.marks],
  );

  const shoot = useCallback(
    (row: number, col: number) => {
      if (!myTurn) {
        setNote(real.result ? 'The battle is over.' : 'Wait for your turn.');
        return;
      }
      if (!fires.has(row * 10 + col)) return reject(row, col);
      setNote(null);
      onMove({ type: 'fire', row, col });
    },
    [fires, myTurn, onMove, real.result, reject],
  );

  const tapCell = (row: number, col: number, viaKeys = false) => {
    if (spectator || real.result) return;
    setKeyAim(viaKeys);
    const same = aim && aim.row === row && aim.col === col;
    setAim({ row, col });
    if (!myTurn) {
      setNote('Wait for your turn.');
      return;
    }
    if (!fires.has(row * 10 + col)) return reject(row, col);
    setNote(null);
    if (!confirm || same) {
      if (!confirm) shoot(row, col);
      else setNote('Press Fire to shoot.');
    } else sound('tap');
  };

  // Hidden accessible grid: arrow keys move focus (and the 3D crosshair), Enter fires like a tap.
  const focusIdx = aim ? aim.row * 10 + aim.col : 44;
  const onCellKey = (e: KeyboardEvent, row: number, col: number) => {
    const d: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const step = d[e.key];
    if (!step) return;
    e.preventDefault();
    const r = clamp(row + step[0], 0, 9);
    const c = clamp(col + step[1], 0, 9);
    cellRefs.current[r * 10 + c]?.focus();
  };

  const { status, tone } = battleStatus({ view, me, spectator, seatNames, flight });
  const shownStatus = note ?? error ?? status;
  const noteTone = !!(note || error);
  const result = view.result;

  const sceneShips: SceneShip[] = useMemo(() => theirs.ships.map((s) => ({ ship: s, look: theirs.sunk.includes(s.id) ? ('wreck' as const) : ('reveal' as const) })), [theirs.ships, theirs.sunk]);
  const myShips: GridShip[] = mine.ships.map((s) => ({ ship: s, look: mine.sunk.includes(s.id) ? 'ownSunk' : 'own' }));
  const ls = view.lastShot;
  const lastOn = (board: number) => (ls && 1 - ls.seat === board && !flight ? { row: ls.row, col: ls.col } : null);
  const enemyFlight = flight && 1 - flight.shooter === opp ? flight : null;
  const incomingFlight = flight && 1 - flight.shooter === me ? flight : null;
  const aimLegal = aim ? fires.has(aim.row * 10 + aim.col) : false;
  const showFire = !spectator && !result && (confirm || (keyAim && !!aim));
  const shownAim = !result && !spectator ? aim : null;

  const inset = (
    <div className="rounded-[14px] bg-[#050d22] p-1" style={{ boxShadow: '0 0 0 1.5px rgba(90, 143, 224,0.6), 0 0 18px rgba(90, 143, 224,0.25)' }}>
      <Grid uid={`${uid}m`} marks={mine.marks} ships={myShips} lastShot={lastOn(me)} compact label={`My fleet. ${mine.afloat.length} of 5 ships afloat.`}>
        {incomingFlight && !reduce ? <Shell key={`s${incomingFlight.key}`} row={incomingFlight.row} col={incomingFlight.col} from="top" duration={FLIGHT_MS / 1000} /> : null}
        {fx
          .filter((f) => f.board === me)
          .map((f) =>
            f.kind === 'miss' ? (
              <Splash key={f.key} row={f.row} col={f.col} reduce={reduce} />
            ) : (
              <g key={f.key}>
                {f.kind === 'sunk' ? <SinkFlash cells={f.cells} reduce={reduce} /> : null}
                <Explosion row={f.row} col={f.col} big={f.kind === 'sunk'} reduce={reduce} />
              </g>
            ),
          )}
      </Grid>
    </div>
  );
  const myTitle = spectator ? seatNames[me] ?? 'Seat 1' : 'My fleet';
  const theirTitle = spectator ? seatNames[opp] ?? 'Seat 2' : 'Enemy fleet';

  return (
    <div className="flex flex-col gap-3 px-2 lg:px-0">
      <p className="sr-only" role="status" aria-live="polite">
        {shownStatus}
      </p>
      <StatusBar text={shownStatus} tone={tone} error={noteTone} reduce={reduce} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-6">
        {/* Enemy waters in 3D: the main view */}
        <div className="min-w-0 lg:order-2 lg:flex-1">
          <PanelTitle
            color={COLORS.lime}
            title={spectator ? seatNames[opp] ?? 'Seat 2' : 'Enemy waters'}
            sub={aim && !result && !spectator ? `Aim ${cellName(aim.row, aim.col)}` : myTurn ? 'Your shot' : `${theirs.afloat.length} of 5 afloat`}
          />
          <div
            ref={scope}
            className="relative rounded-[20px] p-[2px] transition-shadow has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#7fe3ff]"
            style={{
              background: 'linear-gradient(160deg, rgba(127, 227, 255,0.45), rgba(61,220,255,0.18))',
              boxShadow: myTurn ? '0 0 0 1px rgba(127, 227, 255,0.8), 0 0 40px rgba(127, 227, 255,0.28)' : '0 0 0 1px rgba(61,220,255,0.25)',
            }}
          >
            <div ref={box} className="relative aspect-[5/4] w-full overflow-hidden rounded-[18px] bg-[#030810] sm:aspect-[4/3]">
              {glReady ? (
                <SeaCanvas loop={loop} onLost={onLost} dep={[theirs.marks, aim, hover, flight, impact, sceneShips]} label={`Enemy waters in 3D. ${theirs.afloat.length} of 5 enemy ships afloat.`}>
                  <Scene
                    mode="battle"
                    marks={theirs.marks}
                    ships={sceneShips}
                    aim={shownAim}
                    aimActive={myTurn && aimLegal}
                    hover={!spectator && !result ? hover : null}
                    lastShot={lastOn(opp)}
                    flight={enemyFlight}
                    impact={impact}
                    active={myTurn}
                    reduce={reduce}
                    flightMs={FLIGHT_MS}
                    onTap={!spectator && !result ? (r, c) => tapCell(r, c) : undefined}
                    onHover={setHover}
                  />
                </SeaCanvas>
              ) : null}
              <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(0,0,0,0.55) 100%)' }} />
              {result ? <ResultBanner won={result.winners.includes(me)} spectator={spectator} shots={theirs.shotsTaken} reduce={reduce} /> : null}

              {!spectator && !result ? (
                <div role="grid" aria-label="Enemy waters. Use the arrow keys to aim and Enter to fire." className="sr-only">
                  {Array.from({ length: 10 }, (_, r) => (
                    <div role="row" key={r}>
                      {Array.from({ length: 10 }, (_, c) => {
                        const i = r * 10 + c;
                        return (
                          <div role="gridcell" key={c}>
                            <button
                              ref={(el) => {
                                cellRefs.current[i] = el;
                              }}
                              type="button"
                              tabIndex={i === focusIdx ? 0 : -1}
                              aria-label={`${COLS[c]}${r + 1}, ${markWord(theirs.marks[i])}`}
                              onFocus={() => {
                                setKeyAim(true);
                                setAim({ row: r, col: c });
                              }}
                              onKeyDown={(e) => onCellKey(e, r, c)}
                              onClick={() => tapCell(r, c, true)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-3 min-h-14">
            {showFire ? (
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1 text-sm text-text-2">
                  {aim ? (
                    <>
                      Aiming at <span className="tabular text-lg font-extrabold text-text">{cellName(aim.row, aim.col)}</span>
                    </>
                  ) : (
                    'Tap a square to aim.'
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => (aim ? shoot(aim.row, aim.col) : setNote('Tap a square in enemy waters to aim first.'))}
                  aria-disabled={!myTurn || !aimLegal}
                  className={`h-14 min-w-[150px] rounded-chip px-6 text-[17px] font-extrabold uppercase tracking-wider transition active:scale-[0.97] ${myTurn && aimLegal ? 'bg-primary text-primary-ink shadow-glow' : 'bg-surface-2 text-text-2'}`}
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon name="target" /> Fire
                  </span>
                </button>
              </div>
            ) : !spectator && !result ? (
              <p className="pt-1 text-center text-sm text-text-2">Tap a square to fire. Arrow keys and Enter work too.</p>
            ) : null}
          </div>
        </div>

        {/* Own fleet inset, tracker and stats */}
        <div className="flex items-stretch gap-3 lg:order-1 lg:w-[380px] lg:shrink-0 lg:flex-col">
          <div className="w-[46%] shrink-0 lg:w-full">
            <PanelTitle color={COLORS.violet} title={myTitle} sub={`${mine.afloat.length} of 5 afloat`} small />
            {inset}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2 lg:hidden">
            <FleetTracker board={theirs} title={theirTitle} />
            <ShotStats mine={mine} theirs={theirs} />
          </div>
          <div className="hidden flex-col gap-3 lg:flex">
            <ShotStats mine={mine} theirs={theirs} />
            <FleetTracker board={theirs} title={theirTitle} wide />
          </div>
        </div>
      </div>
    </div>
  );
}
