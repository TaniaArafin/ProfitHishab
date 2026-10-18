'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { monthPeriod, parseTaka, type ExpenseCategoryDto } from '@ph/shared';
import { api, fieldError, type ApiError } from '@/lib/client-api';
import { SelectField } from '@/components/SelectField';
import { refreshData } from '@/lib/navigation';

/** FR-EXP-03/05: quick entry with a "whole month" shortcut and the double-counting warning. */
export function ExpenseForm({ categories, today }: { categories: ExpenseCategoryDto[]; today: string }) {
  const router = useRouter();
  const ads = categories.find((c) => c.kind === 'ads');
  const [categoryId, setCategoryId] = useState(ads?.id ?? categories[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [wholeMonth, setWholeMonth] = useState(true);
  const [note, setNote] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<{ tone: 'gain' | 'warn'; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const amountP = parseTaka(amount);
    if (amountP === null || amountP === 0) {
      setError({ code: 'validation_failed', message: 'Enter an amount', fields: { amount: ['Enter an amount above 0'] } });
      return;
    }
    setPending(true);
    setError(null);
    const res = await api('POST', '/expenses', {
      categoryId,
      amount: amountP,
      expenseDate: wholeMonth ? monthPeriod(date).from : date,
      note: note || undefined,
    });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const warning = res.body.warning as string | null;
    setResult(warning ? { tone: 'warn', text: `Saved. ${warning}` } : { tone: 'gain', text: 'Expense saved.' });
    setAmount('');
    setNote('');
    refreshData(router);
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-4 p-5 lg:sticky lg:top-6 lg:self-start" noValidate>
      <h2 className="font-semibold">Add expense</h2>
      {result ? (
        <p className={`rounded-md px-3 py-2 text-sm ${result.tone === 'gain' ? 'bg-gain-soft text-gain' : 'bg-warn-soft text-warn'}`}>
          {result.text}
        </p>
      ) : null}
      {error && !error.fields ? <p className="rounded-md bg-loss-soft px-3 py-2 text-sm text-loss">{error.message}</p> : null}
      <div>
        <label className="label" htmlFor="expense-category">
          Category
        </label>
        <SelectField
          id="expense-category"
          value={categoryId}
          onValueChange={setCategoryId}
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
        />
      </div>
      <div>
        <label className="label" htmlFor="expense-amount">
          Amount (৳)
        </label>
        <input
          id="expense-amount"
          inputMode="decimal"
          className="input tabular"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="25000"
        />
        {fieldError(error, 'amount') ? <p className="mt-1 text-sm text-loss">{fieldError(error, 'amount')}</p> : null}
      </div>
      <div>
        <label className="label" htmlFor="expense-date">
          {wholeMonth ? 'Month' : 'Date'}
        </label>
        <input id="expense-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        <label className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" checked={wholeMonth} onChange={(e) => setWholeMonth(e.target.checked)} />
          For the whole month (saved on the 1st)
        </label>
      </div>
      <div>
        <label className="label" htmlFor="expense-note">
          Note
        </label>
        <input id="expense-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
      </div>
      <button type="submit" className="btn-primary" disabled={pending || !categoryId}>
        {pending ? 'Saving…' : 'Save expense'}
      </button>
    </form>
  );
}

export function DeleteExpenseButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" className="text-sm text-ink-muted underline hover:text-loss" onClick={() => setConfirming(true)}>
        Delete
      </button>
    );
  }
  return (
    <span className="inline-flex gap-2">
      <button
        type="button"
        className="text-sm font-semibold text-loss underline"
        onClick={async () => {
          const res = await api('DELETE', `/expenses/${id}`);
          if (res.ok) refreshData(router);
        }}
      >
        Confirm
      </button>
      <button type="button" className="text-sm text-ink-muted underline" onClick={() => setConfirming(false)}>
        Keep
      </button>
    </span>
  );
}
