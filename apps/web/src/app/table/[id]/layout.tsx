import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { tableShareMeta } from '@/lib/share';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const ok = /^[0-9a-f-]{36}$/.test(id);
  return tableShareMeta({ tableId: ok ? id : undefined, path: `/table/${id}` });
}

export default function TableLayout({ children }: { children: ReactNode }) {
  return children;
}
