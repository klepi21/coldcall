'use client';
/**
 * Sea Battle board. The server (or the dev page) is the authority; this component only sends
 * intents (place, fire). All art is original SVG (see art.tsx).
 *
 * Placing: drag ships from the dock onto your grid, tap a placed ship to turn it, or tap a dock
 * ship then a square. "Auto place" shuffles a fair random layout locally so you can review it;
 * "Ready" sends the full fleet. Firing: tap a square in enemy waters to aim, tap again (or press
 * Fire) to shoot. With confirm moves on, only the Fire button shoots. Arrow keys move the aim on
 * the enemy grid and Enter fires.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { motion, useAnimate, useReducedMotion } from 'motion/react';
import {
  SB_FLEET,
  randomFleet,
  sbShipName,
  sbShipSize,
  shipCells,
  shipRing,
  validateFleet,
  type SbMove,
  type SbShip,
  type SbShipId,
  type SbView,
} from '@coldcall/games/seabattle';
import { Rng, randomSeedHex } from '@coldcall/games/rng';
import type { BoardProps } from '../types';
import { haptic, play, type SoundName } from '@/lib/sound';
import { COLORS, SB_CSS, ShipIcon } from './art';
import { Grid, cellName, type GridHandle, type GridShip } from './Grid';
import { Explosion, Shell, SinkFlash, Splash } from './Effects';

type Layout = Record<SbShipId, SbShip | null>;
type Fire = Extract<SbMove, { type: 'fire' }>;
interface Flight {
  key: number;
  shooter: number;
  row: number;
  col: number;
}
interface Fx {
  key: number;
  board: number;
  row: number;
  col: number;
  kind: 'miss' | 'hit' | 'sunk';
  cells: { row: number; col: number }[];
  ship?: SbShipId;
}

const FLIGHT_MS = 560;
const emptyLayout = (): Layout => ({ carrier: null, warship: null, destroyer: null, submarine: null, patrol: null });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Keep a ship inside the grid by sliding its anchor. */
function clampShip(s: SbShip): SbShip {
  const n = sbShipSize(s.id);
  return s.dir === 'h' ? { ...s, row: clamp(s.row, 0, 9), col: clamp(s.col, 0, 10 - n) } : { ...s, row: clamp(s.row, 0, 10 - n), col: clamp(s.col, 0, 9) };
}

/** Ships that overlap or touch another ship, and the reason for the first problem. */
function conflicts(layout: Layout, extra?: SbShip | null): { bad: Set<SbShipId>; reason: string | null } {
  const ships = (Object.values(layout).filter(Boolean) as SbShip[]).filter((s) => !extra || s.id !== extra.id);
  if (extra) ships.push(extra);
  const bad = new Set<SbShipId>();
  let reason: string | null = null;
  const occ = new Map<number, SbShipId>();
  for (const s of ships) for (const p of shipCells(s)) {
    const i = p.row * 10 + p.col;
    const o = occ.get(i);
    if (o) {
      bad.add(o).add(s.id);
      reason ??= 'Ships cannot overlap.';
    } else occ.set(i, s.id);
  }
  for (const s of ships) for (const p of shipRing(s)) {
    const o = occ.get(p.row * 10 + p.col);
    if (o && o !== s.id) {
      bad.add(o).add(s.id);
      reason ??= 'Ships cannot touch, not even at the corners.';
    }
  }
  return { bad, reason };
}

