'use client';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Spinner, Button } from '@/components/ui';

export default function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ id: string }>(`/api/invite/${code}`)
      .then((t) => router.replace(`/table/${t.id}`))
      .catch((e) => setErr(e.message));
  }, [code, router]);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      {err ? (
        <>
          <p className="font-display text-xl font-bold uppercase">{err}</p>
          <Button onClick={() => router.push('/play')}>See open games</Button>
        </>
      ) : (
        <>
          <Spinner className="size-6 text-primary" />
          <p className="text-text-2">Opening your invite.</p>
        </>
      )}
    </div>
  );
}
