'use client';
import { CURRENCIES } from '@coldcall/shared';
import { CoinChip } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { useSession } from './Providers';

/**
 * LOFI or SUI. Picks the coin for the wallet, game setup, stakes, results and history. The two coins are
 * separate balances and are never exchanged, so this only changes what you look at and play with.
 */
export function CurrencySwitch({ className = '' }: { className?: string }) {
  const { currency, setCurrency } = useSession();
  return (
    <div role="radiogroup" aria-label="Coin to play with" className={`glass inline-flex h-11 items-center gap-0.5 rounded-full p-1 ${className}`}>
      {CURRENCIES.map((c) => {
        const on = c === currency;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => {
              if (!on) {
                haptic();
                setCurrency(c);
              }
            }}
            className={`press inline-flex h-9 items-center gap-1 rounded-full px-2 text-[12px] font-bold sm:gap-1.5 sm:px-2.5 sm:text-[13px] transition-colors ${on ? 'bg-well-hover text-text shadow-[inset_0_0_0_1px_var(--well-line)]' : 'text-text-2 hover:text-text'}`}
          >
            <CoinChip currency={c} className="size-[18px] sm:size-5" />
            {c}
          </button>
        );
      })}
    </div>
  );
}
