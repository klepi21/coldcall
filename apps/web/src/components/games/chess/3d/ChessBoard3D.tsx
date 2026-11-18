'use client';
/**
 * 3D chess board. Same behaviour contract as the 2D ChessBoard: tap or drag to move, legal targets,
 * last move, check, promotion picker, optional confirm bar, hint arrow, error shake, sounds and an
 * aria-live announcer. A hidden grid of 64 buttons makes it fully keyboard and screen reader playable.
 *
 * Load it with next/dynamic and ssr: false. If WebGL is not available the 2D board renders instead.
 */
import { Component, useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Chess } from 'chess.js';
import type { ChessMove, ChessView } from '@evens/games';
import type { BoardProps } from '../../types';
import { haptic, play } from '@/lib/sound';
import { ChessBoard, type ChessDevPreview } from '../ChessBoard';
import { PIECE_NAMES, PieceArt, type PieceColor } from '../pieces';
import { FILES, describeLastMove, parsePlacement, sqIndex, sqName, trackPieces, type Tracked } from '../logic';
import { Scene, type Dying, type OrbitControlsImpl, type SceneApi } from './Scene';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    const g = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    // Release the probe right away: browsers cap live WebGL contexts per page.
    g?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!g;
  } catch {
    return false;
  }
}

class GLBoundary extends Component<{ fallback: ReactNode; children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

type Props = BoardProps<ChessView, ChessMove> & { devPreview?: ChessDevPreview };

export function ChessBoard3D(props: Props) {
  const [gl, setGl] = useState<'unknown' | 'ok' | 'none'>('unknown');
  const readyRef = useRef(false);
  useEffect(() => setGl(webglAvailable() ? 'ok' : 'none'), []);
  // If the renderer never reports ready (context creation failed asynchronously), fall back to 2D.
  useEffect(() => {
    if (gl !== 'ok') return;
    const t = setTimeout(() => {
      if (!readyRef.current) setGl('none');
    }, 5000);
    return () => clearTimeout(t);
  }, [gl]);
  const fallback = <ChessBoard {...props} />;
  if (gl === 'none') return fallback;
  if (gl === 'unknown') return <div className="relative aspect-[20/19] sm:aspect-[50/37] w-full" aria-hidden />;
  return (
    <GLBoundary fallback={fallback} onError={() => setGl('none')}>
      <Board3D {...props} onLost={() => setGl('none')} onReady={() => (readyRef.current = true)} />
    </GLBoundary>
  );
}

function Board3D(props: Props & { onLost: () => void; onReady: () => void }) {
  const { view, legal, mySeat, toAct, seatNames, onMove, busy, settings, hint, error, devPreview, onLost, onReady } = props;
  const reduce = useReducedMotion() ?? false;
  const theme = settings.boardTheme === 'night' ? 'night' : 'marble';
  const flipped = mySeat === 1;
  const myColor: PieceColor | null = mySeat === 0 ? 'w' : mySeat === 1 ? 'b' : null;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  const [selected, setSelected] = useState<string | null>(devPreview?.select ?? null);
  const [pending, setPending] = useState<ChessMove | null>(devPreview?.pending ?? null);
  const [optimistic, setOptimistic] = useState<ChessMove | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(devPreview?.promo ?? null);
  const [cursor, setCursor] = useState<string>(flipped ? 'e7' : 'e2');
  const [focused, setFocused] = useState(false);
  const [shake, setShake] = useState<{ sq: string; n: number } | null>(null);
  const [announce, setAnnounce] = useState('');
  const [moved, setMoved] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const lastAttemptRef = useRef<string | null>(null);
  const ownSoundRef = useRef(false);

  const myTurn = myColor !== null && mySeat !== null && toAct.includes(mySeat) && !view.result;
  const canAct = myTurn && !busy && !pending && !optimistic;

  const movesFrom = useMemo(() => {
    const m = new Map<string, ChessMove[]>();
    if (!myTurn) return m;
    for (const mv of legal) {
      const list = m.get(mv.from);
      if (list) list.push(mv);
      else m.set(mv.from, [mv]);
    }
    return m;
  }, [legal, myTurn]);

  const shown = pending ?? optimistic;
  const displayFen = useMemo(() => {
    if (!shown) return view.fen;
    try {
      const c = new Chess(view.fen);
      c.move({ from: shown.from, to: shown.to, promotion: shown.promotion ?? 'q' });
      return c.fen();
    } catch {
      return view.fen;
    }
  }, [view.fen, shown]);
  const board = useMemo(() => parsePlacement(displayFen), [displayFen]);
  const last = shown ?? view.history[view.history.length - 1] ?? null;
  const placement = displayFen.split(' ')[0]!;

  // Stable piece ids (shared helper with the 2D board) plus a short list of captured pieces fading out.
  const trackRef = useRef<Tracked[] | null>(null);
  const idRef = useRef(0);
  const histLenRef = useRef(view.history.length);
  const layerKeyRef = useRef(0);
  const [dying, setDying] = useState<Dying[]>([]);
  const pieces = useMemo(() => {
    const jump = Math.abs(view.history.length - histLenRef.current) > 1;
    histLenRef.current = view.history.length;
    if (jump) layerKeyRef.current++;
    const prev = trackRef.current;
    const r = trackPieces(jump ? null : prev, board, last, () => `p${idRef.current++}`);
    trackRef.current = r;
    if (prev && !jump && !reduce) {
      const ids = new Set(r.map((p) => p.id));
      const gone = prev.filter((p) => !ids.has(p.id));
      if (gone.length) {
        const born = performance.now();
        queueMicrotask(() => setDying((d) => [...d.filter((x) => born - x.born < 900), ...gone.map((p) => ({ ...p, born }))]));
      }
    }
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placement, view.history.length]);
  useEffect(() => {
    if (!dying.length) return;
    const t = setTimeout(() => setDying((d) => d.filter((x) => performance.now() - x.born < 700)), 750);
    return () => clearTimeout(t);
  }, [dying]);

  const targetsOf = useCallback((from: string | null) => new Set(from ? (movesFrom.get(from) ?? []).map((m) => m.to) : []), [movesFrom]);
  const targets = useMemo(() => targetsOf(selected), [targetsOf, selected]);
  const ownAt = (sq: string) => {
    const p = board[sqIndex(sq)];
    return p && p.c === myColor ? p : null;
  };

  const send = useCallback(
    (mv: ChessMove) => {
      setOptimistic(mv);
      onMove(mv);
    },
    [onMove],
  );

  const commit = (mv: ChessMove) => {
    setSelected(null);
    setPromo(null);
    lastAttemptRef.current = mv.from;
    const mover = board[sqIndex(mv.from)];
    const victim = board[sqIndex(mv.to)];
    const capture = !!victim || (mover?.t === 'p' && mv.from[0] !== mv.to[0]);
    if (settings.sound) play(capture ? 'capture' : 'move');
    haptic(capture ? 'strong' : 'light');
    ownSoundRef.current = true;
    if (settings.confirmMoves) setPending(mv);
    else send(mv);
  };

  const tryMove = (from: string, to: string) => {
    const opts = (movesFrom.get(from) ?? []).filter((m) => m.to === to);
    if (!opts.length) return false;
    if (opts.some((m) => m.promotion)) {
      setPromo({ from, to });
      setSelected(from);
      setAnnounce('Choose a piece for your pawn: queen, rook, bishop or knight.');
      return true;
    }
    commit(opts[0]!);
    return true;
  };

  const select = (sq: string) => {
    const p = ownAt(sq);
    if (!p) return;
    setSelected(sq);
    const n = targetsOf(sq).size;
    setAnnounce(`${cap(PIECE_NAMES[p.t])} on ${sq} selected. ${n === 0 ? 'It has no moves.' : `${n} ${n === 1 ? 'move' : 'moves'}.`}`);
  };

  /** Keyboard and screen reader activation of a square. */
  const activate = (sq: string) => {
    if (promo) return;
    if (!canAct) {
      setAnnounce(view.result ? 'The game has finished.' : pending ? 'Confirm or undo your move first.' : 'Please wait for your turn.');
      return;
    }
    if (selected && sq !== selected && targets.has(sq)) {
      tryMove(selected, sq);
      return;
    }
    if (ownAt(sq)) {
      if (selected === sq) {
        setSelected(null);
        setAnnounce('Selection cleared.');
      } else select(sq);
      return;
    }
    if (selected) {
      setSelected(null);
      setAnnounce(board[sqIndex(sq)] ? 'That piece cannot be taken from here.' : 'That square is not a legal move. Selection cleared.');
    }
  };

  // The 3D scene calls into this object; refreshed every render so it always sees current state.
  const apiRef = useRef<SceneApi>(null as unknown as SceneApi);
  apiRef.current = {
    canDrag: (sq) => canAct && !promo && !!ownAt(sq),
    pressOwn: (sq) => {
      const was = selected === sq;
      if (!was) select(sq);
      return was;
    },
    tap: (sq) => {
      if (promo || !canAct) return;
      if (selected && sq !== selected && targets.has(sq)) {
        tryMove(selected, sq);
        return;
      }
      if (ownAt(sq)) select(sq);
      else setSelected(null);
    },
    release: (_sq, was) => {
      if (was) setSelected(null);
    },
    drop: (from, to) => {
      if (!to || to === from) return;
      if (!tryMove(from, to)) {
        if (!reduce) setShake({ sq: from, n: Date.now() });
        if (settings.sound) play('error');
      }
    },
    pointable: (sq) => canAct && !promo && (!!ownAt(sq) || (!!selected && targets.has(sq))),
  };

  // Server truth arrives: drop the optimistic copy.
  useEffect(() => {
    setOptimistic(null);
  }, [view.fen]);
  useEffect(() => {
    if (!optimistic) return;
    const t = setTimeout(() => setOptimistic(null), 6000);
    return () => clearTimeout(t);
  }, [optimistic]);
  useEffect(() => {
    if (!error) return;
    setOptimistic(null);
    const sq = lastAttemptRef.current ?? selected;
    if (sq && !reduce) setShake({ sq, n: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);
  useEffect(() => {
    if (!myTurn) {
      setSelected(null);
      setPromo(null);
    }
  }, [myTurn]);
  useEffect(() => {
    setCursor(flipped ? 'e7' : 'e2');
  }, [flipped]);

  // Sound, haptics and announcement for every new move.
  const prevLenRef = useRef(view.history.length);
  useEffect(() => {
    const len = view.history.length;
    const prev = prevLenRef.current;
    prevLenRef.current = len;
    if (len !== prev + 1) {
      ownSoundRef.current = false;
      return;
    }
    const h = view.history[len - 1]!;
    const mover = 1 - view.turn;
    const alreadyPlayed = mover === mySeat && ownSoundRef.current;
    ownSoundRef.current = false;
    if (settings.sound) {
      if (view.inCheck) play('check');
      else if (!alreadyPlayed) play(h.captured ? 'capture' : 'move');
    }
    if (!alreadyPlayed) haptic(h.captured ? 'strong' : 'light');
    setAnnounce(describeLastMove(view, mySeat, toAct, seatNames));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.history.length]);

  const lastSq = useMemo(() => (last ? [last.from, last.to] : []), [last?.from, last?.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const checkSq = useMemo(() => {
    if (!view.inCheck || shown) return null;
    const c: PieceColor = view.turn === 0 ? 'w' : 'b';
    const i = board.findIndex((p) => p?.t === 'k' && p.c === c);
    return i >= 0 ? sqName(i) : null;
  }, [view.inCheck, view.turn, board, shown]);
  const targetList = useMemo(() => [...targets].map((sq) => ({ sq, capture: !!board[sqIndex(sq)] || (board[sqIndex(selected ?? 'a1')]?.t === 'p' && selected?.[0] !== sq[0]) })), [targets, board, selected]);
  const hintMv = useMemo(() => (hint ? { from: hint.from, to: hint.to } : null), [hint?.from, hint?.to]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hidden keyboard grid, ordered as the player sees the board (top row first).
  const order = useMemo(() => {
    const out: string[] = [];
    for (let row = 0; row < 8; row++)
      for (let col = 0; col < 8; col++) out.push(`${FILES[flipped ? 7 - col : col]}${(flipped ? row : 7 - row) + 1}`);
    return out;
  }, [flipped]);
  const onGridKey = (e: RKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      if (promo) setPromo(null);
      else if (pending) setPending(null);
      else setSelected(null);
      return;
    }
    const delta: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    const i = order.indexOf(cursor);
    const col = Math.min(7, Math.max(0, (i % 8) + d[0]));
    const row = Math.min(7, Math.max(0, Math.floor(i / 8) + d[1]));
    const next = order[row * 8 + col]!;
    setCursor(next);
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-sq="${next}"]`)?.focus();
  };
  const refocus = () => requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-sq="${cursor}"]`)?.focus({ preventScroll: true }));
  const sqLabel = (sq: string) => {
    const p = board[sqIndex(sq)];
    let s = `${sq}, ${p ? `${p.c === 'w' ? 'white' : 'black'} ${PIECE_NAMES[p.t]}` : 'empty'}`;
    if (selected === sq) s += ', selected';
    else if (targets.has(sq)) s += p ? ', capture' : ', legal move';
    if (checkSq === sq) s += ', in check';
    return s;
  };

  const resetView = () => {
    const c = controlsRef.current;
    if (!c) return;
    c.reset();
    setMoved(false);
  };

  const promoColor: PieceColor = myColor ?? 'w';

  return (
    <div className="relative w-full select-none">
      <div
        ref={containerRef}
        className={`relative aspect-[20/19] sm:aspect-[50/37] w-full touch-none overflow-hidden rounded-[14px] ${focused ? 'ring-2 ring-primary ring-offset-2 ring-offset-bg' : ''}`}
        style={{
          background:
            theme === 'night'
              ? 'radial-gradient(closest-side at 50% 50%, rgba(124,92,255,0.24), rgba(124,92,255,0))'
              : 'radial-gradient(closest-side at 50% 50%, rgba(124,92,255,0.16), rgba(124,92,255,0))',
        }}
      >
        <Canvas
          shadows
          dpr={[1, 2]}
          frameloop="demand"
          camera={{ fov: 32, near: 0.5, far: 80, position: [0, 12, 9] }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          onCreated={({ gl: r }) => {
            r.toneMappingExposure = 0.92;
            onReady();
            r.domElement.addEventListener('webglcontextlost', (ev) => {
              ev.preventDefault();
              onLost();
            });
          }}
          aria-hidden
        >
          <Scene
            theme={theme}
            flipped={flipped}
            reduce={reduce}
            pieces={pieces}
            layerKey={layerKeyRef.current}
            dying={dying}
            selected={selected}
            targets={targetList}
            lastSq={lastSq}
            checkSq={checkSq}
            hint={hintMv}
            cursor={focused ? cursor : null}
            shake={shake}
            apiRef={apiRef}
            controlsRef={controlsRef}
            containerRef={containerRef}
            onViewChange={setMoved}
          />
        </Canvas>

        {/* Reset view */}
        <AnimatePresence>
          {moved ? (
            <motion.button
              key="reset"
              type="button"
              onClick={resetView}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.16 }}
              className="absolute right-2 top-2 z-30 flex h-11 items-center gap-1.5 rounded-full bg-surface/85 px-3 text-[13px] font-semibold text-text shadow-card ring-1 ring-line backdrop-blur hover:bg-surface"
            >
              <svg viewBox="0 0 20 20" className="size-4" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 10a6 6 0 1 0 1.8-4.3" />
                <path d="M4 3.5V7h3.5" />
              </svg>
              Reset view
            </motion.button>
          ) : null}
        </AnimatePresence>

        {/* Promotion picker */}
        <AnimatePresence>
          {promo ? (
            <motion.div key="promo" className="absolute inset-0 z-40 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.14 }}>
              <button
                type="button"
                aria-label="Cancel promotion"
                tabIndex={-1}
                className="absolute inset-0 cursor-default bg-black/45"
                onClick={() => {
                  setPromo(null);
                  setSelected(null);
                  refocus();
                }}
              />
              <motion.div
                role="dialog"
                aria-label="Choose a piece for your pawn"
                className="relative rounded-[16px] bg-surface p-3 shadow-modal ring-1 ring-line"
                initial={{ scale: reduce ? 1 : 0.92, y: reduce ? 0 : 6 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <p className="mb-2 px-1 text-center text-[13px] font-semibold uppercase tracking-wide text-text-2">Promote your pawn</p>
                <div className="flex gap-2">
                  {(['q', 'r', 'b', 'n'] as const).map((t, i) => (
                    <button
                      key={t}
                      type="button"
                      autoFocus={i === 0}
                      aria-label={`Promote to ${PIECE_NAMES[t]}`}
                      onClick={() => {
                        const { from, to } = promo;
                        setPromo(null);
                        commit({ from, to, promotion: t });
                        refocus();
                      }}
                      className="flex size-16 flex-col items-center justify-center rounded-[12px] bg-surface-2 p-2 outline-none transition hover:bg-line hover:ring-2 hover:ring-primary focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.96]"
                    >
                      <PieceArt color={promoColor} type={t} halo={promoColor === 'b'} shadow={false} />
                    </button>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Optional move confirmation */}
        <AnimatePresence>
          {pending ? (
            <motion.div
              key="confirm"
              className={`absolute left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-surface/95 p-1.5 shadow-modal ring-1 ring-line backdrop-blur bottom-3`}
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.18, ease: 'easeOut' }}
            >
              <button
                type="button"
                onClick={() => {
                  setPending(null);
                  setAnnounce('Move undone. Pick a piece to move.');
                  refocus();
                }}
                className="h-11 whitespace-nowrap rounded-full px-5 text-[15px] font-semibold text-text transition hover:bg-surface-2 active:scale-[0.97]"
              >
                Undo
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  const mv = pending;
                  setPending(null);
                  send(mv);
                  refocus();
                }}
                className="h-11 whitespace-nowrap rounded-full bg-primary px-5 text-[15px] font-semibold text-primary-ink shadow-card transition hover:brightness-110 active:scale-[0.97]"
              >
                Confirm move
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Keyboard and screen reader board: visually hidden, drives the same selection logic. */}
      <div
        ref={gridRef}
        role="group"
        aria-label={`Chess board. You play ${myColor === 'b' ? 'black' : myColor === 'w' ? 'white' : 'as a spectator'}. Use the arrow keys to move between squares, Enter to pick a piece and Enter again to move it, Escape to cancel.`}
        aria-describedby={`${uid}-live`}
        className="sr-only"
        onKeyDown={onGridKey}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
        }}
      >
        {order.map((sq) => (
          <button
            key={sq}
            type="button"
            data-sq={sq}
            tabIndex={sq === cursor ? 0 : -1}
            aria-label={sqLabel(sq)}
            onFocus={() => setCursor(sq)}
            onClick={() => activate(sq)}
          />
        ))}
      </div>

      <div id={`${uid}-live`} aria-live="polite" aria-atomic="true" className="sr-only">
        {announce}
      </div>
    </div>
  );
}
