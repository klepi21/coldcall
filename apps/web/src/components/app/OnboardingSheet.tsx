'use client';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { Sheet, Button, Mascot, type MascotPose } from '@/components/ui';
import { useSession } from './Providers';
import { api } from '@/lib/api';

const CARDS = [
  { title: 'Pick a game', text: 'Chess, Backgammon, Tichu or Ice Floe Battle. Each one has a short tutorial and full rules.', pose: 'deal' as const },
  { title: 'Play free or for a stake', text: 'Practice is always free. Pick LOFI or SUI to play for a stake, and you see exactly what you can win or lose before you start. Test coins only, this is devnet.', pose: 'neutral' as const },
  { title: 'Cash out anytime', text: 'Your LOFI and SUI are each backed one to one in a public vault on Sui. Cash out to your wallet at any time, up to the daily limit.', pose: 'win' as const },
];

function Art({ pose }: { pose: MascotPose }) {
  return (
    <div className="relative mx-auto grid h-40 w-48 place-items-center" aria-hidden>
      <span className="absolute size-32 rounded-full bg-accent/25 blur-2xl" />
      <Mascot pose={pose} className="w-bob relative size-40" priority />
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
            <Art pose={CARDS[step]!.pose} />
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
                I accept the <a href="/terms" target="_blank" className="font-semibold text-primary">terms</a> and read <a href="/how-it-works" target="_blank" className="font-semibold text-primary">how Cold Call works</a>, including fees, bot targets and that this beta uses devnet test coins only.
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
