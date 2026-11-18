'use client';
import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import { useSession } from '@/components/app/Providers';
import { Button, Empty, Skeleton } from '@/components/ui';
import { AchievementsGrid, ChallengeList, CosmeticsPanel, StatsPanel, useProgress } from '@/components/progress';
import { LevelBadge, XpBar, CountUp, glass, fmtDuration, useResetIn } from '@/components/progress/parts';

const xpRules = (x: Record<string, number>): [string, string][] => [
  ['Finish a game', `+${x.finish}`],
  ['Win', `+${x.win}`],
  ['Draw', `+${x.draw}`],
  ['First game of the day', `+${x.firstToday}`],
  ['Daily challenge done', `+${x.challenge} each`],
  ['Checkmate', `+${x.chessCheckmate}`],
  ['Promote a pawn', `+${x.chessPromotion}`],
  ['Gammon or backgammon', `+${x.bgGammon} or +${x.bgBackgammon}`],
  ['Tichu call made', `+${x.tichuMade}`],
  ['Grand Tichu made', `+${x.grandMade}`],
  ['Double victory in Tichu', `+${x.doubleVictory}`],
  ['Sink a fleet in under 40 shots', `+${x.sbUnder40}`],
  ['5 hits in a row', `+${x.sbRun5}`],
  ['Sharp shooting (60% hits, 20+ shots)', `+${x.sbSharp}`],
  ['Achievements', '+25 to +150'],
];

function Section({ title, line, children, id, right }: { title: string; line?: string; children: React.ReactNode; id?: string; right?: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      id={id}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, filter: 'blur(4px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.28 }}
      className="scroll-mt-20"
    >
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[19px] font-bold uppercase leading-tight sm:text-[22px]">{title}</h2>
          {line ? <p className="mt-1 text-text-2">{line}</p> : null}
        </div>
        {right}
      </div>
      {children}
    </motion.section>
  );
}

