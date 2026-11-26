'use client';

import { allowsDecimal, formatTaka, percent, UNITS, type CategoryDto, type Unit } from '@ph/shared';
import { fieldError, type ApiError } from '@/lib/client-api';
import { SelectField } from '@/components/SelectField';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { moneyLabels, unitName } from './drafts';

const UNIT_OPTIONS = UNITS.map((u) => ({ value: u, label: unitName(u) }));

function FieldError({ error, field }: { error: ApiError | null; field: string }) {
  const message = fieldError(error, field);
  return message ? <p className="mt-1 text-sm text-loss">{message}</p> : null;
}

type BasicProps = {
  error: ApiError | null;
  name: string;
  onName: (v: string) => void;
  sku: string;
  onSku: (v: string) => void;
  categories: CategoryDto[];
  categoryId: string;
  onCategory: (v: string) => void;
  newCategory: string;
  onNewCategory: (v: string) => void;
  unit: Unit;
  onUnit: (v: Unit) => void;
};

/** "Track expiry dates (batches)": medicine, grocery and cosmetics start with it on (spec §6). */
export function TrackingField({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <Checkbox
        className="mt-0.5"
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        aria-label="Track expiry dates (batches)"
      />
      <span>
        <span className="font-medium">Track expiry dates (batches)</span>
        <span className="block text-xs text-ink-muted">
          Stock comes in batches with an expiry date; orders take the one that expires first.
        </span>
      </span>
    </label>
  );
}

/** Name, SKU, category and the unit the product is sold by. */
export function BasicFields(p: BasicProps) {
  return (
    <>
      <div>
        <Label htmlFor="name">Product name</Label>
        <Input id="name" value={p.name} onChange={(e) => p.onName(e.target.value)} required aria-invalid={!!fieldError(p.error, 'name')} />
        <FieldError error={p.error} field="name" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="sku">SKU</Label>
          <Input id="sku" className="uppercase" value={p.sku} onChange={(e) => p.onSku(e.target.value)} placeholder="Auto: PRD-0001" />
          <FieldError error={p.error} field="sku" />
        </div>
        <div>
          <Label htmlFor="category">Category</Label>
          <SelectField
            id="category"
            value={p.categoryId}
            onValueChange={p.onCategory}
            options={[
              { value: '', label: 'No category' },
              ...p.categories.map((c) => ({ value: c.id, label: c.name })),
              { value: '__new', label: '+ New category…' },
            ]}
          />
          {p.categoryId === '__new' ? (
            <Input
              className="mt-2"
              aria-label="New category name"
              placeholder="Category name"
              value={p.newCategory}
              onChange={(e) => p.onNewCategory(e.target.value)}
            />
          ) : null}
        </div>
        <div>
          <Label htmlFor="unit">Sold by</Label>
          <SelectField id="unit" value={p.unit} onValueChange={(v) => p.onUnit(v as Unit)} options={UNIT_OPTIONS} />
          <FieldError error={p.error} field="unit" />
        </div>
      </div>
    </>
  );
}

type PricingProps = {
  error: ApiError | null;
  /** Stock comes only through Receive stock (batches); no stock box. */
  tracksBatches: boolean;
  isNew: boolean;
  unit: Unit;
  price: string;
  onPrice: (v: string) => void;
  cost: string;
  onCost: (v: string) => void;
  stock: string;
  onStock: (v: string) => void;
  priceP: number | null;
  costP: number | null;
};

/** A product without options: one price, cost and stock, with the profit per unit. */
export function PlainPricing(p: PricingProps) {
  const labels = moneyLabels(p.unit);
  const preview =
    p.priceP !== null && p.costP !== null && p.priceP > 0
      ? { gross: p.priceP - p.costP, margin: percent(p.priceP - p.costP, p.priceP) }
      : null;
  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="price">{labels.price}</Label>
          <Input id="price" inputMode="decimal" className="tabular" value={p.price} onChange={(e) => p.onPrice(e.target.value)} required />
          <FieldError error={p.error} field="sellingPrice" />
        </div>
        <div>
          <Label htmlFor="cost">{labels.cost}</Label>
          <Input id="cost" inputMode="decimal" className="tabular" value={p.cost} onChange={(e) => p.onCost(e.target.value)} required />
          <FieldError error={p.error} field="costPrice" />
        </div>
        {p.tracksBatches ? (
          <p className="col-span-2 self-end text-sm text-ink-muted sm:col-span-1">
            {p.isNew ? 'Add stock with Receive stock after saving.' : `Stock ${p.stock}. Add stock with Receive stock.`}
          </p>
        ) : (
          <div className="col-span-2 sm:col-span-1">
            <Label htmlFor="stock">{labels.stock}</Label>
            <Input
              id="stock"
              inputMode={allowsDecimal(p.unit) ? 'decimal' : 'numeric'}
              className="tabular"
              value={p.stock}
              onChange={(e) => p.onStock(e.target.value)}
            />
            <FieldError error={p.error} field="stock" />
            <FieldError error={p.error} field="variants.0.stock" />
          </div>
        )}
      </div>
      <div className="rounded-md bg-paper px-4 py-3 text-sm" aria-live="polite">
        {preview ? (
          <span>
            Gross profit <strong className={preview.gross >= 0 ? 'text-gain' : 'text-loss'}>{formatTaka(preview.gross)}</strong> per{' '}
            {p.unit === 'piece' ? 'unit' : p.unit} · margin <strong>{preview.margin}%</strong>
            {p.costP === 0 ? <span className="ml-1 text-warn">· a cost of 0 overstates profit</span> : null}
          </span>
        ) : (
          <span className="text-ink-muted">Enter price and cost to see the profit per unit.</span>
        )}
      </div>
    </>
  );
}
