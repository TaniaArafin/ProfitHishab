'use client';

import Link from 'next/link';
import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatTaka, UNIT_LABELS, type ProductProfitDto, type Unit } from '@ph/shared';
import { Money } from '@/components/ui';
import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

/** "3", or "2.5 kg" for any unit but piece. */
export const unitsText = (units: number, unit: Unit) => (unit === 'piece' ? String(units) : `${units} ${UNIT_LABELS[unit]}`);

/** The product-profit table body: each product with variants opens to one row per variant. */
export function ProfitRows({ rows }: { rows: ProductProfitDto[] }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return rows.map((r) => {
    const expanded = open.has(r.productId);
    const Icon = expanded ? ChevronDown : ChevronRight;
    return (
      <Fragment key={r.productId}>
        <TableRow>
          <TableCell className="max-w-[18rem]">
            <div className="flex items-start gap-1.5">
              {r.variants.length > 0 ? (
                <button
                  type="button"
                  className="mt-0.5 rounded text-ink-muted hover:text-ink"
                  aria-expanded={expanded}
                  aria-label={expanded ? `Hide variants of ${r.name}` : `Show ${r.variants.length} variants of ${r.name}`}
                  onClick={() => toggle(r.productId)}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
              <div className="min-w-0">
                <Link href={`/products/${r.productId}`} className="block truncate font-medium text-ink hover:underline">
                  {r.name}
                </Link>
                <div className="text-xs text-ink-faint">
                  {r.sku}
                  {r.variants.length > 0 ? ` · ${r.variants.length} variants` : ''}
                </div>
              </div>
            </div>
          </TableCell>
          <TableCell className="whitespace-nowrap text-right tabular">{unitsText(r.unitsSold, r.unit)}</TableCell>
          <TableCell className="text-right tabular">{formatTaka(r.sales)}</TableCell>
          <TableCell className="hidden text-right tabular text-ink-muted lg:table-cell">{formatTaka(r.cost)}</TableCell>
          <TableCell className="text-right font-medium">
            <Money value={r.profit} tone />
          </TableCell>
          <TableCell className={cn('text-right tabular', r.margin < 15 && 'text-loss')}>{r.margin}%</TableCell>
          <TableCell className={cn('text-right tabular', r.unitsReturned > 0 ? 'text-loss' : 'text-ink-faint')}>
            {r.unitsReturned}
          </TableCell>
        </TableRow>
        {expanded
          ? r.variants.map((v) => (
              <TableRow key={v.variantId} className="bg-paper/60 text-sm">
                <TableCell className="pl-10 text-ink-muted">{v.label}</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular">{unitsText(v.unitsSold, r.unit)}</TableCell>
                <TableCell className="text-right tabular">{formatTaka(v.sales)}</TableCell>
                <TableCell className="hidden text-right tabular text-ink-muted lg:table-cell">{formatTaka(v.cost)}</TableCell>
                <TableCell className="text-right">
                  <Money value={v.profit} tone />
                </TableCell>
                <TableCell className={cn('text-right tabular', v.margin < 15 && 'text-loss')}>{v.margin}%</TableCell>
                <TableCell />
              </TableRow>
            ))
          : null}
      </Fragment>
    );
  });
}
