'use client';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Chess } from 'chess.js';
import type { ChessMove, ChessView } from '@coldcall/games';
import type { BoardProps } from '../types';
import { haptic, play } from '@/lib/sound';
import { PIECE_NAMES, PieceArt, type PieceColor, type PieceType } from './pieces';
import { FILES, VALUES, describeLastMove, isLightSquare, moverColor, parsePlacement, sqIndex, sqName, trackPieces, type Tracked } from './logic';

export { PieceArt } from './pieces';

/**
 * Frozen board palettes (brand/BRAND_COLDCALL.md): light squares are packed snow, dark squares are glacier
 * ice, with a thin frost line between them. Last move in Frost Cyan, selection in Lofi Blue.
 * "marble" is the snow board (default), "night" the deep ice board.
 */
const THEMES = {
  marble: {
    light: '#EEF5FC',
    dark: '#7FA6CF',
    coordOnLight: 'rgba(47,90,150,0.95)',
    coordOnDark: 'rgba(242,247,252,0.95)',
    select: 'rgba(90,143,224,0.45)',
    last: 'rgba(127,227,255,0.45)',
    lastStroke: null as string | null,
    dot: 'rgba(11,26,46,0.28)',
    grain: { opacity: 0.08, blend: 'soft-light' as const },
    frost: 'rgba(255,255,255,0.55)',
    halo: false,
  },
  night: {
    light: '#2E5583',
    dark: '#173459',
    coordOnLight: 'rgba(190,214,242,0.9)',
    coordOnDark: 'rgba(150,182,224,0.9)',
    select: 'rgba(90,143,224,0.5)',
    last: 'rgba(127,227,255,0.14)',
    lastStroke: 'rgba(127,227,255,0.75)' as string | null,
    dot: 'rgba(226,240,255,0.26)',
    grain: { opacity: 0.07, blend: 'screen' as const },
    frost: 'rgba(127,227,255,0.22)',
    halo: true,
  },
};

