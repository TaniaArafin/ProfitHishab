'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { monthPeriod, parseTaka, type ExpenseCategoryDto } from '@ph/shared';
import { api, fieldError, type ApiError } from '@/lib/client-api';
import { Trash2 } from 'lucide-react';
import { SelectField } from '@/components/SelectField';
import { Alert } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    <Card className="order-first lg:sticky lg:top-6 lg:order-none lg:self-start">
      <form onSubmit={submit} className="flex flex-col gap-4 p-4 sm:p-5" noValidate>
        <h2 className="font-semibold">Add expense</h2>
        {result ? (
          <Alert variant={result.tone === 'gain' ? 'success' : 'warning'} role="status">
            {result.text}
          </Alert>
        ) : null}
        {error && !error.fields ? <Alert variant="destructive">{error.message}</Alert> : null}
        <div>
          <Label htmlFor="expense-category">Category</Label>
          <SelectField
            id="expense-category"
            value={categoryId}
            onValueChange={setCategoryId}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
          />
        </div>
        <div>
          <Label htmlFor="expense-amount">Amount (৳)</Label>
          <Input
            id="expense-amount"
            inputMode="decimal"
            className="tabular"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="25000"
            aria-invalid={fieldError(error, 'amount') ? true : undefined}
            aria-describedby={fieldError(error, 'amount') ? 'expense-amount-error' : undefined}
          />
          {fieldError(error, 'amount') ? (
            <p id="expense-amount-error" className="mt-1 text-sm text-loss">
              {fieldError(error, 'amount')}
            </p>
          ) : null}
        </div>
        <div>
          <Label htmlFor="expense-date">{wholeMonth ? 'Month' : 'Date'}</Label>
          <Input id="expense-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <div className="mt-2 flex min-h-10 items-center gap-2.5">
            <Checkbox id="expense-whole-month" checked={wholeMonth} onCheckedChange={(v) => setWholeMonth(v === true)} />
            <Label htmlFor="expense-whole-month" className="mb-0 font-normal text-ink-muted">
              For the whole month (saved on the 1st)
            </Label>
          </div>
        </div>
        <div>
          <Label htmlFor="expense-note">Note</Label>
          <Input id="expense-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </div>
        <Button type="submit" disabled={pending || !categoryId}>
          {pending ? 'Saving…' : 'Save expense'}
        </Button>
      </form>
    </Card>
  );
}

export function DeleteExpenseButton({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setPending(true);
    setError(null);
    const res = await api('DELETE', `/expenses/${id}`);
    setPending(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setOpen(false);
    refreshData(router);
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="h-10 w-10 text-ink-muted hover:bg-loss-soft hover:text-loss"
          aria-label="Delete expense"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
          <AlertDialogDescription>It is removed from your expenses and your profit figures update.</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep</AlertDialogCancel>
          {/* A plain Button, not AlertDialogAction: the dialog stays open until the delete finishes. */}
          <Button variant="destructive" disabled={pending} onClick={remove}>
            {pending ? 'Deleting…' : 'Delete'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
