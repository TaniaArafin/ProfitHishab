'use client';

import clsx from 'clsx';
import { Search } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { formatTaka, type ProductDto } from '@ph/shared';
import { useProductSearch } from '@/lib/hooks';

/**
 * Search-as-you-type product picker following the WAI-ARIA combobox pattern:
 * arrow keys move through results, Enter picks, Escape closes.
 */
export function ProductPicker({ onPick, error }: { onPick: (product: ProductDto) => void; error?: string }) {
  const id = useId();
  const listId = `${id}-list`;
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const { results, searching } = useProductSearch(term);
  const showList = open && results.length > 0;
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));

  function pick(product: ProductDto) {
    onPick(product);
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
      const product = results[activeIndex];
      if (product) pick(product);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <label className="label" htmlFor={`${id}-input`}>
        Add product
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
        <input
          id={`${id}-input`}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${id}-opt-${activeIndex}` : undefined}
          className="input pl-10"
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
        {results.map((p, i) => (
          <li
            key={p.id}
            id={`${id}-opt-${i}`}
            role="option"
            aria-selected={i === activeIndex}
            // mousedown, not click: it fires before the input's blur closes the list.
            onMouseDown={(e) => {
              e.preventDefault();
              pick(p);
            }}
            onMouseEnter={() => setActive(i)}
            className={clsx(
              'flex cursor-pointer items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-sm',
              i === activeIndex && 'bg-brand-soft',
            )}
          >
            <span className="min-w-0 truncate">
              {p.name} <span className="text-ink-faint">{p.sku}</span>
            </span>
            <span className="shrink-0 tabular">{formatTaka(p.sellingPrice)}</span>
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
