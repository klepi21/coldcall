'use client';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { motion, useAnimate, useReducedMotion } from 'motion/react';
import { backgammonEngine, Rng, type BgMove, type BgStep, type BgView } from '@evens/games';
import type { BoardProps } from '../types';
import { Button, InfoTip } from '@/components/ui';
import { haptic, play } from '@/lib/sound';
import { BoardArt } from './BoardArt';
import { Checker, Die, PieceDefs, Slab } from './Pieces';
import {
  BOT,
  H,
  LEFT_X,
  MID,
  PL,
  PW,
  R,
  RIGHT_X,
  TOP,
  TRAY,
  TRAY_X,
  W,
  applyLocal,
  barXY,
  clonePos,
  colRow,
  colX,
  hitTest,
  nextXY,
  persp,
  pointXY,
  topXY,
  trayXY,
  type Pos,
  type Where,
} from './geometry';

const isStep = (m: BgMove | null | undefined): m is BgStep => !!m && !('type' in m);
const sameStep = (a: BgStep, b: BgStep) => a.from === b.from && a.to === b.to && a.die === b.die;

interface AnimItem {
  seat: number;
  from: Where;
  to: Where;
  before: Pos;
  after: Pos;
  hit: boolean;
  /** The checker is already where it belongs (dragged or previewed), only show the hit hop. */
  skipSlide: boolean;
}
interface AnimState {
  items: AnimItem[];
  idx: number;
  phase: 'slide' | 'hop';
}

const posOf = (v: { points: BgView['points']; bar: [number, number]; off: [number, number] }): Pos => ({
  points: v.points,
  bar: v.bar,
  off: v.off,
});

const samePos = (a: Pos, b: Pos) =>
  a.bar[0] === b.bar[0] &&
  a.bar[1] === b.bar[1] &&
  a.off[0] === b.off[0] &&
  a.off[1] === b.off[1] &&
  a.points.every((p, i) => {
    const q = b.points[i]!;
    return p.count === q.count && (p.count === 0 || p.seat === q.seat);
  });

/** Steps played between two views, or null when the change is not a simple continuation (undo, reset). */
function diffSteps(prev: BgView, next: BgView): { seat: number; step: BgStep }[] | null {
  if (next.history.length < prev.history.length) return null;
  if (next.history.length === prev.history.length) {
    if (next.turn !== prev.turn || next.steps.length < prev.steps.length) return null;
    return next.steps.slice(prev.steps.length).map((step) => ({ seat: next.turn, step }));
  }
  const out: { seat: number; step: BgStep }[] = [];
  next.history.slice(prev.history.length).forEach((rec, j) => {
    const st = j === 0 && rec.seat === prev.turn ? rec.steps.slice(prev.steps.length) : rec.steps;
    for (const step of st) out.push({ seat: rec.seat, step });
  });
  for (const step of next.steps) out.push({ seat: next.turn, step });
  return out;
}

const where = (w: Where, mySeat: number) => (w === 'bar' ? 'the bar' : w === 'off' ? 'off the board' : `point ${persp(w, mySeat) + 1}`);
const timesWord = (n: number) => (n === 4 ? 'four times' : n === 3 ? 'three times' : n === 2 ? 'twice' : 'once');

function diceText(dice: number[]): string {
  if (dice.length === 0) return '';
  if (dice.every((d) => d === dice[0]) && dice.length > 1) return `${dice[0]} ${timesWord(dice.length)}`;
  if (dice.length === 1) return `${dice[0]}`;
  return `${dice[0]} and ${dice[1]}`;
}

function removeOne(pos: Pos, seat: number, w: Where): Pos {
  const p = clonePos(pos);
  const s = seat as 0 | 1;
  if (w === 'bar') p.bar[s] = Math.max(0, p.bar[s] - 1);
  else if (w === 'off') p.off[s] = Math.max(0, p.off[s] - 1);
  else {
    const q = p.points[w]!;
    q.count = Math.max(0, q.count - 1);
    if (q.count === 0) q.seat = null;
  }
  return p;
}

const previewRng = () => Rng.fromSeeds('00'.repeat(32), ['preview']);

