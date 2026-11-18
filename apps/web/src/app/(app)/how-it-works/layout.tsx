import type { ReactNode } from 'react';
import { shareMeta } from '@/lib/share';

export const metadata = shareMeta({ title: 'How Cold Call works', description: 'Money, fees, the fair bot, provably fair dice and shuffles, and the public vaults on Sui, explained in plain words.', path: '/how-it-works' });

export default function L({ children }: { children: ReactNode }) {
  return children;
}
