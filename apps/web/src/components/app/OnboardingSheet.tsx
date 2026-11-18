'use client';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { Sheet, Button } from '@/components/ui';
import { useSession } from './Providers';
import { api } from '@/lib/api';

const CARDS = [
  { title: 'Pick a game', text: 'Chess, Backgammon or Tichu. Each one has a 60 second tutorial and full rules.', art: 'board' },
  { title: 'Play free or for credits', text: 'Practice is always free. With credits you see exactly what you can win or lose before you start.', art: 'coin' },
  { title: 'Cash out anytime', text: 'Your credits are backed one to one by money in a public vault. Cash out to your wallet at any time, up to the daily limit.', art: 'vault' },
];

function Art({ kind }: { kind: string }) {
  return (
    <div className="relative mx-auto grid h-32 w-48 place-items-center" aria-hidden>
    <span className="absolute size-28 rounded-full blur-2xl" style={{ background: kind === 'board' ? 'rgba(198,255,61,.3)' : kind === 'coin' ? 'rgba(255,210,63,.35)' : 'rgba(124,92,255,.4)' }} />
    <svg viewBox="0 0 120 80" className="w-bob relative h-28 w-auto" style={{ ['--dur' as string]: '4.5s' }}>
      {kind === 'board' && (
        <g>
          {Array.from({ length: 16 }, (_, i) => (
            <rect key={i} x={28 + (i % 4) * 16} y={8 + Math.floor(i / 4) * 16} width="16" height="16" fill={(i + Math.floor(i / 4)) % 2 ? '#1a1630' : '#efe9dd'} opacity={(i + Math.floor(i / 4)) % 2 ? 1 : 0.9} />
          ))}
          <circle cx="60" cy="40" r="9" fill="var(--primary)" />
        </g>
      )}
      {kind === 'coin' && (
        <g>
          <circle cx="60" cy="40" r="30" fill="var(--gold)" />
          <circle cx="60" cy="40" r="22" fill="none" stroke="rgba(0,0,0,.25)" strokeWidth="2" />
          <rect x="46" y="31" width="28" height="6" rx="3" fill="rgba(0,0,0,.45)" />
          <rect x="46" y="43" width="28" height="6" rx="3" fill="rgba(0,0,0,.45)" />
        </g>
      )}
      {kind === 'vault' && (
        <g>
          <rect x="30" y="12" width="60" height="56" rx="10" fill="#1a1630" stroke="var(--gold)" strokeWidth="2" />
          <circle cx="60" cy="40" r="14" fill="none" stroke="var(--primary)" strokeWidth="4" />
          <path d="M60 26v28M46 40h28" stroke="var(--primary)" strokeWidth="3" />
        </g>
      )}
    </svg>
    </div>
  );
}

/** `onDone`: stay on this page after sign up (e.g. an invite link) and run this instead of opening the lobby. */
export function OnboardingSheet({ onDone, doneLabel }: { onDone?: () => void; doneLabel?: string } = {}) {
  const { me, setMe, toast } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [age, setAge] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const open = !!me && !me.onboarded;

  useEffect(() => {
    if (me && !me.onboarded) setName(me.displayName.startsWith('Player ') ? '' : me.displayName);
  }, [me]);

  const finish = async () => {
    if (name.trim().length < 2) return setErr('Pick a name with at least 2 letters or numbers.');
    setBusy(true);
    try {
      const r = await api('/api/me/onboard', { displayName: name.trim(), ageConfirmed: true, termsAccepted: true });
      setMe(r.user);
      if (onDone) {
        toast(`Welcome, ${r.user.displayName}.`, 'win');
        onDone();
      } else {
        toast(`Welcome, ${r.user.displayName}. Your first practice game is free.`, 'win');
        router.push('/play?first=1');
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={() => {}} title={step < 3 ? undefined : 'Almost there'}>
      <AnimatePresence mode="wait">
        {step < 3 ? (
          <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="text-center">
            <Art kind={CARDS[step]!.art} />
            <h2 className="t-title mt-4 text-[22px]">{CARDS[step]!.title}</h2>
            <p className="mx-auto mt-2 max-w-xs text-text-2">{CARDS[step]!.text}</p>
            <div className="mt-5 flex justify-center gap-1.5" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-7 bg-primary shadow-[0_0_10px_var(--primary)]' : 'w-1.5 bg-[var(--well-hover)]'}`} />
              ))}
            </div>
            <div className="mt-6 flex gap-2">
              <Button variant="ghost" full onClick={() => setStep(3)}>
                Skip
              </Button>
              <Button full onClick={() => setStep(step + 1)}>
                Next
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <label htmlFor="displayName" className="mb-1.5 block text-sm font-semibold">
              Your player name
            </label>
            <input
              id="displayName"
              value={name}
              maxLength={20}
              autoComplete="nickname"
              onChange={(e) => (setName(e.target.value), setErr(null))}
              placeholder="For example Eleni"
              className="well h-12 w-full rounded-chip px-4 text-[16px] outline-none focus:shadow-[inset_0_0_0_2px_var(--primary)]"
            />
            <p className="mt-1 text-sm text-text-2">Other players see this name. You can change it later.</p>
            <label className="mt-5 flex items-start gap-3">
              <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} className="mt-1 size-5 accent-[var(--primary)]" />
              <span>I am 18 or older.</span>
            </label>
            <label className="mt-3 flex items-start gap-3">
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1 size-5 accent-[var(--primary)]" />
              <span>
                I read <a href="/how-it-works" target="_blank" className="font-semibold text-primary">how Evens works</a>, including fees, bot targets and that this beta uses test money only.
              </span>
            </label>
            {err ? <p className="mt-3 text-sm font-medium text-loss">{err}</p> : null}
            <Button size="lg" full className="mt-6" disabled={!age || !terms} loading={busy} onClick={finish}>
              {doneLabel ?? 'Start my free practice game'}
            </Button>
            {!age || !terms ? <p className="mt-2 text-center text-sm text-text-2">Tick both boxes to continue.</p> : null}
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  );
}