export default function ProgressPage() {
  const { me, ready, openAuth } = useSession();
  const { data, error, reload } = useProgress();
  const resetIn = useResetIn(data?.challenges.resetsInMs);

  if (ready && !me)
    return <Empty title="Your progress" text="Sign in to earn XP, level up, take on daily challenges and unlock titles and looks. Free practice games count." action={<Button onClick={() => openAuth()}>Start playing free</Button>} />;
  if (error && !data)
    return <Empty title="We could not load your progress" text="Your games and balances are not affected. Please try again." action={<Button onClick={() => reload()}>Try again</Button>} />;
  if (!data)
    return (
      <div className="mx-auto max-w-[1200px] space-y-4">
        <Skeleton className="h-56" />
        <Skeleton className="h-40" />
        <Skeleton className="h-72" />
      </div>
    );

  const pct = data.xpInLevel / data.xpToNext;
  const unlocked = data.achievements.filter((a) => a.unlocked).length;
  const doneToday = data.challenges.items.filter((c) => c.done).length;

  return (
    <div className="mx-auto max-w-[1200px] space-y-8 pb-10">
      {/* Hero */}
      <section className={`${glass} overflow-hidden p-5 sm:p-8`}>
        <div className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-[#7c5cff]/25 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-28 right-0 size-72 rounded-full bg-[#c6ff3d]/10 blur-3xl" aria-hidden />
        <div className="relative grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
          <div className="flex min-w-0 items-center gap-4 sm:gap-6">
            <span className="shrink-0 sm:hidden">
              <LevelBadge level={data.level} pct={pct} size={96} />
            </span>
            <span className="hidden shrink-0 sm:block">
              <LevelBadge level={data.level} pct={pct} size={148} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold uppercase tracking-wider text-text-2">Your progress</p>
              <h1 className="font-display text-[28px] font-extrabold uppercase leading-none sm:text-[44px]">Level {data.level}</h1>
              <p className="mt-1 truncate text-text-2">{data.title ?? 'No title yet'}{me ? `, ${me.displayName}` : ''}</p>
              <XpBar pct={pct} height={10} className="mt-4" />
              <p className="mt-2 flex flex-wrap justify-between gap-x-2 text-sm text-text-2">
                <span className="tabular">
                  <span className="font-semibold text-text">{data.xpInLevel}</span> / {data.xpToNext} XP
                </span>
                <span className="tabular">{data.xpToNext - data.xpInLevel} XP to level {data.level + 1}</span>
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-2">
            {[
              ['Total XP', <CountUp key="x" to={data.totalXp} />],
              ['Games', <CountUp key="g" to={data.totals.games} />],
              ['Achievements', `${unlocked}/${data.achievements.length}`],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-chip bg-[color-mix(in_srgb,var(--text)_5%,transparent)] p-3 text-center">
                <dd className="font-display text-[20px] font-bold tabular sm:text-[24px]">{v}</dd>
                <dt className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-text-2">{k}</dt>
              </div>
            ))}
          </dl>
        </div>
        <div className="relative mt-5 rounded-chip p-3.5 text-[15px] leading-snug sm:p-4" style={{ background: 'color-mix(in srgb, #c6ff3d 8%, transparent)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, #c6ff3d 25%, transparent)' }}>
          <p>
            <span className="font-semibold">What is XP?</span> Points you earn by playing. Every finished game gives XP, and playing well gives more. XP fills your bar and raises your level.
          </p>
          <p className="mt-1.5 text-text-2">
            You get exactly the same XP whether you play free or with a stake. Stakes never change it. Rewards are only titles and looks, they cannot be bought and they never give coins.{' '}
            <a href="#how-xp" className="font-semibold text-primary">
              How XP works
            </a>
          </p>
        </div>
      </section>

      {/* Daily challenges */}
      <Section
        title="Today's challenges"
        line="Three free challenges, the same for everyone. Practice games count."
        right={<p className="shrink-0 text-right text-sm text-text-2"><span className="font-semibold text-text">{doneToday}/3</span> done{resetIn !== null ? <><br />New in {fmtDuration(resetIn)}</> : null}</p>}
      >
        <div className={`${glass} p-3 sm:p-4`}>
          <ChallengeList items={data.challenges.items} />
        </div>
      </Section>

      {/* Achievements */}
      <Section title="Achievements" line="Locked ones show how to unlock them. Every one can be earned in free practice." right={<p className="shrink-0 text-sm text-text-2"><span className="font-semibold text-text">{unlocked}</span> of {data.achievements.length}</p>}>
        <AchievementsGrid achievements={data.achievements} />
      </Section>

      {/* Per game */}
      <Section title="Your games" line="Your rank in each game rises with the XP you earn in it. Free games count the same.">
        <StatsPanel stats={data.stats} />
      </Section>

      {/* Cosmetics */}
      <Section title="Titles and looks" line="Unlock them with levels and achievements, then tap to wear one. Tap again to take it off.">
        <div className={`${glass} p-4 sm:p-5`}>
          <CosmeticsPanel />
          <p className="mt-4 text-sm text-text-2">Board, dice, card and ship looks are saved to your account now and show up in games as each new design arrives.</p>
        </div>
      </Section>

      {/* How XP works */}
      <Section id="how-xp" title="How XP works" line="Plain rules. The same for every game mode.">
        <div className={`${glass} grid gap-6 p-4 sm:p-6 lg:grid-cols-2`}>
          <div>
            <dl className="divide-y divide-line">
              {xpRules(data.rules.xp).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 py-2.5">
                  <dt className="text-text-2">{k}</dt>
                  <dd className="font-semibold tabular text-primary">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="space-y-3 text-[15px] leading-relaxed text-text-2">
            <p>
              <span className="font-semibold text-text">Same XP, free or staked.</span> A practice game and a staked game with the same play give exactly the same XP. How much you stake, your balance and your wins or losses in LOFI or SUI are never used.
            </p>
            <p>
              <span className="font-semibold text-text">Games count after {data.rules.minMoves} moves.</span> A game you leave or resign before making {data.rules.minMoves} moves gives no XP, so quick restarts do not count.
            </p>
            <p>
              <span className="font-semibold text-text">Levels.</span> Level 2 needs 140 XP. Each level after that needs 40 XP more than the one before, so early levels come quickly.
            </p>
            <p>
              <span className="font-semibold text-text">Daily challenges.</span> Three new ones every day at midnight UTC. They are free, practice counts, and missing a day costs you nothing.
            </p>
            <p>
              <span className="font-semibold text-text">Ranks.</span> Bronze, Silver, Gold, Platinum, Diamond and Master, per game, from the XP you earn in that game. Your skill rating is separate, see{' '}
              <Link href="/profile" className="font-semibold text-primary">
                your profile
              </Link>
              .
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}
