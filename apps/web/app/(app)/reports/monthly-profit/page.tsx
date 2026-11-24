import type { Metadata } from 'next';
import { CalendarRange } from 'lucide-react';
import { formatTaka, type MonthlyProfitReportDto, type ProfitKpis, type ProfitStatement } from '@ph/shared';
import { ExportButtons } from '@/components/ExportButtons';
import { MonthPicker } from '@/components/MonthPicker';
import { EmptyState, Money, PageHeader, TableCard } from '@/components/ui';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { monthLabel } from '@/lib/period';
import { apiGet } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Monthly profit' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const COLUMNS: Array<{ label: string; key: keyof ProfitStatement }> = [
  { label: 'Revenue', key: 'revenue' },
  { label: 'Product cost', key: 'productCost' },
  { label: 'Courier', key: 'courierCost' },
  { label: 'Ads', key: 'adsCost' },
  { label: 'Other', key: 'otherExpenses' },
];

/** FR-REP-01: the last 12 months, one row each, with the full profit statement. */
export default async function MonthlyProfitPage({ searchParams }: Props) {
  const { to } = await searchParams;
  const query = typeof to === 'string' && to ? `?to=${encodeURIComponent(to)}` : '';
  const { data: report } = await apiGet<{ data: MonthlyProfitReportDto }>(`/reports/monthly-profit${query}`);
  const month = report.months[report.months.length - 1].month;
  const newestFirst = [...report.months].reverse();
  const empty = report.months.every((m) => m.kpis.orders === 0 && m.statement.adsCost + m.statement.otherExpenses === 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={CalendarRange}
        title="Monthly profit"
        description={`${monthLabel(report.months[0].month)} – ${monthLabel(month)} · by order date`}
        actions={
          <>
            <MonthPicker value={month} basePath="/reports/monthly-profit" />
            <ExportButtons href={`/api/reports/monthly-profit?to=${month}`} />
          </>
        }
      />

      {empty ? (
        <EmptyState
          icon={CalendarRange}
          title="No orders or expenses in these 12 months"
          body="Pick an earlier month, or add orders first."
        />
      ) : (
        <>
          <TableCard className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Month</TableHead>
                  {COLUMNS.map((c) => (
                    <TableHead key={c.key} className="text-right">
                      {c.label}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Net profit</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {newestFirst.map((m) => (
                  <StatementRow key={m.month} label={monthLabel(m.month)} statement={m.statement} kpis={m.kpis} />
                ))}
              </TableBody>
              <TableFooter>
                <StatementRow label="12 months" statement={report.total.statement} kpis={report.total.kpis} />
              </TableFooter>
            </Table>
          </TableCard>

          <ul className="flex flex-col gap-2 md:hidden">
            {[
              ...newestFirst.map((m) => ({ ...m, label: monthLabel(m.month) })),
              { month: 'total', label: '12 months', ...report.total },
            ].map((m) => (
              <li key={m.month}>
                <Card className="flex flex-col gap-2 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{m.label}</span>
                    <Money value={m.statement.netProfit} tone className="font-semibold" />
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-ink-faint">Revenue</dt>
                      <dd className="tabular">{formatTaka(m.statement.revenue)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-faint">Costs</dt>
                      <dd className="tabular">{formatTaka(m.statement.revenue - m.statement.netProfit)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-faint">Margin</dt>
                      <dd className="tabular">{m.kpis.profitMargin}%</dd>
                    </div>
                  </dl>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function StatementRow({ label, statement, kpis }: { label: string; statement: ProfitStatement; kpis: ProfitKpis }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{label}</TableCell>
      {COLUMNS.map((c) => (
        <TableCell key={c.key} className="text-right tabular">
          {formatTaka(statement[c.key])}
        </TableCell>
      ))}
      <TableCell className="text-right font-medium">
        <Money value={statement.netProfit} tone />
      </TableCell>
      <TableCell className="text-right tabular">{kpis.profitMargin}%</TableCell>
    </TableRow>
  );
}
