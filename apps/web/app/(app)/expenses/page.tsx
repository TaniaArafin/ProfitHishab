import type { Metadata } from 'next';
import { Wallet } from 'lucide-react';
import { formatTaka, todayIn, type ExpenseCategoryDto, type ExpenseListDto } from '@ph/shared';
import { Banner, PageHeader } from '@/components/ui';
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          {list.totals.length > 0 ? (
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Totals by category">
              {list.totals.map((t) => (
                <div key={t.categoryId} className="card card-hover p-4">
                  <div className="text-xs font-medium text-ink-muted">{t.categoryName}</div>
                  <div className="mt-1 text-lg font-semibold tabular">{formatTaka(t.amount)}</div>
                </div>
              ))}
            </section>
          ) : null}

          <section className="card overflow-hidden">
            <div className="overflow-x-auto">
              {list.data.length === 0 ? (
                <p className="px-5 py-8 text-sm text-ink-muted">
                  No expenses for this period. Add your Facebook ad spend first; it is usually the biggest one.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-line/70 bg-paper/50">
                    <tr>
                      <th className="th">Date</th>
                      <th className="th">Category</th>
                      <th className="th">Note</th>
                      <th className="th text-right">Amount</th>
                      <th className="th">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {list.data.map((e) => (
                      <tr key={e.id}>
                        <td className="td tabular text-ink-muted">{e.expenseDate}</td>
                        <td className="td">
                          {e.categoryName}
                          <span className="ml-1.5 text-xs text-ink-faint">{KIND_LABEL[e.kind]}</span>
                        </td>
                        <td className="td text-ink-muted">{e.note ?? ''}</td>
                        <td className="td text-right font-medium tabular">{formatTaka(e.amount)}</td>
                        <td className="td text-right">
                          <DeleteExpenseButton id={e.id} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>

        <ExpenseForm categories={categories.data} today={todayIn()} />
      </div>
    </div>
  );
}
