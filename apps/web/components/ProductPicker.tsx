'use client';

import { Search } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { formatTaka, UNIT_LABELS, type ProductDto, type VariantDto } from '@ph/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useProductSearch } from '@/lib/hooks';
import { cn } from '@/lib/utils';

type Choice = { product: ProductDto; variant: VariantDto };

/** What can be sold: a plain product once, a product with options once per variant on sale. */
function choicesOf(products: ProductDto[]): Choice[] {
  return products.flatMap((product) => {
    // Expired stock can't be sold: a variant whose stock has all expired is left out (owner decision 2).
    const onSale = product.variants.filter((v) => v.status === 'active' && !(v.expiredStock > 0 && v.stock - v.expiredStock <= 0));
    if (product.options.length === 0) return onSale[0] ? [{ product, variant: onSale[0] }] : [];
    return onSale.map((variant) => ({ product, variant }));
  });
}

/** "Cotton Kurti — M / Red", or the name alone for a plain product. */
export const choiceName = (product: ProductDto, variant: VariantDto) =>
  variant.label ? `${product.name} — ${variant.label}` : product.name;

/**
 * Search-as-you-type product picker following the WAI-ARIA combobox pattern:
 * arrow keys move through results, Enter picks, Escape closes. Each variant is its own option.
 */
export function ProductPicker({ onPick, error }: { onPick: (product: ProductDto, variant: VariantDto) => void; error?: string }) {
  const id = useId();
  const listId = `${id}-list`;
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const { results: products, searching } = useProductSearch(term);
  const results = choicesOf(products);
  const showList = open && results.length > 0;
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));

  function pick({ product, variant }: Choice) {
    onPick(product, variant);
    setTerm('');
    setActive(0);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && results.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp' && results.length) {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter' && showList) {
      e.preventDefault(); // pick the product, do not submit the order
      const choice = results[activeIndex];
      if (choice) pick(choice);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <Label htmlFor={`${id}-input`}>Add product</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
        <Input
          id={`${id}-input`}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${id}-opt-${activeIndex}` : undefined}
          className="pl-10"
          placeholder="Search by name or SKU"
          value={term}
          autoComplete="off"
          onChange={(e) => {
            setTerm(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setOpen(false)}
        />
      </div>
      <ul
        id={listId}
        role="listbox"
        aria-label="Matching products"
        hidden={!showList}
        className="absolute z-10 mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl border border-line bg-card p-1 shadow-lift"
      >
        {results.map((c, i) => (
          <li
            key={c.variant.id}
            id={`${id}-opt-${i}`}
            role="option"
            aria-selected={i === activeIndex}
            // mousedown, not click: it fires before the input's blur closes the list.
            onMouseDown={(e) => {
              e.preventDefault();
              pick(c);
            }}
            onMouseEnter={() => setActive(i)}
            className={cn(
              'flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm',
              i === activeIndex && 'bg-brand-soft',
            )}
          >
            <span className="min-w-0 truncate">
              {choiceName(c.product, c.variant)} <span className="text-ink-faint">{c.variant.sku}</span>
            </span>
            <span className="shrink-0 text-right tabular">
              {formatTaka(c.variant.sellingPrice)}
              {c.product.unit === 'piece' ? '' : ` / ${UNIT_LABELS[c.product.unit]}`}
              <span className="block text-xs text-ink-faint">
                {Math.round((c.variant.stock - c.variant.expiredStock) * 1000) / 1000}{' '}
                {c.product.unit === 'piece' ? 'in stock' : `${UNIT_LABELS[c.product.unit]} in stock`}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {term.trim() && !searching && results.length === 0 ? (
        <p className="mt-1.5 text-sm text-ink-faint" role="status">
          No matching products. Add it on the Products page first.
        </p>
      ) : null}
      {error ? <p className="mt-1.5 text-sm text-loss">{error}</p> : null}
    </div>
  );
}
