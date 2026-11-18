'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { GAMES, CURRENCY, outcomeSummary, entryCost, formatAmount, formatNumber, parseAmount, validStake, maxStake, type Mode, type GameKind } from '@coldcall/shared';
import { Sheet, Button, Chip, Row, Amount, InfoTip, CoinChip, CountUp, Mascot } from '@/components/ui';
import { WORLD, WorldArt } from './WorldArt';
import { feedback } from '@/lib/haptics';
import { useSession } from './Providers';
import { api, randomClientSeed } from '@/lib/api';

const MODES: { id: Mode; label: string; text: string }[] = [
  { id: 'practice', label: 'Practice', text: 'Free. Play the bot with no coins involved.' },
  { id: 'bot', label: 'Bot', text: 'Play the bot for coins. A win pays double your stake.' },
  { id: 'pvp', label: 'People', text: 'Play real people. The winner takes the pot.' },
];

export function GameSetupSheet({ game, open, onClose, initialMode = 'practice' }: { game: GameKind | null; open: boolean; onClose: () => void; initialMode?: Mode }) {
  const { balance, currency, toast, me, openAuth } = useSession();
  const levels = CURRENCY[currency].stakeLevels;
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [stake, setStake] = useState<number>(CURRENCY[currency].stakeLevels[0]!);
  const [custom, setCustom] = useState<string | null>(null);
  const [time, setTime] = useState('5+3');
  const [priv, setPriv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [botInfo, setBotInfo] = useState<{ expected: { win: number; draw: number }; botCap: number } | null>(null);

  useEffect(() => setMode(initialMode), [initialMode, open]);
  // A new coin means new stake levels: start again from that coin's smallest stake.
  useEffect(() => {
    setStake(CURRENCY[currency].stakeLevels[0]!);
    setCustom(null);
  }, [currency]);
  useEffect(() => {
    if (open && game && me) api(`/api/bot-info?game=${game}&currency=${currency}`).then(setBotInfo).catch(() => setBotInfo(null));
  }, [open, game, me, currency]);

  if (!game) return null;
  const meta = GAMES[game];
  const cap = mode === 'bot' ? Math.min(maxStake('bot', currency), botInfo?.botCap ?? maxStake('bot', currency)) : maxStake(mode, currency);
  const stakeError =
    mode === 'practice'
      ? null
      : (custom !== null && parseAmount(custom.replace(/,/g, '')) === null ? 'Enter a number, like 2 or 0.50.' : null) ??
        validStake(mode, stake, currency) ??
        (stake > cap ? (cap < CURRENCY[currency].minStake ? `Bot games in ${currency} are paused for a moment. Try practice, people, or the other coin.` : `Right now the biggest stake against the bot is ${formatAmount(cap, currency)}.`) : null);
  const s = outcomeSummary(mode, game, stake, meta.players, currency);
  const cost = entryCost(mode, stake, currency);
  const short = mode !== 'practice' && (balance?.available ?? 0) < cost.total;

  const start = async () => {
    if (!me) return openAuth();
    setBusy(true);
    try {
      const clientSeed = randomClientSeed();
      const r =
        mode === 'pvp' && !priv
          ? await api('/api/tables/quick', { game, currency, stake, time: game === 'chess' ? time : undefined, clientSeed })
          : await api('/api/tables', { game, mode, currency, stake: mode === 'practice' ? 0 : stake, visibility: priv ? 'private' : 'public', time: game === 'chess' ? time : undefined, clientSeed });
      router.push(`/table/${r.id}`);
    } catch (e: any) {
      toast(e.message, 'error');
      setBusy(false);
    }
  };

  const pct = (n: number) => Math.round(n * 100);
  const w = WORLD[game];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={meta.name}
      tint={w.c}
      footer={
        <>
          {short ? (
        <div className="mb-3 rounded-[14px] border border-warn/40 bg-warn/10 p-3 text-sm">
          You need {formatAmount(cost.total, currency)} for this. You have {formatAmount(balance?.available ?? 0, currency)}.{' '}
          <a href="/wallet" className="font-semibold text-primary">
            Add {currency}
          </a>{' '}
          or pick a smaller stake.
        </div>
      ) : null}
        <Button size="lg" full className="text-[18px]" loading={busy} disabled={short || !!stakeError} onClick={start}>
          {mode === 'practice' ? 'Start free game' : mode === 'pvp' ? (priv ? 'Create table' : 'Find a game') : 'Start game'}
        </Button>
        </>
      }
      header={
        <div className="relative">
          <WorldArt game={game} className="h-32 w-full sm:h-36 [@media(max-height:740px)]:h-20" />
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[color-mix(in_srgb,var(--bg)_80%,transparent)] to-transparent" aria-hidden />
          <p className="t-eyebrow game-ink absolute bottom-2 left-5 sm:left-6" style={{ '--tint': w.c } as CSSProperties}>
            {w.world}
          </p>
          <Mascot pose="deal" className="absolute -bottom-3 right-3 size-24 sm:size-28 [@media(max-height:740px)]:size-16" />
        </div>
      }
    >
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">How do you want to play?</legend>
        <div className="well grid grid-cols-3 gap-1 rounded-[14px] p-1" role="radiogroup">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => (mode !== m.id && feedback('select'), setMode(m.id))}
              className={`press relative h-11 rounded-[10px] text-center text-[15px] font-semibold transition-colors ${mode === m.id ? 'text-primary-ink' : 'text-text-2 hover:text-text'}`}
            >
              {mode === m.id ? <motion.span layoutId="mode-ind" className="btn-primary absolute inset-0 rounded-[10px]" transition={{ type: 'spring', stiffness: 520, damping: 38 }} aria-hidden /> : null}
              <span className="relative">{m.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-text-2">{MODES.find((m) => m.id === mode)!.text}</p>
      </fieldset>

      {mode !== 'practice' && (
        <fieldset className="mt-5">
          <legend className="mb-2 inline-flex items-center gap-1 text-sm font-semibold">
            Stake in {currency} <InfoTip text={`The ${currency} you put into this game. The whole game is played in ${currency}: stakes, fee and payout. LOFI and SUI are separate balances and are never swapped. Pick an amount you are comfortable losing.`} href="/how-it-works#stakes" />
          </legend>
          <div className="grid gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${levels.filter((l) => l <= cap).length + 1}, minmax(0, 1fr))` }}>
            {levels.filter((l) => l <= cap).map((l) => {
              const on = custom === null && stake === l;
              return (
                <button
                  key={l}
                  type="button"
                  aria-pressed={on}
                  onClick={() => (!on && feedback('select'), setCustom(null), setStake(l))}
                  className={`press relative flex h-[60px] flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[14px] px-1 sm:h-[68px] sm:px-2 ${on ? 'text-[#14110a] shadow-[0_10px_28px_-10px_rgba(245, 197, 66,0.8),inset_0_1px_0_rgba(255,255,255,0.6)]' : 'btn-secondary'}`}
                  style={on ? { background: 'linear-gradient(180deg, #ffe58a 0%, #f5c542 55%, #f0b919 100%)' } : undefined}
                >
                  <span className="font-display text-[15px] font-extrabold leading-none tabular sm:text-[17px]">{formatNumber(l).replace('.00', '')}</span>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold leading-tight ${on ? 'opacity-75' : 'text-text-2'}`}>
                    <CoinChip currency={currency} className="size-3" />
                    {currency}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={custom !== null}
              onClick={() => (feedback('select'), setCustom(custom ?? formatNumber(stake).replace(/,/g, '').replace('.00', '')))}
              className={`press h-[60px] rounded-[14px] px-1 text-[13px] font-bold sm:h-[68px] sm:px-2 sm:text-[15px] ${custom !== null ? 'btn-primary' : 'btn-secondary'}`}
            >
              Custom
            </button>
          </div>
          {custom !== null && (
            <div className="mt-3">
              <label htmlFor="custom-stake" className="mb-1 block text-sm font-semibold">
                Your stake in {currency}
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="custom-stake"
                  inputMode="decimal"
                  autoFocus
                  value={custom}
                  onChange={(e) => {
                    setCustom(e.target.value);
                    const m = parseAmount(e.target.value.replace(/,/g, ''));
                    if (m !== null) setStake(m);
                  }}
                  className="well h-12 w-40 rounded-chip px-3 font-display text-lg tabular outline-none focus:shadow-[inset_0_0_0_2px_var(--primary)]"
                />
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-text-2">
                  <CoinChip currency={currency} className="size-4" /> {currency}
                </span>
              </div>
              <p className="mt-1 text-sm text-text-2">
                From {formatAmount(CURRENCY[currency].minStake, currency)} to {formatAmount(cap, currency)}{mode === 'bot' ? ' against the bot' : ' against people'}.
              </p>
            </div>
          )}
          {stakeError ? <p className="mt-2 text-sm font-medium text-loss">{stakeError}</p> : null}
          {mode === 'pvp' && custom !== null && !stakeError ? <p className="mt-2 text-sm text-text-2">Custom stakes can take longer to match. You can also invite a friend.</p> : null}
        </fieldset>
      )}

      {game === 'chess' && (
        <fieldset className="mt-5">
          <legend className="mb-2 inline-flex items-center gap-1 text-sm font-semibold">
            Time per player <InfoTip text="5+3 means 5 minutes each, plus 3 seconds added after every move. If your clock runs out, you lose." />
          </legend>
          <div className="flex gap-2">
            {['3+2', '5+3', '10+5'].map((t) => (
              <Chip key={t} active={time === t} onClick={() => setTime(t)}>
                {t}
              </Chip>
            ))}
          </div>
        </fieldset>
      )}

      {mode === 'pvp' && (
        <label className="mt-5 flex items-center gap-3">
          <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} className="size-5 accent-[var(--primary)]" />
          <span>Private table. I will send an invite link to a friend.</span>
        </label>
      )}

      {mode !== 'practice' && !stakeError ? (
        <div className="relative mt-5 grid grid-cols-2 overflow-hidden rounded-[18px] well" aria-hidden>
          <span className="pointer-events-none absolute -right-10 -top-12 size-44 rounded-full bg-gold/20 blur-2xl" />
          <div className="relative p-4">
            <p className="t-eyebrow">You put in</p>
            <p className="t-num mt-2 flex items-center gap-1.5 text-[24px] leading-none">
              <CoinChip currency={currency} className="size-5" />
              {formatNumber(s.youPut)}
              <span className="text-[13px] opacity-75">{currency}</span>
            </p>
          </div>
          <div className="relative border-l border-well-line p-4">
            <p className="t-eyebrow text-gold">If you win</p>
            <p className="t-num mt-2 flex items-center gap-1.5 text-[30px] leading-none text-gold [text-shadow:0_0_24px_color-mix(in_srgb,var(--gold)_45%,transparent)]">
              <CoinChip currency={currency} className="size-6" />
              <CountUp key={`${game}-${mode}-${currency}`} value={s.ifWin} from={0} duration={700} format={(n) => formatNumber(Math.round(n))} />
              <span className="text-[13px] opacity-75">{currency}</span>
            </p>
          </div>
        </div>
      ) : null}

      <div className="well mt-3 rounded-[16px] px-4 py-2" aria-label="What you can win or lose">
        {mode === 'practice' ? (
          <Row label="Cost" value="Free" info="Practice never uses LOFI or SUI and does not change your skill rating." />
        ) : (
          <>
            <Row label="You put in" value={<Amount minor={s.youPut} currency={currency} />} info="Your stake. It is held for this game and paid out when the game ends." />
            {mode === 'pvp' && (
              <Row
                label="Cold Call fee"
                value={<Amount minor={s.fee} currency={currency} />}
                info={currency === 'SUI' ? '5% of the stake, rounded down to 0.01 SUI, so 0.05 and 0.10 SUI tables have no fee. This is how Cold Call earns from games between people.' : '5% of the stake, at least 0.05 LOFI. This is how Cold Call earns from games between people.'}
              />
            )}
            <Row label="If you win" value={<Amount minor={s.ifWin} currency={currency} className="text-win" />} info={mode === 'bot' ? 'A win against the bot pays double your stake.' : game === 'tichu' ? 'The pot is split between you and your partner.' : 'You take the whole pot.'} />
            {s.ifDraw !== null && <Row label="If it is a draw" value={<Amount minor={s.ifDraw} currency={currency} />} info={mode === 'bot' ? 'A draw against the bot returns 90% of your stake, rounded down to 0.01.' : 'A draw returns your stake. The fee is kept.'} />}
            <Row label="If you lose" value={<Amount minor={-s.ifLose} currency={currency} className="text-loss" />} info="What leaves your balance if you lose, resign or run out of time." />
            {mode === 'bot' && (
              <Row
                label="Bot target"
                info="The bot adjusts to your skill. The house keeps a published 5% edge. We never use your balance or losses to set the bot."
                value={
                  <span className="text-sm">
                    {game === 'chess' && botInfo ? `Win about ${pct(botInfo.expected.win)} in 100, draw about ${pct(botInfo.expected.draw)}` : meta.botTarget.replace('You win about', 'Win about').replace('Your team wins about', 'Win about').replace(' games.', '')}
                  </span>
                }
              />
            )}
          </>
        )}
      </div>



      {mode === 'pvp' && !priv ? <p className="mt-4 text-center text-sm text-text-2">We match you with someone at the same stake. If nobody joins, you can switch to the bot or leave with a full refund.</p> : null}
    </Sheet>
  );
}
