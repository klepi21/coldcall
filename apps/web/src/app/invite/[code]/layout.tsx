import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { tableShareMeta } from '@/lib/share';

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return tableShareMeta({ inviteCode: /^[0-9a-f]{8}$/.test(code) ? code : undefined, path: `/invite/${code}` });
}

export default function InviteLayout({ children }: { children: ReactNode }) {
  return children;
}
