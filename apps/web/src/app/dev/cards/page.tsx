'use client';
import { DOG, DRAGON, MAHJONG, PHOENIX } from '@coldcall/games/tichu-combos';
import { CardBack, CardFace } from '@/components/games/tichu/cards';

/** Dev only: the four Lucky Lo special cards, a normal card and the backs. */
export default function CardsDev() {
  return (
    <main className="flex min-h-dvh flex-wrap items-start gap-3 bg-[#2A5488] p-4">
      {[MAHJONG, DOG, PHOENIX, DRAGON].map((id) => (
        <div key={id} className="h-[168px] w-[120px] rounded-md shadow-lg">
          <CardFace id={id} />
        </div>
      ))}
      <div className="h-[168px] w-[120px] rounded-md shadow-lg">
        <CardBack />
      </div>
      <div className="h-[56px] w-[40px] rounded-md shadow-lg">
        <CardBack mini />
      </div>
    </main>
  );
}
