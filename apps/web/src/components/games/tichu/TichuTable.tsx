'use client';
/**
 * Cold Call Tichu table. Renders the server view and sends intents only; the next view is the truth.
 * Seats are drawn relative to the viewer: me at the bottom, (me+1) on the left, partner (me+2)
 * on top, (me+3) on the right. That matches the engine, where "left" for passing is seat+1.
 */
import { AnimatePresence, MotionConfig, motion, useAnimate, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { TichuMove, TichuView, TrickPlay } from '@coldcall/games';
import { isBomb, type CardId } from '@coldcall/games/tichu-combos';
import type { BoardProps } from '../types';
import { InfoTip } from '@/components/ui';
import { haptic, play as playSound } from '@/lib/sound';
import { CardBack, CardFace, cardName } from './cards';
import { bombMoves, evaluateSelection, rankShort, rankWord, sortHand } from './legality';
import { ScoreSummary } from './ScoreSummary';

export type TichuTableProps = BoardProps<TichuView, TichuMove>;
type Round = TichuView['rounds'][number];
type Pos = 0 | 1 | 2 | 3; // 0 me (bottom), 1 left, 2 top (partner), 3 right

const ORD = ['1st', '2nd', '3rd', '4th'];
const playKey = (p: TrickPlay) => `${p.seat}:${p.cards.join('.')}`;
const lastTrickKey = (v: TichuView) => (v.lastTrick ? `${v.lastTrick.winner}|${v.lastTrick.plays.map(playKey).join('|')}` : '');
const SPRING = { type: 'spring' as const, stiffness: 520, damping: 40, mass: 0.8 };

function useViewportHeight() {
  const [h, setH] = useState(844);
  useLayoutEffect(() => {
    const read = () => setH(window.visualViewport?.height ?? window.innerHeight);
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);
  return h;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(390);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => e && setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function TichuTable(props: TichuTableProps) {
  const { view, legal, mySeat, seatNames, onMove, busy, settings, hint, error } = props;
  const spectator = mySeat === null;
  const me = mySeat ?? 0;
  const seatAt = (pos: number) => (me + pos) % 4;
  const posOf = (seat: number) => ((seat - me + 4) % 4) as Pos;
  const myTeam = me % 2;
  const name = useCallback((s: number) => (s === me && !spectator ? 'You' : seatNames[s] ?? `Seat ${s + 1}`), [me, spectator, seatNames]);
  const reduce = useReducedMotion();
  const sfx = useCallback(
    (n: Parameters<typeof playSound>[0]) => {
      if (settings.sound) playSound(n);
    },
    [settings.sound],
  );

  const [rootRef, W] = useWidth<HTMLDivElement>();
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const narrow = W < 640;
  const VH = useViewportHeight();
  const short = narrow && VH < 760;
  const sideW = narrow ? 80 : 160;
  const centreW = Math.max(200, W - sideW * 2);

  /* ---------- local UI state ---------- */
  const [selected, setSelected] = useState<CardId[]>([]);
  const [sortBy, setSortBy] = useState<'rank' | 'suit'>('rank');
  const [wish, setWish] = useState<number | null>(null);
  const [slots, setSlots] = useState<(CardId | null)[]>([null, null, null]);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [confirmTichu, setConfirmTichu] = useState(false);
  const [summary, setSummary] = useState<Round | null>(null);
  const [recvShow, setRecvShow] = useState(false);
  const [bubbles, setBubbles] = useState<Record<number, { text: string; k: number }>>({});
  const [announce, setAnnounce] = useState('');
  const [flash, setFlash] = useState(0);
  const [focusIdx, setFocusIdx] = useState(0);
  const cardRefs = useRef(new Map<CardId, HTMLButtonElement>());
  const slotRefs = useRef<(HTMLButtonElement | null)[]>([null, null, null]);
  const dragged = useRef(false);
  const handRef = useRef<HTMLDivElement>(null);
  const keyFocus = useRef(false);

  const passingOpen = view.phase === 'passing' && !view.myPass && !spectator;
  const hand = view.hand;
  const sel = selected.filter((c) => hand.includes(c));
  const slotted = passingOpen ? slots.filter((c): c is CardId => !!c && hand.includes(c)) : [];
  const shownHand = useMemo(() => sortHand(hand.filter((c) => !slotted.includes(c)), sortBy), [hand, slotted.join(), sortBy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset per round.
  useEffect(() => {
    setSelected([]);
    setSlots([null, null, null]);
    setActiveSlot(null);
    setWish(null);
    setConfirmTichu(false);
  }, [view.round]);

  useEffect(() => {
    if (!confirmTichu) return;
    const t = setTimeout(() => setConfirmTichu(false), 3500);
    return () => clearTimeout(t);
  }, [confirmTichu]);

  /* ---------- react to new views: sounds, bubbles, announcements, effects ---------- */
  const prevRef = useRef<TichuView | null>(null);
  const bubble = useCallback((seat: number, text: string) => {
    setBubbles((b) => ({ ...b, [seat]: { text, k: Date.now() + Math.random() } }));
  }, []);
  useEffect(() => {
    const ids = Object.keys(bubbles);
    if (!ids.length) return;
    const t = setTimeout(() => setBubbles({}), 1600);
    return () => clearTimeout(t);
  }, [bubbles]);

  const shake = useCallback(() => {
    setFlash((f) => f + 1);
    if (!reduce && scope.current) void animate(scope.current, { x: [0, -7, 6, -4, 3, 0] }, { duration: 0.42 });
  }, [animate, reduce, scope]);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = view;
    if (!prev) {
      sfx('deal');
      return;
    }
    const msgs: string[] = [];
    if (view.rounds.length > prev.rounds.length) {
      const r = view.rounds[view.rounds.length - 1]!;
      setSummary(r);
      const us = r.total[myTeam]!;
      const them = r.total[1 - myTeam]!;
      msgs.push(`Round ${r.round} over. You and Partner scored ${us}, Opponents scored ${them}.`);
      if (view.result) {
        const won = view.result.winners.some((s) => s % 2 === myTeam);
        sfx(won ? 'win' : 'lose');
        haptic(won ? 'strong' : 'light');
        msgs.push(won ? 'You and Partner win the match.' : 'Opponents win the match.');
      }
    }
    if (view.round !== prev.round) sfx('deal');
    if (view.phase === 'passing' && prev.phase === 'grand') sfx('deal');

    const seen = new Set([...prev.trick.map(playKey), ...(prev.lastTrick?.plays.map(playKey) ?? [])]);
    const sameRound = view.round === prev.round;
    const fresh: TrickPlay[] = [];
    if (sameRound) {
      if (lastTrickKey(view) !== lastTrickKey(prev) && view.lastTrick) for (const p of view.lastTrick.plays) if (!seen.has(playKey(p))) fresh.push(p);
      for (const p of view.trick) if (!seen.has(playKey(p)) && !fresh.some((f) => playKey(f) === playKey(p))) fresh.push(p);
    }
    let bombed = false;
    for (const p of fresh) {
      const bomb = isBomb(p.combo);
      bombed ||= bomb;
      const who = name(p.seat);
      if (p.combo.type === 'dog') msgs.push(`${who} played the Dog. The lead goes to ${p.seat === me ? 'your partner' : `${name((p.seat + 2) % 4)}`}.`);
      else msgs.push(`${who} ${bomb ? 'bombed with' : 'played'} ${p.label}${p.wish ? `, and wished for ${rankWord(p.wish)}` : ''}.`);
      if (bomb) bubble(p.seat, 'Bomb!');
    }
    if (fresh.length) {
      sfx(bombed ? 'bomb' : 'card');
      if (bombed) {
        haptic('strong');
        shake();
      } else if (fresh.some((p) => p.seat === me)) haptic('light');
    }
    // passes
    if (sameRound && prev.phase === 'play' && prev.turn !== null && fresh.length === 0) {
      const collected = prev.trick.length > 0 && view.trick.length === 0;
      if (view.passCount > prev.passCount || collected) {
        bubble(prev.turn, 'Pass');
        msgs.push(`${name(prev.turn)} passed.`);
      }
    }
    if (sameRound && lastTrickKey(view) !== lastTrickKey(prev) && view.lastTrick && view.lastTrick.plays[0]?.combo.type !== 'dog') {
      msgs.push(`${view.lastTrick.winner === me ? 'You win' : `${name(view.lastTrick.winner)} wins`} the trick.`);
    }
    for (let s = 0; s < 4; s++) {
      if (view.tichuCalls[s] && !prev.tichuCalls[s]) {
        bubble(s, 'Tichu!');
        msgs.push(`${name(s)} called Tichu.`);
      }
      if (view.grandCalls[s] === true && prev.grandCalls[s] !== true) {
        bubble(s, 'Grand Tichu!');
        msgs.push(`${name(s)} called Grand Tichu.`);
      }
    }
    for (const s of view.out) if (!prev.out.includes(s) && sameRound) msgs.push(`${name(s)} ${s === me ? 'are' : 'is'} out, ${ORD[view.out.indexOf(s)]}.`);
    if (view.phase === 'play' && prev.phase === 'passing') {
      setRecvShow(true);
      msgs.push('Cards passed. Check what you received.');
    }
    if (view.dragonPending && !prev.dragonPending) {
      msgs.push(view.dragonPending.winner === me ? 'You won the Dragon trick. Choose an opponent to give it to.' : `${name(view.dragonPending.winner)} is giving away the Dragon trick.`);
    }
    if (!spectator && view.turn === me && (prev.turn !== me || fresh.length) && view.phase === 'play') msgs.push('Your turn.');
    if (msgs.length) setAnnounce(msgs.join(' '));
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!recvShow) return;
    const t = setTimeout(() => setRecvShow(false), 5000);
    return () => clearTimeout(t);
  }, [recvShow]);

  /* ---------- derived ---------- */
  const canGrand = legal.some((m) => m.type === 'grand');
  const canTichu = legal.some((m) => m.type === 'tichu');
  const canPass = legal.some((m) => m.type === 'pass');
  const bombs = useMemo(() => bombMoves(legal), [legal]);
  const myTurn = !spectator && view.turn === me && view.phase === 'play';
  const selection = useMemo(() => evaluateSelection(view, legal, mySeat, sel), [view, legal, mySeat, sel.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const hintCards = hint && hint.type === 'play' ? hint.cards : [];
  const sweepTo = view.lastTrick ? posOf(view.lastTrick.winner) : null;
  const hideHand = !!summary;
  const raised = passingOpen ? sel.slice(0, 1) : sel;

  /* ---------- actions ---------- */
  const send = (m: TichuMove) => {
    if (busy) return;
    onMove(m);
  };
  const submitPlay = () => {
    if (selection.kind !== 'ok') {
      if (selection.kind === 'bad') sfx('error');
      return;
    }
    const m = { ...selection.move, ...(selection.mahjong && wish ? { wish } : {}) };
    send(m);
    setSelected([]);
    setWish(null);
  };
  const doPass = () => {
    if (!canPass) return;
    send({ type: 'pass' });
    setSelected([]);
  };
  const submitPassCards = () => {
    if (slots.some((s) => !s)) return;
    sfx('card');
    send({ type: 'pass_cards', cards: [slots[0]!, slots[1]!, slots[2]!] });
  };
  const placeInSlot = (card: CardId, idx: number) => {
    setSlots((s) => {
      const n = s.map((c) => (c === card ? null : c));
      n[idx] = card;
      const next = n.findIndex((c) => !c);
      setActiveSlot(next >= 0 && activeSlot !== null ? next : null);
      return n;
    });
    setSelected([]);
    sfx('card');
    haptic('light');
  };
  const onCardTap = (card: CardId) => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    if (spectator) return;
    if (passingOpen) {
      if (activeSlot !== null) return placeInSlot(card, activeSlot);
      setSelected((s) => (s[0] === card ? [] : [card]));
      sfx('tap');
      return;
    }
    setSelected((s) => (s.includes(card) ? s.filter((c) => c !== card) : [...s, card]));
    sfx('tap');
  };
  const onSlotTap = (idx: number) => {
    const pick = sel[0];
    if (pick) return placeInSlot(pick, idx);
    if (slots[idx]) {
      setSlots((s) => s.map((c, i) => (i === idx ? null : c)));
      setActiveSlot(idx);
      return;
    }
    setActiveSlot((a) => (a === idx ? null : idx));
  };
  const onDragEnd = (card: CardId, pt: { x: number; y: number }) => {
    dragged.current = true;
    setTimeout(() => (dragged.current = false), 50);
    const x = pt.x - window.scrollX;
    const y = pt.y - window.scrollY;
    const idx = slotRefs.current.findIndex((el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return x >= r.left - 12 && x <= r.right + 12 && y >= r.top - 12 && y <= r.bottom + 12;
    });
    if (idx >= 0) placeInSlot(card, idx);
  };
  const onBomb = () => {
    if (selection.kind === 'ok' && selection.bomb) return submitPlay();
    if (bombs[0]) setSelected([...bombs[0].cards]);
  };

  const onHandKey = (e: ReactKeyboardEvent) => {
    const n = shownHand.length;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const i = Math.max(0, Math.min(n - 1, focusIdx + (e.key === 'ArrowRight' ? 1 : -1)));
      setFocusIdx(i);
      cardRefs.current.get(shownHand[i]!)?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (passingOpen) submitPassCards();
      else submitPlay();
    } else if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      doPass();
    }
  };

  // Keep keyboard focus in the hand when the focused card leaves it (played or passed).
  useEffect(() => {
    if (!keyFocus.current || !shownHand.length) return;
    const active = document.activeElement;
    const lost = !active || active === document.body || !active.isConnected;
    if (!lost) return;
    const i = Math.min(focusIdx, shownHand.length - 1);
    setFocusIdx(i);
    cardRefs.current.get(shownHand[i]!)?.focus();
  }, [shownHand.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- layout numbers ---------- */
  const handW = Math.min(W - 30, 880);
  // Short phones (iPhone SE, mini): smaller cards so the whole table fits on one screen.
  const cardW = Math.round(Math.max(short ? 58 : 64, Math.min(short ? 66 : 116, handW / 4.6)));
  const cardH = Math.round(cardW * 1.4);
  const n = shownHand.length;
  const step = n > 1 ? Math.min(cardW * 0.6, (handW - cardW) / (n - 1)) : 0;
  const spread = (n - 1) * step + cardW;
  const startX = (handW - spread) / 2;
  const raise = Math.round(cardH * 0.17);
  const trickW = Math.round(Math.max(54, Math.min(92, centreW / 3.9)));

  // deal tracking: cards not in the previously rendered hand fly in from the centre
  const prevHandRef = useRef<CardId[]>([]);
  const newIds = hideHand ? [] : shownHand.filter((c) => !prevHandRef.current.includes(c));
  useEffect(() => {
    if (!hideHand) prevHandRef.current = hand;
  });

  const scoreUs = myTeam === 0 ? view.scores.team0 : view.scores.team1;
  const scoreThem = myTeam === 0 ? view.scores.team1 : view.scores.team0;
  const top = view.top;
  const turnName = view.turn !== null ? name(view.turn) : null;

  /* ---------- render ---------- */
  return (
    <MotionConfig reducedMotion="user">
      <div ref={rootRef} className="relative h-full w-full">
        <div
          ref={scope}
          className={`relative flex h-full w-full flex-col overflow-hidden rounded-[28px] text-text ${short ? 'min-h-[calc(100dvh-100px)]' : 'min-h-[600px]'}`}
          style={TABLE_STYLE}
        >
          <TableInlay />
          <AnimatePresence>
            {flash ? (
              <motion.div key={flash} className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center overflow-hidden" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 1.1, ease: 'easeIn' }}>
                <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 45%, rgba(127, 227, 255,.55), rgba(90, 143, 224,.35) 35%, transparent 70%)' }} />
                {!reduce ? (
                  <motion.div
                    className="absolute rounded-full border-4 border-primary"
                    style={{ width: 120, height: 120, boxShadow: '0 0 40px rgba(127, 227, 255,.8), inset 0 0 30px rgba(90, 143, 224,.7)' }}
                    initial={{ scale: 0.3, opacity: 1 }}
                    animate={{ scale: 6, opacity: 0 }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                ) : null}
                <motion.span
                  className="relative text-[56px] font-black uppercase italic tracking-tight text-primary sm:text-[88px]"
                  style={{ textShadow: '0 0 18px rgba(127, 227, 255,.9), 0 0 42px rgba(90, 143, 224,.9)' }}
                  initial={reduce ? { opacity: 1 } : { scale: 0.4, rotate: -8 }}
                  animate={reduce ? { opacity: 1 } : { scale: [0.4, 1.25, 1], rotate: [-8, 3, 0] }}
                  transition={{ duration: 0.45 }}
                >
                  Bomb!
                </motion.span>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* header strip */}
          <div className="relative z-10 flex items-center justify-between gap-2 px-3 pt-2.5 sm:px-5 sm:pt-4">
            <ScoreBlock label="You and Partner" value={scoreUs} tone="us" />
            <div className="flex flex-col items-center text-center">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-2">Round {view.round}</span>
              <span className="inline-flex items-center text-xs text-text-2">
                First to {view.targetScore}
                <InfoTip
                  label="How scoring works"
                  text={`Teams score the cards they win: 5s are worth 5, 10s and Kings 10, the Dragon 25 and the Phoenix minus 25. A Tichu call adds or loses 100, a Grand Tichu 200. First team to ${view.targetScore} wins.`}
                />
              </span>
            </div>
            <ScoreBlock label="Opponents" value={scoreThem} tone="them" align="right" />
          </div>

          {/* partner */}
          <div className="relative z-10 flex justify-center pt-1">
            <SeatPanel pos={2} seat={seatAt(2)} view={view} name={name(seatAt(2))} bubble={bubbles[seatAt(2)]} narrow={narrow} short={short} />
          </div>

          {/* middle */}
          <div className="relative z-10 flex min-h-0 flex-1">
            <div className="flex shrink-0 items-center justify-center" style={{ width: sideW }}>
              <SeatPanel pos={1} seat={seatAt(1)} view={view} name={name(seatAt(1))} bubble={bubbles[seatAt(1)]} narrow={narrow} short={short} />
            </div>
            <div className="relative min-w-0 flex-1">
              {/* wish and last trick */}
              <div className="absolute inset-x-0 top-1 z-20 flex items-start justify-between gap-2 px-1">
                <LastTrickGhost view={view} name={name} />
                {view.wish ? (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-surface/85 py-1 pl-3 pr-1 text-sm font-semibold shadow-card backdrop-blur"
                  >
                    Wish: {rankShort(view.wish)}
                    <InfoTip label="About the wish" text={`The Mahjong wished for ${rankWord(view.wish)}. Whoever has one must play it when they can, until someone does.`} />
                  </motion.div>
                ) : (
                  <span />
                )}
              </div>

              {/* trick */}
              <div className="absolute inset-0 flex items-center justify-center">
                <AnimatePresence custom={sweepTo}>
                  {view.trick.map((p, i) => {
                    const depth = view.trick.length - 1 - i;
                    if (depth > 3) return null;
                    return (
                      <TrickLayer key={playKey(p)} play={p} depth={depth} from={posOf(p.seat)} cardW={trickW} maxW={centreW - 16} reduce={!!reduce} />
                    );
                  })}
                </AnimatePresence>
              </div>
              <AnimatePresence>
                {top ? (
                  <motion.div
                    key={playKey(top)}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="pointer-events-none absolute inset-x-0 z-20 flex flex-col items-center gap-0.5"
                    style={{ top: `calc(50% + ${Math.round(trickW * 0.7) + 10}px)` }}
                  >
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold shadow-card ${
                        isBomb(top.combo) ? 'bg-loss text-white' : 'bg-surface/90 text-text backdrop-blur'
                      }`}
                    >
                      {isBomb(top.combo) ? <BombIcon /> : null}
                      {top.label}
                    </span>
                    <span className="text-xs text-text-2">
                      {top.seat === me && !spectator ? 'Played by you' : `Played by ${name(top.seat)}`}
                      {view.passCount ? `. ${view.passCount} passed` : ''}
                    </span>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {/* phase prompts in the centre */}
              <CentrePrompt
                view={view}
                me={me}
                spectator={spectator}
                name={name}
                canGrand={canGrand}
                passingOpen={passingOpen}
                slots={slots}
                activeSlot={activeSlot}
                slotRefs={slotRefs}
                onSlotTap={onSlotTap}
                pickActive={passingOpen && sel.length > 0}
                recvShow={recvShow && !hideHand}
                onCloseRecv={() => setRecvShow(false)}
                trickW={trickW}
                turnName={turnName}
              />
            </div>
            <div className="flex shrink-0 items-center justify-center" style={{ width: sideW }}>
              <SeatPanel pos={3} seat={seatAt(3)} view={view} name={name(seatAt(3))} bubble={bubbles[seatAt(3)]} narrow={narrow} short={short} />
            </div>
          </div>

          {/* my strip + actions */}
          {!spectator ? (
            <div className="relative z-20 mx-auto w-full max-w-[680px] px-2 pb-1 sm:px-5">
              <MyStrip view={view} me={me} bubble={bubbles[me]} myTurn={myTurn} sortBy={sortBy} setSortBy={setSortBy} />
              <ActionBar
                view={view}
                me={me}
                name={name}
                busy={!!busy}
                error={error ?? null}
                canGrand={canGrand}
                canTichu={canTichu}
                canPass={canPass}
                bombs={bombs.length > 0}
                myTurn={myTurn}
                selection={selection}
                selCount={sel.length}
                passingOpen={passingOpen}
                slotsFilled={slots.every(Boolean)}
                wish={wish}
                setWish={setWish}
                confirmTichu={confirmTichu}
                onTichu={() => {
                  if (!confirmTichu) return setConfirmTichu(true);
                  setConfirmTichu(false);
                  send({ type: 'tichu' });
                }}
                onGrand={(call) => send({ type: 'grand', call })}
                onPlay={submitPlay}
                onPass={doPass}
                onBomb={onBomb}
                onPassCards={submitPassCards}
                onPickForMe={() => {
                  const m = legal.find((x) => x.type === 'pass_cards');
                  if (m && m.type === 'pass_cards') {
                    setSlots([...m.cards]);
                    setActiveSlot(null);
                    setSelected([]);
                  }
                }}
                onDragon={(to) => send({ type: 'give_dragon', to })}
                onClear={() => setSelected([])}
              />
            </div>
          ) : null}

          {/* hand */}
          {!spectator ? (
            <div className="relative z-20 flex justify-center pb-[max(10px,env(safe-area-inset-bottom))]">
              <div
                role="group"
                aria-label="Your hand. Arrow keys move, Space selects, Enter plays, P passes."
                ref={handRef}
                onKeyDown={onHandKey}
                onFocus={() => (keyFocus.current = true)}
                onBlur={(e) => {
                  if (e.relatedTarget && !handRef.current?.contains(e.relatedTarget as Node)) keyFocus.current = false;
                }}
                className="relative"
                style={{ width: handW, height: cardH + raise + 14 }}
              >
                {!hideHand
                  ? shownHand.map((id, i) => {
                      const t = n > 1 ? i / (n - 1) - 0.5 : 0;
                      const rot = t * Math.min(10, n * 0.75);
                      const yArc = t * t * 4 * Math.min(12, n * 0.8);
                      const up = raised.includes(id);
                      const isNew = newIds.includes(id);
                      const dealIdx = newIds.indexOf(id);
                      const fromReceived = recvShow && view.received?.some((r) => r.card === id);
                      return (
                        <motion.button
                          key={id}
                          ref={(el) => {
                            if (el) cardRefs.current.set(id, el);
                            else cardRefs.current.delete(id);
                          }}
                          type="button"
                          tabIndex={i === Math.min(focusIdx, n - 1) ? 0 : -1}
                          aria-pressed={up}
                          aria-label={`${cardName(id)}${up ? ', selected' : ''}`}
                          onFocus={() => setFocusIdx(i)}
                          onClick={() => onCardTap(id)}
                          drag={passingOpen && !reduce}
                          dragSnapToOrigin
                          dragElastic={0.6}
                          whileDrag={{ scale: 1.08, zIndex: 60 }}
                          onDragStart={() => {
                            dragged.current = true;
                          }}
                          onDragEnd={(_, info) => onDragEnd(id, info.point)}
                          initial={
                            isNew
                              ? { x: handW / 2 - cardW / 2, y: -cardH * 2.2, rotate: 0, opacity: 0, scale: 0.7 }
                              : { opacity: 0, y: yArc - 30, x: startX + i * step, rotate: rot }
                          }
                          animate={{ x: startX + i * step, y: yArc - (up ? raise : 0), rotate: rot, opacity: 1, scale: 1 }}
                          transition={{ ...SPRING, delay: isNew && dealIdx >= 0 ? dealIdx * 0.03 : 0 }}
                          className="absolute left-0 top-[18px] touch-none select-none rounded-[8%/6%] outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                          style={{
                            width: cardW,
                            height: cardH,
                            zIndex: i + 1,
                            transformOrigin: '50% 140%',
                            boxShadow: up
                              ? '0 0 0 2px var(--primary), 0 10px 24px rgba(0,0,0,.4)'
                              : fromReceived
                                ? '0 0 0 2px var(--primary), 0 4px 14px rgba(0,0,0,.35)'
                                : '0 2px 10px rgba(0,0,0,.32)',
                            borderRadius: cardW * 0.08,
                          }}
                        >
                          <CardFace id={id} />
                          {hintCards.includes(id) ? <span className="absolute -top-2 left-1/2 size-2 -translate-x-1/2 rounded-full bg-primary" aria-hidden /> : null}
                          {fromReceived ? (
                            <span className="absolute -top-3 left-1 rounded-full bg-primary px-1.5 py-px text-[10px] font-bold text-primary-ink shadow-card">New</span>
                          ) : null}
                        </motion.button>
                      );
                    })
                  : null}
              </div>
            </div>
          ) : null}

          <AnimatePresence>
            {summary ? <ScoreSummary key={summary.round} round={summary} view={view} myTeam={myTeam} names={[0, 1, 2, 3].map(name)} onClose={() => setSummary(null)} /> : null}
          </AnimatePresence>

          <div aria-live="polite" className="sr-only">
            {announce}
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}

/* ================= pieces ================= */

/**
 * The table is an arena in both page themes: dark felt with a neon edge.
 * Tokens are redefined locally so text, panels and buttons stay readable on the felt.
 */
const FELT_NOISE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .09 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";
const TABLE_STYLE = {
  '--text': '#F4F4FB',
  '--text-2': '#A8A8C4',
  '--surface': '#12121C',
  '--surface-2': '#1D1D2C',
  '--line': '#2C2C42',
  '--primary': '#7fe3ff',
  '--primary-ink': '#0A0A0F',
  '--accent': '#5a8fe0',
  '--gold': '#f5c542',
  '--win': '#7fe3ff',
  '--loss': '#FF4D6D',
  '--shadow-card': '0 2px 14px rgba(0,0,0,.5)',
  '--shadow-modal': '0 24px 64px rgba(0,0,0,.65)',
  background: `${FELT_NOISE}, radial-gradient(110% 80% at 50% 45%, #1E1842 0%, #131030 40%, #0B0A18 75%, #07070C 100%)`,
  border: '1.5px solid rgba(90, 143, 224,.75)',
  boxShadow: '0 0 0 1px rgba(90, 143, 224,.35), 0 0 34px rgba(90, 143, 224,.35), inset 0 0 0 1px rgba(127, 227, 255,.12), inset 0 0 80px rgba(90, 143, 224,.18)',
  colorScheme: 'dark',
} as React.CSSProperties;

function TableInlay() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden>
      <defs>
        <filter id="tichu-neon" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.6" />
        </filter>
      </defs>
      <ellipse cx="50" cy="48" rx="45" ry="34" fill="none" stroke="#5a8fe0" strokeOpacity="0.55" strokeWidth="3" vectorEffect="non-scaling-stroke" filter="url(#tichu-neon)" />
      <ellipse cx="50" cy="48" rx="45" ry="34" fill="none" stroke="#A58DFF" strokeOpacity="0.7" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <ellipse cx="50" cy="48" rx="43.3" ry="32.4" fill="none" stroke="#7fe3ff" strokeOpacity="0.18" strokeWidth="1" strokeDasharray="3 7" vectorEffect="non-scaling-stroke" />
      <ellipse cx="50" cy="48" rx="28" ry="19" fill="#5a8fe0" fillOpacity="0.07" />
    </svg>
  );
}

function ScoreBlock({ label, value, tone, align = 'left' }: { label: string; value: number; tone: 'us' | 'them'; align?: 'left' | 'right' }) {
  return (
    <div
      className={`flex min-w-0 flex-col rounded-2xl px-3 py-1.5 shadow-card ${align === 'right' ? 'items-end' : 'items-start'}`}
      style={
        tone === 'us'
          ? { background: 'linear-gradient(135deg, #D8FF6A, #9FE01F)', color: '#0A0A0F', boxShadow: '0 0 22px rgba(127, 227, 255,.35)' }
          : { background: 'linear-gradient(135deg, #FF6A86, #D9264B)', color: '#FFFFFF', boxShadow: '0 0 22px rgba(255,77,109,.35)' }
      }
    >
      <span className="whitespace-nowrap text-[10px] font-extrabold uppercase tracking-[0.14em] opacity-80 sm:text-[11px]">{label}</span>
      <motion.span key={value} initial={{ opacity: 0.4, y: -3 }} animate={{ opacity: 1, y: 0 }} className="tabular text-[26px] font-black italic leading-none sm:text-[32px]">
        {value}
      </motion.span>
    </div>
  );
}

const DIRS: Record<Pos, { x: number; y: number }> = {
  0: { x: 0, y: 260 },
  1: { x: -240, y: 0 },
  2: { x: 0, y: -240 },
  3: { x: 240, y: 0 },
};

function TrickLayer({ play, depth, from, cardW, maxW, reduce }: { play: TrickPlay; depth: number; from: Pos; cardW: number; maxW: number; reduce: boolean }) {
  const n = play.cards.length;
  const step = n > 1 ? Math.min(cardW * 0.42, (maxW - cardW) / (n - 1)) : 0;
  const w = cardW + (n - 1) * step;
  const h = Math.round(cardW * 1.4);
  const d = DIRS[from];
  return (
    <motion.div
      className="absolute"
      style={{ width: w, height: h, zIndex: 10 - depth }}
      initial={reduce ? { opacity: 0 } : { x: d.x, y: d.y, opacity: 0, scale: 0.85, rotate: from === 1 ? -8 : from === 3 ? 8 : 0 }}
      animate={{ x: 0, y: -depth * Math.round(cardW * 0.22), opacity: depth ? 0.55 - depth * 0.1 : 1, scale: 1 - depth * 0.07, rotate: 0 }}
      variants={{
        exit: (to: Pos | null) => (to === null || reduce ? { opacity: 0, transition: { duration: 0.2 } } : { x: DIRS[to].x * 0.8, y: DIRS[to].y * 0.8, opacity: 0, scale: 0.5, transition: { duration: 0.42, ease: [0.4, 0, 0.8, 0.4] } }),
      }}
      exit="exit"
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
    >
      {play.cards.map((c, i) => (
        <div key={c} className="absolute top-0" style={{ left: i * step, width: cardW, height: h, borderRadius: cardW * 0.08, boxShadow: '0 3px 12px rgba(0,0,0,.35)' }}>
          <CardFace id={c} />
        </div>
      ))}
    </motion.div>
  );
}

function BombIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden>
      <circle cx="7" cy="9.5" r="5" />
      <path d="M10.5 5.5 12 4M12.5 2.5l.6-.9M14 4.2l1-.3M13 1.2v-.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function MiniFan({ count, vertical }: { count: number; vertical?: boolean }) {
  const shown = Math.min(count, 5);
  const w = 20;
  const h = 28;
  return (
    <div className="relative" style={{ width: w + (shown - 1) * 4 + 6, height: h + 4 }} aria-hidden>
      {Array.from({ length: shown }, (_, i) => (
        <div
          key={i}
          className="absolute top-0"
          style={{ left: i * 4, width: w, height: h, transform: `rotate(${(i - (shown - 1) / 2) * (vertical ? 5 : 7)}deg)`, transformOrigin: '50% 100%', borderRadius: 3, boxShadow: '0 1px 3px rgba(0,0,0,.4)' }}
        >
          <CardBack mini />
        </div>
      ))}
    </div>
  );
}

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'call' | 'grand' | 'win' }) {
  const cls =
    tone === 'grand'
      ? 'bg-primary text-primary-ink'
      : tone === 'call'
        ? 'border border-primary/60 text-primary bg-surface/70'
        : tone === 'win'
          ? 'bg-win/15 text-win border border-win/40'
          : 'bg-surface-2/80 text-text-2';
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold leading-4 ${cls}`}>{children}</span>;
}

function SeatBadges({ view, seat }: { view: TichuView; seat: number }) {
  const outAt = view.out.indexOf(seat);
  return (
    <>
      {view.grandCalls[seat] ? <Badge tone="grand">Grand Tichu</Badge> : view.tichuCalls[seat] ? <Badge tone="call">Tichu</Badge> : null}
      {outAt >= 0 ? (
        <Badge tone="win">
          <svg viewBox="0 0 16 16" className="size-3" fill="currentColor" aria-hidden>
            <path d="M6.4 11.6 3 8.2l1.1-1.1 2.3 2.3 5.5-5.5L13 5z" />
          </svg>
          Out {ORD[outAt]}
        </Badge>
      ) : null}
    </>
  );
}

function statusLine(view: TichuView, seat: number): string | null {
  if (view.phase === 'grand') return view.grandCalls[seat] === null ? 'Deciding' : 'Ready';
  if (view.phase === 'passing') return view.passed[seat] ? 'Cards ready' : 'Choosing cards';
  return null;
}

function SeatPanel({ pos, seat, view, name, bubble, narrow, short }: { pos: Pos; seat: number; view: TichuView; name: string; bubble?: { text: string; k: number }; narrow: boolean; short?: boolean }) {
  const isTurn = view.toAct.includes(seat) && (view.phase === 'play' || view.phase === 'dragon');
  const partner = pos === 2;
  const count = view.handCounts[seat] ?? 0;
  const status = statusLine(view, seat);
  const tricks = view.tricksTaken[seat] ?? 0;
  const horizontal = pos === 2;
  const avatar = (
    <div className="relative">
      {isTurn ? (
        <motion.span
          className="absolute -inset-1 rounded-full border-2 border-primary"
          animate={{ opacity: [1, 0.35, 1] }}
          transition={{ duration: 1.4, repeat: Infinity }}
          aria-hidden
        />
      ) : null}
      <div
        className={`flex size-10 items-center justify-center rounded-full text-lg font-black sm:size-12 sm:text-xl ${partner ? 'text-[#0A0A0F]' : 'text-white'}`}
        style={{
          background: partner ? 'linear-gradient(135deg, #D8FF6A, #8FD10F)' : 'linear-gradient(135deg, #FF6A86, #C21F44)',
          boxShadow: `0 0 0 2px #0B0A18, 0 0 0 3.5px ${partner ? '#7fe3ff' : '#FF4D6D'}, 0 0 16px ${partner ? 'rgba(127, 227, 255,.45)' : 'rgba(255,77,109,.45)'}`,
        }}
      >
        {name.slice(0, 1)}
      </div>
      <AnimatePresence>
        {bubble ? (
          <motion.span
            key={bubble.k}
            initial={{ opacity: 0, y: 4, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            className={`absolute -top-3 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold shadow-card ${
              bubble.text === 'Bomb!' ? 'bg-loss text-white' : bubble.text === 'Pass' ? 'bg-surface-2 text-text-2' : 'bg-primary text-primary-ink'
            }`}
          >
            {bubble.text}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
  const meta = (
    <div className={`flex min-w-0 flex-col ${horizontal ? 'items-start' : 'items-center text-center'}`}>
      <span className="max-w-[9rem] truncate text-sm font-semibold leading-tight">{name}</span>
      <span
        className={`mt-0.5 rounded-full px-1.5 py-px text-[10px] font-extrabold uppercase leading-[13px] tracking-[0.08em] ${narrow && !partner && !short ? 'rounded-lg py-0.5 text-center' : 'whitespace-nowrap'} ${partner ? 'bg-[#7fe3ff] text-[#0A0A0F]' : 'bg-[#FF4D6D] text-white'}`}
      >
        {partner ? 'Partner' : short ? 'Opponent' : narrow ? (
          <>
            Opponent
            <br />
            {pos === 1 ? 'left' : 'right'}
          </>
        ) : pos === 1 ? 'Opponent left' : 'Opponent right'}
      </span>
      <div className={`mt-0.5 flex flex-wrap gap-1 ${horizontal ? '' : 'justify-center'}`}>
        <SeatBadges view={view} seat={seat} />
      </div>
    </div>
  );
  const stack = (
    <div className={`flex items-center gap-1.5 ${horizontal ? '' : 'flex-col'}`}>
      {count > 0 ? <MiniFan count={count} vertical={!horizontal} /> : null}
      <div className={`flex flex-col ${horizontal ? 'items-start' : 'items-center'} text-[11px] leading-tight text-text-2`}>
        <span className="tabular">
          <span className="font-bold text-text">{count}</span> {count === 1 ? 'card' : 'cards'}
        </span>
        <span className="tabular">
          {tricks} {tricks === 1 ? 'trick' : 'tricks'}
        </span>
      </div>
    </div>
  );
  return (
    <div
      className={`flex ${horizontal ? 'items-center gap-2.5' : `flex-col items-center ${short ? 'gap-1' : 'gap-1.5'}`} rounded-card border px-2 ${short ? 'py-1' : 'py-1.5'} transition-all duration-200 ${isTurn ? 'border-primary bg-primary/10' : 'border-transparent'}`}
      style={isTurn ? { boxShadow: '0 0 0 1px rgba(127, 227, 255,.4), 0 0 26px rgba(127, 227, 255,.35), inset 0 0 18px rgba(127, 227, 255,.12)' } : undefined}
      aria-label={`${name}, ${partner ? 'partner' : pos === 1 ? 'opponent on your left' : 'opponent on your right'}, ${count} cards${isTurn ? ', their turn' : ''}`}
    >
      {avatar}
      {meta}
      {stack}
      {status ? <span className="text-[11px] font-semibold text-text-2">{status}</span> : null}
    </div>
  );
}

function MyStrip({ view, me, bubble, myTurn, sortBy, setSortBy }: { view: TichuView; me: number; bubble?: { text: string; k: number }; myTurn: boolean; sortBy: 'rank' | 'suit'; setSortBy: (s: 'rank' | 'suit') => void }) {
  const tricks = view.tricksTaken[me] ?? 0;
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <AnimatePresence mode="wait">
          {myTurn ? (
            <motion.span
              key="turn"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-ink"
            >
              <span className="size-1.5 animate-pulse rounded-full bg-primary-ink" aria-hidden />
              Your turn
            </motion.span>
          ) : bubble ? (
            <motion.span key={bubble.k} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-bold">
              {bubble.text}
            </motion.span>
          ) : null}
        </AnimatePresence>
        <SeatBadges view={view} seat={me} />
        <span className="tabular whitespace-nowrap text-[11px] text-text-2">
          {tricks} {tricks === 1 ? 'trick' : 'tricks'}
        </span>
      </div>
      <div role="radiogroup" aria-label="Sort your cards" className="flex shrink-0 rounded-full bg-surface-2/80 p-0.5 text-[11px] font-semibold">
        {(['rank', 'suit'] as const).map((k) => (
          <button
            key={k}
            role="radio"
            aria-checked={sortBy === k}
            onClick={() => setSortBy(k)}
            className={`h-7 rounded-full px-2.5 transition ${sortBy === k ? 'bg-surface text-text shadow-card' : 'text-text-2 hover:text-text'}`}
          >
            By {k}
          </button>
        ))}
      </div>
    </div>
  );
}

function LastTrickGhost({ view, name }: { view: TichuView; name: (s: number) => string }) {
  const lt = view.lastTrick;
  if (!lt) return <span />;
  const last = lt.plays[lt.plays.length - 1];
  if (!last) return <span />;
  const cards = last.cards.slice(0, 4);
  return (
    <div className="flex items-center gap-2 rounded-chip bg-surface/50 px-1.5 py-1 opacity-80 backdrop-blur-sm" title="Last trick">
      <div className="relative" style={{ width: 24 + (cards.length - 1) * 9, height: 34 }}>
        {cards.map((c, i) => (
          <div key={c} className="absolute top-0" style={{ left: i * 9, width: 24, height: 34, borderRadius: 3, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }}>
            <CardFace id={c} />
          </div>
        ))}
      </div>
      <span className="text-[11px] leading-tight text-text-2">
        Last trick
        <br />
        <span className="font-semibold text-text">{lt.plays[0]?.combo.type === 'dog' ? 'Dog' : name(lt.winner)}</span>
      </span>
    </div>
  );
}

function CentrePrompt(p: {
  view: TichuView;
  me: number;
  spectator: boolean;
  name: (s: number) => string;
  canGrand: boolean;
  passingOpen: boolean;
  slots: (CardId | null)[];
  activeSlot: number | null;
  slotRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
  onSlotTap: (i: number) => void;
  pickActive: boolean;
  recvShow: boolean;
  onCloseRecv: () => void;
  trickW: number;
  turnName: string | null;
}) {
  const { view, me, name } = p;
  let content: React.ReactNode = null;
  let key = 'none';
  if (view.phase === 'grand' && !p.spectator) {
    key = 'grand';
    content = (
      <Panel>
        <p className="text-[22px] font-black uppercase italic leading-tight tracking-tight">{p.canGrand ? 'Grand Tichu?' : 'Waiting for the others'}</p>
        <p className="mt-1 text-sm text-text-2">
          {p.canGrand
            ? 'You see 8 of your 14 cards. Call Grand Tichu only if you are sure you can go out first.'
            : 'Everyone is looking at their first 8 cards. The last 6 are dealt next.'}
        </p>
      </Panel>
    );
  } else if (view.phase === 'passing' && !p.spectator) {
    key = 'passing';
    const sent = view.myPass;
    const labels = ['Left', 'Partner', 'Right'];
    content = (
      <div className="flex flex-col items-center gap-2 px-2 text-center">
        <p className="text-sm font-semibold">
          {sent ? 'Cards ready. Waiting for the others' : p.pickActive ? 'Now tap a player to give it to' : 'Give one card to each player'}
        </p>
        <div className="flex items-end justify-center gap-2 sm:gap-4">
          {[0, 1, 2].map((i) => {
            const card = sent ? sent[i]! : p.slots[i];
            const target = (me + 1 + i) % 4;
            const glow = !sent && !card && (p.activeSlot === i || (p.pickActive && !card));
            return (
              <button
                key={i}
                type="button"
                ref={(el) => {
                  p.slotRefs.current[i] = el;
                }}
                disabled={!!sent}
                onClick={() => p.onSlotTap(i)}
                aria-label={`${labels[i]}, ${name(target)}${card ? `, ${cardName(card)}. Tap to take it back` : ', empty'}`}
                className="group flex flex-col items-center gap-1"
              >
                <motion.div
                  className={`relative flex items-center justify-center overflow-hidden ${card ? '' : 'border-2 border-dashed'} ${glow ? 'border-primary bg-primary/10' : 'border-line bg-surface/30'}`}
                  style={{ width: p.trickW, height: Math.round(p.trickW * 1.4), borderRadius: p.trickW * 0.08, boxShadow: card ? '0 3px 12px rgba(0,0,0,.35)' : undefined, opacity: sent ? 0.7 : 1 }}
                  animate={glow ? { scale: [1, 1.04, 1] } : { scale: 1 }}
                  transition={glow ? { duration: 1.2, repeat: Infinity } : { duration: 0.15 }}
                >
                  {card ? <CardFace id={card} /> : <span className="text-2xl font-light text-text-2">+</span>}
                </motion.div>
                <span className={`text-xs font-semibold ${i === 1 ? 'text-primary' : 'text-text'}`}>{labels[i]}</span>
                <span className="-mt-1 max-w-[5.5rem] truncate text-[11px] text-text-2">{name(target)}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  } else if (view.phase === 'dragon' && view.dragonPending) {
    key = 'dragon';
    const mine = view.dragonPending.winner === me && !p.spectator;
    content = (
      <Panel>
        <div className="mx-auto mb-2" style={{ width: 44, height: 62 }}>
          <CardFace id="DRAGON" />
        </div>
        <p className="text-lg font-black uppercase italic leading-tight tracking-tight">{mine ? 'You won the Dragon trick' : `${name(view.dragonPending.winner)} won the Dragon trick`}</p>
        <p className="mt-1 text-sm text-text-2">{mine ? 'Give it to an opponent. Its points count for them.' : 'They are choosing which opponent gets it.'}</p>
      </Panel>
    );
  } else if (p.recvShow && view.received?.length) {
    key = 'recv';
    content = (
      <button type="button" onClick={p.onCloseRecv} className="rounded-card bg-surface/90 px-3 py-2 text-center shadow-modal backdrop-blur" aria-label={`You received ${view.received.map((r) => cardName(r.card)).join(', ')}. Tap to close`}>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-text-2">You received</p>
        <div className="flex gap-3">
          {view.received.map((r) => (
            <div key={r.card} className="flex flex-col items-center gap-1">
              <div style={{ width: Math.round(p.trickW * 0.72), height: Math.round(p.trickW * 1.01), borderRadius: 4, boxShadow: '0 2px 8px rgba(0,0,0,.3)' }}>
                <CardFace id={r.card} />
              </div>
              <span className="text-[11px] font-semibold text-text-2">{r.from === (me + 2) % 4 ? 'Partner' : r.from === (me + 1) % 4 ? 'Left' : 'Right'}</span>
            </div>
          ))}
        </div>
      </button>
    );
  } else if (view.phase === 'play' && view.trick.length === 0 && p.turnName) {
    key = `lead-${view.turn}`;
    content = (
      <p className="rounded-full bg-surface/60 px-3 py-1 text-sm text-text-2 backdrop-blur-sm">
        {view.turn === me && !p.spectator ? 'Your lead. Play any combination' : `${p.turnName} leads`}
      </p>
    );
  } else if (view.phase === 'over' && view.result) {
    key = 'over';
    const won = view.result.winners.some((s) => s % 2 === me % 2);
    content = (
      <Panel>
        <p className={`text-[22px] font-black uppercase italic ${won && !p.spectator ? 'text-gold' : ''}`}>{p.spectator ? 'Game over' : won ? 'You and Partner win' : 'Opponents win'}</p>
        <p className="mt-1 text-sm text-text-2">
          Final score {view.scores.team0} to {view.scores.team1}
        </p>
      </Panel>
    );
  }
  return (
    <div className={`pointer-events-none absolute inset-0 z-20 flex justify-center ${key === 'recv' ? 'items-start pt-12' : 'items-center'}`}>
      <AnimatePresence mode="wait">
        {content ? (
          <motion.div key={key} className="pointer-events-auto" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.2 }}>
            {content}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="mx-2 max-w-[19rem] rounded-card border border-[#5a8fe0]/60 bg-surface/90 p-4 text-center backdrop-blur" style={{ boxShadow: '0 0 28px rgba(90, 143, 224,.35)' }}>{children}</div>;
}

/* ---------- action bar ---------- */

function ActionBar(p: {
  view: TichuView;
  me: number;
  name: (s: number) => string;
  busy: boolean;
  error: string | null;
  canGrand: boolean;
  canTichu: boolean;
  canPass: boolean;
  bombs: boolean;
  myTurn: boolean;
  selection: ReturnType<typeof evaluateSelection>;
  selCount: number;
  passingOpen: boolean;
  slotsFilled: boolean;
  wish: number | null;
  setWish: (w: number | null) => void;
  confirmTichu: boolean;
  onTichu: () => void;
  onGrand: (call: boolean) => void;
  onPlay: () => void;
  onPass: () => void;
  onBomb: () => void;
  onPassCards: () => void;
  onPickForMe: () => void;
  onDragon: (to: number) => void;
  onClear: () => void;
}) {
  const { view, me, selection } = p;
  const btn = 'inline-flex h-12 items-center justify-center gap-2 rounded-chip px-4 text-[15px] font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100';
  const primary = `${btn} whitespace-nowrap bg-primary text-primary-ink font-extrabold uppercase tracking-[0.04em] shadow-[0_0_0_1px_rgba(127, 227, 255,.5),0_0_22px_rgba(127, 227, 255,.35)] hover:brightness-110`;
  const secondary = `${btn} whitespace-nowrap bg-surface-2 text-text hover:bg-line max-sm:!px-3`;
  const tichuBtn = p.canTichu ? (
    <span className="inline-flex items-center">
      <button type="button" className={`${secondary} ${p.confirmTichu ? 'ring-2 ring-primary' : ''}`} onClick={p.onTichu} disabled={p.busy}>
        {p.confirmTichu ? 'Tap again to call' : 'Call Tichu'}
      </button>
      <InfoTip label="About Tichu" text="Worth 100 points if you go out first, lose 100 if not. You can call it any time before you play your first card." />
    </span>
  ) : null;

  let row: React.ReactNode = null;
  let extra: React.ReactNode = null;

  if (view.phase === 'grand') {
    row = p.canGrand ? (
      <>
        <button type="button" className={`${secondary} shrink-0`} onClick={() => p.onGrand(false)} disabled={p.busy}>
          No thanks
        </button>
        <span className="inline-flex min-w-0 flex-1 items-center">
          <button type="button" className={`${primary} w-full whitespace-nowrap px-3`} onClick={() => p.onGrand(true)} disabled={p.busy}>
            Call Grand Tichu
          </button>
          <InfoTip label="About Grand Tichu" text="Worth 200 points if you go out first, lose 200 if not. You decide before seeing your last 6 cards." />
        </span>
      </>
    ) : (
      <Status>Waiting for the others to decide</Status>
    );
  } else if (view.phase === 'passing') {
    row = p.passingOpen ? (
      <>
        <button type="button" className={`${btn} shrink-0 bg-transparent !px-1.5 text-sm text-text-2 hover:text-text`} onClick={p.onPickForMe} disabled={p.busy}>
          Pick for me
        </button>
        {tichuBtn}
        <button type="button" className={`${primary} flex-1`} onClick={p.onPassCards} disabled={!p.slotsFilled || p.busy}>
          Pass cards
        </button>
      </>
    ) : (
      <>
        <Status>Waiting for the others to pass</Status>
        {tichuBtn}
      </>
    );
  } else if (view.phase === 'dragon' && view.dragonPending) {
    if (view.dragonPending.winner === me) {
      const a = (me + 1) % 4;
      const b = (me + 3) % 4;
      row = (
        <>
          <button type="button" className={`${primary} flex-1`} onClick={() => p.onDragon(a)} disabled={p.busy}>
            Give to {p.name(a).replace(/\s*\(.*\)$/, '')}
          </button>
          <button type="button" className={`${primary} flex-1`} onClick={() => p.onDragon(b)} disabled={p.busy}>
            Give to {p.name(b).replace(/\s*\(.*\)$/, '')}
          </button>
        </>
      );
    } else row = <Status>{p.name(view.dragonPending.winner)} is choosing</Status>;
  } else if (view.phase === 'play') {
    if (view.out.includes(me)) row = <Status>You are out. Cheer on your partner</Status>;
    else {
      const ok = selection.kind === 'ok';
      const playLabel =
        selection.kind === 'ok'
          ? selection.label
          : selection.kind === 'bad'
            ? selection.reason
            : p.myTurn
              ? view.top
                ? 'Pick cards that beat the table'
                : 'Pick cards to lead'
              : `${view.turn !== null ? p.name(view.turn) : 'Someone'} is playing`;
      const showPlay = p.myTurn || p.selCount > 0;
      row = (
        <>
          {p.myTurn && p.canPass ? (
            <button type="button" className={`${secondary} w-[5.5rem] shrink-0`} onClick={p.onPass} disabled={p.busy} aria-keyshortcuts="P">
              Pass
            </button>
          ) : null}
          {tichuBtn}
          {p.bombs && !p.myTurn ? (
            <motion.button
              type="button"
              onClick={p.onBomb}
              disabled={p.busy}
              className={`${btn} shrink-0 bg-loss text-white`}
              animate={{ boxShadow: ['0 0 0 0 rgba(226,96,63,.7)', '0 0 0 8px rgba(226,96,63,0)', '0 0 0 0 rgba(226,96,63,0)'] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            >
              <BombIcon />
              {selection.kind === 'ok' && selection.bomb ? 'Play bomb now' : 'Bomb'}
            </motion.button>
          ) : null}
          {showPlay ? (
            <button
              type="button"
              className={`${ok ? primary : `${btn} bg-surface-2/80 text-text-2`} min-w-0 flex-1 flex-col !gap-0 leading-tight`}
              onClick={p.onPlay}
              disabled={!ok || p.busy}
              aria-keyshortcuts="Enter"
            >
              {ok ? (
                <>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] opacity-80">Play</span>
                  <span className="truncate">{playLabel}</span>
                </>
              ) : (
                <span className="line-clamp-2 text-[13px] font-medium sm:text-sm">{playLabel}</span>
              )}
            </button>
          ) : (
            <Status>{playLabel}</Status>
          )}
        </>
      );
      if (selection.kind === 'ok' && selection.mahjong) {
        extra = (
          <div className="mb-2 rounded-card bg-surface/85 p-2 shadow-card backdrop-blur">
            <div className="mb-1 flex items-center gap-1 px-1 text-xs font-semibold text-text-2">
              Make a wish (optional)
              <InfoTip label="About the wish" text="Pick a rank. The next player who holds that rank must play it if they can." />
            </div>
            <div className="grid grid-cols-7 gap-1 sm:grid-cols-[repeat(13,minmax(0,1fr))]">
              {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={p.wish === r}
                  onClick={() => p.setWish(p.wish === r ? null : r)}
                  className={`h-10 rounded-chip text-sm font-bold transition ${p.wish === r ? 'bg-primary text-primary-ink' : 'bg-surface-2 text-text hover:bg-line'}`}
                  aria-label={`Wish for ${rankWord(r)}`}
                >
                  {rankShort(r)}
                </button>
              ))}
            </div>
          </div>
        );
      }
    }
  } else if (view.phase === 'over') {
    row = <Status>Game over</Status>;
  }

  return (
    <div>
      <AnimatePresence>
        {extra ? (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}>
            {extra}
          </motion.div>
        ) : null}
      </AnimatePresence>
      {p.error ? (
        <p role="alert" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-loss">
          <svg viewBox="0 0 16 16" className="size-4 shrink-0" fill="currentColor" aria-hidden>
            <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm-.75 3h1.5v4.5h-1.5Zm0 5.75h1.5v1.5h-1.5Z" />
          </svg>
          {p.error}
        </p>
      ) : null}
      <div className="flex min-h-12 items-center gap-2">{row}</div>
    </div>
  );
}

function Status({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-12 flex-1 items-center justify-center rounded-chip bg-surface/40 px-3 text-center text-sm text-text-2">
      <span className="mr-2 inline-flex gap-0.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="size-1 rounded-full bg-text-2" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} />
        ))}
      </span>
      {children}
    </span>
  );
}
