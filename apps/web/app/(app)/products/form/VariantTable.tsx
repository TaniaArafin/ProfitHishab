'use client';

import { useState } from 'react';
import { allowsDecimal, variantLabel, type Unit } from '@ph/shared';
import { fieldError, type ApiError } from '@/lib/client-api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { usableOptions, variantRows, type OptionDraft, type RowDraft } from './drafts';

type Props = {
  options: OptionDraft[];
  rows: Record<string, RowDraft>;
  onRowsChange: (rows: Record<string, RowDraft>) => void;
  unit: Unit;
  error: ApiError | null;
};

/** One row per combination of option values: SKU (suggested when empty), price, cost, stock, on sale. */
export function VariantTable({ options, rows, onRowsChange, unit, error }: Props) {
  const [allPrice, setAllPrice] = useState('');
  const [allCost, setAllCost] = useState('');
  const list = variantRows(options, rows);
  if (list.length === 0) return null;
  const usable = usableOptions(options);

  const set = (key: string, row: RowDraft, patch: Partial<RowDraft>) => onRowsChange({ ...rows, [key]: { ...row, ...patch } });
  const applyAll = () => {
    const next = { ...rows };
    for (const { key, row } of list) {
      next[key] = { ...row, ...(allPrice.trim() ? { price: allPrice } : {}), ...(allCost.trim() ? { cost: allCost } : {}) };
    }
    onRowsChange(next);
  };
  const err = (i: number, field: string) => fieldError(error, `variants.${i}.${field}`);

  return (
    <section aria-labelledby="variants-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="variants-heading" className="text-sm font-semibold">
          Variants ({list.length})
        </h2>
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <span className="pb-2 text-ink-muted">Set all:</span>
          <Input
            aria-label="Price for all"
            placeholder="Price ৳"
            inputMode="decimal"
            className="h-9 w-24 tabular"
            value={allPrice}
            onChange={(e) => setAllPrice(e.target.value)}
          />
          <Input
            aria-label="Cost for all"
            placeholder="Cost ৳"
            inputMode="decimal"
            className="h-9 w-24 tabular"
            value={allCost}
            onChange={(e) => setAllCost(e.target.value)}
          />
          <Button type="button" variant="secondary" size="sm" className="h-9" onClick={applyAll}>
            Apply
          </Button>
        </div>
      </div>

      <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_5.5rem_5.5rem_5rem_3.5rem] gap-2 px-1 text-xs font-medium text-ink-muted md:grid">
        <span>Variant</span>
        <span>SKU</span>
        <span>Price ৳</span>
        <span>Cost ৳</span>
        <span>Stock</span>
        <span>On sale</span>
      </div>
      <ul className="flex flex-col gap-2">
        {list.map(({ key, values, row }, i) => {
          const label = variantLabel(values, usable);
          const errors = ['sku', 'sellingPrice', 'costPrice', 'stock'].map((f) => err(i, f)).filter(Boolean);
          return (
            <li key={key} className="rounded-md border border-ink/10 p-2 md:border-0 md:p-0">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_5.5rem_5.5rem_5rem_3.5rem] md:items-center">
                <span className="col-span-2 truncate px-1 text-sm font-medium md:col-span-1">{label}</span>
                <Input
                  aria-label={`SKU for ${label}`}
                  placeholder="Auto"
                  className="col-span-2 uppercase md:col-span-1"
                  value={row.sku}
                  aria-invalid={!!err(i, 'sku')}
                  onChange={(e) => set(key, row, { sku: e.target.value })}
                />
                <Input
                  aria-label={`Price for ${label}`}
                  inputMode="decimal"
                  className="tabular"
                  value={row.price}
                  aria-invalid={!!err(i, 'sellingPrice')}
                  onChange={(e) => set(key, row, { price: e.target.value })}
                />
                <Input
                  aria-label={`Cost for ${label}`}
                  inputMode="decimal"
                  className="tabular"
                  value={row.cost}
                  aria-invalid={!!err(i, 'costPrice')}
                  onChange={(e) => set(key, row, { cost: e.target.value })}
                />
                <Input
                  aria-label={`Stock for ${label}`}
                  inputMode={allowsDecimal(unit) ? 'decimal' : 'numeric'}
                  className="tabular"
                  value={row.stock}
                  aria-invalid={!!err(i, 'stock')}
                  onChange={(e) => set(key, row, { stock: e.target.value })}
                />
                <label className="flex items-center gap-2 px-1 text-sm md:justify-center">
                  <Checkbox
                    aria-label={`Sell ${label}`}
                    checked={row.active}
                    onCheckedChange={(v) => set(key, row, { active: v === true })}
                  />
                  <span className="md:sr-only">On sale</span>
                </label>
              </div>
              {errors.length > 0 ? <p className="mt-1 px-1 text-sm text-loss">{errors.join(' ')}</p> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
