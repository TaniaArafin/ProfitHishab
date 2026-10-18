'use client';

import { Trash2 } from 'lucide-react';
import { formatTaka, type ProductDto } from '@ph/shared';
import { ProductPicker } from '@/components/ProductPicker';

export interface Line {
  key: string;
  product: ProductDto;
  quantity: number;
  /** As typed, in taka. */
  unitPrice: string;
  /** Cost on the order date, in poisha (from the price history). */
  unitCost: number;
  /** The seller typed a price: keep it when the order date changes, and send it instead of the dated price. */
  priceEdited: boolean;
}

interface Props {
  lines: Line[];
  onAdd: (product: ProductDto) => void;
  onChange: (key: string, patch: Partial<Pick<Line, 'quantity' | 'unitPrice' | 'priceEdited'>>) => void;
  onRemove: (key: string) => void;
  error?: string;
}

export function LineItems({ lines, onAdd, onChange, onRemove, error }: Props) {
  return (
    <section className="card flex flex-col gap-4 p-5" aria-labelledby="items-heading">
      <h2 id="items-heading" className="font-semibold">
        Items
      </h2>
      {lines.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line/60">
          {lines.map((line) => (
            <li key={line.key} className="flex flex-wrap items-end gap-3 py-3 first:pt-0">
              <div className="min-w-[160px] flex-1">
                <div className="font-medium">{line.product.name}</div>
                <div className="text-xs text-ink-faint">
                  {line.product.sku} · cost {formatTaka(line.unitCost)}
                  {line.product.costMissing ? <span className="ml-1 text-warn">(cost missing)</span> : null}
                </div>
              </div>
              <div className="w-20">
                <label className="label text-xs" htmlFor={`qty-${line.key}`}>
                  Qty
                </label>
                <input
                  id={`qty-${line.key}`}
                  type="number"
                  min={1}
                  className="input tabular"
                  value={line.quantity}
                  onChange={(e) => onChange(line.key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                />
              </div>
              <div className="w-28">
                <label className="label text-xs" htmlFor={`price-${line.key}`}>
                  Price (৳)
                </label>
                <input
                  id={`price-${line.key}`}
                  inputMode="decimal"
                  className="input tabular"
                  value={line.unitPrice}
                  onChange={(e) => onChange(line.key, { unitPrice: e.target.value, priceEdited: true })}
                />
              </div>
              <button
                type="button"
                className="btn-secondary px-3"
                onClick={() => onRemove(line.key)}
                aria-label={`Remove ${line.product.name}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <ProductPicker onPick={onAdd} error={error} />
    </section>
  );
}