export function BackgammonBoard(props: BoardProps<BgView, BgMove>) {
  const { view, legal, mySeat, toAct, seatNames, onMove, busy, settings, hint, error } = props;
  const seatV = mySeat ?? 0;
  const oppV = 1 - seatV;
  const reduce = !!useReducedMotion();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const svgRef = useRef<SVGSVGElement>(null);
  const dragG = useRef<SVGGElement>(null);

  const sound = useCallback(
    (name: 'move' | 'capture' | 'dice' | 'error' | 'tap') => {
      if (!settings.sound) return;
      play(name);
      // Vibration is only allowed after the first tap on the page.
      const active = typeof navigator !== 'undefined' && (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive;
      if (!active) return;
      if (name === 'move' || name === 'tap') haptic('light');
      if (name === 'capture') haptic('strong');
    },
    [settings.sound],
  );

  const [selected, setSelected] = useState<Where | null>(null);
  const [destIdx, setDestIdx] = useState(0);
  const [focused, setFocused] = useState<Where | null>(null);
  const [dragFrom, setDragFrom] = useState<Where | null>(null);
  const [pending, setPending] = useState<{ step: BgStep; pos: Pos } | null>(null);
  const [anim, setAnim] = useState<AnimState | null>(null);
  const [announce, setAnnounce] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [scope, animateEl] = useAnimate<HTMLDivElement>();
  const animRef = useRef<AnimState | null>(null);
  animRef.current = anim;
  const prevView = useRef<BgView | null>(null);
  const announceAcc = useRef<{ key: number; text: string } | null>(null);
  const skipRef = useRef<{ step: BgStep; hop: boolean } | null>(null);
  const dragRef = useRef<{ from: Where; id: number; sx: number; sy: number; moved: boolean } | null>(null);

  const myTurn = mySeat !== null && toAct.includes(mySeat) && !view.result;
  const steps = useMemo(() => (myTurn ? legal.filter(isStep) : []), [legal, myTurn]);
  const interactive = myTurn && !busy && !anim && !pending;
  const sources = useMemo(() => [...new Set(steps.map((s) => s.from))] as Where[], [steps]);

  const destsFor = useCallback(
    (from: Where | null) => {
      if (from === null) return [] as { to: Where; die: number; dice: number[] }[];
      const m = new Map<Where, number[]>();
      for (const s of steps) if (s.from === from) m.set(s.to, [...(m.get(s.to) ?? []), s.die]);
      return [...m.entries()]
        .map(([to, dice]) => ({ to, dice: [...new Set(dice)].sort((a, b) => a - b), die: Math.min(...dice) }))
        .sort((a, b) => b.dice[0]! - a.dice[0]!);
    },
    [steps],
  );

  /* ---------------------------------------------- view changes: diff, animate, sound */
  useEffect(() => {
    const prev = prevView.current;
    prevView.current = view;
    if (prev === view) return;
    const diff = prev ? diffSteps(prev, view) : null;
    const same =
      !!prev &&
      !!diff &&
      diff.length === 0 &&
      prev.turn === view.turn &&
      prev.dice.join() === view.dice.join() &&
      prev.history.length === view.history.length &&
      !!prev.result === !!view.result;
    // A fresh copy of the same position (reconnect, presence update) keeps the selection and any held move.
    if (same) return;
    setSelected(null);
    setDragFrom(null);
    setPending(null);
    if (!prev) return;
    if (!diff) {
      setAnim(null);
      if (view.steps.length < prev.steps.length && view.turn === prev.turn) setAnnounce('Moves undone. Play your turn again.');
      return;
    }
    if (diff.length === 0) return;
    // Rebuild the intermediate positions and check they land on the real view.
    let pos = posOf(prev);
    const items: AnimItem[] = [];
    for (const { seat, step } of diff) {
      const { after, hit } = applyLocal(pos, seat, step.from, step.to);
      const skip = skipRef.current && seat === mySeat && sameStep(skipRef.current.step, step) ? skipRef.current : null;
      if (skip) skipRef.current = null;
      items.push({ seat, from: step.from, to: step.to, before: pos, after, hit: hit && (!skip || skip.hop), skipSlide: !!skip });
      pos = after;
    }
    const ok = samePos(pos, posOf(view));
    const words = diff
      .map(({ seat, step }) => {
        const who = seat === mySeat ? 'You' : seatNames[seat] ?? 'Opponent';
        return `${who} moved from ${where(step.from, seatV)} to ${where(step.to, seatV)}.`;
      })
      .join(' ');
    // Collect the opponent's whole turn into one announcement.
    if (diff.every((d) => d.seat !== mySeat)) {
      const acc = announceAcc.current;
      const text = acc && acc.key === prev.history.length ? `${acc.text} ${words}` : words;
      announceAcc.current = { key: prev.history.length, text };
      setAnnounce(text);
    } else {
      announceAcc.current = null;
      setAnnounce(words);
    }
    const animated = items.filter((it) => !it.skipSlide || it.hit);
    for (const it of items) if (it.skipSlide && !it.hit) sound('move');
    if (!ok || reduce || animated.length === 0) {
      setAnim(null);
      if (animated.length) sound(animated.some((i) => i.hit) ? 'capture' : 'move');
      return;
    }
    setAnim((a) => {
      if (a) return { ...a, items: [...a.items, ...animated] };
      return { items: animated, idx: 0, phase: animated[0]!.skipSlide ? 'hop' : 'slide' };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const advance = useCallback(() => {
    const a = animRef.current;
    if (!a) return;
    const it = a.items[a.idx]!;
    let next: AnimState | null;
    if (a.phase === 'slide') sound(it.hit ? 'capture' : 'move');
    if (a.phase === 'slide' && it.hit) next = { ...a, phase: 'hop' };
    else {
      const idx = a.idx + 1;
      next = idx >= a.items.length ? null : { ...a, idx, phase: a.items[idx]!.skipSlide ? 'hop' : 'slide' };
    }
    animRef.current = next;
    setAnim(next);
  }, [sound]);

  // Safety net: never let the queue stall if an animation callback does not fire (hidden tab).
  useEffect(() => {
    if (!anim) return;
    const t = setTimeout(advance, 700);
    return () => clearTimeout(t);
  }, [anim, advance]);

  /* ---------------------------------------------- dice */
  const rollKey = `${view.history.length}-${view.turn}-${view.rolled.join('')}`;
  const lastRollKey = useRef(rollKey);
  useEffect(() => {
    if (lastRollKey.current === rollKey) return;
    lastRollKey.current = rollKey;
    if (view.rolled.length) sound('dice');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollKey]);

  /* ---------------------------------------------- moving */
  const commit = useCallback(
    (step: BgStep, viaDrag: boolean) => {
      setSelected(null);
      setDragFrom(null);
      if (settings.confirmMoves && mySeat !== null) {
        try {
          const next = backgammonEngine.applyMove(view, mySeat, step, previewRng());
          const last = next.turn !== view.turn || !!next.winner || next.history.length > view.history.length;
          if (last) {
            const before = posOf(view);
            const after: Pos = posOf(backgammonEngine.publicView(next, mySeat));
            const { hit } = applyLocal(before, mySeat, step.from, step.to);
            setPending({ step, pos: after });
            skipRef.current = { step, hop: false };
            if (reduce || (viaDrag && !hit)) sound(hit ? 'capture' : 'move');
            else {
              const item: AnimItem = { seat: mySeat, from: step.from, to: step.to, before, after, hit, skipSlide: viaDrag };
              const a: AnimState = { items: [item], idx: 0, phase: viaDrag ? 'hop' : 'slide' };
              animRef.current = a;
              setAnim(a);
            }
            setAnnounce(`Moved to ${where(step.to, seatV)}. Confirm the move to finish your turn, or undo.`);
            return;
          }
        } catch {
          /* fall through to the server, which explains any problem */
        }
      }
      if (viaDrag) {
        const { hit } = applyLocal(posOf(view), seatV, step.from, step.to);
        skipRef.current = { step, hop: hit };
      }
      onMove(step);
    },
    [settings.confirmMoves, mySeat, view, reduce, sound, onMove, seatV],
  );

  const undo = useCallback(() => {
    setPending(null);
    setAnim(null);
    skipRef.current = null;
    if (view.canUndo) onMove({ type: 'undo' });
    else setAnnounce('Move undone.');
    sound('tap');
  }, [view.canUndo, onMove, sound]);

  const confirm = useCallback(() => {
    if (!pending) return;
    skipRef.current = { step: pending.step, hop: false };
    onMove(pending.step);
  }, [pending, onMove]);

  const flash = (text: string) => {
    setNote(text);
    if (!reduce && scope.current) void animateEl(scope.current, { x: [0, -6, 6, -4, 4, 0] }, { duration: 0.32 });
    sound('error');
  };

  const explainNoMove = (w: Where) => {
    if (sources.includes('bar') && w !== 'bar') return flash('You have a checker on the bar. Bring it back in first.');
    flash('That checker cannot move with these dice.');
  };

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 2600);
    return () => clearTimeout(t);
  }, [note]);

  /* ---------------------------------------------- pointer input */
  const toSvg = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return { x: 0, y: 0 };
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: pt.x, y: pt.y };
  };

  const ownsAt = (w: Where) => {
    if (w === 'off') return false;
    if (w === 'bar') return view.bar[seatV as 0 | 1] > 0;
    const p = view.points[w]!;
    return p.seat === seatV && p.count > 0;
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (!interactive) return;
    const p = toSvg(e);
    const w = hitTest(p.x, p.y, seatV);
    if (w === null) {
      setSelected(null);
      return;
    }
    if (selected !== null) {
      const d = destsFor(selected).find((x) => x.to === w);
      if (d) {
        commit({ from: selected as number | 'bar', to: d.to as number | 'off', die: d.die }, false);
        return;
      }
    }
    if (sources.includes(w)) {
      dragRef.current = { from: w, id: e.pointerId, sx: p.x, sy: p.y, moved: false };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (ownsAt(w)) explainNoMove(w);
    setSelected(null);
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const p = toSvg(e);
    if (!d.moved && Math.hypot(p.x - d.sx, p.y - d.sy) > 10) {
      d.moved = true;
      setDragFrom(d.from);
      setSelected(d.from);
    }
    if (d.moved && dragG.current) dragG.current.setAttribute('transform', `translate(${p.x} ${p.y - 8})`);
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    dragRef.current = null;
    if (!d.moved) {
      if (selected === d.from) setSelected(null);
      else {
        setSelected(d.from);
        setDestIdx(0);
        sound('tap');
        const ds = destsFor(d.from);
        setAnnounce(`Selected ${where(d.from, seatV)}. ${ds.length === 1 ? 'One place' : `${ds.length} places`} to go: ${ds.map((x) => `${where(x.to, seatV)} with the ${x.die}`).join(', ')}.`);
      }
      return;
    }
    const p = toSvg(e);
    const w = hitTest(p.x, p.y, seatV);
    const dest = w === null ? undefined : destsFor(d.from).find((x) => x.to === w);
    setDragFrom(null);
    if (dest) commit({ from: d.from as number | 'bar', to: dest.to as number | 'off', die: dest.die }, true);
    else setSelected(d.from);
  };

  const onPointerCancel = () => {
    dragRef.current = null;
    setDragFrom(null);
  };

  /* ---------------------------------------------- keyboard */
  const onKey = (e: KeyboardEvent<SVGGElement>, src: Where) => {
    if (!interactive) return;
    const ds = destsFor(src);
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (selected === src && ds.length) {
        const d = ds[destIdx % ds.length]!;
        kbdMoved.current = true;
        commit({ from: src as number | 'bar', to: d.to as number | 'off', die: d.die }, false);
      } else {
        setSelected(src);
        setDestIdx(0);
        const d = ds[0];
        setAnnounce(`Selected ${where(src, seatV)}. ${ds.length} ${ds.length === 1 ? 'place' : 'places'} to go. ${d ? `Now on ${where(d.to, seatV)} with the ${d.die}.` : ''} Use the arrow keys to choose and Enter to move.`);
      }
    } else if (selected === src && ds.length && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      const n = (destIdx + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + ds.length) % ds.length;
      setDestIdx(n);
      const d = ds[n]!;
      setAnnounce(`${where(d.to, seatV)} with the ${d.die}.`);
    } else if (e.key === 'Escape') {
      setSelected(null);
    }
  };

  // After a keyboard move, put focus back on the first movable checker so play can continue.
  const kbdMoved = useRef(false);
  useEffect(() => {
    if (!kbdMoved.current || !interactive) return;
    kbdMoved.current = false;
    svgRef.current?.querySelector<SVGGElement>('g[role="button"][tabindex="0"]')?.focus();
  }, [interactive, sources]);

  /* ---------------------------------------------- what to draw */
  let display: Pos = pending ? pending.pos : posOf(view);
  let fly: { seat: number; from: { x: number; y: number }; to: { x: number; y: number }; hop: boolean; key: string } | null = null;
  if (anim) {
    const it = anim.items[anim.idx]!;
    if (anim.phase === 'slide') {
      display = removeOne(it.before, it.seat, it.from);
      fly = { seat: it.seat, from: topXY(it.before, it.seat, it.from, seatV), to: topXY(it.after, it.seat, it.to, seatV), hop: false, key: `${anim.idx}s${anim.items.length}` };
    } else {
      const opp = 1 - it.seat;
      display = removeOne(it.after, opp, 'bar');
      const at = pointXY(persp(it.to as number, seatV), 0, 1);
      fly = { seat: opp, from: at, to: topXY(it.after, opp, 'bar', seatV), hop: true, key: `${anim.idx}h` };
    }
  }
  if (dragFrom !== null) display = removeOne(display, seatV, dragFrom);

  const hintStep = isStep(hint) && interactive && selected === null ? hint : null;
  const activeSrc: Where | null = selected ?? hintStep?.from ?? null;
  const dests = selected !== null ? destsFor(selected) : hintStep ? [{ to: hintStep.to, die: hintStep.die, dice: [hintStep.die] }] : [];
  const onlyOne = interactive && sources.length === 1 && selected === null;

  const checkers: React.ReactNode[] = [];
  display.points.forEach((p, i) => {
    if (!p.count || p.seat === null) return;
    const c = persp(i, seatV);
    const isMoverSrc = interactive && p.seat === seatV && sources.includes(i);
    for (let k = 0; k < p.count; k++) {
      const { x, y } = pointXY(c, k, p.count);
      const top = k === p.count - 1;
      checkers.push(
        <g key={`p${i}-${k}`} transform={`translate(${x} ${y})`}>
          <Checker seat={p.seat} uid={uid} badge={top && p.count > 5 ? p.count : undefined} />
          {top && isMoverSrc ? <SourceRing active={activeSrc === i} pulse={onlyOne} reduce={reduce} /> : null}
        </g>,
      );
    }
  });
  ([0, 1] as const).forEach((s) => {
    const n = display.bar[s];
    for (let k = 0; k < n; k++) {
      const { x, y } = barXY(s === seatV, k, n);
      const top = k === n - 1;
      checkers.push(
        <g key={`b${s}-${k}`} transform={`translate(${x} ${y})`}>
          <Checker seat={s} uid={uid} badge={top && n > 1 ? n : undefined} />
          {top && s === seatV && interactive && sources.includes('bar') ? <SourceRing active={activeSrc === 'bar'} pulse={onlyOne} reduce={reduce} /> : null}
        </g>,
      );
    }
    const off = display.off[s];
    for (let k = 0; k < off; k++) {
      const { x, y } = trayXY(s === seatV, k);
      checkers.push(
        <g key={`o${s}-${k}`} transform={`translate(${x} ${y})`}>
          <Slab seat={s} uid={uid} />
        </g>,
      );
    }
  });

  const destMarks = dests.map((d, j) => {
    const kbd = selected !== null && focused === selected && j === destIdx % Math.max(1, dests.length);
    if (d.to === 'off') {
      const y0 = MID + 8;
      return (
        <g key="off" pointerEvents="none">
          <motion.rect
            x={TRAY_X + 3}
            y={y0}
            width={TRAY - 6}
            height={BOT - y0 - 2}
            rx={7}
            fill="var(--primary)"
            stroke="var(--primary)"
            strokeWidth={kbd ? 5 : 3}
            initial={{ fillOpacity: 0.1 }}
            animate={{ fillOpacity: reduce ? 0.22 : [0.12, 0.3, 0.12] }}
            transition={{ duration: 1.6, repeat: reduce ? 0 : Infinity }}
          />
          <DieLabel x={TRAY_X + TRAY / 2} y={MID + 40} dice={d.dice} />
        </g>
      );
    }
    const { x, y } = nextXY(display, seatV, d.to, seatV);
    const blot = d.to !== 'bar' && display.points[d.to]!.seat === oppV && display.points[d.to]!.count === 1;
    return (
      <g key={String(d.to)} pointerEvents="none">
        <g transform={`translate(${x} ${y})`}>
          <motion.circle
            r={R - 1}
            fill="var(--primary)"
            fillOpacity={blot ? 0.12 : 0.26}
            stroke="var(--primary)"
            strokeWidth={kbd ? 6 : 3.5}
            strokeDasharray={blot ? '7 6' : undefined}
            initial={reduce ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          />
          <DieLabel x={0} y={0} dice={d.dice} dark={blot} />
        </g>
      </g>
    );
  });

  /* dice */
  const moverSide = view.turn === seatV ? 'right' : 'left';
  const rolled = view.rolled.length === 2 && view.rolled[0] === view.rolled[1] ? [view.rolled[0]!, view.rolled[0]!, view.rolled[0]!, view.rolled[0]!] : view.rolled;
  const remaining = pending ? (() => { const r = view.dice.slice(); const i = r.indexOf(pending.step.die); if (i >= 0) r.splice(i, 1); return r; })() : view.dice;
  const usedFlags = (() => {
    const left = remaining.slice();
    const flags = rolled.map(() => true);
    // mark the rightmost matching dice as unused so used dice dim from the left
    for (let k = 0; k < rolled.length; k++) {
      const i = left.indexOf(rolled[k]!);
      if (i >= 0) {
        flags[k] = false;
        left.splice(i, 1);
      }
    }
    if (rolled.length === 4) {
      const used = 4 - remaining.length;
      return rolled.map((_, k) => k < used);
    }
    return flags;
  })();
  const dieSize = rolled.length === 4 ? 52 : 60;
  const gap = rolled.length === 4 ? 62 : 74;
  const cx = (moverSide === 'right' ? RIGHT_X : LEFT_X) + 3 * PW;
  const showDice = !view.result && rolled.length > 0;

  /* status line */
  const oppName = seatNames[oppV] ?? 'Opponent';
  const lastRec = view.history[view.history.length - 1];
  let status: string;
  if (view.result) {
    const w = view.result.winners[0];
    const how = view.result.reason === 'gammon' ? ' with a gammon' : view.result.reason === 'backgammon' ? ' with a backgammon' : '';
    status = mySeat === null ? `${seatNames[w ?? 0] ?? 'Player'} won${how}.` : w === mySeat ? `You won${how}. Well played.` : `${seatNames[w ?? 0] ?? 'Your opponent'} won${how}. Good game.`;
  } else if (mySeat === null) {
    status = `${seatNames[view.turn] ?? 'Player'} to move.`;
  } else if (lastRec?.passed && lastRec.seat === mySeat && view.turn !== mySeat) {
    status = `No legal moves for ${diceText(lastRec.rolled)}, your turn passes.`;
  } else if (pending) {
    status = 'Happy with that? Confirm your move, or undo.';
  } else if (myTurn) {
    const pre = lastRec?.passed && lastRec.seat !== mySeat ? `${oppName} could not move. ` : '';
    if (steps.length === 0) status = `${pre}No legal moves, your turn passes.`;
    else if (sources.includes('bar')) status = `${pre}Your turn. Bring your checker in from the bar with ${diceText(view.dice)}.`;
    else status = `${pre}Your turn. Move ${diceText(view.dice)}.`;
  } else {
    status = busy ? 'Sending your move.' : `${oppName} is thinking.`;
  }

  const myColor = seatV === 0 ? 'ivory' : 'ink';
  const canUndoNow = (myTurn && view.canUndo && !busy) || !!pending;

  return (
    <div className="mx-auto flex w-full flex-col gap-2" style={{ maxWidth: `clamp(300px, calc((100dvh - 330px) * ${W / H}), 880px)` }}>
      <div className="flex min-h-[24px] items-center justify-center px-2 text-center text-[15px] font-medium text-text" aria-hidden>
        {status}
      </div>
      <div className="sr-only" aria-live="polite" role="status">
        {status} {announce}
      </div>

      <motion.div
        ref={scope}
        className="relative mx-auto w-full select-none overflow-hidden rounded-[18px] shadow-modal"
        style={{ aspectRatio: `${W} / ${H}` }}
      >
        <BoardArt uid={uid} />
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="absolute inset-0 h-full w-full"
          style={{ touchAction: 'none', cursor: interactive ? 'pointer' : 'default' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          role="group"
          aria-label={`Backgammon board. You play ${myColor}. Your home board is bottom right.`}
        >
          <PieceDefs uid={uid} />
          {/* column glows sit under the checkers */}
          {dests.map((d) =>
            d.to === 'off' || d.to === 'bar' ? null : (() => {
              const { col, top } = colRow(persp(d.to as number, seatV));
              return <rect key={`g${d.to}`} x={colX(col) - PW / 2 + 3} y={top ? TOP : BOT - PL - 8} width={PW - 6} height={PL + 8} rx={8} fill="var(--primary)" fillOpacity={0.14} pointerEvents="none" />;
            })(),
          )}
          {checkers}
          {destMarks}

          {/* dice */}
          {showDice
            ? rolled.map((v, k) => {
                const x = cx + (k - (rolled.length - 1) / 2) * gap;
                return (
                  <g key={`${rollKey}-${k}`} transform={`translate(${x} ${MID})`} pointerEvents="none">
                    <g style={{ opacity: usedFlags[k] ? 0.38 : 1, transition: 'opacity 200ms ease-out' }}>
                      <motion.g
                        initial={reduce ? { opacity: 0 } : { rotate: k % 2 ? 260 : -240, scale: 0.55, x: moverSide === 'right' ? 70 : -70, y: -36, opacity: 0 }}
                        animate={reduce ? { opacity: 1 } : { rotate: 0, scale: [0.55, 1.12, 0.96, 1], x: 0, y: [-36, 6, -3, 0], opacity: 1 }}
                        transition={{ duration: reduce ? 0.15 : 0.5, ease: [0.2, 0.8, 0.3, 1], delay: k * 0.04 }}
                      >
                        <Die value={v} size={dieSize} uid={uid} />
                      </motion.g>
                    </g>
                  </g>
                );
              })
            : null}

          {/* bar and tray counts */}
          {([0, 1] as const).map((s) =>
            display.off[s] > 0 ? (
              <text
                key={`offc${s}`}
                x={TRAY_X + TRAY / 2}
                y={s === seatV ? trayXY(true, display.off[s]).y + 4 : trayXY(false, display.off[s]).y + 4}
                textAnchor="middle"
                fontSize={20}
                fontWeight={700}
                fontFamily="var(--font-inter), system-ui, sans-serif"
                fill="rgba(244,232,210,0.8)"
                pointerEvents="none"
              >
                {display.off[s]}
              </text>
            ) : null,
          )}

          {/* animated checker */}
          {fly ? (
            <g pointerEvents="none">
              <motion.g
                key={fly.key}
                initial={{ x: fly.from.x, y: fly.from.y }}
                animate={
                  fly.hop
                    ? { x: [fly.from.x, (fly.from.x + fly.to.x) / 2, fly.to.x], y: [fly.from.y, Math.min(fly.from.y, fly.to.y) - 60, fly.to.y] }
                    : { x: fly.to.x, y: fly.to.y }
                }
                transition={{ duration: fly.hop ? 0.26 : 0.2, ease: fly.hop ? 'easeInOut' : [0.2, 0.8, 0.3, 1] }}
                onAnimationComplete={advance}
              >
                <Checker seat={fly.seat} uid={uid} lifted />
              </motion.g>
            </g>
          ) : null}

          {/* dragged checker */}
          {dragFrom !== null ? (
            <g ref={dragG} pointerEvents="none" transform={`translate(${topXY(posOf(view), seatV, dragFrom, seatV).x} ${topXY(posOf(view), seatV, dragFrom, seatV).y})`}>
              <g transform="scale(1.1)">
                <Checker seat={seatV} uid={uid} lifted />
              </g>
            </g>
          ) : null}

          {/* keyboard focus targets for movable checkers */}
          {sources.map((src) => {
            const p = topXY(posOf(view), seatV, src, seatV);
            return (
              <g
                key={`k${String(src)}`}
                tabIndex={interactive ? 0 : -1}
                role="button"
                aria-label={`Checker on ${where(src, seatV)}. ${destsFor(src).length} ${destsFor(src).length === 1 ? 'move' : 'moves'}.`}
                aria-pressed={selected === src}
                onKeyDown={(e) => onKey(e, src)}
                onFocus={() => setFocused(src)}
                onBlur={() => setFocused((f) => (f === src ? null : f))}
                style={{ outline: 'none' }}
                transform={`translate(${p.x} ${p.y})`}
              >
                <circle r={R + 6} fill="transparent" stroke={focused === src ? 'var(--primary)' : 'none'} strokeWidth={4} />
              </g>
            );
          })}
        </svg>
      </motion.div>

      <div className="flex flex-col items-stretch gap-2 px-2 sm:min-h-[48px] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 text-sm text-text-2">
          <span className="inline-flex items-center gap-1.5">
            <Swatch seat={seatV} />
            <span>You</span>
            <span className="tabular font-semibold text-text">{view.pipCount[seatV as 0 | 1]}</span>
          </span>
          <span className="mx-2 h-4 w-px bg-line" aria-hidden />
          <span className="inline-flex items-center gap-1.5">
            <Swatch seat={oppV} />
            <span className="max-w-[90px] truncate">{oppName}</span>
            <span className="tabular font-semibold text-text">{view.pipCount[oppV as 0 | 1]}</span>
          </span>
          <InfoTip label="What is a pip count" text="Pip count is how many points all your checkers still have to travel to get off the board. Lower means you are ahead in the race." />
        </div>
        <div className="flex min-h-[44px] items-center justify-end gap-2">
          {canUndoNow ? (
            <Button variant="secondary" size="md" onClick={undo}>
              <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path d="M7 5 3 9l4 4M3.5 9H12a5 5 0 0 1 0 10h-2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Undo
            </Button>
          ) : null}
          {pending ? (
            <Button variant="primary" size="md" onClick={confirm} disabled={busy}>
              Confirm move
            </Button>
          ) : null}
        </div>
      </div>
      {note || error ? (
        <p className="px-2 text-center text-sm font-medium text-loss" role="alert">
          {note ?? error}
        </p>
      ) : null}
    </div>
  );
}

function SourceRing({ active, pulse, reduce }: { active: boolean; pulse: boolean; reduce: boolean }) {
  if (active) return <circle r={R + 3} fill="none" stroke="var(--primary)" strokeWidth={5} />;
  if (pulse && !reduce)
    return (
      <motion.circle
        r={R + 3}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={4}
        initial={{ opacity: 0.3 }}
        animate={{ opacity: [0.3, 0.95, 0.3], scale: [1, 1.08, 1] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      />
    );
  return <circle r={R + 2} fill="none" stroke="var(--primary)" strokeOpacity={pulse ? 0.9 : 0.55} strokeWidth={2.5} />;
}

function DieLabel({ x, y, dice, dark }: { x: number; y: number; dice: number[]; dark?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={15} fill={dark ? 'var(--primary)' : 'rgba(11,18,32,0.75)'} />
      <text y={7} textAnchor="middle" fontSize={20} fontWeight={700} fontFamily="var(--font-inter), system-ui, sans-serif" fill="#fff">
        {dice.join('/')}
      </text>
    </g>
  );
}

function Swatch({ seat }: { seat: number }) {
  return (
    <span
      className="inline-block size-3 rounded-full"
      style={{ background: seat === 0 ? 'radial-gradient(circle at 35% 30%, #fffbf2, #cdbe9f)' : 'radial-gradient(circle at 35% 30%, #47527a, #0d1222)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.35)' }}
      aria-hidden
    />
  );
}
