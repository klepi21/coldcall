'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { motion, MotionConfig } from 'motion/react';
import { useSession } from './Providers';
import { Amount, Wordmark, Button, Logo, Cosmos } from '@/components/ui';
import { CurrencySwitch } from './CurrencySwitch';
import { AuthSheet } from './AuthSheet';
import { OnboardingSheet } from './OnboardingSheet';
import { haptic } from '@/lib/haptics';
import { LevelChip, ProgressToasts } from '@/components/progress';

const ICON = {
  play: 'M8 5.6v12.8c0 .8.9 1.3 1.6.9l10-6.4a1 1 0 0 0 0-1.8l-10-6.4c-.7-.4-1.6.1-1.6.9Z',
  wallet: 'M3 7a2 2 0 0 1 2-2h13v4H5a2 2 0 0 0-2 2V7Zm0 4a2 2 0 0 1 2-2h15v10H5a2 2 0 0 1-2-2v-6Zm13 3a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0Z',
  history: 'M12 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-2.05-4.95L14 10h7V3l-2.62 2.62A8.97 8.97 0 0 0 12 3Zm-1 4v6l5 3 .8-1.3-3.8-2.25V7h-2Z',
  profile: 'M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5Z',
  progress: 'M12 2 14.6 8.6 21.5 9.2 16.2 13.7 17.9 20.5 12 16.8 6.1 20.5 7.8 13.7 2.5 9.2 9.4 8.6Z',
};

