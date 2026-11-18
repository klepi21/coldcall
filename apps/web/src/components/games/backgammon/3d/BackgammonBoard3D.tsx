'use client';
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, invalidate } from '@react-three/fiber';
import { NeutralToneMapping } from 'three';
import { motion, useAnimate, useReducedMotion } from 'motion/react';
import { backgammonEngine, Rng, type BgMove, type BgStep, type BgView } from '@evens/games';
import type { BoardProps } from '../../types';
import { Button, InfoTip } from '@/components/ui';
import { haptic, play } from '@/lib/sound';
import { BackgammonBoard } from '../BackgammonBoard';
import { TRAY, TRAY_X, applyLocal, persp, type Pos, type Where } from '../geometry';
import { diceDisplay, diffSteps, isStep, posOf, removeOne, sameStep, samePos, statusText, whereText } from './logic';
import { CASE, CH, WALL_H, barPos3, nextPos3, pointPos3, topPos3, trayPos3, wx, type V3 } from './layout';
import { ASPECT, Frame3D as Frame } from './Frame3D';
import { Scene3D, type CheckerSpec, type DestSpec, type DiceSpec, type FlySpec, type RingSpec } from './Scene3D';


interface AnimItem {
  id: number;
  seat: number;
  from: Where;
  to: Where;
  before: Pos;
  after: Pos;
  hit: boolean;
  /** The checker is already where it belongs (held move), only show the hit hop. */
  skipSlide: boolean;
}
interface AnimState {
  items: AnimItem[];
  idx: number;
  phase: 'slide' | 'hop';
}

const previewRng = () => Rng.fromSeeds('00'.repeat(32), ['preview']);

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    // release the probe context at once: browsers cap live contexts and evict the oldest
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

class GLBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Backgammon in 3D: an open wooden tavli case with real checkers and tumbling dice. Same contract
 * and the same interaction rules as the 2D board, which it falls back to when WebGL is missing,
 * fails, or the player prefers reduced motion.
 */
export function BackgammonBoard3D(props: BoardProps<BgView, BgMove>) {
  const reduce = !!useReducedMotion();
  const [mode, setMode] = useState<'probe' | '3d' | '2d'>('probe');
  useEffect(() => {
    setMode(reduce || props.settings.render3d === false || !hasWebGL() ? '2d' : '3d');
  }, [reduce, props.settings.render3d]);
  if (mode === '2d') return <BackgammonBoard {...props} />;
  if (mode === 'probe') return <Frame status="" aria="Loading the board" />;
  return (
    <GLBoundary onError={() => setMode('2d')}>
      <Board3D {...props} onGLFail={() => setMode('2d')} />
    </GLBoundary>
  );
}

