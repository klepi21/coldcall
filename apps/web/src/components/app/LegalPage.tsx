import type { ReactNode } from 'react';
import { Card, Eyebrow } from '@/components/ui';

/** Plain layout for the privacy and terms pages. */
export function LegalPage({ eyebrow, title, updated, children }: { eyebrow: string; title: string; updated: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="pb-2">
        <Eyebrow className="mb-2">{eyebrow}</Eyebrow>
        <h1 className="t-display">{title}</h1>
        <p className="mt-2 text-sm text-text-2">Last updated {updated}.</p>
      </div>
      <Card className="p-5 sm:p-7">
        <div className="space-y-5 text-[16px] leading-relaxed text-text-2 [&_h2]:font-display [&_h2]:text-[22px] [&_h2]:text-text [&_strong]:text-text [&_a]:font-semibold [&_a]:text-primary [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">{children}</div>
      </Card>
    </div>
  );
}
