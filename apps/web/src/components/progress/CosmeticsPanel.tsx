'use client';
import { useState } from 'react';
import type { CosmeticSlot, ProgressResponse } from '@coldcall/shared';
import { Skeleton, Spinner } from '@/components/ui';
import { useSession } from '@/components/app/Providers';
import { api } from '@/lib/api';
import { play } from '@/lib/sound';
import { setProgressData, useProgress } from './store';
import { Icon, tint } from './parts';

const SLOTS: { slot: CosmeticSlot; label: string; line: string; color: string }[] = [
  { slot: 'title', label: 'Titles', line: 'Shown under your name.', color: '#c6ff3d' },
  { slot: 'frame', label: 'Profile frames', line: 'A ring around your avatar.', color: '#7c5cff' },
  { slot: 'chessTheme', label: 'Chess boards', line: 'A new look for your chess board.', color: '#c6ff3d' },
  { slot: 'dice', label: 'Dice', line: 'Your backgammon dice.', color: '#ff8a3d' },
  { slot: 'cardBack', label: 'Card backs', line: 'The back of your Tichu cards.', color: '#ff4d8d' },
  { slot: 'shipSkin', label: 'Ship skins', line: 'How your Sea Battle fleet looks.', color: '#3ddcff' },
];

/** Titles, frames and looks you can equip. Locked ones say exactly how to get them. All cosmetic, none can be bought. */
export function CosmeticsPanel() {
  const { data } = useProgress();
  const { toast } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  if (!data) return <Skeleton className="h-64" />;

  const toggle = async (c: ProgressResponse['cosmetics'][number]) => {
    if (!c.unlocked) return toast(`${c.name} is locked. ${c.how}`);
    setBusy(`${c.slot}:${c.id}`);
    try {
      const r = await api<ProgressResponse>('/api/progress/equip', { slot: c.slot, id: c.equipped ? null : c.id });
      setProgressData(r);
      play('tap');
      toast(c.equipped ? `${c.name} taken off.` : `${c.name} equipped.`);
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {SLOTS.map((s) => {
        const items = data.cosmetics.filter((c) => c.slot === s.slot);
        return (
          <div key={s.slot}>
            <p className="font-semibold">{s.label}</p>
            <p className="text-sm text-text-2">{s.line}</p>
            <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {items.map((c) => {
                const id = `${c.slot}:${c.id}`;
                return (
                  <li key={id}>
                    <button
                      onClick={() => toggle(c)}
                      aria-pressed={c.equipped}
                      aria-label={c.unlocked ? `${c.name}${c.equipped ? ', equipped. Tap to take off.' : '. Tap to equip.'}` : `${c.name}, locked. ${c.how}`}
                      className="flex h-full min-h-[56px] w-full flex-col justify-center rounded-chip px-3 py-2 text-left transition active:scale-[0.97]"
                      style={
                        c.equipped
                          ? { background: s.color, color: '#0a0a0f', boxShadow: `0 0 16px ${tint(s.color, 45)}` }
                          : c.unlocked
                            ? { background: tint(s.color, 12), color: 'var(--text)', boxShadow: `inset 0 0 0 1px ${tint(s.color, 40)}` }
                            : { background: 'color-mix(in srgb, var(--text) 5%, transparent)', color: 'var(--text-2)' }
                      }
                    >
                      <span className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
                        {busy === id ? <Spinner className="size-3.5" /> : !c.unlocked ? <Icon name="lock" className="size-3.5 shrink-0" /> : c.equipped ? <Icon name="check" className="size-4 shrink-0" /> : null}
                        {c.name}
                      </span>
                      <span className={`mt-0.5 text-xs leading-snug ${c.equipped ? 'opacity-75' : 'text-text-2'}`}>{c.equipped ? 'Wearing it. Tap to take off.' : c.unlocked ? 'Tap to wear it.' : c.how}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