const NAV = [
  { href: '/play', label: 'Play', icon: ICON.play },
  { href: '/wallet', label: 'Wallet', icon: ICON.wallet },
  { href: '/history', label: 'History', icon: ICON.history },
  { href: '/profile', label: 'Profile', icon: ICON.profile },
];
/** Desktop rail only. The lead decides whether Progress joins the mobile bar. */
const RAIL = [...NAV, { href: '/progress', label: 'Progress', icon: ICON.progress }];
/** Admin entry, shown only to accounts with the admin role. */
const ADMIN_NAV = { href: '/admin', label: 'Admin', icon: 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Zm0 5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Zm0 7c2 0 3.8.9 4.6 2.2A6.8 6.8 0 0 1 12 19.6a6.8 6.8 0 0 1-4.6-3.4C8.2 14.9 10 14 12 14Z' };

function NavIcon({ d, className = 'size-6' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function ConnectionBanner() {
  const { socket } = useSession();
  const [status, setStatus] = useState(socket.status);
  const [show, setShow] = useState(false);
  useEffect(() => socket.onStatus(setStatus), [socket]);
  useEffect(() => {
    if (status === 'open') return setShow(false);
    const t = setTimeout(() => setShow(true), 2500);
    return () => clearTimeout(t);
  }, [status]);
  if (!show) return null;
  return (
    <div role="status" className="bg-warn/15 px-4 py-2 text-center text-sm font-medium text-warn">
      Connection lost. Your games and money are safe, we are reconnecting.
    </div>
  );
}

export function BalanceChip() {
  const { me, balance, currency, openAuth } = useSession();
  if (!me) {
    return (
      <Button size="sm" onClick={() => openAuth()}>
        Start playing
      </Button>
    );
  }
  return (
    <Link
      href="/wallet"
      onClick={() => haptic()}
      className="press glass group inline-flex h-11 items-center gap-2 rounded-full pl-3 pr-1.5 text-[15px] hover:brightness-110"
      style={{ '--tint': 'var(--gold)' } as React.CSSProperties}
      aria-label={`Your ${currency} balance, open wallet`}
    >
      <span className="pointer-events-none absolute -left-1 top-1/2 size-8 -translate-y-1/2 rounded-full bg-gold/30 blur-md" aria-hidden />
      <Amount key={currency} minor={balance?.available ?? 0} currency={currency} animate code={false} className="relative text-[15px] font-bold" />
      <span className="btn-primary relative grid size-8 place-items-center rounded-full text-[18px] font-bold leading-none" aria-hidden>
        +
      </span>
    </Link>
  );
}

function MobileTab({ n, on }: { n: (typeof NAV)[number]; on: boolean }) {
  return (
    <Link
      href={n.href}
      onClick={() => haptic()}
      aria-current={on ? 'page' : undefined}
      className={`press relative flex h-full flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors ${on ? 'text-text' : 'text-text-2 hover:text-text'}`}
    >
      {on ? (
        <motion.span layoutId="tab-ind" className="absolute inset-x-2 inset-y-1.5 rounded-[16px] bg-well-hover" transition={{ type: 'spring', stiffness: 500, damping: 38 }} aria-hidden>
          <span className="absolute left-1/2 top-0 h-[3px] w-6 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_12px_var(--primary)]" />
        </motion.span>
      ) : null}
      <NavIcon d={n.icon} className={`relative size-[22px] ${on ? 'text-primary' : ''}`} />
      <span className="relative">{n.label}</span>
    </Link>
  );
}

function PlayOrb({ on }: { on: boolean }) {
  return (
    <Link href="/play" onClick={() => haptic()} aria-current={on ? 'page' : undefined} className="press group relative -mt-7 flex w-[84px] shrink-0 flex-col items-center gap-1 text-[11px] font-bold">
      <span className="relative grid size-[62px] place-items-center">
        {/* the four worlds, orbiting */}
        <span className="w-spin absolute -inset-[3px] rounded-[22px] opacity-90" style={{ background: 'conic-gradient(from 0deg, #7fe3ff, #4da2ff, #c9a7ff, #8fa8ff, #7fe3ff)', ['--dur' as string]: '7s', filter: 'blur(0.5px)' }} aria-hidden />
        <span className={`absolute -inset-3 rounded-full bg-primary/30 blur-xl transition-opacity ${on ? 'opacity-100' : 'opacity-50'}`} aria-hidden />
        <span className="btn-primary relative grid size-[58px] place-items-center rounded-[20px]">
          <NavIcon d={ICON.play} className="size-7 translate-x-[1px]" />
        </span>
      </span>
      <span className={on ? 'text-text' : 'text-text-2'}>Play</span>
    </Link>
  );
}

function RailItem({ n, on }: { n: (typeof RAIL)[number]; on: boolean }) {
  return (
    <Link
      href={n.href}
      aria-current={on ? 'page' : undefined}
      className={`press relative flex w-[68px] flex-col items-center gap-1 rounded-[16px] py-2.5 text-[11px] font-semibold transition-colors ${on ? 'text-text' : 'text-text-2 hover:bg-well hover:text-text'}`}
    >
      {on ? (
        <motion.span layoutId="rail-ind" className="absolute inset-0 rounded-[16px] bg-well-hover" transition={{ type: 'spring', stiffness: 500, damping: 40 }} aria-hidden>
          <span className="absolute -left-[7px] top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-full bg-primary shadow-[0_0_14px_var(--primary)]" />
        </motion.span>
      ) : null}
      <NavIcon d={n.icon} className={`relative size-6 ${on ? 'text-primary' : ''}`} />
      <span className="relative">{n.label}</span>
    </Link>
  );
}

export function AppShell({ children, bare }: { children: ReactNode; bare?: boolean }) {
  const path = usePathname();
  const { me, authOpen, openAuth } = useSession();
  const active = (href: string) => path === href || path.startsWith(href + '/');

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative isolate min-h-dvh lg:pl-[104px]">
        {!bare && <Cosmos />}

        {/* Desktop rail */}
        <nav aria-label="Main" className="glass glass-strong glass-blur fixed bottom-3 left-3 top-3 z-40 hidden w-[84px] flex-col items-center gap-1.5 rounded-[24px] py-4 lg:flex">
          <Link href="/" aria-label="Cold Call home" className="press relative mb-4 grid place-items-center">
            <span className="absolute size-10 rounded-full bg-accent/40 blur-lg" aria-hidden />
            <Logo className="relative size-11" />
          </Link>
          {(me?.role === 'admin' ? [...RAIL, ADMIN_NAV] : RAIL).map((n) => (
            <RailItem key={n.href} n={n} on={active(n.href)} />
          ))}
          <div className="mt-auto flex flex-col items-center gap-1.5 text-[11px] text-text-2">
            <Link href="/how-it-works" className={`rounded-chip px-2 py-1 text-center leading-tight hover:text-text ${active('/how-it-works') ? 'text-text' : ''}`}>
              How it
              <br />
              works
            </Link>
            <span className="rounded-full px-2 py-0.5 font-bold [box-shadow:inset_0_0_0_1px_var(--well-line)]">18+</span>
          </div>
        </nav>

        {!bare && (
          <header className="glass-blur sticky top-0 z-30 border-b border-well-line bg-[color-mix(in_srgb,var(--bg)_55%,transparent)]">
            <ConnectionBanner />
            <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-6">
              <Link href={me ? '/play' : '/'} className="press shrink-0 lg:hidden" aria-label="Cold Call">
                {me ? (
                  <>
                    <Logo className="size-9 sm:hidden" />
                    <span className="hidden sm:inline">
                      <Wordmark />
                    </span>
                  </>
                ) : (
                  <Wordmark />
                )}
              </Link>
              <p className="hidden min-w-0 truncate text-sm text-text-2 lg:block">{me?.onboarded ? <>Welcome back, <span className="font-semibold text-text">{me.displayName}</span></> : null}</p>
              <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                <span className="hidden rounded-full px-3 py-1 text-xs font-semibold text-text-2 [box-shadow:inset_0_0_0_1px_var(--well-line)] xl:inline">Devnet beta</span>
                {me?.role === 'admin' ? (
                  <Link href="/admin" aria-label="Admin" aria-current={active('/admin') ? 'page' : undefined} className="press glass inline-flex h-11 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-semibold lg:hidden">
                    <NavIcon d={ADMIN_NAV.icon} className="size-4 text-primary" />
                    <span className="sr-only sm:not-sr-only">Admin</span>
                  </Link>
                ) : null}
                {me ? <CurrencySwitch /> : null}
                <span className="hidden sm:contents">
                  <LevelChip />
                </span>
                <BalanceChip />
              </div>
            </div>
          </header>
        )}

        <main className={bare ? 'page-root' : 'page-root mx-auto max-w-[1200px] px-4 pb-[calc(116px+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:pb-16 lg:pt-8'}>
          <motion.div key={path} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}>
            {children}
          </motion.div>
        </main>

        {/* Mobile floating bar */}
        {!bare && (
          <nav aria-label="Main" className="fixed inset-x-3 bottom-[calc(10px+env(safe-area-inset-bottom))] z-40 lg:hidden">
            <div className="glass glass-strong glass-blur mx-auto flex h-[66px] max-w-md items-stretch rounded-[24px] px-1.5 shadow-modal">
              <div className="flex flex-1">
                <MobileTab n={NAV[1]!} on={active('/wallet')} />
                <MobileTab n={NAV[2]!} on={active('/history')} />
              </div>
              <PlayOrb on={active('/play')} />
              <div className="flex flex-1">
                <MobileTab n={RAIL[4]!} on={active('/progress')} />
                <MobileTab n={NAV[3]!} on={active('/profile')} />
              </div>
            </div>
          </nav>
        )}

        <AuthSheet open={authOpen} onClose={() => openAuth(false)} />
        <OnboardingSheet />
        <ProgressToasts />
      </div>
    </MotionConfig>
  );
}
