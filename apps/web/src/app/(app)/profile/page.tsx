'use client';
import { useState } from 'react';
import Link from 'next/link';
import { formatAmount, formatNumber, parseAmount } from '@coldcall/shared';
import { useSession } from '@/components/app/Providers';
import { Button, Card, Empty, Sheet, Row, InfoTip, Chip, PageHeader, Glass } from '@/components/ui';
import { api } from '@/lib/api';
import { exportGuestKey } from '@/lib/wallet';

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
      <span>
        <span className="block font-medium">{label}</span>
        {hint ? <span className="block text-sm text-text-2">{hint}</span> : null}
      </span>
      <span className="relative inline-flex">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-7 w-12 rounded-full bg-[var(--well-hover)] shadow-[inset_0_0_0_1px_var(--well-line)] transition peer-checked:bg-primary peer-checked:shadow-[0_0_14px_color-mix(in_srgb,var(--primary)_55%,transparent)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-primary" />
        <span className="absolute left-1 top-1 size-5 rounded-full bg-white shadow transition-transform duration-300 [transition-timing-function:cubic-bezier(.34,1.56,.64,1)] peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export default function ProfilePage() {
  const { me, setMe, toast, signOut, openAuth, ready, currency } = useSession();
  const [name, setName] = useState('');
  const [limits, setLimits] = useState(false);
  const [lim, setLim] = useState({ depositDaily: '', lossDaily: '', lossWeekly: '' });
  const [breakOpen, setBreakOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const lim0 = me?.limits?.[currency] ?? { depositDaily: null, lossDaily: null, lossWeekly: null };
  if (ready && !me) return <Empty title="Your profile" text="Sign in to change your name, settings and limits." action={<Button onClick={() => openAuth()}>Start playing</Button>} />;
  if (!me) return null;

  const save = async (body: object, msg = 'Saved.') => {
    try {
      const r = await api('/api/me', body, 'PATCH');
      setMe(r.user);
      toast(msg);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  const s = me.settings ?? {};
  const onBreak = (me.cooloffUntil && new Date(me.cooloffUntil) > new Date()) || (me.excludedUntil && new Date(me.excludedUntil) > new Date());

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader eyebrow="Player card" title="Profile" />

      <Glass spill tint="var(--accent)" className="overflow-hidden rounded-[24px] p-5 sm:p-6">
        <div className="relative flex items-center gap-4">
          <span className="relative grid size-[72px] shrink-0 place-items-center">
            <span className="w-spin absolute inset-0 rounded-full opacity-90" style={{ background: 'conic-gradient(from 0deg, #c6ff3d, #3ddcff, #ff4d8d, #ff8a3d, #c6ff3d)', ['--dur' as string]: '12s' }} aria-hidden />
            <span className="absolute inset-[3px] rounded-full bg-[var(--bg)]" aria-hidden />
            <span className="relative font-display text-[26px] font-extrabold uppercase text-text">{me.displayName.slice(0, 1).toUpperCase()}</span>
          </span>
          <div className="min-w-0">
            <p className="t-title truncate text-[22px]">{me.displayName}</p>
            <p className="mt-0.5 text-sm text-text-2">Skill ratings</p>
          </div>
        </div>
        <div className="relative mt-4 grid grid-cols-3 gap-2" aria-label={`Skill ratings: chess ${me.ratings?.chess?.r ?? 1500}, backgammon ${me.ratings?.backgammon?.r ?? 1500}, Tichu ${me.ratings?.tichu?.r ?? 1500}`}>
          {(
            [
              ['chess', 'Chess', '#c6ff3d'],
              ['backgammon', 'Backgammon', '#ff8a3d'],
              ['tichu', 'Tichu', '#ff4d8d'],
            ] as const
          ).map(([k, label, c]) => (
            <div key={k} className="well min-w-0 rounded-[14px] px-2 py-2.5 sm:px-3" style={{ '--tint': c } as React.CSSProperties} aria-hidden>
              <p className="t-eyebrow game-ink truncate text-[9px] tracking-[0.02em] sm:text-[10px] sm:tracking-[0.14em]">{label}</p>
              <p className="t-num mt-1 text-[22px] leading-none">{me.ratings?.[k]?.r ?? 1500}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New player name" maxLength={20} className="well h-11 min-w-0 flex-1 rounded-chip px-3 outline-none focus:shadow-[inset_0_0_0_2px_var(--primary)]" aria-label="New player name" />
          <Button variant="secondary" disabled={name.trim().length < 2} onClick={() => save({ displayName: name.trim() }, 'Name updated.').then(() => setName(''))}>
            Save
          </Button>
        </div>
        <p className="relative mt-2 inline-flex items-center gap-1 text-sm text-text-2">
          What is a skill rating? <InfoTip text="A number that tracks how well you play each game. The bot uses it to give you close games. It never uses your balance or losses. Practice games do not change it." href="/how-it-works#bots" />
        </p>
      </Glass>

      <Card className="divide-well px-5">
        <Toggle label="Sound" checked={s.sound !== false} onChange={(v) => save({ settings: { sound: v } })} />
        <Toggle label="Confirm moves in games with stakes" hint="Ask before sending a move, so a slip of the finger costs nothing." checked={s.confirmMoves ?? true} onChange={(v) => save({ settings: { confirmMoves: v } })} />
        <Toggle label="Hints in practice" checked={s.hints ?? true} onChange={(v) => save({ settings: { hints: v } })} />
        <Toggle label="3D boards" hint="Chess, backgammon and Sea Battle in 3D. Turn off for a lighter 2D board on older phones." checked={s.render3d ?? true} onChange={(v) => save({ settings: { render3d: v } })} />
        <div className="py-3">
          <p className="font-medium">Theme</p>
          <div className="mt-2 flex gap-2">
            {(['dark', 'light'] as const).map((t) => (
              <Chip key={t} active={(s.theme === 'light' ? 'light' : 'dark') === t} onClick={() => save({ settings: { theme: t } })}>
                {t === 'dark' ? 'Dark' : 'Light'}
              </Chip>
            ))}
          </div>
        </div>
        <div className="py-3">
          <p className="font-medium">Chess board</p>
          <div className="mt-2 flex gap-2">
            {(['marble', 'night'] as const).map((t) => (
              <Chip key={t} active={(s.boardTheme ?? 'marble') === t} onClick={() => save({ settings: { boardTheme: t } })}>
                {t === 'marble' ? 'Marble' : 'Night'}
              </Chip>
            ))}
          </div>
        </div>
      </Card>

      <Card className="p-5" id="limits">
        <h2 className="t-title">Safer play</h2>
        <p className="mt-1 text-sm text-text-2">Set limits that fit you. LOFI and SUI each have their own limits. Lowering a limit works right away. Raising or removing one takes 24 hours.</p>
        <p className="mt-3 text-sm font-semibold">Your {currency} limits</p>
        <div className="well mt-1 rounded-[14px] px-4 py-1 text-sm">
          <Row label="Daily add money limit" value={lim0.depositDaily ? formatAmount(lim0.depositDaily, currency) : 'None'} />
          <Row label="Daily loss limit" value={lim0.lossDaily ? formatAmount(lim0.lossDaily, currency) : 'None'} />
          <Row label="Weekly loss limit" value={lim0.lossWeekly ? formatAmount(lim0.lossWeekly, currency) : 'None'} />
        </div>
        {onBreak ? (
          <p className="mt-3 rounded-chip border border-warn/40 bg-warn/10 p-3 text-sm">
            You are on a break until {new Date((me.excludedUntil ?? me.cooloffUntil)!).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}. You can still cash out.
          </p>
        ) : null}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setLim({
                depositDaily: lim0.depositDaily ? formatNumber(lim0.depositDaily) : '',
                lossDaily: lim0.lossDaily ? formatNumber(lim0.lossDaily) : '',
                lossWeekly: lim0.lossWeekly ? formatNumber(lim0.lossWeekly) : '',
              });
              setLimits(true);
            }}
          >
            Set {currency} limits
          </Button>
          <Button variant="secondary" onClick={() => setBreakOpen(true)}>
            Take a break
          </Button>
        </div>
        <p className="mt-3 text-sm text-text-2">
          If playing stops being fun, talk to someone. Free and confidential help: <a className="font-semibold text-primary" href="https://www.begambleaware.org" target="_blank" rel="noreferrer">BeGambleAware</a>,{' '}
          <a className="font-semibold text-primary" href="https://www.gamblingtherapy.org" target="_blank" rel="noreferrer">Gambling Therapy</a> (worldwide).
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="t-title">Account</h2>
        <div className="mt-2 text-sm">
          <Row label="Wallet" value={me.walletKind === 'zklogin' ? 'Your Google account' : 'Wallet on this device'} />
        </div>
        {me.walletKind === 'guest' ? (
          <Button variant="secondary" full className="mt-3" onClick={() => setKeyOpen(true)}>
            Back up my wallet
          </Button>
        ) : null}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Link href="/how-it-works" className="btn-secondary press flex h-11 items-center justify-center rounded-chip font-semibold">
            How it works
          </Link>
          <Button variant="ghost" onClick={() => signOut()}>
            Sign out
          </Button>
        </div>
        {me.role === 'admin' ? (
          <Link href="/admin" className="btn-secondary press mt-2 flex h-11 items-center justify-center rounded-chip font-semibold">
            Admin
          </Link>
        ) : null}
      </Card>

      <Sheet open={limits} onClose={() => setLimits(false)} title={`Your ${currency} limits`}>
        {(
          [
            ['depositDaily', `Add ${currency} per day`, `The most ${currency} you can add to Cold Call in 24 hours.`],
            ['lossDaily', `${currency} losses per day`, `${currency} games that could take you past this are blocked until tomorrow.`],
            ['lossWeekly', `${currency} losses per week`, 'The same, over 7 days.'],
          ] as const
        ).map(([k, label, hint]) => (
          <div key={k} className="mb-4">
            <label className="mb-1 block text-sm font-semibold" htmlFor={k}>
              {label}
            </label>
            <input id={k} inputMode="decimal" placeholder="No limit" value={lim[k]} onChange={(e) => setLim({ ...lim, [k]: e.target.value })} className="well h-12 w-full rounded-chip px-3 tabular outline-none focus:shadow-[inset_0_0_0_2px_var(--primary)]" />
            <p className="mt-1 text-sm text-text-2">{hint}</p>
          </div>
        ))}
        <Button
          size="lg"
          full
          onClick={async () => {
            const toMinor = (v: string) => (v.trim() === '' ? null : parseAmount(v.replace(/,/g, '')));
            try {
              const r = await api('/api/me/limits', { currency, depositDaily: toMinor(lim.depositDaily), lossDaily: toMinor(lim.lossDaily), lossWeekly: toMinor(lim.lossWeekly) });
              setMe(r.user);
              setLimits(false);
              toast(Object.keys(r.pending ?? {}).length ? 'Saved. Higher or removed limits start in 24 hours.' : 'Limits saved.');
            } catch (e: any) {
              toast(e.message, 'error');
            }
          }}
        >
          Save limits
        </Button>
      </Sheet>

      <Sheet open={breakOpen} onClose={() => setBreakOpen(false)} title="Take a break">
        <p className="text-text-2">During a break you cannot start or join games. You can always cash out. A break cannot be cancelled early.</p>
        <div className="mt-4 space-y-2">
          {[
            [24, '24 hours'],
            [168, '7 days'],
            [720, '30 days'],
          ].map(([h, l]) => (
            <Button
              key={h}
              variant="secondary"
              full
              onClick={async () => {
                const r = await api('/api/me/cooloff', { hours: h });
                setMe(r.user);
                setBreakOpen(false);
                toast(`Your break has started. See you in ${l}.`);
              }}
            >
              Break for {l}
            </Button>
          ))}
          <Button
            variant="danger"
            full
            onClick={async () => {
              const r = await api('/api/me/exclude', { months: 6 });
              setMe(r.user);
              setBreakOpen(false);
              toast('Your account is paused for 6 months. You can still cash out.');
            }}
          >
            Pause my account for 6 months
          </Button>
        </div>
      </Sheet>

      <Sheet open={keyOpen} onClose={() => (setKeyOpen(false), setShowKey(false))} title="Back up your wallet">
        <p className="text-text-2">Your wallet lives in this browser. If you clear your browser data, you lose access. Save this secret key somewhere safe, or import it into a Sui wallet app.</p>
        <p className="mt-3 rounded-chip border border-loss/40 bg-loss/10 p-3 text-sm">Never share this key. Anyone with it controls your wallet. Cold Call will never ask for it.</p>
        {showKey ? (
          <textarea readOnly value={exportGuestKey() ?? ''} className="well mt-3 h-24 w-full rounded-chip p-3 font-mono text-xs" aria-label="Secret key" />
        ) : (
          <Button variant="secondary" full className="mt-3" onClick={() => setShowKey(true)}>
            Show my secret key
          </Button>
        )}
      </Sheet>
    </div>
  );
}
