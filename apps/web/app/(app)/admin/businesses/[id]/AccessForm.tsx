'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { AdminAccessInput } from '@ph/shared';
import { SelectField } from '@/components/SelectField';
import { Alert } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, fieldError, type ApiError } from '@/lib/client-api';
import { refreshData } from '@/lib/navigation';

type Mode = AdminAccessInput['mode'];

const MODES: Array<{ value: Mode; label: string }> = [
  { value: 'extend', label: 'Add days' },
  { value: 'until', label: 'Until a date' },
  { value: 'unlimited', label: 'Unlimited' },
  { value: 'end', label: 'End access now' },
];

const SUBMIT: Record<Mode, string> = { extend: 'Add days', until: 'Set end date', unlimited: 'Make unlimited', end: 'End access now' };

/** Change a business's access. Also how a manual (bKash) payment is recorded until billing exists. */
export function AccessForm({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('extend');
  const [days, setDays] = useState('30');
  const [date, setDate] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function save() {
    const body: AdminAccessInput = mode === 'extend' ? { mode, days: Number(days) } : mode === 'until' ? { mode, date } : { mode };
    setPending(true);
    setError(null);
    setSaved(false);
    const res = await api('POST', `/admin/businesses/${businessId}/access`, body);
    setPending(false);
    setConfirmEnd(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSaved(true);
    refreshData(router);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === 'end') setConfirmEnd(true);
    else void save();
  }

  const daysError = fieldError(error, 'days');
  const dateError = fieldError(error, 'date');
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      {saved ? (
        <Alert variant="success" role="status">
          Access updated.
        </Alert>
      ) : null}
      {error && !daysError && !dateError ? <Alert variant="destructive">{error.message}</Alert> : null}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="access-mode">Change access</Label>
          <SelectField id="access-mode" value={mode} onValueChange={(v) => setMode(v as Mode)} options={MODES} />
        </div>
        {mode === 'extend' ? (
          <div>
            <Label htmlFor="access-days">Days to add</Label>
            <Input
              id="access-days"
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              aria-invalid={daysError ? true : undefined}
            />
            {daysError ? <p className="mt-1 text-sm text-loss">{daysError}</p> : null}
          </div>
        ) : null}
        {mode === 'until' ? (
          <div>
            <Label htmlFor="access-date">Last day (Dhaka time)</Label>
            <Input
              id="access-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={dateError ? true : undefined}
            />
            {dateError ? <p className="mt-1 text-sm text-loss">{dateError}</p> : null}
          </div>
        ) : null}
      </div>
      <p className="text-xs text-ink-faint">
        {mode === 'extend'
          ? 'Added to the current end date, or to today if access has already ended.'
          : mode === 'until'
            ? 'Access runs to the end of that day.'
            : mode === 'unlimited'
              ? 'No end date. Use for early-access sellers and staff.'
              : 'The account becomes read-only at once. Their data stays.'}
      </p>
      <Button
        type="submit"
        variant={mode === 'end' ? 'destructive-outline' : 'default'}
        className="w-full sm:w-auto sm:self-start"
        disabled={pending}
      >
        {pending ? 'Saving…' : SUBMIT[mode]}
      </Button>

      <AlertDialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End access now?</AlertDialogTitle>
            <AlertDialogDescription>
              The seller can still log in and see their data, but can&apos;t add or change anything.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep access</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              {pending ? 'Ending…' : 'End access'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