export function SeaBattleBoard(props: BoardProps<SbView, SbMove>) {
  const { view, legal, mySeat, onMove, settings, busy, error, seatNames, hint } = props;
  const uid = useId().replace(/:/g, '');
  const reduce = !!useReducedMotion();
  const me = mySeat ?? 0;
  const spectator = mySeat === null || view.viewer === -1;
  const opp = 1 - me;

  const sound = useCallback(
    (name: SoundName) => {
      if (!settings.sound) return;
      play(name);
      if (name === 'bomb' || name === 'capture') haptic('strong');
      else if (name === 'tap') haptic('light');
    },
    [settings.sound],
  );

  /* ---------------- shot animation: the shown view lags the real view during a shell flight ---------------- */
  const [shown, setShown] = useState<SbView>(view);
  const shownRef = useRef<SbView>(view);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [fx, setFx] = useState<Fx[]>([]);
  const fxKey = useRef(0);

  useEffect(() => {
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
      const ship = ls.result === 'sunk' ? view.boards[board]!.ships.find((s) => s.id === ls.ship) : undefined;
      const key = ++fxKey.current;
      setFx((f) => [...f.slice(-3), { key, board, row: ls.row, col: ls.col, kind: ls.result, cells: ship ? shipCells(ship) : [], ship: ship?.id }]);
      setTimeout(() => setFx((f) => f.filter((e) => e.key !== key)), 1400);
      sound(ls.result === 'miss' ? 'tap' : ls.result === 'hit' ? 'bomb' : 'capture');
      if (ls.result === 'sunk') setTimeout(() => sound('bomb'), 120);
    };
    if (reduce) {
      land();
      return;
    }
    setFlight({ key: view.shotNo, shooter: ls.seat, row: ls.row, col: ls.col });
    if (settings.sound) play('card');
    const t = setTimeout(land, FLIGHT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Win and loss sound once.
  const resultSounded = useRef(false);
  useEffect(() => {
    if (!shown.result) {
      resultSounded.current = false;
      return;
    }
    if (resultSounded.current || spectator) return;
    resultSounded.current = true;
    const won = shown.result.winners.includes(me);
    const t = setTimeout(() => sound(won ? 'win' : 'lose'), 500);
    return () => clearTimeout(t);
  }, [shown.result, me, spectator, sound]);

  const placing = shown.phase === 'placing' && !shown.result;

  return (
    <div className="relative mx-auto w-full max-w-[1120px] text-text">
      <style>{SB_CSS}</style>
      {placing ? (
        spectator ? (
          <SpectatorPlacing view={shown} uid={uid} seatNames={seatNames} />
        ) : (
          <Placing view={shown} me={me} uid={uid} onMove={onMove} busy={!!busy} error={error ?? null} sound={sound} reduce={reduce} oppName={seatNames[opp] ?? 'Opponent'} />
        )
      ) : (
        <Battle
          view={shown}
          real={view}
          legal={legal}
          me={me}
          spectator={spectator}
          uid={uid}
          onMove={onMove}
          busy={!!busy || !!flight}
          confirm={settings.confirmMoves}
          error={error ?? null}
          sound={sound}
          reduce={reduce}
          flight={flight}
          fx={fx}
          seatNames={seatNames}
          hint={hint && hint.type === 'fire' ? hint : null}
        />
      )}
    </div>
  );
}

/* ================================================================================================ */
/* Placing                                                                                          */
/* ================================================================================================ */

interface Drag {
  id: SbShipId;
  dir: 'h' | 'v';
  grab: number;
  origin: 'dock' | 'grid';
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
  preview: SbShip | null;
}

function Placing({
  view,
  me,
  uid,
  onMove,
  busy,
  error,
  sound,
  reduce,
  oppName,
}: {
  view: SbView;
  me: number;
  uid: string;
  onMove: (m: SbMove) => void;
  busy: boolean;
  error: string | null;
  sound: (n: SoundName) => void;
  reduce: boolean;
  oppName: string;
}) {
  const ready = view.ready[me as 0 | 1];
  const oppReady = view.ready[(1 - me) as 0 | 1];
  const serverShips = view.boards[me as 0 | 1].ships;
  const [layout, setLayout] = useState<Layout>(() => {
    const l = emptyLayout();
    for (const s of serverShips) l[s.id] = s;
    return l;
  });
  const [selected, setSelected] = useState<SbShipId | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const grid = useRef<GridHandle>(null);
  const [scope, animate] = useAnimate();
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  // When the server confirms the fleet, show exactly what it holds.
  useEffect(() => {
    if (ready && serverShips.length) {
      const l = emptyLayout();
      for (const s of serverShips) l[s.id] = s;
      setLayout(l);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const shake = useCallback(() => {
    sound('error');
    if (!reduce && scope.current) void animate(scope.current, { x: [0, -6, 6, -4, 4, 0] }, { duration: 0.32 });
  }, [animate, reduce, scope, sound]);

  const placed = Object.values(layout).filter(Boolean) as SbShip[];
  const { bad, reason } = conflicts(layout);
  const allPlaced = placed.length === SB_FLEET.length;
  const fleetReason = allPlaced ? validateFleet(placed) : null;
  const canReady = allPlaced && !fleetReason && !ready && !busy;

  const previewOf = useCallback((d: Drag, x: number, y: number): SbShip | null => {
    const p = grid.current?.toCell(x, y);
    if (!p || p.r < -0.6 || p.r > 10.6 || p.c < -0.6 || p.c > 10.6) return null;
    const row = Math.floor(clamp(p.r, 0, 9.99));
    const col = Math.floor(clamp(p.c, 0, 9.99));
    return clampShip(d.dir === 'h' ? { id: d.id, dir: 'h', row, col: col - d.grab } : { id: d.id, dir: 'v', row: row - d.grab, col });
  }, []);

  // Window listeners while a drag is active.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const moved = d.moved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 6;
      setDrag({ ...d, x: e.clientX, y: e.clientY, moved, preview: moved ? previewOf(d, e.clientX, e.clientY) : d.preview });
    };
    const up = () => {
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      if (!d.moved) {
        if (d.origin === 'grid') {
          // Tap a placed ship to turn it.
          setLayout((l) => {
            const cur = l[d.id];
            if (!cur) return l;
            const turned = clampShip({ ...cur, dir: cur.dir === 'h' ? 'v' : 'h' });
            const c = conflicts(l, turned);
            setNote(c.bad.has(d.id) ? c.reason : null);
            return { ...l, [d.id]: turned };
          });
          sound('move');
        } else {
          setSelected((s) => (s === d.id ? null : d.id));
          setNote(null);
          sound('tap');
        }
        return;
      }
      if (d.preview) {
        const pv = d.preview;
        setLayout((l) => {
          const c = conflicts(l, pv);
          setNote(c.bad.has(pv.id) ? c.reason : null);
          return { ...l, [pv.id]: pv };
        });
        setSelected(null);
        sound('move');
      } else if (d.origin === 'grid') {
        setLayout((l) => ({ ...l, [d.id]: null }));
        setNote(null);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragging, previewOf, sound]);

  const onCellDown = (row: number, col: number, e: RPointerEvent) => {
    if (ready) return;
    const hit = placed.find((s) => shipCells(s).some((p) => p.row === row && p.col === col));
    if (hit) {
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const grab = hit.dir === 'h' ? col - hit.col : row - hit.row;
      setDrag({ id: hit.id, dir: hit.dir, grab, origin: 'grid', startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, moved: false, preview: hit });
      return;
    }
    if (selected) {
      const s = clampShip({ id: selected, row, col, dir: 'h' });
      const c = conflicts(layout, s);
      setLayout((l) => ({ ...l, [selected]: s }));
      setNote(c.bad.has(selected) ? c.reason : null);
      setSelected(null);
      sound('move');
    }
  };

  const onDockDown = (id: SbShipId, e: RPointerEvent<HTMLButtonElement>) => {
    if (ready) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    const grab = clamp(Math.floor(((e.clientX - r.left) / r.width) * sbShipSize(id)), 0, sbShipSize(id) - 1);
    setDrag({ id, dir: 'h', grab, origin: 'dock', startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, moved: false, preview: null });
  };

  const auto = () => {
    const f = randomFleet(Rng.fromSeeds(randomSeedHex(), ['ui']));
    const l = emptyLayout();
    for (const s of f) l[s.id] = s;
    setLayout(l);
    setSelected(null);
    setNote(null);
    sound('dice');
  };
  const clear = () => {
    setLayout(emptyLayout());
    setNote(null);
  };
  const confirm = () => {
    if (!allPlaced) {
      setNote('Place all five ships first, or tap Auto place.');
      shake();
      return;
    }
    if (fleetReason) {
      setNote(fleetReason);
      shake();
      return;
    }
    onMove({ type: 'place', ships: placed });
    sound('coin');
  };

  // Grid ships: hide the one being dragged, show its preview instead.
  const preview = drag?.moved ? drag.preview : null;
  const previewBad = preview ? conflicts(layout, preview).bad.has(preview.id) : false;
  const gridShips: GridShip[] = placed
    .filter((s) => !(drag?.moved && drag.id === s.id))
    .map((s) => ({ ship: s, look: bad.has(s.id) && !(drag?.moved && bad.size === 2 && bad.has(drag.id)) ? 'bad' : 'own' }));
  if (preview) gridShips.push({ ship: preview, look: previewBad ? 'bad' : 'ok' });
  const badCells = new Set<number>();
  for (const s of placed) if (bad.has(s.id)) for (const p of shipCells(s)) badCells.add(p.row * 10 + p.col);
  if (preview && previewBad) for (const p of shipCells(preview)) badCells.add(p.row * 10 + p.col);

  const liveReason = drag?.moved && preview && previewBad ? conflicts(layout, preview).reason : null;
  const status = ready
    ? oppReady
      ? 'Both fleets are in position.'
      : `Fleet in position. Waiting for ${oppName} to finish placing.`
    : liveReason ?? note ?? error ?? (selected ? `Tap a square to drop your ${sbShipName(selected)}.` : allPlaced ? (reason ?? 'Looking good. Tap a ship to turn it, or press Ready.') : 'Drag your ships onto the grid. Tap a ship to turn it.');
  const statusBad = !ready && !!(liveReason || note || error || (allPlaced && reason));

  const docked = SB_FLEET.filter((f) => !layout[f.id] || (drag?.moved && drag.id === f.id && drag.origin === 'dock'));
  const cellPx = grid.current?.cellPx() ?? 34;

  return (
    <div className="flex flex-col gap-3 px-2 lg:flex-row lg:items-start lg:gap-6 lg:px-0">
      <div className="mx-auto w-full max-w-[560px] max-lg:order-3 lg:mx-0 lg:flex-1">
        <div className={ready ? '' : 'max-lg:hidden'}>
          <PanelTitle color={COLORS.violet} title="Your fleet" sub={ready ? (oppReady ? 'Battle stations' : 'Scanning for the enemy fleet') : 'Place your ships in secret'} />
        </div>
        <div ref={scope} className="relative rounded-[20px] p-1.5" style={{ background: 'linear-gradient(160deg, rgba(124,92,255,0.35), rgba(90,225,255,0.12))', boxShadow: '0 0 0 1px rgba(124,92,255,0.45), 0 0 36px rgba(124,92,255,0.22)' }}>
          <div className="rounded-[16px] bg-[#050d22] p-1.5">
            <Grid ref={grid} uid={`${uid}p`} ships={gridShips} badCells={badCells} radar interactive={!ready} onCellDown={onCellDown} label="Your grid. Drag ships here." />
          </div>
        </div>
      </div>

      {/* Phones: this column dissolves so the status and dock sit above the grid and the buttons below it. */}
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-3 max-lg:contents lg:mx-0 lg:w-[380px] lg:pt-9">
        <p role="status" aria-live="polite" className={`min-h-[44px] rounded-card px-4 py-2.5 text-[15px] font-semibold max-lg:order-1 max-lg:min-h-0 max-lg:py-2 max-lg:text-sm ${statusBad ? 'bg-loss/15 text-loss' : 'bg-surface text-text'}`}>
          {statusBad ? <Icon name="warn" className="mr-1.5 inline-block align-[-3px]" /> : null}
          {status}
        </p>

        {!ready ? (
          <div className="rounded-card bg-surface p-3 shadow-card [--dk:26px] max-lg:order-2 max-lg:p-2 max-lg:[--dk:17px]">
            <div className="mb-2 flex items-center justify-between max-lg:hidden">
              <p className="text-sm font-bold uppercase tracking-wider text-text-2">Dock</p>
              <p className="text-xs text-text-2">{docked.length ? `${docked.length} to place` : 'All ships on the grid'}</p>
            </div>
            <div className="flex min-h-[52px] flex-wrap gap-2 max-lg:min-h-[40px] max-lg:gap-1.5">
              {docked.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onPointerDown={(e) => onDockDown(f.id, e)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelected((s) => (s === f.id ? null : f.id));
                    }
                  }}
                  aria-pressed={selected === f.id}
                  aria-label={`${f.name}, ${f.size} squares. Drag to the grid, or select then tap a square.`}
                  className={`group flex flex-col items-start gap-0.5 rounded-chip px-2 py-1.5 transition max-lg:px-1.5 max-lg:py-1 ${selected === f.id ? 'bg-accent/25 ring-2 ring-accent' : 'bg-surface-2 hover:bg-line'}`}
                  style={{ touchAction: 'none', opacity: drag?.moved && drag.id === f.id ? 0.35 : 1 }}
                >
                  <ShipIcon id={f.id} size={f.size} style={{ height: 'var(--dk)', width: `calc(var(--dk) * ${f.size})` }} />
                  <span className="text-[12px] font-semibold text-text-2 max-lg:text-[11px] max-lg:leading-tight">
                    {f.name} <span className="tabular">{f.size}</span>
                  </span>
                </button>
              ))}
              {docked.length === 0 ? <p className="self-center text-sm text-text-2">Tap a ship on the grid to turn it, or drag it to move it.</p> : null}
            </div>
          </div>
        ) : (
          <div className="rounded-card bg-surface p-4 shadow-card max-lg:order-4">
            <p className="font-semibold">Your ships are locked in.</p>
            <p className="mt-1 text-sm text-text-2">When both players are ready, the battle starts. Your ships stay hidden.</p>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <Dot on /> You are ready
              <span className="mx-2 text-line">|</span>
              <Dot on={oppReady} /> {oppReady ? `${oppName} is ready` : `${oppName} is placing`}
            </div>
          </div>
        )}

        {!ready ? (
          <>
            <div className="sticky bottom-0 z-10 -mx-2 flex gap-2 bg-bg/90 px-2 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 backdrop-blur max-lg:order-4 lg:static lg:mx-0 lg:flex-col lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            <div className="flex gap-2 lg:grid lg:grid-cols-2">
              <button type="button" onClick={auto} className="inline-flex h-12 items-center justify-center gap-2 rounded-chip bg-accent/20 px-3 font-bold text-text ring-1 ring-accent/60 transition hover:bg-accent/30 active:scale-[0.98]">
                <Icon name="dice" /> Auto place
              </button>
              <button type="button" onClick={clear} disabled={placed.length === 0} className="h-12 rounded-chip bg-surface-2 px-3 font-semibold text-text transition hover:bg-line disabled:opacity-40">
                <span className="lg:hidden">Clear</span>
                <span className="max-lg:hidden">Clear grid</span>
              </button>
            </div>
            <button
              type="button"
              onClick={confirm}
              aria-disabled={!canReady}
              aria-label="Ready for battle"
              className={`h-12 min-w-0 flex-1 rounded-chip text-[16px] font-extrabold uppercase tracking-wide transition active:scale-[0.98] lg:h-14 lg:flex-none lg:text-[17px] ${canReady ? 'bg-primary text-primary-ink shadow-glow pulse-glow' : 'bg-surface-2 text-text-2'}`}
            >
              <span className="lg:hidden">Ready</span>
              <span className="max-lg:hidden">Ready for battle</span>
            </button>
            </div>
            <div className="flex flex-col gap-3 max-lg:order-5">
              <p className="text-center text-sm text-text-2">When both players are ready, the battle starts. Your ships stay hidden.</p>
              <RulesNote />
            </div>
          </>
        ) : null}
      </div>

      {drag?.moved && !preview ? (
        <div className="pointer-events-none fixed z-50" style={{ left: drag.x - (drag.grab + 0.5) * cellPx, top: drag.y - cellPx / 2 }}>
          <ShipIcon id={drag.id} size={sbShipSize(drag.id)} look="ok" style={{ height: cellPx, width: sbShipSize(drag.id) * cellPx, filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.5))' }} />
        </div>
      ) : null}
    </div>
  );
}

