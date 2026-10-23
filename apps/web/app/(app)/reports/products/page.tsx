import type { Metadata } from 'next';
import { PieChart } from 'lucide-react';
import Link from 'next/link';
import { formatTaka, type CategoryDto, type ProductProfitDto, type ProductProfitReportDto } from '@ph/shared';
import { PeriodSelector } from '@/components/PeriodSelector';
import { SelectField } from '@/components/SelectField';
import { EmptyState, Money, PageHeader, TableCard } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { periodFromParams, periodLabel } from '@/lib/period';
import { apiGet, qs } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Product profitability' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ProductProfitPage({ searchParams }: Props) {
  const sp = await searchParams;
  const period = periodFromParams(sp);
  const filters = qs(sp, ['categoryId', 'q']);
  const [{ data: report }, { data: categories }] = await Promise.all([
    apiGet<{ data: ProductProfitReportDto }>(`/profit/products?${period.query}${filters ? `&${filters}` : ''}`),
    apiGet<{ data: CategoryDto[] }>('/categories'),
  ]);
  const { mostProfitable, highestRevenue, lowestMargin } = report.highlights;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={PieChart}
        title="Product profitability"
        description={`${periodLabel(period.from, period.to)} · delivered orders only`}
        actions={<PeriodSelector preset={period.preset} from={period.from} to={period.to} />}
      />

      {report.rows.length === 0 ? (
        <EmptyState
          icon={PieChart}
          title="No delivered orders in this period"
          body="Product profit appears once orders are marked delivered."
        />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3" aria-label="Highlights">
            <Highlight
              label="Most profitable"
              row={mostProfitable}
              value={mostProfitable ? <Money value={mostProfitable.profit} tone /> : null}
            />
            <Highlight label="Highest revenue" row={highestRevenue} value={highestRevenue ? formatTaka(highestRevenue.sales) : null} />
            <Highlight label="Lowest margin (5+ sold)" row={lowestMargin} value={lowestMargin ? `${lowestMargin.margin}%` : null} bad />
          </section>
          {mostProfitable && highestRevenue && mostProfitable.productId !== highestRevenue.productId ? (
            <p className="text-sm text-ink-muted">
              <strong className="text-ink">{highestRevenue.name}</strong> brings the most revenue, but{' '}
              <strong className="text-ink">{mostProfitable.name}</strong> earns you the most profit.
            </p>
          ) : null}

          <Card>
            <form className="flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap sm:items-end" action="/reports/products">
              {period.preset === 'custom' ? (
                <>
                  <input type="hidden" name="from" value={period.from} />
                  <input type="hidden" name="to" value={period.to} />
                </>
              ) : (
                <input type="hidden" name="period" value={period.preset} />
              )}
              <div className="sm:min-w-[200px] sm:flex-1">
                <Label className="sr-only" htmlFor="q">
                  Search
                </Label>
                <Input id="q" name="q" type="search" placeholder="Name or SKU" defaultValue={typeof sp.q === 'string' ? sp.q : ''} />
              </div>
              <div>
                <Label className="sr-only" htmlFor="categoryId">
                  Category
                </Label>
                <SelectField
                  id="categoryId"
                  name="categoryId"
                  className="sm:w-auto sm:min-w-[10rem]"
                  defaultValue={typeof sp.categoryId === 'string' ? sp.categoryId : ''}
                  options={[{ value: '', label: 'All categories' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
                />
              </div>
              <Button variant="secondary" type="submit">
                Apply
              </Button>
            </form>
          </Card>

          {/* Tablet and up: table */}
          <TableCard className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Cost</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">Returned</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((r) => (
                  <TableRow key={r.productId}>
                    <TableCell className="max-w-[18rem]">
                      <Link href={`/products/${r.productId}`} className="block truncate font-medium text-ink hover:underline">
                        {r.name}
                      </Link>
                      <div className="text-xs text-ink-faint">{r.sku}</div>
                    </TableCell>
                    <TableCell className="text-right tabular">{r.unitsSold}</TableCell>
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
                ))}
              </TableBody>
            </Table>
          </TableCard>

          {/* Phone: stacked cards */}
          <ul className="flex flex-col gap-2 md:hidden">
            {report.rows.map((r) => (
              <li key={r.productId}>
                <Card className="flex flex-col gap-2 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/products/${r.productId}`} className="block truncate font-semibold text-ink hover:underline">
                        {r.name}
                      </Link>
                      <div className="text-xs text-ink-faint">{r.sku}</div>
                    </div>
                    <Money value={r.profit} tone className="shrink-0 font-semibold" />
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-ink-faint">Sales</dt>
                      <dd className="tabular">{formatTaka(r.sales)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-faint">Units</dt>
                      <dd className="tabular">
                        {r.unitsSold}
                        {r.unitsReturned > 0 ? <span className="text-loss"> · {r.unitsReturned} back</span> : null}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-faint">Margin</dt>
                      <dd className={cn('tabular', r.margin < 15 && 'text-loss')}>{r.margin}%</dd>
                    </div>
                  </dl>
                </Card>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-faint">
            Order discounts are split across items by value. Courier, packaging and ad costs are not split across products yet; they appear
            on the dashboard.
          </p>
        </>
      )}
    </div>
  );
}

function Highlight({ label, row, value, bad }: { label: string; row: ProductProfitDto | null; value: React.ReactNode; bad?: boolean }) {
  return (
    <Card className="flex min-w-0 hover:-translate-y-0.5 hover:border-schist-300 hover:shadow-lift flex-col gap-1 p-4">
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      {row ? (
        <>
          <span className="truncate font-semibold">{row.name}</span>
          <span className={`text-sm tabular ${bad ? 'text-loss' : ''}`}>{value}</span>
        </>
      ) : (
        <span className="text-sm text-ink-faint">Not enough sales yet</span>
      )}
    </Card>
  );
}
