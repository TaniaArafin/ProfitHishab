import type { Metadata } from 'next';
import { PieChart } from 'lucide-react';
import Link from 'next/link';
import { formatTaka, type CategoryDto, type ProductProfitDto, type ProductProfitReportDto } from '@ph/shared';
import { PeriodSelector } from '@/components/PeriodSelector';
import { SelectField } from '@/components/SelectField';
import { EmptyState, Money, PageHeader } from '@/components/ui';
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

          <form className="card flex flex-wrap items-end gap-2 p-3" action="/reports/products">
            {period.preset === 'custom' ? (
              <>
                <input type="hidden" name="from" value={period.from} />
                <input type="hidden" name="to" value={period.to} />
              </>
            ) : (
              <input type="hidden" name="period" value={period.preset} />
            )}
            <div className="min-w-[200px] flex-1">
              <label className="sr-only" htmlFor="q">
                Search
              </label>
              <input id="q" name="q" className="input" placeholder="Name or SKU" defaultValue={typeof sp.q === 'string' ? sp.q : ''} />
            </div>
            <label className="sr-only" htmlFor="categoryId">
              Category
            </label>
            <SelectField
              id="categoryId"
              name="categoryId"
              className="w-auto min-w-[10rem]"
              defaultValue={typeof sp.categoryId === 'string' ? sp.categoryId : ''}
              options={[{ value: '', label: 'All categories' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
            />
            <button className="btn-secondary" type="submit">
              Apply
            </button>
          </form>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line/70 bg-paper/50">
                  <tr>
                    <th className="th">Product</th>
                    <th className="th text-right">Units</th>
                    <th className="th text-right">Sales</th>
                    <th className="th text-right">Cost</th>
                    <th className="th text-right">Profit</th>
                    <th className="th text-right">Margin</th>
                    <th className="th text-right">Returned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {report.rows.map((r) => (
                    <tr key={r.productId} className="hover:bg-paper/60">
                      <td className="td">
                        <Link href={`/products/${r.productId}`} className="font-medium text-ink hover:underline">
                          {r.name}
                        </Link>
                        <div className="text-xs text-ink-faint">{r.sku}</div>
                      </td>
                      <td className="td text-right tabular">{r.unitsSold}</td>
                      <td className="td text-right tabular">{formatTaka(r.sales)}</td>
                      <td className="td text-right tabular text-ink-muted">{formatTaka(r.cost)}</td>
                      <td className="td text-right font-medium">
                        <Money value={r.profit} tone />
                      </td>
                      <td className={`td text-right tabular ${r.margin < 15 ? 'text-loss' : ''}`}>{r.margin}%</td>
                      <td className={`td text-right tabular ${r.unitsReturned > 0 ? 'text-loss' : 'text-ink-faint'}`}>{r.unitsReturned}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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
    <div className="card card-hover flex flex-col gap-1 p-4">
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      {row ? (
        <>
          <span className="truncate font-semibold">{row.name}</span>
          <span className={`text-sm tabular ${bad ? 'text-loss' : ''}`}>{value}</span>
        </>
      ) : (
        <span className="text-sm text-ink-faint">Not enough sales yet</span>
      )}
    </div>
  );
}