/** Dev and test only: show a specific UI state without clicking (used by /dev/chess screenshots). */
export interface ChessDevPreview {
  select?: string;
  promo?: { from: string; to: string };
  pending?: ChessMove;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const SLIDE = { duration: 0.2, ease: [0.22, 0.8, 0.3, 1] as const };

export function ChessBoard(props: BoardProps<ChessView, ChessMove> & { devPreview?: ChessDevPreview }) {
  const { view, legal, mySeat, toAct, seatNames, onMove, busy, settings, hint, error, devPreview } = props;
  const reduce = useReducedMotion() ?? false;
  const theme = THEMES[settings.boardTheme] ?? THEMES.marble;
  const flipped = mySeat === 1;
  const myColor: PieceColor | null = mySeat === 0 ? 'w' : mySeat === 1 ? 'b' : null;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  const [selected, setSelected] = useState<string | null>(devPreview?.select ?? null);
  const [pending, setPending] = useState<ChessMove | null>(devPreview?.pending ?? null);
  const [optimistic, setOptimistic] = useState<ChessMove | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(devPreview?.promo ?? null);
  const [drag, setDrag] = useState<{ from: string; over: string | null } | null>(null);
  const [cursor, setCursor] = useState<string>(flipped ? 'e7' : 'e2');
  const [kbd, setKbd] = useState(false);
  const [focused, setFocused] = useState(false);
  const [shake, setShake] = useState<{ sq: string; n: number } | null>(null);
  const [snapId, setSnapId] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');

  const boardRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragRef = useRef<{ from: string; pointerId: number; sx: number; sy: number; moved: boolean; wasSelected: boolean; over: string | null } | null>(null);
  const lastAttemptRef = useRef<string | null>(null);
  const ownSoundRef = useRef(false);
  const refocus = () => requestAnimationFrame(() => boardRef.current?.focus({ preventScroll: true }));

  const myTurn = myColor !== null && mySeat !== null && toAct.includes(mySeat) && !view.result;
  const canAct = myTurn && !busy && !pending && !optimistic;

  /** Legal moves grouped by origin square, only for my own pieces. */
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

  const trackRef = useRef<Tracked[] | null>(null);
  const idRef = useRef(0);
  const histLenRef = useRef(view.history.length);
  const layerKeyRef = useRef(0);
  const pieces = useMemo(() => {
    // A jump of more than one move (reconnect, new game) rebuilds ids without guessing a path.
    const jump = Math.abs(view.history.length - histLenRef.current) > 1;
    histLenRef.current = view.history.length;
    if (jump) layerKeyRef.current++;
    const r = trackPieces(jump ? null : trackRef.current, board, last, () => `p${idRef.current++}`);
    trackRef.current = r;
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placement, view.history.length]);

  // geometry
  const toCR = useCallback(
    (sq: string) => {
      const f = sq.charCodeAt(0) - 97;
      const r = sq.charCodeAt(1) - 49;
      return { col: flipped ? 7 - f : f, row: flipped ? r : 7 - r };
    },
    [flipped],
  );
  const fromCR = useCallback((col: number, row: number) => `${FILES[flipped ? 7 - col : col]}${(flipped ? row : 7 - row) + 1}`, [flipped]);
  const sqAt = useCallback(
    (x: number, y: number): string | null => {
      const el = boardRef.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const col = Math.floor(((x - r.left) / r.width) * 8);
      const row = Math.floor(((y - r.top) / r.height) * 8);
      if (col < 0 || col > 7 || row < 0 || row > 7) return null;
      return fromCR(col, row);
    },
    [fromCR],
  );

  const targetsOf = useCallback((from: string | null) => {
    if (!from) return new Set<string>();
    return new Set((movesFrom.get(from) ?? []).map((m) => m.to));
  }, [movesFrom]);
  const targets = useMemo(() => targetsOf(drag?.from ?? selected), [targetsOf, drag, selected]);

  const ownAt = (sq: string) => {
    const p = board[sqIndex(sq)];
    return p && p.c === myColor ? p : null;
  };

  // Committing a move
  const send = useCallback(
    (mv: ChessMove) => {
      setOptimistic(mv);
      onMove(mv);
    },
    [onMove],
  );

  const commit = (mv: ChessMove, snap: boolean) => {
    const id = snap ? pieces.find((p) => p.sq === sqIndex(mv.from))?.id ?? null : null;
    setSnapId(id);
    setSelected(null);
    setPromo(null);
    lastAttemptRef.current = mv.from;
    const mover = board[sqIndex(mv.from)];
    const victim = board[sqIndex(mv.to)];
    const enPassant = mover?.t === 'p' && mv.from[0] !== mv.to[0] && !victim;
    const capture = !!victim || enPassant;
    if (settings.sound) play(capture ? 'capture' : 'move');
    haptic(capture ? 'strong' : 'light');
    ownSoundRef.current = true;
    if (settings.confirmMoves) setPending(mv);
    else send(mv);
  };

  /** Returns true when the move was accepted (or the promotion picker opened). */
  const tryMove = (from: string, to: string, snap: boolean) => {
    const opts = (movesFrom.get(from) ?? []).filter((m) => m.to === to);
    if (!opts.length) return false;
    if (opts.some((m) => m.promotion)) {
      setPromo({ from, to });
      setSelected(from);
      setAnnounce('Choose a piece for your pawn: queen, rook, bishop or knight.');
      return true;
    }
    commit(opts[0]!, snap);
    return true;
  };

  const select = (sq: string) => {
    const p = ownAt(sq);
    if (!p) return;
    setSelected(sq);
    const n = targetsOf(sq).size;
    setAnnounce(`${cap(PIECE_NAMES[p.t])} on ${sq} selected. ${n === 0 ? 'It has no moves.' : `${n} ${n === 1 ? 'move' : 'moves'}.`}`);
  };

  // Pointer: tap to select, tap to move, or drag and drop.
  const placeGhost = () => {
    const el = boardRef.current;
    const g = ghostRef.current;
    if (!el || !g) return;
    const r = el.getBoundingClientRect();
    const s = r.width / 8;
    g.style.transform = `translate3d(${pointerRef.current.x - r.left - s / 2}px, ${pointerRef.current.y - r.top - s / 2}px, 0) scale(1.12)`;
  };
  useLayoutEffect(() => {
    if (drag) placeGhost();
  }, [drag]);

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    setKbd(false);
    const sq = sqAt(e.clientX, e.clientY);
    if (!sq) return;
    if (promo) return;
    if (!canAct) return;
    if (selected && sq !== selected && targets.has(sq)) {
      tryMove(selected, sq, false);
      return;
    }
    if (ownAt(sq)) {
      const wasSelected = selected === sq;
      if (!wasSelected) select(sq);
      pointerRef.current = { x: e.clientX, y: e.clientY };
      dragRef.current = { from: sq, pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, wasSelected, over: sq };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      return;
    }
    // Empty square that is not a legal destination: deselect. Opponent piece: nothing.
    if (!board[sqIndex(sq)]) setSelected(null);
  };

  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    pointerRef.current = { x: e.clientX, y: e.clientY };
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
      d.moved = true;
      setDrag({ from: d.from, over: d.from });
      return;
    }
    placeGhost();
    const over = sqAt(e.clientX, e.clientY);
    if (over !== d.over) {
      d.over = over;
      setDrag({ from: d.from, over });
    }
  };

  const endDrag = (e: RPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (!d.moved) {
      if (d.wasSelected && !cancelled) setSelected(null);
      return;
    }
    setDrag(null);
    if (cancelled) return;
    const to = sqAt(e.clientX, e.clientY);
    if (!to || to === d.from) return;
    if (!tryMove(d.from, to, true)) {
      if (!reduce) setShake({ sq: d.from, n: Date.now() });
    }
  };

  // Keyboard play
  const activate = (sq: string) => {
    if (promo) return;
    if (!canAct) {
      setAnnounce(view.result ? 'The game has finished.' : pending ? 'Confirm or undo your move first.' : 'Please wait for your turn.');
      return;
    }
    if (selected && sq !== selected && targets.has(sq)) {
      tryMove(selected, sq, false);
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

  const onKeyDown = (e: RKeyboardEvent<HTMLDivElement>) => {
    const k = e.key;
    if (k === 'Escape') {
      if (promo) setPromo(null);
      else if (pending) setPending(null);
      else setSelected(null);
      if (e.target !== e.currentTarget) refocus();
      return;
    }
    if (e.target !== e.currentTarget) return;
    const delta: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (delta[k]) {
      e.preventDefault();
      setKbd(true);
      const { col, row } = toCR(cursor);
      const [dc, dr] = delta[k]!;
      const next = fromCR(Math.min(7, Math.max(0, col + dc)), Math.min(7, Math.max(0, row + dr)));
      setCursor(next);
      const p = board[sqIndex(next)];
      const tgt = targets.has(next) ? ', legal move' : '';
      setAnnounce(`${next}, ${p ? `${p.c === 'w' ? 'white' : 'black'} ${PIECE_NAMES[p.t]}` : 'empty'}${tgt}`);
      return;
    }
    if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      setKbd(true);
      activate(cursor);
    }
  };

  // Server truth arrives: drop the optimistic copy.
  useEffect(() => {
    setOptimistic(null);
  }, [view.fen]);

  // Safety: if the server never answers, put the piece back.
  useEffect(() => {
    if (!optimistic) return;
    const t = setTimeout(() => setOptimistic(null), 6000);
    return () => clearTimeout(t);
  }, [optimistic]);

  useEffect(() => {
    if (snapId) setSnapId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placement]);

  // Error from the server: revert quietly and give the piece a small shake.
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

  // Sound, haptics and announcement for every new move (mine or the opponent's).
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

  // Derived squares to paint
  const lastSq = last ? [last.from, last.to] : [];
  const checkSq = useMemo(() => {
    if (!view.inCheck || shown) return null;
    const c: PieceColor = view.turn === 0 ? 'w' : 'b';
    const i = board.findIndex((p) => p?.t === 'k' && p.c === c);
    return i >= 0 ? sqName(i) : null;
  }, [view.inCheck, view.turn, board, shown]);

  const squares = [];
  for (let i = 0; i < 64; i++) {
    const sq = sqName(i);
    const { col, row } = toCR(sq);
    squares.push(<rect key={sq} x={col * 100} y={row * 100} width={100} height={100} fill={isLightSquare(i) ? theme.light : theme.dark} />);
  }

  const coords = [];
  for (let c = 0; c < 8; c++) {
    const sq = fromCR(c, 7);
    const light = isLightSquare(sqIndex(sq));
    coords.push(
      <text key={`f${c}`} x={c * 100 + 92} y={793} textAnchor="end" fontSize={17} fontWeight={600} fill={light ? theme.coordOnLight : theme.coordOnDark}>
        {sq[0]}
      </text>,
    );
  }
  for (let r = 0; r < 8; r++) {
    const sq = fromCR(0, r);
    const light = isLightSquare(sqIndex(sq));
    coords.push(
      <text key={`r${r}`} x={7} y={r * 100 + 21} fontSize={17} fontWeight={600} fill={light ? theme.coordOnLight : theme.coordOnDark}>
        {sq[1]}
      </text>,
    );
  }

  const hl = (sq: string, fill: string, key: string) => {
    const { col, row } = toCR(sq);
    return <rect key={key} x={col * 100} y={row * 100} width={100} height={100} fill={fill} />;
  };

  const hintArrow = useMemo(() => {
    if (!hint) return null;
    const a = toCR(hint.from);
    const b = toCR(hint.to);
    const x1 = a.col * 100 + 50;
    const y1 = a.row * 100 + 50;
    const x2 = b.col * 100 + 50;
    const y2 = b.row * 100 + 50;
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (!len) return null;
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    const head = 34;
    const ex = x2 - ux * 18;
    const ey = y2 - uy * 18;
    const bx = ex - ux * head;
    const by = ey - uy * head;
    const px = -uy * 22;
    const py = ux * 22;
    return (
      <g opacity={0.72} pointerEvents="none">
        <line x1={x1 + ux * 22} y1={y1 + uy * 22} x2={bx + ux * 4} y2={by + uy * 4} stroke="var(--primary)" strokeWidth={15} strokeLinecap="round" />
        <path d={`M${ex} ${ey}L${bx + px} ${by + py}L${bx - px} ${by - py}Z`} fill="var(--primary)" stroke="var(--primary)" strokeWidth={4} strokeLinejoin="round" />
      </g>
    );
  }, [hint, toCR]);

  const pendingRow = pending ? toCR(pending.to).row : 7;
  const promoColor: PieceColor = myColor ?? 'w';
  const promoPos = promo ? toCR(promo.to) : null;

  return (
    <div className="relative w-full select-none">
      <div
        ref={boardRef}
        role="application"
        aria-label={`Chess board. You play ${myColor === 'b' ? 'black' : myColor === 'w' ? 'white' : 'as a spectator'}. Use the arrow keys to move around, Enter to pick a piece and Enter again to move it, Escape to cancel.`}
        aria-describedby={`${uid}-live`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e, false)}
        onPointerCancel={(e) => endDrag(e, true)}
        onLostPointerCapture={(e) => endDrag(e, true)}
        className={`relative aspect-square w-full touch-none rounded-[12px] outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${drag ? 'cursor-grabbing' : canAct ? 'cursor-pointer' : ''}`}
        style={{ boxShadow: 'var(--shadow-card)' }}
      >
        <svg viewBox="0 0 800 800" className="absolute inset-0 size-full overflow-hidden rounded-[12px]" aria-hidden style={{ fontFamily: 'inherit' }}>
          <defs>
            <filter id={`${uid}-grain`} x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.006 0.022" numOctaves="4" seed="11" />
              <feColorMatrix type="saturate" values="0" />
            </filter>
            <radialGradient id={`${uid}-check`}>
              <stop offset="0" stopColor="rgba(255,90,110,0.95)" />
              <stop offset="0.55" stopColor="rgba(255,90,110,0.55)" />
              <stop offset="1" stopColor="rgba(255,90,110,0)" />
            </radialGradient>
          </defs>
          {squares}
          <rect width={800} height={800} filter={`url(#${uid}-grain)`} opacity={theme.grain.opacity} style={{ mixBlendMode: theme.grain.blend }} />
          {/* frost lines between squares */}
          <path d={Array.from({ length: 7 }, (_, k) => `M${(k + 1) * 100} 0V800M0 ${(k + 1) * 100}H800`).join('')} stroke={theme.frost} strokeWidth={1.5} fill="none" />
          {lastSq.map((sq, i) => hl(sq, theme.last, `l${i}`))}
          {theme.lastStroke
            ? lastSq.map((sq, i) => {
                const { col, row } = toCR(sq);
                return <rect key={`ls${i}`} x={col * 100 + 3} y={row * 100 + 3} width={94} height={94} fill="none" stroke={theme.lastStroke!} strokeWidth={5} />;
              })
            : null}
          {selected && !drag ? hl(selected, theme.select, 'sel') : null}
          {drag ? hl(drag.from, theme.select, 'dsel') : null}
          {checkSq
            ? (() => {
                const { col, row } = toCR(checkSq);
                return <rect x={col * 100} y={row * 100} width={100} height={100} fill={`url(#${uid}-check)`} />;
              })()
            : null}
          {coords}
          {drag?.over && targets.has(drag.over)
            ? (() => {
                const { col, row } = toCR(drag.over);
                return <rect x={col * 100 + 3} y={row * 100 + 3} width={94} height={94} rx={6} fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.75)" strokeWidth={5} />;
              })()
            : null}
          {[...targets].map((sq) => {
            const { col, row } = toCR(sq);
            const occupied = !!board[sqIndex(sq)];
            const cx = col * 100 + 50;
            const cy = row * 100 + 50;
            return occupied ? (
              <circle key={`t${sq}`} cx={cx} cy={cy} r={44} fill="none" stroke={theme.dot} strokeWidth={8} />
            ) : (
              <circle key={`t${sq}`} cx={cx} cy={cy} r={14} fill={theme.dot} />
            );
          })}
          {kbd && focused
            ? (() => {
                const { col, row } = toCR(cursor);
                return <rect x={col * 100 + 4} y={row * 100 + 4} width={92} height={92} rx={8} fill="none" stroke="var(--primary)" strokeWidth={6} />;
              })()
            : null}
        </svg>

        {/* Pieces */}
        <div key={layerKeyRef.current} className="pointer-events-none absolute inset-0">
          <AnimatePresence initial={false}>
            {pieces.map((p) => {
              const { col, row } = toCR(sqName(p.sq));
              const dragging = drag?.from === sqName(p.sq);
              const instant = reduce || p.id === snapId;
              const shaking = shake && shake.sq === sqName(p.sq);
              return (
                <motion.div
                  key={p.id}
                  data-piece-id={p.id}
                  className="absolute left-0 top-0 h-[12.5%] w-[12.5%] will-change-transform"
                  initial={false}
                  animate={{ x: `${col * 100}%`, y: `${row * 100}%`, opacity: dragging ? 0.3 : 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.86, transition: { duration: reduce ? 0 : 0.18, ease: 'easeIn' } }}
                  transition={instant ? { duration: 0 } : { x: SLIDE, y: SLIDE, opacity: { duration: 0.12 } }}
                >
                  <motion.div
                    key={shaking ? shake!.n : 'still'}
                    className="size-full p-[3%]"
                    initial={false}
                    animate={shaking ? { x: [0, -5, 5, -4, 4, -2, 0] } : { x: 0 }}
                    transition={{ duration: 0.36, ease: 'easeOut' }}
                  >
                    <PieceArt color={p.c} type={p.t} halo={theme.halo && p.c === 'b'} />
                  </motion.div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Hint arrow sits above the pieces so it stays readable */}
        {hintArrow ? (
          <svg viewBox="0 0 800 800" className="pointer-events-none absolute inset-0 size-full" aria-hidden>
            {hintArrow}
          </svg>
        ) : null}

        {/* Dragged piece follows the pointer without React renders */}
        {drag
          ? (() => {
              const p = board[sqIndex(drag.from)];
              if (!p) return null;
              return (
                <div ref={ghostRef} className="pointer-events-none absolute left-0 top-0 z-30 h-[12.5%] w-[12.5%] p-[3%] will-change-transform" style={{ filter: 'drop-shadow(0 10px 12px rgba(0,0,0,0.35))' }}>
                  <PieceArt color={p.c} type={p.t} halo={theme.halo && p.c === 'b'} shadow={false} />
                </div>
              );
            })()
          : null}

        {/* Promotion picker */}
        <AnimatePresence>
          {promo && promoPos ? (
            <motion.div key="promo" className="absolute inset-0 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.14 }}>
              <button type="button" aria-label="Cancel promotion" className="absolute inset-0 cursor-default rounded-[12px] bg-black/35" onClick={() => {
                  setPromo(null);
                  refocus();
                }} tabIndex={-1} />
              <motion.div
                role="dialog"
                aria-label="Choose a piece for your pawn"
                className="absolute flex flex-col overflow-hidden rounded-[10px] bg-surface shadow-modal ring-1 ring-line"
                style={{
                  left: `${promoPos.col * 12.5}%`,
                  top: promoPos.row <= 3 ? `${promoPos.row * 12.5}%` : `${(promoPos.row - 3) * 12.5}%`,
                  width: '12.5%',
                  height: '50%',
                  flexDirection: promoPos.row <= 3 ? 'column' : 'column-reverse',
                }}
                initial={{ scale: reduce ? 1 : 0.92 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
              >
                {(['q', 'r', 'b', 'n'] as const).map((t, i) => (
                  <button
                    key={t}
                    type="button"
                    autoFocus={i === 0}
                    aria-label={`Promote to ${PIECE_NAMES[t]}`}
                    onClick={() => {
                      const from = promo.from;
                      const to = promo.to;
                      setPromo(null);
                      commit({ from, to, promotion: t }, false);
                      refocus();
                    }}
                    className="flex min-h-0 flex-1 items-center justify-center p-[8%] outline-none transition hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                  >
                    <PieceArt color={promoColor} type={t} halo={promoColor === 'b'} shadow={false} />
                  </button>
                ))}
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Optional move confirmation */}
        <AnimatePresence>
          {pending ? (
            <motion.div
              key="confirm"
              className={`absolute left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-surface/95 p-1.5 shadow-modal ring-1 ring-line backdrop-blur ${pendingRow >= 5 ? 'top-3' : 'bottom-3'}`}
              initial={{ opacity: 0, y: reduce ? 0 : pendingRow >= 5 ? -8 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.18, ease: 'easeOut' }}
              onPointerDown={(e) => e.stopPropagation()}
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

      <div id={`${uid}-live`} aria-live="polite" aria-atomic="true" className="sr-only">
        {announce}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */

type HistoryView = Pick<ChessView, 'fen' | 'history' | 'startFen'>;

const TYPE_ORDER: PieceType[] = ['p', 'n', 'b', 'r', 'q'];

/**
 * Pieces the given seat has captured (shown in the opponent's colour) and the material lead,
 * for example "+3". The lead is counted from the board, so promotions are handled.
 */
export function CapturedTray({ view, seat, className = '' }: { view: HistoryView; seat: number; className?: string }) {
  const color: PieceColor = seat === 1 ? 'b' : 'w';
  const oppColor: PieceColor = color === 'w' ? 'b' : 'w';
  const taken: PieceType[] = [];
  view.history.forEach((h, i) => {
    if (h.captured && moverColor(view.startFen, i) === color) taken.push(h.captured as PieceType);
  });
  taken.sort((a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b));
  let diff = 0;
  for (const p of parsePlacement(view.fen)) if (p) diff += p.c === color ? VALUES[p.t] : -VALUES[p.t];

  const groups: { t: PieceType; n: number }[] = [];
  for (const t of taken) {
    const g = groups[groups.length - 1];
    if (g && g.t === t) g.n++;
    else groups.push({ t, n: 1 });
  }
  const label = taken.length
    ? `Captured ${groups.map((g) => `${g.n} ${PIECE_NAMES[g.t]}${g.n > 1 ? 's' : ''}`).join(', ')}.${diff > 0 ? ` Ahead by ${diff}.` : ''}`
    : diff > 0
      ? `Ahead by ${diff}.`
      : 'No captures yet.';

  return (
    <div className={`flex h-5 min-w-0 items-center gap-1.5 ${className}`} aria-label={label} role="img">
      {groups.map((g) => (
        <span key={g.t} className="flex items-center">
          {Array.from({ length: g.n }).map((_, i) => (
            <span key={i} className={`block size-[22px] ${i > 0 ? '-ml-[13px]' : ''}`}>
              <PieceArt color={oppColor} type={g.t} halo={oppColor === 'b'} haloWidth={5.5} shadow={false} />
            </span>
          ))}
        </span>
      ))}
      {diff > 0 ? <span className="tabular ml-0.5 text-[13px] font-semibold text-text-2">+{diff}</span> : null}
    </div>
  );
}

/** Compact move list, numbered rows with white and black columns, scrolls to the latest move. */
export function MoveList({ view, className = '' }: { view: Pick<ChessView, 'history' | 'startFen'>; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const parts = view.startFen.split(' ');
  const blackFirst = parts[1] === 'b';
  const firstNo = Number(parts[5]) || 1;
  const sans: (string | null)[] = [...(blackFirst ? [null] : []), ...view.history.map((h) => h.san)];
  const rows: { no: number; w: string | null; b: string | null; wi: number; bi: number }[] = [];
  for (let i = 0; i < sans.length; i += 2) {
    rows.push({ no: firstNo + i / 2, w: sans[i] ?? null, b: sans[i + 1] ?? null, wi: i, bi: i + 1 });
  }
  const latest = view.history.length ? sans.length - 1 : -1;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
  }, [view.history.length, reduce]);

  const cell = (san: string | null, idx: number) => (
    <span className={`truncate rounded-md px-2 py-1 ${idx === latest ? 'bg-surface-2 font-semibold text-text' : 'text-text'}`}>{san ?? ''}</span>
  );

  return (
    <div ref={ref} className={`no-scrollbar overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,transparent,black_14px)] ${className}`} aria-label="Moves" role="log">
      {view.history.length === 0 ? (
        <p className="px-2 py-3 text-[14px] text-text-2">No moves yet. {blackFirst ? 'Black' : 'White'} starts.</p>
      ) : (
        <ol className="grid grid-cols-[2.25rem_1fr_1fr] gap-y-0.5 text-[14px] leading-6">
          {rows.map((r) => (
            <li key={r.no} className="contents">
              <span className="tabular py-1 pl-2 text-text-2">{r.no}.</span>
              {cell(r.w, r.wi)}
              {cell(r.b, r.bi)}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
