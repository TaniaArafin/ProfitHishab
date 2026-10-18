import { History } from 'lucide-react';
import { formatTaka, type ProductPriceDto } from '@ph/shared';
import { formatDay } from '@/lib/period';

/** A product's price history, newest first: each row lasts until the one above it. */
export function PriceHistory({ prices }: { prices: ProductPriceDto[] }) {
  return (
    <section className="card flex flex-col gap-4 p-5" aria-labelledby="price-history-title">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-ink-faint" />
        <h2 id="price-history-title" className="section-title">
          Price history
        </h2>
      </div>
      <ol className="flex flex-col">
        {prices.map((p, i) => (
          <li key={p.effectiveFrom} className="relative flex gap-3 pb-4 last:pb-0">
            {i < prices.length - 1 ? <span className="absolute left-[5px] top-3 h-full w-px bg-line" aria-hidden /> : null}
            <span className={`mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ring-2 ring-card ${i === 0 ? 'bg-brand' : 'bg-schist-300'}`} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-semibold tabular">{formatTaka(p.sellingPrice)}</span>
                <span className="text-xs text-ink-faint">
                  {i === 0 ? 'Current · ' : ''}from {formatDay(p.effectiveFrom)}
                </span>
              </div>
              <div className="text-sm text-ink-muted tabular">
                Cost {formatTaka(p.costPrice)} · profit {formatTaka(p.sellingPrice - p.costPrice)}
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-xs text-ink-faint">Each order uses the price in effect on its order date.</p>
    </section>
  );
}