function usePrimaryColor(): string {
  const [c, setC] = useState('#C6FF3D');
  useEffect(() => {
    const root = document.documentElement;
    const read = () => {
      const v = getComputedStyle(root).getPropertyValue('--primary').trim();
      if (v) setC(v);
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    return () => obs.disconnect();
  }, []);
  return c;
}

function Board3D(props: BoardProps<BgView, BgMove> & { onGLFail: () => void }) {
  const { view, legal, mySeat, toAct, seatNames, onMove, busy, settings, hint, error, onGLFail } = props;
  const seatV = mySeat ?? 0;
  const oppV = 1 - seatV;
  const primary = usePrimaryColor();

  const sound = useCallback(
    (name: 'move' | 'capture' | 'dice' | 'error' | 'tap') => {
      if (!settings.sound) return;
      play(name);
      const active = typeof navigator !== 'undefined' && (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive;
      if (!active) return;
      if (name === 'move' || name === 'tap') haptic('light');
      if (name === 'capture') haptic('strong');
    },
    [settings.sound],
  );

  const [selected, setSelected] = useState<Where | null>(null);
  const [focusSrc, setFocusSrc] = useState<Where | null>(null);
  const [focusDest, setFocusDest] = useState<Where | null>(null);
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
  const idRef = useRef(0);
  const parallax = useRef({ x: 0, y: 0 });
  const listRef = useRef<HTMLDivElement>(null);

  const myTurn = mySeat !== null && toAct.includes(mySeat) && !view.result;
  const steps = useMemo(() => (myTurn ? legal.filter(isStep) : []), [legal, myTurn]);
  // A view the diff effect has not seen yet may still queue opponent animations: wait one render.
  const [seenView, setSeenView] = useState<BgView | null>(null);
  const settled = seenView === view;
  const interactive = myTurn && !busy && !anim && !pending && settled;
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
    setSeenView(view);
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
    if (same) return;
    setSelected(null);
    setPending(null);
    if (!prev) return;
    if (!diff) {
      setAnim(null);
      if (view.steps.length < prev.steps.length && view.turn === prev.turn) setAnnounce('Moves undone. Play your turn again.');
      return;
    }
    if (diff.length === 0) return;
    let pos = posOf(prev);
    const items: AnimItem[] = [];
    for (const { seat, step } of diff) {
      const { after, hit } = applyLocal(pos, seat, step.from, step.to);
      const skip = skipRef.current && seat === mySeat && sameStep(skipRef.current.step, step) ? skipRef.current : null;
      if (skip) skipRef.current = null;
      items.push({ id: ++idRef.current, seat, from: step.from, to: step.to, before: pos, after, hit: hit && (!skip || skip.hop), skipSlide: !!skip });
      pos = after;
    }
    const ok = samePos(pos, posOf(view));
    const words = diff
      .map(({ seat, step }) => {
        const who = seat === mySeat ? 'You' : seatNames[seat] ?? 'Opponent';
        return `${who} moved from ${whereText(step.from, seatV)} to ${whereText(step.to, seatV)}.`;
      })
      .join(' ');
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
    if (!ok || animated.length === 0) {
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

  const flyKeyOf = (a: AnimState | null) => (a ? `${a.items[a.idx]!.id}-${a.phase}` : '');

  const advance = useCallback(
    (key?: string) => {
      const a = animRef.current;
      if (!a) return;
      // a late callback for an item that already finished must not skip the next one
      if (key !== undefined && key !== flyKeyOf(a)) return;
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
    },
    [sound],
  );

  // Safety net: never let the queue stall when frames stop (hidden tab).
  const curKey = flyKeyOf(anim);
  useEffect(() => {
    if (!curKey) return;
    const t = setTimeout(() => advance(curKey), 1300);
    return () => clearTimeout(t);
  }, [curKey, advance]);

  /* ---------------------------------------------- dice sound */
  const rollKey = `${view.history.length}-${view.turn}-${view.rolled.join('')}`;
  const lastRollKey = useRef(rollKey);
  useEffect(() => {
    if (lastRollKey.current === rollKey) return;
    lastRollKey.current = rollKey;
    if (view.rolled.length) sound('dice');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollKey]);

  /* ---------------------------------------------- moving */
  const kbdMoved = useRef(false);
  const commit = useCallback(
    (step: BgStep) => {
      setSelected(null);
      setFocusDest(null);
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
            const a: AnimState = { items: [{ id: ++idRef.current, seat: mySeat, from: step.from, to: step.to, before, after, hit, skipSlide: false }], idx: 0, phase: 'slide' };
            animRef.current = a;
            setAnim(a);
            setAnnounce(`Moved to ${whereText(step.to, seatV)}. Confirm the move to finish your turn, or undo.`);
            return;
          }
        } catch {
          /* fall through to the server, which explains any problem */
        }
      }
      onMove(step);
    },
    [settings.confirmMoves, mySeat, view, onMove, seatV],
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
    if (scope.current) void animateEl(scope.current, { x: [0, -6, 6, -4, 4, 0] }, { duration: 0.32 });
    sound('error');
  };

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 2600);
    return () => clearTimeout(t);
  }, [note]);

  const ownsAt = (w: Where) => {
    if (w === 'off') return false;
    if (w === 'bar') return view.bar[seatV as 0 | 1] > 0;
    const p = view.points[w]!;
    return p.seat === seatV && p.count > 0;
  };

  const select = (w: Where) => {
    setSelected(w);
    sound('tap');
    const ds = destsFor(w);
    setAnnounce(
      `Selected ${whereText(w, seatV)}. ${ds.length === 1 ? 'One place' : `${ds.length} places`} to go: ${ds.map((x) => `${whereText(x.to, seatV)} with the ${x.die}`).join(', ')}.`,
    );
  };

  const onTap = (w: Where | null) => {
    if (!interactive) return;
    if (w === null) return setSelected(null);
    if (selected !== null) {
      const d = destsFor(selected).find((x) => x.to === w);
      if (d) return commit({ from: selected as number | 'bar', to: d.to as number | 'off', die: d.die });
    }
    if (sources.includes(w)) {
      if (selected === w) setSelected(null);
      else select(w);
      return;
    }
    if (ownsAt(w)) {
      if (sources.includes('bar')) flash('You have a checker on the bar. Bring it back in first.');
      else flash('That checker cannot move with these dice.');
    }
    setSelected(null);
  };

  const tapRef = useRef(onTap);
  tapRef.current = onTap;

  // After a keyboard move, put focus back on the first movable checker so play can continue.
  useEffect(() => {
    if (!kbdMoved.current || !interactive) return;
    kbdMoved.current = false;
    listRef.current?.querySelector<HTMLButtonElement>('button[data-src]')?.focus();
  }, [interactive, sources]);

  /* ---------------------------------------------- what to draw */
  let display: Pos = pending ? pending.pos : posOf(view);
  let fly: FlySpec | null = null;
  if (anim) {
    const it = anim.items[anim.idx]!;
    const key = flyKeyOf(anim);
    if (anim.phase === 'slide') {
      display = removeOne(it.before, it.seat, it.from);
      fly = {
        key,
        seat: it.seat,
        from: topPos3(it.before, it.seat, it.from, seatV),
        to: topPos3(it.after, it.seat, it.to, seatV),
        hop: false,
        fromEdge: it.from === 'off',
        toEdge: it.to === 'off',
      };
    } else {
      const opp = 1 - it.seat;
      display = removeOne(it.after, opp, 'bar');
      const n = it.after.points[it.to as number]!.count;
      const at = pointPos3(persp(it.to as number, seatV), Math.max(0, n - 1));
      fly = { key, seat: opp, from: [at[0], at[1] + 0.1, at[2]], to: topPos3(it.after, opp, 'bar', seatV), hop: true, fromEdge: false, toEdge: false };
    }
  }

  const hintStep = isStep(hint) && interactive && selected === null ? hint : null;
  const activeSrc: Where | null = selected ?? hintStep?.from ?? null;
  const destList = selected !== null ? destsFor(selected) : hintStep ? [{ to: hintStep.to as Where, die: hintStep.die, dice: [hintStep.die] }] : [];

  const checkers: CheckerSpec[] = [];
  const badges: { key: string; p: V3; n: number }[] = [];
  const topOf = new Map<Where, V3>();
  display.points.forEach((p, i) => {
    if (!p.count || p.seat === null) return;
    const c = persp(i, seatV);
    const lift = interactive && activeSrc === i && p.seat === seatV ? 0.09 : 0;
    for (let k = 0; k < p.count; k++) {
      const top = k === p.count - 1;
      const pp = pointPos3(c, k);
      checkers.push({ key: `p${i}-${k}`, seat: p.seat, p: pp, lift: top ? lift : 0 });
      if (top) {
        topOf.set(i, pp);
        if (p.count > 5) badges.push({ key: `bp${i}`, p: [pp[0], pp[1] + lift, pp[2]], n: p.count });
      }
    }
  });
  ([0, 1] as const).forEach((s) => {
    const mine = s === seatV;
    const n = display.bar[s];
    for (let k = 0; k < n; k++) {
      const pp = barPos3(mine, k);
      const top = k === n - 1;
      const lift = top && mine && interactive && activeSrc === 'bar' ? 0.09 : 0;
      checkers.push({ key: `b${s}-${k}`, seat: s, p: pp, lift });
      if (top) {
        if (mine) topOf.set('bar', pp);
        if (n > 1) badges.push({ key: `bb${s}`, p: [pp[0], pp[1] + lift, pp[2]], n });
      }
    }
    const off = display.off[s];
    for (let k = 0; k < off; k++) checkers.push({ key: `o${s}-${k}`, seat: s, p: trayPos3(mine, k), edge: true });
    if (off > 0) {
      // the count sits on the outer wall at the end of the tray, clear of labels and nearby stacks
      const tp = trayPos3(mine, 0);
      badges.push({ key: `bo${s}`, p: [wx((TRAY_X + TRAY + CASE.x1) / 2), WALL_H - CH - 0.1, tp[2]], n: off });
    }
  });

  const rings: RingSpec[] = interactive
    ? sources.flatMap((src) => {
        const p = topOf.get(src);
        return p ? [{ key: `r${String(src)}`, p, active: activeSrc === src, focus: focusSrc === src }] : [];
      })
    : [];

  const dests: DestSpec[] = destList.map((d) => {
    if (d.to === 'off') return { key: 'off', kind: 'off', p: [0, 0, 0], dice: d.dice, blot: false, focus: focusDest === 'off', mine: true };
    const q = display.points[d.to as number]!;
    const blot = q.seat === oppV && q.count === 1;
    return { key: `d${String(d.to)}`, kind: 'point', c: persp(d.to as number, seatV), p: nextPos3(display, seatV, d.to, seatV), dice: d.dice, blot, focus: focusDest === d.to };
  });

  const dd = diceDisplay(view, pending ? pending.step.die : null);
  const dice: DiceSpec | null =
    !view.result && dd.values.length > 0 ? { rollKey, values: dd.values, used: dd.used, side: view.turn === seatV ? 'right' : 'left', near: view.turn === seatV } : null;

  const status = statusText({
    view,
    mySeat,
    seatNames,
    myTurn,
    pending: !!pending,
    busy: !!busy,
    stepsCount: steps.length,
    fromBar: sources.includes('bar'),
  });
  const oppName = seatNames[oppV] ?? 'Opponent';
  const myColor = seatV === 0 ? 'ivory' : 'ink';
  const canUndoNow = (myTurn && view.canUndo && !busy) || !!pending;

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    parallax.current = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: ((e.clientY - r.top) / r.height) * 2 - 1 };
    invalidate();
  };
  const onPointerLeave = () => {
    parallax.current = { x: 0, y: 0 };
    invalidate();
  };

  return (
    <div className="mx-auto flex w-full flex-col gap-2" style={{ maxWidth: `clamp(300px, calc((100dvh - 330px) * ${ASPECT}), 880px)` }}>
      <div className="flex min-h-[46px] items-center justify-center px-2 text-center text-[15px] font-medium leading-snug text-text sm:min-h-[24px]" aria-hidden>
        {status}
      </div>
      <div className="sr-only" aria-live="polite" role="status">
        {status} {announce}
      </div>

      <motion.div
        ref={scope}
        className="relative mx-auto w-full select-none"
        style={{ aspectRatio: `${ASPECT}`, touchAction: 'manipulation', cursor: interactive ? 'pointer' : 'default' }}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        role="img"
        aria-label={`Backgammon board in 3D. You play ${myColor}. Your home board is bottom right.`}
      >
        <Canvas
          frameloop="demand"
          dpr={[1, 2]}
          shadows
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          camera={{ fov: 30, position: [0, 14, 8], near: 0.5, far: 80 }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
            gl.toneMapping = NeutralToneMapping;
            // A lost context (tab in the background, GPU reset) usually comes back. Fall back to 2D only if it does not.
            let t: ReturnType<typeof setTimeout> | undefined;
            gl.domElement.addEventListener('webglcontextlost', (ev) => {
              ev.preventDefault();
              t = setTimeout(onGLFail, 4000);
            });
            gl.domElement.addEventListener('webglcontextrestored', () => {
              clearTimeout(t);
              invalidate();
            });
          }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <Scene3D
            checkers={checkers}
            badges={badges}
            rings={rings}
            dests={dests}
            fly={fly}
            dice={dice}
            primary={primary}
            mySeat={seatV}
            onTap={tapRef}
            onFlyDone={advance}
            parallax={parallax}
          />
        </Canvas>
      </motion.div>

      {/* Keyboard and screen reader play: the same moves as tapping the board. */}
      <div ref={listRef} className="sr-only" role="group" aria-label="Your moves" onKeyDown={(e) => e.key === 'Escape' && setSelected(null)}>
        {interactive
          ? sources.map((src) => {
              const n = destsFor(src).length;
              return (
                <button
                  key={`s${String(src)}`}
                  type="button"
                  data-src
                  aria-pressed={selected === src}
                  onClick={() => (selected === src ? setSelected(null) : select(src))}
                  onFocus={() => setFocusSrc(src)}
                  onBlur={() => setFocusSrc((f) => (f === src ? null : f))}
                >
                  {`Checker on ${whereText(src, seatV)}. ${n} ${n === 1 ? 'move' : 'moves'}.`}
                </button>
              );
            })
          : null}
        {interactive && selected !== null
          ? destsFor(selected).map((d) => (
              <button
                key={`d${String(d.to)}`}
                type="button"
                onClick={() => {
                  kbdMoved.current = true;
                  commit({ from: selected as number | 'bar', to: d.to as number | 'off', die: d.die });
                }}
                onFocus={() => setFocusDest(d.to)}
                onBlur={() => setFocusDest((f) => (f === d.to ? null : f))}
              >
                {`Move to ${whereText(d.to, seatV)} with the ${d.die}.`}
              </button>
            ))
          : null}
      </div>

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

function Swatch({ seat }: { seat: number }) {
  return (
    <span
      className="inline-block size-3 rounded-full"
      style={{ background: seat === 0 ? 'radial-gradient(circle at 35% 30%, #fffbf2, #cdbe9f)' : 'radial-gradient(circle at 35% 30%, #47527a, #0d1222)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.35)' }}
      aria-hidden
    />
  );
}
