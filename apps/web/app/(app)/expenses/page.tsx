import type { Metadata } from 'next';
import { Wallet } from 'lucide-react';
import { formatTaka, todayIn, type ExpenseCategoryDto, type ExpenseListDto } from '@ph/shared';
import { Banner, PageHeader } from '@/components/ui';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PeriodSelector } from '@/components/PeriodSelector';
import { periodFromParams, periodLabel } from '@/lib/period';
import { apiGet } from '@/lib/server-api';
import { DeleteExpenseButton, ExpenseForm } from './ExpenseForm';

export const metadata: Metadata = { title: 'Expenses' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const KIND_LABEL = { ads: 'Ads', courier: 'Courier', other: 'Other' } as const;

export default async function ExpensesPage({ searchParams }: Props) {
  const period = periodFromParams(await searchParams);
  const [list, categories] = await Promise.all([
    apiGet<ExpenseListDto>(`/expenses?${period.query}`),
    apiGet<{ data: ExpenseCategoryDto[] }>('/expense-categories'),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={Wallet}
        title="Expenses"
        description={`${periodLabel(period.from, period.to)} · ${formatTaka(list.total)} total`}
        actions={<PeriodSelector preset={period.preset} from={period.from} to={period.to} />}
      />

      {list.warning ? <Banner tone="warn">{list.warning}</Banner> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          {list.totals.length > 0 ? (
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Totals by category">
              {list.totals.map((t) => (
                <Card key={t.categoryId} className="min-w-0 p-4 hover:-translate-y-0.5 hover:border-schist-300 hover:shadow-lift">
                  <div className="truncate text-xs font-medium text-ink-muted">{t.categoryName}</div>
                  <div className="mt-1 truncate text-lg font-semibold tabular">{formatTaka(t.amount)}</div>
                </Card>
              ))}
            </section>
          ) : null}

          {list.data.length === 0 ? (
            <Card>
              <p className="px-5 py-8 text-sm text-ink-muted">
                No expenses for this period. Add your Facebook ad spend first; it is usually the biggest one.
              </p>
            </Card>
          ) : (
            <>
              {/* Tablet and up: table */}
              <Card className="hidden overflow-hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.data.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap tabular text-ink-muted">{e.expenseDate}</TableCell>
                        <TableCell>
                          {e.categoryName}
                          <span className="ml-1.5 text-xs text-ink-faint">{KIND_LABEL[e.kind]}</span>
                        </TableCell>
                        <TableCell className="max-w-[16rem] truncate text-ink-muted">{e.note ?? ''}</TableCell>
                        <TableCell className="whitespace-nowrap text-right font-medium tabular">{formatTaka(e.amount)}</TableCell>
                        <TableCell className="text-right">
                          <DeleteExpenseButton id={e.id} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>

              {/* Phone: stacked cards */}
              <ul className="flex flex-col gap-2 md:hidden">
                {list.data.map((e) => (
                  <li key={e.id}>
                    <Card className="flex items-center gap-3 p-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-semibold">
                            {e.categoryName}
                            <span className="ml-1.5 text-xs font-normal text-ink-faint">{KIND_LABEL[e.kind]}</span>
                          </span>
                          <span className="shrink-0 font-medium tabular">{formatTaka(e.amount)}</span>
                        </div>
                        <div className="truncate text-xs text-ink-faint">
                          <span className="tabular">{e.expenseDate}</span>
                          {e.note ? ` · ${e.note}` : ''}
                        </div>
                      </div>
                      <DeleteExpenseButton id={e.id} />
                    </Card>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <ExpenseForm categories={categories.data} today={todayIn()} />
      </div>
    </div>
  );
}