function RulesNote() {
  return (
    <details className="rounded-card bg-surface px-4 py-3 text-sm text-text-2">
      <summary className="cursor-pointer font-semibold text-text">How placing works</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Ships go across or down, never diagonally.</li>
        <li>Ships cannot overlap and cannot touch each other, not even at the corners.</li>
        <li>Your opponent places at the same time and never sees your grid.</li>
        <li>Then you take turns firing one shot each. A hit does not give an extra shot.</li>
      </ul>
    </details>
  );
}

function SpectatorPlacing({ view, uid, seatNames }: { view: SbView; uid: string; seatNames: string[] }) {
  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-3 px-2">
      <p role="status" aria-live="polite" className="rounded-card bg-surface px-4 py-3 font-semibold">
        Both captains are placing their fleets in secret.
      </p>
      <Grid uid={`${uid}s`} radar label="Ocean" />
      <div className="flex justify-center gap-6 text-sm">
        {[0, 1].map((s) => (
          <span key={s} className="flex items-center gap-2">
            <Dot on={view.ready[s as 0 | 1]} /> {seatNames[s] ?? `Seat ${s + 1}`} {view.ready[s as 0 | 1] ? 'is ready' : 'is placing'}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ================================================================================================ */
/* Battle                                                                                           */
/* ================================================================================================ */

function Battle({
  view,
  real,
  legal,
  me,
  spectator,
  uid,
  onMove,
  busy,
  confirm,
  error,
  sound,
  reduce,
  flight,
  fx,
  seatNames,
  hint,
}: {
  view: SbView;
  real: SbView;
  legal: SbMove[];
  me: number;
  spectator: boolean;
  uid: string;
  onMove: (m: SbMove) => void;
  busy: boolean;
  confirm: boolean;
  error: string | null;
  sound: (n: SoundName) => void;
  reduce: boolean;
  flight: Flight | null;
  fx: Fx[];
  seatNames: string[];
  hint: Fire | null;
}) {
  const opp = 1 - me;
  const mine = view.boards[me as 0 | 1];
  const theirs = view.boards[opp as 0 | 1];
  const oppName = seatNames[opp] ?? 'Opponent';
  const myTurn = !spectator && real.turn === me && view.turn === me && !busy && !real.result;
  const fires = useMemo(() => new Set(legal.filter((m): m is Fire => m.type === 'fire').map((m) => m.row * 10 + m.col)), [legal]);

  const [aim, setAim] = useState<{ row: number; col: number } | null>(hint ? { row: hint.row, col: hint.col } : null);
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [scope, animate] = useAnimate();
  const lastShotNo = useRef(view.shotNo);

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

  const tapCell = (row: number, col: number) => {
    if (spectator || real.result) return;
    setKeyAim(false);
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

  const onKey = (e: KeyboardEvent) => {
    if (spectator || real.result) return;
    const d: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const step = d[e.key];
    if (step) {
      e.preventDefault();
      setKeyAim(true);
      setAim((a) => {
        const base = a ?? { row: 4, col: 4 };
        return { row: clamp(base.row + step[0], 0, 9), col: clamp(base.col + step[1], 0, 9) };
      });
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (aim) shoot(aim.row, aim.col);
      else setAim({ row: 4, col: 4 });
    }
  };

  // Status line.
  const ls = view.lastShot;
  const result = view.result;
  let status: string;
  let tone: 'turn' | 'wait' | 'hit' | 'sunk' | 'win' | 'lose' = 'wait';
  if (result) {
    const won = result.winners.includes(me);
    if (spectator) status = `${seatNames[result.winners[0] ?? 0] ?? 'A captain'} wins the battle.`;
    else if (result.reason !== 'fleet_sunk') status = won ? `${oppName} left the battle. You win.` : 'You left the battle.';
    else status = won ? `Victory! You sank the whole enemy fleet in ${theirs.shotsTaken} shots.` : `${oppName} sank your whole fleet. Their ships are now revealed.`;
    tone = won ? 'win' : 'lose';
  } else if (flight) {
    status = flight.shooter === me ? `Firing at ${cellName(flight.row, flight.col)}.` : `Incoming fire at ${cellName(flight.row, flight.col)}!`;
    tone = 'wait';
  } else if (spectator) {
    status = `${seatNames[view.turn ?? 0] ?? 'Captain'} to fire.`;
  } else if (ls && ls.seat === me) {
    tone = ls.result === 'miss' ? 'wait' : ls.result === 'hit' ? 'hit' : 'sunk';
    status = ls.result === 'miss' ? `Miss at ${cellName(ls.row, ls.col)}. ${oppName} fires next.` : ls.result === 'hit' ? 'Hit! Fire again next turn.' : `You sank their ${ls.shipName ?? 'ship'}!`;
  } else if (ls && ls.seat === opp) {
    tone = 'turn';
    const where = cellName(ls.row, ls.col);
    status =
      ls.result === 'miss'
        ? `${oppName} missed at ${where}. Your turn. Pick a square in enemy waters.`
        : ls.result === 'hit'
          ? `${oppName} hit your ${ls.shipName ?? 'ship'} at ${where}. Your turn, fire back.`
          : `${oppName} sank your ${ls.shipName ?? 'ship'}. Your turn, fire back.`;
  } else {
    tone = view.turn === me ? 'turn' : 'wait';
    status = view.turn === me ? 'Your turn. Pick a square in enemy waters.' : `${oppName} fires first.`;
  }
  const shownStatus = note ?? error ?? status;
  const noteTone = note || error;

  const enemyShips: GridShip[] = theirs.ships.map((s) => {
    const isSunk = theirs.sunk.includes(s.id);
    const fresh = fx.find((f) => f.board === opp && f.kind === 'sunk' && f.ship === s.id);
    return {
      ship: s,
      look: isSunk ? 'sunk' : 'reveal',
      wrap: fresh && !reduce ? (node) => <SinkReveal>{node}</SinkReveal> : undefined,
    };
  });
  const myShips: GridShip[] = mine.ships.map((s) => {
    const isSunk = mine.sunk.includes(s.id);
    const fresh = fx.find((f) => f.board === me && f.kind === 'sunk' && f.ship === s.id);
    return { ship: s, look: isSunk ? 'ownSunk' : 'own', wrap: fresh && !reduce ? (node) => <SinkWobble>{node}</SinkWobble> : undefined };
  });

  const effectsFor = (board: number) => (
    <>
      {flight && 1 - flight.shooter === board && !reduce ? (
        <Shell key={`s${flight.key}`} row={flight.row} col={flight.col} from={board === opp ? 'bottom' : 'top'} duration={FLIGHT_MS / 1000} />
      ) : null}
      {fx
        .filter((f) => f.board === board)
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
    </>
  );

  const shownAim = hover && !aim ? hover : aim;
  const lastOn = (board: number) => (ls && 1 - ls.seat === board && !flight ? { row: ls.row, col: ls.col } : null);
  const aimLegal = aim ? fires.has(aim.row * 10 + aim.col) : false;
  const [keyAim, setKeyAim] = useState(!!hint);
  const showFire = !spectator && !result && (confirm || (keyAim && !!aim));

  const toneClass =
    noteTone
      ? 'bg-loss/15 text-loss'
      : tone === 'turn'
        ? 'bg-primary/15 text-text ring-1 ring-primary/50'
        : tone === 'hit'
          ? 'bg-[#FF5A1F]/15 text-text ring-1 ring-[#FF5A1F]/60'
          : tone === 'sunk'
            ? 'bg-[#FF5A1F]/25 text-text ring-1 ring-[#FF5A1F]'
            : tone === 'win'
              ? 'bg-primary/20 text-text ring-1 ring-primary'
              : tone === 'lose'
                ? 'bg-loss/15 text-text ring-1 ring-loss/60'
                : 'bg-surface text-text-2';

  const statusBar = (
    <motion.div
      key={shownStatus}
      aria-hidden
      initial={reduce ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex min-h-[48px] items-center gap-2 rounded-card px-4 py-2.5 text-[15px] font-bold lg:text-base ${toneClass}`}
    >
      <StatusIcon tone={noteTone ? 'error' : tone} />
      <span>{shownStatus}</span>
    </motion.div>
  );

  return (
    <div className="flex flex-col gap-3 px-2 lg:px-0">
      <p className="sr-only" role="status" aria-live="polite">
        {shownStatus}
      </p>
      <div className="hidden lg:block">{statusBar}</div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-6">
        {/* My fleet: small on phones (next to the enemy tracker), full size on desktop */}
        <div className="flex items-stretch gap-3 lg:w-[400px] lg:shrink-0 lg:flex-col">
          <div className="w-[46%] shrink-0 lg:w-full">
            <PanelTitle color={COLORS.violet} title={spectator ? seatNames[me] ?? 'Seat 1' : 'My fleet'} sub={`${mine.afloat.length} of 5 afloat`} small />
            <div className="rounded-[14px] bg-[#050d22] p-1" style={{ boxShadow: '0 0 0 1.5px rgba(124,92,255,0.6), 0 0 18px rgba(124,92,255,0.25)' }}>
              <Grid uid={`${uid}m`} marks={mine.marks} ships={myShips} lastShot={lastOn(me)} compact label={`My fleet. ${mine.afloat.length} of 5 ships afloat.`}>
                {effectsFor(me)}
              </Grid>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2 lg:hidden">
            <FleetTracker board={theirs} title={spectator ? seatNames[opp] ?? 'Seat 2' : 'Enemy fleet'} />
            <ShotStats mine={mine} theirs={theirs} />
          </div>
          <div className="hidden flex-col gap-3 lg:flex">
            <ShotStats mine={mine} theirs={theirs} />
            <FleetTracker board={theirs} title={spectator ? seatNames[opp] ?? 'Seat 2' : 'Enemy fleet'} wide />
          </div>
        </div>

        <div className="min-w-0 lg:flex-1 lg:max-w-[max(440px,calc(100dvh-250px))]">
          <div className="mb-3 lg:hidden">{statusBar}</div>
          <div className="hidden lg:block">
            <PanelTitle color={COLORS.lime} title={spectator ? seatNames[opp] ?? 'Seat 2' : 'Enemy waters'} sub={myTurn ? 'Your shot' : `${theirs.afloat.length} of 5 afloat`} />
          </div>
          <div
            ref={scope}
            className="relative rounded-[20px] p-1.5 transition-shadow"
            style={{
              background: 'linear-gradient(160deg, rgba(198,255,61,0.30), rgba(90,225,255,0.10))',
              boxShadow: myTurn ? '0 0 0 2px rgba(198,255,61,0.75), 0 0 40px rgba(198,255,61,0.30)' : '0 0 0 1px rgba(90,225,255,0.25)',
            }}
          >
            <div
              tabIndex={spectator ? -1 : 0}
              onKeyDown={onKey}
              aria-label="Enemy waters. Use the arrow keys to aim and Enter to fire."
              className="rounded-[16px] bg-[#050d22] p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-[#C6FF3D]"
            >
              <Grid
                uid={`${uid}e`}
                marks={theirs.marks}
                ships={enemyShips}
                aim={!result && !spectator ? shownAim : null}
                aimActive={myTurn}
                lastShot={lastOn(opp)}
                interactive={!spectator && !result}
                onCellTap={(r, c) => tapCell(r, c)}
                onCellMove={(r, c) => setHover({ row: r, col: c })}
                onLeave={() => setHover(null)}
                label={`Enemy waters. ${theirs.afloat.length} of 5 enemy ships afloat.`}
              >
                {effectsFor(opp)}
              </Grid>
            </div>
            {result ? <ResultBanner won={result.winners.includes(me)} spectator={spectator} shots={theirs.shotsTaken} reduce={reduce} /> : null}
          </div>

          {showFire ? (
            <div className="mt-3 flex items-center gap-3">
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
                <span className="inline-flex items-center gap-2"><Icon name="target" /> Fire</span>
              </button>
            </div>
          ) : !spectator && !result ? (
            <p className="mt-3 text-center text-sm text-text-2">Tap a square to fire. Arrow keys and Enter work too.</p>
          ) : null}

        </div>
      </div>
    </div>
  );
}

function SinkReveal({ children }: { children: React.ReactNode }) {
  return (
    <motion.g style={{ transformBox: 'fill-box', transformOrigin: 'center' }} initial={{ opacity: 0, scale: 1.25 }} animate={{ opacity: [0, 1, 1, 0.92], scale: [1.25, 1, 1, 0.94] }} transition={{ duration: 1.2, times: [0, 0.25, 0.6, 1] }}>
      {children}
    </motion.g>
  );
}

function SinkWobble({ children }: { children: React.ReactNode }) {
  return (
    <motion.g style={{ transformBox: 'fill-box', transformOrigin: 'center' }} animate={{ rotate: [0, -4, 3, -2, 0], scale: [1, 0.96, 0.94, 0.95, 0.95] }} transition={{ duration: 1.1 }}>
      {children}
    </motion.g>
  );
}

function ResultBanner({ won, spectator, shots, reduce }: { won: boolean; spectator: boolean; shots: number; reduce: boolean }) {
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: 0.45, duration: 0.35, ease: [0.2, 0.8, 0.3, 1] }}
      className="pointer-events-none absolute inset-0 flex items-center justify-center p-6"
    >
      <div
        className="rounded-[20px] px-5 py-3 text-center backdrop-blur-[2px]"
        style={{
          background: 'rgba(7, 7, 12, 0.78)',
          boxShadow: won || spectator ? '0 0 0 2px #C6FF3D, 0 0 48px rgba(198,255,61,0.45)' : '0 0 0 2px #FF4D6D, 0 0 40px rgba(255,77,109,0.35)',
        }}
      >
        <div className="flex justify-center" style={{ color: won || spectator ? '#C6FF3D' : '#FF4D6D' }}>
          <Icon name={won || spectator ? 'trophy' : 'anchor'} size={40} />
        </div>
        <p className="mt-1 font-display text-3xl font-black uppercase tracking-wide" style={{ color: won || spectator ? '#C6FF3D' : '#FF4D6D' }}>
          {spectator ? 'Battle over' : won ? 'Victory' : 'Defeat'}
        </p>
        <p className="mt-1 text-sm text-[#d8d8ea]">{won ? `Fleet sunk in ${shots} shots.` : spectator ? 'Both fleets are now revealed.' : 'Good fight. Their ships are now shown.'}</p>
      </div>
    </motion.div>
  );
}

function FleetTracker({ board, title, wide }: { board: SbView['boards'][number]; title: string; wide?: boolean }) {
  return (
    <div className="rounded-card bg-surface p-3 shadow-card">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-text-2">{title}</p>
        <p className="tabular text-xs font-bold text-text">
          {board.afloat.length}/5 <span className="font-semibold text-text-2">afloat</span>
        </p>
      </div>
      <ul className={wide ? 'grid grid-cols-2 gap-2' : 'flex flex-col gap-1.5'}>
        {SB_FLEET.map((f) => {
          const sunk = board.sunk.includes(f.id);
          return (
            <li key={f.id} className={`flex items-center gap-2 ${wide ? 'flex-col items-start rounded-chip bg-surface-2 px-2 py-2' : ''}`} aria-label={`${f.name}, ${sunk ? 'sunk' : 'afloat'}`}>
              <span className="relative inline-block shrink-0" style={{ width: f.size * (wide ? 18 : 13), height: wide ? 18 : 13 }}>
                <ShipIcon id={f.id} size={f.size} look={sunk ? 'sunk' : 'own'} className="absolute inset-0 h-full w-full" style={{ opacity: sunk ? 0.55 : 1 }} />
                {sunk ? <span className="absolute left-0 right-0 top-1/2 h-[2.5px] -translate-y-1/2 -rotate-6 rounded bg-[#FF5A1F]" /> : null}
              </span>
              <span className={`truncate text-[12px] font-semibold ${sunk ? 'text-text-2 line-through' : 'text-text'}`}>
                {f.name}
                {wide ? <span className="tabular text-text-2"> {f.size}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ShotStats({ mine, theirs }: { mine: SbView['boards'][number]; theirs: SbView['boards'][number] }) {
  const acc = theirs.shotsTaken ? Math.round((theirs.hitsTaken / theirs.shotsTaken) * 100) : 0;
  return (
    <div className="grid grid-cols-3 gap-1.5 text-center">
      <Stat label="Shots" value={String(theirs.shotsTaken)} />
      <Stat label="Hits" value={String(theirs.hitsTaken)} hot />
      <Stat label="Aim" value={`${acc}%`} />
      <span className="sr-only">Your ships have taken {mine.hitsTaken} hits.</span>
    </div>
  );
}

function Stat({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className="rounded-chip bg-surface px-1 py-1.5">
      <p className={`tabular text-base font-extrabold ${hot ? 'text-loss' : 'text-text'}`}>{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-2">{label}</p>
    </div>
  );
}

function PanelTitle({ color, title, sub, small }: { color: string; title: string; sub: string; small?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-2 px-1 ${small ? 'mb-1' : 'mb-2'}`}>
      <p className={`flex items-center gap-2 font-extrabold uppercase tracking-wider ${small ? 'text-[11px]' : 'text-sm'}`}>
        <span className="inline-block size-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
        {title}
      </p>
      <p className={`truncate text-text-2 ${small ? 'text-[11px]' : 'text-xs'}`}>{sub}</p>
    </div>
  );
}

function Dot({ on }: { on?: boolean }) {
  return <span className={`inline-block size-2.5 rounded-full ${on ? 'bg-primary shadow-glow' : 'bg-line'}`} />;
}

function StatusIcon({ tone }: { tone: string }) {
  const map: Record<string, { name: IconName; color: string }> = {
    turn: { name: 'target', color: 'var(--primary)' },
    wait: { name: 'radar', color: '#5AE1FF' },
    hit: { name: 'burst', color: '#FF5A1F' },
    sunk: { name: 'burst', color: '#FFD166' },
    win: { name: 'trophy', color: 'var(--primary)' },
    lose: { name: 'anchor', color: '#FF4D6D' },
    error: { name: 'warn', color: '#FF4D6D' },
  };
  const m = map[tone] ?? map.wait!;
  return (
    <span className="shrink-0" style={{ color: m.color }}>
      <Icon name={m.name} size={22} />
    </span>
  );
}

type IconName = 'dice' | 'target' | 'radar' | 'burst' | 'trophy' | 'anchor' | 'warn';

/** Small original line icons (SVG, drawn for Cold Call). */
function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className}>
      {name === 'dice' ? (
        <>
          <rect x={4} y={4} width={16} height={16} rx={4} {...p} />
          <circle cx={9} cy={9} r={1.4} fill="currentColor" />
          <circle cx={15} cy={15} r={1.4} fill="currentColor" />
          <circle cx={15} cy={9} r={1.4} fill="currentColor" />
          <circle cx={9} cy={15} r={1.4} fill="currentColor" />
        </>
      ) : name === 'target' ? (
        <>
          <circle cx={12} cy={12} r={7} {...p} />
          <circle cx={12} cy={12} r={2} fill="currentColor" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" {...p} />
        </>
      ) : name === 'radar' ? (
        <>
          <circle cx={12} cy={12} r={9} {...p} />
          <circle cx={12} cy={12} r={5} {...p} opacity={0.6} />
          <path d="M12 12L19 6" {...p} />
          <circle cx={16} cy={15} r={1.3} fill="currentColor" />
        </>
      ) : name === 'burst' ? (
        <path d="M12 2l2.2 5.5L20 6l-3 5 4.5 3.2-5.6.8L15 21l-3-4.4L9 21l-.9-6L2.5 14.2 7 11 4 6l5.8 1.5z" fill="currentColor" stroke="none" />
      ) : name === 'trophy' ? (
        <>
          <path d="M7 4h10v5a5 5 0 0 1-10 0z" {...p} />
          <path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9 18h6" {...p} />
        </>
      ) : name === 'anchor' ? (
        <>
          <circle cx={12} cy={5} r={2} {...p} />
          <path d="M12 7v14M8 11h8M4 14a8 7 0 0 0 16 0" {...p} />
        </>
      ) : (
        <>
          <path d="M12 3l10 18H2z" {...p} />
          <path d="M12 10v5" {...p} />
          <circle cx={12} cy={18} r={1} fill="currentColor" />
        </>
      )}
    </svg>
  );
}
