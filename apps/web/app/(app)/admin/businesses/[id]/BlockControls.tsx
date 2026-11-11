'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, fieldError, type ApiError } from '@/lib/client-api';
import { refreshData } from '@/lib/navigation';

/** Block (with a reason, confirmed in a dialog) or unblock a business. */
export function BlockControls({ businessId, blocked }: { businessId: string; blocked: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  async function send(path: 'block' | 'unblock') {
    setPending(true);
    setError(null);
    const res = await api('POST', `/admin/businesses/${businessId}/${path}`, path === 'block' ? { reason } : undefined);
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOpen(false);
    setReason('');
    refreshData(router);
  }

  if (blocked) {
    return (
      <div className="flex flex-col gap-3">
        {error ? <Alert variant="destructive">{error.message}</Alert> : null}
        <Button variant="secondary" className="w-full sm:w-auto sm:self-start" disabled={pending} onClick={() => void send('unblock')}>
          {pending ? 'Unblocking…' : 'Unblock'}
        </Button>
      </div>
    );
  }

  const reasonError = fieldError(error, 'reason');
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="destructive-outline" className="w-full sm:w-auto sm:self-start">
          Block account
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Block this account?</AlertDialogTitle>
          <AlertDialogDescription>
            Everyone in the business is logged out at once and can&apos;t log in until you unblock it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && !reasonError ? <Alert variant="destructive">{error.message}</Alert> : null}
        <div>
          <Label htmlFor="block-reason">Reason</Label>
          <Textarea
            id="block-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Fake orders, payment dispute"
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={reasonError ? 'block-reason-error' : undefined}
          />
          {reasonError ? (
            <p className="mt-1 text-sm text-loss" id="block-reason-error">
              {reasonError}
            </p>
          ) : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              void send('block');
            }}
          >
            {pending ? 'Blocking…' : 'Block and log out'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
