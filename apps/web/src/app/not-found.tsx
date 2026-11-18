import Link from 'next/link';
import { Cosmos, Mascot } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="page-root relative isolate grid min-h-dvh place-items-center px-4">
      <Cosmos />
      <div className="glass flex w-full max-w-md flex-col items-center gap-3 rounded-sheet px-6 pb-8 pt-4 text-center">
        <Mascot pose="shrug" className="size-40" label priority />
        <h1 className="t-display">Nothing on this table</h1>
        <p className="text-text-2">This page does not exist, or it melted. Lucky Lo checked twice.</p>
        <Link href="/" className="btn-primary press mt-2 inline-flex h-12 items-center rounded-chip px-6 font-display text-[18px]">
          Back to Cold Call
        </Link>
      </div>
    </main>
  );
}
