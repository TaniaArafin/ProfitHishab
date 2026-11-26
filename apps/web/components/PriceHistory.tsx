import { History } from 'lucide-react';
import { formatTaka, type ProductPriceDto } from '@ph/shared';
import { Card, CardContent } from '@/components/ui/card';
import { formatDay } from '@/lib/period';
import { cn } from '@/lib/utils';

/**
 * A product's price history, newest first: each row lasts until the next newer row of the same
 * variant. A product with variants names the variant on each row.
 */
export function PriceHistory({ prices }: { prices: ProductPriceDto[] }) {
  const latest = new Set<string>();
  const current = prices.map((p) => {
    const first = !latest.has(p.variantId);
    latest.add(p.variantId);
    return first;
  });
  return (
    <section aria-labelledby="price-history-title">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-ink-faint" />
            <h2 id="price-history-title" className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
              Price history
            </h2>
          </div>
          <ol className="flex flex-col">
            {prices.map((p, i) => (
              <li key={`${p.variantId}-${p.effectiveFrom}`} className="relative flex gap-3 pb-4 last:pb-0">
                {i < prices.length - 1 ? <span className="absolute left-[5px] top-3 h-full w-px bg-line" aria-hidden /> : null}
                <span
                  className={cn(
                    'mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ring-2 ring-card',
                    current[i] ? 'bg-brand' : 'bg-schist-300',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-semibold tabular">
                      {p.variantLabel ? <span className="mr-1.5 font-medium text-ink-muted">{p.variantLabel}</span> : null}
                      {formatTaka(p.sellingPrice)}
                    </span>
                    <span className="text-xs text-ink-faint">
                      {current[i] ? 'Current · ' : ''}from {formatDay(p.effectiveFrom)}
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
        </CardContent>
      </Card>
    </section>
  );
}
