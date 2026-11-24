import type { Metadata } from 'next';
import { Receipt } from 'lucide-react';
import { formatTaka, type ExpenseReportDto } from '@ph/shared';
import { ExportButtons } from '@/components/ExportButtons';
import { MonthPicker } from '@/components/MonthPicker';
import { EmptyState, PageHeader, TableCard } from '@/components/ui';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { monthLabel } from '@/lib/period';
import { apiGet } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Expense report' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** FR-REP-03: spend per category and month over the last 12 months. */
export default async function ExpenseReportPage({ searchParams }: Props) {
  const { to } = await searchParams;
  const query = typeof to === 'string' && to ? `?to=${encodeURIComponent(to)}` : '';
  const { data: report } = await apiGet<{ data: ExpenseReportDto }>(`/reports/expenses${query}`);
  const month = report.months[report.months.length - 1];
  const amount = (poisha: number) => (poisha === 0 ? <span className="text-ink-faint">–</span> : formatTaka(poisha));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={Receipt}
        title="Expense report"
        description={`${monthLabel(report.months[0])} – ${monthLabel(month)} · ${formatTaka(report.total)} in total`}
        actions={
          <>
            <MonthPicker value={month} basePath="/reports/expenses" />
            <ExportButtons href={`/api/reports/expenses?to=${month}`} />
          </>
        }
      />

      {report.rows.length === 0 ? (
        <EmptyState icon={Receipt} title="No expenses in these 12 months" body="Add ad spend and other costs on the Expenses page." />
      ) : (
        <>
          {/* The month columns scroll inside the card, never the page. */}
          <TableCard className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="sticky left-0 bg-card">Category</TableHead>
                  {report.months.map((m) => (
                    <TableHead key={m} className="whitespace-nowrap text-right">
                      {monthLabel(m)}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((r) => (
                  <TableRow key={r.categoryId}>
                    <TableCell className="sticky left-0 bg-card font-medium">{r.categoryName}</TableCell>
                    {r.amounts.map((a, i) => (
                      <TableCell key={report.months[i]} className="whitespace-nowrap text-right tabular">
                        {amount(a)}
                      </TableCell>
                    ))}
                    <TableCell className="whitespace-nowrap text-right font-medium tabular">{formatTaka(r.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="sticky left-0 bg-card font-medium">Total</TableCell>
                  {report.monthTotals.map((a, i) => (
                    <TableCell key={report.months[i]} className="whitespace-nowrap text-right tabular">
                      {amount(a)}
                    </TableCell>
                  ))}
                  <TableCell className="whitespace-nowrap text-right font-semibold tabular">{formatTaka(report.total)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </TableCard>

          <ul className="flex flex-col gap-2 md:hidden">
            {report.rows.map((r) => (
              <li key={r.categoryId}>
                <Card className="flex flex-col gap-2 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-semibold">{r.categoryName}</span>
                    <span className="shrink-0 font-semibold tabular">{formatTaka(r.total)}</span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    {r.amounts.map((a, i) =>
                      a === 0 ? null : (
                        <div key={report.months[i]} className="flex justify-between gap-2">
                          <dt className="text-ink-faint">{monthLabel(report.months[i])}</dt>
                          <dd className="tabular">{formatTaka(a)}</dd>
                        </div>
                      ),
                    )}
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
