'use client';

import { Trash2 } from 'lucide-react';
import { allowsDecimal, formatTaka, hasAtMostDecimals, UNIT_LABELS, type ProductDto, type VariantDto } from '@ph/shared';
import { choiceName, ProductPicker } from '@/components/ProductPicker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface Line {
  key: string;
  product: ProductDto;
  /** What is sold: the plain product's only variant, or the one picked ("M / Red"). */
  variant: VariantDto;
  /** As typed: "2", "2.5". */
  quantity: string;
  /** As typed, in taka. */
  unitPrice: string;
  /** Cost on the order date, in poisha (from the price history). */
  unitCost: number;
  /** The seller typed a price: keep it when the order date changes, and send it instead of the dated price. */
  priceEdited: boolean;
}

/** The quantity as a number; NaN when it is not one. */
export const quantityOf = (line: Line) => (line.quantity.trim() === '' ? Number.NaN : Number(line.quantity));

/** Why a line's quantity can't be saved, or null. Piece, pack, strip…: whole numbers only. */
export function quantityProblem(line: Line): string | null {
  const q = quantityOf(line);
  if (!Number.isFinite(q) || q <= 0) return 'Enter a quantity above 0';
  if (!allowsDecimal(line.product.unit) && !Number.isInteger(q)) return 'Use a whole number';
  if (!hasAtMostDecimals(q)) return 'Use at most 3 decimals';
  return null;
}

interface Props {
  lines: Line[];
  onAdd: (product: ProductDto, variant: VariantDto) => void;
  onChange: (key: string, patch: Partial<Pick<Line, 'quantity' | 'unitPrice' | 'priceEdited'>>) => void;
  onRemove: (key: string) => void;
  error?: string;
}

export function LineItems({ lines, onAdd, onChange, onRemove, error }: Props) {
  return (
    <Card role="region" aria-labelledby="items-heading">
      <CardHeader>
        <CardTitle id="items-heading">Items</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {lines.length > 0 ? (
          <ul className="flex flex-col divide-y divide-line/60">
            {lines.map((line) => {
              const problem = quantityProblem(line);
              const unit = line.product.unit;
              return (
                // Phone: name and remove on one row, qty and price below. Wider: one row.
                <li
                  key={line.key}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3 first:pt-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{choiceName(line.product, line.variant)}</div>
                    <div className="text-xs text-ink-faint">
                      {line.variant.sku} · cost {formatTaka(line.unitCost)}
                      {unit === 'piece' ? '' : ` per ${UNIT_LABELS[unit]}`}
                      {line.product.costMissing ? <span className="ml-1 text-warn">(cost missing)</span> : null}
                    </div>
                  </div>
                  <div className="col-span-2 grid grid-cols-2 gap-3 sm:col-span-1 sm:flex">
                    <div className="sm:w-24">
                      <Label className="text-xs" htmlFor={`qty-${line.key}`}>
                        {unit === 'piece' ? 'Qty' : `Qty (${UNIT_LABELS[unit]})`}
                      </Label>
                      <Input
                        id={`qty-${line.key}`}
                        inputMode={allowsDecimal(unit) ? 'decimal' : 'numeric'}
                        className="tabular"
                        value={line.quantity}
                        aria-invalid={!!problem}
                        aria-describedby={problem ? `qty-${line.key}-error` : undefined}
                        onChange={(e) => onChange(line.key, { quantity: e.target.value })}
                      />
                      {problem ? (
                        <p id={`qty-${line.key}-error`} className="mt-1 text-xs text-loss">
                          {problem}
                        </p>
                      ) : null}
                    </div>
                    <div className="sm:w-28">
                      <Label className="text-xs" htmlFor={`price-${line.key}`}>
                        Price (৳)
                      </Label>
                      <Input
                        id={`price-${line.key}`}
                        inputMode="decimal"
                        className="tabular"
                        value={line.unitPrice}
                        onChange={(e) => onChange(line.key, { unitPrice: e.target.value, priceEdited: true })}
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="col-start-2 row-start-1 self-start sm:col-start-auto sm:row-start-auto sm:self-end"
                    onClick={() => onRemove(line.key)}
                    aria-label={`Remove ${choiceName(line.product, line.variant)}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}
        <ProductPicker onPick={onAdd} error={error} />
      </CardContent>
    </Card>
  );
}
