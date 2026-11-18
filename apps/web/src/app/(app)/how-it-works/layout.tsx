import type { ReactNode } from 'react';
import { shareMeta } from '@/lib/share';

export const metadata = shareMeta({ title: 'How Evens works', description: 'Money, fees, the fair bot, provably fair dice and shuffles, and the public Solana vault, explained in plain words.', path: '/how-it-works' });

export default function L({ children }: { children: ReactNode }) {
  return children;
}
