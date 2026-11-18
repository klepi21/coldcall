'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { GAMES, STAKE_LEVELS, outcomeSummary, entryCost, formatCredits, parseCredits, validStake, maxStake, usd, type Mode, type GameKind } from '@coldcall/shared';
import { Sheet, Button, Chip, Row, Credits, InfoTip, Coin, CountUp } from '@/components/ui';
import { WORLD, WorldArt } from './WorldArt';
import { feedback } from '@/lib/haptics';
import { useSession } from './Providers';
import { api, randomClientSeed } from '@/lib/api';

const MODES: { id: Mode; label: string; text: string }[] = [
  { id: 'practice', label: 'Practice', text: 'Free. Play the bot with no credits involved.' },
  { id: 'bot', label: 'Bot', text: 'Play the bot for credits. A win pays double your stake.' },
  { id: 'pvp', label: 'People', text: 'Play real people. The winner takes the pot.' },
];

export function GameSetupSheet({ game, open, onClose, initialMode = 'practice' }: { game: GameKind | null; open: boolean; onClose: () => void; initialMode?: Mode }) {
  const { balance, toast, me, openAuth } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [stake, setStake] = useState<number>(STAKE_LEVELS[2]);
  const [custom, setCustom] = useState<string | null>(null);
  const [time, setTime] = useState('5+3');
  const [priv, setPriv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [botInfo, setBotInfo] = useState<{ expected: { win: number; draw: number }; botCap: number } | null>(null);

  useEffect(() => setMode(initialMode), [initialMode, open]);
  useEffect(() => {
    if (open && game && me) api(`/api/bot-info?game=${game}`).then(setBotInfo).catch(() => setBotInfo(null));
  }, [open, game, me]);

  if (!game) return null;
  const meta = GAMES[game];
  const cap = mode === 'bot' ? Math.min(maxStake('bot'), botInfo?.botCap ?? maxStake('bot')) : maxStake(mode);
  const stakeError = mode === 'practice' ? null : validStake(mode, stake) ?? (stake > cap ? `Right now the biggest stake against the bot is ${formatCredits(cap)} credits.` : null) ?? (custom !== null && parseCredits(custom.replace(/,/g, '')) === null ? 'Enter a number, like 250 or 12.50.' : null);
  const s = outcomeSummary(mode, game, stake, meta.players);
  const cost = entryCost(mode, stake);
  const short = mode !== 'practice' && (balance?.available ?? 0) < cost.total;

  const start = async () => {
    if (!me) return openAuth();
    setBusy(true);
    try {
      const clientSeed = randomClientSeed();
      const r =
        mode === 'pvp' && !priv
          ? await api('/api/tables/quick', { game, stake, time: game === 'chess' ? time : undefined, clientSeed })
          : await api('/api/tables', { game, mode, stake: mode === 'practice' ? 0 : stake, visibility: priv ? 'private' : 'public', time: game === 'chess' ? time : undefined, clientSeed });
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
          You need {formatCredits(cost.total)} credits for this. You have {formatCredits(balance?.available ?? 0)}.{' '}
          <a href="/wallet" className="font-semibold text-primary">
            Add money
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
            Stake <InfoTip text="The credits you put into this game. 100 credits equal 1 test USDC, about one dollar. Pick an amount you are comfortable losing." href="/how-it-works#stakes" />
          </legend>
          <div className="grid gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${STAKE_LEVELS.filter((l) => l <= cap).length + 1}, minmax(0, 1fr))` }}>
            {STAKE_LEVELS.filter((l) => l <= cap).map((l) => {
              const on = custom === null && stake === l;
              return (
                <button
                  key={l}
                  type="button"
                  aria-pressed={on}
                  onClick={() => (!on && feedback('select'), setCustom(null), setStake(l))}
                  className={`press relative flex h-[60px] flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[14px] px-1 sm:h-[68px] sm:px-2 ${on ? 'text-[#14110a] shadow-[0_10px_28px_-10px_rgba(255,210,63,0.8),inset_0_1px_0_rgba(255,255,255,0.6)]' : 'btn-secondary'}`}
                  style={on ? { background: 'linear-gradient(180deg, #ffe58a 0%, #ffd23f 55%, #f0b919 100%)' } : undefined}
                >
                  <span className="font-display text-[15px] font-extrabold leading-none tabular sm:text-[17px]">{formatCredits(l).replace('.00', '')}</span>
                  <span className={`text-[11px] font-semibold leading-tight ${on ? 'opacity-75' : 'text-text-2'}`}>{usd(l)}</span>
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={custom !== null}
              onClick={() => (feedback('select'), setCustom(custom ?? formatCredits(stake).replace(/,/g, '').replace('.00', '')))}
              className={`press h-[60px] rounded-[14px] px-1 text-[13px] font-bold sm:h-[68px] sm:px-2 sm:text-[15px] ${custom !== null ? 'btn-primary' : 'btn-secondary'}`}
            >
              Custom
            </button>
          </div>
          {custom !== null && (
            <div className="mt-3">
              <label htmlFor="custom-stake" className="mb-1 block text-sm font-semibold">
                Your stake in credits
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="custom-stake"
                  inputMode="decimal"
                  autoFocus
                  value={custom}
                  onChange={(e) => {
                    setCustom(e.target.value);
                    const m = parseCredits(e.target.value.replace(/,/g, ''));
                    if (m !== null) setStake(m);
                  }}
                  className="well h-12 w-40 rounded-chip px-3 font-display text-lg tabular outline-none focus:shadow-[inset_0_0_0_2px_var(--primary)]"
                />
                <span className="text-sm text-text-2">about {usd(stake)}</span>
              </div>
              <p className="mt-1 text-sm text-text-2">
                From 1 to {formatCredits(cap).replace('.00', '')} credits{mode === 'bot' ? ' against the bot' : ' against people'}.
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
              <Coin className="size-5" />
              {formatCredits(s.youPut)}
            </p>
          </div>
          <div className="relative border-l border-well-line p-4">
            <p className="t-eyebrow text-gold">If you win</p>
            <p className="t-num mt-2 flex items-center gap-1.5 text-[30px] leading-none text-gold [text-shadow:0_0_24px_color-mix(in_srgb,var(--gold)_45%,transparent)]">
              <Coin className="size-6" />
              <CountUp key={`${game}-${mode}`} value={s.ifWin} from={0} duration={700} format={(n) => formatCredits(Math.round(n))} />
            </p>
          </div>
        </div>
      ) : null}

      <div className="well mt-3 rounded-[16px] px-4 py-2" aria-label="What you can win or lose">
        {mode === 'practice' ? (
          <Row label="Cost" value="Free" info="Practice never uses credits and does not change your skill rating." />
        ) : (
          <>
            <Row label="You put in" value={<Credits minor={s.youPut} />} info="Your stake. It is held for this game and paid out when the game ends." />
            {mode === 'pvp' && <Row label="Evens fee" value={<Credits minor={s.fee} />} info="5% of the stake, at least 0.05 credits. This is how Evens earns money from games between people." />}
            <Row label="If you win" value={<Credits minor={s.ifWin} className="text-win" />} info={mode === 'bot' ? 'A win against the bot pays double your stake.' : game === 'tichu' ? 'The pot is split between you and your partner.' : 'You take the whole pot.'} />
            {s.ifDraw !== null && <Row label="If it is a draw" value={<Credits minor={s.ifDraw} />} info={mode === 'bot' ? 'A draw against the bot returns 90% of your stake.' : 'A draw returns your stake. The fee is kept.'} />}
            <Row label="If you lose" value={<Credits minor={-s.ifLose} className="text-loss" />} info="What leaves your balance if you lose, resign or run out of time." />
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
