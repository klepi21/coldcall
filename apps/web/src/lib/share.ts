import type { Metadata } from 'next';
import type { TableSummary } from '@evens/shared';

/** Absolute site URL used for share previews. Set NEXT_PUBLIC_SITE_URL when the domain changes. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://45-81-6-214.sslip.io';
const API = process.env.API_ORIGIN ?? 'http://localhost:4000';

const GAME_NAME: Record<TableSummary['game'], string> = { chess: 'Chess', backgammon: 'Backgammon', tichu: 'Tichu', seabattle: 'Sea Battle' };
const credits = (minor: number) => (minor / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

export function shareMeta({ title, description, image = '/og/default.png', path = '/' }: { title: string; description: string; image?: string; path?: string }): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'website', siteName: 'Evens', url: path, title, description, locale: 'en_US', images: [{ url: image, width: 1200, height: 630, alt: title }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(2500), cache: 'no-store' });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Preview for a shared table or invite link: game, stake and who is waiting. */
export async function tableShareMeta(opts: { tableId?: string; inviteCode?: string; path: string }): Promise<Metadata> {
  let id = opts.tableId;
  if (!id && opts.inviteCode) id = (await fetchJson<{ id: string }>(`/api/invite/${opts.inviteCode}`))?.id;
  const t = id ? (await fetchJson<{ table: TableSummary }>(`/api/tables/${id}`))?.table : null;
  if (!t) return shareMeta({ title: 'Join a game on Evens', description: 'Chess, backgammon, Tichu and Sea Battle against real people. Winner takes the pot.', path: opts.path });

  const game = GAME_NAME[t.game];
  const host = t.seats.find((s) => s.userId && !s.isBot)?.name;
  const stake = t.mode === 'practice' || t.stake === 0 ? 'Free game' : `${credits(t.stake)} credit stake`;
  const title = host ? `${host} invited you to ${game}` : `Join a ${game} table on Evens`;
  const description =
    t.status === 'waiting'
      ? `${stake}. ${t.mode === 'pvp' ? 'Winner takes the pot.' : ''} Tap to take your seat.`.replace(/\s+/g, ' ')
      : `${game} on Evens. ${stake}. Tap to watch or play your own game.`;
  return shareMeta({ title, description, image: `/og/${t.game}.png`, path: opts.path });
}
