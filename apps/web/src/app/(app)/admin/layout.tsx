'use client';
import type { ReactNode } from 'react';
import { useSession } from '@/components/app/Providers';
import { Button, Empty, Eyebrow, Skeleton } from '@/components/ui';
import { AdminTabs } from '@/components/admin/parts';

/*
 * Chart series colours, scoped to the admin area. Dark uses the game neons the rest of the app uses.
 * Light gets darker steps (validated for contrast and colour blind separation on white),
 * because the neons almost vanish on a light background.
 */
const TOKENS = `
.admin-root{--s-chess:#c6ff3d;--s-seabattle:#3ddcff;--s-backgammon:#ff8a3d;--s-tichu:#ff4d8d;--s-accent:#9b85ff;--s-lime:#c6ff3d;--s-gold:#ffd23f}
:root[data-theme="light"] .admin-root{--s-chess:#3f7d00;--s-seabattle:#1d6fd6;--s-backgammon:#e07a00;--s-tichu:#c0157a;--s-accent:#5b3df5;--s-lime:#3f7d00;--s-gold:#a87400}
`;

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { me, ready, openAuth } = useSession();
  if (!ready) return <Skeleton className="h-[480px]" />;
  if (!me) return <Empty title="Admins only" text="Sign in with an admin account to see this page." action={<Button onClick={() => openAuth()}>Sign in</Button>} />;
  if (me.role !== 'admin') return <Empty title="Admins only" text="This area is for the Cold Call team. Your account does not have admin access." />;
  return (
    <div className="admin-root space-y-5">
      <style>{TOKENS}</style>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Eyebrow className="mb-2">Cold Call team only</Eyebrow>
          <h1 className="t-display">Admin</h1>
        </div>
        <AdminTabs />
      </div>
      {children}
    </div>
  );
}
