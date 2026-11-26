import type { Metadata } from 'next';
import { Package, Pencil, Plus, Search, SearchX } from 'lucide-react';
import Link from 'next/link';
import { formatTaka, UNIT_LABELS, type CategoryDto, type ExpirySummaryDto, type Paginated, type ProductDto } from '@ph/shared';
import { SelectField } from '@/components/SelectField';
import { Banner, EmptyState, PageHeader, Pagination, TableCard } from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { apiGet, qs } from '@/lib/server-api';
import { ClearStockButton } from './ClearStockButton';
import { priceText, stockText, variantsText } from './display';

export const metadata: Metadata = { title: 'Products' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const KEYS = ['q', 'categoryId', 'status', 'costMissing', 'expiry', 'sort', 'page'];

export default async function ProductsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const status = typeof sp.status === 'string' ? sp.status : 'active';
  const [products, categories, missing, { data: expiry }] = await Promise.all([
    apiGet<Paginated<ProductDto>>(`/products?${qs({ ...sp, status }, KEYS)}`),
    apiGet<{ data: CategoryDto[] }>('/categories'),
    apiGet<{ data: unknown[] }>('/products/missing-cost'),
    apiGet<{ data: ExpirySummaryDto }>('/products/expiry-summary'),
  ]);
  const value = (k: string) => (typeof sp[k] === 'string' ? sp[k] : '');
  const keep = Object.fromEntries(KEYS.filter((k) => k !== 'page').map((k) => [k, value(k) || undefined]));
  const filtered = Boolean(value('q') || value('categoryId') || value('costMissing') || value('expiry'));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={Package}
        title="Products"
        actions={
          <Button asChild>
            <Link href="/products/new">
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              New product
            </Link>
          </Button>
        }
      />

      {missing.data.length > 0 ? (
        <Banner tone="warn">
          <strong>{missing.data.length === 1 ? '1 product has' : `${missing.data.length} products have`} no cost.</strong> Profit for them
          is overstated.{' '}
          <Link href="/products/missing-cost" className="font-semibold underline">
            Fill in costs
          </Link>
        </Banner>
      ) : null}

      {expiry.expired.products > 0 && value('expiry') !== 'expired' ? (
        <Banner tone="warn">
          <strong>{expiry.expired.products === 1 ? '1 product has' : `${expiry.expired.products} products have`} expired stock</strong> (
          {formatTaka(expiry.expired.cost)} at cost). It can&apos;t be sold.{' '}
          <Link href="/products?expiry=expired" className="font-semibold underline">
            See and clear it
          </Link>
        </Banner>
      ) : null}

      <Card>
        <form className="grid grid-cols-2 gap-2 p-3 sm:flex sm:flex-wrap sm:items-end" action="/products">
          <div className="col-span-2 sm:min-w-[200px] sm:flex-1">
            <Label className="sr-only" htmlFor="q">
              Search
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <Input id="q" name="q" type="search" className="pl-10" placeholder="Name or SKU" defaultValue={value('q')} />
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Label className="sr-only" htmlFor="categoryId">
              Category
            </Label>
            <SelectField
              id="categoryId"
              name="categoryId"
              className="sm:w-auto sm:min-w-[10rem]"
              defaultValue={value('categoryId')}
              options={[{ value: '', label: 'All categories' }, ...categories.data.map((c) => ({ value: c.id, label: c.name }))]}
            />
          </div>
          <div>
            <Label className="sr-only" htmlFor="status">
              Status
            </Label>
            <SelectField
              id="status"
              name="status"
              className="sm:w-auto sm:min-w-[8rem]"
              defaultValue={status}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'archived', label: 'Archived' },
              ]}
            />
          </div>
          <div>
            <Label className="sr-only" htmlFor="expiry">
              Expiry
            </Label>
            <SelectField
              id="expiry"
              name="expiry"
              className="sm:w-auto sm:min-w-[9rem]"
              defaultValue={value('expiry')}
              options={[
                { value: '', label: 'Any expiry' },
                { value: 'expired', label: 'Expired stock' },
                { value: 'soon', label: 'Expiring in 30 days' },
              ]}
            />
          </div>
          <div>
            <Label className="sr-only" htmlFor="sort">
              Sort
            </Label>
            <SelectField
              id="sort"
              name="sort"
              className="sm:w-auto sm:min-w-[10rem]"
              defaultValue={value('sort') || 'name'}
              options={[
                { value: 'name', label: 'Name A–Z' },
                { value: '-margin', label: 'Highest margin' },
                { value: 'margin', label: 'Lowest margin' },
                { value: '-price', label: 'Highest price' },
                { value: 'stock', label: 'Lowest stock' },
                { value: '-created', label: 'Newest' },
              ]}
            />
          </div>
          <Button variant="secondary" type="submit" className="col-span-2 sm:col-span-1">
            Apply
          </Button>
        </form>
      </Card>

      {products.data.length === 0 ? (
        filtered || status === 'archived' ? (
          <EmptyState icon={SearchX} title="No products match" body="Try another search or filter." />
        ) : (
          <EmptyState
            icon={Package}
            title="Add your first product"
            body="Enter the selling price and what the product costs you. Profit is calculated from both."
            actions={
              <Button asChild>
                <Link href="/products/new">New product</Link>
              </Button>
            }
          />
        )
      ) : (
        <>
          {/* Tablet and up: table */}
          <TableCard className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Product</TableHead>
                  <TableHead className="hidden lg:table-cell">Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.data.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-[18rem]">
                      <Link href={`/products/${p.id}`} className="block truncate font-medium text-ink hover:underline">
                        {p.name}
                      </Link>
                      <div className="text-xs text-ink-faint">
                        {p.sku}
                        {variantsText(p) ? ` · ${variantsText(p)}` : ''}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-ink-muted lg:table-cell">{p.categoryName ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular">{priceText(p)}</TableCell>
                    <TableCell className="text-right tabular">{p.costMissing ? <CostMissingBadge /> : formatTaka(p.costPrice)}</TableCell>
                    <TableCell className={cn('text-right tabular', p.margin < 15 && 'text-loss')}>
                      {p.costMissing ? '—' : `${p.margin}%`}
                    </TableCell>
                    <TableCell className={cn('whitespace-nowrap text-right tabular', p.stock < 0 && 'font-semibold text-loss')}>
                      {stockText(p)}
                      {p.expiredStock > 0 ? <ExpiredNote product={p} /> : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {p.expiredStock > 0 ? (
                        <span className="mr-2 inline-block">
                          <ClearStockButton product={p} />
                        </span>
                      ) : null}
                      <Button asChild variant="secondary" size="sm">
                        <Link href={`/products/${p.id}`} aria-label={`Edit ${p.name}`}>
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>

          {/* Phone: stacked cards */}
          <ul className="flex flex-col gap-2 md:hidden">
            {products.data.map((p) => (
              <li key={p.id}>
                <Card className="flex flex-col gap-2 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/products/${p.id}`} className="block truncate font-semibold text-ink hover:underline">
                        {p.name}
                      </Link>
                      <div className="truncate text-xs text-ink-faint">
                        {p.sku}
                        {variantsText(p) ? ` · ${variantsText(p)}` : ''}
                        {p.categoryName ? ` · ${p.categoryName}` : ''}
                      </div>
                    </div>
                    <span className="shrink-0 font-semibold tabular">{priceText(p)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
                    <span>
                      Cost {p.costMissing ? <CostMissingBadge /> : <span className="tabular text-ink">{formatTaka(p.costPrice)}</span>}
                    </span>
                    {p.costMissing ? null : (
                      <span>
                        Margin <span className={cn('tabular', p.margin < 15 ? 'text-loss' : 'text-ink')}>{p.margin}%</span>
                      </span>
                    )}
                    <span>
                      Stock <span className={cn('tabular', p.stock < 0 ? 'font-semibold text-loss' : 'text-ink')}>{stockText(p)}</span>
                    </span>
                    {p.expiredStock > 0 ? (
                      <span className="flex w-full items-center justify-between gap-2">
                        <ExpiredNote product={p} />
                        <ClearStockButton product={p} />
                      </span>
                    ) : null}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <Pagination
            page={products.meta.page}
            perPage={products.meta.perPage}
            total={products.meta.total}
            path="/products"
            params={keep}
          />
        </>
      )}
    </div>
  );
}

function CostMissingBadge() {
  return (
    <Badge variant="warning" className="rounded px-1.5 py-0.5 ring-0">
      Cost missing
    </Badge>
  );
}

/** "✕ Expired: 60 strip (৳480)": stock that can't be sold until cleared. */
function ExpiredNote({ product }: { product: ProductDto }) {
  const unit = product.unit === 'piece' ? '' : ` ${UNIT_LABELS[product.unit]}`;
  return (
    <span className="block text-xs font-medium text-loss">
      ✕ Expired: {product.expiredStock}
      {unit} ({formatTaka(product.expiredCost)})
    </span>
  );
}
