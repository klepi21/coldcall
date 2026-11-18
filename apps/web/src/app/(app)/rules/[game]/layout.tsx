import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { shareMeta } from '@/lib/share';

const NAMES: Record<string, string> = { chess: 'Chess', backgammon: 'Backgammon', tichu: 'Tichu', seabattle: 'Ice Floe Battle' };

export async function generateMetadata({ params }: { params: Promise<{ game: string }> }): Promise<Metadata> {
  const { game } = await params;
  const name = NAMES[game];
  if (!name) return {};
  return shareMeta({ title: `How to play ${name}`, description: `The rules of ${name} in plain words, from the basics to the fine print. Practice free on Cold Call.`, path: `/rules/${game}` });
}

export default function L({ children }: { children: ReactNode }) {
  return children;
}
