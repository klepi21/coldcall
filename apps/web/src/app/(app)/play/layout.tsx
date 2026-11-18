import type { ReactNode } from 'react';
import { shareMeta } from '@/lib/share';

export const metadata = shareMeta({ title: 'Pick your world', description: 'Chess, backgammon, Tichu and Ice Floe Battle. Practice free, play the bot, or find a real opponent.', path: '/play' });

export default function L({ children }: { children: ReactNode }) {
  return children;
}
